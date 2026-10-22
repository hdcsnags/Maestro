// Submit a one-shot MaestroClaw job (`concierge_turn` / `council_seat`) and follow it to a
// terminal state: stdout/stderr lines arrive through `executor_job_events` realtime
// INSERTs, completion through `executor_jobs` realtime UPDATEs, with a 3 s status poll as
// the fallback when realtime is slow or dropped. Shared by the concierge (useThreads),
// the council (useOrchestration.broadcast) and synthesis.

import { invokeEdgeFunction } from './functions';
import { supabase } from './supabase';
import { extractEventLines } from './clawConversation';
import type { ExecutorJob } from '../types';

export const TERMINAL_JOB_STATUSES: ReadonlySet<ExecutorJob['status']> = new Set([
  'succeeded', 'failed', 'cancelled', 'expired',
]);

export function isTerminalJobStatus(status: string | null | undefined): status is ExecutorJob['status'] {
  return typeof status === 'string' && TERMINAL_JOB_STATUSES.has(status as ExecutorJob['status']);
}

export interface SubmitClawJobInput {
  prompt: string;
  adapter: string;
  jobType: 'concierge_turn' | 'council_seat';
  contextBundle: Record<string, unknown>;
  timeoutSeconds?: number;
  sessionId?: string | null;
}

export async function submitClawJob(input: SubmitClawJobInput): Promise<ExecutorJob> {
  const result = await invokeEdgeFunction<{ job?: ExecutorJob }>('executor-api?action=submit', {
    prompt: input.prompt,
    adapter: input.adapter,
    job_type: input.jobType,
    timeout_seconds: input.timeoutSeconds ?? 900,
    allowed_paths: ['**'],
    context_bundle: input.contextBundle,
    ...(input.sessionId ? { session_id: input.sessionId } : {}),
  });
  if (!result?.job?.id) {
    throw new Error('executor-api did not return a job for the local turn.');
  }
  return result.job;
}

export interface WatchClawJobOptions {
  onLines?: (lines: string[], stream: 'stdout' | 'stderr') => void;
  onStatus?: (job: ExecutorJob) => void;
  pollIntervalMs?: number;
  // Hard stop in case the job never reaches a terminal state (worker died mid-run and
  // nothing expired it). Defaults to timeout_seconds + 2 minutes.
  maxWaitMs?: number;
}

/** Terminal-state manifest shape written by the worker for seat/turn jobs. */
export interface ClawSeatManifest {
  kind?: string;
  content?: string;
  verdict_status?: string;
  verdict?: unknown;
  model?: string | null;
  adapter?: string;
}

export function readSeatManifest(job: Pick<ExecutorJob, 'artifact_manifest'>): ClawSeatManifest | null {
  const manifest = job.artifact_manifest;
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) return null;
  return manifest as ClawSeatManifest;
}

/** The full text of a finished seat/turn job (manifest first, summary as fallback). */
export function readJobText(job: ExecutorJob): string {
  const manifest = readSeatManifest(job);
  if (manifest && typeof manifest.content === 'string' && manifest.content.length > 0) return manifest.content;
  return job.result_summary ?? '';
}

export function describeJobFailure(job: ExecutorJob): string {
  if (job.error_text && job.error_text.trim()) return job.error_text.trim();
  if (job.status === 'expired') return 'The local job expired before the worker finished it.';
  if (job.status === 'cancelled') return 'The local job was cancelled.';
  return 'The local worker reported a failure without details.';
}

/**
 * Follow a submitted job until it is terminal. Resolves with the final row. Lines seen
 * before the subscription attached are backfilled once, in order; the caller must
 * tolerate a line being delivered twice (dedupe is by event seq when present).
 */
