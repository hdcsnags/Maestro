import { useEffect, useRef, useMemo } from 'react';
import InfoCard from './InfoCard';
import type { ThreadMessage } from '../../../types';
import { useMaestro } from '../../../context/MaestroContext';
import { useThreads } from '../../../hooks/useThreads';

const RUNNING_STATUSES = new Set(['queued', 'claimed', 'running']);
const KICKABLE_STATUSES = new Set(['queued', 'claimed', 'running']);
const STUCK_THRESHOLD_MS = 90_000;

export default function CommandResultCard({ message }: { message: ThreadMessage }) {
  const { state } = useMaestro();
  const { kickJob } = useThreads();
  const jobId = message.metadata.job_id as string | undefined;
  const job = jobId ? state.executorJobs.find(j => j.id === jobId) : undefined;
  const streamingLines = jobId ? (state.jobStreamingOutput[jobId] ?? []) : [];
  const isRunning = job ? RUNNING_STATUSES.has(job.status) : false;
  const threadId = state.activeThread?.id;
  const scrollRef = useRef<HTMLPreElement>(null);

  const isStuck = useMemo(() => {
    if (!job || !KICKABLE_STATUSES.has(job.status)) return false;
    const lastUpdate = job.updated_at ? new Date(job.updated_at).getTime() : 0;
    return Date.now() - lastUpdate > STUCK_THRESHOLD_MS;
  }, [job]);

  useEffect(() => {
    if (scrollRef.current && streamingLines.length > 0) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamingLines.length]);

  return (
    <div>
      <InfoCard message={message} />
      {streamingLines.length > 0 && (
        <div className="mx-1 mt-1 rounded-xl border border-white/[0.07] bg-void-2 overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-white/[0.06] bg-white/[0.02]">
            <span className="text-[10px] font-mono-dm uppercase tracking-widest text-white/40">
              {isRunning ? 'live output' : 'output'}
            </span>
            {isRunning && (
              <span className="inline-flex items-center gap-1 text-[10px] text-signal-ok/70">
                <span className="w-1.5 h-1.5 rounded-full bg-signal-ok/70 animate-pulse" />
                streaming
              </span>
            )}
          </div>
          <pre
            ref={scrollRef}
            className="px-3 py-2.5 text-xs text-white/65 font-mono leading-5 overflow-auto max-h-64 whitespace-pre-wrap break-all"
          >
            {streamingLines.join('\n')}
          </pre>
        </div>
      )}
      {isStuck && threadId && jobId && (
        <div className="mx-1 mt-1 flex items-center gap-2 px-4 py-2 rounded-xl border border-signal-warn/20 bg-signal-warn/5">
          <span className="text-xs text-signal-warn/80 flex-1">Job appears stuck — no activity for 90s.</span>
          <button
            onClick={() => kickJob(jobId, threadId)}
            className="text-xs px-3 py-1 rounded-lg border border-signal-warn/30 bg-signal-warn/10 text-signal-warn/90 hover:bg-signal-warn/20 transition-colors"
          >
            Kick
          </button>
        </div>
      )}
    </div>
  );
}
