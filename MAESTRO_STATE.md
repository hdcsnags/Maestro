# MAESTRO_STATE.md
*Universal onboarding document for all agents (CLI and web). Read AGENTS.md for update rules.*

---

## Read This First

| Field | Value |
|-------|-------|
| Primary branch | `main` |
| Active blockers | Build broadcast → execute flow still untested end-to-end |
| Last verified deploy | `concierge` and `github-execute` redeployed on 2026-04-13; 14 protected functions previously redeployed on 2026-04-12; live runtime smoke still only verified on deployed `vault` |
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
| Design role metadata | `src/lib/designRoles.ts` |
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
| Design phase with full-screen carousel UX, tiered roles (Lite/Standard/Exploration), skip-to-build path | 2026-04-14 (code verified) |
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
| Ask/Build session mode split — composer Ask/Build toggle, orchestration tab gating, concierge Convert to Build, session dropdown indicator | 2026-04-13 (`npm run typecheck`) |
| Quick-answer triage can escalate to a full council round, and build sessions bypass quick-answer triage on first broadcast | 2026-04-13 (code verified, `npm run typecheck`) |
| Synthesis falls back to persisted round responses when local response state is stale, keeping concierge reachable after a council round | 2026-04-13 (code verified, `npm run typecheck`) |
| New sessions now start repo-unbound and GitHub repo binding is explicit per session in `RepoSection.tsx` / `useWorkspace.ts` | 2026-04-13 (code verified, `npm run typecheck`) |
| BuildWorkspace restores persisted build state before auto-planning and explains blocked builder responses in review | 2026-04-13 (code verified, `npm run typecheck`) |
| Concierge pre-build planning falls back to a deterministic build plan when Anthropic build-plan generation fails or returns malformed JSON | 2026-04-13 (code verified, `supabase functions deploy concierge`) |
| Build review keeps warning-bearing responses selectable when they still include a valid `file_manifest`; only truly incomplete manifests stay blocked | 2026-04-13 (code verified, `npm run typecheck`) |
| Build-mode broadcasts now skip prior-round baggage, no longer scrape prompt text for `context_files`, and inject lane-specific instructions per builder; `ARCHITECT.md` remains the build source of truth | 2026-04-13 (code verified, `npm run typecheck`) |
| Pre-Build now locks the builder roster into `build_spec`, `architect` restricts builder lanes to that roster, and `BuildWorkspace` respects locked builder IDs instead of re-casting builders at build time | 2026-04-13 (code verified, `npm run typecheck`) |
| BuildWorkspace now surfaces dispatching, waiting-on-provider, partial-results, GitHub-write, and bouncer-running states during build review/execution | 2026-04-13 (code verified, `npm run typecheck`) |
| `github-execute` now routes execution through empty-repo default-branch bootstrap before Maestro branches/PRs, allowing first-build execution into a new repo | 2026-04-13 (code verified, `npm run typecheck`) |

## What's Broken or Incomplete

| Issue | Since | Owner |
|-------|-------|-------|
| Migration `20260412200000_add_session_mode.sql` needs to be applied remotely | 2026-04-12 | Unassigned |

| Issue | Since | Owner |
|-------|-------|-------|
| Build broadcast → Execute flow untested end-to-end | 2026-04-12 | Unassigned |
| Council auth fixes landed but still need live smoke test after `supabase.functions.invoke` migration | 2026-04-12 | Unassigned |
| Builder count defaults and roster locking now exist in Pre-Build, but provider-health-aware failover and lane reroute policy are still not concierge-driven | 2026-04-13 | Unassigned |
| Build orchestration is still synchronous end-to-end; UI status is clearer now, but provider retries/reroutes are not yet queued mid-flight | 2026-04-13 | Unassigned |
| Design phase can still drop a designer preview when the returned payload does not match the expected HTML/JSON extraction path (reported in live smoke) | 2026-04-13 | Unassigned |
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

### 2026-04-13 — OpenAI Codex

**What was done**: Fixed the empty-repo execution path so `github-execute` now calls the default-branch bootstrap helper before any branch/PR work, and skips backup-branch creation when the repo was just initialized. Locked builder authority in Pre-Build by adding builder-count selection and a pinned builder roster in `build_spec`, then updated `architect` and `BuildWorkspace` so locked builder IDs stay authoritative once chosen. Re-ran `npm run typecheck` cleanly.

**Files touched**: `src/components/reveal/PreBuildPanel.tsx`, `src/components/reveal/BuildWorkspace.tsx`, `supabase/functions/architect/index.ts`, `supabase/functions/github-execute/index.ts`, `MAESTRO_STATE.md`

**Decisions made**:
- Kept repo initialization lazy at execution time instead of auto-initializing on repo selection, but surfaced the expectation in Pre-Build.
- Made Pre-Build the source of truth for builder count and roster, then constrained `architect` and Build to that locked roster instead of allowing late fuzzy re-casting.
- Left backward-compatible active-agent recovery in `BuildWorkspace` only for older sessions that do not yet have locked builder IDs.

