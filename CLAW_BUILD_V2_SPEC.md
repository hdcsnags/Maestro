# Claw Build v2 — Session-Granular Architecture Spec

*Written 2026-04-27. Every agent working on Claw builds must read this before touching build dispatch, executor, or adapter code.*

---

## Why The Current Model Is Wrong

The current Claw build flow was copied from the web/edge build model, which was designed for stateless API calls. It is the wrong primitive for CLI agents.

### Current (broken) model
```
Web UI
  → decompose project into N files
  → submit N individual executor_jobs (job_type: "build_task")
  → each job = ONE blind prompt: "write EXACTLY this one file, return JSON"
  → Claw picks up jobs one at a time (sequential poll loop)
  → Claude Code: receives decontextualised prompt, outputs one file, exits
  → N disconnected files, no inter-file coherence
```

**Why it fails:**
1. **No inter-file context.** `types.ts` is generated without knowing what `api.ts` needs. `App.tsx` doesn't know what `components/` contains. Imports break, types mismatch, files are coherent in isolation but incoherent as a project.
2. **Single-threaded execution.** The Claw poll loop is `while(true) { await executeJob() }` — one job at a time. 79 files × 2–5 min each = hours of wall time.
3. **Wrong abstraction for Claude Code.** Claude Code's strength is iterating over a whole project with tool use — `Read()`, `Write()`, `Bash()`, self-correcting. The current model reduces it to a stateless text transformer.
4. **No project-level review.** Files complete individually with no agent checking whether the whole project hangs together.

### What Perplexity Computer, architect-cli, and every serious agentic system do instead
Give the agent the full project context and a goal. Let it run. Collect the result.

---

## The New Model: Session-Granular Claw Builds

### Core principle
**One Claw job per builder, scoped to a module.** Claude Code gets the full ARCHITECT.md, all existing context files, and its assigned scope. It runs as a real agent — reads, writes, self-corrects — until the scope is complete. One PR per session. Coherent code.

```
Web UI
  → resolve builder assignments from Pre-Build (1–3 builders, module-scoped)
  → submit ONE executor_job per builder (job_type: "build_session")
  → each job carries: ARCHITECT.md, scope glob, existing files, repo URL
  → Claw claims and runs jobs concurrently (parallel pool)
  → Claude Code: clones/inits repo → reads ARCHITECT.md → writes all files in scope
    → self-reviews → fixes → exits when done
  → Claw collects everything written to workDir
  → Session-level Ralph Loop: check coverage vs ARCHITECT.md spec
  → Commit + push + report manifest
```

---

## Job Type: `build_session`

### Payload (submitted by web UI to `executor-api?action=submit`)

```typescript
{
  session_id: string;            // Maestro session UUID
  job_type: "build_session";     // NEW — distinct from "build_task"
  adapter: string;               // "claude_code" | "copilot_cli" | "gemini_cli"
  scope: string;                 // Glob pattern: "src/**" | "apps/api/**" | "**"
  architect_content: string;     // Full ARCHITECT.md text
  context_files?: Record<string, string>; // path → content for files already written by other builders
  repo_url: string | null;       // null for greenfield local builds
  repo_name: string | null;
  branch: string | null;
  timeout_seconds: number;       // 1800 (30 min) default for session builds
  build_session_id?: string;     // Optional: links to a parent build tracking record
}
```

### Key differences from `build_task`
| Field | `build_task` | `build_session` |
|---|---|---|
| Scope | Single file path | Glob pattern (module) |
| Prompt | Pre-composed file-gen prompt | Not used — adapter constructs it from architect_content + scope |
| timeout_seconds | 600 (10 min) | 1800 (30 min) |
| Expected output | One file JSON | All files written to disk by Claude |
| Progress | Binary done/fail | Streaming file count as Claude writes |

---

## Adapter Changes: Session Mode

### The key change: remove `--print`

Current adapters use `--print` which forces Claude into one-shot mode (send prompt → get text response → exit). This is correct for `build_task`. It is wrong for `build_session`.

For session builds, adapters must run Claude Code in its natural agentic mode — it uses tools (`Read`, `Write`, `Bash`) and iterates until done.

### `claude-code.ts` — add `runSession()` method

```typescript
// Session mode: Claude Code runs with full tool access, writes files to disk directly.
// No --print. Claude iterates until it decides it's done.
async runSession(prompt: string, workDir: string, timeoutMs: number): Promise<AdapterResult> {
  return new Promise((resolve) => {
    const proc = spawn(
      "claude",
      [
        "--dangerously-skip-permissions",  // skip all tool-use confirmation prompts
        "--model", PRIMARY_MODEL,
      ],
      {
        cwd: workDir,
        timeout: timeoutMs,
        shell: true,
        env: { ...process.env },
      }
    );

    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });

    proc.stdin.write(prompt);
    proc.stdin.end();

    proc.on("close", (code) => {
      resolve({ success: code === 0, output: stdout, ...(stderr ? { error: stderr } : {}) });
    });
    proc.on("error", (err) => {
      resolve({ success: false, output: stdout, error: err.message });
    });
  });
}
```

