#!/usr/bin/env -S npx tsx
/**
 * MaestroClaw — Play Store listing copy, Fable round 2.
 *
 * Follow-up to eliana-store-listing-fable.ts. Michael loved Fable's first
 * draft and wants him to revise it with the real "why" behind the app: the
 * preface of Elianasjournal.pdf, which tells the actual story of his
 * daughter Eliana's birth and why the book (and by extension the app) is
 * named what it is. Fable didn't have this context on the first pass.
 *
 * Not a literal resumed session (each claude_code dispatch is a fresh
 * process) -- instead, his own full first-round output is pasted back to
 * him verbatim as context, so he's revising his own work, not starting
 * cold. workDir is one level up from the app repo (the shared parent) so
 * he can reach both the PDF and, if he wants to re-check anything, the app
 * source tree.
 *
 * Usage:
 *   cd packages/maestroclaw
 *   CLAUDE_CONFIG_DIR="$HOME/.claude-thamos" CLAW_CLAUDE_MODEL=claude-fable-5 \
 *     npx tsx scripts/eliana-store-listing-fable-v2.ts
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ClaudeCodeAdapter } from "../src/adapters/claude-code.js";

const PARENT_DIR = "C:\\New folder\\Elianas RhythmMigrate";
const PDF_RELATIVE = "Elianasjournal.pdf";
const TIMEOUT_MS = 10 * 60 * 1000;
const OUT_DIR = join(
  "C:\\New folder\\MaestroOrchestra\\project\\Maestro\\docs\\audits\\eliana-readonly-poc",
  "2026-08-21-store-listing",
);
const PRIOR_OUTPUT_PATH = join(OUT_DIR, "fable-store-listing.md");

async function main() {
  if (!existsSync(PARENT_DIR)) throw new Error(`Parent dir not found at ${PARENT_DIR}`);
  if (!existsSync(join(PARENT_DIR, PDF_RELATIVE))) throw new Error(`PDF not found at ${join(PARENT_DIR, PDF_RELATIVE)}`);
  if (!existsSync(PRIOR_OUTPUT_PATH)) throw new Error(`Prior Fable output not found at ${PRIOR_OUTPUT_PATH} -- run round 1 first`);
  mkdirSync(OUT_DIR, { recursive: true });

  const priorOutput = readFileSync(PRIOR_OUTPUT_PATH, "utf-8");

  const PROMPT = `You're Fable. Michael loved your first draft of the Play Store listing copy for
"Eliana - God has Answered" -- your full round-1 output (draft copy + your own notes on the choices
you made) is pasted below verbatim, so you're revising your own work, not starting cold.

What's new: he wants you to read "${PDF_RELATIVE}" in this directory (${PARENT_DIR}) yourself --
it's the actual preface of "Eliana's Journal," the book he wrote for his daughter, and it's the real
story behind why the book -- and by extension this whole app -- is named what it is. His own words:
"review the pdf as it has the actual reason behind the book and by extent the entire app in it."

Read the preface closely. Then revise your full description to work the real "why" in -- you
already opened with "Eliana means 'God has answered'" tied to the Psalm 22 study, which was a sharp
instinct; now you have the actual story that makes that name true, not just theologically apt. The
character limit is 4000 and your last draft used 3,016, so you have real room if you want it --
Michael's own words: "the word limit is 4000 so he has room if he wants tbh." Use the room if it
earns its place; don't pad.

Keep whatever from round 1 still holds up (the layered-text description, the chain registry, Aliyah,
the evidence-label system, the daily verse, journal/prayer) -- this is a revision building on real
work, not a rewrite from zero. The short description (80 chars) can stay as-is unless the new
context changes your mind about it.

=== YOUR ROUND 1 OUTPUT (verbatim) ===

${priorOutput}

=== END ROUND 1 OUTPUT ===

Write your revised short + full description now. State the character count of the full description
when you're done.`;

  console.log("[store-listing-fable-v2] Running Fable round 2 (claude_code, task mode, read-only by construction)...");
  const adapter = new ClaudeCodeAdapter();
  const start = Date.now();
  const result = await adapter.run(PROMPT, PARENT_DIR, TIMEOUT_MS);
  const elapsedS = (Date.now() - start) / 1000;
  console.log(`[store-listing-fable-v2] success=${result.success} elapsed=${elapsedS.toFixed(1)}s`);
  if (!result.success) console.error(`[store-listing-fable-v2] stderr: ${(result.error || "").slice(0, 3000)}`);

  const outPath = join(OUT_DIR, "fable-store-listing-v2.md");
  writeFileSync(outPath, [
    "# Fable — Play Store listing copy, round 2 (with the Eliana story)",
    "",
    `- success: ${result.success}`,
    `- elapsed: ${elapsedS.toFixed(1)}s`,
    result.error ? `- adapter error: ${result.error.slice(0, 500)}` : "",
    "",
    "## Output",
    "",
    result.output || "(no output)",
  ].join("\n"), "utf-8");
  console.log(`[store-listing-fable-v2] Written to ${outPath}`);
}

main().catch((err) => { console.error("[store-listing-fable-v2] FAILED:", err); process.exit(1); });
