// Conductor logic for the web build-dispatch layer.
//
// Two independent pieces live here; read their contracts before "syncing" this
// file with the maestroclaw conductor — they are NOT both mirrors.
//
//   1. selectReadyTasks — dependency-ordered dispatch selection. This is an
//      EXTRACTION of the web hook's original inline ready-filter, NOT a mirror
//      of maestroclaw's plan.getReadyEntries. It deliberately diverges in two
//      ways the web layer needs:
//        - a dependency that is `failed` or `skipped` UNBLOCKS its dependents
//          (maestroclaw blocks forever on any non-`done` dep), so one dead task
//          cannot freeze the frontier; and
//        - an UNKNOWN dependency id (no matching task) is treated as resolved
//          rather than blocking forever (maestroclaw's buildPlan strips unknown
//          deps up front, reaching the same end state by a different route).
//      Keep these divergences deliberate and documented; do not remove them to
//      "match" maestroclaw.
//
//   2. reconcileManifest — deterministic pre-flight collision resolution. This
//      DOES mirror the RANKING of maestroclaw/src/conductor/reconcile.ts
//      (tiers: conductor_approved > priority > lane_name), and the two must stay
//      in sync on that ordering. Like maestroclaw's, it is ADVISORY only — the
//      authoritative enforcement is server-side in github-execute.
//
// C-06 rework (2026-07-03, task-001 7-review fix-list): the tie-break is now
// full lexicographic with a stable final key (`tie_break`) — was first code
// point only, which tied on any shared leading character and fell through to
// unstable input order. Unknown deps no longer deadlock. Duplicate task_ids
// keep first-occurrence (was last). Collisions are returned to the caller
// instead of only console.warn.

export type TaskPriority = 'P0' | 'P1' | 'P2';

// ── Dependency-ordered ready selection ───────────────────────────────────────

export type ReadyTaskStatus =
  | 'queued' | 'dispatched' | 'waiting' | 'completed'
  | 'failed' | 'rerouted' | 'skipped';

export interface ReadyTask {
  task_id: string;
  status: ReadyTaskStatus | string;
  dependencies?: string[] | null;
}

const TERMINAL_DEP_STATES = new Set<string>(['completed', 'failed', 'skipped']);

export function selectReadyTasks<T extends ReadyTask>(tasks: T[]): T[] {
  // First-occurrence wins on duplicate task_ids — matches the original inline
  // `find` semantics. A plain `new Map(tasks.map(...))` would keep the LAST row,
  // silently changing which row a dependency is judged against.
  const byId = new Map<string, T>();
  for (const t of tasks) {
    if (!byId.has(t.task_id)) byId.set(t.task_id, t);
  }
  return tasks.filter((t) => {
    if (t.status !== 'queued' && t.status !== 'rerouted') return false;
    const deps = t.dependencies ?? [];
    if (deps.length === 0) return true;
    return deps.every((depId) => {
      const dep = byId.get(depId);
      // Unknown dep id => treat as resolved (cannot block forever). A known dep
      // must have reached a terminal state.
      return !dep || TERMINAL_DEP_STATES.has(dep.status);
    });
  });
}

// ── Deterministic manifest reconcile (mirrors reconcile.ts ranking) ──────────

export interface ManifestCandidate {
  path: string;
  lane_name?: string;
  priority?: TaskPriority;
  conductor_approved?: boolean;
  // Stable final tie-break key (e.g. task_id). Guarantees a deterministic
  // winner even when approval, priority, AND lane_name are all equal — the
  // common same-lane retry/reroute collision. Without it the winner falls back
  // to input order, which rests on unstable DB row ordering.
  tie_break?: string;
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

const PRIORITY_RANK: Record<TaskPriority, number> = { P0: 0, P1: 1, P2: 2 };

// Total ordering over collision candidates; lower sorts first (wins the path).
// Tiers in order: conductor_approved, then priority, then lane_name (full
// lexicographic), then tie_break (stable final key). Every tier is a real
// comparison — no arithmetic band-packing that could overflow on non-ASCII
// lane names.
function compareCandidates(a: ManifestCandidate, b: ManifestCandidate): number {
  const approved = (a.conductor_approved ? 0 : 1) - (b.conductor_approved ? 0 : 1);
  if (approved !== 0) return approved;

  const priority = (PRIORITY_RANK[a.priority ?? 'P1'] ?? 1) - (PRIORITY_RANK[b.priority ?? 'P1'] ?? 1);
  if (priority !== 0) return priority;

  const lane = (a.lane_name ?? '').localeCompare(b.lane_name ?? '');
  if (lane !== 0) return lane;

  return (a.tie_break ?? '').localeCompare(b.tie_break ?? '');
}

// Resolve duplicate-path entries to a single deterministic winner per path,
// preserving input order for non-colliding entries. Returns the resolved
// manifest plus a report of every collision (winner + overridden) so the caller
// can surface dropped work rather than discarding it silently.
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
    const sorted = [...group].sort(compareCandidates);
    const [winner, ...overridden] = sorted;
    resolved.push(winner);
    collisions.push({ path: entry.path, winner, overridden });
  }

  return { resolved, collisions };
}
