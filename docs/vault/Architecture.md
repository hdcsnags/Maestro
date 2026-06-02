# Architecture

## The Three Layers (Opus Roadmap, 2026-05-29)

### Layer 1: Conductor (Sprint 1 — not yet built)
Local lead-agent coordinator. Will live in `packages/maestroclaw/src/conductor/`.
- Holds the current plan (P0/P1/P2 dependency graph)
- Assigns lanes to agents (non-overlapping file scopes)
- Tracks in-progress file state across all lanes
- Reconciles path collisions deterministically (last-committed-sha wins, not last-write-wins)
- Removes hardcoded 2-at-a-time cap from `useBuildExecution.ts`

### Layer 2: Bridge (Sprint 2 — not yet built)
Bidirectional web↔CLI channel.
- Currently: web fires fire-and-forget jobs at maestroclaw poll loop
- Goal: real-time status propagation both directions (what file is being written, which lane is blocked)

### Layer 3: Council + House (Sprint 3)
Deliberation produces structured P0/P1/P2 plans (not just pushbacks). Per-persona persistent memory. SSE streaming.

## Current Data Flow

```
RevealComposer
  → useOrchestration.broadcast()
    → callAgent() per active agent (parallel fetch)
      → orchestrate edge fn (Deno) → AI provider → response JSON
    → responses stored in Supabase (responses table)
  → FolioCarousel renders 3D carousel of responses

User clicks Synthesize
  → synthesize edge fn → Claude Haiku → synthesis stored

User clicks Execute (Build mode)
  → ExecutionModal shows file diff preview
  → github-execute edge fn
    → reads file_manifest from selected responses
    → upserts/deletes files on GitHub branch
    → opens PR
```

## maestroclaw Flow (current)

```
API request → JobQueue.addJob()
  → poll loop picks up job (parallel, up to maxConcurrentJobs)
    → adapter chain: claude_code → codex_cli → copilot_cli → gemini_cli
    → runner.ts: per-step retry, quality checks, git checkpoints, rollback
    → locks.ts: per-path lock acquire/release
```

## Key Architectural Decisions

| Decision | Rationale |
|---|---|
| No router | Navigation is pure state — `AuthPage` vs `WorkspacePage` + drawers via `activeDrawer` |
| All global state in MaestroContext | Single `useReducer`, ~23 fields, 40+ action types — no Redux, no Zustand |
| Business logic in hooks | `useWorkspace` + `useOrchestration` — not in components |
| Edge Functions are Deno | Not Node.js — use Deno import syntax (`npm:`, `jsr:`) |
| RLS on all tables | Auth goes through Supabase session Bearer token on every Edge Function call |
| `.maybeSingle()` not `.single()` | Queries that may return no rows use `maybeSingle()` to avoid errors |
| No Ruflo/ECC runtime | Maestro IS the orchestration surface — adopting a competing harness below creates layer collision |

## Known P1 Bugs (from Opus audit, outstanding)

- **P1-4:** `github-execute` last-write-wins on path collisions at line 973-979 — fix in Conductor `reconcile.ts`
- **P1-5:** Dispatch-loop false-deadlock gates on `claimed` not terminal state — fix in `useBuildExecution.ts`

## Related Notes
- [[Edge-Functions]]
- [[Database]]
- [[MaestroClaw]]
- [[Active-Sprint]]
