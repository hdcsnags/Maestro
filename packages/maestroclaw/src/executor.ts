import { mkdirSync, rmSync, renameSync, existsSync, writeFileSync, unlinkSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join, dirname, resolve, extname, sep, relative } from "node:path";
import { execFileSync } from "node:child_process";
import type { ClawConfig } from "./config.js";
import type { ExecutorJob } from "./api.js";
import { reportEvent, completeJob } from "./api.js";
import { getAdapter } from "./adapters/index.js";
import type { IncidentService } from "./lib/kernel/incident-service.js";

// Module-level holder for the IncidentService singleton.
// Adapters access it via getIncidentService().
let _incidentService: IncidentService | undefined;

export function setIncidentService(svc: IncidentService): void {
  _incidentService = svc;
}

export function getIncidentService(): IncidentService | undefined {
  return _incidentService;
}

function resolveSafeArtifactPath(rootDir: string, filePath: string): string {
  const resolvedRoot = resolve(rootDir);
  const resolvedPath = resolve(rootDir, filePath);

  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + sep)) {
    throw new Error(`Artifact path escapes workspace: ${filePath}`);
  }

  return resolvedPath;
}

interface ArtifactManifestEntry {
  path: string;
  content: string;
  operation: "create" | "delete";
}

const JSON_TEXT_ENCODER = new TextEncoder();
const MAX_ARTIFACT_EVENT_BYTES = 180_000;
const MAX_COMPLETE_MANIFEST_BYTES = 2_400_000;

function measureJsonBytes(value: unknown): number {
  return JSON_TEXT_ENCODER.encode(JSON.stringify(value)).length;
}

function splitTextByUtf8Bytes(text: string, maxBytes: number): string[] {
  if (text.length === 0) return [""];
  if (maxBytes <= 0) return [text];

  const parts: string[] = [];
  let start = 0;

  while (start < text.length) {
    let low = 1;
    let high = text.length - start;
    let best = 1;

    while (low <= high) {
      const mid = Math.floor((low + high) / 2);
      const candidate = text.slice(start, start + mid);
      if (JSON_TEXT_ENCODER.encode(candidate).length <= maxBytes) {
        best = mid;
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }

    parts.push(text.slice(start, start + best));
    start += best;
  }

  return parts;
}

async function reportArtifactManifest(
  config: ClawConfig,
  jobId: string,
  manifest: ArtifactManifestEntry[],
): Promise<void> {
  const baseChunkSize = measureJsonBytes({
    format: "artifact_manifest_chunk",
    entries: [],
  });

  let pending: ArtifactManifestEntry[] = [];

  const flushPending = async () => {
    if (pending.length === 0) return;
    await reportEvent(config, jobId, "artifact", {
      format: "artifact_manifest_chunk",
      entries: pending,
    });
    pending = [];
  };

  for (const entry of manifest) {
    const singlePayload = {
      format: "artifact_manifest_chunk",
      entries: [entry],
    };

    if (measureJsonBytes(singlePayload) <= MAX_ARTIFACT_EVENT_BYTES) {
      const nextPayload = {
        format: "artifact_manifest_chunk",
        entries: [...pending, entry],
      };

      if (measureJsonBytes(nextPayload) > MAX_ARTIFACT_EVENT_BYTES) {
        await flushPending();
      }

      pending.push(entry);
      continue;
    }

    await flushPending();

    const perChunkOverhead = measureJsonBytes({
      format: "artifact_file_chunk",
      path: entry.path,
      operation: entry.operation,
      chunk_index: 0,
      chunk_total: 0,
      content_chunk: "",
    });
    const contentBudget = MAX_ARTIFACT_EVENT_BYTES - perChunkOverhead - 64;
    const chunks = splitTextByUtf8Bytes(entry.content, contentBudget);

    for (let index = 0; index < chunks.length; index += 1) {
      await reportEvent(config, jobId, "artifact", {
        format: "artifact_file_chunk",
        path: entry.path,
        operation: entry.operation,
        chunk_index: index,
        chunk_total: chunks.length,
        content_chunk: chunks[index],
      });
    }
  }

  await flushPending();
}

function normalizePathForMatch(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\//, "")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .trim();
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i];
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        source += ".*";
        i += 1;
      } else {
        source += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    source += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  source += "$";
  return new RegExp(source);
}

