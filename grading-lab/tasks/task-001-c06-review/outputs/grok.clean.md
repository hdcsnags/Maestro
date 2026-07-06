# Code Review: C-06 Conductor Web-Dispatch (`22a04a1`)

**Scope:** `src/lib/conductor.ts` (new), `useBuildExecution.ts` wiring, `MAESTRO_STATE.md` session note  
**Claimed goals:** Faithful frontend mirror of maestroclaw conductor; dependency-ready dispatch; deterministic P1-4 manifest collision fix

---

## 1. Findings

### 1. Major — `useBuildExecution.ts` ~1557–1564 (`collectManifest`)

`collectManifest` builds reconcile candidates with only `lane_name` (from `lane_owner`). It does **not** pass `priority` or `conductor_approved`, even though `ManifestCandidate` and `rankCandidate` are built around those fields.

**Consequence:** For path collisions, every candidate gets the default rank (`priority ?? 'P1'`, no approval). Resolution collapses to a first-code-point tie-break on `lane_owner`, not the intended conductor ranking. Parallel lanes that touch the same file will pick a winner by builder-ID prefix (or array order on ties), not by task priority. P1-4 stops being “last-write-wins,” but winner selection does not follow the semantics the mirror documents.

### 2. Major — `src/lib/conductor.ts` ~61–66 (`rankCandidate`)

Comments in both the frontend mirror and maestroclaw say tie-break is **lexicographic** on `lane_name`, but the implementation uses only `lane_name.codePointAt(0)` (first Unicode code point).

**Consequence:** Lanes whose IDs share a first character (common with UUIDs, `claude-*`, `gpt-*`, etc.) get identical rank scores. With ES stable sort, the winner is then whoever appears first in `tasksRef.current` order — correlated with task ordering/completion, not lane identity. Resolution is deterministic for a given snapshot, but not by the documented rule and highly collision-prone in practice.

### 3. Minor — `src/lib/conductor.ts` ~15–37 (`selectReadyTasks`)

The comment says this mirrors `plan.getReadyEntries`, but semantics differ materially:

| Aspect | `getReadyEntries` (maestroclaw) | `selectReadyTasks` (web) |
|--------|----------------------------------|---------------------------|
| Eligible status | `pending`, `ready` | `queued`, `rerouted` |
| Dependency terminal state | `done` only | `completed`, `failed`, or `skipped` |

**Consequence:** No regression vs. the removed inline filter (failed/skipped deps already unblocked tasks there). But the “faithful mirror of `getReadyEntries`” claim is inaccurate, and local vs. maestroclaw behavior will diverge if both are ever compared or synced mechanically.

### 4. Minor — `src/lib/conductor.ts` ~66 vs `reconcile.ts` ~32

Empty/missing `lane_name` handling differs:

- Web: `entry.lane_name?.codePointAt(0) ?? 0` → rank `2000`
- Maestroclaw: `entry.lane_name.codePointAt(0)!` on a required string → `undefined` → `NaN` in the rank

**Consequence:** Edge case only (`lane_owner` missing → `''` in `collectManifest`). Web behavior is safer, but it is another mirror divergence.

### 5. Minor — no tests for `src/lib/conductor.ts`

The file explicitly says “KEEP THIS IN SYNC with the maestroclaw module,” yet the commit adds no unit tests and no shared test vectors. Drift between Node and Vite copies is likely over time.

### 6. Nit — `src/lib/conductor.ts` ~72 vs maestroclaw `reconcileManifests`

Exported name is `reconcileManifest` (singular) vs maestroclaw `reconcileManifests`. Collision report shape also omits `candidates` present in maestroclaw’s `CollisionReport`. Low risk, but increases sync friction.

### 7. Nit — `MAESTRO_STATE.md`

Session log entry marks C-06 ✅ and states typecheck/lint/build clean while admitting no runtime test. Operational-state update is fine; it should not be treated as functional verification.

---

## 2. Mirror-Faithfulness Assessment

**Verdict: partial mirror, not faithful.**

### `selectReadyTasks` vs `plan.getReadyEntries`

