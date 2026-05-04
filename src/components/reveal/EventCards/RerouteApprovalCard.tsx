import { useState } from 'react';
import { AlertTriangle, ArrowRight, SkipForward, Zap } from 'lucide-react';
import { resolveReroute } from '../../../lib/providerHealth';
import { formatUsd } from '../../../lib/cost';
import type { ThreadMessage } from '../../../types';

export default function RerouteApprovalCard({ message }: { message: ThreadMessage }) {
  const meta = message.metadata.reroute_approval;
  const [decided, setDecided] = useState(false);

  if (!meta) return null;

  const { build_task_id, file_path, from_model, to_model, cost_delta, failure_reason } = meta;
  const costLabel = cost_delta > 0 ? `+${formatUsd(cost_delta)}` : formatUsd(cost_delta);

  const handleDecision = (decision: 'approved' | 'emergency' | 'skip') => {
    if (decided) return;
    setDecided(true);
    resolveReroute(build_task_id, decision);
  };

  return (
    <div className="mx-1 my-0.5 rounded-xl border border-signal-warn/30 bg-signal-warn/10 px-4 py-3 text-ink-1">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle size={13} className="text-signal-warn/90 shrink-0" />
        <span className="font-mono-dm text-[10px] uppercase tracking-[0.14em] text-signal-warn/90">
          Reroute approval
        </span>
      </div>

      <div className="text-sm text-ink-1 mb-1 truncate" title={file_path}>
        {file_path}
      </div>
      <div className="flex items-center gap-2 text-xs text-ink-3 mb-2">
        <span className="text-signal-risk/80">{from_model}</span>
        <ArrowRight size={11} className="shrink-0" />
        <span className="text-signal-ok/80">{to_model}</span>
        {cost_delta > 0 && (
          <span className="ml-auto text-signal-warn/80">{costLabel} per file</span>
        )}
      </div>

      {failure_reason && (
        <code className="mb-3 block overflow-x-auto rounded-lg bg-void-2 px-3 py-1.5 text-[11px] text-ink-3">
          {failure_reason}
        </code>
      )}

      {decided ? (
        <div className="text-xs text-ink-3 italic">Decision recorded.</div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleDecision('approved')}
            className="flex items-center gap-1.5 rounded-lg bg-signal-ok/80 px-3 py-1.5 text-xs text-white transition-all hover:bg-signal-ok"
          >
            <ArrowRight size={12} />
            Approve reroute
          </button>
          <button
            onClick={() => handleDecision('emergency')}
            className="flex items-center gap-1.5 rounded-lg bg-gold/20 px-3 py-1.5 text-xs text-gold transition-all hover:bg-gold/30"
          >
            <Zap size={12} />
            Use emergency
          </button>
          <button
            onClick={() => handleDecision('skip')}
            className="flex items-center gap-1.5 rounded-lg bg-signal-risk/20 px-3 py-1.5 text-xs text-signal-risk transition-all hover:bg-signal-risk/30"
          >
            <SkipForward size={12} />
            Skip file
          </button>
        </div>
      )}
    </div>
  );
}
