# Key Files — Where To Find Things

Quick reference for cold-start agents. Use this instead of re-reading the whole codebase.

## Must-Read First (always)

| File | What it is |
|---|---|
| `MAESTRO_STATE.md` | Operational state + last 5 session logs. **96KB — always use `view_range`.** |
| `AGENTS.md` | Mandatory workflow rules for all agents on this project. Read before writing any code. |
| `docs/SPRINT_MASTER.md` | Active sprint: FLOW-02 orb, AGENT-01 session log, SOM-04 personas, SOM-02 critique, MEM-02 decision graph. |
| `docs/CONDUCTOR_SPRINT_1.md` | Conductor sprint: C-01 Karpathy (done), C-02 repo_memory, C-03 Conductor module, C-04 skills embed. |
| `docs/reference/REFERENCE.md` | Stable architecture reference — update after structural changes. |

## Frontend — Core Files

| File | What it is |
|---|---|
| `src/App.tsx` | Root: `AuthProvider` → `MaestroProvider` → `WorkspacePage` |
| `src/context/MaestroContext.tsx` | Global state — `useReducer`, ~23 fields, 40+ action types. All state lives here. |
| `src/context/AuthContext.tsx` | Supabase auth state (user, session, signIn/Out/Up) |
| `src/hooks/useWorkspace.ts` | Boot sequence: ensureWorkspace → ensureAgents → loadSessions → loadProviderConnections → loadRepoConnections → ensureSession → loadSessionHistory |
| `src/hooks/useOrchestration.ts` | Broadcast to agents, synthesis, GitHub execution, audit logging |
| `src/types/index.ts` | **ALL shared TypeScript interfaces.** AGENT_DEFAULTS, PROVIDER_REGISTRY, PROVIDER_COLORS, FileManifestEntry, etc. |
| `src/pages/WorkspacePage.tsx` | Main workspace — keyboard shortcuts, drawers, carousel, Escape handler |

## Frontend — Key UI Components (`src/components/reveal/`)

| File | What it is |
|---|---|
| `RevealComposer.tsx` | Prompt input, mode picker (analysis/build/artifact), verbosity tier |
| `FolioCarousel.tsx` | 3D carousel — manages folioIndex, card positions (active/left/right/far) |
| `FolioCard.tsx` | Individual agent response card — signals, artifacts, file diff preview |
| `SynthesisDrawer.tsx` | Synthesis view + keyword-based contradiction detection (6 categories) |
| `ExecutionModal.tsx` | PR creation modal — "Files to write" diff preview, approval flow |
| `OrchestraDrawer.tsx` | Agent roster management, persona selection |
| `VaultDrawer.tsx` | API keys (vault edge fn) + GitHub OAuth + repo picker |
| `TrustDrawer.tsx` | Audit trail view (`audit_events` table) |
| `EmptyStage.tsx` | Shown when active session has zero rounds |
| `ClawMode.tsx` | MaestroClaw iteration loop UI — compact orb mode |
| `SessionSwitcher.tsx` | Session create/switch/rename |

## Backend — Edge Functions

| File | What it is |
|---|---|
| `supabase/functions/orchestrate/index.ts` | Main AI routing. `buildSystemPrompt()` at line 170, `parseResult()` at line 561. **~1000+ lines.** |
| `supabase/functions/github-execute/index.ts` | File writes to GitHub. `applyManifest()`, `upsertFile()`, `utf8ToBase64()`. |
| `supabase/functions/synthesize/index.ts` | Synthesis via Claude Haiku |
| `supabase/functions/deliberate/index.ts` | PRO-01 deliberation round 2 |
| `supabase/functions/repo-memory-update/index.ts` | DIFF-02 memory CRUD |
| `supabase/functions/design/index.ts` | Design Phase — HTML mockup generation |
| `supabase/functions/intake/index.ts` | Pre-Build — new vs existing repo detection |
| `supabase/functions/architect/index.ts` | Pre-Build — build spec generation |
| `supabase/functions/_shared/` | `auth.ts`, `cors.ts`, `body.ts`, `secrets.ts`, `persona-prompt.ts` |

## Local Execution Node

| File | What it is |
|---|---|
| `packages/maestroclaw/src/index.ts` | JobQueue + parallel poll loop (line 74-114) |
| `packages/maestroclaw/src/iteration/runner.ts` | Retry, quality checks, git checkpoints, rollback |
| `packages/maestroclaw/src/iteration/locks.ts` | Per-path lock acquire/release |
| `packages/maestroclaw/src/executor.ts` | Adapter chain driver |

## Configuration & Types

| File | What it is |
|---|---|
| `src/index.css` | Custom CSS classes (`.folio-card`, `.drawer-panel`, `.reveal-pill`, etc.). Breakpoints: 980px, 720px. |
| `tailwind.config.js` | Custom color tokens: `void`, `gold`, `agent.claude`, `signal.ok`, etc. |
| `supabase/migrations/` | 49 migrations. Most recent: `20260406180000` (file_manifest column). |
| `database.types.ts` | Generated — never hand-edit. Regenerate: `npx supabase gen types typescript` |

## Documentation

| File | What it is |
|---|---|
| `docs/vault/` | This Obsidian vault — project knowledge graph for cold-start |
| `docs/specs/active/` | 17 active feature specs (BOUNCER, DIFF, CLAW_MODE, etc.) |
| `docs/specs/archive/` | Superseded specs — read-only |
| `.addons/` | 6 plugin assessments + `INTEGRATION_PLAN.md` (Opus 4.8) |
| `ORCHESTRATION_ROADMAP_OPUS-4.8.md` | Opus 4.8 architectural audit (2026-05-29) |

## Commands

```bash
npm run dev          # Start Vite dev server
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # TypeScript check (tsc --noEmit) — no separate test suite
npm run preview      # Preview production build
```

## Related Notes
- [[Architecture]]
- [[Edge-Functions]]
- [[Database]]
- [[MaestroClaw]]
