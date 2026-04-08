// Sprint B · B6 — Bouncer edge function (shell)
// Reviews build output for security/code-quality issues. Sprint B is a
// shell — receives a file list, sends a prompt to Opus, persists findings.
// Sprint C upgrades this to read actual file diffs from GitHub.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type Trigger = "file_count" | "risky_change" | "end_of_build" | "conductor";
type Severity = "minor" | "critical_pause" | "critical_approved";

interface BouncerRequest {
  session_id: string;
  trigger: Trigger;
  files?: string[];
}

interface Finding {
  file: string;
  issue: string;
  severity: Severity;
  suggestion: string;
}

interface BouncerResult {
  findings: Finding[];
  overall_severity: Severity;
  summary: string;
  model_used: string;
}

const SYSTEM_PROMPT = `You are the security and code quality bouncer for this build.

Review the following files that were written in this build session.

Check for:
1. Hardcoded secrets, API keys, or credentials
2. Missing input validation
3. SQL injection vectors
4. Exposed sensitive routes without auth
5. RLS policies that are too permissive
6. Environment variables that should not be in code

For each finding, classify as:
- minor: worth noting, not blocking
- critical_pause: must be resolved before shipping
- critical_approved: conductor has approved proceeding despite this

Return JSON only:
{
  "findings": [
    { "file": "path/to/file", "issue": "description", "severity": "minor | critical_pause | critical_approved", "suggestion": "how to fix" }
  ],
  "overall_severity": "minor | critical_pause | critical_approved",
  "summary": "2-3 sentence overall assessment"
}`;

const VALID_SEV: Severity[] = ["minor", "critical_pause", "critical_approved"];

function parseBouncer(raw: string): Omit<BouncerResult, "model_used"> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fenced ? fenced[1].trim() : raw;
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const p = JSON.parse(match[0]);
      const findings: Finding[] = Array.isArray(p.findings)
        ? p.findings.map((f: Record<string, unknown>) => ({
            file: String(f.file ?? ""),
            issue: String(f.issue ?? ""),
            severity: VALID_SEV.includes(f.severity as Severity) ? (f.severity as Severity) : "minor",
            suggestion: String(f.suggestion ?? ""),
          }))
        : [];
      const overall = VALID_SEV.includes(p.overall_severity) ? (p.overall_severity as Severity) : "minor";
      return {
        findings,
        overall_severity: overall,
        summary: String(p.summary ?? ""),
      };
    } catch { /* fall through */ }
  }
  return {
    findings: [],
    overall_severity: "minor",
    summary: raw.slice(0, 500) || "Bouncer could not parse model output.",
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

    const body: BouncerRequest = await req.json();
    if (!body.session_id || !body.trigger) {
      return new Response(
        JSON.stringify({ error: "Invalid request: session_id and trigger required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = await getUserApiKey(adminClient, user.id, "anthropic");
    if (!apiKey) {
      return new Response(
        JSON.stringify({
          error: "ANTHROPIC_KEY_MISSING",
          message: "Bouncer requires an Anthropic API key. Add one in the Provider Vault.",
        }),
        { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const model = "claude-opus-4-6";
    const fileList = (body.files ?? []).map((f) => `- ${f}`).join("\n") || "(no files reported)";
    const userMessage = `Trigger: ${body.trigger}\n\nFiles written this build:\n${fileList}`;

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
    const parsed = parseBouncer(rawText);

    const result: BouncerResult = { ...parsed, model_used: model };

    const { error: insertError } = await adminClient
      .from("bouncer_events")
      .insert({
        session_id: body.session_id,
        triggered_by: body.trigger,
        severity: result.overall_severity,
        findings: result.findings,
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
