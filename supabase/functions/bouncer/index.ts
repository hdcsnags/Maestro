import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { logPermissionFailure, requireAuthenticatedRequest } from "../_shared/auth.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type Trigger = "file_count" | "risky_change" | "end_of_build" | "conductor";
type Severity = "minor" | "critical_pause" | "critical_approved";

interface BuildFile {
  path: string;
  content: string;
  operation?: string;
}

interface BouncerRequest {
  session_id: string;
  trigger: Trigger;
  files?: string[];
  build_files?: BuildFile[];
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
  review_source: "build_tasks" | "github_files" | "file_names_only";
}

const SYSTEM_PROMPT = `You are the security and code quality bouncer for this build.

Review the files provided below. You may receive full file contents (preferred) or just file paths.

Check for:
1. Hardcoded secrets, API keys, or credentials
2. Missing input validation or sanitization
3. SQL injection vectors
4. Exposed sensitive routes without auth
5. RLS policies that are too permissive
6. Environment variables that should not be in code
7. Unsafe use of eval, dangerouslySetInnerHTML, or equivalent
8. Missing error handling on critical paths
9. Dependency on unvalidated external input

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

const MAX_FILES = 30;
const MAX_LINES_PER_FILE = 300;

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
    const auth = await requireAuthenticatedRequest(req, corsHeaders, "bouncer");
    if (auth instanceof Response) {
      return auth;
    }

    const { adminClient, userId } = auth;

    const body: BouncerRequest = await req.json();
    if (!body.session_id || !body.trigger) {
      return new Response(
        JSON.stringify({ error: "Invalid request: session_id and trigger required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = await getUserApiKey(adminClient, userId, "anthropic");
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

    // Determine review source: prefer build_files (full content) over file paths
    let userMessage: string;
    let reviewSource: "build_tasks" | "github_files" | "file_names_only";

    const buildFiles = (body.build_files ?? []).filter(f => f.content && f.path);

    if (buildFiles.length > 0) {
      // Build v2 path: we have actual file contents to review
      reviewSource = "build_tasks";
      const fileSections = buildFiles.slice(0, MAX_FILES).map(f => {
        const lines = f.content.split("\n");
        const truncated = lines.length > MAX_LINES_PER_FILE;
        const content = truncated
          ? lines.slice(0, MAX_LINES_PER_FILE).join("\n") + `\n... (${lines.length - MAX_LINES_PER_FILE} more lines truncated)`
          : f.content;
        return `=== ${f.path} (${f.operation ?? "create"}) ===\n${content}`;
      }).join("\n\n");

      const overflow = buildFiles.length > MAX_FILES
        ? `\n\n(${buildFiles.length - MAX_FILES} additional files not shown)`
        : "";

      userMessage = `Trigger: ${body.trigger}\n\nReview these ${buildFiles.length} files from the build:\n\n${fileSections}${overflow}`;
    } else if ((body.files ?? []).length > 0) {
      // Legacy path: only file paths (post-push)
      reviewSource = "github_files";
      const fileList = body.files!.map(f => `- ${f}`).join("\n");
      userMessage = `Trigger: ${body.trigger}\n\nFiles written this build (paths only — no content available):\n${fileList}`;
    } else {
      reviewSource = "file_names_only";
      userMessage = `Trigger: ${body.trigger}\n\nNo staged or written files were found for review. The build may still be in progress, or no files were generated.`;
    }

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: reviewSource === "build_tasks" ? 4096 : 2048,
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

    const result: BouncerResult = { ...parsed, model_used: model, review_source: reviewSource };

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




