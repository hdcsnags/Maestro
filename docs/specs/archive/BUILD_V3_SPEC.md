# Maestro Build v3 — MaestroClaw-Routed Execution

*Status: DESIGN REVIEW — Not yet implemented*

*Built from the synthesis of BUILD_V2_SPEC.md (task-queued execution), MAESTROCLAW_SPEC.md (local execution node), and live analysis of the deployed codebase. This spec replaces nothing — it extends Build v2 with local execution routing and defines the full project lifecycle from repo creation to security review.*

---

## The Problem

Build v2 works. 76 tasks → PR → merged. But it has two hard ceilings:

1. **Cost ceiling**: Every `orchestrate` call burns API tokens through Supabase edge functions. Users with Claude Pro, ChatGPT Plus, or Copilot subscriptions are paying twice — once for the subscription, once for the API tokens. Five days of testing = $30 real money.

2. **Timeout ceiling**: Supabase edge functions have a ~26s execution limit. Build v2's one-file-per-task decomposition works around this, but complex files (large components, intricate logic) still risk 504s. A local CLI tool has no timeout — Claude Code can think for 5 minutes on a hard file.

3. **Context ceiling**: Edge function calls are stateless. Each `orchestrate` invocation gets a system prompt + user prompt + maybe some context files. A local CLI tool running in the actual repo directory has full filesystem access — it can read imports, check types, understand the whole project.

Build v3 doesn't replace v2. It adds a routing layer: each build task can execute via **edge function** (current behavior) or **local MaestroClaw node** (new). The user chooses. The task queue, progress tracking, GitHub execution, and approval gates are unchanged.

---

## Architecture Doctrine

Everything from BUILD_V2_SPEC.md and MAESTROCLAW_SPEC.md still holds. V3 adds:

