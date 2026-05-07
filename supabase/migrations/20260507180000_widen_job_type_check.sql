-- Fix: executor_jobs.job_type check constraint was too narrow.
--
-- The original constraint (from 20260417160100_maestroclaw_jobs.sql):
--   check (job_type in ('code_task', 'build_task', 'review_task'));
--
-- ...predates several job types now in production use:
--   - 'build_session' — local build flow (`src/lib/sessionBuild.ts`).
--   - LLM-derived `intent.action` strings from execute-intent parsing
--     (`src/hooks/useThreads.ts:949`), e.g., 'shell_command', 'git_command',
--     'npm_command', 'create_repo' — whatever the parser returns.
--
-- Symptom: POST /executor-api?action=submit returns 500 with the constraint
-- violation as the error body. The frontend's `submitBuildSessionJob` has a
-- bare try/catch that swallows the error and returns null, which the build
-- flow misreports as "No online executor advertises adapter X" — a lie.
-- The executor IS advertising the adapter; the insert just never succeeds.
--
-- The check constraint adds no security value: job_type is informational
-- and the only behavior branch in the worker is `claimed.job_type ===
-- "build_session"` (in `packages/maestroclaw/src/index.ts`); everything else
-- goes through `executeJob`. Replace the strict whitelist with a length
-- check to match actual usage.

ALTER TABLE executor_jobs DROP CONSTRAINT IF EXISTS executor_jobs_type_check;

ALTER TABLE executor_jobs
  ADD CONSTRAINT executor_jobs_type_check
  CHECK (
    job_type IS NOT NULL
    AND length(job_type) BETWEEN 1 AND 64
  );
