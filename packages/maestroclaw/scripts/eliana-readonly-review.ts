#!/usr/bin/env -S npx tsx
/**
 * MaestroClaw read-only proof workload — Eliana's Rhythm.
 *
 * Michael's explicit go-ahead (2026-08-17): "go ahead and use Maestro on
 * Eliana, read-only for now." This script is the concrete first test: it
 * exercises MaestroClaw's actual adapter-execution core (real adapter
 * classes, real git-clone-into-ephemeral-workspace pattern, real prompt →
 * text-report flow) against real content from a separate project — the
 * "Eliana's Rhythm" Bible-study app — without touching that project's
 * working tree at all.
 *
 * Deliberately NOT wired through the live hosted Supabase job queue for this
 * first pass. What's actually uncertain here is "does routing this kind of
 * task through MaestroClaw's adapter pipeline produce a comparable-quality
 * review to what was done by hand tonight" — answering that doesn't require
 * the web → edge-function → executor-api → MaestroClaw round trip, and
 * skipping it means this script has no dependency on live credentials, no
 * risk of confusing a real hosted job queue, and is fully self-contained
 * (run it, read the output, done). If this proves out and a live end-to-end
 * demo is wanted later, that's a clean, separate follow-up — see
 * docs/audits/MAESTROCLAW-ATTACK-PLAN.md.
 *
 * Read-only guarantees, defense in depth:
 *   1. The source repo is only ever `git clone`'d (a read), never written to
 *      directly. `--no-hardlinks` is passed explicitly — on NTFS a hardlink
 *      is a second name for the SAME data blocks, not copy-on-write, so a
 *      local clone that hardlinked .git/objects could theoretically let a
 *      write reach the original repo's object store. Forcing real copies
 *      removes that theoretical path entirely.
 *   2. The clone lives in a disposable scratch directory, never inside the
 *      Elianas Rhythm working tree.
 *   3. Two adapters, two different enforcement mechanisms, run side by side:
 *      - claude_code (task mode): no --dangerously-skip-permissions is ever
 *        passed in task mode, so Claude Code's own default permission model
 *        (which denies unresolvable write/edit requests in non-interactive
 *        mode rather than hanging) is the read-only guarantee.
 *      - codex_cli with the new `{ sandbox: "read-only" }` constructor
 *        option (see src/adapters/codex-cli.ts) — enforced by Codex's own
 *        OS-level sandbox (Landlock/seccomp/Seatbelt/native Windows
 *        sandbox), not a permission prompt. This is the stronger,
 *        OS-enforced guarantee.
 *   4. After each run, `git status --short` / `git diff --stat` inside the
 *      clone are captured and printed — an explicit, checkable "nothing was
 *      written" verification, not just trust in the sandbox/permission
 *      claims above.
 *
 * Usage:
 *   cd packages/maestroclaw
 *   npx tsx scripts/eliana-readonly-review.ts
 *
 * Output: review reports + verification logs written under a scratch
 * directory (path printed at the end), never into either repo.
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeCodeAdapter } from "../src/adapters/claude-code.js";
import { CodexCliAdapter } from "../src/adapters/codex-cli.js";
import type { AdapterResult } from "../src/adapters/types.js";

const ELIANA_SOURCE = "C:\\New folder\\Elianas RhythmMigrate\\Elianas Rhythm";
const VOTD_RELATIVE_PATH = "app/src/main/assets/studies/votd_calendar.json";
const ENTRY_COUNT = 10; // small, real, bounded first slice — not the full 72
const PER_ADAPTER_TIMEOUT_MS = 5 * 60 * 1000;

interface VotdDay {
  reference: string;
  chainNumber: number;
  elianaTranslation: string;
  noticeThis: string;
  whyItMatters: string;
  carryItWithYou: string;
}

function log(msg: string): void {
  console.log(`[eliana-readonly-review] ${msg}`);
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

function buildReviewPrompt(entries: VotdDay[]): string {
  const entriesBlock = entries
    .map((e, i) => {
      return [
        `--- Entry ${i + 1} (chain #${e.chainNumber}) ---`,
        `Reference: ${e.reference}`,
        `Eliana Translation: ${e.elianaTranslation}`,
        `Notice This: ${e.noticeThis}`,
        `Why It Matters: ${e.whyItMatters}`,
        `Carry It With You: ${e.carryItWithYou}`,
      ].join("\n");
    })
    .join("\n\n");

  return [
    "You are doing an independent editorial and theological review of entries from a daily",
    "\"Verse of the Day\" calendar for a Bible-study app. Each entry has four parts: a Bible",
    "reference, a translation of the verse (\"Eliana Translation\"), a short note on a specific",
    "textual/historical/literary detail (\"Notice This\"), an explanation of why that detail",
    "matters for the reader (\"Why It Matters\"), and a concrete practice for the day (\"Carry It",
    "With You\").",
    "",
    "Review the entries below and produce:",
    "1. Cross-cutting findings — repeated patterns, structural weaknesses, or templated phrasing",
    "   that a daily reader working through many of these in sequence would notice.",
    "2. Entry-by-entry notes — for each entry, say whether it's strong, and if not, name the",
    "   specific problem (e.g. \"Why It Matters\" merely restates \"Notice This\"; a claim asserted",
    "   as settled fact that is actually contested/debated; jargon that needs unpacking; internal",
    "   inconsistency with a nearby entry in the same chain).",
    "3. Be concrete and specific — cite the actual text, not generic praise or generic criticism.",
    "",
    "This is an independent read — you have not seen any other review of this content and should",
    "not assume one exists. Output your review as complete, well-formatted markdown.",
    "",
    "=== ENTRIES ===",
    "",
    entriesBlock,
  ].join("\n");
}

// MaestroClaw's own session-log instrumentation (appendSessionLogEvent, see
// lib/session-log.ts) writes a small append-only audit log file directly
// into workDir on every adapter call — this is deliberate framework
// behavior (in production, workDir is the ephemeral per-job clone, so this
// is always writing into disposable space), not an adapter writing content
// of its own accord. Filtered out of the "did the adapter write anything"
// check below so a real finding isn't buried under expected noise — but
// still shown in full in the report for transparency.
const KNOWN_MAESTROCLAW_INSTRUMENTATION_FILES = ["session.log", ".maestroclaw-session.log"];

function diffStatusLines(baseline: string, after: string): string[] {
  const baseSet = new Set(baseline.split("\n").map((l) => l.trim()).filter(Boolean));
  return after
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !baseSet.has(l));
}

async function runAdapterReview(
  label: string,
  adapter: { run: (prompt: string, workDir: string, timeoutMs: number) => Promise<AdapterResult> },
  prompt: string,
  workDir: string,
  outDir: string,
  baselineStatus: string,
): Promise<void> {
  log(`Running ${label}...`);
  const start = Date.now();
  const result = await adapter.run(prompt, workDir, PER_ADAPTER_TIMEOUT_MS);
  const elapsedS = ((Date.now() - start) / 1000).toFixed(1);

  const statusAfter = gitStatusPorcelain(workDir);
  const diffAfter = gitDiffStat(workDir);
  const newStatusLines = diffStatusLines(baselineStatus, statusAfter);
  const unexpectedLines = newStatusLines.filter(
    (l) => !KNOWN_MAESTROCLAW_INSTRUMENTATION_FILES.some((f) => l.endsWith(f)),
  );
  const hasUnexpectedWrites = unexpectedLines.length > 0 || diffAfter.trim().length > 0;

  log(`${label}: success=${result.success} elapsed=${elapsedS}s output_len=${result.output.length}`);
  log(
    `${label}: read-only check — new git-status entries beyond baseline: ${newStatusLines.length} `
    + `(${newStatusLines.length - unexpectedLines.length} expected MaestroClaw instrumentation, `
    + `${unexpectedLines.length} unexpected); tracked-file diff: ${diffAfter.trim() ? "NON-EMPTY" : "clean"}`,
  );
  if (hasUnexpectedWrites) {
    log(`${label}: !!! UNEXPECTED WRITE DETECTED — investigate before trusting this run as read-only !!!`);
  }

  const reportPath = join(outDir, `${label}.md`);
  writeFileSync(
    reportPath,
    [
      `# ${label} — Eliana VOTD review (read-only proof workload)`,
      "",
      `- success: ${result.success}`,
      `- elapsed: ${elapsedS}s`,
      `- read-only verification: ${hasUnexpectedWrites ? "**UNEXPECTED WRITE DETECTED — investigate**" : "clean (only expected MaestroClaw instrumentation, if any)"}`,
      "",
      "## Baseline git status (before this adapter ran)",
      "```",
      baselineStatus.trim() || "(clean)",
      "```",
      "",
      "## git status --short (after this adapter ran)",
      "```",
      statusAfter.trim() || "(clean)",
      "```",
      "",
      "## New status lines beyond baseline",
      "```",
      newStatusLines.length > 0 ? newStatusLines.join("\n") : "(none)",
      "```",
      newStatusLines.length > 0
        ? `(of which ${unexpectedLines.length} unexpected, ${newStatusLines.length - unexpectedLines.length} known MaestroClaw instrumentation: ${KNOWN_MAESTROCLAW_INSTRUMENTATION_FILES.join(", ")})`
        : "",
      "",
      "## git diff --stat after run (changes to already-tracked files)",
      "```",
      diffAfter.trim() || "(clean)",
      "```",
      "",
      result.error ? `## adapter error\n\n\`\`\`\n${result.error}\n\`\`\`\n` : "",
      "## Review output",
      "",
      result.output || "(no output)",
    ].join("\n"),
    "utf-8",
  );
  log(`${label}: report written to ${reportPath}`);
}

async function main() {
  if (!existsSync(ELIANA_SOURCE)) {
    throw new Error(`Eliana's Rhythm source not found at ${ELIANA_SOURCE}`);
  }

  const scratchRoot = mkdtempSync(join(tmpdir(), "maestroclaw-eliana-readonly-"));
  const cloneDir = join(scratchRoot, "repo");
  const outDir = join(scratchRoot, "reports");
  mkdirSync(outDir, { recursive: true });

  log(`Scratch dir: ${scratchRoot}`);
  log(`Cloning ${ELIANA_SOURCE} (read-only source) → ${cloneDir}`);
  execFileSync(
    "git",
    ["clone", "--depth", "1", "--no-hardlinks", ELIANA_SOURCE, cloneDir],
    { stdio: "pipe" },
  );
  log("Clone complete — from here on, all reads happen against the disposable clone, never the source.");

  const votdPath = join(cloneDir, VOTD_RELATIVE_PATH);
  if (!existsSync(votdPath)) {
    // votd_calendar.json is real, current content but is NOT yet committed in
    // the source repo (`git status` shows it "??" / untracked) — it's active
    // work in progress. `git clone` only ever sees committed history, so it's
    // simply absent from the clone. Worth being transparent about rather
    // than silently working around: a real hosted job cloning from a
    // repo_url over the network would ALSO never see uncommitted local
    // content — that's inherent to cloning, not a MaestroClaw limitation.
    // For this local proof workload, the honest choice is an explicit,
    // logged, single-file copy (a read of the source + a write only into the
    // already-disposable clone — the source is never opened for writing)
    // rather than silently reviewing stale content or failing outright.
    const sourceVotdPath = join(ELIANA_SOURCE, VOTD_RELATIVE_PATH);
    if (!existsSync(sourceVotdPath)) {
      throw new Error(`votd_calendar.json not found in clone OR source (${sourceVotdPath})`);
    }
    log(`NOTE: ${VOTD_RELATIVE_PATH} is uncommitted in the source repo (untracked) — a plain git clone `
      + "doesn't include it, the same way a real hosted job cloning from a repo_url over the network "
      + "never would. Copying it explicitly (read from source, write only into the disposable clone) "
      + "so this test reviews the actual current draft content.");
    mkdirSync(join(cloneDir, "app/src/main/assets/studies"), { recursive: true });
    writeFileSync(votdPath, readFileSync(sourceVotdPath, "utf-8"), "utf-8");
  }
  const votdData = JSON.parse(readFileSync(votdPath, "utf-8")) as { days: VotdDay[] };
  const slice = votdData.days.slice(0, ENTRY_COUNT);
  log(`Loaded ${votdData.days.length} total VOTD entries; reviewing first ${slice.length}.`);

  const prompt = buildReviewPrompt(slice);
  writeFileSync(join(outDir, "prompt-used.md"), prompt, "utf-8");

  // Baseline before either adapter touches the clone. Non-empty is expected
  // here (the votd_calendar.json copy-in above shows as untracked) — that's
  // not a finding, it's why baseline diffing (rather than "must be totally
  // empty") is the right check.
  let baselineStatus = gitStatusPorcelain(cloneDir);
  log(`Baseline git status before any adapter runs:\n${baselineStatus.trim() || "(clean)"}`);

  // Two adapters, two different read-only enforcement mechanisms — see the
  // file header comment. Run sequentially, re-baselining after each one, so
  // each report shows only what THAT adapter changed, not a cumulative diff
  // that would misattribute the first adapter's instrumentation file to the
  // second.
  const claudeAdapter = new ClaudeCodeAdapter();
  await runAdapterReview("claude_code-task-mode", claudeAdapter, prompt, cloneDir, outDir, baselineStatus);
  baselineStatus = gitStatusPorcelain(cloneDir);

  const codexAdapter = new CodexCliAdapter({ sandbox: "read-only" });
  await runAdapterReview("codex_cli-sandbox-read-only", codexAdapter, prompt, cloneDir, outDir, baselineStatus);

  log("");
  log(`Done. Full outputs, prompt, and git-status verification logs are under: ${outDir}`);
  log(`(Disposable clone left at ${cloneDir} for inspection — delete scratchRoot when done: ${scratchRoot})`);
}

main().catch((err) => {
  console.error("[eliana-readonly-review] FAILED:", err);
  process.exit(1);
});
