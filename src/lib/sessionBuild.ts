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

interface ArtifactFileChunkBuffer {
  operation: string;
  total: number;
  parts: string[];
}

export interface ArtifactManifestBuffer {
  entries: Map<string, SessionBuildManifestEntry>;
  fileChunks: Map<string, ArtifactFileChunkBuffer>;
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

  // NOTE: errors here propagate to the caller. Earlier versions of this
  // function had a bare `catch { return null; }` that silently swallowed
  // real errors (DB constraint violations, 500s from executor-api) and
  // surfaced them as the misleading "No online executor advertises adapter"
  // message — which lied because we already proved an executor exists by
  // selecting one above. The caller now wraps this in a try/catch and shows
  // the actual error.
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
}

export function normalizeSessionManifest(raw: unknown): SessionBuildManifestEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is { path: string; content: string; operation?: string } =>
      typeof entry === 'object'
      && entry !== null
      && typeof (entry as { path?: unknown }).path === 'string'
      && typeof (entry as { content?: unknown }).content === 'string',
    )
    .map((entry) => ({
      path: entry.path,
      content: entry.content,
      operation: entry.operation === 'delete' ? 'delete' : 'create',
    }));
}

export function createArtifactManifestBuffer(): ArtifactManifestBuffer {
  return {
    entries: new Map<string, SessionBuildManifestEntry>(),
    fileChunks: new Map<string, ArtifactFileChunkBuffer>(),
  };
}

function upsertManifestEntries(
  buffer: ArtifactManifestBuffer,
  entries: SessionBuildManifestEntry[],
): SessionBuildManifestEntry[] {
  for (const entry of entries) {
    buffer.entries.set(entry.path, entry);
  }
  return Array.from(buffer.entries.values());
}

export function seedArtifactManifestBuffer(
  buffer: ArtifactManifestBuffer,
  entries: SessionBuildManifestEntry[],
): SessionBuildManifestEntry[] {
  return upsertManifestEntries(buffer, entries);
}

export function getArtifactManifestFromBuffer(
  buffer: ArtifactManifestBuffer,
): SessionBuildManifestEntry[] {
  return Array.from(buffer.entries.values());
}

export function applyArtifactPayloadToBuffer(
  buffer: ArtifactManifestBuffer,
  payload: Record<string, unknown> | null | undefined,
): SessionBuildManifestEntry[] {
  if (!payload) return getArtifactManifestFromBuffer(buffer);

  const legacyManifest = normalizeSessionManifest(payload.manifest);
  if (legacyManifest.length > 0) {
    return upsertManifestEntries(buffer, legacyManifest);
  }

  const format = typeof payload.format === 'string' ? payload.format : '';
  if (format === 'artifact_manifest_chunk') {
    const entries = normalizeSessionManifest(payload.entries);
    if (entries.length > 0) {
      return upsertManifestEntries(buffer, entries);
    }
    return getArtifactManifestFromBuffer(buffer);
  }

  if (format === 'artifact_file_chunk') {
    const path = typeof payload.path === 'string' ? payload.path : '';
    const operation = payload.operation === 'delete' ? 'delete' : 'create';
    const chunkIndex = typeof payload.chunk_index === 'number' ? payload.chunk_index : -1;
    const chunkTotal = typeof payload.chunk_total === 'number' ? payload.chunk_total : -1;
    const contentChunk = typeof payload.content_chunk === 'string' ? payload.content_chunk : '';

    if (!path || chunkIndex < 0 || chunkTotal <= 0 || chunkIndex >= chunkTotal) {
      return getArtifactManifestFromBuffer(buffer);
    }

    const existing = buffer.fileChunks.get(path) ?? {
      operation,
      total: chunkTotal,
      parts: Array<string>(chunkTotal).fill(''),
    };

    if (existing.total !== chunkTotal) {
      existing.total = chunkTotal;
      existing.parts = Array<string>(chunkTotal).fill('');
    }

    existing.operation = operation;
    existing.parts[chunkIndex] = contentChunk;
    buffer.fileChunks.set(path, existing);

    if (existing.parts.every((part) => typeof part === 'string' && part.length >= 0)) {
      const isComplete = existing.parts.filter((part) => part !== '').length === existing.total
        || (existing.total === 1 && existing.parts[0] === '');
      if (isComplete) {
        buffer.fileChunks.delete(path);
        return upsertManifestEntries(buffer, [{
          path,
          content: existing.parts.join(''),
          operation: existing.operation,
        }]);
      }
    }
  }

  return getArtifactManifestFromBuffer(buffer);
}

export async function fetchExecutorJobArtifactManifest(jobId: string): Promise<SessionBuildManifestEntry[]> {
  const { data } = await supabase
    .from('executor_job_events')
    .select('payload, created_at')
    .eq('job_id', jobId)
    .eq('event_type', 'artifact')
    .order('created_at', { ascending: true });

  const buffer = createArtifactManifestBuffer();
  const rows = (data ?? []) as Array<{ payload?: unknown }>;
  for (const row of rows) {
    applyArtifactPayloadToBuffer(
      buffer,
      typeof row.payload === 'object' && row.payload !== null
        ? row.payload as Record<string, unknown>
        : null,
    );
  }
  return getArtifactManifestFromBuffer(buffer);
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

    let manifest = normalizeSessionManifest(job.artifact_manifest);
    if (manifest.length === 0 && (job.status === 'succeeded' || job.status === 'failed' || job.status === 'cancelled' || job.status === 'expired')) {
      manifest = await fetchExecutorJobArtifactManifest(jobId);
    }
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
