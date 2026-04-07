/*
  # Sprint A · B3 — Session phase scaffolding + concierge_decisions

  Adds phase tracking, build spec, project type, architect doc to sessions.
  Creates concierge_decisions table with RLS scoped via workspace ownership.
*/

ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS current_phase text
    DEFAULT 'analysis'
    CHECK (current_phase IN (
      'analysis', 'design', 'pre_build',
      'build', 'bouncer', 'complete'
    )),
  ADD COLUMN IF NOT EXISTS build_spec jsonb,
  ADD COLUMN IF NOT EXISTS build_spec_locked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS project_type text
    CHECK (project_type IN ('new', 'existing')),
  ADD COLUMN IF NOT EXISTS architect_md text;

CREATE TABLE IF NOT EXISTS concierge_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  phase text NOT NULL
    CHECK (phase IN (
      'post_round1', 'post_round2', 'design',
      'pre_build', 'post_build'
    )),
  alignment_summary text,
  tension_points jsonb DEFAULT '[]',
  recommended_direction text,
  conductor_choice text,
  model_used text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_concierge_decisions_session
  ON concierge_decisions(session_id);

ALTER TABLE concierge_decisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users access own concierge decisions" ON concierge_decisions;
CREATE POLICY "Users access own concierge decisions"
  ON concierge_decisions FOR ALL
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE workspace_id IN (
        SELECT id FROM workspaces WHERE user_id = auth.uid()
      )
    )
  );
