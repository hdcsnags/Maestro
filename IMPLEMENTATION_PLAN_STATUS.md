# IMPLEMENTATION_PLAN_STATUS

Tracks status of tasks defined in `IMPLEMENTATION_PLAN.md`. Append-only log; newest at top.

Format: `YYYY-MM-DD | TASK-ID | AGENT | STATUS | NOTES`

Status values: `claimed` | `in_progress` | `verified` | `partial` | `blocked` | `reverted`

---

## Phase 1 — Security & Reliability

| Task | Agent | Status | Date | Notes |
|------|-------|--------|------|-------|
| SEC-02 | Sonnet 4.6 | verified | 2026-05-09 | HMAC token path: first submit returns {pending_approval, approval_token}; re-submit with token creates approved job. pty_shell gated alongside approved_shell. Falls back to legacy queued-job path when APPROVAL_TOKEN_SECRET unset. Requires APPROVAL_TOKEN_SECRET in Supabase project secrets + redeploy executor-api. |
| SEC-01 | Sonnet 4.6 | verified | 2026-05-03 | shell-analyzer.ts rewritten: &&/||/; are now segment separators, single & is disallowed, isWindows wired through. approved-shell.ts placeholder corruption also fixed. 26/26 tests pass. maestroclaw build clean. |
| SEC-03 | — | not started | — | IP allowlist. Parallel. |
| SEC-04 | Sonnet 4.6 | verified | 2026-05-04 | IncidentService fully wired. executor_incidents table + RLS + Realtime deployed. executor-api report_incident action deployed. approved-shell + pty-shell report kernel/security violations. SecurityPanel + useUnackIncidents in TrustDrawer. StatusChip red dot on unacked criticals. commit 6ec6b95. |
| REL-01 | Sonnet 4.6 | verified | 2026-05-04 | 4-layer defense-in-depth blocks openrouter_a phantom agents. concierge field-name fix. commit c6ed517. |
| REL-02 | Sonnet 4.6 | verified | 2026-05-04 | ESLint ignore for maestroclaw generated dirs. commit 6ec6b95. |
| REL-03 | Sonnet 4.6 | verified | 2026-05-XX | MAESTRO_STATE.md updated: 3→4 Claw agents (ClawGemini added). commit 7d617e5. |

## Phase 2 — Conversational UX

| Task | Agent | Status | Date | Notes |
|------|-------|--------|------|-------|
| UX-01 | Gemini CLI | verified | 2026-05-03 | Implemented BoardroomStage with dynamic Orb component. Superceded basic requirement by integrating the full Atelier visual direction for the empty state. |
| UX-02 | Sonnet 4.6 | verified | 2026-05-XX | LineSplitter + StreamThrottle in maestroclaw. All 6 adapters wired. Realtime subscribe+backfill in useThreads. CommandResultCard live terminal pane. commit 7d617e5. |
| UX-03 | Sonnet 4.6 | verified | 2026-05-XX | kick_job executor-api action. reclaimStaleBuildTasks on poll. kickJob in useThreads. Kick button in CommandResultCard when job stuck >90s. commit d560d81. |
| UX-04 | Sonnet 4.6 | verified | 2026-05-XX | PTY_COMMANDS set + requiresPty() in useThreads. pty_shell adapter routing in 3 tryParseLocalExecutionIntent paths. commit 7d617e5. |

## Phase 3 — Differentiation

| Task | Agent | Status | Date | Notes |
|------|-------|--------|------|-------|
| DIFF-01 | Sonnet 4.6 | verified | 2026-05-XX | sumBuildCost in cost.ts. CostRollupCard.tsx. cost_rollup ThreadMessageKind. useBuildExecution emits on build complete. commit d560d81. |
| DIFF-02 | — | not started | — | Per-repo memory. |
| DIFF-03 | — | not started | — | Lane-scoped prompt slicing. Depends on REL-01. |
| DIFF-04 | — | spec ready | 2026-05-03 | See `DIFF-04_PROVIDER_FALLBACK_SPEC.md`. Provider fallback matrix. Depends on DIFF-03. |

## Phase 4 — Product Moment

| Task | Agent | Status | Date | Notes |
|------|-------|--------|------|-------|
| PRO-01 | — | not started | — | Inter-agent deliberation round. |
| PRO-02 | — | not started | — | Iteration loop primitive. |

## Tech Debt

| Task | Agent | Status | Date | Notes |
|------|-------|--------|------|-------|
| TD-01 | — | not started | — | Split useThreads.ts. |
| TD-02 | — | not started | — | Split useBuildExecution.ts. |
| TD-03 | — | not started | — | Browser smoke tests. |

---

## Append Log

(newest entries first)