function isPathWithinAllowedScope(filePath: string, allowedPaths: string[]): boolean {
  if (allowedPaths.length === 0) return true;

  const normalizedPath = normalizePathForMatch(filePath);
  return allowedPaths.some((pattern) => {
    const normalizedPattern = normalizePathForMatch(pattern);
    if (!normalizedPattern || normalizedPattern === "**") return true;
    return globToRegExp(normalizedPattern).test(normalizedPath);
  });
}

function enforceArtifactScope(
  manifest: Record<string, string>,
  allowedPaths: string[],
): { kept: Record<string, string>; rejected: string[] } {
  const kept: Record<string, string> = {};
  const rejected: string[] = [];

  for (const [filePath, content] of Object.entries(manifest)) {
    if (isPathWithinAllowedScope(filePath, allowedPaths)) {
      kept[filePath] = content;
    } else {
      rejected.push(filePath);
    }
  }

  return { kept, rejected };
}

function revertOutOfScopeFile(workDir: string, filePath: string): void {
  const normalizedPath = normalizePathForMatch(filePath);
  const fullPath = resolveSafeArtifactPath(workDir, normalizedPath);

  try {
    execFileSync("git", ["restore", "--source=HEAD", "--worktree", "--staged", "--", normalizedPath], {
      cwd: workDir,
      stdio: "pipe",
    });
    return;
  } catch {
    // Fall through — untracked files still need removing.
  }

  try {
    rmSync(fullPath, { recursive: true, force: true });
  } catch {
    // Best effort only.
  }
}

function maybeInlineArtifactManifest(
  manifest: ArtifactManifestEntry[],
): ArtifactManifestEntry[] | null {
  return measureJsonBytes({ artifact_manifest: manifest }) <= MAX_COMPLETE_MANIFEST_BYTES
    ? manifest
    : null;
}

// ─── Quality Assessment ────────────────────────────────────────────────────

interface QualityResult {
  ok: boolean;
  reason: string;
  retryable: boolean;
}

const TRUNCATION_PATTERNS = [
  /\/\/\s*\.\.\.\s*existing/i,
  /\/\*\s*\.\.\.\s*unchanged/i,
  /<!--\s*\.\.\.\s*-->/,
  /\/\/\s*\.\.\.\s*rest of/i,
  /\/\/\s*placeholder/i,
  /\[\.\.\.existing code\.\.\.\]/i,
];

/**
 * Checks extracted file content for common quality issues.
 * Returns path-aware validation so .html files aren't rejected for having DOCTYPE,
 * .json files get JSON-parse validation, etc.
 */
function assessOutputQuality(content: string, targetPath: string): QualityResult {
  if (!content || content.length === 0) {
    return { ok: false, reason: "no content extracted from response", retryable: true };
  }

  const ext = extname(targetPath).toLowerCase();
  const isHtmlFile = ext === ".html" || ext === ".htm";
  const isJsonFile = ext === ".json";

  // HTML error page — skip for .html build targets
  if (!isHtmlFile && /^<!DOCTYPE\s+html/i.test(content.trim())) {
    return { ok: false, reason: "HTML error page received (possible rate-limit or auth failure)", retryable: true };
  }

  // Truncation markers
  for (const pattern of TRUNCATION_PATTERNS) {
    if (pattern.test(content)) {
      return { ok: false, reason: "response contains truncation placeholder (model did not emit complete file)", retryable: true };
    }
  }

  // JSON validation for .json targets
  if (isJsonFile) {
    try {
      JSON.parse(content);
    } catch {
      return { ok: false, reason: "invalid JSON — file cannot be parsed", retryable: true };
    }
  }

  // Minimum length guard (skip for intentionally small files like .gitignore, .env, etc.)
  const knownSmallExts = new Set([".gitignore", ".env", ".editorconfig", ".prettierrc", ".eslintrc"]);
  if (!knownSmallExts.has(ext) && content.length < 80) {
    return { ok: false, reason: `content too short (${content.length} chars) — likely incomplete`, retryable: true };
  }

  return { ok: true, reason: "", retryable: false };
}

// ─── Retry Prompt Builder ──────────────────────────────────────────────────

/**
 * Builds a retry prompt that injects the quality failure reason without
 * including raw previous output (avoids context steering and length inflation).
 */
function buildRetryPrompt(
  originalPrompt: string,
  failureReason: string,
  attempt: number,
  maxRetries: number,
  targetPath: string,
): string {
  return [
    `RETRY ATTEMPT ${attempt}/${maxRetries} — Previous output for "${targetPath}" was rejected.`,
    ``,
    `Rejection reason: ${failureReason}`,
    ``,
    `Rules for this retry:`,
    `- Return COMPLETE file content. No placeholders, no "// ... existing code ...", no truncation.`,
    `- Do NOT reference or continue from your previous attempt — generate fresh.`,
    `- If the file is intentionally empty, return an empty string, not a placeholder.`,
    ``,
    `Original instructions follow:`,
    `─────────────────────────────────────────────`,
    originalPrompt,
  ].join("\n");
}

