I'll read `TASK.md` first, then `FINDINGS.md` and the diff/context files it references.
# Task 004 — C-06 Rework Merge Gate Review

**Scope:** `rework.diff` (branch vs `main`), `FINDINGS.md`, `post-conductor.ts.txt`, `post-reconcile.ts.txt`  
**Method:** Finding-by-finding verification against diff evidence; regression hunt on comparator, `mapTaskPriority`, dedup, session collisions, migration, and tests.

---

## 1. Finding-by-finding verdict

### F1 — Starved ranking inputs — **resolved**

The priority pipeline is wired end-to-end; the priority tier in reconcile is no longer dead code.

| Layer | Evidence |
|-------|----------|
| Persistence | Migration adds nullable `priority int` on `build_tasks` (`rework.diff` L550–551). |
| Insert | Concierge persists `priority: t.priority` on task insert (`rework.diff` L529–531). |
| Type | `BuildTask.priority?: number \| null` added (`rework.diff` L515–517). |
| Mapping | `mapTaskPriority` buckets numeric decompose priority → `'P0'\|'P1'\|'P2'` (`rework.diff` L206–210). |
| Consumption | `collectManifest` passes `priority: mapTaskPriority(t.priority)`, `lane_name`, and `tie_break: t.task_id` into reconcile (`rework.diff` L312–314). |

`conductor_approved` is still omitted on the task-queue path, with an explicit comment that approval is uniform at patch level and not a differentiator (`rework.diff` L315–316). That is a justified design choice, not a regression of F1’s core defect (numeric priority never reaching reconcile).

---

### F2 — Silent discard — **partially resolved**

Collision data is captured and exposed to callers; it is not wired to any UI in this diff.

| What changed | Evidence |
|--------------|----------|
| Structured collision record | `SurfacedManifestCollision` interface (`rework.diff` L187–193). |
| Storage | `lastManifestCollisionsRef` (`rework.diff` L222). |
| Task-queue path | `collectManifest` maps `reconcileManifest` collisions into the ref with `dropped_detail` (`rework.diff` L322–328). |
| Public API | `getLastManifestCollisions: () => lastManifestCollisionsRef.current` exported from the hook (`rework.diff` L353–354). |
| Logging | Richer `console.warn` with winner/dropped detail (`rework.diff` L329–336). |

The comment says the approval/push UI *should* show these (`rework.diff` L352–353), but no UI component in the diff consumes `getLastManifestCollisions`. Overridden work is still invisible to end users unless something else reads the getter. Infrastructure is in place; the original “surfaced to UI/audit” requirement is only half met.

---

### F3 — Second push path unreconciled — **partially resolved**

Session path still uses last-write-wins (documented as unavoidable without lane/priority metadata), but collisions are detected and surfaced instead of silently dropped.

| What changed | Evidence |
|--------------|----------|
| Collision detection | `collectSessionManifest` counts duplicate paths in the flat manifest before merge (`rework.diff` L240–243). |
| Surfacing | Collisions written to `lastManifestCollisionsRef` with `source: 'session'`, `dropped_count`, and descriptive `winner_lane` / `dropped_detail` (`rework.diff` L244–252). |
| Logging | `console.warn` listing colliding paths (`rework.diff` L253–258). |
| Merge behavior | Still `mergeSessionManifest(flat)` — no priority reconcile (`rework.diff` L261–263). |

This matches the stated limitation in comments (`rework.diff` L230–235). Same F2 caveat: no UI consumer in the diff.

---

### F4 — False “faithful mirror” — **resolved**

Misleading mirror claim is replaced with explicit, accurate documentation; unknown-dep deadlock is fixed.

| Issue | Evidence |
|-------|----------|
| Oversold header | `conductor.ts` documents two *independent* pieces and lists deliberate divergences from maestroclaw (`rework.diff` L364–378; `post-conductor.ts.txt` L6–17). |
| `failed`/`skipped` unblock | `TERMINAL_DEP_STATES` includes `'completed'`, `'failed'`, `'skipped'`; deps must reach a terminal state (`rework.diff` L407, L425). |
| Unknown deps | `return !dep \|\| TERMINAL_DEP_STATES.has(dep.status)` — missing dep id does not block forever (`rework.diff` L422–425). |

`selectReadyTasks` is correctly framed as an extraction of the web hook’s inline filter, not a mirror of `plan.getReadyEntries`.

---

### F5 — Broken tie-break — **resolved**

Both maestroclaw and web comparators use tiered comparison with full `localeCompare` on lane names; arithmetic band-packing is removed.

**maestroclaw `reconcile.ts`:**

```diff
+const PRIORITY_RANK: Record<'P0' | 'P1' | 'P2', number> = { P0: 0, P1: 1, P2: 2 };
+function compareEntries(a, b, indexOf) {
+  // conductor_approved → priority → lane_name (full lexicographic) → input index
+  const lane = (a.lane_name ?? '').localeCompare(b.lane_name ?? '');
+  return (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0);
+}
```

(`rework.diff` L15–39, L47–49, L58–59)

**Web `conductor.ts`:** Same first three tiers; final tie-break is `tie_break` (`task_id`) via `localeCompare` (`rework.diff` L455–472).

