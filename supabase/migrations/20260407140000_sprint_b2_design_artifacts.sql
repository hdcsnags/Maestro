/*
  # Sprint B · B2 — Design artifact storage

  Stores HTML mockup artifacts produced by design phase agents,
  one row per designer role per round. RLS scoped via session →
  workspace → user.
*/

CREATE TABLE IF NOT EXISTS design_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE,
  round_id uuid REFERENCES rounds(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  agent_name text NOT NULL,
  designer_role text NOT NULL
    CHECK (designer_role IN (
      'visual_spatial', 'structure_ux', 'product_practical', 'wildcard_fusion'
    )),
  html_content text NOT NULL,
  rationale text,
  tradeoffs text,
  flagged_by_conductor boolean DEFAULT false,
  selected_for_build boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE design_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users access own design artifacts" ON design_artifacts;
CREATE POLICY "Users access own design artifacts"
  ON design_artifacts FOR ALL
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE workspace_id IN (
        SELECT id FROM workspaces WHERE user_id = auth.uid()
      )
    )
  );
