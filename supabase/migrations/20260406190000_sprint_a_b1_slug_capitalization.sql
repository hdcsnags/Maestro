/*
  # Sprint A · B1.2 — display_name capitalization + slug safety net

  Idempotent. Preserves is_active toggles, scoped_paths, custom names.
*/

-- OpenAI: ensure "GPT-5.4 Mini" capital M
UPDATE agents
  SET display_name = 'GPT-5.4 Mini',
      name = CASE WHEN name IN ('GPT-5.4 mini', 'GPT-4o mini') THEN 'GPT-5.4 Mini' ELSE name END
  WHERE provider = 'openai'
    AND model = 'gpt-5.4-mini'
    AND display_name IN ('GPT-5.4 mini', 'GPT-4o mini');

-- OpenAI: lingering gpt-4o / o1 → gpt-5.4 safety net
UPDATE agents
  SET model = 'gpt-5.4',
      display_name = 'GPT-5.4'
  WHERE provider = 'openai' AND model IN ('gpt-4o', 'o1');

UPDATE agents
  SET model = 'gpt-5.4-mini',
      display_name = 'GPT-5.4 Mini'
  WHERE provider = 'openai' AND model = 'gpt-4o-mini';

-- Google: lingering 1.5 / preview slugs → 2.5
UPDATE agents
  SET model = 'gemini-2.5-flash',
      display_name = 'Gemini 2.5 Flash'
  WHERE provider = 'google'
    AND model IN ('gemini-1.5-flash', 'gemini-3-flash-preview', 'gemini-2.0-flash');

UPDATE agents
  SET model = 'gemini-2.5-pro',
      display_name = 'Gemini 2.5 Pro'
  WHERE provider = 'google' AND model = 'gemini-1.5-pro';
