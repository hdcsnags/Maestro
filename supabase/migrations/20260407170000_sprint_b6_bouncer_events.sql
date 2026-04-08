/*
  # Sprint B · B6 — Bouncer checkpoint contracts

  Records security/code-quality findings from the bouncer edge function.
  Triggered at end-of-build (Sprint B) and at checkpoints (Sprint C).
*/

CREATE TABLE IF NOT EXISTS bouncer_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  triggered_by text NOT NULL
    CHECK (triggered_by IN ('file_count', 'risky_change', 'end_of_build', 'conductor')),
  severity text NOT NULL
    CHECK (severity IN ('minor', 'critical_pause', 'critical_approved')),
  findings jsonb NOT NULL DEFAULT '[]',
  conductor_decision text
    CHECK (conductor_decision IN ('acknowledge', 'pause', 'approve_continue', 'abort')),
  model_used text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bouncer_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users access own bouncer events" ON bouncer_events;
CREATE POLICY "Users access own bouncer events"
  ON bouncer_events FOR ALL
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE workspace_id IN (
        SELECT id FROM workspaces WHERE user_id = auth.uid()
      )
    )
  );
