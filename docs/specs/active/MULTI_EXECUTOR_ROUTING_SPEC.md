# MULTIEXEC-01 — Multi-Executor Capability Routing Spec

**Status:** Ready for review
**Authored:** 2026-05-04 by Opus 4.7
**Implementing agent:** Opus 4.7 (architecture + selection algorithm) + Sonnet 4.6 (implementation)
**Parent plan:** Promoted from "Remaining Non-Audited Risks" to a real spec. Closes the user's stated vision: *"It allows me to be able to work, build, analyze, code execute anywhere."*
**Dependencies:** None hard. Soft synergy with `LIVE-01` (coordinator can narrate "running on your desktop"), `SEC-04` (incidents now have `executor_id`), `BOUNCER-02` (per-watcher findings tied to executor).

---

## The Vision This Closes

The user wrote: *"I want to use the claw via the Frontend chat, for one, I feel its more secure that way, ... It allows me to be able to work, build, analyze, code execute anywhere."*

Today, the system supports **one executor per user**. If you set up MaestroClaw on your laptop, that's where everything runs. Sit down at the desktop and you've got nothing — even though your desktop has the same Claw installed and is online. The data model already permits multiple executor rows per user, but **routing logic doesn't think about which one to use.** All jobs go to whoever polls first.

This spec adds intelligence:
- Each executor advertises its **capabilities** (adapters, platform, PTY support, labels, current load).
- Each job declares its **requirements** (which adapter, whether PTY needed, etc.).
- A **selection algorithm** picks the right executor for each job — recency-weighted, capability-filtered, with sticky session behavior so jobs in a session stay on the same machine unless the user moves.
- **User control surfaces** — TrustDrawer lets you label executors ("home laptop", "office desktop", "gpu node"), pick a default, and see real-time which one is active.

The product story becomes: *"Maestro follows you. Open it on your laptop, jobs run there. Walk over to your desktop, jobs run there. The board doesn't care which seat you're in."*

---

## Core Concept — Capability Advertising + Scored Selection

```
┌──────────────────────────────────────────────────────────────┐
│ EXECUTORS advertise capabilities via heartbeat                │
│                                                                │
│   { adapters: ['claude_code','approved_shell','pty_shell'],   │
│     platform: 'win32', interactive_pty: true,                  │
│     max_concurrent_jobs: 3, labels: ['home','primary'],        │
│     current_load: 1, last_seen_at: <recent> }                  │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼ (DB: executors.capabilities jsonb)
┌──────────────────────────────────────────────────────────────┐
│ JOBS declare required capabilities at submit                  │
│                                                                │
│   { adapter: 'pty_shell',                                      │
│     required_capabilities: { interactive_pty: true,            │
│                              adapters: ['pty_shell'] },        │
│     preferred_executor_id: <last-active-or-sticky>,            │
│     available_to_others_at: now()+30s }                        │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│ EXECUTORS poll with their capabilities; receive matching jobs │
│   - Preferred executor sees it immediately                    │
│   - Others see it after 30s grace period (preferred missed)   │
│   - Filter by: required_capabilities ⊆ my_capabilities         │
└──────────────────────────────────────────────────────────────┘
```

**This is pull-based dispatch with smarter filtering.** Executors continue to poll. Jobs stay queued. The selection happens at the WHERE clause of the poll query, not in a centralized scheduler.

---

## Data Model Changes

### `executors` table extensions

```sql
ALTER TABLE executors ADD COLUMN max_concurrent_jobs int DEFAULT 1;
ALTER TABLE executors ADD COLUMN labels text[] DEFAULT '{}';
ALTER TABLE executors ADD COLUMN is_default boolean DEFAULT false;
ALTER TABLE executors ADD COLUMN zone text;  -- e.g., "home", "office", "cloud-us-east"

-- Capabilities jsonb expands with these fields (no schema change, just convention):
--   { adapters: string[],
--     platform: 'linux' | 'darwin' | 'win32',
--     node_version: string,
--     interactive_pty: boolean,           // NEW — true if pty_shell adapter is functional
--     max_concurrent_jobs: number,        // NEW — runtime ceiling
--     labels: string[],                   // NEW — user-defined tags
--     gpu: boolean,                       // NEW — does this machine have GPU
--     git_installed: boolean,             // NEW — for build/iterate jobs
--     current_load: number }              // NEW — claimed-but-not-complete count

-- Constraint: only one default per user
CREATE UNIQUE INDEX idx_executors_one_default_per_user
  ON executors(owner_user_id) WHERE is_default = true;
```

