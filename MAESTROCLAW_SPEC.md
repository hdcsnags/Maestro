# MaestroClaw v1 — Local Execution Node Specification

*Status: V0.1 SHIPPED + ARTIFACT PIPELINE WORKING — Smoke-tested 2026-04-17, artifact pipeline proven 2026-04-20. See MAESTRO_STATE.md for current status.*

---

## Current State (as of 2026-04-20)

**What's working end-to-end:**
- Executor polls Maestro → claims jobs → runs Claude Code CLI → extracts code from CLI output → stores artifacts in DB → writes files to disk
- Artifacts written to **two locations**: per-job workspace (`job-XXXXXXXX/src/App.tsx`) and session-scoped build folder (`builds/{session_id}/src/App.tsx`)
- Claude Code adapter pipes prompts via **stdin** (not CLI arg) — avoids Windows 8K char truncation
- `extractFileContent()` synthesizes artifacts from `--print` mode text output (largest fenced code block → raw code fallback)
- 3 Claw agents visible in Orchestra drawer + selectable as builders in Pre-Build
- Executor-aware scoring in builder ranking (+60 online, -40 offline)

**What's NOT working yet:**
- Claw agents error on broadcast ("Provider maestroclaw not supported") — build-only, need broadcast filter
- Full Pre-Build UI → Claw → GitHub flow not tested end-to-end (only direct DB job insertion tested)
- Only `claude_code` adapter is functional; `copilot_cli` and `codex_cli` are stubs
- Still v0.1.0 — needs version bump

---

## What This Is

MaestroClaw is Maestro's first local execution node. It runs on your machine, polls Maestro for approved jobs, runs them using local CLI tools (Claude Code, Copilot CLI, Codex), and reports results back.

**Maestro = the brain. MaestroClaw = the hands.**

## Why This Exists

Two concrete problems:

1. **Double-paying problem**: You pay for API tokens through Maestro's edge functions AND you have active subscriptions to Claude Pro, ChatGPT Plus, Copilot, etc. MaestroClaw routes work through the tools you already pay for.

2. **Edge function timeout problem**: Supabase edge functions have a ~26s execution limit. Build v2 works around this with per-file task decomposition, but complex files still risk timeouts. A local executor has no timeout — Claude Code can think for 5 minutes on a hard file if it needs to.

## Architecture Doctrine

These are laws, not suggestions:

1. **Outbound-only** — The worker polls Maestro. Maestro never reaches into your machine. No inbound ports, no exposed shell, no remote command execution.
2. **Approval-gated** — Jobs must be explicitly approved in Maestro before the worker can claim them. Nothing runs silently.
3. **One job at a time** — V1 is serial. One executor, one job, one workspace. Parallelism comes later.
4. **Ephemeral workspaces** — Each job gets a temp directory. Cleaned up after completion/failure. No state leaks between jobs.
5. **Audit everything** — Every claim, heartbeat, stdout line, status change, and result is a persisted event. The trail is the trust layer.
6. **Adapters, not hard-wiring** — The worker never calls `claude` directly. It calls an adapter, which calls `claude`. Swapping tools = swapping adapters, not rewriting the worker.

---

## V1 Scope

### What V1 IS

- One personal executor per user
- One active job at a time
- Outbound poll-based execution loop
- Two adapters: `shell_stub` (smoke test) + `claude_code` (real work)
- Build v2 bridge: `executor_id` on `build_tasks` routes tasks to local execution
- Minimal Maestro UI: executor status, job queue, event log

### What V1 IS NOT

- Not multi-tenant (one user, one machine)
- Not multi-executor (one worker per user for now)
- Not parallel (one job at a time)
- Not a public API (no external consumers)
- Not autonomous (human approves every job)

---

## Data Model

### Table: `executors`

Registered execution nodes.

```sql
CREATE TABLE executors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,                          -- "Michael's MacBook", "Build Server"
  kind text NOT NULL DEFAULT 'personal_node',  -- future: 'shared_node', 'cloud_runner'
  status text NOT NULL DEFAULT 'offline',      -- offline, online, busy, error
  last_seen_at timestamptz,
  capabilities jsonb DEFAULT '{}',             -- { adapters: ["shell_stub","claude_code"], max_concurrent: 1 }
  token_hash text NOT NULL,                    -- bcrypt hash of the executor auth token
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS: owner can CRUD their own executors only
ALTER TABLE executors ENABLE ROW LEVEL SECURITY;
CREATE POLICY executors_owner ON executors
  FOR ALL USING (owner_user_id = auth.uid());
```

