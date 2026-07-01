# MAESTRO_STATE.md
*Universal onboarding document for all agents (CLI and web). Read AGENTS.md for update rules.*

---

## Read This First

| Field | Value |
|-------|-------|
| Primary branch | `main` |
| Active blockers | Sonnet timeouts on artifact-heavy prompts |
| Last verified deploy | All 19 functions ACTIVE (verified 2026-06-09): `orchestrate` v39 (Karpathy embed, 2026-06-02); `synthesize` v14 (PRO-01 deliberation-aware synthesis, 2026-06-09 — v13 and earlier did NOT have it); `repo-memory-update` v2 (graph_update action + kind/relations columns, 2026-06-02); `github-execute` v30 (C-03 intra-agent path dedup, 2026-06-02); `deliberate` v3 (SOM-04 2026-05-12); `concierge-triage` v8 (ACTIVE — not unbuilt as SPRINT_MASTER claims); `executor-api` v19 (ACTIVE); `iteration-init` v2 (2026-05-08) |
| Unapplied migrations | None — all 51 migrations applied remotely (verified 2026-06-02) |
| CI | `.github/workflows/ci.yml` — typecheck + lint + build + maestroclaw tests on push/PR to main (first run green 2026-06-09) |
| Active locks | None |
| MaestroClaw version | v0.1.0 |
| Stable architecture | See `docs/reference/REFERENCE.md` |
| Session log (pre-May-6) | See `docs/session-log/HISTORY.md` |

---

# Part 2 — Operational State

*Updated every session. Every claim here MUST have a verification date or be marked `unverified`.*

## What's Working

