/*
  # P-Cleanup: Reseed agents to canonical 5×3 structure (15 agents)

  ## Why
  Workspaces have accumulated duplicate agents — the JS-side dedupe in
  ensureAgents was not holding. This is a one-time hard reset: delete every
  agent (and every agent_skill, via the existing CASCADE) across every
  workspace, then reseed exactly 15 agents per workspace from a canonical
  list. A unique constraint on (workspace_id, provider_group, slot_index)
  is added in the next migration to make duplication structurally
  impossible going forward.

  ## What survives
  - responses.agent_id      -> ON DELETE SET NULL (history preserved;
    name/role/color are already denormalized onto each response row, so
    old folios still display correctly)
  - syntheses.lead_agent_id -> ON DELETE SET NULL (syntheses preserved)

  ## What is destroyed
  - All rows in agents
  - All rows in agent_skills (via CASCADE) — these were tied to duplicate
    or broken agent rows and are not worth preserving. Fresh start.

  ## The 5×3 lineup
  Five provider blocks: anthropic, openai, google, openrouter_a, openrouter_b.
  Each block has slot 0/1/2.

  Default-on policy: ONLY the four "free or near-free" slot-0 entries
  (Anthropic Haiku, OpenAI GPT-4o mini, Gemini Flash 2.0, OpenRouter A's
  Qwen 3 235B free) are is_active=true on seed. Every premium slot is OFF
  by default — including OpenRouter B slot 0. A brand-new user can sign
  up, broadcast, and pay $0 by default; premium voices are deliberate
  opt-in.

  ## Slug caveats (read me)
  - moonshotai/kimi-k2 — Moonshot has rotated Kimi K2 slugs in the past
    (e.g. moonshotai/kimi-k2-0905). If broadcasts to this row 404, update
    the slug to whatever OpenRouter currently lists. Kimi belongs on the
    council; the slug is the only fragile bit.

  ## Idempotency
  Safe to run on a fresh project (no agents to delete; reseed inserts 15
  per existing workspace, or 0 if no workspaces exist yet). Wrapped in a
  transaction so a partial failure rolls back cleanly.
*/

BEGIN;

-- 1. Hard reset
DELETE FROM agent_skills;
DELETE FROM agents;

-- 2. Reseed: 15 agents per existing workspace
--    Columns: name, display_name, role, provider, model, color,
--             is_active, slot_index, provider_group
INSERT INTO agents (
  workspace_id, user_id, name, display_name, role,
  provider, model, color, is_active, sort_order, slot_index, provider_group
)
SELECT
  w.id, w.user_id, a.name, a.display_name, a.role,
  a.provider, a.model, a.color, a.is_active, a.slot_index, a.slot_index, a.provider_group
FROM workspaces w
CROSS JOIN (VALUES
  -- ─── Anthropic ────────────────────────────────────────────
  ('Claude Haiku 4.5','Claude Haiku 4.5','Fast analysis · Triage',
   'anthropic','claude-haiku-4-5','#e07b5a',true ,0,'anthropic'),
  ('Claude Sonnet 4.6','Claude Sonnet 4.6','Build lead · Code generation',
   'anthropic','claude-sonnet-4-6','#e07b5a',false,1,'anthropic'),
  ('Claude Opus 4.6','Claude Opus 4.6','Deep reasoning · Architecture',
   'anthropic','claude-opus-4-6','#e07b5a',false,2,'anthropic'),

  -- ─── OpenAI ───────────────────────────────────────────────
  ('GPT-4o mini','GPT-4o mini','Fast drafting · Summarization',
   'openai','gpt-4o-mini','#5ab88e',true ,0,'openai'),
  ('GPT-4o','GPT-4o','PM · Policy · Scope enforcement',
   'openai','gpt-4o','#5ab88e',false,1,'openai'),
  ('o1','o1','Reasoning · Complex analysis',
   'openai','o1','#5ab88e',false,2,'openai'),

  -- ─── Google Gemini ────────────────────────────────────────
  ('Gemini 3 Flash','Gemini 3 Flash','Speed · Design · Spatial UI',
   'google','gemini-3-flash-preview','#5a8fe0',true ,0,'google'),
  ('Gemini 1.5 Pro','Gemini 1.5 Pro','Research · Long context',
   'google','gemini-1.5-pro','#5a8fe0',false,1,'google'),
  ('Gemini 1.5 Flash','Gemini 1.5 Flash','Long context · Flash',
   'google','gemini-1.5-flash','#5a8fe0',false,2,'google'),

  -- ─── OpenRouter A — Free row ──────────────────────────────
  ('Qwen 3.6 Plus','Qwen 3.6 Plus','Free · General purpose flagship',
   'openrouter','qwen/qwen3.6-plus:free','#8a8ae0',true ,0,'openrouter_a'),
  ('DeepSeek V3 (free)','DeepSeek V3 (free)','Free · Coding heavyweight',
   'openrouter','deepseek/deepseek-chat-v3-0324:free','#8a8ae0',false,1,'openrouter_a'),
  ('Llama 4 Maverick','Llama 4 Maverick','Free · Meta frontier',
   'openrouter','meta-llama/llama-4-maverick:free','#8a8ae0',false,2,'openrouter_a'),

  -- ─── OpenRouter B — Premium row (all OFF by default) ─────
  ('Sonnet 4.6 (OR)','Sonnet 4.6 (OR)','Premium · Build lead',
   'openrouter','anthropic/claude-sonnet-4-6','#8a8ae0',false,0,'openrouter_b'),
  ('GPT-4o (OR)','GPT-4o (OR)','Premium · Policy · PM',
   'openrouter','openai/gpt-4o','#8a8ae0',false,1,'openrouter_b'),
  -- Kimi K2 — slug may need updating; see header comment
  ('Kimi K2','Kimi K2','Premium · Long context · Reasoning',
   'openrouter','moonshotai/kimi-k2','#8a8ae0',false,2,'openrouter_b')
) AS a(
  name, display_name, role,
  provider, model, color, is_active, slot_index, provider_group
);

COMMIT;
