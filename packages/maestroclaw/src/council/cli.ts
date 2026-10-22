// `maestroclaw council <command>` — the Council Runtime's command line.
//
//   council run      --source <dir> --prompt <file> --seats astra,gemini,sol [--mode audit|code]
//                    [--no-git] [--branch b] [--project p] [--label l] [--run-id id] [--out dir]
//                    [--timeout-min 25] [--no-contract] [--no-reask] [--seats-file f]
//   council resume   --run <dir>            re-dispatch every seat that is not done
//   council status   --run <dir>            print the manifest
//   council matrix   --run <dir>            build matrix.md / matrix.json from the verdict files
//   council checkpoint --run <dir> "text"   append an in-flight checkpoint line
//   council usage    [--days 30]            seat usage from the ledger
//   council seats                           list the seat catalog
//
// Environment fallbacks keep the Elay/Eliana skills working unchanged:
//   SOURCE PROMPT_FILE SEATS MODE NO_GIT BRANCH PROJECT LABEL RUN_ID OUT_ROOT TIMEOUT_MIN

import { existsSync, readFileSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { parseSeats, loadSeatCatalog, SEAT_CATALOG } from "./seats.js";
import { runCouncil, loadManifest, appendCheckpoint, defaultOutRoot, defaultScratchRoot, councilHome, log } from "./run.js";
import { writeMatrix, renderMatrix } from "./matrix.js";
import type { CouncilMode, CouncilRunOptions, UsageEntry } from "./types.js";

export interface Args { _: string[]; flags: Record<string, string | boolean> }
export function parseArgs(argv: string[]): Args {
  const out: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const eq = key.indexOf("=");
      if (eq >= 0) { out.flags[key.slice(0, eq)] = key.slice(eq + 1); continue; }
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) { out.flags[key] = next; i++; } else out.flags[key] = true;
    } else out._.push(a);
  }
  return out;
}
const str = (a: Args, key: string, env?: string): string | undefined => {
  const v = a.flags[key];
  if (typeof v === "string") return v;
  if (env && process.env[env]) return process.env[env];
  return undefined;
};
const bool = (a: Args, key: string, env?: string): boolean => a.flags[key] === true || a.flags[key] === "1" || (!!env && process.env[env] === "1");

