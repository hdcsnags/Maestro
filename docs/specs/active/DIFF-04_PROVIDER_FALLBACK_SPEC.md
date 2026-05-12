# DIFF-04 — Provider Fallback Matrix Spec

**Status:** Ready for review
**Authored:** 2026-05-03 by Opus 4.7
**Implementing agent:** Opus 4.7 (architecture) + Sonnet 4.6 (implementation)
**Parent plan:** `IMPLEMENTATION_PLAN.md` task `DIFF-04`
**Dependencies:** `DIFF-03` (lane-scoped prompt slicing — fallbacks need clean per-lane prompts to switch models cleanly)

---

## Why This Exists

Per `smoketestaudit.md` #4: when a builder fails (missing key, provider outage, rate-limit, 504, Sonnet timeout on artifact-heavy prompts), the current system has best-effort reroute logic in `useBuildExecution.ts` but no structured fallback policy. There is one specific shim, `FREE_TIER_FALLBACKS`, for the "free GPT-OSS 404" case. Everything else is reactive scrambling.

The user-visible failure mode: build appears stuck, partial files generated, conductor refreshes the browser. Per the smoketest audit: "dead/overloaded providers still participate too long before being treated as failed."

This spec defines a structured **provider health model** plus **per-lane fallback chains** with **automatic and approval-gated reroute**.

---

## Two Levels of Reroute

The system needs two distinct mechanisms — they solve different problems:

### Pre-build reroute (proactive)
Before the build starts, concierge probes provider health and reorders the chain if a primary is degraded. The user sees the adjusted plan in the BuilderRosterCard. Fast, cheap, prevents wasted dispatches.

### Mid-build reroute (reactive)
A task fails mid-build with a recoverable error. The dispatcher walks the chain to the next viable model and retries. Fast for recoverable errors (rate limit, 504, transient 5xx); approval-gated for cost-escalation (free → paid).

---

## The Provider Health Model

A small state machine tracks each provider's state. Updated by both passive observation (recent failures) and active probes (concierge HEAD calls).

### States

