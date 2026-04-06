-- Priority 9: Tiered context injection
-- Add is_pinned to responses so the conductor can mark specific agent
-- responses as persistent context for future rounds in the session.

ALTER TABLE responses ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS responses_pinned_idx ON responses(round_id) WHERE is_pinned = true;