### `gemini-cli.ts` — `--yolo` already skips permissions (no change needed for session mode)
Run as-is. Gemini CLI with `--yolo` writes files directly. Already correct.

### `copilot-cli.ts` — `--allow-all-tools` already correct (no change needed)
Run as-is. Already writes files to workDir.

### `Adapter` interface update
Add optional `runSession()` to the interface. Adapters that don't implement it fall back to `run()` with a rich prompt (graceful degradation).

```typescript
export interface Adapter {
  name: string;
  check(): Promise<boolean>;
  run(prompt: string, workDir: string, timeoutMs: number): Promise<AdapterResult>;
  runSession?(prompt: string, workDir: string, timeoutMs: number): Promise<AdapterResult>;
}
```

---

## Executor Changes: `executeSessionJob()`

New function alongside `executeJob()` in `executor.ts`. Called when `job.job_type === "build_session"`.

### Flow

```
1. mkdirSync(workDir)
2. If repo_url: git clone --depth 1 into workDir/repo
   Else: git init workDir (greenfield)
3. Write ARCHITECT.md to workDir root
4. Write context_files to workDir (files already built by other builders)
5. Build the session prompt (see below)
6. Run adapter.runSession() or adapter.run() with session prompt
   → TOTAL timeout budget (deadline), remaining passed per attempt
7. Collect all new/modified files from workDir (diff vs pre-session snapshot)
8. SESSION-LEVEL RALPH LOOP:
   a. Parse ARCHITECT.md for expected files in scope
   b. Check actual files written vs expected
   c. If critical files missing: build targeted fix prompt, run one more pass
   d. Max 1 fix pass (don't loop infinitely)
9. Build artifact_manifest from all collected files
10. If repo_url: git add -A → git commit → git push
    Else: manifest stored in DB for later manual push
11. completeJob() with full artifact_manifest
```

### Session prompt structure

```
You are building a software project. Your scope is: {scope}

PROJECT ARCHITECTURE (ARCHITECT.md):
{architect_content}

{if context_files}
FILES ALREADY WRITTEN BY OTHER BUILDERS (read-only context):
{for each context_file: --- path ---\n{content}\n}
{/if}

YOUR TASK:
Build ALL files in your scope ({scope}).
- Read ARCHITECT.md carefully before writing anything.
- Write COMPLETE files. No placeholders, no "// ... existing", no stubs.
- You may read files you've already written to maintain coherence.
- When you are done, output a brief summary: how many files you wrote and their paths.

Start building now.
```

### File collection after session

```typescript
// Take snapshot of workDir before running adapter
const before = new Set(walkDir(workDir));  // all file paths

// ... run adapter ...

// Diff after
const after = walkDir(workDir);
const newOrModified = after.filter(p => !before.has(p) || contentChanged(workDir, p, snapshotContent));
```

---

## Concurrency Fix: Parallel Poll Loop

**Current:** Single `while(true) { await executeJob() }` — one job at a time.

**Fix:** Track active job count. Claim and run up to `MAX_CONCURRENT_JOBS` simultaneously.

### `index.ts` rewrite (simplified)

```typescript
const MAX_CONCURRENT = config.maxConcurrentJobs ?? 3;
let activeJobs = 0;

// Poll loop
while (running) {
  if (activeJobs < MAX_CONCURRENT) {
    const job = await pollForJob(config);
    if (job) {
      const claimed = await claimJob(config, job.id);
      activeJobs++;
      // Fire-and-forget — don't await
      executeJobDispatch(config, claimed).finally(() => activeJobs--);
    }
  }
  await sleep(config.pollIntervalMs);
}
```

### `config.ts` addition
```typescript
maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS ?? "3", 10);
```

### `.env.example` addition
```
MAX_CONCURRENT_JOBS=3
```

---

## Web UI Changes: `useBuildExecution.ts`

### Build path branching

When the execution backend is `local` (Claw), the decompose→dispatch loop must change:

```
Current (keep for edge builds):
  decompose → N build_task jobs → N pollExecutorJob calls

New (for local/Claw builds):
  resolve builder modules from locked builders
  → M build_session jobs (one per builder)  
  → M pollSessionJob calls
  → progress: count files in artifact_manifest as they arrive
```

### New function: `dispatchSessionLocal(builder, scope, architectContent, contextFiles)`

```typescript
const dispatchSessionLocal = useCallback(async (
  builder: Agent,
  scope: string,
  architectContent: string,
  contextFiles: Record<string, string>,
): Promise<boolean> => {
  const adapter = resolveLocalAdapter({ lane_owner: builder.id } as BuildTask);
  const executor = findOnlineExecutor(adapter);
  if (!executor) { /* fail gracefully */ return false; }

  const result = await invokeEdgeFunction<{ job: ExecutorJob }>('executor-api?action=submit', {
    session_id: state.activeSession?.id,
    job_type: 'build_session',
    adapter,
    scope,
    architect_content: architectContent,
    context_files: contextFiles,
    repo_url: cloneUrl,
    repo_name: repoConn?.repo ?? null,
    branch: repoConn?.default_branch ?? null,
    timeout_seconds: 1800,
  });

  return await pollSessionJob(result.job.id);
}, [...]);
```

