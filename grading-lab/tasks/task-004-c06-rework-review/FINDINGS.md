# Original findings on commit 22a04a1 (to verify against the rework)

Seven independent reviewers (task-001) unanimously returned "rework required" on
the original C-06 commit. These are the findings the rework claims to fix. Your
job is to verify each is actually resolved in the reworked code — not just
gestured at.

- **F1 — starved ranking inputs.** `collectManifest` passed neither `priority`
  nor `conductor_approved`, so the reconcile's top two tiers were dead code; and
  decompose priority was a `number` never persisted / never mapped to
  `'P0'|'P1'|'P2'`.
- **F2 — silent discard.** Overridden (losing) completed work vanished on a
  `console.warn`; nothing surfaced to UI/audit.
- **F3 — second push path unreconciled.** The session-build path
  (`collectSessionManifest` → `mergeSessionManifest`) kept last-write-wins with
  no reconcile or surfacing.
- **F4 — false "faithful mirror".** `selectReadyTasks` unblocks on
  `failed`/`skipped` (and treated unknown deps as permanently blocking) while
  claiming to mirror maestroclaw's `plan.getReadyEntries` (which unblocks only on
  `done`). Header oversold "same rules". Unknown-dep case could deadlock.
- **F5 — broken tie-break.** `lane_name.codePointAt(0)` compared only the first
  code point (tied on shared leading char, fell through to unstable input/DB
  order); `pRank*1000 + codePoint` could overflow the band for non-ASCII names.
  Same bug mirrored in maestroclaw `reconcile.ts`.
- **F6 — dup task_id semantics flip.** `new Map(tasks.map(...))` changed
  duplicate-`task_id` resolution from first-wins to last-wins.
- **F7 — API drift / no tests.** Mirror shapes diverged; no tests guarded the
  "KEEP IN SYNC" ranking contract.
