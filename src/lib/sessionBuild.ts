import { invokeEdgeFunction } from './functions';
import { supabase } from './supabase';
import type { Executor, ExecutorJob, RepoConnection, SessionBuildManifestEntry } from '../types';

export interface SessionDispatchOptions {
  executors: Executor[];
  sessionId?: string;
  repoConnection?: RepoConnection | null;
  refreshExecutors?: () => Promise<Executor[]>;
  adapter: string;
  prompt: string;
  scope?: string;
  allowedPaths?: string[];
  architectMd?: string;
  contextBundle?: Record<string, unknown>;
}

export interface SessionPollProgress {
  status: string;
  manifest: SessionBuildManifestEntry[];
  errorText: string | null;
}

export interface SessionPollResult {
  success: boolean;
  manifest: SessionBuildManifestEntry[];
  errorText: string | null;
}

const EXECUTOR_STALE_MS = 60_000;
const SESSION_POLL_MS = 5_000;
const SESSION_TIMEOUT_MS = 40 * 60 * 1_000;

export function executorSupportsAdapter(executor: Executor, adapter: string): boolean {
  const rawAdapters = executor.capabilities?.adapters;
  if (!Array.isArray(rawAdapters)) return false;
  return rawAdapters.some((value): value is string => typeof value === 'string' && value === adapter);
}

export function selectOnlineExecutor(executors: Executor[], adapter?: string): Executor | null {
  return executors.find((executor) => {
    if (executor.status !== 'online') return false;
    if (!executor.last_seen_at) return false;
    if (Date.now() - new Date(executor.last_seen_at).getTime() >= EXECUTOR_STALE_MS) return false;
    if (adapter && !executorSupportsAdapter(executor, adapter)) return false;
    return true;
  }) ?? null;
}

export async function submitBuildSessionJob({
  executors,
  sessionId,
  repoConnection,
  refreshExecutors,
  adapter,
  prompt,
  scope = '**',
  allowedPaths = ['**'],
  architectMd,
  contextBundle = {},
}: SessionDispatchOptions): Promise<string | null> {
  let matchingExecutor = selectOnlineExecutor(executors, adapter);
  if (!matchingExecutor && refreshExecutors) {
    const refreshed = await refreshExecutors();
    matchingExecutor = selectOnlineExecutor(refreshed, adapter);
  }
  if (!matchingExecutor) return null;

  const cloneUrl = repoConnection
    ? `https://github.com/${repoConnection.owner}/${repoConnection.repo}.git`
    : null;

  try {
    const result = await invokeEdgeFunction<{ job: ExecutorJob }>('executor-api?action=submit', {
      session_id: sessionId,
      job_type: 'build_session',
      adapter,
      prompt,
      repo_url: cloneUrl,
      repo_name: repoConnection?.repo ?? null,
      branch: repoConnection?.default_branch ?? null,
      allowed_paths: allowedPaths.length > 0 ? allowedPaths : ['**'],
      timeout_seconds: 1800,
      context_bundle: {
        scope,
        ...(architectMd ? { architect_content: architectMd } : {}),
        ...contextBundle,
      },
    });
    return result.job?.id ?? null;
  } catch {
    return null;
  }
}

export async function pollBuildSessionJob(
  jobId: string,
  options: {
    shouldAbort?: () => boolean;
    onProgress?: (progress: SessionPollProgress) => void;
  } = {},
): Promise<SessionPollResult> {
  const { shouldAbort, onProgress } = options;
  const start = Date.now();

  while (Date.now() - start < SESSION_TIMEOUT_MS) {
    if (shouldAbort?.()) return { success: false, manifest: [], errorText: 'Aborted' };

    const { data: jobRaw } = await supabase
      .from('executor_jobs')
      .select('status, artifact_manifest, error_text, result_summary')
      .eq('id', jobId)
      .single();

    const job = jobRaw as {
      status: string;
      artifact_manifest: Array<{ path: string; content: string; operation?: string }> | null;
      error_text: string | null;
      result_summary: string | null;
    } | null;

    if (!job) {
      return { success: false, manifest: [], errorText: 'Job not found' };
    }

    const manifest = (job.artifact_manifest ?? []).map((entry) => ({
      path: entry.path,
      content: entry.content,
      operation: entry.operation ?? 'create',
    }));
    onProgress?.({
      status: job.status,
      manifest,
      errorText: job.error_text ?? null,
    });

    if (job.status === 'succeeded') {
      return { success: true, manifest, errorText: null };
    }

    if (job.status === 'failed' || job.status === 'cancelled' || job.status === 'expired') {
      return { success: false, manifest: [], errorText: job.error_text ?? 'Session job failed' };
    }

    await new Promise((resolve) => setTimeout(resolve, SESSION_POLL_MS));
  }

  return { success: false, manifest: [], errorText: 'Session job timed out after 40 minutes' };
}

export async function cancelBuildSessionJob(jobId: string): Promise<void> {
  await supabase
    .from('executor_jobs')
    .update({ status: 'cancelled' } as never)
    .eq('id', jobId)
    .in('status', ['queued', 'claimed', 'approved', 'running']);
}

export function mergeSessionManifest(entries: SessionBuildManifestEntry[]): SessionBuildManifestEntry[] {
  const deduped = new Map<string, SessionBuildManifestEntry>();
  for (const entry of entries) {
    deduped.set(entry.path, entry);
  }
  return Array.from(deduped.values());
}
