# MaestroClaw

Local execution node at `packages/maestroclaw/`. Node.js package. Version 0.1. Runs CLI-based AI adapters locally for long-running builds that need file system access, git operations, and shell execution.

## File Structure

```
packages/maestroclaw/src/
├── index.ts          — Entry point: JobQueue class, parallel poll loop, HTTP API server
├── api.ts            — HTTP API surface (job submission, status queries, lock acquire/release)
├── config.ts         — Environment config (maxConcurrentJobs, adapter paths, etc.)
├── executor.ts       — Main execution driver; invokes adapter chain per job
├── adapters/
│   ├── claude-code.ts    — Claude Code CLI adapter
│   ├── codex-cli.ts      — Codex CLI adapter
│   ├── copilot-cli.ts    — GitHub Copilot CLI adapter
│   └── gemini-cli.ts     — Gemini CLI adapter
├── iteration/
│   ├── runner.ts         — Per-step retry, quality checks, git checkpoints, rollback
│   ├── locks.ts          — Per-path lock acquire/release (via executor API)
│   ├── prompt.ts         — Prompt construction for iteration steps
│   └── apply-diff.ts     — Diff application to working tree
└── lib/                  — Shared utilities
```

## Key Behaviors

### Poll Loop (index.ts:74-114)
Genuinely parallel — `activeJobs` counter + `runningJobIds` set + fire-and-forget `void jobRunner`, bounded by `maxConcurrentJobs`. The 2-at-a-time cap is in `useBuildExecution.ts` (web layer), NOT here.

### Adapter Chain
Tries `claude_code` → `codex_cli` → `copilot_cli` → `gemini_cli` in order. Falls back on failure.

### Locks (locks.ts)
Per-literal-path lock acquire/release. Prevents two agents writing the same file simultaneously. Glob paths are NOT locked (only literal file paths).

### Runner (runner.ts)
Per-step retry with configurable max attempts. Git checkpoint after each successful step. Rollback on failure. Quality check gate between steps.

### Session Log
Currently emits raw stdout. AGENT-01 spec (SPRINT_MASTER) will add structured `{ type, ts, content }` JSONL per step.

## What's Missing (Conductor Sprint 1 — C-03)

| Missing Piece | Impact Today | Fix |
|---|---|---|
| Coordinator role | No lead-agent holds the plan; lanes assigned ad-hoc | New `conductor/conductor.ts` |
| Plan schema | No P0/P1/P2 dependency graph | New `conductor/plan.ts` (GOAP-style) |
| Deterministic reconcile | Path collisions → last-write-wins (P1-4 bug) | New `conductor/reconcile.ts` |
| Shared in-progress view | Web layer can't see real-time file state | Bridge layer (Sprint 2) |
| Dynamic concurrency cap | Cap hardcoded in web layer at 2 | Conductor makes it dynamic |

## Integration Points

- **Web layer** submits jobs via HTTP to maestroclaw API (`api.ts`)
- **github-execute** edge function handles GitHub writes — maestroclaw doesn't write to GitHub directly
- **repo-memory-update** edge function is the memory store — maestroclaw reads context but doesn't write memory
- **locks.ts** communicates with executor via the same HTTP API surface

## What Conductor Sprint Reuses (do NOT rewrite)

- `locks.ts` — path locking is already correct
- `runner.ts` — retry/checkpoint/rollback is already correct  
- Poll loop in `index.ts` — parallel execution is already correct; cap is just a parameter

## Related Notes
- [[Architecture]]
- [[Active-Sprint]]
- [[Key-Files]]
