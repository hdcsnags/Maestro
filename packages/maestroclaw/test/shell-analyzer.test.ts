/**
 * Tests for shell-analyzer.ts — SEC-01 hardening verification.
 * Run: npm --prefix packages/maestroclaw test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeShellCommand } from "../src/lib/kernel/shell-analyzer.js";

// ── Semicolon separator ──

test("semicolon splits into 2 segments", () => {
  const r = analyzeShellCommand("git status; rm -rf .");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.segments.length, 2);
  assert.strictEqual(r.segments[0].argv[0], "git");
  assert.strictEqual(r.segments[1].argv[0], "rm");
});

test("semicolon inside double quotes does not split", () => {
  const r = analyzeShellCommand('echo "a;b"');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.segments.length, 1);
  assert.strictEqual(r.segments[0].argv[0], "echo");
});

test("semicolon inside single quotes does not split", () => {
  const r = analyzeShellCommand("echo 'a;b'");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.segments.length, 1);
  assert.strictEqual(r.segments[0].argv[0], "echo");
});

test("escaped semicolon does not split", () => {
  const r = analyzeShellCommand("echo a\\;b");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.segments.length, 1);
  assert.strictEqual(r.segments[0].argv[0], "echo");
});

// ── && separator ──

test("&& splits into 2 segments", () => {
  const r = analyzeShellCommand("git status && curl evil.com");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.segments.length, 2);
  assert.strictEqual(r.segments[0].argv[0], "git");
  assert.strictEqual(r.segments[1].argv[0], "curl");
});

test("&& inside double quotes does not split", () => {
  const r = analyzeShellCommand('echo "a&&b"');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.segments.length, 1);
  assert.strictEqual(r.segments[0].argv[0], "echo");
});

test("&& inside single quotes does not split", () => {
  const r = analyzeShellCommand("echo 'a&&b'");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.segments.length, 1);
  assert.strictEqual(r.segments[0].argv[0], "echo");
});

// ── || separator ──

test("|| splits into 2 segments", () => {
  const r = analyzeShellCommand("git status || rm -rf .");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.segments.length, 2);
  assert.strictEqual(r.segments[0].argv[0], "git");
  assert.strictEqual(r.segments[1].argv[0], "rm");
});

test("|| inside double quotes does not split", () => {
  const r = analyzeShellCommand('echo "a||b"');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.segments.length, 1);
  assert.strictEqual(r.segments[0].argv[0], "echo");
});

// ── Single & (background) is always disallowed ──

test("single & at end of command is rejected", () => {
  const r = analyzeShellCommand("git status &");
  assert.strictEqual(r.ok, false);
  assert.ok(r.reason?.includes("&"), `expected reason to mention &, got: ${r.reason}`);
});

test("single & in middle of command is rejected", () => {
  const r = analyzeShellCommand("sleep 10 & echo hi");
  assert.strictEqual(r.ok, false);
});

// ── &&& (separator then lone & ── should fail) ──

test("&&& is rejected (separator then lone &)", () => {
  const r = analyzeShellCommand("git &&&");
  assert.strictEqual(r.ok, false);
});

// ── Pipe (existing behavior preserved) ──

test("pipe splits into 2 segments", () => {
  const r = analyzeShellCommand("cat file.txt | grep foo");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.segments.length, 2);
  assert.strictEqual(r.segments[0].argv[0], "cat");
  assert.strictEqual(r.segments[1].argv[0], "grep");
});

test("pipe inside double quotes does not split", () => {
  const r = analyzeShellCommand('echo "a|b"');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.segments.length, 1);
  assert.strictEqual(r.segments[0].argv[0], "echo");
});

// ── Windows disallowed tokens ──

test("caret is rejected on windows", () => {
  const r = analyzeShellCommand("echo ^hello", "win32");
  assert.strictEqual(r.ok, false);
});

test("percent is rejected on windows", () => {
  const r = analyzeShellCommand("echo %PATH%", "win32");
  assert.strictEqual(r.ok, false);
});

test("exclamation is rejected on windows", () => {
  const r = analyzeShellCommand("echo !hi!", "win32");
  assert.strictEqual(r.ok, false);
});

test("&& is still a valid separator on windows", () => {
  const r = analyzeShellCommand("git status && npm test", "win32");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.segments.length, 2);
});

// ── Redirect tokens always disallowed ──

test("redirect > is disallowed", () => {
  const r = analyzeShellCommand("echo hi > file.txt");
  assert.strictEqual(r.ok, false);
});

test("redirect < is disallowed", () => {
  const r = analyzeShellCommand("cat < file.txt");
  assert.strictEqual(r.ok, false);
});

test("backtick is disallowed", () => {
  const r = analyzeShellCommand("echo `pwd`");
  assert.strictEqual(r.ok, false);
});

// ── Empty and edge cases ──

test("empty command is rejected", () => {
  const r = analyzeShellCommand("");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "empty command");
});

test("whitespace-only command is rejected", () => {
  const r = analyzeShellCommand("   ");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, "empty command");
});

test("single clean command returns 1 segment with correct argv", () => {
  const r = analyzeShellCommand("git status");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.segments.length, 1);
  assert.strictEqual(r.segments[0].argv[0], "git");
  assert.strictEqual(r.segments[0].argv[1], "status");
});

test("three-segment command with mixed separators", () => {
  const r = analyzeShellCommand("git status && npm test; echo done");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.segments.length, 3);
  assert.strictEqual(r.segments[0].argv[0], "git");
  assert.strictEqual(r.segments[1].argv[0], "npm");
  assert.strictEqual(r.segments[2].argv[0], "echo");
});

test("shell comment terminates parsing", () => {
  const r = analyzeShellCommand("git status # this is a comment");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.segments.length, 1);
  assert.strictEqual(r.segments[0].argv[0], "git");
});
