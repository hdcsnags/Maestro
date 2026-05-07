import type { MaestroState } from '../context/MaestroContext';
import type { Response } from '../types';

export type OrbState =
  | 'idle'
  | 'broadcasting'
  | 'streaming'
  | 'conflict'
  | 'building'
  | 'concierge'
  | 'done';

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

  if (state.conciergeVisible === true) return 'concierge';

  if (latestExecutionRun && ['pending', 'approved', 'running'].includes(latestExecutionRun.status)) {
    return 'building';
  }

  // Claw local build sessions count as building
  if (state.clawBuildSession !== null || state.sessionBuildState.isRunning) {
    return 'building';
  }

  if (
    (state.conciergeDecision?.tension_points?.length ?? 0) > 0
    && !state.isBroadcasting
    && !state.isSynthesizing
  ) {
    return 'conflict';
  }

  if (state.isBroadcasting === true && currentRoundResponses.length > 0) return 'streaming';

  if (state.isBroadcasting === true && currentRoundResponses.length === 0) return 'broadcasting';

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

  const staticMap: Record<OrbState, string> = {
    idle: 'Council standing by',
    broadcasting: 'Dispatching to council',
    streaming: 'Voices arriving',
    conflict: 'Tension detected',
    building: 'Writing to repository',
    concierge: 'Concierge engaged',
    done: 'Round complete',
  };
  return staticMap[orbState];
}
