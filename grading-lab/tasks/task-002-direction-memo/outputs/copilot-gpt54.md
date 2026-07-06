Reading `TASK.md` first to get the exact memo instructions, then I’ll load the referenced context files and produce the memo as requested.

● Read TASK.md
  └ 42 lines read

● Read context-state.md
  └ 1 line read

● Read context-graph-report.md
  └ 1 line read

● Read context-philosophy.md
  └ 223 lines read

● Count lines in graph report (shell)
  │ (Get-Content 'C:\New folder\MaestroOrchestra\project\Maestro\grading-lab\tasks\task-002-directio
  │ n-memo\context-graph-report.md' | Measure-Object -Line).Lines
  └ 2 lines…

● Count lines in context-state (shell)
  │ (Get-Content 'C:\New folder\MaestroOrchestra\project\Maestro\grading-lab\tasks\task-002-directio
  │ n-memo\context-state.md' | Measure-Object -Line).Lines
  └ 2 lines…

● Read context-graph-report.md
  └ L121:240 (120 lines read)

● Read context-state.md
  └ L241:292 (52 lines read)

● Read context-state.md
  └ L1:120 (106 lines read)

● Read context-graph-report.md
  └ L1:120 (120 lines read)

● Read context-graph-report.md
  └ L241:321 (81 lines read)

● Read context-state.md
  └ L121:240 (119 lines read)

● Read context-state.md
  └ L107:120 (14 lines read)

● Read context-state.md
  └ L293:383 (90 lines read)

# Direction Memo: Maestro’s next six weeks

## 1. Where the project actually is

Maestro is farther along than a mockup but not yet at its claimed center of gravity. The evidence supports **a broad, technically serious orchestration prototype**: multi-provider counciling, synthesis, GitHub execution, local executor work, pre-build/design scaffolding, security gates, and unusually disciplined ops notes. But it does **not** support the stronger claim that Maestro is already an “empirically adaptive council.” The philosophy file treats the grading loop as the engine and even implies it is basically in place; the graph report says there is **no reputation/scoring community at all**, and that the Conductor module is still structurally separate from the main iteration loop. The July 1 grading-lab log reinforces that: the first calibration pass found the relevant ranking work needs rework. Even in the state file, several important build seams are still “code verified” or explicitly not end-to-end proven. So the real state is: **ambitious product shell, real infrastructure, incomplete core thesis**.

## 2. The bet

**Spend the next six weeks shipping one closed learning loop for build-mode code work, and nothing else as the primary focus.**

That means Maestro should stop behaving like a product with many partially-real superpowers and start behaving like a system that can **measure outcomes, grade them, and change future council composition because of what it learned**. This is the highest-leverage move because it is the only path to proving the product’s actual moat. Without it, Maestro is a feature-rich wrapper around existing models. With it, Maestro becomes the thing the philosophy claims: a system that gets better at using models together. Now is the right moment because the project already has enough orchestration/build surface to generate data, but not yet so much stable product surface that complexity is locked in.

## 3. What you are explicitly deferring

I would **not** spend the next six weeks on design-phase polish, mobile, pattern-library/RAG expansion, orb/topbar UX cleanup, more personas/providers, or full local/cloud parity across every path.

Those are all attractive, and deferring them costs real things: weaker demos, rougher UX, and slower breadth expansion. But those are acceptable costs. What is not acceptable is continuing to widen the surface area before the core loop exists. A prettier, broader Maestro that still cannot learn which councils actually work is strategically hollow.

## 4. Risks of your bet and mitigations

1. **The grading signal is noisy or self-referential.**  
   Mitigation: narrow the problem to one task family with objective outcomes; use blind pairwise grading plus human-anchor checks; key performance by **resolved model + harness**, not brand labels.

2. **Execution instability pollutes the data.**  
   Mitigation: choose one canonical build lane for the experiment and mark other flows as experimental; do not mix incomparable paths into the same learning dataset.

3. **The team spends six weeks on plumbing and never gets to live routing.**  
   Mitigation: keep v1 simple. Shadow-rank first, reroute later. Do not build a grand adaptive framework before proving the signal.

4. **The thesis may simply not outperform a strong fixed roster.**  
   Mitigation: define kill criteria now. If the learning loop does not beat the manual roster on build success, override rate, or PR acceptance, stop romanticizing it and pivot.

## 5. First three concrete steps

1. **Rework the known grading/ranking defects from the July 1 calibration task** so the data layer is trustworthy, including model identity keyed to the actual resolved model and harness.

2. **Declare one canonical six-week lane**: existing TypeScript repo -> build request -> council output -> PR. Freeze new primary work outside that lane and make every run emit objective outcome data.

3. **Run the router in shadow mode on that lane** for a meaningful internal sample, compare its picks against the current manual roster, and promote it to live selection only if it measurably wins.

The right next move is not “more Maestro.” It is **one real feedback loop that proves Maestro deserves to exist**.

