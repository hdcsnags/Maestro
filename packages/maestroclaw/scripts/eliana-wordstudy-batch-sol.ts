#!/usr/bin/env -S npx tsx
/**
 * Word-study verse-specificity sweep — PILOT BATCH 001 (Fable → Sol, 2026-08-26).
 *
 * The standing first repass target: 22,694 word_studies docs where the essay
 * (core_meaning) was written for one anchor verse (first_studied_in) but Word Lookup
 * shows it for EVERY occurrence of the word — and some essays discuss the wrong verse
 * outright. This pilot proves the loop mechanics on 40 docs (biased toward common
 * words, occurrences >= 3) before scaling to batched full-corpus runs.
 *
 * Sol gets the payload INLINE (his sandbox file reads are unreliable) and returns a
 * JSON verdict array; this script parses and saves it. Verdicts: VERSE_MATCH /
 * VERSE_MISMATCH / GENERIC_OK / OTHER_ISSUE.
 *
 * Usage (from packages/maestroclaw):
 *   CLAW_CODEX_MODEL=gpt-5.6-sol npx tsx scripts/eliana-wordstudy-pilot-sol.ts
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { CodexCliAdapter } from "../src/adapters/codex-cli.js";

const PILOT_DIR = "C:\\New folder\\Elianas RhythmMigrate\\Michael\\wordstudy-pilot";
const BATCH = process.env.WORDSTUDY_BATCH ?? "001";
const PAYLOAD = join(PILOT_DIR, `pilot-batch-${BATCH}.json`);
const OUT_RAW = join(PILOT_DIR, `pilot-batch-${BATCH}-sol-raw.md`);
const OUT_VERDICTS = join(PILOT_DIR, `pilot-batch-${BATCH}-verdicts.json`);
const TIMEOUT_MS = 20 * 60 * 1000;

function log(msg: string): void {
  console.log(`[wordstudy-pilot] ${msg}`);
}

async function main() {
  const payload = readFileSync(PAYLOAD, "utf-8");

  const prompt = [
    "You are Sol, auditing word-study essays for Eliana's Rhythm (Michael's Bible app). Each document",
    "below has: the original word, its anchor verse reference (first_studied_in — the verse the essay was",
    "WRITTEN for), the anchor verse's actual text (the app's own translation), a list of other verses where",
    "the word occurs, and the essay (core_meaning).",
    "",
    "THE KNOWN DEFECT you are hunting: essays that make verse-specific claims that DO NOT FIT their anchor",
    "verse — e.g. the essay narrates events, speakers, or grammar of a DIFFERENT verse (usually another",
    "occurrence of the same common word), or attributes to 'this verse' content the anchor verse does not",
    "contain. Judge ONLY against the anchor verse text provided; do not assume other translations.",
    "",
    "For EACH document, output a verdict:",
    "- VERSE_MATCH   — essay's verse-specific claims genuinely fit the anchor verse.",
    "- VERSE_MISMATCH — essay describes a different verse / wrong context (name the verse it seems to",
    "                   actually describe if you can tell from the occurrence list).",
    "- GENERIC_OK    — essay is general lexicography with no verse-specific claims; safe to show anywhere.",
    "- OTHER_ISSUE   — anything else worth a human look (factual error about the word itself, broken text,",
    "                  overclaiming). Explain briefly.",
    "",
    "Be strict about what counts as MISMATCH: 'this verse' language that doesn't match the anchor text is a",
    "mismatch even if the lexicography is good. But do NOT flag an essay for merely mentioning other verses",
    "explicitly by reference (comparisons are fine).",
    "",
    "OUTPUT FORMAT — respond with ONLY a JSON array inside one fenced code block, marked by the lines",
    "BEGIN VERDICTS before the fence and END VERDICTS after it. One object per document, ALL documents,",
    "in the given order (the array length must equal the document count):",
    '  {"id": "<doc id>", "verdict": "VERSE_MATCH|VERSE_MISMATCH|GENERIC_OK|OTHER_ISSUE",',
    '   "reason": "<one sentence>", "suspected_actual_verse": "<ref or null>"}',
    "",
    "=== THE 40 DOCUMENTS (JSON) ===",
    "",
    payload,
  ].join("\n");

  const scratchDir = mkdtempSync(join(tmpdir(), "wordstudy-pilot-"));
  log("Running codex_cli (sandbox: read-only) — Sol, 40-doc verse-specificity pilot...");
  const adapter = new CodexCliAdapter({ sandbox: "read-only" });
  const start = Date.now();
  const result = await adapter.run(prompt, scratchDir, TIMEOUT_MS);
  const elapsedS = (Date.now() - start) / 1000;
  log(`success=${result.success} elapsed=${elapsedS.toFixed(1)}s output_len=${result.output.length}`);

  writeFileSync(OUT_RAW, [
    "# Word-study pilot batch 001 — Sol raw response",
    `- success: ${result.success}`,
    `- elapsed: ${elapsedS.toFixed(1)}s`,
    result.error ? `- error: ${result.error}` : "",
    "",
    result.output || "(no output)",
  ].filter(Boolean).join("\n"), "utf-8");

  const out = result.output || "";
  const b = out.indexOf("BEGIN VERDICTS");
  const e = out.indexOf("END VERDICTS");
  if (b >= 0 && e > b) {
    let section = out.slice(b + "BEGIN VERDICTS".length, e).trim();
    section = section.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "").trim();
    try {
      const verdicts = JSON.parse(section);
      writeFileSync(OUT_VERDICTS, JSON.stringify(verdicts, null, 1), "utf-8");
      const counts: Record<string, number> = {};
      for (const v of verdicts) counts[v.verdict] = (counts[v.verdict] ?? 0) + 1;
      log(`Parsed ${verdicts.length} verdicts: ${JSON.stringify(counts)}`);
    } catch (err) {
      log(`JSON parse of verdicts FAILED: ${err}`);
    }
  } else {
    log("No BEGIN/END VERDICTS markers found — check raw response.");
  }
}

main().catch((err) => {
  console.error("[wordstudy-pilot] FAILED:", err);
  process.exit(1);
});
