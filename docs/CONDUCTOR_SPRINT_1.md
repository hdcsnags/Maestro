# Maestro — Conductor Sprint 1
*Companion to `docs/SPRINT_MASTER.md`. Prioritized from `ORCHESTRATION_ROADMAP_OPUS-4.8.md` + addon assessment (2026-06-02). Read alongside `MAESTRO_STATE.md` and `AGENTS.md`.*

---

## Goal

Build the Conductor layer on top of existing `maestroclaw` primitives. No new runtimes adopted — build on `locks.ts`, `runner.ts`, and the existing poll loop. Take content/methodology from the addon shelf; take runtime from none.

---

## Part A — Sprint Items (priority order)

### C-01: Karpathy Principles in buildSystemPrompt ✅ Done 2026-06-02

**What:** 4 behavioral principles injected into `orchestrate/index.ts:buildSystemPrompt()` for `build` and `build_task` modes only. Principles: Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution.

**Source:** `.addons/andrej-karpathy-skills/README.md`  
**File:** `supabase/functions/orchestrate/index.ts`  
**Owner:** Sonnet (done)

---

### C-02: repo_memory Structural Enhancement

**Problem:** `repo_memory` is flat — no relationship graph, no categorization. Agents can't trace "this component → this edge function → this table."

**Fix:** Add two columns:
- `kind TEXT` — one of: `component` | `edge_fn` | `table` | `concept` | `decision` | `file`
- `relations JSONB` — array of `{ to: string, label: string }` edges (wikilink-equivalent)

Seed with architecture graph from `docs/vault/` notes (built this session).

**Migration:** `supabase/migrations/YYYYMMDD_repo_memory_graph.sql`  
**Edge fn update:** `repo-memory-update/index.ts` — add kind+relations to get/update operations  
**Owner:** Sonnet  
**Blocks:** C-03 (Conductor queries enriched repo_memory at session start)

---

### C-03: Conductor Coordinator Module

**Problem:** No lead-agent holds the plan. Path collisions resolved by last-write-wins (P1-4 bug). Concurrency cap hardcoded in the web layer, not in the execution node. No real-time in-progress view.

**Design:** New module `packages/maestroclaw/src/conductor/`:
- `conductor.ts` — coordinator role: holds plan, assigns lanes, tracks in-progress paths
- `plan.ts` — P0/P1/P2 plan schema (GOAP-style dependency graph — pattern from ruflo-goals, no Ruflo dependency)
- `reconcile.ts` — deterministic collision reconcile: last-committed-sha wins, not last-write-wins

**What it reuses (do NOT rewrite):**
- `locks.ts` — path locking is already correct
- `runner.ts` — retry / checkpoint / rollback is already correct
- Poll loop in `index.ts:74-114` — parallel execution already works; cap is a parameter

**What it changes:**
- `maxConcurrentJobs` becomes dynamic (from plan complexity), not hardcoded
- Remove `2-at-a-time` cap from `useBuildExecution.ts` (web layer) — let Conductor govern
- P1-5 fix: dispatch-loop false-deadlock gates on `claimed` not terminal state — fix alongside

**P1 bugs fixed by this module:**
- P1-4: `github-execute` last-write-wins (line 973-979) → `reconcile.ts` handles
- P1-5: false-deadlock in dispatch loop → fix `useBuildExecution.ts` gate condition

**Owner:** Sonnet  
**Depends on:** C-02

---

### C-04: Superpowers Skills Embed in Conductor Prompt

**What:** Embed selected `obra/superpowers` skills as system prompt context in the Conductor's lead-agent prompt. Not in `buildSystemPrompt()` — in the new coordinator's prompt.

**Skills to embed (content only — no harness):**
- `dispatching-parallel-agents` — concurrent subagent workflow discipline
- `subagent-driven-development` — spec → quality-gate per lane
- `writing-plans` — P0/P1/P2 plan schema (shapes coordinator output format)
- `using-git-worktrees` — lane isolation mental model

**Source:** `.addons/superpowers/README.md`; fetch full SKILL.md files from `github.com/obra/superpowers`  
**Owner:** Sonnet (with C-03 — same PR)

---

### C-05: Born Organized Scaffold Pack (opt-in, post-Conductor)

**Concept:** Maestro-built projects come pre-wired for agentic collaboration. The Pre-Build phase appends a scaffold pack to `file_manifest` before `github-execute` runs.

**MVP scaffold pack (~7 files):**
- `AGENTS.md` (project-scoped, generated from template)
- `CLAUDE.md` (Karpathy 4 principles verbatim)
- `PROJECT_STATE.md` (MAESTRO_STATE.md-lite: state + session log discipline)
- `.maestro/repo_memory.json` (architecture graph seed from the build spec — free at scaffold time)
- `skills/` folder — 5 skills matched to project type (from ECC 249-skill library)
- Auto-generated `README.md` section documenting the agentic layer

