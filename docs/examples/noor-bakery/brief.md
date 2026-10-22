# Build brief: Noor Bakery one-page site

Build a complete, static one-page website for "Noor Bakery", a Persian bakery in St. Catharines, Ontario, in THIS folder. Files: `index.html`, `styles.css`, `script.js` (no frameworks, no build step, no external scripts; Google Fonts allowed). Sections: hero with name and tagline, menu (6 items with prices in CAD: barbari, sangak, lavash, koloocheh, baklava, saffron tea), hours, address and a contact form that validates email client-side and shows a thank-you message without submitting anywhere. Must look good on a phone (375px) and desktop, and must work in both light and dark colour schemes via prefers-color-scheme. Use real Persian words where natural (نان بربری etc.) with a `lang` attribute and correct `dir` on those spans.

When finished, reply with a short summary and a list of the files you wrote. Then the verdict block: items Q1 "files written", Q2 "mobile layout verified", Q3 "dark mode verified" with stance agree only if you actually checked; overall verdict word DONE or PARTIAL.

---
## Output contract (mandatory)

Begin your reply with one line stating the model you are running as. Then your analysis.
End your reply with this block, and nothing after it:

BEGIN VERDICT
{
  "seat": "<the model you are running as>",
  "attestation": {
    "ran_verifier": <true if you executed code, tests, scripts or a verifier to check claims; false if you only read>,
    "tools_used": ["<shell|read|grep|test|verify.py|none>"],
    "files_read": <integer>,
    "corpus_access": "<granted|denied|not_applicable>"
  },
  "items": [
    {
      "id": "<Q1, Q2 … matching the numbered questions in the brief; or a short slug for a finding>",
      "stance": "<agree|disagree|partial|unverifiable>",
      "summary": "<one sentence>",
      "claims": [
        { "text": "<a specific factual claim you rely on>", "status": "<verified|unverified|inferred|disputed>", "evidence": "<path:line, command run, or 'none'>" }
      ]
    }
  ],
  "verdict": "<the overall verdict word the brief asked for, if any>",
  "open_questions": ["<things you could not settle>"]
}
END VERDICT

Rules: valid JSON only inside the block (no comments, no trailing commas, no code fences). Mark a claim "verified" only if you checked it yourself in this run. If you could not access files or tools, say so in attestation and mark claims "unverified". Keep per-item summaries short so the block is never cut off.
