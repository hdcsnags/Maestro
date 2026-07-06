// Pure types and functions for the Conductor's task dependency graph.
// Immutable updates — every mutation returns a new plan object.

export type TaskPriority = 'P0' | 'P1' | 'P2';
export type PlanEntryStatus = 'pending' | 'ready' | 'running' | 'done' | 'failed';

export interface PlanEntry {
  task_id: string;
  file_path: string;
  priority: TaskPriority;
  deps: string[];      // task_ids that must be 'done' before this entry is ready
  lane_name: string;
  status: PlanEntryStatus;
}

export interface ConductorPlan {
  id: string;
  entries: PlanEntry[];
  created_at: string;
}

export interface RawTask {
  task_id: string;
  file_path: string;
  deps?: string[];
  lane_name?: string;
  priority?: TaskPriority;
}

export function buildPlan(tasks: RawTask[], id?: string): ConductorPlan {
  const entryIds = new Set(tasks.map(t => t.task_id));
  const entries: PlanEntry[] = tasks.map(t => {
    const validDeps = (t.deps ?? []).filter(d => entryIds.has(d));
    return {
      task_id: t.task_id,
      file_path: t.file_path,
      priority: t.priority ?? 'P1',
      deps: validDeps,
      lane_name: t.lane_name ?? 'default',
      status: validDeps.length === 0 ? 'ready' : 'pending',
    };
  });

  return {
    id: id ?? crypto.randomUUID(),
    entries,
    created_at: new Date().toISOString(),
  };
}

export function getReadyEntries(plan: ConductorPlan): PlanEntry[] {
  const doneIds = new Set(
    plan.entries.filter(e => e.status === 'done').map(e => e.task_id),
  );
  return plan.entries.filter(e => {
    if (e.status !== 'pending' && e.status !== 'ready') return false;
    return e.deps.every(d => doneIds.has(d));
  });
}

function setStatus(plan: ConductorPlan, taskId: string, status: PlanEntryStatus): ConductorPlan {
  return {
    ...plan,
    entries: plan.entries.map(e => e.task_id === taskId ? { ...e, status } : e),
  };
}

export function markEntryRunning(plan: ConductorPlan, taskId: string): ConductorPlan {
  return setStatus(plan, taskId, 'running');
}

export function markEntryDone(plan: ConductorPlan, taskId: string): ConductorPlan {
  return setStatus(plan, taskId, 'done');
}

export function markEntryFailed(plan: ConductorPlan, taskId: string): ConductorPlan {
  return setStatus(plan, taskId, 'failed');
}
