-- PRO-01 follow-up — persist deliberation-aware synthesis structured fields.
--
-- The deliberation-aware synthesis call (post-PRO-01) returns richer fields:
--   { consensus, trade_offs, acknowledged_weaknesses, unresolved_tensions, recommendation, content }
--
-- Pre-this-migration: only `content` was persisted to `syntheses.content`. The
-- richer fields were dropped on the client because there was nowhere to store
-- them. SynthesisDrawer only rendered the prose.
--
-- This migration adds a `metadata jsonb` column for the structured fields so
-- the differentiating output of deliberation rounds (trade_offs, unresolved
-- tensions) actually surfaces to the user.
--
-- Backwards compat: legacy `syntheses` rows have `metadata = '{}'` and the
-- drawer falls back to rendering only `content` for them. Classic synthesis
-- (no deliberation on the round) continues to write metadata = '{}'.

ALTER TABLE syntheses ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- Optional: index for filtering rows that have non-empty deliberation output.
-- Useful for future analytics ("how often did deliberation surface real
-- trade_offs"). Cheap to maintain since most rows will have empty {}.
CREATE INDEX IF NOT EXISTS idx_syntheses_has_metadata
  ON syntheses ((metadata != '{}'::jsonb))
  WHERE metadata != '{}'::jsonb;
