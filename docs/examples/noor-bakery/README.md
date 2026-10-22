# Worked example: a one-page site built by a council coder seat

Run on 2026-10-21 with the Council Runtime in code mode on an empty folder:

```
node dist/index.js council run --source <empty folder with README> --prompt brief.md \
  --seats sol,opus --mode code --no-git --project site-smoke --label noor
```

- **opus** (Claude Opus 5.5 via the Antigravity CLI): wrote `site/index.html`, `site/styles.css`, `site/script.js` in 223 s, attested `ran_verifier: true`; the concierge's static checks (doctype, six CAD prices, Persian spans with `lang="fa"`/`dir="rtl"`, hours and address, email-validating form, no external scripts, `prefers-color-scheme`, viewport, `preventDefault`) all passed.
- **sol** (GPT-6.1 via Codex): wrote nothing; Codex's `workspace-write` sandbox fails on this Windows machine (`helper_unknown_error: setup refresh had errors`) and the seat said so (`corpus_access: denied`, verdict PARTIAL). That honesty is the attestation contract working.

Open `site/index.html` in a browser to see the result. `manifest.json` is the run's resumable record; the verdict files are the seats' own attestations.
