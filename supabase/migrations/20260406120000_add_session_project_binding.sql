-- Priority 8: Session project binding
-- Add github_repo (owner/repo format) and supabase_project_url fields to sessions.
-- These bind a session to a specific project context for the conductor's visibility.

ALTER TABLE sessions ADD COLUMN IF NOT EXISTS github_repo TEXT DEFAULT '';
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS supabase_project_url TEXT DEFAULT '';
