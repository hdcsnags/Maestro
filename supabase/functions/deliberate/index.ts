// Deliberation round orchestrator.
//
// PRO-01 — see PRO-01_DELIBERATION_ROUND_SPEC.md.
//
// Flow:
//   1. Auth user.
//   2. Fetch all primary responses for the round (Round 1 output).
//   3. Verify the round belongs to a session this user owns.
//   4. For each response, build a per-agent redacted view + deliberation prompt.
//   5. Dispatch the deliberation calls in parallel (one per agent).
//   6. Parse each agent's pushbacks; resolve voice labels back to real response_ids.
//   7. Insert each agent's deliberation as a new responses row with kind='deliberation'.
//   8. Mark the round as deliberation_completed_at.
//
// v1 limitations (documented):
// - Anthropic + OpenAI providers only. Gemini and OpenRouter agents have their
//   deliberation skipped with metadata.skipped_reason='provider_not_supported'.
//   Sonnet can extend in step 2 of the impl order by calling orchestrate
//   instead of inline provider calls.
// - One deliberation round only (no R3 loops).
// - Per-agent failures (network, parse, timeout) are isolated — synthesis still
//   runs with whatever pushbacks did arrive.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireAuthenticatedRequest, respondJson, respondInternalError } from "../_shared/auth.ts";
import { readJsonBody } from "../_shared/body.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { buildRedactedView, resolveVoiceLabel, type PrimaryResponseRow, type VoiceMapEntry } from "./redact.ts";
import { renderDeliberationUserMessage, getDeliberationSystemPrompt, parseDeliberationOutput, type DeliberationOutput } from "./prompt.ts";

const DELIBERATE_MAX_BODY_BYTES = 32_768;
const PER_AGENT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_TOKENS = 1024;

interface DeliberateRequest {
  round_id: string;
}

interface AgentDispatchResult {
  source_response_id: string;
  agent_id: string | null;
  agent_name: string;
  provider: string;
  model: string;
  output: DeliberationOutput;
  parse_failed: boolean;
  skipped_reason?: string;
  error?: string;
  tokens_used?: number;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const auth = await requireAuthenticatedRequest(req, corsHeaders, "deliberate");
  if (auth instanceof Response) return auth;

