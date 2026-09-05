#!/usr/bin/env -S npx tsx
/**
 * MaestroClaw read-only proof workload — Forsaken Cry round, addendum:
 * outside-swarm cross-check against the council edition anchor.
 *
 * Michael ran a separate, independent tool (Kimi.ai's "Swarm" feature, K3
 * Swarm High mode) against this same passage — 8 named personas, each
 * verifying one specific claim, with live terminal/tool access (seen
 * fetching a real CCAT LXX Psalms variant file, NETS Psalm 21 text, and a
 * Göttingen apparatus for Psalm 21). He wants Fable (and, at Fable's or
 * Sol's discretion, Sol) to check whether anything the swarm surfaced should
 * revise `forsaken_cry.agent.final.md` — the current Chain №1 anchor text,
 * which Michael copy-pasted into the repo himself (not written there by any
 * Maestro session's own file-write action, so it carries no prior commitment
 * from either model).
 *
 * Methodology is deliberately left open, per Michael: "if he'd like to pull
 * personas and a council audit he can, or if he and sol simply want to check
 * it then they may." This script does not force a persona apparatus — it
 * hands Fable the material and the choice, then hands Sol the same material
 * plus Fable's response, so Sol can independently check Fable's conclusions
 * (and pick a different methodology himself if he disagrees with Fable's).
 *
 * Read-only guarantees and verification method: identical to every prior
 * Forsaken Cry run (see eliana-forsaken-cry-review.ts's header comment).
 *
 * Usage:
 *   cd packages/maestroclaw
 *   CLAUDE_CONFIG_DIR="$HOME/.claude-thamos" CLAW_CLAUDE_MODEL=claude-fable-5 \
 *     CLAW_CODEX_MODEL=gpt-5.6-sol npx tsx scripts/eliana-forsaken-cry-swarm-check.ts
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, copyFileSync } from "node:fs";
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
const ANCHOR_RELATIVE_PATH = "forsaken_cry.agent.final.md";
const SCREEN1_RELATIVE_PATH = "screen1.png";
const SCREEN2_RELATIVE_PATH = "screen2.png";
const PER_ADAPTER_TIMEOUT_MS = 10 * 60 * 1000;
const RUN_ID = "2026-08-21-swarm-check";
const OUT_DIR = join(
  "C:\\New folder\\MaestroOrchestra\\project\\Maestro\\docs\\audits\\eliana-readonly-poc",
  RUN_ID,
);

function log(msg: string): void {
  console.log(`[swarm-check] ${msg}`);
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

const SWARM_DESCRIPTION = `
Michael ran Kimi.ai's "Swarm" feature (K3 Swarm High mode) separately, outside Maestro, against
this exact passage (Mark 15:34 / Matthew 27:46 / Psalm 22, "Eli Eli lema sabachthani"). It is an
independent, external tool — not yours, not Sol's, not anything Maestro produced. It structures
its research the same way your own persona system does: named personas, each assigned one specific
claim to verify. From what Michael observed on screen, the personas and their assignments were:

- Mok — verify Greek lexical claims: aphiemi vs. egkataleip[o] (the Mark 14:50 / Mark 15:34 verb-choice question)
- Debussy — verify Hebrew lexical claims: azab, karat (severance-vocabulary claims)
- Winton — research remez / incipit-citation scholarship (the "quoting the first line invokes the whole psalm" claim)
- Rosalind — research the Elijah-confusion crux and how Jesus' contemporaries would have heard the cry
- Li Hua — verify the Psalm 22:16/17 textual issue (kaʾari / karu, the "pierced" vs. "lion" question)
- Joker — verify the Hebrews / Luke / John canonical network (cross-references between the four gospels and Hebrews)
- Quentin — verify the "darkness at noon" claim against Amos 8:9-10 and the Exodus plague parallel
- Lovel — research Jewish reception history and onomastics (naming) questions

The tool also showed live terminal/tool execution in a side panel: fetching an actual CCAT LXX
Psalms variant file, searching NETS Psalm 21 text, and downloading/parsing a Göttingen critical
apparatus for Psalm 21 — real primary-source retrieval, not simulated.

Two specific findings surfaced from that swarm's output, worth checking directly against the
anchor text below:
1. The LXX renders Psalm 22:22 (Eng.) / 22:22 (MT)'s ʿănîtānî not as "you answered me" but as
   tēn tapeinōsin mou, "my humiliation" — a complication for any argument built on the Hebrew
   ʿăzabtānî / ʿănîtānî sound-pairing, if that argument leans on the LXX rather than the MT.
2. Hebrews 5:7's "he was heard" (eisakoustheis) bridges to Psalm 22 at v. 24-25 (Eng.) / v. 25 (MT)
   — LXX 21:25's eisakouo — NOT at v. 21-22 (Eng.) / v. 22 (MT)'s ʿănîtānî. Different verse,
   different Greek verb; don't conflate the two bridges.
`.trim();

function buildFablePrompt(anchorText: string): string {
  return [
    "You're picking back up on the Forsaken Cry study for Michael's Eliana's Rhythm app.",
    "",
    "Status: the document below, `forsaken_cry.agent.final.md`, is the current anchor text for",
    "Chain №1 (\"Eli Eli lema sabachthani\" / Mark 15:34 / Matthew 27:46 / Psalm 22). Michael",
    "copy-pasted it into the repo himself -- it was not written there by your or Sol's own",
    "file-write action inside a prior Maestro session, so you carry no prior commitment to it.",
    "Treat it as the current best draft, fully open to revision.",
    "",
    "New material to check, described below (you do not have direct image access in this run --",
    "the description is Michael's own faithful account of what he saw on screen):",
    "",
    SWARM_DESCRIPTION,
    "",
    "Your call entirely on how to handle it -- Michael's own words: \"if he'd like to pull personas",
    "and a council audit he can, or if he and sol simply want to check it then they may.\" Options,",
    "your discretion:",
    "1. Pull your own personas and run a formal council-style audit against what the swarm claims,",
    "   the way you did for the shipped study and the second-edition draft.",
    "2. Or, if the claims are checkable enough directly, just verify/spot-check them yourself against",
    "   the kind of sources you already use (LXX text, MT, standard lexica/apparatus) -- no need for",
    "   the full formal apparatus if it isn't warranted here.",
    "",
    "Goal: decide whether anything the swarm surfaced should revise, strengthen, or correct the",
    "anchor text below. If something survives verification and changes the anchor, make the case",
    "and the specific edit. If nothing survives, say so and say why -- a null result is a legitimate",
    "result; don't manufacture a finding to justify the check. State plainly which of the two options",
    "above you chose and why, so Sol (who will see your response next) knows your method.",
    "",
    "=== ANCHOR TEXT (forsaken_cry.agent.final.md) ===",
    "",
    anchorText,
  ].join("\n");
}

function buildSolPrompt(anchorText: string, fableOutput: string): string {
  return [
    "You're picking back up on the Forsaken Cry study for Michael's Eliana's Rhythm app, alongside Fable.",
    "",
    "Status: `forsaken_cry.agent.final.md` (included below) is the current anchor text for Chain №1.",
    "Michael copy-pasted it into the repo himself -- not written there by either of your prior Maestro",
    "sessions -- so treat it as open to revision, not a locked artifact.",
    "",
    "New material Fable was just asked to check:",
    "",
    SWARM_DESCRIPTION,
    "",
    "Fable's response is included below. Michael's instruction covers you too: \"if he and sol simply",
    "want to check it then they may\" -- your discretion whether to accept Fable's methodology and",
    "conclusions, run your own independent check instead, or both. Say plainly whether you agree with",
    "Fable's verdict on each of the two flagged findings (the LXX humiliation reading, and the",
    "Hebrews 5:7 bridge verse), and whether anything should change in the anchor text beyond what",
    "Fable already proposed.",
    "",
    "=== FABLE'S RESPONSE ===",
    "",
    fableOutput,
    "",
    "=== ANCHOR TEXT (forsaken_cry.agent.final.md) ===",
    "",
    anchorText,
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
  run: AdapterRunResult,
): { output_file: string; output_sha256: string } {
  const hasUnexpectedWrites = run.unexpectedLines.length > 0 || run.diffAfter.trim().length > 0;
  const filename = `${label}.md`;
  const body = [
    `# ${label} — Forsaken Cry swarm cross-check`,
    "",
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
    run.result.error ? `## adapter error\n\n\`\`\`\n${run.result.error}\n\`\`\`\n` : "",
    "## Output",
    "",
    run.result.output || "(no output)",
  ].join("\n");
  writeFileSync(join(outDir, filename), body, "utf-8");
  return { output_file: filename, output_sha256: sha256(run.result.output || "") };
}

async function main() {
  if (!existsSync(ELIANA_SOURCE)) throw new Error(`Eliana's Rhythm source not found at ${ELIANA_SOURCE}`);

  const scratchRoot = mkdtempSync(join(tmpdir(), "maestroclaw-swarm-check-"));
  const cloneDir = join(scratchRoot, "repo");
  mkdirSync(OUT_DIR, { recursive: true });

  log(`Scratch dir: ${scratchRoot}`);
  log(`Cloning ${ELIANA_SOURCE} (read-only source) -> ${cloneDir}`);
  execFileSync("git", ["clone", "--depth", "1", "--no-hardlinks", ELIANA_SOURCE, cloneDir], { stdio: "pipe" });

  const anchorClonePath = join(cloneDir, ANCHOR_RELATIVE_PATH);
  const anchorSourcePath = join(ELIANA_SOURCE, ANCHOR_RELATIVE_PATH);
  if (!existsSync(anchorClonePath)) {
    if (!existsSync(anchorSourcePath)) throw new Error(`Anchor file not found in clone OR source (${anchorSourcePath})`);
    log(`NOTE: ${ANCHOR_RELATIVE_PATH} is uncommitted in the source (untracked) -- copying explicitly.`);
    writeFileSync(anchorClonePath, readFileSync(anchorSourcePath, "utf-8"), "utf-8");
  }
  for (const rel of [SCREEN1_RELATIVE_PATH, SCREEN2_RELATIVE_PATH]) {
    const src = join(ELIANA_SOURCE, rel);
    const dst = join(cloneDir, rel);
    if (existsSync(src) && !existsSync(dst)) {
      copyFileSync(src, dst);
      log(`Copied ${rel} into clone (available if either model wants to open it directly).`);
    }
  }
  const anchorText = readFileSync(anchorClonePath, "utf-8");
  log(`Loaded anchor text: ${anchorText.length} chars.`);

  let baselineStatus = gitStatusPorcelain(cloneDir);
  log(`Baseline git status before any adapter runs:\n${baselineStatus.trim() || "(clean)"}`);

  const runs: RunRecord[] = [];

  const fablePrompt = buildFablePrompt(anchorText);
  writeFileSync(join(OUT_DIR, "prompt-fable.md"), fablePrompt, "utf-8");
  log("Running Fable (claude_code, model claude-fable-5 expected via CLAW_CLAUDE_MODEL)...");
  const fableAdapter = new ClaudeCodeAdapter();
  const fableRun = await runOne(fableAdapter, fablePrompt, cloneDir, baselineStatus, false);
  const fableOut = writeReport(OUT_DIR, "fable-swarm-check", fableRun);
  runs.push({
    label: "fable-swarm-check", adapter: "claude_code", mode: "task", persona: null,
    cli_version: cliVersion("claude", ["--version"]),
    read_only_mechanism: "Claude Code default permission model (no --dangerously-skip-permissions in task mode).",
    requested_model: process.env.CLAW_CLAUDE_MODEL || "sonnet (alias; adapter default -- NOT fable unless CLAW_CLAUDE_MODEL was set)",
    resolved_model: "not observable — --print --output-format text emits no banner",
    success: fableRun.result.success, elapsed_seconds: Number(fableRun.elapsedS.toFixed(1)),
    read_only_verification: (fableRun.unexpectedLines.length > 0 || fableRun.diffAfter.trim()) ? "UNEXPECTED_WRITE_DETECTED" : "clean",
    new_status_lines_beyond_baseline: fableRun.newStatusLines,
    output_file: fableOut.output_file, output_sha256: fableOut.output_sha256,
  });
  log(`  success=${fableRun.result.success} elapsed=${fableRun.elapsedS.toFixed(1)}s`);
  if (!fableRun.result.success) {
    log(`  FABLE RUN FAILED -- stderr: ${(fableRun.result.error || "").slice(0, 2000)}`);
  }
  baselineStatus = gitStatusPorcelain(cloneDir);

  const fableOutputText = fableRun.result.output || "(Fable run produced no output -- see error above.)";
  const solPrompt = buildSolPrompt(anchorText, fableOutputText);
  writeFileSync(join(OUT_DIR, "prompt-sol.md"), solPrompt, "utf-8");
  log("Running Sol (codex_cli, read-only sandbox, model gpt-5.6-sol expected via CLAW_CODEX_MODEL)...");
  const solAdapter = new CodexCliAdapter({ sandbox: "read-only" });
  const solRun = await runOne(solAdapter, solPrompt, cloneDir, baselineStatus, true);
  const solOut = writeReport(OUT_DIR, "sol-swarm-check", solRun);
  runs.push({
    label: "sol-swarm-check", adapter: "codex_cli", mode: "task", persona: null,
    cli_version: cliVersion("codex", ["--version"]),
    read_only_mechanism: "Codex native OS-level sandbox, --sandbox read-only.",
    requested_model: process.env.CLAW_CODEX_MODEL || "(codex default -- NOT sol unless CLAW_CODEX_MODEL was set)",
    resolved_model: solRun.codexBanner?.model, session_id: solRun.codexBanner?.session_id,
    success: solRun.result.success, elapsed_seconds: Number(solRun.elapsedS.toFixed(1)),
    read_only_verification: (solRun.unexpectedLines.length > 0 || solRun.diffAfter.trim()) ? "UNEXPECTED_WRITE_DETECTED" : "clean",
    new_status_lines_beyond_baseline: solRun.newStatusLines,
    output_file: solOut.output_file, output_sha256: solOut.output_sha256,
  });
  log(`  success=${solRun.result.success} elapsed=${solRun.elapsedS.toFixed(1)}s banner=${JSON.stringify(solRun.codexBanner)}`);
  if (!solRun.result.success) {
    log(`  SOL RUN FAILED -- stderr: ${(solRun.result.error || "").slice(0, 2000)}`);
  }

  const sourceInfo = captureSourceRepoInfo(
    ELIANA_SOURCE,
    `${ANCHOR_RELATIVE_PATH} is uncommitted in the source repo (untracked) -- copied explicitly into the clone.`,
  );

  const manifest: EnvelopeManifest = {
    run_id: RUN_ID,
    timestamp_utc: new Date().toISOString(),
    task_description:
      "Cross-check of an external tool's findings (Kimi.ai Swarm, K3 Swarm High mode) against " +
      "forsaken_cry.agent.final.md, the current Chain №1 anchor text. Fable runs first with full " +
      "discretion over methodology (formal persona audit vs. direct spot-check); Sol runs second, " +
      "seeing both the material and Fable's response, free to agree, disagree, or choose a " +
      "different method himself.",
    read_only: true,
    source_repo: sourceInfo,
    content: {
      description: "forsaken_cry.agent.final.md (Chain №1 anchor) plus a text description of the Kimi swarm's presentation (no direct image access in this run).",
      files: [{ path: ANCHOR_RELATIVE_PATH, sha256: sha256OfFile(anchorClonePath), note: "Full document, uncommitted in source, copied into clone." }],
    },
    prompt: {
      file: "prompt-fable.md; prompt-sol.md (includes Fable's full response)",
      sha256: sha256(fablePrompt),
    },
    runs,
    known_gaps: [
      "Neither model was given direct image access to screen1.png/screen2.png in this run -- the swarm's findings were relayed as Michael's own text description, verified by him against the actual screenshots earlier in this session. The images were copied into the clone in case either model chose to open them, but the prompt does not depend on that.",
      "Sol sees Fable's output before responding (sequential, not independent) -- by design, since the task is explicitly Sol checking Fable's conclusions, not a blind replication test.",
    ],
    notes: [
      "This is a discretionary methodology run, not a fixed-format persona test -- both models were explicitly told the choice of formal audit vs. direct check was theirs.",
    ],
  };

  writeManifest(OUT_DIR, manifest);
  log("");
  log(`Done. Manifest + all outputs written to: ${OUT_DIR}`);
  log(`(Disposable clone left at ${cloneDir} for inspection -- scratchRoot: ${scratchRoot})`);
}

main().catch((err) => {
  console.error("[swarm-check] FAILED:", err);
  process.exit(1);
});
