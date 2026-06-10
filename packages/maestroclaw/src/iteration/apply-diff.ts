// PRO-02 — Diff application with per-step git checkpoints.
//
// The iteration loop applies one diff per step, runs verification, and rolls
// back the diff if verification fails. Per-step git commits (atomic, squashable
// at loop end) preserve restart-resilience: kill the worker mid-loop, restart,
// pick up exactly where it was.
//
// Critical correctness paths:
// 1. Diff path validation — block out-of-scope file writes BEFORE git apply.
// 2. Pre-apply checkpoint — capture HEAD SHA so we can `git reset --hard` on
//    verification failure.
// 3. `git apply --check` first — dry-run validates context lines match before
//    actually mutating the working tree.
// 4. Stage-don't-commit during apply — let the verification step decide
//    whether to commit (success) or rollback (failure).
//
// See PRO-02_ITERATION_LOOP_SPEC.md §"The Diff Application Logic".

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

export interface ApplyDiffInput {
  workDir: string;
  diff: string;
  scope_paths: string[];        // glob patterns from iteration_loops.scope_paths
}

export interface ApplyDiffSuccess {
  ok: true;
  pre_apply_sha: string;        // SHA before apply, for rollback
  touched_files: string[];      // paths the diff actually modified
}

export interface ApplyDiffFailure {
  ok: false;
  reason:
    | "empty_diff"
    | "out_of_scope"
    | "git_apply_check_failed"
    | "git_apply_failed"
    | "git_command_error"
    | "stale_base";              // detected via apply --check failing on context
  details?: string;
  out_of_scope_paths?: string[]; // populated when reason='out_of_scope'
}

export type ApplyDiffResult = ApplyDiffSuccess | ApplyDiffFailure;

/**
 * Apply a unified diff to the workspace, validating scope first.
 *
 * Stages the changes (`git add`) but does NOT commit. The caller decides:
 *   - Verification passed → commit via `commitStep()`
 *   - Verification failed → rollback via `rollbackStep(workDir, pre_apply_sha)`
 */