1. **Route, don't rewrite.** The task queue is the same. The dispatch function gains a branch. That's it. No new execution models, no new data flows.
2. **Same artifact shape everywhere.** Whether a task executes via edge function or MaestroClaw, the result is `{path, content, operation}`. Downstream doesn't know or care which backend ran it.
3. **Project lifecycle is a state machine.** New repo → scaffold → design → pre-build → build → review. Each transition is explicit, auditable, and reversible.
4. **Context is packaged, not assumed.** Every MaestroClaw job includes a context bundle: AGENTS.md, build spec, file tree, relevant prior outputs. The CLI tool never guesses.
5. **Docker is the isolation endgame.** V3.0 runs on bare metal (user's machine). V3.x wraps the executor in a container. All permissions, file access, and network egress are scoped to the container. This is a future phase, not a launch blocker.

---

## What Changes From v2

| Layer | Build v2 (Current) | Build v3 (New) |
|-------|-------------------|----------------|
| Task dispatch | Always calls `orchestrate` edge function | Branches: `edge` → orchestrate, `local` → executor_jobs |
| Execution timeout | ~26s (Supabase limit) | Unlimited for local; 26s for edge |
| File context | System prompt hints + optional `context_files` | Full repo clone on local executor |
| Cost per task | API token cost | $0 for local (uses existing subscription) |
| Pre-Build UI | Mode selection only | Mode selection + execution backend toggle |
| Concierge decompose | Assigns `lane_owner`, `fallback_owner` | Also assigns `execution_backend` per task |
| Project bootstrap | Manual (user creates repo externally) | Automated: create repo → scaffold → wire Supabase |
| Security review | Not built | Post-build review phase via council or local scan |

---

## Data Model Changes

### Migration: `build_tasks` — execution routing columns

```sql
-- These columns were added in the MaestroClaw v0.1 bridge migration.
-- Documenting here for completeness:
--   executor_id uuid REFERENCES executors(id)
--   execution_backend text DEFAULT 'edge'  -- 'edge' | 'local' | 'auto'

-- V3 adds:
ALTER TABLE build_tasks
  ADD COLUMN IF NOT EXISTS executor_job_id uuid REFERENCES executor_jobs(id);
  -- Links a build_task to its MaestroClaw job when execution_backend = 'local'
```

### Migration: `sessions` — project lifecycle state

```sql
ALTER TABLE sessions
  ADD COLUMN IF NOT EXISTS execution_backend text DEFAULT 'edge',
  -- Session-level default: 'edge' | 'local' | 'auto'

  ADD COLUMN IF NOT EXISTS project_config jsonb DEFAULT '{}';
  -- {
  --   project_type: 'new' | 'existing',
  --   repo_url: string,
  --   repo_name: string,
  --   tech_stack: string[],
  --   supabase_project_id: string | null,
  --   supabase_url: string | null,
  --   scaffold_complete: boolean,
  --   design_locked: boolean,
  -- }
```

### Migration: `executor_jobs` — context bundle column

```sql
ALTER TABLE executor_jobs
  ADD COLUMN IF NOT EXISTS context_bundle jsonb DEFAULT '{}';
  -- {
  --   agents_md: string,          -- AGENTS.md content for this project
  --   build_spec: string,         -- architect_md / build spec
  --   file_tree: string[],        -- repo file listing
  --   prior_outputs: {            -- relevant completed task results
  --     path: string,
  --     content: string,
  --     agent: string
  --   }[],
  --   dependencies: string[],     -- npm/pip/etc package list
  --   env_hints: string[],        -- "Uses Supabase", "React + Vite", etc.
  -- }
```

---

## Execution Routing

### The Branch Point

In `useBuildExecution.ts`, `dispatchTask()` currently always calls `orchestrate`. V3 adds one branch:

```
dispatchTask(task):
  backend = task.execution_backend ?? session.execution_backend ?? 'edge'

  IF backend === 'edge':
    → invokeEdgeFunction('orchestrate', {mode: 'build_task', ...})
    → parseTaskResult() → update build_task
    (unchanged from v2)

  IF backend === 'local':
    → createExecutorJob(task) → INSERT into executor_jobs
    → pollExecutorJob(jobId) → wait for succeeded/failed
    → parseJobResult() → update build_task
    (new in v3)

  IF backend === 'auto':
    → if onlineExecutor exists: route to 'local'
    → else: fallback to 'edge'
```

### Creating an Executor Job from a Build Task

```typescript
async function createExecutorJob(task: BuildTask): Promise<ExecutorJob> {
  const contextBundle = await buildContextBundle(task);

  const { data: job } = await supabase
    .from('executor_jobs')
    .insert({
      session_id: state.activeSession?.id,
      requested_by: user.id,
      job_type: 'build_task',
      adapter: 'claude_code',
      prompt: task.prompt_slice,
      repo_url: activeRepo?.clone_url,
      repo_name: activeRepo?.name,
      branch: buildBranch,
      allowed_paths: [task.file_path],
      timeout_seconds: 600,
      approval_required: false,
      approved_at: new Date().toISOString(),
      build_task_id: task.id,
      context_bundle: contextBundle,
      status: 'approved',
    })
    .select()
    .single();

  return job;
}
```

### Polling for Job Completion

```typescript
async function pollExecutorJob(jobId: string, task: BuildTask): Promise<boolean> {
  const POLL_MS = 2000;
  const TIMEOUT_MS = 600_000; // 10 minutes
  const start = Date.now();

  while (Date.now() - start < TIMEOUT_MS) {
    if (abortRef.current) return false;

    const { data: job } = await supabase
      .from('executor_jobs')
      .select('status, artifact_manifest, error_text, result_summary')
      .eq('id', jobId)
      .single();

    if (!job) return false;

    if (job.status === 'succeeded') {
      const artifacts = (job.artifact_manifest ?? []) as FileManifestEntry[];
      if (artifacts.length === 0) {
        await updateTaskStatus(task.id, 'failed', {
          failure_reason: 'Executor produced no artifacts',
        });
        return false;
      }
      const entry = artifacts[0]; // one file per task
      await updateTaskStatus(task.id, 'completed', {
        result_content: entry.content,
        result_operation: entry.operation,
        result_builder: task.lane_owner,
      });
      return true;
    }

    if (job.status === 'failed') {
      await updateTaskStatus(task.id, 'failed', {
        failure_reason: job.error_text || 'Executor job failed',
        provider_error: job.result_summary,
      });
      return false;
    }

    // Still running — wait and poll again
    await new Promise(r => setTimeout(r, POLL_MS));
  }

  // Timed out
  await updateTaskStatus(task.id, 'failed', {
    failure_reason: 'Executor job timed out after 10 minutes',
  });
  return false;
}
```

### Result Shape Equivalence

Edge function result:
```json
{ "file_manifest": [{ "path": "src/api/routes.ts", "content": "...", "operation": "upsert" }] }
```

Executor job result (artifact_manifest):
```json
[{ "path": "src/api/routes.ts", "content": "...", "operation": "upsert" }]
```

Both feed into `collectManifest()` → `github-execute`. No changes needed downstream.

---

## Context Bundle — What MaestroClaw Receives Per Job

The biggest difference between edge function calls and local execution is context. Edge functions get a system prompt + user prompt. MaestroClaw jobs get a full context bundle:

### Bundle Structure

```typescript
interface ContextBundle {
  // Project identity
  project_name: string;
  tech_stack: string[];         // ["React", "TypeScript", "Supabase", "Vite"]
  repo_url: string;

  // Build specification
  agents_md: string;            // Full AGENTS.md content
  build_spec: string;           // architect_md from Pre-Build
  file_tree: string[];          // Complete repo file listing

  // Task-specific context
  prior_outputs: {              // Results from tasks this one depends on
    path: string;
    content: string;
    agent: string;
  }[];

  // Environment hints
  env_hints: string[];          // ["Uses Supabase for auth", "Tailwind CSS", etc.]
  dependencies: string[];       // From package.json / requirements.txt
}
```

### How the Bundle Is Built

```typescript
async function buildContextBundle(task: BuildTask): Promise<ContextBundle> {
  // 1. Load project config from session
  const projectConfig = state.activeSession?.project_config ?? {};

  // 2. Load completed dependency tasks
  const depTasks = await supabase
    .from('build_tasks')
    .select('file_path, result_content, result_builder')
    .eq('session_id', state.activeSession?.id)
    .in('task_id', task.dependencies ?? [])
    .eq('status', 'completed');

  const priorOutputs = (depTasks.data ?? []).map(t => ({
    path: t.file_path,
    content: t.result_content ?? '',
    agent: resolveAgentName(t.result_builder),
  }));

  // 3. Load agents_md from session metadata or generate
  const agentsMd = state.activeSession?.agents_md ?? generateAgentsMd();

  // 4. Get file tree from repo (cached per build)
  const fileTree = await getRepoFileTree(projectConfig.repo_url, buildBranch);

  return {
    project_name: projectConfig.repo_name ?? 'untitled',
    tech_stack: projectConfig.tech_stack ?? [],
    repo_url: projectConfig.repo_url ?? '',
    agents_md: agentsMd,
    build_spec: state.activeSession?.architect_md ?? '',
    file_tree: fileTree,
    prior_outputs: priorOutputs,
    env_hints: inferEnvHints(projectConfig),
    dependencies: projectConfig.dependencies ?? [],
  };
}
```

### How the Adapter Uses the Bundle

The MaestroClaw `executor.ts` extracts the context bundle and constructs a rich prompt for the CLI tool:

```typescript
function buildAdapterPrompt(job: ExecutorJob): string {
  const bundle = job.context_bundle as ContextBundle;
  const parts: string[] = [];

  parts.push(`# Task: ${job.prompt}`);
  parts.push('');

  if (bundle.build_spec) {
    parts.push('## Build Specification');
    parts.push(bundle.build_spec);
    parts.push('');
  }

  if (bundle.prior_outputs?.length) {
    parts.push('## Related Files (already built)');
    for (const output of bundle.prior_outputs) {
      parts.push(`### ${output.path}`);
      parts.push('```');
      parts.push(output.content);
      parts.push('```');
      parts.push('');
    }
  }

  if (bundle.agents_md) {
    parts.push('## Project Context (AGENTS.md)');
    parts.push(bundle.agents_md);
  }

  return parts.join('\n');
}
```

The CLI tool (Claude Code, Copilot CLI) also has the full repo cloned in its working directory, so it can read any file directly.

---

## Project Lifecycle — The Full Flow

Build v3 defines six phases. Phases 1–2 exist today. Phases 3–6 are new.

```
Phase 1: Ideation     → Council responds to user prompt
Phase 2: Synthesis    → Responses synthesized, contradictions surfaced
Phase 3: Design       → Agents produce HTML mockups, user locks visual direction
Phase 4: Pre-Build    → Repo created/wired, tech stack confirmed, task queue generated
Phase 5: Build        → Tasks dispatched (edge OR local), files written to GitHub
Phase 6: Review       → Security scan, code review, user decides on revamp sprint
```

### Phase 3 — Design (NEW)

**Trigger**: User clicks "Design Phase" after synthesis.

**What happens**:
1. Selected agents receive a design prompt with the synthesized direction
2. Each agent produces an HTML mockup (complete, self-contained HTML file)
3. Mockups appear as downloadable artifacts in their carousel cards
4. User reviews all mockups, picks features/colors/layout from each
5. User writes a "design lock" note combining their choices
6. Design is locked — Pre-Build uses this as the visual spec

**Data model**: Responses with `mode: 'design'` and `artifacts` column containing the HTML. No new tables needed — the existing response/artifact flow handles this.

**MaestroClaw integration**: Design tasks can also route through MaestroClaw. A local Claude Code session with a repo checkout can produce more contextual mockups (reading existing CSS, component patterns, etc.).

### Phase 4 — Pre-Build (EXTENDED)

Pre-Build currently: lock roster, assign lanes, generate architect_md, decompose tasks.

V3 extends with:

#### 4a. Project Type Gate

```
┌─────────────────────────────────────────┐
│ What kind of project is this?           │
│                                         │
│ ○ New Project                           │
│   Create a fresh repo, scaffold, wire   │
│                                         │
│ ○ Existing Project                      │
│   Connect to a repo, scan it in         │
│                                         │
│ [Connected Repo: maestro-app ▾]         │
└─────────────────────────────────────────┘
```

**New project flow**:
1. User provides project name + description
2. Maestro calls `github-create-repo` edge function
3. Scaffold task generated (README, package.json, base config)
4. If Supabase needed: wire up per-project Supabase (see §4c)

**Existing project flow**:
1. User selects from connected repos (already in Vault)
2. Maestro scans the repo: file tree, package.json, README
3. Context loaded for council and build planning

#### 4b. Execution Backend Selection

```
┌─────────────────────────────────────────┐
│ Execution Backend                       │
│                                         │
│ ○ Cloud (Edge Functions)                │
│   Fast for small files. Uses API tokens │
│                                         │
│ ● Local (MaestroClaw)                   │
│   No API cost. No timeout. Requires     │
│   MaestroClaw running.                  │
│                                         │
│ ○ Auto                                  │
│   Route complex tasks locally,          │
│   simple tasks to edge                  │
│                                         │
│ 🟢 MaestroClaw: Online (idle)          │
└─────────────────────────────────────────┘
```

The selection is stored in `sessions.execution_backend` and applied to all `build_tasks` generated during decomposition.

When "Auto" is selected, the concierge applies a heuristic during `decompose_tasks`:
- Files expected to be >200 lines → `local`
- Files with complex logic (indicated by architect_md keywords) → `local`
- Config files, small utilities → `edge`
- If no executor online → all `edge`

#### 4c. Per-Project Supabase (Future Phase)

Currently, Supabase config is global (one project URL/key in Vault). V3 envisions per-project Supabase:

```typescript
interface ProjectSupabaseConfig {
  project_id: string;
  url: string;
  anon_key: string;
  service_role_key?: string; // encrypted in vault
  linked_at: string;
}
```

**Implementation approach** (not V3.0 — future phase):
1. User creates Supabase project via dashboard (Supabase doesn't have a create-project API)
2. User pastes project URL + keys into Maestro's per-project config
3. Maestro stores encrypted in vault, tagged by session/project
4. MaestroClaw jobs receive the Supabase config in their context bundle
5. CLI tools can run migrations, generate types, wire up auth

### Phase 5 — Build (EXTENDED)

The build phase is Build v2's task queue + V3 routing. No changes to the execution loop itself — only `dispatchTask()` gains the routing branch described above.

**Progress tracking** is the same:
```
Building: 12/47 tasks complete
├─ ✅ src/lib/db.ts (claude_code, local, 42s)
├─ ✅ src/api/routes.ts (orchestrate, edge, 8s)
├─ ⏳ src/components/Header.tsx (claude_code, local, running...)
├─ ⏳ src/components/Footer.tsx (orchestrate, edge, dispatched)
└─ ... 43 more
```

The UI gains a "backend" indicator per task so the user sees which tasks went local vs edge.

### Phase 6 — Security Review (NEW)

**Trigger**: Build completes, all tasks succeeded, PR created.

**What happens**:
1. Maestro broadcasts a review prompt to the council (or a subset: Claude + OpenAI are strong on security)
2. Each reviewer receives the full file manifest from the build
3. Reviewers produce a structured report: vulnerabilities, code smells, dependency risks
4. Reports are synthesized
5. User sees a security summary in the execution results
6. User decides: merge as-is, request revamp sprint, or reject

**Data model**: New `review_reports` table or reuse `responses` with `mode: 'review'`. Lean toward reuse to avoid table sprawl.

**MaestroClaw integration**: A local security review can run tools like `npm audit`, `eslint --security`, or custom scripts alongside the AI review. This is an adapter-level enhancement (e.g., `security_scan` adapter).

---

## Multi-Step Job Chains

Some workflows require sequential jobs where each step depends on the previous:

### Example: New Project Bootstrap

```
Chain: new-project-bootstrap
├─ Step 1: Create GitHub repo
│  adapter: github_api (new adapter)
│  input: { name, description, private }
│  output: { repo_url, default_branch }
│
├─ Step 2: Scaffold project
│  adapter: claude_code
│  input: { prompt: "Initialize a React+Vite+TypeScript project..." }
│  depends_on: step_1 (needs repo_url)
│  output: { files_created[] }
│
├─ Step 3: Wire Supabase
│  adapter: claude_code
│  input: { prompt: "Add Supabase client, create .env template..." }
│  depends_on: step_2
│  output: { files_created[] }
│
└─ Step 4: Initial commit + push
   adapter: github_api
   input: { files from steps 2-3, commit_message }
   depends_on: step_3