### `executor_jobs` table extensions

```sql
ALTER TABLE executor_jobs ADD COLUMN preferred_executor_id uuid REFERENCES executors(id);
ALTER TABLE executor_jobs ADD COLUMN required_capabilities jsonb DEFAULT '{}'::jsonb;
ALTER TABLE executor_jobs ADD COLUMN available_to_others_at timestamptz;
-- Note: existing executor_id is now "the executor that CLAIMED the job."
-- preferred_executor_id is "the executor we ROUTED to."
-- They will usually match. They diverge when preferred missed and another claimed.

CREATE INDEX idx_executor_jobs_polling
  ON executor_jobs(status, preferred_executor_id, available_to_others_at)
  WHERE status = 'queued' OR status = 'approved';
```

### `sessions` extension — sticky executor

```sql
ALTER TABLE sessions ADD COLUMN sticky_executor_id uuid REFERENCES executors(id);
-- Set on first successful job in a session. Future jobs in that session prefer it.
-- Cleared if user manually picks a different executor or that executor goes offline > 5 min.
```

### TypeScript types in `src/types/index.ts`

```ts
export interface ExecutorCapabilities extends Record<string, unknown> {
  adapters: string[];
  platform: 'linux' | 'darwin' | 'win32';
  node_version: string;
  interactive_pty: boolean;
  max_concurrent_jobs: number;
  labels: string[];
  gpu?: boolean;
  git_installed?: boolean;
  current_load: number;       // computed; not part of static capabilities
}

export interface JobRequiredCapabilities {
  adapters?: string[];        // any of these adapters; default: any
  interactive_pty?: boolean;  // require interactive PTY support
  gpu?: boolean;              // require GPU
  git_installed?: boolean;    // require git for build/iterate
  platform?: ('linux' | 'darwin' | 'win32')[];  // restrict to platforms
  labels?: string[];          // require specific user-applied labels (intersection)
}

export interface Executor {
  // existing fields ...
  max_concurrent_jobs: number;
  labels: string[];
  is_default: boolean;
  zone?: string | null;
  // capabilities is the jsonb — typed as ExecutorCapabilities
}

// Extension to existing ExecutorJob:
//   preferred_executor_id, required_capabilities, available_to_others_at
```

---

## Capability Advertising

The Claw heartbeat already sends capabilities. Update `packages/maestroclaw/src/api.ts` `heartbeat()` to include the new fields:

```ts
// In packages/maestroclaw/src/index.ts at boot:
const capabilities: ExecutorCapabilities = {
  adapters: supportedAdapters,         // existing — from checkAdapters()
  platform: process.platform,
  node_version: process.version,
  interactive_pty: supportedAdapters.includes('pty_shell'),
  max_concurrent_jobs: config.maxConcurrentJobs,
  labels: config.labels || [],          // NEW config field, default []
  gpu: detectGpu(),                     // NEW helper, returns false if unsure
  git_installed: detectGit(),           // NEW helper
  current_load: activeJobs,             // updated each heartbeat
};

await heartbeat(config, capabilities);
```

Heartbeat interval is already 15s. `current_load` is updated each heartbeat. The dispatcher reads this for selection.

### `packages/maestroclaw/src/config.ts` extensions

Allow users to set executor labels in their Claw config:
```ts
// Reading from env or config file:
labels: (process.env.MAESTROCLAW_LABELS ?? '').split(',').filter(Boolean),
```

E.g., `MAESTROCLAW_LABELS=home,primary,gpu`.

### Helper: `detectGpu()`, `detectGit()`

Cheap synchronous checks. `which git` (or equivalent) returns 0/1. GPU: heuristic — check for `nvidia-smi` or `rocm-smi` binary existence; if not, return false. Don't fail boot on detection errors; default to false.

---

## The Selection Algorithm

### Where it runs
**At job submit time, in `executor-api?action=submit`.** The frontend doesn't pick the executor; the edge function does, based on:
- The job's `required_capabilities`
- The user's executor pool (filtered to online)
- The session's sticky executor (if any)
- The user's default executor (if any)
- Recency and load