### Module scope splitting

For 1 builder: `scope = "**"` (whole project)
For 2 builders: split based on ARCHITECT.md top-level directories (e.g., `apps/api/**` and `apps/web/**`)
For 3 builders: finer split — concierge proposes, user approves in Pre-Build

*Concierge is smart enough to read ARCHITECT.md and suggest the split. This replaces the current file-granular lane assignment.*

### Progress display for session builds

Session builds show a different UI:
- "Claude is building `apps/api/**`..." with a pulsing indicator
- As the job's `artifact_manifest` fills in (polled every 10s), show live file count
- On completion: file list with green checkmarks

---

## Backward Compatibility

- `build_task` job type continues to work exactly as before for edge builds
- `executeJob()` in executor.ts is unchanged
- Web UI: `isLocalBuild` flag gates the new path; edge builds still use decompose→dispatch
- All existing `build_task` jobs in DB continue to complete normally

---

## Phase Plan

### Phase 1 — Parallel poll loop (Claw-side only)
**Files:** `packages/maestroclaw/src/index.ts`, `packages/maestroclaw/src/config.ts`, `packages/maestroclaw/.env.example`
**Scope:** Replace sequential `await executeJob()` with fire-and-forget pool. `MAX_CONCURRENT_JOBS` config.
**Risk:** Low. No schema changes. Existing jobs unaffected.

### Phase 2 — Session adapter mode (Claw-side only)
**Files:** `packages/maestroclaw/src/adapters/types.ts`, `packages/maestroclaw/src/adapters/claude-code.ts`, `packages/maestroclaw/src/adapters/gemini-cli.ts`, `packages/maestroclaw/src/adapters/copilot-cli.ts`
**Scope:** Add optional `runSession()` to Adapter interface. Implement for ClaudeCode (remove `--print`, add `--dangerously-skip-permissions`). Others already write files directly.
**Risk:** Medium. `--dangerously-skip-permissions` needed for session mode — confirm Claude Code CLI supports it.

### Phase 3 — Session executor (Claw-side only)
**Files:** `packages/maestroclaw/src/executor.ts`
**Scope:** Add `executeSessionJob()`. File snapshot before/after. Session prompt construction. Session-level Ralph Loop. File collection and artifact_manifest.
**Risk:** Medium. Core logic change but isolated to new job type path.

### Phase 4 — Web UI session dispatch
**Files:** `src/hooks/useBuildExecution.ts`, `src/components/reveal/BuildWorkspace.tsx`
**Scope:** `dispatchSessionLocal()`. Module scope splitting. `pollSessionJob()`. Session progress UI.
**Risk:** Higher. Changes the dispatch path for local builds. Edge path must remain untouched.

### Phase 5 — Concierge scope intelligence
**Files:** `src/hooks/useThreads.ts`
**Scope:** Concierge reads ARCHITECT.md, proposes module splits for multi-builder sessions, user approves before build starts.
**Risk:** Low. Purely additive — Concierge message that blocks until user responds.

---

## Known Open Questions

1. **Does `claude --dangerously-skip-permissions` work on Windows?** Needs smoke test. If not, alternative is a prompt-based approval suppression or using an MCP-configured trust level.
2. **How does Claw know when Claude is "done"?** Process exit (code 0) is the signal. We trust Claude to exit when it finishes. Timeout is the safety net.
3. **Multi-builder context sharing.** If builder A finishes `apps/api/**` before builder B finishes `apps/web/**`, B's context_files should include A's output. This requires a handshake — B waits for A's manifest before starting, or starts with partial context and does a second coherence pass. Simplest v1: run sequentially with context sharing, parallel is Phase 6+.
4. **Greenfield push.** For greenfield builds (no repo_url), Claw writes to `builds/{session_id}/` but doesn't push to GitHub. The web UI needs a "Push to GitHub" step after session completion. Or: Pre-Build creates the GitHub repo first (GitHub API), then passes the URL.

---

## Files Changed Summary

| Phase | Files | Type |
|---|---|---|
| 1 | `maestroclaw/src/index.ts`, `config.ts`, `.env.example` | Claw-only |
| 2 | `maestroclaw/src/adapters/types.ts`, `claude-code.ts`, `gemini-cli.ts`, `copilot-cli.ts` | Claw-only |
| 3 | `maestroclaw/src/executor.ts` | Claw-only |
| 4 | `src/hooks/useBuildExecution.ts`, `src/components/reveal/BuildWorkspace.tsx` | Web |
| 5 | `src/hooks/useThreads.ts` | Web |

No new DB tables required for v2. `executor_jobs.job_type` already accepts any string. `context_bundle` JSONB column on `executor_jobs` can carry `architect_content` and `context_files` without schema changes.

---

*This spec supersedes the file-granular Claw build approach described in BUILD_V3_SPEC.md for local/CLI execution. BUILD_V3_SPEC.md Phase 1 routing layer and polling logic remain valid and are not replaced.*
