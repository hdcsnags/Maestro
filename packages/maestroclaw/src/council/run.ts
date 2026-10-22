// Council run engine. Successor to scripts/council-dispatch.ts (2026-09-10), now a
// library with a resumable manifest, a usage ledger, sandbox attestation, verdict
// re-ask and no hard-coded paths. One process can host seats on different models.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync, readdirSync, statSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, basename, resolve } from "node:path";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import type { AdapterResult, OnLineFn } from "../adapters/types.js";
import { makeAdapter, sandboxDeclaration } from "./seats.js";
import { extractVerdict, reaskPrompt, reaskMissingPrompt, withContract } from "./verdict.js";
import type { CouncilRunOptions, RunManifest, SeatRecord, SeatSpec, SeatStatus, UsageEntry } from "./types.js";

/** Codex prints a startup banner (model/provider/approval/sandbox/session id) to stdout even in exec mode. */
export function parseCodexBanner(rawStdout: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const patterns: [string, RegExp][] = [
    ["model", /^model:\s*(.+)$/m], ["provider", /^provider:\s*(.+)$/m], ["approval", /^approval:\s*(.+)$/m],
    ["sandbox", /^sandbox:\s*(.+)$/m], ["reasoning_effort", /^reasoning effort:\s*(.+)$/m], ["session_id", /^session id:\s*(.+)$/m],
  ];
  for (const [key, re] of patterns) { const m = rawStdout.match(re); if (m) fields[key] = m[1].trim(); }
  return fields;
}

export const INSTRUMENTATION = ["session.log", ".maestroclaw-session.log", "COUNCIL_PROMPT.md"];
const WINDOW_RE = /usage limit|resets? at|rate.?limit|too many requests|\b429\b|quota|access_terminated|usage window|try again (at|in)/i;
const SKIP_DIRS = new Set([".git", "node_modules", "build", ".gradle", "dist", ".next"]);

export function councilHome(): string {
  return process.env.MAESTRO_COUNCIL_HOME ?? join(homedir(), ".maestroclaw", "council");
}
export function defaultScratchRoot(): string {
  return process.env.COUNCIL_SCRATCH ?? join(councilHome(), "scratch");
}
export function defaultOutRoot(project: string): string {
  if (process.env.COUNCIL_OUT_ROOT) return join(process.env.COUNCIL_OUT_ROOT, project);
  const repoAudits = join(process.cwd(), "docs", "audits");
  if (existsSync(repoAudits)) return join(repoAudits, project);
  // Inside packages/maestroclaw: the Maestro repo root is two levels up.
  const up = join(process.cwd(), "..", "..", "docs", "audits");
  if (existsSync(up)) return join(resolve(up), project);
  return join(councilHome(), "runs", project);
}

export function sha256(s: string): string { return createHash("sha256").update(s, "utf-8").digest("hex"); }
export function log(m: string): void { console.log(`[council] ${m}`); }
function git(dir: string, args: string[]): string { try { return execFileSync("git", args, { cwd: dir, encoding: "utf8" }); } catch (e) { return `(git failed: ${String(e).slice(0, 120)})`; } }

export function hashTree(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      if (SKIP_DIRS.has(name)) continue;
      const p = join(d, name);
      const st = statSync(p);
      if (st.isDirectory()) walk(p); else out.set(p.slice(dir.length + 1), createHash("sha1").update(readFileSync(p)).digest("hex"));
    }
  };
  walk(dir);
  return out;
}

export function classifyExit(res: AdapterResult, elapsedMs: number, timeoutMs: number): SeatStatus {
  const text = `${res.error ?? ""}\n${res.output.slice(-2000)}`;
  if (!res.success && elapsedMs >= timeoutMs - 1500) return "timeout";
  if (WINDOW_RE.test(res.error ?? "") || (!res.success && WINDOW_RE.test(text))) return "window";
  if (!res.success) return "failed";
  if (res.output.trim().length === 0) return "empty";
  return "done";
}

export function makeCopy(opts: CouncilRunOptions, label: string): string {
  mkdirSync(opts.scratchRoot, { recursive: true });
  const root = mkdtempSync(join(opts.scratchRoot, `${opts.project}-${label}-`));
  const copy = join(root, "repo");
  if (opts.noGit) {
    cpSync(opts.source, copy, { recursive: true, filter: (src) => !basename(src) || !SKIP_DIRS.has(basename(src)) });
  } else {
    // A plain local path makes git ignore --depth (full history lands in the seat copy — 2026-10-21
    // council, Q7). A file:// URL makes the clone genuinely shallow.
    const src = /^[a-z]+:\/\//i.test(opts.source) ? opts.source : `file://${resolve(opts.source).replace(/\\/g, "/")}`;
    execFileSync("git", ["clone", "--no-hardlinks", "--depth", "1", ...(opts.branch ? ["--branch", opts.branch] : []), src, copy], { stdio: "pipe" });
  }
  for (const f of INSTRUMENTATION) { const p = join(copy, f); if (existsSync(p)) rmSync(p); }
  // Blindness scrub (2026-09-05 leak; Gemini 4 Argon 2026-10-21 Q7): remove files that summarise
  // other seats' findings before this seat reads the copy. Opt-in because some briefs ask seats
  // to read the state file on purpose.
  for (const rel of opts.scrub ?? []) {
    const p = join(copy, rel);
    if (existsSync(p)) { rmSync(p, { recursive: true, force: true }); log(`${label}: scrubbed ${rel} from the copy`); }
  }
  return copy;
}

