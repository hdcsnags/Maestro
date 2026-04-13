# MAESTRO_STATE.md
*Universal onboarding document for all agents (CLI and web). Read AGENTS.md for update rules.*

---

## Read This First

| Field | Value |
|-------|-------|
| Primary branch | `main` |
| Active blockers | Build broadcast → execute flow still untested end-to-end |
| Last verified deploy | 14 protected functions redeployed on 2026-04-12; live runtime smoke tested on deployed `vault` after deploy |
| Unapplied migrations | 2 unapplied: `20260410143000_promote_gpt54_builder.sql` (verified 2026-04-12), `20260412200000_add_session_mode.sql` (new, 2026-04-12) |
| Active locks | None |

---

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
| Workspace CRUD | `src/hooks/useWorkspace.ts` (ensureWorkspace, ensureAgents, sessions) |
| Types | `src/types/index.ts` (source of truth for all shared interfaces) |
| Build UI | `src/components/reveal/BuildWorkspace.tsx` |
| Pre-Build UI | `src/components/reveal/PreBuildPanel.tsx` |
| Design UI | `src/components/reveal/DesignPhase.tsx` |
| Agent picker | `src/components/reveal/OrchestraDrawer.tsx` |
| Prompt input | `src/components/reveal/RevealComposer.tsx` |`r`n| Frontend edge invoke helper | `src/lib/functions.ts` |`r`n| Shared edge auth helper | `supabase/functions/_shared/auth.ts` |`r`n| Edge function config | `supabase/config.toml` |
| Edge functions | `supabase/functions/*/index.ts` |
| Migrations | `supabase/migrations/` |

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

## Database (19 active tables)

Core: workspaces, agents, sessions (has `mode`: 'ask'|'build'), rounds, responses, syntheses
GitHub: repo_connections, execution_runs, approval_requests
Security: provider_connections, encrypted_secrets, audit_events
Sprint B: design_artifacts, build_lanes, bouncer_events, build_reports, concierge_decisions
Legacy (unused): agent_skills, flags

## Agent Roster

15 agents: 5 provider groups × 3 slots. Only slot-0 active by default.

**Source of truth for model names: `src/types/index.ts`** — if what's listed below disagrees with that file, the file wins.

| Provider | Slot 0 | Slot 1 | Slot 2 |
|----------|--------|--------|--------|
| anthropic | Haiku 4.5 | Sonnet 4.6 | Opus 4.6 |
| openai | GPT-5.4 Mini | GPT-5.4 Builder | GPT-5.4 (Reasoning) |
| google | Gemini 2.5 Flash | Gemini 2.5 Pro | Gemini 2.5 Flash |
| openrouter_a | GPT-OSS 20B (free) | Gemma 4 31B (free) | Llama 4 Maverick |
| openrouter_b | Sonnet 4.6 (OR) | GPT-5.4 Builder (OR) | Kimi K2 |

**Last verified against `src/types/index.ts`**: 2026-04-12

## Non-Obvious Decisions (the "why" archive)

- **GitHub App, not OAuth App**: Maestro is registered as GitHub App "MaestroThamos". `X-OAuth-Scopes` header is always empty — permissions come from the App installation manifest, not OAuth scopes. Never check for `repo` scope.
- **Single token**: One GitHub token per user (stored in `encrypted_secrets` where `provider='github'`). It's a user-to-server token. github-repos, github-execute, and github-create-repo all use it.
- **ARCHITECT.md never committed via github-execute**: The edge function blocks writes to ARCHITECT.md. It's generated and stored in `sessions.architect_md` only.
- **Truncation guard**: github-execute rejects file content containing `// ... existing code` patterns. Catches LLM laziness but can false-positive on legitimate comments — known tradeoff, accepted.
- **Build spec locking**: `sessions.build_spec_locked` must be true before build phase. github-execute checks server-side. Prevents mid-build spec mutations.
- **Lane scope is authoritative in build mode**: `build_lanes.lane_paths` determines what files an agent can write, not `agents.scoped_paths`. Lanes are populated from Architect.md parsing.
- **Edge auth is enforced in-function, not at the gateway**: With Supabase JWT Signing Keys, all protected functions set `verify_jwt = false` in `supabase/config.toml`, enter `supabase/functions/_shared/auth.ts`, and expect the frontend to call them through `supabase.functions.invoke(...)` so the real user session token is attached.

## Patterns & Conventions

