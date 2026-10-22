---
name: verify-before-close
description: The verify-before-close loop that is Maestro's actual product — how a round, gate or fix pass is closed: an independent verifier from a different model and harness, mechanical hollow-green checks (zero-test suites, swallowed exit codes, byte-identical evidence), per-claim confirmation, and what "closed with evidence" means in a state file.
harness: [any]
---

# Verify before close

The Elay retro (2026-09-12) put it plainly: the orchestrator's error class never went away; it was caught every time by an independent verifier. No single model stopped making mistakes, this one included. So nothing closes on the author's own green.

## The loop
1. **Author** (seat or concierge) finishes and lists claims: what was built, what was tested, what evidence exists (paths).
2. **Verifier seat** — a different model AND harness from the author (`council run --seats <verifier> --mode audit` with the patch or the claims as the brief). It returns per claim `confirmed | refuted | could_not_run` in the verdict block with evidence.
3. **Mechanical checks** (run them yourself; models miss these):
   - Gate scripts run under `set -o pipefail` and must print a `GATE_GREEN` marker; exit 0 of a piped command is not green.
   - Test runners report a **non-zero test count** (`grep -rho 'tests="[0-9]*"'` sums > 0). A green suite with zero tests is hollow.
   - Lint reports non-zero source files (a NO-SOURCE task is hollow).
   - Screenshots cited as evidence are **md5-distinct** and each filename matches what is in frame.
   - A "fixed" line in a state file points at a commit or diff that actually contains the change (a sed that matched nothing is the recorded failure mode).
4. **Close** only when every claim is confirmed or explicitly carried as open. Write the gate in the state file with evidence: command + last lines, artifact paths, CI run ids. A gate without evidence is not closed.

## Model failure classes worth naming in briefs
- Pattern-matching a contract sentence's surface instead of its rationale ("X is forbidden" read as "X's whole feature is forbidden"). Phrase prohibitions as "X is forbidden BECAUSE Y; Z remains required."
- A seat wait-looping on its own background tasks instead of finishing.
- Green tests that pin a defect: tests prove conformance to the test author's reading, not to the contract.

## Recovery named by the record
- File present but "not found" after a crash → the build cache is wrong while the tree is right; rerun the task with `--rerun` (Gradle) or clear the cache for that task.
- "Emulator starved" (host overloaded) is its own verification state; record it, do not count the pass.
- Project-specific gate commands (JDK, adb, emulators) belong in the project's own skill, e.g. Elay's `build-gate`.
