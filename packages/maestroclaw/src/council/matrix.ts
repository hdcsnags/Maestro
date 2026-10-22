// Agreement matrix: items × seats from the <seat>-verdict.json files of one run.
// Generalises matrix.py (VOTD cohesion, 2026-09-06). Trust is shown as grounding ×
// agreement: a cell marks whether the seat verified at least one claim behind its
// stance, and the queue lists items where two or more seats push back.

import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { RunManifest, SeatVerdict, VerdictItem } from "./types.js";
import { describeAttestation } from "./verdict.js";

export interface MatrixCell {
  stance: string;
  grounded: boolean;
  summary: string;
  severity?: string;
}

export interface MatrixRow {
  id: string;
  cells: Record<string, MatrixCell | null>;
  pushback: number;
  contested: boolean;
  grounded_pushback: number;
}

export interface Matrix {
  run_id: string;
  seats: string[];
  rows: MatrixRow[];
  attestations: Record<string, { attestation: string; verdict: string; elapsed_s?: number; model: string; status: string }>;
}

const PUSHBACK = new Set(["disagree", "partial"]);

function groundedItem(item: VerdictItem): boolean {
  return Array.isArray(item.claims) && item.claims.some((c) => c && c.status === "verified");
}

export function loadVerdicts(runDir: string): Record<string, SeatVerdict> {
  const out: Record<string, SeatVerdict> = {};
  for (const f of readdirSync(runDir)) {
    const m = f.match(/^(.+)-verdict\.json$/);
    if (!m) continue;
    try { out[m[1]] = JSON.parse(readFileSync(join(runDir, f), "utf-8")) as SeatVerdict; } catch { /* unparseable file: left out */ }
  }
  return out;
}

export function buildMatrix(runId: string, verdicts: Record<string, SeatVerdict>, manifest?: RunManifest): Matrix {
  const seats = Object.keys(verdicts).sort();
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const s of seats) {
    for (const it of verdicts[s].items ?? []) {
      if (!it || typeof it.id !== "string") continue;
      const id = it.id.trim();
      if (!seen.has(id)) { seen.add(id); ids.push(id); }
    }
  }
  // Keep Q-numbered items in numeric order, then the rest in first-seen order.
  ids.sort((a, b) => {
    const qa = a.match(/^Q(\d+)/i), qb = b.match(/^Q(\d+)/i);
    if (qa && qb) return Number(qa[1]) - Number(qb[1]);
    if (qa) return -1; if (qb) return 1;
    return 0;
  });
  const rows: MatrixRow[] = ids.map((id) => {
    const cells: Record<string, MatrixCell | null> = {};
    const stances = new Set<string>();
    let pushback = 0, grounded_pushback = 0;
    for (const s of seats) {
      const it = (verdicts[s].items ?? []).find((x) => x && typeof x.id === "string" && x.id.trim() === id);
      if (!it) { cells[s] = null; continue; }
      const stance = String(it.stance ?? "").toLowerCase();
      const grounded = groundedItem(it);
      cells[s] = { stance, grounded, summary: String(it.summary ?? ""), ...(it.severity ? { severity: String(it.severity) } : {}) };
      if (stance) stances.add(stance);
      if (PUSHBACK.has(stance)) { pushback++; if (grounded) grounded_pushback++; }
    }
    return { id, cells, pushback, contested: stances.size > 1, grounded_pushback };
  });
  const attestations: Matrix["attestations"] = {};
  for (const s of seats) {
    const rec = manifest?.seats.find((x) => x.label === s);
    attestations[s] = {
      attestation: describeAttestation(verdicts[s]),
      verdict: String(verdicts[s].verdict ?? ""),
      elapsed_s: rec?.elapsed_s,
      model: rec?.resolved_model ?? rec?.model ?? String(verdicts[s].seat ?? ""),
      status: rec?.status ?? "",
    };
  }
  return { run_id: runId, seats, rows, attestations };
}

const ABBR: Record<string, string> = { agree: "agree", disagree: "DISAGREE", partial: "partial", unverifiable: "unverif." };

export function renderMatrix(m: Matrix): string {
  const L: string[] = [`# Agreement matrix — ${m.run_id}`, "", `Seats: ${m.seats.join(", ")}. A trailing ✓ means the seat verified at least one claim behind that stance; no mark means it only read or inferred.`, ""];
  L.push("| item | " + m.seats.join(" | ") + " | pushback | contested |");
  L.push("|---|" + "---|".repeat(m.seats.length) + "---|---|");
  for (const r of m.rows) {
    const cells = m.seats.map((s) => { const c = r.cells[s]; if (!c) return "·"; return `${ABBR[c.stance] ?? c.stance}${c.grounded ? " ✓" : ""}`; });
    L.push(`| ${r.id} | ${cells.join(" | ")} | ${r.pushback}${r.grounded_pushback ? ` (${r.grounded_pushback} grounded)` : ""} | ${r.contested ? "yes" : ""} |`);
  }
  const queue = m.rows.filter((r) => r.pushback >= 2);
  L.push("", "## Verification queue — pushback from two or more seats", "");
  if (!queue.length) L.push("_none_");
  for (const r of queue) {
    L.push(`- **${r.id}**`);
    for (const s of m.seats) { const c = r.cells[s]; if (c && PUSHBACK.has(c.stance)) L.push(`  - ${s} (${c.stance}${c.grounded ? ", grounded" : ""}): ${c.summary}`); }
  }
  const contested = m.rows.filter((r) => r.contested && r.pushback < 2);
  if (contested.length) {
    L.push("", "## Contested by one seat", "");
    for (const r of contested) {
      L.push(`- **${r.id}**`);
      for (const s of m.seats) { const c = r.cells[s]; if (c) L.push(`  - ${s} (${c.stance}${c.grounded ? ", grounded" : ""}): ${c.summary}`); }
    }
  }
  L.push("", "## Seats", "", "| seat | model | status | elapsed | attestation | overall verdict |", "|---|---|---|---|---|---|");
  for (const s of m.seats) { const a = m.attestations[s]; L.push(`| ${s} | ${a.model} | ${a.status} | ${a.elapsed_s != null ? a.elapsed_s + "s" : ""} | ${a.attestation} | ${a.verdict} |`); }
  L.push("", "Verify every queued row yourself before it becomes a decision. Grounding predicts quality more than generation (2026-09-06).", "");
  return L.join("\n");
}

export function writeMatrix(runDir: string): Matrix {
  const manifestPath = join(runDir, "manifest.json");
  const manifest = existsSync(manifestPath) ? (JSON.parse(readFileSync(manifestPath, "utf-8")) as RunManifest) : undefined;
  const verdicts = loadVerdicts(runDir);
  const m = buildMatrix(manifest?.run_id ?? runDir, verdicts, manifest);
  writeFileSync(join(runDir, "matrix.md"), renderMatrix(m), "utf-8");
  writeFileSync(join(runDir, "matrix.json"), JSON.stringify(m, null, 1), "utf-8");
  return m;
}
