// Ruling Ledger (Power 5). A council run's queued rows (pushback from ≥2 seats, or
// contested) become rulings with a lifecycle: raised → verified → ruled → fixed → regressed.
// Stored beside the run as rulings.json; `council rule` lists and updates them. Commits
// that close a ruling reference its id (e.g. "fix(Q3): …  [ruling 2026-10-21-x/Q3]").

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Matrix } from "./matrix.js";

export type RulingStatus = "raised" | "verified" | "ruled" | "fixed" | "regressed";
export type RulingDecision = "adopt" | "reject" | "defer" | "needs_owner";

export interface Ruling {
  id: string;             // "<run_id>/<item>"
  item: string;
  run_id: string;
  status: RulingStatus;
  raised_by: string[];    // seats that pushed back
  grounded_by: string[];  // seats whose pushback carried a verified claim
  summaries: Record<string, string>;
  verified_by?: string;   // who confirmed the row (concierge, verifier seat)
  verified_note?: string;
  decision?: RulingDecision;
  ruled_by?: string;
  ruled_at?: string;
  note?: string;
  commits: string[];
  regressed_by?: string;
  updated_at: string;
}

export function rulingsPath(runDir: string): string { return join(runDir, "rulings.json"); }

export function loadRulings(runDir: string): Ruling[] {
  const p = rulingsPath(runDir);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf-8")) as Ruling[]) : [];
}
export function saveRulings(runDir: string, rulings: Ruling[]): void {
  writeFileSync(rulingsPath(runDir), JSON.stringify(rulings, null, 1), "utf-8");
}

/** Seed rulings from a matrix: every row with pushback ≥ 2 or contested. Existing rulings keep their state. */
export function seedRulings(runDir: string, m: Matrix): Ruling[] {
  const existing = loadRulings(runDir);
  const byItem = new Map(existing.map((r) => [r.item, r]));
  const now = new Date().toISOString();
  for (const row of m.rows) {
    if (row.pushback < 2 && !row.contested) continue;
    const raised = m.seats.filter((s) => { const c = row.cells[s]; return c && (c.stance === "disagree" || c.stance === "partial"); });
    const grounded = raised.filter((s) => row.cells[s]?.grounded);
    const summaries: Record<string, string> = {};
    for (const s of m.seats) { const c = row.cells[s]; if (c) summaries[s] = `${c.stance}: ${c.summary}`; }
    const prior = byItem.get(row.id);
    if (prior) { prior.raised_by = raised; prior.grounded_by = grounded; prior.summaries = summaries; continue; }
    byItem.set(row.id, { id: `${m.run_id}/${row.id}`, item: row.id, run_id: m.run_id, status: "raised", raised_by: raised, grounded_by: grounded, summaries, commits: [], updated_at: now });
  }
  const out = [...byItem.values()];
  saveRulings(runDir, out);
  return out;
}

export interface RuleUpdate { verify?: string; verifyNote?: string; decision?: RulingDecision; by?: string; note?: string; commit?: string; regress?: string; }

export function applyRuling(runDir: string, item: string, u: RuleUpdate): Ruling {
  const rulings = loadRulings(runDir);
  const r = rulings.find((x) => x.item === item);
  if (!r) throw new Error(`no ruling for item "${item}" in ${runDir} (run \`council rule --run <dir>\` to seed)`);
  const now = new Date().toISOString();
  if (u.verify) { r.verified_by = u.verify; r.verified_note = u.verifyNote; if (r.status === "raised") r.status = "verified"; }
  if (u.decision) {
    if (r.status === "raised") throw new Error(`item ${item} is not verified yet — verify before ruling (verify-before-close)`);
    r.decision = u.decision; r.ruled_by = u.by ?? "conductor"; r.ruled_at = now; r.status = "ruled";
  }
  if (u.note) r.note = u.note;
  if (u.commit) { r.commits.push(u.commit); if (r.status === "ruled" && r.decision === "adopt") r.status = "fixed"; }
  if (u.regress) { r.regressed_by = u.regress; if (r.status === "fixed") r.status = "regressed"; }
  r.updated_at = now;
  saveRulings(runDir, rulings);
  return r;
}

export function renderRulings(rulings: Ruling[]): string {
  if (!rulings.length) return "no rulings";
  const L = ["| item | status | raised by | grounded | decision | commits |", "|---|---|---|---|---|---|"];
  for (const r of rulings) L.push(`| ${r.item} | ${r.status} | ${r.raised_by.join(", ") || "–"} | ${r.grounded_by.join(", ") || "–"} | ${r.decision ?? ""}${r.ruled_by ? ` (${r.ruled_by})` : ""} | ${r.commits.join(", ")} |`);
  return L.join("\n");
}
