import type { MaestroState } from '../context/MaestroContext';
import type { Response } from '../types';

export type OrbState =
  | 'idle'
  | 'broadcasting'
  | 'streaming'
  | 'deliberating'
  | 'synthesizing'
  | 'conflict'
  | 'iterating'
  | 'building'
  | 'concierge'
  | 'error'
  | 'done';

const TERMINAL_LOOP_STATUSES = ['succeeded', 'failed', 'aborted', 'unrecoverable'] as const;

export function deriveOrbState(
  state: MaestroState,
  currentRoundResponses: Response[] = [],
  activeAgentCount: number = 0,
): OrbState {
  void activeAgentCount;

  const executionRuns = state.executionRuns || [];
  const latestExecutionRun = executionRuns.length > 0
    ? executionRuns[executionRuns.length - 1]
    : null;

  // Active iteration loop takes highest priority — it's a real-time operation
  if ((state.iterationLoops || []).some(
    l => !TERMINAL_LOOP_STATUSES.includes(l.status as typeof TERMINAL_LOOP_STATUSES[number])
  )) {
    return 'iterating';
  }

  if (state.isDeliberating === true) return 'deliberating';

  if (state.isSynthesizing === true) return 'synthesizing';

  if (latestExecutionRun && ['pending', 'approved', 'running'].includes(latestExecutionRun.status)) {
    return 'building';
  }

  // Claw local build sessions count as building
  if (state.clawBuildSession !== null || state.sessionBuildState.isRunning) {
    return 'building';
  }

  if (state.conciergeVisible === true) return 'concierge';

  if (
    (state.conciergeDecision?.tension_points?.length ?? 0) > 0
    && !state.isBroadcasting
    && !state.isSynthesizing
  ) {
    return 'conflict';
  }

  if (state.isBroadcasting === true && currentRoundResponses.length > 0) return 'streaming';

  if (state.isBroadcasting === true && currentRoundResponses.length === 0) return 'broadcasting';

  // Error: broadcast completed but every response came back empty
  if (!state.isBroadcasting && currentRoundResponses.length > 0
    && currentRoundResponses.every(r => !r.content?.trim())) {
    return 'error';
  }

  if (!state.isBroadcasting && !state.isSynthesizing && currentRoundResponses.length > 0) return 'done';

  return 'idle';
}

/**
 * Returns a richer status-line text than the static ORB_STATUS map.
 * Falls back to a static string for non-building states.
 */
export function deriveOrbStatusText(state: MaestroState, orbState: OrbState): string {
  if (orbState === 'building') {
    const runs = state.sessionBuildState.runs;
    if (runs.length > 0) {
      const running = runs.filter(r => r.status === 'running').length;
      const succeeded = runs.filter(r => r.status === 'succeeded').length;
      const total = runs.length;
      if (running > 0) {
        const totalFiles = runs.reduce((acc, r) => acc + r.filesWritten, 0);
        const fileHint = totalFiles > 0 ? ` · ${totalFiles} file${totalFiles === 1 ? '' : 's'}` : '';
        return `Building · ${running} agent${running === 1 ? '' : 's'} running${fileHint}`;
      }
      if (succeeded === total) {
        const totalFiles = runs.reduce((acc, r) => acc + r.filesWritten, 0);
        return `Build complete · ${totalFiles} file${totalFiles === 1 ? '' : 's'} written`;
      }
    }
    return 'Writing to repository';
  }

  if (orbState === 'iterating') {
    const activeLoops = (state.iterationLoops || []).filter(
      l => !TERMINAL_LOOP_STATUSES.includes(l.status as typeof TERMINAL_LOOP_STATUSES[number])
    );
    const totalSteps = activeLoops.reduce((acc, l) => acc + (l.step_count || 0), 0);
    return totalSteps > 0
      ? `Iterating · step ${totalSteps}`
      : 'Iterating…';
  }

  const staticMap: Record<OrbState, string> = {
    idle: 'Council standing by',
    broadcasting: 'Dispatching to council',
    streaming: 'Voices arriving',
    deliberating: 'Deliberating…',
    synthesizing: 'Synthesizing…',
    conflict: 'Tension detected',
    iterating: 'Iterating…',
    building: 'Writing to repository',
    concierge: 'Concierge engaged',
    error: 'Something went wrong',
    done: 'Round complete',
  };
  return staticMap[orbState];
}
