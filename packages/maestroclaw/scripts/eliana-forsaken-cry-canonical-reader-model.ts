#!/usr/bin/env -S npx tsx
/**
 * MaestroClaw read-only proof workload — Forsaken Cry round, addendum run 2:
 * same Christian Canonical Reader persona, same document, explicit model
 * override — testing whether the persona's output is shaped by the
 * underlying model/wrapper or stays consistent across them.
 *
 * Michael has been tracking this question all night across the manual
 * council process; this applies it to the newest persona specifically,
 * through the actual MaestroClaw adapter pipeline (not a side channel) via
 * explicit CLAW_CLAUDE_MODEL / CLAW_CODEX_MODEL overrides — which also
 * closes the "resolved model not observable" gap flagged in earlier
 * manifests for the sonnet-alias default runs, since these are now explicit
 * requested values, not an ambiguous default.
 *
 * Deliberately two separate process invocations, not one script switching
 * models mid-run: both adapters read their model env var ONCE, at module
 * load time, into a top-level constant (see PRIMARY_MODEL in
 * claude-code.ts/codex-cli.ts) — that's a correct design for a real
 * long-running worker process (one worker, one configured model), but it
 * means the only clean way to get two different models through the same
 * adapter class in this harness is two separate `tsx` invocations with
 * different environments, which is also the most faithful simulation of
 * "how would you actually configure a MaestroClaw worker for this."
 *
 * Usage:
 *   cd packages/maestroclaw
 *   CLAW_CLAUDE_MODEL=claude-fable-5 npx tsx scripts/eliana-forsaken-cry-canonical-reader-model.ts claude_code fable
 *   CLAW_CODEX_MODEL=gpt-5.6-sol     npx tsx scripts/eliana-forsaken-cry-canonical-reader-model.ts codex_cli sol
 *
 * Read-only guarantees and verification method: identical to the earlier
 * Forsaken Cry runs — see eliana-forsaken-cry-canonical-reader.ts's header.
 */

import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeCodeAdapter } from "../src/adapters/claude-code.js";
import { CodexCliAdapter } from "../src/adapters/codex-cli.js";
import { extractPersonaPreamble, extractDeliberationSignature, buildPersonaPrompt } from "./lib/eliana-personas.js";
import {
  sha256, cliVersion, parseCodexBanner, writeManifest, type EnvelopeManifest, type RunRecord,
} from "./lib/eliana-manifest.js";
import type { AdapterResult } from "../src/adapters/types.js";

const ELIANA_SOURCE = "C:\\New folder\\Elianas RhythmMigrate\\Elianas Rhythm";
const TARGET_RELATIVE_PATH = "ALIYAH-ASCENT-DRAFT-the-forsaken-cry-sol-pro.md";
const PERSONAS_FILE_RELATIVE_TO_MAESTRO = ".michael/opus/PERSONAS_THEOLOGY.md";
const MAESTRO_REPO_ROOT = "C:\\New folder\\MaestroOrchestra\\project\\Maestro";
const PER_ADAPTER_TIMEOUT_MS = 8 * 60 * 1000;
const RUN_DIR = join(MAESTRO_REPO_ROOT, "docs\\audits\\eliana-readonly-poc\\2026-08-17-forsaken-cry");

const adapterChoice = process.argv[2];
const label = process.argv[3];
if (adapterChoice !== "claude_code" && adapterChoice !== "codex_cli") {
  console.error(`Usage: tsx eliana-forsaken-cry-canonical-reader-model.ts <claude_code|codex_cli> <label>`);
  process.exit(1);
}
if (!label) {
  console.error(`Missing <label> argument (e.g. "fable" or "sol") — used in the output filename and manifest.`);
  process.exit(1);
}

