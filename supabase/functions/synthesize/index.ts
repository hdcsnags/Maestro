import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireAuthenticatedRequest, type AuthenticatedRequestContext } from "../_shared/auth.ts";
import { readJsonBody } from "../_shared/body.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

const SYNTHESIZE_MAX_BODY_BYTES = 524_288;

// Two synthesis modes:
//
// 1. CLASSIC (legacy): client passes a raw `responses` text blob — we synthesize
//    plain prose. This is the path the existing UI uses when no deliberation
//    has run on the round.
//
// 2. DELIBERATION-AWARE: client passes `round_id` (and optionally raw text as
//    fallback). We fetch primary + deliberation rows and produce a synthesis
//    that PRESERVES tension instead of blending it. Output is structured JSON
//    with consensus / trade_offs / acknowledged_weaknesses / unresolved_tensions
//    / recommendation, plus a prose `content` for the legacy field.
//
// PRO-01 (see PRO-01_DELIBERATION_ROUND_SPEC.md) — the deliberation-aware
// synthesis is the differentiating output. It says "Agent X argued for A;
// Agent Y argued for B; the disagreement is about [axis]" instead of mushing
// them together into a fake consensus.

interface ClassicSynthesizeRequest {
  responses: string;
}
interface DeliberationSynthesizeRequest {
  round_id: string;
  // Optional raw fallback if client wants to bypass DB read.
  responses?: string;
}
type SynthesizeRequest = ClassicSynthesizeRequest | DeliberationSynthesizeRequest;

interface DeliberationPushback {
  target_response_id: string | null;
  target_voice: string;
  stance: "agree" | "disagree" | "partial";
  summary: string;
  kind: "objection" | "agreement" | "self_critique";
}

interface PrimaryResponseRow {
  id: string;
  agent_name: string;
  content: string;
}

interface DeliberationResponseRow {
  agent_name: string;
  deliberation_pushbacks: DeliberationPushback[] | null;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const auth = await requireAuthenticatedRequest(req, corsHeaders, "synthesize");
  if (auth instanceof Response) return auth;