- **TypeScript strict mode is on** — `noUnusedLocals`, `noUnusedParameters` enforced. Dead code will fail the build.
- **All shared types go in `src/types/index.ts` only** — never inline interfaces in components.
- **Use `.maybeSingle()` not `.single()`** for Supabase queries — `.single()` throws on zero rows.
- **Component internal ordering**: state declarations → useEffect hooks → handler functions → JSX return.
- **`audit_events` is append-only** — never UPDATE or DELETE rows. RLS enforces this.
- **Custom CSS classes for the carousel live in `index.css`** — do not replicate carousel animations with Tailwind utilities.

---

# Part 2 — Operational State

*Updated every session. Every claim here MUST have a verification date or be marked `unverified`.*

## What's Working

| Capability | Verified |
|------------|----------|
| GitHub OAuth authorize + token exchange path exists in code | 2026-04-12 (code verified) |
| GitHub repo listing (all visibility levels, paginated up to 1000) | *(unverified)* |
| GitHub repo creation (requires Administration:write on App) | 2026-04-12 |
| 14 protected edge functions redeployed with shared in-function auth (`verify_jwt = false`) | 2026-04-12 |
| Frontend protected edge-function callers migrated to `supabase.functions.invoke(...)` | 2026-04-12 (`npm run typecheck`) |
| Multi-provider agent orchestration path exists in code (Anthropic/OpenAI/Google/OpenRouter) | 2026-04-12 (code verified) |
| Concierge triage + concierge synthesis flow exists in code | 2026-04-12 (code verified) |
| Design phase with multi-lane HTML mockup generation path exists in code | 2026-04-12 (code verified) |
| Pre-Build flow exists in code (intake, Architect.md, build spec lock, lane assignment) | 2026-04-12 (code verified) |
| Build phase broadcast + response review UI exists in code | 2026-04-12 (code verified) |
| Execute Build with patches wired in BuildWorkspace.tsx | 2026-04-12 |
| Deployed `vault?action=list` succeeds with a real user session under the new auth model | 2026-04-12 (live smoke) |
| Deployed `vault?action=list` fails in-function with `401 AUTH_HEADER_MISSING` when auth is missing | 2026-04-12 (live smoke) |
| Orb state machine derivation wired into EmptyStage/WorkspacePage and committed | 2026-04-12 (`npm run typecheck`, commit `4fb823c`) |
| Bouncer security review gate post-build exists in code | 2026-04-12 (code verified) |
| Tiered context system (synthesis > recent rounds > pinned > filename refs) | 2026-04-12 (code verified) |
| Build artifact protocol hardening (`artifact_protocol`, `complete`, `continuation_prompt`, manifest validation) | 2026-04-12 (`npm run typecheck`) |
| Scope enforcement: out-of-scope files skipped with reason logged | 2026-04-12 (code verified) |
| Truncation guard: regex catches lazy `// ... existing code` stubs | 2026-04-12 (code verified) |
| Ask/Build session mode split — mode picker on home screen, composer tab gating, concierge Convert to Build, session dropdown indicator | 2026-04-12 (`npm run typecheck`) |

## What's Broken or Incomplete

| Issue | Since | Owner |
|-------|-------|-------|
| Migration `20260412200000_add_session_mode.sql` needs to be applied remotely | 2026-04-12 | Unassigned |

| Issue | Since | Owner |
|-------|-------|-------|
| Build broadcast → Execute flow untested end-to-end | 2026-04-12 | Unassigned |
| Council auth fixes landed but still need live smoke test after `supabase.functions.invoke` migration | 2026-04-12 | Unassigned |
| No real-time streaming — responses arrive all at once; StreamingFolio is visual-only | Pre-existing | — |
| Concierge auto-trigger after build broadcast may double-fire | Pre-existing | — |
| github-create-repo: no in-app guidance when Administration:write is missing | 2026-04-12 | — |
| GitHub App install UX still manual — backend capability exists, in-app detection/prompt does not | Pre-existing | — |
| No markdown rendering in FolioCard response content | Pre-existing | — |
| No merge strategy for synthesized execution (last write wins on path collisions) | Pre-existing | — |
| Legacy tables (agent_skills, flags) still in schema but unused | Pre-existing | — |

## Known Drift Risks

These areas change often and should be re-verified after any significant work session:

- **Model roster** — check `src/types/index.ts` against the Agent Roster table in Part 1
- **Deployed function status** — `supabase functions list` vs the Edge Functions table
- **Migration status** — check for unapplied migrations in `supabase/migrations/`
- **Frontend bundle status** — does `npm run build` pass clean?

## Next Logical Steps

