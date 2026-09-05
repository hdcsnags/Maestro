#!/usr/bin/env -S npx tsx
/**
 * One-off: corrects the manifest note/known_gap that described the
 * claude-fable-5 run as a credits failure — that was the wrong diagnosis.
 * Per Sonnet (matching COUNCIL-INVOCATION.md's already-documented finding,
 * confirmed by Michael on 2026-08-15): it's a config-profile issue, not a
 * real quota — the default account isn't provisioned for Fable 5, a
 * separate profile (CLAUDE_CONFIG_DIR="$HOME/.claude-thamos") is. Re-run
 * with that env var succeeded. This corrects the record rather than leaving
 * a stale "did not produce a review" note sitting next to a now-successful
 * run entry.
 */
import { readFileSync } from "node:fs";
import { writeManifest, type EnvelopeManifest } from "./lib/eliana-manifest.js";

const RUN_DIR = "C:\\New folder\\MaestroOrchestra\\project\\Maestro\\docs\\audits\\eliana-readonly-poc\\2026-08-17-forsaken-cry";
const manifestPath = `${RUN_DIR}\\manifest.json`;
const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as EnvelopeManifest;

const staleNoteFragment = "Model/wrapper consistency addendum (2 more runs, same persona, same document): claude_code with CLAW_CLAUDE_MODEL=claude-fable-5 did NOT produce a review";
manifest.notes = manifest.notes.filter((n) => !n.startsWith(staleNoteFragment));
manifest.notes.push(
  "Model/wrapper consistency addendum (2 more runs, same persona, same document): first attempt at claude_code " +
  "with CLAW_CLAUDE_MODEL=claude-fable-5 failed with \"Fable 5 requires usage credits...\" (exit code 1) — this " +
  "looked like an account quota issue but was actually a config-profile issue, already documented in " +
  "COUNCIL-INVOCATION.md and confirmed by Michael on 2026-08-15: the default session profile isn't provisioned " +
  "for Fable 5 at all; a separate profile is. Re-run with CLAUDE_CONFIG_DIR=\"$HOME/.claude-thamos\" set " +
  "alongside CLAW_CLAUDE_MODEL=claude-fable-5 (propagated through to the spawned claude child process via " +
  "buildChildEnv()'s passthrough — no adapter code change needed) succeeded. codex_cli with " +
  "CLAW_CODEX_MODEL=gpt-5.6-sol succeeded on the first attempt, with the banner confirming the requested model " +
  "actually resolved (model: gpt-5.6-sol) rather than silently falling back to a default. Both persona runs are " +
  "now complete and comparable.",
);

const staleGapFragment = "The claude_code side of the model/wrapper consistency test (Fable) could not run to completion";
manifest.known_gaps = manifest.known_gaps.filter((g) => !g.startsWith(staleGapFragment));

writeManifest(RUN_DIR, manifest);
console.log("Manifest notes corrected and manifest.md regenerated.");
