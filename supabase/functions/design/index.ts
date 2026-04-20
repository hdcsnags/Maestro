import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { requireAuthenticatedRequest } from "../_shared/auth.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getDecryptedSecret } from "../_shared/secrets.ts";
type DesignerRole = "visual_spatial" | "structure_ux" | "product_practical" | "wildcard_fusion";
type DesignMode = "lite" | "standard" | "exploration";

interface DesignerLane {
  role: DesignerRole;
  display_name: string;
  description: string;
  preferred_model: string;
  fallback_model: string;
}

const DESIGNER_LANES: Record<DesignerRole, DesignerLane> = {
  visual_spatial: {
    role: "visual_spatial",
    display_name: "Visual Lead",
    description: "Layout, visual hierarchy, mockup feel",
    preferred_model: "gpt-5.4",
    fallback_model: "gpt-5.4-mini",
  },
  structure_ux: {
    role: "structure_ux",
    display_name: "Structure Lead",
    description: "App shell, flow, information architecture",
    preferred_model: "claude-sonnet-4-6",
    fallback_model: "claude-haiku-4-5",
  },
  product_practical: {
    role: "product_practical",
    display_name: "Product Lead",
    description: "Realistic UX, PM thinking, constraints",
    preferred_model: "gpt-5.4-mini",
    fallback_model: "openai/gpt-oss-20b:free",
  },
  wildcard_fusion: {
    role: "wildcard_fusion",
    display_name: "Wildcard",
    description: "Blending, bold options, style exploration",
    preferred_model: "x-ai/grok-4.20",
    fallback_model: "google/gemma-4-31b-it:free",
  },
};

const DESIGN_MODE_LANES: Record<DesignMode, DesignerRole[]> = {
  lite: ["visual_spatial"],
  standard: ["visual_spatial", "structure_ux"],
  exploration: ["visual_spatial", "structure_ux", "product_practical", "wildcard_fusion"],
};

interface DesignRequest {
  session_id: string;
  design_mode: DesignMode;
  brief: string;
  round_id?: string | null;
}

interface DesignArtifact {
  designer_role: DesignerRole;
  agent_name: string;
  html_content: string;
  rationale: string;
  tradeoffs: string;
  model_used: string;
  error?: string;
}

function laneSystemPrompt(lane: DesignerLane, brief: string): string {
  return `You are the ${lane.display_name} for a design session.
Your specialty: ${lane.description}

${DESIGN_DOCTRINE}

You are designing a UI/UX mockup based on this brief:
${brief}

Return a single self-contained HTML file that:
- Is complete and renderable in a browser with no external dependencies
- Uses inline CSS only
- Demonstrates your design approach fully
- Includes realistic placeholder content
- Is clearly labeled with your designer role
- Is sized like a real desktop product screen, not a thumbnail or tiny widget

After the HTML, provide:
RATIONALE: 2-3 sentences on your design decisions
TRADEOFFS: what you optimized for and what you sacrificed

Return JSON only:
{
  "html_content": "<!DOCTYPE html>...",
  "rationale": "...",
  "tradeoffs": "..."
}`;
}

