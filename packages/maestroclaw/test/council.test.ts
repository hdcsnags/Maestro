import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseSeats, SEAT_CATALOG } from "../src/council/seats.js";
import { extractVerdict, withContract, hasContract, reaskPrompt, BEGIN, END } from "../src/council/verdict.js";
import { buildMatrix, renderMatrix, loadVerdicts } from "../src/council/matrix.js";
import { classifyExit, parseCodexBanner } from "../src/council/run.js";
import { parseArgs } from "../src/council/cli.js";

test("parseSeats: catalog labels, explicit adapter:model, errors", () => {
  const s = parseSeats("astra,gemini,sol");
  assert.deepEqual(s.map((x) => x.adapter), ["codex_cli", "agy_cli", "codex_cli"]);
  assert.equal(s[0].model, SEAT_CATALOG.astra.model);
  assert.equal(s[2].model, undefined);
  const custom = parseSeats("rev=codex_cli:gpt-6-astra,g=agy_cli");
  assert.deepEqual(custom[0], { label: "rev", adapter: "codex_cli", model: "gpt-6-astra" });
  assert.deepEqual(custom[1], { label: "g", adapter: "agy_cli", model: undefined });
  assert.throws(() => parseSeats("nope"), /unknown seat/);
  assert.throws(() => parseSeats("x=foo_cli:m"), /unknown adapter/);
  assert.throws(() => parseSeats("sol,sol"), /duplicate/);
  assert.throws(() => parseSeats(""), /no seats/);
});

test("verdict: contract appended once; extract parsed/truncated/missing/unparseable; repair pass", () => {
  const p = withContract("Brief body");
  assert.ok(hasContract(p));
  assert.equal(withContract(p), p);
  const good = `prose\n${BEGIN}\n{"seat":"m","items":[{"id":"Q1","stance":"agree"}]}\n${END}\n`;
  assert.equal(extractVerdict(good).status, "parsed");
  assert.equal(extractVerdict(good).json?.items?.[0].id, "Q1");
  const fenced = `x\n${BEGIN}\n\`\`\`json\n{"seat":"m","items":[{"id":"q1","stance":"agree"}]}\n\`\`\`\n${END}`;
  assert.equal(extractVerdict(fenced).status, "parsed");
  assert.equal(extractVerdict(fenced).json?.items?.[0].id, "Q1", "ids are canonicalised");
  const trailing = `${BEGIN}\n{"seat":"m","items":[{"id":"Q1","stance":"agree",}],}\n${END}`;
  assert.equal(extractVerdict(trailing).status, "parsed");
  assert.equal(extractVerdict(`${BEGIN}\n{"seat": "m", "items": [`).status, "truncated");
  assert.equal(extractVerdict("no block at all").status, "missing");
  assert.equal(extractVerdict(`${BEGIN}\nnot json\n${END}`).status, "unparseable");
  // Schema junk is rejected (2026-10-21 council, Q4).
  for (const junk of ["{}", '{"items":"bad"}', "[1,]", '{"items":[]}', '{"items":[{"id":"<id>","stance":"<stance>"}]}', '{"items":[{"id":"Q1"}]}']) {
    assert.equal(extractVerdict(`${BEGIN}\n${junk}\n${END}`).status, "unparseable", junk);
  }
  // A quoted template block does not override the real one, wherever it sits.
  const real = '{"seat":"real","items":[{"id":"Q1","stance":"agree"}]}';
  const quotedFirst = `${BEGIN}\n{ "seat": "<the model>", "items": [{"id":"<id>","stance":"<stance>"}] }\n${END}\n...\n${BEGIN}\n${real}\n${END}`;
  assert.equal(extractVerdict(quotedFirst).json?.seat, "real");
  const quotedLast = `${BEGIN}\n${real}\n${END}\n...and the contract was:\n${BEGIN}\n{ "seat": "<the model>" }\n${END}`;
  assert.equal(extractVerdict(quotedLast).json?.seat, "real");
  // The END delimiter inside a JSON string does not break parsing.
  const endInside = `${BEGIN}\n{"seat":"m","items":[{"id":"Q1","stance":"agree","summary":"the text said END VERDICT twice"}]}\n${END}`;
  assert.equal(extractVerdict(endInside).status, "parsed");
  const r = reaskPrompt("BRIEF", "cut off text");
  assert.ok(r.includes("cut off text") && r.includes("BRIEF") && r.includes("ONLY"));
});

