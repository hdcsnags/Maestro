-- Claw Mode Phase 0: threads + thread_messages + agent_role
-- Threads replace rounds as the primary conversational primitive.
-- See CLAW_MODE_SPEC.md for full architecture.

-- 1. Threads table
CREATE TABLE IF NOT EXISTS threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('concierge', 'broadcast', 'direct', 'execution')),
  agent_id uuid REFERENCES agents(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'pinned', 'archived')),
  include_in_synthesis boolean NOT NULL DEFAULT true,
  parent_thread_id uuid REFERENCES threads(id),
  title text,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_threads_session ON threads(session_id);
CREATE INDEX IF NOT EXISTS idx_threads_session_type ON threads(session_id, type);
CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(session_id, status);

ALTER TABLE threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY threads_owner ON threads FOR ALL USING (
  EXISTS (
    SELECT 1 FROM sessions s
    JOIN workspaces w ON s.workspace_id = w.id
    WHERE s.id = threads.session_id AND w.user_id = auth.uid()
  )
);

-- 2. Thread messages table
CREATE TABLE IF NOT EXISTS thread_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'agent', 'concierge', 'system')),
  agent_id uuid REFERENCES agents(id),
  content text NOT NULL,
  context_weight text NOT NULL DEFAULT 'primary' CHECK (context_weight IN ('primary', 'supporting', 'background')),
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_thread_messages_thread ON thread_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_thread_messages_created ON thread_messages(thread_id, created_at);

ALTER TABLE thread_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY thread_messages_owner ON thread_messages FOR ALL USING (
  EXISTS (
    SELECT 1 FROM threads t
    JOIN sessions s ON t.session_id = s.id
    JOIN workspaces w ON s.workspace_id = w.id
    WHERE t.id = thread_messages.thread_id AND w.user_id = auth.uid()
  )
);

-- 3. Agent role column (council vs executor)
ALTER TABLE agents ADD COLUMN IF NOT EXISTS agent_role text NOT NULL DEFAULT 'council'
  CHECK (agent_role IN ('council', 'executor'));

-- Set existing maestroclaw agents to executor role
UPDATE agents SET agent_role = 'executor' WHERE provider_group = 'maestroclaw';
