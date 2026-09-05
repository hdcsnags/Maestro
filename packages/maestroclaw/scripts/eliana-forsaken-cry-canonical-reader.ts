#!/usr/bin/env -S npx tsx
/**
 * MaestroClaw read-only proof workload — Forsaken Cry round, addendum run:
 * The Christian Canonical Reader.
 *
 * Michael read all four outputs from the first Forsaken Cry round and
 * pushed back on something real: every review (both independent runs, New
 * Believer, Pastor) treated "did Yeshua intentionally invoke the whole
 * psalm" as requiring a heavy hedge every time, on the grounds that no one
 * has interior access to his consciousness. Michael's point: within the
 * Christian canonical frame this app actually confesses, Jesus's whole
 * established pattern across the Gospels (predicted death/resurrection,
 * consistently purposeful action, parables that carry deliberate weight)
 * already licenses a confident reading here — the accumulated
 * characterization across the whole canon IS the evidence, not invented
 * psychological access. He asked for this to be a persona, not just his own
 * ad hoc pushback each time; Sonnet added it to PERSONAS_THEOLOGY.md as
 * persona #6, `christian_canonical_reader`, with a full voice_preamble,
 * strengths/weaknesses/anti_patterns/deliberation_signature matching the
 * exact schema of the other five, plus an origin note quoting Michael's
 * actual reasoning.
 *
 * This script runs that one persona, alone, against the same Forsaken Cry
 * document, through claude_code only (same adapter as the New Believer/
 * Pastor run, to keep the persona variable isolated and comparable), and
 * appends its output + a new run record into the SAME run directory as the
 * original four-run round (docs/audits/eliana-readonly-poc/2026-08-17-forsaken-cry/)
 * rather than creating a separate fixture — this is one comparison set, not
 * two.
 *
 * Preamble extracted programmatically from PERSONAS_THEOLOGY.md (see
 * scripts/lib/eliana-personas.ts) — not retyped — for the same
 * transcription-drift reason as the first round.
 *
 * Read-only guarantees and verification method: identical to
 * eliana-forsaken-cry-review.ts — see that file's header for the full
 * explanation.
 *
 * Usage:
 *   cd packages/maestroclaw
 *   npx tsx scripts/eliana-forsaken-cry-canonical-reader.ts
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeCodeAdapter } from "../src/adapters/claude-code.js";
import { extractPersonaPreamble, extractDeliberationSignature, buildPersonaPrompt } from "./lib/eliana-personas.js";
import {
  sha256, cliVersion, writeManifest, type EnvelopeManifest, type RunRecord,
} from "./lib/eliana-manifest.js";

const ELIANA_SOURCE = "C:\\New folder\\Elianas RhythmMigrate\\Elianas Rhythm";
const TARGET_RELATIVE_PATH = "ALIYAH-ASCENT-DRAFT-the-forsaken-cry-sol-pro.md";
const PERSONAS_FILE_RELATIVE_TO_MAESTRO = ".michael/opus/PERSONAS_THEOLOGY.md";
const MAESTRO_REPO_ROOT = "C:\\New folder\\MaestroOrchestra\\project\\Maestro";
const PER_ADAPTER_TIMEOUT_MS = 8 * 60 * 1000;
const RUN_DIR = join(MAESTRO_REPO_ROOT, "docs\\audits\\eliana-readonly-poc\\2026-08-17-forsaken-cry");

function log(msg: string): void {
  console.log(`[forsaken-cry-canonical-reader] ${msg}`);
}

function gitStatusPorcelain(dir: string): string {
  try {
    return execFileSync("git", ["status", "--short"], { cwd: dir, encoding: "utf8" });
  } catch (err) {
    return `(git status failed: ${err instanceof Error ? err.message : String(err)})`;
  }
}

function gitDiffStat(dir: string): string {
  try {
    return execFileSync("git", ["diff", "--stat"], { cwd: dir, encoding: "utf8" });
  } catch (err) {
    return `(git diff failed: ${err instanceof Error ? err.message : String(err)})`;
  }
}

const KNOWN_MAESTROCLAW_INSTRUMENTATION_FILES = ["session.log", ".maestroclaw-session.log"];

function diffStatusLines(baseline: string, after: string): string[] {
  const baseSet = new Set(baseline.split("\n").map((l) => l.trim()).filter(Boolean));
  return after
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !baseSet.has(l));
}

async function main() {
  if (!existsSync(RUN_DIR)) {
    throw new Error(`Expected the original Forsaken Cry run directory to already exist: ${RUN_DIR}`);
  }
  const manifestPath = join(RUN_DIR, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Expected existing manifest.json at ${manifestPath} — this run appends to it, it doesn't create a fresh one.`);
  }

  // Fresh clone, same as every prior run in this proof workload — cheap for
  // a local repo, and guarantees a clean baseline uncomplicated by the
  // previous four runs' own session-log instrumentation.
  const scratchRoot = mkdtempSync(join(tmpdir(), "maestroclaw-forsaken-cry-canonical-"));
  const cloneDir = join(scratchRoot, "repo");
  log(`Scratch dir: ${scratchRoot}`);
  log(`Cloning ${ELIANA_SOURCE} (read-only source) -> ${cloneDir}`);
  execFileSync("git", ["clone", "--depth", "1", "--no-hardlinks", ELIANA_SOURCE, cloneDir], { stdio: "pipe" });

  const targetPath = join(cloneDir, TARGET_RELATIVE_PATH);
  if (!existsSync(targetPath)) {
    const sourcePath = join(ELIANA_SOURCE, TARGET_RELATIVE_PATH);
    if (!existsSync(sourcePath)) throw new Error(`Target file not found in clone OR source (${sourcePath})`);
    log(`NOTE: ${TARGET_RELATIVE_PATH} is uncommitted in the source (untracked) -- copying explicitly, same handling as prior runs.`);
    writeFileSync(targetPath, readFileSync(sourcePath, "utf-8"), "utf-8");
  }
  const studyText = readFileSync(targetPath, "utf-8");
  log(`Loaded study module: ${studyText.length} chars.`);

  const personasFileText = readFileSync(join(MAESTRO_REPO_ROOT, PERSONAS_FILE_RELATIVE_TO_MAESTRO), "utf-8");
  const preamble = extractPersonaPreamble(personasFileText, "## 6. The Christian Canonical Reader");
  const deliberation = extractDeliberationSignature(personasFileText, "## 6. The Christian Canonical Reader");
  log("Extracted Christian Canonical Reader preamble + deliberation-signature instruction directly from PERSONAS_THEOLOGY.md.");

  const prompt = buildPersonaPrompt(preamble, deliberation, studyText, "Aliyah (Bible study) module");
  writeFileSync(join(RUN_DIR, "prompt-christian-canonical-reader.md"), prompt, "utf-8");

  const baselineStatus = gitStatusPorcelain(cloneDir);
  log(`Baseline git status before adapter run:\n${baselineStatus.trim() || "(clean)"}`);

  log("Running claude_code + Christian Canonical Reader persona...");
  const adapter = new ClaudeCodeAdapter();
  const start = Date.now();
  const result = await adapter.run(prompt, cloneDir, PER_ADAPTER_TIMEOUT_MS);
  const elapsedS = (Date.now() - start) / 1000;

  const statusAfter = gitStatusPorcelain(cloneDir);
  const diffAfter = gitDiffStat(cloneDir);
  const newStatusLines = diffStatusLines(baselineStatus, statusAfter);
  const unexpectedLines = newStatusLines.filter(
    (l) => !KNOWN_MAESTROCLAW_INSTRUMENTATION_FILES.some((f) => l.endsWith(f)),
  );
  const hasUnexpectedWrites = unexpectedLines.length > 0 || diffAfter.trim().length > 0;

  log(`success=${result.success} elapsed=${elapsedS.toFixed(1)}s`);
  log(`read-only check — new status lines beyond baseline: ${newStatusLines.length} (${unexpectedLines.length} unexpected); tracked-file diff: ${diffAfter.trim() ? "NON-EMPTY" : "clean"}`);
  if (hasUnexpectedWrites) log("!!! UNEXPECTED WRITE DETECTED — investigate before trusting this run as read-only !!!");

  const outputFilename = "claude_code-persona-christian_canonical_reader.md";
  const reportBody = [
    "# claude_code-persona-christian_canonical_reader — The Forsaken Cry review (read-only proof workload, addendum run)",
    "",
    "- persona: christian_canonical_reader",
    `- success: ${result.success}`,
    `- elapsed: ${elapsedS.toFixed(1)}s`,
    `- read-only verification: ${hasUnexpectedWrites ? "**UNEXPECTED WRITE DETECTED — investigate**" : "clean"}`,
    "",
    "## New git-status lines beyond baseline",
    "```",
    newStatusLines.length > 0 ? newStatusLines.join("\n") : "(none)",
    "```",
    "",
    "## git diff --stat after run",
    "```",
    diffAfter.trim() || "(clean)",
    "```",
    "",
    result.error ? `## adapter error\n\n\`\`\`\n${result.error}\n\`\`\`\n` : "",
    "## Review output",
    "",
    result.output || "(no output)",
  ].join("\n");
  writeFileSync(join(RUN_DIR, outputFilename), reportBody, "utf-8");

  // Append to the existing manifest rather than creating a separate one —
  // this is one comparison set, not two.
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as EnvelopeManifest;
  const newRun: RunRecord = {
    label: "claude_code-persona-christian_canonical_reader",
    adapter: "claude_code",
    mode: "task",
    persona: { slug: "christian_canonical_reader", source: PERSONAS_FILE_RELATIVE_TO_MAESTRO },
    cli_version: cliVersion("claude", ["--version"]),
    read_only_mechanism: "Claude Code default permission model (no --dangerously-skip-permissions in task mode).",
    requested_model: "sonnet (alias; adapter default)",
    success: result.success,
    elapsed_seconds: Number(elapsedS.toFixed(1)),
    read_only_verification: hasUnexpectedWrites ? "UNEXPECTED_WRITE_DETECTED" : "clean",
    new_status_lines_beyond_baseline: newStatusLines,
    output_file: outputFilename,
    output_sha256: sha256(result.output || ""),
  };
  manifest.runs.push(newRun);
  manifest.notes.push(
    "Addendum run added after Michael read all four original outputs and identified a real, specific gap: every " +
    "review (both independent runs, New Believer, Pastor) treated authorial intent behind the psalm-quotation as " +
    "requiring a heavy hedge every time, on the grounds of no interior access to Yeshua's consciousness — " +
    "sidestepping that within the app's own confessed Christian canonical frame, an established narrative pattern " +
    "across the whole Gospel record already licenses a more confident reading. Sonnet added persona #6, " +
    "christian_canonical_reader, to PERSONAS_THEOLOGY.md (with an origin note quoting Michael's reasoning " +
    "verbatim) specifically to make this argument systematically. This run is that persona's first real test, " +
    "against the same document, same adapter, isolated the same way as the other two persona runs.",
  );
  manifest.known_gaps.push(
    "Christian Canonical Reader was run alone (not alongside a fresh run of the other five personas on the same " +
    "content in the same sitting) — a full six-persona comparison on this document is a candidate for a later round, " +
    "not done here.",
  );
  // Reuse the same writer used to build the original manifest — both
  // manifest.json and manifest.md are regenerated from the one updated
  // object, so they can't drift from each other.
  writeManifest(RUN_DIR, manifest);

  log("");
  log(`Done. Output + updated manifest written to: ${RUN_DIR}`);
  log(`New output file: ${join(RUN_DIR, outputFilename)}`);
}

main().catch((err) => {
  console.error("[forsaken-cry-canonical-reader] FAILED:", err);
  process.exit(1);
});