export function applyDiffWithCheckpoint(input: ApplyDiffInput): ApplyDiffResult {
  if (!input.diff || input.diff.trim().length === 0) {
    return { ok: false, reason: "empty_diff" };
  }

  // 1. Parse paths from the diff and validate against scope.
  let touchedPaths: string[];
  try {
    touchedPaths = parseUnifiedDiffPaths(input.diff);
  } catch (err) {
    return {
      ok: false,
      reason: "git_command_error",
      details: `parseUnifiedDiffPaths: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (touchedPaths.length === 0) {
    return { ok: false, reason: "empty_diff", details: "no file paths found in diff" };
  }

  const outOfScope = touchedPaths.filter(p => !matchesAnyScope(p, input.scope_paths));
  if (outOfScope.length > 0) {
    return {
      ok: false,
      reason: "out_of_scope",
      out_of_scope_paths: outOfScope,
      details: `Diff touches files outside scope: ${outOfScope.join(", ")}`,
    };
  }

  // 2. Capture pre-apply SHA for rollback.
  let preApplySha: string;
  try {
    preApplySha = execGit(input.workDir, ["rev-parse", "HEAD"]).trim();
  } catch (err) {
    return {
      ok: false,
      reason: "git_command_error",
      details: `rev-parse HEAD: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // 3. Write diff to temp file and dry-run via git apply --check.
  const tempDir = mkdtempSync(join(tmpdir(), "maestroclaw-iter-"));
  const diffPath = join(tempDir, "step.diff");

  try {
    writeFileSync(diffPath, input.diff);

    try {
      execGit(input.workDir, ["apply", "--check", diffPath]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Distinguish stale-base errors (context line mismatch) from generic
      // apply failures so the runner can decide whether to re-read files
      // and re-prompt vs. tell the agent its diff was malformed.
      const isStale = /does not match|patch failed|hunk #\d+ FAILED/i.test(message);
      return {
        ok: false,
        reason: isStale ? "stale_base" : "git_apply_check_failed",
        details: message,
      };
    }

    // 4. Real apply.
    try {
      execGit(input.workDir, ["apply", diffPath]);
    } catch (err) {
      // Should be rare since check passed; could happen on race.
      return {
        ok: false,
        reason: "git_apply_failed",
        details: err instanceof Error ? err.message : String(err),
      };
    }

    // 5. Stage but DO NOT commit. Verification phase decides.
    try {
      execGit(input.workDir, ["add", ...touchedPaths]);
    } catch (err) {
      return {
        ok: false,
        reason: "git_command_error",
        details: `git add: ${err instanceof Error ? err.message : String(err)}`,
      };
    }

    return {
      ok: true,
      pre_apply_sha: preApplySha,
      touched_files: touchedPaths,
    };
  } finally {
    try { rmSync(tempDir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

/**
 * Roll back a step by hard-resetting to the pre-apply SHA. Discards all
 * working tree changes and staged content beyond that point. Safe to call
 * after a failed apply OR after a successful apply but failed verification.
 */
export function rollbackStep(workDir: string, preApplySha: string): { ok: true } | { ok: false; details: string } {
  try {
    execGit(workDir, ["reset", "--hard", preApplySha]);
    // Also clean any untracked files the diff might have created. -fd handles
    // both files and directories. Skip ignored files (-x not used) so we
    // don't nuke node_modules etc. accidentally.
    execGit(workDir, ["clean", "-fd"]);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      details: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Commit a successful step. The caller composes the message; we just shell
 * out to git commit. Returns the new HEAD SHA so iteration_steps can record
 * the post-step commit.
 */
export function commitStep(
  workDir: string,
  message: string,
): { ok: true; sha: string } | { ok: false; details: string } {
  try {
    // --allow-empty? No — if a step's diff resolves to no actual file change,
    // that's a model bug and should fail loudly rather than create empty
    // history pollution.
    execGit(workDir, ["commit", "-m", message]);
    const sha = execGit(workDir, ["rev-parse", "HEAD"]).trim();
    return { ok: true, sha };
  } catch (err) {
    return {
      ok: false,
      details: err instanceof Error ? err.message : String(err),
    };
  }
}

// ──────────────────────────────────────────────────────────────────────
// Diff path parsing.
// ──────────────────────────────────────────────────────────────────────

/**
 * Extract the set of file paths a unified diff touches. Looks at lines like:
 *
 *   diff --git a/src/foo.ts b/src/foo.ts
 *   --- a/src/foo.ts
 *   +++ b/src/foo.ts
 *
 * Returns the b/ paths (post-state). Handles new file creation (--- /dev/null)
 * and deletion (+++ /dev/null) by using the non-/dev/null side.
 */
export function parseUnifiedDiffPaths(diff: string): string[] {
  const paths = new Set<string>();
  const lines = diff.split("\n");

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      // Format: diff --git a/path b/path
      // Both paths usually identical except in renames. Take the b/ path.
      const match = line.match(/^diff --git a\/(\S+) b\/(\S+)/);
      if (match) {
        paths.add(match[2]);
        continue;
      }
    }
    if (line.startsWith("+++ ")) {
      // Format: +++ b/path  OR  +++ /dev/null
      const rest = line.slice(4).trim();
      if (rest === "/dev/null") continue;
      // Strip leading "b/"
      const cleaned = rest.startsWith("b/") ? rest.slice(2) : rest;
      paths.add(cleaned);
    }
    if (line.startsWith("--- ")) {
      // Capture the a/ path too in case +++ was /dev/null (deletion).
      const rest = line.slice(4).trim();
      if (rest === "/dev/null") continue;
      const cleaned = rest.startsWith("a/") ? rest.slice(2) : rest;
      paths.add(cleaned);
    }
  }

  return [...paths];
}

// ──────────────────────────────────────────────────────────────────────
// Scope matching.
// ──────────────────────────────────────────────────────────────────────

/**
 * Test whether a file path matches any of the scope glob patterns.
 *
 * Supports the common subset of glob syntax used in scope_paths:
 *   - **      → any number of path segments (including zero)
 *   - *       → any number of non-/ characters
 *   - ?       → any single non-/ character
 *   - literals match themselves
 *
 * Examples:
 *   matchesAnyScope("src/auth/login.ts", ["src/auth/**"])    → true
 *   matchesAnyScope("src/auth/login.ts", ["src/auth/*.ts"])  → true
 *   matchesAnyScope("src/api/auth.ts",   ["src/auth/**"])    → false
 */
export function matchesAnyScope(filePath: string, scopePaths: string[]): boolean {
  if (scopePaths.length === 0) return false;
  const normalized = filePath.replace(/^\.\//, "").replace(/\\/g, "/");
  // "." / "./" / "" all mean "entire workspace — no restriction"
  if (scopePaths.some(p => p === "." || p === "" || p === "./" || p === "**")) return true;
  return scopePaths.some(pattern => globMatch(normalized, pattern));
}

function globMatch(path: string, pattern: string): boolean {
  // Build a regex that respects the glob semantics described above.
  const regex = globToRegex(pattern);
  return regex.test(path);
}

function globToRegex(pattern: string): RegExp {
  // Escape regex specials except *, ?, /
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i];
    if (ch === "*") {
      // Look ahead for ** (matches any segments including /)
      if (pattern[i + 1] === "*") {
        out += ".*";
        i += 2;
        // Eat optional trailing slash so "src/**" and "src/**/" both work.
        if (pattern[i] === "/") i++;
        continue;
      }
      // Single * — match non-slash characters
      out += "[^/]*";
      i++;
      continue;
    }
    if (ch === "?") {
      out += "[^/]";
      i++;
      continue;
    }
    if (/[.+^$(){}|[\]\\]/.test(ch)) {
      out += "\\" + ch;
      i++;
      continue;
    }
    out += ch;
    i++;
  }
  return new RegExp("^" + out + "$");
}

// ──────────────────────────────────────────────────────────────────────
// Git command runner.
// ──────────────────────────────────────────────────────────────────────

function execGit(workDir: string, args: string[]): string {
  // synchronous; the iteration loop is sequential per loop and the runner
  // already tolerates stalls via its own timeout. Sync keeps error handling
  // straightforward.
  return execFileSync("git", args, {
    cwd: workDir,
    encoding: "utf8",
    // Suppress git's stderr noise when commands succeed; it leaks into logs.
    stdio: ["ignore", "pipe", "pipe"],
  });
}
