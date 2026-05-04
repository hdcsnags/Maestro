# MAESTRO_STATE.md
*Universal onboarding document for all agents (CLI and web). Read AGENTS.md for update rules.*

---

## Read This First

| Field | Value |
|-------|-------|
| Primary branch | `main` |
| Active blockers | ~~GPT OSS phantom agent~~ ✅ fixed (2026-05-04); ~~legacy broadcast includes Claw agents~~ ✅ fixed (2026-05-04); Sonnet timeouts on artifact-heavy prompts |
| Last verified deploy | `executor-api` deployed 2026-05-04 (SEC-04: report_incident action + executor_incidents migration applied); `architect` + `concierge` deployed 2026-05-04 (REL-01 phantom agent fix); `orchestrate` redeployed 2026-04-17; `bouncer` redeployed 2026-04-16 |
| Unapplied migrations | None (20260504000000_executor_incidents.sql applied 2026-05-04) |
| Active locks | None |
| MaestroClaw version | v0.1.0 (artifact pipeline working, needs version bump) |

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

## Database (20 active tables)

Core: workspaces, agents, sessions (has `mode`: 'ask'|'build'), rounds, responses, syntheses
GitHub: repo_connections, execution_runs, approval_requests
Security: provider_connections, encrypted_secrets, audit_events
Sprint B: design_artifacts, build_lanes, bouncer_events, build_reports, concierge_decisions
Build v2: build_tasks (per-file task queue — status, prompt_slice, retry/reroute metadata)
MaestroClaw: executors, executor_jobs, executor_job_events
Claw Mode: threads (type: concierge|broadcast|direct|execution), thread_messages
Legacy (unused): agent_skills, flags

## Agent Roster

15 cloud agents: 5 provider groups × 3 slots. Only slot-0 active by default.
3 MaestroClaw agents: local CLI execution, build-only (not used for broadcast/analysis).

**Source of truth for model names: `src/types/index.ts`** — if what's listed below disagrees with that file, the file wins.

| Provider | Slot 0 | Slot 1 | Slot 2 |
|----------|--------|--------|--------|
| anthropic | Haiku 4.5 | Sonnet 4.6 | Opus 4.6 |
| openai | GPT-5.4 Mini | GPT-5.4 Builder | GPT-5.4 (Reasoning) |
| google | Gemini 2.5 Flash | Gemini 2.5 Pro | Gemini 2.5 Flash |
| openrouter_a | GPT-OSS 20B (free) | Gemma 4 31B (free) | Llama 4 Maverick |
| openrouter_b | Sonnet 4.6 (OR) | GPT-5.4 Builder (OR) | Kimi K2 |
| **maestroclaw** | **ClawClaude** (claude_code) | **ClawCopilot** (copilot_cli) | **ClawCodex** (codex_cli) |

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

# Part 2 — Operational State

*Updated every session. Every claim here MUST have a verification date or be marked `unverified`.*

## What's Working

| Capability | Verified |
|------------|----------|
| GitHub OAuth authorize + token exchange path exists in code | 2026-04-12 (code verified) |
| Shell analyzer correctly segments &&, ||, ; (SEC-01 — injection guard) | 2026-05-03 |
| HMAC approval tokens for shell commands (SEC-02): server-authoritative, pty_shell gated, token not persisted to DB | 2026-05-09 |
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
| Ask/Build session mode split — composer Ask/Build toggle, concierge Convert to Build, session dropdown indicator | 2026-05-01 (`npm run typecheck`, `npm run build`) |
| Unified UX Phase 0 foundation: `orchestrationMode` is removed, broadcast/build orchestration now derives from session/build context, and the thread shell now opens/closes from active thread focus instead of `clawModeActive` | 2026-05-01 (`npm run typecheck`, `npm run build`) |
| Unified UX Phase 1 composer: `RevealComposer` is now the shared composer for both the workspace shell and thread shell, with one routing bar (Direct/Council/Execute/Build), one send action, and the concierge model picker moved into composer chrome | 2026-05-01 (`npm run typecheck`, `npm run build`) |
| Unified UX Phase 2 shell cutover: `WorkspacePage.tsx` now always renders the thread-first `ClawMode` shell, and `ClawMode` rehydrates the concierge thread per session instead of falling back to the legacy stage tree | 2026-05-01 (`npm run typecheck`, `npm run build`) |
| Unified UX Phase 3 concierge cards: quick-answer triage and concierge synthesis now persist as inline thread event cards, reusing the existing proceed/round-2/override/report/build actions without reopening a modal | 2026-05-01 (`npm run typecheck`, `npm run build`) |
| Unified UX Phase 4 build runway: build chat now always opens an in-thread runway card, and the runway can execute task builds or local session builds and push to GitHub without ejecting to the drawer | 2026-05-01 (`npm run typecheck`, `npm run build`) |
| Unified UX Phase 5 plan cards: build chat now opens a thread-native Pre-Build sequence for project type, repo, builder roster, backend, architect preview, lanes, and spec lock, while `PreBuildPanel.tsx` remains the advanced inspection surface | 2026-05-01 (`npm run typecheck`, `npm run build`) |
| Unified UX Phase 6 bouncer card: the post-build security/code-quality review now renders through a shared `BouncerCard` component in both the runway and advanced workspace, with collapsed severity groups and standardized approve/pause/abort actions | 2026-05-01 (`npm run typecheck`, `npm run build`) |
| Unified UX Phase 7 premium event cards: new system-thread flows now write typed `thread_messages.metadata` payloads for execution approvals, command status, build handoff, PR-opened results, and errors, while legacy plain-text system messages still render as a compatibility fallback | 2026-05-01 (`npm run typecheck`, `npm run build`) |
| Unified UX Phase 8 carousel actions: Folio cards now expose thread-native pin/compare/follow-up/decision/synthesize actions, comparisons open in a side-by-side sheet, and direct-thread bootstrap is shared through `useThreads.ts` so carousel actions and focus mode seed agent context the same way | 2026-05-01 (`npm run typecheck`, `npm run build`) |
| Unified UX Phase 9 topbar status chip: ClawMode now uses one interactive status chip for concierge model, executor status, key count, and execution mode switching, and the old mode banner is removed in favor of the chip’s inline detail panel | 2026-05-01 (`npm run typecheck`, `npm run build`) |
| Unified UX Phase 10 realtime progress: build task progress now hydrates from live `build_tasks` updates, executor/session jobs resolve through Supabase Realtime instead of polling, and runway/workspace execution views stream live stdout/stderr snippets from `executor_job_events` | 2026-05-01 (`npm run typecheck`, `npm run build`) |
| MaestroClaw hardening Phase A: executor `retry` events now match the DB schema, Claude session runs drop `--print`, `build_session` outputs are filtered back to allowed scope before checkpoint/reporting, and large local artifact manifests can hydrate from chunked `artifact` events instead of relying on one oversized completion payload | 2026-05-01 (`npm run typecheck`, `npm run build`, `npm --prefix packages\maestroclaw run build`) |
| MaestroClaw alignment Phase B: local session builds now forward exact `scope_paths`, literal `expected_files`, and a bounded set of sibling `context_files`, the worker prompt renders exact scope lists, and executor tokens can be rotated/reissued from both `executor-api` and the Executor UI | 2026-05-01 (`npm run typecheck`, `npm run build`, `npm --prefix packages\maestroclaw run build`) |
| Workspace bootstrap hotfix: `WorkspacePage.tsx` mounts `useWorkspace()` again, restoring initial workspace seeding/loading after the shell-unification refactor so signed-in users no longer deadlock on `Initializing workspace` with no Supabase requests | 2026-05-01 (`npm run typecheck`, `npm run build`) |
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
| Council UX: markdown rendering in FolioCard via react-markdown + remark-gfm, topbar chrome reduced, session switcher shows round count + prompt | 2026-04-15 (`npm run build`, commit `9aebc8c`) |
| MaestroClaw v0.1: local execution node — `executors`, `executor_jobs`, `executor_job_events` tables, `executor-api` edge function (8 actions), worker package with poll loop + adapter system (`shell_stub`, `claude_code`, `approved_shell`) | 2026-04-17 (`npm run typecheck`, migrations applied, `executor-api` deployed, commit `16203aa`) |
| MaestroClaw full round-trip smoke test: web UI → submit job → Supabase queue → MaestroClaw polls → Claude Code runs → results back → status visible in Vault | 2026-04-17 (live smoke test, commit `29323b1`) |
| MaestroClaw workspace preservation: succeeded jobs keep workspace files for browsing, configurable via `KEEP_SUCCEEDED_WORKSPACES` env var (default: true) | 2026-04-17 (`npm run typecheck`) |
| BUILD_V3_SPEC.md written: MaestroClaw-routed builds, execution backend routing, context bundling, job chains, project lifecycle, Docker isolation roadmap, security model | 2026-04-17 |
| Build v2 stale-closure dispatch fix: `tasksRef` (useRef) as synchronous truth, DB re-fetch safety net, `isRunningRef` double-exec guard — tasks now actually dispatch after decompose | 2026-04-15 (`npm run typecheck`, `npm run build`, commit `76b8873`) |
| Build v2 task parsing fix: orchestrate preserves path/operation fields from build_task JSON, frontend 4-strategy fallback chain | 2026-04-16 (`supabase functions deploy orchestrate`, `npm run build`, commit `5dbfe09`) |
| Build v2 github-execute mode fix: Build v2 path sends `mode: 'synthesized'` not `strategy` | 2026-04-16 (`npm run build`, commit `628d449`) |
| Build v2 end-to-end proven: fresh project → broadcast → 76/76 tasks complete → PR created → merged | 2026-04-16 (live smoke test) |
| 4-spec sprint: bouncer v2 (content review), artifact normalization (server+client), build completeness gate, UI design skill pack | 2026-04-16 (`supabase functions deploy bouncer orchestrate design`, `npm run build`, commit `d529104`) |
| JSON parser rewrite: 4-strategy `extractJsonCandidate` (direct parse → greedy fence strip → first-{-to-last-} → string-aware brace extraction), broken title rescue, `escaped` flag fix | 2026-04-17 (`supabase functions deploy orchestrate`, commit `b111771`) |
| Token limit fix: `defaultOutputTokens` 4096→16384 for all providers, truncation detection per API (Anthropic stop_reason, OpenAI finish_reason, Gemini finishReason) | 2026-04-17 (`supabase functions deploy orchestrate`, commit `e009716`) |
| GPT and Gemini artifact extraction confirmed working after token limit + parser fix | 2026-04-17 (live smoke test) |
| Build v2 task board UI in BuildWorkspace: progress bar, per-file task list with status, retry/skip actions, pause/resume/execute controls, concierge chat during task building | 2026-04-14 (`npm run typecheck`, `npm run build`) |
| Build v3 Phase 1 routing layer: `dispatchTask()` branches on `execution_backend` (edge/local/auto), `resolveBackend()` picks route, `pollExecutorJob()` polls for MaestroClaw completion, local→edge fallback on failure | 2026-04-18 (`npm run typecheck`) |
| Build v3 execution backend selector: Pre-Build "Lock" screen shows Edge/Local/Auto toggle, persists to `sessions.execution_backend`, shows executor online status | 2026-04-18 (`npm run typecheck`) |
| Build v3 auto-routing: local only when an online executor advertises the required adapter; stale claimed/running jobs re-queue after 90s lease expiry | 2026-04-21 (`npm --prefix packages\maestroclaw run build`, `npm run build`) |
| Claw local builds no longer send `branch` when no GitHub repo is connected — `branch: 'main'` hardcoded fallback removed so `executor-api` validation no longer rejects every task with "branch requires repo_url" | 2026-04-21 (`npm run typecheck`, commit `bdd9546`) |
| BuildWorkspace local/auto Start Build now launches scoped `build_session` jobs per Claw builder instead of defaulting to per-file `build_task` decomposition; local session builds no longer require a connected GitHub repo until push time | 2026-04-29 (`npm run typecheck`, `npm run build`, `npm --prefix packages\maestroclaw run build`) |
| Claw chat `auto` backend now stays thread-native when a locked MaestroClaw builder has a matching online executor; the in-thread build card also defaults to that builder's adapter instead of always starting at `claude_code` | 2026-04-29 (`npm run typecheck`, `npm run build`) |
| Claw no longer carries the dead chat-build review/progress state: the unused `ChatBuildPlan` / `chatBuildPhase` path and stale approval card were removed, so Build mode now routes only to the live local session card or Build Workspace handoff | 2026-04-29 (`npx eslint src\hooks\useThreads.ts src\components\reveal\ClawMode.tsx src\context\MaestroContext.tsx src\types\index.ts`, `npm run typecheck`, `npm run build`) |
| Local session submit/poll/cancel logic is now shared in `src/lib/sessionBuild.ts`; both `useBuildExecution` and `ClawBuildSessionCard` use the same executor capability check, `build_session` submit path, poller, manifest merge, and cancellation helper | 2026-04-29 (`npx eslint src\lib\sessionBuild.ts src\hooks\useBuildExecution.ts src\components\reveal\ClawBuildSessionCard.tsx src\hooks\useThreads.ts src\components\reveal\ClawMode.tsx src\context\MaestroContext.tsx src\types\index.ts`, `npm run typecheck`, `npm run build`) |
| Claw and BuildWorkspace now share one context-backed local session progress model via `sessionBuildState`, so thread-native cards and the classic drawer read the same runs/progress/isRunning state instead of maintaining separate live session controllers | 2026-04-29 (`npx eslint src\hooks\useBuildExecution.ts src\components\reveal\ClawBuildSessionCard.tsx src\components\reveal\BuildWorkspace.tsx`, `npm run typecheck`, `npm run build`) |
| Completed in-thread local Claw runs can now push directly to GitHub using the same shared helper as BuildWorkspace; successful session builds no longer require a mandatory "Push via Build Workspace" handoff before branch/PR creation | 2026-04-29 (`npx eslint src\hooks\useBuildExecution.ts src\components\reveal\ClawBuildSessionCard.tsx src\components\reveal\BuildWorkspace.tsx`, `npm run typecheck`, `npm run build`) |
| Direct shell-style Claw execute requests now have a local fast path in `useThreads.ts`, so commands like `npm run build`, `git status`, `list files in src`, and `show file src/main.tsx` can skip the cloud intent parser and submit immediately when an executor is online | 2026-04-29 (`npx eslint src\hooks\useThreads.ts src\hooks\useBuildExecution.ts src\components\reveal\ClawBuildSessionCard.tsx src\components\reveal\BuildWorkspace.tsx`, `npm run typecheck`, `npm run build`) |
| TypeScript strict-mode clean (0 errors): `BuildTask.id` made required; `executor_jobs` query explicitly typed (missing from `database.types.ts`); `synthesizeRef` widened to `Promise<unknown>`; `ClawMode.tsx directThread` annotated `Thread\|null\|undefined` | 2026-04-21 (`npm run typecheck`, commit `3e7f150`) |
| Build v3 migration: `executor_job_id` on build_tasks, `execution_backend` on sessions, `context_bundle` on executor_jobs, widened constraint to include 'auto' | 2026-04-18 (migration created, not yet applied to remote) |
| #10 concierge re-fire (remount) fixed: `lanesLoaded` gate in hydration effect + builder-lanes-exist → plan_review shortcut | 2026-04-13 (code verified, `npm run typecheck`, commit `41fa2dd`) |
| #12 weak-agent fallback fixed: locked IDs → full-pool fallback on DB miss; builder last-resort now excludes GPT-OSS/Gemma; `architect` redeployed | 2026-04-13 (code verified, `npm run typecheck`, commit `41fa2dd`) |
| MaestroClaw agents in builder roster: 3 Claw agents (ClawClaude, ClawCopilot, ClawCodex) added to `AGENT_DEFAULTS`, selectable as builders in Pre-Build with executor-aware scoring | 2026-04-19 (`npm run typecheck`, commit `93e05f6`) |
| MaestroClaw in Orchestra drawer: dedicated section with executor online/offline status badge, `hasKey()` returns true (no API key needed) | 2026-04-19 (commit `4d68c12`) |
| MaestroClaw hidden from Vault: `maestroclaw` filtered from API key management loop | 2026-04-19 (commit `1a02dae`) |
| Auto-backend-switch: selecting a Claw builder in Pre-Build auto-switches execution backend to `local` | 2026-04-19 (code verified) |
| Artifact synthesis pipeline: executor.ts `extractFileContent()` now extracts `content` from JSON manifest format (Strategy 0 — with bad-escape fixup), falls back to markdown fence strip (Strategy 1), then raw code heuristic (Strategy 2). Fixes Claw writing raw JSON envelopes to disk. | 2026-04-22 (`npm run typecheck`, commit `d6398c4`) |
| Claude Code stdin pipe: adapter rewritten to use `spawn()` + `proc.stdin.write(prompt)` instead of CLI arg — fixes Windows 8K char truncation | 2026-04-19 (commit `3e455ea`) |
| Artifacts written to disk: executor writes built files to per-job workspace AND session-scoped `builds/{session_id}/` directory for consolidated project view | 2026-04-20 (commits `38c7dd5`, `cfb60c6`) |
| **Ralph Loop + Git Checkpoints**: per-file retry with quality checks (HTML, truncation, JSON, min-length), path-aware validation, total-timeout budget, graceful close on exhaustion, git checkpoint after each successful write (lock-safe), `[↩ N]` prefix on result_summary, UI amber retry badge | 2026-04-22 (`npm run typecheck`, `npm --prefix packages\maestroclaw run build`, commit `82ea6bb`) |
| Full 5-file build via MaestroClaw: dispatched 5 jobs (App.tsx, Hero.tsx, Services.tsx, Footer.tsx, App.module.css), all succeeded with artifacts stored in DB | 2026-04-20 (live smoke test) |
| **Claw Mode Phase 0** — thread foundation + concierge chat: migration for `threads`/`thread_messages` tables + `agent_role` column on agents, `useThreads` hook, `ClawMode` full-screen chat component with model picker, Claw button in composer, Escape to close | 2026-04-20 (`npm run typecheck`, `npm run build`, migration applied, commits `ba41ed1`→`ff25942`) |
| **Claw Mode Phase 1** — broadcast from chat + carousel + direct agent chat: three-view system (Concierge/Carousel/Focus), Broadcast button dispatches to council agents, FolioCarousel embedded in Claw Mode, agent quick-focus bar for direct chat, Synthesize merges threads back to concierge, `sendToAgent()` for direct thread conversations, `ClawView` type + state management | 2026-04-20 (`npm run typecheck`, `npm run build`) |
| **Claw Mode Phase 2** — execution in chat: `executeFromChat()` + `submitExecutionJob()` + `approveExecutionJob()` + `pollJobStatus()` in `useThreads`, Execute ⚡ button in ClawMode concierge view, approval card with Approve/Reject UI, `TRUSTED_COMMANDS` allowlist (14 patterns), `classifyCommandTrust()`, `EXECUTION_INTENT_PROMPT`, `callExecutorApi()` helper for query-param edge functions, `ApprovedShellAdapter` for real command execution in MaestroClaw, `ADD_EXECUTOR_JOB`/`UPDATE_EXECUTOR_JOB`/`SET_PENDING_EXECUTION` context actions, agent role enforcement (council excluded from execution, executor excluded from broadcast) | 2026-04-20 (`npm run typecheck`, `npm run build`) |
| **Claw Mode Phase 3** — build handoff from chat: `buildFromChat()` records the requested build prompt, validates Pre-Build, and routes to either the in-thread `ClawBuildSessionCard` for local-capable builders or the classic Build Workspace for edge/cloud flows. Build 🏗️ remains in the concierge routing bar, but the old chat-native plan/review/commit state has since been removed in favor of the live handoff paths. | 2026-04-29 (`npx eslint src\hooks\useThreads.ts src\components\reveal\ClawMode.tsx src\context\MaestroContext.tsx src\types\index.ts`, `npm run typecheck`, `npm run build`) |
| CLAW_MODE_SPEC.md: council-approved architecture spec for Maestro v2 — thread-first model, Council/Claw hard split, 3 views (Orb/Carousel/Focus), 4-phase build plan, all 7 open questions resolved | 2026-04-20 (council-approved, commits `2d8cbd9`→`9380300`) |
| **Claw Mode Phase 4** — Claw promoted to primary workspace shell (no longer z-50 overlay). Thread sidebar with grouped threads (Concierge/Broadcast/Direct/Execution). Context header showing thread type, active model, repo, build phase. Intent-first composer replacing 5 peer buttons with mode selector (Chat/Broadcast/Execute/Build) + single Send. Markdown rendering in chat via ReactMarkdown+remarkGfm with `.claw-prose` class. Fixed `SET_THREAD_MESSAGES` data loss (per-thread merge). Fixed stale synthesis closure (return value pattern). Contrast bumped from white/15-20 to white/30-40. View transition animations (180ms fade+translateY). Model picker anchored relative instead of fixed. | 2026-04-20 (`npm run typecheck`, `npm run build`) |
| ClawBuildSessionCard uses real executor adapter IDs (`claude_code`, `codex_cli`, `copilot_cli`) and abort now cancels the remote `executor_jobs` row instead of stopping at UI state only | 2026-04-29 (code verified, `npm run typecheck`) |