The selected executor's id is written as `preferred_executor_id`. The job sets `available_to_others_at = now() + 30s`. Then it's queued normally; pull-based polling takes it from there.

### The function

```ts
// supabase/functions/_shared/executor-selection.ts

export interface SelectionContext {
  userExecutors: Executor[];      // all executors owned by this user
  sessionStickyExecutorId?: string | null;
  userDefaultExecutorId?: string | null;
  job: { required_capabilities: JobRequiredCapabilities };
}

export interface SelectionResult {
  preferred_executor_id: string | null;
  available_to_others_at: string;  // ISO timestamp
  reason: string;                  // for audit: "sticky" | "default" | "recency" | "fallback"
}

export function selectExecutor(ctx: SelectionContext): SelectionResult {
  const now = Date.now();
  const ONLINE_THRESHOLD_MS = 90_000; // executors with last_seen > 90s ago = offline

  // 1. Filter by capability match
  const capable = ctx.userExecutors.filter(e =>
    meetsCapabilities(e.capabilities as ExecutorCapabilities, ctx.job.required_capabilities)
  );
  if (capable.length === 0) {
    return {
      preferred_executor_id: null,
      available_to_others_at: new Date(now).toISOString(),
      reason: 'no_capable_executor',
    };
  }

  // 2. Filter to online
  const online = capable.filter(e => {
    if (!e.last_seen_at) return false;
    return now - new Date(e.last_seen_at).getTime() < ONLINE_THRESHOLD_MS;
  });
  if (online.length === 0) {
    // No online executor matches. Pick any capable; available_to_others NOW (no grace period).
    // Job will queue indefinitely until one comes online. UI shows "waiting for executor".
    return {
      preferred_executor_id: null,
      available_to_others_at: new Date(now).toISOString(),
      reason: 'all_capable_offline',
    };
  }

  // 3. Sticky session preference (highest priority if online and capable)
  if (ctx.sessionStickyExecutorId) {
    const sticky = online.find(e => e.id === ctx.sessionStickyExecutorId);
    if (sticky) {
      return {
        preferred_executor_id: sticky.id,
        available_to_others_at: new Date(now + 30_000).toISOString(),
        reason: 'sticky',
      };
    }
    // Sticky exists but is offline or lost capability — fall through.
  }

  // 4. User default executor (if it's online and capable)
  if (ctx.userDefaultExecutorId) {
    const def = online.find(e => e.id === ctx.userDefaultExecutorId);
    if (def) {
      return {
        preferred_executor_id: def.id,
        available_to_others_at: new Date(now + 30_000).toISOString(),
        reason: 'default',
      };
    }
  }

  // 5. Score by recency + inverse load
  const scored = online.map(e => {
    const lastSeenAge = (now - new Date(e.last_seen_at!).getTime()) / 1000; // seconds
    const recencyScore = Math.max(0, 100 - lastSeenAge); // 0-100 (newer = higher)
    const caps = e.capabilities as ExecutorCapabilities;
    const loadCapacityRatio = caps.max_concurrent_jobs > 0
      ? (caps.current_load ?? 0) / caps.max_concurrent_jobs
      : 1;
    const loadScore = Math.max(0, 100 - loadCapacityRatio * 100);  // 0-100 (less loaded = higher)
    return {
      executor: e,
      score: recencyScore * 0.6 + loadScore * 0.4,  // recency weighted higher
    };
  }).sort((a, b) => b.score - a.score);

  return {
    preferred_executor_id: scored[0].executor.id,
    available_to_others_at: new Date(now + 30_000).toISOString(),
    reason: 'recency',
  };
}

function meetsCapabilities(
  caps: ExecutorCapabilities,
  required: JobRequiredCapabilities
): boolean {
  if (required.adapters && required.adapters.length > 0) {
    const has = required.adapters.some(a => caps.adapters.includes(a));
    if (!has) return false;
  }
  if (required.interactive_pty && !caps.interactive_pty) return false;
  if (required.gpu && !caps.gpu) return false;
  if (required.git_installed && !caps.git_installed) return false;
  if (required.platform && !required.platform.includes(caps.platform)) return false;
  if (required.labels && required.labels.length > 0) {
    const has = required.labels.every(l => caps.labels.includes(l));
    if (!has) return false;
  }
  return true;
}
```

### Why these weights

