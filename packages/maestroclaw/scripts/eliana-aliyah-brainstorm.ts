#!/usr/bin/env -S npx tsx
/**
 * "Aliyah Study Bible" brainstorm — real product ideation, not a review pass.
 * Two tracks, per Sonnet's dispatch:
 *
 * Track A — personas, each independently, no cross-routing (per
 * PERSONAS_THEOLOGY.md §0's own discipline):
 *   - Jewish Reader
 *   - Christian Canonical Reader — calibration disposition (the neutral,
 *     both-directions-fairly stance), NOT the underclaim_challenge
 *     prosecution prompt, and NOT the document-review task/ending format —
 *     this is a brainstorm, not an audit, so only the persona's identity and
 *     even-handed disposition carry over, not canonical_calibration's
 *     specific task text or CANONICAL CALIBRATION ending format.
 *   - Scholar — angled at interpretive legitimacy/precedent (lectionaries,
 *     canonical criticism) vs. arbitrary cherry-picking.
 *   - Pastor — angled at real-reader reception (powerful/navigable vs.
 *     disorienting/alienating).
 *
 * Track B — plain council, no personas: Sol (gpt-5.6-sol via codex_cli),
 * Kimi K3 (via kimi_cli), Gemini Pro (via gemini_cli, "Pro" per its own
 * existing default — see gemini-cli.ts's PRIMARY_MODEL). Fable's own
 * contribution is written directly, not dispatched through this script — no
 * reason to route through a subprocess of the identity already doing the
 * dispatching.
 *
 * Outputs saved into the Elianas Rhythm repo itself, matching that repo's
 * existing convention for cross-model council output (COUNCIL-BRIEF-*,
 * FABLE-BRIEF-*, SOL-AUDIT-* already live there) — this is genuinely new
 * content being authored, in the repo's own established style, not a
 * MaestroClaw benchmark artifact.
 *
 * Usage:
 *   cd packages/maestroclaw
 *   npx tsx scripts/eliana-aliyah-brainstorm.ts
 */

import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ClaudeCodeAdapter } from "../src/adapters/claude-code.js";
import { KimiCliAdapter } from "../src/adapters/kimi-cli.js";
import { GeminiCliAdapter } from "../src/adapters/gemini-cli.js";
import { extractPersonaPreamble } from "./lib/eliana-personas.js";
import { ALIYAH_STUDY_BIBLE_BRIEF } from "./lib/aliyah-brainstorm-brief.js";
import type { AdapterResult } from "../src/adapters/types.js";

const MAESTRO_REPO_ROOT = "C:\\New folder\\MaestroOrchestra\\project\\Maestro";
const PERSONAS_FILE = join(MAESTRO_REPO_ROOT, ".michael/opus/PERSONAS_THEOLOGY.md");
const OUT_DIR = "C:\\New folder\\Elianas RhythmMigrate\\Elianas Rhythm\\aliyah-study-bible-brainstorm";
const TIMEOUT_MS = 8 * 60 * 1000;

function log(msg: string): void {
  console.log(`[aliyah-brainstorm] ${msg}`);
}

function buildPersonaBrainstormPrompt(voicePreamble: string, angleNote: string | null): string {
  return [
    voicePreamble,
    "",
    "---",
    "",
    angleNote ? `${angleNote}\n\n---\n` : "",
    ALIYAH_STUDY_BIBLE_BRIEF,
  ].filter(Boolean).join("\n");
}

