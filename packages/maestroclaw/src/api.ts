import type { ClawConfig } from "./config.js";

export interface ExecutorJob {
  id: string;
  session_id: string | null;
  executor_id: string | null;
  requested_by: string;
  job_type: string;
  adapter: string;
  prompt: string;
  repo_url: string | null;
  repo_name: string | null;
  branch: string | null;
  allowed_paths: string[];
  timeout_seconds: number;
  approval_required: boolean;
  status: string;
  result_summary: string | null;
  error_text: string | null;
  artifact_manifest: unknown;
  build_task_id: string | null;
  context_bundle: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  claimed_at: string | null;
  lease_expires_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

export interface ExecutorCapabilities {
  adapters: string[];
  [key: string]: unknown;
}

async function api(
  config: ClawConfig,
  action: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>
): Promise<unknown> {
  const url = `${config.supabaseUrl}/functions/v1/executor-api?action=${action}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Executor-Token": config.executorToken,
  };

  const res = await fetch(url, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`API ${action} failed (${res.status}): ${data?.error ?? JSON.stringify(data)}`);
  }
  return data;
}

export async function heartbeat(
  config: ClawConfig,
  capabilities?: ExecutorCapabilities,
): Promise<void> {
  await api(
    config,
    "heartbeat",
    "POST",
    capabilities ? { capabilities } : undefined,
  );
}

export async function pollForJob(
  config: ClawConfig
): Promise<ExecutorJob | null> {
  const data = (await api(config, "poll", "GET")) as { job: ExecutorJob | null };
  return data.job;
}

export async function claimJob(
  config: ClawConfig,
  jobId: string
): Promise<ExecutorJob> {
  const data = (await api(config, "claim", "POST", {
    job_id: jobId,
  })) as { job: ExecutorJob };
  return data.job;
}

export async function reportEvent(
  config: ClawConfig,
  jobId: string,
  eventType: string,
  payload?: Record<string, unknown>
): Promise<void> {
  await api(config, "event", "POST", {
    job_id: jobId,
    event_type: eventType,
    payload: payload ?? {},
  });
}

export async function completeJob(
  config: ClawConfig,
  jobId: string,
  success: boolean,
  result?: {
    result_summary?: string;
    error_text?: string;
    artifact_manifest?: unknown;
  }
): Promise<void> {
  await api(config, "complete", "POST", {
    job_id: jobId,
    success,
    ...result,
  });
}

// ── PRO-02: Iteration Loop API ────────────────────────────────────────────────

export interface IterationLoopRecord {
  id: string;
  goal: string;
  scope_paths: string[];
  verification_command: string | null;
  verification_adapter: string;
  max_steps: number;
  total_timeout_seconds: number;
  auto_apply: boolean;
  status: string;
  step_count: number;
  current_step_id: string | null;
  session_id: string;
  thread_id: string | null;
  agent_id: string | null;
  executor_id: string | null;
  starting_commit_sha: string | null;
  created_at: string;
  started_at: string | null;
}

export interface IterationStepReport {
  step_number: number;
  state: string;
  files_read?: { path: string; sha256: string }[];
  proposed_diff?: string;
  proposed_diff_hash?: string;
  proposed_diff_files?: string[];
  proposal_rationale?: string;
  approval_required?: boolean;
  approved_at?: string;
  apply_succeeded?: boolean;
  apply_error?: string;
  pre_apply_commit_sha?: string;
  verification_started_at?: string;
  verification_completed_at?: string;
  verification_exit_code?: number;
  verification_stdout?: string;
  verification_stderr?: string;
  verification_succeeded?: boolean;
  terminal_reason?: string;
  rolled_back?: boolean;
  agent_query_to?: string;
  agent_query_reason?: string;
  agent_query_answered?: boolean;
}

export interface IterationControlRecord {
  id: string;
  loop_id: string;
  control_type: string;
  payload: Record<string, unknown>;
  step_id: string | null;
  applied_at: string | null;
  created_at: string;
}

export async function pollForLoop(config: ClawConfig): Promise<IterationLoopRecord | null> {
  const data = (await api(config, "poll_loop", "GET")) as { loop: IterationLoopRecord | null };
  return data.loop;
}

export async function claimLoop(config: ClawConfig, loopId: string): Promise<IterationLoopRecord> {
  const data = (await api(config, "claim_loop", "POST", { loop_id: loopId })) as { loop: IterationLoopRecord };
  return data.loop;
}

export async function reportStep(
  config: ClawConfig,
  loopId: string,
  report: IterationStepReport
): Promise<void> {
  await api(config, "report_step", "POST", { loop_id: loopId, ...report });
}

export async function completeLoop(
  config: ClawConfig,
  loopId: string,
  status: string,
  terminationReason?: string,
  endingCommitSha?: string
): Promise<void> {
  await api(config, "complete_loop", "POST", {
    loop_id: loopId,
    status,
    ...(terminationReason ? { termination_reason: terminationReason } : {}),
    ...(endingCommitSha ? { ending_commit_sha: endingCommitSha } : {}),
  });
}

export async function pollLoopControls(
  config: ClawConfig,
  loopId: string
): Promise<IterationControlRecord[]> {
  const data = (await api(config, `poll_loop_controls&loop_id=${loopId}`, "GET")) as { controls: IterationControlRecord[] };
  return data.controls;
}

export async function applyLoopControl(
  config: ClawConfig,
  controlId: string,
  loopId: string
): Promise<void> {
  await api(config, "apply_loop_control", "POST", { control_id: controlId, loop_id: loopId });
}

export async function acquireLocks(
  config: ClawConfig,
  loopId: string,
  paths: string[],
  repoFullName: string
): Promise<void> {
  await api(config, "acquire_locks", "POST", { loop_id: loopId, paths, repo_full_name: repoFullName });
}

export async function releaseLocks(config: ClawConfig, loopId: string): Promise<void> {
  await api(config, "release_locks", "POST", { loop_id: loopId });
}