```

### Chain Data Model

```sql
CREATE TABLE IF NOT EXISTS executor_job_chains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES sessions(id),
  requested_by uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  -- pending → running → succeeded → failed → cancelled
  chain_spec jsonb NOT NULL,
  -- Array of step definitions with depends_on references
  current_step int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE executor_job_chains ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_chains_owner ON executor_job_chains
  FOR ALL USING (requested_by = auth.uid());

-- Link jobs to chains
ALTER TABLE executor_jobs
  ADD COLUMN IF NOT EXISTS chain_id uuid REFERENCES executor_job_chains(id),
  ADD COLUMN IF NOT EXISTS chain_step int;
```

### Chain Execution

The chain executor is a loop in `useBuildExecution` or a dedicated hook:

```typescript
async function executeChain(chain: JobChain): Promise<void> {
  for (let step = 0; step < chain.steps.length; step++) {
    const stepDef = chain.steps[step];

    // Inject outputs from prior steps
    const enrichedPrompt = injectPriorOutputs(stepDef.prompt, chain, step);

    // Create and dispatch job
    const job = await createExecutorJob({
      ...stepDef,
      prompt: enrichedPrompt,
      chain_id: chain.id,
      chain_step: step,
    });

    // Wait for completion
    const success = await pollExecutorJob(job.id);
    if (!success) {
      await updateChainStatus(chain.id, 'failed', step);
      return;
    }

    // Store step output for next step
    chain.stepOutputs[step] = job.artifact_manifest;
    await updateChainStatus(chain.id, 'running', step + 1);
  }

  await updateChainStatus(chain.id, 'succeeded');
}
```

---

## MaestroClaw Enhancements for V3

### Keep Workspace on Success

V3.0 change: don't delete the workspace when a job succeeds. This lets users browse generated files, run the project locally, and iterate.

```typescript
// In executor.ts, after job completion:
if (job.status === 'succeeded' && config.keepSucceededWorkspaces) {
  log(`📁 Workspace preserved: ${jobDir}`);
  // Optionally: move to a named directory instead of temp
  const namedDir = path.join(workspaceRoot, `${job.repo_name ?? 'job'}-${job.id.slice(0, 8)}`);
  renameSync(jobDir, namedDir);
} else {
  rmSync(jobDir, { recursive: true, force: true });
}
```

Config: `KEEP_SUCCEEDED_WORKSPACES=true` in `.env` (default: true).

### AGENTS.md Generation Per Job

Each job that runs through Claude Code or another session-aware CLI tool benefits from project context. MaestroClaw generates a temporary `AGENTS.md` in the workspace before the adapter runs:

```typescript
function writeAgentsMd(workDir: string, bundle: ContextBundle): void {
  const content = [
    `# Project: ${bundle.project_name}`,
    '',
    '## Tech Stack',
    bundle.tech_stack.map(t => `- ${t}`).join('\n'),
    '',
    '## Build Specification',
    bundle.build_spec,
    '',
    '## File Tree',
    '```',
    bundle.file_tree.join('\n'),
    '```',
    '',
    '## Environment',
    bundle.env_hints.map(h => `- ${h}`).join('\n'),
    '',
    '## Your Task',
    'You are working on a specific file as part of a larger build.',
    'The full build specification is above. Focus only on your assigned file.',
    'Write complete, production-ready code. No placeholders or stubs.',
  ].join('\n');

  writeFileSync(path.join(workDir, 'AGENTS.md'), content);
}
```

### Adapter: `copilot_cli` (Future)

```typescript
const copilot_cli: Adapter = {
  name: 'copilot_cli',
  check: async () => {
    try {
      await execFileAsync('github-copilot', ['--version'], { shell: true });
      return true;
    } catch { return false; }
  },
  run: async (prompt, workDir, timeoutMs) => {
    // Copilot CLI doesn't have a --print mode yet
    // This adapter is a placeholder for when it does
    throw new Error('copilot_cli adapter not yet implemented');
  },
};
```

### Adapter: `codex_cli` (Future)

```typescript
const codex_cli: Adapter = {
  name: 'codex_cli',
  check: async () => {
    try {
      await execFileAsync('codex', ['--version'], { shell: true });
      return true;
    } catch { return false; }
  },
  run: async (prompt, workDir, timeoutMs) => {
    const { stdout } = await execFileAsync('codex', [
      '--print',
      '--output-format', 'text',
      prompt,
    ], {
      cwd: workDir,
      timeout: timeoutMs,
      maxBuffer: 10 * 1024 * 1024,
      shell: true,
    });
    return stdout;
  },
};
```

---

## Frontend Changes

### Pre-Build Panel Extension

The Pre-Build UI gains two new sections:

1. **Project Type Gate** — New vs Existing repo (described in §4a)
2. **Execution Backend Selector** — Cloud / Local / Auto (described in §4b)

These are added to the existing Pre-Build flow in `BuildWorkspace.tsx` or as a new `PreBuildConfig.tsx` component.

### Task Progress Enhancement

The build progress UI gains a backend indicator:

```tsx
<div className="task-row">
  <span className={`status-dot ${task.status}`} />
  <span className="file-path">{task.file_path}</span>
  <span className="backend-badge">
    {task.execution_backend === 'local' ? '🖥️' : '☁️'}
  </span>
  <span className="duration">{task.duration}s</span>
