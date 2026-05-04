# PRO-02 — Iteration Loop Primitive Spec

**Status:** Ready for review
**Authored:** 2026-05-03 by Opus 4.7
**Implementing agent:** Opus 4.7 (architectural) + Sonnet (data/UI) + Gemini (UI components if available)
**Parent plan:** `IMPLEMENTATION_PLAN.md` task `PRO-02`
**Why Opus-only for the core:** This is a new product primitive with non-obvious state machine, trust model, and failure handling. Architecture decisions here propagate everywhere.
**Reading order before implementing:** `IMPLEMENTATION_PLAN.md` (master) → this spec → `SEC-02_TRUST_MODEL_SPEC.md` (trust integrates) → `PRO-01_DELIBERATION_ROUND_SPEC.md` (deliberation-on-diffs is a future integration).

---

## The Core Insight

Maestro currently has two execution modes:
- **One-shot execute:** "run this command" — ends in one round trip.
- **Build:** "build me this feature" — multi-file orchestration with PRs.

The most valuable everyday developer workflow lives **between these two**: tight iteration loops. "Look at this file, suggest a fix, apply it, run the test, fix the test failure, repeat until it passes."

This is what Cursor's Apply flow does. What Claude Code's autonomous mode does. What aider does. **Maestro doesn't have a primitive for it.** That gap is why a developer would still need Cursor/CC alongside Maestro.

PRO-02 closes the gap. Maestro becomes a complete daily-driver.

---

## What Makes Maestro's Iteration Loop Different

Same primitive, but Maestro's version has structural advantages no competitor has:

1. **Multi-agent capable.** Iteration steps can call multiple agents to propose competing diffs and pick the best one. (Future PRO-01 + PRO-02 integration: deliberate on diffs.)
2. **Local execution.** Verification commands run on the user's actual machine with the actual environment, not a remote sandbox. Tests, builds, type checkers — all real.
3. **Auditable.** Every step persisted. Every diff reviewable. Every failure traced. Cursor and CC don't keep this kind of trail.
4. **Bouncer-aware.** Integration point: high-severity diffs route through the Bouncer for security review even mid-iteration.
5. **Repo memory.** DIFF-02 per-repo memory feeds context. The loop knows what was tried last time.
6. **User in the loop.** User can intervene at any step — pause, edit goal, abort, approve unusual diffs. Cursor and CC are largely fire-and-forget.

The product position: **"iteration with a board of directors and a real test runner."**

---

## Why This Is Hard — Five Failure Modes

Address all five together or the feature ships as a toy:

### Failure Mode 1: Infinite loops
Agent proposes diff → fails verification → proposes a slightly different diff → fails again → repeat forever. Solution: hard step budget, time budget, and detection of "diff is repeating itself" (hash compare last N proposed diffs).

### Failure Mode 2: Scope creep
Agent decides to "fix the test" by also rewriting the framework. Solution: scope_paths enforcement, with explicit user-approval interrupt when agent wants to step outside scope.

### Failure Mode 3: Concurrent edit conflicts
User has the file open in their editor, agent proposes a diff based on file-as-of-step-1, user saves their own edit, agent's diff applies on stale base. Solution: file content hashing per step. If hash mismatch, re-read and re-propose.

### Failure Mode 4: Verification false positives
Test passes but for the wrong reason (agent commented out the assertion). Solution: pre-verification snapshot of the test count and content; flag suspicious changes to test files.

### Failure Mode 5: Unrecoverable state mid-loop
Verification command crashes; partial diff applied; file syntax now broken. Solution: per-step git checkpoint with automatic rollback on apply-then-verify-fail. Loop never leaves the repo in a worse state than it started.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│ FRONTEND (browser)                                       │
│                                                          │
│  IterationCard.tsx ─── live-renders steps as they arrive│
│  useIterationLoop.ts ── creates loop, sends control     │
│                                                          │
│      ▲ Realtime subscribe to iteration_steps           │
│      │                                                  │
│      ▼ create iteration_loops row, write controls       │
└─────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│ SUPABASE (DB + Realtime)                                 │
│                                                          │
│  iteration_loops    — config + status                    │
│  iteration_steps    — per-step audit trail + state       │
│  iteration_controls — pause/abort/edit-goal             │
│  iteration_locks    — file-path level concurrency       │
└─────────────────────────────────────────────────────────┘
              ▲
              │ Realtime subscribe to iteration_loops
              │ + iteration_controls; write iteration_steps
              ▼
