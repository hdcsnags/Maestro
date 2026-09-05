#!/usr/bin/env -S npx tsx
/**
 * MaestroClaw read-only proof workload — VOTD calendar, risk-WEIGHTING pass.
 *
 * Follows eliana-votd-pastor-scholar-review.ts, which found 8 candidate
 * safety-risk flags across the 72-entry calendar (James 1:2 the one 4-for-4
 * convergence; Jonah 1:17 a reasoned 3-1 split; several others contested).
 * That pass answered "is this a genuine, specific misuse shape, or a generic
 * hedge" — a binary. Michael's explicit follow-up instruction (2026-08-21):
 * a binary isn't enough. Every flag needs an actual likelihood x impact
 * weighting against the REAL, INTENDED user base of this specific app — not
 * a worst-case-only posture, and not a "nothing bad could happen here"
 * posture either.
 *
 * This pass also folds in the second gap Michael raised in the same
 * conversation: does each flagged card, AND each proposed fix, actually
 * disciple a real committed-Christian reader with depth and conviction, or
 * does caution risk flattening it into something neutral/hedged that
 * undersells the app's own purpose. A "safety fix" that costs real depth
 * for a diffuse, low-probability worry is a bad trade; a free one-clause fix
 * against a real, specific, high-impact risk is not.
 *
 * Uses the Pastor persona only (not Scholar) — this specific reasoning task
 * (who actually reads this, in what state, with what support around them)
 * is pastoral judgment, not textual/lexical rigor.
 *
 * Read-only guarantees and verification method: identical to every prior
 * VOTD/Forsaken Cry read-only round.
 *
 * Usage:
 *   cd packages/maestroclaw
 *   CLAUDE_CONFIG_DIR="$HOME/.claude-thamos" CLAW_CLAUDE_MODEL=claude-fable-5 \
 *     CLAW_CODEX_MODEL=gpt-5.6-sol npx tsx scripts/eliana-votd-risk-weighting-pass.ts
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
const PER_RUN_TIMEOUT_MS = 10 * 60 * 1000;
const RUN_ID = "2026-08-21-votd-risk-weighting";
const OUT_DIR = join(MAESTRO_ROOT, "docs\\audits\\eliana-readonly-poc", RUN_ID);

const FLAGGED_CARDS = [
  "James 1:2", "Jonah 1:17", "1 Corinthians 13:4", "Genesis 50:20",
  "Micah 6:8", "Proverbs 3:5", "2 Corinthians 12:9", "Matthew 6:33",
];

const AUDIENCE_CONTEXT = `
Real, known facts about this app's actual audience — reason from these, don't invent a worse-case or
better-case audience than what's actually true:

- This is Eliana's Rhythm, a Christian spiritual-companion app (AI chat, Bible reader, meditation,
  journaling, prayer, voice) — not a crisis-intervention or mental-health app. Its stated purpose is
  discipleship and Bible study.
- It is about to ship to a CLOSED Play Store test track — meaning the initial real user group is small
  and known, recruited by Michael (the developer) directly, likely including real church congregations
  he has a relationship with. This is not yet an anonymous mass public release.
- Michael's own stated expectation: "people in a actual real church are going to be the mass influx of
  users in the test group" — i.e., the primary anticipated audience, at least initially, arrives with
  some pre-existing church community and pastoral relationship already in their life, not as isolated
  strangers with zero support structure.
- At a wider future release, general app-store discovery by the public is also plausible and should not
  be discounted — some fraction of any real audience, churched or not, will be isolated, in crisis, or
  without safe adult support at the moment they open this app.
- The VOTD calendar is a single card per day, read quickly, often the only Scripture engagement someone
  has that day — unlike the long-form Aliyah modules, it has no room to build out nuance in the same
  reading.

You do not have certainty about the exact composition of the user base. Say so where it matters, and
give a range or a conditional judgment rather than picking one extreme audience to reason from.
`.trim();

function buildPrompt(voicePreamble: string, deliberationInstruction: string, votdJson: string, flaggedCardsList: string): string {
  return [
    voicePreamble,
    "",
    "---",
    "",
    "A prior review of this same 72-entry Verse of the Day calendar found 8 candidate safety-risk flags,",
    "listed below by reference. Your job now is not to re-find them — it's to WEIGH each one properly,",
    "against the real, intended audience of this specific app, which is given below. Do not reason from",
    "a worst-case-only or best-case-only audience.",
    "",
    AUDIENCE_CONTEXT,
    "",
    "The 8 flagged references:",
    flaggedCardsList,
    "",
    "For EACH of the 8, in the full VOTD calendar below, give:",
    "1. LIKELIHOOD — how realistically could this specific sentence, in this specific app, in front of",
    "   this specific audience, actually be used the way the risk describes? Not \"could someone",
    "   theoretically misuse any verse\" — how likely is THIS one, given who actually opens this app.",
    "2. IMPACT — if it did happen, how severe is the harm? Weigh this independently of likelihood; a",
    "   rare-but-severe risk is not automatically outweighed by a common-but-mild one.",
    "3. COST OF THE FIX — does correcting this sentence cost real theological depth, conviction, or",
    "   pastoral force (a bad trade for a low, diffuse risk), or is it a free or nearly-free clause that",
    "   loses nothing (worth doing even against a low-probability risk, since the fix is nearly costless)?",
    "4. RECOMMENDATION — fix it, leave it as-is, or genuinely a close call for Michael's own judgment —",
    "   and say which.",
    "",
    "Separately, and for the calendar as a whole, not just these 8: does this content — as written, and",
    "as any of the 8 would read AFTER a safety fix — actually disciple a real, committed, church-",
    "attending Christian reader with depth and conviction? Or does caution risk flattening any of it into",
    "something neutral, hedged, or theologically thin that undersells what this app is actually for? Name",
    "specific sentences if you think caution has already cost real depth, or if a proposed fix (see the",
    "prior review's suggested rewrites, which you may critique) would.",
    "",
    `Close with this specific required element: ${deliberationInstruction}`,
    "",
    "Output as complete, well-formatted markdown, one section per flagged reference plus the depth",
    "question at the end.",
    "",
    "=== VOTD CALENDAR (72 entries, JSON) ===",
    "",
    votdJson,
  ].join("\n");
}

function log(msg: string): void { console.log(`[votd-risk-weighting] ${msg}`); }
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

interface RunResult { result: AdapterResult; elapsedS: number; newStatusLines: string[]; diffAfter: string; codexBanner?: Record<string, string>; }

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
  const newStatusLines = diffStatusLines(baselineStatus, statusAfter).filter((l) => !KNOWN_INSTRUMENTATION_FILES.some((f) => l.endsWith(f)));
  const codexBanner = captureBanner ? parseCodexBanner(rawLines.join("\n")) : undefined;
  return { result, elapsedS, newStatusLines, diffAfter, codexBanner };
}

function writeReport(outDir: string, label: string, run: RunResult): { output_file: string; output_sha256: string } {
  const hasUnexpectedWrites = run.newStatusLines.length > 0 || run.diffAfter.trim().length > 0;
  const filename = `${label}.md`;
  const body = [
    `# ${label} — VOTD risk-weighting pass`, "",
    `- success: ${run.result.success}`, `- elapsed: ${run.elapsedS.toFixed(1)}s`,
    `- read-only verification: ${hasUnexpectedWrites ? "**UNEXPECTED WRITE DETECTED**" : "clean"}`,
    run.codexBanner && Object.keys(run.codexBanner).length > 0 ? `- adapter banner: ${JSON.stringify(run.codexBanner)}` : "",
    "", run.result.error ? `## adapter error\n\n\`\`\`\n${run.result.error}\n\`\`\`\n` : "",
    "## Review output", "", run.result.output || "(no output)",
  ].join("\n");
  writeFileSync(join(outDir, filename), body, "utf-8");
  return { output_file: filename, output_sha256: sha256(run.result.output || "") };
}

async function main() {
  if (!existsSync(ELIANA_SOURCE)) throw new Error(`Eliana's Rhythm source not found at ${ELIANA_SOURCE}`);
  const scratchRoot = mkdtempSync(join(tmpdir(), "maestroclaw-votd-risk-weighting-"));
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
  const flaggedCardsList = FLAGGED_CARDS.map((r) => `- ${r}`).join("\n");
  const prompt = buildPrompt(PASTOR_PREAMBLE, PASTOR_SIG, votdJson, flaggedCardsList);
  writeFileSync(join(OUT_DIR, "prompt-pastor-risk-weighting.md"), prompt, "utf-8");

  let baselineStatus = gitStatusPorcelain(cloneDir);
  const runs: RunRecord[] = [];
  const fableAdapter = new ClaudeCodeAdapter();
  const solAdapter = new CodexCliAdapter({ sandbox: "read-only" });

  const jobs: Array<{ label: string; which: "fable" | "sol" }> = [
    { label: "risk-weighting-fable", which: "fable" },
    { label: "risk-weighting-sol", which: "sol" },
  ];

  for (const job of jobs) {
    log(`Running ${job.label}...`);
    const run = job.which === "fable"
      ? await runOne(fableAdapter, prompt, cloneDir, baselineStatus, false)
      : await runOne(solAdapter, prompt, cloneDir, baselineStatus, true);
    const out = writeReport(OUT_DIR, job.label, run);
    runs.push({
      label: job.label,
      adapter: job.which === "fable" ? "claude_code" : "codex_cli",
      mode: "task",
      persona: { slug: "pastor", source: PERSONAS_FILE },
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

  const sourceInfo = captureSourceRepoInfo(ELIANA_SOURCE, "votd_calendar.json read live from source, unmodified.");
  const manifest: EnvelopeManifest = {
    run_id: RUN_ID,
    timestamp_utc: new Date().toISOString(),
    task_description:
      "Likelihood x impact x fix-cost weighting of the 8 candidate safety-risk flags from the prior " +
      "Pastor/Scholar VOTD review, against the app's real, known, intended audience (closed test track, " +
      "church-recruited initial users, general public at wider release) — per Michael's explicit " +
      "instruction not to treat every theoretical misuse as equally weighted regardless of realistic " +
      "likelihood. Also checks whether the calendar, or the proposed safety fixes, cost real " +
      "theological depth/conviction for a diffuse or low-probability concern.",
    read_only: true,
    source_repo: sourceInfo,
    content: { description: "Full votd_calendar.json (72 entries) plus the 8 flagged references from the prior round.", files: [{ path: VOTD_RELATIVE_PATH, sha256: sha256OfFile(votdSourcePath) }] },
    prompt: { file: "prompt-pastor-risk-weighting.md", sha256: sha256(prompt) },
    runs,
    known_gaps: ["Pastor persona only, not Scholar — this task is pastoral/audience judgment, not textual rigor.", "The app's actual future audience composition (post-closed-test-track) is genuinely unknown; both runs were told to say so where it matters rather than assume."],
    notes: ["Direct follow-up to Michael's 2026-08-21 instruction to weigh likelihood and impact against the actual user base rather than treat any theoretical misuse as sufficient grounds for a fix."],
  };
  writeManifest(OUT_DIR, manifest);
  log(`\nDone. Manifest + all outputs written to: ${OUT_DIR}`);
}

main().catch((err) => { console.error("[votd-risk-weighting] FAILED:", err); process.exit(1); });
