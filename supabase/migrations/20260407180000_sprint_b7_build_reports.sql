/*
  # Sprint B · B7 — Build report payload

  Aggregates one row per github-execute build with files, collisions,
  handoffs, bouncer summary, PR links, backup branch.
*/

CREATE TABLE IF NOT EXISTS build_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  files_written jsonb DEFAULT '[]',
  files_skipped jsonb DEFAULT '[]',
  collisions jsonb DEFAULT '[]',
  handoffs_pending jsonb DEFAULT '[]',
  bouncer_summary jsonb,
  pr_links jsonb DEFAULT '[]',
  backup_branch text,
  architect_md_updated boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE build_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users access own build reports" ON build_reports;
CREATE POLICY "Users access own build reports"
  ON build_reports FOR ALL
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE workspace_id IN (
        SELECT id FROM workspaces WHERE user_id = auth.uid()
      )
    )
  );