const DESIGN_DOCTRINE = `## Maestro Design Doctrine

**Product posture:** Command center first, chat app second. The interface is a decision surface for expert collaboration, not a shiny AI toy.

**Visual law:**
- Hierarchy over decoration. Spacing over noise. Typography over gimmicks.
- Dark premium shell by default. Calm contrast, soft depth, muted surfaces, crisp type.
- One controlled accent family (gold). Per-provider agent colors as secondary accents.
- No rainbow gradients, loud glows, cyan-purple AI palettes, or generic Tailwind template energy.

**Layout:**
- Center pane is sacred — holds the current task/round/artifact/decision. Never starve it.
- Side panels must earn their space. Each answers ONE question (where am I? who is involved? what changed?).
- Top bar: identity + minimal controls. Never clutter with redundant metadata.

**Typography:**
- Headlines: large, clean, high-contrast, tight tracking, short and intentional.
- Body: readable, calm, slightly muted. Never dense walls.
- Metadata: small, low emphasis, quiet. Never louder than content.
- If same info appears in header AND card AND body — cut at least one.

**Components:**
- Primary actions: obvious, limited, stable. Never five competing primary buttons.
- Cards only when they help grouping/contrast/containment. Don't card everything.
- Tables/lists often better than decorative cards for operator workflows.
- Empty states: truthful about what's missing, why, and what to do next.

**Anti-patterns (reject immediately):**
- Three+ accent colors competing
- Same metadata in multiple places
- Center content too small to matter
- Decoration over structure
- Cards with no informational purpose
- Startup homepage instead of operator tool
- AI-generated dashboard starter look
- No clear opinion in the design

**Color tokens:**
- Backgrounds: void (#0a0a0c), void-2, void-3
- Primary accent: gold
- Agent colors: agent.claude, agent.gpt, agent.gemini, etc.
- Status: signal.ok, signal.warn, signal.risk
- Surfaces: rgba(255,255,255,0.025–0.06) for layering

**QA gate (self-check before returning):**
1. Can I tell what matters in 3 seconds?
2. Do I understand what this screen is for?
3. Does this feel specific to the product, not generic?
4. Is the primary action obvious?
5. Did I avoid unnecessary visual ideas?`;

function stripFence(value: string): string {
  const text = value.trim();
  const fenced = text.match(/^```(?:json|html)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? text).trim();
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function decodeEscapedHtml(value: string): string {
  let decoded = value.trim();
  for (let i = 0; i < 3; i += 1) {
    const next = decoded
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\")
      .trim();
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function readStringField(value: unknown, field: string): string {
  if (!value || typeof value !== "object" || !(field in value)) return "";
  const record = value as Record<string, unknown>;
  return typeof record[field] === "string" ? record[field] : "";
}

function extractJsonStringField(source: string, key: string): string {
  const match = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`).exec(source);
  if (!match) return "";
  const parsed = parseJson(`"${match[1]}"`);
  return typeof parsed === "string" ? parsed : match[1];
}

function extractHtml(raw: string): string {
  let text = stripFence(raw);

  for (let i = 0; i < 2; i += 1) {
    const parsed = parseJson(text);
    if (typeof parsed === "string") {
      text = stripFence(parsed);
      continue;
    }

    const html = readStringField(parsed, "html_content");
    if (html) return decodeEscapedHtml(html);
    break;
  }

  const htmlField = extractJsonStringField(text, "html_content");
  if (htmlField) return decodeEscapedHtml(htmlField);

  const htmlStart = text.search(/<!doctype html|<html[\s>]/i);
  if (htmlStart !== -1) {
    const htmlEnd = text.toLowerCase().lastIndexOf("</html>");
    const html = htmlEnd === -1 ? text.slice(htmlStart) : text.slice(htmlStart, htmlEnd + 7);
    return decodeEscapedHtml(html);
  }

  return decodeEscapedHtml(text);
}

function parseLaneResult(raw: string): { html_content: string; rationale: string; tradeoffs: string } {
  const text = stripFence(raw);
  const parsed = parseJson(text);
  const object = typeof parsed === "string" ? parseJson(stripFence(parsed)) : parsed;

  return {
    html_content: extractHtml(raw),
    rationale: readStringField(object, "rationale") || extractJsonStringField(text, "rationale"),
    tradeoffs: readStringField(object, "tradeoffs") || extractJsonStringField(text, "tradeoffs"),
  };
}

function providerForModel(model: string): "anthropic" | "openai" | "google" | "openrouter" {
  if (model.startsWith("claude-")) return "anthropic";
  if (model.startsWith("gpt-") || model.startsWith("o1") || model.startsWith("o3")) return "openai";
  if (model.startsWith("gemini-")) return "google";
  return "openrouter";
}

