● Read TASK.md
  └ 39 lines read

● Read FINDINGS.md
  └ 28 lines read

● List task folder files with sizes (shell)
  │ Get-ChildItem "C:\New
  │ folder\MaestroOrchestra\project\Maestro\grading-lab\tasks\task-004-c06-rework-review" |
  │ Select-Object Name, Length
  └ 10 lines…

● Read rework.diff
  └ 554 lines read

● Read post-reconcile.ts.txt
  └ 99 lines read

● Read post-conductor.ts.txt
  └ 145 lines read

# Task 004 — C-06 Rework Review (Merge Gate)

Reviewed: `rework.diff` (24.6KB, complete branch-vs-main diff), `post-conductor.ts.txt`, `post-reconcile.ts.txt`, against `FINDINGS.md` F1–F7. All line references are to `rework.diff`.

---

## 1. Finding-by-finding verdicts

### F1 — starved ranking inputs → **resolved** (with one documented residual)

Evidence the pipeline is now fed end-to-end:

- **Migration** `20260703000000_build_tasks_priority.sql` adds `build_tasks.priority int` (nullable, `if not exists`, with column comment) — diff lines 550–554.
- **Concierge persists it**: `priority: t.priority` added to the `build_tasks` insert object — diff line 531.
- **Type carries it**: `BuildTask.priority?: number | null` — diff line 517.
- **Mapped to the tier enum**: `mapTaskPriority` (diff lines 206–211) converts numeric → `'P0'|'P1'|'P2'`, with `null → undefined` so pre-migration rows fall through to lane/tie_break ranking.
- **`collectManifest` now passes ranking inputs**: `priority: mapTaskPriority(t.priority)`, `lane_name: t.lane_owner ?? ''`, `tie_break: t.task_id` — diff lines 312–314.

The priority tier is no longer dead code. `conductor_approved` is still never passed on this path, but the omission is now explicit and reasoned (diff lines 315–316: "approval is uniform at the patch level on this path, so it is not a differentiator"). That is a defensible design decision, not a starved tier — the tier exists for maestroclaw parity. One caveat: whether the concierge decompose output actually contains `t.priority` is not verifiable from this folder (constraint: no reading outside); the diff and its comments are internally consistent on this point.

### F2 — silent discard → **partially resolved**

What the rework adds:

- `SurfacedManifestCollision` interface (diff lines 187–193), `lastManifestCollisionsRef` (line 222), populated on both collect paths (lines 322–327, 244–252), and exported via `getLastManifestCollisions()` (line 353).

What it does **not** add: **any consumer.** Nothing in the diff wires `getLastManifestCollisions` into the approval UI (`ExecutionModal` or equivalent) or into `audit_events` — despite `logAudit` and an append-only audit table existing in this codebase. The comments themselves concede this: *"Read by the push/approval UI"* (line 221 — aspirational; no such read exists in the diff) and *"The approval/push UI **should** show these"* (line 352). At runtime, the user-visible behavior is unchanged from the original finding: overridden completed work still surfaces only as a `console.warn` (lines 330–337). This is plumbing for a fix, not the fix the council demanded. Secondary nit: the ref is clobbered by whichever collect runs last (task-queue vs session), so a stale/empty report can mask a real one if the two paths interleave.

### F3 — session push path unreconciled → **partially resolved**

- `collectSessionManifest` now flat-maps runs, counts duplicate paths, records collisions into the shared ref, and warns (diff lines 236–259). Last-write-wins is retained deliberately and the justification is sound: session manifest entries carry no lane/priority/task metadata, so priority reconcile is genuinely impossible here (lines 230–235).

Accepting LWW-plus-surfacing as the fix, it inherits F2's gap: the "surfacing" reaches only the unconsumed ref and a `console.warn`. Two additional accuracy defects in the new detection (detailed in Regression Hunt R2/R3 below): the report miscounts intra-run duplicates as "N runs", and in the `sessionRuns.length === 0` branch it reports "last kept" while no dedup is actually applied.

### F4 — false "faithful mirror" / unknown-dep deadlock → **resolved**