export function loadManifest(runDir: string): RunManifest | null {
  const p = join(runDir, "manifest.json");
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf-8")) as RunManifest;
}
export function saveManifest(runDir: string, m: RunManifest): void {
  m.updated_at = new Date().toISOString();
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "manifest.json"), JSON.stringify(m, null, 2), "utf-8");
}
export function appendCheckpoint(runDir: string, line: string): void {
  const stamp = new Date().toISOString();
  appendFileSync(join(runDir, "CHECKPOINT.md"), `- ${stamp} — ${line}\n`, "utf-8");
  const m = loadManifest(runDir);
  if (m) { m.checkpoints.push(`${stamp} ${line}`); saveManifest(runDir, m); }
}
export function appendUsage(entry: UsageEntry): void {
  const dir = councilHome();
  mkdirSync(dir, { recursive: true });
  appendFileSync(join(dir, "usage.jsonl"), JSON.stringify(entry) + "\n", "utf-8");
}

function initManifest(opts: CouncilRunOptions, prompt: string): RunManifest {
  const existing = opts.resume ? loadManifest(opts.outDir) : null;
  const seats: SeatRecord[] = opts.seats.map((s) => {
    const prior = existing?.seats.find((x) => x.label === s.label);
    if (prior && prior.status === "done") return prior;
    return { label: s.label, adapter: s.adapter, model: s.model ?? "(default)", status: "queued" };
  });
  return {
    schema: "maestro.council.run/1",
    run_id: opts.runId, project: opts.project, label: opts.label, mode: opts.mode,
    source: opts.source, ...(opts.branch ? { branch: opts.branch } : {}), no_git: opts.noGit,
    prompt_file: opts.promptFile, prompt_sha256: sha256(prompt), timeout_ms: opts.timeoutMs,
    created_at: existing?.created_at ?? new Date().toISOString(), updated_at: new Date().toISOString(),
    seats, checkpoints: existing?.checkpoints ?? [],
  };
}