**Gate criteria (don't emit for everything):**
- Net-new Maestro-scaffolded repo only (not existing repo — don't litter established projects)
- Build spec has ≥10 file entries (complex enough to warrant it)
- User opt-in toggle in Pre-Build UI (default OFF for existing repos, default ON for new)

**Integration point:** `intake` or `architect` edge function — append to `file_manifest` before returning  
**Owner:** Sonnet (after C-03 proven)  
**Priority:** P2 — post-Conductor

---

## Part B — Addon Integration Decisions

Final decisions from Opus 4.8 assessment, 2026-06-02. Full assessment in `.addons/INTEGRATION_PLAN.md`.

| Addon | Decision | When | Integration Point |
|---|---|---|---|
| **andrej-karpathy-skills** | ✅ Done | 2026-06-02 | `orchestrate/index.ts:buildSystemPrompt()` build modes |
| **superpowers** (4 skills) | ✅ Embed in Conductor prompt | Sprint 1 / C-04 | New Conductor module coordinator prompt |
| **ECC process skills** | ✅ Content-only | Sprint 1 | Conductor QA gate prompt + `runner.ts` retry prompts |
| **ECC verification-loops** | ✅ Content-only | Sprint 1 | Build-lane quality checks |
| **ECC memory hooks pattern** | ✅ In Postgres (not ECC SQLite) | Sprint 3 | Per-persona memory — already on roadmap |
| **ruflo** | ❌ Do not integrate | — | Mine GOAP schema pattern only for `plan.ts` (C-03) |
| **obsidian vault** | ✅ Seeded this session | Now | `docs/vault/` — read-projection of repo_memory; never source of truth |
| **open-design tokens** | ✅ Content enrichment only | Post-Sprint 3 | `design` edge fn prompts — phase already built |
| **ECC runtime / afaan harness** | ❌ Do not install | — | 249 skills = reference library; cherry-pick content only |

---

## Part C — P1/P2 Bugs Targeted This Sprint

From Opus roadmap audit (still outstanding as of 2026-06-02):

| ID | Issue | File | Fix in |
|---|---|---|---|
| P1-4 | `github-execute` last-write-wins on path collisions | `github-execute/index.ts:973-979` | C-03 `reconcile.ts` |
| P1-5 | Dispatch-loop false-deadlock (gates on `claimed` not terminal state) | `useBuildExecution.ts` | C-03 (alongside cap removal) |
| P2-3 | Provider routing duplicated across edge functions | multiple | P2 — post-Conductor |
| P2-2 | UI breaks mid-build | `ExecutionModal.tsx` | P2 |

---

## Part D — What NOT to Build This Sprint

- **Ruflo runtime** — layer collision with maestroclaw, non-deterministic, dep surface not justified
- **Obsidian as source of truth** — `docs/vault/` is a read-projection; `repo_memory` table is canonical
- **ECC harness install** — cherry-pick skill *content* only; don't introduce the runtime
- **FLOW-01 intent toggle** — requires `concierge-triage` edge function (not yet built); explicitly excluded per SPRINT_MASTER Part E

---

## Part E — Open Questions for Conductor

1. **GitHub URL** — user providing live repo URL this session (enables Supabase function verify)
2. **Supabase sync** — verify deployed function versions match local after Karpathy embed (C-01)
3. **SOM-01 Streaming** — which machine/repo has working SSE code? Unblocks Sprint Round 3 (SPRINT_MASTER)
4. **Conductor scope** — C-03 lives in `maestroclaw` (local node). Confirm: does the web layer (`useBuildExecution`) become a thin client that delegates all concurrency decisions to the Conductor? Or does the web layer retain final authority?
5. **repo_memory seeding** — who seeds the initial architecture graph from `docs/vault/`? Manual (this session) or automated on first Claw run?

---

## Relationship to SPRINT_MASTER.md

This sprint runs **in parallel** with `docs/SPRINT_MASTER.md`'s FLOW/SOM/AGENT/MEM track. They share the same codebase but touch different layers:

- SPRINT_MASTER: UX, orb, verbosity, personas, streaming, cross-CLI critique, decision graph
- CONDUCTOR_SPRINT_1: orchestration substrate, concurrency, collision, memory structure, addon integration

File overlap risk: `orchestrate/index.ts` is touched by both (FLOW-04 verbosity in SPRINT_MASTER; Karpathy in C-01 here). C-01 is already done — future SPRINT_MASTER changes to that file should check this sprint first.

---

*Created: 2026-06-02 — Copilot CLI (Sonnet 4.6), from Opus 4.8 roadmap + addon assessment*  
*Per AGENTS.md Rule 1: update MAESTRO_STATE.md after completing items in this sprint.*