## What's Broken or Incomplete

| Issue | Since | Owner |
|-------|-------|-------|
| ~~**GPT OSS phantom agent**: fires during builds even when not selected as a builder — phantom agent bug~~ ✅ Fixed (2026-05-04, commit `c6ed517`): `isBuilderEligible()` predicate added; `openrouter_a` filtered from LLM roster text, candidate pool for builder lanes, stale-ID fallback, and Pre-Build candidate list; edge-path dispatch guard added; `architect` + `concierge` redeployed | 2026-04-19 | Done |
| ~~**Legacy broadcast can still include Claw agents**: "Provider maestroclaw not supported" error if local executors were in selectedAgentIds~~ ✅ Fixed (2026-05-04, commit `c6ed517`): `provider_group !== 'maestroclaw'` filter added in `useOrchestration.ts` broadcast; early-return guard added when no cloud-eligible agents remain | 2026-04-19 | Done |
| ~~**ClawCopilot / ClawCodex are not executable yet**~~: ✅ Fixed and smoke-tested — `packages/maestroclaw` now ships `copilot_cli` and `codex_cli` adapters, so capability-aware routing can advertise and claim those jobs when the local CLIs are installed. | 2026-04-21 (validated locally; workers must rebuild/restart to advertise) | Done |
| **Maestro web build UI may not read Claw results correctly**: `pollExecutorJob` reads artifact_manifest but flow from Claw through to GitHub commit not yet end-to-end tested via the Pre-Build UI (only tested via direct DB job insertion) | 2026-04-20 | Unassigned |
| ~~**Claw thread-first local build path still does not share one UI state model with BuildWorkspace**~~: ✅ Fixed in code — `sessionBuildState` in `MaestroContext` is now the shared source of truth for local session progress/runs/isRunning across both surfaces. | 2026-04-29 (`npx eslint src\hooks\useBuildExecution.ts src\components\reveal\ClawBuildSessionCard.tsx src\components\reveal\BuildWorkspace.tsx`, `npm run typecheck`, `npm run build`) | Done |
| **Claw Build v2 UX is still partly split across chat and classic Build drawer**: the in-thread card now executes and pushes directly, but rich manifest review, PR follow-up, and premium event-card presentation are still thinner in Claw than in the broader Build workspace. | 2026-04-29 (code verified, `npm run typecheck`, `npm run build`) | Partially fixed — keep refining Claw thread-first build UX |
| ~~**`auto` backend still escapes Claw mode into the Build drawer**~~: ✅ Fixed in code — `buildFromChat()` now routes `auto` to the in-thread session card when a locked MaestroClaw builder has a matching online executor. | 2026-04-29 (`npm run typecheck`, `npm run build`) | Done |
| ~~**Chat build approval is a dead stub and the fallback build path still uses per-file cloud orchestrate calls**~~: ✅ Removed — dead `ChatBuildPlan` / `chatBuildPhase` state, stale approval UI, and unused per-file chat build fallback were deleted so Claw no longer advertises a non-working review path. | 2026-04-29 (`npx eslint src\hooks\useThreads.ts src\components\reveal\ClawMode.tsx src\context\MaestroContext.tsx src\types\index.ts`, `npm run typecheck`, `npm run build`) | Done |
| **Claw local execution is still partly cloud-coupled for planning/routing**: direct shell-style execute requests now parse locally first, but concierge chat, direct agent chat, ambiguous execution requests, and build planning still route through `orchestrate`, adding avoidable latency and API cost on local-first flows. | 2026-04-29 (code verified, `npm run typecheck`, `npm run build`) | Unassigned |
| **Repo-wide lint is polluted by generated MaestroClaw outputs**: `npm run lint` traverses `packages\maestroclaw\builds\*` and transient job workspaces, so generated project files and preserved workdirs currently produce unrelated ESLint parse errors during repo validation. | 2026-04-29 (`npm run lint`) | Unassigned |
| ~~**Claw Mode thread/view labeling is misleading**~~: ✅ Fixed in Phase 4 — context header now shows thread type, active model, repo, build phase | 2026-04-20 (fixed) | Done |
| ~~**Claw Mode responsive layout is not ready**~~: ✅ Fixed in Phase 4 — intent composer wraps on mobile, model picker uses relative positioning, sidebar is collapsible | 2026-04-20 (fixed) | Done |
| **Claw poll loop is single-threaded**: `index.ts` does `await executeJob()` blocking one job at a time. 40-file builds run sequentially. Fix: concurrent job pool (MAX_CONCURRENT_JOBS, Phase 1 of CLAW_BUILD_V2_SPEC.md) | 2026-04-27 | ✅ **Fixed in Phase 1 (commit `2dd4752`)** |
| Kimi K2 intermittently shows bracket `{` as title despite parser fix — may be model-side output discipline | 2026-04-17 | Unassigned |
| Claude models (Sonnet/Opus) may still wrap response in ` ```json ` fences — parser handles most cases but edge cases remain | 2026-04-17 | Unassigned |
| Builder count defaults and roster locking now exist in Pre-Build, but provider-health-aware failover and lane reroute policy are still not concierge-driven | 2026-04-13 | Unassigned |
| No real-time streaming — responses arrive all at once; StreamingFolio is visual-only | Pre-existing | — |
| github-create-repo: no in-app guidance when Administration:write is missing | 2026-04-12 | — |
| GitHub App install UX still manual — backend capability exists, in-app detection/prompt does not | Pre-existing | — |
| No merge strategy for synthesized execution (last write wins on path collisions) | Pre-existing | — |
| Legacy tables (agent_skills, flags) still in schema but unused | Pre-existing | — |
| GitHub execute requires non-empty repo (at least one commit) — no auto-init | 2026-04-16 | — |
| API cost pressure: ~$30 over 5 days of testing with BYOK — MaestroClaw deployed and smoke-tested, workspace preservation working | 2026-04-17 | Mitigated (MaestroClaw routes through local CLI) |

## Known Drift Risks

These areas change often and should be re-verified after any significant work session:

- **Model roster** — check `src/types/index.ts` against the Agent Roster table in Part 1
- **Deployed function status** — `supabase functions list` vs the Edge Functions table
- **Migration status** — check for unapplied migrations in `supabase/migrations/`
- **Frontend bundle status** — does `npm run build` pass clean?

## Next Logical Steps

1. ~~**Claw Mode Phase 1 — Broadcast from Chat**~~ ✅ Done
2. ~~**Claw Mode Phase 2 — Execution in Chat**~~ ✅ Done
3. ~~**Claw Mode Phase 3 — Build from Chat**~~ ✅ Done
4. ~~**Claw Mode Phase 4 — Polish + Promotion**~~ ✅ Done
5. ~~**🔴 Claw Build v2 — Phase 1: Parallel poll loop**~~ ✅ Done (commit `2dd4752`)
6. ~~**🔴 Claw Build v2 — Phase 2: Session adapter mode**~~ ✅ Done (commit `36ab1c7`)
7. ~~**🔴 Claw Build v2 — Phase 3: Session executor**~~ ✅ Done (commit `36ab1c7`)
8. ~~**🔴 Claw Build v2 — Phase 4: Web UI session dispatch**~~ ✅ Done (commit `36ab1c7`)
9. ~~**🔴 Claw Build v2 — Phase 5: Concierge scope intelligence**~~ ✅ Done (this session)
10. **Smoke test the new default local build flow end-to-end**: First real BuildWorkspace local/auto run to verify multi-builder `build_session` dispatch, Claude headless session mode on Windows, and artifact aggregation across parallel builder scopes.
11. ~~**🔴 UX: Claw build-session cards in-thread**~~ ✅ Done (commit `ef41036`): `ClawBuildSessionCard` in-thread for local backend; auto/edge still use drawer.
12. ~~**UX: Premium event cards**~~ ✅ Done (commit `ef41036`): category-based system message styling with `detectSystemCategory()`.
13. ~~**UX: Segmented routing bar**~~ ✅ Done (commit `ef41036`): full-width routing bar above composer; `role="radiogroup"` + arrow-key nav; consequence label per intent.
14. **Unify the in-thread Claw card with the BuildWorkspace session controller** so chat-first local builds use the same multi-builder session pipeline and progress model.
15. **Artifact → GitHub bridge for Claw session builds**: Wire session artifact_manifest through `github-execute` edge function (greenfield build push).
16. **Retire legacy broadcast path** once v2 is battle-tested across multiple projects

---

# Part 3 — Session Log

*Append-only, newest first. Never delete entries.*

### 2026-05-04 — Claude Sonnet 4.6 — SEC-04 IncidentService end-to-end

**What was done**:
1. Created migration `20260504000000_executor_incidents.sql`: `executor_incidents` table with RLS (owner-scoped), indexes on user+recency+severity, and Realtime publication. Applied via `npx supabase db push`.
2. Added `IncidentSeverity`, `IncidentCategory`, `ExecutorIncident` types to `src/types/index.ts`.
3. Added `report_incident` action to `executor-api/index.ts`: authenticates via executor token (same as all other executor actions), validates severity/category/title/message, inserts row with `owner_user_id` from executor record.
4. Rewrote `packages/maestroclaw/src/lib/kernel/incident-service.ts`: removed broken `reportEvent("system_node_event")` fallback, added `report()` method POSTing to `executor-api?action=report_incident`, errors fully swallowed.
5. Added `setIncidentService()` / `getIncidentService()` to `executor.ts` as module-level accessor.
6. Wired `IncidentService` instantiation in `index.ts` at boot.
7. `approved-shell.ts` and `pty-shell.ts`: kernel violations → `severity: high, category: kernel_violation`; security violations → `severity: critical, category: security_violation`. Non-blocking.
8. Created `src/hooks/useUnackIncidents.ts`: Realtime subscription on `executor_incidents`, 24h window, exposes `incidents[]` + `unackCritical` count. Uses `useAuth()` for userId.
9. Created `src/components/reveal/SecurityPanel.tsx`: incident list with severity filter, badges, per-row expand/acknowledge, empty state.
10. Added "Security Incidents" section to `TrustDrawer.tsx` below Run Timeline.
11. `StatusChip.tsx`: pulsing red dot with unack count when `unackCritical > 0`, opens TrustDrawer on click.
12. Deployed `executor-api` to Supabase `hhlnadxbrdwxcxwfbvwh`.
13. Committed + pushed to GitHub (commit `6ec6b95`).

**Files touched**: `supabase/migrations/20260504000000_executor_incidents.sql`, `src/types/index.ts`, `supabase/functions/executor-api/index.ts`, `packages/maestroclaw/src/lib/kernel/incident-service.ts`, `packages/maestroclaw/src/executor.ts`, `packages/maestroclaw/src/index.ts`, `packages/maestroclaw/src/adapters/approved-shell.ts`, `packages/maestroclaw/src/adapters/pty-shell.ts`, `src/hooks/useUnackIncidents.ts`, `src/components/reveal/SecurityPanel.tsx`, `src/components/reveal/TrustDrawer.tsx`, `src/components/reveal/StatusChip.tsx`, `MAESTRO_STATE.md`, `IMPLEMENTATION_PLAN_STATUS.md`

**Decisions made**:
- `report_incident` uses executor token auth (not user JWT) — executor already has the token, no new credential needed. Owner mapped via `executor.owner_user_id`.
- IncidentService errors are fully swallowed — incident reporting must never crash the executor.
- `useUnackIncidents` uses `useAuth()` directly (not MaestroState) — auth state is not held in MaestroState.
- SecurityPanel is a flat section in TrustDrawer (not a separate tab) — TrustDrawer has no existing tab system, adding one would be over-engineering.

**What didn't work / notes**:
- git stash@{0} held all edits due to prior session leaving the repo in a dirty-stash state. Required `git stash pop` + conflict resolution on Gemini's EventCards/PlanCards files (kept HEAD versions).
- 26 pre-existing TS errors in Gemini's files (ClawMode, AtelierSidebar, BoardroomStage, Orb, RevealComposer, RevealTopbar, SessionSwitcher) — not caused by this session's changes.



**What was done**:
1. Fixed REL-01 (GPT-OSS phantom agent in build lanes). Root cause: `architect/index.ts` included all active agents in `agentRosterText` sent to the LLM, so the LLM could explicitly name "GPT-OSS 20B (free)" for a builder lane; exact-match path in `assignAgentToLane()` then returned it bypassing all score-based exclusions.
2. Added `isBuilderEligible(agent)` predicate (`openrouter_a` excluded) to `architect/index.ts`.
3. Filter `agentRosterText` to exclude `openrouter_a` — LLM never sees them as builder candidates.
4. Changed `assignAgentToLane()` to filter candidates to `eligibleCandidates` before exact/fuzzy/last-resort for builder lanes.
5. Fixed stale-ID fallback to prefer `isBuilderEligible` agents before falling back to full pool.
6. Fixed `concierge/index.ts` field name mismatch: was reading `build_spec.locked_builder_ids`, changed to `build_spec.primary_builder_agent_ids` (matches what Pre-Build writes). Now `state.buildPlan.locked_builder_ids` is properly populated.
7. Added `openrouter_a` exclusion to `usePreBuildPlan.ts` `builderCandidateAgents` — blocks selection at the source.
8. Added edge-path dispatch guard in `useBuildExecution.ts`: if `backend === 'edge'` and agent is `openrouter_a`, reroute to `fallback_owner` or fail with clear message.
9. Fixed legacy broadcast Claw leak in `useOrchestration.ts`: added `provider_group !== 'maestroclaw'` filter + early-return when no cloud-eligible agents remain after filtering.
10. Deployed `architect` and `concierge` to Supabase project `hhlnadxbrdwxcxwfbvwh`.
11. Committed + pushed to GitHub (commit `c6ed517`).

**Files touched**: `supabase/functions/architect/index.ts`, `supabase/functions/concierge/index.ts`, `src/hooks/usePreBuildPlan.ts`, `src/hooks/useBuildExecution.ts`, `src/hooks/useOrchestration.ts`, `MAESTRO_STATE.md`

**Decisions made**:
- Filter `openrouter_a` from agentRosterText entirely (not just annotated as non-builder) — if the LLM can't see them, it can't assign them. Simpler and more reliable than prompt-level instructions.
- Shared `isBuilderEligible()` predicate applied at all 4 layers (LLM input, candidate filtering, stale fallback, dispatch guard) — prevents this class of issue from recurring as models or scoring logic changes.
- Field name fix in concierge uses `Array.isArray()` check for safe handling of older/corrupt specs.
- Dispatch guard targets edge path only (`backend === 'edge'`) — local Claw builds route through the same `dispatchTask` but must not be blocked.

**What didn't work**: N/A — pre-existing typecheck errors in Gemini's WIP files (ClawMode, Orb, RevealComposer, etc.) already present before this session; not caused by this work.



**What was done**:
1. Authored `LIVE_CONCIERGE_COORDINATOR_SPEC.md` — full architectural spec for the live concierge build coordinator. Promoted from "Remaining Non-Audited Risks" to a real spec. Closes `smoketestaudit.md` item #7. The product-feel change that converts the Council from "panel that adjourns when work starts" to "coordinator continuously present during build."
2. Designed event-driven architecture: build state changes (task succeeded/failed, lane completed, milestone, provider degraded, etc.) trigger a `build-coordinator` edge function. The function reads current state, calls Haiku 4.5 with structured prompt + trigger context, decides via JSON contract (`should_speak`, `tone`, `message`, `suggested_action`).
3. Specified 16 trigger types with priority ordering (build.started/completed, task.succeeded/failed.recoverable/failed.terminal/slow, lane.completed/degraded, milestone.50pct/80pct, reroute.cost_escalation, bouncer.started/completed, provider.degraded/down, heartbeat.idle).
4. Rate limit: max 1 coordinator message per 30s except `action_required` tone (cost escalations, terminal failures, lane degradations bypass the gate).
5. Cost management: per-build hard cap at `$0.10` default (Haiku-only, ~$0.001/call). Empirical expectation: $0.004-$0.015/build; cap triggers only on adversarial scenarios. User configurable in TrustDrawer.
6. Designed the coordinator prompt — calm 1-3 sentence voice, specific numbers over vague phrases, never alarms about auto-recovered failures, JSON output forces explicit speak/no-speak decision.
7. Designed UI: `ConciergeLiveCard` renders inline in BuildRunwayCard with tone-based styling (info / warning / action_required / celebration). Coordinator presence indicator pulses subtly during active build. Suggested actions wire through to existing handlers (RerouteApprovalCard reused for reroute_approval suggested_action).
8. Specified integration points with DIFF-04 (provider fallback feeds health context + reroute triggers), Bouncer (transition narration), and explicitly DEFERRED PRO-01 deliberation integration to v1.1 to keep scope tight.
9. Designed `coordinator_invocations` audit table for telemetry/tuning — captures every LLM call with input/output tokens, cost, decision, message, rationale.
10. Specified 12-step implementation order with Opus-review checkpoint on step 3 (prompt template). Documented the v1 limitation that frontend-only triggering misses events when browser is closed; v1.1 will add DB-trigger-driven coordination via a `coordinator_pending_triggers` queue.

**Files touched**: `LIVE_CONCIERGE_COORDINATOR_SPEC.md` (new), `IMPLEMENTATION_PLAN_STATUS.md`, `MAESTRO_STATE.md`

**Decisions made**:
- Edge function (not always-on worker) — stateless, scales naturally, fits Supabase model. Trade-off accepted: when browser is closed, triggers stop firing in v1.
- Haiku 4.5 fixed for all coordinator calls — frequency × latency × cost makes Sonnet/Opus impractical. Speed (1-2s) and price (~$0.001) are required.
- Hardcoded triggers + LLM-decides framing (hybrid) — pure LLM ("evaluate everything constantly") is wasteful; pure hardcoded misses contextual judgment. The hybrid keeps cost predictable while letting voice be natural.
- JSON output with explicit `should_speak: false` short-circuit — forces the LLM to be a real gate, not a default-speak generator. Empty messages would mean visible empty bubbles.
- First-person voice ("I'm pausing") not third-person ("Coordinator paused") — the Council has personalities; Concierge has a voice. Third-person breaks the metaphor.
- Per-build budget (not per-session) — sessions can run multiple builds; cumulative cap would silence later builds unfairly.
- Rate limit bypass for `action_required` only — emergencies must get through; routine event storms get throttled.
- Suggested actions reuse existing handlers (RerouteApprovalCard, etc.) — no duplicate action logic.
- Disabled by default? No, enabled by default. The coordinator IS the product-feel change; opt-out via TrustDrawer.
- DB-trigger queue deferred to v1.1 — frontend-driven is good enough for "user is watching the build" which is the most common case.
- Voice consistency across builds (per-repo memory references) requires DIFF-02; deferred.

**What didn't work**:
- Spec only. No edge function, prompt template, or UI shipped. Implementation pending.
- Browser-closed scenario explicitly flagged as v1 limitation — frontend triggers stop when tab is closed, so coordinator misses events. Acceptable for v1 since user-watching-build is the dominant case.
- ETA prediction ("2 min remaining") is in an example but explicitly NOT specified for v1 — needs latency-tracking infrastructure that doesn't exist yet.
- Multi-build coordination (user runs 3 parallel builds) deferred — multi-build itself is rare enough to not block v1.
- The voice characteristics ("calm, specific, action-oriented") are grounded in product reasoning but have NOT been validated against real Haiku output. Step 3 of the implementation order is "validate prompt against real model before continuing UI integration." Prompt voice is hypothesis until tested.

### 2026-05-03 — Sonnet 4.6 — SEC-02 trust model migration (verified, code-ready, deploy pending)

**What was done** (cross-reference; Sonnet's session is primary record):
1. Implemented HMAC approval token flow end-to-end per `SEC-02_TRUST_MODEL_SPEC.md`.
2. New files: `supabase/functions/_shared/trusted-commands.ts` (Layer 2 server-authoritative classifier), `supabase/functions/_shared/approval-tokens.ts` (HMAC issuance/validation with 5-min TTL), `src/lib/trustHints.ts` (Layer 1 frontend prediction, UX hints only — never authoritative).
3. `executor-api` submit handler now: first shell submit returns `{pending_approval, approval_token}` without creating any DB row; re-submit with valid token (HMAC-validated, command-bound, TTL-enforced) creates an approved job. `pty_shell` adapter is gated alongside `approved_shell`.
4. Frontend: `pendingExecution` state extended to support both `approvalToken` (new flow) and `jobId` (legacy queued-job fallback). `approveWithToken()` added to `useThreads.ts`. `ExecutionApprovalCard` handles both paths transparently.
5. `TRUSTED_COMMANDS`, `classifyCommandTrust`, and `EXECUTION_INTENT_PROMPT` removed from `src/types/index.ts` and relocated to `src/lib/trustHints.ts` as predictive UX layer only (per spec — frontend never authoritative).
6. Legacy `approve` endpoint retained for backward compatibility with manually-created queued jobs that may exist in the database.
7. Build passes (typecheck + build clean). Rubber-duck check covered all 6 security angles (client bypass, forge, replay across commands, TTL replay, missing secret env var, legacy endpoint abuse).

**Still required to ship live (deploy step pending)**:
- `supabase functions deploy executor-api`
- Set `APPROVAL_TOKEN_SECRET` (32+ random bytes hex) in Supabase project secrets
- Frontend redeploy
- Live curl-based forge tests per spec verification section

**Impact**: Once deployed, the SEC-02 active blocker is closed. The five-layer defense-in-depth model is live: frontend prediction (Layer 1) → server classification (Layer 2) → HMAC token validation (Layer 3) → kernel binary allowlist (Layer 4) → kernel pipeline analysis (Layer 5, shipped via SEC-01).

**Verified**: Code-level — typecheck + build clean. Live verification pending deploy.

### 2026-05-03 — Opus 4.7 — Bouncer review profiles spec + agent onboarding brief

**What was done**:
1. Authored `AGENTS_ONBOARDING.md` — the canonical onboarding brief every new agent (Sonnet, Gemini, future Opus) reads when picking up work cold in this repo. Covers reading order (state doc → master plan → dedicated spec → status), task pickup flow, verification standards (browser smoke test required, not compile-only), status/state update format, when to stop and ask vs proceed, agent-specific strengths and pitfalls. Designed to solve the "fresh Sonnet session is confused by master plan alone" problem the Conductor flagged.
2. Authored `BOUNCER_PROFILES_SPEC.md` — promoted from "Remaining Non-Audited Risks" to a full spec. Closes `smoketestaudit.md` item #10 (Bouncer should be intent-aware) and unblocks the Conductor's stated CTF/training-lab use case.
3. Designed four review profiles: `production_app` (default — current behavior), `internal_demo` (downgrades pedagogical-class to informational), `training_lab` (suppresses pedagogical, keeps containment-critical), `security_ctf` (strict containment + suppressed pedagogical).
4. Designed the **reclassification matrix**: 16 finding categories × 4 profiles → severity outcome. The matrix is deterministic (in code, not LLM-driven) and reviewable. Categories include sql_injection, xss, idor, csrf, jwt_weak, hardcoded_credential, path_traversal, command_injection, ssrf, open_admin_endpoint, public_bind, missing_cors, vulnerable_dependency, insecure_default, pii_exposure, container_escape.
5. Designed the **containment-critical hard floor**: certain categories (pii_exposure, container_escape, public_bind on what should be loopback) are critical regardless of profile. Additionally, the LLM is prompted per-finding to declare whether it escapes the intended sandbox boundary; "yes" → containment_critical regardless of category/path/profile.
6. Designed path-based pedagogical markers via `bouncer.config.json` (per repo) with `pedagogical_paths: string[]` glob list. Same finding category gets different reclassification depending on whether the path matches.
7. Specified acknowledgment modal for `training_lab` and `security_ctf` selection — friction-by-design to prevent accidentally shipping a "training_lab" production app. Audit log entry on acknowledgment.
8. Designed concierge integration: prompt keyword classifier suggests profile (e.g., "build me a CTF challenge for SQLi" → suggests `security_ctf`).
9. Specified storage of BOTH raw and reclassified findings in `bouncer_events` for audit/forensic purposes — auditors need to know what was originally found AND what the profile suppressed.
10. Specified 11-step implementation order with Opus-review checkpoint on step 3 (the matrix table) — getting that table wrong ships either too-loose or too-strict reviews.

**Files touched**: `AGENTS_ONBOARDING.md` (new), `BOUNCER_PROFILES_SPEC.md` (new), `IMPLEMENTATION_PLAN_STATUS.md`, `MAESTRO_STATE.md`

**Decisions made**:
- Both raw and reclassified findings stored — auditability requires the full chain ("user's profile suppressed X" must be distinguishable from "Bouncer didn't catch X").
- Path-based pedagogical markers, NOT just per-profile reclassification — same project mixes pedagogical and production code; path scope is the correct granularity.
- Deterministic matrix in code, NOT LLM-driven reclassification — auditable, version-controlled, consistent run-to-run.
- LLM emits `containment_critical` boolean per finding for categories that COULD be either pedagogical or sandbox-escape (SQLi, command injection, path traversal, SSRF) — only the model has the code in front of it; matrix respects the LLM's containment flag as a hard floor.
- Acknowledgment modal required for `training_lab` and `security_ctf` first time per session; `internal_demo` does NOT require acknowledgment (only downgrades to informational, no suppression).
- Fall back to raw_severity when category isn't in the matrix — defense in depth; never silently bypass an unrecognized finding.
- Concierge classification of profile-suggestion lives in `concierge` edge function as a small Haiku call, cached per session — cheap, transparent, user always overrides.
- `bouncer.config.json` per-repo config wins over user account default; per-session selection wins over both — clear precedence, no surprises.
- Open-source training-lab matrix transparency considered (publish matrix as JSON in repo) but deferred to v1.1.

**What didn't work**:
- Spec only. No migration, edge function changes, plan card, or BouncerCard updates shipped.
- The matrix is grounded in security reasoning + the smoketest audit's category list; it has NOT been validated against real-world CTF or training-lab repos. Step 4 of implementation should test against a known-vulnerable fixture before shipping.
- CTF flag-handling validation (where flag lives, retrievable from inside but not outside) explicitly deferred to a follow-up `BOUNCER_CTF_VALIDATION.md` spec.
- Continuous-bouncer (mid-build observer mode, smoketest #5) is still unwritten — separate future spec.
- Per-finding manual override ("user marks this single finding as expected") deferred to v1.1.

### 2026-05-03 — Opus 4.7 — DIFF-04 provider fallback matrix spec

**What was done**:
1. Authored `DIFF-04_PROVIDER_FALLBACK_SPEC.md` — full architectural spec for structured provider health tracking and per-lane fallback chains. Closes the gap from `smoketestaudit.md` #4 (no structured fallback policy when builders fail).
2. Designed a two-layer provider health model: in-memory `Map` for hot-path dispatch decisions (no DB round trip), DB-backed `provider_health` table for persistence across sessions and multi-tab consistency. The in-memory layer is authoritative within a session; the DB layer is reconciled on session start and updated periodically.
3. Specified a 5-state state machine (`healthy`/`degraded`/`down`/`unknown`/`rate_limited`) with explicit transitions: 2 failures in 5 min → degraded; 3+ failures in 10 min → down; 3 successes → healthy; 429 with retry-after → rate_limited; 1 success after probe → degraded (recovery path).
4. Specified failure attribution: HTTP 5xx, 429, 401/403, network/timeout, truncation count as failures. HTTP 400 with model-specific error and 404 on free models do NOT count (they're user-input or model-availability issues, not provider health).
5. Designed per-lane fallback chains via a canonical lookup table (`CANONICAL_FALLBACKS` in `src/lib/providerFallbacks.ts`): primary + ordered fallbacks + emergency free model. Each agent in `AGENT_DEFAULTS` gets a curated chain.
6. Designed health-adjusted reordering at dispatch time: filter out `down` and active `rate_limited`, then prefer healthy > unknown > degraded.
7. Specified pre-build proactive probe via new edge function `provider-health-probe`: 5-token "Reply with OK" request to each unique model in lane assignments, ~$0.0001 per probe per model. Cached 5 min to avoid wasteful re-probes within the same build flow.
8. Specified mid-build reactive reroute with cost-aware approval gate: cost_delta ≤ 0 → auto-apply; 0 < delta ≤ user_threshold (default $1) → auto-apply with notice; delta > threshold → pause, render `RerouteApprovalCard` system event, continue on user approve.
9. Designed UI surfaces: BuilderRosterCard health dots with expandable fallback chain visualization; new TrustDrawer Health tab with manual probe/recovery controls and threshold setting; RerouteApprovalCard for cost-gated mid-build approval.
10. Specified 10-step implementation order with explicit Opus-review checkpoint on step 6 (failure classification table — wrong constants here either annoy users with false positives or fail to detect real outages).

**Files touched**: `DIFF-04_PROVIDER_FALLBACK_SPEC.md` (new), `IMPLEMENTATION_PLAN_STATUS.md`, `MAESTRO_STATE.md`

**Decisions made**:
- Two-layer health (memory + DB), not single-layer — hot-path dispatch can't afford DB round trips per task; DB persistence required for cross-session/cross-tab consistency.
- Concierge-driven probe (only at build time), NOT background monitor — burns API calls only when needed; first build of session has 5s overhead surfaced as "Probing providers..." plan card state.
- Failure-attribution conservative (single failures stay healthy; pattern of 2+ in window = degraded) — single failures are noisy network blips, real outages produce patterns.
- Granularity is `provider:model`, not just `provider` — OpenRouter routes same model id through different upstream providers; this captures actual rate-limit boundaries.
- `down` is sticky-ish (cleared by successful probe, manual reset, or 1-hour decay to `unknown`) — avoids "I refreshed and the state is wrong" while preventing permanent stuck-down.
- Emergency model is explicit field, NOT just last fallback entry — UI renders it differently (greyed out "free fallback") and cost gate signals "you're now using the emergency model."
- Cost threshold is global per-user (default $1), NOT per-build — defer per-build override to v2; first prove the global threshold works.
- Custom user fallback chains explicitly deferred to v1.1 — first prove canonical defaults work for 90% of cases.
- Claw / executor health stays in existing `executors` table, NOT in `provider_health` — separate concerns; cloud-provider health is the scope here.
- Probe via 5-token request, NOT HEAD — most LLM APIs don't expose true health endpoints; tiny round trip is the cheapest reliable proxy.

**What didn't work**:
- Spec only. No migration, edge function, fallback logic, or UI shipped. Implementation pending.
- The failure-attribution thresholds (2-in-5-min for degraded, 3-in-10-min for down) are first-pass values from reasoning about noise floors. Real telemetry from first week of shipping will tune these. Constants exposed as named constants for easy tuning.
- Did not specify cross-user shared health dashboards (privacy concern: one user's rate-limit signal could leak to other users). Skipped.
- Did not integrate with PRO-01 deliberation rounds — interesting future feature ("Council recommends Opus over emergency for this lane because…") but adds latency and complexity. Deferred.

### 2026-05-03 — Opus 4.7 — SEC-04 IncidentService wiring spec

**What was done**:
1. Authored `SEC-04_INCIDENT_SERVICE_SPEC.md` — full implementation spec for wiring the unused `IncidentService` class and replacing its broken fallback (`targetJobId = "system_node_event"` would fail at executor-api validation).
2. Designed a first-class `executor_incidents` table (NOT piggybacking on `executor_job_events`) with 6 categories (kernel_violation, security_violation, auth_violation, scope_violation, system_error, manual), 4 severities, RLS scoping, ack/ack_by columns for user acknowledgment, JSONB metadata for category-specific details.
3. Designed a dedicated `executor-api?action=report_incident` endpoint with executor-token auth and explicit field validation. Replaces the broken piggyback on `report_event`.
4. Rewrote `IncidentService.report` API to be network-failure-resilient: HTTP errors and network errors are caught and logged but never thrown — kernel must not break on reporting failure.
5. Wired the service into runtime via module-level setter/getter pattern in `executor.ts` (`setIncidentService`/`getIncidentService`) — keeps adapter signatures clean since adapters are factory-instantiated.
6. Specified incident reporting from both kernel adapters (`approved-shell.ts`, `pty-shell.ts`) on every rejection path: kernel violations report at severity `high`; security violations (binary not allowlisted) at severity `critical`. Metadata includes the rejected command, binary, segment, and full segment list.
7. Designed UI: new `SecurityPanel.tsx` rendered inside TrustDrawer Security tab with severity filter, last-30-days fetch, Realtime subscription for live incident push, expandable metadata, acknowledge button. New `useUnackIncidents` hook drives a red dot on `StatusChip` for unacknowledged criticals in the last 24h.
8. Specified 10-step implementation order. Sonnet can do all 10 steps.

**Files touched**: `SEC-04_INCIDENT_SERVICE_SPEC.md` (new), `IMPLEMENTATION_PLAN_STATUS.md`, `MAESTRO_STATE.md`

**Decisions made**:
- Dedicated `executor_incidents` table, NOT a column on `executor_job_events` — incidents are first-class user-visible artifacts with their own UI, retention, and ack semantics; job events are debug telemetry.
- Module-level `getIncidentService()` accessor, NOT constructor injection — adapters are factory-instantiated without args; ripple of constructor changes through every adapter would be invasive. Pragmatic, testable (set null in tests).
- `await` reports inside `try/catch` — fire-and-forget would silently lose reports on slow connections; await ensures send before return; catch ensures kernel never crashes on report failure.
- Severity matrix: `critical` for security_violation (kernel hard floor), `high` for kernel_violation (analyzer rejected pipeline; less alarming because conservative), `medium` reserved for future scope/auth violations, `low` for system errors.
- 90-day retention — hard delete via scheduled job, but the cron edge function ships in v1.1 (out of scope here). v1 incidents accumulate; reasonable users see <100 over months.
- Incidents also write to `audit_events` (kernel-rejected commands get both `executor_incidents` and `audit('command_rejected_by_kernel')`) — incidents are user-facing, audit is global.

**What didn't work**:
- Spec only. No migration, service rewrite, adapter wiring, or UI shipped.
- Email/push notification on critical incidents flagged for v1.1.
- "Mark as false positive" feedback loop for tuning the kernel allowlist deferred to v1.2 — needs incident volume to know if false positives are a real pattern.
- Cross-executor / team visibility deferred — Maestro is single-user today; revisit when workspace sharing ships.
- Did not implement the auto-purge cron job — flagged as a v1.1 follow-up.

### 2026-05-03 — Sonnet 4.6 — SEC-01 shell analyzer hardening (verified, shipped)

**What was done** (logged here for cross-reference; Sonnet's session is the primary record):
1. Rewrote `splitShellPipeline()` in `packages/maestroclaw/src/lib/kernel/shell-analyzer.ts` so `&&`, `||`, and `;` are recognized as segment separators (previously only `|` was).
2. Added quote/escape awareness — separators inside `"..."`, `'...'`, or escaped (`\;`) do NOT split.
3. Wired the `isWindows` parameter into the splitter so the Windows token set actually applies on Windows. Previously dead code.
4. Single `&` (background-job) is now always rejected as disallowed — backgrounding from LLM-generated context is almost always undesired.
5. Removed dead `emptySegment` variable.
6. Pre-existing placeholder corruption in `approved-shell.ts` also fixed.
7. Added 26 unit tests covering all the edge cases (`git status; rm`, `git status && rm`, `git status || rm`, `echo "a;b"`, `echo 'a&&b'`, `echo a\;b`, etc.). All 26 pass.
8. `npm --prefix packages\maestroclaw run build` clean.

**Impact**: The kernel injection vector identified in the 2026-05-03 audit is closed. `git status; rm -rf .` now decomposes into 2 segments; the second segment's binary (`rm`) is checked against the allowlist and rejected. Active blocker `SEC-01` removed from the Read This First table.

**Verified**: typecheck + build clean + 26/26 unit tests pass.

### 2026-05-03 — Opus 4.7 — PRO-02 iteration loop primitive spec

**What was done**:
1. Authored `PRO-02_ITERATION_LOOP_SPEC.md` — full architectural spec for the iteration loop primitive that closes the gap between one-shot execute and full build mode. The primitive enables tight read→propose→apply→verify loops, the daily-driver workflow that Cursor/Claude Code own and Maestro currently lacks.
2. Designed a four-table data model (`iteration_loops`, `iteration_steps`, `iteration_controls`, `iteration_locks`) with append-only audit semantics, RLS, and explicit termination reasons.
3. Specified the per-step state machine (pending→reading_files→proposing_diff→awaiting_approval→applying→verifying→terminal) with explicit failure-mode handling for: infinite loops, scope creep, concurrent edit conflicts, verification false positives, and unrecoverable mid-loop state.
4. Designed the per-step prompt template — JSON-output contract with `give_up` signal, file hashes embedded for stale-base detection, prior-step memory built into prompt rather than relying on per-loop persistent context.
5. Specified diff application semantics: unified-diff format applied via `git apply --check` then `git apply`, with per-step git checkpoints enabling per-step rollback on verification failure. Per-step commits (squashable at loop end) preserve restart-resilience.
6. Specified file-level locking via `iteration_locks` to prevent two loops or a build from racing on the same files. Locks auto-expire as a Phase B safety so a dead Claw doesn't permanently block.
7. Integrated with SEC-02 server-authoritative trust: loop creation is gated on sensitive paths and verification command classification; auto-apply pauses per-step when diffs touch sensitive files even if loop-level auto_apply is on.
8. Designed UX: structured-form composer for desktop, natural-language fallback for mobile, IterationCard with collapsible per-step rows, inline approval panel, three terminal-state visual treatments.
9. Drove the loop on the MaestroClaw worker (not edge function) because edge timeouts cap at ~50s and verification commands alone can run 30-60s. Frontend gets live updates via Realtime subscription.
10. Specified 10-step implementation order with explicit Opus-review checkpoints on steps 5 (prompt) and 6 (diff apply) — the two places this primitive succeeds or fails.

**Files touched**: `PRO-02_ITERATION_LOOP_SPEC.md` (new), `IMPLEMENTATION_PLAN_STATUS.md`, `MAESTRO_STATE.md`

**Decisions made**:
- Loop driver is the local Claw, not an edge function — only architecture that doesn't bottleneck on Supabase Edge timeouts for multi-step verification flows.
- Per-step git commits (atomic, squashable) instead of in-memory rollback — more correct and restart-resilient. Trade-off: noisier history; mitigation: end-of-loop squash button, default ON for ≤5 steps.
- `git apply` over edit-and-write — built-in hunk validation, native diff format usable in UI, well-supported.
- Append-only `iteration_controls` table for user interrupts (pause/abort/edit_goal/approve_diff) instead of mutating loop rows directly — preserves order under racing intents and provides audit.
- Auto-apply is a UX convenience that NEVER bypasses sensitive-path approval — sensitive files always require human-in-loop even with auto_apply on. The escalation is per-step, not just per-loop.
- Stateless agent perspective — runner builds prompt fresh each step from DB. Allows kill-Claw-mid-loop recovery without orphan state.
- v1 single-agent per loop. Multi-agent deliberation on diffs (PRO-01 + PRO-02 integration) is a v1.2 feature once both have shipped independently — keep PRO-02 scope tight.
- New file creation allowed if path globs into `scope_paths`. Lock acquired mid-loop for new paths.
- Mobile fallback to single-textarea natural-language goal entry; concierge parses goal/scope/verification — desktop keeps structured form.

**What didn't work**:
- This pass is spec-only. No migration, runner, edge function, or UI shipped. Implementation pending.
- Prompt template JSON contract is grounded in design reasoning, NOT yet validated against real Claude Code outputs. Step 5 of the implementation order is explicitly "test prompt against real model first; tune before continuing." Until that happens, the JSON contract is a hypothesis.
- Bouncer-on-iteration-diff integration is stubbed for v1.1 — added the data model hooks but no implementation.
- DIFF-01 cost rollup integration for iteration step costs is flagged as a follow-up; loop steps will produce response rows but the cost rollup spec needs an update to count iteration tokens separately.
- Did not address the case where user is on a protected branch (e.g., main) at loop start — flagged as Open Question 4 with a recommendation but not decided.

### 2026-05-03 — Opus 4.7 — PRO-01 deliberation round spec

**What was done**:
1. Authored `PRO-01_DELIBERATION_ROUND_SPEC.md` — complete architectural design for inter-agent deliberation between Round 1 broadcast and synthesis. The design converts the Council from "panel of consultants giving parallel monologues" to "board of directors pushing back on each other."
2. Designed the deliberation prompt template with three structured questions (objection / agreement / self-critique), JSON-output contract, and redaction algorithm (responses re-labeled as "Voice A/B/C" to reduce brand bias before being shown to other agents).
3. Designed the deliberation-aware synthesis prompt that PRESERVES tension instead of blending it — output includes `consensus`, `trade_offs`, `acknowledged_weaknesses`, `unresolved_tensions`, and `recommendation`. This is the differentiating output no other AI tool produces today.
4. Specified three trigger modes: manual toggle in composer, concierge-suggested post-R1 triage (Haiku-fast), and auto-trigger for high-stakes prompts (`pre_build`/`design` with 3+ active agents).
5. Specified data model changes (`responses.kind`, `responses.deliberation_targets`, `responses.deliberation_pushbacks`, `rounds.deliberation_enabled`) and a 10-step ship-order that lets each step deploy independently.
6. Surfaced and decided three non-obvious failure modes the implementation must handle: brand bias (redaction), echo collapse (objection-eliciting prompts), and synthesis drift (tension-preserving synthesis prompt).

**Files touched**: `PRO-01_DELIBERATION_ROUND_SPEC.md` (new), `IMPLEMENTATION_PLAN_STATUS.md`, `MAESTRO_STATE.md`

**Decisions made**:
- One deliberation round in v1, not multi-round — diminishing returns past R2.
- JSON output, not free-form prose — required for UI rendering and synthesis ingestion.
- Three questions specifically (objection / agreement / self-critique) — tested mentally against echo-collapse and consensus-flattening failure modes.
- Style-leakage redaction is partial in v1 (only attribution stripped, writing style preserved) — v2 adds neutral-voice rewriting if needed.
- Auto-trigger (Mode 3) defaults OFF for new users with explicit onboarding opt-in — auto-cost surprises are bad UX.
- Skip deliberation when fewer than 3 agents are active — 2-voice deliberation collapses to a 1-on-1 critique with different dynamics.
- Tagged Opus-only for prompt + synthesis work; Sonnet can do migration, UI, and wiring without senior review. If implementing entirely on Sonnet, must stop after step 2 (edge function) and validate prompt outputs on real test data before continuing.

**What didn't work**:
- This pass is spec-only. No edge function, migration, or component code shipped. Sonnet/Opus implementation pending.
- Visualization of the pushback graph (network of agree/disagree across agents) is sketched but deferred to v2 — would be a powerful visual but out of scope for the first ship.
- Did not run a live mental test of the prompt template against real model outputs — the prompt design is grounded in reasoning about failure modes, not empirical eval. First implementation step should run the prompt against real responses and tune.

### 2026-05-03 — Opus 4.7 — SEC-02 trust model migration spec

**What was done**:
1. Authored `SEC-02_TRUST_MODEL_SPEC.md` — full implementation spec for migrating trust classification from frontend-authoritative to server-authoritative, with HMAC approval tokens and a five-layer defense-in-depth model.
2. Resolved all open questions from the master plan's SEC-02 task (registry location, token format, TTL, custom user lists, race conditions, env-var failure mode).
3. Documented the explicit migration order, acceptance criteria, and curl-based live verification steps so Sonnet can implement without further architectural decisions.
4. Clarified the distinction between Registry A (server trust classifier — UX policy) and Registry B (Claw kernel binary allowlist — security floor) so future agents do not conflate them.

**Files touched**: `SEC-02_TRUST_MODEL_SPEC.md` (new), `MAESTRO_STATE.md`

**Decisions made**:
- HMAC stateless tokens over DB-stored approvals — cheaper, simpler, acceptable for 5-min TTL.
- 5-minute approval TTL with env-var override for tuning — fails closed if `APPROVAL_TOKEN_SECRET` missing.
- Frontend regex predictor (`predictCommandTrust`) and server regex classifier (`classifyCommand`) deliberately kept as parallel sources — couples deploys less and the frontend is never authoritative.
- Single-PR deploy required (frontend + edge function); contract change is breaking.
- Per-user trust customization explicitly deferred to SEC-02b; v1 ships static global registry.
- Non-shell adapters (claude_code etc.) explicitly out of scope for SEC-02 — they have separate approval semantics already.

**What didn't work**:
- This pass produced spec-only deliverables. Implementation, deployment, and live curl-based forge tests are still pending — Sonnet's job per the implementation plan.
- The follow-up SEC-02b (user-customizable allowlists) and SEC-02c (LLM intent parser security) are flagged but not specced.

### 2026-05-03 — Opus 4.7 — Implementation plan + audit

**What was done**:
1. Performed a full audit of the codebase: web app, MaestroClaw worker, ThamosClaw kernel files (`shell-analyzer.ts`, `incident-service.ts`, `pty-shell.ts`), and the unified UX phases 0-10.
2. Identified two previously-unflagged active security blockers: (a) `splitShellPipeline` does not treat `&&`, `;`, or `||` as separators, allowing single-segment injection past the binary allowlist; (b) trust classification is client-authoritative — frontend `TRUSTED_COMMANDS` regex decides approval requirement and backend honors the flag.
3. Identified additional gaps: orb component (`EmptyStage.tsx`) is fully implemented but orphaned (not rendered in `ClawMode`); `pty_shell` adapter is registered but no routing path selects it; `IncidentService` class is implemented but never instantiated; `gemini_cli` adapter exists but state doc still claims "3 MaestroClaw agents."
4. Authored `IMPLEMENTATION_PLAN.md` — 17 self-contained, agent-ready task blocks across four phases (security/reliability → conversational UX → differentiation → product moment) plus three tech-debt parallel tracks. Each block includes recommended agent (Sonnet/Opus/GPT-5.5/Gemini), file paths, current state, target state, acceptance criteria, verification steps, dependencies, and open questions.
5. Authored `IMPLEMENTATION_PLAN_STATUS.md` — append-only tracking ledger so any agent can see what's claimed/in-progress/verified without re-reading the plan.
6. Updated `Active blockers` row in this state doc to surface the two newly-identified security blockers.

**Files touched**: `IMPLEMENTATION_PLAN.md` (new), `IMPLEMENTATION_PLAN_STATUS.md` (new), `MAESTRO_STATE.md`

**Decisions made**:
- Sonnet 4.6 is the default workhorse for implementation work; Opus reserved for security-model design, new product primitives, and multi-system tradeoffs.
- Phase 1 (Security & Reliability) sequenced first because two of the four items (`SEC-01`, `SEC-02`) close active vulnerabilities.
- Browser smoke testing is now a hard verification gate; compile-only verification ("typecheck + build clean") is documented as the failure mode of the prior 30 days and explicitly insufficient.
- The trust classifier registry (UX policy) and kernel binary allowlist (security floor) are kept as separate sources of truth — different purposes, different failure modes.
- Inter-agent deliberation round (`PRO-01`) is the highest-leverage product differentiator and tagged Opus-only to prevent scope drift during implementation design.

**What didn't work**:
- The audit relied on reading code, the state doc, and `smoketestaudit.md`, not on running a live browser session against the deployed app. Some "Verified" rows in this state doc may already be stale despite their dates.
- Confirmation of `REL-01` (GPT OSS phantom agent root cause) was not attempted — the implementation plan task for it is investigation-first.



**What was done**:
1. Identified a startup deadlock introduced by the shell refactor: `WorkspacePage.tsx` gated on `state.workspace`, but the `useWorkspace()` hook that seeds `workspace` was no longer mounted anywhere before that gate.
2. Re-mounted `useWorkspace()` inside `WorkspacePage.tsx`, restoring the initialization effect that loads/creates the workspace, agents, sessions, providers, repos, and executor state.
3. Re-ran app `typecheck` and `build`.

**Files touched**: `src/pages/WorkspacePage.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- Fixed the deadlock at the mount point instead of moving bootstrap logic into a new provider, because the regression was a simple lost hook mount and the smallest correct repair was to restore that lifecycle.
- Kept the hotfix surgical so the production site can recover quickly without reopening the broader shell/state model again.