| Capability | Verified |
|------------|----------|
| **Graphify knowledge graph**: `graphifyy` v0.8.49 installed (against system Python 3.12 — uv standalone Python `_ssl` DLL is blocked by WDAC). `.graphifyignore` scopes to Maestro source (212 code files → 1235 nodes / 2668 edges / 68 communities). Code-only graph committed to `graphify-out/` (graph.json/html, GRAPH_REPORT.md, callflow); 68 communities labeled via `claude-cli`/haiku backend (user session, no API spend). Git post-commit/post-checkout hooks installed (AST-only auto-rebuild). God node: `useMaestro()` 99 edges. Graph confirms Conductor (C11 "Conductor Task Execution") is a separate island from the iteration runner (C3); no reputation/scoring community exists (Rate layer net-new) | 2026-06-26 (built/queried/labeled/committed `b9dfe7d`,`3a9bc6c`) |
| **CI pipeline**: `.github/workflows/ci.yml` — frontend job (typecheck, lint, vite build) + maestroclaw job (tsc build, shell-analyzer tests) on push/PR to main | 2026-06-09 (first run green, run 27244113269) |
| **Repo-wide lint zero**: `npm run lint` = 0 errors / 10 warnings (was 117/36). ESLint now allowlists only `packages/maestroclaw/src`+`test`; `_`-prefixed unused vars/args allowed by config | 2026-06-09 (`npm run lint`, commit `d1c091d`) |
| **PRO-01 deliberation-aware synthesis DEPLOYED**: `synthesize` v14 live — deployed version verified byte-identical to git. NOTE: May-7 logs claimed deployment but deployed v13 was the classic pre-PRO-01 version; actual first deploy was 2026-06-09 | 2026-06-09 (`supabase functions deploy synthesize`, download-diff verified) |
| **AGENT-01 Structured Claw session logging**: added local `session.log` JSONL utility; ClawClaude/ClawCopilot/ClawCodex/ClawGemini append `tool_use`/`complete`/`error` events; session prompts require AGENTS-style pre-read + final `session_log` JSON; executor parses/forwards structured `session_log`, records file writes, and appends local log summaries to `result_summary`; iteration runner records `file_read`, `file_write`, `test_run`, `error`, and `give_up` events and feeds recent log summaries into later step prompts | 2026-05-12 (`npm --prefix packages\maestroclaw run build`, `npm --prefix packages\maestroclaw test`, `npm run typecheck`) |
| **Iteration loop premature-failure fix + adapter fallback chain**: `executor-api` `report_step` no longer mirrors step `failed` state to loop (loop only ends via `completeLoop`); `runner.ts` has 4-adapter fallback chain (claude_code → codex_cli → copilot_cli → gemini_cli) so rate-limited adapters fall back silently | 2026-05-11 (committed `51e6e28`, deployed `executor-api`) |
| **Iterate intent stays active + loop progress banner + Fill from lanes button**: RevealComposer stays in iterate mode after submit; shows active loop status banner (last 3 steps); "Fill from ARCHITECT.md lanes" button queries `build_lanes` then falls back to ARCHITECT.md parsing | 2026-05-11 (committed `0b65b06`) |
| **PRO-02 Iteration Loop** | Migration `20260507130000_iteration_loops.sql` (pending apply); `iteration-init` edge function (pending deploy); Claw runner skeleton + controls + locks.ts; frontend `useIterationLoop` hook + IterationCard/IterationStepRow/IterationApprovalPanel UI; executor-api loop actions; RevealComposer Iterate intent | (pending) |
| **PRO-01 Deliberation — frontend**: `ResponseKind`/`DeliberationPushback` types, extended `Round`+`Response` interfaces, `isDeliberating` state + `UPDATE_ROUND` action in MaestroContext, `useDeliberation` hook, FolioCarousel "Deliberate" pill (gated on ≥3 primary responses + round complete), FolioCard collapsible inbound-pushbacks section. Migration + `deliberate` + `synthesize` edge functions deployed. | 2026-05-07 (`npm run typecheck`, `npm run build`, migration applied, functions deployed, commit `9216ffd`) |
| **DIFF-02 Repo Memory**: `repo_memory` table, `repo-memory-update` edge function (get/summarize/update_direct/forget), concierge memory injection, `useRepoMemory` hook, `MemoryPanel` TrustDrawer tab, 📝 StatusChip indicator | 2026-05-06 (`npm run typecheck`, `npm run build`, deployed, migration applied) |
| Claw frontend shell stabilization: strict TypeScript is clean again; `StatusChip` is restored in the topbar truth layer; carousel/focus synthesis handler is wired; ClawMode no longer presents the main workspace as a modal; invalid Tailwind `/8` and `/12` opacity classes now emit in production CSS | 2026-05-04 (`npm run typecheck`, `npm run build`) |
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
| **SOM-04 Persona voice layer**: `personas` table + 4-persona seed (builder/skeptic/archivist/critic) + `agents.persona_id` FK; `_shared/persona-prompt.ts` renderer+validator; `orchestrate` injects voice_preamble + `agent_query` hint in analysis mode (stripped in build modes); `deliberate` appends `deliberation_signature` per agent; `useOrchestration` passes `agentId` | 2026-05-12 (`npm run typecheck` clean, migration applied, `orchestrate`+`deliberate` deployed, commit `021695e`) |
| **FLOW-04 Verbosity Tiers**: `VerbosityTier` type (`brief`/`standard`/`detailed`), `verbosityTier` state in MaestroContext, tier picker in RevealComposer, `verbosityTier` passed in orchestrate payload, tier-specific postscript injected in `buildSystemPrompt` — deployed as part of SOM-04 orchestrate deploy 2026-05-12 (Gemini CLI wrote the code 2026-05-11, no separate deploy at that time) | 2026-05-12 (first deploy via SOM-04 bundle, `npm run typecheck` clean per Gemini session log) |
| **FLOW-02 Orb state instrument**: `OrbState` extended with `deliberating`, `synthesizing`, `iterating`, `error` states; `deriveOrbState()` priority chain updated (iterating > deliberating > synthesizing > building > concierge > conflict > ...); `deriveOrbStatusText()` covers all 11 states with dynamic iterating step count; `EmptyStage.tsx` `ORB_CONFIG` extended with per-state `gradient` + new keyframes (deliberating/synthesizing/iterating/error); `Orb.tsx` fully state-reactive with per-state gradient + glow RGB | 2026-05-11 (`npm run typecheck` clean) |
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
| MaestroClaw agents in builder roster: 4 Claw agents (ClawClaude, ClawCopilot, ClawCodex, ClawGemini) in `AGENT_DEFAULTS`, selectable as builders in Pre-Build with executor-aware scoring. Verified against `src/types/index.ts` 2026-05-03 | 2026-05-03 |
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
| ~~**Repo-wide lint is polluted by generated MaestroClaw outputs**~~ ✅ Fixed (2026-06-09, commit `d1c091d`): eslint ignores everything under `packages/maestroclaw/` except `src/` and `test/`; all 117 errors resolved | 2026-04-29 (`npm run lint`) | Done |
| ~~**Claw Mode thread/view labeling is misleading**~~: ✅ Fixed in Phase 4 — context header now shows thread type, active model, repo, build phase | 2026-04-20 (fixed) | Done |
| ~~**Claw Mode responsive layout is not ready**~~: ✅ Fixed in Phase 4 — intent composer wraps on mobile, model picker uses relative positioning, sidebar is collapsible | 2026-04-20 (fixed) | Done |
| **Claw poll loop is single-threaded**: `index.ts` does `await executeJob()` blocking one job at a time. 40-file builds run sequentially. Fix: concurrent job pool (MAX_CONCURRENT_JOBS, Phase 1 of CLAW_BUILD_V2_SPEC.md) | 2026-04-27 | ✅ **Fixed in Phase 1 (commit `2dd4752`)** |
| Kimi K2 intermittently shows bracket `{` as title despite parser fix — may be model-side output discipline | 2026-04-17 | Unassigned |
| Claude models (Sonnet/Opus) may still wrap response in ` ```json ` fences — parser handles most cases but edge cases remain | 2026-04-17 | Unassigned |
| Builder count defaults and roster locking now exist in Pre-Build, but provider-health-aware failover and lane reroute policy are still not concierge-driven | 2026-04-13 | Unassigned |
| No real-time streaming — responses arrive all at once; StreamingFolio is visual-only | Pre-existing | — |
| **SPRINT_MASTER.md staleness**: lists `concierge-triage` as unbuilt (it IS deployed v8 ACTIVE); lists `executor-api` as not documented (it IS deployed v19). SPRINT_MASTER needs a pass to reflect current deployed state. | Discovered 2026-06-02 | Unassigned |
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

*Append-only, newest first. Never delete entries. Pre-May-12 history in `docs/session-log/HISTORY.md`.*

### 2026-07-01 — Claude Code (claude-fable-5) — Grading Lab founded: task-001 calibration cycle (c-06 review) + graphify on main machine

> ⚠️ **Enterprise-Fable / blind auditors: STOP here** — if you were sent to do the independent c-06 audit (`docs/ENTERPRISE_FABLE_AUDIT.md`), skip this entry until your review is written. It contains results that would unblind you.

**What was done:**
1. **Git sync**: fast-forwarded 3 commits to `86d5391` (other-laptop Graphify session). Graphify v0.9.4 installed on this machine (`uv tool install graphifyy`); post-commit/post-checkout hooks installed.
2. **Grading Lab founded** (`grading-lab/PROTOCOL.md`): empirical calibration of the peer-grading loop before Rate ships it. Conductor = Claude Code (Fable); workers/graders = local model CLIs dispatched headless from one window (the "local Maestro v0" pattern — no new Maestro code needed to run council experiments).
3. **task-001 (review c-06 commit `22a04a1`) complete end-to-end**: 5 workers (codex/gpt-5.5, copilot/auto→**claude-fable-5**, copilot/gpt-5.4, grok, kimi/K2.7) + conductor review + 5 blind peer graders (per-grader shuffles, isolated views) + human anchor grade (blind, fresh shuffle). Results in `grading-lab/tasks/task-001-c06-review/` (grades/, meta.json).
4. **Headline findings**: (a) verdict unanimous 6/6 — **c-06 needs rework** (starved ranking inputs in `collectManifest`; `codePointAt(0)` tie-break ≠ documented lexicographic — bug inherited from maestroclaw `reconcile.ts`; mirror divergences incl. failed/skipped-unblock, unknown-dep stall, empty-lane-wins, non-ASCII priority inversion). (b) Grading stability high: 4/5 identical peer rankings across different shuffles; no position bias; no self-preference (inverted if anything); human anchor Spearman 0.90 vs peer consensus. (c) **Wrapper lesson**: copilot "auto" resolved to claude-fable-5 — roster/reputation must key on *resolved model + harness*, not CLI; harness-Fable (conductor) missed 3 findings wrapper-Fable caught.
5. **Prompt-steering caveat (honest)**: TASK.md deliverable q3 leaked a conductor prior toward finding #1 (see meta.json `prompt_steering_note`); all other findings unhinted. Protocol fixed for task-002: spec authored before conductor forms opinions.
6. **Adapter quirks learned** (recorded in meta.json): codex needs stdin closed + `--skip-git-repo-check`; kimi needs `PYTHONIOENCODING=utf-8` when piped on Windows; gemini standalone CLI dead for individuals (use Antigravity `agy` CLI — headless `-p` — or `GEMINI_API_KEY`); copilot `--model` selects hosted models.

**Files touched:** `grading-lab/**` (new), `docs/MAESTRO_PHILOSOPHY.md` (committed; Sakana-not-Sakura fix), `docs/ENTERPRISE_FABLE_AUDIT.md` (new), `MAESTRO_STATE.md`.

**Decisions made:**
- **c-06 rework deliberately deferred** until enterprise-Fable's independent audit (same commit, different harness — the comparison requires an unmodified branch). Rework list is the merged 6-review fix-list; then merge to main.
- task-002 = subjective direction-memo brainstorm (no right answer) to test grader stability on non-legible tasks — code review has "legible right-and-wrong-ness"; grading may destabilize without it.
- Grading data lives in-repo (`grading-lab/`) → syncs across machines, feeds future pattern-library RAG.

**What didn't work / notes:**
- Two stale kimi processes (June 4/23) hold `~/.kimi/logs/kimi.log` → noisy non-fatal rotation errors on every kimi run.
- Auto-mode classifier blocked agent-run `graphify hook install` twice (persistence); user in-conversation authorization unblocked it.

### 2026-06-26 — Claude Code (claude-opus-4-8) — Graphify knowledge-graph integration + OpenClaw reference clone

**What was done:**
1. **Git sync**: pulled 4 commits behind (Fable's 2026-06-09 drift-recovery session); fast-forwarded clean to `3756893`.
2. **OpenClaw cloned** to `.openclaw/` (gitignored) for assessment. Verdict: **borrow the sandbox/net-policy/fs-policy patterns, do NOT adopt the runtime** — OpenClaw's `VISION.md` explicitly rejects "agent-hierarchy frameworks" and "heavy orchestration layers" (i.e. Maestro's core thesis). Same call as Ruflo. Their sandbox stack (`net-policy`, `sandbox-exec-server`, Docker sandbox, agent-specific mounted-paths) maps directly onto Opus audit P0-1/P0-2 (soft local trust boundary).
3. **Graphify integration** (claude.ai sprint): installed `graphifyy[mcp]` v0.8.49; resolved two blockers — (a) auto-mode classifier blocks agent-initiated package installs (user ran via `!`); (b) WDAC blocks uv standalone Python `_ssl` DLL → reinstalled against system Python 3.12. Built scoped code-only graph (212 files, 1235 nodes, 2668 edges, 68 communities, zero token cost), generated GRAPH_REPORT.md + graph.html + callflow, labeled 68 communities via `claude-cli`/haiku (user session). Installed git auto-rebuild hooks. Committed `b9dfe7d` + `3a9bc6c`.
4. **Graph findings**: god node `useMaestro()` (99 edges — confirms Opus's god-context finding); 2 import cycles in maestroclaw adapters; `repo_memory` is loosely coupled (isolated community); **Conductor module (C11) is a structural island, not wired into runIterationLoop (C3)** — corroborates the C-06 gap; **no reputation/scoring community** — agent-grading (Rate) is net-new.

**Files touched:** `.gitignore`, `.graphifyignore` (new), `graphify-out/*` (new), `MAESTRO_STATE.md`. (`.openclaw/` gitignored, not committed.)

**Decisions made:**
- Graph scoped to Maestro source only (`.openclaw`/`.michael`/deps/docs/yaml excluded). Doc-inclusive + Obsidian build deferred (needs LLM key; lower marginal value than code graph).
- Held for explicit opt-in: `graphify claude install` PreToolUse hook (skipped — too invasive); git hook installed (free AST-only).
- Vision captured (collective-intelligence thesis, emergent personas Malakh/Axiom/Ari, Claude+GPT analysis-paralysis loop, grading-is-nearly-free, skill flywheel, local-LLM-as-loyal-spine north star). Sequence agreed: wire Conductor (C-06) → Rate → Skills flywheel → local concierge spine.

**What didn't work / notes:**
- C-06 Conductor wiring deliberately NOT started (claude.ai handoff: defer until graph review).
- Graphify community *names* drift on AST auto-rebuild (re-run `graphify label . --backend claude-cli --model haiku` to refresh).

---

### 2026-06-09 — Copilot CLI (claude-fable-5) — Phase 0: drift recovery, synthesize v14, lint zero, CI pipeline, state-file repair

**What was done:**
1. **Full project assessment** (functionality/security/UX/ecosystem) — verdict: strong deliberation/synthesis product on a prototype trust chassis. Top blockers identified: `approved-shell` shell:true injection, `agent_query` unscoped file reads, replayable HMAC approval tokens, near-zero tests, no CI. 23-task remediation plan created (Phases 0–5).
2. **Deploy drift audit ✅**: downloaded all 19 deployed functions and diffed against git. Findings: `orchestrate` v39 + `github-execute` v30 had additive hot-patches (recovered into git); `repo-memory-update` deployed was newer than git (recovered); **`synthesize` deployed (v13) was OLDER than git — PRO-01 deliberation-aware synthesis was never actually deployed despite May-7 logs**. Recovered missing migration `20260602000000` via Supabase Management API.
3. **synthesize v14 deployed ✅**: PRO-01 deliberation-aware synthesis is now actually live; deployed bytes verified identical to git. Also fixed a pre-existing `no-explicit-any` (now uses `AuthenticatedRequestContext`).
4. **Git history reconciled**: remote had 3 unpushed commits from the Conductor's June-2 session (C-05 Superpowers embed) — this was the drift source. Rebased and pushed clean (`5e2257f`).
5. **Lint zero ✅** (commit `d1c091d`): 117 errors → 0. ESLint allowlists only `packages/maestroclaw/src`+`test` (66 parse errors were transient job workspaces); `_`-prefix unused-vars convention codified in config; useless regex/template escapes removed (`prompt.ts`, `redact.ts`, `useOrchestration.ts`, `apply-diff.ts`, `executor.ts`); dead `baseChunkSize`/`finalError` removed; unused `IterationControlRecord` import dropped; `process.env as any` typed; constant-true conditional removed in RevealComposer.
6. **CI pipeline ✅** (commit `6078ee2`): `.github/workflows/ci.yml` — frontend (typecheck/lint/build) + maestroclaw (build/test) jobs. First run green.
7. **State-file repair ✅**: reconstructed 4 orphaned session-log headers (entries had lost their `###` lines); removed a duplicated 14-line fragment at EOF; moved entries 2026-05-06→05-12 to `docs/session-log/HISTORY.md`; file trimmed 732 → ~330 lines (under 500 doctrine); corrected stale deploy claims in Read This First.

**Files touched:** `supabase/functions/orchestrate/index.ts`, `supabase/functions/github-execute/index.ts`, `supabase/functions/repo-memory-update/index.ts`, `supabase/functions/synthesize/index.ts`, `supabase/migrations/20260602000000_repo_memory_graph.sql` (recovered), `eslint.config.js`, `.github/workflows/ci.yml` (new), `packages/maestroclaw/src/{adapters/pty-shell.ts,executor.ts,iteration/apply-diff.ts,iteration/prompt.ts,iteration/runner.ts}`, `src/components/reveal/RevealComposer.tsx`, `src/hooks/useOrchestration.ts`, `supabase/functions/deliberate/redact.ts`, `MAESTRO_STATE.md`, `docs/session-log/HISTORY.md`

**Decisions made:**
- ESLint inverted to allowlist (`packages/maestroclaw/*` ignored, `!src` `!test` re-included) — mirrors `.gitignore`; new generated dirs can never re-pollute lint.
- `_`-prefixed unused args/vars are now officially exempt via eslint config (codifies existing codebase convention).
- Reconstructed session-log headers are marked *(header reconstructed 2026-06-09)* with inference source — original authorship metadata was already lost.
- 10 remaining lint warnings (react-hooks/exhaustive-deps etc.) left as warnings — each needs individual behavioral review, queued for Phase 3 context work.

**What didn't work:**
- `git add -A` hangs multi-minute on this machine (traverses preserved job workspaces) — use targeted `git add <paths>`.
- `supabase migration fetch` hangs; `supabase db dump` needs Docker. Workaround: Management API via `database/query` endpoint.

**Next up:** smoke-local-build (needs executor running — Conductor assist), then Phase 1 security: sandbox-approved-shell, agent-query-scope, hmac-nonce, verification-cmd-fix.

---

### 2026-06-02 (session 2) — Copilot CLI (Sonnet 4.6) — C-02 + C-03 + C-05: repo_memory graph + Conductor module + Superpowers embed

**What was done:**
1. **MAESTRO_STATE.md updated** per AGENTS.md Rule 1: corrected stale deploy versions, added SPRINT_MASTER staleness to "What's Broken", documented C-02 as ✅ Done.
2. **C-02 ✅**: `repo_memory` graph enhancement — migration `20260602000000_repo_memory_graph.sql` adds `kind TEXT CHECK(...)` and `relations JSONB DEFAULT '[]'` columns; `repo-memory-update` edge fn extended with `graph_update` action; deployed as v2.
3. **C-03 ✅**: Conductor module — created `packages/maestroclaw/src/conductor/` with:
   - `plan.ts`: immutable `ConductorPlan` + `buildPlan/getReadyEntries/markEntry*` (P0/P1/P2, dependency graph)
   - `reconcile.ts`: `detectManifestConflicts` + `reconcileManifests` (conductor_approved > priority > lane_name; advisory pre-flight)
   - `conductor.ts`: `createConductorRun()` factory — ephemeral, scoped to one run
   - `index.ts`: re-exports; wired into maestroclaw `index.ts` at loop claim
4. **P1-5 fix ✅**: Replaced `resolvedBefore/resolvedAfter` deadlock guard with `fingerprintNonterminalTasks()` — reroutes to new lanes / retry increments now register as progress.
5. **P1-4 fix ✅**: Fixed misleading "last-write-wins" comment in `github-execute` synthesized mode; added `seenPaths` intra-agent path dedup. `github-execute` deployed (new version).
6. **C-04 ✅**: Already done — `maxConcurrentJobs` is a config env var (default 3), not hardcoded.
7. **C-05 ✅**: `buildConductorPrompt()` in `packages/maestroclaw/src/conductor/prompt.ts` — embeds 4 obra/superpowers skills (MIT) as inline context: `dispatching-parallel-agents`, `subagent-driven-development`, `writing-plans`, `using-git-worktrees`. For coordinator lead-agent calls only, not `buildSystemPrompt()`.

**Commits:** `edae404` (C-02), `2bc18b3` (C-03 + P1-4/P1-5), `f2255e2` (C-05) — all pushed to `main`.

**Files touched:** `supabase/migrations/20260602000000_repo_memory_graph.sql` (new), `supabase/functions/repo-memory-update/index.ts`, `supabase/functions/github-execute/index.ts`, `src/hooks/useBuildExecution.ts`, `packages/maestroclaw/src/conductor/plan.ts` (new), `packages/maestroclaw/src/conductor/reconcile.ts` (new), `packages/maestroclaw/src/conductor/conductor.ts` (new), `packages/maestroclaw/src/conductor/prompt.ts` (new), `packages/maestroclaw/src/conductor/index.ts` (new), `packages/maestroclaw/src/index.ts`, `docs/vault/Active-Sprint.md`, `MAESTRO_STATE.md`

**Decisions made:**
- Conductor module is pure stateless helpers (rubber duck confirmed: no second source of truth, no restart-unsafe singleton).
- `reconcile.ts` advisory pre-flight; authoritative enforcement stays in `github-execute`.
- `fingerprintNonterminalTasks` lives in `useBuildExecution.ts` (different build target from maestroclaw).
- P1-4 "last-write-wins" comment was misleading — cross-agent collisions were already handled; only intra-agent dedup was missing.

**What didn't work / open questions:**
- SOM-01 SSE streaming: still blocked (needs source repo location from user).
- Conductor not yet passed into `runIterationLoop` — loop signature change deferred to C-06.
- maestroclaw pre-existing typecheck error: `@lydell/node-pty` missing in `pty-shell.ts` — not introduced this session.

**Next up:** C-06 (Born Organized scaffold pack — opt-in, post-Conductor) or SOM-01 if source repo is found.

---
### 2026-06-02 (session 1) — Copilot CLI (Sonnet 4.6) — Conductor Sprint 1 bootstrap: addons, vault, Karpathy embed, GitHub sync, Supabase deploy

**What was done:**
1. Read and assessed `ORCHESTRATION_ROADMAP_OPUS-4.8.md` — Opus 4.8's 3-layer plan (Conductor → Bridge → Council+House). Assessment: sound architecture, align with maestroclaw primitives, do not adopt Ruflo runtime.
2. Fetched READMEs for 6 addon repos; created `.addons/` shelf with individual assessments + `INTEGRATION_PLAN.md` (Opus 4.8 5-question integration assessment saved verbatim).
3. Ran Opus 4.8 as background agent (`task` tool, `model: "claude-opus-4.8"`) for deeper integration review. Opus confirmed: Design Phase IS built (`design` fn); Pre-Build IS built (`intake` + `architect` fns); `concierge-triage` IS deployed v8 (SPRINT_MASTER wrong); 2-at-a-time cap is in `useBuildExecution.ts` not maestroclaw.
4. **C-01 ✅**: Embedded Karpathy 4 principles (Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution) into `orchestrate/index.ts:buildSystemPrompt()` — build + build_task modes only. Deployed as v39.
5. Created `docs/CONDUCTOR_SPRINT_1.md` — sprint spec C-01 through C-06 with addon integration decisions, P1 bug targets, open questions.
6. Created `docs/vault/` — 7-note Obsidian knowledge graph (Home, Architecture, Edge-Functions, Database, MaestroClaw, Key-Files, Active-Sprint). Read-projection only; `repo_memory` table is canonical.
7. **Git init**: Local folder was a plain extracted copy (not a clone). Used `git init` → `git remote add origin` → `git fetch` → `git update-ref HEAD FETCH_HEAD` → `git reset` to attach to remote state without overwriting local files.
8. PR #1 created + merged to main (fast-forward, 19 files, 1,542 insertions). Branch deleted.
9. **Supabase**: Linked project `hhlnadxbrdwxcxwfbvwh`. Confirmed 19 functions ACTIVE, 50 migrations zero-drift. Deployed `orchestrate` v39.

**Files touched:** `supabase/functions/orchestrate/index.ts`, `docs/CONDUCTOR_SPRINT_1.md` (new), `docs/vault/Home.md` (new), `docs/vault/Architecture.md` (new), `docs/vault/Edge-Functions.md` (new), `docs/vault/Database.md` (new), `docs/vault/MaestroClaw.md` (new), `docs/vault/Key-Files.md` (new), `docs/vault/Active-Sprint.md` (new), `.addons/INTEGRATION_PLAN.md` (new), `.addons/README.md` (new), `.addons/[6 subdirectories]/README.md` (new), `ORCHESTRATION_ROADMAP_OPUS-4.8.md` (committed)

**Decisions made:**
- Ruflo: DO NOT integrate runtime. Mine GOAP schema pattern only for `plan.ts` (C-03).
- Obsidian vault: read-projection of `repo_memory`; never source of truth. Auto-generation from `repo_memory` is the goal after C-02.
- ECC: cherry-pick skill content only; no harness install.
- Superpowers: 4 skills embedded as content in Conductor coordinator prompt (C-04), not in `buildSystemPrompt()`.
- `gh auth switch --user hdcsnags` required at start of every session targeting this project.
- Two gh accounts on machine: `Michael-Thomas_dsbn` (default) and `hdcsnags` (Maestro project owner).

**Stale docs corrected:**
- SPRINT_MASTER lists `concierge-triage` as unbuilt — it IS deployed v8 ACTIVE.
- `executor-api` IS deployed v19 — not documented anywhere.
- Migration count was 49 in "Read This First" — actual count is 50.
- `orchestrate` was v37/v38 — now v39.

**What didn't work / open questions:**
- SOM-01 SSE streaming: which machine/repo has working SSE code? Still blocked.
- `db diff` requires Docker Desktop (not running) — only needed for local migration generation, not deployment.
- C-02 (repo_memory kind+relations) not yet started — next step.

---

### 2026-05-21 — Copilot CLI (Sonnet 4.6) — MEM-02: decision graph / institutional memory + UI-A fixes

**What was done:**
- **UI-A bug fixes (committed `7576e49`):**
  - ui-a1: FolioCard `handleFlag/Lead/Pin` — added `catch` blocks (DB failures were silently swallowed)
  - ui-a2: OrchestraDrawer `handleSelectTier` — added `tiering` boolean state, wrapped in try/finally, tier buttons disabled + dimmed during the 15-await loop
  - ui-a4: ShortcutOverlay — moved `navigator.platform` and `SHORTCUTS` array inside component body (were at module level, failed in Node/test environments). SynthesisDrawer `window.innerWidth` guarded with `typeof window !== 'undefined'`
  - ui-a3, ui-a5: already implemented; confirmed no action needed
- **MEM-02: decision graph / institutional memory (committed `ae52604`):**
  - NEW `packages/maestroclaw/src/lib/decision-record.ts`: `DecisionRecord` interface, `detectProblemType()` (keyword-based: auth/database/ui/api/testing/config/refactor/general), `buildDecisionRecord()`, `saveDecisionRecord()`, `loadDecisionRecord()`
  - `runner.ts`: `LoopState` gains `filesTouched: string[]`. New `completeLoopWithRecord()` module-level helper builds + saves record (best-effort) then calls `completeLoop` forwarding the record. All 5 terminal outcome paths (timeout / succeeded / unrecoverable / agent_stuck / aborted / max_steps) now go through this helper. `filesTouched` accumulated only on successful apply+verify
  - `api.ts`: `completeLoop()` accepts optional `decisionRecord?: unknown`
  - `executor-api/index.ts`: `complete_loop` action reads `decision_record` from body, stores it in `iteration_loops.decision_record`
  - Migration `20260521000000`: `ALTER TABLE iteration_loops ADD COLUMN IF NOT EXISTS decision_record jsonb`
  - `database.types.ts`: full `iteration_loops` table type added (was missing — all prior queries used `as any` workaround)
  - `useThreads.ts` `sendToConcierge()`: fetches last 5 `iteration_loops` rows for the session where `decision_record IS NOT NULL`, formats as `## Recent Build Memory` preamble prepended to concierge prompt. Best-effort (failure doesn't block concierge)

**Files touched:** `src/components/reveal/FolioCard.tsx`, `src/components/reveal/OrchestraDrawer.tsx`, `src/components/reveal/ShortcutOverlay.tsx`, `src/components/reveal/SynthesisDrawer.tsx`, `packages/maestroclaw/src/lib/decision-record.ts` (new), `packages/maestroclaw/src/iteration/runner.ts`, `packages/maestroclaw/src/api.ts`, `supabase/functions/executor-api/index.ts`, `supabase/migrations/20260521000000_mem02_decision_record.sql` (new), `src/lib/database.types.ts`, `src/hooks/useThreads.ts`

**Decisions:** Decision records stored in `iteration_loops.decision_record` (co-located, no new table). `filesTouched` tracks only successfully applied+verified files (rolled-back files excluded). Concierge injection is session-scoped (all loops from `activeSession.id`), not thread-scoped. Early failure paths (lock/workspace setup) don't save records — no meaningful step data at that point.

**Deployments:** Migration `20260521000000` pushed to `hhlnadxbrdwxcxwfbvwh`. `executor-api` redeployed.

---

### 2026-05-12 — Copilot CLI (Sonnet 4.6) — SOM-04 OrchestraDrawer persona badge + picker *(header reconstructed 2026-06-09; date inferred from commit `ea427fc`)*

**What was done:**
- Added `PersonaRow` interfaceto `src/types/index.ts`; added `persona_id?: string | null` to `Agent` interface
- OrchestraDrawer: fetches `personas` table on mount (id, slug, name, one_liner) into local state
- Slot button shows colored persona badge (builder=gold, skeptic=purple, critic=orange, archivist=blue); unassigned slots show `+ persona` inline prompt
- Click badge or `+ persona` opens persona picker panel (follows `renderScopeEditor` UX pattern): `None` chip + 4 colored persona slug chips with `one_liner` on selection
- `handleSetPersona` writes `persona_id` to `agents` table then dispatches `UPDATE_AGENT` to local state
- Added `PERSONA_COLORS` constant to drawer
- Typecheck clean; committed `ea427fc`; pushed

**Files touched:** `src/types/index.ts`, `src/components/reveal/OrchestraDrawer.tsx`, `.michael/opus/PERSONAS.md` (tracked for first time)

**Decisions:** Personas list fetched once on mount (4 rows, never changes mid-session). `personaPickerAgent` follows same open/close pattern as `scopeEditorAgent` — only one drawer open at a time. Pickers for scope and persona can both be open simultaneously (they show for different agents).
