/**
 * Tests for reconcile.ts — C-06 rework verification.
 * Locks the tie-break fixes from the task-001 7-review fix-list and the
 * KEEP-IN-SYNC ranking contract with src/lib/conductor.ts.
 * Run: npm --prefix packages/maestroclaw test
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { reconcileManifests, type ManifestEntry } from "../src/conductor/reconcile.js";

function entry(partial: Partial<ManifestEntry> & { path: string; lane_name: string }): ManifestEntry {
  return { operation: "create", ...partial };
}

// ── No collisions passes through unchanged ──

test("no collisions: manifest returned as-is, no reports", () => {
  const r = reconcileManifests([
    entry({ path: "a.ts", lane_name: "x" }),
    entry({ path: "b.ts", lane_name: "y" }),
  ]);
  assert.strictEqual(r.collisions.length, 0);
  assert.strictEqual(r.resolved.length, 2);
});

// ── conductor_approved wins over everything ──

test("conductor_approved beats higher priority", () => {
  const r = reconcileManifests([
    entry({ path: "a.ts", lane_name: "z", priority: "P0" }),
    entry({ path: "a.ts", lane_name: "a", priority: "P2", conductor_approved: true }),
  ]);
  assert.strictEqual(r.resolved.length, 1);
  assert.strictEqual(r.resolved[0].lane_name, "a");
  assert.strictEqual(r.collisions.length, 1);
  assert.strictEqual(r.collisions[0].overridden.length, 1);
});

// ── priority beats lane name ──

test("lower priority number wins before lane tie-break", () => {
  const r = reconcileManifests([
    entry({ path: "a.ts", lane_name: "a", priority: "P2" }),
    entry({ path: "a.ts", lane_name: "z", priority: "P0" }),
  ]);
  assert.strictEqual(r.resolved[0].lane_name, "z");
});

// ── FULL lexicographic lane tie-break (the core F5 fix) ──

test("lane tie-break compares the FULL name, not the first code point", () => {
  // Both lanes share the first character 'c'; the old first-code-point rank
  // tied here and fell through to input order. Full lexicographic must pick
  // "claude-haiku" over "claude-opus" deterministically regardless of order.
  const forward = reconcileManifests([
    entry({ path: "a.ts", lane_name: "claude-opus" }),
    entry({ path: "a.ts", lane_name: "claude-haiku" }),
  ]);
  const reversed = reconcileManifests([
    entry({ path: "a.ts", lane_name: "claude-haiku" }),
    entry({ path: "a.ts", lane_name: "claude-opus" }),
  ]);
  assert.strictEqual(forward.resolved[0].lane_name, "claude-haiku");
  assert.strictEqual(reversed.resolved[0].lane_name, "claude-haiku");
});

// ── non-ASCII lane names do not cause priority inversion ──

test("non-ASCII lane name does not leak across the priority band", () => {
  // Old code did `pRank * 1000 + codePointAt(0)`; a CJK lead char (> 1000)
  // could make a P1 entry outrank a P0. Tiered comparison must keep P0 first.
  const r = reconcileManifests([
    entry({ path: "a.ts", lane_name: "语言", priority: "P0" }),
    entry({ path: "a.ts", lane_name: "a", priority: "P1" }),
  ]);
  assert.strictEqual(r.resolved[0].priority, "P0");
});

// ── same-lane collision resolves deterministically by input index ──

test("identical rank falls back to stable input order, not unspecified", () => {
  const a = entry({ path: "a.ts", lane_name: "same", content: "first" });
  const b = entry({ path: "a.ts", lane_name: "same", content: "second" });
  assert.strictEqual(reconcileManifests([a, b]).resolved[0].content, "first");
  assert.strictEqual(reconcileManifests([b, a]).resolved[0].content, "second");
});

// ── empty lane_name does not throw (was a non-null assertion) ──

test("empty lane_name is handled without throwing", () => {
  const r = reconcileManifests([
    entry({ path: "a.ts", lane_name: "" }),
    entry({ path: "a.ts", lane_name: "named" }),
  ]);
  // "" sorts before "named" lexicographically → empty-lane entry wins, but
  // deterministically and without a crash.
  assert.strictEqual(r.resolved.length, 1);
  assert.strictEqual(r.collisions.length, 1);
});
