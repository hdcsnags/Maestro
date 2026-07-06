**Finding-By-Finding Verdict**

| Finding | Verdict | Evidence |
|---|---|---|
| F1 | resolved | `build_tasks.priority` is added in the migration (`rework.diff:541-554`), persisted by concierge (`rework.diff:529-531`), typed on `BuildTask` (`rework.diff:515-517`), bucketed by `mapTaskPriority` (`rework.diff:206-210`), and passed into `reconcileManifest` from `collectManifest` (`rework.diff:309-314`). |
| F2 | partially resolved | Task-queue collisions are now captured in `lastManifestCollisionsRef` (`rework.diff:321-327`) and exposed via `getLastManifestCollisions` (`rework.diff:347-353`). However, the diff does not show any UI or audit consumer. The old “only console.warn” problem is improved, but not proven surfaced to users/audit. |
| F3 | partially resolved | Session collisions are counted and stored (`rework.diff:240-250`) and logged (`rework.diff:253-259`). But the session path still explicitly keeps `mergeSessionManifest(flat)` / last-write-wins (`rework.diff:261-263`) rather than reconciling with the same manifest resolver. This closes silent exact-path drops, not the unreconciled second push path. |
| F4 | resolved | The new header correctly states `selectReadyTasks` is an extraction, not a maestroclaw mirror (`rework.diff:367-382`). The implementation preserves failed/skipped unblocking and treats unknown deps as resolved (`rework.diff:407-425`), avoiding the deadlock case. |
| F5 | resolved for the reported bug | Both comparators now use tiered comparisons instead of numeric band-packing/first-code-point ranking: maestroclaw at `rework.diff:18-37`, web at `rework.diff:458-472`. Tests cover shared-prefix lane names and non-ASCII priority-band leakage (`rework.diff:119-144`). See regression note below about default `localeCompare`. |
| F6 | resolved | Duplicate `task_id` lookup now preserves first occurrence with guarded `Map.set` (`rework.diff:409-415`), matching the old `find` semantics. |
| F7 | partially resolved | A maestroclaw test file was added (`rework.diff:63-166`), but there is no web-side `src/lib/conductor.ts` test and no cross-contract test proving web `reconcileManifest` stays synced with maestroclaw. The final tie-breaks also diverge: web uses `tie_break` (`rework.diff:472`), maestroclaw uses original input index (`post-reconcile.ts.txt:51`). |

**Regression Hunt**

- **Medium: web and maestroclaw can choose different winners on same-rank collisions.** Web falls through to `tie_break` (`rework.diff:472`), while maestroclaw falls through to input index (`post-reconcile.ts.txt:51`). For same path, same approval, same priority, and same lane, web may pick lexicographically smaller `task_id` while maestroclaw picks the first manifest entry. That violates the “KEEP THIS RANKING IN SYNC” contract and leaves F7 only partially fixed.

- **Medium: default `localeCompare` is not a stable cross-runtime ordering contract.** Both comparators use default `localeCompare` (`rework.diff:36`, `rework.diff:469`). Browser and Node locale/collation behavior can differ, especially for non-ASCII lane names, which this rework explicitly tries to make safe. A fixed comparator should use deterministic code-unit ordering or an explicitly fixed locale/options contract.

- **No confirmed blocker in `mapTaskPriority` bucketing.** The buckets are clear: `<=1 -> P0`, `<=3 -> P1`, else `P2` (`rework.diff:206-210`). One documentation mismatch remains: comments say null priority falls back to lane/task tie-break, but the comparator defaults missing priority to `P1` (`rework.diff:466`), so mixed null-vs-`P2` collisions still rank by priority.

- **Session collision detection is incomplete but not newly worse for exact duplicates.** It surfaces exact duplicate raw paths (`rework.diff:240-250`) while preserving last-write-wins for session runs (`rework.diff:261-263`). It does not bring the session path under the same reconcile function, so F3 remains only partially resolved.

**Verdict: rework again**

The rework fixes several core issues, especially priority persistence/mapping, first-occurrence task lookup, and the first-code-point comparator bug. It is not mergeable yet because the claimed sync contract is still untested on the web side and the two implementations can disagree on final tie-breaks. The default `localeCompare` comparator also weakens deterministic cross-runtime ranking.
