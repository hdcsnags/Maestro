// Sprint A · B7 — Architect.md generation edge function
// Reads concierge decisions + intake summary + build spec from the session,
// asks claude-sonnet-4-6 to produce an ARCHITECT.md, persists into
// sessions.architect_md, and returns the content for download.
// Does NOT commit to git — github-execute enforces that ARCHITECT.md is
// never written from a manifest.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ArchitectRequest {
  session_id: string;
}

const SYSTEM_PROMPT = `You are Maestro's Architect agent. Generate an
ARCHITECT.md for this project using the provided synthesis, intake summary,
and build spec.

Required sections (use exactly these markdown headings):
# [Project Name] — Architecture Guide
## Stack
## File Structure
## Agent Lane Assignments
## Security Constraints
## Known Risks
## Build Spec Summary
## Do Not Touch

Return the markdown only — no preamble, no code fences around the whole
document.`;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: ArchitectRequest = await req.json();
    if (!body.session_id) {
      return new Response(
        JSON.stringify({ error: "session_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Verify session ownership via workspace
    const { data: sessionRow } = await supabase
      .from("sessions")
      .select("id, title, build_spec, workspace_id")
      .eq("id", body.session_id)
      .maybeSingle();
    if (!sessionRow) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: ws } = await supabase
      .from("workspaces")
      .select("user_id")
      .eq("id", sessionRow.workspace_id)
      .maybeSingle();
    if (!ws || ws.user_id !== user.id) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: anthropicSecret } = await supabase
      .from("encrypted_secrets")
      .select("encrypted_key")
      .eq("user_id", user.id)
      .eq("provider", "anthropic")
      .maybeSingle();
    if (!anthropicSecret) {
      return new Response(
        JSON.stringify({
          error: "ANTHROPIC_KEY_MISSING",
          message: "Architect generation requires an Anthropic API key. Add one in the Provider Vault.",
        }),
        { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: decisions } = await supabase
      .from("concierge_decisions")
      .select("phase, alignment_summary, tension_points, recommended_direction, created_at")
      .eq("session_id", body.session_id)
      .order("created_at", { ascending: true });

    const buildSpec = (sessionRow.build_spec as Record<string, unknown> | null) ?? {};
    const intakeSummary = buildSpec.intake_summary ?? null;

    const decisionsText = (decisions ?? [])
      .map((d) => {
        const tension = Array.isArray(d.tension_points) ? d.tension_points.join("; ") : "";
        return `[${d.phase}]\nAlignment: ${d.alignment_summary ?? ""}\nTensions: ${tension}\nDirection: ${d.recommended_direction ?? ""}`;
      })
      .join("\n\n");

    const userMessage = `Project: ${sessionRow.title ?? "Untitled session"}

--- Intake Summary ---
${intakeSummary ? JSON.stringify(intakeSummary, null, 2) : "(no intake scan run yet)"}

--- Build Spec ---
${JSON.stringify(buildSpec, null, 2)}

--- Concierge Decisions ---
${decisionsText || "(no concierge decisions yet)"}`;

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicSecret.encrypted_key as string,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      return new Response(
        JSON.stringify({
          error: "ANTHROPIC_REQUEST_FAILED",
          message: `Anthropic API ${anthropicResponse.status}: ${errText.slice(0, 500)}`,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const anthropicData = await anthropicResponse.json();
    const architectMd: string = anthropicData?.content?.[0]?.text ?? "";
    if (!architectMd) {
      return new Response(
        JSON.stringify({ error: "EMPTY_RESPONSE", message: "Anthropic returned empty content" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { error: updateError } = await supabase
      .from("sessions")
      .update({ architect_md: architectMd })
      .eq("id", body.session_id);
    if (updateError) {
      return new Response(
        JSON.stringify({
          error: "PERSIST_FAILED",
          message: updateError.message,
          architect_md: architectMd,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ architect_md: architectMd }),
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
