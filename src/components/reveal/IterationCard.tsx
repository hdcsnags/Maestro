import { useState } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { useIterationLoop } from '../../hooks/useIterationLoop';
import { IterationStepRow } from './IterationStepRow';
import { IterationApprovalPanel } from './IterationApprovalPanel';
import type { IterationLoop } from '../../types';

interface Props {
  loop: IterationLoop;
}

const STATUS_COLORS: Partial<Record<IterationLoop['status'], string>> = {
  running: 'text-signal-ok',
  awaiting_approval: 'text-gold',
  paused: 'text-white/50',
  succeeded: 'text-signal-ok',
  failed: 'text-signal-warn',
  aborted: 'text-white/40',
  unrecoverable: 'text-signal-risk',
};

export function IterationCard({ loop }: Props) {
  const { state } = useMaestro();
  const { sendControl, getStepsForLoop } = useIterationLoop();
  const [confirmStop, setConfirmStop] = useState<'keep' | 'rollback' | null>(null);
  const steps = getStepsForLoop(loop.id);
  const isActive = ['running', 'awaiting_approval', 'paused'].includes(loop.status);

  const awaitingStep = steps.find(s => s.state === 'awaiting_approval');

  async function handleApprove(enableAutoApply?: boolean) {
    if (!awaitingStep) return;
    await sendControl(loop.id, 'approve_diff', enableAutoApply ? { enable_auto_apply: true } : {}, awaitingStep.id);
  }

  async function handleReject() {
    if (!awaitingStep) return;
    await sendControl(loop.id, 'reject_diff', {}, awaitingStep.id);
  }

  async function handleStop(rollback: boolean) {
    await sendControl(loop.id, 'abort', { rollback });
    setConfirmStop(null);
  }

  async function handlePause() {
    if (loop.status === 'paused') {
      await sendControl(loop.id, 'resume');
    } else {
      await sendControl(loop.id, 'pause');
    }
  }

  const statusColor = STATUS_COLORS[loop.status] ?? 'text-white/50';
  const currentStepNum = loop.step_count;
  const isRunningStep = steps.some(s => ['reading_files', 'proposing_diff', 'applying', 'verifying'].includes(s.state));

  void state; // accessed via useMaestro but loop data comes through hook

  return (
    <div className="reveal-card p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base">🔁</span>
          <span className="text-sm text-white/90 truncate">{loop.goal}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isActive && (
            <button
              className="reveal-pill text-xs px-2 py-0.5"
              onClick={() => { void handlePause(); }}
            >
              {loop.status === 'paused' ? 'Resume' : 'Pause'}
            </button>
          )}
        </div>
      </div>

      {/* Meta */}
      <div className="flex gap-3 text-xs text-white/40 flex-wrap">
        <span>Scope: {loop.scope_paths.join(', ')}</span>
        {loop.verification_command && <span>Verify: <code className="text-white/60">{loop.verification_command}</code></span>}
        <span className={statusColor}>
          {loop.status} · Step {currentStepNum}/{loop.max_steps}
          {isRunningStep && ' · running'}
        </span>
      </div>

      {/* Steps */}
      {steps.length > 0 && (
        <div className="space-y-1">
          <p className="section-label">Steps</p>
          {steps.map(step => (
            <IterationStepRow key={step.id} step={step} />
          ))}
        </div>
      )}

      {/* Approval Panel */}
      {awaitingStep && (
        <IterationApprovalPanel
          step={awaitingStep}
          loop={loop}
          onApprove={(enableAutoApply) => { void handleApprove(enableAutoApply); }}
          onReject={() => { void handleReject(); }}
        />
      )}

      {/* Terminal states */}
      {loop.status === 'succeeded' && (
        <div className="text-signal-ok text-sm font-medium">
          ✅ Loop succeeded in {loop.step_count} step{loop.step_count !== 1 ? 's' : ''}.
        </div>
      )}
      {loop.status === 'failed' && (
        <div className="text-signal-warn text-sm">
          🟡 Failed: {loop.termination_reason ?? 'unknown reason'}
        </div>
      )}
      {loop.status === 'unrecoverable' && (
        <div className="text-signal-risk text-sm">
          🔴 Unrecoverable: {loop.termination_reason}
        </div>
      )}
      {loop.status === 'aborted' && (
        <div className="text-white/40 text-sm">⏹ Aborted by user.</div>
      )}

      {/* Stop controls */}
      {isActive && !confirmStop && (
        <div className="flex gap-2 pt-1">
          <button className="reveal-pill text-xs px-3 py-1" onClick={() => setConfirmStop('keep')}>
            Stop &amp; Keep Changes
          </button>
          <button className="reveal-pill text-xs px-3 py-1 text-signal-warn/70 border-signal-warn/20" onClick={() => setConfirmStop('rollback')}>
            Stop &amp; Rollback
          </button>
        </div>
      )}

      {confirmStop && (
        <div className="flex gap-2 items-center">
          <span className="text-xs text-white/60">Confirm stop?</span>
          <button className="reveal-pill text-xs px-3 py-1 primary" onClick={() => { void handleStop(confirmStop === 'rollback'); }}>
            Yes, stop
          </button>
          <button className="reveal-pill text-xs px-3 py-1" onClick={() => setConfirmStop(null)}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
