import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireAuthenticatedRequest } from "../_shared/auth.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey, X-Executor-Token",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function err(message: string, status = 400) {
  return json({ error: message }, status);
}

// Simple token hashing using Web Crypto API (available in Deno)
async function hashToken(token: string): Promise<string> {
  const encoded = new TextEncoder().encode(token);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const auth = await requireAuthenticatedRequest(
      req,
      corsHeaders,
      "executor-api"
    );
    if (auth instanceof Response) return auth;

    const { adminClient, userClient: supabase, userId } = auth;
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ── REGISTER ──────────────────────────────────────────────
    // POST ?action=register  body: { name, capabilities? }
    // Returns: executor record + raw token (only time it's shown)
    if (req.method === "POST" && action === "register") {
      const body = await req.json();
      const { name, capabilities } = body;

      if (!name) return err("name is required");

      // Generate a random token for this executor
      const rawToken = crypto.randomUUID() + "-" + crypto.randomUUID();
      const tokenHash = await hashToken(rawToken);

      const { data: executor, error: insertErr } = await supabase
        .from("executors")
        .insert({
          owner_user_id: userId,
          name,
          kind: "personal_node",
          status: "offline",
          capabilities: capabilities ?? {},
          token_hash: tokenHash,
        })
        .select()
        .single();

      if (insertErr) return err(insertErr.message, 500);

      return json({ executor, token: rawToken });
    }

    // ── HEARTBEAT ─────────────────────────────────────────────
    // POST ?action=heartbeat  header: X-Executor-Token
    if (req.method === "POST" && action === "heartbeat") {
      const executor = await validateExecutorToken(req, supabase, userId);
      if (executor instanceof Response) return executor;

      const { error: updateErr } = await supabase
        .from("executors")
        .update({
          status: "online",
          last_seen_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", executor.id);

      if (updateErr) return err(updateErr.message, 500);

      return json({ ok: true, executor_id: executor.id });
    }

    // ── POLL ──────────────────────────────────────────────────
    // GET ?action=poll  header: X-Executor-Token
    // Returns the oldest approved job not yet claimed, or null
    if (req.method === "GET" && action === "poll") {
      const executor = await validateExecutorToken(req, supabase, userId);
      if (executor instanceof Response) return executor;

      // Update heartbeat as a side effect of polling
      await supabase
        .from("executors")
        .update({
          status: "online",
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", executor.id);

      const { data: jobs } = await supabase
        .from("executor_jobs")
        .select("*")
        .eq("status", "approved")
        .eq("requested_by", userId)
        .order("created_at", { ascending: true })
        .limit(1);

      return json({ job: jobs?.[0] ?? null });
    }

    // ── CLAIM ─────────────────────────────────────────────────
    // POST ?action=claim  body: { job_id }  header: X-Executor-Token
    if (req.method === "POST" && action === "claim") {
      const executor = await validateExecutorToken(req, supabase, userId);
      if (executor instanceof Response) return executor;

      const body = await req.json();
      const { job_id } = body;
      if (!job_id) return err("job_id is required");

      // Atomic claim: only if still approved
      const { data: job, error: claimErr } = await supabase
        .from("executor_jobs")
        .update({
          executor_id: executor.id,
          status: "claimed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", job_id)
        .eq("status", "approved")
        .eq("requested_by", userId)
        .select()
        .maybeSingle();

      if (claimErr) return err(claimErr.message, 500);
      if (!job) return err("Job not available for claiming", 409);

      // Mark executor busy
      await supabase
        .from("executors")
        .update({ status: "busy", updated_at: new Date().toISOString() })
        .eq("id", executor.id);

      // Emit event
      await supabase.from("executor_job_events").insert({
        job_id,
        event_type: "claimed",
        payload: { executor_id: executor.id, executor_name: executor.name },
      });

      return json({ job });
    }

    // ── EVENT ─────────────────────────────────────────────────
    // POST ?action=event  body: { job_id, event_type, payload }
    if (req.method === "POST" && action === "event") {
      const executor = await validateExecutorToken(req, supabase, userId);
      if (executor instanceof Response) return executor;

      const body = await req.json();
      const { job_id, event_type, payload } = body;

      if (!job_id || !event_type) return err("job_id and event_type required");

      // Verify this executor owns this job
      const { data: job } = await supabase
        .from("executor_jobs")
        .select("id, executor_id, status")
        .eq("id", job_id)
        .eq("executor_id", executor.id)
        .maybeSingle();

      if (!job) return err("Job not found or not assigned to this executor", 404);

      // Status change events update the job itself
      if (event_type === "status_change" && payload?.status === "running") {
        await supabase
          .from("executor_jobs")
          .update({
            status: "running",
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", job_id);
      }

      const { error: eventErr } = await supabase
        .from("executor_job_events")
        .insert({
          job_id,
          event_type,
          payload: payload ?? {},
        });

      if (eventErr) return err(eventErr.message, 500);

      return json({ ok: true });
    }

    // ── COMPLETE ──────────────────────────────────────────────
    // POST ?action=complete  body: { job_id, success, result_summary?, error_text?, artifact_manifest? }
    if (req.method === "POST" && action === "complete") {
      const executor = await validateExecutorToken(req, supabase, userId);
      if (executor instanceof Response) return executor;

      const body = await req.json();
      const {
        job_id,
        success,
        result_summary,
        error_text,
        artifact_manifest,
      } = body;

      if (!job_id || success === undefined)
        return err("job_id and success are required");

      // Verify ownership
      const { data: job } = await supabase
        .from("executor_jobs")
        .select("id, executor_id, build_task_id")
        .eq("id", job_id)
        .eq("executor_id", executor.id)
        .maybeSingle();

      if (!job) return err("Job not found or not assigned to this executor", 404);

      const now = new Date().toISOString();
      const finalStatus = success ? "succeeded" : "failed";

      // Update job
      const { error: completeErr } = await supabase
        .from("executor_jobs")
        .update({
          status: finalStatus,
          result_summary: result_summary ?? null,
          error_text: error_text ?? null,
          artifact_manifest: artifact_manifest ?? null,
          completed_at: now,
          updated_at: now,
          ...(error_text ? { failure_reason: error_text } : {}),
        })
        .eq("id", job_id);

      if (completeErr) return err(completeErr.message, 500);

      // Emit completion event
      await supabase.from("executor_job_events").insert({
        job_id,
        event_type: "completed",
        payload: { success, result_summary, error_text },
      });

      // Bridge: sync result back to build_task if linked
      if (job.build_task_id) {
        await supabase
          .from("build_tasks")
          .update({
            status: success ? "completed" : "failed",
            result_content: result_summary,
            failure_reason: success ? null : error_text,
            completed_at: now,
            updated_at: now,
          })
          .eq("id", job.build_task_id);
      }

      // Mark executor back to online
      await supabase
        .from("executors")
        .update({ status: "online", updated_at: now })
        .eq("id", executor.id);

      return json({ ok: true, status: finalStatus });
    }

    // ── STATUS ────────────────────────────────────────────────
    // GET ?action=status  — list user's executors and recent jobs
    if (req.method === "GET" && action === "status") {
      const { data: executors } = await supabase
        .from("executors")
        .select("*")
        .eq("owner_user_id", userId)
        .order("created_at", { ascending: false });

      const { data: recentJobs } = await supabase
        .from("executor_jobs")
        .select("*")
        .eq("requested_by", userId)
        .order("created_at", { ascending: false })
        .limit(20);

      return json({ executors: executors ?? [], jobs: recentJobs ?? [] });
    }

    // ── SUBMIT ────────────────────────────────────────────────
    // POST ?action=submit  body: { prompt, adapter?, job_type?, session_id?, ... }
    // Creates a new job. Auto-approves if approval_required=false.
    if (req.method === "POST" && action === "submit") {
      const body = await req.json();
      const {
        prompt,
        adapter,
        job_type,
        session_id,
        repo_url,
        repo_name,
        branch,
        allowed_paths,
        timeout_seconds,
        approval_required,
        build_task_id,
      } = body;

      if (!prompt) return err("prompt is required");

      const autoApprove = approval_required === false;
      const now = new Date().toISOString();

      const { data: job, error: submitErr } = await supabase
        .from("executor_jobs")
        .insert({
          requested_by: userId,
          session_id: session_id ?? null,
          prompt,
          adapter: adapter ?? "shell_stub",
          job_type: job_type ?? "code_task",
          repo_url: repo_url ?? null,
          repo_name: repo_name ?? null,
          branch: branch ?? null,
          allowed_paths: allowed_paths ?? [],
          timeout_seconds: timeout_seconds ?? 300,
          approval_required: !autoApprove,
          status: autoApprove ? "approved" : "queued",
          approved_at: autoApprove ? now : null,
          approved_by: autoApprove ? userId : null,
          build_task_id: build_task_id ?? null,
        })
        .select()
        .single();

      if (submitErr) return err(submitErr.message, 500);

      return json({ job });
    }

    // ── APPROVE ───────────────────────────────────────────────
    // POST ?action=approve  body: { job_id }
    if (req.method === "POST" && action === "approve") {
      const body = await req.json();
      const { job_id } = body;
      if (!job_id) return err("job_id is required");

      const { data: job, error: approveErr } = await supabase
        .from("executor_jobs")
        .update({
          status: "approved",
          approved_at: new Date().toISOString(),
          approved_by: userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job_id)
        .eq("status", "queued")
        .eq("requested_by", userId)
        .select()
        .maybeSingle();

      if (approveErr) return err(approveErr.message, 500);
      if (!job) return err("Job not found or not in queued state", 404);

      return json({ job });
    }

    return err(`Unknown action: ${action}`, 404);
  } catch (e) {
    console.error("executor-api error:", e);
    return err(e?.message ?? "Internal error", 500);
  }
});

// ── Token validation helper ─────────────────────────────────
// Validates the X-Executor-Token header against the executor's token_hash.
// Returns the executor record, or an error Response.
async function validateExecutorToken(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<Record<string, unknown> | Response> {
  const rawToken = req.headers.get("X-Executor-Token");
  if (!rawToken) return err("X-Executor-Token header is required", 401);

  const tokenHash = await hashToken(rawToken);

  const { data: executor } = await supabase
    .from("executors")
    .select("*")
    .eq("owner_user_id", userId)
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!executor)
    return err("Invalid executor token or executor not found", 401);

  return executor;
}