┌─────────────────────────────────────────────────────────┐
│ MAESTROCLAW WORKER (local)                               │
│                                                          │
│  iteration-runner.ts ── the loop driver                 │
│  Calls claude_code adapter or other for diff proposals  │
│  Applies diffs locally with git checkpointing           │
│  Runs verification commands                              │
│  Watches iteration_controls for user interrupts         │
└─────────────────────────────────────────────────────────┘
```

**Why the Claw drives the loop, not the edge function:**
- Edge functions have 50s timeout. A 10-step loop with verification commands is minutes, not seconds.
- File reads, diff applies, and verification all need local access. The Claw is already there.
- The Claw can watch a control table for user intervention without polling the user — fast response to abort/pause.
- The frontend gets a live feed via Realtime without driving the loop itself.

**Why not have the edge function drive and just dispatch jobs to the Claw per step:**
- Round-trip latency per step (frontend → edge → Claw → edge → frontend → next step) compounds across 10 steps. Loop on the Claw, push events to frontend.

---

## Data Model

### `iteration_loops` table

```sql
CREATE TABLE iteration_loops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  thread_id uuid REFERENCES threads(id),

  -- Config (set on creation, immutable except via control)
  goal text NOT NULL,
  scope_paths text[] NOT NULL,
  verification_command text,                    -- e.g., "npm test src/auth.test.ts"
  verification_adapter text DEFAULT 'approved_shell',
  max_steps int NOT NULL DEFAULT 10,
  total_timeout_seconds int NOT NULL DEFAULT 300,
  auto_apply boolean DEFAULT false,             -- diffs apply without user approval if true
  agent_id uuid REFERENCES agents(id),          -- which agent runs the loop (claude_code adapter)
  executor_id uuid REFERENCES executors(id),    -- which Claw runs it

  -- Status (mutable as loop progresses)
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN (
      'pending',         -- created, awaiting Claw claim
      'running',         -- Claw is iterating
      'awaiting_approval', -- pending user approval of a diff
      'paused',          -- user requested pause
      'succeeded',       -- verification passed
      'failed',          -- gave up after max_steps or timeout
      'aborted',         -- user aborted
      'unrecoverable'    -- agent declared can't fix, or rollback failed
    )),
  step_count int NOT NULL DEFAULT 0,
  current_step_id uuid REFERENCES iteration_steps(id),
  termination_reason text,                      -- human-readable explanation on terminal state
  starting_commit_sha text,                     -- git rev-parse HEAD before loop started
  ending_commit_sha text,                       -- after loop ended (may equal starting if rolled back)

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

CREATE INDEX idx_iteration_loops_user_status ON iteration_loops(user_id, status);
CREATE INDEX idx_iteration_loops_session ON iteration_loops(session_id);
CREATE INDEX idx_iteration_loops_executor_pending
  ON iteration_loops(executor_id) WHERE status = 'pending';

-- RLS: user owns their loops
ALTER TABLE iteration_loops ENABLE ROW LEVEL SECURITY;
CREATE POLICY iteration_loops_owner ON iteration_loops
  FOR ALL USING (user_id = auth.uid());
```

### `iteration_steps` table

```sql
CREATE TABLE iteration_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_id uuid REFERENCES iteration_loops(id) ON DELETE CASCADE NOT NULL,
  step_number int NOT NULL,                     -- 1-indexed within the loop

  -- State machine
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN (
      'pending',
      'reading_files',
      'proposing_diff',
      'awaiting_approval',
      'applying',
      'verifying',
      'succeeded',
      'failed',
      'aborted',
      'rolled_back'
    )),

  -- Read phase
  files_read jsonb DEFAULT '[]'::jsonb,         -- [{ path, sha256, content_truncated_to_1k? }]

  -- Propose phase
  proposed_diff text,                            -- unified diff format
  proposed_diff_hash text,                       -- sha256 of diff for repeat-detection
  proposed_diff_files text[],                    -- paths the diff would touch
  proposal_rationale text,                       -- agent's explanation
  agent_response_id uuid REFERENCES responses(id), -- link to the underlying broadcast/agent call

  -- Approval phase
  approval_required boolean DEFAULT true,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),

  -- Apply phase
  apply_succeeded boolean,
  apply_error text,
  pre_apply_commit_sha text,                    -- so we can roll back this step

  -- Verify phase
  verification_started_at timestamptz,
  verification_completed_at timestamptz,
  verification_exit_code int,
  verification_stdout text,                      -- truncated to 8KB
  verification_stderr text,                      -- truncated to 8KB
  verification_succeeded boolean,

  -- Terminal
  terminal_reason text,
  rolled_back boolean DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_iteration_steps_loop ON iteration_steps(loop_id, step_number);
CREATE INDEX idx_iteration_steps_state ON iteration_steps(state) WHERE state != 'succeeded';

ALTER TABLE iteration_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY iteration_steps_via_loop ON iteration_steps
  FOR ALL USING (
    loop_id IN (SELECT id FROM iteration_loops WHERE user_id = auth.uid())
  );
```

### `iteration_controls` table

User-issued controls (pause/abort/edit-goal) flow through this table so the Claw watches one source of truth.

```sql
CREATE TABLE iteration_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  loop_id uuid REFERENCES iteration_loops(id) ON DELETE CASCADE NOT NULL,
  control_type text NOT NULL
    CHECK (control_type IN ('pause','resume','abort','edit_goal','approve_diff','reject_diff','approve_step_anyway')),
  payload jsonb DEFAULT '{}'::jsonb,            -- e.g., { new_goal: "..." } for edit_goal
  step_id uuid REFERENCES iteration_steps(id),  -- nullable; required for approve/reject_diff
  applied_at timestamptz,                        -- when Claw acknowledged this control
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_iteration_controls_loop_unapplied
  ON iteration_controls(loop_id) WHERE applied_at IS NULL;

ALTER TABLE iteration_controls ENABLE ROW LEVEL SECURITY;
CREATE POLICY iteration_controls_via_loop ON iteration_controls
  FOR ALL USING (
    loop_id IN (SELECT id FROM iteration_loops WHERE user_id = auth.uid())
  );