**Tests** lock F5 behavior in maestroclaw:

- Full lexicographic lane tie-break (`rework.diff` L119–133)
- Non-ASCII lane does not invert priority (`rework.diff` L137–145)
- Stable input-index tie-break for identical rank (`rework.diff` L149–154)
- Empty `lane_name` handled without `codePointAt(0)!` crash (`rework.diff` L158–167)

---

### F6 — Dup `task_id` semantics flip — **resolved**

First-occurrence wins, matching original inline `find` semantics:

```diff
+  const byId = new Map<string, T>();
+  for (const t of tasks) {
+    if (!byId.has(t.task_id)) byId.set(t.task_id, t);
+  }
```

(`rework.diff` L410–416`)

Comment explicitly warns that `new Map(tasks.map(...))` would keep the last row (`rework.diff` L410–412).

---

### F7 — API drift / no tests — **partially resolved**

Progress is real but asymmetric.

| Resolved | Gap |
|----------|-----|
| `KEEP IN SYNC` comments in both comparators (`rework.diff` L24, L382–383) | No tests for `src/lib/conductor.ts` `compareCandidates` / `reconcileManifest` |
| New `packages/maestroclaw/test/reconcile.test.ts` with 7 ranking tests (`rework.diff` L63–167) | No tests for `selectReadyTasks` (dedup, unknown-dep, failed-unblock) |
| Honest API contracts in file headers | No cross-file test asserting web ↔ maestroclaw tier parity |

Maestroclaw ranking is guarded; the web mirror and ready-selection extraction are not.

---

## 2. Regression hunt

### Comparator (`compareCandidates` / `compareEntries`)

**No functional regression found.** Tier order is consistent: `conductor_approved` → `priority` → `lane_name` (full lexicographic) → stable final key. Final tie-break intentionally differs (web: `tie_break` string; maestroclaw: input index) — appropriate given web entries carry `task_id` and maestroclaw entries do not.

**Low severity — sync drift risk:** Without web-side tests, future edits to `compareCandidates` could diverge from maestroclaw undetected. Mitigated by comments, not by CI.

### `mapTaskPriority` bucketing

```typescript
if (priority <= 1) return 'P0';
if (priority <= 3) return 'P1';
return 'P2';
```

(`rework.diff` L206–210)

**No bug found** given documented semantics (“lower = build first”). Boundaries are coherent: `0–1 → P0`, `2–3 → P1`, `4+ → P2`. `null`/`undefined` correctly yields `undefined`, and the comparator defaults missing priority to `'P1'` rank (`rework.diff` L466), so pre-migration rows fall through to lane/`task_id` tie-break as intended.

### First-occurrence dedup (`selectReadyTasks`)

**No regression.** Behavior matches original inline filter for known deps (terminal states unblock; in-flight deps block). Unknown-dep handling is an intentional, documented change (F4), not an accidental regression.

### Session-path collision detection

**No bug found.** Duplicate paths are counted on the pre-merge flat manifest (`rework.diff` L240–243); `mergeSessionManifest` still applies last-write-wins (`rework.diff` L261–263). Detection and merge are consistent.

**Low severity — stale collision ref:** `collectManifest` and `collectSessionManifest` share `lastManifestCollisionsRef`; whichever runs last overwrites the other. Acceptable if the UI reads collisions immediately after the relevant collect, but worth documenting for integrators.

### Migration

```sql
alter table build_tasks add column if not exists priority int;
```

(`rework.diff` L550–551)

**No defect.** Idempotent, nullable, commented. No bogus default that would mis-rank legacy rows.

### Tests

Maestroclaw reconcile tests are thorough for F5. **Gap (not a runtime bug):** no web conductor tests; ranking contract enforcement is one-sided.

### New defects summary

| Severity | Issue |
|----------|-------|
| **None (blocker)** | — |
| **Low** | Web `conductor.ts` untested — sync drift risk over time |
| **Low** | `getLastManifestCollisions` exposed but no UI consumer in diff — collisions still user-invisible |
| **Low** | Shared collision ref overwritten across task-queue vs session collect |

---

## 3. Verdict

### **`merge after nits`**

**Rationale:** The rework credibly closes the substantive correctness findings (F1, F4, F5, F6) with clear diff evidence. F5 is backed by targeted maestroclaw tests. F2 and F3 deliver the collision-reporting plumbing and improved logging, but stop short of UI integration — the original “silent discard” class of bug is fixed at the data layer, not the presentation layer. F7 is half-closed: maestroclaw is tested; the web mirror and `selectReadyTasks` are not.

No new blocking defects were found in the comparator, bucketing, dedup, session collision detection, or migration. Remaining work is follow-up nits, not another rework cycle:

1. Wire `getLastManifestCollisions` into the approval/push UI so F2/F3 are fully closed for users.
2. Add `src/lib/conductor.ts` tests (ranking tiers + `selectReadyTasks` dedup/dep edge cases) to lock the KEEP-IN-SYNC contract on both sides.
3. Optionally document collision-ref overwrite behavior when both collect paths are used in one session.
