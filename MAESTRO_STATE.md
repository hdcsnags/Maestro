# MAESTRO_STATE.md
*Universal onboarding document for all agents (CLI and web). Read AGENTS.md for update rules.*

---

## Read This First

| Field | Value |
|-------|-------|
| Primary branch | `main` |
| Active blockers | Build v2 task-queued flow implemented — needs live end-to-end smoke test |
| Last verified deploy | `concierge` + `orchestrate` redeployed 2026-04-14 (Build v2: decompose_tasks + build_task mode); `github-execute` redeployed 2026-04-13; 14 protected functions redeployed 2026-04-12 |
| Unapplied migrations | None — all migrations applied to remote including `20260414040000_build_tasks.sql` |
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
| Build v2 execution | `src/hooks/useBuildExecution.ts` (task decompose, dispatch loop, retry/reroute) |
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

## Database (20 active tables)

Core: workspaces, agents, sessions (has `mode`: 'ask'|'build'), rounds, responses, syntheses
GitHub: repo_connections, execution_runs, approval_requests
Security: provider_connections, encrypted_secrets, audit_events
Sprint B: design_artifacts, build_lanes, bouncer_events, build_reports, concierge_decisions
Build v2: build_tasks (per-file task queue — status, prompt_slice, retry/reroute metadata)
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
| 504 root cause resolved: `concierge` `buildDeterministicBuildPlan()` no longer double-injects ARCHITECT.MD into `build_prompt` (already in system prompt via `orchestrate`); `build_prompt` is now ~80 tokens | 2026-04-13 (`supabase functions deploy concierge`, commit `71da7a9`) |
| Continuation chain wired: `BuildWorkspace` reads `complete:false`/`continuation_prompt` from `signals`, shows "Continue Build" in reviewing stage for incomplete agents | 2026-04-13 (code verified, `npm run typecheck`) |
| Build v2 task queue: `build_tasks` migration applied, `BuildTask` type added, concierge `decompose_tasks` phase parses ARCHITECT.md into per-file tasks with LLM prompt slices | 2026-04-14 (`supabase functions deploy concierge`, `npm run typecheck`) |
| Build v2 orchestrate `build_task` mode: lighter single-file prompt, 8192 max output tokens, no ARCHITECT.md injection | 2026-04-14 (`supabase functions deploy orchestrate`, `npm run typecheck`) |
| Build v2 `useBuildExecution.ts` hook: dispatch/collect/retry/reroute loop, parallel dispatch (2 at a time per builder), dependency-aware ordering, fallback agent rerouting, abort control | 2026-04-14 (`npm run typecheck`, `npm run build`) |
| Council UX: round navigation, role-first cards, prompt visibility — browsable round history with Up/Down arrows, HeroContext shows round navigator + prompt preview, FolioCard header is role-first | 2026-04-15 (`npm run build`, commit `5af0025`) |
| Build v2 stale-closure dispatch fix: `tasksRef` (useRef) as synchronous truth, DB re-fetch safety net, `isRunningRef` double-exec guard — tasks now actually dispatch after decompose | 2026-04-15 (`npm run typecheck`, `npm run build`, commit `76b8873`) |
| Build v2 task board UI in BuildWorkspace: progress bar, per-file task list with status, retry/skip actions, pause/resume/execute controls, concierge chat during task building | 2026-04-14 (`npm run typecheck`, `npm run build`) |
| Build v2 github-execute wiring: collected task manifests formatted as patches with `conductor_approved=true`, UI state updated from exec result | 2026-04-14 (`npm run typecheck`, `npm run build`) |
| #10 concierge re-fire (remount) fixed: `lanesLoaded` gate in hydration effect + builder-lanes-exist → plan_review shortcut | 2026-04-13 (code verified, `npm run typecheck`, commit `41fa2dd`) |
| #12 weak-agent fallback fixed: locked IDs → full-pool fallback on DB miss; builder last-resort now excludes GPT-OSS/Gemma; `architect` redeployed | 2026-04-13 (code verified, `npm run typecheck`, commit `41fa2dd`) |