### Table: `executor_jobs`

The job queue. Jobs are created in Maestro (web or automated), claimed and run by MaestroClaw.

```sql
CREATE TABLE executor_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id),            -- nullable: not all jobs come from sessions
  executor_id uuid REFERENCES executors(id),           -- null until claimed
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  
  -- Job definition
  job_type text NOT NULL DEFAULT 'code_task',          -- code_task, build_task, review_task
  adapter text NOT NULL DEFAULT 'shell_stub',          -- shell_stub, claude_code, copilot_cli, codex_cli
  prompt text NOT NULL,
  
  -- Repo context (optional)
  repo_url text,
  repo_name text,
  branch text,
  
  -- Safety constraints
  allowed_paths text[] DEFAULT '{}',                   -- file path allow-list
  timeout_seconds int NOT NULL DEFAULT 300,            -- 5 min default
  
  -- Approval gate
  approval_required boolean NOT NULL DEFAULT true,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id),
  
  -- Lifecycle
  status text NOT NULL DEFAULT 'queued',
  -- queued → approved → claimed → running → succeeded | failed | cancelled | expired
  
  -- Results
  result_summary text,
  error_text text,
  artifact_manifest jsonb,                             -- [{ path, content, operation }]
  
  -- Build v2 bridge
  build_task_id uuid REFERENCES build_tasks(id),       -- links to existing build_tasks row
  
  -- Metadata
  failure_reason text,
  skip_reason text,
  
  -- Timestamps
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz
);

ALTER TABLE executor_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY executor_jobs_owner ON executor_jobs
  FOR ALL USING (requested_by = auth.uid());
```

### Table: `executor_job_events`

Append-only audit trail. Every status change, heartbeat, log line, artifact.

```sql
CREATE TABLE executor_job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES executor_jobs(id),
  event_type text NOT NULL,
  -- claimed, heartbeat, stdout, stderr, artifact, status_change, error, completed
  payload jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE executor_job_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY executor_job_events_owner ON executor_job_events
  FOR ALL USING (
    EXISTS (SELECT 1 FROM executor_jobs WHERE id = job_id AND requested_by = auth.uid())
  );
```

### Migration: `build_tasks` bridge column

```sql
ALTER TABLE build_tasks
  ADD COLUMN IF NOT EXISTS executor_id uuid REFERENCES executors(id),
  ADD COLUMN IF NOT EXISTS execution_backend text DEFAULT 'edge';
  -- 'edge' = orchestrate edge function (current behavior)
  -- 'local' = route to MaestroClaw
```

---

## Control Plane API

Single edge function: `executor-api` with action routing (same pattern as `vault`).

### Actions

| Action | Method | Description |
|--------|--------|-------------|
| `register` | POST | Register a new executor, returns auth token |
| `heartbeat` | POST | Report alive + status, update `last_seen_at` |
| `poll` | GET | Get next approved unclaimed job (FIFO) |
| `claim` | POST | Claim a specific job (lease it) |
| `event` | POST | Append a job event (log, status, artifact) |
| `complete` | POST | Finalize job (success/failure + results) |
| `status` | GET | Get executor status + active job info |

### Auth Model (V1 — Simple)

The worker authenticates as the **user** using Supabase auth. On first run, the user logs in via CLI (email/password or magic link), gets a Supabase session, and the worker stores+refreshes it. This means:

- No new auth system needed
- RLS works automatically (user sees only their executors/jobs)
- Session refresh handled by `@supabase/supabase-js`
- The executor token in `executors.token_hash` is a secondary validation layer — the worker must present both a valid user session AND a matching executor token