async function getUserApiKey(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  provider: string,
): Promise<string | null> {
  return getDecryptedSecret(adminClient, userId, provider);
}

async function callModel(
  model: string,
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
): Promise<string> {
  const provider = providerForModel(model);

  if (provider === "anthropic") {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!res.ok) throw new Error(`anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return data?.content?.[0]?.text ?? "";
  }

  if (provider === "openai") {
    const isGpt54 = model.startsWith("gpt-5.4");
    const tokenField = isGpt54 ? "max_completion_tokens" : "max_tokens";
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        [tokenField]: 8192,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
        ],
      }),
    });
    if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return data?.choices?.[0]?.message?.content ?? "";
  }

  if (provider === "google") {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: userMessage }] }],
          generationConfig: { maxOutputTokens: 8192 },
        }),
      },
    );
    if (!res.ok) throw new Error(`google ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const data = await res.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  }

  // openrouter
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
    }),
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

async function runLane(
  lane: DesignerLane,
  brief: string,
  adminClient: ReturnType<typeof createClient>,
  userId: string,
): Promise<DesignArtifact> {
  const systemPrompt = laneSystemPrompt(lane, brief);
  const userMessage = `Brief: ${brief}\n\nProduce your mockup now.`;

  const tryModel = async (model: string): Promise<DesignArtifact> => {
    const provider = providerForModel(model);
    const key = await getUserApiKey(adminClient, userId, provider);
    if (!key) throw new Error(`missing ${provider} key`);
    const raw = await callModel(model, key, systemPrompt, userMessage);
    const parsed = parseLaneResult(raw);
    return {
      designer_role: lane.role,
      agent_name: lane.display_name,
      html_content: parsed.html_content,
      rationale: parsed.rationale,
      tradeoffs: parsed.tradeoffs,
      model_used: model,
    };
  };

  try {
    return await tryModel(lane.preferred_model);
  } catch (e1) {
    try {
      return await tryModel(lane.fallback_model);
    } catch (e2) {
      return {
        designer_role: lane.role,
        agent_name: lane.display_name,
        html_content: "",
        rationale: "",
        tradeoffs: "",
        model_used: lane.fallback_model,
        error: `preferred: ${e1 instanceof Error ? e1.message : String(e1)} | fallback: ${e2 instanceof Error ? e2.message : String(e2)}`,
      };
    }
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const auth = await requireAuthenticatedRequest(req, corsHeaders, "design");
    if (auth instanceof Response) {
      return auth;
    }

    const { adminClient, userId } = auth;

    const body: DesignRequest = await req.json();
    if (!body.session_id || !body.design_mode || !body.brief) {
      return new Response(
        JSON.stringify({ error: "Invalid request: session_id, design_mode, brief required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!DESIGN_MODE_LANES[body.design_mode]) {
      return new Response(
        JSON.stringify({ error: `Invalid design_mode: ${body.design_mode}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const activeRoles = DESIGN_MODE_LANES[body.design_mode];
    const lanes = activeRoles.map((r) => DESIGNER_LANES[r]);

    const artifacts = await Promise.all(
      lanes.map((lane) => runLane(lane, body.brief, adminClient, userId)),
    );

    // Persist successful artifacts
    const rows = artifacts
      .filter((a) => !a.error && a.html_content)
      .map((a) => ({
        session_id: body.session_id,
        round_id: body.round_id ?? null,
        agent_name: a.agent_name,
        designer_role: a.designer_role,
        html_content: a.html_content,
        rationale: a.rationale,
        tradeoffs: a.tradeoffs,
      }));

    if (rows.length > 0) {
      const { error: insertError } = await adminClient.from("design_artifacts").insert(rows);
      if (insertError) {
        return new Response(
          JSON.stringify({
            error: "PERSIST_FAILED",
            message: insertError.message,
            artifacts,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    return new Response(
      JSON.stringify({ design_mode: body.design_mode, artifacts }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ error: "INTERNAL_ERROR", message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});