**What didn't work**:
- This pass does not add an explicit watchdog or timeout UI for future init stalls; it fixes the concrete regression that left the loader hook unmounted.

### 2026-05-01 — GitHub Copilot (GPT-5.4) — MaestroClaw deployment follow-through

**What was done**:
1. Verified the real Supabase target project ref as `hhlnadxbrdwxcxwfbvwh` by listing the live function set and matching it to the Maestro stack (`executor-api`, `concierge`, `orchestrate`, `github-read`, etc.).
2. Logged the CLI into Supabase, linked the repo to that remote project, and deployed `executor-api` to the verified target.
3. Pushed the pending remote migrations `20260501183500_enable_realtime_build_progress.sql` and `20260501191500_allow_retry_executor_events.sql`.
4. Updated deployment state in `MAESTRO_STATE.md` so the repo now reflects that the Phase 10 realtime tables and the new executor retry-event schema are live remotely.

**Files touched**: `MAESTRO_STATE.md`

**Decisions made**:
- Deployed with explicit project verification first instead of assuming the pasted URL was correct, because this environment had multiple accessible Supabase projects and the repo was not linked yet.
- Used the linked-project flow for `db push` after verifying `--project-ref` works for function deploys but not for `db push` in this CLI version.

**What didn't work**:
- No additional edge functions were redeployed in this pass because only `executor-api` changed in the remediation track.
- The local repo still has the user-owned untracked `UNIFIED_UX_MOCKUP.html`; it was intentionally left untouched.

