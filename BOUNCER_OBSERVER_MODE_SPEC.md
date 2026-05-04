# BOUNCER-02 — Continuous Bouncer (Observer Mode) Spec

**Status:** Ready for review
**Authored:** 2026-05-04 by Opus 4.7
**Implementing agent:** Opus 4.7 (architecture + prompt) + Sonnet 4.6 (implementation)
**Parent plan:** Promoted from "Remaining Non-Audited Risks" to a real spec. Addresses smoketestaudit.md item #5 ("Continuous Bouncer — Bouncer watches during build, not just after").
**Dependencies:**
- `BOUNCER-01` (review profiles) — observer mode honors the active profile.
- `LIVE-01` (concierge live coordinator) — observer findings flow through coordinator narration.
- Optional: `DIFF-04` (provider fallback) — observer skips files generated under fallback to avoid double-flagging known degradation.

---

## Why This Exists

Bouncer today is a **post-mortem auditor** — it reviews the entire build's output after the build is done. That's correct for catching issues but wrong for the user's experience:

- A 40-file build that has a critical SQLi in file #3 burns 37 more file generations before Bouncer flags it.
- The user watches a long build complete, only to be told it's broken.
- The agents that wrote files #4-40 had no signal that something earlier was wrong, so they may have built ON TOP of the bad pattern.
- Cost is wasted on generation that gets thrown away.

The user's mental model is "the Council of agents includes a security advisor who's paying attention." Currently that advisor is asleep until the build ends.

This spec wakes the Bouncer up. **It watches each batch of completed work, comments via the live coordinator, and (in stricter modes) can pause the build before bad patterns propagate.**

---

## The Three Operating Modes

User selects a mode per session (defaults from repo config or user preference):

### `passive` (default for production_app and internal_demo profiles)
Bouncer never runs mid-build. Only runs at end of build (current behavior). For users who don't want extra latency or cost.

### `observer`
Bouncer runs in batches during build (every N completed files OR every M seconds, whichever first). Findings narrate through the live coordinator (LIVE-01) — user sees them but build is **not** paused. Critical findings still get flagged but framed as "heads up, you'll want to address this."

### `gatekeeper`
Same batched runs as observer, but **critical findings pause the build** until user decides:
- Approve and continue (user accepts the risk)
- Pause and rework (user wants to fix before more files are generated)
- Abort

This is the "active board member" mode — slower, costlier, but catches issues before they propagate.

The mode applies to mid-build watching only. Post-build review still always runs (passive mode skips mid-watching but still has the final review).

---

## How "Continuous" Without Being Slow

The naive approach (run full Bouncer review after every file completion) would 5-10x build cost and add seconds of latency per file. Three optimizations make this viable:

### Optimization 1: Batch, don't per-file
Bouncer doesn't review each file individually. It batches:
- **Trigger A:** every 3 newly-completed files since last review.
- **Trigger B:** every 60 seconds since last review.
- **Trigger C:** when a file completes that matches a high-risk pattern (path includes `auth`, `crypto`, `secrets`, `payment`, etc. — configurable in `bouncer.config.json`).

First trigger to fire wins. Cost stays bounded — typical 8-task build runs Bouncer ~3 times mid-build, not 8.

### Optimization 2: Incremental, not cumulative
Each batch reviews **only the files completed since last batch**. Bouncer doesn't re-review files it already saw. Findings table tracks `last_reviewed_at` per file.

### Optimization 3: Lighter prompt for mid-build than post-build
The mid-build prompt is intentionally narrower. It doesn't ask Bouncer to "summarize the project" or "suggest improvements." It asks one focused question: "are any of these N files dangerous to ship?" The post-build review keeps its full prompt.

This drops Bouncer's cost per mid-build run by ~60-70%.

---

## Architecture

