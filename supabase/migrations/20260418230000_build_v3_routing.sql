-- Build V3: Add execution routing columns for MaestroClaw integration.

-- 1. Widen the execution_backend check constraint to include 'auto'
ALTER TABLE build_tasks DROP CONSTRAINT IF EXISTS build_tasks_execution_backend_check;
ALTER TABLE build_tasks
  ADD CONSTRAINT build_tasks_execution_backend_check
  CHECK (execution_backend IN ('edge', 'local', 'auto'));

-- 2. Add executor_job_id to build_tasks (links a task to its MaestroClaw job)
ALTER TABLE build_tasks
  ADD COLUMN IF NOT EXISTS executor_job_id uuid REFERENCES executor_jobs(id);

-- 3. Add execution_backend to sessions (session-level default)
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS execution_backend text DEFAULT 'edge';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'sessions_execution_backend_check'
  ) THEN
    ALTER TABLE sessions
      ADD CONSTRAINT sessions_execution_backend_check
      CHECK (execution_backend IN ('edge', 'local', 'auto'));
  END IF;
END $$;

-- 4. Add context_bundle to executor_jobs (rich context for local execution)
ALTER TABLE executor_jobs
  ADD COLUMN IF NOT EXISTS context_bundle jsonb DEFAULT '{}';

-- 5. Index for finding tasks linked to executor jobs
CREATE INDEX IF NOT EXISTS idx_build_tasks_executor_job
  ON build_tasks(executor_job_id) WHERE executor_job_id IS NOT NULL;
