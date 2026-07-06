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

// Lower number = higher priority (wins collision).
function rankEntry(entry: ManifestEntry): number {
  if (entry.conductor_approved) return 0;
  const pRank = { P0: 1, P1: 2, P2: 3 }[entry.priority ?? 'P1'] ?? 2;
  // Tie-break deterministically by lane_name lexicographic order.
  return pRank * 1000 + entry.lane_name.codePointAt(0)!;
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

  const collisionReports: CollisionReport[] = [];
  const resolvedPaths = new Set<string>();
  const resolved: ManifestEntry[] = [];

  for (const entry of entries) {
    const group = conflicts.get(entry.path);
    if (!group) {
      resolved.push(entry);
    } else if (!resolvedPaths.has(entry.path)) {
      const sorted = [...group].sort((a, b) => rankEntry(a) - rankEntry(b));
      const winner = sorted[0];
      const overridden = sorted.slice(1);
      collisionReports.push({ path: entry.path, candidates: group, winner, overridden });
      resolved.push(winner);
      resolvedPaths.add(entry.path);
    }
  }

  return { resolved, collisions: collisionReports };
}
