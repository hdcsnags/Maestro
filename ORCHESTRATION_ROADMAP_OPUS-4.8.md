# Maestro — Orchestration Roadmap

**Author:** Claude Opus 4.8 (GitHub Copilot CLI)
**Date:** 2026-05-29
**Status:** Proposal for review — nothing built yet. Companion to `opus4.8.md` (the technical audit).
**Read order:** Skim `opus4.8.md` first (graded audit), then this. This doc turns the Conductor's stated pain points into a sequenced, code-grounded plan — and explicitly marks where I pushed back rather than rubber-stamping.

> **On the spirit of this doc.** The Conductor asked for a sounding board with a spine, not a yes-machine. So every recommendation here is checked against what's actually in the codebase, and Part 4 is a dedicated "where I disagreed / where the risk is" section. If something here doesn't match what you're seeing, that's the doc working as intended — push back.

---

## Part 0 — The Thesis

> **The conductor's brain is in the wrong place.** Today the *web app* is the orchestrator: it decomposes work into per-file `build_tasks`, dispatches "2 at a time per builder" through edge functions, and gates everything behind manual triggers a human clicks. The fix is to move the orchestration brain into a **local lead-conductor agent**, make the web UI a **control surface** you wield (not the conductor itself), and feed it plans hardened by a **real council** — not four agents competing for your trust one at a time.

The five pain points collapse into one root cause and three layers:

| Pain point (your words) | Root | Layer |
|---|---|---|
| "chunk by chunk… too slow vs me orchestrating manually" | Orchestration logic lives in the app/edge, runs sequentially | **Conductor** |
| "one agent makes a scope plan, assigns lanes, others build in tandem, read in-progress file state" | No local coordinator role; lanes exist but aren't lead-driven | **Conductor** |
| "communicate with my local CLI tools from the web UI" | Telemetry channel is one-directional | **Bridge** |
| "personas, council, real debate, skills, rubber-duck, no agent fighting for trust individually" | Deliberation is one-shot + analysis-only; no memory; personas don't drive the plan | **Council** |
| "Claw mode lost drawers/carousel; UI breaks mid-build; too many manual triggers" | UX regression + stability defects + human-as-scheduler | **House (UX)** |

**Dependency order: Conductor → Bridge → Council + House.** The Conductor kills the daily pain; the Bridge lets you wield it; the Council + House make it sharp and pleasant. (See Part 4 for why this order is non-negotiable.)

---

## Part 1 — The Three Layers (current state → target, grounded in code)

### Layer 1 — THE CONDUCTOR (local lead-agent + true parallel lanes)

**What you want:** one CLI agent runs independently, ingests a P0/P1/P2 scope plan, assigns lanes to N peer agents, and they build *in tandem* — aware of each other's in-progress file state, reconciling collisions deterministically.

**What already exists (the good news):**
- `build_lanes` + `build_lanes.lane_paths` is already the authoritative write-scope mechanism.
- `packages/maestroclaw/src/iteration/locks.ts` already does path-level lock acquire/release.
- `packages/maestroclaw/src/iteration/runner.ts` already has per-step retry, quality checks, git checkpoints, rollback.
- `agent_query` (`_shared/persona-prompt.ts`) already gives agents a structured way to signal each other (`to`/`reason`/`question`/`files`/`blocking`).
- The local poll loop (`packages/maestroclaw/src/index.ts:74-103`) is *already parallel* — it tracks `runningJobIds` and runs up to `maxConcurrentJobs`.

**What's missing (the actual work):**
1. **A coordinator role.** Nothing today owns "decompose plan → assign lanes → watch shared state → reconcile." `useBuildExecution.ts` does a *flat* dispatch loop, not a lead-agent schedule. We add a local **Conductor** module in `maestroclaw` that holds the plan, leases lanes to peer agents, and arbitrates.
2. **Shared in-progress file-state awareness.** Agents currently lock paths but don't *read each other's uncommitted work*. The Conductor needs a shared view (the locks table + a per-lane status/diff feed) so agent B can see "agent A is mid-edit on `auth.ts`."
3. **Deterministic collision reconciliation.** This fixes audit finding **P1-4** (`github-execute` last-write-wins, `index.ts:973-979`). The Conductor resolves path collisions deliberately instead of relying on iteration order.
4. **Kill the sequential remnant.** The "2 at a time per builder" cap (`useBuildExecution.ts`) is — as you said — an API-key-orchestration leftover. Once the Conductor owns scheduling locally, this constraint is removed; concurrency is bounded by executor capacity + lane independence, not a hardcoded 2.

