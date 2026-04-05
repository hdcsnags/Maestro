/*
  # Add slot_index and provider_group to agents

  ## Summary
  Supports the new provider card model where agents are grouped by provider
  with three model slots each. slot_index (0, 1, 2) identifies the slot
  within a provider group. provider_group identifies the provider grouping.

  ## Changes
  - Added `slot_index` (integer, default 0) to `agents`
  - Added `provider_group` (text, default '') to `agents`
  - Added `display_name` (text, default '') to `agents` for friendly model names
*/

ALTER TABLE agents ADD COLUMN IF NOT EXISTS slot_index integer DEFAULT 0;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS provider_group text DEFAULT '';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS display_name text DEFAULT '';