  try {
    const bodyResult = await readJsonBody<SynthesizeRequest>(req, corsHeaders, {
      maxBytes: SYNTHESIZE_MAX_BODY_BYTES,
      label: "Synthesize request body",
    });
    if (bodyResult instanceof Response) return bodyResult;

    const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");

    // Branch: deliberation-aware path requires round_id.
    if ("round_id" in bodyResult && bodyResult.round_id) {
      return await synthesizeDeliberationAware(
        bodyResult.round_id,
        bodyResult.responses ?? null,
        auth,
        anthropicKey,
        corsHeaders,
      );
    }

    // Classic path.
    return await synthesizeClassic(
      (bodyResult as ClassicSynthesizeRequest).responses,
      anthropicKey,
      corsHeaders,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message, content: "Synthesis failed. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

// ──────────────────────────────────────────────────────────────────────
// Classic mode (legacy, no deliberation).
// ──────────────────────────────────────────────────────────────────────

async function synthesizeClassic(
  responses: string,
  anthropicKey: string | undefined,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  if (!anthropicKey) {
    const fallback = `Council synthesis complete. The following perspectives have been gathered and combined into a unified build path:\n\n${responses}`;
    return jsonResponse({ content: fallback }, corsHeaders);
  }

  const systemPrompt = `You are the Maestro synthesis engine. You receive multiple AI agent responses from a council session and produce a concise, actionable synthesis.

Your synthesis should:
1. Identify the core areas of agreement
2. Surface any meaningful divergences worth noting
3. Produce a clear, concrete recommended path forward
4. Be 2-4 paragraphs, written in plain authoritative prose
5. Do NOT use headers, bullet points, or markdown — pure prose only

Focus on what should actually be built or decided, not meta-commentary about the agents.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: "user", content: `Synthesize these council responses:\n\n${responses}` }],
    }),
  });

  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Synthesis API error");
  const content = data.content?.[0]?.text ?? responses;

  return jsonResponse({ content }, corsHeaders);
}

// ──────────────────────────────────────────────────────────────────────
// Deliberation-aware mode (PRO-01).
// ──────────────────────────────────────────────────────────────────────

async function synthesizeDeliberationAware(
  roundId: string,
  rawFallback: string | null,
  auth: AuthenticatedRequestContext,
  anthropicKey: string | undefined,
  corsHeaders: Record<string, string>,
): Promise<Response> {
  const userClient = auth.userClient;

  const roundLookup = await userClient
    .from("rounds")
    .select("id, prompt, deliberation_completed_at")
    .eq("id", roundId)
    .maybeSingle();

  if (roundLookup.error || !roundLookup.data) {
    return jsonResponse({ error: "round_not_found" }, corsHeaders, 404);
  }
  const round = roundLookup.data as { id: string; prompt: string; deliberation_completed_at: string | null };

  // If deliberation hasn't run, fall back to classic synthesis.
  if (!round.deliberation_completed_at) {
    if (rawFallback) {
      return await synthesizeClassic(rawFallback, anthropicKey, corsHeaders);
    }
    // No deliberation, no raw fallback — fetch primary content and run classic.
    const primaries = await userClient
      .from("responses")
      .select("agent_name, content")
      .eq("round_id", roundId)
      .or("kind.is.null,kind.eq.primary");
    if (primaries.error) {
      throw new Error(primaries.error.message);
    }
    const concatenated = (primaries.data ?? [])
      .map((r: { agent_name: string; content: string }) => `## ${r.agent_name}\n${r.content}`)
      .join("\n\n");
    return await synthesizeClassic(concatenated, anthropicKey, corsHeaders);
  }

  // Deliberation has run — fetch both rounds.
  const [primariesResult, deliberationsResult] = await Promise.all([
    userClient
      .from("responses")
      .select("id, agent_name, content")
      .eq("round_id", roundId)
      .or("kind.is.null,kind.eq.primary")
      .order("id", { ascending: true }),
    userClient
      .from("responses")
      .select("agent_name, deliberation_pushbacks")
      .eq("round_id", roundId)
      .eq("kind", "deliberation"),
  ]);

  if (primariesResult.error) throw new Error(primariesResult.error.message);
  if (deliberationsResult.error) throw new Error(deliberationsResult.error.message);

  const primaries: PrimaryResponseRow[] = (primariesResult.data ?? []) as PrimaryResponseRow[];
  const deliberations: DeliberationResponseRow[] = (deliberationsResult.data ?? []) as DeliberationResponseRow[];

  if (!anthropicKey) {
    // Fallback when key is missing: emit a structured-but-deterministic synthesis.
    const stub = renderDeterministicSynthesis(round.prompt, primaries, deliberations);
    return jsonResponse(stub, corsHeaders);
  }

  // Build the synthesis prompt.
  const systemPrompt = getDeliberationSynthesisSystemPrompt();
  const userMessage = renderDeliberationSynthesisUserMessage(round.prompt, primaries, deliberations);

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Anthropic API error: ${response.status} ${errText.slice(0, 200)}`);
  }
  const data = await response.json();
  const rawText = data.content?.[0]?.text ?? "";
  const parsed = parseSynthesisJson(rawText);

  return jsonResponse(parsed, corsHeaders);
}

// ──────────────────────────────────────────────────────────────────────
// Synthesis prompt design.
// ──────────────────────────────────────────────────────────────────────

function getDeliberationSynthesisSystemPrompt(): string {
  return `You are synthesizing multiple expert voices on a question, AFTER they had the opportunity to push back on each other in a structured deliberation round.

Your synthesis MUST do all of the following:

1. Identify points where agents AGREED post-deliberation. These are the strongest signals — what did everyone, after pushback, still believe?

2. Identify points where agents DISAGREED post-deliberation. Do NOT blend these into a compromise. Surface each disagreement as: "Agent X argued for A; Agent Y argued for B; the disagreement was about [specific axis]."

3. Identify ACKNOWLEDGED WEAKNESSES — points where an agent admitted in self-critique that their own position had a real flaw. These are high-confidence concerns regardless of what is otherwise synthesized.

4. End with unresolved_tensions — a list of disagreements that were raised but not resolved. The user needs to make these calls themselves.

OUTPUT FORMAT (strict JSON, no markdown fences):
{
  "consensus": "1-2 paragraphs: what survived deliberation",
  "trade_offs": [
    { "axis": "what's at stake", "side_a": { "agent": "name", "position": "..." }, "side_b": { "agent": "name", "position": "..." } }
  ],
  "acknowledged_weaknesses": [
    { "agent": "name", "weakness": "what they admitted" }
  ],
  "unresolved_tensions": [
    "1-sentence statement of a decision the user must make"
  ],
  "recommendation": "1-2 paragraphs: your best synthesis-of-record, with caveats. Prose, not bullets.",
  "content": "Plain-prose version of consensus + recommendation for the legacy UI surface that doesn't render structured fields."
}

CRITICAL: Do NOT manufacture consensus. If agents genuinely disagreed and the disagreement was not resolved by deliberation, that goes in unresolved_tensions. The user explicitly chose to run a deliberation round to surface tension; do not erase it.`;
}

function renderDeliberationSynthesisUserMessage(
  prompt: string,
  primaries: PrimaryResponseRow[],
  deliberations: DeliberationResponseRow[],
): string {
  const r1 = primaries
    .map(p => `### ${p.agent_name}\n${p.content}`)
    .join("\n\n");

  const r2Lines: string[] = [];
  for (const d of deliberations) {
    const pushbacks = d.deliberation_pushbacks ?? [];
    if (pushbacks.length === 0) continue;
    r2Lines.push(`### ${d.agent_name}`);
    for (const p of pushbacks) {
      const stanceLabel = p.kind === "objection" ? "Objection" : p.kind === "agreement" ? "Agreement" : "Self-critique";
      r2Lines.push(`- **${stanceLabel}** ${p.target_voice !== "self" ? `(toward Voice ${p.target_voice})` : ""}: ${p.summary}`);
    }
    r2Lines.push("");
  }
  const r2 = r2Lines.join("\n");

  return `ORIGINAL QUESTION:
${prompt}

ROUND 1 — INDEPENDENT RESPONSES:

${r1}

ROUND 2 — DELIBERATION (each voice's structured pushbacks):

${r2 || "(No deliberation pushbacks recorded — this is unusual; treat as Round 1 only.)"}

Synthesize per the output format. Preserve tension; do not manufacture consensus.`;
}

// ──────────────────────────────────────────────────────────────────────
// JSON parser with fallbacks.
// ──────────────────────────────────────────────────────────────────────

interface SynthesisOutput {
  content: string;
  consensus?: string;
  trade_offs?: unknown[];
  acknowledged_weaknesses?: unknown[];
  unresolved_tensions?: string[];
  recommendation?: string;
}

function parseSynthesisJson(rawText: string): SynthesisOutput {
  const trimmed = rawText.trim();

  const candidates: string[] = [trimmed];
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) candidates.push(fenceMatch[1].trim());
  const braceStart = trimmed.indexOf("{");
  const braceEnd = trimmed.lastIndexOf("}");
  if (braceStart >= 0 && braceEnd > braceStart) {
    candidates.push(trimmed.slice(braceStart, braceEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (typeof parsed === "object" && parsed !== null && typeof parsed.content === "string") {
        return parsed as SynthesisOutput;
      }
    } catch {
      // try next
    }
  }

  // Total parse failure — fall back to plain content.
  return { content: trimmed };
}

// ──────────────────────────────────────────────────────────────────────
// Deterministic fallback when no Anthropic key.
// ──────────────────────────────────────────────────────────────────────

function renderDeterministicSynthesis(
  prompt: string,
  primaries: PrimaryResponseRow[],
  deliberations: DeliberationResponseRow[],
): SynthesisOutput {
  const agreements: string[] = [];
  const objections: string[] = [];
  const selfCritiques: { agent: string; weakness: string }[] = [];

  for (const d of deliberations) {
    for (const p of d.deliberation_pushbacks ?? []) {
      if (p.kind === "agreement") agreements.push(`${d.agent_name} → ${p.target_voice}: ${p.summary}`);
      if (p.kind === "objection") objections.push(`${d.agent_name} → ${p.target_voice}: ${p.summary}`);
      if (p.kind === "self_critique") selfCritiques.push({ agent: d.agent_name, weakness: p.summary });
    }
  }

  const lines: string[] = [];
  lines.push(`Council session on: ${prompt}`);
  lines.push("");
  lines.push(`${primaries.length} agents responded; deliberation round captured the following structure.`);
  if (agreements.length) {
    lines.push("");
    lines.push("Where agents agreed post-deliberation:");
    for (const a of agreements) lines.push(`- ${a}`);
  }
  if (objections.length) {
    lines.push("");
    lines.push("Where agents pushed back:");
    for (const o of objections) lines.push(`- ${o}`);
  }
  if (selfCritiques.length) {
    lines.push("");
    lines.push("Acknowledged weaknesses:");
    for (const s of selfCritiques) lines.push(`- ${s.agent}: ${s.weakness}`);
  }
  lines.push("");
  lines.push("(Synthesis model unavailable — this is a deterministic summary. Configure ANTHROPIC_API_KEY for richer recommendation.)");

  return {
    content: lines.join("\n"),
    consensus: agreements.length ? `Agents agreed on ${agreements.length} point(s).` : "No clear post-deliberation consensus surfaced.",
    trade_offs: [],
    acknowledged_weaknesses: selfCritiques,
    unresolved_tensions: objections.length ? ["See objections above for unresolved tensions."] : [],
    recommendation: "Synthesis unavailable without Anthropic API key. Review the structured deliberation pushbacks directly.",
  };
}

// ──────────────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, corsHeaders: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
