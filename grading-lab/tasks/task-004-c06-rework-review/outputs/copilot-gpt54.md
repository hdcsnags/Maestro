● Read TASK.md
  └ 39 lines read

● Read FINDINGS.md
  └ 28 lines read

● List directory .
  └ 7 files found

/ Search (grep)
  │ "^diff --git" (rework.diff)
  └ 7 lines found

/ Search (grep)
  │ "selectReadyTasks|reconcileManifest|mapTaskPriority|collectManifest|collectSessionManifest|merge
  │ SessionManifest|conductor_approved|priority|lane_name|codePointAt|Map\(tasks\.map|duplicate|coll
  │ ision|KEEP IN SYNC|describe\(|it\(" (rework.diff)
  └ 8 lines found

● Read rework.diff
  └ L1:62 (62 lines read)

● Read post-conductor.ts.txt
  └ 145 lines read

● Read post-reconcile.ts.txt
  └ 99 lines read

● Read rework.diff
  └ L356:506 (151 lines read)

● Read rework.diff
  └ L63:167 (105 lines read)

● Read rework.diff
  └ L507:620 (48 lines read)

● Read rework.diff
  └ L168:355 (188 lines read)

/ Search (grep)
  │ "getLastManifestCollisions|SurfacedManifestCollision|lastManifestCollisionsRef|manifest
  │ collision|collisions" (rework.diff)
  └ 30 lines found

/ Search (grep)
  │ "collectSessionManifest|mergeSessionManifest|mapTaskPriority|priority:
  │ mapTaskPriority|priority\?: number|priority int|add column if not exists priority" (rework.diff)
  └ 8 lines found

/ Search (grep)
  │ "task-queue|session
  │ build|approval|audit|ui|drawer|toast|dispatch\(|logAudit|audit_events|getLastManifestCollisions"
  │ (rework.diff)
  └ 42 lines found

# Review

## Finding-by-finding verdict

| Finding | Verdict | Evidence |
|---|---|---|
| **F1 — starved ranking inputs** | **partially resolved** | The rework does wire numeric task priority through the stack: `BuildTask.priority` is added (`rework.diff:511-517`), concierge now persists it (`rework.diff:525-534`), the migration adds the DB column (`rework.diff:540-554`), and `collectManifest` maps it via `mapTaskPriority()` (`rework.diff:202-211`, `309-314`). But `collectManifest` still explicitly omits `conductor_approved` (`rework.diff:315-316`), so one of the previously dead ranking inputs is still not carried on the web reconcile path. |
| **F2 — silent discard** | **partially resolved** | The task-queue path now records collisions (`rework.diff:321-328`) and exposes them through `getLastManifestCollisions()` (`rework.diff:351-353`). But the only behavior added in this diff is still `console.warn(...)` (`rework.diff:329-337`); no UI or audit sink is added anywhere in the branch diff, so overridden work is still not actually surfaced end-to-end. |
| **F3 — second push path unreconciled** | **partially resolved** | Session builds now detect duplicate paths and stash collision metadata (`rework.diff:236-258`), but the actual merge still remains `mergeSessionManifest(flat)` (`rework.diff:261-264`), and the new comment expressly says “last run still wins, by design” (`rework.diff:233-235`). This improves observability, but it does not add reconcile logic to that path. |
| **F4 — false "faithful mirror"** | **resolved** | The new header now accurately documents that `selectReadyTasks` is **not** a mirror and spells out the two intentional divergences (`rework.diff:362-378`). The implementation matches that contract: failed/skipped deps unblock via `TERMINAL_DEP_STATES` (`rework.diff:407-425`), and unknown deps are treated as resolved through `!dep` (`rework.diff:421-425`). |
| **F5 — broken tie-break** | **resolved** | Both reconciliers replace the arithmetic rank with tiered comparison and full-lane lexicographic compare (`rework.diff:15-39`, `57-60`, `457-472`, `499-500`). The new claw tests cover the shared-prefix case and the non-ASCII overflow case (`rework.diff:117-145`), and equal-rank collisions now have an explicit deterministic fallback in each implementation (`rework.diff:21-22`, `39`, `437-441`, `472`). |
| **F6 — dup `task_id` semantics flip** | **resolved** | `selectReadyTasks` now restores first-occurrence-wins semantics with an explicit guarded `Map` fill (`rework.diff:409-416`), instead of the old `new Map(tasks.map(...))` last-wins behavior. |
| **F7 — API drift / no tests** | **partially resolved** | Tests were added, but only for `packages/maestroclaw/src/conductor/reconcile.ts` (`rework.diff:69-167`). There is still no test that asserts `src/lib/conductor.ts` stays in sync with it. More importantly, the implementations still drift on the final tie-break: web uses `tie_break` (`rework.diff:437-472`), while maestroclaw uses original input index (`rework.diff:20-39`, `47-59`). So the claimed KEEP-IN-SYNC contract is still not actually locked. |

## Regression hunt

**Medium severity — the new “KEEP THIS RANKING IN SYNC” contract is still violated.**  
`src/lib/conductor.ts` resolves equal `conductor_approved` / `priority` / `lane_name` candidates by `tie_break` string (`rework.diff:437-472`), while `packages/maestroclaw/src/conductor/reconcile.ts` resolves the same case by original input index (`rework.diff:20-39`, `47-59`). That means same-lane, same-path collisions can still pick different winners across the two layers the rework says must stay in sync.

I did **not** find a separate concrete defect in the migration or the `mapTaskPriority()` bucket itself from this diff alone; the merge blocker is the comparator drift plus the incomplete closure of F1/F2/F3/F7.

## Verdict

**rework again**

The rework makes real progress on F4-F6 and most of F5, but it does not fully close F1-F3 or F7, and it still leaves a real comparator-sync defect between the web and maestroclaw reconciliers. For a change whose purpose is deterministic, mirrored manifest resolution, that remains merge-blocking.

