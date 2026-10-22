# opus — agy_cli (claude-opus-5-5-high) — 2026-10-21-ten-powers-council

- status: done
- success: true
- elapsed: 253s
- read-only verification: **clean**
- sandbox: none via `--dangerously-skip-permissions --add-dir <copy> (agy --sandbox fails on Windows)` (declared, not verified)
- verdict block: parsed
- copy: C:\Users\Owner\.maestroclaw\council\scratch\maestro-opus-hywlBy\repo


## Output

Now the synthesis, skills, philosophy, and public-readiness probes.
Claude Opus 5.5 (High), running as an agy_cli seat (`opus`)

## Analysis

**What I did:** I read the proposal, the Read This First block and session log from 09-05 to 10-21, the 09-22 SYNTHESIS, all of `src/council/*.ts`, four skills, and PHILOSOPHY Parts 2–7. I also ran git and grep checks. Then I ran a small script against copies of `verdict.ts` and `matrix.ts`, kept in my scratch folder. No repo file was changed.

### Q1 — Public artifact
This is the right call. Every result since August came from the CLI spine plus a concierge:
- The Eliana fix passes (09-06, 10-18)
- Elay
- Solar Explorer (09-26)
- The vision council (09-22)

The web app's last feature was 07-06. Its 52nd migration and the `concierge`/`audit-log` deploys are still pending, and `AGENT_DEFAULTS` still lists Gemini 2.5 and GPT-5.4.

One correction to the story. What produced results was **protocol + concierge + human verification**, not the CLI alone. Every SYNTHESIS was written by hand. So ship three things: the protocol, the skills (the concierge playbook), and the CLI as the reference runner. The web console should be a read-only viewer of run folders. Also say plainly that a full council needs 3–4 paid CLI subscriptions.

### Q2 — Ranking
The proposal's ranks don't match its own sequencing. Debate Room is ranked #2 but scheduled for weeks 6–7.

My order:
1. **1** — mostly built
2. **4** — verify-before-close is the product
3. **3** — but measured by the runtime, not self-reported (see Q4)
4. **5** — local `rulings.json` only. Cut the FolioCard and `flags` migration work, because the web app is frozen.
5. **9**
6. **10** — resume and checkpoint already exist in `cli.ts`, so fold the rest into 1 and 9
7. **7** — keep `skills/`. Automated harvest by a cheap model goes low; the manual `harvest` skill is enough.
8. **6** — Rate v1 only. Defer ablation: the runtime has no `synthesize` command (`cli.ts:50`), so there is nothing to ablate. The data is also a few dozen self-reported verdicts.
9. **2** — see Q3

**Cut 8** (reader swarm). It's a different product, and it depends on a local provider the 09-22 council confirmed doesn't exist. Its "seat memory" part also tells a returning seat about its earlier open rows, which breaks blindness.

### Q3 — Debate Room
What breaks:
- **The silence rule inflates convergence.** Silenced seats count as "unchanged" cells, so the stop rule can fire because seats were skipped. Leave silenced cells out of the denominator.
- **Stability isn't correctness.** If seats give in to each other, the room still looks converged. Every stance change should have to cite *new evidence* (a verifier result or a new path:line). Changes without it should be tagged as social and not count toward "settled".
- **The dissent seat's stance is forced.** Don't count it; treat its objections as inputs only. The council skill itself says "rubrics yes, personas no".
- **Item ids don't stay stable.** My test showed `Q1` and `q1` split into two rows. Ids need a merge step before stability means anything.
- **Grounding weights are self-reported** (Q4), so they can be gamed.

Missing:
- A rule for how many seats must remain when one drops out mid-debate (Kimi has hit its quota in three studies).
- Resume per round.
- A routing rule. Checkable items should go to the verifier, not to another round. Taste items should go to the owner; 10-18 noted "the split the synthesis should hand to the owner, not resolve".

### Q4 — Verdict contract
**What can be gamed** (my test confirmed each one):
- A claim marked `verified`, with `ran_verifier:false` and evidence `"none"`, still gets the ✓ in the matrix (`matrix.ts:35-37`).
- The *last* verdict block wins (`verdict.ts:67`), so a block the seat quotes later in its reply replaces its real one.
- The schema isn't checked: `items:"lol"` parses fine.
- The phrase END VERDICT inside a summary string breaks the parse.
- A seat that fails disappears from the matrix entirely.
- Verdict words aren't normalized: `REWORK` and `adopt` sit side by side.

**What's missing:**
- Claim ids
- `severity` (it's in `types.ts` but not in the contract)
- What a stance is relative to (agree with *what*?)
- A run nonce or `prompt_sha256` echoed back
- A re-ask when the block is missing or unparseable, not only truncated (`run.ts:155`)
- A runtime check that each evidence path:line actually exists in the copy
- Attestation measured from the harness's tool trace

**What I'd remove:** `files_read` (it can't be checked), `verify.py` in a generic enum, and the duplicate "model line + `seat`" field.

