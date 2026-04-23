# MAESTRO_STATE.md
*Universal onboarding document for all agents (CLI and web). Read AGENTS.md for update rules.*

---

## Read This First

| Field | Value |
|-------|-------|
| Primary branch | `main` |
| Active blockers | GPT OSS phantom agent fires during builds when not selected; legacy broadcast path can still include Claw agents; Sonnet timeouts on artifact-heavy prompts |
| Last verified deploy | `executor-api` deployed 2026-04-17 (MaestroClaw control plane); `orchestrate` redeployed 2026-04-17 (JSON parser rewrite + token limit 4096→16384 + truncation detection); `bouncer` redeployed 2026-04-16; `design` redeployed 2026-04-16 |
| Unapplied migrations | None verified 2026-04-21 |
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
| Prompt input | `src/components/reveal/RevealComposer.tsx` |`r`n| Frontend edge invoke helper | `src/lib/functions.ts` |`r`n| Shared edge auth helper | `supabase/functions/_shared/auth.ts` |`r`n| Edge function config | `supabase/config.toml` |
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
| **Claw Mode Phase 3** — build from chat: `buildFromChat()` flow (plan → review → build → commit), `BUILD_PLAN_PROMPT` for structured plan generation, `ChatBuildPlan`/`ChatBuildFile`/`ChatBuildPhase` types, `generateBuildPlan()` + `executeBuildPlan()` + `approveBuildPlan()` + `cancelBuildPlan()` in `useThreads`, Build 🏗️ button in concierge view (only visible when repo connected), build plan approval card with file list + commit message preview, per-file progress messages in thread, GitHub PR creation via `github-execute` edge function, `SET_CHAT_BUILD_PLAN`/`SET_CHAT_BUILD_PHASE` context actions | 2026-04-20 (`npm run typecheck`, `npm run build`) |
| CLAW_MODE_SPEC.md: council-approved architecture spec for Maestro v2 — thread-first model, Council/Claw hard split, 3 views (Orb/Carousel/Focus), 4-phase build plan, all 7 open questions resolved | 2026-04-20 (council-approved, commits `2d8cbd9`→`9380300`) |
| **Claw Mode Phase 4** — Claw promoted to primary workspace shell (no longer z-50 overlay). Thread sidebar with grouped threads (Concierge/Broadcast/Direct/Execution). Context header showing thread type, active model, repo, build phase. Intent-first composer replacing 5 peer buttons with mode selector (Chat/Broadcast/Execute/Build) + single Send. Markdown rendering in chat via ReactMarkdown+remarkGfm with `.claw-prose` class. Fixed `SET_THREAD_MESSAGES` data loss (per-thread merge). Fixed stale synthesis closure (return value pattern). Contrast bumped from white/15-20 to white/30-40. View transition animations (180ms fade+translateY). Model picker anchored relative instead of fixed. | 2026-04-20 (`npm run typecheck`, `npm run build`) |

## What's Broken or Incomplete

| Issue | Since | Owner |
|-------|-------|-------|
| **GPT OSS phantom agent**: fires during builds even when not selected as a builder — phantom agent bug | 2026-04-19 | Unassigned |
| **Legacy broadcast can still include Claw agents**: "Provider maestroclaw not supported" remains possible if local executors are manually activated in the legacy workspace; `ClawMode.tsx` now filters executors/`maestroclaw` out of chat broadcast | 2026-04-19 / verified 2026-04-20 (code) | Unassigned |
| ~~**ClawCopilot / ClawCodex are not executable yet**~~: ✅ Fixed and smoke-tested — `packages/maestroclaw` now ships `copilot_cli` and `codex_cli` adapters, so capability-aware routing can advertise and claim those jobs when the local CLIs are installed. | 2026-04-21 (validated locally; workers must rebuild/restart to advertise) | Done |
| **Maestro web build UI may not read Claw results correctly**: `pollExecutorJob` reads artifact_manifest but flow from Claw through to GitHub commit not yet end-to-end tested via the Pre-Build UI (only tested via direct DB job insertion) | 2026-04-20 | Unassigned |
| ~~**Claw Mode thread/view labeling is misleading**~~: ✅ Fixed in Phase 4 — context header now shows thread type, active model, repo, build phase | 2026-04-20 (fixed) | Done |
| ~~**Claw Mode responsive layout is not ready**~~: ✅ Fixed in Phase 4 — intent composer wraps on mobile, model picker uses relative positioning, sidebar is collapsible | 2026-04-20 (fixed) | Done |
| Sonnet timeouts on artifact-heavy analysis prompts (possibly needs prompt trimming or dedicated artifact mode) | 2026-04-17 | Unassigned |
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
4. ~~**Claw Mode Phase 4 — Polish + Promotion**~~ ✅ Done — Claw is primary workspace shell, thread sidebar, context header, intent composer, markdown in chat, 3 bug fixes, contrast/animation polish
5. **Filter Claw agents from broadcast**: Claw agents error with "Provider maestroclaw not supported" when included in broadcast. Need to exclude `provider_group === 'maestroclaw'` from the broadcast agent list.
6. **Fix GPT OSS phantom agent**: Fires during builds when not selected. Likely a remnant/ghost agent — needs investigation.
7. **End-to-end Pre-Build UI → Claw test**: Full flow from Pre-Build UI (not just direct DB job insertion).
8. **Artifact → GitHub bridge for Claw builds**: Wire Claw artifacts through `github-execute` edge function.
9. **Build v3 Phase 2 — Context bundling**: `buildContextBundle()`, AGENTS.md generation per job.
10. **Sonnet artifact timeout investigation**: Profile why Sonnet times out on artifact-heavy prompts.
11. Retire legacy broadcast path once v2 is battle-tested across multiple projects

---

# Part 3 — Session Log

*Append-only, newest first. Never delete entries.*

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

## Open Questions

- Should github-create-repo show a better error when Administration:write permission is missing?
- Is the build broadcast prompt (currently hardcoded in BuildWorkspace) good enough, or should it come from the concierge `pre_build_complete` output?
- Do we need a re-broadcast mechanism if agent responses have no file_manifest?



