  try {
    const body = await readJsonBody<DeliberateRequest>(req, corsHeaders, {
      maxBytes: DELIBERATE_MAX_BODY_BYTES,
      label: "Deliberate request body",
    });
    if (body instanceof Response) return body;
    if (!body.round_id || typeof body.round_id !== "string") {
      return respondJson(corsHeaders, { error: "round_id required" }, 400);
    }

    // 1. Fetch the round + verify ownership through the round's session.
    const roundLookup = await auth.userClient
      .from("rounds")
      .select("id, session_id, prompt, status, deliberation_enabled, deliberation_completed_at, sessions!inner(workspace_id, workspaces!inner(user_id))")
      .eq("id", body.round_id)
      .maybeSingle();

    if (roundLookup.error) {
      console.error("[deliberate] round lookup error", roundLookup.error);
      return respondJson(corsHeaders, { error: "round_not_found" }, 404);
    }
    if (!roundLookup.data) {
      return respondJson(corsHeaders, { error: "round_not_found" }, 404);
    }

    const round = roundLookup.data as unknown as {
      id: string;
      session_id: string;
      prompt: string;
      status: string;
      deliberation_enabled: boolean | null;
      deliberation_completed_at: string | null;
    };

    // Idempotency: if deliberation already completed, return the existing rows.
    if (round.deliberation_completed_at) {
      const existing = await auth.userClient
        .from("responses")
        .select("id, agent_id, agent_name, kind, deliberation_targets, deliberation_pushbacks")
        .eq("round_id", round.id)
        .eq("kind", "deliberation");

      return respondJson(corsHeaders, {
        status: "already_completed",
        completed_at: round.deliberation_completed_at,
        deliberation_count: existing.data?.length ?? 0,
      });
    }

    // 2. Fetch primary responses.
    const primariesResult = await auth.userClient
      .from("responses")
      .select("id, agent_id, agent_name, provider, model, content")
      .eq("round_id", round.id)
      .or("kind.is.null,kind.eq.primary")
      .order("id", { ascending: true });

    if (primariesResult.error) {
      console.error("[deliberate] primaries fetch error", primariesResult.error);
      return respondInternalError("deliberate", corsHeaders, primariesResult.error);
    }

    const primaries: PrimaryResponseRow[] = (primariesResult.data ?? []).map(row => ({
      id: row.id as string,
      agent_id: (row.agent_id as string | null) ?? null,
      agent_name: row.agent_name as string,
      provider: row.provider as string,
      model: row.model as string,
      content: row.content as string,
    }));

    // Need 3+ agents for meaningful deliberation. With 2, it's a 1-on-1 critique.
    if (primaries.length < 3) {
      return respondJson(corsHeaders, {
        error: "insufficient_agents",
        message: `Deliberation requires 3 or more council agents. This round has ${primaries.length}.`,
      }, 400);
    }

    // 3. Mark deliberation_enabled if not already set so frontend reflects state.
    if (!round.deliberation_enabled) {
      const enableUpdate = await auth.userClient
        .from("rounds")
        .update({ deliberation_enabled: true })
        .eq("id", round.id);
      if (enableUpdate.error) {
        console.warn("[deliberate] failed to mark round.deliberation_enabled", enableUpdate.error);
      }
    }

    // 4-6. Dispatch deliberation per agent in parallel.
    const dispatchPromises = primaries.map(primary =>
      dispatchDeliberation(round.prompt, primaries, primary).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[deliberate] dispatch failed for response ${primary.id}`, message);
        return {
          source_response_id: primary.id,
          agent_id: primary.agent_id,
          agent_name: primary.agent_name,
          provider: primary.provider,
          model: primary.model,
          output: { raw_text: "" },
          parse_failed: true,
          error: message,
        } as AgentDispatchResult;
      }),
    );

    const dispatched = await Promise.all(dispatchPromises);

    // 7. Insert deliberation rows.
    // Build per-source voice maps so we can resolve labels in pushbacks.
    const insertRows = dispatched.map(result => {
      const view = buildRedactedView(primaries, result.source_response_id);
      const pushbacks = buildPushbacks(result.output, view.voice_map);
      const deliberationTargets = pushbacks
        .map(p => p.target_response_id)
        .filter((id): id is string => Boolean(id));

      return {
        round_id: round.id,
        agent_id: result.agent_id,
        agent_name: result.agent_name,
        agent_role: "deliberator",
        agent_color: "#5a8fe0",
        provider: result.provider,
        model: result.model,
        content: renderDeliberationContentMarkdown(result.output),
        title: "Deliberation",
        signals: {},
        artifacts: [],
        is_flagged: false,
        is_lead: false,
        tokens_used: result.tokens_used ?? 0,
        kind: "deliberation",
        deliberation_targets: deliberationTargets,
        deliberation_pushbacks: pushbacks,
        ...(result.error || result.skipped_reason || result.parse_failed
          ? { signals: pickMetadata(result) }
          : {}),
      };
    });

    const insertResult = await auth.userClient.from("responses").insert(insertRows);
    if (insertResult.error) {
      console.error("[deliberate] insert error", insertResult.error);
      return respondInternalError("deliberate", corsHeaders, insertResult.error);
    }

    // 8. Mark deliberation_completed_at.
    const completedAt = new Date().toISOString();
    const finalUpdate = await auth.userClient
      .from("rounds")
      .update({ deliberation_completed_at: completedAt })
      .eq("id", round.id);
    if (finalUpdate.error) {
      console.warn("[deliberate] failed to mark round complete", finalUpdate.error);
    }

    return respondJson(corsHeaders, {
      status: "completed",
      completed_at: completedAt,
      participants: dispatched.length,
      successful: dispatched.filter(d => !d.error && !d.skipped_reason && !d.parse_failed).length,
      skipped: dispatched.filter(d => d.skipped_reason).length,
      errored: dispatched.filter(d => d.error).length,
      parse_failed: dispatched.filter(d => d.parse_failed && !d.error && !d.skipped_reason).length,
    });
  } catch (err) {
    return respondInternalError("deliberate", corsHeaders, err);
  }
});

// ──────────────────────────────────────────────────────────────────────

/**
 * Dispatch a single agent's deliberation call. Routes by provider.
 *
 * v1: Anthropic + OpenAI inline. Gemini/OpenRouter return skipped_reason.
 */
async function dispatchDeliberation(
  originalPrompt: string,
  allPrimaries: PrimaryResponseRow[],
  focusedPrimary: PrimaryResponseRow,
): Promise<AgentDispatchResult> {
  const view = buildRedactedView(allPrimaries, focusedPrimary.id);
  const userMessage = renderDeliberationUserMessage({
    original_user_prompt: originalPrompt,
    view,
  });
  const systemPrompt = getDeliberationSystemPrompt();

  const provider = focusedPrimary.provider.toLowerCase();
  if (provider === "anthropic") {
    return await callAnthropic(focusedPrimary, systemPrompt, userMessage);
  }
  if (provider === "openai") {
    return await callOpenAI(focusedPrimary, systemPrompt, userMessage);
  }

  // v1: skip non-Anthropic/OpenAI providers gracefully.
  return {
    source_response_id: focusedPrimary.id,
    agent_id: focusedPrimary.agent_id,
    agent_name: focusedPrimary.agent_name,
    provider: focusedPrimary.provider,
    model: focusedPrimary.model,
    output: { raw_text: "" },
    parse_failed: false,
    skipped_reason: `provider_not_supported_v1: ${focusedPrimary.provider}`,
  };
}

async function callAnthropic(
  agent: PrimaryResponseRow,
  systemPrompt: string,
  userMessage: string,
): Promise<AgentDispatchResult> {
  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return makeError(agent, "anthropic_api_key_missing");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_AGENT_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: agent.model,
        max_tokens: DEFAULT_MAX_TOKENS,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return makeError(agent, `anthropic_${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const rawText = data.content?.[0]?.text ?? "";
    const tokensUsed =
      (typeof data.usage?.input_tokens === "number" ? data.usage.input_tokens : 0) +
      (typeof data.usage?.output_tokens === "number" ? data.usage.output_tokens : 0);

    const parsed = parseDeliberationOutput(rawText);
    return {
      source_response_id: agent.id,
      agent_id: agent.agent_id,
      agent_name: agent.agent_name,
      provider: agent.provider,
      model: agent.model,
      output: parsed,
      parse_failed: !parsed.objection && !parsed.agreement && !parsed.self_critique,
      tokens_used: tokensUsed,
    };
  } catch (err) {
    const message = err instanceof Error
      ? (err.name === "AbortError" ? "anthropic_timeout" : err.message)
      : String(err);
    return makeError(agent, message);
  } finally {
    clearTimeout(timer);
  }
}

async function callOpenAI(
  agent: PrimaryResponseRow,
  systemPrompt: string,
  userMessage: string,
): Promise<AgentDispatchResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) {
    return makeError(agent, "openai_api_key_missing");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_AGENT_TIMEOUT_MS);

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: agent.model,
        max_tokens: DEFAULT_MAX_TOKENS,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      return makeError(agent, `openai_${response.status}: ${errText.slice(0, 200)}`);
    }

    const data = await response.json();
    const rawText = data.choices?.[0]?.message?.content ?? "";
    const tokensUsed = typeof data.usage?.total_tokens === "number" ? data.usage.total_tokens : 0;

    const parsed = parseDeliberationOutput(rawText);
    return {
      source_response_id: agent.id,
      agent_id: agent.agent_id,
      agent_name: agent.agent_name,
      provider: agent.provider,
      model: agent.model,
      output: parsed,
      parse_failed: !parsed.objection && !parsed.agreement && !parsed.self_critique,
      tokens_used: tokensUsed,
    };
  } catch (err) {
    const message = err instanceof Error
      ? (err.name === "AbortError" ? "openai_timeout" : err.message)
      : String(err);
    return makeError(agent, message);
  } finally {
    clearTimeout(timer);
  }
}