- 2026-05-04 | BOUNCER-02 | Opus 4.7 | spec ready | New spec at `BOUNCER_OBSERVER_MODE_SPEC.md`. Continuous Bouncer (smoketest #5). Three modes (passive/observer/gatekeeper). Batched mid-build review (3 files OR 60s OR high-risk-path trigger). New `bouncer_findings` table with finding-lifecycle tracking. Lighter mid-build prompt (Sonnet, ~$0.50 budget cap per build). Reuses BOUNCER-01 reclassification matrix. Integrates with LIVE-01 coordinator for narration. Gatekeeper soft-pause: in-flight tasks complete; only new dispatches blocked. 12-step impl. Opus reviews steps 3 (prompt) + 4 (trigger logic) before ship.
- 2026-05-04 | DEPLOY_RUNBOOK | Opus 4.7 | created | New `DEPLOY_RUNBOOK.md` — living deployment doc. Per-spec runbooks for SEC-02, DIFF-04, LIVE-01, BOUNCER-01 (when each ships). Pre-deploy + post-deploy checklists. Rollback procedures. Multi-spec compounding deploy guidance. Useful one-liners.
- 2026-05-03 | UX-01 | Gemini CLI | verified | Completed the requirement to bring the orb into ClawMode empty states by building the `BoardroomStage` component. Exceeded the basic scope by integrating the full "Atelier" high-fidelity visual direction.
- 2026-05-03 | LIVE-01 | Opus 4.7 | spec ready | New spec at `LIVE_CONCIERGE_COORDINATOR_SPEC.md`. Promoted from "Remaining Non-Audited Risks" — addresses smoketestaudit #7 (concierge as live build coordinator). Event-driven edge function fires on build state changes, calls Haiku with state + trigger context, decides should_speak/tone/suggested_action via JSON contract. 16 trigger types, rate-limited (30s except action_required), per-build $0.10 budget cap. Integrates with DIFF-04 reroute approval flow. ConciergeLiveCard renders inline in BuildRunwayCard with tone-based styling. 12-step impl. Opus reviews step 3 (prompt template) before merge.
- 2026-05-03 | BOUNCER-01 | Opus 4.7 | spec ready | Spec at `BOUNCER_PROFILES_SPEC.md`. Four review profiles, 16-category × 4-profile reclassification matrix, containment-critical hard floor, path-based pedagogical markers via `bouncer.config.json`, acknowledgment modal, concierge prompt-classifier suggestion. 11-step impl. Opus reviews step 3 (matrix table) before ship.
- 2026-05-09 | SEC-02 | Sonnet 4.6 | verified | HMAC approval token flow implemented end-to-end. New files: `_shared/trusted-commands.ts`, `_shared/approval-tokens.ts`, `src/lib/trustHints.ts`. `executor-api` submit handler: first shell submit returns `{pending_approval, approval_token}` (no DB row); re-submit with token validates HMAC and creates approved job. `pty_shell` now gated alongside `approved_shell`. Legacy queued-job path retained for fallback when `APPROVAL_TOKEN_SECRET` not set. Frontend: `pendingExecution` state supports both `approvalToken` (new) and `jobId` (legacy). `approveWithToken()` added to `useThreads`. `ExecutionApprovalCard` handles both paths. `TRUSTED_COMMANDS`/`classifyCommandTrust`/`EXECUTION_INTENT_PROMPT` moved to `src/lib/trustHints.ts` (Layer 1 UX hints only). Build passes. **Still needs: `supabase functions deploy executor-api` + set `APPROVAL_TOKEN_SECRET` in project secrets.**
- 2026-05-03 | AGENTS_ONBOARDING | Opus 4.7 | created | New `AGENTS_ONBOARDING.md` — the doc every new agent (Sonnet, Gemini, future Opus) reads first when picking up work. Covers reading order, task pickup flow, verification standards, status update format, when to stop and ask, agent-specific notes. Should solve "Sonnet was confused" issues going forward.
- 2026-05-03 | DIFF-04 | Opus 4.7 | spec ready | Full architectural spec at `DIFF-04_PROVIDER_FALLBACK_SPEC.md`. Two-layer provider health model (in-memory + DB), 5-state state machine, pre-build probe via new edge function, per-lane fallback chains via canonical lookup, mid-build reroute with cost-aware approval gate (default $1 threshold), failure classification table, BuilderRosterCard health UI, TrustDrawer Health panel. 10-step impl order. Sonnet can implement; Opus should review failure classification table before ship.
- 2026-05-03 | SEC-04 | Opus 4.7 | spec ready | Full implementation spec at `SEC-04_INCIDENT_SERVICE_SPEC.md`. Replaces stub IncidentService with dedicated `report_incident` endpoint and first-class `executor_incidents` table (NOT piggybacking on executor_job_events). 6 incident categories, 4 severities, RLS-scoped, Realtime-pushed, ack flow. TrustDrawer Security tab with severity filter and metadata expand. StatusChip red dot for unacked criticals. Network-failure-resilient (kernel never crashes on report failure). Sonnet implementable end-to-end.
- 2026-05-03 | PRO-02 | Opus 4.7 | spec ready | Full architectural spec at `PRO-02_ITERATION_LOOP_SPEC.md`. Largest spec in the plan. 4-table data model, per-step state machine, diff-application via git apply with per-step checkpoints, kernel-integrated verification, file-level locks, server-authoritative trust integration with auto-apply pause-on-sensitive, 10-step impl order. Steps 5 (prompt template) and 6 (diff application) require Opus review. Sonnet/Gemini can do everything else.
- 2026-05-03 | PRO-01 | Opus 4.7 | spec ready | Full architectural spec at `PRO-01_DELIBERATION_ROUND_SPEC.md`. Prompt design, redaction algorithm, synthesis reformulation, three trigger modes, data model migration, 10-step impl order. Tagged Opus-only for prompt + synthesis work; Sonnet can do migration/UI/wiring.
- 2026-05-03 | SEC-02 | Opus 4.7 | spec ready | Full implementation spec authored at `SEC-02_TRUST_MODEL_SPEC.md`. All open questions from master plan resolved. Ready for Sonnet to implement after `SEC-01` ships.
- 2026-05-03 | PLAN | Opus 4.7 | created | Initial implementation plan written to `IMPLEMENTATION_PLAN.md`. State doc updated with two newly-flagged security blockers.
- 2026-05-03 | SEC-01 | Sonnet 4.6 | verified | Rewrote splitShellPipeline: &&/||/; recognized as segment separators (quote/escape aware), single & always rejected, isWindows now actually used. Dead emptySegment var removed. approved-shell.ts pre-existing placeholder fixed. 26/26 node:test tests pass. maestroclaw build clean.