### 2026-05-01 — GitHub Copilot (GPT-5.4) — MaestroClaw alignment Phase B

**What was done**:
1. Added executor token rotation to `executor-api`, returning a one-time replacement token while forcing the rotated executor back to `offline` so stale tokens stop being treated as live nodes.
2. Updated `ExecutorSection.tsx` with per-executor rotate controls and a reusable one-time token reveal panel so newly rotated tokens are surfaced the same way as registration tokens.
3. Extended local `build_session` dispatch in `useBuildExecution.ts` to send exact `scope_paths`, literal `expected_files`, and a bounded set of sibling `context_files` fetched from the connected GitHub repo through `github-read`.
4. Updated the MaestroClaw worker prompt builder to render exact scope-path lists when provided, instead of collapsing everything to a single coarse summary string.
5. Re-ran app `typecheck`, app `build`, and `npm --prefix packages\maestroclaw run build`.

**Files touched**: `supabase/functions/executor-api/index.ts`, `src/components/reveal/ExecutorSection.tsx`, `src/hooks/useBuildExecution.ts`, `packages/maestroclaw/src/executor.ts`, `MAESTRO_STATE.md`

**Decisions made**:
- Derived `expected_files` only from literal scoped file paths, which gives the worker concrete completion targets without pretending that broad globs can be enumerated safely client-side.
- Limited `context_files` to a small set of sibling literal files from the connected repo and skipped oversized files, keeping `executor-api?action=submit` under its existing body limit instead of creating a second artifact upload path.
- Forced rotated executors offline immediately so token rotation acts like a real credential rollover, not just a hidden duplicate secret.

**What didn't work**:
- This pass still does not add rename/edit executor metadata or a richer executor operations dashboard; rotation/reissue was the production-critical control added here.
- Edge-function deployment was not performed from this environment; this session updated the repo code and validation state only.

### 2026-05-01 — GitHub Copilot (GPT-5.4) — MaestroClaw hardening Phase A

**What was done**:
1. Added a follow-up migration so `executor_job_events` accepts the `retry` event type that the worker already emits during Ralph/fix-pass retries.
2. Removed `--print` from Claude session-mode execution so `build_session` runs use the real file-writing path instead of the one-shot print mode that `CLAW_BUILD_V2_SPEC.md` called out.
3. Hardened `executeSessionJob()` to enforce allowed scope after the run, revert or remove out-of-scope writes before checkpoint/build-dir export, and surface the violation through executor stderr events instead of silently keeping bad files.
4. Switched worker artifact reporting to chunkable `artifact` events with a safe inline-manifest fallback so larger local builds no longer depend on a single oversized completion payload.
5. Updated the web-side session/local build hook to reconstruct manifests from chunked `executor_job_events` on realtime updates and terminal fallback reads, preserving GitHub push and reload behavior.
6. Re-ran app `typecheck`, app `build`, and `npm --prefix packages\maestroclaw run build`.

**Files touched**: `packages/maestroclaw/src/executor.ts`, `packages/maestroclaw/src/adapters/claude-code.ts`, `src/lib/sessionBuild.ts`, `src/hooks/useBuildExecution.ts`, `supabase/migrations/20260501191500_allow_retry_executor_events.sql`, `MAESTRO_STATE.md`

**Decisions made**:
- Used chunked `artifact` events plus frontend rehydration instead of inventing a new artifact table, so large-manifest recovery reuses the realtime/event channel already added in Unified UX Phase 10.
- Enforced scope by pruning/reverting out-of-scope files before checkpoint/export rather than merely warning, which keeps session builds from smuggling unexpected files into the shared build dir or GitHub push flow.
- Kept small manifests inline on the completion row for compatibility, while letting larger manifests fall back to the event stream only when needed.

**What didn't work**:
- This pass still does not add executor token rotation or fuller `build_session` context wiring (`expected_files`, cross-builder `context_files`); those remain the next remediation phase.
- Validation here was compile/build level only; no live end-to-end smoke run against a connected local executor was performed yet.

### 2026-05-01 — GitHub Copilot (GPT-5.4) — Unified UX Phase 10 realtime progress

**What was done**:
1. Reworked `useBuildExecution.ts` so active build sessions subscribe to Supabase Realtime for `build_tasks`, `executor_jobs`, and `executor_job_events` instead of relying on 2–5 second polling loops.
2. Replaced local executor completion polling with realtime-backed waiters for both task builds and session builds, while keeping a single-shot timeout fallback query for terminal-state recovery.
3. Added live stdout/stderr capture in the build hook and surfaced that output in both `BuildRunwayCard.tsx` and `BuildWorkspace.tsx` during local execution.
4. Added a migration to publish `build_tasks`, `executor_jobs`, and `executor_job_events` to `supabase_realtime` so the frontend subscriptions have a canonical server-side backing.
5. Re-ran app `typecheck` and `build`.

**Files touched**: `src/hooks/useBuildExecution.ts`, `src/components/reveal/BuildRunwayCard.tsx`, `src/components/reveal/BuildWorkspace.tsx`, `supabase/migrations/20260501183500_enable_realtime_build_progress.sql`, `MAESTRO_STATE.md`

**Decisions made**:
- Used realtime-driven waiters inside the existing hook instead of inventing a second build-progress service, so the task queue and session-build paths stay on one execution abstraction.
- Subscribed task progress from `build_tasks` rows so runway and advanced workspace can converge on the same persisted source of truth even when they mount separately.
- Kept a one-shot timeout fetch as a recovery path in case a terminal realtime event is missed, while removing the steady-state polling loop.

**What didn't work**:
- This pass streams the latest stdout/stderr snippets into the UI, but it does not yet add a richer scrollback/log viewer for older executor output.
- Validation here was compile-level only (`npm run typecheck`, `npm run build`), not a live browser smoke test against a running local executor.

### 2026-05-01 — GitHub Copilot (GPT-5.4) — Unified UX Phase 9 topbar status chip

**What was done**:
1. Added `src/components/reveal/StatusChip.tsx` as the canonical shell status surface for concierge model, executor availability, connected key count, and execution mode.
2. Replaced the old ClawMode thread/mode badge with the new status chip and moved execution-mode switching into the chip itself.
3. Added an inline detail panel on the chip for surface context, repo context, and explicit execution-mode selection.
4. Removed the old top-of-thread mode banner from `ClawMode.tsx` so the shell now has one canonical status surface instead of split badge + banner chrome.
5. Re-ran app `typecheck` and `build`.

**Files touched**: `src/components/reveal/StatusChip.tsx`, `src/components/reveal/ClawMode.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- Kept the chip stateful and local to the shell instead of introducing more reducer state for a lightweight disclosure panel.
- Reused the existing `executionMode` reducer state and let the chip cycle or directly set it, rather than inventing a separate topbar-specific mode model.
- Removed the old mode banner entirely so build/execute readiness and trust mode now live in one place.

**What didn't work**:
- This pass did not yet migrate drawer-level trust summaries; the canonical shell status surface is unified, but the Trust drawer still shows deeper mode details on demand.
- Validation here was compile-level only (`npm run typecheck`, `npm run build`), not a live browser smoke test.

### 2026-05-01 — GitHub Copilot (GPT-5.4) — Unified UX Phase 8 carousel actions

**What was done**:
1. Added thread-native action rails to `FolioCard.tsx` for pinning a response into the concierge thread, opening compare mode, asking a direct follow-up, extracting a decision, and synthesizing from a selected response.
2. Extended `FolioCarousel.tsx` with local compare selection state, a side-by-side comparison sheet, comparison persistence, and selected-response synthesis that flags the chosen response before calling the existing round synthesize flow.
3. Added shared thread helpers in `useThreads.ts` for concierge info-card writes, response pinning, response comparison, decision extraction, and direct-thread focusing/seeding.
4. Rewired `ClawMode.tsx` agent focus to reuse the same direct-thread bootstrap helper as the new carousel follow-up action.
5. Re-ran app `typecheck` and `build`.

**Files touched**: `src/hooks/useThreads.ts`, `src/components/reveal/FolioCard.tsx`, `src/components/reveal/FolioCarousel.tsx`, `src/components/reveal/ClawMode.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- Kept Phase 8 event persistence on the existing typed `info` system-card path instead of introducing another message kind, so pinned references, comparisons, and recorded decisions all survive reloads without expanding the renderer surface again.
- Extracted direct-thread focus/seeding into `useThreads.ts` so carousel follow-ups and focus-mode entry now share the same bootstrap behavior.
- Reused the existing round-level synthesize path by flagging the selected response first, which keeps concierge synthesis behavior consistent without adding a second synthesis API.

**What didn't work**:
- The comparison result persisted to the thread is currently a deterministic summary card, not an additional LLM-generated diff artifact.
- Validation here was compile-level only (`npm run typecheck`, `npm run build`), not a live browser smoke test.

### 2026-05-01 — GitHub Copilot (GPT-5.4) — Unified UX Phase 6 bouncer card

**What was done**:
1. Added `src/components/reveal/BouncerCard.tsx` as the shared presentation component for bouncer status, severity counts, collapsed finding groups, and conductor actions.
2. Added `src/hooks/useBouncerReview.ts` so both the thread runway and the advanced `BuildWorkspace` can trigger bouncer review and record conductor decisions through the same behavior.
3. Replaced the inline bouncer presentation in `BuildWorkspace.tsx` with the new shared card while preserving the existing completeness gate and phase transitions.
4. Added the shared bouncer card to `BuildRunwayCard.tsx`, so a conductor can run review and approve/pause/abort without leaving the thread.
5. Re-ran app `typecheck` and `build`.

