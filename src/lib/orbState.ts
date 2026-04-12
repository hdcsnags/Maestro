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
  currentRoundResponses: Response[],
  activeAgentCount: number,
): OrbState {
  void activeAgentCount;

  const latestExecutionRun = state.executionRuns.length > 0
    ? state.executionRuns[state.executionRuns.length - 1]
    : null;

  if (state.conciergeVisible === true) return 'concierge';

  if (latestExecutionRun && ['pending', 'approved', 'running'].includes(latestExecutionRun.status)) {
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