```
build_tasks state changes ──┐
                             │
                             ▼
              ┌──────────────────────────────┐
              │ bouncer-watcher edge function │
              │   (NEW)                       │
              │                               │
              │ Listens for trigger conditions│
              │   (3-files-batch, 60s timer,  │
              │    high-risk path)            │
              │ Reads new files since last    │
              │   review                      │
              │ Calls bouncer in 'mid-build'  │
              │   mode with light prompt      │
              │ Stores findings               │
              │ Emits coordinator trigger     │
              │   (bouncer.findings)          │
              │ If gatekeeper mode + critical:│
              │   Pause build via control row │
              └──────────────────────────────┘
                             │
                             ▼
                  bouncer_findings (NEW table)
                             │
                             ▼
                Frontend Realtime renders inline
                Coordinator narrates via LIVE-01
```

The watcher function is event-triggered (just like `build-coordinator`). Frontend posts triggers when files complete; the watcher decides whether to actually run a batch review.

---

## Data Model

### New: `bouncer_findings` table

Distinct from `bouncer_events` (which records full review runs at end of build). `bouncer_findings` records individual issues that may be referenced from multiple review runs.

```sql
CREATE TABLE bouncer_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  build_task_id uuid REFERENCES build_tasks(id),  -- which task produced this file
  file_path text NOT NULL,
  category text NOT NULL,                          -- from BOUNCER-01 FindingCategory
  raw_severity text NOT NULL CHECK (raw_severity IN ('critical','minor')),
  effective_severity text NOT NULL,                -- post-profile reclassification
  is_pedagogical_path boolean DEFAULT false,
  containment_critical boolean DEFAULT false,
  issue text NOT NULL,                             -- short description
  suggestion text,
  -- Lifecycle
  detected_at timestamptz NOT NULL DEFAULT now(),
  detected_in_run text NOT NULL CHECK (detected_in_run IN ('mid_build','post_build')),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id),
  acknowledged_decision text CHECK (acknowledged_decision IN ('approve_continue','pause','abort','fixed_in_subsequent_step',null)),
  -- Tracking re-review behavior
  superseded_by uuid REFERENCES bouncer_findings(id),  -- new finding replaces old one for same file
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bouncer_findings_session ON bouncer_findings(session_id, detected_at DESC);
CREATE INDEX idx_bouncer_findings_unack ON bouncer_findings(session_id) WHERE acknowledged_at IS NULL;
CREATE INDEX idx_bouncer_findings_critical_active
  ON bouncer_findings(session_id)
  WHERE acknowledged_at IS NULL
    AND effective_severity IN ('critical_pause','containment_critical');

ALTER TABLE bouncer_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY findings_owner ON bouncer_findings
  FOR ALL USING (user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE bouncer_findings;
```

### `sessions` extension

```sql
ALTER TABLE sessions ADD COLUMN bouncer_watch_mode text DEFAULT 'passive'
  CHECK (bouncer_watch_mode IN ('passive','observer','gatekeeper'));
ALTER TABLE sessions ADD COLUMN bouncer_watch_paused_at timestamptz;
ALTER TABLE sessions ADD COLUMN bouncer_watch_last_run_at timestamptz;
ALTER TABLE sessions ADD COLUMN bouncer_watch_files_reviewed int DEFAULT 0;
```

`bouncer_watch_paused_at` is set when the watcher pauses a build (gatekeeper mode + critical finding); cleared when user resolves.

### `bouncer.config.json` extensions

```json
{
  "bouncer": {
    "default_profile": "production_app",
    "watch_mode": "observer",
    "high_risk_paths": [
      "**/auth/**",
      "**/crypto/**",
      "**/secrets/**",
      "**/payment/**",
      "**/api/admin/**"
    ],
    "watch_batch_size": 3,
    "watch_timer_seconds": 60
  }
}
```

User-configurable trigger thresholds. Defaults are fine for most cases.

### TypeScript types

