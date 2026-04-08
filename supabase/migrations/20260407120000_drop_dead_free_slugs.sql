/*
  # Drop dead free slugs — qwen/qwen3.6-plus:free + deepseek-chat-v3-0324:free

  Both endpoints went dead 2026-04-07. Migrate any existing agent rows
  to openai/gpt-oss-20b:free as the new free default. Idempotent.
*/

UPDATE agents
  SET model = 'openai/gpt-oss-20b:free',
      display_name = 'GPT-OSS 20B (free)',
      name = 'GPT-OSS 20B (free)'
  WHERE provider = 'openrouter'
    AND model = 'qwen/qwen3.6-plus:free';

UPDATE agents
  SET model = 'google/gemma-4-31b-it:free',
      display_name = 'Gemma 4 31B (free)',
      name = 'Gemma 4 31B (free)'
  WHERE provider = 'openrouter'
    AND model = 'deepseek/deepseek-chat-v3-0324:free';
