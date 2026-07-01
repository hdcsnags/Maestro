## Findings

1. **major** — `src/hooks/useBuildExecution.ts:1555-1568`, `src/lib/conductor.ts:63-67`  
   `collectManifest()` strips each completed task down to `{ path, content, operation, content_hash, lane_name }` before calling `reconcileManifest()`. Because it never passes `priority` or `conductor_approved`, every candidate reaches the resolver as the default `P1` / not-approved case, so collisions are decided only by `lane_name`. If two lanes intentionally overlap, a lower-priority result can beat the intended winner purely because its lane id sorts earlier. That means the advertised P1-4 fix is not correct end-to-end.

2. **major** — `src/lib/conductor.ts:23-35` (compare `packages/maestroclaw/src/conductor/plan.ts:51-58`)  
   The new `selectReadyTasks()` is not a faithful mirror of maestroclaw’s `getReadyEntries()`: it unblocks a task when every dependency is `completed`, `failed`, or `skipped`, while maestroclaw only unblocks when every dependency is `done`. In the web dispatcher, downstream tasks can now proceed after a prerequisite failed/skipped, which can generate code against files or APIs that were never successfully produced.

3. **minor** — `src/lib/conductor.ts:61-67` (also mirrored from `packages/maestroclaw/src/conductor/reconcile.ts:27-33`)  
   The comment says the final tie-break is lexicographic `lane_name`, but the implementation only uses `lane_name.codePointAt(0)`. Names that share the same first character compare equal, so the winner falls back to input-array order instead of the documented lane ordering.

## Mirror-faithfulness assessment

`src/lib/conductor.ts` is **not** a faithful mirror of `packages/maestroclaw/src/conductor/`.

Divergences:

- It is only a **partial** port: `buildPlan()`, `markEntryRunning()`, `markEntryDone()`, and `markEntryFailed()` are omitted entirely.
- `selectReadyTasks()` changes the status model (`queued` / `rerouted` vs. `pending` / `ready`), which is understandable for the web layer, but it also changes the **dependency semantics** by letting `failed` / `skipped` dependencies unblock children. That is a real behavior change, not just naming adaptation.
- `buildPlan()` in maestroclaw normalizes away invalid dependency ids; the web helper does not, so an unknown dep id can leave a task permanently blocked.
- `reconcileManifest()` is close to `reconcileManifests()`, but its collision report drops the original `candidates` array and makes `lane_name` optional.
- End-to-end, the web path still does **not** match maestroclaw reconcile semantics because the caller never supplies `priority` or `conductor_approved`, so those ranking rules are dead code here.

## Does it fix P1-4?

**No, not completely.** It does improve things by collapsing duplicate paths before they reach `github-execute`, so this path no longer relies on raw last-write-wins behavior. But the actual winner selection is still wrong for the stated conductor policy:

- `collectManifest()` only passes `lane_name`, so reconcile cannot honor priority or conductor approval.
- Same-initial lane names still fall back to input order, not the documented lexicographic rule.

So the result is only partially deterministic, and not correct per the claimed conductor ranking.

## Verdict

`rework required` — the commit’s two central claims (“faithful frontend mirror” and “real P1-4 fix”) are not true as implemented.