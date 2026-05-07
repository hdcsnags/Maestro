import { useState } from 'react';
import type { IterationStep } from '../../types';

interface Props {
  step: IterationStep;
}

const STATE_ICONS: Record<string, string> = {
  pending: '⏳',
  reading_files: '📂',
  proposing_diff: '🤔',
  awaiting_approval: '⚠️',
  applying: '⚙️',
  verifying: '🧪',
  succeeded: '✅',
  failed: '❌',
  aborted: '⏹️',
  rolled_back: '↩️',
};

export function IterationStepRow({ step }: Props) {
  const [expanded, setExpanded] = useState(false);

  const isTerminal = ['succeeded', 'failed', 'aborted', 'rolled_back'].includes(step.state);
  const isFailed = ['failed', 'aborted', 'rolled_back'].includes(step.state);

  return (
    <div className={`border-l-2 pl-3 py-1.5 ${isFailed ? 'border-signal-warn/40' : step.state === 'succeeded' ? 'border-signal-ok/40' : 'border-white/10'}`}>
      <div className="flex items-center gap-2 cursor-pointer" onClick={() => isTerminal && setExpanded(v => !v)}>
        <span className="text-sm">{STATE_ICONS[step.state] ?? '•'}</span>
        <span className="text-xs font-mono text-white/60">Step {step.step_number}</span>
        {step.proposal_rationale && (
          <span className="text-xs text-white/70 truncate max-w-xs">{step.proposal_rationale}</span>
        )}
        <span className={`text-xs ml-auto ${isFailed ? 'text-signal-warn' : 'text-white/40'}`}>{step.state}</span>
        {isTerminal && (
          <span className="text-xs text-white/30">{expanded ? '▲' : '▼'}</span>
        )}
      </div>

      {expanded && (
        <div className="mt-2 space-y-1 text-xs text-white/50">
          {step.proposed_diff && (
            <pre className="reveal-codeblock max-h-32 overflow-y-auto whitespace-pre text-green-300/70">
              {step.proposed_diff.slice(0, 2000)}
              {step.proposed_diff.length > 2000 ? '\n[truncated...]' : ''}
            </pre>
          )}
          {step.verification_stderr && (
            <pre className="reveal-codeblock max-h-24 overflow-y-auto text-signal-warn/70 whitespace-pre-wrap">
              {step.verification_stderr.split('\n').slice(-20).join('\n')}
            </pre>
          )}
          {step.terminal_reason && (
            <p className="text-signal-warn/70">Reason: {step.terminal_reason}</p>
          )}
        </div>
      )}
    </div>
  );
}