</div>
```

### Executor Status in Topbar

A small indicator in `RevealTopbar.tsx`:

```tsx
{executorOnline && (
  <div className="executor-indicator">
    <span className="status-dot online" />
    <span className="keycap-label">MaestroClaw</span>
  </div>
)}
```

---

## Security Model

### V3.0 — Current (Bare Metal)

| Layer | Protection |
|-------|-----------|
| Network | Outbound-only polling. No inbound ports. |
| Auth | Supabase session (RLS) + executor token (SHA-256 hashed) |
| File access | `allowed_paths` per job constrains which files the adapter can touch |
| Process | `timeout_seconds` kills the adapter process if it runs too long |
| Audit | Every event persisted in `executor_job_events` (append-only) |
| Approval | Jobs require explicit approval in Maestro before MaestroClaw can claim |
| Isolation | Ephemeral workspace per job (temp directory, cleaned up on failure) |

### V3.x — Docker Isolation (Future Phase)

```
┌─────────────────────────────────────────────────┐
│ Host Machine                                    │
│                                                 │
│  MaestroClaw (Node.js)                          │
│  ├─ Polls Maestro for jobs                      │
│  ├─ Manages Docker containers                   │
│  └─ Reports results back                        │
│                                                 │
│  ┌───────────────────────────────────────────┐  │
│  │ Docker Container (per job)                │  │
│  │                                           │  │
│  │  - CLI tool (claude, codex, etc.)         │  │
│  │  - Cloned repo (read/write)               │  │
│  │  - AGENTS.md + context bundle             │  │
│  │  - Network: GitHub API only (egress rule) │  │
│  │  - No access to host filesystem           │  │
│  │  - No access to other containers          │  │
│  │  - Auto-destroyed after job completion    │  │
│  │                                           │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**Docker adapter wrapper**:
```typescript
// Instead of running the CLI tool directly, MaestroClaw:
// 1. Builds a container image with the CLI tool installed
// 2. Mounts the workspace directory
// 3. Runs the adapter command inside the container
// 4. Collects output and artifacts
// 5. Destroys the container

interface DockerAdapterConfig {
  image: string;            // 'maestroclaw/claude-code:latest'
  network: string;          // 'maestroclaw-restricted' (GitHub API egress only)
  memory_limit: string;     // '4g'
  cpu_limit: string;        // '2'
  mount_paths: string[];    // workspace dir only
  env_passthrough: string[];// ANTHROPIC_API_KEY, etc. (from vault)
}
```

