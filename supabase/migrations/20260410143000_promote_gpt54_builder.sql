/*
  Promote GPT-5.4 to the OpenAI builder lane.

  Maestro's premium build pair should be Claude Sonnet 4.6 + GPT-5.4.
  Earlier migrations left the direct OpenAI GPT-5.4 slot labeled as PM/policy,
  which made automatic builder selection less explicit.
*/

UPDATE agents
  SET name = 'GPT-5.4 Builder',
      display_name = 'GPT-5.4 Builder',
      role = 'Build lead · Code generation'
  WHERE provider = 'openai'
    AND provider_group = 'openai'
    AND slot_index = 1
    AND model = 'gpt-5.4';

UPDATE agents
  SET name = 'GPT-5.4 Builder (OR)',
      display_name = 'GPT-5.4 Builder (OR)',
      role = 'Premium · Build lead'
  WHERE provider = 'openrouter'
    AND provider_group = 'openrouter_b'
    AND slot_index = 1
    AND model = 'openai/gpt-5.4';
