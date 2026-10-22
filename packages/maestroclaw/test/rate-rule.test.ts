import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { seedRulings, applyRuling, loadRulings } from "../src/council/rule.js";
import { buildMatrix } from "../src/council/matrix.js";
import { score, renderReport } from "../src/rate/score.js";
import type { RateRecord } from "../src/rate/ingest.js";

test("rulings: seed from matrix, verify-before-rule enforced, lifecycle", () => {
  const verdicts = {
    a: { attestation: { ran_verifier: true }, items: [{ id: "Q1", stance: "agree", summary: "fine" }, { id: "Q2", stance: "disagree", summary: "bad", claims: [{ text: "t", status: "verified", evidence: "x.ts:1" }] }] },
    b: { items: [{ id: "Q1", stance: "agree", summary: "fine" }, { id: "Q2", stance: "partial", summary: "meh" }] },
  };
  const dir = mkdtempSync(join(tmpdir(), "rule-"));
  const m = buildMatrix("run-x", verdicts as never);
  const seeded = seedRulings(dir, m);
  assert.equal(seeded.length, 1);
  assert.equal(seeded[0].item, "Q2");
  assert.deepEqual(seeded[0].raised_by, ["a", "b"]);
  assert.deepEqual(seeded[0].grounded_by, ["a"]);
  assert.throws(() => applyRuling(dir, "Q2", { decision: "adopt" }), /not verified/);
  applyRuling(dir, "Q2", { verify: "concierge", verifyNote: "checked" });
  const ruled = applyRuling(dir, "Q2", { decision: "adopt", by: "michael" });
  assert.equal(ruled.status, "ruled");
  const fixed = applyRuling(dir, "Q2", { commit: "abc123" });
  assert.equal(fixed.status, "fixed");
  assert.equal(applyRuling(dir, "Q2", { regress: "sol" }).status, "regressed");
  // Re-seeding keeps state
  seedRulings(dir, m);
  assert.equal(loadRulings(dir)[0].status, "regressed");
  assert.throws(() => applyRuling(dir, "Q9", { verify: "x" }), /no ruling/);
});

test("rate: score aggregates council seats and grading ranks per model+harness", () => {
  const recs: RateRecord[] = [
    { kind: "council_seat", ts: "", source: "s", task_class: "p", model: "m1", harness: "codex_cli", resolved: true, status: "done", elapsed_s: 10, verdict: "parsed", attested: true, ran_verifier: true, claims: 4, verified_claims: 3, items: 3, pushback_items: 1 },
    { kind: "council_seat", ts: "", source: "s", task_class: "p", model: "m1", harness: "codex_cli", resolved: false, status: "window", elapsed_s: 30, verdict: "missing", attested: false, ran_verifier: false, claims: 0, verified_claims: 0, items: 0, pushback_items: 0 },
    { kind: "grading_rank", ts: "", source: "g", task_class: "t1", model: "m1", harness: "codex", resolved: true, rank: 2, of: 5, human_rank: 1 },
  ];
  const rows = score(recs);
  assert.equal(rows.length, 2);
  const m1 = rows.find((r) => r.harness === "codex_cli")!;
  assert.equal(m1.runs, 2); assert.equal(m1.done, 1); assert.equal(m1.window, 1);
  assert.equal(m1.verified_claims, 3); assert.equal(m1.median_elapsed_s, 20); assert.equal(m1.resolved_share, 0.5);
  const g = rows.find((r) => r.harness === "codex")!;
  assert.deepEqual(g.grading_ranks, [2]); assert.deepEqual(g.human_ranks, [1]);
  const md = renderReport(rows, recs);
  assert.ok(md.includes("| m1 | codex_cli | 2 | 50% | 1/0 | 50% | 50% | 50% | 75% (3/4) |"));
  assert.equal(score(recs, true).length, 2);
});
