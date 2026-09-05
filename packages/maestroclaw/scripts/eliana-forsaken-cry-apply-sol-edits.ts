#!/usr/bin/env -S npx tsx
/**
 * Applies Sol's three specific proposed edits (from the 2026-08-21 swarm-check
 * run) directly to the live `forsaken_cry.agent.final.md` anchor file — this
 * one is NOT a read-only proof workload. Michael explicitly asked for the
 * council (not Sonnet directly) to be the one to write it: "let them write
 * it." Sol authored the specific replacement language; he applies it himself.
 *
 * The three edits, reproduced verbatim from sol-swarm-check.md so there is no
 * room for reinterpretation:
 *   1. Keep §7.1's present MT-only honesty note substantially intact — do
 *      NOT apply Fable's proposed strengthening sentence ("a Greek psalm
 *      with no 'you have answered me' has no accomplished turn"), which Sol
 *      judged too categorical (LXX 21:25 has an accomplished "he heard me").
 *   2. Replace footnote [^90^] on the §7.1 LXX/emendation sentence — as
 *      pasted, it documents English Bible translations, not the LXX reading
 *      itself. Use the CATSS source instead; note [^99^] belongs principally
 *      to the Hebrews bridge, not this sentence.
 *   3. In §4.3, soften "The decisive refinement is Ahearne-Kroll's" to
 *      something like "Ahearne-Kroll proposes a further, contested
 *      refinement" — "decisive" overstates a disputed reading (see Combs).
 *
 * Sol's own proposed §7.1 replacement text (from sol-swarm-check.md):
 *   "One honesty note: at this point the Old Greek does not read 'you
 *   answered me' but τὴν ταπείνωσίν μου, 'my humiliation,' construing the
 *   expression as a suffixed noun; the Hebrew sound-correspondence described
 *   here therefore does not run through the LXX. This chapter's observation
 *   is strictly about the Masoretic Hebrew. The Greek psalm later says 'he
 *   heard me' at LXX 21:25, using εἰσακούω — the separate line echoed by
 *   Hebrews 5:7 (§8.1)."
 *
 * Read-only guarantees do NOT apply to this script by design — it operates
 * directly on the live Elianas Rhythm working copy, not a disposable clone,
 * because the point is for the edit to persist. It captures a git diff
 * before/after for the audit trail, same discipline as every other
 * correction in this project.
 *
 * Usage:
 *   cd packages/maestroclaw
 *   CLAW_CODEX_MODEL=gpt-5.6-sol npx tsx scripts/eliana-forsaken-cry-apply-sol-edits.ts
 */

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { CodexCliAdapter } from "../src/adapters/codex-cli.js";

const ELIANA_SOURCE = "C:\\New folder\\Elianas RhythmMigrate\\Elianas Rhythm";
const ANCHOR_RELATIVE_PATH = "forsaken_cry.agent.final.md";
const TIMEOUT_MS = 10 * 60 * 1000;
const OUT_DIR = join(
  "C:\\New folder\\MaestroOrchestra\\project\\Maestro\\docs\\audits\\eliana-readonly-poc",
  "2026-08-21-swarm-check",
);

function log(msg: string): void {
  console.log(`[apply-sol-edits] ${msg}`);
}

function gitDiff(dir: string, relPath: string): string {
  try {
    return execFileSync("git", ["diff", "--", relPath], { cwd: dir, encoding: "utf8" });
  } catch (err) {
    return `(git diff failed: ${err instanceof Error ? err.message : String(err)})`;
  }
}

