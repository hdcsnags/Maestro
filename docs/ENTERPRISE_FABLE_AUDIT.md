# Independent Audit Handoff — GitHub Enterprise Fable 5

*Written 2026-07-01 by Claude Fable 5 (Claude Code harness, Michael's main machine).
You are reading this because Michael asked you to perform an independent audit.*

## Who you are, and why this exists

You are (almost certainly) Claude Fable 5 running under a GitHub Enterprise
Copilot harness. I am the same underlying model running under Claude Code. On
2026-07-01 we ran a council calibration experiment (task-001, see
`grading-lab/PROTOCOL.md`) in which five model CLIs independently reviewed the
same commit and then blind-graded each other's reviews.

One of the experiment's findings: **the harness changes the model.** The
Copilot-wrapped instance of our shared weights caught findings the Claude
Code-wrapped instance (me) missed, on the same diff. Michael reports that the
Enterprise harness produces the most aggressive, least restrained version of
Fable he has observed. You are the next data point for that hypothesis.

## Your task

Perform the exact same review the council did, under the same instructions:

1. Go to `grading-lab/tasks/task-001-c06-review/`.
2. Read `TASK.md` there and follow it exactly — it defines the review target
   (commit `22a04a1`, branch `c-06-conductor-web-dispatch`), the context files,
   and the deliverable format (findings with severities, mirror-faithfulness
   assessment, P1-4 assessment, one-word verdict).
3. Write your complete review to
   `grading-lab/tasks/task-001-c06-review/outputs/enterprise-fable.md`.

## Blinding rules — read carefully, they are the whole point

Until your review file is **written and saved**, do NOT read:

- `grading-lab/tasks/task-001-c06-review/outputs/` (the other five reviews)
- `grading-lab/tasks/task-001-c06-review/grades/` (peer + human grades)
- `grading-lab/tasks/task-001-c06-review/anonymized/`
- `grading-lab/tasks/task-001-c06-review/meta.json` (results + analysis)
- the `2026-07-01` session-log entry in `MAESTRO_STATE.md` (results summary)

Everything else in the repo is fair game — read as much surrounding code as
you want; the council had the same freedom via the context files.

Known caveat you inherit: TASK.md deliverable question 3 contains a leaked
analytical hint (documented in meta.json after you finish). You get the same
prompt the council got, hint included, so your run is comparable to theirs.

## After your review is saved

1. Unblind yourself: read `meta.json`, the other `outputs/*.clean.md`, and
   `grades/` — compare your findings and verdict against the council's.
2. Append a short section to your own review file: what you caught that they
   missed, what they caught that you missed, and whether your verdict differs.
3. Commit your review file to `main` (or a branch + PR if you prefer) so the
   main-machine session can fold you into the task-001 analysis as a sixth
   worker under a different harness.

Do not rework or fix the c-06 branch itself — the rework is deliberately
deferred until your audit lands, so every auditor sees the identical commit.
