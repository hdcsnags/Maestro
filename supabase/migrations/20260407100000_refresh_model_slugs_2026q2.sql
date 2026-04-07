/*
  # Refresh model slugs — 2026 Q2

  ## Why
  OpenAI retired the GPT-4o family and o1; the GPT-5.4 family is the
  current generation. Google retired the Gemini 1.5 line and the
  gemini-3-flash-preview slug; gemini-2.5-flash is the recommended
  default and gemini-2.5-pro is the heavy reasoning model (with a
  shutdown date of June 17 2026 — track separately).

  All UPDATEs preserve user is_active toggles, scoped_paths, and
  custom display_names. Idempotent against fresh projects.
*/

-- OpenAI: gpt-4o → gpt-5.4, gpt-4o-mini → gpt-5.4-mini, o1 → gpt-5.4
UPDATE agents
  SET model = 'gpt-5.4',
      display_name = CASE WHEN display_name IN ('GPT-4o', 'o1') THEN 'GPT-5.4' ELSE display_name END,
      name = CASE WHEN name IN ('GPT-4o', 'o1') THEN 'GPT-5.4' ELSE name END
  WHERE provider = 'openai' AND model IN ('gpt-4o', 'o1');

UPDATE agents
  SET model = 'gpt-5.4-mini',
      display_name = CASE WHEN display_name = 'GPT-4o mini' THEN 'GPT-5.4 mini' ELSE display_name END,
      name = CASE WHEN name = 'GPT-4o mini' THEN 'GPT-5.4 mini' ELSE name END
  WHERE provider = 'openai' AND model = 'gpt-4o-mini';

-- Google: gemini-1.5-flash + gemini-3-flash-preview → gemini-2.5-flash
UPDATE agents
  SET model = 'gemini-2.5-flash',
      display_name = CASE
        WHEN display_name IN ('Gemini 1.5 Flash', 'Gemini 3 Flash') THEN 'Gemini 2.5 Flash'
        ELSE display_name END,
      name = CASE
        WHEN name IN ('Gemini 1.5 Flash', 'Gemini 3 Flash') THEN 'Gemini 2.5 Flash'
        ELSE name END
  WHERE provider = 'google' AND model IN ('gemini-1.5-flash', 'gemini-3-flash-preview');

-- Google: gemini-1.5-pro → gemini-2.5-pro
UPDATE agents
  SET model = 'gemini-2.5-pro',
      display_name = CASE WHEN display_name = 'Gemini 1.5 Pro' THEN 'Gemini 2.5 Pro' ELSE display_name END,
      name = CASE WHEN name = 'Gemini 1.5 Pro' THEN 'Gemini 2.5 Pro' ELSE name END
  WHERE provider = 'google' AND model = 'gemini-1.5-pro';

-- OpenRouter B — premium GPT-4o slot → openai/gpt-5.4
UPDATE agents
  SET model = 'openai/gpt-5.4',
      display_name = CASE WHEN display_name = 'GPT-4o (OR)' THEN 'GPT-5.4 (OR)' ELSE display_name END,
      name = CASE WHEN name = 'GPT-4o (OR)' THEN 'GPT-5.4 (OR)' ELSE name END
  WHERE provider = 'openrouter' AND model IN ('openai/gpt-4o', 'openai/o1');