function makeError(agent: PrimaryResponseRow, error: string): AgentDispatchResult {
  return {
    source_response_id: agent.id,
    agent_id: agent.agent_id,
    agent_name: agent.agent_name,
    provider: agent.provider,
    model: agent.model,
    output: { raw_text: "" },
    parse_failed: true,
    error,
  };
}

interface DeliberationPushback {
  target_response_id: string | null;
  target_voice: string;
  stance: "agree" | "disagree" | "partial";
  summary: string;
  agent_id: string | null;
  kind: "objection" | "agreement" | "self_critique";
}

function buildPushbacks(
  output: DeliberationOutput,
  voiceMap: VoiceMapEntry[],
): DeliberationPushback[] {
  const pushbacks: DeliberationPushback[] = [];

  if (output.objection && output.objection.target_voice) {
    const resolved = resolveVoiceLabel(voiceMap, output.objection.target_voice);
    pushbacks.push({
      target_response_id: resolved?.response_id ?? null,
      target_voice: output.objection.target_voice,
      agent_id: resolved?.agent_id ?? null,
      stance: "disagree",
      summary: trimSummary(output.objection.point, output.objection.rationale),
      kind: "objection",
    });
  }
  if (output.agreement && output.agreement.target_voice) {
    const resolved = resolveVoiceLabel(voiceMap, output.agreement.target_voice);
    pushbacks.push({
      target_response_id: resolved?.response_id ?? null,
      target_voice: output.agreement.target_voice,
      agent_id: resolved?.agent_id ?? null,
      stance: "agree",
      summary: trimSummary(output.agreement.point, output.agreement.why_i_missed_it),
      kind: "agreement",
    });
  }
  if (output.self_critique) {
    pushbacks.push({
      target_response_id: null,            // self
      target_voice: "self",
      agent_id: null,
      stance: "partial",                   // self-critique is acknowledgment of partial weakness
      summary: trimSummary(output.self_critique.weakness, output.self_critique.rationale),
      kind: "self_critique",
    });
  }

  return pushbacks;
}