// ─── Git Checkpoints ───────────────────────────────────────────────────────

/**
 * Lazily initializes a git repo in dir if one doesn't exist.
 * Returns true if git is available and the repo is ready.
 */
function ensureGitRepo(dir: string): boolean {
  try {
    const gitDir = join(dir, ".git");
    if (!existsSync(gitDir)) {
      execFileSync("git", ["init", "--initial-branch=main"], { cwd: dir, stdio: "pipe" });
      execFileSync("git", ["config", "user.email", "claw@maestro.local"], { cwd: dir, stdio: "pipe" });
      execFileSync("git", ["config", "user.name", "MaestroClaw"], { cwd: dir, stdio: "pipe" });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Creates a git checkpoint commit in dir for the given label.
 * Best-effort — skips silently if git is locked (concurrent executor jobs)
 * or if there are no changes to commit.
 */
function createCheckpoint(dir: string, label: string): void {
  try {
    // Check for index lock — skip rather than wait (concurrent job safety)
    if (existsSync(join(dir, ".git", "index.lock"))) {
      console.log(`  ⏭ Checkpoint skipped (git index locked): ${label}`);
      return;
    }
    execFileSync("git", ["add", "-A"], { cwd: dir, stdio: "pipe" });
    execFileSync("git", ["commit", "-m", `claw:checkpoint:${label}`, "--allow-empty-message"], {
      cwd: dir,
      stdio: "pipe",
    });
    console.log(`  📌 Checkpoint: ${label}`);
  } catch {
    // Non-fatal: nothing to commit, or git unavailable
  }
}

// ─── Workspace Cleanup Between Retries ────────────────────────────────────

/**
 * Removes the target file from workDir before a retry attempt.
 * Prevents adapters (e.g. Copilot with --allow-all-tools) from seeing their
 * own stale output from the previous attempt.
 */
function cleanForRetry(workDir: string, targetPath: string): void {
  try {
    const fullPath = resolve(workDir, targetPath);
    if (existsSync(fullPath)) {
      unlinkSync(fullPath);
    }
  } catch {
    // Best-effort cleanup only
  }
}

// ─── Main Executor ─────────────────────────────────────────────────────────

/**
 * Runs a single executor job: set up workspace → run adapter with retry loop → report result.
 *
 * Ralph Loop: each attempt gets a quality check. On failure the next attempt receives
 * a structured failure reason injected before the original prompt. Timeout is treated
 * as a total budget — remaining time is recomputed before each attempt.
 */
export async function executeJob(
  config: ClawConfig,
  job: ExecutorJob
): Promise<void> {
  // Always use an absolute jobDir — if workspaceDir is relative, join+resolve here
  // prevents child process --add-dir flags from doubling the path segment.
  const jobDir = resolve(join(config.workspaceDir, job.id));
  let workDir = jobDir;
  let jobSucceeded = false;

  // Total deadline for this job (reserved 8s for reporting/cleanup)
  const REPORT_RESERVE_MS = 8_000;
  const deadlineMs = Date.now() + job.timeout_seconds * 1_000 - REPORT_RESERVE_MS;

  const maxRetries = config.maxRetries;
  const targetPath = job.allowed_paths?.[0] ?? "";

  try {
    // Report running
    await reportEvent(config, job.id, "status_change", { status: "running" });

    // Set up workspace
    mkdirSync(jobDir, { recursive: true });

    // Clone repo if specified
    if (job.repo_url) {
      console.log(`  📦 Cloning ${job.repo_url}...`);
      const cloneArgs = ["clone", "--depth", "1"];
      if (job.branch) {
        cloneArgs.push("--branch", job.branch);
      }
      cloneArgs.push(job.repo_url, "repo");

      execFileSync("git", cloneArgs, {
        cwd: jobDir,
        timeout: 60_000,
        stdio: "pipe",
      });
      workDir = join(jobDir, "repo");
    }

    // Get the adapter
    const adapter = getAdapter(job.adapter);

    // Check adapter availability
    const available = await adapter.check();
    if (!available) {
      throw new Error(
        `Adapter "${job.adapter}" is not available on this machine`
      );
    }

    // ── Ralph Loop ────────────────────────────────────────────────────────
    let finalContent = "";
    let finalOutput = "";
    let finalError: string | undefined;
    let attemptsUsed = 0;
    let lastFailureReason = "";

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      attemptsUsed = attempt;

      // Compute remaining time — abort if not enough to meaningfully run
      const remainingMs = deadlineMs - Date.now();
      if (remainingMs < 10_000) {
        lastFailureReason = `timeout — less than 10s remaining before deadline`;
        console.log(`  ⏱ Job ${job.id.slice(0, 8)} timed out before attempt ${attempt}`);
        break;
      }

      if (attempt > 1) {
        cleanForRetry(workDir, targetPath);
        await reportEvent(config, job.id, "retry", {
          attempt,
          max_retries: maxRetries,
          reason: lastFailureReason,
        });
        console.log(`  🔄 Retry ${attempt}/${maxRetries} for ${job.id.slice(0, 8)}: ${lastFailureReason}`);
      }

      const prompt = attempt === 1
        ? job.prompt
        : buildRetryPrompt(job.prompt, lastFailureReason, attempt, maxRetries, targetPath);

      console.log(`  ▶ Attempt ${attempt}/${maxRetries} — adapter "${job.adapter}" job ${job.id.slice(0, 8)}...`);
      const result = await adapter.run(prompt, workDir, remainingMs);

      finalOutput = result.output;
      finalError = result.error;

      // Surface stdout/stderr for each attempt
      if (result.output) {
        await reportEvent(config, job.id, "stdout", {
          text: result.output.slice(0, 50_000),
          attempt,
        });
      }
      if (result.error) {
        await reportEvent(config, job.id, "stderr", {
          text: result.error.slice(0, 10_000),
          attempt,
        });
      }

      // Classify adapter-level failures before extracting content
      if (!result.success && !result.output) {
        lastFailureReason = result.error
          ? `adapter error: ${result.error.slice(0, 200)}`
          : "adapter returned no output";
        continue;
      }

      // Extract content from output
      const extracted = extractFileContent(result.output);
      const quality = assessOutputQuality(extracted, targetPath);

      if (quality.ok) {
        finalContent = extracted;
        console.log(
          attempt > 1
            ? `  ✅ Job ${job.id.slice(0, 8)} succeeded on attempt ${attempt}/${maxRetries}`
            : `  ✅ Job ${job.id.slice(0, 8)} succeeded`
        );
        break;
      }

      lastFailureReason = quality.reason;
      console.log(`  ⚠️ Attempt ${attempt}/${maxRetries} quality check failed: ${quality.reason}`);
    }

    // ── Build artifact manifest ───────────────────────────────────────────
    let artifacts = finalContent.length > 0 && targetPath
      ? { [targetPath]: finalContent }
      : {};

    // Merge any structured artifacts from the adapter (adapters can return their own)
    if (Object.keys(artifacts).length === 0) {
      artifacts = { ...(/* adapter-provided */ {} as Record<string, string>) };
    }

    const succeeded = Object.keys(artifacts).length > 0;
    const retryBadge = attemptsUsed > 1 ? `[↩ ${attemptsUsed - 1}] ` : "";

    if (succeeded) {
      // Write to per-job workspace
      for (const [filePath, content] of Object.entries(artifacts)) {
        const fullPath = resolveSafeArtifactPath(jobDir, filePath);
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, content, "utf-8");
        console.log(`  💾 Wrote ${filePath} to workspace`);
      }

      // Write to session-scoped build folder
      if (job.session_id) {
        const buildDir = join(config.workspaceDir, "builds", job.session_id.slice(0, 8));
        for (const [filePath, content] of Object.entries(artifacts)) {
          const fullPath = resolveSafeArtifactPath(buildDir, filePath);
          mkdirSync(dirname(fullPath), { recursive: true });
          writeFileSync(fullPath, content, "utf-8");
        }
        console.log(`  📂 Project files → builds/${job.session_id.slice(0, 8)}/`);

        // Git checkpoint — best-effort, non-fatal
        if (config.enableCheckpoints && targetPath) {
          const buildDir2 = join(config.workspaceDir, "builds", job.session_id.slice(0, 8));
          if (ensureGitRepo(buildDir2)) {
            createCheckpoint(buildDir2, targetPath);
          }
        }
      }

      const manifestArray: ArtifactManifestEntry[] = Object.entries(artifacts).map(([path, content]) => ({
        path,
        content,
        operation: "create",
      }));

      await reportArtifactManifest(config, job.id, manifestArray);
      await completeJob(config, job.id, true, {
        result_summary: `${retryBadge}${finalOutput.slice(0, 10_000)}`,
        artifact_manifest: maybeInlineArtifactManifest(manifestArray),
      });
    } else {
      // Graceful close — all attempts failed
      const gracefulSummary = [
        `All ${attemptsUsed} attempt(s) failed for ${targetPath || "this task"}.`,
        `Last failure reason: ${lastFailureReason}`,
        finalOutput ? `Last output (truncated): ${finalOutput.slice(0, 300)}` : "",
      ].filter(Boolean).join("\n");

      await completeJob(config, job.id, false, {
        result_summary: gracefulSummary,
        error_text: lastFailureReason || "no content could be extracted after all retries",
      });
    }

    jobSucceeded = succeeded;
    if (!succeeded) {
      console.log(`  ❌ Job ${job.id.slice(0, 8)} failed after ${attemptsUsed} attempt(s): ${lastFailureReason}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ Job ${job.id.slice(0, 8)} failed:`, message);

    try {
      await reportEvent(config, job.id, "error", { message });
      await completeJob(config, job.id, false, { error_text: message });
    } catch (reportErr) {
      console.error("  Failed to report error:", reportErr);
    }
  } finally {
    // Preserve workspace on success if configured, otherwise clean up
    if (existsSync(jobDir)) {
      if (jobSucceeded && config.keepSucceededWorkspaces) {
        try {
          const label = job.repo_name ?? "job";
          const namedDir = join(config.workspaceDir, `${label}-${job.id.slice(0, 8)}`);
          renameSync(jobDir, namedDir);
          console.log(`  📁 Workspace preserved: ${namedDir}`);
        } catch {
          console.warn(`  ⚠ Could not rename workspace ${jobDir}`);
        }
      } else {
        try {
          rmSync(jobDir, { recursive: true, force: true });
        } catch {
          console.warn(`  ⚠ Could not clean up ${jobDir}`);
        }
      }
    }
  }
}

// ─── Session Build Support ─────────────────────────────────────────────────

/**
 * Context bundle passed from web side for build_session jobs.
 * All fields optional — executor applies sensible defaults.
 */
interface SessionContextBundle {
  /** Glob pattern for this builder's scope, default "**" (all files). */
  scope?: string;
  /** Exact scope globs/paths for this builder. */
  scope_paths?: string[];
  /** Raw content of ARCHITECT.md from the cloned repo or web-side fetch. */
  architect_content?: string;
  /** Files this session is expected to produce. Used for fix-pass detection. */
  expected_files?: string[];
  /** Read-only files from other builders injected as context. */
  context_files?: Array<{ path: string; content: string }>;
  /** Failover: parent job ID when this session is resuming from a handoff. */
  parent_job_id?: string;
}

/**
 * Recursive directory snapshot — maps absolute path → mtime (ms).
 * Skips .git, node_modules, and .maestroclaw-* temp files.
 */
function walkDir(dir: string): Map<string, number> {
  const result = new Map<string, number>();

  function walk(current: string): void {
    let entries: string[];
    try {
      entries = readdirSync(current);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === ".git" || entry === "node_modules") continue;
      if (entry.startsWith(".maestroclaw-")) continue;
      const full = join(current, entry);
      try {
        const st = statSync(full);
        if (st.isDirectory()) {
          walk(full);
        } else {
          result.set(full, st.mtimeMs);
        }
      } catch {
        continue;
      }
    }
  }

  walk(dir);
  return result;
}

/**
 * Compares two dir snapshots (before/after) and reads the content of every
 * new or modified file. Returns a { relative-path → content } map.
 */
function collectWrittenFiles(
  workDir: string,
  before: Map<string, number>,
  after: Map<string, number>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [fullPath, mtime] of after) {
    const prevMtime = before.get(fullPath);
    if (prevMtime !== undefined && prevMtime === mtime) continue;
    const rel = relative(workDir, fullPath).replace(/\\/g, "/");
    try {
      result[rel] = readFileSync(fullPath, "utf-8");
    } catch {
      // Unreadable (binary/locked) — skip
    }
  }
  return result;
}

