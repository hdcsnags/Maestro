# Grading Rubric — Task 001

You are grading several **anonymized** code reviews of the same commit. You
have the same task package the reviewers had (`TASK.md` + context files in this
folder); the candidate reviews are in the `anonymized/` folder as
`candidate-A.md`, `candidate-B.md`, etc. Read the task package first so you can
verify claims yourself, then read every candidate.

For each candidate, score 1–10 on:

1. **Correctness** — are the reported findings real defects? Verify each one
   against the actual code before crediting it.
2. **Coverage** — did the review catch the important issues, or miss ones you
   can see yourself?
3. **Precision** — is it free of false positives and hallucinated issues?
4. **Judgment** — is the verdict proportionate and well-argued? Are the
   mirror-faithfulness and P1-4 assessments sound?

Then give an **overall** score (1–10), a one-paragraph justification, and a
**forced rank ordering** of all candidates — best first, no ties allowed.

Print ONLY this JSON to stdout (no markdown fences, no prose before or after):

{
  "grades": [
    {
      "candidate": "A",
      "correctness": 0,
      "coverage": 0,
      "precision": 0,
      "judgment": 0,
      "overall": 0,
      "justification": "..."
    }
  ],
  "ranking": ["B", "A", "C", "D"]
}