**Security gains from Docker**:
- Process isolation: CLI tool can't access host processes
- Filesystem isolation: only the mounted workspace is visible
- Network isolation: egress rules limit to GitHub/Supabase APIs
- Resource limits: CPU/memory caps prevent runaway processes
- Clean destruction: container removed after job, no state leaks
- Multi-tenant safe: if Maestro becomes open-source, users can't affect each other

---

## Implementation Order

### V3.0 — MaestroClaw-Routed Builds (Core)

```
Phase 1 — Routing layer
  1a. Migration: build_tasks.executor_job_id, sessions.execution_backend, sessions.project_config
  1b. Migration: executor_jobs.context_bundle, executor_jobs.chain_id/chain_step
  1c. useBuildExecution.dispatchTask() routing branch (edge vs local)
  1d. pollExecutorJob() implementation
  1e. Smoke test: single build_task routed through MaestroClaw

Phase 2 — Context bundling
  2a. buildContextBundle() function
  2b. AGENTS.md generation in executor.ts
  2c. MaestroClaw: write context files to workspace before adapter runs
  2d. Keep workspace on success (config option)

Phase 3 — Pre-Build UI
  3a. Execution backend selector in Pre-Build panel
  3b. Project type gate (new vs existing repo)
  3c. Executor status indicator in topbar
  3d. Backend indicator per task in progress UI

Phase 4 — Job chains
  4a. executor_job_chains table + migration
  4b. Chain executor loop (sequential steps with dependency injection)
  4c. New project bootstrap chain (create repo → scaffold → wire → commit)
  4d. UI: chain progress viewer

Phase 5 — Security review phase
  5a. Review prompt construction (full manifest → council)
  5b. Review report rendering in execution results
  5c. Optional: local security scan adapter (npm audit, eslint)
```