**What didn't work**: This pass did not deploy any functions or run a live end-to-end smoke. Provider-health-aware reroute/failover and design-preview diagnostics are still pending follow-up work.

---
### 2026-04-13 — OpenAI Codex

**What was done**: Turned the `smoketestaudit.md` findings into a targeted build-path hardening pass. `useOrchestration` now strips prior-round context out of build-mode broadcasts, routes concierge lane instructions into per-builder prompts, and records provider errors with the actual failure reason instead of always blaming missing API keys. `BuildWorkspace` now prefers active build-capable agents when recovering generic builder lanes, shows dispatch / waiting / partial / GitHub-write / bouncer-running states, and updates lane bars from live response state. `architect` now prefers active strong builders over weak free defaults when auto-assigning generic builder lanes. Re-ran `npm run typecheck` cleanly.

**Files touched**: `src/hooks/useOrchestration.ts`, `src/components/reveal/BuildWorkspace.tsx`, `supabase/functions/architect/index.ts`, `MAESTRO_STATE.md`

**Decisions made**:
- Kept concierge's shared build prompt, but overlayed lane-specific instructions at broadcast time instead of redesigning the build-plan schema.
- Preferred active agents first and penalized free/general-purpose fallbacks instead of hardcoding a brittle builder allowlist.
- Improved build-state truthfulness in the UI without trying to rewrite orchestration into an async job queue in the same pass.

**What didn't work**: This pass did not make build orchestration asynchronous, add live provider-health rerouting, or run a deployed end-to-end smoke. Verification here is limited to code review and `npm run typecheck`.

---
### 2026-04-13 — OpenAI Codex

**What was done**: Patched two live build blockers discovered in smoke testing. First, `buildTieredContext()` no longer scrapes the generated build prompt for `context_files`, which had been sending nonsense entries like `127.0.0.1`, semver strings, and every filename from `ARCHITECT.md` into provider calls and likely contributing to build-time 504s. Second, `github-execute` now bootstraps the default branch for an empty repository by creating an initial root commit before Maestro creates per-agent branches, so new-project builds can execute into an intentionally empty GitHub repo. Re-ran `npm run typecheck` cleanly and redeployed `github-execute`.

**Files touched**: `src/hooks/useOrchestration.ts`, `supabase/functions/github-execute/index.ts`, `MAESTRO_STATE.md`

**Decisions made**:
- Build-mode prompt text is no longer a source for repo file hydration; `ARCHITECT.md` and explicit scoped paths already carry the build context and are less error-prone.
- Kept the repo bootstrap inside `github-execute` so the existing branch/PR flow still works after a new repo is initialized, instead of splitting execution into separate new-repo and existing-repo codepaths.
- Logged the design preview extraction issue separately because it was observed in live smoke but not fixed in this pass.

**What didn't work**: This pass did not address weak builder selection (for example GPT-OSS still being chosen) or the design-phase payload-parsing issue. The end-to-end build path still needs another live smoke after this push.

---
### 2026-04-13 — OpenAI Codex

**What was done**: Audited the live Build loop regression around `pre_build_complete` and review gating. Patched `concierge` so build planning no longer hard-fails when `Architect.md` and builder lanes already exist: if Anthropic build-plan generation fails, returns malformed JSON, or omits `build_prompt`, the function now returns a deterministic build plan instead of a 502 / empty prompt. Relaxed `BuildWorkspace.tsx` so responses with a valid `file_manifest` remain selectable even when some manifest entries carry warnings, then redeployed `concierge` and re-ran `npm run typecheck` cleanly.