/** Builds the initial session prompt including ARCHITECT.md, scope, and context files. */
function buildSessionPrompt(job: ExecutorJob, bundle: SessionContextBundle): string {
  const parts: string[] = [
    "SESSION BUILD MODE — you are an autonomous CLI agent with full file-system access.",
    "Write files directly to disk. Do NOT output JSON envelopes — just create the files.",
    "",
  ];

  if (bundle.scope_paths && bundle.scope_paths.length > 0) {
    parts.push(
      "SCOPE PATHS — you are responsible only for these paths/patterns:",
      ...bundle.scope_paths.map((scopePath) => `  - ${scopePath}`),
      "Only create or modify files that match these scope paths.",
      "",
    );
  } else if (bundle.scope && bundle.scope !== "**") {
    parts.push(
      `SCOPE: You are responsible for files matching: ${bundle.scope}`,
      "Only create files within your scope. Do not modify files outside your scope.",
      "",
    );
  }

  if (bundle.architect_content) {
    parts.push(
      "=== ARCHITECT.md (Project Blueprint) ===",
      bundle.architect_content,
      "=== END ARCHITECT.md ===",
      "",
    );
  }

  if (bundle.expected_files && bundle.expected_files.length > 0) {
    parts.push("EXPECTED FILES — you MUST create all of these:");
    for (const f of bundle.expected_files) parts.push(`  - ${f}`);
    parts.push("");
  }

  if (bundle.context_files && bundle.context_files.length > 0) {
    parts.push("CONTEXT FILES (read-only — from other builders, do not modify):");
    for (const cf of bundle.context_files) {
      parts.push(`--- ${cf.path} ---`, cf.content, "---");
    }
    parts.push("");
  }

  parts.push("=== BUILD REQUEST ===", job.prompt, "=== END BUILD REQUEST ===");
  return parts.join("\n");
}

