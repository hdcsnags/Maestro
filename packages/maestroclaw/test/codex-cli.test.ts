/**
 * Integration smoke tests for codex-cli.ts against the REAL installed codex
 * binary. Unlike the rest of the suite, these are not pure unit tests —
 * they exist specifically because a purely-unit-tested change (adding
 * `--ask-for-approval never` to the exec invocation in Sprint 1) shipped,
 * type-checked clean, passed every existing test, and was still completely
 * broken: `-a/--ask-for-approval` is a flag on the root `codex` command, not
 * on the `exec` subcommand, so placing it after "exec" is a hard parse error
 * ("unexpected argument '--ask-for-approval' found"). Nothing caught this
 * until the Eliana read-only proof workload actually ran codex_cli for
 * real. See docs/audits/MAESTROCLAW-ATTACK-PLAN.md §7 for the full story.
 *
 * These tests skip (not fail) if `codex` isn't installed/authenticated on
 * the machine running them — they're an empirical safety net for real
 * invocation shape, not something that should break CI on a machine without
 * Codex installed.
 * Run: npm --prefix packages/maestroclaw test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CodexCliAdapter } from "../src/adapters/codex-cli.js";

async function codexAvailable(): Promise<boolean> {
  return new CodexCliAdapter().check();
}

test("codex_cli: workspace-write (default) invocation actually parses and runs", async (t) => {
  if (!(await codexAvailable())) {
    t.skip("codex CLI not installed/available in this environment");
    return;
  }
  const workDir = mkdtempSync(join(tmpdir(), "codex-cli-test-"));
  try {
    const adapter = new CodexCliAdapter();
    const result = await adapter.run(
      "Reply with exactly these three words and nothing else: fix confirmed here",
      workDir,
      60_000,
    );
    assert.strictEqual(result.success, true, `expected success, got: ${JSON.stringify(result)}`);
    assert.ok(
      !result.error?.includes("unexpected argument"),
      "must never regress to the '--ask-for-approval after exec' parse error",
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test("codex_cli: read-only sandbox mode invocation actually parses and runs", async (t) => {
  if (!(await codexAvailable())) {
    t.skip("codex CLI not installed/available in this environment");
    return;
  }
  const workDir = mkdtempSync(join(tmpdir(), "codex-cli-test-"));
  try {
    const adapter = new CodexCliAdapter({ sandbox: "read-only" });
    const result = await adapter.run(
      "Reply with exactly these three words and nothing else: read only confirmed",
      workDir,
      60_000,
    );
    assert.strictEqual(result.success, true, `expected success, got: ${JSON.stringify(result)}`);
    assert.ok(!result.error?.includes("unexpected argument"));
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});
