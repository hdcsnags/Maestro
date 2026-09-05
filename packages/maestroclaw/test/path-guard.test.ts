/**
 * Tests for lib/path-guard.ts — closes the path-traversal bugs described in
 * docs/audits/MAESTROCLAW-ATTACK-PLAN.md §2 items 1-6.
 * Run: npm --prefix packages/maestroclaw test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  resolveContained,
  resolveContainedRealpath,
  tryResolveContainedRealpath,
  isPathEscaping,
  PathEscapeError,
} from "../src/lib/path-guard.js";

function withTempDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "path-guard-test-"));
  try {
    fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ── resolveContained (lexical) ──

test("resolveContained: normal relative path stays inside root", () => {
  withTempDir((root) => {
    const result = resolveContained(root, "src/index.ts");
    assert.ok(result.startsWith(root));
  });
});

test("resolveContained: '..' traversal is rejected", () => {
  withTempDir((root) => {
    assert.throws(() => resolveContained(root, "../../etc/passwd"), PathEscapeError);
  });
});

test("resolveContained: absolute path outside root is rejected", () => {
  withTempDir((root) => {
    const outside = mkdtempSync(join(tmpdir(), "outside-"));
    try {
      assert.throws(() => resolveContained(root, outside), PathEscapeError);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

test("resolveContained: root itself is allowed", () => {
  withTempDir((root) => {
    assert.doesNotThrow(() => resolveContained(root, "."));
  });
});

// ── resolveContainedRealpath (symlink-aware) ──

test("resolveContainedRealpath: normal file inside root is allowed", () => {
  withTempDir((root) => {
    writeFileSync(join(root, "file.txt"), "hi");
    assert.doesNotThrow(() => resolveContainedRealpath(root, "file.txt"));
  });
});

test("resolveContainedRealpath: nonexistent path under root is allowed (write case)", () => {
  withTempDir((root) => {
    assert.doesNotThrow(() => resolveContainedRealpath(root, "not-yet-written.txt"));
  });
});

test("resolveContainedRealpath: '..' traversal is rejected", () => {
  withTempDir((root) => {
    assert.throws(() => resolveContainedRealpath(root, "../../secret"), PathEscapeError);
  });
});

test("resolveContainedRealpath: symlink escaping the workspace is rejected", (t) => {
  withTempDir((root) => {
    const outside = mkdtempSync(join(tmpdir(), "symlink-target-"));
    writeFileSync(join(outside, "secret.txt"), "top secret");
    const linkPath = join(root, "innocuous-looking-dir");
    try {
      symlinkSync(outside, linkPath, "dir");
    } catch (err) {
      // Symlink creation can require elevated privileges on some Windows
      // configurations — skip rather than fail the suite in that case.
      t.skip(`symlink creation not permitted in this environment: ${err instanceof Error ? err.message : String(err)}`);
      rmSync(outside, { recursive: true, force: true });
      return;
    }
    try {
      assert.throws(
        () => resolveContainedRealpath(root, "innocuous-looking-dir/secret.txt"),
        PathEscapeError,
      );
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

test("tryResolveContainedRealpath: returns null instead of throwing on escape", () => {
  withTempDir((root) => {
    assert.strictEqual(tryResolveContainedRealpath(root, "../../etc/passwd"), null);
  });
});

test("tryResolveContainedRealpath: returns resolved path on success", () => {
  withTempDir((root) => {
    mkdirSync(join(root, "sub"), { recursive: true });
    const result = tryResolveContainedRealpath(root, "sub/file.txt");
    assert.ok(result !== null && result.startsWith(root));
  });
});

// ── isPathEscaping (raw-string check, used before any directory join) ──

test("isPathEscaping: plain relative path is not escaping", () => {
  assert.strictEqual(isPathEscaping("src/index.ts"), false);
});

test("isPathEscaping: '..' segment is escaping", () => {
  assert.strictEqual(isPathEscaping("../../etc/passwd"), true);
});

test("isPathEscaping: '..' segment mid-path is escaping", () => {
  assert.strictEqual(isPathEscaping("src/../../etc/passwd"), true);
});

test("isPathEscaping: POSIX absolute path is escaping", () => {
  assert.strictEqual(isPathEscaping("/etc/passwd"), true);
});

test("isPathEscaping: Windows drive-letter absolute path is escaping", () => {
  assert.strictEqual(isPathEscaping("C:\\Windows\\System32\\config"), true);
});

test("isPathEscaping: UNC path is escaping", () => {
  assert.strictEqual(isPathEscaping("\\\\server\\share\\file"), true);
});

test("isPathEscaping: '**' as a literal filename component is fine (not a scope glob here)", () => {
  // isPathEscaping operates on a single concrete diff-touched path, never on
  // a scope pattern — a literal path containing '*' characters isn't a glob
  // and isn't an escape by itself.
  assert.strictEqual(isPathEscaping("src/weird*file.txt"), false);
});
