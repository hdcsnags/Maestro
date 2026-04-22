import { mkdirSync, rmSync, renameSync, existsSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname, resolve, extname, sep } from "node:path";
import { execFileSync } from "node:child_process";
import type { ClawConfig } from "./config.js";
import type { ExecutorJob } from "./api.js";
import { reportEvent, completeJob } from "./api.js";
import { getAdapter } from "./adapters/index.js";

function resolveSafeArtifactPath(rootDir: string, filePath: string): string {
  const resolvedRoot = resolve(rootDir);
  const resolvedPath = resolve(rootDir, filePath);

  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + sep)) {
    throw new Error(`Artifact path escapes workspace: ${filePath}`);
  }

  return resolvedPath;
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

      const manifestArray = Object.entries(artifacts).map(([path, content]) => ({
        path,
        content,
        operation: "create",
      }));

      await reportEvent(config, job.id, "artifact", { manifest: manifestArray });
      await completeJob(config, job.id, true, {
        result_summary: `${retryBadge}${finalOutput.slice(0, 10_000)}`,
        artifact_manifest: manifestArray,
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

/**
 * Extracts file content from CLI adapter text output.
 * Claude --print mode wraps code in markdown fences. This strips them
 * and returns the inner content. Falls back to raw output if no fences found.
 */
function extractFileContent(output: string): string {
  // Strategy 1: Find the largest fenced code block
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

  // Strategy 2: If output looks like raw code (no markdown prose),
  // use it directly — Claude sometimes outputs bare code with --print
  const lines = output.trim().split("\n");
  const codeIndicators = lines.filter(l =>
    /^(import |export |const |let |var |function |class |<|\/\/|\/\*|\{|\}|#|@|<!DOCTYPE)/.test(l.trim())
  ).length;

  if (codeIndicators > lines.length * 0.3) {
    return output.trim();
  }

  // Strategy 3: Nothing usable
  return "";
}