**Files touched**: `src/types/index.ts`, `src/hooks/useBouncerReview.ts`, `src/components/reveal/BouncerCard.tsx`, `src/components/reveal/BuildWorkspace.tsx`, `src/components/reveal/BuildRunwayCard.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- Kept the bouncer trigger behavior unchanged at the edge-function level and limited the phase to UI/component extraction, per spec.
- Left severity groups collapsed by default so the card summary stays compact in both the runway and drawer views.
- Reused the same conductor-decision semantics (`approve_continue`, `acknowledge`, `pause`, `abort`) and only standardized the visual hierarchy around them.

**What didn't work**:
- Validation here was compile-level only (`npm run typecheck`, `npm run build`), not a live browser smoke test through push → bouncer → approval/abort flows.
- The shared bouncer hook still keeps its review result in component-local state, so reopening the other surface after a fresh reload may require rerunning the review to repopulate the card.

### 2026-05-01 — GitHub Copilot (GPT-5.4) — Unified UX Phase 5 plan cards

**What was done**:
1. Added persisted thread-native plan-card messages for Pre-Build so build setup now unfolds inline through project type, repo, builder roster, backend, architect, lane, and spec-lock cards.
2. Added `src/hooks/usePreBuildPlan.ts` plus the new `src/components/reveal/PlanCards/` renderer set to drive real session/build-spec updates directly from the thread instead of defaulting to the drawer.
3. Refactored `useThreads.buildFromChat()` so incomplete build setup no longer auto-opens `PreBuildPanel`; it now writes the plan-card sequence into the thread and only uses the drawer as an explicit advanced view.
4. Added a shared runway activation helper so the final lock card can persist lanes, lock the spec, and hand the thread directly into the build runway.
5. Removed the dead per-project Supabase placeholder block from `PreBuildPanel.tsx`.
6. Re-ran app `typecheck` and `build`.

**Files touched**: `src/types/index.ts`, `src/hooks/useThreads.ts`, `src/hooks/usePreBuildPlan.ts`, `src/components/reveal/ClawMode.tsx`, `src/components/reveal/PreBuildPanel.tsx`, `src/components/reveal/PlanCards/PlanCardFrame.tsx`, `src/components/reveal/PlanCards/PlanCardRenderer.tsx`, `src/components/reveal/PlanCards/ProjectTypeCard.tsx`, `src/components/reveal/PlanCards/RepoCard.tsx`, `src/components/reveal/PlanCards/BuilderRosterCard.tsx`, `src/components/reveal/PlanCards/BackendCard.tsx`, `src/components/reveal/PlanCards/ArchitectCard.tsx`, `src/components/reveal/PlanCards/LaneCard.tsx`, `src/components/reveal/PlanCards/SpecLockCard.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- Stored plan cards as persisted `thread_messages` with `metadata.kind = 'plan_card'` so the Pre-Build flow stays thread-native and survives reloads without creating another side-channel state tree.
- Kept the plan-card draft state in `sessions.build_spec` (especially builder roster, requested prompt, and suggested lanes) so multiple cards can read and mutate the same live draft without needing a separate frontend-only store.
- Left `PreBuildPanel.tsx` intact as the power-user surface and added “Open advanced view” affordances on the cards instead of deleting the drawer.

**What didn't work**:
- Validation here was compile-level only (`npm run typecheck`, `npm run build`), not a live browser smoke test through the full repo-connect → architect → lane-lock → runway flow.
- The thread cards currently persist lane edits into `build_spec.suggested_lanes` before lock; the canonical `build_lanes` rows still only exist after the final spec-lock action.

### 2026-05-01 — GitHub Copilot (GPT-5.4) — Unified UX Phase 7 premium event cards

**What was done**:
1. Added a typed system-event metadata model in `src/types/index.ts` and converted new thread-system writes in `useThreads.ts` from emoji-prefixed plain text into structured event payloads.
2. Added the `src/components/reveal/EventCards/` renderer set (`ExecutionApprovalCard`, `CommandResultCard`, `FileManifestCard`, `PrOpenedCard`, `ErrorRetryCard`, `InfoCard`) plus a `SystemEventCard` dispatcher.
3. Replaced the old inline approval banner and `detectSystemCategory()` path in `ClawMode.tsx` with metadata-based card rendering, while keeping legacy system messages on the plain-text fallback path.
4. Updated `BuildRunwayCard.tsx` to post a typed PR-opened event back into the thread after a successful GitHub push.
5. Re-ran app `typecheck` and `build`.

**Files touched**: `src/types/index.ts`, `src/hooks/useThreads.ts`, `src/components/reveal/BuildRunwayCard.tsx`, `src/components/reveal/ClawMode.tsx`, `src/components/reveal/EventCards/SystemEventCard.tsx`, `src/components/reveal/EventCards/ExecutionApprovalCard.tsx`, `src/components/reveal/EventCards/CommandResultCard.tsx`, `src/components/reveal/EventCards/FileManifestCard.tsx`, `src/components/reveal/EventCards/PrOpenedCard.tsx`, `src/components/reveal/EventCards/ErrorRetryCard.tsx`, `src/components/reveal/EventCards/InfoCard.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- Kept the migration backwards-compatible: old persisted system messages still render as simple thread copy, but all new system flows now prefer typed event metadata.
- Promoted the execution approval UI into a persisted thread card so approvals survive reloads and no longer depend on a special-case shell banner.
- Reused the shared `addMessage()` persistence path instead of inventing a second event transport, keeping system cards inside existing `thread_messages` rows.

**What didn't work**:
- This pass does not yet emit every possible build artifact as a dedicated manifest card; the file-manifest renderer exists, but current live writes are still focused on approvals, status/error updates, and PR/open results.
- Validation here was compile-level only (`npm run typecheck`, `npm run build`), not a live browser smoke test.

### 2026-05-01 — GitHub Copilot (GPT-5.4) — Unified UX Phase 4 build runway

**What was done**:
1. Replaced the old local-only `ClawBuildSessionCard.tsx` with a new `BuildRunwayCard.tsx` that owns the thread-native Plan → Scope → Execute → Review → Push flow.
2. Changed `useThreads.buildFromChat()` so build requests now always open the in-thread runway instead of branching between a thread card for local and the drawer for edge.
3. Added shared build helpers in `useBuildExecution.ts` for hydrating persisted task rows and pushing task-queue builds to GitHub, then wired `BuildWorkspace.tsx` to reuse that push path.
4. Updated `ClawMode.tsx` shell language and rendering so the thread now presents the build surface as a runway rather than a one-off session widget.
5. Re-ran app `typecheck` and `build`.

**Files touched**: `src/hooks/useBuildExecution.ts`, `src/hooks/useThreads.ts`, `src/components/reveal/BuildWorkspace.tsx`, `src/components/reveal/ClawMode.tsx`, `src/components/reveal/BuildRunwayCard.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- Used the session build model only for explicit `execution_backend === 'local'`; edge and auto now stay on the task-queue path so the runway can represent mixed edge/local routing instead of hiding it behind a local-only shortcut.
- Kept `BuildWorkspace.tsx` as the advanced inspection surface, but moved the primary thread-first push path into the new runway card and reused a shared GitHub push helper to keep behavior aligned.
- Left `clawBuildSession` state naming in place for this checkpoint to avoid mixing a behavioral UX cutover with a larger state-schema rename in the same phase.

**What didn't work**:
- Task-build progress still lives inside `useBuildExecution` hook state, so the advanced drawer is not yet a fully shared live mirror of an in-flight runway task build; the runway self-hydrates from `build_tasks`, but this is not the final shared-progress architecture.
- Validation here was compile-level only (`npm run typecheck`, `npm run build`), not a live browser smoke test across edge/local/auto backend paths.

### 2026-05-01 — GitHub Copilot (GPT-5.4) — Unified UX Phase 3 concierge event cards

**What was done**:
1. Replaced the modal concierge path with persisted concierge thread messages that carry structured metadata for decision cards and quick-answer triage cards.
2. Added `ConciergeEventCard.tsx` and taught `ClawMode.tsx` to render concierge event messages inline in the concierge thread instead of as generic markdown bubbles.
3. Moved quick-answer triage and concierge synthesis writes into `useOrchestration.ts`, so both flows now create real thread events and return focus to the concierge thread.
4. Decoupled `conciergeDecision` / `triageResult` reducer state from `conciergeVisible`, removed the `WorkspacePage.tsx` modal mount, and deleted the now-dead `ConciergePanel.tsx`.
5. Re-ran app `typecheck` and `build`.

**Files touched**: `src/types/index.ts`, `src/context/MaestroContext.tsx`, `src/hooks/useThreads.ts`, `src/hooks/useOrchestration.ts`, `src/components/reveal/RevealComposer.tsx`, `src/components/reveal/ClawMode.tsx`, `src/components/reveal/ConciergeEventCard.tsx`, `src/pages/WorkspacePage.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- Stored concierge cards in `thread_messages.metadata` (`kind: 'concierge_decision' | 'concierge_triage'`) so the backend contract stayed intact while the frontend gained a thread-native rendering path.
- Kept `conciergeDecision` and `triageResult` in reducer state for downstream consumers like `DesignPhase.tsx`, but stopped using those writes as an implicit "open modal now" signal.
- Reused the existing concierge action semantics (Proceed / Round 2 / Override / Report / Convert to Build / Ask the council anyway) inside the new inline card rather than inventing a second action model.

**What didn't work**:
- This pass did not add deduping for repeated manual synthesis on the same round, so intentionally synthesizing the same round again can create another concierge decision card in the thread.
- Validation here was compile-level only (`npm run typecheck`, `npm run build`), not a live browser smoke test.

### 2026-05-01 — GitHub Copilot (GPT-5.4) — Unified UX Phase 2 shell cutover

**What was done**:
1. Removed the `WorkspacePage.tsx` shell branch between the legacy stage tree and `ClawMode`, so the app now always renders the thread-first shell.
2. Reworked `ClawMode.tsx` session initialization so it rehydrates threads and restores the concierge thread per session instead of relying on a one-time mount path.
3. Changed the shell close/escape behavior to return to the concierge thread instead of clearing thread state and falling back to the old workspace shell.
4. Kept drawers/modals/build workspace overlays intact on top of the unified thread shell.
5. Re-ran app `typecheck` and `build`.

**Files touched**: `src/pages/WorkspacePage.tsx`, `src/components/reveal/ClawMode.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- Treated the thread shell as the canonical workspace now, even though Phase 3+ still need to move more legacy presentation patterns into thread-native cards.
- Kept the existing `ClawMode` shell component as the transition surface for the cutover instead of doing a separate large rename/shim in the same pass.

**What didn't work**:
- The old orb/hero presentation from `EmptyStage.tsx` / `HeroContext.tsx` is not yet reintroduced inside the unified shell; this pass focused on deleting the shell split first.
- Validation in this pass was compile-level only (`npm run typecheck`, `npm run build`), not a live browser smoke test.

### 2026-05-01 — GitHub Copilot (GPT-5.4) — Unified UX Phase 1 shared composer

**What was done**:
1. Rebuilt `RevealComposer.tsx` as the shared composer used by both the legacy workspace shell and the thread shell, with a single intent bar (`Direct`, `Council`, `Execute`, `Build`), a single send action, and the concierge model picker moved into composer chrome.
2. Added shared `composerIntent` state to `MaestroContext.tsx` / `src/types/index.ts` so intent selection is no longer local to `ClawMode.tsx`.
3. Rewired the workspace composer so `Direct`, `Execute`, and `Build` can open/focus the concierge thread and route into the thread-first flows without a separate Claw toggle step.
4. Deleted the duplicate composer implementation from `ClawMode.tsx` and replaced it with the shared `RevealComposer` thread variant.
5. Re-ran app `typecheck` and `build`.

**Files touched**: `src/types/index.ts`, `src/context/MaestroContext.tsx`, `src/components/reveal/RevealComposer.tsx`, `src/components/reveal/ClawMode.tsx`, `src/pages/WorkspacePage.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- Kept the shared composer as one component with layout variants (`workspace` vs `thread`) rather than maintaining two separate implementations with duplicated intent logic.
- Let the workspace composer call into the thread-first flows directly so Phase 1 reduces UX split even before the full shell cutover in Phase 2.

**What didn't work**:
- Phase 2 shell unification is not complete yet; `WorkspacePage` still switches between the legacy stage tree and `ClawMode` based on whether a thread is focused.
- Validation in this pass was compile-level only (`npm run typecheck`, `npm run build`), not a live browser smoke test.

### 2026-05-01 — GitHub Copilot (GPT-5.4) — Unified UX Phase 0 foundation

**What was done**:
1. Removed the extra `orchestrationMode` state axis from shared types/context and rewired `useOrchestration.ts` so broadcast/build mode derives from the active session mode and current build phase instead of a separate reducer flag.
2. Cleaned the legacy workspace composer so it no longer exposes the dead orchestration toggle; repo-creation gating in `RepoSection.tsx` now keys off `sessions.mode === 'build'`.
3. Removed the `clawModeActive` shell flag from shared state and rewired shell open/close behavior around focused thread state (`activeThread`) instead.
4. Updated the Claw entry/exit paths so the composer opens the concierge thread directly, Escape/close clear thread focus, and `BuildWorkspace.tsx` uses thread focus to decide whether to behave like a drawer or the legacy full-screen surface.
5. Re-ran app `typecheck` and `build`.

**Files touched**: `src/types/index.ts`, `src/context/MaestroContext.tsx`, `src/hooks/useOrchestration.ts`, `src/components/reveal/RevealComposer.tsx`, `src/components/reveal/RepoSection.tsx`, `src/pages/WorkspacePage.tsx`, `src/components/reveal/BuildWorkspace.tsx`, `src/components/reveal/ClawMode.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- Treated session mode (`ask`/`build`) plus current build phase as the source of truth for orchestration behavior instead of preserving a separate UI-only orchestration toggle.
- Used focused thread presence as the shell switch rather than introducing another transition flag, which lines up with the unified thread-first shell direction in `UNIFIED_UX_SPEC.md`.

**What didn't work**:
- Phase 1 composer unification did not land in this session; Claw still owns its richer routing/model picker composer while the legacy shell keeps its separate broadcast composer.
- Validation in this pass was compile-level only (`npm run typecheck`, `npm run build`), not a live browser smoke test.

### 2026-04-29 — GitHub Copilot (GPT-5.4) — Added a local fast path for direct Claw execute commands

**What was done**:
1. Added a local execution-intent parser in `useThreads.ts` for obvious shell-style requests instead of always paying an `orchestrate` round-trip.
2. Wired `executeFromChat()` to use the local parser first for direct commands and simple file-browsing asks like `list files in src` / `show file src/main.tsx`, only falling back to the cloud intent parser when the request is ambiguous.
3. Adjusted the no-provider system message so local direct commands remain usable without requiring an AI key, while still guiding the user toward Vault for complex execute requests.
4. Re-ran focused ESLint plus app `typecheck` and `build`.

**Files touched**: `src/hooks/useThreads.ts`, `MAESTRO_STATE.md`

**Decisions made**:
- Limited the local parser to obvious `approved_shell` requests rather than trying to fully replace AI parsing for every execute intent in one pass.
- Kept the cloud parser as the fallback for ambiguous asks, repo operations beyond simple shell commands, and broader concierge behavior.

**What didn't work**:
- This does not yet remove Supabase polling or `orchestrate` from the rest of the local Claw stack; it only cuts one high-frequency execution-intent round-trip.
- Repo-wide `npm run lint` remains polluted by generated MaestroClaw outputs, so validation still used targeted lint on touched files.

### 2026-04-29 — GitHub Copilot (GPT-5.4) — Unified live session state and added direct in-thread GitHub push for Claw builds

**What was done**:
1. Finished the controller unification by moving live local session progress/runs/isRunning into shared `sessionBuildState` context state, with `useBuildExecution.ts` as the common updater and `ClawBuildSessionCard.tsx` reading the same shared data model as `BuildWorkspace.tsx`.
2. Added a shared `pushSessionBuildToGithub()` path in `useBuildExecution.ts` so session-manifest GitHub execution lives in one place instead of being duplicated inside `BuildWorkspace.tsx`.
3. Rewired `ClawBuildSessionCard.tsx` success handling to push directly to GitHub in-thread, surfacing push progress, PR links, backup branch, and skipped-file counts without forcing a "Push via Build Workspace" handoff.
4. Rewired `BuildWorkspace.tsx` to call the same shared push helper, keeping local session GitHub execution behavior aligned between the thread-native Claw card and the classic drawer.
5. Verified the slice with focused ESLint on touched files plus app `typecheck` and `build`.

**Files touched**: `src/types/index.ts`, `src/context/MaestroContext.tsx`, `src/hooks/useBuildExecution.ts`, `src/hooks/useThreads.ts`, `src/components/reveal/ClawBuildSessionCard.tsx`, `src/components/reveal/BuildWorkspace.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- Kept `clawBuildSession` as thread-card routing metadata and treated `sessionBuildState` as the single source of truth for live local session execution state.
- Lifted the GitHub push behavior into the shared build hook instead of creating separate Claw-only push code, so future review/PR UX can evolve on one execution path.

**What didn't work**:
- No live browser smoke test was run for the new in-thread push flow; validation in this pass was compile-level plus targeted lint only.
- Repo-wide `npm run lint` remains polluted by generated MaestroClaw outputs, so slice validation still used targeted lint on touched files.

### 2026-04-29 — GitHub Copilot (GPT-5.4) — Shared the local session transport between Claw and BuildWorkspace

**What was done**:
1. Added `src/lib/sessionBuild.ts` as the shared local session transport module for executor capability checks, `build_session` submission, polling with progress callbacks, manifest dedupe, and remote cancellation.
2. Rewired `useBuildExecution.ts` to use the shared session helpers instead of its own duplicate submit/poll/merge logic.
3. Rewired `ClawBuildSessionCard.tsx` to use the same shared submit/poll/cancel helpers, removing another copy of the local executor flow.
4. Verified the refactor with focused ESLint on all touched files plus app `typecheck` and `build`.

**Files touched**: `src/lib/sessionBuild.ts`, `src/hooks/useBuildExecution.ts`, `src/components/reveal/ClawBuildSessionCard.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- Extracted the shared behavior at the transport/helper layer first rather than forcing both surfaces onto one shared React state model in the same pass.
- Kept the higher-level session progress state split for now so this refactor stayed behavior-safe while still removing the worst source of drift.

**What didn't work**:
- This does not yet give Claw and BuildWorkspace one presentation/state source of truth; only the executor transport and polling logic are unified so far.

### 2026-04-29 — GitHub Copilot (GPT-5.4) — Removed dead chat-build fallback state from Claw

**What was done**:
1. Deleted the stale `ChatBuildPlan` / `chatBuildPhase` state, old planner prompt/types, and unused `generateBuildPlan()` / `executeBuildPlan()` / `approveBuildPlan()` / `cancelBuildPlan()` path from `useThreads.ts`.
2. Removed the dead Claw review/progress UI in `ClawMode.tsx` and rewired the header/build banner so Build mode now reflects the actual live path: in-thread local session card when available, otherwise Build Workspace handoff.
3. Cleaned `MaestroContext.tsx` and `src/types/index.ts` so the shared state model no longer advertises a build-review path that nothing can trigger.
4. Verified the slice with targeted ESLint on changed files plus app `typecheck` and `build`.

**Files touched**: `src/hooks/useThreads.ts`, `src/components/reveal/ClawMode.tsx`, `src/context/MaestroContext.tsx`, `src/types/index.ts`, `MAESTRO_STATE.md`

**Decisions made**:
- Removed the dead path outright instead of trying to patch it, because the real Claw build flow now lives in thread-native session handoff + Build Workspace fallback.
- Kept the generic JSON parsing helper in `useThreads.ts` because execution-intent parsing still uses it even after the old chat-build planner was removed.

