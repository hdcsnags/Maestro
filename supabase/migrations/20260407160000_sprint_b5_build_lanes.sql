/*
  # Sprint B · B5 — Build lane assignment

  Each builder agent must have a non-overlapping lane assignment before
  a non-analyze github-execute run is allowed. Mirrors the build_spec_locked
  gate. Concierge can suggest lanes when next_phase = 'build' and none exist.
*/

CREATE TABLE IF NOT EXISTS build_lanes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id) ON DELETE CASCADE,
  agent_name text NOT NULL,
  lane_paths text[] NOT NULL,
  role text NOT NULL
    CHECK (role IN ('builder', 'reviewer', 'read_only', 'security_audit')),
  allowed_handoffs text[],
  created_at timestamptz DEFAULT now()
);

ALTER TABLE build_lanes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users access own build lanes" ON build_lanes;
CREATE POLICY "Users access own build lanes"
  ON build_lanes FOR ALL
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE workspace_id IN (
        SELECT id FROM workspaces WHERE user_id = auth.uid()
      )
    )
  );
