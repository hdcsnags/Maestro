// Shared helpers for building reproducibility-envelope manifests for the
// Eliana read-only proof-workload runs. See docs/audits/eliana-readonly-poc/
// and docs/audits/MAESTROCLAW-ATTACK-PLAN.md §8 for what this is and why.
//
// Field categories deliberately follow the full audit's own "reproducibility
// envelope" recommendation (Section M): inputs/commit/policy/env/model/
// harness/session/artifact hashes. This is the first real instance of it,
// not a bespoke one-off format — built so future runs (any adapter, any
// content, any persona) can reuse the same shape.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export function sha256(content: string): string {
  return createHash("sha256").update(content, "utf-8").digest("hex");
}

export function sha256OfFile(path: string): string {
  return sha256(readFileSync(path, "utf-8"));
}

export interface SourceRepoInfo {
  path: string;
  git_commit: string;
  git_branch: string;
  note?: string;
}

export function captureSourceRepoInfo(repoPath: string, note?: string): SourceRepoInfo {
  const git_commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoPath, encoding: "utf8" }).trim();
  const git_branch = execFileSync("git", ["branch", "--show-current"], { cwd: repoPath, encoding: "utf8" }).trim();
  return { path: repoPath, git_commit, git_branch, ...(note ? { note } : {}) };
}

export function cliVersion(command: string, args: string[] = ["--version"]): string {
  try {
    return execFileSync(command, args, { encoding: "utf8", shell: process.platform === "win32" }).trim();
  } catch (err) {
    return `(unavailable: ${err instanceof Error ? err.message : String(err)})`;
  }
}

/**
 * Parse Codex's own startup banner (printed to stdout even in exec mode) out
 * of a raw captured stdout stream, e.g.:
 *   model: gpt-5.6-sol
 *   provider: openai
 *   approval: never
 *   sandbox: read-only
 *   session id: 01a01229-...
 * Returns whatever fields it finds; missing fields are simply absent rather
 * than defaulted, so a manifest reader can tell "not captured" from "empty."
 */
export function parseCodexBanner(rawStdout: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const patterns: [string, RegExp][] = [
    ["model", /^model:\s*(.+)$/m],
    ["provider", /^provider:\s*(.+)$/m],
    ["approval", /^approval:\s*(.+)$/m],
    ["sandbox", /^sandbox:\s*(.+)$/m],
    ["reasoning_effort", /^reasoning effort:\s*(.+)$/m],
    ["session_id", /^session id:\s*(.+)$/m],
  ];
  for (const [key, re] of patterns) {
    const m = rawStdout.match(re);
    if (m) fields[key] = m[1].trim();
  }
  return fields;
}

export interface RunRecord {
  label: string;
  adapter: string;
  mode: string;
  persona: { slug: string; source: string } | null;
  cli_version: string;
  read_only_mechanism: string;
  requested_model?: string;
  resolved_model?: string;
  session_id?: string;
  success: boolean;
  elapsed_seconds: number;
  read_only_verification: "clean" | "UNEXPECTED_WRITE_DETECTED";
  new_status_lines_beyond_baseline: string[];
  output_file: string;
  output_sha256: string;
  known_gaps?: string[];
}

export interface EnvelopeManifest {
  run_id: string;
  timestamp_utc: string;
  task_description: string;
  read_only: true;
  source_repo: SourceRepoInfo;
  content: {
    description: string;
    files: { path: string; sha256: string; note?: string }[];
  };
  prompt: {
    file: string;
    sha256: string;
  };
  runs: RunRecord[];
  known_gaps: string[];
  notes: string[];
}

export function writeManifest(outDir: string, manifest: EnvelopeManifest): void {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
  writeFileSync(join(outDir, "manifest.md"), renderManifestMarkdown(manifest), "utf-8");
}

function renderManifestMarkdown(m: EnvelopeManifest): string {
  const lines: string[] = [];
  lines.push(`# Reproducibility envelope — ${m.run_id}`, "");
  lines.push(`- **Timestamp (UTC):** ${m.timestamp_utc}`);
  lines.push(`- **Task:** ${m.task_description}`);
  lines.push(`- **Read-only:** ${m.read_only}`);
  lines.push("");
  lines.push("## Source repo");
  lines.push(`- Path: \`${m.source_repo.path}\``);
  lines.push(`- Git commit: \`${m.source_repo.git_commit}\` (branch: \`${m.source_repo.git_branch}\`)`);
  if (m.source_repo.note) lines.push(`- Note: ${m.source_repo.note}`);
  lines.push("");
  lines.push("## Content reviewed");
  lines.push(m.content.description);
  lines.push("");
  for (const f of m.content.files) {
    lines.push(`- \`${f.path}\` — sha256 \`${f.sha256}\`${f.note ? ` — ${f.note}` : ""}`);
  }
  lines.push("");
  lines.push("## Prompt");
  lines.push(`- File: \`${m.prompt.file}\``);
  lines.push(`- sha256: \`${m.prompt.sha256}\``);
  lines.push("");
  lines.push("## Runs");
  lines.push("");
  for (const r of m.runs) {
    lines.push(`### ${r.label}`);
    lines.push(`- Adapter: \`${r.adapter}\` (${r.mode} mode)`);
    lines.push(`- Persona: ${r.persona ? `**${r.persona.slug}** (verbatim from \`${r.persona.source}\`)` : "none — independent review"}`);
    lines.push(`- CLI version: ${r.cli_version}`);
    lines.push(`- Read-only mechanism: ${r.read_only_mechanism}`);
    if (r.requested_model) lines.push(`- Requested model: ${r.requested_model}`);
    if (r.resolved_model) lines.push(`- Resolved model (from adapter's own banner/output): ${r.resolved_model}`);
    if (r.session_id) lines.push(`- Session id: ${r.session_id}`);
    lines.push(`- Success: ${r.success}`);
    lines.push(`- Elapsed: ${r.elapsed_seconds}s`);
    lines.push(`- Read-only verification: **${r.read_only_verification}**${r.new_status_lines_beyond_baseline.length ? ` (new status lines: ${r.new_status_lines_beyond_baseline.join("; ")})` : ""}`);
    lines.push(`- Output file: \`${r.output_file}\` (sha256 \`${r.output_sha256}\`)`);
    if (r.known_gaps?.length) {
      lines.push(`- Known gaps for this run: ${r.known_gaps.join("; ")}`);
    }
    lines.push("");
  }
  if (m.known_gaps.length > 0) {
    lines.push("## Known gaps (run-set level)");
    for (const g of m.known_gaps) lines.push(`- ${g}`);
    lines.push("");
  }
  if (m.notes.length > 0) {
    lines.push("## Notes");
    for (const n of m.notes) lines.push(`- ${n}`);
    lines.push("");
  }
  return lines.join("\n");
}