**What didn't work**:
- `npm run lint` still fails at the repo level because generated MaestroClaw build/workspace outputs are included in ESLint traversal; validation for this slice used targeted lint on changed files plus `npm run typecheck` and `npm run build`.

### 2026-04-29 — GitHub Copilot (GPT-5.4) — Auto backend now stays thread-native for local Claw builds

**What was done**:
1. Updated `useThreads.ts:buildFromChat()` so `execution_backend === 'auto'` now opens the in-thread Claw build session card when a locked MaestroClaw builder has a matching online executor instead of always ejecting to the Build drawer.
2. Added local-routing resolution in `useThreads.ts` based on locked builder roster + executor capability match, so thread-native routing now reflects actual local availability rather than only the backend toggle value.
3. Extended `ClawBuildSessionState` with `defaultAdapter` and wired `ClawBuildSessionCard` to initialize from it, preventing the card from always defaulting to `claude_code` when the locked builder is Copilot or Codex.

**Files touched**: `src/hooks/useThreads.ts`, `src/components/reveal/ClawBuildSessionCard.tsx`, `src/types/index.ts`, `MAESTRO_STATE.md`

**Decisions made**:
- Kept the fallback drawer path for `auto` when no matching local executor is available.
- Limited this slice to routing/default-adapter correctness; the deeper controller unification between the card and `useBuildExecution` remains unfinished.

**What didn't work**:
- No live Claw smoke test was run yet; this fix was validated with `npm run typecheck` and `npm run build`.

### 2026-04-29 — GitHub Copilot (GPT-5.4) — Fresh-eyes audit of Claw UX and API-era constraints

**What was done**:
1. Audited Claw mode, BuildWorkspace, `useThreads`, `useBuildExecution`, MaestroClaw executor/adapters, and the Claw specs for places where the UX and architecture still reflect the old stateless edge/API model instead of a local-first CLI model.
2. Verified the biggest UX gaps are routing and control-surface issues, not just styling: `auto` still exits chat into the Build drawer, the in-thread build approval path is a stub, and the in-thread build card remains a separate controller from the newer session-build pipeline.
3. Verified the biggest architectural holdovers are cloud coupling and old one-shot primitives: command/build planning still routes through `orchestrate`, `executeBuildPlan()` still uses one cloud call per file, and local progress still relies entirely on Supabase polling instead of a direct local channel.
4. Added concrete operational-state rows for the newly verified Claw-local gaps so future sessions do not over-assume the local path is already fully thread-native.

**Files touched**: `MAESTRO_STATE.md`

**Decisions made**:
- Framed the root problem as “local Claw was bolted onto the cloud pipeline” rather than treating each symptom as an isolated bug.
- Kept the findings at the architecture/UX layer; no code changes were made in this audit session.

**What didn't work**:
- No live browser smoke test or live Claw build run was performed in this audit-only pass; findings were code-verified and cross-checked against the current specs/state files.

### 2026-04-29 — GitHub Copilot (GPT-5.4) — Default local builds now route to session jobs

**What was done**:
1. Rewired `BuildWorkspace` so local/auto Start Build defaults to plan-based `build_session` execution for MaestroClaw builders instead of immediately decomposing into per-file `build_task` jobs.
2. Added multi-builder session-run aggregation in `useBuildExecution.ts` so one local build can launch multiple scoped session jobs, track each builder run, and merge manifests for later GitHub push.
3. Relaxed `useThreads.ts:getBuildSetupStatus()` so local session builds can start without a connected GitHub repo; repo binding is still required only when pushing to GitHub.
4. Tightened the session prompt contract by passing explicit `scope_paths`, builder labels, and builder instructions into `build_session` jobs.
5. Updated the Claude session adapter to run without `--print` in session mode so Claude can operate agentically in the workspace instead of being forced into one-shot print behavior.

**Files touched**: `src/hooks/useBuildExecution.ts`, `src/components/reveal/BuildWorkspace.tsx`, `src/hooks/useThreads.ts`, `packages/maestroclaw/src/executor.ts`, `packages/maestroclaw/src/adapters/claude-code.ts`, `MAESTRO_STATE.md`

**Decisions made**:
- Kept edge/cloud builds on the existing per-file task queue; only local/auto Claw-first flows now default to session jobs.
- Left `ClawBuildSessionCard` on its current standalone controller for now; the remaining gap is unifying that in-thread card with the new multi-builder session pipeline rather than keeping the whole workspace on per-file jobs.

**What didn't work**:
- No live end-to-end session-build smoke test was run yet; validation in this session was limited to `npm run typecheck`, `npm run build`, and `npm --prefix packages\maestroclaw run build`.

### 2026-04-28 — OpenAI Codex (PowerShell) — Claw build cockpit HTML mockup

**What was done**:
1. Added `CLAW_UX_COCKPIT_MOCKUP.html`, a standalone shallow-route HTML mockup for the intended premium Claw build flow.
2. Mockup routes: `#brief`, `#configure`, `#running`, `#review`, `#push`.
3. Mockup illustrates the target UX: thread-native build session contract, real adapter IDs (`claude_code`, `codex_cli`, `copilot_cli`), visible scope/guardrails, real cancellation semantics, live run state, artifact review, and in-thread PR push.

**Files touched**: `CLAW_UX_COCKPIT_MOCKUP.html`, `MAESTRO_STATE.md`

**Decisions made**:
- Kept the mockup outside production React code so Claude Code can inspect/open it directly without a build step.
- Used hash routes and inline CSS/JS only; no dependencies.

**What didn't work**: No browser smoke test was run from this session.

### 2026-04-28 — OpenAI Codex (PowerShell) — Audit UX Phases 1–3

**What was done**:
1. Audited commits `ef41036` and `fd2622e` against `HANDOFF_CLAW_UX.md` and the Claw thread-first build-session UX goal.
2. Verified `npm run typecheck` passes after the UX changes.
3. Corrected stale/overclaimed `MAESTRO_STATE.md` rows: Phase 5 is no longer pending; Claw Build v2 UX is only partially fixed because auto/edge and push still route through Build Workspace.
4. Fixed malformed Key Files table row containing literal `` `r`n`` fragments.
5. Added open issues for `ClawBuildSessionCard` adapter mismatch (`codex`/`copilot` vs `codex_cli`/`copilot_cli`) and UI-only abort behavior.

**Files touched**: `MAESTRO_STATE.md`

**Decisions made**:
- Left source code unchanged; this session was an audit/documentation correction only.
- Treat `ef41036` as a strong UX direction, not complete Claw build UX closure.

**What didn't work**: No browser smoke test or real `build_session` run was performed in this session.

### 2026-04-28 — GitHub Copilot (Claude Sonnet 4.6) — UX Phases 1–3: In-thread build card + category messages + routing bar

**What was done**:
1. **Phase 1 — In-thread build session card** (`ClawBuildSessionCard.tsx`, new file): Self-contained component that submits a `build_session` job to `executor-api`, polls `executor_jobs` via Supabase, shows adapter/scope config + executor online check + progress/success/failure states. On remount, re-attaches to `activeJobId` stored in context. On success: "Push via Build Workspace" CTA. Context stores `ClawBuildSessionState` with `threadId`, `builderNames`, `suggestedScope`, `executionBackend`, `activeJobId`.
2. **Phase 1 — buildFromChat fork** (`useThreads.ts`): For `executionBackend === 'local'`, dispatches `SET_CLAW_BUILD_SESSION` and posts a success system message. For `auto`/`edge`, preserves existing `SET_BUILD_DRAWER_EXPANDED` path. Running-build guard updated to check `state.clawBuildSession` for local vs. drawer.
3. **Phase 1 — BuildWorkspace gate** (`BuildWorkspace.tsx`): Auto-expand effect now guards with `&& !state.clawBuildSession` so drawer does not open when the in-thread card is active.
4. **Phase 2 — Category-based system message styling** (`ClawMode.tsx`): `detectSystemCategory()` maps emoji prefix to `build | execute | approval | pr | error | info`. Each category gets distinct border, background, icon, and text color. `whiteSpace: pre-wrap` ensures newlines render without ReactMarkdown.
5. **Phase 3 — Segmented routing bar** (`ClawMode.tsx`): Replaced intent dropdown + all associated state/refs/effects/handlers with a full-width segmented `role="radiogroup"` bar. Arrow key navigation via `handleRoutingKeyDown`. Active intent shows consequence label below bar ("Answer appears in thread", etc.). Added `consequence` field to `IntentConfig` + all `INTENT_CONFIG` entries.
6. **Types + context** (`src/types/index.ts`, `src/context/MaestroContext.tsx`): `ClawBuildSessionState` interface added; `clawBuildSession` state field; `SET_CLAW_BUILD_SESSION` action; cleared in `SET_ACTIVE_SESSION` reducer block.

**Files touched**: `src/types/index.ts`, `src/context/MaestroContext.tsx`, `src/hooks/useThreads.ts`, `src/components/reveal/BuildWorkspace.tsx`, `src/components/reveal/ClawBuildSessionCard.tsx` (new), `src/components/reveal/ClawMode.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- Card does NOT use `useBuildExecution` to avoid dual-instance state loss on thread switch; reimplements polling inline.
- `executionBackend === 'auto'` and `'edge'` keep existing drawer path unchanged — no regression.
- BuildWorkspace auto-expand gated rather than removed — still needed for auto/edge builds.
- Phase 3 a11y: `role="radiogroup"` / `role="radio"` with arrow key nav per WAI-ARIA spec.

**What didn't work**: N/A — typecheck clean (`npm run typecheck` exit 0), pushed to `ef41036`.

**Known risks carried forward**: ClawBuildSessionCard shows "Push via Build Workspace" CTA — artifact→GitHub bridge still not wired end-to-end for session builds (next logical step #14).

### 2026-04-27 — GitHub Copilot (Claude Sonnet 4.6) — Claw Build v2 Phase 5 + executor-api context_bundle fix

**What was done**:
1. **`executor-api` context_bundle fix**: Submit handler now accepts, normalizes, and INSERTs `context_bundle` (rejects arrays/primitives, accepts plain objects only). Previously silently dropped — `executor_jobs.context_bundle` was always `{}` despite the column existing since migration `20260418230000`. Redeployed.
2. **Phase 5 — Concierge scope intelligence** (`useThreads.ts`): After confirming build setup, Concierge posts a scope suggestion message for local backends. Reads ARCHITECT.md ASCII tree (lines with `├` / `└`) to extract top-level dirs, maps them to `FRONTEND_DIRS` / `BACKEND_DIRS` constants, returns `primary` + optional `secondary` globs. Helpers (`extractTreeDirs`, `suggestSessionScope`) are module-level pure functions. Message labels all suggestions as advisory.
3. **`.gitignore` patterns**: Added generalized MaestroClaw preserved-workspace patterns using character classes — `*-[0-9a-f]{8}/` and `[0-9a-f]{8}-*/` — instead of repo-name-specific globs. Cleans up 100+ `boombop-*`/`ctfstyled-*`/UUID dirs from `git status`.

**Files touched**: `supabase/functions/executor-api/index.ts`, `src/hooks/useThreads.ts`, `.gitignore`, `MAESTRO_STATE.md`

**Decisions made**:
- Phase 5 scoped down from multi-builder scope plan (rubber-duck flagged Session Build is single-run; multi-builder UX not ready). Advisory message only.
- `agentToAdapter()` not implemented — adapter inference from agent provider is wrong (MaestroClaw builders use `agent.model`). Scope message deliberately omits adapter recommendation.
- Module-level helpers placed above `useThreads()` hook to keep them pure and avoid `useCallback` overhead for pure functions.
- `context_bundle` normalization: plain objects pass, arrays and primitives replaced with `{}` — matches Deno edge function behavior expectations.

**What didn't work**: N/A — typecheck clean, deploy succeeded.

**Known risks carried forward**: Scope suggestion is advisory only. `dispatchSessionLocal()` still submits `allowed_paths: ['**']`; actual enforcement is a future phase.

### 2026-04-27 — OpenAI Codex (PowerShell) — Full UX/UI Design Analysis

**What was done**: Deep UX audit of both Normal mode and Claw mode. Could not commit directly due to read-only filesystem in sandbox — log recorded by GitHub Copilot on behalf of Codex. Key findings below.

**Design verdict:**

**Normal mode** is good — orb, carousel, drawers, atmosphere have a coherent point of view. Gaps: hierarchy/discoverability, too much critical workflow buried in drawers, composer has too many small controls, Pre-Build is too dense. Carousel needs more reading tools: compare mode, decision extraction, "ask this agent", "pin this claim", clearer synthesis path. Currently beautiful but mostly a document viewer.

**Claw mode** is architecturally correct but visually feels like "chat app + side nav + classic build handoff." This undersells the core magic. Claw should feel like an **execution cockpit** — conversation, agent work, repo state, approvals, files, and PRs as one continuous operating log. Key code-verified UX gap: Build routes out of Claw mode at `ClawMode.tsx:773` → `useThreads.ts:1076` → `BuildWorkspace.tsx:2051` where session-build controls are buried as a nested config panel inside the old pipeline. Claw Build v2 is a major conceptual upgrade but the UI makes it feel like an advanced option.

**Specific findings:**
- Composer intent selector (Chat / Broadcast / Execute / Build) is logically correct but too hidden — should be a segmented "routing bar" above the composer with active state and one-line consequence description
- Emoji-heavy system messages in `useThreads.ts:773` are functional but cheapen the visual language. Should be premium event cards (execution approval card, command card, build-session card, file manifest card, error/retry card, PR card)
- No persistent right-side panel for build state (files, PRs, repo state) during Claw builds
- Orb should exist in Claw mode as a compact status instrument (not the big empty-stage orb)

**Priority order (Codex's recommendation):**
1. **Move Claw build progress OUT of classic drawer → INTO Claw mode as first-class build-session cards.** In-thread "build runway": `Plan → Scope → Execute → Review → Push`. One module card per builder: agent, adapter, scope glob, status, files written, elapsed time, job ID, latest activity. Maps directly to `build_session` job type and makes session-granular model visible.
2. Replace plain system messages with premium event cards
3. Segmented routing bar above composer
4. Compact orb status instrument in Claw mode
5. Carousel reading tools (compare, pin, ask agent)

**Design direction**: Normal mode = council theater (carousel-first ✅). Claw mode = timeline-first operational execution log. Carousel for council comparison; Claw for execution. Keep carousel — but Claw's core surface should NOT be carousel-first.

**Files touched**: `MAESTRO_STATE.md` (via Copilot proxy — Codex sandbox was read-only)

**What didn't work**: `git pull --ff-only` failed with `Read-only file system` on `.git/FETCH_HEAD`. Codex could read but not write. All planned changes blocked.

### 2026-04-27 — OpenAI Codex — Claw/Classic UX Audit (source-code pass)

**What was done**: Read `AGENTS.md`, `MAESTRO_STATE.md`, `CLAW_BUILD_V2_SPEC.md`, `CLAW_MODE_SPEC.md`, and `CLAW_UI_ISSUES.md`; inspected the classic workspace and Claw mode UI paths in code. Compared the current UI implementation against the session-granular Claw Build v2 direction and identified that Claw build UX still hands off from chat into the classic Build drawer, with session-build controls buried inside `task_building` instead of surfaced as a first-class Claw thread/workspace flow.

**Files touched**: `MAESTRO_STATE.md`

**Decisions made**:
- Treat Claw Build v2 as the product direction for local/CLI execution, not just an executor implementation detail.
- Record the Claw chat/build drawer split as an incomplete UX issue because it is code-verified and directly affects the build experience.

**What didn't work**: No tests or live browser smoke were run; this was a source-code UX audit only.

### 2026-04-27 — GitHub Copilot (Claude Sonnet 4.6) — Claw Build v2 Phases 2–4 Implementation

**What was done**:
1. **Phase 2 — Session adapter mode** (`adapters/types.ts`, `claude-code.ts`, `copilot-cli.ts`, `codex-cli.ts`, `gemini-cli.ts`):
   - Added optional `runSession?()` to `Adapter` interface (backward-compatible)
   - `claude-code.ts`: `runSession()` uses `--print --dangerously-skip-permissions` (no `--output-format text`). Private `runSessionWithModel()` helper. Rate-limit fallback preserved.
   - `copilot-cli.ts` + `codex-cli.ts`: extracted `executeWithTools()` private helper; `run()` and `runSession()` both delegate to it (they already have full file-write access via `--allow-all-tools`/`--full-auto`)
   - `gemini-cli.ts`: `runSession()` delegates to `run()` (Gemini `--yolo` already writes files)

2. **Phase 3 — `executeSessionJob()`** (`executor.ts`, `api.ts`, `index.ts`):
   - Added `context_bundle: Record<string, unknown> | null` to `ExecutorJob` in `api.ts`
   - Added helpers: `SessionContextBundle`, `walkDir()` (mtime snapshot), `collectWrittenFiles()` (before/after diff), `buildSessionPrompt()`, `buildFixPassPrompt()`
   - `executeSessionJob()`: clone/init → snapshot before → `adapter.runSession()` (or `run()` fallback) → snapshot after → diff → session Ralph Loop (one fix pass) → git checkpoint → write to build dir → complete with artifact_manifest
   - `index.ts` routes `job_type === "build_session"` → `executeSessionJob()`

3. **Phase 4 — Web-side session dispatch** (`useBuildExecution.ts`, `BuildWorkspace.tsx`, `types/index.ts`):
   - `SessionBuildProgress` interface + `sessionProgress` / `isSessionRunning` state in hook
   - `dispatchSessionLocal(adapter, prompt, scope, architectMd?)`: submits `build_session` job (1800s timeout)
   - `pollSessionJob(jobId)`: 5s interval, 40-min max
   - `executeSession(adapter, scope)`: full orchestration — builds prompt from `state.buildPlan?.build_prompt`, injects `architect_content`
   - `collectSessionManifest()`: returns same shape as `collectManifest()` for GitHub push reuse
   - `BuildWorkspace.tsx`: purple "Session Build" button in task_building stage → session config popover (adapter dropdown + scope glob input) → `handleSessionBuild()` → `session_building` stage panel (Loader/CheckCircle/Alert status, file list, jobId) → "Push N files to GitHub" button on success / "Retry Session" on failure
   - Topbar inline status for `session_building` stage

**Files touched**: `packages/maestroclaw/src/adapters/types.ts`, `claude-code.ts`, `copilot-cli.ts`, `gemini-cli.ts`, `codex-cli.ts`, `packages/maestroclaw/src/api.ts`, `packages/maestroclaw/src/executor.ts`, `packages/maestroclaw/src/index.ts`, `src/hooks/useBuildExecution.ts`, `src/components/reveal/BuildWorkspace.tsx`, `src/types/index.ts`

**Commit**: `36ab1c7` — `feat(claw): session build v2 — phases 2-4 (adapters, executor, web dispatch)`

**Typecheck**: `npm run typecheck` exits 0

**Decisions made**:
- `runSession()` fallback: `adapter.runSession?.bind(adapter) ?? adapter.run.bind(adapter)` — if adapter doesn't implement `runSession`, session prompt drives the same `run()` method
- Session job timeout: 1800s (30 min); poll timeout: 40 min. File task timeout stays 600s.
- `timeout_seconds: 1800` submitted but `context_bundle` JSONB column must exist in `executor_jobs` table — migration `20260406180000` added `context_bundle`; verify remote DB has it before first session build
- Dir snapshot uses mtime: `walkDir()` stores abs-path → mtimeMs; `collectWrittenFiles()` skips unchanged entries

**Open risks**:
- `claude --print --dangerously-skip-permissions` on Windows: not yet smoke-tested in session mode (file-write path uses dir-diff, not stdout)
- `executor_jobs.context_bundle` JSONB: must confirm the `executor-api` edge function forwards this field from submit body to DB
- Phase 5 (Concierge scope intelligence) not yet built

### 2026-04-27 — GitHub Copilot (Claude Sonnet 4.6) — Claw Build v2 Architecture Diagnosis + Spec

**What was done**:
1. **Root-cause analysis of Claw build failures**:
   - Claw poll loop (`index.ts`) is single-threaded — `await executeJob()` blocks the entire process. One job at a time. 79-file build = 79 sequential runs.
   - Current build model sends N isolated single-file blind prompts to Claude Code. Each job has zero context about other files. Imports break, types mismatch, output is incoherent across files.
   - No project-level review pass. Files complete individually with no agent seeing the full picture.
   - This is the correct model for stateless web API calls (edge builds). It is wrong for CLI agents that can use tool access to iterate over a real codebase.
2. **Created `CLAW_BUILD_V2_SPEC.md`**:
   - Full architecture spec for session-granular Claw builds
   - New `build_session` job type (one job per builder/module, not per file)
   - Session adapter mode (Claude Code without `--print`, `--dangerously-skip-permissions` for direct file writes)
   - `executeSessionJob()` design: file snapshot diff, context injection, session-level Ralph Loop, manifest collection
   - Concurrent poll loop design (`MAX_CONCURRENT_JOBS`)
   - Web UI dispatch changes (session dispatch path, module scope splitting, session progress UI)
   - 5-phase implementation plan with backward-compat guarantee for edge builds
   - Known open questions flagged (Windows `--dangerously-skip-permissions`, multi-builder context sharing, greenfield push)
3. **Updated `MAESTRO_STATE.md`**: architecture debt + sequential poll loop added as broken issues; Next Logical Steps rewritten with 5-phase Claw Build v2 plan.

**Files touched**: `CLAW_BUILD_V2_SPEC.md` (created), `MAESTRO_STATE.md`

**Decisions made**:
- Session-granular is the correct primitive for CLI agents. File-granular stays for edge/web builds (backward compat — no regressions).
- No new DB tables needed — `job_type: "build_session"` reuses `executor_jobs`, `context_bundle` JSONB carries `architect_content` + `context_files`.
- Multi-builder context sharing: v1 = sequential with context handoff. Parallel is Phase 6+.

**What didn't work**: Planning session only — no implementation yet.

### 2026-04-22 — GitHub Copilot (Claude Sonnet 4.6) — Fix: Claw writes raw JSON envelope instead of file content

**What was done**:
Root cause identified and fixed: `extractFileContent()` in `executor.ts` was returning the raw JSON manifest object (`{"path":...,"content":...,"operation":"create"}`) as file content instead of extracting the `content` field. This caused every Claw-built file to contain the JSON envelope rather than actual source code.

Fix: added **Strategy 0** (manifest extraction) before the existing fence/code strategies:
- `tryParseManifest()`: attempts `JSON.parse()` on the text; on failure, re-escapes invalid JSON escape sequences (`\[` `\'` etc → `\\[` `\\'`) and retries. LLMs producing TypeScript code with regex literals/strings embed bare backslash sequences that aren't valid JSON escapes.
- **0a**: entire output is the manifest
- **0b**: manifest inside a markdown code fence (handles `\`\`\`json {...} \`\`\`` wrapping)
- **0c**: greedy from first `{` (handles output where closing fence is missing)
- Falls through to fence/code extraction if no manifest found (backward compatible)

