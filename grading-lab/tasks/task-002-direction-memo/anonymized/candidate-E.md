# Direction Memo: Maestro’s Next Six Weeks

## 1. Where the Project Actually Is

Maestro is a broad, working prototype with real orchestration, deliberation, local execution, GitHub paths, CI, Graphify visibility, and a serious amount of product surface already built. But the strongest product claim is not yet true in the codebase: Maestro is not yet an empirically adaptive council. The graph report explicitly says there is no reputation/scoring community, and the state file confirms that Conductor exists but is structurally separate from the active iteration runner. Several “working” claims mean “code exists” or “was smoke-tested once,” while the current broken/incomplete list still calls out unverified local build flow, artifact-to-GitHub gaps, split Claw/Build UX, and cloud-coupled local planning. The project is past toy stage, but not yet past prototype trust.

## 2. The Bet

The highest-leverage six-week focus is: **ship the grading/reputation loop as a real product primitive, on one narrow end-to-end build path.**

Not more UX surface. Not mobile. Not another orchestration architecture pass. The core bet should be to make Maestro learn, in production terms, which model/harness/role combinations actually perform well on real tasks.

This wins because it turns Maestro’s thesis from narrative into machinery. The philosophy says “the grading loop is the engine,” but the graph says that engine does not exist yet. The July 1 grading lab result is the strongest recent signal: peer grading produced stable rankings, caught real defects, exposed wrapper/model identity issues, and generated useful operational lessons. That is more strategically valuable than another polish sprint because it validates the differentiator no generic agent framework has.

The product should spend six weeks closing this loop:

- real task runs produce structured artifacts,
- outputs are graded by peer agents and optionally by the human,
- grades are stored against resolved model, provider, harness, role, task type, and context,
- future roster/routing decisions consume those scores,
- the system can show why one agent was selected over another.

The narrow path matters. Do not try to rate everything immediately. Pick one path: local Claw build session from prompt to artifacts to GitHub PR, with enough instrumentation to compare agents. The point is not to perfect all build modes. The point is to create the first durable empirical flywheel.

## 3. What I Am Explicitly Deferring

I would defer the mobile surface. It may be part of the vision, but it depends on the council being meaningfully better than a single model. Until the grading loop exists, mobile is mostly a new shell around an unproven advantage.

I would defer major UX redesign beyond what is needed to expose grading results and run the chosen golden path. The UI already has a lot of surface area. More interface work risks making the prototype feel richer while the core claim remains unimplemented.

I would defer broad pattern-library/RAG work. It is attractive because it compounds with the local power-user story, but without grading it is just more context retrieval. The more important memory right now is outcome memory: who performed well, where, and under what conditions.

I would defer general-purpose Conductor expansion except where needed for the rated path. Conductor being an island is a real architectural gap, but wiring it everywhere before Rate exists risks building scheduling machinery without feedback.

I would defer deep sandboxing/Docker hardening unless the selected path requires a minimal safety fix. This costs security maturity, and it is not free: shell execution remains a trust concern. But a six-week sandbox sprint would not prove Maestro’s central product thesis.

## 4. Risks of the Bet and Mitigations

The first risk is that grading quality does not generalize beyond code review. Task 001 looked stable, but subjective direction memos and build artifacts may produce noisier rankings. Mitigation: start with task classes that have observable outcomes: code review findings, build success, tests, artifact completeness, PR diff quality, and human accept/reject. Add subjective tasks only after the metrics schema survives concrete ones.

The second risk is that the loop becomes a vanity scoreboard. If scores do not change routing, the project gets analytics rather than adaptation. Mitigation: require one routing decision to consume reputation data by the end of the sprint, even if the policy is simple: prefer the highest-scoring resolved model+harness for a task type unless provider health or cost blocks it.

The third risk is bad identity modeling. The grading lab already found that “Copilot auto” resolved to a different model than expected. Mitigation: key reputation on resolved model, provider, wrapper/harness, adapter, role, task type, and prompt mode. Do not score “Claude” or “Copilot” as vague labels.

The fourth risk is lack of usable run data because the build path is still partially unverified. Mitigation: make the first milestone a single golden-path smoke: local build session, artifact aggregation, GitHub PR, Bouncer/review, grading record. Do not expand scope until this produces repeatable data.

The fifth risk is security debt. Local execution plus grading creates incentives to run more agent-generated code. Mitigation: keep approvals, command scope, and artifact boundaries visible in the rated path, and record security findings as negative grading signals. Do not let Rate reward agents that “succeed” by bypassing safety.

## 5. First Three Concrete Steps

1. **Define the Rate record and identity schema.**  
   Create the minimal data model for `task_run`, `agent_attempt`, `grade`, and `routing_decision`. It must capture resolved model, provider, harness, adapter, persona/role, task type, prompt mode, cost/latency, artifacts, tests run, peer grades, human anchor grade, and final outcome.

2. **Instrument one golden path end to end.**  
   Use the local Claw build-session path as the first rated workflow. Verify prompt to local execution to artifact manifest to GitHub PR. Every agent output in that path should produce an `agent_attempt`; every review or Bouncer result should produce a `grade` or quality signal.

3. **Make one routing decision use Rate.**  
   Add a simple reputation-aware roster selection for one task type, probably build-session worker selection or review-agent selection. The policy can be crude, but it must close the loop: past graded outcomes influence the next council composition. That is the moment Maestro starts becoming the product described in its philosophy.