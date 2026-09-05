#!/usr/bin/env -S npx tsx
/**
 * Adjudication ROUND 2 — Kimi K3 persona-sea over the parked judgment calls
 * (waves 4-7, 545 items in 10 batches). Upgrade over round 1: structured JSON
 * rulings, and (a)-softens WITHOUT drafted wording get their surgical wording
 * drafted in the same pass. Fable reviews everything before applying;
 * Michael's round-1 ratification of the rubric stands (2026-08-26).
 *
 * Usage (from packages/maestroclaw):
 *   PYTHONIOENCODING=utf-8 ADJ_BATCH=001 npx tsx scripts/eliana-adjudicate-kimi.ts
 */

import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { KimiCliAdapter } from "../src/adapters/kimi-cli.js";

const AD = "C:\\New folder\\Elianas RhythmMigrate\\Michael\\wordstudy-pilot\\adjudicate";
const BATCH = process.env.ADJ_BATCH ?? "001";
const PAYLOAD = join(AD, `adj-batch-${BATCH}.json`);
const OUT_RAW = join(AD, `adj-batch-${BATCH}-raw.md`);
const OUT = join(AD, `adj-batch-${BATCH}-rulings.json`);
const TIMEOUT_MS = 40 * 60 * 1000;

function log(m: string): void { console.log(`[adjudicate] ${m}`); }

async function main() {
  const payload = readFileSync(PAYLOAD, "utf-8");
  const prompt = [
    "Hi Swarm — Michael here (via Fable). I'm working on Eliana's Rhythm, the Bible app I've been building",
    "these past two years — you've done the Forsaken Cry research and the Who Raised Him research for it,",
    "and you adjudicated the first round of these word-study debates a few days ago. This is more of the",
    "same: a fairly low-intensity ask. We've been auditing the app's 22,694 word-study essays; a two-check",
    "pipeline (Sol flags, Sonnet verifies) confirmed the items below as real concerns but classed each one",
    "a JUDGMENT CALL rather than a settled fact — and Sol, Sonnet, and Fable want your ruling on each.",
    "Take whatever angles you think the material needs; if you think a flag is wrong, say so.",
    "",
    "STANDING RUBRIC (the one you worked to last round, ratified by Michael): anchor-verse",
    "discipline; root-fallacy caution (etymology never carries the claim); aspect humility (bare verb forms",
    "don't guarantee durative/permanent/once-for-all senses); no theological freight on deponent/voice",
    "forms; genuinely disputed scholarship must be stated as debated; BUT anti-sterilization — a mainstream",
    "defensible reading in this warm pastor-scholar genre is kept with at most a light hedge, never gutted.",
    "",
    "RULINGS, per item:",
    "  (a) soften — the flag holds. If proposed_old/proposed_new exist and implement the fix well, set",
    "      adopt_proposed=true. Otherwise DRAFT the surgical soften yourself: custom_old must appear",
    "      VERBATIM in the essay (copy exactly, punctuation included); custom_new changes only what the",
    "      flag requires, preserving the essay's voice.",
    "  (b) keep — the original is defensible; say why in one sentence.",
    "  (c) custom — both the essay and the proposal miss; draft custom_old/custom_new yourself.",
    "",
    "OUTPUT: ONLY a JSON array between the lines BEGIN RULINGS and END RULINGS, one object per item, in",
    "order, covering EVERY item:",
    '  {"id": "...", "ruling": "a"|"b"|"c", "adopt_proposed": true|false,',
    '   "custom_old": "..."|null, "custom_new": "..."|null, "reason": "<one sentence>"}',
    "",
    "=== THE ITEMS (JSON) ===",
    "",
    payload,
  ].join("\n");

  log(`Batch ${BATCH}: dispatching Kimi K3...`);
  const kimi = new KimiCliAdapter();
  const res = await kimi.run(prompt, mkdtempSync(join(tmpdir(), "adjudicate-")), TIMEOUT_MS);
  const s = res.output || "";
  writeFileSync(OUT_RAW, `# adj batch ${BATCH} raw\n- success: ${res.success}\n${res.error ? `- error: ${res.error}\n` : ""}\n${s || "(no output)"}`, "utf-8");
  const b = s.indexOf("BEGIN RULINGS"), e = s.indexOf("END RULINGS");
  if (b >= 0 && e > b) {
    let sec = s.slice(b + "BEGIN RULINGS".length, e).trim()
      .replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "").trim();
    try {
      const rulings = JSON.parse(sec);
      writeFileSync(OUT, JSON.stringify(rulings, null, 1), "utf-8");
      const c: Record<string, number> = {};
      for (const r of rulings) c[r.ruling] = (c[r.ruling] ?? 0) + 1;
      log(`Parsed ${rulings.length} rulings: ${JSON.stringify(c)}`);
    } catch (err) { log(`JSON parse FAILED: ${err}`); }
  } else log("No BEGIN/END RULINGS markers — check raw.");
}

main().catch((err) => { console.error("[adjudicate] FAILED:", err); process.exit(1); });