export async function councilMain(argv: string[]): Promise<void> {
  const a = parseArgs(argv);
  const cmd = a._[0];
  if (!cmd || cmd === "help") {
    console.log(`maestroclaw council <run|resume|status|matrix|checkpoint|usage|seats> [flags]\n` +
      `  run    --source <dir> --prompt <file> --seats astra,gemini,sol [--mode audit|code] [--no-git] [--branch b]\n` +
      `         [--project p] [--label l] [--run-id id] [--out dir] [--timeout-min 25] [--no-contract] [--no-reask] [--seats-file f]\n` +
      `  resume --run <dir>        status --run <dir>        matrix --run <dir>\n` +
      `  checkpoint --run <dir> "text"        usage [--days 30]        seats\n` +
      `Home: ${councilHome()}  (MAESTRO_COUNCIL_HOME, COUNCIL_SCRATCH, COUNCIL_OUT_ROOT override)`);
    return;
  }
  switch (cmd) {
    case "seats": {
      for (const [label, s] of Object.entries(SEAT_CATALOG)) console.log(`${label.padEnd(10)} ${s.adapter.padEnd(12)} ${s.model ?? "(cli default)"}`);
      return;
    }
    case "run": {
      const source = str(a, "source", "SOURCE");
      const promptFile = str(a, "prompt", "PROMPT_FILE");
      const seatsSpec = str(a, "seats", "SEATS") ?? "sol";
      if (!source || !promptFile) throw new Error("--source and --prompt are required");
      if (!existsSync(source)) throw new Error(`source not found: ${source}`);
      if (!existsSync(promptFile)) throw new Error(`prompt file not found: ${promptFile}`);
      const catalog = loadSeatCatalog(str(a, "seats-file"));
      const seats = parseSeats(seatsSpec, catalog);
      const mode = (str(a, "mode", "MODE") ?? "audit") as CouncilMode;
      if (mode !== "audit" && mode !== "code") throw new Error(`--mode must be audit or code`);
      const project = str(a, "project", "PROJECT") ?? basename(resolve(source)).toLowerCase().replace(/\s+/g, "-");
      const label = str(a, "label", "LABEL") ?? "council";
      const runId = str(a, "run-id", "RUN_ID") ?? `${new Date().toISOString().slice(0, 10)}-${label}`;
      const outRoot = str(a, "out", "OUT_ROOT") ?? defaultOutRoot(project);
      // --skills prepends the skills index (name + description + path) so seats know which procedures exist.
      let seatPreamble: CouncilRunOptions["seatPreamble"];
      if (bool(a, "skills")) {
        const { findSkillsRoot, loadSkills, renderIndexForBrief } = await import("../skills/index.js");
        const root = findSkillsRoot(resolve(source)) ?? findSkillsRoot();
        if (root) { const idx = renderIndexForBrief(loadSkills(root)); seatPreamble = () => idx; }
      }
      const opts: CouncilRunOptions = {
        source: resolve(source), promptFile: resolve(promptFile), seats, mode,
        noGit: bool(a, "no-git", "NO_GIT"), branch: str(a, "branch", "BRANCH"),
        project, label, runId, outDir: join(outRoot, runId), scratchRoot: str(a, "scratch", "COUNCIL_SCRATCH") ?? defaultScratchRoot(),
        timeoutMs: Number(str(a, "timeout-min", "TIMEOUT_MIN") ?? 25) * 60 * 1000,
        contract: !bool(a, "no-contract"), reaskTruncated: !bool(a, "no-reask"), resume: bool(a, "resume"),
        ...(seatPreamble ? { seatPreamble } : {}),
      };
      const m = await runCouncil(opts);
      if (m.seats.some((s) => s.verdict === "parsed")) { writeMatrix(opts.outDir); log(`matrix → ${join(opts.outDir, "matrix.md")}`); }
      return;
    }
    case "resume": {
      const runDir = str(a, "run"); if (!runDir) throw new Error("--run <dir> required");
      const m = loadManifest(runDir); if (!m) throw new Error(`no manifest.json in ${runDir}`);
      const seats = m.seats.map((s) => ({ label: s.label, adapter: s.adapter, model: s.model === "(default)" ? undefined : s.model }));
      const opts: CouncilRunOptions = {
        source: m.source, promptFile: m.prompt_file, seats, mode: m.mode, noGit: m.no_git, branch: m.branch,
        project: m.project, label: m.label, runId: m.run_id, outDir: resolve(runDir), scratchRoot: str(a, "scratch", "COUNCIL_SCRATCH") ?? defaultScratchRoot(),
        timeoutMs: m.timeout_ms, contract: !bool(a, "no-contract"), reaskTruncated: !bool(a, "no-reask"), resume: true,
      };
      appendCheckpoint(opts.outDir, `resume requested (${m.seats.filter((s) => s.status !== "done").map((s) => s.label).join(",") || "nothing pending"})`);
      const out = await runCouncil(opts);
      if (out.seats.some((s) => s.verdict === "parsed")) writeMatrix(opts.outDir);
      return;
    }
    case "status": {
      const runDir = str(a, "run"); if (!runDir) throw new Error("--run <dir> required");
      const m = loadManifest(runDir); if (!m) throw new Error(`no manifest.json in ${runDir}`);
      console.log(`${m.run_id}  project=${m.project}  mode=${m.mode}  created=${m.created_at}  updated=${m.updated_at}`);
      for (const s of m.seats) console.log(`  ${s.label.padEnd(10)} ${s.status.padEnd(8)} ${(s.resolved_model ?? s.model).padEnd(28)} ${s.elapsed_s != null ? (s.elapsed_s + "s").padEnd(6) : "".padEnd(6)} verdict=${s.verdict ?? "-"} ro=${s.read_only ?? "-"}`);
      if (m.checkpoints.length) { console.log("  checkpoints:"); for (const c of m.checkpoints.slice(-5)) console.log(`    ${c}`); }
      return;
    }
    case "matrix": {
      const runDir = str(a, "run"); if (!runDir) throw new Error("--run <dir> required");
      const m = writeMatrix(resolve(runDir));
      console.log(renderMatrix(m));
      return;
    }
    case "rule": {
      // council rule --run <dir>                              seed/list rulings from the matrix
      // council rule --run <dir> --item Q3 --verify <who> [--verify-note "…"]
      // council rule --run <dir> --item Q3 --decision adopt|reject|defer|needs_owner --by michael [--note "…"]
      // council rule --run <dir> --item Q3 --commit <sha>     |  --regress <who>
      const runDir = str(a, "run"); if (!runDir) throw new Error("--run <dir> required");
      const { seedRulings, applyRuling, loadRulings, renderRulings } = await import("./rule.js");
      const { writeMatrix } = await import("./matrix.js");
      const item = str(a, "item");
      if (!item) { const m = writeMatrix(resolve(runDir)); console.log(renderRulings(seedRulings(resolve(runDir), m))); return; }
      if (!loadRulings(resolve(runDir)).length) seedRulings(resolve(runDir), writeMatrix(resolve(runDir)));
      const decision = str(a, "decision") as import("./rule.js").RulingDecision | undefined;
      if (decision && !["adopt", "reject", "defer", "needs_owner"].includes(decision)) throw new Error("--decision must be adopt|reject|defer|needs_owner");
      const r = applyRuling(resolve(runDir), item, { verify: str(a, "verify"), verifyNote: str(a, "verify-note"), decision, by: str(a, "by"), note: str(a, "note"), commit: str(a, "commit"), regress: str(a, "regress") });
      console.log(`${r.id}: ${r.status}${r.decision ? ` (${r.decision} by ${r.ruled_by})` : ""}`);
      return;
    }
    case "checkpoint": {
      const runDir = str(a, "run"); const text = a._.slice(1).join(" ");
      if (!runDir || !text) throw new Error('usage: council checkpoint --run <dir> "text"');
      appendCheckpoint(resolve(runDir), text); log("checkpoint recorded");
      return;
    }
    case "usage": {
      const days = Number(str(a, "days") ?? 30);
      const p = join(councilHome(), "usage.jsonl");
      if (!existsSync(p)) { console.log("no usage recorded yet"); return; }
      const since = Date.now() - days * 86_400_000;
      const rows = readFileSync(p, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as UsageEntry).filter((e) => Date.parse(e.ts) >= since);
      const by = new Map<string, { runs: number; s: number; chars: number; classes: Record<string, number> }>();
      for (const e of rows) {
        const k = `${e.seat} ${e.adapter} ${e.model}`;
        const v = by.get(k) ?? { runs: 0, s: 0, chars: 0, classes: {} };
        v.runs++; v.s += e.elapsed_s; v.chars += e.chars; v.classes[e.exit_class] = (v.classes[e.exit_class] ?? 0) + 1;
        by.set(k, v);
      }
      console.log(`last ${days} days: ${rows.length} seat runs`);
      for (const [k, v] of [...by.entries()].sort((x, y) => y[1].runs - x[1].runs)) console.log(`  ${k.padEnd(48)} runs=${v.runs} time=${Math.round(v.s / 60)}m chars=${v.chars} ${JSON.stringify(v.classes)}`);
      return;
    }
    default:
      throw new Error(`unknown council command "${cmd}"`);
  }
}
