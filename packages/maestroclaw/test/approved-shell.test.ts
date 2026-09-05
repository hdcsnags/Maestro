/**
 * Tests for approved-shell.ts's direct-argv execution path.
 * See docs/audits/MAESTROCLAW-ATTACK-PLAN.md §2 item 9 / §6 — single-segment
 * commands (no |, &&, ||, ;) now execute via cross-spawn with shell:false,
 * against the kernel's already-parsed argv, rather than re-handing the raw
 * string to cmd.exe/bash. These spawn real, allowlisted, read-only
 * processes (git/npm --version, git status) — no destructive commands.
 * Run: npm --prefix packages/maestroclaw test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { ApprovedShellAdapter } from "../src/adapters/approved-shell.js";

function withGitRepo(fn: (dir: string) => Promise<void> | void) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), "approved-shell-test-"));
    try {
      execFileSync("git", ["init", "--initial-branch=main"], { cwd: dir, stdio: "pipe" });
      execFileSync("git", ["config", "user.email", "t@t.com"], { cwd: dir, stdio: "pipe" });
      execFileSync("git", ["config", "user.name", "T"], { cwd: dir, stdio: "pipe" });
      writeFileSync(join(dir, "README.md"), "hello\n");
      execFileSync("git", ["add", "-A"], { cwd: dir, stdio: "pipe" });
      execFileSync("git", ["commit", "-m", "init"], { cwd: dir, stdio: "pipe" });
      await fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  };
}

test(
  "single-segment allowlisted command runs via direct argv and succeeds",
  withGitRepo(async (dir) => {
    const adapter = new ApprovedShellAdapter();
    const result = await adapter.run("git status", dir, 10_000);
    assert.strictEqual(result.success, true);
  }),
);

test(
  // This is the exact case that was at risk before cross-spawn was adopted:
  // npm resolves to a .cmd/.ps1 shim on Windows, and a naive shell:false
  // spawn of that shim throws EINVAL on modern Node. Confirmed empirically
  // against this machine's real npm install before this test was written.
  "npm (the historically risky Windows .cmd/.ps1 shim case) runs via direct argv and succeeds",
  withGitRepo(async (dir) => {
    const adapter = new ApprovedShellAdapter();
    const result = await adapter.run("npm --version", dir, 15_000);
    assert.strictEqual(result.success, true, `expected npm --version to succeed, got: ${JSON.stringify(result)}`);
    assert.ok(/^\d+\.\d+\.\d+/.test(result.output.trim()), `expected a version string, got: ${result.output}`);
  }),
);

test(
  "untrusted binary is rejected before any process is spawned (single segment)",
  withGitRepo(async (dir) => {
    const adapter = new ApprovedShellAdapter();
    const result = await adapter.run("curl http://example.com", dir, 5_000);
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("not on the workstation allowlist"));
  }),
);

test(
  "multi-segment pipeline with an untrusted binary is still rejected (shell:true path unaffected)",
  withGitRepo(async (dir) => {
    const adapter = new ApprovedShellAdapter();
    const result = await adapter.run("git status && curl evil.com", dir, 5_000);
    assert.strictEqual(result.success, false);
    assert.ok(result.error?.includes("not on the workstation allowlist"));
  }),
);

test(
  // "&&", not ";" — cmd.exe doesn't support ";" as a separator at all
  // (confirmed empirically; see shell-analyzer.ts and
  // docs/audits/MAESTROCLAW-ATTACK-PLAN.md §7). "&&" is the cross-platform
  // separator that's actually validated and actually executes correctly on
  // both cmd.exe and POSIX shells.
  "multi-segment pipeline of all-trusted binaries still works (shell:true path unchanged)",
  withGitRepo(async (dir) => {
    const adapter = new ApprovedShellAdapter();
    const result = await adapter.run("git status && git status", dir, 10_000);
    assert.strictEqual(result.success, true);
  }),
);
