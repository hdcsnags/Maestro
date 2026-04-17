import type { ClawConfig } from "./config.js";
import { getAccessToken } from "./auth.js";

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
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
}

async function api(
  config: ClawConfig,
  action: string,
  method: "GET" | "POST" = "GET",
  body?: Record<string, unknown>
): Promise<unknown> {
  const url = `${config.supabaseUrl}/functions/v1/executor-api?action=${action}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getAccessToken()}`,
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

export async function heartbeat(config: ClawConfig): Promise<void> {
  await api(config, "heartbeat", "POST");
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
