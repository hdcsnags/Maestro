#!/usr/bin/env -S npx tsx
/**
 * Generic council dispatch — any project, any prompt, any seat. Written 2026-09-10 so a concierge
 * in a NEW project folder (Elay) does not have to author a TypeScript script per study.
 *
 * Reads everything from env + args:
 *   SOURCE       absolute path of the repo to clone read-only for the seats (or a plain folder — see NO_GIT)
 *   BRANCH       branch to clone (default: current HEAD)
 *   RUN_ID       output folder name under OUT_ROOT (default: <date>-<label>)
 *   OUT_ROOT     where outputs go (default: <Maestro>/docs/audits/<project>)
 *   PROJECT      short project slug for OUT_ROOT (default: basename of SOURCE)
 *   PROMPT_FILE  path to a UTF-8 file holding the prompt (keeps prompts out of argv — agy chokes >32 KB)
 *   SEATS        comma list of seat labels: astra,sol,gemini,gemini36,kimi,fable5,sonnet (default: sol)
 *   NO_GIT=1     copy the folder instead of git clone (for a folder that is not a repo yet)
 *   TIMEOUT_MIN  per-seat timeout (default 25)
 * Model env per adapter (read at import, one seat per process rule): CLAW_CODEX_MODEL, CLAW_AGY_MODEL,
 *   CLAW_KIMI_MODEL, CLAW_CLAUDE_MODEL (+ CLAUDE_CONFIG_DIR for the thamos profile).
 * Seat → adapter: astra/sol → codex_cli (model from CLAW_CODEX_MODEL — so run astra and sol in SEPARATE
 *   processes with different env), gemini/gemini36 → agy_cli, kimi → kimi_cli, fable5/sonnet → claude_code.
 *
 * Usage (from packages/maestroclaw):
 *   SOURCE="C:\New folder\Elay" NO_GIT=1 PROMPT_FILE="C:\New folder\Elay\council\brief-ux.md" SEATS=sol \
 *   CLAW_CODEX_MODEL=gpt-5.6-sol PYTHONIOENCODING=utf-8 npx tsx scripts/council-dispatch.ts
 *
 * Every seat gets its own read-only copy under C:\New folder\claw-scratch (Codex cannot read %TEMP%),
 * instrumentation files are scrubbed, and git status/diff (or a file-hash diff for NO_GIT) verifies
 * read-only after the run. Output: <OUT>/<seat>.md (+ <seat>-verdict.json if the seat ended with a
 * BEGIN VERDICT / END VERDICT block).
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync, readdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import { CodexCliAdapter } from "../src/adapters/codex-cli.js";
import { AgyCliAdapter } from "../src/adapters/agy-cli.js";
import { KimiCliAdapter } from "../src/adapters/kimi-cli.js";
import { ClaudeCodeAdapter } from "../src/adapters/claude-code.js";
import type { AdapterResult } from "../src/adapters/types.js";

const SOURCE = process.env.SOURCE ?? (() => { throw new Error("SOURCE is required"); })();
const BRANCH = process.env.BRANCH;
const PROJECT = process.env.PROJECT ?? basename(SOURCE).toLowerCase().replace(/\s+/g, "-");
const LABEL = process.env.LABEL ?? "council";
const RUN_ID = process.env.RUN_ID ?? `${new Date().toISOString().slice(0, 10)}-${LABEL}`;
const OUT_ROOT = process.env.OUT_ROOT ?? join("C:\\New folder\\MaestroOrchestra\\project\\Maestro\\docs\\audits", PROJECT);
const OUT_DIR = join(OUT_ROOT, RUN_ID);
const PROMPT_FILE = process.env.PROMPT_FILE ?? (() => { throw new Error("PROMPT_FILE is required"); })();
const SEATS = (process.env.SEATS ?? "sol").split(",").map(s => s.trim()).filter(Boolean);
const NO_GIT = process.env.NO_GIT === "1";
const SCRATCH_ROOT = "C:\\New folder\\claw-scratch";
const TIMEOUT_MS = Number(process.env.TIMEOUT_MIN ?? 25) * 60 * 1000;
const INSTRUMENTATION = ["session.log", ".maestroclaw-session.log"];
const PROMPT = readFileSync(PROMPT_FILE, "utf-8");
// MODE=audit (default): seats are read-only and verified so. MODE=code: seats may write inside their
// own clone (Codex workspace-write; Claude Code / Kimi / agy as configured); the script then emits
// <seat>.patch (git diff of the clone, NO_GIT: none) for the concierge to review and `git apply`.
const MODE = (process.env.MODE ?? "audit") as "audit" | "code";

type Runner = { run: (p: string, d: string, t: number) => Promise<AdapterResult> };
function makeSeat(label: string): { adapter: string; model: string; make: () => Runner } {
  switch (label) {
    case "astra": case "sol": return { adapter: "codex_cli", model: process.env.CLAW_CODEX_MODEL ?? "(default)", make: () => new CodexCliAdapter({ sandbox: MODE === "code" ? "workspace-write" : "read-only" }) };
    case "gemini": case "gemini36": return { adapter: "agy_cli", model: process.env.CLAW_AGY_MODEL ?? "(default)", make: () => new AgyCliAdapter() };
    case "kimi": return { adapter: "kimi_cli", model: process.env.CLAW_KIMI_MODEL ?? "(default)", make: () => new KimiCliAdapter() };
    case "fable5": case "sonnet": case "claude": return { adapter: "claude_code", model: process.env.CLAW_CLAUDE_MODEL ?? "(default)", make: () => new ClaudeCodeAdapter() };
    default: throw new Error(`unknown seat ${label}`);
  }
}

function log(m: string) { console.log(`[council] ${m}`); }
function git(dir: string, args: string[]) { try { return execFileSync("git", args, { cwd: dir, encoding: "utf8" }); } catch (e) { return `(git failed: ${String(e).slice(0, 120)})`; } }

function hashTree(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      if (name === ".git" || name === "node_modules" || name === "build" || name === ".gradle") continue;
      const p = join(d, name); const st = statSync(p);
      if (st.isDirectory()) walk(p); else out.set(p.slice(dir.length + 1), createHash("sha1").update(readFileSync(p)).digest("hex"));
    }
  };
  walk(dir); return out;
}

function makeCopy(label: string): string {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const root = mkdtempSync(join(SCRATCH_ROOT, `${PROJECT}-${label}-`));
  const copy = join(root, "repo");
  if (NO_GIT) cpSync(SOURCE, copy, { recursive: true, filter: (src) => !/\\(\.git|node_modules|build|\.gradle)(\\|$)/.test(src) });
  else execFileSync("git", ["clone", "--no-hardlinks", "--depth", "1", ...(BRANCH ? ["--branch", BRANCH] : []), SOURCE, copy], { stdio: "pipe" });
  for (const f of INSTRUMENTATION) { const p = join(copy, f); if (existsSync(p)) rmSync(p); }
  return copy;
}

async function runSeat(label: string) {
  const seat = makeSeat(label);
  const copy = makeCopy(label);
  const before = NO_GIT ? hashTree(copy) : null;
  const base = NO_GIT ? "" : git(copy, ["status", "--short"]);
  // agy gets the prompt as a file (argv limit); the prompt text tells it where.
  let prompt = PROMPT;
  if (seat.adapter === "agy_cli") {
    writeFileSync(join(copy, "COUNCIL_PROMPT.md"), PROMPT, "utf-8");
    prompt = "Read COUNCIL_PROMPT.md in your working directory and carry out the task it describes. Do not modify any file.";
    INSTRUMENTATION.push("COUNCIL_PROMPT.md");
  }
  log(`${label}: dispatching ${seat.adapter} (${seat.model}) in ${copy}`);
  const t0 = Date.now();
  let res: AdapterResult;
  try { res = await seat.make().run(prompt, copy, TIMEOUT_MS); } catch (e) { res = { success: false, output: "", error: String(e) }; }
  const elapsed = Math.round((Date.now() - t0) / 1000);
  let ro = "clean";
  if (MODE === "code") {
    ro = "n/a (code mode)";
    if (!NO_GIT) {
      execFileSync("git", ["add", "-A"], { cwd: copy, stdio: "pipe" });
      const patch = git(copy, ["diff", "--cached", "--", ".", ...INSTRUMENTATION.map(f => `:!${f}`)]);
      mkdirSync(OUT_DIR, { recursive: true });
      writeFileSync(join(OUT_DIR, `${label}.patch`), patch, "utf-8");
      log(`${label}: patch ${patch.length} chars → ${label}.patch (review, then: git apply --3way <patch>)`);
    }
  } else if (NO_GIT) {
    const after = hashTree(copy);
    const changed = [...after.entries()].filter(([k, v]) => before!.get(k) !== v && !INSTRUMENTATION.some(f => k.endsWith(f)));
    const removed = [...before!.keys()].filter(k => !after.has(k));
    if (changed.length || removed.length) ro = `UNEXPECTED_WRITE_DETECTED (${[...changed.map(c => c[0]), ...removed].slice(0, 5).join(", ")})`;
  } else {
    const after = git(copy, ["status", "--short"]).split("\n").map(l => l.trim()).filter(Boolean).filter(l => !base.includes(l));
    const unexpected = after.filter(l => !INSTRUMENTATION.some(f => l.endsWith(f)));
    const diff = git(copy, ["diff", "--stat", "--", ".", ...INSTRUMENTATION.map(f => `:!${f}`)]).trim();
    if (unexpected.length || diff) ro = "UNEXPECTED_WRITE_DETECTED";
  }
  log(`${label}: success=${res.success} elapsed=${elapsed}s chars=${res.output.length} read-only=${ro}`);
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, `${label}.md`), [
    `# ${label} — ${seat.adapter} (${seat.model}) — ${RUN_ID}`, "",
    `- success: ${res.success}`, `- elapsed: ${elapsed}s`, `- read-only verification: **${ro}**`, `- copy: ${copy}`,
    res.error ? `\n## adapter error\n\n\`\`\`\n${res.error.slice(-3000)}\n\`\`\`` : "", "", "## Output", "", res.output || "(no output)",
  ].join("\n"), "utf-8");
  const b = res.output.indexOf("BEGIN VERDICT"), e = res.output.indexOf("END VERDICT");
  if (b >= 0 && e > b) {
    const sec = res.output.slice(b + 13, e).trim().replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
    try { writeFileSync(join(OUT_DIR, `${label}-verdict.json`), JSON.stringify(JSON.parse(sec), null, 1), "utf-8"); log(`${label}: verdict parsed`); }
    catch { log(`${label}: verdict JSON unparseable`); }
  }
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "prompt.md"), PROMPT, "utf-8");
  log(`run ${RUN_ID}: seats=${SEATS.join(",")} source=${SOURCE}${NO_GIT ? " (copy, no git)" : ""}`);
  await Promise.all(SEATS.map(runSeat));
  log(`all done → ${OUT_DIR}`);
}
main().catch(e => { console.error("[council] FAILED:", e); process.exit(1); });