export function watchClawJob(job: ExecutorJob, options: WatchClawJobOptions = {}): Promise<ExecutorJob> {
  const jobId = job.id;
  const pollIntervalMs = options.pollIntervalMs ?? 3_000;
  const maxWaitMs = options.maxWaitMs ?? (job.timeout_seconds + 120) * 1_000;
  const seenSeq = new Set<number>();
  let eventTail = 0;

  return new Promise<ExecutorJob>((resolve, reject) => {
    let settled = false;
    let pollTimer: number | null = null;
    let deadlineTimer: number | null = null;

    const channel = supabase.channel(`claw-job-${jobId}`);

    const finish = (final: ExecutorJob | null, error?: Error) => {
      if (settled) return;
      settled = true;
      if (pollTimer !== null) window.clearTimeout(pollTimer);
      if (deadlineTimer !== null) window.clearTimeout(deadlineTimer);
      void supabase.removeChannel(channel);
      if (error) reject(error);
      else if (final) resolve(final);
      else reject(new Error('Local job watch ended without a result.'));
    };

    const deliverLines = (payload: unknown, stream: 'stdout' | 'stderr') => {
      if (!options.onLines) return;
      const body = (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>;
      const seq = typeof body.seq === 'number' ? body.seq : null;
      if (seq !== null) {
        if (seenSeq.has(seq)) return;
        seenSeq.add(seq);
      }
      const lines = extractEventLines(payload);
      if (lines.length > 0) options.onLines(lines, stream);
    };

    const handleSnapshot = (next: ExecutorJob) => {
      options.onStatus?.(next);
      if (isTerminalJobStatus(next.status)) finish(next);
    };

    const fetchStatus = async (): Promise<ExecutorJob | null> => {
      const { data } = await supabase
        .from('executor_jobs')
        .select('*')
        .eq('id', jobId)
        .maybeSingle();
      return (data as ExecutorJob | null) ?? null;
    };

    const backfillEvents = async () => {
      const { data } = await supabase
        .from('executor_job_events')
        .select('event_type, payload, created_at')
        .eq('job_id', jobId)
        .in('event_type', ['stdout', 'stderr'])
        .order('created_at', { ascending: true })
        .range(eventTail, eventTail + 499);
      const rows = (data ?? []) as Array<{ event_type: string; payload: unknown }>;
      for (const row of rows) {
        deliverLines(row.payload, row.event_type === 'stderr' ? 'stderr' : 'stdout');
      }
      eventTail += rows.length;
    };

    const poll = async () => {
      if (settled) return;
      try {
        const snapshot = await fetchStatus();
        if (snapshot) handleSnapshot(snapshot);
      } catch {
        // transient; the next tick retries
      }
      if (!settled) pollTimer = window.setTimeout(() => void poll(), pollIntervalMs);
    };

    channel
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'executor_job_events', filter: `job_id=eq.${jobId}` },
        (payload) => {
          const rec = payload.new as { event_type?: string; payload?: unknown };
          if (rec.event_type === 'stdout' || rec.event_type === 'stderr') {
            deliverLines(rec.payload, rec.event_type);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'executor_jobs', filter: `id=eq.${jobId}` },
        (payload) => {
          const next = payload.new as Partial<ExecutorJob> | null;
          if (!next?.id || typeof next.status !== 'string') return;
          // Realtime rows can omit large jsonb columns; re-read on terminal so the
          // manifest (full content) is present.
          if (isTerminalJobStatus(next.status)) {
            void fetchStatus().then((row) => handleSnapshot(row ?? ({ ...job, ...next } as ExecutorJob)));
          } else {
            options.onStatus?.({ ...job, ...next } as ExecutorJob);
          }
        },
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          // subscribe-then-backfill so nothing between submit and SUBSCRIBED is lost
          void backfillEvents();
        }
      });

    // Lines emitted before SUBSCRIBED resolve are covered by the backfill above; a second
    // backfill on the first poll catches rows a flaky channel never delivers.
    void backfillEvents();
    pollTimer = window.setTimeout(() => void poll(), pollIntervalMs);
    deadlineTimer = window.setTimeout(() => {
      void fetchStatus().then((row) => {
        if (row && isTerminalJobStatus(row.status)) finish(row);
        else finish(null, new Error('Timed out waiting for the local worker to finish this job.'));
      });
    }, maxWaitMs);
  });
}
