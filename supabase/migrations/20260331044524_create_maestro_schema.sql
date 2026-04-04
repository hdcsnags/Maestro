/*
  # Maestro — Full Schema Migration

  ## Summary
  Creates all tables required for the Maestro AI orchestration console.

  ## New Tables

  ### workspaces
  Named environments per user. A user can have multiple workspaces.

  ### provider_connections
  Tracks which AI providers a user has connected (Anthropic, OpenAI, etc.).
  Does NOT store keys — just metadata and connection state.

  ### encrypted_secrets
  Encrypted BYOK provider API keys. Keys are stored encrypted and never returned to the client.

  ### agents
  Logical AI roles cast per workspace: PM, Security, Code, Design, etc.

  ### sessions
  An orchestration session within a workspace.

  ### rounds
  A round of broadcasting within a session (Round 1, Round 2 critique, etc.).

  ### responses
  Agent output for a given round.

  ### flags
  User-chosen standout responses or reasoning.

  ### syntheses
  Lead-generated combined result from a round.

  ### repo_connections
  GitHub repository attachment metadata per workspace.

  ### execution_runs
  Patch / PR / analysis run records.

  ### audit_events
  Immutable action trail — never deleted, never updated.

  ### approval_requests
  Required approvals for elevated or risky actions.

  ## Security
  - RLS enabled on all tables
  - All policies use auth.uid() to enforce user ownership
  - audit_events has no UPDATE or DELETE policy (immutable by design)
*/

-- ─── WORKSPACES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  slug text NOT NULL DEFAULT '',
  description text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own workspaces"
  ON workspaces FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own workspaces"
  ON workspaces FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own workspaces"
  ON workspaces FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own workspaces"
  ON workspaces FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ─── PROVIDER CONNECTIONS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS provider_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT '',
  display_name text NOT NULL DEFAULT '',
  is_connected boolean DEFAULT false,
  models jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE provider_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own provider connections"
  ON provider_connections FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own provider connections"
  ON provider_connections FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own provider connections"
  ON provider_connections FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own provider connections"
  ON provider_connections FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ─── ENCRYPTED SECRETS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS encrypted_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT '',
  encrypted_key text NOT NULL DEFAULT '',
  key_hint text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE encrypted_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own encrypted secrets"
  ON encrypted_secrets FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own encrypted secrets"
  ON encrypted_secrets FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own encrypted secrets"
  ON encrypted_secrets FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own encrypted secrets"
  ON encrypted_secrets FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ─── AGENTS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT '',
  provider text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  color text DEFAULT '#ffffff',
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own agents"
  ON agents FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own agents"
  ON agents FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own agents"
  ON agents FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own agents"
  ON agents FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ─── SESSIONS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL DEFAULT 'Untitled Session',
  execution_mode text NOT NULL DEFAULT 'analyze',
  status text NOT NULL DEFAULT 'active',
  repo_connection_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own sessions"
  ON sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sessions"
  ON sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sessions"
  ON sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sessions"
  ON sessions FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ─── ROUNDS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  round_number integer NOT NULL DEFAULT 1,
  prompt text NOT NULL DEFAULT '',
  target_agents jsonb DEFAULT '[]',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE rounds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own rounds"
  ON rounds FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own rounds"
  ON rounds FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own rounds"
  ON rounds FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own rounds"
  ON rounds FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ─── RESPONSES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  agent_name text NOT NULL DEFAULT '',
  agent_role text NOT NULL DEFAULT '',
  agent_color text DEFAULT '#ffffff',
  provider text NOT NULL DEFAULT '',
  model text NOT NULL DEFAULT '',
  content text NOT NULL DEFAULT '',
  title text DEFAULT '',
  signals jsonb DEFAULT '{}',
  is_flagged boolean DEFAULT false,
  is_lead boolean DEFAULT false,
  tokens_used integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE responses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own responses"
  ON responses FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own responses"
  ON responses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own responses"
  ON responses FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own responses"
  ON responses FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ─── FLAGS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  response_id uuid NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own flags"
  ON flags FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own flags"
  ON flags FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own flags"
  ON flags FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ─── SYNTHESES ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS syntheses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES rounds(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL DEFAULT '',
  lead_agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  source_response_ids jsonb DEFAULT '[]',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE syntheses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own syntheses"
  ON syntheses FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own syntheses"
  ON syntheses FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own syntheses"
  ON syntheses FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own syntheses"
  ON syntheses FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ─── REPO CONNECTIONS ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS repo_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'github',
  owner text NOT NULL DEFAULT '',
  repo text NOT NULL DEFAULT '',
  default_branch text DEFAULT 'main',
  scoped_paths jsonb DEFAULT '[]',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE repo_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own repo connections"
  ON repo_connections FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own repo connections"
  ON repo_connections FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own repo connections"
  ON repo_connections FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own repo connections"
  ON repo_connections FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- ─── EXECUTION RUNS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS execution_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  synthesis_id uuid REFERENCES syntheses(id) ON DELETE SET NULL,
  repo_connection_id uuid REFERENCES repo_connections(id) ON DELETE SET NULL,
  execution_mode text NOT NULL DEFAULT 'analyze',
  status text NOT NULL DEFAULT 'pending',
  branch_name text DEFAULT '',
  pr_url text DEFAULT '',
  patch_content text DEFAULT '',
  result jsonb DEFAULT '{}',
  requires_approval boolean DEFAULT true,
  approved_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE execution_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own execution runs"
  ON execution_runs FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own execution runs"
  ON execution_runs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own execution runs"
  ON execution_runs FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── AUDIT EVENTS (IMMUTABLE) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES sessions(id) ON DELETE SET NULL,
  event_type text NOT NULL DEFAULT '',
  actor text DEFAULT '',
  provider text DEFAULT '',
  model text DEFAULT '',
  repo_scope text DEFAULT '',
  execution_mode text DEFAULT '',
  requires_approval boolean DEFAULT false,
  succeeded boolean DEFAULT true,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own audit events"
  ON audit_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own audit events"
  ON audit_events FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ─── APPROVAL REQUESTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_run_id uuid NOT NULL REFERENCES execution_runs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type text NOT NULL DEFAULT '',
  description text DEFAULT '',
  status text NOT NULL DEFAULT 'pending',
  decided_at timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE approval_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can select own approval requests"
  ON approval_requests FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own approval requests"
  ON approval_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own approval requests"
  ON approval_requests FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ─── INDEXES ──────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS workspaces_user_id_idx ON workspaces(user_id);
CREATE INDEX IF NOT EXISTS sessions_workspace_id_idx ON sessions(workspace_id);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS rounds_session_id_idx ON rounds(session_id);
CREATE INDEX IF NOT EXISTS responses_round_id_idx ON responses(round_id);
CREATE INDEX IF NOT EXISTS audit_events_user_id_idx ON audit_events(user_id);
CREATE INDEX IF NOT EXISTS audit_events_session_id_idx ON audit_events(session_id);
CREATE INDEX IF NOT EXISTS audit_events_created_at_idx ON audit_events(created_at DESC);
