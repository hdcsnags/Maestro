# Task 004 — Verify the C-06 rework

You are an independent senior code reviewer acting as a merge gate. A commit
(`22a04a1`) was reviewed by a council and unanimously sent back for rework. The
author has now applied a fix-list across two follow-up commits. Your job is to
decide whether the rework is mergeable.

## Files in this folder

1. `rework.diff` — the COMPLETE diff the branch now proposes vs `main` (original
   change + both rework commits), restricted to the code paths. **Primary target.**
2. `post-conductor.ts.txt` — full post-image of `src/lib/conductor.ts`.
3. `post-reconcile.ts.txt` — full post-image of the maestroclaw
   `reconcile.ts` it must stay in sync with.
4. `FINDINGS.md` — the seven original findings the rework claims to close.

## Context

Maestro dispatches build tasks to parallel model lanes and reconciles the file
manifests before pushing to GitHub. `reconcileManifest` (web) mirrors the
RANKING of maestroclaw `reconcileManifests`; `selectReadyTasks` is an extraction
of the web hook's old inline ready-filter (deliberately NOT a mirror of
maestroclaw's plan). A DB migration adds `build_tasks.priority`; the concierge
edge function now persists it; `collectManifest` maps it to `P0|P1|P2`.

## Your deliverable (markdown, to stdout)

1. **Finding-by-finding verdict** — for each of F1–F7: `resolved` /
   `partially resolved` / `not resolved`, with the specific line evidence from
   the diff. Verify, don't take the commit's word.
2. **Regression hunt** — did the rework introduce any NEW defect? Check the new
   comparator, the `mapTaskPriority` bucketing, the first-occurrence dedup, the
   session-path collision detection, the migration, and the tests. Report any
   real bug with severity.
3. **Verdict** — exactly one of: `merge` / `merge after nits` / `rework again`,
   with rationale.

Constraints: verify against the actual diff; do not modify or create files; do
not read outside this folder; print the review to stdout only.
