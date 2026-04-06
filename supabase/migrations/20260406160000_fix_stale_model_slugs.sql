/*
  # Fix stale model slugs

  ## Why
  Two slugs from the 5×3 reseed turned out to be dead/rotated:
    - qwen/qwen3-235b-a22b:free  → not in OpenRouter's live model list
    - gemini-2.0-flash            → superseded by Gemini 3 Flash on the
                                    free tier per Google's docs

  Both were causing 500s in orchestrate. This migration patches the
  existing seeded rows in place (UPDATE, not DELETE+reseed) so user
  toggles like is_active are preserved.
*/

UPDATE agents
SET name = 'Qwen 3.6 Plus',
    display_name = 'Qwen 3.6 Plus',
    model = 'qwen/qwen3.6-plus:free'
WHERE provider_group = 'openrouter_a'
  AND slot_index = 0
  AND model = 'qwen/qwen3-235b-a22b:free';

UPDATE agents
SET name = 'Gemini 3 Flash',
    display_name = 'Gemini 3 Flash',
    model = 'gemini-3-flash-preview'
WHERE provider_group = 'google'
  AND slot_index = 0
  AND model = 'gemini-2.0-flash';
