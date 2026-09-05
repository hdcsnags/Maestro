#!/usr/bin/env -S npx tsx
/**
 * Real editorial decision task, not another proof-workload run. Michael
 * wants to test whether the canonical_calibration findings hold up when put
 * in front of the people who'd have to act on them: Fable (done directly,
 * see ALIYAH-ASCENT-DRAFT-the-forsaken-cry-sol-pro-REVISED-fable.md) and
 * Sol — who wrote this document in an earlier session as "Sol Pro" and is
 * now reconsidering his own prior work, not a stranger's.
 *
 * This script gives Sol everything he needs in the prompt itself (the full
 * original document, both calibration reports — his own and Fable's — and
 * Michael's verbatim instruction/standard) and asks him to decide: does the
 * critique hold weight against actual textual/canonical linkage, or not?
 * If he revises, he's asked to output the COMPLETE revised document as
 * plain text in his response — his own file-write is unreliable in this
 * environment, so his response text is captured and saved to disk
 * separately (ALIYAH-ASCENT-DRAFT-the-forsaken-cry-sol-pro-REVISED-sol.md),
 * rather than relying on him to write the file himself.
 *
 * Read-only sandbox kept for the same reason as every prior run tonight,
 * even though this task doesn't strictly need filesystem access (everything
 * Sol needs is inline in the prompt) — no reason to relax the discipline
 * now that the stakes are real rather than a benchmark.
 *
 * Usage:
 *   cd packages/maestroclaw
 *   CLAW_CODEX_MODEL=gpt-5.6-sol npx tsx scripts/eliana-sol-editorial-decision.ts
 */

import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexCliAdapter } from "../src/adapters/codex-cli.js";

const ELIANA_ROOT = "C:\\New folder\\Elianas RhythmMigrate\\Elianas Rhythm";
const TARGET_PATH = join(ELIANA_ROOT, "ALIYAH-ASCENT-DRAFT-the-forsaken-cry-sol-pro.md");
const FABLE_CALIBRATION_PATH = "C:\\New folder\\MaestroOrchestra\\project\\Maestro\\docs\\audits\\eliana-readonly-poc\\2026-08-17-forsaken-cry\\claude_code-persona-christian_canonical_reader-canonical_calibration-fable.md";
const SOL_CALIBRATION_PATH = "C:\\New folder\\MaestroOrchestra\\project\\Maestro\\docs\\audits\\eliana-readonly-poc\\2026-08-17-forsaken-cry\\codex_cli-persona-christian_canonical_reader-canonical_calibration-sol.md";
const OUT_DECISION_LOG = join(
  "C:\\New folder\\MaestroOrchestra\\project\\Maestro\\docs\\audits\\eliana-readonly-poc\\2026-08-17-forsaken-cry",
  "sol-editorial-decision-raw-response.md",
);
const REVISED_OUT_PATH = join(ELIANA_ROOT, "ALIYAH-ASCENT-DRAFT-the-forsaken-cry-sol-pro-REVISED-sol.md");
const TIMEOUT_MS = 10 * 60 * 1000;

function log(msg: string): void {
  console.log(`[sol-editorial-decision] ${msg}`);
}

function extractReviewOutput(reportFile: string): string {
  const full = readFileSync(reportFile, "utf-8");
  const idx = full.indexOf("## Review output");
  return idx >= 0 ? full.slice(idx + "## Review output".length).trim() : full;
}

