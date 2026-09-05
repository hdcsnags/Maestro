#!/usr/bin/env -S npx tsx
/**
 * Icon refinement — ROUND 2 (Fable → Sol, 2026-08-25).
 *
 * Round 1 (eliana-icon-refine-sol.ts) verdict: composition goals all landed (E contained
 * in an unbroken halo, gold olive sprig, royal-violet ribbon), but the FINISH overcooked —
 * everything went high-bloom trophy gold, and the cream Bible pages from the shipped
 * premium icon became gold-on-gold, losing the page/metal contrast that made the premium
 * version tasteful. Sol's sandbox also blocked reading the reference images in round 1
 * (he reconstructed from the written spec), so round 2 describes the target finish
 * entirely in words — precisely.
 *
 * One variant only: D = round-1 C's composition + the shipped premium's restraint.
 *
 * Usage (from packages/maestroclaw):
 *   CLAW_CODEX_MODEL=gpt-5.6-sol npx tsx scripts/eliana-icon-refine-sol-r2.ts
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CodexCliAdapter } from "../src/adapters/codex-cli.js";

const OUT_DIR = "C:\\New folder\\Elianas RhythmMigrate\\Michael\\icon-refined-fable";
const TIMEOUT_MS = 25 * 60 * 1000;

function log(msg: string): void {
  console.log(`[icon-refine-sol-r2] ${msg}`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const prompt = [
    "You are Sol. Round 2 of the Eliana's Rhythm app-icon refinement. Your round-1 variant C nailed the",
    "COMPOSITION; this round keeps that composition exactly and corrects only the FINISH, which went too",
    "hot — high-bloom lens-flare trophy gold, and the Bible's pages turned gold like the metalwork, losing",
    "the contrast that made your original shipped icon tasteful.",
    "",
    "GENERATE ONE IMAGE (use your image-generation skill). THE COMPOSITION (keep exactly this):",
    "- Jet-black background (#000000 family). Square canvas, 1024x1024 or larger.",
    "- A thin, elegant, UNBROKEN gold halo ring; a modest 4-point star spark at its apex (crown).",
    "- A bold classical serif capital E fully INSIDE the ring, filling its interior confidently without",
    "  touching or breaking the ring.",
    "- Below, a large open Bible spanning nearly the composition's width, the ring rising from behind it.",
    "- A single elegant gold olive sprig crossing the ring's right side, leaves broad and sparse.",
    "- A slim ribbon bookmark draping from the book's center gutter in deep royal violet (jewel-toned,",
    "  saturated, NOT pastel lavender) — the ONLY non-gold color anywhere.",
    "",
    "THE FINISH (this is what changes from round 1 — match your ORIGINAL shipped icon's restraint):",
    "- Brushed, softly polished antique gold: warm, calm reflections. NO lens flares, NO starburst bloom",
    "  except the one modest spark at the ring's apex, NO radiating light rays behind the E or from the",
    "  book's gutter.",
    "- The Bible's pages are CREAM/IVORY paper with faint suggested text lines — clearly paper, not metal.",
    "  Gold stays on the covers, page EDGES (gilt edges are correct), ring, sprig, and the E.",
    "- The E reads as solid milled gold with soft bevels — dignified, not glassy or chrome-hot.",
    "- Overall temperature: luxury heirloom on black velvet, not casino trophy.",
    "",
    "LEGIBILITY CONSTRAINTS: must survive at 48 pixels — bold silhouette, no fine filigree; keep all",
    "meaningful content inside the central ~80% of the canvas (launcher masks crop the outer region).",
    "No text other than the letter E. No watermarks.",
    "",
    "SAVE the image into the CURRENT WORKING DIRECTORY as exactly: icon-refined-D-premium-restraint.png",
    "Your file-copy failed in round 1 — attempt the save anyway, and whether or not it succeeds, end your",
    "response with the absolute path(s) of every generated image file so it can be collected, plus a short",
    "DESIGN NOTES section on your finish decisions.",
  ].join("\n");

  log("Running codex_cli (sandbox: workspace-write) — Sol, round-2 finish correction...");
  const adapter = new CodexCliAdapter({ sandbox: "workspace-write" });
  const start = Date.now();
  const result = await adapter.run(prompt, OUT_DIR, TIMEOUT_MS);
  const elapsedS = (Date.now() - start) / 1000;

  log(`success=${result.success} elapsed=${elapsedS.toFixed(1)}s output_len=${result.output.length}`);
  if (!result.success) log(`ERROR: ${result.error ?? "(no error message)"}`);

  writeFileSync(
    join(OUT_DIR, "sol-raw-response-r2.md"),
    [
      "# Sol icon refinement round 2 — raw response",
      "",
      `- success: ${result.success}`,
      `- elapsed: ${elapsedS.toFixed(1)}s`,
      result.error ? `- error: ${result.error}` : "",
      "",
      "## Full raw response",
      "",
      result.output || "(no output)",
    ].filter(Boolean).join("\n"),
    "utf-8",
  );
  log(`Raw response saved to: ${join(OUT_DIR, "sol-raw-response-r2.md")}`);
  log(`${existsSync(join(OUT_DIR, "icon-refined-D-premium-restraint.png")) ? "OK   " : "MISS "} icon-refined-D-premium-restraint.png`);
}

main().catch((err) => {
  console.error("[icon-refine-sol-r2] FAILED:", err);
  process.exit(1);
});