## What's Broken or Incomplete

| Issue | Since | Owner |
|-------|-------|-------|
| Build v2 task-queued flow: decompose works, dispatch stale-closure fixed — needs live smoke to confirm tasks actually complete via orchestrate build_task mode | 2026-04-15 | Unassigned |
| Council auth fixes landed but still need live smoke test after `supabase.functions.invoke` migration | 2026-04-12 | Unassigned |
| Builder count defaults and roster locking now exist in Pre-Build, but provider-health-aware failover and lane reroute policy are still not concierge-driven | 2026-04-13 | Unassigned |
| Design phase can still drop a designer preview when the returned payload does not match the expected HTML/JSON extraction path (reported in live smoke) | 2026-04-13 | Unassigned |
| No real-time streaming — responses arrive all at once; StreamingFolio is visual-only | Pre-existing | — |
| Concierge auto-trigger after build broadcast may double-fire | ~~Pre-existing~~ Fixed `41fa2dd` | — |
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

1. **Live smoke test Build v2**: Pre-Build lock → plan review → "Build (File by File)" → watch task board → Execute to GitHub → verify files written
2. If v2 task build works, test bouncer gate after build completes
3. Retire legacy broadcast path once v2 is proven (currently available as "Broadcast (Legacy)" button)
4. Add GitHub App install detection (`/user/installations`) so UI can prompt users who authorized but haven't installed

---

# Part 3 — Session Log

*Append-only, newest first. Never delete entries.*

### 2026-04-15 — GitHub Copilot (Opus 4.6) — Council UX Sprint

**What was done**: Implemented Phase 3 (highest-value slice) of the council/orchestration UX overhaul — round navigation, role-first cards, prompt visibility.

**Changes**:
- `MaestroContext.tsx`: Added `selectedRoundIndex` state field (-1 = auto-follow latest). New `SET_SELECTED_ROUND` action. Auto-resets to -1 on `ADD_ROUND` (new broadcast always shows latest). Resets folioIndex to 0 on round change. Reset in `SET_ACTIVE_SESSION` and `CLEAR_STAGE`.
- `HeroContext.tsx`: Replaced "Round XX -- Y voices" with interactive round navigator (`◁ Round 2 / 5 ▷`). Shows "latest" badge when auto-following. Displays the selected round's original prompt (truncated ~180 chars, italicized). Removed empty `<p>` tag. Tighter vertical spacing.
- `FolioCarousel.tsx`: Uses `selectedRound` instead of `latestRound` for filtering responses. Streaming placeholders only appear when viewing the latest round during broadcast.
- `WorkspacePage.tsx`: Added selectedRound computation (mirrors carousel logic). Up/Down arrow keys dispatch `SET_SELECTED_ROUND`. Updated `useEffect` dep array for round navigation state.
- `FolioCard.tsx`: Header is now role-first (role in 13px white, agent name colored below). Removed round label from header (now in HeroContext navigator). Footer shows only model name at 10px/60% opacity. Removed unused `roundNumber` prop.

**Design decisions**:
- `-1` as "auto-follow latest" is cleaner than a tracked index that might go stale — it's a conceptual "follow mode" vs "pinned mode"
- Round navigation uses arrow keys (Up/Down) to avoid conflict with Left/Right carousel navigation — natural spatial metaphor (rounds = vertical timeline, cards = horizontal carousel)
- Role-first card headers align with product doctrine: "models as seats/roles, not raw providers"
- Prompt preview in HeroContext gives immediate session recovery context without reopening drawers

**Files touched**: `src/context/MaestroContext.tsx`, `src/components/reveal/HeroContext.tsx`, `src/components/reveal/FolioCarousel.tsx`, `src/pages/WorkspacePage.tsx`, `src/components/reveal/FolioCard.tsx`, `MAESTRO_STATE.md`