async function runAndSave(
  label: string,
  filename: string,
  prompt: string,
  runFn: () => Promise<AdapterResult>,
): Promise<void> {
  log(`Running ${label}...`);
  const start = Date.now();
  let result: AdapterResult;
  try {
    result = await runFn();
  } catch (err) {
    result = { success: false, output: "", error: err instanceof Error ? err.message : String(err) };
  }
  const elapsedS = (Date.now() - start) / 1000;
  log(`${label}: success=${result.success} elapsed=${elapsedS.toFixed(1)}s output_len=${result.output.length}`);
  if (!result.success) log(`${label}: ERROR — ${result.error ?? "(no error message)"}`);

  writeFileSync(
    join(OUT_DIR, filename),
    [
      `# ${label} — Aliyah Study Bible brainstorm`,
      "",
      `- success: ${result.success}`,
      `- elapsed: ${elapsedS.toFixed(1)}s`,
      result.error ? `- error: ${result.error}` : "",
      "",
      "## Prompt used",
      "",
      "<details><summary>expand</summary>",
      "",
      "```",
      prompt,
      "```",
      "",
      "</details>",
      "",
      "## Response",
      "",
      result.output || "(no output)",
    ].filter(Boolean).join("\n"),
    "utf-8",
  );
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  log(`Output dir: ${OUT_DIR}`);

  const personasFileText = readFileSync(PERSONAS_FILE, "utf-8");
  const scratchDir = mkdtempSync(join(tmpdir(), "aliyah-brainstorm-"));

  // ── Track A: personas ──────────────────────────────────────────────────

  const jewishReaderPreamble = extractPersonaPreamble(personasFileText, "## 3. The Jewish Reader");
  await runAndSave(
    "persona-jewish-reader",
    "persona-jewish-reader.md",
    buildPersonaBrainstormPrompt(jewishReaderPreamble, null),
    () => new ClaudeCodeAdapter().run(buildPersonaBrainstormPrompt(jewishReaderPreamble, null), scratchDir, TIMEOUT_MS),
  );

  const canonicalReaderPreamble = extractPersonaPreamble(personasFileText, "## 6. The Christian Canonical Reader");
  const canonicalReaderAngle =
    "For this brainstorm, read in your calibration disposition, not your prosecution disposition — see " +
    "PERSONAS_THEOLOGY.md §6a for the distinction. That means: genuinely weigh both directions fairly. Take " +
    "seriously the traditionalist concern that reordering reading flow around thematic/typological links risks " +
    "forcing or manufacturing connections that aren't really there, AND take seriously the constructive case for " +
    "what a chain-linked structure can do that a linear canonical-order reading cannot. Do not assume either " +
    "concern wins going in.";
  await runAndSave(
    "persona-christian-canonical-reader",
    "persona-christian-canonical-reader.md",
    buildPersonaBrainstormPrompt(canonicalReaderPreamble, canonicalReaderAngle),
    () => new ClaudeCodeAdapter().run(buildPersonaBrainstormPrompt(canonicalReaderPreamble, canonicalReaderAngle), scratchDir, TIMEOUT_MS),
  );

  const scholarPreamble = extractPersonaPreamble(personasFileText, "## 4. The Scholar");
  const scholarAngle =
    "For this brainstorm, your specific job is to pressure-test whether reordering reading flow around " +
    "thematic/typological/theological links has real interpretive legitimacy and precedent — lectionaries, " +
    "canonical criticism (Brevard Childs and successors), typological reading traditions, etc. — versus risking " +
    "arbitrary \"the connections I personally like\" cherry-picking dressed up as method. Give this real " +
    "scholarly weight, not just a caution.";
  await runAndSave(
    "persona-scholar",
    "persona-scholar.md",
    buildPersonaBrainstormPrompt(scholarPreamble, scholarAngle),
    () => new ClaudeCodeAdapter().run(buildPersonaBrainstormPrompt(scholarPreamble, scholarAngle), scratchDir, TIMEOUT_MS),
  );

  const pastorPreamble = extractPersonaPreamble(personasFileText, "## 5. The Pastor");
  const pastorAngle =
    "For this brainstorm, your specific job is practical reader reception: does a non-linear, link-driven " +
    "reading structure feel spiritually powerful and navigable to a real reader, or disorienting/alienating " +
    "coming from a lifetime of canonical-order Bibles and reading plans? Think about your actual congregation " +
    "— the grieving widow, the doubting teenager, the lifelong believer going through the motions — and how " +
    "each would actually experience opening an app structured this way.";
  await runAndSave(
    "persona-pastor",
    "persona-pastor.md",
    buildPersonaBrainstormPrompt(pastorPreamble, pastorAngle),
    () => new ClaudeCodeAdapter().run(buildPersonaBrainstormPrompt(pastorPreamble, pastorAngle), scratchDir, TIMEOUT_MS),
  );

  // ── Track B: plain council, no personas ─────────────────────────────────

  await runAndSave(
    "council-kimi",
    "council-kimi.md",
    ALIYAH_STUDY_BIBLE_BRIEF,
    () => new KimiCliAdapter().run(ALIYAH_STUDY_BIBLE_BRIEF, scratchDir, TIMEOUT_MS),
  );

  await runAndSave(
    "council-gemini",
    "council-gemini.md",
    ALIYAH_STUDY_BIBLE_BRIEF,
    () => new GeminiCliAdapter().run(ALIYAH_STUDY_BIBLE_BRIEF, scratchDir, TIMEOUT_MS),
  );

  // Sol needs CLAW_CODEX_MODEL set before codex-cli.ts's module-level
  // PRIMARY_MODEL constant is read — dynamic import here (rather than a
  // static one at the top of the file) means this executes at the point
  // it's awaited, after the assignment below, not hoisted before it.
  process.env.CLAW_CODEX_MODEL = "gpt-5.6-sol";
  const { CodexCliAdapter } = await import("../src/adapters/codex-cli.js");
  await runAndSave(
    "council-sol",
    "council-sol.md",
    ALIYAH_STUDY_BIBLE_BRIEF,
    () => new CodexCliAdapter({ sandbox: "read-only" }).run(ALIYAH_STUDY_BIBLE_BRIEF, scratchDir, TIMEOUT_MS),
  );

  log("");
  log(`Done. All outputs written to: ${OUT_DIR}`);
}

main().catch((err) => {
  console.error("[aliyah-brainstorm] FAILED:", err);
  process.exit(1);
});