### Q5 — Public-readiness gaps
- **No root `LICENSE`.**
- **Third-party code is tracked:** `.michael/MiroFish-main.zip` (AGPL, 7 MB), `RyseEnergyDrinks-main.zip`, `architect-cli-main.zip`. The `.addons/*` repos are vendored with no LICENSE files.
- **Git history.** It has 364 commits, so taking files out of the tree isn't enough. Publish with fresh history or run filter-repo.
- **The runtime leaks paths and usernames by default:**
  - `run.ts:205` writes the copy path, `run.ts:212` writes `started_by` (the OS username), and the manifest stores `source` and `prompt_file`.
  - 10 tracked files already contain `C:\Users\Owner`.
- **`AGENTS.md:15`** hard-codes `C:\New folder`.
- **`MAESTRO_STATE.md:322`** says Astra ran on a work account. That should not go public.

### Q6 — Michael's new idea
The shape is wrong; the instinct is right.
- `discovery-intake` is a client-scoping and screening form (budget, equity, decision-maker flags). It isn't a brainstorm tool for a partner.
- The `discovery` thread and `metadata.intake` the skill describes don't exist anywhere in `src/` or `supabase/`.
- Running seats on Michael's personal subscriptions for another person may break those plans' sharing terms. I haven't checked the specific terms.
- "An account later" puts the hosted product back in scope, which contradicts Q1.

**Smallest useful version:** she's a software engineer, so she installs one or two CLIs on her own subscriptions. She uses a `brainstorm` brief template and runs `council run --no-git` on a folder with her one-pager. She gets back a plain-language SYNTHESIS (settled / contested / questions back to her). That makes her the first real test of checklist item 1.

### Q7 — What the proposal is missing
- **Untrusted-repo containment.** agy runs with `--dangerously-skip-permissions`, and claude and kimi are `none` (`seats.ts:94-100`). Read-only is only checked afterwards, and only *inside the copy*. A seat could write elsewhere or reach the network and nothing would catch it. "Run a council on any repo" makes this the top public risk. Power 10 only records the flag; it doesn't contain anything.
- **`--depth 1` is ignored for local clones.** I confirmed this copy isn't shallow. Seats see full history, including seat outputs already committed under the default `docs/audits/` out-root. That's a way blindness can leak.
- **No cost cap per run** (seats are launched with `Promise.all`).
- **No baseline** comparing the council against one grounded seat plus a verifier.
- **The author grades its own work.** The concierge proposes, briefs, and synthesizes this council. Someone else should synthesize it.
- **`MAESTRO_STATE.md` drift.** It's 731 lines, over Rule 7's ~500. Row 146 still lists the agy empty-response bug as broken, though the fix is in the code. There's no session entry yet for the Power 1 build.

**Overall: ADOPT_WITH_CHANGES**

