# Grading Lab — Calibration Protocol

*Empirical validation of the peer-grading loop before Rate ships it as the engine.*

## Purpose

Maestro's thesis says the grading loop is the engine. This lab answers, with data,
whether natural model grading is **stable and accurate** enough to drive routing —
and if it's biased, measures the per-grader offsets Rate should ship with.

## Roles

- **Conductor** — Claude (Fable) from Claude Code. Dispatches tasks, anonymizes
  outputs, collects grades, never reveals the mapping to graders.
- **Workers** — model CLIs on this machine (`codex`, `gemini`, `grok`, `kimi`,
  `copilot`, `claude`). Produce task outputs.
- **Graders** — the same CLIs, grading **blind** (anonymized candidates, fresh
  shuffle per grader).
- **Human anchor** — Michael. Grades independently, before seeing peer grades.
- **Conductor grade** — Fable grades independently too (recorded separately;
  Fable is not blind, so flagged as such in analysis).

## Rules

1. **Real tasks only.** No synthetic benchmarks — tasks come from actual Maestro work.
2. **Blind peer grading.** Candidates are anonymized (`candidate-A`, `-B`, …) and
   shuffle order is re-randomized per grader (controls position bias; the stored
   mapping lets us detect self-preference afterwards).
3. **Human grades before peer grades are revealed** to the human.
4. **Same rubric for everyone**, stated in the task's `GRADING.md`.
5. Everything is committed — this data syncs across machines and feeds the
  pattern-library RAG later.

## Grade format

Graders return, per candidate: a 1–10 score on each rubric axis, an overall 1–10,
a one-paragraph justification, and a forced **rank ordering** of all candidates.
Ranks are the primary signal (scores drift; ranks compare).

## Task folder schema

```
grading-lab/
  PROTOCOL.md
  tasks/
    task-NNN-slug/
      TASK.md            # task statement + context handed to every worker
      GRADING.md         # rubric handed to every grader
      outputs/           # raw worker outputs: <model>.md
      anonymized/        # candidate-A.md … (what graders see)
      grades/            # peer-<model>.json, human-michael.json, fable.json
      meta.json          # date, worker/grader versions, mapping, shuffle orders
```

## Metrics (computed after ~5 tasks, then rolling)

- **Accuracy**: rank correlation (Kendall τ) of each peer grader vs. the human anchor.
- **Consensus quality**: peer-consensus rank vs. human rank.
- **Self-preference**: does a model rank its own (anonymized) output higher than
  others rank it?
- **Verbosity bias**: correlation of grade with output length.
- **Position bias**: grade vs. presentation order across shuffles.
- **Stability**: re-grade a past task cold; variance of scores/ranks.

## Status log

| Task | Date | Workers | State |
|------|------|---------|-------|
| task-001-c06-review | 2026-07-01 | codex (gpt-5.5), copilot (auto→claude-fable-5), copilot (gpt-5.4), grok, kimi (K2.7) + enterprise-fable | complete — **7/7** `rework required`; human anchor Spearman 0.90; enterprise audit added 2 net-new findings and refuted "Enterprise=more aggressive" (it's a Copilot-harness replication) |
| task-002-direction-memo | 2026-07-01 | same council (subjective task — grader-stability test without right/wrong answers) | peer grading done — 3/5 identical rankings; grok's trust-path memo won though 3/5 workers bet Rate; gpt-5.4 contrarian confirmed; human anchor pending |
