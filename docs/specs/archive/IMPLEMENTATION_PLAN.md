# MAESTRO IMPLEMENTATION PLAN

**Status:** Draft — Council review pending
**Authored:** 2026-05-03 by Opus 4.7 (audit + spec)
**Audience:** Sonnet 4.6 / GPT-5.5 / Gemini 3.1 / Opus 4.7 (per-task assignment below)
**Target codebase:** `C:\New folder\MaestroOrchestra\project\Maestro` (linked to GitHub)

This document is the result of a full audit of the Maestro codebase (web app + MaestroClaw + ThamosClaw kernel) on 2026-05-03. It converts that audit into discrete, self-contained, agent-ready implementation tasks.

---

## How To Use This Document

1. **Pick a task by ID** (e.g. `SEC-01`). Each task block is self-contained — you do not need to read the rest of the doc to implement it.
2. **Confirm the recommended agent** matches the agent currently working. If a task is tagged `Opus`, do not implement it on Sonnet without explicit human approval — those tasks have architectural decisions that need senior judgment.
3. **Read the full task block**: Files Touched, Current State, Target State, Acceptance Criteria, Verification, Dependencies, Open Questions.
4. **Resolve Open Questions before implementing.** If a question is unresolved, flag it in your response to the human and stop. Do not assume.
5. **Verify with the listed steps before declaring done.** Typecheck-only is NOT acceptance. Browser smoke test is required for any task that touches UI behavior.
6. **Update task status** in `IMPLEMENTATION_PLAN_STATUS.md` (create if missing) with `[task-id] [agent] [date] [verified|partial|blocked] [notes]`.

---

## Agent Assignment Cheatsheet

| Agent | Best For | Avoid |
|-------|----------|-------|
| **Opus 4.7** | Security model design, new product primitives, multi-system tradeoffs | Mechanical implementation, single-file edits |
| **Sonnet 4.6** | Implementation work, well-scoped refactors, UI wiring, bug fixes | Pure architectural design from scratch |
| **GPT-5.5** | Mid-size refactors, test discipline, prompt engineering | UI subtlety, animation/styling details |
| **Gemini 3.1 Pro** | Long-context multi-file refactors, reading-heavy analysis | TypeScript strict-mode edge cases |

When in doubt: **Sonnet is the default workhorse.** Opus only for tagged tasks.

---

## Verification Standards

Every task must pass these before being marked done:

1. `npm run typecheck` clean
2. `npm run build` clean
3. `npm --prefix packages\maestroclaw run build` clean (if MaestroClaw touched)
4. **Browser smoke test** — actually exercise the changed flow in a running browser session. Compile-only is the failure mode of the last 30 days. Do not repeat it.
5. Update `MAESTRO_STATE.md` "What's Working" with verified capability and date.

---

## Phase Ordering & Dependency Graph

```
Phase 1 (Security & Reliability) — Week 1 — START HERE
  SEC-01 → SEC-02 → SEC-04
  SEC-03 (parallel)
  REL-01 (parallel)
  REL-02 (parallel, trivial)
  REL-03 (parallel, trivial)

Phase 2 (Conversational UX) — Week 2
  UX-01 (parallel after Phase 1)
  UX-02 → UX-03
  UX-04 (depends on SEC-01)

Phase 3 (Differentiation) — Week 3
  DIFF-01 (parallel)
  DIFF-02 (parallel)
  DIFF-03 (depends on REL-01)
  DIFF-04 (depends on DIFF-03)

Phase 4 (Product Moment) — Week 4
  PRO-01 (depends on Phase 3)
  PRO-02 (depends on PRO-01)

Tech Debt — runs in parallel throughout
  TD-01, TD-02, TD-03
```

---
---

# PHASE 1 — SECURITY & RELIABILITY

---

## SEC-01 — Shell analyzer: block `&&`, `;`, `||` and remove dead Windows code

**Recommended agent:** Sonnet 4.6
**Complexity:** S
**Priority:** CRITICAL — active command injection vector

### Files Touched
- `packages/maestroclaw/src/lib/kernel/shell-analyzer.ts`

### Current State
The shell analyzer (`analyzeShellCommand()`) only treats `|` (pipe) as a segment separator. `&&`, `;`, and `||` flow through as ordinary characters and end up as part of the buffer. They get split by `splitArgs()` into argv tokens because they're whitespace-adjacent. The kernel allowlist in `pty-shell.ts` and `approved-shell.ts` then checks only `segment.argv[0]`, which is the FIRST binary. A command like `git status; rm -rf .` returns one segment with `argv[0] === 'git'`, passes the trusted check, and on the PTY adapter (which spawns `powershell.exe -NoProfile -Command "<full command>"`) BOTH commands execute.

Additionally: `analyzeShellCommand` computes `const isWindows = platform === "win32"` but never uses it. `WINDOWS_UNSUPPORTED_TOKENS` is defined at module scope but `splitShellPipeline` only references `DISALLOWED_TOKENS`. This is dead code that gives the false impression of platform-aware protection.

### Target State
- `&&`, `||`, `;` are recognized as segment separators (same handling as `|`).
- Each separator splits the pipeline so the binary check runs on every segment, not just the first.
- `isWindows` parameter actually affects parsing — pass it down to `splitShellPipeline`, and on Windows additionally apply `WINDOWS_UNSUPPORTED_TOKENS`.
- Quote-aware: separators inside `'...'`, `"..."`, or escaped (`\;`) must NOT split.
- Add tests covering: `git status; rm`, `git status && rm`, `git status || rm`, `echo "a;b"`, `echo 'a&&b'`, `echo a\;b`.