- **Sticky > default > recency.** Sticky session means jobs in this session ALREADY ran on this executor — switching mid-session breaks user expectation ("the build is happening on my laptop").
- **Default > recency.** If user explicitly designated a default, respect it.
- **Recency 60% / load 40%.** Recency is the primary signal of "user is actively here." Load is a tiebreaker preventing one executor from getting hammered when others are idle.
- **30-second grace period.** Long enough that the preferred executor's next poll cycle (3-5s typical) catches it. Short enough that if preferred is dead, fallback claims quickly.

---

## The "Sticky Session" Pattern

When a session's first job is claimed, set `sessions.sticky_executor_id = the_claiming_executor_id`. This way:
- Build tasks in this session go to the same machine
- Iteration loop steps stay on the same machine
- Direct execute commands stay on the same machine

Sticky is set IF the claiming executor matches `preferred_executor_id` (i.e., routing worked as expected). If a fallback executor claimed, do NOT set sticky — the user might be in a weird state and we shouldn't lock them in.

Sticky is CLEARED when:
- User manually selects a different executor in StatusChip / TrustDrawer
- The sticky executor goes offline for >5 minutes (heartbeat gap)
- Session is archived/completed

When sticky is set but the executor is currently offline (within 5 min grace), **new jobs queue and wait** for the sticky executor to come back. This is intentional — preserves session continuity. Banner: "Waiting for [laptop] to come back online (3 min)."

---

## Updating the Poll Query

The Claw's `pollForJob` (`packages/maestroclaw/src/api.ts` calling `executor-api?action=poll`) currently returns the oldest unclaimed job for the user. Update the WHERE clause:

```sql
-- New poll query inside executor-api?action=poll
SELECT * FROM executor_jobs
WHERE status IN ('queued', 'approved')
  AND (
    -- This executor is preferred
    preferred_executor_id = $executor_id
    -- OR grace period has passed
    OR available_to_others_at < now()
    -- OR no preference (legacy / single-executor user)
    OR preferred_executor_id IS NULL
  )
  AND meets_required_capabilities($executor_capabilities, required_capabilities)
ORDER BY
  -- Preferred jobs first, then by age
  CASE WHEN preferred_executor_id = $executor_id THEN 0 ELSE 1 END,
  created_at ASC
LIMIT 1;
```

`meets_required_capabilities` is a SQL function that does the same check as the TS `meetsCapabilities` — implement as a Postgres function so the filter happens in the DB:

```sql
CREATE OR REPLACE FUNCTION meets_required_capabilities(
  caps jsonb,
  req jsonb
) RETURNS boolean AS $$
BEGIN
  -- Empty req = matches anything
  IF req = '{}'::jsonb OR req IS NULL THEN
    RETURN true;
  END IF;

  -- adapters: any-of match
  IF req ? 'adapters' AND jsonb_array_length(req->'adapters') > 0 THEN
    IF NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(req->'adapters') a
      WHERE caps->'adapters' ? a
    ) THEN
      RETURN false;
    END IF;
  END IF;

  -- interactive_pty: must be true
  IF (req->>'interactive_pty')::boolean = true
     AND COALESCE((caps->>'interactive_pty')::boolean, false) = false THEN
    RETURN false;
  END IF;

  -- gpu, git_installed: same pattern
  IF (req->>'gpu')::boolean = true
     AND COALESCE((caps->>'gpu')::boolean, false) = false THEN
    RETURN false;
  END IF;
  IF (req->>'git_installed')::boolean = true
     AND COALESCE((caps->>'git_installed')::boolean, false) = false THEN
    RETURN false;
  END IF;

  -- platform: must be in the list
  IF req ? 'platform' AND jsonb_array_length(req->'platform') > 0 THEN
    IF NOT (req->'platform') ? (caps->>'platform') THEN
      RETURN false;
    END IF;
  END IF;

  -- labels: every required label must be present
  IF req ? 'labels' AND jsonb_array_length(req->'labels') > 0 THEN
    IF NOT (
      SELECT bool_and(caps->'labels' ? l)
      FROM jsonb_array_elements_text(req->'labels') l
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$ LANGUAGE plpgsql IMMUTABLE;
```

This keeps poll latency low (single SQL query, no application-layer filtering).

---

## UI Surfaces

### TrustDrawer Executors Panel (extends existing ExecutorSection)

