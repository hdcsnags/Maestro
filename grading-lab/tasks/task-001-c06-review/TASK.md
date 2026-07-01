# Task 001 — Review the C-06 Conductor web-dispatch commit

You are an independent senior code reviewer. You are reviewing a single commit
(`22a04a1`, branch `c-06-conductor-web-dispatch`) proposed for merge into
Maestro's `main` branch.

## What Maestro is (context)

Maestro is a multi-model AI council orchestrator: a web app (Vite/React
frontend + Supabase Deno edge functions) that dispatches build tasks to
multiple AI models in parallel lanes, then reconciles the results and pushes
them to GitHub. A separate Node package `packages/maestroclaw` is the local
execution node; it contains a `conductor` module (plan + reconcile logic).

## What the commit claims

- The maestroclaw conductor cannot be imported across the Vite/Node/Deno
  boundary, so the commit creates `src/lib/conductor.ts` as a **"faithful
  frontend mirror"** of `packages/maestroclaw/src/conductor/` (`plan.ts` +
  `reconcile.ts`).
- It wires dependency-ready task selection (`selectReadyTasks`) into the
  dispatch loop in `src/hooks/useBuildExecution.ts`, replacing an inline filter.
- It adds deterministic manifest reconciliation (`reconcileManifest`) in
  `collectManifest` before pushing to the `github-execute` edge function —
  claimed as the real fix for bug **P1-4**: previously, when two parallel lanes
  produced the same file path, the manifest silently kept the last write
  ("last-write-wins").
- Claimed verified: typecheck / lint / build clean. **NOT runtime-tested.**

## Files in this folder

1. `c06.diff` — the full commit diff. **The primary review target.**
2. `context-conductor.ts.txt` — post-image of the new `src/lib/conductor.ts`.
3. `context-useBuildExecution.ts.txt` — full post-image of
   `src/hooks/useBuildExecution.ts` (1,483 lines; read the regions relevant to
   the diff).
4. `context-maestroclaw-plan.ts.txt` and `context-maestroclaw-reconcile.ts.txt`
   — the maestroclaw conductor module this commit claims to faithfully mirror.
   Verify that claim.

## Your deliverable (markdown, printed to stdout)

1. **Findings** — numbered, each with a severity (blocker / major / minor /
   nit), the file and line, and a precise explanation of the defect and its
   real-world consequence. Only report defects you are confident are real.
2. **Mirror-faithfulness assessment** — does `src/lib/conductor.ts` actually
   match the maestroclaw semantics? Note every divergence you find.
3. **Does it fix P1-4?** — does the reconcile actually make collision
   resolution deterministic and correct? Consider what data the caller in
   `collectManifest` actually passes to it.
4. **Verdict** — exactly one of: `merge as-is` / `merge after nits` /
   `rework required` / `reject`, with rationale.

Constraints: do not modify or create any files; do not read files outside this
folder; print the complete review to stdout only. Length: whatever the review
needs — no padding, no filler.
