// Sprint A · B3 — Concierge edge function (shell)
// Synthesizes council responses into alignment / tension / direction.
// Full intelligence comes in Sprint B. Fail loud on missing Anthropic key.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type Phase = "post_round1" | "post_round2" | "design" | "pre_build" | "post_build";

interface ConciergeRequest {
  session_id: string;
  phase: Phase;
  responses: Array<{
    agent_name: string;
    content: string;
    signals?: Record<string, string | undefined>;
  }>;
  synthesis?: string | null;
}

interface ConciergeResult {
  alignment_summary: string;
  tension_points: string[];
  recommended_direction: string;
  model_used: string;
}

const SYSTEM_PROMPT = `You are Concierge, the synthesis and guidance agent for Maestro.
Synthesize the council's responses into a clear, actionable summary.

1. Identify where agents agree (alignment)
2. Identify where agents disagree or contradict (tension)
3. Provide a clear recommended direction

Return JSON only:
{
  "alignment_summary": "2-3 sentences on consensus",
  "tension_points": ["disagreement 1", "disagreement 2"],
  "recommended_direction": "clear actionable recommendation"
}`;

function pickModel(req: ConciergeRequest): string {
  if (req.phase === "pre_build") return "claude-sonnet-4-6";
  const totalTokens = req.responses.reduce(
    (sum, r) => sum + Math.ceil((r.content?.length ?? 0) / 4),
    0,
  );
  if (totalTokens > 8000) return "claude-sonnet-4-6";
  return "claude-haiku-4-5";
}

function buildUserMessage(req: ConciergeRequest): string {
  const lines: string[] = [];
  lines.push(`Phase: ${req.phase}`);
  if (req.synthesis) {
    lines.push("\n--- Existing Synthesis ---");
    lines.push(req.synthesis);
  }
  lines.push("\n--- Council Responses ---");
  for (const r of req.responses) {
    lines.push(`\n[${r.agent_name}]`);
    if (r.signals) {
      const sig = Object.entries(r.signals)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ");
      if (sig) lines.push(`Signals: ${sig}`);
    }
    lines.push(r.content);
  }
  return lines.join("\n");
}

function parseConcierge(raw: string): Omit<ConciergeResult, "model_used"> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fenced ? fenced[1].trim() : raw;
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      return {
        alignment_summary: String(parsed.alignment_summary ?? ""),
        tension_points: Array.isArray(parsed.tension_points)
          ? parsed.tension_points.map(String)
          : [],
        recommended_direction: String(parsed.recommended_direction ?? ""),
      };
    } catch { /* fall through */ }
  }
  return {
    alignment_summary: raw.slice(0, 500),
    tension_points: [],
    recommended_direction: "Manual review required — concierge could not parse structured response.",
  };
}

async function getUserApiKey(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  provider: string,
): Promise<string | null> {
  const { data } = await adminClient
    .from("encrypted_secrets")
    .select("encrypted_key")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  return (data?.encrypted_key as string | undefined) ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const adminClient = createClient(supabaseUrl, serviceKey);

    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body: ConciergeRequest = await req.json();
    if (!body.session_id || !body.phase || !Array.isArray(body.responses)) {
      return new Response(
        JSON.stringify({ error: "Invalid request: session_id, phase, and responses required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = await getUserApiKey(adminClient, user.id, "anthropic");
    if (!apiKey) {
      // Fail loud — no silent provider fallback. User must add an Anthropic key.
      return new Response(
        JSON.stringify({
          error: "ANTHROPIC_KEY_MISSING",
          message: "Concierge requires an Anthropic API key. Add one in the Provider Vault to enable synthesis guidance.",
        }),
        { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const model = pickModel(body);
    const userMessage = buildUserMessage(body);

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      return new Response(
        JSON.stringify({
          error: "ANTHROPIC_REQUEST_FAILED",
          message: `Anthropic API returned ${anthropicResponse.status}: ${errText.slice(0, 500)}`,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const anthropicData = await anthropicResponse.json();
    const rawText: string = anthropicData?.content?.[0]?.text ?? "";
    const parsed = parseConcierge(rawText);

    const result: ConciergeResult = { ...parsed, model_used: model };

    // Persist via admin client — RLS check is satisfied by the request being
    // authenticated above; admin client bypasses RLS for the insert.
    const { error: insertError } = await adminClient
      .from("concierge_decisions")
      .insert({
        session_id: body.session_id,
        phase: body.phase,
        alignment_summary: result.alignment_summary,
        tension_points: result.tension_points,
        recommended_direction: result.recommended_direction,
        model_used: result.model_used,
      });

    if (insertError) {
      return new Response(
        JSON.stringify({
          error: "PERSIST_FAILED",
          message: insertError.message,
          ...result,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify(result),
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
