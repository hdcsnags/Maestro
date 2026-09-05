#!/usr/bin/env -S npx tsx
/**
 * One-off: appends a manifest note documenting the canonical_calibration
 * control runs (Sol's methodological correction to christian_canonical_reader).
 */
import { readFileSync } from "node:fs";
import { writeManifest, type EnvelopeManifest } from "./lib/eliana-manifest.js";

const RUN_DIR = "C:\\New folder\\MaestroOrchestra\\project\\Maestro\\docs\\audits\\eliana-readonly-poc\\2026-08-17-forsaken-cry";
const manifestPath = `${RUN_DIR}\\manifest.json`;
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as EnvelopeManifest;

manifest.notes.push(
  "Symmetric-calibration control (2 more runs, 9 total): Sol reviewed the earlier christian_canonical_reader " +
  "outputs and identified a real methodological point — the persona as originally drafted is one-sided by " +
  "construction, built specifically to hunt for underclaiming. PERSONAS_THEOLOGY.md §6a now splits this persona " +
  "into two task modes: `underclaim_challenge` (the original prompt, preserved exactly — Sol: \"it's a really " +
  "good prosecution prompt\") and new `canonical_calibration` (checks for BOTH overclaiming and underclaiming, " +
  "explicitly instructed not to assume either exists, its own CANONICAL CALIBRATION / Overclaimed: / " +
  "Underclaimed: required ending format overriding the persona's default deliberation_signature). Ran " +
  "canonical_calibration through the same two models as the underclaim_challenge control (claude-fable-5 via " +
  "claude_code, gpt-5.6-sol via codex_cli) as an explicit test of whether the earlier underclaim_challenge " +
  "findings hold up when the persona isn't told in advance which direction to look. Result: both calibration " +
  "runs independently re-surfaced the same central underclaim as the original runs (the 'he chooses — or, at " +
  "minimum, Matthew deliberately gives him' hedge on Yeshua's intentionality) while ALSO surfacing genuine, " +
  "specific overclaims the one-sided underclaim_challenge task was never positioned to find (e.g. a citation " +
  "graded as 'steel'/direct-quotation that the module's own wording concedes is closer allusion) — evidence the " +
  "original finding wasn't an artifact of a leading prompt, and that the symmetric task mode does its own " +
  "distinct, additional work rather than just softening the original.",
);

writeManifest(RUN_DIR, manifest);
console.log("Manifest note added and manifest.md regenerated.");
