#!/usr/bin/env -S npx tsx
/**
 * Blind independent drafts for the new Aliyah module "Who Raised Him?" —
 * Sol (codex_cli, gpt-5.6-sol) and Gemini (agy, gemini-3.1-pro-high) write in
 * parallel, per ALIYAH-PIPELINE step 2: house commitments stated as context,
 * interpretive handling left free, no convergence-manufacturing hints. Kimi's
 * K3 swarm runs separately (Michael dispatched it); Fable writes his own blind
 * draft without reading any of these.
 *
 * Read-only sandboxes — outputs are captured from adapter stdout and written
 * by THIS script to the repo root, following the ALIYAH-ASCENT-DRAFT-*.md
 * convention.
 *
 * Usage:
 *   cd packages/maestroclaw
 *   CLAW_CODEX_MODEL=gpt-5.6-sol CLAW_AGY_MODEL=gemini-3.1-pro-high \
 *     npx tsx scripts/eliana-who-raised-him-blind-drafts.ts
 */

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { CodexCliAdapter } from "../src/adapters/codex-cli.js";
import { AgyCliAdapter } from "../src/adapters/agy-cli.js";

const MIGRATE_ROOT = "C:\\New folder\\Elianas RhythmMigrate";
const REPO = join(MIGRATE_ROOT, "Elianas Rhythm");
const TIMEOUT_MS = 25 * 60 * 1000;
const OUT_DIR = join(
  "C:\\New folder\\MaestroOrchestra\\project\\Maestro\\docs\\audits\\eliana-readonly-poc",
  "2026-08-24-who-raised-him-blind-drafts",
);

const PROMPT = `You are writing a BLIND, independent draft of a new study module for Aliyah — The
Ascent, the chain-study book inside Eliana's Rhythm (a Christian spiritual companion app named for
the developer's daughter). Other council members are drafting the same module separately; you must
not seek out or imitate their work. Yours stands alone.

THE SEED — the anomaly this study opens with:
"Who raised Yeshua from the dead?" Ask the New Testament and listen carefully to every answer it
actually gives. Follow the texts wherever they lead, at full strength.

HOUSE COMMITMENTS (binding context — how this book is written, not what you must conclude):
- The narrator stands INSIDE the Christian faith — warm, confessing, never clinically neutral.
  House sentence: "Faith determines where Aliyah stands. Evidence determines what Aliyah is
  allowed to claim from there." The narrator "I" is Eliana.
- The name used is Yeshua (Messiah rather than Christ in running prose).
- Every claim wears its evidence rank inline, in plain words: direct quotation / lexical or
  morphological observation / strong allusion / shared theme / theological synthesis (labeled as
  ours, yours to weigh) / contested text / open question. The reader must always be able to tell
  which they are being handed.
- Positions you decline are presented at their strongest, in their own best texts, before being
  declined — and never by describing how they ought to feel.
- Original languages are mandatory: exact Greek/Hebrew with transliteration wherever a claim
  rests on wording. VERIFY every checkable original-language claim against the LOCAL primary-source
  corpus before asserting it — from the repo root's sibling directory: \`python "../sources/verify.py"\`
  with subcommands greek / greek-search / hebrew / hebrew-lemma / lxx / syriac (run it with no args
  for usage; set PYTHONIOENCODING=utf-8). Do not assert manuscript readings from memory.
- Honor the Jewish first family of every text you touch; contempt for the people whose prayer
  book this is misreads the chain from the first link.
- You MAY read the six shipped studies at "Elianas Rhythm/app/src/main/assets/studies/entries/"
  to calibrate voice and format. Do NOT read any ALIYAH-ASCENT-DRAFT-*.md files.

FORM: a "full ascent" in readable markdown — title, subtitle, one-paragraph abstract, then 7–11
titled movements (content-shaped, not day-numbered), practice items near the end, exactly ONE
closing prayer. Total 3,000–4,500 words. Interpretive structure, discoveries, emphases, and
conclusions are entirely YOURS.

DELIVERABLE: output ONLY the complete draft markdown, nothing else.`;

function log(msg: string): void {
  console.log(`[who-raised-him] ${msg}`);
}

async function main() {
  if (!existsSync(REPO)) throw new Error(`repo not found: ${REPO}`);
  mkdirSync(OUT_DIR, { recursive: true });

  const geminiOnly = process.argv[2] === "gemini-only";
  log(geminiOnly ? "Retry: Gemini (agy) only, cwd = repo root..." : "Dispatching Sol (codex, read-only) and Gemini (agy) in parallel...");
  const sol = new CodexCliAdapter({ sandbox: "read-only" });
  const gemini = new AgyCliAdapter();

  const t0 = Date.now();
  // Gemini runs with the REPO as cwd (its first run resolved the studies path
  // from the migrate root and treated the miss as fatal); relative paths in the
  // prompt ("../sources/verify.py", app/src/main/...) both resolve from REPO.
  const [solRes, gemRes] = await Promise.all([
    geminiOnly
      ? Promise.resolve({ success: false, output: "", error: "(skipped — gemini-only retry)" })
      : sol.run(PROMPT, MIGRATE_ROOT, TIMEOUT_MS).catch((e) => ({ success: false, output: "", error: String(e) })),
    gemini.run(PROMPT, REPO, TIMEOUT_MS).catch((e) => ({ success: false, output: "", error: String(e) })),
  ]);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  log(`done in ${elapsed}s — sol.success=${solRes.success} gemini.success=${gemRes.success}`);

  const solPath = join(REPO, "ALIYAH-ASCENT-DRAFT-who-raised-him-sol.md");
  const gemPath = join(REPO, "ALIYAH-ASCENT-DRAFT-who-raised-him-gemini.md");
  if (solRes.success && (solRes.output || "").trim().length > 500) {
    writeFileSync(solPath, solRes.output, "utf-8");
    log(`Sol draft written: ${solPath}`);
  } else {
    log(`Sol FAILED or empty — stderr: ${(solRes as any).error?.slice?.(0, 1500) || "(none)"}`);
  }
  if (gemRes.success && (gemRes.output || "").trim().length > 500) {
    writeFileSync(gemPath, gemRes.output, "utf-8");
    log(`Gemini draft written: ${gemPath}`);
  } else {
    log(`Gemini FAILED or empty — stderr: ${(gemRes as any).error?.slice?.(0, 1500) || "(none)"}`);
  }

  writeFileSync(join(OUT_DIR, "manifest.md"), [
    "# Who Raised Him? — blind drafts dispatch (2026-08-24)",
    "",
    `- elapsed: ${elapsed}s (parallel)`,
    `- sol: success=${solRes.success}, chars=${(solRes.output || "").length}`,
    `- gemini: success=${gemRes.success}, chars=${(gemRes.output || "").length}`,
    "- sandbox: codex read-only; agy default. Outputs written by dispatch script only.",
    "- Prompt: house commitments only; no discovery seeding (Out-of-Egypt convergence lesson applied).",
  ].join("\n"), "utf-8");
  log("manifest written");
}

main().catch((err) => {
  console.error("[who-raised-him] FAILED:", err);
  process.exit(1);
});