test("matrix: items × seats, grounding, pushback queue, Q-order", () => {
  const verdicts = {
    a: { seat: "A", attestation: { ran_verifier: true, tools_used: ["shell"] }, items: [
      { id: "q2", stance: "disagree", summary: "a2", claims: [{ text: "t", status: "verified", evidence: "x:1" }] },
      { id: "Q1", stance: "agree", summary: "a1" },
    ] },
    b: { seat: "B", items: [
      { id: "Q1", stance: "agree", summary: "b1" },
      { id: "Q2", stance: "partial", summary: "b2", claims: [{ text: "t", status: "unverified" }] },
      { id: "extra", stance: "disagree", summary: "bx" },
    ] },
  };
  const manifest = { run_id: "r1", seats: [{ label: "a", adapter: "codex_cli", model: "m", status: "done", observed_tool_calls: 7 }, { label: "b", adapter: "agy_cli", model: "m", status: "done" }, { label: "c", adapter: "kimi_cli", model: "m", status: "window", verdict: "missing" }] };
  const m = buildMatrix("r1", verdicts as never, manifest as never);
  assert.deepEqual(m.seats, ["a", "b", "c"], "every manifest seat is a column, even without a verdict");
  assert.deepEqual(m.rows.map((r) => r.id), ["Q1", "Q2", "extra"]);
  const q2 = m.rows[1];
  assert.equal(q2.pushback, 2);
  assert.equal(q2.grounded_pushback, 1);
  assert.equal(q2.contested, true);
  assert.equal(m.rows[0].contested, false);
  assert.equal(m.rows[2].cells.a, null);
  assert.equal(m.rows[2].cells.c, null);
  assert.match(m.attestations.a.attestation, /ran_verifier=yes.*observed 7 tool line/);
  assert.equal(m.attestations.b.attestation, "missing");
  assert.match(m.attestations.c.attestation, /no verdict \(missing\)/);
  const md = renderMatrix(m);
  assert.ok(md.includes("| Q2 | DISAGREE ✓ | partial | · | 2 (1 grounded) | yes |"), md);
  assert.ok(md.includes("Verification queue"));
  // "verified" with no evidence, or without ran_verifier, is NOT grounded.
  const liar = { l: { attestation: { ran_verifier: false }, items: [{ id: "Q1", stance: "disagree", claims: [{ text: "t", status: "verified", evidence: "none" }] }] },
                 lazy: { attestation: { ran_verifier: true }, items: [{ id: "Q1", stance: "disagree", claims: [{ text: "t", status: "verified" }] }] } };
  const m2 = buildMatrix("r2", liar as never);
  assert.equal(m2.rows[0].grounded_pushback, 0);
  // loadVerdicts reads only *-verdict.json
  const dir = mkdtempSync(join(tmpdir(), "council-"));
  writeFileSync(join(dir, "a-verdict.json"), JSON.stringify(verdicts.a));
  writeFileSync(join(dir, "b-verdict.truncated.txt"), "{");
  assert.deepEqual(Object.keys(loadVerdicts(dir)), ["a"]);
});

test("classifyExit and codex banner", () => {
  const t = 60_000;
  assert.equal(classifyExit({ success: true, output: "ok" }, 1000, t), "done");
  assert.equal(classifyExit({ success: true, output: "   " }, 1000, t), "empty");
  assert.equal(classifyExit({ success: false, output: "", error: "usage limit reached, resets at 4:16 AM" }, 1000, t), "window");
  assert.equal(classifyExit({ success: false, output: "", error: "403 access_terminated" }, 1000, t), "window");
  assert.equal(classifyExit({ success: false, output: "", error: "boom" }, 1000, t), "failed");
  assert.equal(classifyExit({ success: false, output: "", error: "killed" }, t, t), "timeout");
  const b = parseCodexBanner("model: gpt-6.1-sol\nprovider: openai\nsandbox: read-only\nsession id: abc-123\n");
  assert.equal(b.model, "gpt-6.1-sol");
  assert.equal(b.sandbox, "read-only");
});

test("parseArgs: flags, =, bare, positionals", () => {
  const a = parseArgs(["run", "--source", "C:\\x", "--no-git", "--timeout-min=5", "--seats", "a,b", "text"]);
  assert.deepEqual(a._, ["run", "text"]);
  assert.equal(a.flags.source, "C:\\x");
  assert.equal(a.flags["no-git"], true);
  assert.equal(a.flags["timeout-min"], "5");
  assert.equal(a.flags.seats, "a,b");
});
