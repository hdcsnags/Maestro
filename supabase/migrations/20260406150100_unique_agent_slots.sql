/*
  # Step 2: Unique constraint on agent slots

  ## Why
  The previous migration (20260406150000_reseed_agents_5x3) wiped duplicate
  agents and reseeded the canonical 5×3 lineup. This migration locks the
  schema so duplicates can never come back: a unique index on
  (workspace_id, provider_group, slot_index) makes it structurally
  impossible to insert two agents into the same slot of the same
  provider group within the same workspace.

  Combined with the upsert(onConflict=...) pattern in the rewritten
  ensureAgents hook, race conditions across concurrent tab loads also
  resolve to a single canonical insert.

  ## Prerequisite
  Must run AFTER 20260406150000_reseed_agents_5x3.sql. If any duplicates
  remain in the agents table, this constraint creation will fail with
  "could not create unique index". That failure mode is the desired
  safety: it tells us the reseed didn't actually clean things up.
*/

ALTER TABLE agents
  ADD CONSTRAINT agents_workspace_slot_unique
  UNIQUE (workspace_id, provider_group, slot_index);