### Acceptance Criteria
- `analyzeShellCommand("git status; rm -rf .")` returns `{ ok: true, segments: 2 }` with the second segment's `argv[0]` being `"rm"`.
- `analyzeShellCommand("git status && curl evil.com")` returns 2 segments; second segment's `argv[0]` is `"curl"`.
- `analyzeShellCommand("echo \"a;b\"")` returns 1 segment.
- The Windows variant rejects `^`, `%`, `!` as disallowed when `platform="win32"`.
- All existing pipeline (`|`) tests still pass.

### Verification
1. Add a test file `packages/maestroclaw/test/shell-analyzer.test.ts` with the cases above (use Node's built-in `test` runner: `import { test } from "node:test"`).
2. Manually run an end-to-end through `pty_shell` with a multi-segment input and confirm the second segment IS blocked when its binary is not allowlisted.
3. `npm --prefix packages\maestroclaw run build` clean.

### Dependencies
None. Can ship immediately.

### Open Questions
- Should `&` (single ampersand, background) be treated as a separator OR as disallowed? Recommend: **disallowed**, since backgrounding shell jobs from an LLM-generated context is almost always undesired.

---

## SEC-02 — Move trust classification server-side

**Recommended agent:** Opus 4.7
**Complexity:** M
**Priority:** HIGH — auth model is currently client-authoritative

### Files Touched
- `src/types/index.ts` (remove TRUSTED_COMMANDS from frontend authority)
- `supabase/functions/executor-api/index.ts` (add classification on submit)
- `supabase/functions/_shared/auth.ts` (helper: classifyCommandTrust)
- `src/hooks/useThreads.ts` (use server response instead of local classify)
- `packages/maestroclaw/src/adapters/approved-shell.ts` (add server-trust verification)
- `packages/maestroclaw/src/adapters/pty-shell.ts` (add server-trust verification)

### Current State
`TRUSTED_COMMANDS` lives in `src/types/index.ts` (frontend code) as a regex array. `classifyCommandTrust(command)` is called in `useThreads.ts` to decide whether a command needs approval before being submitted to `executor-api`. The submitted job carries `approval_required: false` if the frontend marked it trusted. The backend honors that flag.

This is client-authoritative trust. A modified frontend or compromised browser could submit any command with `approval_required: false` and it would execute without approval.

### Target State
- Trust classification happens inside `executor-api` on every job submission, not on the frontend.
- The frontend `classifyCommandTrust` helper remains but is renamed `predictCommandTrust` and is documented as a UX hint only — never authoritative.
- The MaestroClaw worker re-validates trust against the kernel allowlist before executing. Even if `executor-api` mistakenly marks something trusted, the kernel rejects unknown binaries.
- The trust regex registry moves to `supabase/functions/_shared/trusted-commands.ts` so both `executor-api` and the kernel can reference the same source of truth (in code; the kernel imports a JSON-serialized version at build time).

### Acceptance Criteria
- A direct `executor-api?action=submit` call with `approval_required: false` for an untrusted command returns 400 (or 403) and is rejected at the edge function — does NOT reach the executor.
- The frontend's predictive UI still shows "no approval needed" for trusted commands without round-tripping.
- The kernel allowlist in `pty-shell.ts` rejects any binary not in its set, regardless of the trust flag the job carries.
- Tests: submit a job with manipulated payload via curl/Postman with `approval_required: false` for `rm -rf .` and confirm it's rejected.

### Verification
1. Live live test: use `supabase functions invoke executor-api --body '{"action":"submit", ...}'` to attempt a forged trusted submit. Must reject.
2. Browser smoke test: submit a trusted command (e.g. `git status`) through the chat — confirm it still bypasses approval normally.
3. Update MAESTRO_STATE Non-Obvious Decisions section.

### Dependencies
SEC-01 (kernel must block injection vectors first; otherwise this hardening is incomplete).

### Open Questions
- **Where does the registry live so it can be shared across web/edge/Claw?** Three options:
  - (a) Single source `supabase/functions/_shared/trusted-commands.ts`, copied into Claw at build time via a script.
  - (b) Live fetched from `executor-api?action=trust_registry` at Claw startup, cached.
  - (c) Database table `trusted_commands` with RLS for user customization.
  - **Recommended: (a) for v1, plan migration to (c) for user-customizable allowlists in Phase 4.**
- Do users get to extend the allowlist? **Not in v1. Possibly via approval-then-remember in v2.**

---

## SEC-03 — IP allowlist in `_shared/auth.ts`

**Recommended agent:** Sonnet 4.6
**Complexity:** S
**Priority:** MEDIUM — defense in depth

### Files Touched
- `supabase/functions/_shared/auth.ts`
- New migration: `supabase/migrations/{ts}_add_ip_allowlist.sql`
- `src/types/index.ts` (add `UserSettings.ip_allowlist`)
- `src/components/reveal/TrustDrawer.tsx` (add allowlist editor)
- `src/hooks/useWorkspace.ts` (load user settings)

### Current State
There is no IP allowlist. Auth is purely token-based via Supabase JWT Signing Keys. If a token is leaked, an attacker can impersonate the user from anywhere. The user has explicitly stated they want IP-scoped trust as part of the security model.

### Target State
- Each user has an optional `ip_allowlist: string[]` setting (CIDR notation or single IPs).
- `_shared/auth.ts` reads the user's setting and rejects requests whose `x-forwarded-for` doesn't match. Empty allowlist = no restriction (default).
- A new TrustDrawer section lets the user manage their allowlist with a "current IP" auto-populator.
- The check is fail-open if the table read fails (don't lock the user out due to infra issues), but logs an audit event.

### Acceptance Criteria
- A user with allowlist `["1.2.3.4"]` calling from `5.6.7.8` gets 403.
- A user with empty allowlist calling from anywhere is not blocked.
- The TrustDrawer UI displays current IP and allows add/remove of CIDR ranges.
- IPv6 supported.
- `audit_events` row written on rejection.

### Verification
1. Use curl with spoofed `x-forwarded-for` header against a deployed function.
2. Browser smoke: add own IP, confirm normal use; remove own IP, confirm block.
3. Confirm the audit_events row exists.

### Dependencies
None. Parallel to SEC-01/02.

### Open Questions
- Should the allowlist also gate Claw → `executor-api` calls, or only browser → edge? **Recommend: gate both. Claw token is bound to user, IP rule applies to the user's network.** This means the allowlist needs the user's home/work IPs.
- Cloudflare/proxy `x-forwarded-for` parsing: handle trusted-proxy chain correctly. Use the LAST entry in the header that came from a trusted source.

---

## SEC-04 — Wire IncidentService + fix system event fallback

**Recommended agent:** Sonnet 4.6
**Complexity:** S
**Priority:** MEDIUM

### Files Touched
- `packages/maestroclaw/src/lib/kernel/incident-service.ts`
- `packages/maestroclaw/src/executor.ts` (instantiate, use)
- `packages/maestroclaw/src/api.ts` (add reportIncident if needed)
- `supabase/functions/executor-api/index.ts` (handle `incident` event type)
- New migration: `supabase/migrations/{ts}_executor_incidents.sql` (creates `executor_incidents` table)
- `src/types/index.ts` (add `ExecutorIncident` type)

### Current State
`IncidentService` class exists but is instantiated nowhere. Nothing imports it. The fallback `targetJobId = "system_node_event"` in `reportIncident` would fail at the `executor-api` validation level since that's not a real UUID.

### Target State
- `IncidentService` is instantiated once at executor boot and passed to adapters that need it (the kernel adapters: `approved_shell`, `pty_shell`).
- When the kernel rejects a command (Security Violation, Kernel Violation), it reports an incident.
- A new `executor_incidents` table stores incidents independently of jobs (some incidents have no job context).
- The frontend has a "Security" panel in TrustDrawer showing recent incidents from the user's executors.

### Acceptance Criteria
- A blocked command (e.g. `rm -rf /` submitted somehow past frontend gates) produces an `executor_incidents` row with severity, message, timestamp, executor_id.
- The TrustDrawer Security panel shows the incident.
- No more `"system_node_event"` placeholder in code.

### Verification
1. Manually inject a blocked command via DB row insert (`status='approved', adapter='approved_shell', prompt='ls; rm -rf .'`).
2. Confirm Claw blocks it AND writes an incident.
3. Confirm UI surfaces it.

### Dependencies
SEC-01 (otherwise the kernel doesn't reliably reject).

### Open Questions
- Should incidents trigger an email/push notification? **v1: in-app only. v2: optional email per-user.**
- How long to retain incidents? **Recommend 90 days, then auto-purge.**

---

## REL-01 — GPT OSS phantom agent root cause

**Recommended agent:** Sonnet 4.6 (with Opus review of fix design)
**Complexity:** M
**Priority:** HIGH — active build corruption risk

### Files Touched
Probably some subset of:
- `src/hooks/useBuildExecution.ts`
- `supabase/functions/architect/index.ts`
- `supabase/functions/concierge/index.ts`
- `src/types/index.ts` (`AGENT_DEFAULTS` — verify GPT OSS isn't auto-active for builders)

### Current State
MAESTRO_STATE.md "What's Broken" since 2026-04-19: "GPT OSS phantom agent fires during builds even when not selected as a builder." Unassigned.

The phantom agent likely originates from one of:
- (a) The architect/decompose phase falling back to a default builder list that includes GPT OSS.
- (b) A "last resort" rerouting branch in `useBuildExecution.ts` that picks any active agent.
- (c) `AGENT_DEFAULTS` having GPT OSS marked `is_active: true` and seeping into builder roster derivation.

### Target State
- Identify the root cause via reproduction.
- Eliminate the path. Lock builder roster to `build_spec.builder_ids` ONLY. Reject any code path that derives builders from the broader agent pool during build execution.
- Add a guard: if a build dispatch attempt selects an agent NOT in the locked roster, throw and log audit event.

### Acceptance Criteria
- Reproduction case documented in PR.
- Build with explicit roster `[Sonnet, Codex]` never produces a GPT OSS task.
- Guard test: forcibly inject a non-roster agent ID into dispatch — system rejects with audit event.

### Verification
1. Live build with a 2-agent roster. Inspect `build_tasks.lane_owner` — must be ONLY the 2 selected.
2. `executor_jobs` query: zero jobs with `adapter` matching GPT OSS.

### Dependencies
None. Investigation-first task.

### Open Questions
- Is this a frontend dispatch bug or an `architect` edge function bug? **Find out by adding instrumentation logs first.**

---

## REL-02 — ESLint ignore for MaestroClaw build outputs

**Recommended agent:** Sonnet 4.6
**Complexity:** S
**Priority:** LOW — but unblocks lint for everyone

### Files Touched
- `eslint.config.js` (or `.eslintignore`)

### Current State
`npm run lint` fails repo-wide because ESLint traverses generated files in `packages/maestroclaw/builds/*` and preserved job workspaces. This has been broken since 2026-04-29.

### Target State
- ESLint ignores `packages/maestroclaw/builds/**`, `packages/maestroclaw/dist/**`, `packages/maestroclaw/workspaces/**`, and any generated session output dirs.
- `npm run lint` passes clean.

### Acceptance Criteria
- `npm run lint` exit code 0 with zero violations on a fresh clone.

### Verification
1. `npm run lint` from repo root.

### Dependencies
None. Trivial.

### Open Questions
None.

---

## REL-03 — State doc drift fix (ClawGemini, model IDs)

**Recommended agent:** Sonnet 4.6
**Complexity:** S
**Priority:** LOW

### Files Touched
- `MAESTRO_STATE.md`

### Current State
- State doc says "3 MaestroClaw agents." `AGENT_DEFAULTS` in `src/types/index.ts` defines 4 (ClawClaude, ClawCopilot, ClawCodex, ClawGemini at slot_index 3).
- State doc Agent Roster table doesn't list ClawGemini.
- "Last verified against `src/types/index.ts`: 2026-04-20" — outdated.
- The MaestroClaw row count "3 MaestroClaw agents: local CLI execution, build-only" needs update.

### Target State
- State doc reflects 4 Claw agents.
- Provider table updated.
- Verification date set to 2026-05-03.

### Acceptance Criteria
- `MAESTRO_STATE.md` matches `src/types/index.ts` exactly for agent count, names, and adapter IDs.

### Verification
1. Visual diff of the two files.

### Dependencies
None.

---
---

# PHASE 2 — CONVERSATIONAL UX

---

## UX-01 — Bring orb into ClawMode empty state

**Recommended agent:** Sonnet 4.6
**Complexity:** S
**Priority:** HIGH — visual identity restoration

### Files Touched
- `src/components/reveal/ClawMode.tsx`
- `src/lib/orbState.ts` (verify export)

### Current State
`EmptyStage.tsx` is fully implemented with a 7-state animated golden orb. It's not imported anywhere in `ClawMode.tsx`. The current ClawMode empty state is a generic lucide icon in a circle (the `SurfaceIcon` placeholder).

### Target State
- When `clawView === 'concierge' && messages.length === 0 && !isExecutionThread && !isBuildSessionActive`, render `<EmptyStage orbState={derivedOrbState} />` instead of the icon-in-circle.
- Derive `orbState` from `state` using `src/lib/orbState.ts` (already exists).
- The orb should respond to: idle (default), broadcasting, streaming, conflict, building, concierge (when waiting on concierge), done.
- Keep the existing greeting text below the orb but adjust spacing so the orb is the visual hero.
- Other empty states (execute mode, build mode) keep the existing themed icon — those need different visual signals.

### Acceptance Criteria
- Fresh session shows orb in concierge view.
- During a broadcast, orb pulses with broadcast animation.
- Switching to execute/build mode shows the existing themed icons (NOT the orb).
- Mobile layout: orb scales down or hides if container < 320px wide.

### Verification
1. Browser: open fresh session, observe orb. Run a broadcast, watch orb animate.
2. Switch composer intent to "Execute" — orb should not appear; warn-themed icon does.
3. Mobile resize: orb adapts.

### Dependencies
None.

### Open Questions
- Should the orb appear in carousel/focus views too? **Recommend: no. Orb is the resting state of concierge thread. Carousel has its own visual identity.**

---

## UX-02 — Streaming `executor_job_events` at line cadence

**Recommended agent:** Sonnet 4.6
**Complexity:** M
**Priority:** HIGH — fundamental conversational UX gap

### Files Touched
- `packages/maestroclaw/src/adapters/claude-code.ts`
- `packages/maestroclaw/src/adapters/copilot-cli.ts`
- `packages/maestroclaw/src/adapters/codex-cli.ts`
- `packages/maestroclaw/src/adapters/gemini-cli.ts`
- `packages/maestroclaw/src/adapters/approved-shell.ts`
- `packages/maestroclaw/src/adapters/pty-shell.ts`
- `packages/maestroclaw/src/executor.ts`
- `src/components/reveal/BuildRunwayCard.tsx`
- `src/components/reveal/ClawMode.tsx` (render streamed lines in thread)
- `src/types/index.ts` (extend ThreadMessageMetadata with `streaming: boolean`)

### Current State
Adapters buffer all stdout/stderr until process exit, then write a single `result_summary` and a single completion event. Phase 10 (per state doc) added "snippets" to executor_job_events but they're not at line cadence — they're chunks emitted when the process completes or hits a buffer flush. The frontend renders the latest snippet as a status string. This is not streaming.

### Target State
- Each adapter emits an `executor_job_events` row of type `stdout` or `stderr` for every newline-terminated chunk produced by the spawned process.
- Events are throttled at maximum 10 events/second (batch lines into a single event if the process is producing > 10 lines/sec).
- The frontend subscribes via Realtime and APPENDS lines to a single in-thread message bubble that grows in place, rather than creating a new message per event.
- A "build/execute is running" message gets a `streaming: true` flag in metadata; once the job completes, `streaming: false` and the final result is appended.
- Backpressure: if the frontend can't keep up, latest line wins (drop intermediate). User can expand the message bubble to see the full backlog from the events table.

### Acceptance Criteria
- Run `git log --oneline -20` through pty_shell. Lines appear in the thread as they're produced (visible to the eye, not all at once).
- Run a 30-second build via claude-code adapter. Output streams continuously.
- Network panel shows Realtime push events at line cadence (not summary cadence).
- After completion, the message bubble shows the full output and is no longer marked streaming.

### Verification
1. Browser smoke: run a slow command (`ping -n 5 google.com` on Windows or `for i in 1 2 3 4 5; do echo $i; sleep 1; done` on bash). Observe lines appear one per second.
2. Inspect `executor_job_events` table — must have multiple `stdout` rows for the run, not one.

### Dependencies
None for the adapter refactor. UX-03 (stuck-job detection) benefits from this signal.

### Open Questions
- ANSI color codes: strip on the worker side OR pass through and render on the frontend? **Recommend: pass through, frontend has a small ansi-to-CSS converter.** Keeps the worker simple. Library: `ansi-to-html` or write a 30-line converter.
- Buffer size limit: cap any single event at 64KB to prevent malicious unbounded events. Drop excess and emit a `[truncated]` marker.

---

## UX-03 — Stuck-job detection + "kick this task" UI

**Recommended agent:** Sonnet 4.6
**Complexity:** M
**Priority:** HIGH — eliminates "refresh to fix" failure mode

### Files Touched
- `supabase/functions/executor-api/index.ts` (add stale-claim re-queue logic on poll)
- New migration if needed for indexes
- `src/components/reveal/BuildRunwayCard.tsx` (add per-task action buttons)
- `src/components/reveal/BuildWorkspace.tsx` (same)
- `src/hooks/useBuildExecution.ts` (add `kickTask`, `requeueTask` helpers)

### Current State
Per smoketestaudit.md: "build can appear stuck until refresh." The build_tasks table has tasks that get stuck in `dispatched` or `waiting` indefinitely if the executor crashes mid-job. Existing 90s lease expiry exists for executor jobs but doesn't reliably propagate to build_tasks. There is no UI surface to recover.

### Target State
- A background re-queue: when `executor_jobs` row has `status='claimed' AND lease_expires_at < now()`, set status back to `queued` and emit a `retry` event. This already exists per state doc — verify it's actually firing.
- Build tasks similarly: if `status IN ('dispatched','waiting') AND updated_at < now() - interval '120 seconds'` AND no completion event arrived, mark `status='queued'` and increment `retry_count`.
- UI: in BuildRunwayCard and BuildWorkspace, every task with `status IN ('queued','dispatched','waiting','failed')` gets a "Kick" button (re-queue) and a "Skip" button (mark skipped, continue build). Last-update timestamp visible.
- A "Force review" button to advance the build to review phase even if some tasks are still incomplete (with appropriate warnings).

### Acceptance Criteria
- Kill the local Claw mid-job. Wait 90s. Task reverts to queued. Restart Claw. Task picks up.
- Click "Kick" on a stuck task: it gets re-queued and re-dispatched.
- Click "Skip": task marked skipped, build continues with remaining tasks.

### Verification
1. Live build smoke: start build, kill Claw process, wait, restart Claw, confirm continuation.
2. Manually expire a row's `lease_expires_at` in DB, observe re-queue.

### Dependencies
UX-02 (streaming) helps but isn't required.

### Open Questions
- Should there be a max-retry cap per task (currently `max_retries` is in schema)? **Yes, default 3, but "Kick" overrides the cap (manual user decision).**
- Should "Skip" require a reason? **v1 no, v2 yes for audit.**

---

## UX-04 — Wire `pty_shell` adapter routing

**Recommended agent:** Sonnet 4.6
**Complexity:** S
**Priority:** MEDIUM — enables interactive sessions

### Files Touched
- `src/types/index.ts` (add `requires_pty?: boolean` to ExecutorJob)
- `src/hooks/useThreads.ts` (set `requires_pty: true` for interactive intents)
- `supabase/functions/executor-api/index.ts` (route on `requires_pty` flag)
- `packages/maestroclaw/src/executor.ts` (select adapter based on flag)

### Current State
`pty_shell` adapter is registered in `packages/maestroclaw/src/adapters/index.ts` but no code path selects it. All shell-style jobs default to `approved_shell`. The PTY infrastructure (`@lydell/node-pty`) is installed and ready but unused.

### Target State
- Frontend marks intent as PTY-needing when the user uses keywords like `top`, `htop`, `vim`, `nano`, or explicitly wants a "terminal session." (Frontend hint only.)
- `executor-api` validates the flag and stores it on the job row.
- The Claw, when claiming the job, picks `pty_shell` adapter if `job.requires_pty` and the executor advertises `pty_shell` capability; otherwise falls back to `approved_shell`.
- The frontend renders PTY output in a monospace, ansi-aware bubble (works with UX-02 streaming).

### Acceptance Criteria
- Submitting an intent with "open vim on src/main.tsx" routes through `pty_shell`.
- Submitting `git status` routes through `approved_shell` (no PTY needed).
- An executor that doesn't advertise `pty_shell` doesn't get PTY jobs.

### Verification
1. Submit a `top` command. Confirm PTY adapter handles it. Confirm output streams.
2. Submit `git status`. Confirm approved_shell handles it.

### Dependencies
SEC-01 (kernel must be hardened first).

### Open Questions
- True interactive PTY (user can type INTO the running session) is a much larger feature than emitting PTY output. **v1: PTY emits, no input. v2: bidirectional with stdin support via a new event type.**

---
---

# PHASE 3 — DIFFERENTIATION

---

## DIFF-01 — Cost rollup card after every build

**Recommended agent:** Sonnet 4.6
**Complexity:** M
**Priority:** HIGH — marketing differentiator

### Files Touched
- `src/lib/cost.ts` (extend with rollup helpers)
- New: `src/components/reveal/EventCards/CostRollupCard.tsx`
- `src/components/reveal/EventCards/SystemEventCard.tsx` (dispatch new card)
- `src/types/index.ts` (`ThreadMessageKind` add `'cost_rollup'`)
- `src/hooks/useBuildExecution.ts` (emit cost_rollup event on build complete)

### Current State
`src/lib/cost.ts` has `estimateBroadcastCost` and `formatCostRange` for pre-build estimation. There is no post-build rollup. After a build completes the user sees the bouncer card and PR card but no cost summary.

### Target State
- After a build completes (success OR failure), emit a `cost_rollup` event card in the thread.
- Card shows:
  - Tokens used per builder (from `responses.tokens_used` and similar for build_tasks)
  - Estimated cost per provider based on `cost.ts` rate tables
  - "You paid: $X.XX (via your own keys)"
  - "Bolt.ai equivalent: ~$X.XX" (rough comparison based on tokens × Bolt rate)
  - Local CLI builds counted as $0 with a "via MaestroClaw" badge
- Card is collapsible like other event cards.

### Acceptance Criteria
- A 5-file build produces a card with non-zero numbers for the cloud providers and $0 for any Claw lanes.
- Comparison number is sourced from a configurable rate constant (not hardcoded magic number).
- Card persists via thread_messages.metadata.

### Verification
1. Live build, inspect card. Numbers must be plausible (token counts roughly match `responses` rows × rates).
2. Reload page, card persists.

### Dependencies
None — works on existing data.

### Open Questions
- Should the comparison rate be live-fetched from a config? **v1: hardcoded constant in `cost.ts`. Documented, easy to update.**
- Show cost during build (running total) too? **v2 yes, v1 just the rollup card.**

---

## DIFF-02 — Per-repo memory file for concierge

**Recommended agent:** Sonnet 4.6
**Complexity:** M
**Priority:** HIGH — eliminates cold-start friction

### Files Touched
- New migration: adds `repo_memory` table or extends `repo_connections`
- `supabase/functions/concierge/index.ts` (read on first message, write on session close)
- New edge function: `repo-memory` (CRUD)
- `src/hooks/useThreads.ts` (call repo-memory on session open/close)
- `src/components/reveal/StatusChip.tsx` (show "memory loaded" indicator)

### Current State
Every new session starts the concierge cold. The user re-explains project context. The state doc `MAESTRO_STATE.md` is the closest thing to project memory and is manually maintained. There is no per-user, per-repo memory layer.

### Target State
- Each `(user_id, repo_full_name)` pair has a `repo_memory.content` markdown blob.
- On concierge thread creation for a session bound to a known repo, the concierge edge function reads the memory and prepends it to its system prompt.
- On session "completion" (build merged, or session marked complete by user), the concierge auto-summarizes session events and updates the memory file.
- A user-visible "Memory" tab in TrustDrawer shows current memory content per repo with manual edit support.

### Acceptance Criteria
- First session against repo `foo/bar` has empty memory; concierge behavior unchanged.
- After completing a build in that session, memory contains a summary of decisions made.
- Second session against same repo: concierge references prior decisions in first message.
- User can manually edit memory content.

### Verification
1. Two-session smoke test: complete a build in session 1, start session 2, ask concierge "what did we decide about X?" — expect a coherent answer referencing the prior session.

### Dependencies
None.

### Open Questions
- How much memory to keep? **Cap at ~8KB markdown per repo. Concierge auto-summarizes/compresses on update.**
- Per-repo or per-(user,repo)? **Per-(user,repo). User-private.**
- What triggers an update? **Build completion + bouncer pass + session-archive action. Make it explicit, not on every message.**

---

## DIFF-03 — Lane-scoped prompt slicing

**Recommended agent:** GPT-5.5 (or Sonnet 4.6)
**Complexity:** L
**Priority:** HIGH — biggest build quality / cost improvement available

### Files Touched
- `supabase/functions/architect/index.ts` (per-lane slice generation)
- `supabase/functions/orchestrate/index.ts` (build_task mode injection logic)
- `supabase/functions/concierge/index.ts` (decompose_tasks)
- `src/hooks/useBuildExecution.ts` (dispatch passes scoped slice)
- `src/types/index.ts` (BuildTask gains `prompt_slice` enrichment with structured shared+lane sections)

### Current State
Per `smoketestaudit.md` audit item #1: each builder receives a monolithic prompt containing project summary, global architecture, full file tree, all lanes, all risks, all do-not-touch rules, sometimes stale provider failure text. Builders spend tokens reading irrelevant context before reaching their actual scope. This is the single highest-value architectural fix for build quality and cost.

### Target State
- The `architect` edge function emits a structured plan with:
  - `shared_context: { summary, security_constraints, do_not_touch, build_intent, manifest_rules }`
  - `lanes: [{ agent_id, lane_paths, file_subtree, lane_specific_risks, design_notes }]`
- `concierge.decompose_tasks` and `orchestrate.build_task` mode use only `shared_context + lane_specific` for each builder. Other lanes' details are NOT injected.
- Old failure context is stripped from build payloads — see smoketestaudit.md #2.
- A debug flag `MAESTRO_BUILD_PROMPT_DEBUG=1` emits the actual prompt sent for each task to a dev-only log table for inspection.

### Acceptance Criteria
- Token count of a per-builder prompt drops measurably (target: 50%+ reduction on a standard project).
- A multi-lane build produces files only in each lane's scope (already enforced) AND each builder's prompt does not mention other lanes' file paths.
- Debug log shows clean per-lane prompts.

### Verification
1. Live build comparison: same project, before-and-after. Compare `responses.tokens_used` aggregate.
2. Read a builder's debug-logged prompt. Sanity check: it doesn't include other lanes' lists.

### Dependencies
REL-01 (phantom agent fix prevents test pollution).

### Open Questions
- Is the architect edge function the right place for slicing, or should `orchestrate` slice on the fly? **Recommend: architect emits structured plan, orchestrate consumes it. Single source of truth at architect.**
- What happens to cross-lane handoffs (one lane needs to know what another exposes)? **Lane API contracts: a lane's plan includes `exports` and `imports`, and only those cross-lane references are injected into other builders' prompts.**

---

## DIFF-04 — Provider fallback matrix

**Recommended agent:** Opus 4.7 (design) + Sonnet 4.6 (impl)
**Complexity:** L
**Priority:** HIGH — reliability bottleneck

### Files Touched
- New: `src/lib/providerHealth.ts` (health state machine)
- `supabase/functions/concierge/index.ts` (pre-build health check)
- `src/hooks/useBuildExecution.ts` (mid-build reroute)
- `src/types/index.ts` (`ProviderHealth`, `FallbackChain` types)
- `src/components/reveal/PlanCards/BuilderRosterCard.tsx` (show fallbacks)

### Current State
Per smoketestaudit.md #4: when a builder fails (missing key, outage, overload, timeout, 504), the system has best-effort reroute logic but no structured fallback matrix. There's a `FREE_TIER_FALLBACKS` map for one specific case, but no general policy.

### Target State
- For each lane (builder slot), the build_spec includes:
  - `primary_model: string`
  - `fallback_chain: string[]` (ordered)
  - `emergency_fallback: string` (last-resort)
- Concierge runs a pre-build health probe (HEAD or quick ping per provider) and reorders chains if a primary is degraded.
- During build, if a task fails on the primary, the system advances to the next in chain automatically (within a max-attempt budget).
- The Builder Roster plan card shows the fallback chain visually.

### Acceptance Criteria
- A build with Sonnet primary and Opus fallback: kill Sonnet's API key (simulate outage), build still completes via Opus, with a visible reroute notice.
- Pre-build health check shows red dot on degraded providers.
- The fallback chain logic is in one place (`providerHealth.ts`), not scattered.

### Verification
1. Live test: forcibly invalidate one provider key, run a build, observe reroute.
2. Check audit_events for reroute records.

### Dependencies
DIFF-03 (lane-scoped slicing) — fallbacks need clean per-lane prompts to switch models cleanly.

### Open Questions
- Cost-aware fallback: should switching from a free model to a paid one require user consent? **Recommend: yes if delta > $1/task, no otherwise. User configurable threshold.**

---
---

# PHASE 4 — PRODUCT MOMENT

---

## PRO-01 — Inter-agent deliberation round

**Recommended agent:** Opus 4.7 (design + impl)
**Complexity:** L
**Priority:** HIGH — top product differentiator

### Files Touched
- New edge function: `supabase/functions/deliberate/index.ts`
- `supabase/functions/concierge/index.ts` (orchestrate the round)
- `src/hooks/useOrchestration.ts` (trigger deliberation between rounds)
- `src/types/index.ts` (`DeliberationRound`, `Pushback` types)
- New component: `src/components/reveal/DeliberationCard.tsx`
- `src/components/reveal/FolioCarousel.tsx` (show dissent indicator)

### Current State
Council broadcast = parallel monologues. Synthesis happens directly on responses without inter-agent feedback. Agents never see each other's reasoning, never push back, never agree. The "board of directors" framing is rhetorical, not architectural.

### Target State
- After Round 1 broadcast, before synthesis, an optional "deliberation" round runs:
  1. Each agent receives a redacted-attribution view of others' responses (no agent knows whose response is whose, to prevent name-bias).
  2. Each agent answers: "What would you push back on?" + "Where do you agree?" + "What's the strongest objection to your own position?"
  3. The deliberation round responses are stored as `responses.metadata.deliberation = true`.
- The frontend FolioCarousel shows agreements/disagreements as relationship indicators (e.g., "Sonnet agrees with Opus on architecture, disagrees on tests").
- Synthesis runs AFTER deliberation, with both rounds in context.
- User can opt out (single-round mode) for cost.

### Acceptance Criteria
- A 4-agent broadcast triggers an optional deliberation round.
- The deliberation card shows clear agree/disagree pairs.
- Synthesis quality is measurably better (subjective, but: synthesis explicitly references resolved tensions).

### Verification
1. Live broadcast on a contentious prompt ("Should we use Redux or Zustand?"). Run with deliberation. Compare synthesis with deliberation-off control.

### Dependencies
DIFF-03 (clean prompt structure) helps but isn't required.

### Open Questions
- **Cost — deliberation round = 2x token spend.** Is this opt-in per session or default-on? **Recommend: default off, one-click toggle in composer "Deliberate" pill.**
- Redacted attribution — agents may infer whose response is whose by style. Effective enough? **v1 yes, accept this limitation. v2: rewrite each response in a neutral voice before redacting.**
- Two rounds = much longer wait. Streaming UX (UX-02) becomes essential during deliberation.

---

## PRO-02 — Iteration loop primitive

**Recommended agent:** Opus 4.7
**Complexity:** XL
**Priority:** HIGH — competitive table-stakes against Cursor/Claude Code

### Files Touched
- New: `supabase/functions/iterate/index.ts` (the loop coordinator)
- New: `src/hooks/useIterationLoop.ts`
- New: `src/components/reveal/IterationCard.tsx`
- `packages/maestroclaw/src/adapters/claude-code.ts` (support iteration mode)
- `src/types/index.ts` (`IterationStep`, `IterationLoop` types)
- New table: `iteration_loops`, `iteration_steps`

### Current State
Two execution modes: one-shot execute (`executeFromChat`) and full build (`buildFromChat`). Nothing in between. The most valuable everyday workflow — "look at this file, suggest a fix, apply it, run tests, fix the test failure" — has no primitive. This is what Cursor and Claude Code own.

### Target State
- New thread type: `iteration` (not just execution).
- Loop primitive: `{ goal, files_in_scope, verification_command, max_steps }`.
- Per step:
  1. Agent reads files in scope.
  2. Proposes a diff.
  3. User approves OR auto-applies (if `auto_apply: true` and verification was set).
  4. Diff applied.
  5. Verification command runs (e.g., `npm test`).
  6. If pass → loop ends. If fail → error context fed back to agent for next step.
- Display: a single iteration card that grows with each step. Each step is collapsible. Final state: ✅ pass or ❌ giving up.

### Acceptance Criteria
- "Fix the failing test in `src/foo.test.ts`" → loop runs: agent reads, proposes, applies, tests, iterates until pass or max-steps.
- User can intervene at any step (approve/reject diff, edit goal mid-loop, abort).
- All steps audit-logged.

### Verification
1. Set up a known failing test. Run iteration loop with goal "make this test pass." Observe loop completing or giving up clearly.

### Dependencies
PRO-01 (deliberation) optional. UX-02 (streaming) recommended for live feel.

### Open Questions
- **Significant scope** — this is the biggest single feature in the doc. **Recommend: prototype with one agent (Sonnet via claude_code adapter) before generalizing.**
- Auto-apply vs always-approve: trust model for diffs? **v1: always-approve. v2: auto-apply for diffs touching only test files / non-production paths.**
- Conflict with build mode: when does iteration end and a "real" build start? **Iteration is for tight in-place changes. If the agent proposes new file creation across multiple paths, surface a "this should be a build, not an iteration" suggestion.**

---
---

# TECH DEBT — RUNS IN PARALLEL

---

## TD-01 — Split `useThreads.ts`

**Recommended agent:** Gemini 3.1 Pro (long context refactor)
**Complexity:** M
**Priority:** MEDIUM

### Files Touched
- `src/hooks/useThreads.ts` (1377 lines → split)
- New: `src/hooks/useConcierge.ts`
- New: `src/hooks/useBroadcast.ts`
- New: `src/hooks/useExecutionIntent.ts`
- `src/components/reveal/ClawMode.tsx` (consume new hooks)

### Target State
Each new hook < 500 lines. `useThreads.ts` becomes a thin coordinator (< 300 lines) that re-exports from the specialized hooks. No behavior change.

### Acceptance Criteria
- All callers compile.
- Zero behavioral diff. Smoke-test concierge, broadcast, execute, build all still work.

### Dependencies
None — can run anytime.

---

## TD-02 — Split `useBuildExecution.ts`

**Recommended agent:** Gemini 3.1 Pro
**Complexity:** L
**Priority:** MEDIUM

### Files Touched
- `src/hooks/useBuildExecution.ts` (1521 lines → split)
- New: `src/hooks/useTaskQueue.ts`
- New: `src/hooks/useSessionBuild.ts`
- New: `src/hooks/useBuildGitHub.ts`

### Target State
Each new hook < 600 lines. `useBuildExecution.ts` becomes a coordinator < 400 lines.

### Acceptance Criteria
Same as TD-01: zero behavioral diff, full smoke pass.

### Dependencies
None — but easier AFTER PRO-02 (since iteration uses similar primitives — refactor once).

---

## TD-03 — Live browser smoke tests for the 10 UX phases

**Recommended agent:** Sonnet 4.6 (with human running the browser)
**Complexity:** M
**Priority:** HIGH — eliminates 30-day verification gap

### Files Touched
- New: `smoketests/UX_PHASE_TESTS.md` (manual checklist)
- Optional: Playwright tests for top 5 critical paths

### Target State
A documented, runnable checklist for each UX phase that confirms the runtime behavior matches the spec. Optionally automated via Playwright for the most critical 5 paths (login → broadcast → council card → build runway → bouncer).

### Acceptance Criteria
- Each of phases 0-10 has a checklist of 3-5 verifiable steps.
- The 5 critical paths have Playwright coverage (greens).

### Dependencies
None.

---
---

# REMAINING NON-AUDITED RISKS

These were flagged by the audit but don't have full task specs yet. Future Opus session should design them:

1. **Sandbox sequence** — chroot/jail Phase 1 → Docker Phase 2 → persistent dev container Phase 3. Needs separate spec doc.
2. **Multi-executor capability routing** — when user has Claw on laptop AND desktop, route by `last_seen_at` + capability match. Spec needed.
3. **Bouncer review profiles** — production_app vs training_lab vs ctf vs internal_demo. Smoketestaudit #10. Spec needed.
4. **Live concierge build coordinator** — concierge speaks during build ("2/4 builders done; Gemini overloaded; reroute?"). Smoketestaudit #7. Spec needed.
5. **Continuous Bouncer (observer mode)** — bouncer watches during build, not just after. Spec needed.
6. **Auto-pilot vs manual mode** — let conductor offload routine decisions, surface only strategic ones. Spec needed.

---

# SUMMARY: DO THIS WEEK

If only one phase ships this week, ship Phase 1 (Security & Reliability):

1. SEC-01 (shell analyzer hardening) — **block injection vector**
2. SEC-02 (server-side trust) — **fix client-authoritative trust**
3. REL-01 (phantom agent) — **stop build corruption**
4. REL-02 (lint fix) — **trivial unblock**

These four together close the worst exposed risks. Everything else is feature work.

---

*End of plan. Update `IMPLEMENTATION_PLAN_STATUS.md` as tasks complete.*
