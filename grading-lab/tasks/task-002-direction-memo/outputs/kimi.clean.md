# Direction Memo — Maestro Next Six Weeks

## 1. Where the project actually is

Maestro is a feature-rich prototype with a clear, differentiatedthesis — that model *personality* matters more than conversation structure, andthat the right council composition should be learned empirically rather than assigned manually. That thesis is compelling. The codebase, however, is still mostly a prototype that has *built* many pieces of the vision without yet *closing* the loop that would validate it.

A few claims in the documents deserve challenge:

- **The philosophy calls the grading loop "the engine"**, but the graph report shows **no reputation/scoring community** in the code, and the statefile lists agent grading as "net-new." The engine is aspirational, not operational.
- **v2 is described as "close the open wounds,"** yet the "What's Working" table is long and the "What's Broken or Incomplete" table is also long. Many items are "code verified" rather than live-tested, which often means "the typecheck passed."
- **The self-improvement flywheel (v3) is mapped out**, but the Conductor module (C11) is a structural island, not yet wired into `runIterationLoop` (C3). A flywheel with a disconnected axle doesn't turn.
- **The grading lab just ran task-001** and found c-06 needs rework. That is useful, but it also shows that the project's own internal quality control is only now being stood up.

In short: Maestro has built an impressive surface area, but its central claim — that it learns which models work best together — is still largely unproven and un-wired.

## 2. The bet

**Ship a closed-loop Rate layer: turn peer/agent grading into measurable, automatic updates to routing weights and builder roster selection.**

This is the one focus because it is the only thing that makes Maestro meaningfully different from LangChain, CrewAI, or AutoGen. Those frameworks can also dispatch multiple models in parallel. What they cannot do — what Maestro claims to do — is *learn from outcomes* which compositions win.

What this wins:

- **It validates the thesis.** If Maestro cannot show, with data, that graded routing produces better outputs than manual roster selection, then the philosophy is a story, not a product.
- **It connects existing islands.** Conductor, deliberation, synthesis, repo memory, and the grading lab all become more valuable once they feed a live reputation signal.
- **Itcreates a compounding asset.** Every build becomes training data. Competitors would have to replicate both the loop and the data, not just the UI.
- **It forces clarity on "good."** The hardest design question in Maestro — what does "best" mean for a given task? — becomes a first-class problem instead of an implicit assumption.

Why now: the grading lab just demonstrated that calibrated peer grading can catch real defects (c-06). The infrastructure for collecting grades exists. The missing piece is the feedback arm that turns grades into action.

## 3. What you are explicitly deferring

- **Mobile surface.** A consumer chat UI would be a distraction before the core engine is real. Cost: delayed user growth, but launching a weak narrative would be worse.
- **Full local version / Docker sandbox hardening.** Important to the security model, but secondary to proving the adaptive-council thesis. Cost: local-first power users wait; trust chassis stays prototype-grade.
- **Major UX redesign.** The Claw/BuildWorkspace split is rough, but polishing it before the loop closes means optimizing a broken assumption.
- **Public launch narrative.** The philosophy is a strong story; tell it only after there is live evidence behind it.
- **More research reading lists.** Enough synthesis of MoE/SoM/MARL exists; the bottleneck is implementation, not literature.

## 4. Risks of the bet and mitigations

| Risk | Mitigation |
|------|-----------|
| **Grading data is too sparse/noisyto drive routing.** | Start with code/build output grading only, where correctness is more legible. Require a minimum sample size before a routing weight can flip. Use confidence intervals, not raw averages. |
| **Grading destabilizes on subjective tasks.** | Keep human override as the final authority. Make the loop advisory at first: suggest roster changes, don't auto-apply them. |
| **Integrating Rate breaks existing orchestration paths.** | Build it behind a feature flag. Run parallel rosters (Rate-selected vs. manual) and compare outcomes before cutting over. |
| **The loop becomes a dashboard nobody uses.** | Tie itdirectly to action: the next Pre-Build's default roster must come from Rate. If it doesn't change default behavior, it isn't real. |
| **c-06-style defects keep appearing in the loop itself.** | Use the grading lab protocol to grade Rate's own decisions. Eat your own dogfood. |

## 5. First three concrete steps

1. **Define the Rate data model and wire grading into the build loop.**
   - Create a `rate_scores` table keyed by `(task_type, project_context_hint, agent_id, metric)` with rolling windows and confidence fields.
   - Modify thebuild pipeline so every completed `build_session`/`build_task` emits a gradeable record, and every grade is persisted with the same key.

2. **Build the minimal reputation consumer and A/B it against manual roster selection.**
   - Add a `rate_select_roster()` helper used by Pre-Build when no manual override is set.
   - Run two parallel cohorts for two weeks: half the sessions use Rate-selected rosters, half use the existing manual/locked rosters. Measure completion rate, retry rate, and Bouncer severity.

3. **Close the Conductor-Rate feedback loop.**
   - Pass the Rate signal into `runIterationLoop` so the Conductor can reroute lanes based on empirical performance, not just availability.
   - Ship only the simplest policy first: if an agent's success rate on a task type drops below a threshold, exclude it from the default roster for that task type until it recovers.

The next six weeks should not be about adding more surfaces or more features. They should be about making Maestro's central claim falsifiable — and then falsifying or confirming it with live data.