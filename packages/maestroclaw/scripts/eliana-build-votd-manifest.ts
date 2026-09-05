#!/usr/bin/env -S npx tsx
/**
 * One-off: builds the reproducibility-envelope manifest for the VOTD
 * read-only proof-workload run that already completed (see
 * docs/audits/MAESTROCLAW-ATTACK-PLAN.md §8) and copies its outputs into
 * durable repo storage under docs/audits/eliana-readonly-poc/.
 *
 * Deliberately does NOT re-invoke either adapter — the review text Michael
 * asked to read is the text that was already produced; re-running would
 * produce different (LLM output isn't deterministic), non-matching text.
 * What's captured here is everything that CAN be reconstructed honestly
 * after the fact (source commit, CLI versions, content/prompt/output
 * hashes) plus an explicit, honest note on the one thing that can't be
 * recovered retroactively (Codex's resolved-model/session-id banner, which
 * this run's original harness didn't capture — fixed going forward in
 * eliana-review-harness.ts's shared helpers for the Forsaken Cry round).
 */
import { readFileSync, existsSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import {
  sha256, sha256OfFile, captureSourceRepoInfo, cliVersion, writeManifest,
  type EnvelopeManifest, type RunRecord,
} from "./lib/eliana-manifest.js";

const ELIANA_SOURCE = "C:\\New folder\\Elianas RhythmMigrate\\Elianas Rhythm";
const VOTD_RELATIVE_PATH = "app/src/main/assets/studies/votd_calendar.json";
const SCRATCH_REPORTS_DIR =
  "C:\\Users\\Owner\\AppData\\Local\\Temp\\claude\\C--New-folder-Elianas-RhythmMigrate\\98a14354-a4cf-4077-b52b-aa9137fd6a14\\scratchpad\\eliana-readonly-review-reports";
const OUT_DIR = join(
  "C:\\New folder\\MaestroOrchestra\\project\\Maestro\\docs\\audits\\eliana-readonly-poc",
  "2026-08-17-votd-first10",
);

function main() {
  const claudeOutputPath = join(SCRATCH_REPORTS_DIR, "claude_code-task-mode.md");
  const codexOutputPath = join(SCRATCH_REPORTS_DIR, "codex_cli-sandbox-read-only.md");
  const promptPath = join(SCRATCH_REPORTS_DIR, "prompt-used.md");
  for (const p of [claudeOutputPath, codexOutputPath, promptPath]) {
    if (!existsSync(p)) throw new Error(`Expected saved output not found: ${p}`);
  }

  const promptText = readFileSync(promptPath, "utf-8");
  const claudeReportFull = readFileSync(claudeOutputPath, "utf-8");
  const codexReportFull = readFileSync(codexOutputPath, "utf-8");

  // The saved report files are the full markdown report (metadata + review);
  // hash just the "## Review output" body so the artifact hash tracks the
  // actual reviewed content, not incidental formatting around it.
  function reviewBody(full: string): string {
    const idx = full.indexOf("## Review output");
    return idx >= 0 ? full.slice(idx) : full;
  }

  const sourceInfo = captureSourceRepoInfo(
    ELIANA_SOURCE,
    `app/src/main/assets/studies/votd_calendar.json is uncommitted in the source repo (untracked, "?? " in git status) — ` +
    `not covered by the git commit above. Its content hash is recorded separately below since a plain git clone does not ` +
    `include uncommitted content (the same way a real hosted job cloning from a repo_url over the network never would).`,
  );

  const claudeVersion = cliVersion("claude", ["--version"]);
  const codexVersion = cliVersion("codex", ["--version"]);

  const votdFileHash = sha256OfFile(join(ELIANA_SOURCE, VOTD_RELATIVE_PATH));

  const claudeRun: RunRecord = {
    label: "claude_code-task-mode",
    adapter: "claude_code",
    mode: "task",
    persona: null,
    cli_version: claudeVersion,
    read_only_mechanism:
      "Claude Code default permission model — --dangerously-skip-permissions is never passed in task mode, " +
      "so unresolvable write/edit requests are denied rather than executed in non-interactive mode.",
    requested_model: "sonnet (alias; CLAW_CLAUDE_MODEL not set, adapter default)",
    resolved_model: "not observable — --print --output-format text emits no banner/metadata; known gap, see below",
    success: true,
    elapsed_seconds: 124.9,
    read_only_verification: "clean",
    new_status_lines_beyond_baseline: ["?? session.log (expected MaestroClaw session-log instrumentation)"],
    output_file: "claude_code-task-mode.md",
    output_sha256: sha256(reviewBody(claudeReportFull)),
    known_gaps: [
      "Exact resolved Claude model snapshot not captured — text output mode emits no banner. " +
        "Would require --output-format json to observe; not changed mid-run to avoid altering adapter behavior for this benchmark.",
    ],
  };

  const codexRun: RunRecord = {
    label: "codex_cli-sandbox-read-only",
    adapter: "codex_cli",
    mode: "task",
    persona: null,
    cli_version: codexVersion,
    read_only_mechanism:
      "Codex native OS-level sandbox, --sandbox read-only (CodexCliAdapter constructor option added this session).",
    resolved_model: "not captured for this specific run — see known gap below",
    session_id: "not captured for this specific run — see known gap below",
    success: true,
    elapsed_seconds: 152.0,
    read_only_verification: "clean",
    new_status_lines_beyond_baseline: [],
    output_file: "codex_cli-sandbox-read-only.md",
    output_sha256: sha256(reviewBody(codexReportFull)),
    known_gaps: [
      "Codex prints its resolved model/session id to stdout in a startup banner even in exec mode, but this run's " +
        "harness only captured the final --output-last-message content, discarding the banner. Fixed going forward: " +
        "scripts/lib/eliana-manifest.ts's parseCodexBanner() + an onLine capture hook in the Forsaken Cry round's " +
        "harness recovers this for all subsequent runs.",
    ],
  };

  const manifest: EnvelopeManifest = {
    run_id: "2026-08-17-votd-first10",
    timestamp_utc: "2026-08-17T~20:07:00Z (approximate — exact adapter start times were not machine-recorded for this first run)",
    task_description:
      "Independent editorial/theological review of the first 10 of 72 Verse-of-the-Day calendar entries. " +
      "No persona injected — plain independent-review prompt only. First real proof-of-concept run of MaestroClaw's " +
      "adapter-execution core against non-coding content, per Michael's explicit read-only go-ahead.",
    read_only: true,
    source_repo: sourceInfo,
    content: {
      description:
        "First 10 entries (by array order) of app/src/main/assets/studies/votd_calendar.json's 72-entry `days` array. " +
        "Each entry: reference, chainNumber, elianaTranslation, noticeThis, whyItMatters, carryItWithYou.",
      files: [
        {
          path: VOTD_RELATIVE_PATH,
          sha256: votdFileHash,
          note: "Full-file hash (all 72 entries) at time of this run — only the first 10 were extracted into the prompt.",
        },
      ],
    },
    prompt: {
      file: "prompt.md",
      sha256: sha256(promptText),
    },
    runs: [claudeRun, codexRun],
    known_gaps: [
      "Adapter start timestamps were not individually machine-recorded for this first run (elapsed durations were captured; " +
        "absolute start/end times were not) — fixed going forward.",
      "Network policy was not explicitly configured or observed for either adapter in this run.",
      "No MCP servers or Agent Skills were configured or used in this run.",
    ],
    notes: [
      "Both reviews were generated independently — neither adapter was shown any of the existing manual review files " +
        "(FABLE-REVIEW-votd-calendar-72-entries.md, SOL-AUDIT-votd-calendar-72-entries.md, SOL-AUDIT-votd-calendar-pass2-final.md) " +
        "already present in the Elianas Rhythm repo from tonight's hand-run council process.",
      "Building this run's { sandbox: 'read-only' } codex_cli option surfaced and fixed a real regression: " +
        "'--ask-for-approval never' (added in Sprint 1) does not parse on the actually-installed Codex CLI when placed " +
        "after the exec subcommand — every real codex_cli invocation had been failing since Sprint 1 shipped. See " +
        "docs/audits/MAESTROCLAW-ATTACK-PLAN.md §8 for the full account.",
    ],
  };

  writeManifest(OUT_DIR, manifest);

  // Copy the actual review texts + prompt into durable storage.
  copyFileSync(claudeOutputPath, join(OUT_DIR, "claude_code-task-mode.md"));
  copyFileSync(codexOutputPath, join(OUT_DIR, "codex_cli-sandbox-read-only.md"));
  copyFileSync(promptPath, join(OUT_DIR, "prompt.md"));

  console.log(`Manifest + outputs written to: ${OUT_DIR}`);
}

main();