```

### `iteration_locks` table

Prevents two loops or a build from racing on the same files.

```sql
CREATE TABLE iteration_locks (
  path text NOT NULL,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  repo_full_name text NOT NULL,                 -- "owner/repo"
  loop_id uuid REFERENCES iteration_loops(id) ON DELETE CASCADE NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,              -- safety release if Claw dies; default acquired_at + 10 min
  PRIMARY KEY (path, user_id, repo_full_name)
);

CREATE INDEX idx_iteration_locks_loop ON iteration_locks(loop_id);
CREATE INDEX idx_iteration_locks_expiry ON iteration_locks(expires_at);
```

A periodic edge function (or `executor-api` poll handler) sweeps expired locks. Build dispatch and iteration creation must check this table before claiming files.

### TypeScript types in `src/types/index.ts`

```ts
export type IterationLoopStatus =
  | 'pending' | 'running' | 'awaiting_approval' | 'paused'
  | 'succeeded' | 'failed' | 'aborted' | 'unrecoverable';

export type IterationStepState =
  | 'pending' | 'reading_files' | 'proposing_diff' | 'awaiting_approval'
  | 'applying' | 'verifying' | 'succeeded' | 'failed' | 'aborted' | 'rolled_back';

export interface IterationLoop {
  id: string;
  session_id: string;
  user_id: string;
  thread_id?: string | null;
  goal: string;
  scope_paths: string[];
  verification_command?: string | null;
  verification_adapter?: string;
  max_steps: number;
  total_timeout_seconds: number;
  auto_apply: boolean;
  agent_id?: string | null;
  executor_id?: string | null;
  status: IterationLoopStatus;
  step_count: number;
  current_step_id?: string | null;
  termination_reason?: string | null;
  starting_commit_sha?: string | null;
  ending_commit_sha?: string | null;
  created_at: string;
  updated_at: string;
  started_at?: string | null;
  completed_at?: string | null;
}

export interface IterationStep {
  id: string;
  loop_id: string;
  step_number: number;
  state: IterationStepState;
  files_read?: { path: string; sha256: string }[];
  proposed_diff?: string | null;
  proposed_diff_hash?: string | null;
  proposed_diff_files?: string[];
  proposal_rationale?: string | null;
  agent_response_id?: string | null;
  approval_required: boolean;
  approved_at?: string | null;
  approved_by?: string | null;
  apply_succeeded?: boolean | null;
  apply_error?: string | null;
  pre_apply_commit_sha?: string | null;
  verification_started_at?: string | null;
  verification_completed_at?: string | null;
  verification_exit_code?: number | null;
  verification_stdout?: string | null;
  verification_stderr?: string | null;
  verification_succeeded?: boolean | null;
  terminal_reason?: string | null;
  rolled_back?: boolean;
  created_at: string;
  updated_at: string;
}

export type IterationControlType =
  | 'pause' | 'resume' | 'abort' | 'edit_goal'
  | 'approve_diff' | 'reject_diff' | 'approve_step_anyway';

export interface IterationControl {
  id: string;
  loop_id: string;
  control_type: IterationControlType;
  payload: Record<string, unknown>;
  step_id?: string | null;
  applied_at?: string | null;
  created_at: string;
}
```

---

## The Per-Step State Machine

```
                    ┌──────────────┐
                    │   pending    │  (just created, waiting for Claw claim or prior step done)
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐
                    │ reading_files│  Claw reads files in scope, hashes contents
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐
                    │proposing_diff│  Claw calls agent (claude_code adapter) with read context
                    └──────┬───────┘
                           ▼
                    ┌──────────────┐
                    │   approval   │  If approval_required, wait for user
                    │   required?  │
                    └──┬────────┬──┘
                       │YES     │ NO (auto_apply)
                       ▼        │
              ┌────────────────┐│
              │awaiting_approval││
              └────┬────┬──────┘│
                   │    │       │
              approve  reject   │
                   │    │       │
                   ▼    ▼       ▼
                  ┌────────────────┐
                  │   applying     │  Claw makes git checkpoint, applies unified diff
                  └─┬─────┬────────┘
                    │     │
                  fail   succ
                    │     │
                    ▼     ▼
       ┌────────────┐  ┌──────────────┐
       │   failed   │  │   verifying  │ Claw runs verification_command
       └────────────┘  └─┬───────────┬┘
                         │           │
                       fail         succ
                         │           │
                         ▼           ▼
          ┌──────────────────┐  ┌──────────────┐
          │  failed +        │  │  succeeded   │  Loop terminates, status='succeeded'
          │  feed back to    │  └──────────────┘
          │  next step's     │
          │  reading context │
          └────────┬─────────┘
                   ▼
              (next step starts as 'pending')
