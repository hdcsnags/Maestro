// Rate v1 scoring. Deliberately simple and legible: per (model, harness) and optionally
// per task class, report the things that predicted quality in the 2026 councils —
// grounding (attested, ran a verifier, verified-claim share), reliability (done rate,
// windows, timeouts, parse failures), engagement (pushback share) — and the blind
// grading-lab ranks. No single composite number yet: with this little data a composite
// would be false precision (vision §12: do not introduce dimensions before data exists).

import type { RateRecord } from "./ingest.js";

export interface RateRow {
  model: string;
  harness: string;
  task_class?: string;
  runs: number;
  done: number;
  window: number;
  timeout: number;
  verdict_parsed: number;
  attested: number;
  ran_verifier: number;
  claims: number;
  verified_claims: number;
  items: number;
  pushback_items: number;
  median_elapsed_s?: number;
  grading_ranks: number[];
  grading_of: number[];
  human_ranks: number[];
  resolved_share: number;
}

function median(xs: number[]): number | undefined {
  if (!xs.length) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

export function score(records: RateRecord[], byTaskClass = false): RateRow[] {
  const map = new Map<string, { row: RateRow; elapsed: number[]; resolved: number }>();
  for (const r of records) {
    const key = byTaskClass ? `${r.model}|${r.harness}|${r.task_class}` : `${r.model}|${r.harness}`;
    let e = map.get(key);
    if (!e) {
      e = { row: { model: r.model, harness: r.harness, ...(byTaskClass ? { task_class: r.task_class } : {}), runs: 0, done: 0, window: 0, timeout: 0, verdict_parsed: 0, attested: 0, ran_verifier: 0, claims: 0, verified_claims: 0, items: 0, pushback_items: 0, grading_ranks: [], grading_of: [], human_ranks: [], resolved_share: 0 }, elapsed: [], resolved: 0 };
      map.set(key, e);
    }
    const row = e.row;
    if (r.resolved) e.resolved++;
    if (r.kind === "council_seat") {
      row.runs++;
      if (r.status === "done") row.done++;
      if (r.status === "window") row.window++;
      if (r.status === "timeout") row.timeout++;
      if (r.verdict === "parsed") row.verdict_parsed++;
      if (r.attested) row.attested++;
      if (r.ran_verifier) row.ran_verifier++;
      row.claims += r.claims ?? 0; row.verified_claims += r.verified_claims ?? 0;
      row.items += r.items ?? 0; row.pushback_items += r.pushback_items ?? 0;
      if (typeof r.elapsed_s === "number") e.elapsed.push(r.elapsed_s);
    } else {
      row.runs++;
      if (typeof r.rank === "number") { row.grading_ranks.push(r.rank); row.grading_of.push(r.of ?? 0); }
      if (typeof r.human_rank === "number") row.human_ranks.push(r.human_rank);
    }
  }
  const rows: RateRow[] = [];
  for (const e of map.values()) {
    e.row.median_elapsed_s = median(e.elapsed);
    e.row.resolved_share = e.row.runs ? Math.round((e.resolved / e.row.runs) * 100) / 100 : 0;
    rows.push(e.row);
  }
  rows.sort((a, b) => b.runs - a.runs || a.model.localeCompare(b.model));
  return rows;
}

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–");
const avg = (xs: number[]) => (xs.length ? (xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(1) : "–");

export function renderReport(rows: RateRow[], records: RateRecord[]): string {
  const L: string[] = [
    "# Rate v1 — model + harness reputation (on-disk ledger)", "",
    `Records: ${records.length} (${records.filter((r) => r.kind === "council_seat").length} council seat runs, ${records.filter((r) => r.kind === "grading_rank").length} grading-lab ranks). Keys are resolved model + harness; "resolved" says how often the CLI itself reported the model (copilot "auto" lesson, 2026-07-01).`, "",
    "| model | harness | runs | done | window/timeout | verdict parsed | attested | ran verifier | verified claims | pushback items | median s | peer rank (avg/of) | human rank | resolved |",
    "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|",
  ];
  for (const r of rows) {
    const council = r.runs - r.grading_ranks.length;
    L.push(`| ${r.model} | ${r.harness} | ${r.runs} | ${pct(r.done, council)} | ${r.window}/${r.timeout} | ${pct(r.verdict_parsed, council)} | ${pct(r.attested, council)} | ${pct(r.ran_verifier, council)} | ${pct(r.verified_claims, r.claims)} (${r.verified_claims}/${r.claims}) | ${pct(r.pushback_items, r.items)} | ${r.median_elapsed_s ?? "–"} | ${avg(r.grading_ranks)}${r.grading_of.length ? ` / ${avg(r.grading_of)}` : ""} | ${avg(r.human_ranks)} | ${Math.round(r.resolved_share * 100)}% |`);
  }
  L.push("", "Read it as evidence, not a leaderboard: grounding columns (attested, ran verifier, verified claims) predicted quality in the 2026-09-06 study; pushback share is engagement, not correctness; rank columns are blind peer consensus from grading-lab (1 = best).", "");
  return L.join("\n");
}