### V3.x — Future Phases (Not Launch Blockers)

```
Phase 6 — Docker isolation
  6a. Dockerfile for claude_code adapter
  6b. Docker adapter wrapper in MaestroClaw
  6c. Network policy (egress-only to GitHub/Supabase)
  6d. Resource limits (CPU, memory, disk)

Phase 7 — Per-project Supabase
  7a. Project config UI in Pre-Build
  7b. Encrypted storage of per-project keys
  7c. Context bundle includes Supabase config
  7d. CLI tools can run migrations/generate types

Phase 8 — Multi-executor
  8a. Parallel job dispatch (multiple executors claim different tasks)
  8b. Executor affinity (route specific adapters to specific machines)
  8c. Load balancing heuristics

Phase 9 — Design phase
  9a. Design prompt construction
  9b. HTML mockup generation + preview
  9c. Design lock flow
  9d. Design → Pre-Build handoff
```

---

## Open Questions for Council Review

1. **Auto-routing heuristic**: How should "Auto" mode decide between edge and local? File size estimate? Keyword complexity? Agent capability score? Or just "local if executor online, edge otherwise"?

2. **Chain failure recovery**: If step 3 of a 5-step chain fails, should we retry from step 3 or restart the whole chain? What about partial rollback (e.g., repo was already created in step 1)?

