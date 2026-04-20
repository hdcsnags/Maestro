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

const TRUSTED_APPROVED_SHELL_COMMANDS: RegExp[] = [
  /^git\s+status$/,
  /^git\s+status\s+--short$/,
  /^git\s+status\s+-sb$/,
  /^git\s+branch$/,
  /^git\s+branch\s+--show-current$/,
  /^git\s+diff$/,
  /^git\s+diff\s+--stat$/,
  /^git\s+log\s+--oneline$/,
  /^git\s+log\s+--oneline\s+-\d+$/,
  /^npm\s+list$/,
  /^npm\s+outdated$/,
  /^node\s+--version$/,
  /^gh\s+repo\s+view$/,
  /^gh\s+issue\s+list$/,
  /^gh\s+pr\s+list$/,
];

const UNSAFE_APPROVED_SHELL_PATTERN = /[;&|><`$%()]/;
const GITHUB_REPO_URL_PATTERN =
  /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/;
const GIT_BRANCH_PATTERN = /^(?!-)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._/-]{1,200}$/;

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function hasUnsafeApprovedShellSyntax(command: string): boolean {
  return /[\r\n]/.test(command) || UNSAFE_APPROVED_SHELL_PATTERN.test(command);
}

function isTrustedApprovedShellCommand(command: string): boolean {
  return TRUSTED_APPROVED_SHELL_COMMANDS.some((pattern) => pattern.test(command));
}

function validateRepoContext(repoUrl: string | null, branch: string | null): string | null {
  if (!repoUrl && branch) {
    return "branch requires repo_url";
  }
  if (repoUrl && !GITHUB_REPO_URL_PATTERN.test(repoUrl)) {
    return "repo_url must be a https://github.com/<owner>/<repo>[.git] URL";
  }
  if (branch && !GIT_BRANCH_PATTERN.test(branch)) {
    return "branch contains unsupported characters";
  }
  return null;
}

function getApprovalPolicy(
  adapter: string,
  prompt: string,
): { approvalRequired: boolean; rejectionReason?: string } {
  if (adapter !== "approved_shell") {
    return { approvalRequired: false };
  }
  if (hasUnsafeApprovedShellSyntax(prompt)) {
    return {
      approvalRequired: true,
      rejectionReason: "approved_shell commands cannot contain shell metacharacters or newlines",
    };
  }
  return {
    approvalRequired: !isTrustedApprovedShellCommand(prompt),
  };
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

      const { data: jobs } = await adminClient
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
      const { data: job, error: claimErr } = await adminClient
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
      await adminClient.from("executor_job_events").insert({
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
      const { data: job } = await adminClient
        .from("executor_jobs")
        .select("id, executor_id, status")
        .eq("id", job_id)
        .eq("executor_id", executor.id)
        .maybeSingle();

      if (!job) return err("Job not found or not assigned to this executor", 404);

      // Status change events update the job itself
      if (event_type === "status_change" && payload?.status === "running") {
        await adminClient
          .from("executor_jobs")
          .update({
            status: "running",
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", job_id);
      }

      const { error: eventErr } = await adminClient
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
      const { data: job } = await adminClient
        .from("executor_jobs")
        .select("id, executor_id, build_task_id")
        .eq("id", job_id)
        .eq("executor_id", executor.id)
        .maybeSingle();

      if (!job) return err("Job not found or not assigned to this executor", 404);

      const now = new Date().toISOString();
      const finalStatus = success ? "succeeded" : "failed";

      // Update job
      const { error: completeErr } = await adminClient
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
      await adminClient.from("executor_job_events").insert({
        job_id,
        event_type: "completed",
        payload: { success, result_summary, error_text },
      });

      // Bridge: sync result back to build_task if linked
      if (job.build_task_id) {
        await adminClient
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

      const { data: recentJobs } = await adminClient
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
        build_task_id,
      } = body;

      const promptText = typeof prompt === "string" ? prompt.trim() : "";
      if (!promptText) return err("prompt is required");

      const adapterName =
        typeof adapter === "string" && adapter.trim().length > 0
          ? adapter.trim()
          : "shell_stub";
      const jobType =
        typeof job_type === "string" && job_type.trim().length > 0
          ? job_type.trim()
          : "code_task";
      const repoUrl =
        typeof repo_url === "string" && repo_url.trim().length > 0
          ? repo_url.trim()
          : null;
      const repoName =
        typeof repo_name === "string" && repo_name.trim().length > 0
          ? repo_name.trim()
          : null;
      const branchName =
        typeof branch === "string" && branch.trim().length > 0
          ? branch.trim()
          : null;
      const allowedPaths = normalizeStringArray(allowed_paths);
      const timeoutSeconds =
        typeof timeout_seconds === "number" && Number.isFinite(timeout_seconds)
          ? Math.max(30, Math.min(3600, Math.round(timeout_seconds)))
          : 300;

      const repoContextError = validateRepoContext(repoUrl, branchName);
      if (repoContextError) return err(repoContextError);

      const approvalPolicy = getApprovalPolicy(adapterName, promptText);
      if (approvalPolicy.rejectionReason) {
        return err(approvalPolicy.rejectionReason);
      }

      const approvalRequired = approvalPolicy.approvalRequired;
      const now = new Date().toISOString();
      const status = approvalRequired ? "queued" : "approved";

      const { data: job, error: submitErr } = await adminClient
        .from("executor_jobs")
        .insert({
          requested_by: userId,
          session_id: session_id ?? null,
          prompt: promptText,
          adapter: adapterName,
          job_type: jobType,
          repo_url: repoUrl,
          repo_name: repoName,
          branch: branchName,
          allowed_paths: allowedPaths,
          timeout_seconds: timeoutSeconds,
          approval_required: approvalRequired,
          status,
          approved_at: approvalRequired ? null : now,
          approved_by: approvalRequired ? null : userId,
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

      const { data: job, error: approveErr } = await adminClient
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
