/*
  # Refresh OpenRouter slugs (round 2)

  ## Why
  Manual verification against openrouter.ai/api/v1/models turned up three
  more stale slugs that the prior 20260406160000 hotfix didn't catch:

    - meta-llama/llama-4-maverick:free  -> meta-llama/llama-4-maverick
        OpenRouter dropped the free variant. The non-free model exists
        and stays in the openrouter_a row even though it now costs money.
    - nvidia/nemotron-3-super:free      -> nvidia/nemotron-3-super-120b-a12b:free
        Slug got more specific.
    - qwen/qwen3-235b-a22b:free          -> qwen/qwen3.6-plus:free
        Defensive re-run of the prior fix in case any agents still have
        the old slug from a workspace seeded before 20260406160000.

  All three are in-place UPDATEs against agents.model so user is_active
  toggles are preserved.
*/

UPDATE agents
SET model = 'qwen/qwen3.6-plus:free'
WHERE model = 'qwen/qwen3-235b-a22b:free';

UPDATE agents
SET model = 'meta-llama/llama-4-maverick'
WHERE model = 'meta-llama/llama-4-maverick:free';

UPDATE agents
SET model = 'nvidia/nemotron-3-super-120b-a12b:free'
WHERE model = 'nvidia/nemotron-3-super:free';