**Audit findings this layer pays down:** P1-4 (collisions), P1-5 (dispatch stalls), P2-3 (provider routing dup), partial P0-1/P0-2 (because a local coordinator is the right place to enforce a policy boundary).

---

### Layer 2 — THE BRIDGE (web UI ↔ local CLI, bidirectional)

**What you want:** talk to your local CLI tools from the web; see live output; steer mid-run.

**What already exists:** The substrate is *mostly there* — `executor-api` already has `poll_loop_controls` + `apply_loop_control` + `executor_job_events`, and the frontend already consumes Realtime job/event streams (Unified UX Phase 10). Today it's telemetry-out + a few control verbs.

**What's missing:** a **bidirectional command/console channel** — a typed "message to local agent" path (web → `executor_control` row → local node picks it up on its existing poll) and a live console view (local stdout/stderr → `executor_job_events` → Realtime → web terminal component). This is an *extension* of existing primitives, not a new system.

**Why it's Layer 2, not Layer 1:** it's the enabler for *wielding* the Conductor, but the Conductor delivers value even CLI-only first. Build the engine, then the cockpit.

---

### Layer 3 — THE COUNCIL + THE HOUSE (deliberation→plan + the UX to wield it)

**THE COUNCIL — what you want:** personas that genuinely debate a path forward, draw on memory and skills, rubber-duck per agent, and *produce the P0/P1/P2 plan* the Conductor executes — instead of four agents each pitching to win your trust.

**What already exists:** SOM-04 personas are a *strong static foundation* — `personas` table with `voice_preamble`, `strengths`, `weaknesses`, `routing_rules`, `anti_patterns`, `deliberation_signature`, `preferred_arguments`; the `deliberate` edge function runs Round-2 pushbacks; `repo_memory` (DIFF-02) gives flat repo memory. Personas are deliberately *prior-sets, not roleplay* — good design.

