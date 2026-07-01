// Conductor logic for the web build-dispatch layer.
//
// This is a faithful FRONTEND MIRROR of `packages/maestroclaw/src/conductor/`
// (`plan.ts` + `reconcile.ts`). The maestroclaw conductor is a Node package and
// cannot be imported into the Vite browser bundle (nor into the Deno edge
// functions), so the same deterministic plan + reconcile semantics live here.
// KEEP THIS IN SYNC with the maestroclaw module — same ranking, same rules.
//
// C-06: wires the Conductor into `useBuildExecution.ts` so dependency-ordered
// dispatch and deterministic collision reconcile are real in the web layer
// instead of inline/ad-hoc.

export type TaskPriority = 'P0' | 'P1' | 'P2';

// ── Dependency-ordered ready selection (mirror of plan.getReadyEntries) ──────

export interface ReadyTask {
  task_id: string;
  status: string;
  dependencies?: string[] | null;
}

// A task is ready to dispatch when it is queued/rerouted AND every dependency
// has reached a terminal state. `completed` unblocks normally; `failed`/`skipped`
// also unblock so a dead dependency can't stall the frontier forever.
export function selectReadyTasks<T extends ReadyTask>(tasks: T[]): T[] {
  const byId = new Map(tasks.map((t) => [t.task_id, t]));
  return tasks.filter((t) => {
    if (t.status !== 'queued' && t.status !== 'rerouted') return false;
    const deps = t.dependencies ?? [];
    if (deps.length === 0) return true;
    return deps.every((depId) => {
      const dep = byId.get(depId);
      return !!dep && (dep.status === 'completed' || dep.status === 'failed' || dep.status === 'skipped');
    });
  });
}

// ── Deterministic manifest reconcile (mirror of reconcile.ts — fixes P1-4) ───

export interface ManifestCandidate {
  path: string;
  lane_name?: string;
  priority?: TaskPriority;
  conductor_approved?: boolean;
}

export interface ManifestCollision<T extends ManifestCandidate> {
  path: string;
  winner: T;
  overridden: T[];
}

export interface ReconcileResult<T extends ManifestCandidate> {
  resolved: T[];
  collisions: ManifestCollision<T>[];
}

const PRIORITY_RANK: Record<TaskPriority, number> = { P0: 1, P1: 2, P2: 3 };

// Lower rank wins a path collision: conductor_approved first, then priority,
// then lane_name lexicographic as a deterministic, stable tie-break.
function rankCandidate(entry: ManifestCandidate): number {
  if (entry.conductor_approved) return 0;
  const pRank = PRIORITY_RANK[entry.priority ?? 'P1'] ?? 2;
  return pRank * 1000 + (entry.lane_name?.codePointAt(0) ?? 0);
}

// Resolve duplicate-path entries to a single deterministic winner per path,
// preserving input order for non-colliding entries. Returns the resolved
// manifest plus a report of every collision (winner + overridden) for logging.
export function reconcileManifest<T extends ManifestCandidate>(entries: T[]): ReconcileResult<T> {
  const byPath = new Map<string, T[]>();
  for (const entry of entries) {
    const group = byPath.get(entry.path) ?? [];
    group.push(entry);
    byPath.set(entry.path, group);
  }

  const resolved: T[] = [];
  const collisions: ManifestCollision<T>[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const group = byPath.get(entry.path);
    if (!group || group.length === 1) {
      resolved.push(entry);
      continue;
    }
    if (seen.has(entry.path)) continue;
    seen.add(entry.path);
    const sorted = [...group].sort((a, b) => rankCandidate(a) - rankCandidate(b));
    const [winner, ...overridden] = sorted;
    resolved.push(winner);
    collisions.push({ path: entry.path, winner, overridden });
  }

  return { resolved, collisions };
}
