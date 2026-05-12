# Maestro — Stable Architecture Reference

*Extracted from MAESTRO_STATE.md. Updated only when system structurally changes (new edge functions, tables, providers, key files, build phases).*

# Part 1 — Stable Architecture

*Updated only when the system structurally changes. Not session-volatile.*

## What Maestro Is

Maestro is a multi-agent AI orchestration console. A user (the "Conductor") broadcasts a prompt to multiple AI agents across providers (Anthropic, OpenAI, Google, OpenRouter), reviews their competing responses side-by-side, synthesizes the best ideas, and — in build mode — commits real code to GitHub through scoped, lane-assigned agents.

It exists because no tool lets one person direct an entire AI orchestra from ideation through secure code delivery.

## Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Supabase (Postgres + Auth + Edge Functions in Deno)
- **Providers**: Anthropic, OpenAI, Google, OpenRouter (BYOK via encrypted_secrets)
- **GitHub**: GitHub App "MaestroThamos" (OAuth user-to-server tokens)

## Build Phases

`analysis → design → pre_build → build → bouncer → complete`

## Key Files

| Area | Files |
|------|-------|
| Entry point | `src/pages/WorkspacePage.tsx` |
| Global state | `src/context/MaestroContext.tsx` |
| Auth | `src/context/AuthContext.tsx` |
| Orchestration logic | `src/hooks/useOrchestration.ts` (broadcast, synthesize, callAgent) |
| Build v2 execution | `src/hooks/useBuildExecution.ts` (task decompose, dispatch loop, retry/reroute) |
| Workspace CRUD | `src/hooks/useWorkspace.ts` (ensureWorkspace, ensureAgents, sessions) |
| Types | `src/types/index.ts` (source of truth for all shared interfaces) |
| Build UI | `src/components/reveal/BuildWorkspace.tsx` |
| Pre-Build UI | `src/components/reveal/PreBuildPanel.tsx` |
| Design UI | `src/components/reveal/DesignPhase.tsx` |
| Design role metadata | `src/lib/designRoles.ts` |
| Agent picker | `src/components/reveal/OrchestraDrawer.tsx` |
| Prompt input | `src/components/reveal/RevealComposer.tsx` |
| Frontend edge invoke helper | `src/lib/functions.ts` |
| Shared edge auth helper | `supabase/functions/_shared/auth.ts` |
| Edge function config | `supabase/config.toml` |
| Edge functions | `supabase/functions/*/index.ts` |
| Migrations | `supabase/migrations/` |
| Claw Mode chat | `src/components/reveal/ClawMode.tsx` |
| Thread hook | `src/hooks/useThreads.ts` |
| Claw Mode spec | `CLAW_MODE_SPEC.md` |
| Claw UI issues | `CLAW_UI_ISSUES.md` |

## Edge Functions

| Function | Purpose |
|----------|---------|
| `orchestrate` | Core agent call (routes to any provider) |
| `synthesize` | Merge responses via Haiku |
| `concierge` | Alignment/tension/direction synthesis |
| `concierge-triage` | Fast-path routing (Haiku) |
| `architect` | Generate ARCHITECT.md from build spec |
| `design` | Multi-lane HTML mockup generation |
| `intake` | Scan repo for tech stack/risks |
| `bouncer` | Security review gate |
| `github-auth` | OAuth flow (authorize, exchange, check, disconnect) |
| `github-repos` | List user repos |
| `github-create-repo` | Create repo on user's GitHub |
| `github-read` | Read repo tree/files |
| `github-execute` | Branch, commit, PR creation from patches |
| `vault` | API key CRUD (BYOK) |
| `executor-api` | MaestroClaw control plane (register, heartbeat, claim, complete, events) |
| `repo-memory-update` | Per-repo persistent memory CRUD (get/summarize/update_direct/forget) — DIFF-02 |

## Database (21 active tables)

Core: workspaces, agents, sessions (has `mode`: 'ask'|'build'), rounds, responses, syntheses
GitHub: repo_connections, execution_runs, approval_requests
Security: provider_connections, encrypted_secrets, audit_events
Sprint B: design_artifacts, build_lanes, bouncer_events, build_reports, concierge_decisions
Build v2: build_tasks (per-file task queue — status, prompt_slice, retry/reroute metadata)
Build v2 DIFF-03: sessions.architect_plan (structured lane plan JSON), build_prompt_logs (prompt diagnostics)
MaestroClaw: executors, executor_jobs, executor_job_events
Claw Mode: threads (type: concierge|broadcast|direct|execution), thread_messages
DIFF-02: repo_memory (per-user per-repo persistent context, composite PK user_id+repo_full_name)
Legacy (unused): agent_skills, flags

