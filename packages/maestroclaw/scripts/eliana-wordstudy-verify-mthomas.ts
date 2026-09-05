#!/usr/bin/env -S npx tsx
/**
 * Word-study OTHER_ISSUE flag verification — mthomas/Sonnet-5 pass (2026-08-26).
 *
 * Check 1 was Sol's triage flag; this is check 2 per Michael's ratified protocol:
 * Sonnet 5 (on the mthomas profile — CLAUDE_CONFIG_DIR must point at it) verifies
 * each of Sol's flags slowly, one doc at a time within the batch, against the
 * anchor verse text (translation + original) supplied inline. Fable reviews the
 * output (check 3) and applies only factually-settled fixes; interpretive calls
 * are parked for Michael.
 *
 * Usage (from packages/maestroclaw):
 *   CLAUDE_CONFIG_DIR="C:\Users\Owner\.claude-mthomas" CLAW_CLAUDE_MODEL=claude-sonnet-5 \
 *     WORDSTUDY_VBATCH=001 npx tsx scripts/eliana-wordstudy-verify-mthomas.ts
 */

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ClaudeCodeAdapter } from "../src/adapters/claude-code.js";

const PD = "C:\\New folder\\Elianas RhythmMigrate\\Michael\\wordstudy-pilot\\verify";
const BATCH = process.env.WORDSTUDY_VBATCH ?? "001";
const PAYLOAD = join(PD, `verify-batch-${BATCH}.json`);
const OUT_RAW = join(PD, `verify-batch-${BATCH}-raw.md`);
const OUT = join(PD, `verify-batch-${BATCH}-results.json`);
const TIMEOUT_MS = 30 * 60 * 1000;

function log(m: string): void { console.log(`[wordstudy-verify] ${m}`); }

async function main() {
  const payload = readFileSync(PAYLOAD, "utf-8");
  const prompt = [
    "You are verifying flagged word-study essays for Eliana's Rhythm (a Bible app). A first-pass reviewer",
    "(Sol) flagged each document below with a specific reason. Your job: verify each flag SLOWLY, one",
    "document at a time, against the anchor verse's supplied text (English translation AND original",
    "language where relevant). Do not trust the flag; do not trust the essay; the supplied verse text is",
    "ground truth. Do not use outside memory of other translations to overrule the supplied text.",
    "",
    "For each document decide:",
    "1. flag_confirmed: is Sol's specific complaint actually correct against the supplied texts?",
    "2. category: 'factual' (the text itself settles it — counts, quotes, who-said-what, grammar",
    "   verifiable from the supplied original text, truncation), 'interpretive' (a judgment call about",
    "   overconfidence/theology where reasonable readers could differ), or 'flag_wrong' (Sol misread).",
    "3. If flag_confirmed AND factual: propose a SURGICAL fix as an exact substring replacement —",
    "   old_substring must appear VERBATIM in the essay (copy it exactly, including punctuation),",
    "   new_substring must fix ONLY the error, preserving the essay's voice and everything else.",
    "   Keep fixes minimal. If the essay is truncated, propose a completion of the final sentence only.",
    "4. needs_michael: true for interpretive cases or anything touching theological posture.",
    "",
    "OUTPUT: ONLY a JSON array in one fenced code block between the lines BEGIN RESULTS and END RESULTS,",
    "one object per document, in order:",
    '  {"id": "...", "flag_confirmed": true|false, "category": "factual|interpretive|flag_wrong",',
    '   "old_substring": "..." | null, "new_substring": "..." | null, "needs_michael": true|false,',
    '   "note": "<one sentence>"}',
    "",
    "=== THE FLAGGED DOCUMENTS (JSON) ===",
    "",
    payload,
  ].join("\n");

  const scratch = mkdtempSync(join(tmpdir(), "wordstudy-verify-"));
  log(`Batch ${BATCH}: dispatching to Claude (model=${process.env.CLAW_CLAUDE_MODEL}, config=${process.env.CLAUDE_CONFIG_DIR})...`);
  const adapter = new ClaudeCodeAdapter();
  const start = Date.now();
  const result = await adapter.run(prompt, scratch, TIMEOUT_MS);
  const s = ((Date.now() - start) / 1000).toFixed(1);
  log(`success=${result.success} elapsed=${s}s output_len=${result.output.length}`);

  writeFileSync(OUT_RAW, `# verify batch ${BATCH} raw\n- success: ${result.success}\n- elapsed: ${s}s\n${result.error ? `- error: ${result.error}\n` : ""}\n${result.output || "(no output)"}`, "utf-8");

  const out = result.output || "";
  const b = out.indexOf("BEGIN RESULTS"), e = out.indexOf("END RESULTS");
  if (b >= 0 && e > b) {
    let sec = out.slice(b + "BEGIN RESULTS".length, e).trim()
      .replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "").trim();
    try {
      const results = JSON.parse(sec);
      writeFileSync(OUT, JSON.stringify(results, null, 1), "utf-8");
      const c: Record<string, number> = {};
      for (const r of results) {
        const k = `${r.flag_confirmed ? "confirmed" : "rejected"}/${r.category}`;
        c[k] = (c[k] ?? 0) + 1;
      }
      log(`Parsed ${results.length} results: ${JSON.stringify(c)}`);
    } catch (err) { log(`JSON parse FAILED: ${err}`); }
  } else {
    log("No BEGIN/END RESULTS markers — check raw.");
  }
}

main().catch((err) => { console.error("[wordstudy-verify] FAILED:", err); process.exit(1); });
