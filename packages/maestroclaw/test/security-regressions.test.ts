/**
 * Integration-level regression tests for the path-traversal fixes described
 * in docs/audits/MAESTROCLAW-ATTACK-PLAN.md §2 items 1-6 and §3 items 1-6.
 * Unlike test/path-guard.test.ts (which tests the shared utility in
 * isolation), these exercise the actual call sites that were vulnerable —
 * cleanForRetry, resolveSafeArtifactPath, readFilesInScope, buildQueryPrompt,
 * and applyDiffWithCheckpoint — to make sure the fix is actually wired in,
 * not just that the underlying utility works.
 * Run: npm --prefix packages/maestroclaw test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { execFileSync } from "node:child_process";
import { cleanForRetry, resolveSafeArtifactPath } from "../src/executor.js";
import { readFilesInScope, buildQueryPrompt } from "../src/iteration/runner.js";
import { applyDiffWithCheckpoint } from "../src/iteration/apply-diff.js";

function withWorkspacePair(fn: (workDir: string, outsideDir: string) => void): void {
  const workDir = mkdtempSync(join(tmpdir(), "sec-regress-work-"));
  const outsideDir = mkdtempSync(join(tmpdir(), "sec-regress-outside-"));
  try {
    fn(workDir, outsideDir);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
    rmSync(outsideDir, { recursive: true, force: true });
  }
}

// ── executor.ts: cleanForRetry() ──
// See docs/audits/MAESTROCLAW-ATTACK-PLAN.md §3 item 2 (Critical).

test("cleanForRetry: does not delete a file outside the job workspace", () => {
  withWorkspacePair((workDir, outsideDir) => {
    const secretFile = join(outsideDir, "do-not-delete.txt");
    writeFileSync(secretFile, "important");

    // Simulate a job record whose allowed_paths[0] tries to escape via "..".
    // Both temp dirs are siblings directly under the OS temp root, so one
    // ".." from workDir lands back at the temp root, then into outsideDir.
    const relEscape = join("..", basename(outsideDir), "do-not-delete.txt");
    cleanForRetry(workDir, relEscape);

    assert.ok(existsSync(secretFile), "file outside the workspace must survive cleanForRetry");
  });
});

test("cleanForRetry: still deletes a legitimate in-workspace target", () => {
  withWorkspacePair((workDir) => {
    const target = join(workDir, "stale-output.txt");
    writeFileSync(target, "stale");
    cleanForRetry(workDir, "stale-output.txt");
    assert.ok(!existsSync(target), "legitimate in-workspace retry cleanup must still work");
  });
});

test("cleanForRetry: empty targetPath is a no-op, not a crash", () => {
  withWorkspacePair((workDir) => {
    assert.doesNotThrow(() => cleanForRetry(workDir, ""));
  });
});

// ── executor.ts: resolveSafeArtifactPath() ──
// See docs/audits/MAESTROCLAW-ATTACK-PLAN.md §3 item 5 (High).

test("resolveSafeArtifactPath: rejects an escaping artifact path", () => {
  withWorkspacePair((workDir) => {
    assert.throws(
      () => resolveSafeArtifactPath(workDir, "../../etc/passwd"),
      /escapes workspace/,
    );
  });
});

test("resolveSafeArtifactPath: allows a normal nested artifact path", () => {
  withWorkspacePair((workDir) => {
    const result = resolveSafeArtifactPath(workDir, "src/generated/file.ts");
    assert.ok(result.startsWith(workDir));
  });
});

// ── iteration/runner.ts: readFilesInScope() ──
// See docs/audits/MAESTROCLAW-ATTACK-PLAN.md §3 item 4 (High).

test("readFilesInScope: a literal scope_paths entry cannot read outside the loop workspace", () => {
  withWorkspacePair((workDir, outsideDir) => {
    writeFileSync(join(outsideDir, "secret.txt"), "TOP SECRET CONTENT");
    mkdirSync(workDir, { recursive: true });
    writeFileSync(join(workDir, "legit.ts"), "export const x = 1;");

    const results = readFilesInScope(workDir, ["legit.ts", "../../secret.txt"]);
    const paths = results.map((r) => r.path);

    assert.ok(paths.includes("legit.ts"), "in-scope file must still be read");
    assert.ok(
      !results.some((r) => r.content_for_prompt.includes("TOP SECRET CONTENT")),
      "escaping scope_paths entry must not leak outside content into the agent's file snapshot",
    );
  });
});

// ── iteration/runner.ts: buildQueryPrompt() ──
// See docs/audits/MAESTROCLAW-ATTACK-PLAN.md §3 item 1 (Critical) — the most
// serious bug in the package: a prompt-injected model's agent_query.files
// could previously make MaestroClaw itself read arbitrary host files.

test("buildQueryPrompt: model-generated agent_query.files cannot exfiltrate a file outside the workspace", () => {
  withWorkspacePair((workDir, outsideDir) => {
    writeFileSync(join(outsideDir, "credentials.txt"), "SUPER_SECRET_API_KEY=abc123");
    mkdirSync(workDir, { recursive: true });

    const prompt = buildQueryPrompt(
      {
        to: "codex_cli",
        reason: "needs review",
        question: "is this safe?",
        files: ["../../credentials.txt"],
      },
      workDir,
    );

    assert.ok(
      !prompt.includes("SUPER_SECRET_API_KEY"),
      "an escaping agent_query.files entry must never reach the peer-adapter prompt",
    );
  });
});

test("buildQueryPrompt: legitimate in-workspace agent_query.files entry still works", () => {
  withWorkspacePair((workDir) => {
    writeFileSync(join(workDir, "context.ts"), "// helpful context");
    const prompt = buildQueryPrompt(
      { to: "codex_cli", reason: "r", question: "q", files: ["context.ts"] },
      workDir,
    );
    assert.ok(prompt.includes("helpful context"));
  });
});

// ── iteration/apply-diff.ts: applyDiffWithCheckpoint() ──
// See docs/audits/MAESTROCLAW-ATTACK-PLAN.md §3 item 6 (High) — a "**" scope
// (the common default) must never be interpreted as "anywhere the OS can
// resolve to."

function initGitRepo(dir: string): void {
  execFileSync("git", ["init", "--initial-branch=main"], { cwd: dir, stdio: "pipe" });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: dir, stdio: "pipe" });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir, stdio: "pipe" });
  writeFileSync(join(dir, "README.md"), "hello\n");
  execFileSync("git", ["add", "-A"], { cwd: dir, stdio: "pipe" });
  execFileSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "pipe" });
}

test("applyDiffWithCheckpoint: rejects a diff whose path escapes the workspace even under a '**' scope", () => {
  withWorkspacePair((workDir) => {
    initGitRepo(workDir);

    const maliciousDiff = [
      "diff --git a/../../outside-evil.txt b/../../outside-evil.txt",
      "new file mode 100644",
      "index 0000000..e69de29",
      "--- /dev/null",
      "+++ b/../../outside-evil.txt",
      "@@ -0,0 +1 @@",
      "+pwned",
    ].join("\n");

    const result = applyDiffWithCheckpoint({ workDir, diff: maliciousDiff, scope_paths: ["**"] });

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.reason, "out_of_scope");
    }
    assert.ok(!existsSync(join(workDir, "..", "..", "outside-evil.txt")));
  });
});

test("applyDiffWithCheckpoint: still applies a legitimate in-scope diff under '**'", () => {
  withWorkspacePair((workDir) => {
    initGitRepo(workDir);

    // Trailing newline matters here — git apply can report "corrupt patch"
    // on a hunk with no trailing newline after its last content line, the
    // same way a real `git diff`-produced patch always ends with one.
    const goodDiff = [
      "diff --git a/new-file.txt b/new-file.txt",
      "new file mode 100644",
      "index 0000000..e69de29",
      "--- /dev/null",
      "+++ b/new-file.txt",
      "@@ -0,0 +1 @@",
      "+hello world",
      "",
    ].join("\n");

    const result = applyDiffWithCheckpoint({ workDir, diff: goodDiff, scope_paths: ["**"] });
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.ok(existsSync(join(workDir, "new-file.txt")));
    }
  });
});
