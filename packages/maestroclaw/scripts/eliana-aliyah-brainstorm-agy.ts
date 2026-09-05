#!/usr/bin/env -S npx tsx
/**
 * Aliyah Study Bible brainstorm — the 8th contribution, filling the slot the
 * failed Gemini CLI call left open. Michael confirmed `agy` (Google
 * Antigravity CLI) is the right upgrade path — Gemini CLI's own error
 * pointed there directly (IneligibleTierError: "migrate to the Antigravity
 * suite of products"). Same brainstorm brief as every other Track B
 * contributor, no persona.
 *
 * Model: gemini-3.1-pro-high — confirmed via `agy models` (the actual
 * available-model list, not a guess) as the Pro-tier option, consistent
 * with this session's standing "Pro over Flash for substantive tasks"
 * reasoning. Smoke-tested against the real installed agy CLI before this
 * dispatch.
 *
 * Usage:
 *   cd packages/maestroclaw
 *   npx tsx scripts/eliana-aliyah-brainstorm-agy.ts
 */

import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgyCliAdapter } from "../src/adapters/agy-cli.js";
import { ALIYAH_STUDY_BIBLE_BRIEF } from "./lib/aliyah-brainstorm-brief.js";

const OUT_DIR = "C:\\New folder\\Elianas RhythmMigrate\\Elianas Rhythm\\aliyah-study-bible-brainstorm";
const TIMEOUT_MS = 8 * 60 * 1000;

function log(msg: string): void {
  console.log(`[aliyah-brainstorm-agy] ${msg}`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const scratchDir = mkdtempSync(join(tmpdir(), "aliyah-brainstorm-agy-"));

  log("Running council-agy (gemini-3.1-pro-high)...");
  const adapter = new AgyCliAdapter();
  const start = Date.now();
  const result = await adapter.run(ALIYAH_STUDY_BIBLE_BRIEF, scratchDir, TIMEOUT_MS);
  const elapsedS = (Date.now() - start) / 1000;

  log(`success=${result.success} elapsed=${elapsedS.toFixed(1)}s output_len=${result.output.length}`);
  if (!result.success) log(`ERROR: ${result.error ?? "(no error message)"}`);

  writeFileSync(
    join(OUT_DIR, "council-agy.md"),
    [
      "# council-agy — Aliyah Study Bible brainstorm",
      "",
      "- model: gemini-3.1-pro-high (via agy_cli; confirmed against `agy models`, chosen as the Pro-tier option)",
      `- success: ${result.success}`,
      `- elapsed: ${elapsedS.toFixed(1)}s`,
      result.error ? `- error: ${result.error}` : "",
      "",
      "## Response",
      "",
      result.output || "(no output)",
    ].filter(Boolean).join("\n"),
    "utf-8",
  );
  log(`Done. Written to: ${join(OUT_DIR, "council-agy.md")}`);
}

main().catch((err) => {
  console.error("[aliyah-brainstorm-agy] FAILED:", err);
  process.exit(1);
});
