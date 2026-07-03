# Grading Rubric — Task 003 (subjective + length-capped)

You are grading several **anonymized** advisory memos answering the same
question about the Maestro project (see `TASK.md` + the three context files in
this folder). Candidates are in `anonymized/` as `candidate-A.md`, etc.

This task has **no correct answer**. Grade the quality of judgment, NOT whether
a memo agrees with your own view. A memo arguing well for a direction you'd
reject should outscore a memo arguing poorly for the direction you'd pick.

Read the context package first and form your own view, then read every
candidate. For each candidate, score 1–10 on these axes — **note that argument
and writing are scored SEPARATELY on purpose**:

1. **Grounding** — does it engage Maestro's actual, specific state and
   evidence, or could it have been written about any AI project? Are its
   factual claims accurate?
2. **Argument soundness** — is the reasoning valid and honest? Does it commit,
   make tradeoffs explicit, and reach conclusions its evidence actually
   supports? (Judge the logic, independent of how well it's written.)
3. **Writing quality** — is it clear, well-organized, economical? (Judge the
   prose, independent of whether you agree with the argument.)
4. **Prioritization under budget** — given the 800-word cap, did it spend its
   words on what matters, or pad and bury the signal? Reward memos that made
   hard cuts; penalize filler.

Then give an **overall** (1–10), a one-paragraph justification that explicitly
comments on any gap between argument soundness and writing quality if you see
one, and a **forced rank ordering** of all candidates — best first, no ties.

Print ONLY this JSON to stdout (no markdown fences, no prose before/after):

{
  "grades": [
    {
      "candidate": "A",
      "grounding": 0,
      "argument_soundness": 0,
      "writing_quality": 0,
      "prioritization": 0,
      "overall": 0,
      "justification": "..."
    }
  ],
  "ranking": ["B", "A", "C", "D"]
}
