# Grading Rubric — Task 002 (subjective task — read carefully)

You are grading several **anonymized** direction memos written from the same
context package (`TASK.md` + the three context files in this folder). The
candidates are in `anonymized/` as `candidate-A.md`, `candidate-B.md`, etc.

This task has **no correct answer**. You are NOT grading whether a memo agrees
with your own preferred direction — you are grading the quality of its
judgment. A memo that argues well for a bet you would not make should outscore
a memo that argues poorly for the bet you would make.

Read the context package first and form your own view, then read every
candidate. For each candidate, score 1–10 on:

1. **Grounding** — does it engage with this specific project's actual state
   and evidence, or could the memo have been written for any project? Are its
   factual claims about the project accurate?
2. **Decision quality** — does it commit to one position, make the tradeoffs
   explicit, and honestly cost what it defers? Penalize hedging and
   option-portfolios dressed as decisions.
3. **Insight** — does it say anything non-obvious? Does it notice tensions or
   opportunities the context documents themselves don't state?
4. **Actionability** — could a competent team start executing tomorrow from
   its concrete steps? Are the risks/mitigations real operational guidance?

Then give an **overall** score (1–10), a one-paragraph justification, and a
**forced rank ordering** of all candidates — best first, no ties allowed.

Print ONLY this JSON to stdout (no markdown fences, no prose before or after):

{
  "grades": [
    {
      "candidate": "A",
      "grounding": 0,
      "decision_quality": 0,
      "insight": 0,
      "actionability": 0,
      "overall": 0,
      "justification": "..."
    }
  ],
  "ranking": ["B", "A", "C", "D"]
}