function log(msg: string): void {
  console.log(`[forsaken-cry-canonical-reader-model:${label}] ${msg}`);
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
  if (!existsSync(RUN_DIR)) throw new Error(`Expected the original Forsaken Cry run directory to already exist: ${RUN_DIR}`);
  const manifestPath = join(RUN_DIR, "manifest.json");
  if (!existsSync(manifestPath)) throw new Error(`Expected existing manifest.json at ${manifestPath} — this run appends to it.`);

  const scratchRoot = mkdtempSync(join(tmpdir(), `maestroclaw-forsaken-cry-canonical-${label}-`));
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
  writeFileSync(join(RUN_DIR, `prompt-christian-canonical-reader-${label}.md`), prompt, "utf-8");

  const baselineStatus = gitStatusPorcelain(cloneDir);
  log(`Baseline git status before adapter run:\n${baselineStatus.trim() || "(clean)"}`);

  const rawLines: string[] = [];
  let result: AdapterResult;
  let readOnlyMechanism: string;
  let requestedModel: string | undefined;
  let resolvedModel: string | undefined;
  let sessionId: string | undefined;
  let cliVersionStr: string;

  const start = Date.now();
  if (adapterChoice === "claude_code") {
    requestedModel = process.env.CLAW_CLAUDE_MODEL;
    if (!requestedModel) throw new Error("CLAW_CLAUDE_MODEL must be set in the environment for this run.");
    log(`Running claude_code + Christian Canonical Reader persona (CLAW_CLAUDE_MODEL=${requestedModel})...`);
    const adapter = new ClaudeCodeAdapter();
    result = await adapter.run(prompt, cloneDir, PER_ADAPTER_TIMEOUT_MS);
    readOnlyMechanism = "Claude Code default permission model (no --dangerously-skip-permissions in task mode).";
    resolvedModel = "not observable — --print --output-format text emits no banner/metadata (same known gap as prior claude_code runs)";
    cliVersionStr = cliVersion("claude", ["--version"]);
  } else {
    requestedModel = process.env.CLAW_CODEX_MODEL;
    if (!requestedModel) throw new Error("CLAW_CODEX_MODEL must be set in the environment for this run.");
    log(`Running codex_cli (sandbox: read-only) + Christian Canonical Reader persona (CLAW_CODEX_MODEL=${requestedModel})...`);
    const adapter = new CodexCliAdapter({ sandbox: "read-only" });
    result = await adapter.run(prompt, cloneDir, PER_ADAPTER_TIMEOUT_MS, (_type, line) => rawLines.push(line));
    readOnlyMechanism = "Codex native OS-level sandbox, --sandbox read-only.";
    const banner = parseCodexBanner(rawLines.join("\n"));
    resolvedModel = banner.model;
    sessionId = banner.session_id;
    cliVersionStr = cliVersion("codex", ["--version"]);
  }
  const elapsedS = (Date.now() - start) / 1000;

  const statusAfter = gitStatusPorcelain(cloneDir);
  const diffAfter = gitDiffStat(cloneDir);
  const newStatusLines = diffStatusLines(baselineStatus, statusAfter);
  const unexpectedLines = newStatusLines.filter(
    (l) => !KNOWN_MAESTROCLAW_INSTRUMENTATION_FILES.some((f) => l.endsWith(f)),
  );
  const hasUnexpectedWrites = unexpectedLines.length > 0 || diffAfter.trim().length > 0;

  log(`success=${result.success} elapsed=${elapsedS.toFixed(1)}s resolved_model=${resolvedModel ?? "(n/a)"}`);
  log(`read-only check — new status lines beyond baseline: ${newStatusLines.length} (${unexpectedLines.length} unexpected); tracked-file diff: ${diffAfter.trim() ? "NON-EMPTY" : "clean"}`);
  if (hasUnexpectedWrites) log("!!! UNEXPECTED WRITE DETECTED — investigate before trusting this run as read-only !!!");
  if (!result.success) {
    log(`!!! ADAPTER RUN DID NOT SUCCEED — error: ${result.error ?? "(no error message)"}`);
  }

  const outputFilename = `${adapterChoice}-persona-christian_canonical_reader-${label}.md`;
  const reportBody = [
    `# ${adapterChoice}-persona-christian_canonical_reader-${label} — The Forsaken Cry review (model/wrapper consistency test)`,
    "",
    "- persona: christian_canonical_reader",
    `- requested model: ${requestedModel}`,
    resolvedModel ? `- resolved/observed model: ${resolvedModel}` : "",
    sessionId ? `- session id: ${sessionId}` : "",
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
  ].filter(Boolean).join("\n");
  writeFileSync(join(RUN_DIR, outputFilename), reportBody, "utf-8");

  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as EnvelopeManifest;
  const newRun: RunRecord = {
    label: `${adapterChoice}-persona-christian_canonical_reader-${label}`,
    adapter: adapterChoice,
    mode: "task",
    persona: { slug: "christian_canonical_reader", source: PERSONAS_FILE_RELATIVE_TO_MAESTRO },
    cli_version: cliVersionStr,
    read_only_mechanism: readOnlyMechanism,
    requested_model: requestedModel,
    resolved_model: resolvedModel,
    ...(sessionId ? { session_id: sessionId } : {}),
    success: result.success,
    elapsed_seconds: Number(elapsedS.toFixed(1)),
    read_only_verification: hasUnexpectedWrites ? "UNEXPECTED_WRITE_DETECTED" : "clean",
    new_status_lines_beyond_baseline: newStatusLines,
    output_file: outputFilename,
    output_sha256: sha256(result.output || ""),
  };
  // Replace an existing run with the same label rather than duplicating it
  // — re-running the same (adapter, label) pair (e.g. retrying after fixing
  // a config/profile issue) should overwrite that run's manifest entry, not
  // leave a stale failed record sitting alongside the corrected one.
  const existingIdx = manifest.runs.findIndex((r) => r.label === newRun.label);
  if (existingIdx >= 0) {
    log(`Replacing existing manifest entry for label "${newRun.label}" (was: success=${manifest.runs[existingIdx].success}).`);
    manifest.runs[existingIdx] = newRun;
  } else {
    manifest.runs.push(newRun);
  }
  writeManifest(RUN_DIR, manifest);

  log("");
  log(`Done. Output + updated manifest written to: ${RUN_DIR}`);
  log(`New output file: ${join(RUN_DIR, outputFilename)}`);
}

main().catch((err) => {
  console.error(`[forsaken-cry-canonical-reader-model:${label}] FAILED:`, err);
  process.exit(1);
});