/** Builds a targeted fix-pass prompt for missing expected files. */
function buildFixPassPrompt(
  job: ExecutorJob,
  missing: string[],
  written: string[],
): string {
  const parts: string[] = [
    "FIX PASS — some expected files are missing. Do NOT rewrite already-written files.",
    "",
  ];
  if (written.length > 0) {
    parts.push("Already written (skip these):");
    for (const f of written) parts.push(`  ✅ ${f}`);
    parts.push("");
  }
  parts.push("MISSING — you MUST create all of these now:");
  for (const f of missing) parts.push(`  ❌ ${f}`);
  parts.push("", "Original build request:", job.prompt);
  return parts.join("\n");
}

/**
 * Runs a `build_session` job: one adapter call covering the full project scope.
 *
 * Flow:
 *   1. Clone/init repo → snapshot before
 *   2. Run adapter.runSession() with full ARCHITECT.md + scope context
 *   3. Snapshot after → diff to collect written files
 *   4. Session Ralph Loop: one fix pass if expected_files are missing
 *   5. Git checkpoint → write to build dir → complete job with artifact manifest
 */
export async function executeSessionJob(
  config: ClawConfig,
  job: ExecutorJob,
): Promise<void> {
  const jobDir = resolve(join(config.workspaceDir, job.id));
  let workDir = jobDir;
  let jobSucceeded = false;

  const REPORT_RESERVE_MS = 10_000;
  const deadlineMs = Date.now() + job.timeout_seconds * 1_000 - REPORT_RESERVE_MS;
  const bundle = (job.context_bundle ?? {}) as SessionContextBundle;

  try {
    await reportEvent(config, job.id, "status_change", { status: "running" });
    mkdirSync(jobDir, { recursive: true });

    if (job.repo_url) {
      console.log(`  📦 [session] Cloning ${job.repo_url}...`);
      const cloneArgs = ["clone", "--depth", "1"];
      if (job.branch) cloneArgs.push("--branch", job.branch);
      cloneArgs.push(job.repo_url, "repo");
      execFileSync("git", cloneArgs, { cwd: jobDir, timeout: 60_000, stdio: "pipe" });
      workDir = join(jobDir, "repo");
    } else {
      workDir = join(jobDir, "repo");
      mkdirSync(workDir, { recursive: true });
      if (config.enableCheckpoints) ensureGitRepo(workDir);
    }

    const adapter = getAdapter(job.adapter);
    if (!(await adapter.check())) {
      throw new Error(`Adapter "${job.adapter}" is not available on this machine`);
    }

    // Use runSession if the adapter provides it; otherwise fall back to run
    const runSession = adapter.runSession
      ? adapter.runSession.bind(adapter)
      : adapter.run.bind(adapter);

    // ── Pass 1: initial session run ──────────────────────────────────────────
    const before = walkDir(workDir);
    const sessionPrompt = buildSessionPrompt(job, bundle);
    const pass1Ms = Math.max(10_000, deadlineMs - Date.now());

    console.log(`  🚀 [session] ${job.adapter} — scope "${bundle.scope ?? "**"}"...`);
    const pass1 = await runSession(sessionPrompt, workDir, pass1Ms);

    if (pass1.output) await reportEvent(config, job.id, "stdout", { text: pass1.output.slice(0, 50_000), pass: 1 });
    if (pass1.error) await reportEvent(config, job.id, "stderr", { text: pass1.error.slice(0, 10_000), pass: 1 });

    const after1 = walkDir(workDir);
    const written: Record<string, string> = collectWrittenFiles(workDir, before, after1);
    const writtenPaths = Object.keys(written);

    console.log(`  📝 [session] Pass 1: ${writtenPaths.length} file(s) written`);
    writtenPaths.slice(0, 20).forEach((p) => console.log(`    • ${p}`));
    if (writtenPaths.length > 20) console.log(`    ... and ${writtenPaths.length - 20} more`);

    // ── Pass 2: fix pass for missing expected files ──────────────────────────
    const expectedFiles = bundle.expected_files ?? [];
    const missing = expectedFiles.filter((f) => !writtenPaths.includes(f));

    if (missing.length > 0 && deadlineMs - Date.now() > 60_000) {
      console.log(`  🔄 [session] Fix pass: ${missing.length} missing file(s)`);
      await reportEvent(config, job.id, "retry", { reason: "missing_expected_files", missing, written: writtenPaths });

      const fixMs = Math.max(10_000, deadlineMs - Date.now() - REPORT_RESERVE_MS);
      const beforeFix = walkDir(workDir);
      const pass2 = await runSession(buildFixPassPrompt(job, missing, writtenPaths), workDir, fixMs);

      if (pass2.output) await reportEvent(config, job.id, "stdout", { text: pass2.output.slice(0, 50_000), pass: 2 });
      const afterFix = walkDir(workDir);
      const fixWritten = collectWrittenFiles(workDir, beforeFix, afterFix);
      for (const [p, c] of Object.entries(fixWritten)) written[p] = c;

      const totalPaths = Object.keys(written);
      console.log(`  📝 [session] After fix pass: ${totalPaths.length} file(s) total`);
    }

    const allowedScope = job.allowed_paths?.length ? job.allowed_paths : ["**"];
    const { kept: scopedWritten, rejected: rejectedPaths } = enforceArtifactScope(written, allowedScope);

    if (rejectedPaths.length > 0) {
      rejectedPaths.forEach((filePath) => revertOutOfScopeFile(workDir, filePath));
      const violationSummary = [
        `Scope enforcement removed ${rejectedPaths.length} out-of-scope file(s).`,
        ...rejectedPaths.slice(0, 10).map((filePath) => `- ${filePath}`),
        rejectedPaths.length > 10 ? `... and ${rejectedPaths.length - 10} more` : "",
      ].filter(Boolean).join("\n");
      console.warn(`  ⚠️ [session] ${violationSummary}`);
      await reportEvent(config, job.id, "stderr", {
        text: violationSummary,
        scope_violation: true,
        removed_paths: rejectedPaths.slice(0, 25),
      });
    }

    // ── Git checkpoint ───────────────────────────────────────────────────────
    if (config.enableCheckpoints) createCheckpoint(workDir, `session:${job.id.slice(0, 8)}`);

    // ── Write to shared session build dir ────────────────────────────────────
    if (job.session_id && Object.keys(scopedWritten).length > 0) {
      const buildDir = join(config.workspaceDir, "builds", job.session_id.slice(0, 8));
      for (const [filePath, content] of Object.entries(scopedWritten)) {
        const fullPath = resolveSafeArtifactPath(buildDir, filePath);
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, content, "utf-8");
      }
      console.log(`  📂 [session] → builds/${job.session_id.slice(0, 8)}/`);
      if (config.enableCheckpoints) {
        if (ensureGitRepo(buildDir)) createCheckpoint(buildDir, `session:${job.id.slice(0, 8)}`);
      }
    }

    // ── Complete ─────────────────────────────────────────────────────────────
    const manifestArray: ArtifactManifestEntry[] = Object.entries(scopedWritten).map(([path, content]) => ({
      path, content, operation: "create" as const,
    }));
    jobSucceeded = manifestArray.length > 0;

    if (jobSucceeded) {
      await reportArtifactManifest(config, job.id, manifestArray);
      await completeJob(config, job.id, true, {
        result_summary: rejectedPaths.length > 0
          ? `Session build: ${manifestArray.length} file(s) written (${rejectedPaths.length} out-of-scope file(s) removed)`
          : `Session build: ${manifestArray.length} file(s) written`,
        artifact_manifest: maybeInlineArtifactManifest(manifestArray),
      });
    } else {
      await completeJob(config, job.id, false, {
        result_summary: pass1.output?.slice(0, 10_000) ?? "",
        error_text: rejectedPaths.length > 0
          ? "Session wrote only out-of-scope files — all outputs were discarded."
          : "Session produced no files — check adapter stdout events for details.",
      });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ [session] ${job.id.slice(0, 8)} failed:`, message);
    try {
      await reportEvent(config, job.id, "error", { message });
      await completeJob(config, job.id, false, { error_text: message });
    } catch (reportErr) {
      console.error("  Failed to report error:", reportErr);
    }
  } finally {
    if (existsSync(jobDir)) {
      if (jobSucceeded && config.keepSucceededWorkspaces) {
        try {
          const namedDir = join(config.workspaceDir, `${job.repo_name ?? "session"}-${job.id.slice(0, 8)}`);
          renameSync(jobDir, namedDir);
          console.log(`  📁 [session] Workspace preserved: ${namedDir}`);
        } catch {
          console.warn(`  ⚠ Could not rename workspace ${jobDir}`);
        }
      } else {
        try {
          rmSync(jobDir, { recursive: true, force: true });
        } catch {
          console.warn(`  ⚠ Could not clean up ${jobDir}`);
        }
      }
    }
  }
}

/**
 * Attempts to parse a JSON manifest object {"path":..., "content":...} from a string.
 * Handles LLM-produced JSON that may have bad escape sequences (e.g. \[ \' in content)
 * by re-escaping any backslash not followed by a valid JSON escape char.
 */
function tryParseManifest(s: string): { path: string; content: string } | null {
  const attempts = [
    s,
    // Fix invalid escape sequences: \X where X ∉ valid JSON escapes → \\X
    s.replace(/\\([^"\\\/bfnrtu\n\r])/g, "\\\\$1"),
  ];

  for (const candidate of attempts) {
    try {
      const p = JSON.parse(candidate) as Record<string, unknown>;
      if (typeof p.path === "string" && typeof p.content === "string") {
        return { path: p.path, content: p.content };
      }
    } catch {
      // try next candidate
    }
  }
  return null;
}

/**
 * Extracts file content from CLI adapter text output.
 *
 * Strategy 0: JSON manifest — build prompts ask models to return
 *   {"path":"...","content":"...","operation":"create"}. If that's present
 *   (directly, inside a code fence, or greedily from first '{'), extract
 *   the content field only. This prevents raw JSON envelopes being written
 *   to disk as the file content.
 *
 * Strategy 1: Largest markdown code fence (Claude --print mode).
 * Strategy 2: Raw output when it looks like source code.
 */
function extractFileContent(output: string): string {
  const text = output.trim();

  // ── Strategy 0: JSON manifest extraction ──────────────────────────────────

  // 0a: entire output is the manifest
  const direct = tryParseManifest(text);
  if (direct) return direct.content;

  // 0b: manifest is inside a code fence
  const fenceJson = /```(?:json)?\s*\n([\s\S]*?)\n```/m.exec(text);
  if (fenceJson) {
    const fromFence = tryParseManifest(fenceJson[1].trim());
    if (fromFence) return fromFence.content;
  }

  // 0c: greedy — find first '{' and attempt parse from there
  const jsonStart = text.indexOf("{");
  if (jsonStart >= 0) {
    const greedy = tryParseManifest(text.slice(jsonStart));
    if (greedy) return greedy.content;
  }

  // ── Strategy 1: Largest fenced code block ─────────────────────────────────
  const fencePattern = /```[\w]*\n([\s\S]*?)```/g;
  let bestBlock = "";
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(output)) !== null) {
    const block = match[1].trim();
    if (block.length > bestBlock.length) {
      bestBlock = block;
    }
  }

  if (bestBlock.length > 50) return bestBlock;

  // ── Strategy 2: Raw code output (Claude --print bare code) ────────────────
  const lines = output.trim().split("\n");
  const codeIndicators = lines.filter(l =>
    /^(import |export |const |let |var |function |class |<|\/\/|\/\*|\{|\}|#|@|<!DOCTYPE)/.test(l.trim())
  ).length;

  if (codeIndicators > lines.length * 0.3) {
    return output.trim();
  }

  // ── Strategy 3: Nothing usable ────────────────────────────────────────────
  return "";
}
