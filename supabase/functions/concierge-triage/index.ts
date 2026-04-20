import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { requireAuthenticatedRequest } from "../_shared/auth.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";

interface TriageRequest {
  session_id: string;
  prompt: string;
  agent_count: number;
  session_context: {
    current_phase: string;
    round_count: number;
    has_build_spec: boolean;
  };
}

type Route = "simple_ask" | "orchestra";
type Intent =
  | "simple_ask"
  | "analysis"
  | "design"
  | "pre_build"
  | "build";

interface TriageResult {
  route: Route;
  intent: Intent;
  confidence: number;
  reasoning: string;
  direct_answer?: string;
}

const TRIAGE_SYSTEM_PROMPT = `You are the Maestro Concierge triage agent. Your job is to classify user prompts FAST.

Decide: should this go to the full agent orchestra, or can you answer it directly?

Return JSON only:
{
  "route": "simple_ask" | "orchestra",
  "intent": "simple_ask" | "analysis" | "design" | "pre_build" | "build",
  "confidence": 0.0-1.0,
  "reasoning": "1 sentence explaining routing decision",
  "direct_answer": "only if route is simple_ask — your concise answer"
}

ROUTING RULES:

simple_ask when:
- It is a question starting with What/How/Why/When/Who/Can/Does
- It contains NO action verbs: build, create, make, add, fix, update, deploy, generate, scaffold, write, implement
- The answer is a fact, explanation, or opinion — not a deliverable
- It is a short, self-contained question needing no codebase context

orchestra when:
- It asks for something to be built, created, or written
- It references a codebase, repo, or existing project
- It is a multi-part or complex question needing multiple perspectives
- It involves design decisions, architecture choices, or technical tradeoffs
- When in doubt, route to orchestra

HARD OVERRIDES (always orchestra):
- If round_count > 0 (session already has history)
- If current_phase is "pre_build" or "build"
- If has_build_spec is true
- If confidence < 0.75

Examples:
"What is RLS in Supabase?" → simple_ask
"How does JWT work?" → simple_ask
"Build me a todo app with auth" → orchestra (intent: build)
"Add dark mode to my React app" → orchestra (intent: build)
"Design a landing page for my SaaS" → orchestra (intent: design)
"What's the best database for this?" → orchestra (needs perspectives)`;

function parseTriageResult(raw: string): TriageResult | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fenced ? fenced[1].trim() : raw;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const p = JSON.parse(match[0]);
    const route = p.route === "simple_ask" ? "simple_ask" : "orchestra";
    const validIntents: Intent[] = [
      "simple_ask",
      "analysis",
      "design",
      "pre_build",
      "build",
    ];
    const intent = validIntents.includes(p.intent) ? p.intent : "analysis";
    const confidence =
      typeof p.confidence === "number"
        ? Math.max(0, Math.min(1, p.confidence))
        : 0.5;

    return {
      route,
      intent,
      confidence,
      reasoning: String(p.reasoning ?? ""),
      direct_answer:
        route === "simple_ask" ? String(p.direct_answer ?? "") : undefined,
    };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const auth = await requireAuthenticatedRequest(req, corsHeaders, "concierge-triage");
    if (auth instanceof Response) {
      return auth;
    }

    const { adminClient, userId } = auth;

    const body: TriageRequest = await req.json();
    if (!body.session_id || !body.prompt) {
      return new Response(
        JSON.stringify({ error: "session_id and prompt required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const ctx = body.session_context ?? {
      current_phase: "analysis",
      round_count: 0,
      has_build_spec: false,
    };
    if (
      ctx.round_count > 0 ||
      ctx.current_phase === "pre_build" ||
      ctx.current_phase === "build" ||
      ctx.has_build_spec
    ) {
      return new Response(
        JSON.stringify({
          route: "orchestra",
          intent: "analysis",
          confidence: 1.0,
          reasoning:
            "Session has active context — routing to full orchestra.",
        } satisfies TriageResult),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { data: secret } = await adminClient
      .from("encrypted_secrets")
      .select("encrypted_key")
      .eq("user_id", userId)
      .eq("provider", "anthropic")
      .maybeSingle();

    if (!secret) {
      return new Response(
        JSON.stringify({
          route: "orchestra",
          intent: "analysis",
          confidence: 1.0,
          reasoning: "No Anthropic key — defaulting to orchestra.",
        } satisfies TriageResult),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const userMessage = `Prompt: "${body.prompt}"

Session context:
- current_phase: ${ctx.current_phase}
- round_count: ${ctx.round_count}
- has_build_spec: ${ctx.has_build_spec}
- agent_count: ${body.agent_count}`;

    const anthropicResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": secret.encrypted_key as string,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 1024,
          system: TRIAGE_SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMessage }],
        }),
      }
    );

    if (!anthropicResponse.ok) {
      return new Response(
        JSON.stringify({
          route: "orchestra",
          intent: "analysis",
          confidence: 1.0,
          reasoning: "Triage model unavailable — defaulting to orchestra.",
        } satisfies TriageResult),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await anthropicResponse.json();
    const rawText: string = data?.content?.[0]?.text ?? "";
    const result = parseTriageResult(rawText);

    if (!result) {
      return new Response(
        JSON.stringify({
          route: "orchestra",
          intent: "analysis",
          confidence: 0.5,
          reasoning: "Could not parse triage response — defaulting to orchestra.",
        } satisfies TriageResult),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (result.route === "simple_ask" && result.confidence < 0.75) {
      result.route = "orchestra";
      result.reasoning += " (confidence below threshold, escalating to orchestra)";
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ error: "INTERNAL_ERROR", message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});