```ts
export type BouncerWatchMode = 'passive' | 'observer' | 'gatekeeper';

export type BouncerFindingDetectedIn = 'mid_build' | 'post_build';

export type BouncerFindingDecision =
  | 'approve_continue' | 'pause' | 'abort' | 'fixed_in_subsequent_step';

export interface BouncerFindingRecord {
  id: string;
  session_id: string;
  user_id: string;
  build_task_id?: string | null;
  file_path: string;
  category: FindingCategory;            // existing BOUNCER-01 type
  raw_severity: 'critical' | 'minor';
  effective_severity: FindingClassification; // existing BOUNCER-01 type
  is_pedagogical_path: boolean;
  containment_critical: boolean;
  issue: string;
  suggestion?: string;
  detected_at: string;
  detected_in_run: BouncerFindingDetectedIn;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  acknowledged_decision?: BouncerFindingDecision | null;
  superseded_by?: string | null;
  last_seen_at: string;
}
```

---

## The Mid-Build Bouncer Prompt

Lighter than post-build. One question, structured output.

```
You are Maestro's mid-build security observer. A build is in progress.
You are reviewing files completed since your last review.

PROFILE: {profile}
PEDAGOGICAL_PATHS: {pedagogical_paths_glob_list}

PRIOR FINDINGS IN THIS BUILD (already detected, do not re-flag):
{summary_of_prior_findings_compact}

FILES TO REVIEW:
{for each file:}
  ── {path} ──
  ```{language}
  {full_file_content}
  ```

YOUR JOB:
Identify any security issue in these files that would be DANGEROUS TO SHIP.
Do NOT suggest improvements, naming, or code quality. ONLY security issues.
Do NOT re-flag findings listed above.

Output JSON:
{
  "findings": [
    {
      "file": "path/to/file.ts",
      "category": "sql_injection" | "xss" | "idor" | "csrf" | "jwt_weak" | "hardcoded_credential" | "path_traversal" | "command_injection" | "ssrf" | "open_admin_endpoint" | "public_bind" | "missing_cors" | "vulnerable_dependency" | "insecure_default" | "pii_exposure" | "container_escape" | "other",
      "raw_severity": "critical" | "minor",
      "is_pedagogical_path": true | false,
      "containment_critical": true | false,
      "issue": "1-2 sentences describing the issue",
      "suggestion": "1 sentence suggesting fix"
    }
  ]
}

GUIDELINES:
- If no findings, return { "findings": [] }. Don't invent issues.
- "containment_critical": true ONLY for vulnerabilities that escape the intended sandbox boundary into the host filesystem, real network, other users' data, or build pipeline.
- "is_pedagogical_path": match the file path against PEDAGOGICAL_PATHS globs. If matched, the user is intentionally building a vulnerable lesson.
- Stay narrow. Don't flag style. Don't suggest improvements. Only flag what could leak credentials, escalate privileges, leak data, or compromise the host.
- Critical findings should be REAL critical. A missing input length check is "minor" unless it leads to a real exploit.
```

### Why this prompt is narrower than post-build

- **No "summarize the project"** — that's expensive and not what we need mid-build.
- **No quality suggestions** — only security.
- **Prior findings list** — prevents Bouncer from re-flagging the same issue across batches.
- **JSON contract** — direct mapping into `bouncer_findings` rows.

### Model choice
**Sonnet 4.6.** Bouncer needs strong reasoning for security analysis. Haiku is too shallow for catching subtle vulnerabilities. The cost is the cost — but mitigated by batching (3 mid-build runs vs 8 file-by-file).

Hard cap: **$0.50 per build for mid-build watching.** Beyond that, watcher silences for the rest of the build (post-build review still runs). User configurable.

---

## Trigger Conditions

The `bouncer-watcher` edge function evaluates these on each invocation:

```ts
function shouldRunBatch(session: Session, recentFiles: BuildTask[]): boolean {
  const lastRun = session.bouncer_watch_last_run_at;
  const newSinceLastRun = recentFiles.filter(t =>
    t.completed_at > (lastRun ?? session.created_at)
  );

  // Trigger A: batch size
  if (newSinceLastRun.length >= session.config.watch_batch_size) {
    return true;
  }

  // Trigger B: timer
  const secondsSinceLastRun = lastRun
    ? (Date.now() - new Date(lastRun).getTime()) / 1000
    : Infinity;
  if (secondsSinceLastRun >= session.config.watch_timer_seconds && newSinceLastRun.length > 0) {
    return true;
  }

  // Trigger C: high-risk path completed
  for (const task of newSinceLastRun) {
    if (matchesAny(task.file_path, session.config.high_risk_paths)) {
      return true;
    }
  }

  return false;
}
```

The watcher is invoked from `useBuildExecution.ts` whenever a task completes — but the watcher itself decides whether to actually run a Bouncer review.

---

## The Pause Flow (Gatekeeper Mode)

When watcher finds a `containment_critical` or `critical_pause` finding AND mode is `gatekeeper`:

1. Set `sessions.bouncer_watch_paused_at = now()`.
2. Insert `iteration_controls`-style row in a new `build_pauses` table OR (simpler) flip a flag and emit a coordinator trigger of type `bouncer.critical_pause`.
3. The build dispatcher in `useBuildExecution.ts` checks `session.bouncer_watch_paused_at` before dispatching the next task. If set, it stops claiming new tasks and emits a "paused" status.
4. UI shows the gatekeeper card (similar to coordinator's action_required card):
   ```
   ⚠ Bouncer paused the build.
   Critical finding in src/api/admin/users.ts:
   "User-supplied 'role' parameter assigned directly to JWT claims. Allows arbitrary privilege escalation."

   [ Approve and continue ]  [ Pause for rework ]  [ Abort build ]
   ```
5. User decision writes back: `approve_continue` clears the pause; `pause` keeps it set indefinitely; `abort` terminates the build.

The pause is a soft pause — already-running tasks complete naturally; only NEW dispatches are blocked. User isn't punished by losing in-flight work.

---

## Integration With LIVE-01 (Coordinator Narration)

When the watcher writes findings, it ALSO emits a coordinator trigger so the Concierge speaks about the finding inline:

```
[Concierge] Bouncer flagged a JWT issue in `src/api/admin/auth.ts` —
  user-controlled role assignment. Heads up.
```

In observer mode, that's it — narration only. In gatekeeper mode, the coordinator's message includes the action card.

The trigger payload:
```json
{
  "trigger_type": "bouncer.findings",
  "trigger_context": {
    "findings_count": 1,
    "highest_severity": "critical_pause",
    "summary": "JWT role injection in src/api/admin/auth.ts",
    "watch_mode": "gatekeeper"
  }
}
```

The coordinator's existing prompt accepts this trigger; no separate UI surface needed for observer mode. Gatekeeper mode adds the action card via `suggested_action: { kind: 'bouncer_pause_resolution', params: {...} }`.

---

## Profile-Aware Reclassification (Reuse from BOUNCER-01)

The watcher applies the same matrix reclassification logic from `BOUNCER-01`:

1. LLM returns raw findings with `category` + `raw_severity` + `is_pedagogical_path` + `containment_critical`.
2. Watcher imports `reclassifyFinding()` from `_shared/bouncer-profiles.ts`.
3. `effective_severity` is computed per finding before storing.
4. Mid-build pause logic only triggers on `effective_severity === 'critical_pause'` or `containment_critical`. A pedagogical SQLi in `training_lab` profile does NOT pause the build (it's `expected`).

This means the watcher inherits all of BOUNCER-01's profile awareness for free. No duplicate matrix.

---

## File-Level Changes

### New
- `supabase/functions/bouncer-watcher/index.ts` — the watcher edge function.
- `supabase/functions/_shared/bouncer-watcher-prompt.ts` — the lighter mid-build prompt.
- `src/components/reveal/EventCards/BouncerWatchCard.tsx` — observer/gatekeeper findings card.
- `src/hooks/useBouncerWatch.ts` — frontend hook that posts triggers when tasks complete.
- New migration `{ts}_bouncer_observer.sql` — `bouncer_findings` table + sessions extension.

### Modified
- `src/types/index.ts` — types listed above.
- `src/hooks/useBuildExecution.ts` — POST trigger to `bouncer-watcher` on each task completion. Check `bouncer_watch_paused_at` before dispatching new task.
- `supabase/functions/bouncer/index.ts` — when running post-build review, fetch existing `bouncer_findings` records (mid-build) and merge with post-build findings; mark mid-build findings still relevant as `last_seen_at: now()` and stale ones as superseded.
- `src/components/reveal/PlanCards/ReviewProfileCard.tsx` — add "Watch mode" sub-selector (passive/observer/gatekeeper). When profile is `production_app`, default to `passive`. Concierge can suggest `observer` for builds with `pre_build` intent and >5 lanes.
- `src/components/reveal/BuildRunwayCard.tsx` — render in-flight findings inline as they appear (small chips next to the affected file in the task list). Render gatekeeper pause card prominently.
- `MAESTRO_STATE.md` — Stable Architecture additions.

### Optional but recommended
- `src/components/reveal/BuildWorkspace.tsx` — same in-flight findings rendering for the advanced surface.

---

## Acceptance Criteria

1. **Passive mode (default for production):** No mid-build Bouncer runs. Post-build review unchanged from current behavior. No `bouncer_findings` rows with `detected_in_run='mid_build'`.
2. **Observer mode:** A 9-file build with a planted critical SQLi in file #2 produces a `bouncer_findings` row visible in the UI by the time file #5 completes (3-file batch trigger). Coordinator narrates the finding. Build continues to completion.
3. **Gatekeeper mode + critical:** Same setup. After watcher batch fires and finds critical, build pauses (no new task dispatches). Pause card appears with three buttons. Click "Approve and continue" → build resumes.
4. **Gatekeeper mode + pedagogical:** Same setup but profile is `training_lab` and the SQLi is in `src/challenges/sqli/`. Watcher detects the issue but reclassifies to `expected`. Build does NOT pause.
5. **Containment-critical hard floor:** Plant a `child_process.exec(req.body.cmd)` in `src/api/admin/exec.ts` with profile `security_ctf`. Watcher detects, marks `containment_critical: true`. Build pauses regardless of profile or watch mode. (For CTF profile, the floor is still enforced.)
6. **Re-review skip:** Same finding re-detected on next batch run is NOT created as duplicate row. The original `bouncer_findings` row's `last_seen_at` is updated.
7. **Pedagogical narration in non-pause modes:** In `training_lab` + `observer`, even pedagogical findings are narrated softly: "Pedagogical SQLi detected in `src/challenges/sqli/route.ts` (expected per profile)." User isn't surprised when post-build review summarizes it.
8. **Budget cap:** Set `bouncer_watch_budget_usd` to $0.05 (low). Run a chaotic build. Watcher silences after a few invocations. Build proceeds normally; coordinator notes "(bouncer watcher paused — budget reached)."
9. **Gatekeeper soft pause:** Build is mid-flight with 4 tasks running when watcher pauses. The 4 in-flight complete normally; only NEW dispatches are blocked.
10. **Integration with LIVE-01:** Each watcher run that produces findings emits a coordinator trigger. Coordinator narrates appropriately based on tone (observer = info/warning; gatekeeper critical = action_required).
11. **Audit trail:** Every watcher invocation produces a `coordinator_invocations` row (if invoked via coordinator) AND a `bouncer_events` row tagged as mid-build. Findings tracked in `bouncer_findings`.
12. **Post-build merge:** End-of-build Bouncer review fetches `bouncer_findings` and presents a unified view. UI distinguishes "found mid-build" vs "found at end."

---

## Verification (Live Tests)

1. **Setup:** create a known-vulnerable scaffold across multiple files. Plant findings in files 2, 5, and 8 of a 10-file build.
2. **Observer mode smoke:** select `observer` mode, run build. Confirm:
   - Watcher fires within 60s of each batch threshold
   - Findings appear in UI by build completion
   - Coordinator narrates each batch's findings
   - Build does NOT pause
3. **Gatekeeper smoke:** same scaffold, gatekeeper mode. Confirm build pauses after the planted finding in file 2 is detected. Click "Approve and continue" — build resumes. Watch for next finding (file 5) to also pause.
4. **Profile interaction:** add `training_lab` profile selection. Same scaffold but findings in `src/challenges/`. Confirm pedagogical findings don't pause; containment-critical (planted separately) still does.
5. **Budget cap:** set `$0.05` budget. Long build. Confirm watcher silences mid-way; UI surfaces the pause state.
6. **Refresh resilience:** mid-build, refresh browser. Build continues; in-flight findings still in DB; reload UI shows them.

---

## Decisions Made

### Q: Why a separate `bouncer_findings` table when `bouncer_events` already exists?
**A:** `bouncer_events` records full review runs (one row per Bouncer execution). `bouncer_findings` records individual issues detected. A single mid-build run can produce 3 findings. Post-build run might re-detect 2 of them and find 1 new. Modeling findings independently lets us track issue lifecycle (detected → acknowledged → fixed-in-subsequent-step → still-present-at-end) without conflating with run history.

### Q: Why batched, not per-file?
**A:** Cost and latency. Per-file would 8x the Bouncer LLM calls per build. Batching (3 files or 60s) keeps the cost manageable while still catching issues before too much downstream work happens. Per-file becomes viable when models get faster/cheaper.

### Q: Why Sonnet for the watcher and not Haiku?
**A:** Security analysis needs reasoning. Haiku misses subtle vulnerabilities (mixed up control flow, indirect injection paths, framework-specific issues). The watcher runs 2-3 times per typical build, not 30 — so total cost is bounded.

### Q: Why a separate watcher edge function instead of extending `bouncer`?
**A:** Different prompt, different state model (incremental vs cumulative), different invocation pattern (event-driven vs end-of-build). Sharing one function would force flag-laden branches. Two functions sharing `_shared/` modules is cleaner.

### Q: Why does observer mode narrate even pedagogical findings?
**A:** Transparency. The user selected `training_lab` profile knowing what they're doing, but they should still see "Bouncer noted the pedagogical SQLi" so they don't worry it was missed. Quiet acknowledgment, not blocking flag.

### Q: What about test files?
**A:** Test files (matching `**/*.test.ts`, `**/*.spec.*`, `__tests__/**`) get a different treatment: only `containment_critical` findings get flagged. Mock secrets in tests, intentional bad inputs for negative-case testing, etc., are expected and shouldn't block. This is matrix-encoded.

### Q: Does the watcher review files generated under DIFF-04 fallback?
**A:** Yes — fallback files might be lower quality from a stressed/wrong model. Don't skip them. But the coordinator's narration should mention "this file was generated under fallback to <model>" so user has context for the finding.

### Q: What if the watcher itself fails (LLM error, timeout)?
**A:** Silent failure with retry. Failed watcher invocation logs to `coordinator_invocations` with rationale `watcher_failed`. Build continues normally. Post-build full review still runs and catches anything missed.

### Q: What's the user's signal that observer mode is engaged?
**A:** A small Bouncer-watching badge in BuildRunwayCard's header — pulsing eye icon when `watch_mode != 'passive'`. On hover: "Observing live. Findings will appear as they're detected."

### Q: Per-finding override — can user dismiss a single finding?
**A:** Yes via `acknowledged_decision = 'fixed_in_subsequent_step'` — user can mark "I see it, but I'm fixing it later in this same build, don't pause." Mid-build dismissal. Audit-logged. Useful when user knows the agent will write `auth.ts` correctly in a later task that overwrites the flagged version.

---

## Open Questions

1. **Should observer mode be the default for new sessions?** It's the "this product is alive" mode but has cost implications. Recommendation: observer is default for `internal_demo`, `training_lab`, `security_ctf` profiles; passive default for `production_app` (where users likely want speed). User can override.
2. **What happens during PRO-02 iteration loops?** Does the watcher review iteration step diffs? Recommendation: out of scope for v1. Iteration loops have their own per-step verification command which is the user's check. Watcher is build-mode only.
3. **Cross-file vulnerabilities (e.g., file A defines safe API, file B uses it unsafely).** Mid-build watcher only sees recently-completed files. Cross-file issues may not surface until post-build review. Acknowledge this as a v1 limitation; v2 could pass prior file context.
4. **Watcher cost in cost rollup card (DIFF-01).** Watcher LLM spend should be a separate line in the rollup. Coordinate when DIFF-01 ships.

---

## Implementation Order

1. **Migration + types.** `bouncer_findings` table, sessions extension, type additions. Ship alone.
2. **Watcher edge function skeleton.** `bouncer-watcher/index.ts` with stub that just inserts a fake finding. Test via curl.
3. **Watcher prompt module.** `bouncer-watcher-prompt.ts` with the narrowed prompt and prior-findings summary builder.
4. **Trigger evaluation logic.** `shouldRunBatch()` function — decides if this invocation actually runs the LLM.
5. **LLM integration.** Wire prompt → orchestrate (Sonnet call) → JSON parsing → reclassification (reuse BOUNCER-01) → store findings. Test against fixture files.
6. **Frontend hook.** `useBouncerWatch` posts triggers from `useBuildExecution` on task completion.
7. **`BouncerWatchCard` component.** Renders findings inline. Tone-styled. Action buttons in gatekeeper mode.
8. **Pause flow.** `useBuildExecution` checks `bouncer_watch_paused_at` before dispatching. UI shows pause state.
9. **LIVE-01 integration.** Watcher emits coordinator trigger of type `bouncer.findings`. Coordinator's prompt extended to handle it.
10. **Post-build merge.** Bouncer's existing review fetches mid-build findings, merges into final result.
11. **ReviewProfileCard watch_mode selector.** UI for picking mode.
12. **Live verification per acceptance criteria.** Update status + state docs.

Suggested split:
- Sonnet: 1-6, 8, 10-11 (data + LLM + pause logic)
- Sonnet or Gemini: 7 (UI component)
- **Opus: review step 3 (prompt) before merge** — same critical reason as LIVE-01: voice/scope is set by the prompt, hard to change later
- Opus: review step 4 (trigger logic) — too-frequent triggers blow the budget; too-rare misses issues

---

## Hand-off Notes

This spec depends on three other specs being shipped first:
- **BOUNCER-01** for the reclassification matrix (this spec imports `reclassifyFinding`)
- **LIVE-01** for the coordinator narration (this spec emits triggers consumed by coordinator)
- **DIFF-04** is optional — observer's "generated under fallback" annotation is nicer with it

If implementing before all three are live, the watcher can ship with stubs:
- BOUNCER-01 not shipped → watcher uses default `production_app` matrix; profile selection is hidden in UI.
- LIVE-01 not shipped → watcher writes findings to DB and renders directly in `BouncerWatchCard`; no coordinator narration.
- DIFF-04 not shipped → "generated under fallback" annotation absent.

But the cleaner path is to ship BOUNCER-01 + LIVE-01 first, then BOUNCER-02 builds on top. Sequence the work order.

---

*End of BOUNCER-02 spec.*