## Agent Roster

15 cloud agents: 5 provider groups × 3 slots. Only slot-0 active by default.
4 MaestroClaw agents: local CLI execution, build-only (not used for broadcast/analysis).

**Source of truth for model names: `src/types/index.ts`** — if what's listed below disagrees with that file, the file wins.

| Provider | Slot 0 | Slot 1 | Slot 2 |
|----------|--------|--------|--------|
| anthropic | Haiku 4.5 | Sonnet 4.6 | Opus 4.6 |
| openai | GPT-5.4 Mini | GPT-5.4 Builder | GPT-5.4 (Reasoning) |
| google | Gemini 2.5 Flash | Gemini 2.5 Pro | Gemini 2.5 Flash |
| openrouter_a | GPT-OSS 20B (free) | Gemma 4 31B (free) | Llama 4 Maverick |
| openrouter_b | Sonnet 4.6 (OR) | GPT-5.4 Builder (OR) | Kimi K2 |
| **maestroclaw** | **ClawClaude** (claude_code) | **ClawCopilot** (copilot_cli) | **ClawCodex** (codex_cli) | **ClawGemini** (gemini_cli) |

**Claw agents**: selectable as builders in Pre-Build. Score boosted when executor online (+60), penalized when offline (-40). Visible in Orchestra drawer with executor status badge. Hidden from Vault (no API key needed). Not used for broadcast — build-only.

**Last verified against `src/types/index.ts`**: 2026-04-20

## Non-Obvious Decisions (the "why" archive)

- **GitHub App, not OAuth App**: Maestro is registered as GitHub App "MaestroThamos". `X-OAuth-Scopes` header is always empty — permissions come from the App installation manifest, not OAuth scopes. Never check for `repo` scope.
- **Single token**: One GitHub token per user (stored in `encrypted_secrets` where `provider='github'`). It's a user-to-server token. github-repos, github-execute, and github-create-repo all use it.
- **ARCHITECT.md never committed via github-execute**: The edge function blocks writes to ARCHITECT.md. It's generated and stored in `sessions.architect_md` only.
- **Truncation guard**: github-execute rejects file content containing `// ... existing code` patterns. Catches LLM laziness but can false-positive on legitimate comments — known tradeoff, accepted.
- **Build spec locking**: `sessions.build_spec_locked` must be true before build phase. github-execute checks server-side. Prevents mid-build spec mutations.
- **Lane scope is authoritative in build mode**: `build_lanes.lane_paths` determines what files an agent can write, not `agents.scoped_paths`. Lanes are populated from Architect.md parsing.
- **Build v2 task queue**: Build v2 decomposes ARCHITECT.md into per-file `build_tasks` rows. Orchestrate has a `build_task` mode (lighter prompt, 8192 max tokens, no ARCHITECT.md injection). Execution loop in `useBuildExecution.ts` dispatches one file at a time per builder. Eliminates 504 timeouts from v1's all-files-at-once approach.
- **Build tasks are NOT rounds**: `build_tasks` is a separate table from `rounds`/`responses`. Build tasks don't create council rounds. This prevents semantic overloading of the existing data model.
- **Edge auth is enforced in-function, not at the gateway**: With Supabase JWT Signing Keys, all protected functions set `verify_jwt = false` in `supabase/config.toml`, enter `supabase/functions/_shared/auth.ts`, and expect the frontend to call them through `supabase.functions.invoke(...)` so the real user session token is attached.

## Patterns & Conventions

- **TypeScript strict mode is on** — `noUnusedLocals`, `noUnusedParameters` enforced. Dead code will fail the build.
- **All shared types go in `src/types/index.ts` only** — never inline interfaces in components.
- **Use `.maybeSingle()` not `.single()`** for Supabase queries — `.single()` throws on zero rows.
- **Component internal ordering**: state declarations → useEffect hooks → handler functions → JSX return.
- **`audit_events` is append-only** — never UPDATE or DELETE rows. RLS enforces this.
- **Custom CSS classes for the carousel live in `index.css`** — do not replicate carousel animations with Tailwind utilities.

---

