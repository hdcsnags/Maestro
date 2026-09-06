#!/usr/bin/env -S npx tsx
/**
 * Journey assessment — Astra / Kimi K3 / Gemini 3.8 Flash read the REBUILT Journey tab on branch
 * `ux-council-fixes` against the previous one (on `main`), with Michael's own reaction quoted
 * verbatim, and propose what Journey should be. Not blind — the point is a design critique with
 * the product owner's brief in hand. Per-seat clones under C:\New folder\claw-scratch (Codex's
 * sandbox cannot read %TEMP%); read-only verified by git status.
 *
 * Usage (from packages/maestroclaw):
 *   CLAW_CODEX_MODEL=gpt-6-astra CLAW_KIMI_MODEL=kimi-code/k3 CLAW_AGY_MODEL=gemini-3.8-flash-high \
 *   PYTHONIOENCODING=utf-8 npx tsx scripts/eliana-journey-assess.ts [only=astra,kimi,gemini]
 */
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { CodexCliAdapter } from "../src/adapters/codex-cli.js";
import { KimiCliAdapter } from "../src/adapters/kimi-cli.js";
import { AgyCliAdapter } from "../src/adapters/agy-cli.js";
import type { AdapterResult } from "../src/adapters/types.js";

const SOURCE = "C:\\New folder\\Elianas RhythmMigrate\\Elianas Rhythm";
const BRANCH = "ux-council-fixes";
const RUN_ID = "2026-09-06-journey-assess";
const OUT_DIR = join("C:\\New folder\\MaestroOrchestra\\project\\Maestro\\docs\\audits\\eliana-readonly-poc", RUN_ID);
const SCRATCH_ROOT = "C:\\New folder\\claw-scratch";
const TIMEOUT_MS = 25 * 60 * 1000;
const INSTRUMENTATION = ["session.log", ".maestroclaw-session.log"];

const PROMPT = `Hi — Michael here, via Fable (my concierge agent). This is a design critique, not a blind audit: you
know who built what and what I think, and I want you to push back on either of us.

CONTEXT. Eliana's Rhythm is my Christian companion Android app (Kotlin/Compose). Bottom bar: Home ·
Stillness · Journey · Bible · Eliana. Yesterday a four-model council (you were in it) found Home and
Journey were duplicate launchpads and that Prayer and Journal had no home of their own. Last night Fable
rebuilt Journey on branch \`${BRANCH}\` (you are in a clone of that branch; the OLD Journey is
\`git show main:app/src/main/java/com/eliana/rhythm/ui/screens/JourneyScreen.kt\`). The new file is
\`app/src/main/java/com/eliana/rhythm/ui/screens/JourneyScreen.kt\`. Home is
\`app/src/main/java/com/eliana/rhythm/HomeScreen.kt\` (+ \`ui/components/home/\`); the bar is
\`BottomNavigationBar.kt\`; the tab graph is \`MainScreen.kt\`. STATE.md's top entries describe what
changed and why. The Bible tab now has tap-a-word word study built in.

MY REACTION, verbatim: "I aint feelin it bruh … now that you stripped it all out, I really dont mind the
journey being a second home away from home, home is for the word and reading, Journey gets you everything
else. I do like the emphasis on write and pray but … practice, dont like the word practice there at all,
practice what? Then Write and Pray have Guided prompts (Journal) and generate a prayer (Pray) right below
them...? Look back may be cool, but all the other things … I dont know I dont like it."

THE ASK. Read both versions of Journey and the Home they sit next to, then tell me:
  1. Your honest verdict on the rebuild (what it got right, what it got wrong) — one paragraph.
  2. What Journey should BE, in one sentence, given my rule: Home = the Word and reading; Journey =
     everything else. If you think that rule is wrong, say so and why.
  3. A concrete layout for Journey, top to bottom, as a text sketch: every card/section, its label
     (no "Practice"), its one-line description, and where each tap goes (real routes only — see
     MainScreen.kt). Name what you'd remove from the current rebuild and what you'd bring back from the
     old one. Address the redundancy I named (Write vs Guided prompts, Pray vs Generate a prayer).
  4. Anything on Journey that would duplicate Home or a bottom tab, and whether that duplication is
     fine (a second home) or not.
  5. ≤3 sentences: what you'd tell me I'm wrong about, if anything.
Ground every claim in the files. Read-only: do not create, modify or delete anything; do not build.
1,000–1,800 words. Begin with the model you are running as. End with a JSON block between the exact
lines BEGIN VERDICT and END VERDICT:
  {"verdict":"keep|revise|revert","journey_is":"<one sentence>","remove":[...],"bring_back":[...],
   "sections":[{"label":"...","items":["..."]}],"disagree_with_michael":"<or null>"}`;

