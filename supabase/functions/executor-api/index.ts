import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireAuthenticatedRequest } from "../_shared/auth.ts";
import { readJsonBody, readOptionalJsonBody } from "../_shared/body.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { hasUnsafeSyntax, isTrustedShellCommand } from "../_shared/trusted-commands.ts";
import {
  commandHash,
  generateApprovalToken,
  isApprovalTokenConfigured,
  makeTokenPayload,
  validateApprovalToken,
} from "../_shared/approval-tokens.ts";

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

const EXECUTOR_TOKEN_HMAC_PREFIX = "hmac:v1:";
const textEncoder = new TextEncoder();

function bytesToHex(value: ArrayBuffer): string {
  return Array.from(new Uint8Array(value))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getExecutorTokenSecrets(): string[] {
  const candidates = [
    Deno.env.get("MAESTRO_EXECUTOR_TOKEN_KEY"),
    Deno.env.get("MAESTRO_SECRETS_KEY"),
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  ];

  return Array.from(new Set(
    candidates
      .map((value) => value?.trim() ?? "")
      .filter((value) => value.length > 0),
  ));
}

async function hashLegacyToken(token: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", textEncoder.encode(token));
  return bytesToHex(hash);
}

async function hashTokenWithSecret(token: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, textEncoder.encode(token));
  return `${EXECUTOR_TOKEN_HMAC_PREFIX}${bytesToHex(signature)}`;
}

async function hashToken(token: string): Promise<string> {
  const secret = getExecutorTokenSecrets()[0];
  if (!secret) {
    throw new Error("Executor token hashing secret is not configured");
  }
  return hashTokenWithSecret(token, secret);
}

async function candidateTokenHashes(token: string): Promise<string[]> {
  const hashes = new Set<string>([await hashLegacyToken(token)]);
  for (const secret of getExecutorTokenSecrets()) {
    hashes.add(await hashTokenWithSecret(token, secret));
  }
  return Array.from(hashes);
}


const GITHUB_REPO_URL_PATTERN =
  /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/;
const GIT_BRANCH_PATTERN = /^(?!-)(?!.*\.\.)(?!.*\/\/)[A-Za-z0-9._/-]{1,200}$/;
const JOB_LEASE_WINDOW_MS = 90_000;
const EXECUTOR_API_BODY_LIMITS = {
  heartbeat: 32_768,
  claim: 16_384,
  event: 262_144,
  complete: 3_145_728,
  register: 65_536,
  rotate: 16_384,
  submit: 524_288,
  approve: 16_384,
  report_incident: 32_768,
  claim_loop: 16_384,
  report_step: 65_536,
  complete_loop: 32_768,
  poll_loop_controls: 16_384,
  acquire_locks: 32_768,
  release_locks: 16_384,
  refresh_loop_lease: 16_384,
} as const;

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