async function main() {
  if (!existsSync(TARGET_PATH)) throw new Error(`Original document not found: ${TARGET_PATH}`);
  const originalText = readFileSync(TARGET_PATH, "utf-8");
  const fableCalibration = extractReviewOutput(FABLE_CALIBRATION_PATH);
  const solCalibration = extractReviewOutput(SOL_CALIBRATION_PATH);

  const prompt = [
    "You are Sol. You wrote the document below (\"The Forsaken Cry\") in an earlier session, under the name",
    "\"Sol Pro.\" You are now being asked to reconsider your own prior work in light of two independent",
    "calibration reviews — one is your own later pass, the other is a parallel model's (\"Fable\") pass on the",
    "same document, using the same persona and task.",
    "",
    "THE TASK, VERBATIM FROM MICHAEL (the project owner):",
    "",
    "\"Consider the perspective in these two calibration reports. If it holds weight, apply it. If it doesn't",
    "hold weight, deny it. You can either (a) leave the original text as it mostly stands and say explicitly",
    "why the critique doesn't hold, or (b) actually rewrite the document with the lens you now have. Real",
    "judgment, not performative agreement.\"",
    "",
    "Michael's explicit standard: truth-seeking, not neutral. The question isn't whether a reading sounds more",
    "devout — it's whether the text itself actually supports it. His own worked example of what \"holds weight\"",
    "looks like: the wilderness temptation in Matthew 4 — \"if you are the Son of God, [prove it]\" answered",
    "three times from Deuteronomy with settled clarity — is the same test, verbatim in structure, that returns",
    "at Golgotha in \"if you are the Son of God, come down.\" That's real, same-book, same-author evidence of",
    "established character, not speculation about interior states. That is the bar: actual textual/canonical",
    "linkage, not vibes.",
    "",
    "Do your own independent reasoning against that bar. Where the two calibration reports agree, that",
    "convergence is itself worth weighing (see PERSONAS_THEOLOGY.md's own verification note on this). Where",
    "they disagree with each other — and they do, explicitly, on whether the wilderness/cross parallel is",
    "undergraded — resolve that disagreement yourself; don't just pick a side by default or split the",
    "difference for its own sake.",
    "",
    "OUTPUT FORMAT REQUIRED:",
    "1. State your decision plainly: for each substantive finding in the two calibration reports, say whether",
    "   it holds weight against the text, and why, citing the specific place in the document. If you reject a",
    "   finding, say so explicitly and explain why — \"no changes needed\" alone is not an acceptable answer.",
    "2. If you decide the text should stay mostly as-is: write out your full reasoning for each point, but do",
    "   NOT reproduce the full document — your reasoning alone is the deliverable.",
    "3. If you decide to revise: output the COMPLETE revised document as plain markdown text, in full, inside a",
    "   single fenced code block, clearly marked with a line that says exactly \"BEGIN REVISED DOCUMENT\" before",
    "   the fence and \"END REVISED DOCUMENT\" after it. Your file-write in this environment is unreliable, so",
    "   your response text is what will be saved to disk — it must be complete and correct as given, not a",
    "   diff or a summary of changes.",
    "4. Either way, before your main answer, write a short section titled \"EDITORIAL DECISION SUMMARY\" listing,",
    "   for each finding, whether you accepted it, rejected it, or partially accepted it, in one line each.",
    "",
    "=== FABLE'S CALIBRATION REPORT (canonical_calibration task, claude_code, model claude-fable-5) ===",
    "",
    fableCalibration,
    "",
    "=== YOUR OWN EARLIER CALIBRATION REPORT (canonical_calibration task, codex_cli, model gpt-5.6-sol) ===",
    "",
    solCalibration,
    "",
    "=== THE ORIGINAL DOCUMENT (\"The Forsaken Cry\", your earlier draft) ===",
    "",
    originalText,
  ].join("\n");

  const scratchDir = mkdtempSync(join(tmpdir(), "sol-editorial-decision-"));
  log(`Scratch dir (unused for file access, kept for adapter's cwd only): ${scratchDir}`);
  log("Running codex_cli (sandbox: read-only) as Sol on the editorial decision task...");

  const adapter = new CodexCliAdapter({ sandbox: "read-only" });
  const start = Date.now();
  const result = await adapter.run(prompt, scratchDir, TIMEOUT_MS);
  const elapsedS = (Date.now() - start) / 1000;

  log(`success=${result.success} elapsed=${elapsedS.toFixed(1)}s output_len=${result.output.length}`);
  if (!result.success) {
    log(`ERROR: ${result.error ?? "(no error message)"}`);
  }

  writeFileSync(
    OUT_DECISION_LOG,
    [
      "# Sol's editorial decision — raw response",
      "",
      `- success: ${result.success}`,
      `- elapsed: ${elapsedS.toFixed(1)}s`,
      result.error ? `- error: ${result.error}` : "",
      "",
      "## Full raw response",
      "",
      result.output || "(no output)",
    ].filter(Boolean).join("\n"),
    "utf-8",
  );
  log(`Raw response saved to: ${OUT_DECISION_LOG}`);

  // Extract the revised document, if Sol chose to write one.
  const output = result.output || "";
  const beginMarker = "BEGIN REVISED DOCUMENT";
  const endMarker = "END REVISED DOCUMENT";
  const beginIdx = output.indexOf(beginMarker);
  const endIdx = output.indexOf(endMarker);

  if (beginIdx >= 0 && endIdx > beginIdx) {
    let revisedSection = output.slice(beginIdx + beginMarker.length, endIdx).trim();
    // Strip a wrapping ``` fence if present.
    revisedSection = revisedSection.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "").trim();
    if (revisedSection.length > 500) {
      writeFileSync(REVISED_OUT_PATH, revisedSection, "utf-8");
      log(`Sol chose to revise. Full revised document extracted and saved to: ${REVISED_OUT_PATH}`);
    } else {
      log(`Found BEGIN/END markers but extracted content looked too short (${revisedSection.length} chars) — NOT writing a revised file. Check the raw response log.`);
    }
  } else {
    log("No BEGIN/END REVISED DOCUMENT markers found — Sol appears to have decided the text stands as-is, or did not follow the output format. Check the raw response log for his reasoning.");
  }
}

main().catch((err) => {
  console.error("[sol-editorial-decision] FAILED:", err);
  process.exit(1);
});