Why not a service role key? Because the worker runs on an untrusted machine (user's laptop). Service role keys bypass RLS. The user's own session has exactly the right permissions.

---

## Worker Architecture

### Directory Structure

```
packages/
  maestroclaw/
    src/
      index.ts              # CLI entry point — parse args, init, run
      config.ts             # Load .env, validate config
      auth.ts               # Supabase client init, session management
      poller.ts             # Poll loop: check for jobs, claim, dispatch
      executor.ts           # Job lifecycle: workspace setup → adapter run → cleanup
      reporter.ts           # Event reporting: heartbeat, logs, status changes
      adapters/
        types.ts            # Adapter interface definition
        shell-stub.ts       # Smoke test adapter
        claude-code.ts      # Claude Code headless adapter
    package.json
    tsconfig.json
    .env.example
    README.md
```

### Config (.env)

```env
# Maestro connection
MAESTRO_SUPABASE_URL=https://xxx.supabase.co
MAESTRO_SUPABASE_ANON_KEY=eyJ...

# Executor identity
EXECUTOR_NAME=michaels-macbook
EXECUTOR_TOKEN=mc_xxxxxxxxxxxxx

# User auth (set on first login, auto-refreshed)
MAESTRO_REFRESH_TOKEN=

# Behavior
POLL_INTERVAL_MS=5000
HEARTBEAT_INTERVAL_MS=30000
WORKSPACE_ROOT=~/.maestroclaw/workspaces
MAX_JOB_TIMEOUT_SECONDS=600

# Adapters
ENABLED_ADAPTERS=shell_stub,claude_code
CLAUDE_CODE_PATH=claude          # path to claude CLI binary
```

### Worker Loop (pseudocode)

```
1. Load config
2. Authenticate with Supabase (refresh token → session)
3. Register/verify executor identity
4. Start heartbeat interval (every 30s)
5. Enter poll loop:
   a. GET next approved, unclaimed job
   b. If no job → sleep POLL_INTERVAL_MS → repeat
   c. Claim job (atomic: UPDATE ... WHERE status = 'approved' AND executor_id IS NULL)
   d. Create ephemeral workspace (temp dir)
   e. If repo_url: git clone → checkout branch
   f. Run adapter.run(prompt, context)
      - Stream stdout/stderr as events
      - Respect timeout_seconds
   g. Report result (success/failure + artifact_manifest)
   h. Cleanup workspace (rm -rf temp dir)
   i. Update executor status: busy → online
   j. Continue poll loop
```

### Adapter Interface

```typescript
interface AdapterContext {
  workDir: string;              // ephemeral workspace path
  repoDir?: string;             // cloned repo path (if repo_url provided)
  allowedPaths: string[];       // file path constraints
  timeout: number;              // seconds
  onEvent: (event: {           // stream events back to Maestro
    type: 'stdout' | 'stderr' | 'status' | 'artifact';
    payload: Record<string, unknown>;
  }) => Promise<void>;
}

interface AdapterResult {
  success: boolean;
  summary: string;              // human-readable result
  artifacts: Array<{            // files produced
    path: string;
    content: string;
    operation: 'create' | 'upsert' | 'delete';
  }>;
  error?: string;
  usage?: {                     // optional cost/token tracking
    tokens_in?: number;
    tokens_out?: number;
    duration_ms: number;
  };
}

interface Adapter {
  name: string;
  check(): Promise<boolean>;    // is the tool available on this machine?
  run(prompt: string, ctx: AdapterContext): Promise<AdapterResult>;
}
```

### Adapter: `shell_stub`

Proof-of-life. No real AI — just echoes the prompt and writes a test file.

```typescript
{
  name: 'shell_stub',
  check: async () => true,      // always available
  run: async (prompt, ctx) => {
    await ctx.onEvent({ type: 'stdout', payload: { line: `Received: ${prompt}` } });
    const testFile = path.join(ctx.workDir, 'stub-output.txt');
    fs.writeFileSync(testFile, `Shell stub ran at ${new Date().toISOString()}\nPrompt: ${prompt}`);
    return {
      success: true,
      summary: 'Shell stub executed successfully',
      artifacts: [{ path: 'stub-output.txt', content: fs.readFileSync(testFile, 'utf-8'), operation: 'create' }],
      usage: { duration_ms: 100 },
    };
  }
}
```

### Adapter: `claude_code`

Runs Claude Code CLI in headless/print mode via stdin pipe. This is the primary adapter.

**Actual implementation** (differs from spec — updated 2026-04-20):

```typescript
{
  name: 'claude_code',
  check: async () => {
    // verify `claude` binary exists
    try {
      execSync('claude --version', { stdio: 'pipe' });
      return true;
    } catch { return false; }
  },
  run: async (prompt, workDir, timeout) => {
    // CRITICAL: prompt piped via stdin, NOT as CLI argument
    // Windows has ~8K CLI arg limit — stdin has no limit
    const proc = spawn('claude', [
      '--print',
      '--output-format', 'text',  // text mode, not JSON
    ], {
      cwd: workDir,
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    proc.stdin.write(prompt);
    proc.stdin.end();

    // Collect stdout/stderr, return as text
    // Artifact synthesis happens in executor.ts, not here
  }
}
```

**Key difference from original spec**: Uses `--output-format text` (not JSON), pipes prompt via stdin (not CLI arg), and artifact extraction is handled by `executor.ts:extractFileContent()` rather than the adapter parsing JSON output.

---

## Build v2 → MaestroClaw Bridge

This is the key integration. Build v2's task queue already has the right shape — MaestroClaw just becomes an alternative execution backend.

### How It Works

```
Current Build v2 flow:
  build_tasks → useBuildExecution → orchestrate edge function → parse result

With MaestroClaw:
  build_tasks → useBuildExecution → executor_jobs queue → MaestroClaw polls →
    claude_code adapter → results back → useBuildExecution reads result
```

### Routing Logic

In `useBuildExecution.ts`, the dispatch function checks:

```typescript
async function dispatchTask(task: BuildTask) {
  // If an executor is online and task is routed to local execution
  if (task.execution_backend === 'local' && onlineExecutor) {
    // Create an executor_job from the build_task
    const job = await createExecutorJob({
      build_task_id: task.id,
      adapter: 'claude_code',
      prompt: task.prompt_slice,
      repo_url: activeRepo.clone_url,
      branch: buildBranch,
      allowed_paths: [task.file_path],
      timeout_seconds: 300,
    });
    // Wait for job completion (poll executor_jobs status)
    return await waitForJobCompletion(job.id);
  }

  // Fallback: use edge function (current behavior)
  return await invokeEdgeFunction('orchestrate', { ... });
}
```

### User Choice

In Pre-Build, the conductor selects execution backend:
- **Cloud (Edge Functions)** — Current behavior. Fast for small files. API token cost.
- **Local (MaestroClaw)** — Routes to local executor. No API cost. No timeout limit. Requires MaestroClaw running.

The choice is stored in `sessions.execution_backend` ('edge' | 'local') and applied to all build_tasks for the session.

---

## Maestro Web UI (Minimal V1)

### Executor Status Badge

In the topbar or vault drawer — small indicator:
- 🟢 **Online** — MaestroClaw connected and idle
- 🟡 **Busy** — Currently running a job  
- 🔴 **Offline** — Not connected
- ⚪ **Not registered** — No executor set up

### Executor Panel (in Vault Drawer)

```
┌─────────────────────────────────────────────┐
│ Local Executor                              │
│                                             │
│ 🟢 Michael's MacBook          online 2s ago │
│    Adapters: claude_code, shell_stub        │
│                                             │
│ [Register New Executor]                     │
│                                             │
│ Recent Jobs                                 │
│ ┌─────────────────────────────────────────┐ │
│ │ ✅ Build: src/api/routes.ts    42s      │ │
│ │ ✅ Build: src/lib/db.ts        18s      │ │
│ │ ❌ Build: src/config.ts        timeout  │ │
│ │ ⏳ Review: security scan       running  │ │
│ └─────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### Registration Flow

1. User clicks "Register New Executor" in Vault
2. Maestro generates executor token, displays it once
3. User copies token to MaestroClaw `.env`
4. MaestroClaw registers on first run
5. Badge goes green

---

## Implementation Order

```
Phase 1 — Data model + control plane                          ✅ DONE (2026-04-17)
  1a. Migration: executors, executor_jobs, executor_job_events tables
  1b. Migration: build_tasks bridge columns (executor_id, execution_backend)
  1c. Edge function: executor-api (register, heartbeat, poll, claim, event, complete)
  1d. Deploy + verify

Phase 2 — Worker skeleton                                     ✅ DONE (2026-04-17)
  2a. packages/maestroclaw/ project scaffold (package.json, tsconfig, .env.example)
  2b. Config loader + Supabase auth
  2c. Poll loop + heartbeat
  2d. shell_stub adapter
  2e. End-to-end smoke test: register → create job in DB → worker claims → runs stub → reports back

Phase 3 — Claude Code adapter                                 ✅ DONE (2026-04-20)
  3a. claude_code adapter implementation (stdin pipe, not CLI arg)
  3b. Claude CLI detection + auth verification
  3c. Artifact synthesis from --print text output (extractFileContent)
  3d. Timeout + error handling
  3e. Smoke test: 5-file build, all artifacts stored in DB

Phase 4 — Build v2/v3 bridge                                  🔶 PARTIAL
  4a. useBuildExecution routing logic (edge vs local)           ✅
  4b. Pre-Build execution backend selector UI                   ✅
  4c. Claw agents in builder roster + Orchestra drawer          ✅
  4d. Job → build_task result sync                              ⚠️ Not yet tested via UI
  4e. Artifact → GitHub commit bridge for Claw builds           ❌ Not built

Phase 5 — UI polish                                            🔶 PARTIAL
  5a. Executor status badge in Orchestra drawer                 ✅
  5b. Executor panel in Vault drawer                            ✅ (hidden — no API key needed)
  5c. Job event log viewer                                      ❌
  5d. Registration flow                                         ❌ (manual .env setup)
  5e. Session-scoped build folder for browsing files on disk    ✅
```

---

## Security Checklist (V1)

- [ ] No inbound network ports opened
- [ ] Worker authenticates as user (not service role)
- [ ] Executor token validated on every API call
- [ ] Jobs require explicit approval before execution
- [ ] Ephemeral workspaces created and destroyed per-job
- [ ] Process timeout enforced (kill after N seconds)
- [ ] No arbitrary shell passthrough — adapter allow-list only
- [ ] All events persisted (append-only audit trail)
- [ ] Allowed paths enforced per-job
- [ ] Secrets never logged or stored in events

---

## Future Adapters (Not V1)

| Adapter | Tool | Notes |
|---------|------|-------|
| `copilot_cli` | GitHub Copilot CLI | Needs programmatic invocation research |
| `codex_cli` | OpenAI Codex CLI | Similar to claude_code pattern |
| `aider` | Aider | Git-aware AI coding tool |
| `cursor_cli` | Cursor | If they ship a CLI |

The adapter interface is designed so adding any of these is:
1. Implement `Adapter` interface
2. Add to `ENABLED_ADAPTERS` config
3. Done — worker discovers and routes automatically

---

## Success Criteria

After V1 ships, you can:

1. ✅ Register a local executor from Maestro's UI
2. ✅ See it go green (online) in the status badge
3. ✅ Create a job in Maestro
4. ✅ MaestroClaw claims and runs it locally
5. ✅ Watch events stream back in real-time
6. ✅ See the completed result in Maestro
7. ✅ Run a Build v2 project with local execution (no API tokens burned)
8. ✅ Clean up — no temp files left, no leaked state

---

## Open Questions for Review

1. **Auth**: User session auth (simple, RLS works) vs dedicated executor tokens (more isolation)? V1 proposes both — session for Supabase access, executor token as secondary check.

2. **Job approval**: Auto-approve build_tasks that came from an already-approved Build v2 session? Or require explicit approval per-job? Leaning toward auto-approve for build_tasks (the session was already approved), manual for ad-hoc jobs.

3. **Workspace strategy**: Always clone fresh? Or maintain a persistent local repo and just checkout the right branch? Fresh clone is safer (no stale state) but slower for large repos.

4. **Result delivery**: Worker writes directly to `build_tasks.result_content` (simple bridge) vs always through `executor_jobs.artifact_manifest` (clean separation)? Leaning toward clean separation — executor_jobs has the result, and the Build v2 bridge syncs it to build_tasks.

5. **Adapter concurrency**: V1 is one-at-a-time. But should the adapter interface design anticipate concurrent execution? (Answer: yes, design for it, enforce serial in V1.)