- The header no longer claims mirror status — it states the opposite, loudly: *"This is an EXTRACTION of the web hook's original inline ready-filter, NOT a mirror of maestroclaw's plan.getReadyEntries"*, and documents both deliberate divergences (failed/skipped unblocks; unknown deps resolve) with a "do not remove to match maestroclaw" instruction — `post-conductor.ts.txt` lines 6–17.
- The deadlock is behaviorally fixed: `return !dep || TERMINAL_DEP_STATES.has(dep.status)` (diff line 425) treats unknown dep ids as resolved. The old inline code (removed, diff lines 272–289) required `dep && (...)`, so an unknown dep blocked its dependents forever.
- Known-dep semantics are preserved: old logic ("all completed" OR "all in {completed, failed, skipped}") reduces to exactly the new "all in terminal set". Status gate (`queued`/`rerouted`) preserved (line 418). Correct extraction.

### F5 — broken tie-break → **resolved**

Both sides replaced `pRank * 1000 + codePointAt(0)!` with a tiered comparator — no arithmetic band-packing, full-string lane comparison:

- Web `compareCandidates` — `post-conductor.ts.txt` lines 101–112: approved → `PRIORITY_RANK` delta → `lane_name.localeCompare` → `tie_break.localeCompare`.
- maestroclaw `compareEntries` — diff lines 25–40: identical tiers, final tie-break by original input index (`indexOf` map built at lines 47–49).

This fixes all three original defects: first-code-point ties, band overflow on non-ASCII (verified by the CJK test, diff lines 137–145), and the non-null assertion crash on empty `lane_name` (now `?? ''`, verified by test at lines 158–167). Both comparators use identical tiers and the same `?? 'P1'` default — the KEEP-IN-SYNC contract holds textually. The differing *final* keys (`tie_break` vs input index) are each deterministic and the sync contract is explicitly scoped to the three ranking tiers (diff line 24, conductor.ts lines 20–22). **However**, the choice of `localeCompare` introduces a new determinism concern — see Regression Hunt R1.

### F6 — dup task_id semantics flip → **resolved**

`selectReadyTasks` builds the id map with `if (!byId.has(t.task_id)) byId.set(...)` (`post-conductor.ts.txt` lines 52–55) — first-occurrence wins, matching the original inline `find` semantics, with a comment explaining exactly why `new Map(tasks.map(...))` was wrong. Correct. (No test locks this in — folded into F7.)

### F7 — API drift / no tests → **partially resolved**

- **Tests added**: `packages/maestroclaw/test/reconcile.test.ts` — 7 focused tests covering pass-through, approved-beats-priority, priority-beats-lane, full-lexicographic tie-break (the core F5 case, both input orders), non-ASCII priority-band integrity, input-index stability, and empty-lane no-crash. All assertions check out against the comparator (I traced each; e.g., "claude-haiku" < "claude-opus" at the 8th char wins both directions, lines 119–133).
- **But the tests guard only one side of the contract.** The finding was that nothing guarded the "KEEP IN SYNC" *ranking contract*. There are zero tests for `src/lib/conductor.ts`: no tests for `compareCandidates`/`reconcileManifest`, none for `selectReadyTasks` (the F4 deadlock fix and F6 first-wins fix are unguarded), and none for `mapTaskPriority`. If the web comparator drifts tomorrow, no test fails — the exact failure mode F7 named. Shape drift itself is now documented as deliberate (conductor.ts header), which addresses the "false mirror" half, but the contract remains untested on the web side.

**Score: 4 resolved, 3 partially resolved.**

---

## 2. Regression hunt

