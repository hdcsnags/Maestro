-- Priority 11: Approval workflow for elevated execution
-- Expand approval_requests with scope binding and time-limited reuse.
-- Any elevated github-execute call must reference an approved,
-- non-expired approval_request whose scope matches the operation.

ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS expires_at         timestamptz,
  ADD COLUMN IF NOT EXISTS repo_connection_id uuid REFERENCES repo_connections(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS branch_name        text    DEFAULT '',
  ADD COLUMN IF NOT EXISTS scope_paths        text[]  DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS agent_name         text    DEFAULT '',
  ADD COLUMN IF NOT EXISTS files_affected     jsonb   DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS lines_added        integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lines_removed      integer DEFAULT 0;

-- Partial index for fast "is there a live approval that matches this scope?" lookups.
-- Scope match must include scope_paths equality; the index narrows by
-- (user, repo, branch) which is highly selective on its own.
CREATE INDEX IF NOT EXISTS approval_requests_live_idx
  ON approval_requests(user_id, repo_connection_id, branch_name)
  WHERE status = 'approved' AND expires_at IS NOT NULL;
