# Direction Memo — Maestro, Next Six Weeks

**From:** Independent technical advisor
**Date:** 2026-07-01
**Question:** What is the single highest-leverage focus for the next six weeks?

---

## 1. Where the project actually is

Maestro is a genuinely large, mostly-real prototype — 19 deployed edge functions, 51 applied migrations, a local execution node with adapter fallback chains, CI green, lint at zero, and one proven end-to-end build (76/76 tasks → merged PR, 2026-04-16). The operational hygiene since June is impressive: deploy-drift audits, verification dates, a knowledge graph of the codebase. This is not vaporware.

But the documents oversell in one place that matters more than all others. The philosophy declares **"the grading loop is the engine"** and lists it under v2 as *"stable, pushed, in the repo."* The evidence says otherwise. The graph report — the most objective artifact here — finds **no reputation or scoring community anywhere in 1,235 nodes**; the state file's own June-26 entry admits "agent-grading (Rate) is net-new." What exists is `grading-lab/`: a *manual* protocol the Conductor ran once, by hand, dispatching CLI agents from a terminal. The product's routing is static config and hand-seeded personas. The one-sentence thesis — *"an empirically adaptive council that gets better every time it runs"* — describes a system that has never run. Other soft spots: the Conductor module is a structural island not wired into the iteration runner (C-06 deferred twice); the local-Claw-to-GitHub flow has never been end-to-end tested through the real UI; the June-9 assessment's security blockers (shell injection in `approved-shell`, unscoped `agent_query` reads, replayable HMAC tokens) remain open; and the May-7 "PRO-01 deployed" claim was false for a month — so treat any unverified claim here with suspicion.

The pattern is clear: this project ships *surface area* (68 communities, ten "Unified UX Phases," personas, verbosity tiers, orb states) at a remarkable rate, while its stated engine has zero lines of product code.

## 2. The bet

**Build Rate — the grading loop — into the product, thin and end-to-end, and make it run on every real session.** Every council round and every build step gets graded (peer-agents automatically, the user when present); grades persist keyed on *resolved model + harness* (the wrapper lesson from task-001); and by week six, at least one routing decision — builder-lane scoring is the natural first consumer — reads from accumulated grade data instead of static config.

Why this, why now:

- **It is the only thing Maestro has that nobody else does.** The features shipped so far — multi-provider broadcast, synthesis, PR generation — are replicable and being replicated. The longitudinal graded-outcome flywheel is the differentiation the philosophy stakes everything on. A thesis with no implementation is a pitch, not a product.
- **The methodology is already validated — manually.** Task-001 produced exactly the calibration data you'd want before automating: 4/5 identical peer rankings across shuffles, no position bias, no self-preference, Spearman 0.90 against the human anchor. The risky science is done. What remains is engineering, and this team demonstrably ships engineering.
- **The flywheel compounds, so delay is uniquely expensive here.** Every session run without grading is training data lost forever. A UX sprint deferred six weeks costs six weeks; grading deferred six weeks costs six weeks of *irreplaceable* outcome history.
- **It forces dogfooding.** Rate only produces data if Maestro is actually used, which will surface the untested paths (local build E2E, Claw→GitHub) as a side effect rather than as a separate stabilization project.

Scope discipline: this is *not* the full self-improvement loop. No auto-tuned personas, no self-modifying prompts, no pattern-library RAG. Grades in, grades stored, one routing surface reading them. Feature freeze on everything else.

## 3. What I am explicitly deferring

- **Security Phase 1 (sandboxing, HMAC nonces, agent-query scoping).** Cost: real exposure — but the current threat model is one power user on his own machines, pre-launch. One exception below.
- **Conductor wiring (C-06) beyond what Rate needs.** The island stays an island for now; the manifest-conflict fix-list from the six-review consensus waits. Cost: parallel builds stay less coordinated than designed.
- **The UX sprint, mobile surface, and public launch prep.** Cost: the product keeps looking like a cockpit. Acceptable — launching the philosophy narrative before the engine exists would invite the exact "wrapper with extra steps" critique the philosophy levels at others.
- **Refactoring `useMaestro()` (99-edge god node) and the adapter import cycles.** Cost: friction on every frontend change. Live with it; a refactor now would stall the only work that compounds.
- **Research agenda (AutoGen/MoE/Sakana comparisons).** Cost: none in six weeks. Do it when there's grade data to compare against.

## 4. Risks and mitigations

1. **Grading destabilizes on non-legible tasks.** Task-001 was code review — high "right-and-wrong-ness." Council rounds on open-ended prompts may grade noisily. *Mitigation:* task-002 (this very exercise) is already probing this; ship Rate first for build steps and code review where legibility is proven, expand to ideation grades only after variance data exists.
- **Peer-grading burns API spend.** ~$30/5 days was already painful. *Mitigation:* route graders through MaestroClaw local CLIs — the grading lab already proved graders run at zero API cost on user sessions. Make local grading the default.
2. **Dogfooding the ungated executor bites.** More usage on an unsandboxed `approved-shell` raises self-inflicted-injury odds. *Mitigation:* the one security exception — spend the two days to fix the `shell:true` injection vector before volume ramps. It's the cheapest of the Phase-1 items and the only one that dogfooding directly aggravates.
3. **The feature-shipping reflex reasserts itself.** Ten UX phases in one day (May-1) shows the gravitational pull. *Mitigation:* an ACTIVE LOCK in MAESTRO_STATE.md declaring the freeze, and a standing rule: any session that doesn't advance Rate must justify itself in the session log.
4. **Six weeks isn't enough for routing to visibly improve.** With one user, grade volume may be too thin to change lane scores meaningfully. *Mitigation:* success criterion is the *pipe working end-to-end with real data flowing*, not measurable routing lift. The flywheel's first turn, not its cruising speed.

## 5. First three concrete steps

1. **Day 1–3: Schema + write path.** Migration for a `grades` table (`task_id`, `session_id`, `graded_response_id`, `grader` — *resolved model + harness*, per the wrapper lesson — `rubric_scores jsonb`, `rank`, `blind_shuffle_seed`, `created_at`; append-only like `audit_events`). Port `grading-lab/PROTOCOL.md`'s shuffle/isolation rules into a `_shared/grading.ts` module. Backfill task-001's results as the first rows.
2. **Day 3–8: Automatic post-round grading.** New `grade` edge function + Claw-side grading job: when a council round completes or a build step's manifest passes verification, dispatch blind peer grades (local CLI adapters first, cloud fallback), persist results, surface a minimal grade chip on FolioCard. Simultaneously fix the `approved-shell` injection vector (the one security carve-out).
3. **Day 8–12: First consumer + first proof.** Point `scoreBuildCandidate()` / builder-lane scoring at aggregated grade history (fallback to current static scores when data is thin). Then run the deferred **local build E2E smoke test** as the first fully-graded build — one run that simultaneously validates the untested Claw→GitHub path and turns the flywheel for real.

Six weeks from now, the correct sentence should change from *"Maestro is a council that could learn"* to *"Maestro has N graded rounds and its builder routing already reflects them."* That sentence is the product.