async function runSeat(opts: CouncilRunOptions, manifest: RunManifest, seat: SeatSpec, basePrompt: string): Promise<void> {
  const rec = manifest.seats.find((x) => x.label === seat.label)!;
  const adapter = makeAdapter(seat, opts.mode);
  const copy = makeCopy(opts, seat.label);
  rec.copy_dir = copy; rec.status = "running"; rec.started_at = new Date().toISOString();
  saveManifest(opts.outDir, manifest);

  const before = opts.noGit ? hashTree(copy) : null;
  const base = opts.noGit ? "" : git(copy, ["status", "--short"]);
  let prompt = basePrompt;
  if (opts.seatPreamble) { const pre = opts.seatPreamble(seat); if (pre) prompt = `${pre.trimEnd()}\n\n${prompt}`; }
  // agy takes the prompt as argv (ENAMETOOLONG above ~32 KB): hand it a file in its own copy.
  if (seat.adapter === "agy_cli") {
    writeFileSync(join(copy, "COUNCIL_PROMPT.md"), prompt, "utf-8");
    prompt = `Read COUNCIL_PROMPT.md in your working directory and carry out the task it describes.${opts.mode === "audit" ? " Do not modify any file." : ""}`;
  }
  const decl = sandboxDeclaration(seat, opts.mode);
  // Codex 0.163 prints its startup banner (model, sandbox, session id) on STDERR; capture both.
  let rawStdout = "";
  const onLine: OnLineFn = (_type, line) => { if (rawStdout.length < 200_000) rawStdout += line + "\n"; };

  log(`${seat.label}: dispatching ${seat.adapter} (${seat.model ?? "default"}) in ${copy}${opts.mode === "code" ? " [code mode: session run, writes allowed in the copy]" : ""}`);
  const t0 = Date.now();
  let res: AdapterResult;
  try {
    // Code mode uses the adapter's session path (the executor's build_session path): writes land in the
    // seat's own disposable copy, never in the source. Audit mode uses the read-only task path.
    res = opts.mode === "code" && adapter.runSession
      ? await adapter.runSession(prompt, copy, opts.timeoutMs)
      : await adapter.run(prompt, copy, opts.timeoutMs, onLine);
  } catch (e) { res = { success: false, output: "", error: String(e) }; }
  let elapsedMs = Date.now() - t0;

  // Verdict handling with one stateless re-ask when the block is truncated, missing or unparseable.
  let ext = extractVerdict(res.output);
  let reasks = 0;
  if (ext.status !== "parsed" && opts.reaskTruncated && res.success && res.output.trim().length > 0) {
    log(`${seat.label}: verdict ${ext.status} — re-asking for the block alone`);
    reasks = 1;
    let p = ext.status === "truncated" ? reaskPrompt(basePrompt, res.output) : reaskMissingPrompt(basePrompt, res.output, ext.error ?? ext.status);
    // agy takes the prompt as argv: hand the re-ask over as a file too (Gemini 4 Argon, 2026-10-21 council, Q4).
    if (seat.adapter === "agy_cli") {
      writeFileSync(join(copy, "COUNCIL_PROMPT.md"), p, "utf-8");
      p = "Read COUNCIL_PROMPT.md in your working directory and do exactly what it says: reply with only the verdict block.";
    }
    const again = await adapter.run(p, copy, Math.min(opts.timeoutMs, 10 * 60 * 1000));
    elapsedMs = Date.now() - t0;
    const ext2 = extractVerdict(again.output);
    if (ext2.status === "parsed") { ext = ext2; res = { ...res, output: `${res.output}\n\n<!-- verdict block recovered by re-ask -->\n${again.output.slice(again.output.lastIndexOf("BEGIN VERDICT"))}` }; }
  }
  // Harness-observed tool activity: lines in the raw CLI stream that look like tool/exec calls.
  // Independent of the seat's self-reported attestation; shown beside it in the matrix.
  const observedToolCalls = (rawStdout.match(/^(exec|tool|\s*\$ |\[tool\]|▶|Running:|Executing|Read\(|Bash\(|Grep\(|Edit\(|Write\()/gm) ?? []).length;

  // Read-only / patch verification.
  let ro = "clean";
  if (opts.mode === "code") {
    ro = "n/a (code mode)";
    if (!opts.noGit) {
      execFileSync("git", ["add", "-A"], { cwd: copy, stdio: "pipe" });
      const patch = git(copy, ["diff", "--cached", "--", ".", ...INSTRUMENTATION.map((f) => `:!${f}`)]);
      const pf = join(opts.outDir, `${seat.label}.patch`);
      writeFileSync(pf, patch, "utf-8"); rec.patch_file = pf;
      log(`${seat.label}: patch ${patch.length} chars → ${basename(pf)}`);
    } else {
      // Plain-folder source (greenfield site, no repo yet): collect every new or changed file into
      // <out>/<seat>-files/ so the concierge can review and copy them in.
      const after = hashTree(copy);
      const changed = [...after.keys()].filter((k) => before!.get(k) !== after.get(k) && !INSTRUMENTATION.some((f) => k.endsWith(f)));
      const filesDir = join(opts.outDir, `${seat.label}-files`);
      for (const rel of changed) { const dest = join(filesDir, rel); mkdirSync(join(dest, ".."), { recursive: true }); cpSync(join(copy, rel), dest); }
      const removed = [...before!.keys()].filter((k) => !after.has(k));
      writeFileSync(join(opts.outDir, `${seat.label}-files.json`), JSON.stringify({ changed, removed }, null, 1), "utf-8");
      rec.patch_file = filesDir; ro = `${changed.length} file(s) written, ${removed.length} removed → ${basename(filesDir)}/`;
      log(`${seat.label}: ${ro}`);
    }
  } else if (opts.noGit) {
    const after = hashTree(copy);
    const changed = [...after.entries()].filter(([k, v]) => before!.get(k) !== v && !INSTRUMENTATION.some((f) => k.endsWith(f)));
    const removed = [...before!.keys()].filter((k) => !after.has(k));
    if (changed.length || removed.length) ro = `UNEXPECTED_WRITE_DETECTED (${[...changed.map((c) => c[0]), ...removed].slice(0, 5).join(", ")})`;
  } else {
    const after = git(copy, ["status", "--short"]).split("\n").map((l) => l.trim()).filter(Boolean).filter((l) => !base.includes(l));
    const unexpected = after.filter((l) => !INSTRUMENTATION.some((f) => l.endsWith(f)));
    const diff = git(copy, ["diff", "--stat", "--", ".", ...INSTRUMENTATION.map((f) => `:!${f}`)]).trim();
    if (unexpected.length || diff) ro = "UNEXPECTED_WRITE_DETECTED";
  }

  // Sandbox attestation: verified only when the CLI's own banner confirms it.
  const banner = seat.adapter === "codex_cli" ? parseCodexBanner(rawStdout) : {};
  rec.sandbox = { mode: decl.mode, flag: decl.flag, verified: seat.adapter === "codex_cli" ? banner.sandbox === decl.mode : false };
  if (banner.model) rec.resolved_model = banner.model;
  if (banner.session_id) rec.resolved_model = `${rec.resolved_model ?? rec.model} (session ${banner.session_id.slice(0, 8)})`;

  const status = classifyExit(res, elapsedMs, opts.timeoutMs);
  rec.status = status; rec.success = res.success; rec.elapsed_s = Math.round(elapsedMs / 1000); rec.chars = res.output.length;
  rec.read_only = ro; rec.verdict = ext.status; rec.reasks = reasks; rec.finished_at = new Date().toISOString();
  rec.observed_tool_calls = observedToolCalls;
  if (ext.status === "parsed") rec.attestation = ext.json?.attestation ?? { missing: true };
  if (res.error) rec.error = res.error.slice(-2000);

  const seatModel = rec.resolved_model ?? seat.model ?? "(default)";
  const outFile = join(opts.outDir, `${seat.label}.md`);
  writeFileSync(outFile, [
    `# ${seat.label} — ${seat.adapter} (${seatModel}) — ${opts.runId}`, "",
    `- status: ${status}`, `- success: ${res.success}`, `- elapsed: ${rec.elapsed_s}s`, `- read-only verification: **${ro}**`,
    `- sandbox: ${rec.sandbox.mode} via \`${rec.sandbox.flag}\` (${rec.sandbox.verified ? "verified by CLI banner" : "declared, not verified"})`,
    `- verdict block: ${ext.status}${reasks ? ` (after ${reasks} re-ask)` : ""}`, `- observed tool lines: ${observedToolCalls}`,
    res.error ? `\n## adapter error\n\n\`\`\`\n${res.error.slice(-3000)}\n\`\`\`` : "", "", "## Output", "", res.output || "(no output)",
  ].join("\n"), "utf-8");
  rec.output_file = outFile;
  if (ext.status === "parsed") writeFileSync(join(opts.outDir, `${seat.label}-verdict.json`), JSON.stringify(ext.json, null, 1), "utf-8");
  else if (ext.raw) writeFileSync(join(opts.outDir, `${seat.label}-verdict.${ext.status}.txt`), ext.raw, "utf-8");
  saveManifest(opts.outDir, manifest);
  appendUsage({ ts: new Date().toISOString(), run_id: opts.runId, project: opts.project, seat: seat.label, adapter: seat.adapter, model: seatModel, elapsed_s: rec.elapsed_s, chars: rec.chars, exit_class: status, started_by: operatorLabel() });
  log(`${seat.label}: ${status} elapsed=${rec.elapsed_s}s chars=${rec.chars} read-only=${ro} verdict=${ext.status}`);
}

/** Who started the run, for the usage ledger. MAESTRO_OPERATOR (a label, not an OS username) or "operator". */
function operatorLabel(): string { return process.env.MAESTRO_OPERATOR ?? "operator"; }

export async function runCouncil(opts: CouncilRunOptions): Promise<RunManifest> {
  mkdirSync(opts.outDir, { recursive: true });
  // Replay input is immutable: a resume re-reads the run's own frozen prompt.md, not the original
  // file, which may have changed (2026-10-21 council, Q7).
  const frozen = join(opts.outDir, "prompt.md");
  let prompt: string;
  if (opts.resume && existsSync(frozen)) {
    prompt = readFileSync(frozen, "utf-8");
  } else {
    const rawPrompt = readFileSync(opts.promptFile, "utf-8");
    prompt = opts.contract ? withContract(rawPrompt) : rawPrompt;
    writeFileSync(frozen, prompt, "utf-8");
  }
  const manifest = initManifest(opts, prompt);
  saveManifest(opts.outDir, manifest);
  const todo = opts.seats.filter((s) => manifest.seats.find((r) => r.label === s.label)?.status !== "done");
  log(`run ${opts.runId}: seats=${todo.map((s) => s.label).join(",") || "(none pending)"} source=${opts.source}${opts.noGit ? " (copy, no git)" : ""} mode=${opts.mode}`);
  await Promise.all(todo.map((s) => runSeat(opts, manifest, s, prompt)));
  const pending = manifest.seats.filter((r) => r.status !== "done");
  log(`finished → ${opts.outDir}${pending.length ? ` (${pending.length} seat(s) not done: ${pending.map((p) => `${p.label}=${p.status}`).join(", ")}; \`council resume\` re-dispatches them)` : ""}`);
  return manifest;
}