```
EXECUTORS  (3 registered)
─────────────────────────────────────────────────
●  laptop          [home, primary]    ★ default
   ↳ Online · last seen 4s ago · 2/3 jobs · win32
   ↳ Adapters: claude_code, approved_shell, pty_shell
   ↳ [Edit labels]  [Set as default]  [Rotate token]  [Remove]

●  desktop         [home, gpu]
   ↳ Online · last seen 12s ago · 0/4 jobs · win32 · GPU
   ↳ Adapters: claude_code, approved_shell, pty_shell, copilot_cli
   ↳ [Edit labels]  [Set as default]  [Rotate token]  [Remove]

○  cloud-vps       [office]
   ↳ Offline · last seen 2h ago · linux
   ↳ Adapters: claude_code, approved_shell
   ↳ [Edit labels]  [Set as default]  [Rotate token]  [Remove]

[+ Register new executor]
```

Status dot color:
- Green: online (last_seen < 90s)
- Yellow: stale (last_seen 90s-5min)
- Grey: offline (last_seen > 5min)

### StatusChip — current/preferred executor

The existing StatusChip shows concierge model. Extend it with executor info:

```
[ ☉ Haiku · ⚙ laptop ]    ← active session is sticky to laptop
[ ☉ Haiku · ⚙ auto ]      ← no sticky; routing by recency
[ ☉ Haiku · ⚙ offline ]   ← no online executor matches
```

Click to open detail panel. Detail panel shows:
- Currently sticky executor (if any) — with "Unstick" button
- Routing reason for last job ("recency: laptop most recently active")
- Quick-pick: "Pin this session to [executor]"

### In-thread per-job indicator

Each `CommandResultCard`, `BuildRunwayCard`, `IterationCard` shows a small chip:

```
[ ⚙ laptop ]  ← which executor is running this
```

Click → opens TrustDrawer Executors panel scrolled to that one.

If routed to fallback (preferred missed), show a subtle indicator:

```
[ ⚙ desktop ↩ laptop ]  ← preferred laptop missed; desktop took it
```

### Composer hint (optional, v1.1)

Before submit, if the composer can predict which executor will receive the job (capability filter + sticky), show a tiny hint:

```
This will run on [laptop] · 2/3 jobs in flight
[ Send ]
```

Skip this in v1 — adds complexity without much value when the user has one executor most of the time.

### Per-build builder routing visibility (extends BuilderRosterCard)

When a build dispatches across multiple builders, each builder card shows which executor will handle its tasks:

```
Architect Lane
  ◉ Sonnet 4.6  →  ⚙ laptop
    ↳ Opus 4.6  →  ⚙ laptop (fallback)
```

For Claw-routed builders specifically: shows the executor. For cloud builders: shows the API target (no executor needed).

---

## File-Level Changes

### New
- `supabase/functions/_shared/executor-selection.ts` — the `selectExecutor` function and `meetsCapabilities` helper.
- New migration `{ts}_multi_executor_routing.sql` — column additions + the `meets_required_capabilities` SQL function + indexes.
- `src/lib/executorRouting.ts` — frontend mirror of `meetsCapabilities` for the optional composer hint (v1.1).
- `src/components/reveal/ExecutorRoutingChip.tsx` — small reusable chip component for "running on X" indicators.

### Modified
- `supabase/functions/executor-api/index.ts` — submit handler invokes `selectExecutor`, writes `preferred_executor_id` and `available_to_others_at`. Poll handler uses new WHERE clause via `meets_required_capabilities`. New action `set_default_executor`. New action `update_executor_labels`. New action `unstick_session`.
- `packages/maestroclaw/src/index.ts` — heartbeat sends extended capabilities (interactive_pty, gpu, git_installed, current_load, labels).
- `packages/maestroclaw/src/api.ts` — `heartbeat()` payload extended.
- `packages/maestroclaw/src/config.ts` — read `MAESTROCLAW_LABELS` env var or config file `labels` field.
- `src/types/index.ts` — types listed above.
- `src/hooks/useThreads.ts` — when submitting an execute job, include `required_capabilities` based on adapter (e.g., `pty_shell` → `{ adapters: ['pty_shell'], interactive_pty: true }`). Do NOT pre-pick executor; let server.
- `src/hooks/useBuildExecution.ts` — same: include `required_capabilities` on build_task and build_session jobs.
- `src/hooks/useWorkspace.ts` — load all executors (was: assumed single). Reflect in state.
- `src/components/reveal/ExecutorSection.tsx` — render multi-executor list, label editing, default selection.
- `src/components/reveal/StatusChip.tsx` — show current sticky executor or "auto".
- `src/components/reveal/CommandResultCard.tsx`, `BuildRunwayCard.tsx`, `IterationCard.tsx` — show ExecutorRoutingChip.
- `MAESTRO_STATE.md` — Stable Architecture section adds capability advertising + sticky session behavior.