**What's missing (and where MiroFish comes in — see Part 2):**
1. **Per-persona persistent memory** (today: only flat `repo_memory`; no per-agent temporal/episodic memory).
2. **Council → plan output.** Deliberation currently produces pushbacks, not a structured, lane-ready P0/P1/P2 build plan handed to the Conductor. That handoff is the missing link between thinking and building.
3. **Bounded "rehearse-the-path" simulation** — the MiroFish mechanic worth stealing (Part 2), scoped to small-N expert deliberation.
4. **Skills as a real capability system** — *not* a revival of the dead `agent_skills` table (audit notes it's legacy/unused). A deliberate, scoped capability registry (writing/research/journaling) the council can invoke.

**THE HOUSE — what you want:** restore what Claw mode lost (carousel, drawers), strip manual triggers, fix the UI breaking mid-build.

**Honest framing:** this is **reconcile, not revert.** The pre-Claw carousel/drawers were better for *reviewing* competing responses; Claw mode is better for *threaded build*. The target is one shell that has both — a review surface (carousel/drawers) *and* the thread/runway — not a rollback. And **"UI breaks during build" is a defect, not a preference** (audit P2-2; you've flagged it repeatedly) — it gets fixed regardless of the rest.

---

## Part 2 — MiroFish: What To Steal, What To Leave

**What MiroFish actually is:** a prediction-by-mass-simulation engine (powered by CAMEL-AI's OASIS, Zep cloud graph-memory). It builds a GraphRAG world from seed data, spawns *thousands* of memory-bearing persona-agents that socially evolve, lets you inject "God's-eye" variables, and produces a prediction report. Backend modules: `graph_builder`, `oasis_profile_generator`, `ontology_generator`, `simulation_runner/manager/ipc`, `zep_*` (graph memory), `report_agent`.

**My verdict as your sounding board: do NOT import the engine.** Reasons:
- **Paradigm mismatch.** MiroFish predicts emergent *social* outcomes at scale. Maestro deliberates with a *handful of expert agents* to make a *build decision*. Different problem.
- **Dependency + cost.** It adds Zep cloud and a heavy Python simulation stack. Maestro already has Postgres; new external deps are exactly the supply-chain/cost surface the audit warns about.
- **Scope explosion.** GraphRAG world-building and thousand-agent sims would swamp the Conductor work that actually relieves your pain.

**Steal these three mechanics (built on your existing Postgres):**
1. **Persona profile depth** (from `oasis_profile_generator`) — auto-generate richer, situation-specific agent profiles instead of only static `voice_preamble`. Extends SOM-04, doesn't replace it.
2. **Per-agent temporal/episodic memory** (the *idea* behind `zep_*`, not the Zep dependency) — give each persona a memory of prior debates/decisions so the council *learns* across sessions. Store in Postgres alongside `repo_memory`.
3. **Bounded "rehearse-the-path" simulation** (the *essence* of `simulation_runner`) — before committing to a build path, run a short, capped multi-round persona interaction that stress-tests the plan and surfaces second-order risks. This is your "real debate to test pathways forward" — scoped to small-N, not a swarm.

**Leave:** OASIS swarm sim, GraphRAG world-building, Zep cloud, the prediction-report framing.

**What you may have already done:** SOM-04 personas + `deliberate` + `repo_memory` cover roughly the *static priors* + *one-shot debate* + *flat memory* slice. The MiroFish-shaped gaps are: (a) per-persona memory, (b) profile generation, (c) bounded rehearsal, (d) council→plan handoff. (Note: the state docs don't mention MiroFish — worth a one-line provenance note in `REFERENCE.md` so future agents know where the persona/memory lineage came from.)

---

## Part 3 — The Sequenced Plan

Each sprint carries its own P0/P1/P2 so we always ship the load-bearing piece first.

### Sprint 1 — THE CONDUCTOR *(recommended start)*
- **P0:** Local Conductor module in `maestroclaw` — ingest a plan, lease lanes to N peer agents, run in tandem (remove the hardcoded "2 at a time"). Shared in-progress file-state view via the existing locks table + a per-lane status feed.
- **P0:** Deterministic collision reconciliation (fixes audit P1-4).
- **P1:** Fix the dispatch-loop false-deadlock (audit P1-5) by gating on confirmed terminal states.
- **P1:** Operator-owned local policy boundary (audit P0-1/P0-2) — path jail + command/flag allowlist the Conductor enforces regardless of job content. *(This is the right sprint for it because the Conductor is the new chokepoint.)*
- **P2:** Unify provider routing into one module (audit P2-3) — also centralizes the JSON-repair work for Sprint-later.
- **Proof:** CLI-first. Demonstrate 3–5 agents building independent lanes in tandem, faster than sequential, with a clean reconcile on a deliberate path collision.

### Sprint 2 — THE BRIDGE
- **P0:** Bidirectional command channel (web → local agent) on the existing `executor_control`/poll substrate.
- **P0:** Live console view (local stdout/stderr → `executor_job_events` → Realtime → web terminal).
- **P1:** Fix "UI breaks mid-build" (audit P2-2 + your repeated flags) — this rides along because the Bridge touches the same live-update paths.
- **P2:** Mid-run steering (pause/redirect a lane from the web).

### Sprint 3 — THE COUNCIL + THE HOUSE
- **P1:** Council → plan handoff — `deliberate` emits a structured P0/P1/P2 plan + lane assignments the Conductor can ingest directly.
- **P1:** Per-persona Postgres memory (MiroFish mechanic #2).
- **P2:** Bounded "rehearse-the-path" simulation (mechanic #3) + richer profile generation (mechanic #1).
- **P2:** Reconcile the UX — one shell with *both* the review carousel/drawers and the build thread/runway; strip manual triggers now that the Conductor schedules.
- **P2:** Skills capability registry (deliberate, scoped — not the dead `agent_skills` table).
- **P2:** Doc hygiene — provenance note for MiroFish; fold/retire stale `ARCHITECTURE.md` (audit missed-opportunity #6).

---

## Part 4 — Where I Pushed Back (the barrier you asked for)

1. **Don't import MiroFish; steal three mechanics.** (Part 2.) The engine is a paradigm/scope/dependency mismatch. This is the biggest "I'd stop you here" of the doc.
2. **Conductor before Council.** Your daily, painful blocker is build *speed*. The council/simulation layer is the 12am-exciting part. If we build the council first, you'll still be slow. Resist the pull.
3. **"All strengths, no weaknesses" is a convergence trap.** A council where every agent is maxed-out converges to one bland answer — literally the "deliberation theater" risk your own SOM-04 notes flag. The value is *productive disagreement* (distinct priors + memory), not strength-maxing. Keep personas opinionated and divergent.
4. **UX is reconcile, not revert.** The old carousel/drawers were better for *review*; Claw mode is better for *build*. Target one shell with both. Reverting would re-lose what Claw mode got right.
5. **"UI breaks mid-build" is a defect, not a feature request.** It gets fixed on its own merits (Sprint 2), independent of the vision.
6. **Skills ≠ reviving `agent_skills`.** That table is dead for a reason. A capability system should be designed fresh, scoped, and council-invoked — not resurrected.

---

## Part 5 — Open Questions for the Conductor

1. **Concurrency ceiling:** when you say "5 agents at a time," is that 5 *distinct provider/CLI agents* on 5 lanes, or 5 instances? (Affects lane-independence design.)
2. **Plan authorship:** should the P0/P1/P2 scope plan be authored by *you*, by a single lead agent, or by the council (Sprint 3)? Sprint 1 can accept a human/lead-authored plan and defer council authorship.
3. **Collision policy:** when two lanes must touch the same file, do you want the Conductor to (a) serialize them, (b) force a synthesized single-author, or (c) escalate to you? (My default: serialize + escalate on true conflict.)
4. **Local policy boundary:** what's your comfort line for autonomous local commands — full path jail with per-dangerous-command approval, or a looser "trusted workspace" mode?
5. **MiroFish memory:** OK to build per-persona memory in Postgres (my recommendation), or do you specifically want the Zep graph-memory behavior?

---

## Appendix — Code Anchors (what already exists vs. needs building)

| Capability | Exists today | File(s) | Gap |
|---|---|---|---|
| Parallel local poll loop | ✅ | `maestroclaw/src/index.ts:74-103` | No lead-coordinator on top |
| Path lane scoping | ✅ | `build_lanes.lane_paths`; `iteration/locks.ts` | No shared in-progress *view* |
| Agent-to-agent signalling | ✅ | `_shared/persona-prompt.ts` (`agent_query`) | Analysis-mode only; not lane coordination |
| Collision handling | ⚠️ last-write-wins | `github-execute/index.ts:973-979` | Deterministic reconcile (Sprint 1) |
| Sequential dispatch cap | ⚠️ remnant | `useBuildExecution.ts` ("2 at a time") | Remove once Conductor schedules |
| Web↔CLI control verbs | ✅ partial | `executor-api` (`*_loop_controls`); `executor_job_events` | Bidirectional command + console (Sprint 2) |
| Personas (static priors) | ✅ | `personas` table; `_shared/persona-prompt.ts` | Memory + profile gen + plan output (Sprint 3) |
| One-shot deliberation | ✅ | `deliberate/index.ts` + `prompt.ts` | Council→plan handoff; rehearsal sim |
| Repo memory (flat) | ✅ | `repo_memory`; `repo-memory-update` | Per-persona temporal memory |
| Skills | ❌ dead | `agent_skills` (legacy) | Fresh capability registry |

---

*Prepared by Claude Opus 4.8 for the Conductor. This is a proposal — Part 5's answers will sharpen Sprint 1 before any code is cut. My recommendation stands: start with the Conductor.*
