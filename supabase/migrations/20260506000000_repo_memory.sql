-- DIFF-02: per-repo project memory
-- One row per (user, repo). Survives session boundaries.
-- Memory content is a markdown blob (~8KB cap), summarized by Haiku
-- after build completion. TrustDrawer Memory tab allows manual edits.

CREATE TABLE IF NOT EXISTS repo_memory (
  user_id            uuid         REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  repo_full_name     text         NOT NULL,
  content            text         NOT NULL DEFAULT '',
  metadata           jsonb        NOT NULL DEFAULT '{}'::jsonb,
  byte_count         int          NOT NULL DEFAULT 0,
  last_session_id    uuid,
  last_summarized_at timestamptz,
  created_at         timestamptz  NOT NULL DEFAULT now(),
  updated_at         timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, repo_full_name)
);

CREATE INDEX IF NOT EXISTS idx_repo_memory_user
  ON repo_memory(user_id);

ALTER TABLE repo_memory ENABLE ROW LEVEL SECURITY;

-- Owner-only access; edge functions use service-role key and bypass RLS.
CREATE POLICY repo_memory_owner ON repo_memory
  FOR ALL USING (user_id = auth.uid());

-- Realtime so TrustDrawer Memory tab updates live after summarize writes.
ALTER PUBLICATION supabase_realtime ADD TABLE repo_memory;
