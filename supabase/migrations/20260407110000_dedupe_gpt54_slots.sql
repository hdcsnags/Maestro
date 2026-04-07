/*
  # Dedupe GPT-5.4 slots + differentiate display names

  Two issues collapse here:
  1. The B1 migration UPDATEd both gpt-4o and o1 → gpt-5.4. If a workspace
     had both rows, we now have two agents with model=gpt-5.4 in the same
     openai provider_group. This dedupes any true duplicates by
     (workspace_id, provider_group, slot_index), keeping the lowest id.
  2. Slot 1 (PM/Policy) and slot 2 (Reasoning) both used display_name
     'GPT-5.4', producing two visually identical tiles in the Advanced
     grid. Differentiate so users can tell them apart.
*/

-- 1. Dedupe row collisions (same workspace, group, slot)
DELETE FROM agents a
  USING agents b
  WHERE a.id > b.id
    AND a.workspace_id = b.workspace_id
    AND a.provider_group = b.provider_group
    AND a.slot_index = b.slot_index;

-- 2. Differentiate the two GPT-5.4 slots by display name + name
UPDATE agents
  SET display_name = 'GPT-5.4 (PM)',
      name = 'GPT-5.4 (PM)'
  WHERE provider = 'openai'
    AND provider_group = 'openai'
    AND slot_index = 1
    AND model = 'gpt-5.4';

UPDATE agents
  SET display_name = 'GPT-5.4 (Reasoning)',
      name = 'GPT-5.4 (Reasoning)'
  WHERE provider = 'openai'
    AND provider_group = 'openai'
    AND slot_index = 2
    AND model = 'gpt-5.4';