3. **Multi-CLI coordination**: If a job needs both Claude Code and Copilot CLI (e.g., Claude writes code, Copilot reviews), should that be two sequential jobs in a chain or a compound adapter?

4. **Context bundle size**: Full AGENTS.md + build spec + file tree + prior outputs could be large. Should we cap it? Summarize? Let the adapter's context window be the natural limit?

5. **Docker image management**: Pre-built images vs build-on-demand? Registry (Docker Hub, GitHub Container Registry) or local-only builds?

6. **Per-project Supabase**: Manual key entry vs Supabase CLI integration (`supabase link`)? The CLI approach is nicer UX but adds a dependency.

7. **Security review scope**: Full codebase review on every build? Or only changed files? Delta review is cheaper but might miss cross-file vulnerabilities.

---

## Success Criteria

After V3.0 ships, you can:

1. ✅ Select "Local (MaestroClaw)" as execution backend in Pre-Build
2. ✅ Run a full Build v2 task queue with tasks routed to MaestroClaw
3. ✅ See per-task backend indicators (☁️ / 🖥️) in the progress UI
4. ✅ Browse generated files in the preserved workspace
5. ✅ Fall back to edge functions automatically if MaestroClaw is offline
6. ✅ Create a new repo from Maestro and bootstrap it via job chain
7. ✅ Run a security review of the completed build
8. ✅ Zero API token cost for locally-executed tasks

---

*This spec is intended for council review. Submit to the AI council for feedback on security model, routing heuristics, and chain failure recovery before implementation begins.*