---

## Migration / Backwards Compatibility

### Existing single-executor users
- Their one executor automatically wins every selection (it's the only capable + online one).
- After migration, set `executors.is_default = true` for users with exactly one executor (so default-preference logic works in v1).
- No user-facing behavior change.

### Existing sessions
- `sessions.sticky_executor_id` is null. New jobs in old sessions get fresh routing (recency-based).
- This is fine — old sessions don't have a "history of running here" expectation that needs preservation.

### Existing executor_jobs rows
- `preferred_executor_id` is null on legacy rows. The poll query's `OR preferred_executor_id IS NULL` clause means legacy jobs are claimable by any capable executor (current behavior).
- `required_capabilities` defaults to `{}` (matches anything). Legacy jobs are unrestricted.

### The Claw worker
- Old Claw workers (running pre-MULTIEXEC-01 code) still send legacy heartbeats. The DB still accepts them (capabilities jsonb is forgiving). They get marked `interactive_pty: false` etc. by absence — meaning they won't be selected for jobs that require those capabilities. Forces upgrade naturally without breaking existing behavior.

---

## Acceptance Criteria

1. **Single-executor user (no migration impact).** User with one executor: jobs route to it. No UI change visible.
2. **Two online executors, no preference.** Submit a job. Routed to the more-recently-active executor. Audit row records `reason: 'recency'`.
3. **Sticky session.** Submit job 1 in a session — claimed by executor A. Submit job 2 in same session within 5 min — also routed to A (sticky), even if B has been more recently active.
4. **Sticky executor offline.** Sticky to A. A goes offline. Submit job — banner shows "Waiting for [A] to come back online." Job queues. A comes back — A claims.
5. **Sticky executor offline > 5 min.** Sticky to A. A offline > 5 min. Submit job — sticky cleared automatically; routes to next-best (B). UI shows "Sticky cleared; running on B."
6. **Default executor preference.** User sets B as default. No active session. Submit job — routes to B even though A is more recently active. `reason: 'default'`.
7. **Capability filter.** Job requires `interactive_pty: true`. Executor A doesn't advertise PTY; B does. Routes to B regardless of recency.
8. **Capability mismatch — none capable.** Job requires `gpu: true`. No executor has GPU. Edge function returns clear error to frontend; UI shows "No GPU executor available — register one or run without GPU."
9. **30-second grace period.** Submit job preferred to A. A is "online" but doesn't poll for 60 seconds (simulated). After 30s, B's poll matches the job (no longer preferred-only). B claims.
10. **Sticky carry-through across job types.** Within a session: execute command (sticks to A), then build (also routes to A), then iteration loop (also routes to A). All on same executor.
11. **Manual override.** User clicks "Pin this session to [B]" in StatusChip. Sticky updates to B. Subsequent jobs route to B.
12. **Label-based routing (advanced).** User sets up `MAESTROCLAW_LABELS=gpu` on desktop only. Submit a build with `required_capabilities: { labels: ['gpu'] }`. Routes only to desktop, even if laptop is more recent.
13. **UI surfaces correct.** ExecutorSection shows all executors with status dots. StatusChip shows current routing target. CommandResultCard shows running-on chip.
14. **Token rotation interaction.** User rotates A's token via existing `rotate_executor_token` action. A goes offline (forced). Active sticky-A session: shows banner; jobs queue. After A re-registers with new token: claims and resumes.

---

## Verification (Live Tests)

1. **Setup:** install MaestroClaw on two machines under the same user account. Confirm both register and heartbeat. TrustDrawer shows two online executors.
2. **Recency test:** open browser, submit a `git status` execute. Check `executor_jobs.preferred_executor_id` matches whichever Claw heartbeated most recently. Confirm that Claw claims it.
3. **Sticky test:** within same session, submit a second job. Confirm it routes to same executor even if the OTHER one heartbeated more recently in the meantime.
4. **PTY test (after UX-04 deployed):** submit `top` (PTY-required). Confirm routes only to executor that advertises `interactive_pty: true`.
5. **Default test:** in TrustDrawer, set machine 2 as default. Start a NEW session (no sticky). Submit job. Routes to machine 2.
6. **Failover test:** kill machine 1's Claw process mid-session. Submit a new job in the sticky-1 session. Wait 30s — observe `available_to_others_at` passes — machine 2 claims. Banner narrates the failover.
7. **Multi-executor build:** start a multi-builder build. With both machines online and no sticky preference, observe how builders route. Likely all to one executor (recency wins for first, sticky for rest). For testing fan-out, set per-lane labels.
8. **Forced no-capability:** submit job with `required_capabilities: { gpu: true }` when neither executor has GPU. Confirm clear error message.

---

## Decisions Made

### Q: Why pull-based filtering instead of centralized scheduler?
**A:** Existing architecture is pull-based (executors poll). Adding a centralized scheduler is a much bigger change — leader election, stickiness across edge function instances, race conditions on claim. Pull-based with smarter WHERE clause keeps the architecture simple. Trade-off: small dispatch latency variance (poll interval). Acceptable.

### Q: Why 30-second grace period?
**A:** Empirical balance. Typical poll interval is 3-5s (configurable). 30s is 6-10 polls — preferred executor has multiple chances. Long enough to absorb network blips. Short enough that fallback feels responsive when preferred is genuinely down.

### Q: Why recency 60% / load 40% weights?
**A:** Reasoned from product intent. Recency is the primary signal of "user is here." Load matters because piling onto a busy executor when an idle one exists is wasteful. 60/40 surfaces both without either dominating. Tunable; first-pass values.

### Q: Why sticky at session level, not at user level?
**A:** Sessions are the natural unit of work. A user might have a build in session A on laptop and an analysis in session B on desktop simultaneously. Per-user sticky would force one machine to handle both, defeating the multi-executor model.

### Q: Why does sticky clear at 5 min offline, not 30s?
**A:** Sticky represents continuity intent ("this session is happening on this machine"). 30s is fine for routing decisions but too aggressive for session continuity — a user might be in a meeting, then return to find their session jumped machines. 5 min is "long enough to grab coffee." Tunable.

### Q: Why is `current_load` in capabilities (volatile) vs a separate field?
**A:** Capabilities is jsonb that's overwritten on every heartbeat. `current_load` naturally fits there — it changes too. Keeping it in capabilities means scoring reads one column.

### Q: Should `is_default` be enforced as exactly-one or zero-or-one?
**A:** Zero-or-one. Some users won't designate a default — let them. The UNIQUE INDEX with `WHERE is_default = true` enforces "at most one." If user clears default for executor A, none is default until they pick.

### Q: What about per-job manual executor override (advanced user)?
**A:** Out of scope for v1. Power users can set sticky via the StatusChip click-to-pin. Per-job UI override would clutter the composer.

### Q: How does this interact with PRO-02 iteration loops (`executor_id` on the loop)?
**A:** PRO-02 binds a loop to ONE executor at creation. That stays. Iteration loops effectively pick their executor at start; this routing applies to the SUBMIT of that initial selection (the user creates the loop targeting the current sticky/default).

### Q: What if the user has 5 executors and submits a build with 3 builders?
**A:** Each builder's tasks are independent jobs. With sticky session semantics, all builders' tasks would route to the sticky executor. That's the desired behavior for v1 — same machine for the whole build, simplifies file system state. v2 could allow per-lane executor pinning for true distributed builds (e.g., "Lane Architect runs on GPU node, Lane Tests runs on CPU node").

### Q: What about cloud-only Claw nodes (no GUI, just a server somewhere)?
**A:** Same model — they register with executor_token like any Claw. They can be labeled (`zone: 'cloud-us-east'`) and selected via labels (`required_capabilities.labels: ['cloud']`). No special-casing needed.

---

## Open Questions

1. **Should we expose the routing decision in the user's audit log surface?** Power users might want to debug "why did my job go to X." Recommendation: yes, visible in TrustDrawer Executors panel as "Last 10 routing decisions" — but data already in `audit_events`. v1.1 build a viewer.
2. **Cloud "shared" executors (e.g., Maestro hosts a fleet)?** Out of scope. Current model is "user owns their executors." Hosted-Claw is a future business model question.
3. **Should sticky session survive sticky-executor token rotation?** When a user rotates A's token, A goes offline briefly during reconnect. Per current rules, sticky holds for 5 min — covers this. ✓ already handled.
4. **What about user-applied "weight" override?** "Always prefer desktop 2x over laptop." Defer to v1.1 — set-default + sticky covers most needs.

---

## Implementation Order

1. **Migration + types.** Schema additions, indexes, `meets_required_capabilities` SQL function, type additions. Ship alone.
2. **Selection function module.** `_shared/executor-selection.ts`. Unit-test with fixture executor sets and capability requirements.
3. **Capability advertising in Claw.** `packages/maestroclaw/src/index.ts` heartbeat sends extended capabilities. `config.ts` reads `MAESTROCLAW_LABELS`. Test: heartbeat from a machine with PTY → `executors.capabilities.interactive_pty = true`.
4. **executor-api submit integration.** Submit handler invokes selectExecutor, writes preferred_executor_id and available_to_others_at. Test: submit jobs from frontend, inspect DB rows.
5. **executor-api poll integration.** Update poll WHERE clause. Test: two executors poll concurrently, observe correct routing.
6. **Sticky session logic.** First successful claim sets `sessions.sticky_executor_id`. Subsequent submits use it. Auto-clear on 5-min offline.
7. **Frontend job submit updates.** `useThreads`, `useBuildExecution` include required_capabilities. No executor pre-pick.
8. **TrustDrawer ExecutorSection updates.** Multi-executor list, labels, default selector. Test: register 2 executors, edit labels, switch default.
9. **StatusChip routing indicator.** Show current sticky / "auto" / "offline."
10. **In-thread routing chips.** Add ExecutorRoutingChip to CommandResultCard, BuildRunwayCard, IterationCard.
11. **Sticky-offline banner.** When sticky executor is offline-but-grace-not-expired, show banner.
12. **Live verification per acceptance criteria.** Update `MAESTRO_STATE.md` with verified capabilities; update DEPLOY_RUNBOOK with MULTIEXEC-01 deploy section.

Suggested split:
- **Sonnet:** 1, 3, 4, 5, 6, 7, 11, 12 (data, edge integration, hooks)
- **Opus must review step 2** — selection function correctness is critical; bad weights or wrong filter logic = wrong routing for every job
- **Sonnet or Gemini:** 8, 9, 10 (UI components)

---

## What This Spec Does NOT Cover

- **Cross-organization shared executors.** Single-user model.
- **Auto-discovery of executors on local network.** v2 (e.g., "I see there's a Claw on `desktop.local`, register it?").
- **Smart routing based on file proximity** (the file the job touches lives on machine X's git checkout). Implicit via sticky session for v1.
- **Bandwidth/cost-aware routing** (route to cheap-network node when uploading large artifacts). Out of scope.
- **Per-job manual override UI in the composer.** v1.1.
- **GPU job queueing semantics** (jobs that need GPU but no GPU executor — wait or fail?). Per spec, fail with clear error. v1.1 could add "queue for first available GPU executor."
- **Multi-region awareness** (ping latency to executor). Out of scope.
- **Executor "groups" or "pools"** (treat all `[gpu]`-labeled executors as one logical pool). Labels are intersection-matched per job; not pool-based. v2 could add pool semantics.

---

## Hand-off Notes

This is a moderately complex spec because the routing decision affects every single job submission. The TWO things needing Opus eyes:

1. **Step 2: the selection function.** Wrong weights or filter logic = wrong routing for every job downstream. Validate the scoring math against several scenarios before merge.
2. **Step 5: the poll query update.** This is the hot path — runs on every executor's poll cycle. Performance and correctness matter. Use `EXPLAIN ANALYZE` on a populated database before shipping.

Everything else is implementation. Sonnet can move fast. UI work (steps 8-10) can run in parallel with backend work.

If implementing solo on Sonnet, **stop after step 2 and request Opus to validate the selection function** with hand-constructed scenarios:
- Two online, neither sticky, equal recency, different load
- One online sticky, one online not sticky, sticky has older recency
- Sticky offline 4 min (within grace)
- Sticky offline 6 min (past grace)
- Capability mismatch eliminates all
- User-default vs recency conflict

The function's behavior on these scenarios IS the routing model. Get it right.

---

*End of MULTIEXEC-01 spec.*
