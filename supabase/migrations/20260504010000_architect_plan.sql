-- DIFF-03: Lane-scoped prompt slicing
-- Adds architect_plan (structured build plan from second architect call) to sessions,
-- and a build_prompt_logs diagnostics table.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS architect_plan jsonb;

-- Diagnostics table: one row per build task, stores the rendered prompt
-- and the structured slice used to produce it. Not in the hot path.
CREATE TABLE IF NOT EXISTS build_prompt_logs (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    uuid        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  build_task_id uuid        REFERENCES build_tasks(id) ON DELETE SET NULL,
  rendered_prompt text      NOT NULL,
  structured_slice jsonb,
  prompt_token_estimate int,
  used_structured_plan boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE build_prompt_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "build_prompt_logs_select" ON build_prompt_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = build_prompt_logs.session_id
        AND s.user_id = auth.uid()
    )
  );

CREATE POLICY "build_prompt_logs_insert" ON build_prompt_logs
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.id = build_prompt_logs.session_id
        AND s.user_id = auth.uid()
    )
  );
