#!/usr/bin/env -S npx tsx
/**
 * Soften-drafting pass (2026-08-26): 216 flags ruled "(a) soften" by the Kimi-K3
 * adjudication (Michael ratified) but with no drafted wording yet. Sonnet-5 on the
 * mthomas profile drafts the surgical soften per Kimi's ruling line, under the five
 * standing overclaim rules. Fable reviews before applying.
 *
 * Usage (from packages/maestroclaw):
 *   CLAUDE_CONFIG_DIR="C:\Users\Owner\.claude-mthomas" CLAW_CLAUDE_MODEL=claude-sonnet-5 \
 *     WORDSTUDY_DBATCH=001 npx tsx scripts/eliana-wordstudy-draft-mthomas.ts
 */

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ClaudeCodeAdapter } from "../src/adapters/claude-code.js";

const PD = "C:\\New folder\\Elianas RhythmMigrate\\Michael\\wordstudy-pilot\\draft";
const BATCH = process.env.WORDSTUDY_DBATCH ?? "001";
const PAYLOAD = join(PD, `draft-batch-${BATCH}.json`);
const OUT_RAW = join(PD, `draft-batch-${BATCH}-raw.md`);
const OUT = join(PD, `draft-batch-${BATCH}-drafts.json`);
const TIMEOUT_MS = 30 * 60 * 1000;

function log(m: string): void { console.log(`[wordstudy-draft] ${m}`); }

async function main() {
  const payload = readFileSync(PAYLOAD, "utf-8");
  const prompt = [
    "You are drafting SURGICAL softens for word-study essays in Eliana's Rhythm (a Bible app). Each",
    "document below was flagged as an overclaim, and an adjudication panel ruled '(a) soften' with a",
    "specific instruction (kimi_ruling). Your job, per document: find the offending claim in the essay and",
    "draft a minimal substring replacement that implements EXACTLY the ruling's instruction — no more.",
    "",
    "THE FIVE STANDING RULES (the ruling lines assume them):",
    "1. Aspect overread: durativity/permanence comes from context or lexical markers, never bare verb forms.",
    "2. Root fallacy: etymology is background only; it never carries the claim.",
    "3. Authorial intent: 'may echo' / 'is widely read as' — unless the text itself signals the connection.",
    "4. Disputed scholarship: NAME the debate; never present one side as consensus.",
    "5. Anchor overreach: cross-text claims must cite their verses or be hedged.",
    "",
    "CRITICAL CONSTRAINTS:",
    "- old_substring must appear VERBATIM in the essay (copy exactly, punctuation included).",
    "- Keep the essay's warm pastor-scholar voice. A light hedge, not a gutting: 'widely read as,'",
    "  'many scholars,' 'one common reading' — the claim usually STAYS, correctly ranked.",
    "- Change ONLY what the ruling requires. Do not restyle surrounding prose.",
    "- If the ruling names specific wording or citations, use them.",
    "",
    "OUTPUT: ONLY a JSON array in one fenced block between the lines BEGIN DRAFTS and END DRAFTS,",
    "one object per document, in order:",
    '  {"id": "...", "old_substring": "...", "new_substring": "...", "note": "<one sentence on what changed>"}',
    "",
    "=== THE DOCUMENTS (JSON) ===",
    "",
    payload,
  ].join("\n");

  const scratch = mkdtempSync(join(tmpdir(), "wordstudy-draft-"));
  log(`Batch ${BATCH}: dispatching (model=${process.env.CLAW_CLAUDE_MODEL})...`);
  const adapter = new ClaudeCodeAdapter();
  const start = Date.now();
  const result = await adapter.run(prompt, scratch, TIMEOUT_MS);
  const s = ((Date.now() - start) / 1000).toFixed(1);
  log(`success=${result.success} elapsed=${s}s output_len=${result.output.length}`);
  writeFileSync(OUT_RAW, `# draft batch ${BATCH} raw\n- success: ${result.success}\n- elapsed: ${s}s\n${result.error ? `- error: ${result.error}\n` : ""}\n${result.output || "(no output)"}`, "utf-8");
  const out = result.output || "";
  const b = out.indexOf("BEGIN DRAFTS"), e = out.indexOf("END DRAFTS");
  if (b >= 0 && e > b) {
    let sec = out.slice(b + "BEGIN DRAFTS".length, e).trim()
      .replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "").trim();
    try {
      const drafts = JSON.parse(sec);
      writeFileSync(OUT, JSON.stringify(drafts, null, 1), "utf-8");
      log(`Parsed ${drafts.length} drafts.`);
    } catch (err) { log(`JSON parse FAILED: ${err}`); }
  } else log("No BEGIN/END DRAFTS markers — check raw.");
}

main().catch((err) => { console.error("[wordstudy-draft] FAILED:", err); process.exit(1); });
