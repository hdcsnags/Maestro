#!/usr/bin/env -S npx tsx
/**
 * Blind counsel on the "missing verses" question (2026-08-26, Michael's commission).
 *
 * Two independent witnesses — Sol (codex) and Kimi K3 — get the SAME prompt, blind:
 * no access to Fable's analysis or Michael's leanings. Two questions: (1) the
 * text-critical + exegetical puzzle Michael's mother raised (Mark 9:29 "and fasting" /
 * Matthew 17:21), including the "wouldn't that be absurd?" objection, and (2) design
 * counsel on whether/how to surface the 16 critical-text-absent verses while keeping
 * the app's transparency commitment clean. Michael rules after reading both takes.
 *
 * Usage (from packages/maestroclaw):
 *   CLAW_CODEX_MODEL=gpt-5.6-sol npx tsx scripts/eliana-honest-brackets-counsel.ts
 */

import { writeFileSync, mkdirSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CodexCliAdapter } from "../src/adapters/codex-cli.js";
import { KimiCliAdapter } from "../src/adapters/kimi-cli.js";

const OUT_DIR = "C:\\New folder\\Elianas RhythmMigrate\\Michael\\honest-brackets-counsel";
const TIMEOUT_MS = 20 * 60 * 1000;

const PROMPT = [
  "You are advising Eliana's Rhythm, a Christian Bible app whose translation follows the modern critical",
  "Greek text (NA28/SBLGNT family) and whose stated house standard is: truth-seeking, warm pastoral voice,",
  "claims ranked honestly by evidence, and 'a contested text is labeled contested — never quietly picked.'",
  "The app's own fresh translation (the 'Eliana Bible') was built verse-by-verse from the critical text.",
  "",
  "THE SITUATION: The developer's mother — a pastor who reads the King James — asked why the verse",
  "\"this kind goeth not out but by prayer and fasting\" is missing from the app. Investigation confirmed:",
  "Mark 9:29 IS in the app, reading \"This kind cannot come out by anything except prayer\" (no 'and",
  "fasting'), and Matthew 17:21 is absent entirely, as are 15 other whole verses that appear in",
  "KJV-tradition Bibles but not in the earliest manuscripts (the familiar critical-text set: Matt 17:21,",
  "18:11, 23:14; Mark 7:16, 9:44, 9:46, 11:26, 15:28; Luke 17:36, 23:17; John 5:4; Acts 8:37, 15:34,",
  "24:7, 28:29; Rom 16:24). Currently the app simply omits them — the verse numbers silently skip.",
  "(The two long passages, Mark 16:9-20 and John 7:53-8:11, ARE included, each with an honest textual",
  "note in its study.)",
  "",
  "QUESTION 1 — THE TEXT ITSELF. Answer with scholarly honesty, as if teaching the developer:",
  "(a) Explain the text-critical situation of Mark 9:29's 'and fasting' and of Matthew 17:21 — what the",
  "manuscript evidence actually is, and how confident scholarship really is here.",
  "(b) These omitted verses are commonly described as harmonizations from parallel passages. For",
  "Matthew 17:21 specifically: what is its source passage, and does that source mention fasting or",
  "something else? Walk through what that implies.",
  "(c) Address this objection head-on, because it is a serious one: the disciples in Mark 9 presumably",
  "DID pray, and failed anyway — so if the original text has Jesus answer 'this kind cannot come out",
  "except by prayer,' isn't that answer absurd on its face ('you know why it failed? prayer!')? Does the",
  "shorter reading make exegetical sense of the scene, or does the longer reading ('and fasting')",
  "actually make better sense? Be honest even if the answer is uncomfortable for either side.",
  "",
  "QUESTION 2 — THE DESIGN DECISION. The developer is weighing whether to (A) surface the 16 verses in",
  "the reader as visibly carved-out contested text — e.g. bracketed, styled distinctly, each tappable",
  "with an explanation of its manuscript story, and linked to a Foundations teaching module the app now",
  "carries about textual transmission and honesty — or (B) keep omitting them but mark each gap with a",
  "small note, or (C) keep the current silent omission. Give your honest recommendation and reasoning:",
  "if the verses are surfaced, how is the app's commitment to honesty and transparency kept CLEANLY",
  "intact (what exactly must the presentation do and avoid)? Is surfacing worth it at all, or does it",
  "reintroduce confusion? Consider the congregation actually using this app: KJV-reared believers,",
  "new readers, and skeptics. Do not optimize for pleasing the developer — he explicitly wants your",
  "honest take, including 'don't do it' if that is your judgment.",
  "",
  "FORMAT: two sections titled QUESTION 1 and QUESTION 2. Plain prose, no fluff. Cite manuscript",
  "witnesses and passages precisely where you make factual claims.",
].join("\n");

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const only = process.env.COUNSEL_ONLY; // "sol" | "kimi" | unset = both

  if (!only || only === "sol") {
  console.log("[counsel] dispatching Sol (codex, read-only)...");
  const sol = new CodexCliAdapter({ sandbox: "read-only" });
  const solRes = await sol.run(PROMPT, mkdtempSync(join(tmpdir(), "counsel-sol-")), TIMEOUT_MS);
  writeFileSync(join(OUT_DIR, "sol-take.md"), [
    "# Sol's blind take — missing verses counsel",
    `- success: ${solRes.success}`, solRes.error ? `- error: ${solRes.error}` : "", "",
    solRes.output || "(no output)",
  ].filter(Boolean).join("\n"), "utf-8");
  console.log(`[counsel] Sol done: success=${solRes.success} len=${solRes.output.length}`);
  }

  if (!only || only === "kimi") {
  console.log("[counsel] dispatching Kimi K3...");
  const kimi = new KimiCliAdapter();
  const kimiRes = await kimi.run(PROMPT, mkdtempSync(join(tmpdir(), "counsel-kimi-")), TIMEOUT_MS);
  writeFileSync(join(OUT_DIR, "kimi-take.md"), [
    "# Kimi K3's blind take — missing verses counsel",
    `- success: ${kimiRes.success}`, kimiRes.error ? `- error: ${kimiRes.error}` : "", "",
    kimiRes.output || "(no output)",
  ].filter(Boolean).join("\n"), "utf-8");
  console.log(`[counsel] Kimi done: success=${kimiRes.success} len=${kimiRes.output.length}`);
  }
}

main().catch((err) => { console.error("[counsel] FAILED:", err); process.exit(1); });
