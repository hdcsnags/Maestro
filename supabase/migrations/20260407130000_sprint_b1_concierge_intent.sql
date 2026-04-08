/*
  # Sprint B · B1 — Concierge intent classification

  Adds intent / design_mode / recommended_next_phase / reasoning columns
  to concierge_decisions so the concierge edge function can route the
  conductor to the right next phase automatically.
*/

ALTER TABLE concierge_decisions
  ADD COLUMN IF NOT EXISTS intent text
    CHECK (intent IN (
      'simple_ask', 'product_build', 'ui_heavy',
      'existing_repo_change', 'new_project'
    )),
  ADD COLUMN IF NOT EXISTS design_mode text
    CHECK (design_mode IN ('none', 'lite', 'standard', 'exploration')),
  ADD COLUMN IF NOT EXISTS recommended_next_phase text
    CHECK (recommended_next_phase IN (
      'analysis', 'design', 'pre_build', 'build'
    )),
  ADD COLUMN IF NOT EXISTS intent_reasoning text;