BEGIN VERDICT
{
  "seat": "claude-opus-5-5-high (agy_cli)",
  "attestation": {
    "ran_verifier": true,
    "tools_used": ["read", "shell", "grep", "test"],
    "files_read": 15,
    "corpus_access": "granted"
  },
  "items": [
    {
      "id": "Q1",
      "stance": "agree",
      "summary": "CLI protocol primary and web as run viewer is right, but what shipped results was protocol plus concierge plus human verification, so ship skills and protocol with the CLI as reference runner.",
      "claims": [
        { "text": "Every session-log result from 09-05 to 10-21 came from council-dispatch scripts plus a concierge; web app last feature 07-06.", "status": "verified", "evidence": "MAESTRO_STATE.md:208-519" },
        { "text": "AGENT_DEFAULTS still lists Gemini 2.5 and GPT-5.4 models.", "status": "verified", "evidence": "src/types/index.ts (grep model:)" }
      ]
    },
    {
      "id": "Q2",
      "stance": "partial",
      "summary": "Order 1,4,3,5,9,10(merge),7,6,2; cut 8; defer ablation since no synthesize command exists.",
      "claims": [
        { "text": "Council CLI has run/resume/status/matrix/checkpoint/usage/seats only; no synthesize.", "status": "verified", "evidence": "packages/maestroclaw/src/council/cli.ts:50-55" },
        { "text": "Proposal ranks Debate Room second but sequences it weeks 6-7.", "status": "verified", "evidence": "MAESTRO_POWERS_PROPOSAL_MYTHOS-5.1.md:229" },
        { "text": "Local HTTP inference provider is absent per 09-22 council.", "status": "verified", "evidence": "docs/audits/maestro/2026-09-22-vision-council/SYNTHESIS.md:60" }
      ]
    },
    {
      "id": "Q3",
      "stance": "partial",
      "summary": "Silence rule inflates the convergence score, stance changes need cited new evidence, dissent stance must be excluded, item ids need canonicalising, and checkable items should go to a verifier not another round.",
      "claims": [
        { "text": "Matrix keys rows on exact id strings so Q1 and q1 split into separate rows.", "status": "verified", "evidence": "scratch probe.mjs run against matrix.ts buildMatrix" },
        { "text": "10-18 VOTD council converged on mechanics and diverged on taste, which the log says belongs to the owner.", "status": "verified", "evidence": "MAESTRO_STATE.md:250" }
      ]
    },
    {
      "id": "Q4",
      "stance": "disagree",
      "summary": "Contract is self-reported and unvalidated; verified claims with no evidence get the grounded mark, last block wins, junk schema parses, failed seats vanish; add claim ids, severity, stance referent, nonce, evidence path checks, harness-measured attestation.",
      "claims": [
        { "text": "A claim with status verified, evidence none and ran_verifier false is marked grounded in the matrix.", "status": "verified", "evidence": "matrix.ts:35-37; probe.mjs output row Q1 liar disagree+G" },
        { "text": "extractVerdict takes the last block, so a trailing quoted block overrides the real one.", "status": "verified", "evidence": "verdict.ts:67; probe.mjs case 2" },
        { "text": "Re-ask fires only for truncated, not missing or unparseable blocks.", "status": "verified", "evidence": "run.ts:155" },
        { "text": "The end delimiter text inside a JSON string makes the block unparseable.", "status": "verified", "evidence": "probe.mjs case 6" }
      ]
    },
    {
      "id": "Q5",
      "stance": "partial",
      "summary": "Checklist misses: no LICENSE, tracked AGPL and third-party zips plus unlicensed .addons, git history, runtime-emitted absolute paths and usernames, AGENTS.md hard path, work-account mention.",
      "claims": [
        { "text": "Root has no LICENSE file; .addons contains no LICENSE files.", "status": "verified", "evidence": "Get-ChildItem root and .addons -Recurse LICENSE*" },
        { "text": "MiroFish-main.zip, RyseEnergyDrinks-main.zip, architect-cli-main.zip are git-tracked.", "status": "verified", "evidence": "git ls-files -s .michael/*.zip" },
        { "text": "Repo history has 364 commits and is not shallow.", "status": "verified", "evidence": "git rev-list --count HEAD; git rev-parse --is-shallow-repository" },
        { "text": "Runtime writes copy path and OS username into run outputs; 10 tracked files already contain the user home path.", "status": "verified", "evidence": "run.ts:205, run.ts:212; git grep -l Users/Owner" },
        { "text": "Session log records running Astra on Michael's work account.", "status": "verified", "evidence": "MAESTRO_STATE.md:322" }
      ]
    },
    {
      "id": "Q6",
      "stance": "partial",
      "summary": "Right instinct, wrong shape: discovery-intake is a client-screening form whose Maestro hooks do not exist; smallest version is her own CLIs plus a brainstorm brief and plain-language synthesis, making her the first external CLI user.",
      "claims": [
        { "text": "No discovery thread or metadata.intake exists in src, supabase or maestroclaw src.", "status": "verified", "evidence": "git grep -i discovery -- src supabase packages/maestroclaw/src (no hits); skills/discovery-intake/SKILL.md:20" },
        { "text": "Sharing personal CLI subscriptions with another person may breach provider terms.", "status": "unverified", "evidence": "none" }
      ]
    },
    {
      "id": "Q7",
      "stance": "disagree",
      "summary": "Missing: containment for untrusted repos (agy skip-permissions, post-hoc in-copy write check only), depth-1 clone silently full history, no per-run cost cap, no council-vs-solo baseline, author synthesizing its own review.",
      "claims": [
        { "text": "agy seats run with dangerously-skip-permissions; claude and kimi declare no sandbox.", "status": "verified", "evidence": "packages/maestroclaw/src/council/seats.ts:94-100" },
        { "text": "Read-only verification only inspects the seat copy after the run.", "status": "verified", "evidence": "run.ts:164-185" },
        { "text": "git clone --depth 1 from a local path produced a full-history non-shallow copy.", "status": "verified", "evidence": "run.ts:80; git rev-parse --is-shallow-repository = false" },
        { "text": "MAESTRO_STATE still lists agy empty-success as broken though the fix is in agy-cli.ts.", "status": "verified", "evidence": "MAESTRO_STATE.md:146; packages/maestroclaw/src/adapters/agy-cli.ts:268-272" }
      ]
    }
  ],
  "verdict": "ADOPT_WITH_CHANGES",
  "open_questions": [
    "Whether agy tool traces are available on stdout to derive attestation from the harness instead of self-report.",
    "Exact subscription terms for Codex, Claude and Google plans on use by a second person.",
    "Whether the conductor intends to publish with existing git history or a fresh export."
  ]
}
END VERDICT
