import { useEffect, useRef } from 'react';
import InfoCard from './InfoCard';
import type { ThreadMessage } from '../../../types';
import { useMaestro } from '../../../context/MaestroContext';

const RUNNING_STATUSES = new Set(['queued', 'claimed', 'running']);

export default function CommandResultCard({ message }: { message: ThreadMessage }) {
  const { state } = useMaestro();
  const jobId = message.metadata.job_id as string | undefined;
  const job = jobId ? state.executorJobs.find(j => j.id === jobId) : undefined;
  const streamingLines = jobId ? (state.jobStreamingOutput[jobId] ?? []) : [];
  const isRunning = job ? RUNNING_STATUSES.has(job.status) : false;
  const scrollRef = useRef<HTMLPreElement>(null);

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
    </div>
  );
}
