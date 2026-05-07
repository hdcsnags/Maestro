-- PRO-01 — Inter-agent deliberation round.
--
-- Adds deliberation columns to `responses` and `rounds` so the deliberate edge
-- function can store each agent's pushbacks alongside the original Round 1
-- responses, and so the synthesis function can detect deliberation completion.
--
-- See PRO-01_DELIBERATION_ROUND_SPEC.md for the full design.

-- ─── responses ──────────────────────────────────────────────────────────

-- kind: 'primary' for Round 1 (default for existing rows), 'deliberation' for
-- per-agent pushback rows written by the deliberate function.
ALTER TABLE responses ADD COLUMN IF NOT EXISTS kind text DEFAULT 'primary'
  CHECK (kind IN ('primary', 'deliberation'));

-- deliberation_targets: array of response_ids this deliberation row references
-- via its objection/agreement pushbacks. Useful for graph queries
-- ("who pushed back on response X?").
ALTER TABLE responses ADD COLUMN IF NOT EXISTS deliberation_targets uuid[] DEFAULT '{}';

-- deliberation_pushbacks: structured array of pushback objects:
--   [{ target_response_id, target_voice, agent_id, stance, summary, kind }]
-- See PRO-01_DELIBERATION_ROUND_SPEC.md §"Data Model Changes" for the full shape.
ALTER TABLE responses ADD COLUMN IF NOT EXISTS deliberation_pushbacks jsonb DEFAULT '[]'::jsonb;

-- Backfill any pre-existing rows so the constraint passes cleanly.
UPDATE responses SET kind = 'primary' WHERE kind IS NULL;

-- Index: lets per-round deliberation lookups skip a sort.
CREATE INDEX IF NOT EXISTS idx_responses_round_kind ON responses(round_id, kind);

-- ─── rounds ────────────────────────────────────────────────────────────

-- deliberation_enabled: set true when the deliberate function is invoked for
-- this round. Used by the UI to badge the round and unlock the
-- deliberation-aware synthesis surface.
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS deliberation_enabled boolean DEFAULT false;

-- deliberation_completed_at: set once the deliberate function finishes writing
-- all per-agent rows. The synthesize function uses this as the gate to switch
-- between classic synthesis and deliberation-aware synthesis.
ALTER TABLE rounds ADD COLUMN IF NOT EXISTS deliberation_completed_at timestamptz;

-- ─── notes ─────────────────────────────────────────────────────────────
--
-- - No RLS changes: deliberation rows inherit `responses` RLS. A user can read
--   their own session's deliberation rows; write goes through the edge function
--   under the user's auth context.
--
-- - No FK on `deliberation_targets[]` elements — Postgres doesn't natively
--   enforce array-element foreign keys, and the round_id constraint on the
--   parent row already scopes targets to the same round set. Validation is
--   the writer's responsibility (deliberate edge function).
--
-- - No backfill of `deliberation_completed_at` for legacy rounds. Rounds
--   created before this migration have null; synthesize() detects that and
--   falls back to classic synthesis (existing behavior preserved).
