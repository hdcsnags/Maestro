-- Add mode column to sessions: 'ask' (council chat) or 'build' (phased flow).
-- Existing sessions default to 'build' since they were all build-oriented.
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'ask';

-- Backfill existing rows to 'build'
UPDATE sessions SET mode = 'build' WHERE mode = 'ask';

-- Constrain to valid values
ALTER TABLE sessions
  ADD CONSTRAINT sessions_mode_check CHECK (mode IN ('ask', 'build'));
