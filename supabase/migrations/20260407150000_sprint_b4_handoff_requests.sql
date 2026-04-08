/*
  # Sprint B · B4 — Handoff request schema

  Records cross-lane handoffs when an agent's manifest contains files
  outside its declared scoped_paths. github-execute creates these
  rather than writing across lane boundaries.
*/

CREATE TABLE IF NOT EXISTS handoff_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  from_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  from_agent_name text NOT NULL,
  to_lane text NOT NULL,
  request_type text NOT NULL
    CHECK (request_type IN ('variable', 'component', 'schema', 'review', 'other')),
  description text NOT NULL,
  payload jsonb,
  status text DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'rejected', 'merged')),
  resolved_by text,
  created_at timestamptz DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE handoff_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users access own handoff requests" ON handoff_requests;
CREATE POLICY "Users access own handoff requests"
  ON handoff_requests FOR ALL
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE workspace_id IN (
        SELECT id FROM workspaces WHERE user_id = auth.uid()
      )
    )
  );
