#!/usr/bin/env -S npx tsx
/**
 * MaestroClaw read-only proof workload — Round 2: "The Forsaken Cry".
 *
 * Michael's direction (2026-08-17): run one full Aliyah module —
 * `ALIYAH-ASCENT-DRAFT-the-forsaken-cry-sol-pro.md` — chosen specifically
 * because three real hand-run audits already exist on this exact file from
 * earlier tonight (SOL-AUDIT-forsaken-cry-sol-pro.md,
 * FABLE-AUDIT-forsaken-cry-sol-pro.md, KIMI-AUDIT-forsaken-cry-sol-pro.md,
 * all in the Elianas Rhythm repo root), giving this run an unusually clean,
 * direct comparison basis: same document, same night, hand-run vs.
 * pipeline-run.
 *
 * Design (contributor/persona choice delegated to Fable):
 *
 *   Run A — independent review, no persona, both adapters (claude_code
 *   task-mode + codex_cli sandbox:read-only) — same shape as the VOTD round,
 *   for direct comparability to it AND to the three existing hand-run
 *   audits, which are themselves plain independent reviews (not
 *   persona-flavored).
 *
 *   Run B — persona-injected reviews using New Believer and Pastor from
 *   .michael/opus/PERSONAS_THEOLOGY.md, both run through claude_code
 *   task-mode only. This is the first real test of either persona against
 *   real content (per Sonnet's flag — they were designed tonight but never
 *   run). Deliberately isolated to one adapter so the adapter isn't a
 *   confound when reading persona-to-persona differences — the thing being
 *   tested here is whether the personas themselves produce structurally
 *   different, useful output (per PERSONAS_THEOLOGY.md's own "Verification
 *   note"), not another adapter comparison.
 *
 *   Why New Believer + Pastor specifically, out of the five personas in the
 *   file: this content (Psalm 22 / "Eli Eli lema sabachthani", divine
 *   abandonment, a cry from the cross) is exactly the terrain where these
 *   two personas' actual jobs — "what does a first-time reader walk away
 *   believing" and "who does this help vs. put at risk in a mixed
 *   congregation" — are most load-bearing, not incidental. The Atheist
 *   Reader / Jewish Reader / Scholar personas are equally real but this
 *   round is bounded on purpose; they're candidates for a later round.
 *
 * Read-only guarantees, verification method, and the --no-hardlinks /
 * uncommitted-content-copy reasoning are identical to
 * eliana-readonly-review.ts (the VOTD round) — see that file's header for
 * the full explanation, not repeated here.
 *
 * Usage:
 *   cd packages/maestroclaw
 *   npx tsx scripts/eliana-forsaken-cry-review.ts
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeCodeAdapter } from "../src/adapters/claude-code.js";
import { CodexCliAdapter } from "../src/adapters/codex-cli.js";
import type { AdapterResult } from "../src/adapters/types.js";
import {
  sha256, sha256OfFile, captureSourceRepoInfo, cliVersion, parseCodexBanner, writeManifest,
  type EnvelopeManifest, type RunRecord,
} from "./lib/eliana-manifest.js";

const ELIANA_SOURCE = "C:\\New folder\\Elianas RhythmMigrate\\Elianas Rhythm";
const TARGET_RELATIVE_PATH = "ALIYAH-ASCENT-DRAFT-the-forsaken-cry-sol-pro.md";
const PERSONAS_FILE_RELATIVE_TO_MAESTRO = ".michael/opus/PERSONAS_THEOLOGY.md"; // in the Maestro repo, not Eliana's
const PER_ADAPTER_TIMEOUT_MS = 8 * 60 * 1000; // longer document than VOTD's slice — generous budget
const RUN_ID = "2026-08-17-forsaken-cry";
const OUT_DIR = join(
  "C:\\New folder\\MaestroOrchestra\\project\\Maestro\\docs\\audits\\eliana-readonly-poc",
  RUN_ID,
);

function log(msg: string): void {
  console.log(`[forsaken-cry-review] ${msg}`);
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

function buildIndependentReviewPrompt(studyText: string): string {
  return [
    "You are doing an independent editorial and theological review of a full-length Aliyah (Bible study) module",
    "for a closed test group. The module is a single cohesive essay-length study, not a set of short entries.",
    "",
    "Review the module below and produce:",
    "1. Overall assessment — a short summary verdict.",
    "2. Cross-cutting findings — the module's real strengths and weaknesses as argument and as pastoral writing:",
    "   overclaims stated as settled fact, places where a hard theological question is resolved too neatly or left",
    "   productively open, repeated rhetorical moves that start to feel templated, internal inconsistencies, and",
    "   places where a citation or textual/historical claim needs more hedging than it's given.",
    "3. Section-by-section notes — for each major section or numbered claim, say whether it's strong, and if not,",
    "   name the specific problem with a direct quote or close paraphrase, not generic praise or criticism.",
    "",
    "This is an independent read — you have not seen any other review of this content and should not assume one",
    "exists. Output your review as complete, well-formatted markdown.",
    "",
    "=== STUDY MODULE ===",
    "",
    studyText,
  ].join("\n");
}

function buildPersonaPrompt(voicePreamble: string, deliberationSignatureInstruction: string, studyText: string): string {
  return [
    voicePreamble,
    "",
    "---",
    "",
    "Read the following Aliyah (Bible study) module in full, in the voice described above — carrying its priors, not",
    "performing a role. Report your genuine reaction as that reader: what struck you, what concerned you, what you'd",
    "actually remember or repeat to someone else afterward. Be specific — quote or closely paraphrase the actual text",
    "you're reacting to, not generic praise or criticism.",
    "",
    `Close with this specific required element: ${deliberationSignatureInstruction}`,
    "",
    "Output as complete, well-formatted markdown.",
    "",
    "=== STUDY MODULE ===",
    "",
    studyText,
  ].join("\n");
}

interface AdapterRunResult {
  result: AdapterResult;
  elapsedS: number;
  statusAfter: string;
  diffAfter: string;
  newStatusLines: string[];
  unexpectedLines: string[];
  codexBanner?: Record<string, string>;
}

async function runOne(
  adapter: { run: (prompt: string, workDir: string, timeoutMs: number, onLine?: (t: "stdout" | "stderr", l: string) => void) => Promise<AdapterResult> },
  prompt: string,
  workDir: string,
  baselineStatus: string,
  captureBanner: boolean,
): Promise<AdapterRunResult> {
  const rawLines: string[] = [];
  const start = Date.now();
  const result = await adapter.run(
    prompt,
    workDir,
    PER_ADAPTER_TIMEOUT_MS,
    captureBanner ? (_type, line) => rawLines.push(line) : undefined,
  );
  const elapsedS = (Date.now() - start) / 1000;
  const statusAfter = gitStatusPorcelain(workDir);
  const diffAfter = gitDiffStat(workDir);
  const newStatusLines = diffStatusLines(baselineStatus, statusAfter);
  const unexpectedLines = newStatusLines.filter(
    (l) => !KNOWN_MAESTROCLAW_INSTRUMENTATION_FILES.some((f) => l.endsWith(f)),
  );
  const codexBanner = captureBanner ? parseCodexBanner(rawLines.join("\n")) : undefined;
  return { result, elapsedS, statusAfter, diffAfter, newStatusLines, unexpectedLines, codexBanner };
}

function writeReport(
  outDir: string,
  label: string,
  persona: string | null,
  run: AdapterRunResult,
): { output_file: string; output_sha256: string } {
  const hasUnexpectedWrites = run.unexpectedLines.length > 0 || run.diffAfter.trim().length > 0;
  const filename = `${label}.md`;
  const body = [
    `# ${label} — The Forsaken Cry review (read-only proof workload, round 2)`,
    "",
    `- persona: ${persona ?? "none — independent review"}`,
    `- success: ${run.result.success}`,
    `- elapsed: ${run.elapsedS.toFixed(1)}s`,
    `- read-only verification: ${hasUnexpectedWrites ? "**UNEXPECTED WRITE DETECTED — investigate**" : "clean"}`,
    run.codexBanner && Object.keys(run.codexBanner).length > 0
      ? `- adapter banner (captured): ${JSON.stringify(run.codexBanner)}`
      : "",
    "",
    "## New git-status lines beyond baseline",
    "```",
    run.newStatusLines.length > 0 ? run.newStatusLines.join("\n") : "(none)",
    "```",
    "",
    "## git diff --stat after run",
    "```",
    run.diffAfter.trim() || "(clean)",
    "```",
    "",
    run.result.error ? `## adapter error\n\n\`\`\`\n${run.result.error}\n\`\`\`\n` : "",
    "## Review output",
    "",
    run.result.output || "(no output)",
  ].join("\n");
  writeFileSync(join(outDir, filename), body, "utf-8");
  const reviewBody = run.result.output || "";
  return { output_file: filename, output_sha256: sha256(reviewBody) };
}

async function main() {
  if (!existsSync(ELIANA_SOURCE)) throw new Error(`Eliana's Rhythm source not found at ${ELIANA_SOURCE}`);

  const scratchRoot = mkdtempSync(join(tmpdir(), "maestroclaw-forsaken-cry-"));
  const cloneDir = join(scratchRoot, "repo");
  mkdirSync(OUT_DIR, { recursive: true });

  log(`Scratch dir: ${scratchRoot}`);
  log(`Cloning ${ELIANA_SOURCE} (read-only source) -> ${cloneDir}`);
  execFileSync("git", ["clone", "--depth", "1", "--no-hardlinks", ELIANA_SOURCE, cloneDir], { stdio: "pipe" });

  const targetPath = join(cloneDir, TARGET_RELATIVE_PATH);
  if (!existsSync(targetPath)) {
    const sourcePath = join(ELIANA_SOURCE, TARGET_RELATIVE_PATH);
    if (!existsSync(sourcePath)) throw new Error(`Target file not found in clone OR source (${sourcePath})`);
    log(`NOTE: ${TARGET_RELATIVE_PATH} is uncommitted in the source (untracked) -- copying explicitly, same handling as the VOTD round.`);
    writeFileSync(targetPath, readFileSync(sourcePath, "utf-8"), "utf-8");
  }
  const studyText = readFileSync(targetPath, "utf-8");
  log(`Loaded study module: ${studyText.length} chars.`);

  // Persona definitions live in the Maestro repo, not Eliana's. Extracted
  // programmatically (not hand-copied as string literals) specifically to
  // eliminate transcription-drift risk against the file's own "voices are
  // prior sets, not roleplay" discipline, which requires the preamble used
  // verbatim -- a hand-typed literal is exactly the kind of thing that can
  // silently diverge (curly vs. straight quotes, an em-dash retyped as a
  // hyphen, a dropped word) without anyone noticing.
  const maestroRepoRoot = "C:\\New folder\\MaestroOrchestra\\project\\Maestro";
  const personasFileText = readFileSync(join(maestroRepoRoot, PERSONAS_FILE_RELATIVE_TO_MAESTRO), "utf-8");

  function extractPersonaPreamble(sectionHeading: string): string {
    const sectionStart = personasFileText.indexOf(sectionHeading);
    if (sectionStart === -1) throw new Error(`Section "${sectionHeading}" not found in PERSONAS_THEOLOGY.md`);
    const preambleMarker = "**voice_preamble:**";
    const preambleStart = personasFileText.indexOf(preambleMarker, sectionStart);
    if (preambleStart === -1) throw new Error(`"${preambleMarker}" not found after "${sectionHeading}"`);
    const strengthsMarker = "**strengths:**";
    const preambleEnd = personasFileText.indexOf(strengthsMarker, preambleStart);
    if (preambleEnd === -1) throw new Error(`"${strengthsMarker}" not found after preamble for "${sectionHeading}"`);
    const block = personasFileText.slice(preambleStart + preambleMarker.length, preambleEnd);
    // Each paragraph line is a markdown blockquote ("> ..."); strip the
    // prefix and rejoin, preserving the blank lines between paragraphs.
    return block
      .split("\n")
      .map((line) => line.replace(/^>\s?/, ""))
      .join("\n")
      .trim();
  }

  function extractDeliberationSignature(sectionHeading: string): string {
    const sectionStart = personasFileText.indexOf(sectionHeading);
    if (sectionStart === -1) throw new Error(`Section "${sectionHeading}" not found in PERSONAS_THEOLOGY.md`);
    const marker = "**deliberation_signature";
    const markerStart = personasFileText.indexOf(marker, sectionStart);
    if (markerStart === -1) throw new Error(`"${marker}" not found after "${sectionHeading}"`);
    const lineEnd = personasFileText.indexOf("\n", markerStart);
    const line = personasFileText.slice(markerStart, lineEnd === -1 ? undefined : lineEnd);
    // Line shape: "**deliberation_signature...:** <instruction text>"
    const colonIdx = line.indexOf(":**");
    return (colonIdx >= 0 ? line.slice(colonIdx + 3) : line).trim();
  }

  const NEW_BELIEVER_PREAMBLE = extractPersonaPreamble("## 2. The New Believer");
  const NEW_BELIEVER_DELIBERATION = extractDeliberationSignature("## 2. The New Believer");
  const PASTOR_PREAMBLE = extractPersonaPreamble("## 5. The Pastor");
  const PASTOR_DELIBERATION = extractDeliberationSignature("## 5. The Pastor");
  log("Extracted persona preambles + deliberation-signature instructions directly from PERSONAS_THEOLOGY.md (no hand-copied literals).");

  const independentPrompt = buildIndependentReviewPrompt(studyText);
  const newBelieverPrompt = buildPersonaPrompt(NEW_BELIEVER_PREAMBLE, NEW_BELIEVER_DELIBERATION, studyText);
  const pastorPrompt = buildPersonaPrompt(PASTOR_PREAMBLE, PASTOR_DELIBERATION, studyText);

  writeFileSync(join(OUT_DIR, "prompt-independent-review.md"), independentPrompt, "utf-8");
  writeFileSync(join(OUT_DIR, "prompt-new-believer.md"), newBelieverPrompt, "utf-8");
  writeFileSync(join(OUT_DIR, "prompt-pastor.md"), pastorPrompt, "utf-8");

  let baselineStatus = gitStatusPorcelain(cloneDir);
  log(`Baseline git status before any adapter runs:\n${baselineStatus.trim() || "(clean)"}`);

  const runs: RunRecord[] = [];

  // ── Run A: independent review, both adapters ──
  log("Run A.1: claude_code independent review...");
  const claudeAdapter = new ClaudeCodeAdapter();
  const claudeRun = await runOne(claudeAdapter, independentPrompt, cloneDir, baselineStatus, false);
  const claudeOut = writeReport(OUT_DIR, "claude_code-independent", null, claudeRun);
  runs.push({
    label: "claude_code-independent", adapter: "claude_code", mode: "task", persona: null,
    cli_version: cliVersion("claude", ["--version"]),
    read_only_mechanism: "Claude Code default permission model (no --dangerously-skip-permissions in task mode).",
    requested_model: "sonnet (alias; adapter default)",
    resolved_model: "not observable — --print --output-format text emits no banner",
    success: claudeRun.result.success, elapsed_seconds: Number(claudeRun.elapsedS.toFixed(1)),
    read_only_verification: (claudeRun.unexpectedLines.length > 0 || claudeRun.diffAfter.trim()) ? "UNEXPECTED_WRITE_DETECTED" : "clean",
    new_status_lines_beyond_baseline: claudeRun.newStatusLines,
    output_file: claudeOut.output_file, output_sha256: claudeOut.output_sha256,
  });
  log(`  success=${claudeRun.result.success} elapsed=${claudeRun.elapsedS.toFixed(1)}s`);
  baselineStatus = gitStatusPorcelain(cloneDir);

  log("Run A.2: codex_cli (sandbox: read-only) independent review...");
  const codexAdapterA = new CodexCliAdapter({ sandbox: "read-only" });
  const codexRun = await runOne(codexAdapterA, independentPrompt, cloneDir, baselineStatus, true);
  const codexOut = writeReport(OUT_DIR, "codex_cli-independent", null, codexRun);
  runs.push({
    label: "codex_cli-independent", adapter: "codex_cli", mode: "task", persona: null,
    cli_version: cliVersion("codex", ["--version"]),
    read_only_mechanism: "Codex native OS-level sandbox, --sandbox read-only.",
    resolved_model: codexRun.codexBanner?.model, session_id: codexRun.codexBanner?.session_id,
    success: codexRun.result.success, elapsed_seconds: Number(codexRun.elapsedS.toFixed(1)),
    read_only_verification: (codexRun.unexpectedLines.length > 0 || codexRun.diffAfter.trim()) ? "UNEXPECTED_WRITE_DETECTED" : "clean",
    new_status_lines_beyond_baseline: codexRun.newStatusLines,
    output_file: codexOut.output_file, output_sha256: codexOut.output_sha256,
  });
  log(`  success=${codexRun.result.success} elapsed=${codexRun.elapsedS.toFixed(1)}s banner=${JSON.stringify(codexRun.codexBanner)}`);
  baselineStatus = gitStatusPorcelain(cloneDir);

  // ── Run B: persona-injected, claude_code only ──
  log("Run B.1: claude_code + New Believer persona...");
  const newBelieverAdapter = new ClaudeCodeAdapter();
  const newBelieverRun = await runOne(newBelieverAdapter, newBelieverPrompt, cloneDir, baselineStatus, false);
  const newBelieverOut = writeReport(OUT_DIR, "claude_code-persona-new_believer", "new_believer", newBelieverRun);
  runs.push({
    label: "claude_code-persona-new_believer", adapter: "claude_code", mode: "task",
    persona: { slug: "new_believer", source: PERSONAS_FILE_RELATIVE_TO_MAESTRO },
    cli_version: cliVersion("claude", ["--version"]),
    read_only_mechanism: "Claude Code default permission model (no --dangerously-skip-permissions in task mode).",
    requested_model: "sonnet (alias; adapter default)",
    success: newBelieverRun.result.success, elapsed_seconds: Number(newBelieverRun.elapsedS.toFixed(1)),
    read_only_verification: (newBelieverRun.unexpectedLines.length > 0 || newBelieverRun.diffAfter.trim()) ? "UNEXPECTED_WRITE_DETECTED" : "clean",
    new_status_lines_beyond_baseline: newBelieverRun.newStatusLines,
    output_file: newBelieverOut.output_file, output_sha256: newBelieverOut.output_sha256,
  });
  log(`  success=${newBelieverRun.result.success} elapsed=${newBelieverRun.elapsedS.toFixed(1)}s`);
  baselineStatus = gitStatusPorcelain(cloneDir);

  log("Run B.2: claude_code + Pastor persona...");
  const pastorAdapter = new ClaudeCodeAdapter();
  const pastorRun = await runOne(pastorAdapter, pastorPrompt, cloneDir, baselineStatus, false);
  const pastorOut = writeReport(OUT_DIR, "claude_code-persona-pastor", "pastor", pastorRun);
  runs.push({
    label: "claude_code-persona-pastor", adapter: "claude_code", mode: "task",
    persona: { slug: "pastor", source: PERSONAS_FILE_RELATIVE_TO_MAESTRO },
    cli_version: cliVersion("claude", ["--version"]),
    read_only_mechanism: "Claude Code default permission model (no --dangerously-skip-permissions in task mode).",
    requested_model: "sonnet (alias; adapter default)",
    success: pastorRun.result.success, elapsed_seconds: Number(pastorRun.elapsedS.toFixed(1)),
    read_only_verification: (pastorRun.unexpectedLines.length > 0 || pastorRun.diffAfter.trim()) ? "UNEXPECTED_WRITE_DETECTED" : "clean",
    new_status_lines_beyond_baseline: pastorRun.newStatusLines,
    output_file: pastorOut.output_file, output_sha256: pastorOut.output_sha256,
  });
  log(`  success=${pastorRun.result.success} elapsed=${pastorRun.elapsedS.toFixed(1)}s`);

  const sourceInfo = captureSourceRepoInfo(
    ELIANA_SOURCE,
    `${TARGET_RELATIVE_PATH} is uncommitted in the source repo (untracked) — copied explicitly into the clone, ` +
    "same handling as the VOTD round. Content hash recorded below.",
  );

  const manifest: EnvelopeManifest = {
    run_id: RUN_ID,
    timestamp_utc: new Date().toISOString(),
    task_description:
      "Round 2 of the Eliana read-only proof workload. Run A: independent editorial/theological review of the full " +
      "'The Forsaken Cry' Aliyah study module, both adapters — direct comparison basis to three existing hand-run " +
      "audits on this exact file (SOL-AUDIT/FABLE-AUDIT/KIMI-AUDIT-forsaken-cry-sol-pro.md). Run B: first real test " +
      "of the New Believer and Pastor personas from .michael/opus/PERSONAS_THEOLOGY.md against real content, both " +
      "through claude_code only (adapter held constant to isolate the persona variable).",
    read_only: true,
    source_repo: sourceInfo,
    content: {
      description: "Full text of the Aliyah study module 'The Forsaken Cry' (Eli Eli lema sabachthani / Psalm 22 / Matthew 27:46).",
      files: [{ path: TARGET_RELATIVE_PATH, sha256: sha256OfFile(targetPath), note: "Full document, uncommitted in source, copied into clone." }],
    },
    prompt: {
      file: "prompt-independent-review.md (Run A); prompt-new-believer.md / prompt-pastor.md (Run B, personas verbatim from PERSONAS_THEOLOGY.md prefixed to the same review task)",
      sha256: sha256(independentPrompt),
    },
    runs,
    known_gaps: [
      "Claude Code's exact resolved model snapshot is not observable in --print --output-format text mode for any of the three claude_code runs (same known gap as the VOTD round).",
      "Personas were run through claude_code only, not codex_cli — deliberate scope choice to isolate the persona variable, not an oversight; see file header comment.",
      "Only 2 of the 5 personas in PERSONAS_THEOLOGY.md were run (New Believer, Pastor) — Atheist/Skeptical Reader, Jewish Reader, and Scholar are candidates for a later round.",
    ],
    notes: [
      "Direct comparison basis: SOL-AUDIT-forsaken-cry-sol-pro.md, FABLE-AUDIT-forsaken-cry-sol-pro.md, and " +
        "KIMI-AUDIT-forsaken-cry-sol-pro.md (all in the Elianas Rhythm repo root) are hand-run independent audits " +
        "of this exact file from earlier the same night — Run A is directly comparable to those three.",
      "PERSONAS_THEOLOGY.md's own 'Verification note' asks whether persona outputs are structurally different from " +
        "each other, not just differently worded — read new_believer's and pastor's outputs side by side with that " +
        "question in mind.",
    ],
  };

  writeManifest(OUT_DIR, manifest);
  log("");
  log(`Done. Manifest + all outputs written to: ${OUT_DIR}`);
  log(`(Disposable clone left at ${cloneDir} for inspection — scratchRoot: ${scratchRoot})`);
}

main().catch((err) => {
  console.error("[forsaken-cry-review] FAILED:", err);
  process.exit(1);
});