---

### 2026-04-15 — GitHub Copilot (Opus 4.6)

**What was done**: Fixed critical Build v2 dispatch blocker — task queue created successfully but execution loop never started.

**Root cause**: Classic React stale-closure bug. `handleTaskBuild` calls `decompose()` (which sets tasks via `setTasks`) then immediately calls `execute()`. But `execute()` reads `tasks` from its `useCallback` closure, which is still `[]` — React batches `setTasks` updates and hasn't flushed yet. The `execute` loop sees 0 tasks, breaks immediately, and silently transitions to `ready` stage. User then clicks Execute to GitHub → "No completed tasks to execute."

**Secondary bug**: The mid-loop state sync trick (`setTasks(prev => { currentTasks = prev; return prev })`) was also unreliable under React 18 automatic batching — the updater function runs during render, not synchronously during `setState` call.

**Fix applied**:
- Added `tasksRef` (`useRef<BuildTask[]>`) as synchronous truth — all mutations write to ref first, then to state (for UI re-renders)
- `execute()` reads from `tasksRef.current` instead of closure `tasks`
- Belt-and-suspenders: if ref is empty at execute start, re-fetches from DB
- Added `isRunningRef` to prevent double-execution across stale closures
- `recountProgress()` re-reads from ref on every call
- `collectManifest()` reads from ref instead of state
- `handleTaskBuild` stays on `task_building` stage after execution (no silent `ready` transition)
- "Execute to GitHub" button wired directly from `task_building` stage header