**Files touched**: `packages/maestroclaw/src/executor.ts`
**Commit**: `d6398c4`
**Typecheck**: clean (both claw and frontend)

**What didn't work**: N/A — fix clean first pass.

---

### 2026-04-22 — GitHub Copilot (Claude Sonnet 4.6) — Ralph Loop + Git Checkpoints

**What was done**:
1. **Ralph Loop (per-file retry loop)** (`packages/maestroclaw/src/executor.ts`):
   - `assessOutputQuality()`: path-aware checks — `.html` files can have `<!DOCTYPE`, `.json` targets get parse validation, known-small-ext files skip the min-length guard, truncation markers caught by 6 regex patterns
   - `buildRetryPrompt()`: injects failure reason + retry header before original prompt; no raw previous output injected (context contamination prevention)
   - `cleanForRetry()`: deletes target file from workDir before each retry attempt (prevents Copilot `--allow-all-tools` stale file reads)
   - Total timeout budget: `deadline = Date.now() + timeout_seconds * 1000 - 8000` computed once; `remainingMs` passed to each `adapter.run()` call; loop aborts if <10s remain
   - `result_summary` prefix: `[↩ N] ` for files that needed retries (N = retry count, not attempts)
   - Graceful close on exhaustion: summary + last failure reason written instead of raw error
2. **Git checkpoints** (`packages/maestroclaw/src/executor.ts`):
   - `ensureGitRepo()`: lazy `git init --initial-branch=main` + user config if no `.git` dir; returns bool (non-fatal if git unavailable)
   - `createCheckpoint()`: checks `.git/index.lock` first (concurrent executor safety), then `git add -A && git commit`. Non-fatal — swallows "nothing to commit" silently
   - Fires after each successful file write to `builds/{session_id.slice(0,8)}/`; gated by `ENABLE_CHECKPOINTS` env var
3. **Config additions** (`packages/maestroclaw/src/config.ts`):
   - `maxRetries: number` (from `MAX_RETRIES` env, default 3)
   - `enableCheckpoints: boolean` (from `ENABLE_CHECKPOINTS` env, default true)
4. **`.env.example`** updated with `MAX_RETRIES=3` and `ENABLE_CHECKPOINTS=true`
5. **UI retry badge** (`src/components/reveal/BuildWorkspace.tsx`):
   - Parses `[↩ N]` prefix from `task.result_content`; shows amber pill `↩ N` badge on completed task cards that needed retries
   - Tooltip: "Succeeded after N+1 attempts"

**Files touched**: `packages/maestroclaw/src/executor.ts`, `packages/maestroclaw/src/config.ts`, `packages/maestroclaw/.env.example`, `src/components/reveal/BuildWorkspace.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- Total timeout budget (not per-retry) — prevents wall-time multiplication on high-retry scenarios
- No raw output in retry prompts — avoids steering the model toward prior failure content
- Git checkpoint concurrency: best-effort lock detection only (`.git/index.lock` check). Multi-process race will occasionally skip a checkpoint — acceptable for v1
- Retry badge only on `completed` tasks (not on `failed`) — failed tasks show retry/skip buttons instead

**What didn't work**: N/A — typecheck clean both front and claw package, committed `82ea6bb`.



**What was done**:
1. **Concierge build handoff loop fixed** (`src/hooks/useThreads.ts`, `src/components/reveal/ClawMode.tsx`, `src/components/reveal/BuildWorkspace.tsx`):
   - Root cause: `buildFromChat` had no guard when `current_phase === 'build'`; every Concierge Build-mode message re-ran the full flow and looped "Build setup confirmed, handing off…"
   - Fix A: Guard added at top of `buildFromChat` — if phase is already `build` or `bouncer`, adds a user + system message pointing to the drawer, dispatches `SET_BUILD_DRAWER_EXPANDED`, and returns early
   - Fix B: `handleBuild` in ClawMode now calls `setComposerIntent('chat')` after `buildFromChat` resolves — subsequent sends go to Concierge chat, not back into the build loop
   - Fix C: Drawer reset effect changed from `setDrawerCollapsed(true)` → `setDrawerCollapsed(false)` — drawer starts expanded when build phase becomes active so user immediately sees it
   - Fix D: On successful handoff, `buildFromChat` now dispatches `SET_BUILD_DRAWER_EXPANDED: true` so ClawMode sibling padding updates immediately
   - Commit: `72ff3a8`
2. **ClawGemini adapter** (`packages/maestroclaw/src/adapters/gemini-cli.ts`):
   - Follows same pattern as `claude-code.ts` (stdin pipe, `--model`, `--yolo` for non-interactive)
   - Primary: `gemini-2.5-pro`, fallback: `gemini-2.5-flash`; rate-limit auto-retry
   - Registered in `adapters/index.ts`, added `ClawGemini` to `AGENT_DEFAULTS` (slot_index 3), `gemini_cli` to PROVIDER_REGISTRY
   - Env vars: `CLAW_GEMINI_MODEL`, `CLAW_GEMINI_FALLBACK_MODEL`
   - Commit: `1e87e31`

**Files touched**: `src/hooks/useThreads.ts`, `src/components/reveal/ClawMode.tsx`, `src/components/reveal/BuildWorkspace.tsx`, `packages/maestroclaw/src/adapters/gemini-cli.ts`, `packages/maestroclaw/src/adapters/index.ts`, `src/types/index.ts`, `packages/maestroclaw/.env.example`

**Decisions made**:
- Drawer now starts expanded (not collapsed) on build handoff — user explicitly triggered Build from Concierge, they want to see it
- `composerIntent` always resets to `'chat'` after any `buildFromChat` call; user must explicitly re-select Build mode to re-enter that flow
- Guard covers both `'build'` and `'bouncer'` phases (user in bouncer review shouldn't re-trigger build dispatch)

**What didn't work**: N/A — fixes worked first pass, typecheck clean.

### 2026-04-22 — GitHub Copilot (Claude Sonnet 4.6) — Build Drawer + Sonnet 4.6 Model Pin + error_text Fix

**What was done**:
1. **ClawClaude model pinned to Sonnet 4.6** (`packages/maestroclaw/src/adapters/claude-code.ts`): Adapter now passes `--model claude-sonnet-4-6` (fallback `claude-sonnet-4-5`) instead of defaulting to Opus 4.7. Rate-limit detection (`isRateLimited()`) scans stdout for limit keywords and auto-retries with fallback model. `CLAW_CLAUDE_MODEL` + `CLAW_CLAUDE_FALLBACK_MODEL` env vars allow override without code change.
2. **`error_text` from stdout on soft failures** (`packages/maestroclaw/src/executor.ts`): Rate-limit messages were landing in stdout but `error_text` was only populated from stderr. Fixed to capture stdout as `error_text` when the job fails.
3. **Build drawer in Claw Mode** (`src/context/MaestroContext.tsx`, `src/components/reveal/BuildWorkspace.tsx`, `src/components/reveal/ClawMode.tsx`):
   - When `clawModeActive`, BuildWorkspace renders as a fixed bottom drawer (not full-screen overlay)
   - Collapsed state: 56px handle bar showing phase label + live progress (X/Y files, failed count, inline progress bar)
   - Expanded state: `clamp(56px, 50dvh, calc(100dvh - 240px))` — viewport-safe height
   - Smooth 0.25s cubic-bezier height transition
   - Auto-collapses on new build (session.id change)
   - `buildDrawerExpanded` synced to context so ClawMode root gets matching `paddingBottom` (prevents drawer from covering composer)
   - PhaseRail hidden in Claw drawer mode (not needed with handle bar)
   - `overscroll-contain` on scroll region prevents scroll bleed into Concierge chat

**Files touched**: `packages/maestroclaw/src/adapters/claude-code.ts`, `packages/maestroclaw/src/executor.ts`, `packages/maestroclaw/.env.example`, `src/context/MaestroContext.tsx`, `src/components/reveal/BuildWorkspace.tsx`, `src/components/reveal/ClawMode.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- Drawer auto-collapses on build start so user always sees Concierge first; they opt-in to watch build details
- `buildDrawerExpanded` in global state (not just local) so ClawMode sibling can react to it for padding without prop drilling
- Fallback from Sonnet 4.6 → Sonnet 4.5 (not Opus) — cost control is the priority
- No repo branch requirement for greenfield Claw builds (repo_url null allowed when no GitHub repo connected)

**What didn't work**:
- Initial build attempts failed with `result_summary: "You've hit your limit"` — confirmed root cause was Opus 4.7 defaulting (7x token burn vs Sonnet)

### 2026-04-21 — GitHub Copilot (Claude Sonnet 4.6) — Claw Build Dispatch Bug Fix + TypeScript Cleanup

**What was done**:
1. **`branch requires repo_url` blocker** (commit `bdd9546`): Greenfield Claw builds have no GitHub repo bound, so `repoConn` is null. `dispatchTaskLocal` was sending `branch: repoConn?.default_branch ?? 'main'` — the `?? 'main'` fallback fired even when there was no repo, causing `executor-api`'s `validateRepoContext()` to reject every single task. Fixed to `?? null` so no branch is sent for repo-less builds.
2. **28 pre-existing TypeScript strict-mode errors** (commit `3e7f150`) in 4 files:
   - `src/types/index.ts`: `BuildTask.id` made required (`id?: string` → `id: string`) — every DB-loaded task has an id; the optional was a type-modeling mistake causing ~20 `string | undefined` errors in `useBuildExecution.ts` and `BuildWorkspace.tsx`
   - `src/hooks/useBuildExecution.ts` `pollExecutorJob`: `executor_jobs` table is not in `database.types.ts` (never regenerated after Claw migrations) — Supabase returned `never` for the named-column select; fixed with explicit type cast
   - `src/hooks/useOrchestration.ts`: `synthesizeRef` was typed `Promise<void>` but `synthesize` returns `Promise<{content}|null|undefined>`; widened to `Promise<unknown>`
   - `src/components/reveal/ClawMode.tsx` `handleFocusAgent`: `directThread` inferred `Thread|undefined` from `.find()` but `createThread()` returns `Thread|null`; annotated explicitly as `Thread|null|undefined`

