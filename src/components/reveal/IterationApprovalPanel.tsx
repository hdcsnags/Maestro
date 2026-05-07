import { useState } from 'react';
import type { IterationStep, IterationLoop } from '../../types';

interface Props {
  step: IterationStep;
  loop: IterationLoop;
  onApprove: (enableAutoApply?: boolean) => void;
  onReject: () => void;
}

export function IterationApprovalPanel({ step, loop: _loop, onApprove, onReject }: Props) {
  const [showDiff, setShowDiff] = useState(false);

  const diffLineCount = step.proposed_diff
    ? step.proposed_diff.split('\n').length
    : 0;

  const fileCount = step.proposed_diff_files?.length ?? 0;

  return (
    <div className="mt-3 rounded-lg border border-gold/30 bg-void-2/80 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-gold text-xs font-mono uppercase tracking-wider">Step {step.step_number} — Awaiting Approval</span>
        <span className="reveal-chip text-xs">{fileCount} file{fileCount !== 1 ? 's' : ''} · {diffLineCount} lines</span>
      </div>

      {step.proposal_rationale && (
        <p className="text-sm text-white/70">{step.proposal_rationale}</p>
      )}

      <button
        className="text-xs text-white/50 hover:text-white/80 underline"
        onClick={() => setShowDiff(v => !v)}
      >
        {showDiff ? 'Hide diff' : 'View diff'}
      </button>

      {showDiff && step.proposed_diff && (
        <pre className="reveal-codeblock text-xs overflow-x-auto max-h-64 text-green-300/90 whitespace-pre">
          {step.proposed_diff}
        </pre>
      )}

      <div className="flex gap-2 pt-1">
        <button
          className="reveal-pill text-xs px-3 py-1"
          onClick={onReject}
        >
          Reject
        </button>
        <button
          className="reveal-pill primary text-xs px-3 py-1"
          onClick={() => onApprove(false)}
        >
          Approve
        </button>
        <button
          className="reveal-pill text-xs px-3 py-1 border-gold/40 text-gold/80"
          onClick={() => onApprove(true)}
        >
          Approve &amp; Auto-Apply Rest
        </button>
      </div>
    </div>
  );
}