**Files touched**: `supabase/functions/concierge/index.ts`, `src/components/reveal/BuildWorkspace.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- Treat `Architect.md` + `build_lanes` as sufficient to synthesize a safe deterministic build plan; concierge should enhance that plan, not be a single point of failure for entering Build.
- Preserve warning metadata for manifest validation, but stop treating it as a hard execution block when valid `file_manifest` entries are still present.
- Logged the weak builder-roster issue separately instead of slipping an unreviewed lane-selection change into the same hotfix.

**What didn't work**: `apply_patch` and routine Windows sandbox refreshes failed again in this session, so the file edits were applied directly. The full Build flow still needs a live smoke after this push; only the `concierge` function deploy and frontend typecheck were verified here.

---
### 2026-04-13 — OpenAI Codex

**What was done**: Removed the oversized Ask/Build buttons from EmptyStage and moved session-mode control into a small composer toggle beside the existing mode chips. Fixed first-broadcast session creation so it respects the chosen Ask/Build mode, forced "Ask the council anyway" to bypass quick-answer triage, and added a synthesis fallback that reads persisted round responses when local response state is stale so concierge still receives post-round input. Re-ran `npm run typecheck` cleanly.

**Files touched**: `src/components/reveal/EmptyStage.tsx`, `src/components/reveal/RevealComposer.tsx`, `src/components/reveal/ConciergePanel.tsx`, `src/pages/WorkspacePage.tsx`, `src/hooks/useOrchestration.ts`, `MAESTRO_STATE.md`

**Decisions made**:
- Kept Ask/Build as a small composer-level control instead of a large home-screen picker so it matches the existing UI language and still affects first-broadcast session creation.
- Treated build-session choice as an explicit signal to skip quick-answer triage on the first round; build intent should reach the full council and concierge, not get short-circuited.
- Made the triage override path (`Ask the council anyway`) force `skipTriage: true` so it cannot loop back into the same quick-answer modal.
- Added a persisted-response fallback inside synthesis instead of relying solely on in-memory response state; this is the smallest code fix for the "council but no concierge" failure mode.

**What didn't work**: A first pass at removing the EmptyStage mode picker via targeted replacements left dead imports and JSX behind; that cleanup was finished before the final clean typecheck.

---

### 2026-04-14 — Claude Code (Opus 4.6)

**What was done**: Rewrote DesignPhase.tsx from a cramped side-by-side grid into a full-screen carousel/book-style UX. Each designer gets a dedicated full-viewport slide with an iframe preview that fills the available space. Navigation via arrow buttons, keyboard arrows, and role pills across the top. Created `src/lib/designRoles.ts` as a single source of truth for role → color/label/description mapping. Skip-to-Build button preserved. Accept Design / Flag for Merge / Merge actions in a bottom action bar. Rationale shown as a collapsed one-liner in the footer with full text on hover.

**Files touched**: `src/components/reveal/DesignPhase.tsx` (rewritten), `src/lib/designRoles.ts` (created), `MAESTRO_STATE.md`

**Decisions made**:
- Full-screen overlay (`fixed inset-0`) instead of a constrained modal — mockups need real estate to be usable.
- Carousel pattern (one slide at a time) instead of grid — even 2 designers side-by-side was too cramped for website mockup previews.
- Role metadata extracted to `src/lib/designRoles.ts` so both DesignPhase and future components (Pre-Build context display) can reference the same colors/labels.
- Kept all existing HTML extraction helpers (extractHtml pipeline) — they handle the fenced JSON / nested html_content / escaped HTML edge cases from various model outputs.
- Bottom bar shows rationale as truncated one-liner (full on hover) instead of a scrollable section — keeps the preview maximized.

**What didn't work**: N/A — implementation is a visual rewrite, functional logic preserved.

---

### 2026-04-13 — OpenAI Codex

**What was done**: Turned the `smoketestaudit.md` findings into a targeted build-path hardening pass. `useOrchestration` now strips prior-round context out of build-mode broadcasts, routes concierge lane instructions into per-builder prompts, and records provider errors with the actual failure reason instead of always blaming missing API keys. `BuildWorkspace` now prefers active build-capable agents when recovering generic builder lanes, shows dispatch / waiting / partial / GitHub-write / bouncer-running states, and updates lane bars from live response state. `architect` now prefers active strong builders over weak free defaults when auto-assigning generic builder lanes. Re-ran `npm run typecheck` cleanly.

**Files touched**: `src/hooks/useOrchestration.ts`, `src/components/reveal/BuildWorkspace.tsx`, `supabase/functions/architect/index.ts`, `MAESTRO_STATE.md`

**Decisions made**:
- Kept concierge's shared build prompt, but overlayed lane-specific instructions at broadcast time instead of redesigning the build-plan schema.
- Preferred active agents first and penalized free/general-purpose fallbacks instead of hardcoding a brittle builder allowlist.
- Improved build-state truthfulness in the UI without trying to rewrite orchestration into an async job queue in the same pass.

**What didn't work**: This pass did not make build orchestration asynchronous, add live provider-health rerouting, or run a deployed end-to-end smoke. Verification here is limited to code review and `npm run typecheck`.

---### 2026-04-13 — OpenAI Codex

**What was done**: Fixed the new-app repo carryover path and tightened BuildWorkspace refresh recovery. New sessions no longer inherit the previously active repo, repo binding now happens explicitly through RepoSection into `sessions.github_repo`, Pre-Build no longer backfills `github_repo` from global repo state, and BuildWorkspace now restores persisted build state before auto-planning. Also added clearer blocked-response guidance in the review UI and re-ran `npm run typecheck` cleanly.

**Files touched**: `src/hooks/useWorkspace.ts`, `src/components/reveal/RepoSection.tsx`, `src/components/reveal/PreBuildPanel.tsx`, `src/components/reveal/BuildWorkspace.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- Treated `sessions.github_repo` as the session source of truth and derived `activeRepoConnection` from it instead of auto-seeding new sessions from the last active repo.
- Made repo selection/create flows explicitly bind the chosen repo to the active session and clear prior workspace-active repo flags before marking the new one active.
- Tightened BuildWorkspace hydration so persisted build rounds / completed execution runs are restored before concierge auto-plan runs; left runtime validation for a follow-up smoke test instead of claiming the UX bug resolved from code alone.
- Logged only code-verified outcomes in Part 2 and left runtime build-flow claims unchanged.

**What didn't work**: An interrupted edit left `BuildWorkspace.tsx` and the MAESTRO_STATE lock row partially malformed; both were repaired before the final clean `npm run typecheck`.

---

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


















