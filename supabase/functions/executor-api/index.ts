import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireAuthenticatedRequest } from "../_shared/auth.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

function jsonResponse(corsHeaders: Record<string, string>, data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(
  corsHeaders: Record<string, string>,
  message: string,
  status = 400,
) {
  if (status >= 500) {
    const requestId = crypto.randomUUID();
    console.error(`[executor-api:${requestId}] internal error`, message);
    return jsonResponse(
      corsHeaders,
      { error: "Internal server error", request_id: requestId },
      status,
    );
  }
  return jsonResponse(corsHeaders, { error: message }, status);
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
const JOB_LEASE_WINDOW_MS = 90_000;

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function normalizeExecutorCapabilities(
  value: unknown,
): Record<string, unknown> & { adapters: string[] } {
  const raw =
    value && typeof value === "object" && !Array.isArray(value)
      ? value as Record<string, unknown>
      : {};
  const adapters = Array.from(new Set(normalizeStringArray(raw.adapters)));
  return { ...raw, adapters };
}

function leaseExpiryIso(baseMs = Date.now()): string {
  return new Date(baseMs + JOB_LEASE_WINDOW_MS).toISOString();
}

async function readOptionalJsonBody(req: Request): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (!raw.trim()) return {};

  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

async function reclaimStaleJobs(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
) {
  const now = new Date().toISOString();
  const { data: staleJobs, error: staleJobsErr } = await adminClient
    .from("executor_jobs")
    .select("id, status, executor_id")
    .eq("requested_by", userId)
    .in("status", ["claimed", "running"])
    .lt("lease_expires_at", now);

  if (staleJobsErr) throw staleJobsErr;
  if (!staleJobs || staleJobs.length === 0) return;

  const staleIds = staleJobs.map((job) => job.id);
  const { data: reclaimedJobs, error: reclaimErr } = await adminClient
    .from("executor_jobs")
    .update({
      executor_id: null,
      status: "approved",
      claimed_at: null,
      started_at: null,
      lease_expires_at: null,
      updated_at: now,
    })
    .in("id", staleIds)
    .eq("requested_by", userId)
    .in("status", ["claimed", "running"])
    .lt("lease_expires_at", now)
    .select("id");

  if (reclaimErr) throw reclaimErr;

  const reclaimedIds = new Set((reclaimedJobs ?? []).map((job) => job.id));
  const events = staleJobs
    .filter((job) => reclaimedIds.has(job.id))
    .map((job) => ({
      job_id: job.id,
      event_type: "status_change",
      payload: {
        previous_status: job.status,
        status: "approved",
        reason: "lease_expired",
      },
    }));

  if (events.length > 0) {
    const { error: eventErr } = await adminClient
      .from("executor_job_events")
      .insert(events);
    if (eventErr) throw eventErr;
  }
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

type ExecutorRecord = Record<string, unknown> & {
  id: string;
  name: string;
  owner_user_id: string;
};

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(
    req,
    "Content-Type, Authorization, X-Client-Info, Apikey, X-Executor-Token",
  );
  const json = (data: unknown, status = 200) =>
    jsonResponse(corsHeaders, data, status);
  const err = (message: string, status = 400) =>
    errorResponse(corsHeaders, message, status);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    if (req.method === "POST" && action === "heartbeat") {
      const executor = await validateExecutorToken(req, adminClient, corsHeaders);
      if (executor instanceof Response) return executor;
      const body = await readOptionalJsonBody(req);
      const capabilities = body.capabilities === undefined
        ? null
        : normalizeExecutorCapabilities(body.capabilities);
      const now = new Date().toISOString();

      const { error: updateErr } = await adminClient
        .from("executors")
        .update({
          status: "online",
          last_seen_at: now,
          updated_at: now,
          ...(capabilities ? { capabilities } : {}),
        })
        .eq("id", executor.id);

      if (updateErr) return err(updateErr.message, 500);

      const { error: leaseErr } = await adminClient
        .from("executor_jobs")
        .update({
          lease_expires_at: leaseExpiryIso(),
          updated_at: now,
        })
        .eq("executor_id", executor.id)
        .in("status", ["claimed", "running"]);

      if (leaseErr) return err(leaseErr.message, 500);

      return json({ ok: true, executor_id: executor.id });
    }

    if (req.method === "GET" && action === "poll") {
      const executor = await validateExecutorToken(req, adminClient, corsHeaders);
      if (executor instanceof Response) return executor;
      await reclaimStaleJobs(adminClient, executor.owner_user_id);
      const now = new Date().toISOString();
      const capabilities = normalizeExecutorCapabilities(executor.capabilities);

      await adminClient
        .from("executors")
        .update({
          status: "online",
          last_seen_at: now,
          updated_at: now,
        })
        .eq("id", executor.id);

      if (capabilities.adapters.length === 0) {
        return json({ job: null });
      }

      const { data: jobs } = await adminClient
        .from("executor_jobs")
        .select("*")
        .eq("status", "approved")
        .eq("requested_by", executor.owner_user_id)
        .in("adapter", capabilities.adapters)
        .order("created_at", { ascending: true })
        .limit(1);

      return json({ job: jobs?.[0] ?? null });
    }

    if (req.method === "POST" && action === "claim") {
      const executor = await validateExecutorToken(req, adminClient, corsHeaders);
      if (executor instanceof Response) return executor;
      const capabilities = normalizeExecutorCapabilities(executor.capabilities);

      const body = await req.json();
      const { job_id } = body;
      if (!job_id) return err("job_id is required");
      if (capabilities.adapters.length === 0) {
        return err("Executor has no advertised adapters", 409);
      }

      const { data: job, error: claimErr } = await adminClient
        .from("executor_jobs")
        .update({
          executor_id: executor.id,
          status: "claimed",
          claimed_at: new Date().toISOString(),
          lease_expires_at: leaseExpiryIso(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job_id)
        .eq("status", "approved")
        .eq("requested_by", executor.owner_user_id)
        .in("adapter", capabilities.adapters)
        .select()
        .maybeSingle();

      if (claimErr) return err(claimErr.message, 500);
      if (!job) return err("Job not available for claiming", 409);

      await adminClient
        .from("executors")
        .update({ status: "busy", updated_at: new Date().toISOString() })
        .eq("id", executor.id);

      await adminClient.from("executor_job_events").insert({
        job_id,
        event_type: "claimed",
        payload: { executor_id: executor.id, executor_name: executor.name },
      });

      return json({ job });
    }

    if (req.method === "POST" && action === "event") {
      const executor = await validateExecutorToken(req, adminClient, corsHeaders);
      if (executor instanceof Response) return executor;

      const body = await req.json();
      const { job_id, event_type, payload } = body;

      if (!job_id || !event_type) return err("job_id and event_type required");

      const { data: job } = await adminClient
        .from("executor_jobs")
        .select("id, executor_id, status")
        .eq("id", job_id)
        .eq("executor_id", executor.id)
        .maybeSingle();

      if (!job) return err("Job not found or not assigned to this executor", 404);

      if (event_type === "status_change" && payload?.status === "running") {
        await adminClient
          .from("executor_jobs")
          .update({
            status: "running",
            started_at: new Date().toISOString(),
            lease_expires_at: leaseExpiryIso(),
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

    if (req.method === "POST" && action === "complete") {
      const executor = await validateExecutorToken(req, adminClient, corsHeaders);
      if (executor instanceof Response) return executor;

      const body = await req.json();
      const {
        job_id,
        success,
        result_summary,
        error_text,
        artifact_manifest,
      } = body;

      if (!job_id || success === undefined) {
        return err("job_id and success are required");
      }

      const { data: job } = await adminClient
        .from("executor_jobs")
        .select("id, executor_id, build_task_id")
        .eq("id", job_id)
        .eq("executor_id", executor.id)
        .maybeSingle();

      if (!job) return err("Job not found or not assigned to this executor", 404);

      const now = new Date().toISOString();
      const finalStatus = success ? "succeeded" : "failed";

      const { error: completeErr } = await adminClient
        .from("executor_jobs")
        .update({
          status: finalStatus,
          result_summary: result_summary ?? null,
          error_text: error_text ?? null,
          artifact_manifest: artifact_manifest ?? null,
          lease_expires_at: null,
          completed_at: now,
          updated_at: now,
          ...(error_text ? { failure_reason: error_text } : {}),
        })
        .eq("id", job_id);

      if (completeErr) return err(completeErr.message, 500);

      await adminClient.from("executor_job_events").insert({
        job_id,
        event_type: "completed",
        payload: { success, result_summary, error_text },
      });

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

      await adminClient
        .from("executors")
        .update({ status: "online", updated_at: now })
        .eq("id", executor.id);

      return json({ ok: true, status: finalStatus });
    }

    const auth = await requireAuthenticatedRequest(
      req,
      corsHeaders,
      "executor-api"
    );
    if (auth instanceof Response) return auth;

    const { userClient: supabase, userId } = auth;

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
          capabilities: normalizeExecutorCapabilities(capabilities),
          token_hash: tokenHash,
        })
        .select()
        .single();

      if (insertErr) return err(insertErr.message, 500);

      return json({ executor, token: rawToken });
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
    const requestId = crypto.randomUUID();
    console.error(`[executor-api:${requestId}] unhandled error`, e);
    return json({ error: "Internal server error", request_id: requestId }, 500);
  }
});

// ── Token validation helper ─────────────────────────────────
// Validates the X-Executor-Token header against the executor's token_hash.
// Returns the executor record, or an error Response.
async function validateExecutorToken(
  req: Request,
  supabase: ReturnType<typeof createClient>,
  corsHeaders: Record<string, string>,
): Promise<ExecutorRecord | Response> {
  const rawToken = req.headers.get("X-Executor-Token");
  if (!rawToken) return errorResponse(corsHeaders, "X-Executor-Token header is required", 401);

  const tokenHash = await hashToken(rawToken);

  const { data: executor } = await supabase
    .from("executors")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (!executor) {
    return errorResponse(corsHeaders, "Invalid executor token or executor not found", 401);
  }

  return executor as ExecutorRecord;
}