```

### Loop-level termination check (between steps)

Before creating step N+1, the runner checks:
1. **Step budget exceeded:** `step_count >= max_steps` → `failed` with reason `"max_steps_exceeded"`.
2. **Time budget exceeded:** `now() - started_at > total_timeout_seconds` → `failed` with reason `"timeout"`.
3. **Repeating diff:** if the last 3 proposed diffs have the same hash → `failed` with reason `"agent_stuck"`.
4. **Control: abort received:** unprocessed `iteration_controls` row with `control_type='abort'` → `aborted`.
5. **Control: pause received:** transition to `paused`, do not create next step until `resume` arrives.
6. **Control: edit_goal received:** update `iteration_loops.goal`, mark control applied, continue.

---

## The Agent Prompt — Per-Step Template

Every step's `proposing_diff` phase calls the configured agent (default: claude_code adapter) with this prompt:

```
You are iterating to achieve a goal in a real codebase. The user is watching.

GOAL:
{goal}

SCOPE:
You may only modify these files: {scope_paths}
You may READ files outside scope for context, but propose changes only inside.

CURRENT REPO STATE (after step {N-1}'s changes):
{file_listing_in_scope}

CURRENT FILE CONTENTS (in scope):
{for each file in scope:}
  ── {path} (sha256: {hash}) ──
  ```{language}
  {file_contents}
  ```

VERIFICATION COMMAND:
`{verification_command}`

PRIOR STEPS (chronological, most recent last):
{for each prior step:}
  Step {N}:
    Diff proposed: {summary or "none"}
    Apply result: {success | failed: reason}
    Verification: {pass | fail with last 30 lines of stderr}

YOUR TASK FOR THIS STEP:
Propose a single, focused diff that moves toward the goal. Format your response as JSON:

{
  "rationale": "1-3 sentences explaining what you're changing and why",
  "diff": "<unified diff format, applicable with `git apply`>",
  "expected_outcome": "what verification result you expect after this diff",
  "confidence": "high|medium|low",
  "give_up": false   // set to true ONLY if you genuinely cannot make progress
}

CONSTRAINTS:
- Do NOT modify files outside scope_paths.
- Do NOT include unchanged hunks just to be safe — only the lines that actually change.
- If your previous diff did not work, propose a DIFFERENT approach. Do not retry the same diff.
- If you have tried 3+ different approaches without success, set "give_up": true with a clear "rationale" explaining what would unblock progress (e.g., "the test asserts X but the spec says Y; user must decide").
- The diff MUST apply cleanly against the file contents shown above. The hashes are provided so you know the base.
```

### Why this prompt design

- **File hashes embedded:** lets the runner detect concurrent edit conflicts (agent's diff is against hash X, but file is now hash Y → re-read and re-prompt).
- **Prior steps included:** agent has memory of what failed without us implementing per-loop persistent agent context. The runner just builds it into the prompt each step.
- **`give_up` as explicit signal:** vs trying to detect "agent has given up" from soft language. Hard contract.
- **`expected_outcome`:** lets us flag suspicious agent behavior — if expected_outcome was "test passes" but verification still fails identically, the agent is bluffing.
- **Confidence:** future use — auto-trigger deliberation when low-confidence diff is proposed.

---

## The Diff Application Logic

Critical correctness path. Implementation in `packages/maestroclaw/src/iteration/apply-diff.ts`:

```typescript
async function applyDiffWithCheckpoint(
  workDir: string,
  diff: string,
  scope_paths: string[]
): Promise<ApplyResult> {
  // 1. Verify diff only touches scope files
  const touchedFiles = parseUnifiedDiffPaths(diff);
  for (const f of touchedFiles) {
    if (!matchesScope(f, scope_paths)) {
      return { ok: false, error: `Diff touches out-of-scope file: ${f}` };
    }
  }

  // 2. Git checkpoint (in case we need to roll back THIS step only)
  const sha = await execGit(workDir, ['rev-parse', 'HEAD']);
  // We do NOT commit yet — checkpoint is the SHA we'd reset to.

  // 3. Write diff to temp file
  const diffPath = await writeTempFile(diff);

  // 4. Try to apply with `git apply --check` first (dry run)
  const checkResult = await execGit(workDir, ['apply', '--check', diffPath]);
  if (!checkResult.ok) {
    return { ok: false, error: `git apply --check failed: ${checkResult.stderr}` };
  }

  // 5. Real apply
  const applyResult = await execGit(workDir, ['apply', diffPath]);
  if (!applyResult.ok) {
    // Should be rare since check passed, but handle race
    return { ok: false, error: `git apply failed: ${applyResult.stderr}` };
  }

  // 6. Stage but DO NOT commit. Let the verification step decide.
  await execGit(workDir, ['add', ...touchedFiles]);

  return { ok: true, pre_apply_sha: sha, touched_files: touchedFiles };
}

async function rollbackStep(workDir: string, pre_apply_sha: string): Promise<void> {
  await execGit(workDir, ['reset', '--hard', pre_apply_sha]);
  // Working tree restored. Loop can propose a different diff.
}
```

**Why stage-don't-commit:** the loop should commit only on terminal success (or on user-requested checkpoint). Mid-loop commits pollute history with failed experiments.

**Why git apply over manual file rewrites:** git apply handles patches cleanly, validates context, and lets us use git's own conflict detection. Direct file rewrites lose that.

---

## Verification Command Execution

Per step, after apply succeeds:

```typescript
async function runVerification(
  step: IterationStep,
  loop: IterationLoop,
  workDir: string
): Promise<VerificationResult> {
  if (!loop.verification_command) {
    // No verification = "trust the diff" mode. Used rarely. Mark as succeeded immediately.
    return { ok: true, exit_code: 0, stdout: '', stderr: '' };
  }

  const adapter = await getAdapter(loop.verification_adapter || 'approved_shell');

  // Verification gets its own timeout (loop-level timeout still wraps the whole thing)
  const VERIFY_TIMEOUT_MS = 60_000;

  const result = await adapter.run(
    loop.verification_command,
    workDir,
    VERIFY_TIMEOUT_MS
  );

  // CRITICAL: also analyze the verification command through the kernel.
  // Same security boundary as approved_shell normally has — even though
  // this is internal, defense in depth matters.
  // (Already enforced via the adapter's kernel pre-flight check.)

  return {
    ok: result.success && (result.exit_code === 0 || result.exit_code === undefined),
    exit_code: result.exit_code ?? -1,
    stdout: truncate(result.output, 8 * 1024),
    stderr: truncate(result.error || '', 8 * 1024),
  };
}
```

If verification succeeds → loop terminates with `succeeded`. The loop can then optionally commit the change as a single squashed commit (configurable, default ON).

If verification fails → roll back the step via `rollbackStep()`, write step to `failed` state with verification output, create next step (if budget remains).

**Important:** rollback is per-step, not per-loop. The loop's *cumulative* committed state from PRIOR successful steps stays. Only this step's uncommitted apply is reverted.

Wait — I said "stage don't commit." So actually the rollback is `git reset --hard HEAD` which restores to the last successful state (which is what we want). But this means **the loop must commit at the end of each successful step's verification**, not only at loop-end. Otherwise step N+1's "current state" would not include step N's changes.

Revised: **commit on per-step verification success** with a message like `iteration-loop/{loop_id}/step/{N}: <rationale first line>`. At loop end, the loop's history is N atomic commits. User can optionally squash them via a "Squash to single commit" button on the loop card.

---

## Trust Model Integration

Iteration loops integrate with `SEC-02`'s server-authoritative trust model:

### Loop creation requires approval if:
- Any path in `scope_paths` matches sensitive patterns: `**/.env*`, `**/secrets/**`, `**/auth.{ts,js}`, `**/*credentials*`, etc.
- `auto_apply: true` is requested (auto-applying diffs is itself a trust escalation).
- `verification_command` is not in the trusted-commands registry.

### Per-step approval (when `auto_apply: false`):
- Each step's diff requires user approval before apply.
- Approval mechanism: an `iteration_controls` row with `control_type='approve_diff'` and the step_id. Created by frontend when user clicks Approve on the IterationCard.
- The Claw watches for this row before transitioning step state from `awaiting_approval` to `applying`.

### Per-step approval (when `auto_apply: true`):
- Diffs apply without user approval IF all of:
  - All diff-touched paths are within `scope_paths`
  - No diff-touched path matches sensitive patterns (re-checked per step, not just at loop creation)
  - Confidence is `high` or `medium`
  - Step number ≤ `max_auto_apply_steps` (default 5; safety brake on long loops)
- If any of these fails, step transitions to `awaiting_approval` even with auto_apply on. UI shows "auto-apply paused: needs review" with reason.

### Bouncer integration (deferred to v1.1)
After each successful loop, optionally route the cumulative diff through the Bouncer. Out of scope for first ship — but the data model supports it (just call Bouncer with the loop's diff at termination).

---

## File Locking & Concurrency

Before a loop is allowed to enter `running` status, the Claw must:

1. Compute the file set the loop will touch: union of `scope_paths` (which may be globs) expanded against current repo.
2. Try to insert one row per path into `iteration_locks` with `loop_id=this_loop, expires_at=now()+10min`.
3. If any insert fails (PK conflict on existing lock), the loop:
   - If conflict's lock is expired (`expires_at < now()`), delete the expired lock and retry.
   - Otherwise, transition to `failed` with reason `file_locked: <path> by <other_loop_id>`.

Build dispatch (in `useBuildExecution.ts`) must do the same lock check before claiming build files. If a file is iteration-locked, the build queues until release.

The Claw refreshes its locks' `expires_at` every 5 minutes while the loop is running (Phase B safety so a stuck Claw doesn't hold locks forever — they auto-expire even if the Claw can't release them cleanly).

On loop terminal state (succeeded/failed/aborted/unrecoverable), all locks for this loop are deleted.

---

## UX Surface

### Composer entry point

Add a fourth chip to the `RevealComposer` intent bar: **"Iterate"** (Lightning-bolt icon, blue accent).

When selected, the composer changes shape to a structured form:
- **Goal** (textarea, primary input)
- **Scope** (file path multi-select with glob support; defaults to "currently visible / referenced files")
- **Verification** (text input; suggested by concierge based on goal — e.g. goal "fix the failing test" → suggested `npm test path/to/test`)
- **Auto-apply** (checkbox; default off)
- **Max steps** (number, default 10)

User clicks Send → `useIterationLoop().createLoop({ ... })` → row inserted → Claw claims → loop runs.

### IterationCard component

Renders in the thread (similar to BuildRunwayCard):

```
┌─ Iteration Loop ─────────────────────────────────────────────┐
│ 🔁  Fix the failing test in src/auth.test.ts        [Pause]  │
│                                                               │
│ Scope: src/auth.ts, src/auth.test.ts                         │
│ Verification: npm test src/auth.test.ts                       │
│ Auto-apply: off  ·  Max steps: 10  ·  Step 3 of 10 running   │
│                                                               │
│ ─── Steps ────────────────────────────────────────────       │
│                                                               │
│  ✓ Step 1 — Read files (added: token expiry handler)         │
│      ▶ View diff (37 lines)  ▶ Verification: failed           │
│                                                               │
│  ✓ Step 2 — Fix expiry comparison (off-by-one in epoch ms)   │
│      ▶ View diff (4 lines)  ▶ Verification: failed            │
│                                                               │
│  ⏳ Step 3 — Adjusting clock skew tolerance                  │
│      [proposing diff...]                                      │
│                                                               │
│ [Stop & Keep Changes]  [Stop & Rollback]                      │
└───────────────────────────────────────────────────────────────┘
```

Each step is collapsible. Diff renderer reuses existing diff styling.

### Approval flow

When a step is `awaiting_approval`, the IterationCard inlines an approval panel:

```
┌─ Step 4 — Awaiting your approval ─────────────────────┐
│                                                        │
│ Proposed change (4 files, +24 -8 lines):              │
│ [diff viewer]                                          │
│                                                        │
│ Rationale: "Adding a clock skew tolerance of 30s..."  │
│ Confidence: medium                                     │
│ Expected outcome: test should pass on first attempt   │
│                                                        │
│ [Reject]  [Approve & Continue]  [Approve and Auto-Apply Rest] │
└────────────────────────────────────────────────────────┘
```

"Approve and Auto-Apply Rest" sets `loop.auto_apply = true` for remaining steps — useful if the user has gained confidence in the agent.

### Terminal states

- **succeeded:** ✅ green card with "Loop succeeded in N steps. View commit history."
- **failed:** 🟡 amber card with reason ("Max steps exceeded; last verification: X").
- **aborted:** ⚫ neutral card with "Aborted by user."
- **unrecoverable:** 🔴 red card. Agent's give-up rationale shown prominently. Often actionable for the user to clarify intent.

### Mobile considerations

The structured form composer is unwieldy on mobile. v1: route mobile users to a simplified single-textarea where they describe the loop in natural language ("fix the failing test"); concierge parses goal + scope + verification automatically. Desktop keeps the structured form.

---

## Files To Create / Modify

### New
- `supabase/migrations/{ts}_iteration_loops.sql` — all four tables and indices.
- `supabase/functions/iteration-init/index.ts` — validation + creation entry point. Frontend hits this rather than direct INSERT so server can validate scope, normalize paths, run trust check.
- `packages/maestroclaw/src/iteration/runner.ts` — the loop driver.
- `packages/maestroclaw/src/iteration/apply-diff.ts` — diff application + checkpoint.
- `packages/maestroclaw/src/iteration/verify.ts` — verification execution.
- `packages/maestroclaw/src/iteration/locks.ts` — lock acquisition/release.
- `packages/maestroclaw/src/iteration/prompt.ts` — per-step prompt builder.
- `src/hooks/useIterationLoop.ts` — frontend hook (createLoop, sendControl, subscribe).
- `src/components/reveal/IterationCard.tsx` — the in-thread UI.
- `src/components/reveal/IterationStepRow.tsx` — sub-component for each step.
- `src/components/reveal/IterationApprovalPanel.tsx` — sub-component for awaiting_approval.

### Modified
- `packages/maestroclaw/src/index.ts` — add iteration_loop polling + claim alongside executor_jobs.
- `packages/maestroclaw/src/api.ts` — add `claimLoop`, `reportStep`, `pollControls` API helpers.
- `src/types/index.ts` — types listed above.
- `src/components/reveal/RevealComposer.tsx` — add Iterate intent chip + structured-form variant.
- `src/components/reveal/ClawMode.tsx` — render IterationCard in thread when active loop exists for thread.
- `src/hooks/useThreads.ts` — wire iterate intent → useIterationLoop.createLoop.
- `src/hooks/useBuildExecution.ts` — check iteration_locks before dispatching builds.
- `MAESTRO_STATE.md` — Stable Architecture section adds iteration_loops + new tables.

---

## Acceptance Criteria

1. **Happy path: failing test fix.** Set up `src/foo.test.ts` with a known failing assertion. User submits goal "make this test pass" with scope `src/foo.ts, src/foo.test.ts` and verification `npm test src/foo.test.ts`. Loop runs, agent proposes fix, user approves, fix applies, test passes. Loop terminates `succeeded`. Repo has N commits, one per successful step.
2. **Auto-apply works.** Same scenario with `auto_apply: true`. No approval clicks needed. Loop terminates `succeeded`.
3. **Auto-apply pauses on sensitive file.** Same scenario but agent proposes touching `src/auth.ts` (matches sensitive pattern). Step transitions to `awaiting_approval` despite `auto_apply: true`. UI shows "auto-apply paused: sensitive file."
4. **Max steps termination.** Set max_steps=3 with an unsolvable goal. Loop runs 3 steps, terminates `failed` with reason `max_steps_exceeded`. Repo state is the cumulative result of any successful steps' commits.
5. **Repeating diff detection.** Force agent to propose identical diff 3 times. Loop terminates `failed` with reason `agent_stuck`.
6. **User abort mid-step.** While step is verifying, user clicks Stop. Within 5 seconds, loop transitions to `aborted`. Current step rolls back if not yet committed.
7. **Concurrent edit conflict.** Mid-loop, manually edit a file in scope. Next step's read sees new hash; agent's prompt receives updated context; agent proposes diff against the new state, not the stale one.
8. **Out-of-scope diff rejection.** Force agent to propose touching a file outside scope (via prompt manipulation in test). `apply-diff.ts` rejects; step state becomes `failed` with reason `out_of_scope`. Loop continues to next step (agent gets feedback in next prompt: "your previous diff was rejected for out-of-scope; try again").
9. **Lock acquisition.** Two loops with overlapping scope: second loop fails to acquire locks, transitions to `failed` with reason `file_locked`.
10. **Lock release on terminal.** After loop terminates (any terminal status), `iteration_locks` for that loop are gone.
11. **Realtime UI updates.** Frontend Realtime subscription shows step state changes within 500ms of DB writes. No polling.
12. **Trust integration.** A loop with `verification_command: rm -rf .` is rejected at `iteration-init` (server-side) before any Claw involvement.

---

## Verification (Live Tests)

1. **Setup:** clean repo with one known failing test in `src/foo.test.ts`. Goal: "fix the failing test." Run with auto_apply off.
2. **Happy path live test:** start loop, watch IterationCard render. Each step appears as it transitions. Approve diffs as prompted. Final state: succeeded, test passes, repo has N commits.
3. **Manual concurrent edit test:** while step 2 is verifying, manually edit `src/foo.ts` in your editor. Confirm step 3's prompt includes the updated file content (different hash).
4. **Abort test:** start a long loop, click Stop while step 4 is in `verifying`. Confirm Claw stops within 5s, status `aborted`, no orphan locks.
5. **Sensitive file auto-apply test:** auto_apply on, scope includes `src/auth.ts`. Confirm step transitions to awaiting_approval with sensitive-file reason.
6. **Lock test:** start a loop. While running, attempt to start a second loop with overlapping scope from another tab. Confirm second loop fails immediately with `file_locked`.
7. **Build collision:** start a loop on `src/foo.ts`. Attempt to start a build that includes `src/foo.ts` in lanes. Confirm build dispatch is blocked or queued.
8. **Forced trust violation:** craft a curl call to `iteration-init` with `verification_command: rm -rf .`. Confirm 403/400 with classification rejection.

---

## Decisions Made

### Q: Why drive the loop on the Claw, not the edge function?
**A:** Edge functions cap at ~50s. Loop steps include verification commands that themselves can take 30-60s. Driving on the Claw is the only architecture that doesn't bottleneck on edge timeouts.

### Q: Why commit each successful step instead of squashing at the end?
**A:** Per-step commits enable per-step rollback in git. If step 5 fails verification, we `git reset --hard` to step 4's commit and propose a new step 5. Without per-step commits, we'd need an in-memory rollback that's harder to make correct. Trade-off: commit history is noisy. Mitigation: "Squash" button at loop end, default ON for low step counts.

### Q: Why `git apply` over edit-and-write?
**A:** git apply has hunk-context validation built in. Edit-and-write has no such check — it's blind file mutation. Diff-based apply also makes per-step diffs natively reviewable in the UI.

### Q: Why a separate `iteration_controls` table instead of mutating `iteration_loops`?
**A:** Append-only audit. Two intents racing on the same loop (e.g., user clicks Pause and Abort within 200ms) preserve order in `iteration_controls` and the Claw applies them deterministically. Mutating `iteration_loops` directly would allow lost-update races.

### Q: Why can't `auto_apply` skip approval for sensitive files?
**A:** Auto-apply trust is a UX convenience, not a security gate. Sensitive paths must always have a human-in-the-loop. The user gives broad consent to "let the agent iterate" with auto_apply, but specific consent is required when stakes spike.

### Q: Should iteration loops have per-loop persistent agent context?
**A:** No, in v1. The runner builds the prompt fresh each step from DB state (prior steps' diffs and verification results). This keeps agents stateless from their perspective and ensures restart-resilience: kill the Claw mid-loop, restart, pick up exactly where it was.

### Q: What if the user wants to interrupt with a new instruction mid-loop?
**A:** Two paths:
- **Light edit:** `iteration_controls` with type `edit_goal`. Agent sees new goal in next step's prompt.
- **Heavy edit:** abort the loop, start a new one. The repo is in a known good state (last successful commit), so this is cheap.

### Q: What about when the agent proposes creating a new file?
**A:** Allowed if the new file's path matches `scope_paths`. Glob matching: `src/**/*.ts` matches `src/auth/new.ts`. Use `minimatch` or equivalent. New file paths get added to `iteration_locks` mid-loop (refreshable lock acquire).

### Q: What if `verification_command` itself has a syntax/runtime error (not test failures)?
**A:** Treated as verification failure. Agent's next prompt includes the error. This is correct behavior — many real fixes require fixing your test runner setup as well.

### Q: Bouncer integration?
**A:** Out of scope for v1 ship. Stub the integration point: after `succeeded`, optionally call Bouncer with the cumulative diff. v1.1 adds the user-facing toggle.

### Q: Diff format — unified diff vs JSON file-list-with-content?
**A:** Unified diff. Standard format, applicable with `git apply`, well-supported by viewers, compact. The build pipeline uses JSON manifests because builds create whole files; iteration EDITS files, where diffs are the natural unit.

### Q: How does iteration interact with PRO-01 (deliberation)?
**A:** Future integration: at high-stakes steps (e.g., touching auth code), trigger a mini-deliberation between 2+ agents on the proposed diff before approval. v1 does not include this — keep PRO-02 single-agent. PRO-01 + PRO-02 integration is a v1.2 feature once both have shipped independently.

---

## Open Questions for Human Review

These do NOT block implementation but warrant decision before final design:

1. **Default agent for iteration loops.** Currently spec says "agent_id" in loop config. What's the default if the user doesn't specify? **Recommendation: ClawClaude (claude_code adapter)** — Claude Code is the most reliable diff-proposing agent right now. Fall back to Sonnet via cloud orchestrate if no local executor.
2. **Should we expose loop step retry budget per step?** Currently `max_steps` is loop-wide. Some users may want "agent gets 3 attempts at step 1 before moving on." Defer to v2 unless smoke testing reveals a strong need.
3. **Should successful loops auto-create a PR?** Currently they leave commits on the local branch. Auto-PR would be nice but conflicts with iteration's "tight loop" feel — PR is heavy. Recommend: "Create PR" button after loop succeeds, not automatic.
4. **What's the user's starting branch state?** Loops should run on the current branch. If user is on `main`, loop edits `main` directly — risky. Recommend: loop creation auto-creates a branch `iteration/{loop-id}` if user is on a protected branch (configurable list per repo).

---

## What This Spec Does NOT Cover

- **PRO-01 deliberation on diffs.** Future integration. Each step proposes ONE diff from one agent in v1.
- **Bouncer mid-loop or post-loop integration.** Stub points exist; full integration deferred.
- **Iteration loops on remote repos without local checkout.** Requires the Claw to have a local clone. v2 could add ephemeral checkout via `github-execute` but that's a different architecture.
- **Cost rollup integration (DIFF-01).** Iteration steps are agent calls — they should appear in the cost rollup, but the integration is out of scope here. Add to DIFF-01 acceptance criteria as a follow-up.
- **Multi-machine iteration.** Loop is bound to one executor. If the user has multiple Claws, the user's choice of executor at loop creation time is final.
- **Pause-and-resume across days.** Pause persists in DB but practically the locks expire after 10 minutes. v2 could add long-pause support; v1 expects loops complete within minutes.

---

## Implementation Order

10 steps, each independently shippable. Sonnet can do most; Opus must review steps 5 and 6.

1. **Migration only.** Add the 4 tables. Confirm RLS works. Ship migration alone.
2. **Type additions.** Add types to `src/types/index.ts`. Build clean.
3. **Edge function `iteration-init`.** Validation + insert. Test via curl with various inputs (valid, invalid scope, sensitive verification command). Confirm rejection paths work.
4. **MaestroClaw runner — minimum viable.** Implement `runner.ts` for the happy path: claim loop, single-step read+propose+apply+verify, terminate `succeeded`. No locks yet. No control watching yet. Test against a hardcoded simple loop.
5. **Prompt template (`prompt.ts`).** [OPUS REVIEW REQUIRED]. Real-model test: run a known iteration goal against Claude Code locally, inspect prompt and response. Tune until the JSON output is reliable. Decision point: is the JSON contract working or do we need a different output format?
6. **Diff application (`apply-diff.ts`).** [OPUS REVIEW REQUIRED]. Test against edge cases: out-of-scope diffs, malformed diffs, diffs against stale base, diffs creating new files. Each must produce predictable failure mode.
7. **Locks (`locks.ts`).** Implement acquire/release/refresh. Test concurrent loop attempts.
8. **Control watching.** Add iteration_controls poll/subscribe to runner. Test pause/resume/abort. Test edit_goal mid-loop.
9. **Frontend hook + UI.** `useIterationLoop`, `IterationCard`, `IterationStepRow`, `IterationApprovalPanel`. Test in browser with a real loop.
10. **Composer integration.** Iterate intent chip, structured form. Wire into thread flow. Final smoke tests per acceptance criteria.

After step 10, run all 12 acceptance criteria checks live. Update `IMPLEMENTATION_PLAN_STATUS.md` and `MAESTRO_STATE.md`. Tag a release.

---

## Hand-off Notes

This is the largest single spec in the plan. Suggested split if multiple agents work in parallel:

- **Opus** owns steps 5-6 (prompt + diff). These have the most failure modes.
- **Sonnet** owns steps 1-4 and 7-8 (DB, edge function, runner skeleton, locks, controls). All clear contracts, mechanical implementation.
- **Gemini** can take step 9-10 (frontend) given its long-context strength on multi-file UI work.

If implementing solo on Sonnet, **stop after step 4 and request Opus review** before step 5. The prompt template's JSON contract is where this entire feature succeeds or fails.

If something in this spec turns out to be wrong during implementation — particularly around the diff apply semantics or the prompt JSON output reliability — **stop, document the gap, and request Opus review.** Do not silently improvise. This primitive will be used everywhere; getting it 80% right ships a feature that breaks user trust.

---

*End of PRO-02 spec.*
