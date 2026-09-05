#!/usr/bin/env -S npx tsx
/**
 * Kimi-swarm fact-check of the staged contested-verse notes (2026-08-26, Michael ratified).
 *
 * The 16 apparatus notes + Mark 9:29 variant note in STAGED-CONTESTED-NOTES.md carry
 * manuscript-witness claims drafted from model memory (the local corpus has no full critical
 * apparatus). This pass asks Kimi K3 to verify every checkable claim and return corrections.
 * Nothing ships until this comes back and Fable applies the corrections.
 *
 * Usage (from packages/maestroclaw):
 *   PYTHONIOENCODING=utf-8 npx tsx scripts/eliana-contested-notes-verify-kimi.ts
 */

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { KimiCliAdapter } from "../src/adapters/kimi-cli.js";
import { CodexCliAdapter } from "../src/adapters/codex-cli.js";

const DIR = "C:\\New folder\\Elianas RhythmMigrate\\Michael\\honest-brackets-counsel";
const STAGED = join(DIR, "STAGED-CONTESTED-NOTES.md");
const WHO = process.env.NOTES_VERIFIER ?? "kimi";
const OUT = join(DIR, `${WHO}-verify-contested-notes.md`);
const TIMEOUT_MS = 25 * 60 * 1000;

async function main() {
  const staged = readFileSync(STAGED, "utf-8");
  const prompt = [
    "You are fact-checking a Bible app's draft apparatus notes for the 16 'missing verses' of the",
    "KJV tradition plus the Mark 9:29 'and fasting' variant. The draft below was written from model",
    "memory and MUST be verified against real text-critical knowledge (NA28/UBS5 apparatus data, ECM",
    "where it exists, standard references like Metzger's Textual Commentary) before anything ships.",
    "Work through the SWARM VERIFICATION TASKS section at the bottom of the draft, item by item,",
    "verse by verse. For EACH verse output:",
    "  VERDICT: correct | corrections-needed",
    "  followed by the specific corrections (exact wrong claim -> exact corrected claim), including:",
    "  wrong or dubious manuscript sigla, witnesses wrongly listed as absent/present, KJV wording",
    "  misquotes (compare the actual KJV text), wrong donor attributions, and any card line that",
    "  overclaims in either direction (too dismissive of the traditional reading OR too confident",
    "  against the critical text). If you cannot verify a specific claim with confidence, say",
    "  UNVERIFIABLE for that claim rather than guessing — those get pulled or generalized before",
    "  shipping, per the app's rule that unverifiable specifics must not be printed.",
    "Also explicitly check the five numbered special claims in the tasks list.",
    "Be adversarial: the goal is to catch errors before believers read them, not to affirm the draft.",
    "",
    "=== THE DRAFT ===",
    "",
    staged,
  ].join("\n");

  console.log(`[notes-verify] dispatching ${WHO}...`);
  const adapter = WHO === "sol" ? new CodexCliAdapter({ sandbox: "read-only" }) : new KimiCliAdapter();
  const res = await adapter.run(prompt, mkdtempSync(join(tmpdir(), "notes-verify-")), TIMEOUT_MS);
  writeFileSync(OUT, [
    `# ${WHO} verification — staged contested-verse notes`,
    `- success: ${res.success}`, res.error ? `- error: ${res.error}` : "", "",
    res.output || "(no output)",
  ].filter(Boolean).join("\n"), "utf-8");
  console.log(`[notes-verify] done: success=${res.success} len=${res.output.length}`);
}

main().catch((err) => { console.error("[notes-verify] FAILED:", err); process.exit(1); });
