#!/usr/bin/env -S npx tsx
/**
 * One-off: appends a clarifying note to the Forsaken Cry manifest about the
 * claude-fable-5 usage-credits finding, then regenerates manifest.md from
 * the same writer used everywhere else so the two files can't drift.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { writeManifest, type EnvelopeManifest } from "./lib/eliana-manifest.js";

const RUN_DIR = "C:\\New folder\\MaestroOrchestra\\project\\Maestro\\docs\\audits\\eliana-readonly-poc\\2026-08-17-forsaken-cry";
const manifestPath = join(RUN_DIR, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as EnvelopeManifest;

manifest.notes.push(
  "Model/wrapper consistency addendum (2 more runs, same persona, same document): claude_code with " +
  "CLAW_CLAUDE_MODEL=claude-fable-5 did NOT produce a review — confirmed reproducible (retried standalone " +
  "outside the harness, same result both times): the installed claude CLI returns exit code 1 with " +
  "\"Fable 5 requires usage credits. Switch to another model, or manage usage credits at " +
  "claude.ai/admin-settings/usage, to continue.\" This confirms claude-fable-5 is a real, recognized model in " +
  "this environment (not an invalid model ID) — the local CLI's authenticated account simply lacks usage " +
  "credits for it right now. Not worked around or retried with different credentials; recorded as the honest " +
  "result. codex_cli with CLAW_CODEX_MODEL=gpt-5.6-sol succeeded normally and produced a full review, with the " +
  "banner confirming the requested model actually resolved (model: gpt-5.6-sol) rather than silently falling " +
  "back to a default.",
);
manifest.known_gaps.push(
  "The claude_code side of the model/wrapper consistency test (Fable) could not run to completion due to an " +
  "account-level usage-credits constraint, not a code or design issue — re-running it once credits are " +
  "available would complete the comparison.",
);

writeManifest(RUN_DIR, manifest);
console.log("Manifest notes updated and manifest.md regenerated.");
