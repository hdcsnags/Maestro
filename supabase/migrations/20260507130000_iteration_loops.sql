-- PRO-02: Iteration Loop Primitive
-- Creates 4 tables with circular FK handled via deferred constraint.
-- Add iteration_loops WITHOUT current_step_id FK first, then iteration_steps,
-- then ALTER TABLE to add the circular FK.

-- ── iteration_loops ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS iteration_loops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  thread_id uuid REFERENCES threads(id),
  goal text NOT NULL,
  scope_paths text[] NOT NULL,
  verification_command text,
  verification_adapter text DEFAULT 'approved_shell',
  max_steps int NOT NULL DEFAULT 10,
  total_timeout_seconds int NOT NULL DEFAULT 300,
  auto_apply boolean DEFAULT false,
  agent_id uuid REFERENCES agents(id),
  executor_id uuid REFERENCES executors(id),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','running','awaiting_approval','paused','succeeded','failed','aborted','unrecoverable')),
  step_count int NOT NULL DEFAULT 0,
  current_step_id uuid,  -- FK added post-iteration_steps creation
  termination_reason text,
  starting_commit_sha text,
  ending_commit_sha text,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- ── iteration_steps ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS iteration_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_id uuid REFERENCES iteration_loops(id) ON DELETE CASCADE NOT NULL,
  step_number int NOT NULL,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending','reading_files','proposing_diff','awaiting_approval','applying','verifying','succeeded','failed','aborted','rolled_back')),
  files_read jsonb DEFAULT '[]'::jsonb,
  proposed_diff text,
  proposed_diff_hash text,
  proposed_diff_files text[],
  proposal_rationale text,
  agent_response_id uuid REFERENCES responses(id),
  approval_required boolean DEFAULT true,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  apply_succeeded boolean,
  apply_error text,
  pre_apply_commit_sha text,
  verification_started_at timestamptz,
  verification_completed_at timestamptz,
  verification_exit_code int,
  verification_stdout text,
  verification_stderr text,
  verification_succeeded boolean,
  terminal_reason text,
  rolled_back boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(loop_id, step_number)
);

-- ── iteration_controls ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS iteration_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_id uuid REFERENCES iteration_loops(id) ON DELETE CASCADE NOT NULL,
  control_type text NOT NULL CHECK (control_type IN ('pause','resume','abort','edit_goal','approve_diff','reject_diff','approve_step_anyway')),
  payload jsonb DEFAULT '{}'::jsonb,
  step_id uuid REFERENCES iteration_steps(id),
  applied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── iteration_locks ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS iteration_locks (
  path text NOT NULL,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  repo_full_name text NOT NULL,
  loop_id uuid REFERENCES iteration_loops(id) ON DELETE CASCADE NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (path, user_id, repo_full_name)
);

-- ── Indices ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_iteration_loops_user_status ON iteration_loops(user_id, status);
CREATE INDEX IF NOT EXISTS idx_iteration_loops_session ON iteration_loops(session_id);
CREATE INDEX IF NOT EXISTS idx_iteration_loops_executor_pending ON iteration_loops(executor_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_iteration_loops_lease ON iteration_loops(lease_expires_at) WHERE status IN ('running', 'awaiting_approval', 'paused');
CREATE INDEX IF NOT EXISTS idx_iteration_steps_loop ON iteration_steps(loop_id, step_number);
CREATE INDEX IF NOT EXISTS idx_iteration_steps_state ON iteration_steps(state) WHERE state != 'succeeded';
CREATE INDEX IF NOT EXISTS idx_iteration_controls_loop_unapplied ON iteration_controls(loop_id) WHERE applied_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_iteration_locks_loop ON iteration_locks(loop_id);
CREATE INDEX IF NOT EXISTS idx_iteration_locks_expiry ON iteration_locks(expires_at);

-- ── Circular FK (deferred) ────────────────────────────────────────────────────
ALTER TABLE iteration_loops ADD CONSTRAINT iteration_loops_current_step_id_fkey
  FOREIGN KEY (current_step_id) REFERENCES iteration_steps(id) DEFERRABLE INITIALLY DEFERRED;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE iteration_loops ENABLE ROW LEVEL SECURITY;
ALTER TABLE iteration_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE iteration_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE iteration_locks ENABLE ROW LEVEL SECURITY;

-- iteration_loops: owner policy
CREATE POLICY "iteration_loops_owner" ON iteration_loops
  FOR ALL USING (user_id = auth.uid());

-- iteration_steps: via loop
CREATE POLICY "iteration_steps_owner" ON iteration_steps
  FOR ALL USING (
    loop_id IN (SELECT id FROM iteration_loops WHERE user_id = auth.uid())
  );

-- iteration_controls: via loop
CREATE POLICY "iteration_controls_owner" ON iteration_controls
  FOR ALL USING (
    loop_id IN (SELECT id FROM iteration_loops WHERE user_id = auth.uid())
  );

-- iteration_locks: SELECT only for owner; writes via service-role
CREATE POLICY "iteration_locks_select_owner" ON iteration_locks
  FOR SELECT USING (user_id = auth.uid());

-- ── Realtime publication ─────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE iteration_loops;
ALTER PUBLICATION supabase_realtime ADD TABLE iteration_steps;
