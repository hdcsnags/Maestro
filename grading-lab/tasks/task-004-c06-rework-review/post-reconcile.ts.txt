// Pre-flight manifest collision detection and deterministic resolution.
// This is advisory — the authoritative enforcement happens in github-execute.
// Call reconcileManifests() before submitting to github-execute for a pre-flight
// view of which entries will win in case of path conflicts.

export interface ManifestEntry {
  path: string;
  content?: string;
  operation: 'create' | 'update' | 'delete';
  lane_name: string;
  conductor_approved?: boolean;
  priority?: 'P0' | 'P1' | 'P2';
}

export interface CollisionReport {
  path: string;
  candidates: ManifestEntry[];
  winner: ManifestEntry;
  overridden: ManifestEntry[];
}

export interface ReconcileResult {
  resolved: ManifestEntry[];
  collisions: CollisionReport[];
}

const PRIORITY_RANK: Record<'P0' | 'P1' | 'P2', number> = { P0: 0, P1: 1, P2: 2 };

// Total ordering over collision candidates; lower sorts first (wins the path).
// Tiers in order: conductor_approved, then priority, then lane_name (full
// lexicographic — NOT first-code-point, which tied on any shared leading char
// and could overflow a numeric band on non-ASCII names), then the entry's
// original input index as a stable final tie-break so same-lane retries resolve
// deterministically instead of by unspecified sort order.
//
// KEEP THIS RANKING IN SYNC with src/lib/conductor.ts (compareCandidates).
function compareEntries(
  a: ManifestEntry,
  b: ManifestEntry,
  indexOf: Map<ManifestEntry, number>,
): number {
  const approved = (a.conductor_approved ? 0 : 1) - (b.conductor_approved ? 0 : 1);
  if (approved !== 0) return approved;

  const priority = (PRIORITY_RANK[a.priority ?? 'P1'] ?? 1) - (PRIORITY_RANK[b.priority ?? 'P1'] ?? 1);
  if (priority !== 0) return priority;

  const lane = (a.lane_name ?? '').localeCompare(b.lane_name ?? '');
  if (lane !== 0) return lane;

  return (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0);
}

export function detectManifestConflicts(
  entries: ManifestEntry[],
): Map<string, ManifestEntry[]> {
  const byPath = new Map<string, ManifestEntry[]>();
  for (const entry of entries) {
    const group = byPath.get(entry.path) ?? [];
    group.push(entry);
    byPath.set(entry.path, group);
  }
  const conflicts = new Map<string, ManifestEntry[]>();
  for (const [path, group] of byPath) {
    if (group.length > 1) conflicts.set(path, group);
  }
  return conflicts;
}

export function reconcileManifests(entries: ManifestEntry[]): ReconcileResult {
  const conflicts = detectManifestConflicts(entries);
  if (conflicts.size === 0) {
    return { resolved: [...entries], collisions: [] };
  }

  // Original input position of each entry — the stable final tie-break.
  const indexOf = new Map<ManifestEntry, number>();
  entries.forEach((entry, i) => indexOf.set(entry, i));

  const collisionReports: CollisionReport[] = [];
  const resolvedPaths = new Set<string>();
  const resolved: ManifestEntry[] = [];

  for (const entry of entries) {
    const group = conflicts.get(entry.path);
    if (!group) {
      resolved.push(entry);
    } else if (!resolvedPaths.has(entry.path)) {
      const sorted = [...group].sort((a, b) => compareEntries(a, b, indexOf));
      const winner = sorted[0];
      const overridden = sorted.slice(1);
      collisionReports.push({ path: entry.path, candidates: group, winner, overridden });
      resolved.push(winner);
      resolvedPaths.add(entry.path);
    }
  }

  return { resolved, collisions: collisionReports };
}
