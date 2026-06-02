# Database Tables

13 Supabase PostgreSQL tables. All have RLS enabled. 49 migrations applied (verified 2026-05-12).

## Core Data Model

| Table | Purpose | Key Columns |
|---|---|---|
| `workspaces` | Top-level container. One per user currently (multi-workspace not exposed in UI). | `id`, `user_id`, `name` |
| `agents` | The 5×3 agent roster (15 agents). | `workspace_id`, `provider_group`, `slot_index`, `is_active`, `scoped_paths`, `model`, `agent_name`, `agent_role` |
| `sessions` | Named work sessions within a workspace. | `workspace_id`, `title`, `created_at` |
| `rounds` | Each broadcast = one round within a session. | `session_id`, `prompt`, `mode`, `created_at` |
| `responses` | One row per agent per round. | `round_id`, `agent_id`, `content`, `signals`, `artifacts`, `file_manifest jsonb`, `is_flagged` |
| `syntheses` | Synthesis results per round. | `round_id`, `content`, `created_at` |
| `execution_runs` | GitHub execution run records. | `round_id`, `status`, `written_files`, `skipped_files`, `errors`, `branches`, `prs`, `blocked` |

## Memory & Context

| Table | Purpose | Key Columns |
|---|---|---|
| `repo_memory` | DIFF-02 flat project memory. **Enhancement planned:** add `kind TEXT` + `relations JSONB` columns for graph structure (C-02 in Conductor sprint). | `workspace_id`, `key`, `value`, `updated_at` |
| `repo_connections` | GitHub repo connections per workspace. | `workspace_id`, `repo_url`, `owner`, `repo`, `access_token` |
| `provider_connections` | AI provider metadata (keys stored encrypted via vault edge fn). | `workspace_id`, `provider`, `key_ref` |

## Personas & Audit

| Table | Purpose | Key Columns |
|---|---|---|
| `personas` | SOM-04: 4-persona seed (builder/skeptic/archivist/critic). | `workspace_id`, `slug`, `name`, `voice_preamble`, `deliberation_signature`, `strengths`, `weaknesses`, `routing_rules` |
| `audit_events` | **Append-only. Never update/delete.** All significant actions logged here. | `workspace_id`, `session_id`, `event_type`, `payload`, `created_at` |
| `build_lanes` | Build v2/v3: per-task lane assignments. | `round_id`, `file_path`, `agent_id`, `status`, `prompt_slice`, `dependency_on` |

## Agent Roster: 5×3 Grid

| Provider Group | Slot 0 (default ON) | Slot 1 | Slot 2 |
|---|---|---|---|
| `anthropic` | Claude Haiku 4.5 | Claude Sonnet 4.6 | Claude Opus 4.6 |
| `openai` | GPT-4o mini | GPT-4o | o1 |
| `google` | Gemini 3 Flash | Gemini 1.5 Pro | Gemini 1.5 Flash |
| `openrouter_a` | Qwen 3.6 Plus | DeepSeek V3 (free) | Llama 4 Maverick |
| `openrouter_b` | Sonnet 4.6 (OR) | GPT-4o (OR) | Kimi K2 |

Slot 0 agents (except `openrouter_b`) start `is_active=true`. Seeded by `supabase/migrations/*reseed_agents_5x3.sql`.

## Legacy Tables (safe to ignore)
- `agent_skills` — unused since cleanup sprint
- `flags` — legacy; flagging is done via `is_flagged` on `responses` directly

## Migration Discipline
- Format: `supabase/migrations/YYYYMMDDHHMMSS_description.sql`
- Always use `IF NOT EXISTS` + RLS + policies
- Regenerate types: `npx supabase gen types typescript` after any migration
- `database.types.ts` is generated — never hand-edit

## Related Notes
- [[Architecture]]
- [[Edge-Functions]]
- [[Key-Files]]
