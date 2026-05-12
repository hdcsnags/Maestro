# LIVE-01 — Concierge Live Build Coordinator Spec

**Status:** Ready for review
**Authored:** 2026-05-03 by Opus 4.7
**Implementing agent:** Opus 4.7 (prompt + architecture) + Sonnet 4.6 (implementation)
**Parent plan:** Promoted from "Remaining Non-Audited Risks" to a real spec. Addresses smoketestaudit.md item #7 ("Concierge should become a live build coordinator").
**Dependencies:** `DIFF-04` (provider health & fallback chains — the coordinator narrates and triggers reroutes through DIFF-04's matrix). Soft dependency on `PRO-01` for v1.1 integration.

---

## Why This Exists

The Council currently goes silent during build. Concierge guides pre-build (plan, lanes, spec lock), but once "Start Build" is clicked, the user sees raw progress UI — task counters, dispatching states, occasional 504 — and nothing else. Concierge re-engages post-build for synthesis. **In between, the user is alone with a progress bar.**

This is a product-feel gap. The user pitched the project as a "board of directors with a Human at the helm" — but a board that adjourns the moment work starts is just a planning meeting, not a live coordination body.

### What this spec changes

The concierge becomes **continuously present during build.** It speaks at the right moments:
- Narrates significant state changes ("2 of 8 done; Sonnet just finished `auth.ts`")
- Surfaces decisions that need human attention ("Gemini overloaded — reroute to Pro at +$0.40, or use the free fallback?")
- Calmly reports recoveries that don't need attention ("Sonnet 504'd; rerouted to Opus, continuing")
- Reads the room — knows when to be quiet (every task succeeding) and when to step in (multi-lane failure)

The user goes from watching a progress bar to **collaborating with a coordinator.**

---

## The Product Feel — Examples

### Quiet, healthy build (most common)
```
[Concierge] Build started. 8 files across 3 lanes.
[Concierge] 4 of 8 done — Sonnet finished its lane.
[Concierge] Build complete. Bouncer reviewing.
```
Three messages over a 90-second build. Doesn't pollute the thread.

### Recoverable failure
```
[Concierge] Build started. 8 files across 3 lanes.
[Concierge] Gemini hit a rate limit on `landing.tsx`. Rerouting to GPT-5.4.
[Concierge] Reroute landed. 5 of 8 done. Continuing.
```
Calm. Specific. Doesn't alarm.

### Decision required
```
[Concierge] Build started.
[Concierge] Sonnet hit a 504 on `data.ts`. Best fallback is Opus, +$0.45 vs primary — above your auto-approve threshold.
[ Approve Opus ]  [ Use free fallback ]  [ Skip this file ]
```
Surfaces the cost trade-off. User decides in one click.

### Cascading failure
```
[Concierge] Build started.
[Concierge] Two lanes failed — Sonnet timeout on `data.ts`, Gemini 5xx on `landing.tsx`.
[Concierge] I'm pausing. With 2 of 3 lanes degraded, continuing risks a partial build with stale work. Recommend: review the design (one lane completed cleanly), or restart with fewer agents.
[ Pause + review ]  [ Force-continue ]  [ Abort and restart ]
```
The coordinator stops the bleed. Strategic intervention.

---

## Architecture

The coordinator is **event-driven, NOT long-running.** Each invocation is a stateless edge function call triggered by build state changes.

```
build_tasks state change ──▶ trigger evaluator ──▶ should we speak?
executor_jobs state change ──▶                       │
                                                      ▼
                                      ┌────────────────────────────┐
                                      │ build-coordinator           │
                                      │ edge function (NEW)         │
                                      │                             │
                                      │ Reads current state          │
                                      │ Calls Haiku with state +     │
                                      │   trigger context            │
                                      │ Decides: speak or stay quiet │
                                      │ Writes thread_message with   │
                                      │   kind='concierge_live'      │
                                      │ Optionally creates control   │
                                      │   row (reroute, abort, etc.) │
                                      └────────────────────────────┘
                                                      │
                                                      ▼
                                  Frontend Realtime renders the message
```

### Why edge function, not Claw or frontend
- **Not Claw:** the coordinator narrates ALL agents (cloud + local). It needs visibility across the whole build, not just one executor's view.
- **Not frontend:** browser may be backgrounded, closed, or refreshed. Coordination must happen even if the user isn't watching.
- **Edge function:** stateless, scoped to one trigger event, ~5s typical execution. Within Supabase Edge timeout. Can call Haiku directly via existing `orchestrate` infrastructure.

### Why event-driven, not heartbeat-only
A pure timer ticker would call the LLM every N seconds even when nothing is happening — wasteful. Pure event-driven misses the "build has been quiet too long" case. **Solution: event-driven primary + heartbeat as a special trigger type.** A scheduled trigger fires every 60s during active build to check "should we say something just to keep the user oriented?"

---

## Trigger Catalog

Hardcoded list of state changes that POTENTIALLY warrant a coordinator update. The LLM has final say on whether to actually speak.

| Trigger | Source | Example |
|---------|--------|---------|
| `build.started` | Build phase transitioned to `build` | Initial intro message |
| `task.succeeded` | `build_tasks.status: completed` | Generally silent unless milestone |
| `task.failed.recoverable` | Task failed, fallback chain has options | Narrate the reroute |
| `task.failed.terminal` | Task failed, fallback chain exhausted | Surface for user decision |
| `task.slow` | Task running > 60s with no events | "X is taking longer than usual" |
| `reroute.cost_escalation` | DIFF-04 reroute hit cost threshold | Approval card |
| `lane.completed` | All tasks for a lane done | Lane-completion narration |
| `lane.degraded` | 50%+ of a lane's tasks failed | Strategic warning |
| `milestone.50pct` | Half of total tasks done | Mid-build progress |
| `milestone.80pct` | 80% done | Late-build update |
| `build.completed` | All tasks terminal | Hand-off to bouncer narration |
| `bouncer.started` | Bouncer review began | "Bouncer reviewing now" |
| `bouncer.completed` | Bouncer review done | Surface findings count |
| `provider.degraded` | DIFF-04 marked a provider degraded | Health context |
| `provider.down` | DIFF-04 marked a provider down | Strategic warning |
| `heartbeat.idle` | 60s passed with no other trigger AND build still active | Reassurance ("still working") |

### Rate limit
Maximum 1 coordinator message per 30 seconds, **except** for `action_required` tone (cost escalation, terminal failures, lane degradation) — those bypass the limit.

The rate limiter checks: "Has a coordinator message been written to this build's thread in the last 30s?" — if yes and the new trigger is not `action_required`, skip the LLM call entirely (cost-saving).

---

## The Coordinator Prompt

```
You are Maestro's live build coordinator. A build is in progress and you're
deciding whether to send the user a status update.

YOUR VOICE:
- Calm. Specific. Action-oriented.
- 1-3 sentences. Never more.
- Use real numbers ("4 of 8 done") not vague phrases ("making progress").
- Never alarm the user about a problem that was already auto-recovered.
- Stay quiet when nothing meaningful changed.

CURRENT BUILD STATE:
Build ID: {build_id}
Phase: {current_phase}
Started: {started_at} ({elapsed_seconds}s ago)

TASKS:
- Total: {total_count}
- Done: {done_count}
- Failed (recoverable): {failed_recoverable}
- Failed (terminal): {failed_terminal}
- In progress: {in_progress}
- Waiting: {waiting}

LANES:
{for each lane:}
  - {lane_name}: {lane_done}/{lane_total} done, primary={primary_model}, current={active_model}

PROVIDER HEALTH (from DIFF-04):
{health_summary_per_provider}

RECENT EVENTS (last 60 seconds, oldest first):
{event_log}

WHAT YOU SAID LAST (truncated to last 3 messages, if any):
{prior_messages}

THE TRIGGER THAT WOKE YOU:
type: {trigger_type}
context: {trigger_context}

YOUR DECISION:
Output JSON:
{
  "should_speak": true | false,
  "tone": "info" | "warning" | "action_required" | "celebration",
  "message": "1-3 sentences. The actual user-facing copy.",
  "suggested_action": null | {
    "kind": "reroute_approval" | "abort_offer" | "skip_lane_offer" | "force_continue_offer",
    "params": { ... action-specific }
  },
  "rationale": "1 sentence: why you chose to speak (or stay silent). For audit only — not shown to user."
}

GUIDELINES:
1. should_speak=false when the trigger is routine (single task succeeded, single small reroute) AND you said something within the last 30s.
2. should_speak=true when:
   - The build just started or just ended.
   - A milestone was hit (50%, 80%, 100%).
   - A failure requires user input (cost escalation, terminal failure, lane degradation).
   - It's been 60s+ since you last spoke and the user might be wondering if anything is happening.
3. tone="action_required" ONLY when you set suggested_action. Otherwise prefer "info" or "warning".
4. NEVER repeat the exact same message you said before. Reword.
5. NEVER alarm about a fully-auto-recovered failure. Mention it briefly if asked, otherwise skip.
6. NEVER speculate about WHY a model failed unless DIFF-04's health data tells you. "Sonnet 504'd" not "Sonnet seems overloaded today."
```

### Why JSON output
- `should_speak: false` short-circuits — don't write a thread message, don't waste UI surface area.
- `tone` drives UI styling (warning gets amber, action_required gets red).
- `suggested_action` becomes the embedded action card — if present, frontend renders it.

### Model choice
**Always Haiku 4.5.** Build coordination is high-frequency (10-30 calls per build) and latency-sensitive. Haiku is cheap (~$0.001/call) and fast (~1-2s). Opus or Sonnet would be overkill and slow.

Hard cap: **$0.10 max coordinator cost per build.** If exceeded, coordinator silently disables for the rest of the build. Build proceeds normally; user just sees raw progress UI.

---

## Data Model

### `thread_messages.metadata.kind` — new value

Add `'concierge_live'` to the `ThreadMessageKind` union:

```ts
export type ThreadMessageKind =
  | 'concierge_decision'
  | 'concierge_triage'
  | 'concierge_live'         // NEW
  | 'plan_card'
  | 'execution_approval'
  | 'execution_intent'
  | 'execution_status'
  | 'build_status'
  | 'pr_opened'
  | 'file_manifest'
  | 'error_retry'
  | 'info';
```

### `ThreadMessageMetadata` extension

```ts
export interface ConciergeLiveEvent {
  build_id: string;
  trigger_type: CoordinatorTriggerType;
  tone: 'info' | 'warning' | 'action_required' | 'celebration';
  task_progress?: { done: number; total: number };
  suggested_action?: ConciergeSuggestedAction;
  rationale?: string;          // for audit
}

export type CoordinatorTriggerType =
  | 'build.started' | 'build.completed'
  | 'task.succeeded' | 'task.failed.recoverable' | 'task.failed.terminal' | 'task.slow'
  | 'lane.completed' | 'lane.degraded'
  | 'milestone.50pct' | 'milestone.80pct'
  | 'reroute.cost_escalation'
  | 'bouncer.started' | 'bouncer.completed'
  | 'provider.degraded' | 'provider.down'
  | 'heartbeat.idle';

export type ConciergeSuggestedAction =
  | { kind: 'reroute_approval'; params: { task_id: string; from_model: string; to_model: string; cost_delta: number } }
  | { kind: 'abort_offer'; params: { reason: string } }
  | { kind: 'skip_lane_offer'; params: { lane_name: string } }
  | { kind: 'force_continue_offer'; params: { warnings: string[] } };

export interface ThreadMessageMetadata extends Record<string, unknown> {
  // ... existing fields ...
  kind?: ThreadMessageKind;
  concierge_live?: ConciergeLiveEvent;       // NEW
}
```

### `coordinator_invocations` table (audit trail)

Track every coordinator call for telemetry and tuning. Optional but recommended.

```sql
CREATE TABLE coordinator_invocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  session_id uuid REFERENCES sessions(id),
  build_id text,                           -- string (round_id or session_id+phase)
  trigger_type text NOT NULL,
  trigger_context jsonb DEFAULT '{}'::jsonb,
  llm_input_tokens int,
  llm_output_tokens int,
  llm_cost_usd numeric(10,6),
  decision_should_speak boolean NOT NULL,
  decision_tone text,
  decision_message text,
  decision_action jsonb,
  rationale text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_coord_inv_session ON coordinator_invocations(session_id, created_at DESC);
CREATE INDEX idx_coord_inv_user_recent ON coordinator_invocations(user_id, created_at DESC);

ALTER TABLE coordinator_invocations ENABLE ROW LEVEL SECURITY;
CREATE POLICY coord_inv_owner ON coordinator_invocations
  FOR ALL USING (user_id = auth.uid());
```

### `sessions` extension

```sql
ALTER TABLE sessions ADD COLUMN coordinator_enabled boolean DEFAULT true;
ALTER TABLE sessions ADD COLUMN coordinator_budget_usd numeric(6,4) DEFAULT 0.10;
ALTER TABLE sessions ADD COLUMN coordinator_spent_usd numeric(10,6) DEFAULT 0;
```

The user can disable the coordinator entirely (TrustDrawer setting) or set a different per-build budget.

---

## File-Level Changes

### New
- `supabase/functions/build-coordinator/index.ts` — the edge function. Single action: `?action=evaluate&build_id=...&trigger_type=...&trigger_context=...`.
- `supabase/functions/_shared/coordinator-prompt.ts` — prompt template + state-summary builders.
- `supabase/functions/_shared/coordinator-rate-limit.ts` — checks last coordinator message timestamp.
- `src/hooks/useCoordinator.ts` — frontend hook that watches build state for triggers and POSTs them to the edge function. Lives in browser; if browser is closed, the build_tasks Realtime subscription on the edge function (via DB triggers) takes over.
- `src/components/reveal/EventCards/ConciergeLiveCard.tsx` — the inline card for `kind='concierge_live'` messages.
- New migration `{ts}_coordinator.sql` — coordinator_invocations table + sessions columns.

### Modified
- `src/types/index.ts` — types listed above.
- `src/hooks/useBuildExecution.ts` — emit triggers for task state changes (succeeded/failed/slow/etc.). Heartbeat timer for `heartbeat.idle`. Increment `coordinator_spent_usd` after each invocation.
- `src/components/reveal/BuildRunwayCard.tsx` — render `ConciergeLiveCard` inline. Show coordinator presence indicator (orb mini-pulse) when active.
- `src/components/reveal/EventCards/SystemEventCard.tsx` — dispatch new `concierge_live` kind to ConciergeLiveCard.
- `src/components/reveal/TrustDrawer.tsx` — add Coordinator settings (enable/disable, budget).
- `supabase/functions/concierge/index.ts` — when proceeding to build phase, emit `build.started` trigger (calls build-coordinator).
- `supabase/functions/bouncer/index.ts` — emit `bouncer.started` and `bouncer.completed` triggers.
- `MAESTRO_STATE.md` — Stable Architecture section adds build-coordinator function and coordinator_invocations table.

### DB triggers (optional, for browser-closed scenario)
```sql
CREATE OR REPLACE FUNCTION notify_coordinator_task_change()
RETURNS trigger AS $$
BEGIN
  IF (NEW.status = 'completed' AND OLD.status != 'completed')
     OR (NEW.status = 'failed' AND OLD.status != 'failed') THEN
    -- Notify a worker process (or just record; coordinator can poll)
    INSERT INTO coordinator_pending_triggers (build_id, trigger_type, trigger_context)
    VALUES (NEW.session_id::text, 'task.' || NEW.status, row_to_json(NEW)::jsonb);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_coordinator_task_change
AFTER UPDATE ON build_tasks
FOR EACH ROW EXECUTE FUNCTION notify_coordinator_task_change();
```

A scheduled edge function (or executor-api in the build-coordinator handler) drains `coordinator_pending_triggers` and processes each. This means the coordinator works even if the user closes the browser.

For v1: skip the DB trigger path. Use frontend-only triggering. v1.1 adds the server-side queue for browser-closed scenarios.

---

## UI Surfaces

### `ConciergeLiveCard` rendering

```
┌─ [Concierge orb pulse] ─────────────────────────────────┐
│ ☉ Concierge · 0:34                                       │
│ Gemini hit a rate limit on `landing.tsx`. Rerouting     │
│ to GPT-5.4. Continuing.                                  │
└──────────────────────────────────────────────────────────┘
```

When `tone === 'action_required'`:
```
┌─ [Concierge orb pulse, amber] ───────────────────────────┐
│ ⚠ Concierge · 1:12                                       │
│ Sonnet hit a 504 on `data.ts`. Best fallback is Opus,    │
│ +$0.45 vs primary — above your $0.20 auto-approve.       │
│                                                           │
│ [ Approve Opus ]  [ Use free fallback ]  [ Skip ]        │
└──────────────────────────────────────────────────────────┘
```

When `tone === 'warning'` (lane degradation):
```
┌─ [Concierge orb pulse, amber] ───────────────────────────┐
│ ⚠ Concierge · 2:41                                       │
│ Two lanes failed. With 2 of 3 lanes degraded, continuing │
│ risks a partial build with stale work.                   │
│                                                           │
│ [ Pause + review ]  [ Force-continue ]  [ Abort ]        │
└──────────────────────────────────────────────────────────┘
```

### Coordinator presence indicator

Inside BuildRunwayCard's progress section, a small orb mini-pulse appears when coordinator is active. It pulses subtly during build to show "concierge is watching." Goes idle when build ends.

When budget exhausted:
```
[ Concierge ] (paused — coordinator budget reached)
```
Soft message; doesn't intrude.

### TrustDrawer Coordinator settings

```
COORDINATOR
─────────────────────────────────────────
[ ✓ ] Live build coordinator
       Concierge speaks during builds with status
       updates and decision prompts.

Budget per build:  [$0.10 ▾]
       Hard cap on coordinator cost. Build proceeds
       normally if budget hit; coordinator just goes
       silent. Recent average: $0.04 / build.
```

---

## Cost Management

Two layers:

### Layer 1 — Per-build hard cap
`sessions.coordinator_budget_usd` (default $0.10). Tracked in `sessions.coordinator_spent_usd`. After each LLM call, increment spent. Before each LLM call, check spent < budget. If exceeded, skip.

This means: **a runaway coordinator (lots of triggers, e.g., a chaotic build) gets capped automatically.** Cost predictable.

### Layer 2 — Rate limiting
Max 1 coordinator message per 30s except action_required. This prevents trigger storms (e.g., 8 task failures in 5s) from generating 8 messages.

### Empirical expectations
- Quiet build (8 tasks, all green): ~3-4 invocations × $0.001 = ~$0.004
- Failing build (2 reroutes, 1 cost escalation): ~6-8 invocations × $0.001 = ~$0.008
- Chaotic build (lots of failures): ~12-15 invocations × $0.001 = ~$0.015

The $0.10 cap should be triggered only by adversarial scenarios. Tune later based on real telemetry.

---

## Integration Points

### DIFF-04 (provider fallback)
- DIFF-04's reroute logic emits `task.failed.recoverable` (auto-rerouted) or `reroute.cost_escalation` (needs approval) triggers.
- Concierge's `suggested_action` of kind `reroute_approval` is the same data structure DIFF-04's existing `RerouteApprovalCard` consumes — so the two surfaces share the action handler.
- DIFF-04's provider state changes emit `provider.degraded` and `provider.down` triggers, giving concierge real-time health context for narration.

### PRO-01 (deliberation rounds)
- Out of scope for LIVE-01 v1.
- v1.1 idea: when a contentious mid-build decision arises, concierge could trigger a mini-deliberation between agents and narrate the result. Defer.

### Bouncer
- `bouncer.started` triggers a "Bouncer reviewing now" message.
- `bouncer.completed` triggers a brief findings summary ("3 minor findings, no critical").
- Full bouncer findings still render via the existing BouncerCard.

### PRO-02 (iteration loops)
- LIVE-01 is build-focused. Iteration loops have their own per-step UI in IterationCard.
- v1.1 idea: extend the coordinator to narrate iteration step transitions ("Step 3 verification failed; agent is trying again"). Defer.

---

## Acceptance Criteria

1. **Quiet build narration.** Run an 8-task build that all succeed cleanly. Concierge produces 3-5 coordinator messages: started, milestone(s), completed. No noise per individual task success.
2. **Recoverable failure narration.** Force a Sonnet 504 on one task. Concierge writes a "rerouting" message AND a follow-up "reroute landed" message. No alarm.
3. **Cost-escalation prompt.** Force a reroute with cost delta above threshold. Concierge writes an `action_required` card with three buttons. Click Approve → reroute proceeds.
4. **Lane degradation warning.** Force 50% of a lane's tasks to fail. Concierge surfaces `action_required` with abort/force-continue/restart options.
5. **Heartbeat fires when quiet.** Run a build with one slow task (60s no events). Concierge produces a "still working, X is taking longer" message at the 60s mark.
6. **Rate limit respected.** Trigger 5 task-success events in 5 seconds. Concierge produces ≤1 message (rate limit kicks in for routine triggers).
7. **Action_required bypasses rate limit.** Trigger a normal milestone, then 2s later a cost-escalation. The cost-escalation message DOES appear (rate limit does not block it).
8. **Budget cap.** Set budget to $0.005 (very low). Run a long build. Coordinator goes silent after a few invocations. Build proceeds normally; UI shows "(coordinator paused — budget reached)" once.
9. **User disable.** Toggle off coordinator in TrustDrawer. New build runs with no coordinator messages at all. `coordinator_invocations` rows still NOT created (no LLM calls made).
10. **Audit trail.** Every coordinator invocation produces a `coordinator_invocations` row with input tokens, output tokens, cost, decision, and message.
11. **Tone-based styling.** `info` messages render in default style; `warning` in amber; `action_required` in amber + with action buttons; `celebration` in green (used on `build.completed` clean).
12. **Suggested actions wire through.** Click "Approve" on a reroute_approval card → the existing RerouteApprovalCard handler executes. No duplicate reroute logic.

---

## Verification (Live Tests)

1. **Happy path:** real 8-task build with all-passing agents. Confirm 3-5 messages over the build duration, no per-task spam.
2. **Force a 504:** intercept a Sonnet call with a 503. Confirm "rerouting" + "reroute landed" message pair.
3. **Force cost escalation:** lower threshold to $0.05; force a reroute with >$0.05 delta. Confirm card with buttons appears, build pauses on that task, click Approve, build resumes.
4. **Force lane degradation:** kill a lane (force 2/3 tasks in lane to fail). Confirm `action_required` warning with abort/force/restart options.
5. **Force budget cap:** set per-session budget to $0.005. Run a chaotic build. Confirm coordinator silences mid-build with "(paused — budget reached)" once. Build still completes normally.
6. **Disable coordinator:** toggle off. Run a build. Confirm zero coordinator messages, zero invocations, zero spend.
7. **Refresh resilience (v1 limitation acceptable):** mid-build, refresh the browser. Confirm the build continues but coordinator misses some events (because v1 is frontend-triggered). Document that v1.1 will fix via DB triggers.

---

## Decisions Made

### Q: Why edge function, not always-on worker?
**A:** Stateless event-driven scales naturally — no long-running process to manage, no leader-election problem with multiple browser tabs, fits Supabase's edge function model. Trade-off: when the browser is closed, the trigger source disappears (mitigated in v1.1 with DB triggers + scheduled drain).

### Q: Why Haiku and not Sonnet for coordination?
**A:** Frequency × latency × cost. Coordinator runs 10-30 times per build. Sonnet would be 10-15× more expensive AND ~3-5× slower per call. Haiku is 1-2 sec response, ~$0.001/call. The coordinator's role is summarization and decision-presence, not deep reasoning — Haiku's strength.

### Q: Why hardcoded triggers + LLM-decides framing, not pure LLM-decides?
**A:** Pure LLM ("should I speak about anything happening right now?") would call the LLM constantly to evaluate. Hardcoded triggers narrow the call surface to "something concrete happened." LLM then makes the framing/decision-to-speak call. Hybrid keeps cost predictable.

### Q: Why JSON output (`should_speak: false` short-circuit)?
**A:** Forces the LLM to make an explicit "no, this isn't worth speaking" decision instead of producing some weak default message. Empty messages = visible empty bubbles in UI. Hard "false" = clean skip.

### Q: Why a per-build budget vs per-session?
**A:** Sessions can run multiple builds. A user running 5 builds in a session shouldn't have the coordinator silenced halfway through build 4 because of cumulative spend. Per-build resets, which is the natural cadence.

### Q: Why coordinator_invocations as separate table?
**A:** Auditability and tuning. Future analysis: "did coordinator's message correlate with user actions? did builds with coordinator silenced have worse outcomes?" These questions need raw invocation data, not just rendered thread messages.

### Q: Voice — first-person ("I'm pausing") or third-person ("Coordinator paused")?
**A:** First-person. The Council is a board of directors with personalities. Concierge has a voice. Third-person breaks the metaphor. The prompt explicitly biases toward first-person calm voice.

### Q: Should coordinator use the user's selected concierge model (CONCIERGE_MODELS)?
**A:** No. Coordinator is fixed-Haiku for cost+speed. Concierge synthesis (a different surface) uses the user-selected model. Conflating the two would let users accidentally make their builds expensive by picking Opus as concierge model.

### Q: What if rate limit silences the coordinator AND a critical event happens 5 seconds later?
**A:** Critical events (action_required) bypass rate limit. The 30s gate only applies to info/warning/celebration tones. This means: trigger storms of routine events get rate-limited; emergencies get through.

### Q: Do we want concierge to predict ETA?
**A:** "Estimated 2 min remaining" was in an example. ETA prediction is a feature unto itself (track per-task latency, project remaining). Out of scope for v1; v1 says "still working" without ETA. v2 can layer on ETA from running averages.

### Q: What about silent failures (task succeeded but no files written)?
**A:** This is a build-quality issue, not a coordinator concern. Build completeness checks (already exist via `buildCompleteness.ts`) handle this. Coordinator narrates the event from completeness check signal, not by re-reasoning about output.

---

## Open Questions

1. **Voice consistency across builds.** Should concierge "remember" prior builds and reference them? "We saw similar Gemini issues last build." This requires per-repo memory (DIFF-02). Defer.
2. **Conductor mode (silent observer).** Some users may want coordinator to think but never speak — only intervene on action_required. Add `coordinator_mode: 'silent' | 'narrate' | 'verbose'` setting. v1.1.
3. **Multi-language voice.** Coordinator currently English. i18n is a separate concern. Out of scope.
4. **Conflict with PRO-01 deliberation.** When deliberation runs DURING build (v1.2 integration), who narrates: deliberation agents or coordinator? Defer until both ship independently.
5. **What if the coordinator's LLM call itself fails?** Network blip, Haiku rate-limit, etc. Recommendation: silent failure, log to coordinator_invocations with `decision_should_speak: false` and rationale "llm_call_failed". Build continues normally.

---

## Implementation Order

1. **Migration + types.** `coordinator_invocations` table, sessions extension, type additions. Ship alone.
2. **Edge function skeleton.** `build-coordinator/index.ts` with stub handler that writes a hardcoded test message. Test via curl.
3. **Coordinator prompt module.** `coordinator-prompt.ts` with state summary builders + the prompt template. Unit-test summary correctness.
4. **Rate limiter.** `coordinator-rate-limit.ts` reads thread_messages. Test with timestamp scenarios.
5. **LLM integration.** Wire prompt → orchestrate (Haiku call) → JSON parsing. Cost tracking. Test against several trigger types with known state.
6. **Frontend trigger hook.** `useCoordinator.ts` watches build_tasks state changes and POSTs triggers. Heartbeat timer.
7. **ConciergeLiveCard component.** Renders message + tone styling + action buttons (when present).
8. **SystemEventCard dispatcher.** Routes `kind='concierge_live'` to ConciergeLiveCard.
9. **BuildRunwayCard integration.** Render coordinator messages inline. Add presence indicator.
10. **TrustDrawer settings.** Enable/disable, budget config.
11. **Trigger emitters.** `useBuildExecution`, `concierge`, `bouncer` emit triggers at the right moments.
12. **Live verification per acceptance criteria.** Update status + state docs.

Suggested split:
- Sonnet: 1-6, 11 (data + edge function + trigger wiring)
- Sonnet or Gemini: 7-10 (UI)
- **Opus: review step 3 (prompt template) before merge.** The prompt is where the coordinator's voice is born; Opus is the right reviewer.

---

## What This Spec Does NOT Cover

- **DB-trigger-driven coordination** (browser-closed scenarios). Frontend-driven only in v1.
- **ETA prediction.** "2 min remaining" is a v2 feature.
- **Per-repo memory integration** ("we saw this last time"). Requires DIFF-02 to land first.
- **Coordinator interventions on iteration loops.** PRO-02 v1.1 integration.
- **Silent / verbose modes.** Single mode in v1.
- **Coordinator-driven deliberation** ("I think we should ask the council to weigh in"). v1.2.
- **Custom user voice templates.** Concierge speaks in one voice. Customization deferred.
- **Multi-build coordination** (user runs 3 parallel builds — does coordinator narrate all or pick one?). Defer; multi-build is itself rare.

---

## Hand-off Notes

This spec is mostly Sonnet-implementable. The two places that need Opus eyes:

1. **Step 3 (prompt template)** — the voice lives here. Once shipped, hard to change without retraining user expectations. Get this right.
2. **Trigger emitters in `useBuildExecution`** (step 11) — getting the triggers wrong (too many, too few, wrong context) makes the coordinator either chatty or silent. Cross-check against the trigger catalog.

If implementing on Sonnet alone, **stop after step 5 (LLM integration)** and have Opus run the prompt against real builds to validate the voice before continuing the UI integration. The prompt is where the product feel is set.

---

*End of LIVE-01 spec.*
