# Memo — Task 003: Launch Readiness

## 1. My honest read

Maestro is two different things wearing one codebase. The first is a genuinely impressive engineering artifact: 19 deployed edge functions, 51 migrations, a local execution node with adapter fallback chains, HMAC-gated shell, deliberation, personas, a proven Build-v2 E2E run, CI green, lint zero. For a solo project, the operational discipline (MAESTRO_STATE.md, drift audits, the June-9 recovery of a synthesize deploy that logs falsely claimed for a month) is rare and real.

The second thing is the thesis — *empirically graded council composition* — and it does not exist in the product. The graph report is blunt: **no reputation/scoring community exists; Rate is net-new**. The Conductor is a structural island. The grading loop, which the philosophy doc calls "the engine," has only ever run manually, in the grading-lab folder, over the last two days, conducted by hand. Today, Maestro is a very sophisticated multi-model wrapper with a brilliant unproven idea attached. That's not an insult — the grading-lab results (stable peer rankings, 0.90 human-anchor correlation) are the most promising evidence in the whole repo. But the flywheel has zero rotations inside the app.

Functionally, the stranger-gap is wide: BYOK key setup, GitHub App install (documented as manual, no in-app guidance), optionally a local CLI executor, and a UI that has accreted seven interaction modes (Ask/Build/Council/Direct/Execute/Iterate/Claw) across drawers, carousels, threads, and a workspace. `useMaestro()` at 99 edges is the architectural signature of one person's mental model — coherent to the builder, opaque to anyone else. The moment of value (a synthesis visibly better than one model) sits behind 20+ minutes of setup and real API spend.

## 2. The one thing I'd do next

**Ship Rate v1 — the in-product grading loop — before any new surface, and use it to produce one artifact of proof.** The six-week plan already on the table (trust spine first, then grades schema keyed on resolved model + harness, blind post-round peer grading, builder-lane scoring as first consumer) is correct; I'd endorse it and harden it with a freeze: no mobile, no local vault RAG, no new UX phases until the grading loop has produced its first *data-driven routing decision*.

Reasoning: everything else in Maestro is replicable by well-funded competitors — multi-model dispatch, PR generation, sandboxed execution. The only defensible asset is longitudinal graded-outcome data and the routing it powers. That asset compounds with time, so every week it isn't collecting data is a week of moat not built. The grading-lab already proved the loop works manually; productizing it is de-risking the thesis, not speculating.

## 3. Ready to show the world?

**Not yet — and launching now would be a mistake.** Three reasons: (a) the launch narrative *is* the philosophy, and the product can't yet demonstrate its own philosophy — a skeptical stranger who tries it gets a multi-model chat with heavy setup, not an adaptive council; (b) the trust chassis was self-described (June 9) as prototype-grade, with shell-injection and token-replay items still queued — you cannot invite strangers into a product that executes shell commands until that's closed; (c) core paths remain unsmoked ("first real local/auto build run" is still an open next-step).

**The condition that flips me to yes:** one wedge flow — sign up → add one key → ask a hard question → watch the council deliberate → get a graded synthesis — completable by a stranger in under ten minutes, plus one published receipt (see below). That's a scoped-down "council-only" launch; builds and Claw stay behind a power-user gate.

## 4. The biggest thing they're missing

**Receipts.** For a system whose entire pitch is *empirical*, there is no empirical artifact anywhere: no benchmark, no side-by-side showing the council beating the best single model on 20 real tasks, no "here's the routing change the data forced and the quality delta it produced." The philosophy doc is persuasive prose; skeptics will call it vibes, and right now they'd be correct. Worse, the grading-lab's own data contains a warning the builder logged but hasn't internalized: the human anchor ranked grok #1 on writing while doubting its argument. If peer graders reward eloquence over correctness, the flywheel will confidently learn wrong routing — the engine amplifies whatever the graders actually measure. Validating grader calibration against outcomes, and publishing that validation, is both the missing proof and the missing safety check. It's the same work. Do it once, launch with it.

*(~745 words)*