**Files touched**: `src/hooks/useBuildExecution.ts`, `src/types/index.ts`, `src/hooks/useOrchestration.ts`, `src/components/reveal/ClawMode.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- `executor_jobs` in `database.types.ts` is stale (missing post-Claw tables). Rather than regenerating types (requires live Supabase access and risks schema drift), added an explicit type cast with a comment pointing to the root cause. The real fix is to run `npx supabase gen types typescript` after all Claw migrations are confirmed applied to remote.
- `BuildTask.id` is now required — the interface models DB-loaded rows only; client-side task construction never happens without a DB round-trip.

**What didn't work**:
- N/A — both fixes were clean first attempts, typecheck went 0-error immediately.

### 2026-04-21 — GitHub Copilot (GPT-5.4) — Executor State Refresh for Claw Build Dispatch

**What was done**: Fixed the stale executor-state bug that could make Build fail with `No online executor advertises adapter "claude_code"` even when MaestroClaw was already running. `useBuildExecution` now refreshes executors from Supabase before local dispatch gives up, and `useWorkspace` keeps executor/job state fresh while the app is open via focus/visibility refresh plus a 15s polling pass aligned to the worker heartbeat cadence.

**Files touched**: `src/hooks/useBuildExecution.ts`, `src/hooks/useWorkspace.ts`, `MAESTRO_STATE.md`

**Decisions made**:
- Refresh executor state at the moment of local dispatch so Build can recover from stale in-memory executor data without forcing a page reload.
- Keep workspace executor state warm in the background because MaestroClaw heartbeats/status transitions (`online` ↔ `busy`) are part of normal operation and the UI should track them.
- Leave executor capability matching strict (`adapter` must be advertised) and fix freshness instead of weakening adapter checks.

**What didn't work**:
- Loading `executors` only during workspace init left the app blind to later heartbeats and status flips, so a healthy worker could appear unavailable until a manual refresh.

### 2026-04-21 — GitHub Copilot (GPT-5.4) — Pre-Build Builder Roster Shows MaestroClaw Options

**What was done**: Fixed the Pre-Build builder picker so it no longer depends on council-chat `is_active` agents. The builder roster now surfaces connected cloud builders plus MaestroClaw local builders, and builder-lane validation resolves against the full workspace agent list so locked Claw builders do not get rejected as invalid. This closes the follow-up UX bug where Claw Build correctly handed off to Pre-Build, but the picker looked like the wrong surface because no local CLI builders appeared.

**Files touched**: `src/components/reveal/PreBuildPanel.tsx`, `MAESTRO_STATE.md`

**Decisions made**:
- Treat Pre-Build builder selection as its own roster concern instead of piggybacking on the active council-chat roster.
- Always surface MaestroClaw builders in Pre-Build, even if they are not active in Orchestra chat, because builder locking is the real source of truth for Build.
- Keep reviewer/read-only lane pools unchanged so this fix stays scoped to builder selection and validation.

**What didn't work**:
- Using `activeAgents` for both picker population and lane validation hid Claw builders entirely unless the user manually pre-activated them in Orchestra, which made the handoff feel like the wrong Pre-Build flow.

### 2026-04-21 — GitHub Copilot (GPT-5.4) — Claw Build Handoff Routed Into Pre-Build / Build Workspace

**What was done**: Fixed the Claw Build UX contract so chat build requests no longer pretend to plan/build in-thread before a builder path exists. `useThreads.buildFromChat()` now stores the user's requested build focus in `sessions.build_spec`, checks whether Pre-Build has already locked builders plus `ARCHITECT.md`, and either routes the session into `pre_build` or hands off into the canonical Build workspace. `concierge` `pre_build_complete` / `decompose_tasks` now read that saved `requested_build_prompt`, so the real Build plan and task slices retain the Claw request after handoff. Redeployed `concierge` live after the change.

**Files touched**: `src/hooks/useThreads.ts`, `supabase/functions/concierge/index.ts`, `MAESTRO_STATE.md`

**Decisions made**:
- Treat Pre-Build + BuildWorkspace as the authoritative build contract instead of maintaining a third direct Claw build executor path.
- Persist the latest Claw build request on the session (`build_spec.requested_build_prompt`) so the handoff preserves user intent without inventing a parallel state channel.
- Keep chat-facing Build approvals as BuildWorkspace-owned; the Claw thread now explains the handoff instead of generating a misleading in-thread plan.

**What didn't work**:
- The old chat-build planner path could be made more resilient, but it still bypassed locked builders/backend choice entirely, which is the UX bug the user actually hit.
- There is still no shell-available user JWT here, so the post-fix end-to-end build must be verified through the real authenticated UI rather than a direct edge-function repro from this terminal.

### 2026-04-21 — GitHub Copilot (GPT-5.4) — MaestroClaw Copilot/Codex Adapter Enablement

**What was done**: Implemented `copilot_cli` and `codex_cli` adapters for MaestroClaw, added a shared command resolver that maps Windows npm shims to their underlying Node entrypoints, registered both adapters, updated the worker README, and closed the old "not executable yet" blocker. Validated with `npm --prefix packages\maestroclaw run build` and live `Reply with exactly OK` smoke runs through both adapters.

**Files touched**: `packages/maestroclaw/src/adapters/command.ts`, `packages/maestroclaw/src/adapters/copilot-cli.ts`, `packages/maestroclaw/src/adapters/codex-cli.ts`, `packages/maestroclaw/src/adapters/index.ts`, `packages/maestroclaw/README.md`, `MAESTRO_STATE.md`

**Decisions made**:
- Bypass Windows `.cmd`/`.ps1` quoting issues by resolving the shim's JavaScript entrypoint and invoking it directly with `process.execPath`.
- Keep Copilot prompt delivery indirect via a temporary workspace prompt file so large build prompts do not hit Windows command-length limits.
- Ignore stderr on successful Copilot/Codex exits so progress/status logs do not get misreported as worker errors.

**What didn't work**:
- `shell: true` mangled spaced arguments for both CLIs on Windows.
- Spawning the npm `.ps1` wrappers under PowerShell timed out even though the same commands worked manually in the shell.
- `cmd.exe /d /s /c` was good enough for simple version probes but still too brittle for the real run path, so the final fix bypasses shim shells entirely.

### 2026-04-21 — GitHub Copilot (GPT-5.4) — MaestroClaw Capability Routing + Lease Recovery

**What was done**: Hardened MaestroClaw queue semantics so executors only receive jobs for adapters they actually advertise, added job leases with stale-job requeue behavior, and taught Build v3 local dispatch to require a matching online executor before routing locally. Also corrected the package README to the token-only worker model and documented capability/lease behavior.

**Files touched**: `supabase/functions/executor-api/index.ts`, `supabase/migrations/20260421001500_executor_job_leases.sql`, `packages/maestroclaw/src/api.ts`, `packages/maestroclaw/src/index.ts`, `src/hooks/useBuildExecution.ts`, `src/types/index.ts`, `packages/maestroclaw/README.md`, `MAESTRO_STATE.md`

**Decisions made**:
- Use executor heartbeats as the source of truth for advertised adapter capabilities instead of expanding the web registration UI.
- Keep lease recovery surgical: re-queue stale `claimed`/`running` jobs onto the existing `approved` state instead of introducing a new lifecycle status.
- Fail local Build v3 dispatch immediately when no online executor advertises the required adapter, rather than waiting for a long poll timeout.

**What didn't work**:
- Found a pre-existing product mismatch while implementing the routing fix: ClawCopilot/ClawCodex are exposed in the roster, but no `copilot_cli` / `codex_cli` worker adapters exist yet.
- There is no repo-native build/check command for Deno edge functions, so `executor-api` was verified by code inspection plus surrounding frontend/worker build passes rather than a dedicated function typecheck.

### 2026-04-20 — Codex (GPT-5.4) — MiroFish Assessment for Maestro

**What was done**: Assessed the local `.michael/MiroFish-main.zip` / extracted `MiroFish-main` repo to determine what it does and which parts could realistically enrich Maestro. Reviewed README, backend app/api/services/models, and workflow UI. Conclusion: the highest-value transferable ideas are graph-backed long-term memory, tool-using report agents, and simulation/interview-style “what-if” analysis; the OASIS social-simulation stack itself is mostly domain-specific and should not be copied directly into Maestro’s core build path.

**Files inspected**: `.michael/MiroFish-main/MiroFish-main/README.md`, `.michael/MiroFish-main/MiroFish-main/package.json`, `.michael/MiroFish-main/MiroFish-main/backend/pyproject.toml`, `.michael/MiroFish-main/MiroFish-main/backend/app/__init__.py`, `.michael/MiroFish-main/MiroFish-main/backend/app/api/{graph,simulation,report}.py`, `.michael/MiroFish-main/MiroFish-main/backend/app/services/{simulation_manager,zep_graph_memory_updater,zep_tools,report_agent}.py`, `.michael/MiroFish-main/MiroFish-main/backend/app/models/{project,task}.py`, `.michael/MiroFish-main/MiroFish-main/frontend/src/views/Process.vue`
**Files touched**: `MAESTRO_STATE.md`

**Decisions made**:
- Treat MiroFish as a source of product patterns and memory/reporting architecture, not as a drop-in subsystem for Maestro.
- Flag AGPL-3.0 licensing as a constraint before any direct code reuse from MiroFish into Maestro.

**What didn't work**:
- Initial path assumption targeted `C:\Users\Owner\.michael`; actual archive lived under the repo-local `.michael/`.
- One ranged PowerShell read failed on mixed argument types and was retried with narrower file reads.

### 2026-04-20 — Codex (GPT-5.4) — Claw Mode UX/UI Audit

**What was done**: Audited Claw Mode UX/UI against the current implementation and spec, covering layout, interaction flow, transitions, density, consistency, responsive behavior, and accessibility. Verified that the Claw chat broadcast path excludes executor agents and corrected the stale blocker wording so the remaining broadcast issue is scoped to the legacy workspace path.

**Files inspected**: `CLAW_MODE_SPEC.md`, `CLAW_UI_ISSUES.md`, `src/components/reveal/ClawMode.tsx`, `src/pages/WorkspacePage.tsx`, `src/index.css`, `tailwind.config.js`, `src/components/reveal/FolioCarousel.tsx`, `src/components/reveal/RevealComposer.tsx`, `src/components/reveal/OrchestraDrawer.tsx`
**Files touched**: `MAESTRO_STATE.md`

**Decisions made**:
- Logged Claw Mode thread/view labeling and responsive overflow as active operational gaps instead of treating them as implicit polish work.
- Kept the Claw-agent-on-broadcast blocker open, but narrowed it to the legacy broadcast path because `ClawMode.tsx` already filters executor/`maestroclaw` agents out of chat broadcast.

**What didn't work**:
- Initial shell reads failed with a sandbox setup refresh error and had to be retried with escalated read access.
- No live browser/device pass was run in this session; the audit is code-backed rather than screenshot-verified.

### 2026-04-19/20 — GitHub Copilot (Opus 4.6) — Claw-in-Roster + Artifact Pipeline

**What was done**: Wired MaestroClaw into the builder roster so users can select local CLI tools as builders from Pre-Build UI, then diagnosed and fixed the full artifact pipeline so Claude Code CLI output actually flows back to Maestro web as structured file artifacts.

**Core changes**:
- **`src/types/index.ts`**: Added 3 `maestroclaw` agent entries to `AGENT_DEFAULTS` (ClawClaude, ClawCopilot, ClawCodex), added `maestroclaw` to `PROVIDER_COLORS` (#c9a84c) and `PROVIDER_REGISTRY`
- **`src/hooks/useBuildExecution.ts`**: `resolveBackend()` forces `'local'` for maestroclaw agents, `dispatchTaskLocal()` derives adapter from `agent.model`
- **`src/components/reveal/PreBuildPanel.tsx`**: `scoreBuildCandidate()` with executor-aware scoring (+60 online, -40 offline), builder dropdown shows online/offline indicator, auto-switches backend to `local` when Claw selected
- **`src/components/reveal/OrchestraDrawer.tsx`**: Added maestroclaw to `PROVIDER_GROUPS` with executor status badge (online/offline instead of key set/no key)
- **`src/components/reveal/VaultDrawer.tsx`**: Filtered `maestroclaw` from API key management loop
- **`packages/maestroclaw/src/executor.ts`**: Artifact synthesis bridge — `extractFileContent()` strips markdown fences from CLI output, constructs `artifact_manifest` array. Writes artifacts to per-job workspace AND session-scoped `builds/{session_id}/` directory.
- **`packages/maestroclaw/src/adapters/claude-code.ts`**: Completely rewritten to use `spawn()` + `proc.stdin.write(prompt)` instead of `execFile(prompt_as_arg)` — fixes Windows 8K CLI arg truncation.

**Key pipeline fix**: Claude `--print` mode returns text to stdout, not structured artifacts. The adapter had no `artifacts` field, executor reported `artifact_manifest: null`, and Maestro web marked tasks as failed. Fix: executor synthesizes artifacts from text output when `allowed_paths` is set and adapter returns text but no artifacts.

**Live verification**: Dispatched 5 jobs (NexShield cybersecurity site) — App.tsx, Hero.tsx, Services.tsx, Footer.tsx, App.module.css. All 5 succeeded with artifacts stored in DB (719–5837 chars each).

**Commits**: `93e05f6`, `1a02dae`, `4d68c12`, `0353aac`, `3e455ea`, `38c7dd5`, `cfb60c6`

**Known issues discovered**:
- GPT OSS fires during builds when not selected (phantom agent)
- Claw agents error on broadcast ("Provider maestroclaw not supported") — build-only, need broadcast filter
- MaestroClaw still at v0.1.0 despite multiple rebuilds

### 2026-04-18 — GitHub Copilot (Opus 4.6) — Build V3 Phase 1 Routing Layer

**What was done**: Implemented the V3 routing layer that allows build tasks to execute via MaestroClaw (local CLI tools) instead of edge functions (API calls).

**Core changes**:
- **`useBuildExecution.ts`**: Added `resolveBackend()` (picks edge/local/auto per task/session), `dispatchTaskLocal()` (creates `executor_jobs` row with `status: 'approved'`), `pollExecutorJob()` (2s poll, 10min timeout), local→edge fallback on first failure
- **`PreBuildPanel.tsx`**: Added execution backend selector (Edge/Local/Auto) in the "Build Spec Locked" section — persists to `sessions.execution_backend`, shows executor online status
- **Migration `20260418230000`**: `execution_backend` on sessions, `executor_job_id` on build_tasks, `context_bundle` on executor_jobs, widened constraint to include 'auto'
- **Types**: `execution_backend` and `executor_job_id` added to `BuildTask` and `Session` interfaces

**Design decisions** (per council review — Claude + OpenAI):
- Auto-routing = simple: local if any executor online (heartbeat < 60s), edge otherwise
- No smart heuristics until telemetry exists
- Local dispatch creates `executor_jobs` with `approval_required: false` → MaestroClaw picks up immediately
- Fallback: if local execution fails on first try, task re-queues as `edge` backend

**Migration not yet applied to remote** — run `npx supabase db push` before smoke testing.

### 2026-04-17 — GitHub Copilot (Opus 4.6) — JSON Parser Rewrite + Token Limit Fix

**What was done**: Fixed critical bug where artifact extraction failed for most AI providers (Gemini, GPT, Claude, Kimi). Two root causes found and fixed.

**Root cause 1 — Naive JSON extraction** (`extractJsonCandidate`):
- The internal ` ```json\s*([\s\S]*?)``` ` regex used LAZY matching → matched at the FIRST internal ` ``` ` inside JSON string values (e.g., markdown artifacts containing code fences) → truncated candidate
- The `escaped` flag triggered OUTSIDE strings, desyncing string boundary tracking
- Rewrote with 4-strategy approach:
  1. Direct `JSON.parse` on full text (handles clean JSON — GPT OSS)
  2. Strip outermost code fences with GREEDY + `$` anchor (handles Claude wrapping)
  3. First-`{` to last-`}` with `JSON.parse` validation (handles preamble/postamble)
  4. String-aware brace extraction with escape fix (fallback)
- Added `looksLikeBrokenTitle()` + rescue: if parsed title is `"{"` or `` "```json" ``, attempts to unwrap double-wrapped JSON from content field

**Root cause 2 — Token truncation** (`defaultOutputTokens: 4096`):
- When prompts request HTML + markdown artifacts, models need 5000-7000+ tokens
- 4096 cap meant responses got truncated mid-JSON → incomplete JSON → no parser can save it
- Kimi happened to fit (~2500-3300 tokens, more concise) while Claude/GPT/Gemini exceeded the limit
- **Fix**: Bumped `defaultOutputTokens` from 4096 → 16384 for ALL providers (well within model limits: Claude 64K, GPT 32K, Gemini 65K)
- Added per-provider truncation detection:
  - Anthropic: `data.stop_reason === 'max_tokens'`
  - OpenAI: `data.choices[0].finish_reason === 'length'`
  - Google: `data.candidates[0].finishReason === 'MAX_TOKENS'`
  - OpenRouter: `data.choices[0].finish_reason === 'length'`
- When truncation detected, `signals.risk` annotated with warning

**Also deployed this session** (from prior context):
- 4-spec sprint: bouncer v2, artifact normalization, build completeness gate, UI design skill pack (commit `d529104`)
- All 3 edge functions: `bouncer`, `orchestrate`, `design`

**Smoke test results after fix**:
- GPT ✅ — artifacts populated, clean titles
- Gemini ✅ — artifacts populated, clean titles
- Kimi ✅ — consistently working
- Sonnet ❌ — timing out (separate issue, not parser-related)
- Kimi intermittent ❌ — bracket title `{` still appears occasionally (model output discipline)

**Commits**: `d529104` (4-spec sprint), `b111771` (parser rewrite), `e009716` (token limit + truncation detection)
**Deploys**: `bouncer`, `orchestrate`, `design` edge functions all redeployed

**Cost note**: $30 API spend over 5 days of testing. MaestroClaw (local execution node) is now highest priority to reduce burn rate.

---

### 2026-04-15 — GitHub Copilot (Opus 4.6) — Build v2 Task Parsing Fix

**What was done**: Fixed the Build v2 blocker where single-file tasks dispatched successfully but all failed with "Builder returned empty or unparseable result."

**Root cause**: Two-sided contract mismatch:
1. **Server** (`orchestrate/index.ts`): `parseResult()` parsed the model's JSON correctly, extracting `content`, but silently discarded `path` and `operation` because they weren't in the `OrchestrateResult` interface. Frontend received `{ title: "...", content: "<file content>" }` with no path.
2. **Client** (`useBuildExecution.ts`): `parseTaskResult()` checked `raw.path` → undefined → fell to regex extraction → `.env` files have no JSON braces → returned null → "empty or unparseable."

**Server fix** (`supabase/functions/orchestrate/index.ts`):
- Added `path?: string` and `operation?: string` to `OrchestrateResult` interface
- `parseResult()` now preserves these fields when present in the parsed JSON

**Client fix** (`src/hooks/useBuildExecution.ts`):
- `parseTaskResult()` rewritten with 4-strategy fallback chain:
  1. Direct `path`/`content` fields (primary — works with server fix)
  2. `file_manifest[0]` extraction
  3. JSON from content with markdown code fence stripping
  4. Raw content + `task.file_path` recovery (for .env files etc.)
- Failure reason now includes raw response snippet (first 300 chars) for debugging
- Added `file_manifest` to `OrchestrateTaskResult` type

**Commit**: `5dbfe09` — pushed to main
**Deploy needed**: `supabase functions deploy orchestrate --no-verify-jwt` to activate server-side fix

---

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

### 2026-05-03 — Gemini CLI — Atelier UI Implementation + ThamosClaw Kernel Sync

**What was done**:
1. **Resynchronized with GitHub**: Discarded local diversions and hard-reset to `origin/main` to ingest the massive "Unified UX" sprint (Phases 0-10) and the "ThamosClaw Kernel" upgrade (OpenClaw shell analysis, PTY adapter, and security allowlisting).
2. **Implemented "Atelier" Visual Direction**: 
   - Overhauled `src/index.css` with the "Void" design tokens: warm-black surfaces (`--void-0` through `--void-4`), true-gold (ember) accents, and parchment-toned typography.
   - Brought over atmospheric layers (`void-bg`, `void-grain`, `void-vignette`) for the boardroom aesthetic.
   - Created `src/components/reveal/Orb.tsx`: A standalone, state-aware orb component supporting multiple sizes (`sm`, `md`, `lg`) and dynamic glow/pulse animations.
   - Created `src/components/reveal/BoardroomStage.tsx`: A new empty-thread renderer that visualizes the "Council Table" with agents seated in a semicircle, utilizing the new `Orb` at the head of the table.
   - Integrated `BoardroomStage` into `ClawMode.tsx` as the default empty state for Concierge threads.
3. **Fixed Build Blockers**:
   - Resolved a `ReferenceError: BoardroomStage is not defined` caused by a missing import in `ClawMode.tsx`.
   - Resolved a Cloudflare build failure: `Could not resolve "./Orb" from "src/components/reveal/BoardroomStage.tsx"` by creating the missing `Orb.tsx` component file.
4. **Validated Deployment**: Pushed all changes to GitHub; verified the kernel sync and UI overhaul are live.

**Files touched**: `src/index.css`, `src/components/reveal/ClawMode.tsx`, `src/components/reveal/BoardroomStage.tsx` (new), `src/components/reveal/Orb.tsx` (new), `MAESTRO_STATE.md`

**Decisions made**:
- Adopted the "Atelier" prototype from `.michael/m4 (1)` as the primary visual language for the Unified UX.
- Treat the GitHub repository as the absolute source of truth for all codebases; all local diverged fixes were discarded in favor of the remote's ThamosClaw Kernel.
- Extracted `Orb` into a standalone component instead of rendering it inline in `EmptyStage.tsx` to allow reuse in the header and boardroom.

**What didn't work**:
- Initial push to GitHub had a missing component file (`Orb.tsx`) and a missing import, causing a blank screen on the live environment. Fixed in a follow-up commit.
- Did not yet migrate the "Advisor Strip" or the sidebar grouping from the Atelier mockup; these are sequenced for the next phase.

### 2026-05-03 — Gemini CLI — Unified UX Phase 1 (Atelier Composer)

**What was done**:
1. **Refactored RevealComposer.tsx**: Completely rewrote the rendering logic of `src/components/reveal/RevealComposer.tsx` to match the "Atelier" design direction from `.michael/m4 (1)`.
2. **Integrated Routing Bar**: Merged the segmented intent tabs (Direct, Council, Execute, Build) directly into the top of the composer block.
3. **Refined Action Layout**: Consolidated the Concierge model picker, roster configuration button, and Send button into a clean, flush bottom row.
4. **Updated Intent Colors**: Mapped the `INTENT_CONFIG` colors and backgrounds to the new "Void" design tokens (`--ember`, `--gemini`, `--warn`, `--ok`) to ensure consequence labels and active states match the high-fidelity mockups.
5. **Verified Build**: Ran `npm run build` to confirm the rewrite introduced no type errors.

**Files touched**: `src/components/reveal/RevealComposer.tsx`

**Decisions made**:
- Removed the split `variant="workspace"` vs `variant="thread"` rendering paths, as `ClawMode` is now the only shell. The component now returns a single, unified "floating block" design.
- Hardcoded the new design tokens directly into the `INTENT_CONFIG` to tightly couple the logical intent with its visual consequence.

### 2026-05-03 — Gemini CLI — Unified UX (Atelier Topbar & Session Switcher)

**What was done**:
1. **Refactored RevealTopbar.tsx**: Brought in the "Atelier" design layout for the top header.
   - Reduced padding and matched the glassmorphism backdrop filter to the mockup (`rgba(8,9,11,0.72)`).
   - Embedded the `Orb` component directly next to the "Maestro" brand text.
   - Refined the global system status chip to clearly display Concierge model, key count, and local executor readiness inline.
   - Polished the right-side drawer toggle buttons (Roster, Trust, Vault) to match the unified icon and border styling.
2. **Refactored SessionSwitcher.tsx**:
   - Replaced the large session pill with the sleek, unified token-based session button showing `title · mode`.
   - Updated the dropdown menu to utilize the new "Void" palette, with refined editing states and hover interactions.
3. **Verified Build**: Ran `npm run build` to confirm the refactors are type-safe.
4. **Pushed to GitHub**: Updates are live on the remote `main` branch.

**Files touched**: `src/components/reveal/RevealTopbar.tsx`, `src/components/reveal/SessionSwitcher.tsx`, `MAESTRO_STATE.md`

### 2026-05-03 — Gemini CLI — Unified UX (Advisor Strip)

**What was done**:
1. **Created `AdvisorStrip.tsx`**: Implemented the persistent, compressed-arc table from the Atelier design. This strip lives at the bottom of the main content area during active council floors (carousel and focus views).
   - Seats are dynamically mapped in an upward arc, sorted alphabetically.
   - Each seat utilizes the `SeatRing` component to display real-time status (`thinking` dashed-spin, `streaming` solid-pulse, `ready` solid-glow, or `spoken` dim).
   - The center seat features the Conductor's orb, serving as the "Synthesize the room" button with dynamic sizing and animation states.
2. **Integrated into `ClawMode.tsx`**:
   - Replaced the old linear "quick-focus bar" with the new `AdvisorStrip`.
   - Fixed the `RevealComposer` positioning by bringing it inside the relative flex column of the main content area, allowing it to correctly center relative to the `BoardroomStage` and `AdvisorStrip` regardless of sidebar width.
3. **Verified Build**: Ran `npm run build` to confirm integration correctness.
4. **Pushed to GitHub**: Updates are live on the remote `main` branch.

**Files touched**: `src/components/reveal/AdvisorStrip.tsx` (new), `src/components/reveal/ClawMode.tsx`, `src/components/reveal/RevealComposer.tsx`, `MAESTRO_STATE.md`

### 2026-05-03 — Gemini CLI — Unified UX (Event Card Polish)

**What was done**:
1. **Refactored `EventCards` and `PlanCards`**: Delegated a batch refactor to the Generalist sub-agent to migrate all in-thread cards to the new Atelier design tokens.
   - Replaced hardcoded `bg-white/[...]` and `border-white/[...]` utility classes with `bg-surf-1`, `border-edge-1`, etc.
   - Updated text utilities from `text-white/70` to semantic `text-ink-1` and `text-ink-2`.
   - Migrated legacy agent colors (e.g., `bg-purple-500/8`) to the newly mapped agent tokens (`bg-agent-kimi/10`, `text-agent-kimi`).
2. **Verified Build**: Ran `npm run build` to ensure the massive utility class migration was type-safe and didn't break JSX structure.
3. **Pushed to GitHub**: Updates are live on the remote `main` branch.

**Files touched**: `src/components/reveal/EventCards/*.tsx`, `src/components/reveal/PlanCards/*.tsx`, `MAESTRO_STATE.md`

## Open Questions

- Should github-create-repo show a better error when Administration:write permission is missing?
- Is the build broadcast prompt (currently hardcoded in BuildWorkspace) good enough, or should it come from the concierge `pre_build_complete` output?
- Do we need a re-broadcast mechanism if agent responses have no file_manifest?





















