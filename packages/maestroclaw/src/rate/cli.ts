// `maestroclaw rate ingest|report [--by-task]` — build the on-disk reputation ledger
// from docs/audits/** council manifests and grading-lab/, and print the report.

import { existsSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ingestCouncilRuns, ingestGradingLab, writeLedger, readLedger } from "./ingest.js";
import { score, renderReport } from "./score.js";

function findRepoRoot(start = process.cwd()): string {
  let dir = resolve(start);
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "AGENTS.md")) && existsSync(join(dir, "docs"))) return dir;
    const up = resolve(dir, "..");
    if (up === dir) break;
    dir = up;
  }
  throw new Error("Maestro repo root not found (no AGENTS.md above the current directory)");
}

export async function rateMain(argv: string[]): Promise<void> {
  const cmd = argv[0] ?? "report";
  const byTask = argv.includes("--by-task");
  const repoRoot = findRepoRoot();
  if (cmd === "ingest") {
    const records = [...ingestCouncilRuns(repoRoot), ...ingestGradingLab(repoRoot)];
    const p = writeLedger(repoRoot, records);
    const report = renderReport(score(records, byTask), records);
    writeFileSync(join(repoRoot, "grading-lab", "rate", "REPORT.md"), report, "utf-8");
    console.log(`${records.length} records → ${p}; report → grading-lab/rate/REPORT.md`);
    return;
  }
  if (cmd === "report") {
    const records = readLedger(repoRoot);
    if (!records.length) { console.log("ledger empty — run `maestroclaw rate ingest` first"); return; }
    console.log(renderReport(score(records, byTask), records));
    return;
  }
  throw new Error(`unknown rate command "${cmd}" (ingest | report [--by-task])`);
}