| State | Meaning | Behavior |
|-------|---------|----------|
| `healthy` | Recent successes; no recent failures | Use as primary |
| `degraded` | Recent failures detected; provider may still work | Demote to fallback position; alert user |
| `down` | Repeated failures over short window | Skip in fallback chain; alert user with clear reason |
| `unknown` | No recent activity (haven't called this provider in N hours) | Treat as healthy but probe before relying on it |
| `rate_limited` | 429 response observed | Retry-after header respected; auto-recover when window passes |

### Transitions

```
        ┌─→ healthy ──→ (success: stays)
        │              ─→ (1 failure: stays — single failures noisy)
        │              ─→ (2+ failures in 5 min: degraded)
        │              ─→ (429 with retry-after: rate_limited)
        │
        ├─→ degraded ──→ (3 successes in a row: healthy)
        │               ─→ (3+ failures in 10 min: down)
        │
        ├─→ down ──→ (1 success after probe: degraded)
        │           ─→ (concierge probe fails: stays down)
        │
        ├─→ unknown ──→ (any successful call: healthy)
        │              ─→ (any failure: degraded)
        │
        └─→ rate_limited ──→ (retry-after expires: healthy if no recent failures, else degraded)
```

### Failure attribution — what counts as a failure

Per provider, count as a failure:
- HTTP 5xx (server errors)
- HTTP 429 (rate limit) — also triggers `rate_limited` state
- HTTP 401/403 (auth) — special: marks user's key as `key_invalid`, separate from provider health
- Network error / timeout
- Truncated response (per the existing truncation detection per state doc)

Do **not** count as failure:
- HTTP 400 with model-specific error (bad input — user's prompt is the problem, not the provider)
- HTTP 404 on a free model (the FREE_TIER_FALLBACKS path handles this; counts as model_unavailable, not provider failure)
- Successful response with empty/garbage content (counted as build-quality issue, not provider health)

### Health storage

Two layers:

**Layer A — In-memory (per-session, fast):**
A `useRef`-backed map in `src/lib/providerHealth.ts`. Updated on every API response. Used for hot-path decisions (next dispatch, mid-build reroute). Resets on page reload.

**Layer B — Database (persistent, slow):**
A `provider_health` table that persists across sessions. Used for:
- Pre-build concierge planning (so concierge knows provider was flaky last session even after a refresh)
- Multi-tab consistency (all tabs see same state)
- Auditable history

Layer A is authoritative within a session; Layer B is reconciled on session-start and updated periodically.

```sql
CREATE TABLE provider_health (
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  provider_id text NOT NULL,                          -- e.g., 'anthropic', 'openrouter:openai/gpt-oss-20b:free'
                                                      -- (provider:model granularity for OpenRouter)
  state text NOT NULL CHECK (state IN ('healthy','degraded','down','unknown','rate_limited')),
  last_success_at timestamptz,
  last_failure_at timestamptz,
  recent_failure_count int NOT NULL DEFAULT 0,        -- in the last 10 min window
  recent_success_count int NOT NULL DEFAULT 0,
  rate_limit_until timestamptz,                       -- if state='rate_limited'
  last_failure_reason text,                           -- short description for UI
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, provider_id)
);

CREATE INDEX idx_provider_health_user ON provider_health(user_id);

ALTER TABLE provider_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY provider_health_owner ON provider_health
  FOR ALL USING (user_id = auth.uid());
```

---

## Fallback Chains

### The chain shape

Per builder lane, the build_spec carries a fallback chain:

```ts
export interface FallbackChain {
  primary: string;            // model id, e.g., 'claude-sonnet-4-6'
  fallbacks: string[];        // ordered, e.g., ['claude-opus-4-6', 'gpt-5.4']
  emergency: string;          // last-resort cheap model, e.g., 'openai/gpt-oss-20b:free'
}

export interface BuilderLaneAssignment {
  agent_id: string;           // existing field
  lane_paths: string[];       // existing
  role: BuildLaneRole;        // existing
  fallback_chain: FallbackChain;  // NEW
}
```

### Chain construction (concierge logic)

When concierge plans builders, for each lane:

1. **Primary** = the user-selected builder model.
2. **Fallbacks** = in order of preference:
   - Same provider, smaller/faster model (e.g., Sonnet → Haiku)
   - Different provider, similar capability tier (e.g., Sonnet → GPT-5.4)
   - OpenRouter copy of primary (different provider routing for the same model)
3. **Emergency** = cheap free or near-free model (always present as last resort).

A lookup table (in code) defines the canonical fallback options per primary:

```ts
// src/lib/providerFallbacks.ts
export const CANONICAL_FALLBACKS: Record<string, { fallbacks: string[]; emergency: string }> = {
  'claude-sonnet-4-6': {
    fallbacks: ['claude-opus-4-6', 'gpt-5.4', 'anthropic/claude-sonnet-4-6'],
    emergency: 'openai/gpt-oss-20b:free',
  },
  'claude-opus-4-6': {
    fallbacks: ['claude-sonnet-4-6', 'gpt-5.4', 'anthropic/claude-opus-4-6'],
    emergency: 'openai/gpt-oss-20b:free',
  },
  'claude-haiku-4-5': {
    fallbacks: ['gpt-5.4-mini', 'gemini-2.5-flash'],
    emergency: 'openai/gpt-oss-20b:free',
  },
  'gpt-5.4': {
    fallbacks: ['gpt-5.4-mini', 'claude-sonnet-4-6', 'openai/gpt-5.4'],
    emergency: 'openai/gpt-oss-20b:free',
  },
  'gpt-5.4-mini': {
    fallbacks: ['claude-haiku-4-5', 'gemini-2.5-flash'],
    emergency: 'openai/gpt-oss-20b:free',
  },
  'gemini-2.5-pro': {
    fallbacks: ['claude-sonnet-4-6', 'gpt-5.4', 'google/gemini-2.5-pro'],
    emergency: 'openai/gpt-oss-20b:free',
  },
  'gemini-2.5-flash': {
    fallbacks: ['claude-haiku-4-5', 'gpt-5.4-mini'],
    emergency: 'openai/gpt-oss-20b:free',
  },
  'moonshotai/kimi-k2': {
    fallbacks: ['claude-sonnet-4-6', 'gpt-5.4'],
    emergency: 'openai/gpt-oss-20b:free',
  },
  // ... extend for each agent in AGENT_DEFAULTS
};

export function buildFallbackChain(primary: string): FallbackChain {
  const canonical = CANONICAL_FALLBACKS[primary];
  if (!canonical) {
    // Unknown primary — generic safe fallback
    return {
      primary,
      fallbacks: [],
      emergency: 'openai/gpt-oss-20b:free',
    };
  }
  return {
    primary,
    fallbacks: canonical.fallbacks,
    emergency: canonical.emergency,
  };
}
```

### Health-adjusted reordering

Before dispatching, the chain is reordered based on current health:

```ts
function selectModel(chain: FallbackChain, health: ProviderHealthMap): string | null {
  const candidates = [chain.primary, ...chain.fallbacks, chain.emergency];

  // Filter: skip 'down' and 'rate_limited' (unless retry-after passed)
  const viable = candidates.filter(model => {
    const state = health.get(modelToProviderKey(model));
    if (!state) return true;                        // unknown = try
    if (state.state === 'down') return false;
    if (state.state === 'rate_limited' &&
        state.rate_limit_until &&
        new Date(state.rate_limit_until) > new Date()) {
      return false;
    }
    return true;
  });

  // Among viable, prefer healthy > unknown > degraded
  const sorted = viable.sort((a, b) => {
    const ra = healthRank(health.get(modelToProviderKey(a))?.state);
    const rb = healthRank(health.get(modelToProviderKey(b))?.state);
    return ra - rb;  // lower rank = better
  });

  return sorted[0] ?? null;
}

function healthRank(state?: ProviderHealthState): number {
  switch (state) {
    case 'healthy': return 0;
    case 'unknown': return 1;
    case 'degraded': return 2;
    case 'rate_limited': return 3;
    case 'down': return 4;
    default: return 1;
  }
}
```

If `selectModel` returns null, the lane is **unrunnable** — no viable model. The build dispatch surfaces this immediately (don't keep trying).

---

## Cost-Aware Approval Gate

Some fallbacks cost more than the primary (free → paid). Auto-applying these surprises the user. Some fallbacks cost less or same (Opus → Sonnet, paid → free) — apply automatically.

### Decision rule

Per fallback step:
- Compute `cost_delta = cost(fallback) - cost(primary)` per estimated token usage for this build.
- If `cost_delta <= $0` (cheaper or same) → auto-apply.
- If `0 < cost_delta <= USER_AUTO_REROUTE_THRESHOLD` (default $1) → auto-apply, log notice.
- If `cost_delta > threshold` → pause, show approval card "Reroute to higher-cost fallback?", continue on approve.

The threshold is per-user, configurable via TrustDrawer ("Auto-approve fallbacks costing up to $X more"). Default $1.

### Approval flow

If approval needed mid-build:
1. Build pauses on the affected lane.
2. A `system_event` thread message of kind `'reroute_approval'` appears with cost delta and reasoning.
3. User clicks Approve / Use Emergency / Skip Lane.
4. Build resumes.

---

## Pre-Build Health Probe

Concierge runs this before any build that takes more than a trivial amount. It's a fast Haiku-driven plan: ping each model in the lane assignments with a 2-token request and observe.

### Probe mechanism

For each unique model in the chains:
- Issue a tiny test request: `"Reply with OK"`.
- Token budget: 5 max output.
- Timeout: 10 seconds.
- Record: success, latency, error code, retry-after.

Update `provider_health` for each.

### When to probe

- Before every build (unless probed within last 5 min for the same model — cache).
- Concierge's `pre_build` phase calls a new edge function: `provider-health-probe?action=probe&models=...`.
- Probe results gate the build start: if all primaries are `down` and no fallbacks viable, surface "no viable models for build" error before dispatching.

### Probe edge function

New: `supabase/functions/provider-health-probe/index.ts`. Lightweight wrapper around `orchestrate` with:
- Single 5-token request per model.
- Records result to `provider_health`.
- Returns map of `model_id → state`.

Frontend uses the response to update in-memory `providerHealth` map and to render BuilderRosterCard with up-to-date dots.

---

## Mid-Build Reroute Logic

Inside `useBuildExecution.ts` dispatch loop. Pseudocode for the per-task dispatch:

```ts
async function dispatchTaskWithFallback(
  task: BuildTask,
  laneAssignment: BuilderLaneAssignment,
  attempt: number = 1
): Promise<void> {
  const health = providerHealthRef.current;
  const model = selectModel(laneAssignment.fallback_chain, health);

  if (!model) {
    // No viable model
    await markTaskFailed(task.id, 'no_viable_model', laneAssignment.fallback_chain);
    return;
  }

  // Update task with current chosen model (for UI visibility)
  await updateTaskRoute(task.id, model);

  try {
    await callOrchestrate({ ...task, model });
    // success path: update health to healthy, continue
    updateHealth(model, { kind: 'success' });
  } catch (err) {
    const failure = classifyFailure(err);
    updateHealth(model, { kind: 'failure', failure });

    // Check cost gate for next step
    if (attempt >= MAX_ATTEMPTS_PER_TASK) {
      await markTaskFailed(task.id, 'fallback_exhausted', { lastError: failure });
      return;
    }

    if (failure.requiresApproval) {
      // Cost escalation — pause and ask user
      const approved = await requestRerouteApproval(task, failure, model);
      if (!approved) {
        await markTaskFailed(task.id, 'reroute_rejected', { lastError: failure });
        return;
      }
    }

    // Retry with the next viable model
    return dispatchTaskWithFallback(task, laneAssignment, attempt + 1);
  }
}
```

### Failure classification

```ts
function classifyFailure(err: unknown): FailureClass {
  if (isHttp429(err)) {
    const retryAfter = extractRetryAfter(err);
    return {
      kind: 'rate_limited',
      retryAfter,
      requiresApproval: false,    // retry on next viable model is fine
    };
  }
  if (isHttp5xx(err)) {
    return { kind: 'server_error', requiresApproval: false };
  }
  if (isHttp401or403(err)) {
    return { kind: 'auth_invalid', requiresApproval: false };
  }
  if (isNetworkError(err)) {
    return { kind: 'network', requiresApproval: false };
  }
  if (isTimeout(err)) {
    return { kind: 'timeout', requiresApproval: false };
  }
  if (isTruncation(err)) {
    return { kind: 'truncated', requiresApproval: false };
  }
  return { kind: 'unknown', requiresApproval: false };
}
```

`requiresApproval` is the wrong term here — it's actually `requiresRerouteApprovalIfCostEscalates`. Real check is `cost_delta > threshold` per the cost gate above.

---

## UI Surfaces

### BuilderRosterCard updates

Each builder shows:
- Current state dot: 🟢 healthy, 🟡 degraded, 🔴 down, ⚪ unknown, ⏰ rate-limited
- Hover: tooltip with state details, last success/failure times, rate-limit clock if applicable
- Expand: full fallback chain with state per fallback

```
Architect Lane
  ◉ Sonnet 4.6  (healthy)        ← primary, dispatching
    ↳ Opus 4.6  (healthy)         ← fallback 1
    ↳ GPT-5.4   (degraded)        ← fallback 2
    ↳ GPT-OSS   (healthy)         ← emergency
```

### Reroute approval card (mid-build)

System event card in the thread:

```
┌─ Reroute approval needed ──────────────────────────────┐
│ ⚠️ Architect Lane                                       │
│ Sonnet 4.6 failed: rate limit (retry after 45s)        │
│                                                         │
│ Recommended fallback: Opus 4.6                         │
│ Estimated cost: +$0.85 vs primary                       │
│ This is above your auto-approve threshold of $0.50.    │
│                                                         │
│ [Use Emergency Free Model] [Approve Opus] [Skip Lane]  │
└─────────────────────────────────────────────────────────┘
```

### TrustDrawer Health panel (new tab)

Shows current health state for all providers. User can:
- Force-probe all providers ("Refresh health" button)
- Clear `down` state if user knows the provider is back ("Mark healthy")
- Configure cost threshold for auto-reroute

---

## Files to Create / Modify

### New
- `src/lib/providerHealth.ts` — in-memory health state, transition logic, `selectModel`.
- `src/lib/providerFallbacks.ts` — `CANONICAL_FALLBACKS` table, `buildFallbackChain`.
- `src/hooks/useProviderHealth.ts` — frontend hook (init from DB, update on observation, write back).
- `supabase/functions/provider-health-probe/index.ts` — probe endpoint.
- `src/components/reveal/EventCards/RerouteApprovalCard.tsx` — system card for cost-gated reroute.
- `src/components/reveal/HealthPanel.tsx` — TrustDrawer Health tab.
- New migration `{ts}_provider_health.sql` — table, RLS, Realtime publication.

### Modified
- `src/types/index.ts` — types: `ProviderHealthState`, `ProviderHealthRecord`, `FallbackChain`, `BuilderLaneAssignment` extension, `FailureClass`, `RerouteApprovalEvent` (in `ThreadMessageMetadata.kind`).
- `supabase/functions/concierge/index.ts` — when constructing build_spec lanes, attach fallback_chain to each. Trigger probe before plan-finalize.
- `supabase/functions/orchestrate/index.ts` — return failure-class metadata on errors so frontend can update health correctly.
- `src/hooks/useBuildExecution.ts` — replace direct dispatch with `dispatchTaskWithFallback`. Wire reroute approval flow.
- `src/components/reveal/PlanCards/BuilderRosterCard.tsx` — show health state per builder, expandable fallback chain.
- `src/components/reveal/TrustDrawer.tsx` — add Health tab.
- `src/components/reveal/EventCards/SystemEventCard.tsx` — dispatch new `'reroute_approval'` kind.
- `MAESTRO_STATE.md` — Stable Architecture section adds `provider_health` table and the fallback model.

---

## Acceptance Criteria

1. **Pre-build health probe runs.** Open build flow with 4 builders. Concierge probes all 4 within 5 seconds. BuilderRosterCard shows current state dots before user clicks "Start Build."
2. **Health state persists.** Probe fails for one provider. Refresh browser. BuilderRosterCard still shows that provider as degraded (loaded from DB).
3. **Mid-build cheap reroute auto-applies.** Force a Sonnet 5xx mid-build. Build automatically reroutes to Opus (also paid, similar cost). No approval prompt. Reroute logged in audit_events.
4. **Mid-build expensive reroute requires approval.** Force GPT-OSS (free) to fail mid-build. Auto-fallback would route to Llama 4 Maverick (paid). Approval card appears with cost delta. User clicks Approve. Build continues.
5. **Build with no viable models fails fast.** Mark all providers as `down` in DB. Try to start a build. UI rejects with "no viable models" before any dispatch.
6. **Rate limit respected.** Provider returns 429 with retry-after. Health state becomes `rate_limited`. Subsequent dispatches in that window skip this provider. After retry-after window, provider returns to `healthy` (or `degraded` if other failures).
7. **Health-down recovery.** Provider was `down`. User clicks "Mark healthy" in TrustDrawer. State transitions to `unknown`. Next call probes; success returns to `healthy`.
8. **Cost threshold respected.** Set threshold to $5. Force a reroute with cost delta of $0.50. Auto-applies, no card. Set threshold to $0.10. Same reroute now requires approval.
9. **Failure classification correct.** Trigger 429, 503, network timeout, truncation — each updates health correctly per its classification.
10. **Audit trail.** Every reroute, probe result, and health state transition is in `audit_events`.

---

## Verification (Live Tests)

1. **Probe live:** open a fresh session, click into pre-build, observe BuilderRosterCard health dots populate within 5s.
2. **Force a 429:** rate-limit your test account or use a pseudo-provider that responds 429. Observe rate_limited state, observe build skipping that provider.
3. **Force a 5xx:** intercept a single Sonnet call with a 503 response. Observe degraded transition; observe build retrying with Opus successfully.
4. **Cost gate:** lower threshold to $0.05; force a reroute with delta > $0.05. Observe approval card appearing.
5. **No viable models:** in DB, set all of user's providers to state='down'. Attempt build. Observe immediate "no viable models" error, no dispatch.
6. **Manual recovery:** in `down` state, click "Mark healthy" in TrustDrawer Health. Confirm state changes; next call confirms.

---

## Decisions Made

### Q: Why two layers (in-memory + DB)?
**A:** Hot-path decisions (next dispatch within ms) cannot afford a DB round trip. In-memory is the ground truth during a session. DB is the persistence layer. Updates to DB are async/batched (every 5 sec, or on terminal state change). This is the same pattern as `tasksRef` in the existing build executor — proven to work.

### Q: Why concierge-driven probe instead of always-on health monitor?
**A:** A background monitor would burn API calls 24/7 even when the user isn't building. Concierge probes only when needed (build-time). Trade-off: first build of a session has 5s of overhead. Acceptable, and fully visible to the user as "Probing providers..." in the plan card.

### Q: Why is failure-attribution conservative (1 failure = stays healthy)?
**A:** Single failures are noisy — transient network blips, momentary load spikes, etc. Two failures in a 5-min window is the threshold for `degraded` because it indicates a pattern, not noise. Tunable via constant if real-world data suggests different.

### Q: Why "model id" granularity and not just "provider"?
**A:** OpenRouter routes the same model id (e.g., `claude-sonnet-4-6`) through different upstream providers. Two different "providers" from OpenRouter's view can both be Anthropic upstream and share rate limits. Using `provider:model` as the granularity captures the actual rate-limit / availability boundary. Direct provider calls (Anthropic API) get just the provider id (`anthropic`).

### Q: Should `down` state be sticky or aggressive?
**A:** Sticky-ish. Once `down`, it stays until either:
  (a) Concierge probe succeeds (auto-recovery)
  (b) User manually clears it
  (c) 1 hour passes without checking (auto-degrade to `unknown`, will be probed next build)

This avoids "I refreshed and the state is wrong" frustration while preventing permanent stuck-down without recovery.

### Q: Why include emergency model in the chain instead of as a special-case?
**A:** Treating it as the last entry in `fallbacks` would work; making it explicit (`emergency: ...`) lets the UI render it differently (greyed out, "free fallback") and lets the cost gate know "you're now using the emergency model — this is fine, but signal it."

### Q: What if user has no key for a fallback model?
**A:** Fallback skip. The dispatch logic checks `hasKey(provider)` before attempting. The chain effectively shrinks to keyed models. If chain becomes empty, the lane is `no_viable_model`. The user's BuilderRosterCard shows greyed-out fallbacks for unkeyed models with "+ key" prompts.

### Q: Why probe with `"Reply with OK"` and not just a HEAD request?
**A:** Most LLM APIs don't support HEAD or expose a true health endpoint. A 5-token round trip is the cheapest reliable proxy. ~$0.0001 per probe per model. With 4 models pre-probed per build, that's ~$0.0004 — negligible.

### Q: What about Claw / MaestroClaw — does it have health states?
**A:** Yes, but it's already tracked separately via the `executors` table (`status: 'offline'|'online'|'busy'|'error'`). The fallback matrix here is for cloud providers. If Claw is selected as primary and offline, the existing executor-online check handles routing. We do NOT extend `provider_health` to Claw — separate concerns.

---

## Open Questions

1. **Should we expose the cost threshold in the composer per-build, not just globally?** A user might want a high threshold for a quick prototype build but a low one for a production build. Defer to v2; v1 ships global threshold only.
2. **Should the user be able to customize fallback chains per primary?** "I want my Sonnet to fall back to Kimi, not Opus." Defer to v1.1 — first prove the canonical defaults work for 90% of cases.
3. **Should mid-build reroute trigger a deliberation round (PRO-01) on the reroute decision?** "The Council recommends Opus over emergency for this lane because…" — interesting but adds latency. Defer.
4. **Caching probe results across users — could shared health dashboards reduce probe cost?** Privacy concerns: knowing another user's keys are rate-limited is leakage. Skip.

---

## Implementation Order

1. **Migration + types.** `provider_health` table + Realtime + RLS + TypeScript types.
2. **`providerFallbacks.ts`.** The canonical lookup. Hardcoded, no logic. Trivial.
3. **`providerHealth.ts`.** State transitions, in-memory map, `selectModel`. Unit tested in isolation.
4. **Probe edge function.** `provider-health-probe`. Live test by curl with various models.
5. **Concierge integration.** Lane assignments include fallback_chain. Concierge calls probe before plan-finalize.
6. **Build dispatch integration.** `useBuildExecution.ts` replaces direct dispatch with fallback-aware dispatch. Failure classification wired.
7. **Reroute approval card.** New event card for cost-gated reroute. Integrated with `useBuildExecution`'s pause-and-wait flow.
8. **BuilderRosterCard health UI.** State dots, expand to show chain.
9. **TrustDrawer Health panel.** All providers, manual probe/recovery, threshold setting.
10. **Live verification per acceptance criteria.** Update `IMPLEMENTATION_PLAN_STATUS.md` and `MAESTRO_STATE.md`.

Suggested split:
- Sonnet: 1-7 (data, transition logic, edge function, dispatch wiring)
- Gemini or Sonnet: 8-9 (UI polish)
- Opus: review the failure classification table (step 6) before ship — getting "what counts as a failure" wrong skews health states

---

## Hand-off Notes

This is a moderately complex spec because it touches three subsystems: edge functions (probe, concierge), frontend dispatch (useBuildExecution), and UI (BuilderRosterCard, TrustDrawer). Sonnet can implement the whole thing if it follows the order above and stops at step 6 to confirm failure classification matches the user's expectations.

The biggest risk: getting failure attribution wrong — counting a transient blip as `degraded` annoys users; failing to count real outages keeps the system trying broken providers. The constants in step 3 (2-failures-in-5-min for degraded, 3-in-10-min for down) are first-pass values. Tune via real telemetry within first week of shipping.

---

*End of DIFF-04 spec.*