1. Smoke test the full Build flow: Pre-Build lock → Build broadcast → review responses → Execute Build → verify files written to GitHub
2. If patches reach github-execute correctly, test bouncer gate after build completes
3. Add GitHub App install detection (`/user/installations`) so UI can prompt users who authorized but haven't installed

---

# Part 3 — Session Log

*Append-only, newest first. Never delete entries.*

### 2026-04-12 — Claude Code (Opus 4.6)

**What was done**: Implemented Ask/Build session mode split. Added `mode` column to sessions table (migration), two-door mode picker on EmptyStage home screen, composer tab gating (Ask mode hides Build/Artifact tabs), concierge "Convert to Build" button after 2+ rounds in Ask mode, session dropdown mode indicator, and Ask mode guard on phase advancement.

**Files touched**: `supabase/migrations/20260412200000_add_session_mode.sql`, `src/types/index.ts`, `src/hooks/useWorkspace.ts`, `src/components/reveal/EmptyStage.tsx`, `src/components/reveal/RevealComposer.tsx`, `src/components/reveal/ConciergePanel.tsx`, `src/components/reveal/SessionSwitcher.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- `mode` defaults to `'ask'` for new sessions; existing sessions backfilled to `'build'` in migration.
- Ask mode reuses the full orchestration pipeline (broadcast, synthesis, concierge) — only build-phase UI is hidden, not backend logic.
- Phase advancement blocked in concierge `handleProceed` for Ask mode — prevents accidental design/pre_build/build transitions.
- "Convert to Build" appears after 2+ rounds so the concierge has enough context to meaningfully transition.
- Build-phase components (PreBuildPanel, DesignPhase, BuildWorkspace, BuildReport) naturally self-gate via `current_phase` checks — no additional gating needed.
- Updated Part 1 (database section) since sessions table schema changed.

**What didn't work**: N/A — typecheck passed clean on first run.

---

### 2026-04-12 — OpenAI Codex

**What was done**: Reworked Supabase Edge Function auth for JWT Signing Keys. Added a shared in-function auth helper, disabled gateway `verify_jwt` for all protected functions, migrated all protected frontend callers to `supabase.functions.invoke(...)`, redeployed all 14 protected functions, and live-smoked deployed `vault?action=list` with and without a real user session.

**Files touched**: `MAESTRO_STATE.md`, `src/lib/functions.ts`, `src/hooks/useOrchestration.ts`, `src/components/reveal/BuildWorkspace.tsx`, `src/components/reveal/DesignPhase.tsx`, `src/components/reveal/ExecutionModal.tsx`, `src/components/reveal/PreBuildPanel.tsx`, `src/components/reveal/RepoSection.tsx`, `src/components/reveal/VaultDrawer.tsx`, `supabase/config.toml`, `supabase/functions/_shared/auth.ts`, `supabase/functions/architect/index.ts`, `supabase/functions/bouncer/index.ts`, `supabase/functions/concierge/index.ts`, `supabase/functions/concierge-triage/index.ts`, `supabase/functions/design/index.ts`, `supabase/functions/github-auth/index.ts`, `supabase/functions/github-create-repo/index.ts`, `supabase/functions/github-execute/index.ts`, `supabase/functions/github-read/index.ts`, `supabase/functions/github-repos/index.ts`, `supabase/functions/intake/index.ts`, `supabase/functions/orchestrate/index.ts`, `supabase/functions/synthesize/index.ts`, `supabase/functions/vault/index.ts`

**Decisions made**:
- Moved protected edge auth enforcement entirely into `supabase/functions/_shared/auth.ts` and set `verify_jwt = false` for every protected function to avoid gateway-level JWT signing-key incompatibility.
- Standardized frontend protected calls on `src/lib/functions.ts` + `supabase.functions.invoke(...)` so the real session token is attached consistently.
- Used deployed `vault?action=list` as the smoke target because it is protected, low-risk, and exercises the new auth contract cleanly.
- Updated Part 1 because the edge auth model is now structurally different.

**What didn't work**: The first live smoke hit older deployed code until the functions were redeployed; a few regex-based frontend edits also needed manual cleanup before `npm run typecheck` passed.

---
### 2026-04-12 — Claude Code (Opus 4.6)

**What was done**: Wired patches into BuildWorkspace.tsx handleExecute so Execute Build sends approved agent responses as patches[] to github-execute. Previously the frontend never sent patches, causing a NO_PATCHES 400 every time.

**Files touched**: `src/components/reveal/BuildWorkspace.tsx`

**Decisions made**:
- Patches assembled from `buildResponses` filtered by `approvedResponseIds` — approval UI already existed, but the mapping to `AgentPatch` shape and POST body inclusion was missing.
- `scoped_paths` come from `lanes` table (matched by agent_name), not from the agent record — lanes are authoritative scope in build phase.
- `commit_message` defaults to `"${agent_name}: build patch"` — no user input yet.

**What didn't work**: N/A — single edit landed clean.

---

### 2026-04-12 — OpenAI Codex

**What was done**: Verified remote operational status for the shared docs. Confirmed 14 active edge functions via `supabase functions list` and confirmed exactly one unapplied migration via `supabase migration list`.

**Files touched**: `MAESTRO_STATE.md`, `AGENTS.md`

**Decisions made**:
- Promoted migration status from placeholder to verified fact because the remote project was directly queryable.
- Kept unresolved runtime paths marked as untested instead of upgrading them to "working" from deploy status alone.
- Relaxed one `AGENTS.md` duplication rule so `MAESTRO_STATE.md` can continue serving web-agent cold-start needs.

**What didn't work**: N/A — remote CLI checks returned cleanly.

---

### 2026-04-12 — OpenAI Codex

**What was done**: Orb state machine implementation completed and committed. Added `deriveOrbState()` in `src/lib/orbState.ts`, refactored `EmptyStage.tsx` into a pure renderer, and wired the derived orb state through `WorkspacePage.tsx`.

**Files touched**: `src/lib/orbState.ts`, `src/components/reveal/EmptyStage.tsx`, `src/pages/WorkspacePage.tsx`, `src/context/MaestroContext.tsx`

**What didn't work**: N/A — `npm run typecheck` passed after implementation. Committed as `4fb823c Add derived orb state machine`.

---

### 2026-04-12 — OpenAI Codex

**What was done**: Replaced manual edge-function auth headers in `useOrchestration.ts` with `supabase.functions.invoke(...)` for `orchestrate`, `concierge-triage`, `concierge`, and `synthesize`. This followed a prior fix that removed anon-key fallback / invalid JWT behavior.

**Files touched**: `src/hooks/useOrchestration.ts`

**Decisions made**:
- Stopped hand-rolling `Authorization` headers for council calls and let the Supabase client carry auth context.
- Kept `ensureSession()` as the gate before authenticated orchestration calls.
- Left runtime verification open because the code path is fixed but not yet smoked end-to-end.

**What didn't work**: Initial auth fix still left too much manual header logic; second pass moved the path to `functions.invoke(...)`.

---

### 2026-04-10 — OpenAI Codex

**What was done**: Hardened build artifact parsing and validation. Added provider-aware output budgets, manifest validation metadata, builder execution filtering, and promoted GPT-5.4 to the explicit OpenAI builder lane.

**Files touched**: `supabase/functions/orchestrate/index.ts`, `supabase/functions/github-execute/index.ts`, `src/hooks/useOrchestration.ts`, `src/components/reveal/BuildWorkspace.tsx`, `src/types/index.ts`, `supabase/migrations/20260410143000_promote_gpt54_builder.sql`

**Decisions made**:
- Kept `file_manifest` as the compatibility layer, but added `artifact_protocol`, `complete`, `continuation_prompt`, and `manifest_errors`.
- Blocked incomplete or invalid manifests in the review UI before GitHub execution.
- Renamed the GPT-5.4 premium lane to explicit builder language so the docs and UI match the intended pairing with Sonnet.

**What didn't work**: Runtime smoke test of the full build path still pending.

---

### 2026-04-10 — OpenAI Codex

**What was done**: Stabilized design artifact previews. Standard design mode now uses GPT-5.4 for Visual Lead and Claude Sonnet 4.6 for Structure Lead; frontend and edge parsing now recover HTML from fenced/nested JSON safely.

**Files touched**: `src/components/reveal/DesignPhase.tsx`, `supabase/functions/design/index.ts`, `src/types/index.ts`

**Decisions made**:
- Increased design output budgets.
- Cleaned `html_content` at both ingestion and render time.
- Expanded the preview UI so the standard two-designer flow is actually usable.

**What didn't work**: N/A — local validation passed; backend deploy was completed for `design` parsing changes earlier in the same effort.

---

## Open Questions

- Should github-create-repo show a better error when Administration:write permission is missing?
- Is the build broadcast prompt (currently hardcoded in BuildWorkspace) good enough, or should it come from the concierge `pre_build_complete` output?
- Do we need a re-broadcast mechanism if agent responses have no file_manifest?