function trimSummary(point: string, rationale: string): string {
  const combined = `${point.trim()} — ${rationale.trim()}`;
  return combined.length > 600 ? combined.slice(0, 597) + "..." : combined;
}

function pickMetadata(result: AgentDispatchResult): Record<string, unknown> {
  return {
    deliberation_status: result.error
      ? "errored"
      : result.skipped_reason
        ? "skipped"
        : result.parse_failed
          ? "parse_failed"
          : "ok",
    ...(result.error ? { error: result.error } : {}),
    ...(result.skipped_reason ? { skipped_reason: result.skipped_reason } : {}),
  };
}

/**
 * Render the agent's deliberation output as readable markdown for the
 * `responses.content` column. The structured pushbacks are stored separately
 * in `deliberation_pushbacks` for UI consumption; this is the human-readable
 * fallback.
 */
function renderDeliberationContentMarkdown(output: DeliberationOutput): string {
  if (output.raw_text && !output.objection && !output.agreement && !output.self_critique) {
    // Parse failed; preserve the raw output so the user can see what came back.
    return `_Deliberation output could not be parsed as structured JSON. Raw model output:_\n\n${output.raw_text}`;
  }

  const sections: string[] = [];
  if (output.objection) {
    sections.push(
      `**Objection (to Voice ${output.objection.target_voice}):** ${output.objection.point}\n\n*Rationale:* ${output.objection.rationale}`,
    );
  }
  if (output.agreement) {
    sections.push(
      `**Agreement (with Voice ${output.agreement.target_voice}):** ${output.agreement.point}\n\n*What I missed:* ${output.agreement.why_i_missed_it}`,
    );
  }
  if (output.self_critique) {
    sections.push(
      `**Self-critique:** ${output.self_critique.weakness}\n\n*Rationale:* ${output.self_critique.rationale}`,
    );
  }
  return sections.join("\n\n---\n\n");
}
