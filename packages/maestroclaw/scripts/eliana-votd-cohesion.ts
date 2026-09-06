#!/usr/bin/env -S npx tsx
/**
 * VOTD ↔ Deeper Lens cohesion pass (2026-09-06). Michael's observation: some Verse-of-the-Day
 * cards were "re-written from the deeper insight" and now sit in "actual disagreement" with it,
 * others "talk about grammar for no reason … filling up word space." Each seat judges all 72
 * pairs (two batches of 36, inline payload) and proposes rewrites DERIVED from the insight.
 *
 * Seats — deliberately mixed generations, per Michael ("newer does not always mean better for
 * ALL tasks"): gpt-6-astra, gpt-5.6-sol (codex_cli); gemini-3.8-flash-high, gemini-3.6-flash-high
 * (agy_cli); claude-fable-5 (claude_code, thamos profile). Kimi: monthly quota exhausted.
 *
 * Each run gets an EMPTY scratch dir as cwd (payload is inline; no repo needed, so nothing to
 * protect). Grounding: the primary-source corpus is local at
 * C:\New folder\Elianas RhythmMigrate\sources\verify.py — seats whose sandbox can reach it are
 * told to run it before asserting any lexical claim; those that can't must say so.
 *
 * Usage (from packages/maestroclaw):
 *   CLAUDE_CONFIG_DIR="$HOME/.claude-thamos" PYTHONIOENCODING=utf-8 \
 *     npx tsx scripts/eliana-votd-cohesion.ts [only=astra,sol,gemini38,gemini36,fable5] [batch=A|B]
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { CodexCliAdapter } from "../src/adapters/codex-cli.js";
import { AgyCliAdapter } from "../src/adapters/agy-cli.js";
import { ClaudeCodeAdapter } from "../src/adapters/claude-code.js";
import type { AdapterResult } from "../src/adapters/types.js";

const PAYLOAD_DIR = "C:\\New folder\\Elianas RhythmMigrate\\Michael\\votd-cohesion";
const RUN_ID = "2026-09-06-votd-cohesion";
const OUT_DIR = join("C:\\New folder\\MaestroOrchestra\\project\\Maestro\\docs\\audits\\eliana-readonly-poc", RUN_ID);
const SCRATCH_ROOT = "C:\\New folder\\claw-scratch";
const TIMEOUT_MS = 40 * 60 * 1000;

function prompt(batch: string, payload: string): string {
  return `Hi — Michael here, via Fable (my concierge agent). Content work, not code.

WHO WE ARE. Eliana's Rhythm is my Christian companion Android app. Home shows a Verse of the Day card
("Sacred Word") from a curated 72-day calendar: Eliana's own rendering of the verse plus three short
fields — Notice This, Why It Matters, Carry It With You. Each day also has a "✦ Deeper insight": a full
Deeper Lens study for the same verse (Scripture in the original, a fresh rendering, key word, lexical
notes, everyday insight, take-home practice), written earlier by the Eliana Bible pipeline and audited.
The card fields were later adapted from those studies.

MY OBSERVATION, verbatim: "the VOTD cards are written in actual disagreement in some cases or rather,
re-written from the deeper insight, when the Deeper insight, if valid, could have rendered inside of
those VOTD cards. Some of the VOTD cards are talking about grammar and stuff for no reason, where
sometimes it adds to the fruit of the verse, sometimes its just us filling up word space. Then you go to
the deeper insight and the original text may vastly differ in some cases. That should receive some
cohesion."

HOUSE COMMITMENTS. The narrator stands inside the Christian confession (warm, confessing, never
clinically neutral) and still never overclaims: every claim wears its real rank. The name is Yeshua.
No sterilizing a defensible pastoral reading; no root fallacies; no theological freight on grammar
that can't carry it. Honor the Jewish first family of every text.

GROUNDING. The primary-source corpus is LOCAL: run
  python "C:\\New folder\\Elianas RhythmMigrate\\sources\\verify.py" greek <Book> <c>:<v>
  python "C:\\New folder\\Elianas RhythmMigrate\\sources\\verify.py" hebrew <Book> <c> <v>
(subcommands: greek, greek-search, hebrew, hebrew-lemma, lxx, syriac; set PYTHONIOENCODING=utf-8)
before asserting or correcting any original-language claim. If your sandbox cannot run it, say so
once at the top and mark such claims (unverified). Do not write files; put everything in your reply.

THE ASK — for EACH of the ${batch === "A" ? "36" : "36"} pairs below (batch ${batch} of 2):
  verdict — one of:
    COHERENT     the card faithfully distills the insight;
    DRIFT        the card says something the insight doesn't (or emphasizes a different point) without
                 contradicting it;
    CONTRADICTS  the card and the insight disagree on a fact, a rendering, a lexical claim, or the
                 verse's point — quote both sides;
    FILLER       the card's grammar/lexical talk adds no fruit to the verse for a reader at 6am;
    INSIGHT_SUSPECT  the INSIGHT itself carries a claim you doubt (say what and why; verify first).
  Multiple verdicts allowed (e.g. DRIFT+FILLER).
  Then, for anything not COHERENT, a REWRITE of the affected fields, derived from the insight,
  keeping the card's register (short, warm, one idea per field; Notice This ≈ 1–2 sentences, Why It
  Matters ≈ 2 sentences, Carry It With You = one concrete practice). If the insight is the problem,
  say what the insight should say instead, ranked.

Be disagreeable where warranted — with the card, with the insight, and with Michael's premise if you
think the divergence is fine. Don't manufacture problems to fill a quota; a mostly-COHERENT batch is a
legitimate result.

OUTPUT. Begin with the model you are running as. Then a ≤200-word read of the batch's pattern (what
kind of drift recurs, how often grammar is filler vs fruit). Then the per-entry notes (brief for
COHERENT). END with a JSON array between the exact lines BEGIN VERDICTS and END VERDICTS, one object
per entry, in order:
  {"n":1,"reference":"…","verdicts":["DRIFT"],"reason":"<one sentence>",
   "rewrite":{"noticeThis":"…"|null,"whyItMatters":"…"|null,"carryItWithYou":"…"|null},
   "insight_issue":"<or null>"}

=== THE PAIRS (JSON) ===

${payload}`;
}

interface Seat { label: string; adapter: string; model: string; env: Record<string, string>; make: () => { run: (p: string, d: string, t: number) => Promise<AdapterResult> } }
// Model selection for codex/agy/claude adapters is read from env at module load, so each seat's
// adapter is constructed after setting its variable (adapters read process.env lazily per run? —
// no: they read at import). We therefore spawn each seat with the env already set by the caller
// and select the seat via `only=`; the launcher below sets the right variable per seat.
const SEATS: Seat[] = [
  { label: "astra", adapter: "codex_cli", model: "gpt-6-astra", env: { CLAW_CODEX_MODEL: "gpt-6-astra" }, make: () => new CodexCliAdapter({ sandbox: "read-only" }) },
  { label: "sol", adapter: "codex_cli", model: "gpt-5.6-sol", env: { CLAW_CODEX_MODEL: "gpt-5.6-sol" }, make: () => new CodexCliAdapter({ sandbox: "read-only" }) },
  { label: "gemini38", adapter: "agy_cli", model: "gemini-3.8-flash-high", env: { CLAW_AGY_MODEL: "gemini-3.8-flash-high" }, make: () => new AgyCliAdapter() },
  { label: "gemini36", adapter: "agy_cli", model: "gemini-3.6-flash-high", env: { CLAW_AGY_MODEL: "gemini-3.6-flash-high" }, make: () => new AgyCliAdapter() },
  { label: "fable5", adapter: "claude_code", model: "claude-fable-5", env: { CLAW_CLAUDE_MODEL: "claude-fable-5" }, make: () => new ClaudeCodeAdapter() },
];

function log(m: string) { console.log(`[votd-cohesion] ${m}`); }

async function runSeatBatch(seat: Seat, batch: string) {
  const payload = readFileSync(join(PAYLOAD_DIR, `cohesion-batch-${batch}.json`), "utf-8");
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const dir = mkdtempSync(join(SCRATCH_ROOT, `votd-${seat.label}-${batch}-`));
  // agy passes the prompt as a command-line ARGUMENT (codex/claude take stdin), and a 131 KB
  // payload dies with `spawn ENAMETOOLONG` on Windows. For agy the pairs go into a file in the
  // seat's own working directory (which --add-dir grants) and the prompt points at it.
  const p = seat.adapter === "agy_cli"
    ? (() => { writeFileSync(join(dir, "pairs.json"), payload, "utf-8");
               return prompt(batch, `The pairs are NOT inline: read the file pairs.json in your working directory (${dir}) — it is the JSON array of ${batch === "A" ? 36 : 36} pairs described above. Read it in full before judging.`); })()
    : prompt(batch, payload);
  log(`${seat.label}/${batch}: dispatching ${seat.adapter} (${seat.model})`);
  const t0 = Date.now();
  let res: AdapterResult;
  try { res = await seat.make().run(p, dir, TIMEOUT_MS); } catch (e) { res = { success: false, output: "", error: String(e) }; }
  const elapsed = Math.round((Date.now() - t0) / 1000);
  log(`${seat.label}/${batch}: success=${res.success} elapsed=${elapsed}s chars=${res.output.length}`);
  writeFileSync(join(OUT_DIR, `${seat.label}-${batch}.md`), [
    `# ${seat.label} — ${seat.adapter} (${seat.model}) — VOTD cohesion, batch ${batch}`, "",
    `- success: ${res.success}`, `- elapsed: ${elapsed}s`, `- scratch: ${dir}`,
    res.error ? `\n## adapter error\n\n\`\`\`\n${res.error.slice(-3000)}\n\`\`\`` : "", "", "## Output", "", res.output || "(no output)",
  ].join("\n"), "utf-8");
  const b = res.output.indexOf("BEGIN VERDICTS"), e = res.output.indexOf("END VERDICTS");
  if (b >= 0 && e > b) {
    const sec = res.output.slice(b + 14, e).trim().replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
    try { const v = JSON.parse(sec); writeFileSync(join(OUT_DIR, `${seat.label}-${batch}-verdicts.json`), JSON.stringify(v, null, 1), "utf-8"); log(`${seat.label}/${batch}: ${v.length} verdicts parsed`); }
    catch (err) { log(`${seat.label}/${batch}: verdict JSON unparseable (${err})`); }
  } else log(`${seat.label}/${batch}: no verdict block`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const onlyArg = process.argv.find(a => a.startsWith("only="));
  const only = onlyArg ? new Set(onlyArg.slice(5).split(",")) : null;
  const batchArg = process.argv.find(a => a.startsWith("batch="))?.slice(6);
  const batches = batchArg ? [batchArg] : ["A", "B"];
  const seats = SEATS.filter(s => !only || only.has(s.label));
  if (seats.length !== 1) { console.error("Run ONE seat per process (model env is read at adapter import): pass only=<seat>"); process.exit(2); }
  writeFileSync(join(OUT_DIR, `prompt-${batches[0]}.md`), prompt(batches[0], "<payload: cohesion-batch-" + batches[0] + ".json>"), "utf-8");
  log(`run ${RUN_ID}: ${seats[0].label}=${seats[0].model} batches=${batches.join(",")}`);
  await Promise.all(batches.map(b => runSeatBatch(seats[0], b)));
  log(`done ${seats[0].label} → ${OUT_DIR}`);
}
main().catch(e => { console.error("[votd-cohesion] FAILED:", e); process.exit(1); });
