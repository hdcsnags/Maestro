## Findings

1. **[major] `context-useBuildExecution.ts.txt:1557`**  
   `collectManifest` does not pass `priority` or `conductor_approved` into `reconcileManifest`; it only passes `path`, `content`, `operation`, `content_hash`, and `lane_name`. The reconcile ranking in `context-conductor.ts.txt:64-66` therefore always defaults every task to non-approved `P1`, so the advertised priority/approval collision policy is never applied in the web dispatch path. Real consequence: a higher-priority or conductor-approved candidate can lose a same-path collision to a lower-priority lane solely because of lane ordering.

2. **[major] `context-conductor.ts.txt:66`**  
   The claimed lexicographic lane tie-break is not lexicographic. It ranks only `lane_name?.codePointAt(0)`, so lanes such as `claude` and `codex`, or UUID-like agent ids sharing the same first character, compare equal. JavaScript’s stable sort then preserves input order, which comes from task row order (`created_at` ordering in `context-useBuildExecution.ts.txt:327` / `1396`). Real consequence: same-priority path collisions can still be resolved by incidental task creation order rather than by the stated deterministic lane-name policy.

3. **[major] `context-conductor.ts.txt:34`**  
   `selectReadyTasks` treats `failed` and `skipped` dependencies as satisfied. The maestroclaw plan semantics only consider dependencies satisfied when their status is `done` (`context-maestroclaw-plan.ts.txt:51-57`). Real consequence: the web dispatcher can run downstream tasks after prerequisite work failed or was skipped, producing output against missing prerequisite changes instead of holding/failing/skipping the dependent frontier.

## Mirror-Faithfulness Assessment

`src/lib/conductor.ts` is not a faithful mirror of `packages/maestroclaw/src/conductor/`.

Divergences from `plan.ts`:

- `getReadyEntries` uses plan statuses `pending` / `ready` / `running` / `done` / `failed`; `selectReadyTasks` uses build task statuses `queued` / `rerouted` / `completed` / `failed` / `skipped`.
- `getReadyEntries` only unblocks on `done`; `selectReadyTasks` unblocks on `completed`, `failed`, or `skipped`.
- `buildPlan` filters dependencies to valid task ids before planning; `selectReadyTasks` treats a missing dependency id as not ready forever.
- The frontend file does not mirror `buildPlan`, `ConductorPlan`, `PlanEntry`, `markEntryRunning`, `markEntryDone`, or `markEntryFailed`.
- `ReadyTask` drops conductor fields such as `file_path`, `priority`, `deps`, and `lane_name`.

Divergences from `reconcile.ts`:

- The source exports `detectManifestConflicts`; the frontend mirror does not.
- The source collision report includes `candidates`; the frontend report only includes `path`, `winner`, and `overridden`.
- The source `ManifestEntry` requires `lane_name`; the frontend makes it optional and silently ranks missing lane names as `0`.
- The source operation type is `create | update | delete`; the frontend caller uses `create | upsert | delete`.
- The frontend reconcile is generic and preserves extra fields like `content_hash`, which is useful, but it is not the same public contract as maestroclaw.
- Both implementations use only the first code point of `lane_name`, so the frontend is faithful to the current source implementation there, but both diverge from their own “lexicographic” comment.

## Does It Fix P1-4?

Partially, but not correctly enough.

The new `collectManifest` does collapse duplicate paths before calling `github-execute`, so this specific client path no longer sends multiple manifest entries for the same path and therefore avoids raw downstream last-write-wins behavior.

However, the caller does not pass the data required for the intended policy. Since `priority` and `conductor_approved` are absent, all candidates rank as default `P1` and non-approved. Resolution then depends only on `lane_name`, and even that tie-break only compares the first character. So P1-4 is mitigated from “last write wins” to “lane/order wins,” but it is not deterministic and correct under the stated conductor policy.

Also, the commit itself notes that authoritative server-side enforcement in `github-execute` remains open, so other callers can still submit colliding manifests.

## Verdict

**rework required**

The commit moves collision handling in the right direction, but the core P1-4 fix is incomplete because the web caller discards the ranking metadata and the tie-break is not actually lexicographic. The new conductor mirror also materially diverges from maestroclaw dependency semantics, especially by dispatching dependents after failed/skipped prerequisites.