interface Member { label: string; adapter: string; model: string; make: () => { run: (p: string, d: string, t: number) => Promise<AdapterResult> } }
const MEMBERS: Member[] = [
  { label: "astra", adapter: "codex_cli", model: process.env.CLAW_CODEX_MODEL ?? "(default)", make: () => new CodexCliAdapter({ sandbox: "read-only" }) },
  { label: "kimi", adapter: "kimi_cli", model: process.env.CLAW_KIMI_MODEL ?? "(default)", make: () => new KimiCliAdapter() },
  { label: "gemini", adapter: "agy_cli", model: process.env.CLAW_AGY_MODEL ?? "(default)", make: () => new AgyCliAdapter() },
];

function log(m: string) { console.log(`[journey-assess] ${m}`); }
function git(dir: string, args: string[]) { try { return execFileSync("git", args, { cwd: dir, encoding: "utf8" }); } catch (e) { return `(git failed: ${e})`; } }

function makeClone(label: string): string {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const root = mkdtempSync(join(SCRATCH_ROOT, `journey-${label}-`));
  const clone = join(root, "repo");
  // Full clone (not depth 1): the prompt asks seats to diff against main.
  execFileSync("git", ["clone", "--no-hardlinks", "--branch", BRANCH, SOURCE, clone], { stdio: "pipe" });
  // session.log is gitignored on this branch (untracked 2026-09-05); nothing to scrub.
  const sl = join(clone, "session.log"); if (existsSync(sl)) rmSync(sl);
  return clone;
}

async function runSeat(m: Member) {
  const clone = makeClone(m.label);
  const base = git(clone, ["status", "--short"]);
  log(`${m.label}: dispatching ${m.adapter} (${m.model})`);
  const t0 = Date.now();
  let res: AdapterResult;
  try { res = await m.make().run(PROMPT, clone, TIMEOUT_MS); } catch (e) { res = { success: false, output: "", error: String(e) }; }
  const elapsed = Math.round((Date.now() - t0) / 1000);
  const after = git(clone, ["status", "--short"]).split("\n").map(l => l.trim()).filter(Boolean).filter(l => !base.includes(l));
  const unexpected = after.filter(l => !INSTRUMENTATION.some(f => l.endsWith(f)));
  const diff = git(clone, ["diff", "--stat", "--", ".", ...INSTRUMENTATION.map(f => `:!${f}`)]).trim();
  const ro = unexpected.length || diff ? "UNEXPECTED_WRITE_DETECTED" : "clean";
  log(`${m.label}: success=${res.success} elapsed=${elapsed}s chars=${res.output.length} read-only=${ro}`);
  writeFileSync(join(OUT_DIR, `${m.label}.md`), [
    `# ${m.label} — ${m.adapter} (${m.model}) — Journey assessment`, "",
    `- success: ${res.success}`, `- elapsed: ${elapsed}s`, `- read-only verification: **${ro}**`, `- clone: ${clone}`,
    res.error ? `\n## adapter error\n\n\`\`\`\n${res.error.slice(-3000)}\n\`\`\`` : "", "", "## Output", "", res.output || "(no output)",
  ].join("\n"), "utf-8");
  const b = res.output.indexOf("BEGIN VERDICT"), e = res.output.indexOf("END VERDICT");
  if (b >= 0 && e > b) {
    const sec = res.output.slice(b + 13, e).trim().replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
    try { writeFileSync(join(OUT_DIR, `${m.label}-verdict.json`), JSON.stringify(JSON.parse(sec), null, 1), "utf-8"); log(`${m.label}: verdict parsed`); }
    catch { log(`${m.label}: verdict JSON unparseable`); }
  } else log(`${m.label}: no verdict block`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "prompt.md"), PROMPT, "utf-8");
  const onlyArg = process.argv.find(a => a.startsWith("only="));
  const only = onlyArg ? new Set(onlyArg.slice(5).split(",")) : null;
  const seats = MEMBERS.filter(m => !only || only.has(m.label));
  log(`run ${RUN_ID}: ${seats.map(s => `${s.label}=${s.model}`).join(", ")}`);
  await Promise.all(seats.map(runSeat));
  log(`all done → ${OUT_DIR}`);
}
main().catch(e => { console.error("[journey-assess] FAILED:", e); process.exit(1); });