async function reclaimStaleBuildTasks(
  adminClient: ReturnType<typeof createClient>,
  _userId: string,
) {
  // Reset build_tasks stuck in dispatched/running for >120 seconds back to pending.
  // Service-role client bypasses RLS; tasks are scoped by session→workspace ownership implicitly.
  const cutoff = new Date(Date.now() - 120_000).toISOString();
  await adminClient
    .from("build_tasks")
    .update({ status: "pending", updated_at: new Date().toISOString() })
    .in("status", ["dispatched", "running"])
    .lt("updated_at", cutoff);
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
  const shellAdapters = new Set(["approved_shell", "pty_shell"]);
  if (!shellAdapters.has(adapter)) {
    return { approvalRequired: false };
  }
  if (hasUnsafeSyntax(prompt)) {
    return {
      approvalRequired: true,
      rejectionReason: "shell commands cannot contain shell metacharacters or newlines",
    };
  }
  return {
    approvalRequired: !isTrustedShellCommand(prompt),
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
      const bodyResult = await readOptionalJsonBody<Record<string, unknown>>(req, corsHeaders, {
        maxBytes: EXECUTOR_API_BODY_LIMITS.heartbeat,
        label: "Executor heartbeat body",
      });
      if (bodyResult instanceof Response) return bodyResult;
      const body = bodyResult;
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

      // Also refresh iteration loop leases
      await adminClient
        .from("iteration_loops")
        .update({ lease_expires_at: leaseExpiryIso(), updated_at: now })
        .eq("executor_id", executor.id)
        .in("status", ["running", "awaiting_approval", "paused"]);

      return json({ ok: true, executor_id: executor.id });
    }

    if (req.method === "GET" && action === "poll") {
      const executor = await validateExecutorToken(req, adminClient, corsHeaders);
      if (executor instanceof Response) return executor;
      await reclaimStaleJobs(adminClient, executor.owner_user_id);
      await reclaimStaleBuildTasks(adminClient, executor.owner_user_id);

      // Reclaim stale iteration loops (lease expired while running/paused/awaiting_approval)
      const staleLoopCutoff = new Date().toISOString();
      await adminClient
        .from("iteration_loops")
        .update({ status: "failed", termination_reason: "lease_expired", completed_at: staleLoopCutoff, updated_at: staleLoopCutoff, lease_expires_at: null })
        .eq("user_id", executor.owner_user_id)
        .in("status", ["running", "awaiting_approval", "paused"])
        .lt("lease_expires_at", staleLoopCutoff);

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

      const bodyResult = await readJsonBody<{ job_id?: string }>(req, corsHeaders, {
        maxBytes: EXECUTOR_API_BODY_LIMITS.claim,
        label: "Executor claim body",
      });
      if (bodyResult instanceof Response) return bodyResult;
      const body = bodyResult;
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

      const bodyResult = await readJsonBody<{
        job_id?: string;
        event_type?: string;
        payload?: Record<string, unknown>;
      }>(req, corsHeaders, {
        maxBytes: EXECUTOR_API_BODY_LIMITS.event,
        label: "Executor event body",
      });
      if (bodyResult instanceof Response) return bodyResult;
      const body = bodyResult;
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

      const bodyResult = await readJsonBody<{
        job_id?: string;
        success?: boolean;
        result_summary?: string;
        error_text?: string;
        artifact_manifest?: unknown;
      }>(req, corsHeaders, {
        maxBytes: EXECUTOR_API_BODY_LIMITS.complete,
        label: "Executor completion body",
      });
      if (bodyResult instanceof Response) return bodyResult;
      const body = bodyResult;
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

    // ── POLL_LOOP ──────────────────────────────────────────────
    // GET ?action=poll_loop  — poll for a pending iteration loop
    if (req.method === "GET" && action === "poll_loop") {
      const executor = await validateExecutorToken(req, adminClient, corsHeaders);
      if (executor instanceof Response) return executor;

      const { data: loops } = await adminClient
        .from("iteration_loops")
        .select("*")
        .eq("status", "pending")
        .eq("user_id", executor.owner_user_id)
        .or(`executor_id.eq.${executor.id},executor_id.is.null`)
        .order("created_at", { ascending: true })
        .limit(1);

      return json({ loop: loops?.[0] ?? null });
    }

    // ── CLAIM_LOOP ─────────────────────────────────────────────
    // POST ?action=claim_loop  body: { loop_id }
    if (req.method === "POST" && action === "claim_loop") {
      const executor = await validateExecutorToken(req, adminClient, corsHeaders);
      if (executor instanceof Response) return executor;

      const bodyResult = await readJsonBody<{ loop_id?: string }>(req, corsHeaders, {
        maxBytes: EXECUTOR_API_BODY_LIMITS.claim_loop,
        label: "Claim loop body",
      });
      if (bodyResult instanceof Response) return bodyResult;
      const { loop_id } = bodyResult;
      if (!loop_id) return err("loop_id is required");

      const now = new Date().toISOString();
      const { data: loop, error: claimErr } = await adminClient
        .from("iteration_loops")
        .update({
          status: "running",
          executor_id: executor.id,
          started_at: now,
          lease_expires_at: leaseExpiryIso(),
          updated_at: now,
        })
        .eq("id", loop_id)
        .eq("status", "pending")
        .eq("user_id", executor.owner_user_id)
        .select()
        .maybeSingle();

      if (claimErr) return err(claimErr.message, 500);
      if (!loop) return err("Loop not available for claiming", 409);

      return json({ loop });
    }

    // ── REPORT_STEP ────────────────────────────────────────────
    // POST ?action=report_step  body: { loop_id, step_number, state, ...fields }
    if (req.method === "POST" && action === "report_step") {
      const executor = await validateExecutorToken(req, adminClient, corsHeaders);
      if (executor instanceof Response) return executor;

      const bodyResult = await readJsonBody<Record<string, unknown>>(req, corsHeaders, {
        maxBytes: EXECUTOR_API_BODY_LIMITS.report_step,
        label: "Report step body",
      });
      if (bodyResult instanceof Response) return bodyResult;
      const body = bodyResult;

      const loop_id = typeof body.loop_id === "string" ? body.loop_id : "";
      const step_number = typeof body.step_number === "number" ? body.step_number : null;
      const state = typeof body.state === "string" ? body.state : "";

      if (!loop_id || step_number === null || !state) {
        return err("loop_id, step_number, and state are required");
      }

      // Verify loop belongs to executor
      const { data: loop } = await adminClient
        .from("iteration_loops")
        .select("id, executor_id, step_count")
        .eq("id", loop_id)
        .eq("executor_id", executor.id)
        .maybeSingle();
      if (!loop) return err("Loop not found or not assigned to this executor", 404);

      const now = new Date().toISOString();
      const MAX_STDOUT = 8192;

      // Upsert the step
      const stepData: Record<string, unknown> = {
        loop_id,
        step_number,
        state,
        updated_at: now,
      };
      const optionalFields = [
        "files_read", "proposed_diff", "proposed_diff_hash", "proposed_diff_files",
        "proposal_rationale", "approval_required", "approved_at", "apply_succeeded",
        "apply_error", "pre_apply_commit_sha", "verification_started_at",
        "verification_completed_at", "verification_exit_code", "verification_stdout",
        "verification_stderr", "verification_succeeded", "terminal_reason", "rolled_back",
      ];
      for (const field of optionalFields) {
        if (field in body) {
          let val = body[field];
          // Truncate verbose text fields server-side
          if ((field === "verification_stdout" || field === "verification_stderr") && typeof val === "string") {
            val = val.slice(0, MAX_STDOUT);
          }
          stepData[field] = val;
        }
      }

      const { data: step, error: upsertErr } = await adminClient
        .from("iteration_steps")
        .upsert(stepData, { onConflict: "loop_id,step_number" })
        .select()
        .single();

      if (upsertErr) return err(upsertErr.message, 500);

      // Update loop step_count (high-watermark), current_step_id, and updated_at.
      // NOTE: Do NOT mirror step terminal states to the loop here.
      // A step can fail and the runner continues to the next step.
      // Only complete_loop (called explicitly by the runner) should set loop terminal status.
      // The sole exception is "succeeded" — a succeeded step means the loop is done.
      const newStepCount = Math.max(
        typeof loop.step_count === "number" ? loop.step_count : 0,
        step_number,
      );
      const loopUpdate: Record<string, unknown> = {
        step_count: newStepCount,
        current_step_id: step.id,
        updated_at: now,
      };

      if (state === "succeeded") {
        loopUpdate.status = "succeeded";
        loopUpdate.completed_at = now;
        loopUpdate.lease_expires_at = null;
      }

      await adminClient.from("iteration_loops").update(loopUpdate).eq("id", loop_id);

      return json({ step });
    }

    // ── COMPLETE_LOOP ──────────────────────────────────────────
    // POST ?action=complete_loop  body: { loop_id, status, termination_reason?, ending_commit_sha? }
    if (req.method === "POST" && action === "complete_loop") {
      const executor = await validateExecutorToken(req, adminClient, corsHeaders);
      if (executor instanceof Response) return executor;

      const bodyResult = await readJsonBody<{
        loop_id?: string;
        status?: string;
        termination_reason?: string;
        ending_commit_sha?: string;
      }>(req, corsHeaders, {
        maxBytes: EXECUTOR_API_BODY_LIMITS.complete_loop,
        label: "Complete loop body",
      });
      if (bodyResult instanceof Response) return bodyResult;
      const body = bodyResult;

      const loop_id = typeof body.loop_id === "string" ? body.loop_id : "";
      const status = typeof body.status === "string" ? body.status : "";
      if (!loop_id || !status) return err("loop_id and status are required");

      const { data: loop } = await adminClient
        .from("iteration_loops")
        .select("id, executor_id")
        .eq("id", loop_id)
        .eq("executor_id", executor.id)
        .maybeSingle();
      if (!loop) return err("Loop not found or not assigned to this executor", 404);

      const now = new Date().toISOString();
      const { error: updateErr } = await adminClient
        .from("iteration_loops")
        .update({
          status,
          completed_at: now,
          lease_expires_at: null,
          termination_reason: body.termination_reason ?? null,
          ending_commit_sha: body.ending_commit_sha ?? null,
          updated_at: now,
        })
        .eq("id", loop_id);
      if (updateErr) return err(updateErr.message, 500);

      // Release all locks for this loop
      await adminClient.from("iteration_locks").delete().eq("loop_id", loop_id);

      return json({ ok: true });
    }

    // ── POLL_LOOP_CONTROLS ────────────────────────────────────
    // GET ?action=poll_loop_controls&loop_id=<id>
    if (req.method === "GET" && action?.startsWith("poll_loop_controls")) {
      const executor = await validateExecutorToken(req, adminClient, corsHeaders);
      if (executor instanceof Response) return executor;

      const loopId = url.searchParams.get("loop_id") ?? "";
      if (!loopId) return err("loop_id query parameter is required");

      const { data: loop } = await adminClient
        .from("iteration_loops")
        .select("id, executor_id")
        .eq("id", loopId)
        .eq("executor_id", executor.id)
        .maybeSingle();
      if (!loop) return err("Loop not found or not assigned to this executor", 404);

      const { data: controls } = await adminClient
        .from("iteration_controls")
        .select("*")
        .eq("loop_id", loopId)
        .is("applied_at", null)
        .order("created_at", { ascending: true });

      return json({ controls: controls ?? [] });
    }

    // ── APPLY_LOOP_CONTROL ────────────────────────────────────
    // POST ?action=apply_loop_control  body: { control_id, loop_id }
    if (req.method === "POST" && action === "apply_loop_control") {
      const executor = await validateExecutorToken(req, adminClient, corsHeaders);
      if (executor instanceof Response) return executor;

      const bodyResult = await readJsonBody<{ control_id?: string; loop_id?: string }>(req, corsHeaders, {
        maxBytes: EXECUTOR_API_BODY_LIMITS.claim_loop,
        label: "Apply loop control body",
      });
      if (bodyResult instanceof Response) return bodyResult;
      const { control_id, loop_id } = bodyResult;
      if (!control_id || !loop_id) return err("control_id and loop_id are required");

      const { data: loop } = await adminClient
        .from("iteration_loops")
        .select("id, executor_id")
        .eq("id", loop_id)
        .eq("executor_id", executor.id)
        .maybeSingle();
      if (!loop) return err("Loop not found or not assigned to this executor", 404);

      const now = new Date().toISOString();
      const { error: updateErr } = await adminClient
        .from("iteration_controls")
        .update({ applied_at: now })
        .eq("id", control_id)
        .eq("loop_id", loop_id)
        .is("applied_at", null);
      if (updateErr) return err(updateErr.message, 500);

      return json({ ok: true });
    }

    // ── ACQUIRE_LOCKS ─────────────────────────────────────────
    // POST ?action=acquire_locks  body: { loop_id, paths: string[], repo_full_name }
    if (req.method === "POST" && action === "acquire_locks") {
      const executor = await validateExecutorToken(req, adminClient, corsHeaders);
      if (executor instanceof Response) return executor;

      const bodyResult = await readJsonBody<{
        loop_id?: string;
        paths?: unknown;
        repo_full_name?: string;
      }>(req, corsHeaders, {
        maxBytes: EXECUTOR_API_BODY_LIMITS.acquire_locks,
        label: "Acquire locks body",
      });
      if (bodyResult instanceof Response) return bodyResult;
      const body = bodyResult;

      const loop_id = typeof body.loop_id === "string" ? body.loop_id : "";
      const repo_full_name = typeof body.repo_full_name === "string" ? body.repo_full_name : "";
      const paths = normalizeStringArray(body.paths);
      if (!loop_id || !repo_full_name || paths.length === 0) {
        return err("loop_id, paths, and repo_full_name are required");
      }

      // Verify loop belongs to executor's owner
      const { data: loop } = await adminClient
        .from("iteration_loops")
        .select("id, user_id")
        .eq("id", loop_id)
        .eq("user_id", executor.owner_user_id)
        .maybeSingle();
      if (!loop) return err("Loop not found or access denied", 404);

      const userId = executor.owner_user_id;
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const now = new Date().toISOString();

      for (const path of paths) {
        // Check for existing lock
        const { data: existing } = await adminClient
          .from("iteration_locks")
          .select("path, loop_id, expires_at")
          .eq("path", path)
          .eq("user_id", userId)
          .eq("repo_full_name", repo_full_name)
          .maybeSingle();

        if (existing) {
          if (existing.expires_at < now) {
            // Lock expired — delete and re-insert
            await adminClient
              .from("iteration_locks")
              .delete()
              .eq("path", path)
              .eq("user_id", userId)
              .eq("repo_full_name", repo_full_name);
          } else if (existing.loop_id !== loop_id) {
            return json({
              error: "file_locked",
              locked_path: path,
              blocking_loop_id: existing.loop_id,
            }, 409);
          } else {
            // Same loop already holds this lock — refresh expiry
            await adminClient
              .from("iteration_locks")
              .update({ expires_at: expiresAt })
              .eq("path", path)
              .eq("user_id", userId)
              .eq("repo_full_name", repo_full_name);
            continue;
          }
        }

        const { error: insertErr } = await adminClient
          .from("iteration_locks")
          .insert({ path, user_id: userId, repo_full_name, loop_id, expires_at: expiresAt });
        if (insertErr) return err(insertErr.message, 500);
      }

      return json({ ok: true, locked_paths: paths });
    }

    // ── RELEASE_LOCKS ─────────────────────────────────────────
    // POST ?action=release_locks  body: { loop_id }
    if (req.method === "POST" && action === "release_locks") {
      const executor = await validateExecutorToken(req, adminClient, corsHeaders);
      if (executor instanceof Response) return executor;

      const bodyResult = await readJsonBody<{ loop_id?: string }>(req, corsHeaders, {
        maxBytes: EXECUTOR_API_BODY_LIMITS.release_locks,
        label: "Release locks body",
      });
      if (bodyResult instanceof Response) return bodyResult;
      const { loop_id } = bodyResult;
      if (!loop_id) return err("loop_id is required");

      // Verify loop belongs to executor's owner
      const { data: loop } = await adminClient
        .from("iteration_loops")
        .select("id, user_id")
        .eq("id", loop_id)
        .eq("user_id", executor.owner_user_id)
        .maybeSingle();
      if (!loop) return err("Loop not found or access denied", 404);

      await adminClient.from("iteration_locks").delete().eq("loop_id", loop_id);

      return json({ ok: true });
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
      const bodyResult = await readJsonBody<{ name?: string; capabilities?: unknown }>(req, corsHeaders, {
        maxBytes: EXECUTOR_API_BODY_LIMITS.register,
        label: "Executor register body",
      });
      if (bodyResult instanceof Response) return bodyResult;
      const body = bodyResult;
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

    // ── ROTATE TOKEN ──────────────────────────────────────────
    // POST ?action=rotate  body: { executor_id }
    // Returns: updated executor + new raw token (only time it's shown)
    if (req.method === "POST" && action === "rotate") {
      const bodyResult = await readJsonBody<{ executor_id?: string }>(req, corsHeaders, {
        maxBytes: EXECUTOR_API_BODY_LIMITS.rotate,
        label: "Executor rotate body",
      });
      if (bodyResult instanceof Response) return bodyResult;
      const body = bodyResult;
      const executorId = typeof body.executor_id === "string" ? body.executor_id.trim() : "";

      if (!executorId) return err("executor_id is required");

      const rawToken = crypto.randomUUID() + "-" + crypto.randomUUID();
      const tokenHash = await hashToken(rawToken);
      const now = new Date().toISOString();

      const { data: executor, error: rotateErr } = await supabase
        .from("executors")
        .update({
          token_hash: tokenHash,
          status: "offline",
          last_seen_at: null,
          updated_at: now,
        })
        .eq("id", executorId)
        .eq("owner_user_id", userId)
        .select()
        .maybeSingle();

      if (rotateErr) return err(rotateErr.message, 500);
      if (!executor) return err("Executor not found", 404);

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
    // For shell adapters requiring approval: returns { pending_approval: true, approval_token }
    // when APPROVAL_TOKEN_SECRET is set. Re-submit with approval_token to create the job.
    if (req.method === "POST" && action === "submit") {
      const bodyResult = await readJsonBody<{
        prompt?: string;
        adapter?: string;
        job_type?: string;
        session_id?: string | null;
        repo_url?: string | null;
        repo_name?: string | null;
        branch?: string | null;
        allowed_paths?: unknown;
        timeout_seconds?: number;
        build_task_id?: string | null;
        context_bundle?: unknown;
        approval_token?: string;
      }>(req, corsHeaders, {
        maxBytes: EXECUTOR_API_BODY_LIMITS.submit,
        label: "Executor submit body",
      });
      if (bodyResult instanceof Response) return bodyResult;
      const body = bodyResult;
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
        context_bundle,
        approval_token,
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
      // Normalize context_bundle: only accept plain objects, reject arrays/primitives
      const contextBundle =
        context_bundle !== null &&
        typeof context_bundle === "object" &&
        !Array.isArray(context_bundle)
          ? (context_bundle as Record<string, unknown>)
          : {};

      const repoContextError = validateRepoContext(repoUrl, branchName);
      if (repoContextError) return err(repoContextError);

      const approvalPolicy = getApprovalPolicy(adapterName, promptText);
      if (approvalPolicy.rejectionReason) {
        return err(approvalPolicy.rejectionReason);
      }

      let approvalRequired = approvalPolicy.approvalRequired;
      const incomingToken =
        typeof approval_token === "string" && approval_token.trim().length > 0
          ? approval_token.trim()
          : null;

      // Token-based approval path (Layer 2 HMAC).
      // Only active when APPROVAL_TOKEN_SECRET is configured; otherwise falls back to queued-job path.
      if (approvalRequired && isApprovalTokenConfigured()) {
        if (!incomingToken) {
          // First submit: generate token and return without creating a DB job.
          const hash = await commandHash(promptText);
          const payload = makeTokenPayload(userId, hash, adapterName);
          const token = await generateApprovalToken(payload);
          console.log(
            `[executor-api] approval_token issued for user=${userId} adapter=${adapterName}`,
          );
          return json({ pending_approval: true, approval_token: token });
        }

        // Re-submit with token: validate before creating job.
        const validation = await validateApprovalToken(incomingToken);
        if (!validation.valid) {
          console.warn(
            `[executor-api] token validation failed reason=${validation.reason} user=${userId} adapter=${adapterName}`,
          );
          return json({ error: validation.reason }, 403);
        }

        const expectedHash = await commandHash(promptText);
        if (
          validation.payload.command_hash !== expectedHash ||
          validation.payload.adapter !== adapterName ||
          validation.payload.user_id !== userId
        ) {
          console.warn(
            `[executor-api] token context mismatch user=${userId} adapter=${adapterName}`,
          );
          return json({ error: "mismatch" }, 403);
        }

        // Token valid — mark as approved and fall through to job creation.
        approvalRequired = false;
        console.log(
          `[executor-api] token-approved command user=${userId} adapter=${adapterName}`,
        );
      }

      const now = new Date().toISOString();
      const status = approvalRequired ? "queued" : "approved";

      // Check iteration_locks for path conflicts
      const loopAllowedPaths = normalizeStringArray(body.allowed_paths);
      if (loopAllowedPaths.length > 0 && body.repo_name) {
        const repoFullName = body.repo_name as string;
        const { data: lockConflicts } = await adminClient
          .from("iteration_locks")
          .select("path, loop_id, expires_at")
          .eq("user_id", userId)
          .eq("repo_full_name", repoFullName)
          .in("path", loopAllowedPaths)
          .gt("expires_at", new Date().toISOString());
        if (lockConflicts && lockConflicts.length > 0) {
          return err(`Build blocked: file ${lockConflicts[0].path} is locked by iteration loop ${lockConflicts[0].loop_id}`, 409);
        }
      }

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
          context_bundle: contextBundle,
        })
        .select()
        .single();

      if (submitErr) return err(submitErr.message, 500);

      return json({ job });
    }

    // ── APPROVE ───────────────────────────────────────────────
    // POST ?action=approve  body: { job_id }
    if (req.method === "POST" && action === "approve") {
      const bodyResult = await readJsonBody<{ job_id?: string }>(req, corsHeaders, {
        maxBytes: EXECUTOR_API_BODY_LIMITS.approve,
        label: "Executor approval body",
      });
      if (bodyResult instanceof Response) return bodyResult;
      const body = bodyResult;
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

    // ── KICK_JOB ──────────────────────────────────────────────
    // POST ?action=kick_job  body: { job_id }
    // User-initiated reset of a stuck queued/claimed/running job back to approved.
    if (req.method === "POST" && action === "kick_job") {
      const bodyResult = await readJsonBody<{ job_id?: string }>(req, corsHeaders, {
        maxBytes: EXECUTOR_API_BODY_LIMITS.approve,
        label: "Kick job body",
      });
      if (bodyResult instanceof Response) return bodyResult;
      const body = bodyResult;
      const { job_id } = body;
      if (!job_id) return err("job_id is required");

      const now = new Date().toISOString();
      const { data: job, error: kickErr } = await adminClient
        .from("executor_jobs")
        .update({
          status: "approved",
          executor_id: null,
          claimed_at: null,
          started_at: null,
          lease_expires_at: null,
          updated_at: now,
        })
        .eq("id", job_id)
        .eq("requested_by", userId)
        .in("status", ["queued", "claimed", "running"])
        .select("id, status")
        .maybeSingle();

      if (kickErr) return err(kickErr.message, 500);
      if (!job) return err("Job not found or not in a kickable state", 404);

      await adminClient.from("executor_job_events").insert({
        job_id,
        event_type: "status_change",
        payload: { status: "approved", reason: "user_kick", kicked_by: userId, kicked_at: now },
      });

      return json({ ok: true, job_id });
    }

    // ── REPORT_INCIDENT ───────────────────────────────────────
    // POST ?action=report_incident  body: { severity, category, title, message, metadata?, job_id?, executor_id? }
    // Authenticated by the executor token (same as all other executor actions).
    // Associates the incident with the executor's owner_user_id so it surfaces
    // in the correct user's SecurityPanel.
    if (req.method === "POST" && action === "report_incident") {
      const executor = await validateExecutorToken(req, adminClient, corsHeaders);
      if (executor instanceof Response) return executor;

      const bodyResult = await readJsonBody<Record<string, unknown>>(req, corsHeaders, {
        maxBytes: EXECUTOR_API_BODY_LIMITS.report_incident,
        label: "Incident report body",
      });
      if (bodyResult instanceof Response) return bodyResult;
      const body = bodyResult;

      const VALID_SEVERITIES = new Set(["low", "medium", "high", "critical"]);
      const VALID_CATEGORIES = new Set([
        "kernel_violation", "security_violation", "auth_violation",
        "scope_violation", "system_error", "manual",
      ]);

      const severity = typeof body.severity === "string" ? body.severity : "";
      const category = typeof body.category === "string" ? body.category : "";
      const title = typeof body.title === "string" ? body.title.slice(0, 200) : "";
      const message = typeof body.message === "string" ? body.message.slice(0, 4096) : "";

      if (!VALID_SEVERITIES.has(severity)) return err("Invalid severity");
      if (!VALID_CATEGORIES.has(category)) return err("Invalid category");
      if (!title) return err("title is required");
      if (!message) return err("message is required");

      const metadata = typeof body.metadata === "object" && body.metadata !== null
        ? body.metadata
        : {};
      const job_id = typeof body.job_id === "string" ? body.job_id : null;

      const { data: incident, error: insertErr } = await adminClient
        .from("executor_incidents")
        .insert({
          user_id: executor.owner_user_id,
          executor_id: executor.id,
          job_id,
          severity,
          category,
          title,
          message,
          metadata,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertErr) return err(insertErr.message, 500);

      console.log(`[executor-api] incident reported uid=${executor.owner_user_id} sev=${severity} cat=${category} title="${title}"`);
      return json({ incident });
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

  const tokenHashes = await candidateTokenHashes(rawToken);

  const { data: executor, error } = await supabase
    .from("executors")
    .select("*")
    .in("token_hash", tokenHashes)
    .maybeSingle();

  if (error) {
    return errorResponse(corsHeaders, error.message, 500);
  }

  if (!executor) {
    return errorResponse(corsHeaders, "Invalid executor token or executor not found", 401);
  }

  return executor as ExecutorRecord;
}