- **Aligned:** Both select tasks whose dependencies have reached a terminal state and return a filtered subset.
- **Divergent:** Status vocabulary, failed/skipped dep unblocking (web-only), no `buildPlan` / `markEntry*` lifecycle, no invalid-dep stripping at plan build (`validDeps = deps.filter(d => entryIds.has(d))`).
- **Net:** Behavior-preserving for the web dispatch loop, but **not** a semantic mirror of `getReadyEntries`.

### `reconcileManifest` vs `reconcile.ts`

- **Aligned:**
  - Group by `path`, detect collisions, sort by rank, pick lowest rank as winner.
  - Ranking order: `conductor_approved` → priority (`P0` < `P1` < `P2`) → `lane_name` tie-break.
  - Preserve input order for non-colliding paths; emit collision reports.
- **Divergent:**
  - Function/type names (`reconcileManifest` / `ManifestCandidate` vs `reconcileManifests` / `ManifestEntry`).
  - No `detectManifestConflicts` export.
  - Collision report lacks `candidates` array.
  - `lane_name` optional on web; required on maestroclaw.
  - Empty `lane_name` rank: `0` vs `NaN`.
  - Both copies share the same **first-code-point** tie-break, not true lexicographic compare — so the mirror matches maestroclaw’s implementation bug, not its comment.

### Caller wiring gap (not in `conductor.ts` itself)

The mirror implements priority/approval ranking, but `collectManifest` never supplies those fields. The live reconcile path therefore does **not** exercise maestroclaw’s intended ranking ladder.

---

## 3. Does It Fix P1-4?

**Partially — client-side yes; full conductor-correct resolution no.**

### What improved

Before: `collectManifest` returned every completed task as a separate manifest row. Duplicate `path` values were sent to `github-execute`, which applied last-write-wins silently.

After: `reconcileManifest` collapses duplicates to one entry per path before push, with `console.warn` logging of collisions. That removes silent client-side duplication and makes the chosen winner stable for a given `tasksRef.current` snapshot.

### What the caller actually passes

```typescript
{
  path: t.file_path,
  content: t.result_content!,
  operation: ...,
  content_hash: null,
  lane_name: t.lane_owner ?? '',
  // priority: NOT PASSED
  // conductor_approved: NOT PASSED
}
```

So in real collisions:

1. All candidates rank as unapproved `P1`.
2. Tie-break is first character of `lane_owner` (or input order when tied).
3. `conductor_approved: true` on the **patch** payload (lines ~1617, ~1632) does not flow into per-file candidate ranking.

### Assessment

| Criterion | Met? |
|-----------|------|
| Stops sending duplicate paths to `github-execute` | Yes |
| Deterministic for a fixed task list snapshot | Yes |
| Uses conductor priority / approval semantics | No |
| True lexicographic lane tie-break | No |
| Matches maestroclaw winner for same inputs | Only if callers populated the same fields maestroclaw expects |

P1-4’s **symptom** (silent last-write-wins on the client→server handoff) is addressed. P1-4’s **intended policy** (ranked, conductor-aware winner selection) is not, because the caller omits the fields that drive ranking. `MAESTRO_STATE.md` correctly notes the authoritative Deno-side fix in `github-execute` remains open.

---

## 4. Verdict

### **`rework required`**

**Rationale:**

The commit is directionally right — extracting shared conductor logic and reconciling before push is the correct architecture, and `selectReadyTasks` preserves existing dispatch behavior with a cleaner O(n) lookup.

However, the stated centerpiece (“faithful mirror” + “real P1-4 fix”) is not fully delivered:

1. **`collectManifest` must pass ranking inputs** — at minimum map `BuildTask` numeric `priority` to `TaskPriority` and forward it into reconcile candidates. Without that, collision resolution is mostly arbitrary despite the infrastructure.
2. **Tie-break should match documented semantics** — use full `lane_name.localeCompare()` (in both web and maestroclaw copies, or document the intentional first-char shortcut).
3. **Mirror claims should be narrowed** — `selectReadyTasks` is a web-adapted equivalent, not a mirror of `getReadyEntries`; comments should say so to avoid false sync confidence.
4. **Add tests** — shared vectors for `selectReadyTasks` and `reconcileManifest` would protect the “KEEP IN SYNC” contract.

Acceptable to merge after those fixes and a quick runtime smoke test of a dual-lane collision push. Not acceptable as-is if the bar is “faithful mirror” and conductor-correct P1-4 resolution.