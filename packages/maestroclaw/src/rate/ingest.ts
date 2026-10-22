// Rate v1 (Power 6) — reputation keyed on resolved model + harness + task class, built
// from data that already exists on disk: Council Runtime manifests + verdict files under
// docs/audits/**, and grading-lab tasks (blind peer rankings + the human anchor).
//
// The ledger is in-repo (grading-lab/rate/ledger.jsonl) so it syncs across machines,
// per the 2026-07-01 decision. Nothing here needs Supabase.

import { existsSync, readdirSync, readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { RunManifest, SeatVerdict } from "../council/types.js";

export interface RateRecord {
  kind: "council_seat" | "grading_rank";
  ts: string;
  source: string;            // repo-relative path of the manifest or meta.json
  task_class: string;        // project slug or grading task slug
  model: string;             // resolved when known, else requested
  harness: string;           // adapter (codex_cli, agy_cli, …) or CLI name for grading-lab
  resolved: boolean;
  status?: string;           // council: done|failed|window|timeout|empty
  elapsed_s?: number;
  verdict?: string;          // parsed|truncated|unparseable|missing
  attested?: boolean;        // attestation block present
  ran_verifier?: boolean;
  claims?: number;
  verified_claims?: number;
  items?: number;
  pushback_items?: number;   // disagree|partial
  rank?: number;             // grading-lab: 1 = best in peer consensus
  of?: number;
  human_rank?: number;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".git") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

function readJson<T>(p: string): T | null { try { return JSON.parse(readFileSync(p, "utf-8")) as T; } catch { return null; } }

/** Council Runtime runs: one record per seat. */
export function ingestCouncilRuns(repoRoot: string): RateRecord[] {
  const root = join(repoRoot, "docs", "audits");
  if (!existsSync(root)) return [];
  const out: RateRecord[] = [];
  for (const p of walk(root).filter((f) => f.endsWith("manifest.json"))) {
    const m = readJson<RunManifest>(p);
    if (!m || m.schema !== "maestro.council.run/1") continue;
    const dir = join(p, "..");
    for (const s of m.seats) {
      const v = s.verdict === "parsed" ? readJson<SeatVerdict>(join(dir, `${s.label}-verdict.json`)) : null;
      const items = v?.items ?? [];
      const claims = items.flatMap((i) => i.claims ?? []);
      out.push({
        kind: "council_seat", ts: s.finished_at ?? m.updated_at, source: relative(repoRoot, p).replace(/\\/g, "/"),
        task_class: m.project, model: s.resolved_model?.replace(/ \(session .*\)$/, "") ?? s.model, harness: s.adapter,
        resolved: !!s.resolved_model, status: s.status, elapsed_s: s.elapsed_s, verdict: s.verdict,
        attested: !!(v?.attestation), ran_verifier: v?.attestation?.ran_verifier === true,
        claims: claims.length, verified_claims: claims.filter((c) => c.status === "verified").length,
        items: items.length, pushback_items: items.filter((i) => i.stance === "disagree" || i.stance === "partial").length,
      });
    }
  }
  return out;
}

interface GradingMeta { task?: string; date?: string; workers?: Record<string, string>; peer_ranking_consensus?: string[]; }
interface HumanGrade { ranking_models?: string[]; }

/** grading-lab: peer-consensus rank (and the human anchor rank) per worker. */
export function ingestGradingLab(repoRoot: string): RateRecord[] {
  const root = join(repoRoot, "grading-lab", "tasks");
  if (!existsSync(root)) return [];
  const out: RateRecord[] = [];
  for (const task of readdirSync(root)) {
    const dir = join(root, task);
    const meta = readJson<GradingMeta>(join(dir, "meta.json"));
    if (!meta?.peer_ranking_consensus) continue;
    const human = existsSync(join(dir, "grades", "human-michael.json")) ? readJson<HumanGrade>(join(dir, "grades", "human-michael.json")) : null;
    const n = meta.peer_ranking_consensus.length;
    meta.peer_ranking_consensus.forEach((worker, i) => {
      const desc = meta.workers?.[worker] ?? "";
      const modelMatch = desc.match(/model\s+([\w.\-/]+)/i) ?? desc.match(/resolved model\s+([\w.\-/]+)/i);
      const hr = human?.ranking_models?.indexOf(worker);
      out.push({
        kind: "grading_rank", ts: meta.date ?? "", source: relative(repoRoot, join(dir, "meta.json")).replace(/\\/g, "/"),
        task_class: task, model: modelMatch ? modelMatch[1] : worker, harness: worker.replace(/-.*$/, ""), resolved: !!modelMatch,
        rank: i + 1, of: n, ...(hr != null && hr >= 0 ? { human_rank: hr + 1 } : {}),
      });
    });
  }
  return out;
}

export function writeLedger(repoRoot: string, records: RateRecord[]): string {
  const dir = join(repoRoot, "grading-lab", "rate");
  mkdirSync(dir, { recursive: true });
  const p = join(dir, "ledger.jsonl");
  writeFileSync(p, records.map((r) => JSON.stringify(r)).join("\n") + (records.length ? "\n" : ""), "utf-8");
  return p;
}

export function readLedger(repoRoot: string): RateRecord[] {
  const p = join(repoRoot, "grading-lab", "rate", "ledger.jsonl");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as RateRecord);
}
