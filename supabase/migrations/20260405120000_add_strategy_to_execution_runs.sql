/*
  # Add strategy column to execution_runs

  ## Summary
  The frontend writes a `strategy` field ('per_agent' | 'synthesized') when creating
  execution runs, but the column was missing from the original schema migration.
  This caused insert failures.

  ## Changes
  - Added `strategy` (text, NOT NULL, default 'per_agent') to `execution_runs`
*/

ALTER TABLE execution_runs ADD COLUMN IF NOT EXISTS strategy text NOT NULL DEFAULT 'per_agent';
