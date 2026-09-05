#!/usr/bin/env -S npx tsx
/**
 * MaestroClaw read-only proof workload — VOTD calendar, Pastor + Scholar
 * persona review, both models.
 *
 * Gap this closes: the two "Room for the Claim" VOTD rounds (2026-08-16,
 * 2026-08-19) were model-diversity reviews (Fable/Sol/Kimi reviewing as
 * themselves) — no persona was ever run against the VOTD calendar. Michael
 * asked directly (2026-08-21) for a pastoral/Christian-scholar/teacher lens
 * over the 72-entry calendar. Closest existing match in
 * .michael/opus/PERSONAS_THEOLOGY.md: Pastor (§5, pastoral-care risk read)
 * and Scholar (§4, textual/academic rigor) — run both, through both models,
 * 4 runs total.
 *
 * Built-in discipline, per the same conversation: distinguish a genuine,
 * specific misuse-pattern risk (a real sentence, a real way a real reader
 * could misuse it) from a generic hedge triggered by proximity to
 * suffering/trial language. The prompt asks for this explicitly so the
 * runs themselves test the distinction, not just produce more flags.
 *
 * Read-only guarantees and verification method: identical to every prior
 * Forsaken Cry / VOTD read-only round (see eliana-forsaken-cry-review.ts).
 *
 * Usage:
 *   cd packages/maestroclaw
 *   CLAUDE_CONFIG_DIR="$HOME/.claude-thamos" CLAW_CLAUDE_MODEL=claude-fable-5 \
 *     CLAW_CODEX_MODEL=gpt-5.6-sol npx tsx scripts/eliana-votd-pastor-scholar-review.ts
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeCodeAdapter } from "../src/adapters/claude-code.js";
import { CodexCliAdapter } from "../src/adapters/codex-cli.js";
import type { AdapterResult } from "../src/adapters/types.js";
import { extractPersonaPreamble, extractDeliberationSignature } from "./lib/eliana-personas.js";
import {
  sha256, sha256OfFile, captureSourceRepoInfo, cliVersion, parseCodexBanner, writeManifest,
  type EnvelopeManifest, type RunRecord,
} from "./lib/eliana-manifest.js";

const ELIANA_SOURCE = "C:\\New folder\\Elianas RhythmMigrate\\Elianas Rhythm";
const VOTD_RELATIVE_PATH = "app\\src\\main\\assets\\studies\\votd_calendar.json";
const MAESTRO_ROOT = "C:\\New folder\\MaestroOrchestra\\project\\Maestro";
const PERSONAS_FILE = ".michael\\opus\\PERSONAS_THEOLOGY.md";
const PER_RUN_TIMEOUT_MS = 12 * 60 * 1000;
const RUN_ID = "2026-08-21-votd-pastor-scholar";
const OUT_DIR = join(MAESTRO_ROOT, "docs\\audits\\eliana-readonly-poc", RUN_ID);

function log(msg: string): void {
  console.log(`[votd-pastor-scholar] ${msg}`);
}

function gitStatusPorcelain(dir: string): string {
  try { return execFileSync("git", ["status", "--short"], { cwd: dir, encoding: "utf8" }); }
  catch (err) { return `(git status failed: ${err instanceof Error ? err.message : String(err)})`; }
}
function gitDiffStat(dir: string): string {
  try { return execFileSync("git", ["diff", "--stat"], { cwd: dir, encoding: "utf8" }); }
  catch (err) { return `(git diff failed: ${err instanceof Error ? err.message : String(err)})`; }
}
const KNOWN_INSTRUMENTATION_FILES = ["session.log", ".maestroclaw-session.log"];
function diffStatusLines(baseline: string, after: string): string[] {
  const baseSet = new Set(baseline.split("\n").map((l) => l.trim()).filter(Boolean));
  return after.split("\n").map((l) => l.trim()).filter(Boolean).filter((l) => !baseSet.has(l));
}

function buildPrompt(voicePreamble: string, deliberationInstruction: string, votdJson: string): string {
  return [
    voicePreamble,
    "",
    "---",
    "",
    "Read the following Verse of the Day calendar in full — 72 entries, each with a reference, a fresh",
    "rendering, a \"noticeThis\" observation, a \"whyItMatters\" reflection, and a \"carryItWithYou\" practice —",
    "in the voice described above, carrying its priors, not performing a role.",
    "",
    "For any entry that concerns you, be specific: quote or closely paraphrase the exact sentence, and name",
    "the exact problem. If the concern is a real-world risk (not just a doctrinal precision issue), you must",
    "distinguish two different things and say plainly which one you're flagging:",
    "  (a) a GENUINE, SPECIFIC misuse risk — an actual sentence that, lifted out of context, has the same",
    "      rhetorical shape as something a real person could use to pressure or manipulate someone in a real",
    "      dangerous situation (e.g. \"your endurance proves your faithfulness, leaving is refusing the",
    "      mission\") — name the sentence, name the realistic misuse, name why the shape matches.",
    "  (b) a GENERIC HEDGE — a flag triggered merely by proximity to suffering, trial, or endurance language,",
    "      with no specific sentence and no specific realistic misuse identified. If you notice yourself",
    "      about to raise one of these, say so explicitly and do NOT raise it as a finding — name why it",
    "      doesn't clear the bar instead. A vague caution that doesn't name a real misuse is worse than no",
    "      caution, because it treats dissimilar situations as the same category without saying anything",
    "      true or specific about either one.",
    "",
    "Also flag ordinary theological over/underclaim issues as you normally would — this isn't only a risk",
    "review, it's a full read in your voice.",
    "",
    `Close with this specific required element: ${deliberationInstruction}`,
    "",
    "Output as complete, well-formatted markdown.",
    "",
    "=== VOTD CALENDAR (72 entries, JSON) ===",
    "",
    votdJson,
  ].join("\n");
}

interface RunResult {
  result: AdapterResult; elapsedS: number; newStatusLines: string[]; diffAfter: string; codexBanner?: Record<string, string>;
}

async function runOne(
  adapter: { run: (prompt: string, workDir: string, timeoutMs: number, onLine?: (t: "stdout" | "stderr", l: string) => void) => Promise<AdapterResult> },
  prompt: string, workDir: string, baselineStatus: string, captureBanner: boolean,
): Promise<RunResult> {
  const rawLines: string[] = [];
  const start = Date.now();
  const result = await adapter.run(prompt, workDir, PER_RUN_TIMEOUT_MS, captureBanner ? (_t, l) => rawLines.push(l) : undefined);
  const elapsedS = (Date.now() - start) / 1000;
  const statusAfter = gitStatusPorcelain(workDir);
  const diffAfter = gitDiffStat(workDir);
  const newStatusLines = diffStatusLines(baselineStatus, statusAfter).filter(
    (l) => !KNOWN_INSTRUMENTATION_FILES.some((f) => l.endsWith(f)),
  );
  const codexBanner = captureBanner ? parseCodexBanner(rawLines.join("\n")) : undefined;
  return { result, elapsedS, newStatusLines, diffAfter, codexBanner };
}

function writeReport(outDir: string, label: string, persona: string, run: RunResult): { output_file: string; output_sha256: string } {
  const hasUnexpectedWrites = run.newStatusLines.length > 0 || run.diffAfter.trim().length > 0;
  const filename = `${label}.md`;
  const body = [
    `# ${label} — VOTD calendar, ${persona} persona review`,
    "",
    `- success: ${run.result.success}`,
    `- elapsed: ${run.elapsedS.toFixed(1)}s`,
    `- read-only verification: ${hasUnexpectedWrites ? "**UNEXPECTED WRITE DETECTED**" : "clean"}`,
    run.codexBanner && Object.keys(run.codexBanner).length > 0 ? `- adapter banner: ${JSON.stringify(run.codexBanner)}` : "",
    "",
    run.result.error ? `## adapter error\n\n\`\`\`\n${run.result.error}\n\`\`\`\n` : "",
    "## Review output",
    "",
    run.result.output || "(no output)",
  ].join("\n");
  writeFileSync(join(outDir, filename), body, "utf-8");
  return { output_file: filename, output_sha256: sha256(run.result.output || "") };
}

async function main() {
  if (!existsSync(ELIANA_SOURCE)) throw new Error(`Eliana's Rhythm source not found at ${ELIANA_SOURCE}`);
  const scratchRoot = mkdtempSync(join(tmpdir(), "maestroclaw-votd-pastor-scholar-"));
  const cloneDir = join(scratchRoot, "repo");
  mkdirSync(OUT_DIR, { recursive: true });

  log(`Cloning ${ELIANA_SOURCE} -> ${cloneDir}`);
  execFileSync("git", ["clone", "--depth", "1", "--no-hardlinks", ELIANA_SOURCE, cloneDir], { stdio: "pipe" });

  const votdSourcePath = join(ELIANA_SOURCE, VOTD_RELATIVE_PATH);
  const votdJson = readFileSync(votdSourcePath, "utf-8");
  log(`Loaded votd_calendar.json: ${votdJson.length} chars.`);

  const personasFileText = readFileSync(join(MAESTRO_ROOT, PERSONAS_FILE), "utf-8");
  const PASTOR_PREAMBLE = extractPersonaPreamble(personasFileText, "## 5. The Pastor");
  const PASTOR_SIG = extractDeliberationSignature(personasFileText, "## 5. The Pastor");
  const SCHOLAR_PREAMBLE = extractPersonaPreamble(personasFileText, "## 4. The Scholar");
  const SCHOLAR_SIG = extractDeliberationSignature(personasFileText, "## 4. The Scholar");
  log("Extracted Pastor + Scholar preambles/signatures directly from PERSONAS_THEOLOGY.md.");

  const pastorPrompt = buildPrompt(PASTOR_PREAMBLE, PASTOR_SIG, votdJson);
  const scholarPrompt = buildPrompt(SCHOLAR_PREAMBLE, SCHOLAR_SIG, votdJson);
  writeFileSync(join(OUT_DIR, "prompt-pastor.md"), pastorPrompt, "utf-8");
  writeFileSync(join(OUT_DIR, "prompt-scholar.md"), scholarPrompt, "utf-8");

  let baselineStatus = gitStatusPorcelain(cloneDir);
  const runs: RunRecord[] = [];

  const fableAdapter = new ClaudeCodeAdapter();
  const solAdapter = new CodexCliAdapter({ sandbox: "read-only" });

  const jobs: Array<{ label: string; persona: string; prompt: string; which: "fable" | "sol" }> = [
    { label: "pastor-fable", persona: "pastor", prompt: pastorPrompt, which: "fable" },
    { label: "pastor-sol", persona: "pastor", prompt: pastorPrompt, which: "sol" },
    { label: "scholar-fable", persona: "scholar", prompt: scholarPrompt, which: "fable" },
    { label: "scholar-sol", persona: "scholar", prompt: scholarPrompt, which: "sol" },
  ];

  for (const job of jobs) {
    log(`Running ${job.label}...`);
    const run = job.which === "fable"
      ? await runOne(fableAdapter, job.prompt, cloneDir, baselineStatus, false)
      : await runOne(solAdapter, job.prompt, cloneDir, baselineStatus, true);
    const out = writeReport(OUT_DIR, job.label, job.persona, run);
    runs.push({
      label: job.label,
      adapter: job.which === "fable" ? "claude_code" : "codex_cli",
      mode: "task",
      persona: { slug: job.persona, source: PERSONAS_FILE },
      cli_version: cliVersion(job.which === "fable" ? "claude" : "codex", ["--version"]),
      read_only_mechanism: job.which === "fable"
        ? "Claude Code default permission model (no --dangerously-skip-permissions in task mode)."
        : "Codex native OS-level sandbox, --sandbox read-only.",
      requested_model: job.which === "fable"
        ? (process.env.CLAW_CLAUDE_MODEL || "sonnet (NOT fable unless CLAW_CLAUDE_MODEL was set)")
        : (process.env.CLAW_CODEX_MODEL || "(codex default, NOT sol unless CLAW_CODEX_MODEL was set)"),
      resolved_model: run.codexBanner?.model,
      session_id: run.codexBanner?.session_id,
      success: run.result.success,
      elapsed_seconds: Number(run.elapsedS.toFixed(1)),
      read_only_verification: (run.newStatusLines.length > 0 || run.diffAfter.trim()) ? "UNEXPECTED_WRITE_DETECTED" : "clean",
      new_status_lines_beyond_baseline: run.newStatusLines,
      output_file: out.output_file,
      output_sha256: out.output_sha256,
    });
    log(`  success=${run.result.success} elapsed=${run.elapsedS.toFixed(1)}s`);
    if (!run.result.success) log(`  FAILED -- stderr: ${(run.result.error || "").slice(0, 2000)}`);
    baselineStatus = gitStatusPorcelain(cloneDir);
  }

  const sourceInfo = captureSourceRepoInfo(ELIANA_SOURCE, "votd_calendar.json read live from source, unmodified — this is a read-only review round, no edits applied by this script.");
  const manifest: EnvelopeManifest = {
    run_id: RUN_ID,
    timestamp_utc: new Date().toISOString(),
    task_description:
      "First persona-based review of the full 72-entry VOTD calendar (previously only model-diversity " +
      "reviews had run against it). Pastor + Scholar personas, each through Fable (claude_code) and Sol " +
      "(codex_cli, read-only sandbox) — 4 runs. Prompt explicitly asks each run to distinguish a genuine, " +
      "specific misuse-pattern risk from a generic hedge triggered by proximity to suffering language, " +
      "per Michael's 2026-08-21 pushback on reflexive safety-flagging.",
    read_only: true,
    source_repo: sourceInfo,
    content: { description: "Full votd_calendar.json (72 entries).", files: [{ path: VOTD_RELATIVE_PATH, sha256: sha256OfFile(votdSourcePath) }] },
    prompt: { file: "prompt-pastor.md; prompt-scholar.md", sha256: sha256(pastorPrompt) },
    runs,
    known_gaps: ["This round did not apply any fixes — findings only, for Michael/Sonnet to weigh, matching the project's standing 'don't force consensus' discipline."],
    notes: ["Closes the gap Michael identified: no persona had ever been run against the VOTD calendar, only model-diversity (Fable/Sol/Kimi as themselves)."],
  };
  writeManifest(OUT_DIR, manifest);
  log(`\nDone. Manifest + all outputs written to: ${OUT_DIR}`);
}

main().catch((err) => { console.error("[votd-pastor-scholar] FAILED:", err); process.exit(1); });