**R1 — MEDIUM: locale-sensitive collation in a determinism contract.** All four string tie-breaks use bare `localeCompare` (conductor.ts lines 108, 111; reconcile.ts lines 48, 51) with no locale/collator pinned. `String.prototype.localeCompare()` with no arguments uses the *host environment's default locale*, and its ordering varies across locales and ICU versions — e.g., case and diacritic ordering differ from code-unit order ("B" vs "a" flips between code-unit and most collators). The web comparator runs in arbitrary user browsers; maestroclaw runs in Node — the two "KEEP IN SYNC" implementations can disagree on the same inputs, and the same web build can pick different collision winners on different machines. The old code was buggy but locale-independent; this is a genuinely new nondeterminism vector, in the exact property (deterministic, reproducible winner selection) the rework exists to guarantee. Mitigants: lane names are ASCII model slugs in practice, and reconcile is advisory (github-execute is authoritative). Fix is one line per site: code-unit comparison (`a < b ? -1 : a > b ? 1 : 0`) or a pinned `Intl.Collator('en')`.

**R2 — LOW: session collision report miscounts and misdescribes.** The detector counts *entry occurrences*, not runs (diff lines 240–252). A single run that writes the same path twice yields `dropped_detail: "2 runs wrote a.ts; last kept"` — factually wrong on "runs". Cosmetic but it feeds a report intended for a human approval surface.

**R3 — LOW: in the `sessionRuns.length === 0` branch, the report lies about dedup.** `flat = sessionProgress.manifest` is scanned for duplicates and any are reported as "last kept" — but `sourceManifest` in that branch is `sessionProgress.manifest` passed through with **no** `mergeSessionManifest` (diff lines 261–264, unchanged pre-existing behavior). Duplicates are reported as resolved while actually being pushed as duplicates (last-wins only by virtue of downstream github-execute apply order). The pass-through is pre-existing; the inaccurate *claim* is new.

**R4 — NIT: lane-less tasks win every lane tie.** `lane_name: t.lane_owner ?? ''` (diff line 313) means a task with no lane owner sorts before every named lane at the lane tier (`''` is lexicographic minimum). Deterministic, and the maestroclaw empty-lane test acknowledges the behavior, but "no owner outranks every owner" is a strange precedence policy worth a deliberate look.

**Checked and clean:** `mapTaskPriority` bucketing (≤1→P0, ≤3→P1, else P2; null→undefined; negatives→P0 — consistent with "lower = build first"); web `reconcileManifest` first-occurrence winner placement and `seen`-set dedup (traced — correct, preserves input order for non-colliders); maestroclaw `indexOf` map (object-keyed; safe); the migration (idempotent, nullable, no backfill needed by design); strict-mode/unused-symbol compliance of the new code; the stripping of internal ranking fields before push (diff lines 338–343 — good hygiene, ranking metadata doesn't leak to github-execute); test assertions (all seven verified against the comparator). Unverifiable from this folder (noted, not held against the rework): existence of `t.priority` in the decompose output shape, and whether `npm --prefix packages/maestroclaw test` is actually wired to run the new file.

---

## 3. Verdict

## `rework again`

**Rationale.** The algorithmic core of the rework is genuinely good: F1, F4, F5, and F6 are fixed correctly, the extraction preserves semantics, the divergence documentation is exemplary, and the maestroclaw tests are well-aimed. But three things keep this short of the gate:

1. **F2 — the council's silent-discard finding — is not actually fixed at runtime.** The diff builds the surfacing mechanism and then stops: no UI reads `getLastManifestCollisions`, no `audit_events` row is written, and the code's own comments admit the consumer doesn't exist yet ("should show these"). The user-observable behavior on overridden completed work is today exactly what seven reviewers unanimously rejected: a `console.warn`. F3 inherits the same gap.
2. **F7's contract is still unguarded on the web side.** One-sided tests cannot protect a two-sided KEEP-IN-SYNC contract; `compareCandidates`, `selectReadyTasks` (the deadlock and first-wins fixes), and `mapTaskPriority` have zero coverage.
3. **R1 (medium)**: unpinned `localeCompare` reintroduces environment-dependent ordering into the very determinism guarantee this rework exists to establish.

The remaining work is narrow and well-defined — wire the collision report into the approval modal and/or audit log, add web-side conductor tests (ideally a shared ranking fixture exercised against both comparators), pin the collation, and fix the R2/R3 report wording. With those, this merges cleanly. It is close; it is not there.