**Files touched**: `src/hooks/useBuildExecution.ts`, `src/components/reveal/BuildWorkspace.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- Refs are the correct pattern for async-loop state that must be synchronously current. React state is for UI rendering; refs are for imperative logic.
- DB re-fetch safety net adds one query but prevents silent 0-task execution in any edge case (page reload, race condition, etc.)
- Staying on `task_building` after execution completes is better UX — user sees results, can resume failed tasks, then explicitly clicks Execute to GitHub.

**What didn't work**: N/A — diagnosis was straightforward. Build v2 dispatch path is now structurally correct but needs live smoke to confirm orchestrate `build_task` calls actually return valid results.

---

### 2026-04-14 — GitHub Copilot (Opus 4.6)

**What was done**: Implemented Build v2 task-queued execution system (Steps 0–6 of BUILD_V2_SPEC.md). This replaces the v1 approach of asking agents to generate entire lanes of files in one shot (which caused 504 timeouts) with a per-file task queue where each orchestrate call handles exactly one file in 3–8 seconds.

**Step 1**: Created `build_tasks` migration (`20260414040000_build_tasks.sql`) with RLS, indexes, status/operation constraints, failure/reroute metadata columns. Added `BuildTask` interface and `BuildTaskStatus` type to `src/types/index.ts`. Applied migration to remote Supabase.

**Step 2**: Added `decompose_tasks` phase to concierge edge function. Parses ARCHITECT.md file tree using existing `parseFilesFromArchitectMd()`, assigns files to builder lanes via `matchFilesToLane()`, generates per-file prompt slices (LLM via Sonnet 4.6 when API key available, deterministic fallback otherwise), writes `build_tasks` rows to DB. Handles dependency ordering (config/types → lib → routes → components → entry points), fallback builder assignment across providers, and unassigned file catch-all.

**Step 3**: Added `build_task` mode to orchestrate edge function. Lighter single-file prompt template (no ARCHITECT.md injection — prompt_slice has the context), 8192 max output tokens (capped from buildOutputTokens), structured JSON output format for single files. Updated `OrchestrationMode` type in both backend and frontend.

**Step 4**: Created `src/hooks/useBuildExecution.ts` — the execution loop hook. Dispatch/collect/retry/reroute loop with parallel dispatch (2 tasks at a time, one per builder). Dependency-aware ordering, fallback agent rerouting on failure, abort control, manifest collection. Exposes `{ tasks, progress, isRunning, decompose, execute, abort, skipTask, retryTask, collectManifest }`.

**Step 5**: Wired task board UI into BuildWorkspace. Added `task_decomposing` and `task_building` stages. Plan review now shows two buttons: "Build (File by File)" as primary, "Broadcast (Legacy)" as secondary. Task building stage shows progress bar, per-file task list with status icons and builder agent names, retry/skip actions on failed tasks, pause/resume/execute controls, and concierge chat panel.

**Step 6**: Wired completed task manifest to github-execute. `handleTaskExecuteToGithub` formats collected `build_tasks` results as `AgentPatch[]` with `conductor_approved=true`, creates execution run, calls github-execute, updates UI state from exec result.

Also confirmed all pending migrations (including `20260410143000` and `20260412200000`) were already applied to remote — MAESTRO_STATE.md was stale on this claim. Updated BUILD_V2_SPEC.md with OpenAI's six refinements before implementation.

Deployed `concierge` and `orchestrate` to remote. Ran `npm run typecheck` and `npm run build` clean. Committed as `6c84d18`, `e066959`, `177bd4a`.

**Files created**: `src/hooks/useBuildExecution.ts`, `supabase/migrations/20260414040000_build_tasks.sql`, `BUILD_V2_SPEC.md`

**Files modified**: `src/types/index.ts`, `src/components/reveal/BuildWorkspace.tsx`, `supabase/functions/concierge/index.ts`, `supabase/functions/orchestrate/index.ts`, `MAESTRO_STATE.md`

**Decisions made**:
- Build tasks are NOT rounds — separate `build_tasks` table prevents semantic overloading of `rounds`/`responses` data model.
- Frontend execution loop (v2) with plan for worker/job model (v2.5) — pragmatic first step.
- Pre-Build locks the builder cast, Build never re-casts (Rule #1 from spec).
- Continuation is an escape hatch for oversized single files, not the normal path.
- Kept legacy broadcast as a fallback button during v2 proving period.
- LLM prompt slices (Sonnet 4.6) with deterministic fallback — never blocks on slice generation failure.
- Max 2 parallel dispatches to avoid overwhelming providers; dependency-aware ordering prevents config/types race conditions.

**What didn't work**: Build v2 is code-complete but untested end-to-end in production. Needs live smoke test: Pre-Build → plan review → file-by-file build → execute to GitHub.

---

### 2026-04-13 — GitHub Copilot (Sonnet 4.6)

**What was done**: Implemented audit items #10 and #12 from the build-reliability sprint.

**#10 — Concierge re-fire on remount**: Added `lanesLoaded` state to `BuildWorkspace`. The lanes DB query now calls `setLanesLoaded(true)` whether or not rows exist. The hydration effect waits for `lanesLoaded` before proceeding past the execution-run check — this prevents the concierge auto-trigger from firing before we know whether build_lanes already exist for the session. Added a new early-return in hydration: if builder lanes exist in DB, advance directly to `plan_review` and set `preparingTriggered.current = true`, bypassing any concierge call. Verified that the existing `preparingTriggered.current` guard still handles the simple remount case; `lanesLoaded` handles the case where `state.buildPlan` was cleared (session switch) but lanes persist in DB.

**#12 — Weak agent fallback in architect**: Fixed `assignAgentToLane` in `architect/index.ts`. Two changes: (1) If `lockedBuilderIds` is non-empty but none of those IDs exist in the workspace agents table (stale IDs from unapplied migration or a deleted agent), the function now falls back to the full agent pool instead of returning `null` — `null` was guaranteeing a LANES_NOT_ASSIGNED 400 on every build. (2) The last-resort fallback (when all scored candidates have score ≤ 0) now filters out GPT-OSS and Gemma models for builder lanes, since both reliably 504 or return stubs. Only if no capable agent remains does it fall through to any unused agent.

Ran `npm run typecheck` clean. Deployed `architect`. Committed and pushed `41fa2dd`. Updated MAESTRO_STATE.md What's Working rows and resolved the concierge re-fire entry in What's Broken.

**Files touched**: `src/components/reveal/BuildWorkspace.tsx`, `supabase/functions/architect/index.ts`, `MAESTRO_STATE.md`

**Decisions made**:
- `lanesLoaded` as React state (not a ref) so the hydration effect re-runs when the DB query resolves, even if that happens after the initial mount cycle.
- Hydration effect still processes execution-run restore BEFORE the `lanesLoaded` gate — the complete-run restore is fast (in-memory state) and shouldn't be blocked by a DB query.
- Locked ID → full-pool fallback is intentional: the conductor's intent was to use specific agents; if those agents don't exist in DB, using any capable agent is better than blocking the entire build.
- GPT-OSS and Gemma exclusion in last-resort is by name match, not by `provider_group`, so it doesn't accidentally exclude other capable openrouter_a agents (e.g., Llama 4 Maverick).

**What didn't work**: Build flow still needs a live end-to-end smoke. The 2 unapplied migrations (`promote_gpt54_builder`, `add_session_mode`) remain pending.

---

`orchestrate/index.ts` already injects ARCHITECT.MD into the **system prompt** for every build-mode call, but `concierge/buildDeterministicBuildPlan()` was also embedding the full `architectMd` string in the **user-message `build_prompt`**, causing double-injection (~4,000 extra tokens per request). Each agent was then expected to output 20–30 complete files in one shot under a 60s edge function timeout — impossible for any provider. Fix: rewrote `buildDeterministicBuildPlan()` to emit a ~80-token build_prompt referencing ARCHITECT.MD without embedding it, and updated the Anthropic-driven `buildPlanPrompt` to explicitly forbid embedding. Also wired the continuation chain (Layer 3): `BuildWorkspace` now reads `complete:false` + `continuation_prompt` from `signals` and surfaces a "Continue Build" button for incomplete agents. Added lane depth warning (Layer 2): `laneHasDeepPaths()` helper warns conductors in plan_review when a lane spans 2+ deep wildcard paths. Redeployed `concierge`, ran `npm run typecheck` clean, committed and pushed.

**Files touched**: `supabase/functions/concierge/index.ts`, `src/components/reveal/BuildWorkspace.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- ARCHITECT.MD belongs only in the orchestrate system prompt path — concierge should reference it, not re-embed it.
- Continuation data (`build_complete`, `continuation_prompt`) already stores in the `signals` JSONB column — no new migration needed.
- Lane depth warning is heuristic-based (`/**` count ≥ 2) — catches the common failure case without requiring a file tree parse.

**What didn't work**: Build flow still needs a live end-to-end smoke after this fix. The 2 unapplied migrations (`promote_gpt54_builder`, `add_session_mode`) are still pending remote application.

---

### 2026-04-13 — OpenAI Codex

**What was done**: Patched a follow-up build-roster mismatch after live user validation. Pre-Build now clears any stale in-memory build plan whenever the locked builder roster changes or the session enters Build, and `BuildWorkspace` now resolves locked builders by name as well as ID so valid locked lanes do not fail just because a stale or missing agent ID leaked into the plan handoff. Re-ran `npm run typecheck` cleanly.

**Files touched**: `src/components/reveal/PreBuildPanel.tsx`, `src/components/reveal/BuildWorkspace.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- Treated stale `state.buildPlan` as part of the bug, not just the lane-ID error message, because Build could otherwise review an outdated roster after Pre-Build edits.
- Kept locked-roster authority intact while relaxing matching from ID-only to ID-or-name within the locked builder set.
- Left concierge unchanged in this pass because the immediate mismatch was fixable in frontend state handoff and locked-lane resolution.

**What didn't work**: This pass still has not been live-smoked after the new patch, so the build handoff remains code-verified only.

---
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



