const PROMPT = `You are Sol. Earlier tonight you reviewed the anchor document \`${ANCHOR_RELATIVE_PATH}\` in this
directory against an outside swarm's findings and proposed three specific edits, which Michael has now
approved. Apply exactly these three edits to \`${ANCHOR_RELATIVE_PATH}\` directly — no other changes,
no unrelated cleanup, no additional findings. This is a precise editorial patch, not a fresh review.

1. In chapter 7.1 ("The verb the psalm answers itself with"), do NOT apply the strengthening sentence
   Fable proposed ("a Greek psalm with no 'you have answered me' has no accomplished turn") — you judged
   it too categorical, since LXX Psalm 21:25 has an accomplished "he heard me." Instead, replace the
   existing honesty-note sentence (the one beginning "One honesty note: the LXX rendered..." through
   "...some scholars prefer emendation.[^90^]") with your own proposed replacement:

   "One honesty note: at this point the Old Greek does not read 'you answered me' but τὴν ταπείνωσίν μου,
   'my humiliation,' construing the expression as a suffixed noun; the Hebrew sound-correspondence
   described here therefore does not run through the LXX. This chapter's observation is strictly about
   the Masoretic Hebrew. The Greek psalm later says 'he heard me' at LXX 21:25, using εἰσακούω — the
   separate line echoed by Hebrews 5:7 (§8.1)."

   Use footnote marker [^99^] at the end of this replacement sentence instead of [^90^], since [^90^] as
   currently written documents English Bible translation choices, not the LXX reading itself, and [^99^]
   is the footnote that actually supports the Greek εἰσακούω / Hebrews 5:7 bridge point. If footnote 90's
   own text needs updating so it isn't left as a dangling, unused citation elsewhere in the chapter, check
   its other usage before touching it — only change what's needed for this sentence's citation to be
   accurate.

2. In chapter 4.3 ("What survives"), find the sentence "The decisive refinement is Ahearne-Kroll's." and
   soften it to something like "Ahearne-Kroll proposes a further, contested refinement." — "decisive"
   overstates how settled this reading is; Combs frames the same conclusion more cautiously in the
   literature. Keep the rest of that paragraph's content intact; adjust only this one clause's confidence
   level, and lightly adjust the sentence's grammar around it if needed so it still reads naturally.

3. Do not touch anything else in the document — no other wording, no other footnotes, no renumbering.

When done, report back in plain text exactly which lines/sections you changed, quoting the final wording
of both edits so it can be verified against the diff.`;

async function main() {
  if (!existsSync(ELIANA_SOURCE)) throw new Error(`Eliana's Rhythm source not found at ${ELIANA_SOURCE}`);
  const anchorPath = join(ELIANA_SOURCE, ANCHOR_RELATIVE_PATH);
  if (!existsSync(anchorPath)) throw new Error(`Anchor file not found at ${anchorPath}`);
  mkdirSync(OUT_DIR, { recursive: true });

  log(`Operating directly on live file: ${anchorPath}`);
  log("Running Sol (codex_cli, workspace-write default -- this run is intended to write)...");

  const adapter = new CodexCliAdapter(); // default sandbox: workspace-write
  const start = Date.now();
  const result = await adapter.run(PROMPT, ELIANA_SOURCE, TIMEOUT_MS);
  const elapsedS = (Date.now() - start) / 1000;

  log(`success=${result.success} elapsed=${elapsedS.toFixed(1)}s`);
  if (!result.success) {
    log(`FAILED -- stderr: ${(result.error || "").slice(0, 3000)}`);
  }

  const diff = gitDiff(ELIANA_SOURCE, ANCHOR_RELATIVE_PATH);
  log(`git diff on ${ANCHOR_RELATIVE_PATH}:\n${diff || "(no diff -- file may be untracked; this is expected since the anchor is uncommitted)"}`);

  const reportPath = join(OUT_DIR, "sol-apply-edits-report.md");
  writeFileSync(reportPath, [
    "# Sol — applying his own 3 proposed edits to forsaken_cry.agent.final.md",
    "",
    `- success: ${result.success}`,
    `- elapsed: ${elapsedS.toFixed(1)}s`,
    "",
    "## git diff (if the file is git-tracked; it is currently untracked, so this will likely be empty -- see Sol's own report below for the actual before/after)",
    "```diff",
    diff || "(none — file untracked)",
    "```",
    "",
    result.error ? `## adapter stderr\n\n\`\`\`\n${result.error}\n\`\`\`\n` : "",
    "## Sol's report",
    "",
    result.output || "(no output)",
  ].join("\n"), "utf-8");

  log(`Report written to ${reportPath}`);
}

main().catch((err) => {
  console.error("[apply-sol-edits] FAILED:", err);
  process.exit(1);
});
