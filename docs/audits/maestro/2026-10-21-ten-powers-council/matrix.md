# Agreement matrix — 2026-10-21-ten-powers-council

Seats: gemini, opus, sol. A trailing ✓ means the seat verified at least one claim behind that stance; no mark means it only read or inferred.

| item | gemini | opus | sol | pushback | contested |
|---|---|---|---|---|---|
| Q1 | agree ✓ | agree ✓ | partial ✓ | 1 (1 grounded) | yes |
| Q2 | partial ✓ | partial ✓ | partial ✓ | 3 (3 grounded) |  |
| Q3 | partial ✓ | partial ✓ | partial ✓ | 3 (3 grounded) |  |
| Q4 | partial ✓ | DISAGREE ✓ | DISAGREE ✓ | 3 (3 grounded) | yes |
| Q5 | DISAGREE ✓ | partial ✓ | partial ✓ | 3 (3 grounded) | yes |
| Q6 | partial ✓ | partial ✓ | partial ✓ | 3 (3 grounded) |  |
| Q7 | agree ✓ | DISAGREE ✓ | partial ✓ | 2 (2 grounded) | yes |

## Verification queue — pushback from two or more seats

- **Q2**
  - gemini (partial, grounded): Move Powers 9 and 10 up to Weeks 1-2, move Power 6 top-k/ablation and Power 7 LLM auto-harvest down, and cut Power 8's synthetic reader swarm.
  - opus (partial, grounded): Order 1,4,3,5,9,10(merge),7,6,2; cut 8; defer ablation since no synthesize command exists.
  - sol (partial, grounded): Advance containment and evidence; defer automatic ranking and cut synthetic prevalence claims.
- **Q3**
  - gemini (partial, grounded): Fix the dissent role to one seat instead of rotating, run verifier checks between R1 and R2, prompt only on contested items, and cap at 2 rounds.
  - opus (partial, grounded): Silence rule inflates the convergence score, stance changes need cited new evidence, dissent stance must be excluded, item ids need canonicalising, and checkable items should go to a verifier not another round.
  - sol (partial, grounded): Use item-level evidence stability and snapshot-based rounds.
- **Q4**
  - gemini (partial, grounded): Harden verdict.ts and matrix.ts against unchecked self-attestation, fix the agy_cli re-ask argv bug, and derive tool/file telemetry from the harness.
  - opus (disagree, grounded): Contract is self-reported and unvalidated; verified claims with no evidence get the grounded mark, last block wins, junk schema parses, failed seats vanish; add claim ids, severity, stance referent, nonce, evidence path checks, harness-measured attestation.
  - sol (disagree, grounded): The current parser and grounding marker cannot establish trustworthy attestation.
- **Q5**
  - gemini (disagree, grounded): Proposal §3 misses employer/personal leaks in docs/audits/maestro/, MAESTRO_STATE.md, HISTORY.md, AGENTS.md, grading-lab/, graphify-out/, and .michael/*.zip.
  - opus (partial, grounded): Checklist misses: no LICENSE, tracked AGPL and third-party zips plus unlicensed .addons, git history, runtime-emitted absolute paths and usernames, AGENTS.md hard path, work-account mention.
  - sol (partial, grounded): Sanitize tracked local permissions and operational records, including Maestro audits.
- **Q6**
  - gemini (partial, grounded): The Discovery/Brainstorm workflow is sound, but cross-account web-to-Claw routing is blocked in code; ship a single-workspace council_run job first.
  - opus (partial, grounded): Right instinct, wrong shape: discovery-intake is a client-screening form whose Maestro hooks do not exist; smallest version is her own CLIs plus a brainstorm brief and plain-language synthesis, making her the first external CLI user.
  - sol (partial, grounded): Start with a short editable intake and bounded read-only scoping council.
- **Q7**
  - opus (disagree, grounded): Missing: containment for untrusted repos (agy skip-permissions, post-hoc in-copy write check only), depth-1 clone silently full history, no per-run cost cap, no council-vs-solo baseline, author synthesizing its own review.
  - sol (partial, grounded): Add immutable replay inputs and independent outcome evaluation.

## Contested by one seat

- **Q1**
  - gemini (agree, grounded): Make the Council Runtime CLI primary and the web console a run viewer, matching every shipped result since August.
  - opus (agree, grounded): CLI protocol primary and web as run viewer is right, but what shipped results was protocol plus concierge plus human verification, so ship skills and protocol with the CLI as reference runner.
  - sol (partial, grounded): Publish the CLI first while retaining web intake and control.

## Seats

| seat | model | status | elapsed | attestation | overall verdict |
|---|---|---|---|---|---|
| gemini | gemini-4-argon-high | done | 519s | ran_verifier=yes tools=shell/read/grep/test files=38 corpus=granted | ADOPT_WITH_CHANGES |
| opus | claude-opus-5-5-high | done | 253s | ran_verifier=yes tools=read/shell/grep/test files=15 corpus=granted | ADOPT_WITH_CHANGES |
| sol | gpt-6.1-sol (session 01a16143) | done | 110s | ran_verifier=yes tools=shell/read/grep/test files=33 corpus=granted | ADOPT_WITH_CHANGES |

Verify every queued row yourself before it becomes a decision. Grounding predicts quality more than generation (2026-09-06).
