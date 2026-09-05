#!/usr/bin/env -S npx tsx
/**
 * Icon refinement commission — Fable's design brief to Sol (2026-08-25).
 *
 * Context: Sol's "eliana-icon-gold-premium" just shipped as the interim launcher icon.
 * Fable compared it against Michael's original concept art (screenshots/Eliana.png) and
 * found Sol's version gained legibility/premium punch but dropped three things the
 * concept carried: (1) the halo fully CONTAINING the E (in the concept the ring crowns
 * the letter — Eliana under the halo; in Sol's the E bursts the ring — monogram-forward),
 * (2) the olive sprig crossing the ring (organic asymmetry — kept it from reading as a
 * generic luxury monogram), (3) the lavender ribbon bookmark (the one cool accent, the
 * daughter's color). This run asks Sol for three ascending variants that graft those
 * back onto his premium base, so Michael can lay eyeballs on the merge.
 *
 * Mechanics: unlike the read-only review runs, this job's PURPOSE is file output —
 * sandbox is workspace-write and the cwd is a dedicated output folder that already
 * contains the two reference images (copied in by this script). Sol is instructed to
 * save with exact filenames into the current directory.
 *
 * Usage (from packages/maestroclaw):
 *   CLAW_CODEX_MODEL=gpt-5.6-sol npx tsx scripts/eliana-icon-refine-sol.ts
 */

import { mkdirSync, copyFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { CodexCliAdapter } from "../src/adapters/codex-cli.js";

const MICHAEL_DIR = "C:\\New folder\\Elianas RhythmMigrate\\Michael";
const OUT_DIR = join(MICHAEL_DIR, "icon-refined-fable");
const REF_CONCEPT_SRC = "C:\\New folder\\Elianas RhythmMigrate\\screenshots\\Eliana.png";
const REF_PREMIUM_SRC = join(MICHAEL_DIR, "eliana-icon-gold-premium-master.png");
const TIMEOUT_MS = 25 * 60 * 1000;

function log(msg: string): void {
  console.log(`[icon-refine-sol] ${msg}`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  copyFileSync(REF_CONCEPT_SRC, join(OUT_DIR, "reference-original-concept.png"));
  copyFileSync(REF_PREMIUM_SRC, join(OUT_DIR, "reference-gold-premium-current.png"));
  log(`Output/working dir prepared: ${OUT_DIR}`);

  const prompt = [
    "You are Sol. Your 'eliana-icon-gold-premium' design just shipped as the interim launcher icon for",
    "Eliana's Rhythm (Michael's Bible app, named for his daughter). It's strong — Michael loves it. This is",
    "a refinement commission from Fable (Claude), who compared your icon against Michael's ORIGINAL concept",
    "art and identified three things the concept had that your premium version dropped. Michael wants to lay",
    "eyeballs on variants that graft them back onto your premium base.",
    "",
    "TWO REFERENCE IMAGES ARE IN YOUR CURRENT WORKING DIRECTORY:",
    "- reference-gold-premium-current.png — your shipped icon. THE BASE. Keep its jet-black ground, its",
    "  bold polished-gold serif E, its big open Bible, its 4-point star spark, its premium metallic finish.",
    "- reference-original-concept.png — Michael's original concept (left panel: the icon on the rounded",
    "  tile). Study what it does differently: the halo ring fully CONTAINS the E with the spark at its",
    "  crown; a leafy olive sprig crosses the ring on the right side (in lavender there); a slim lavender",
    "  ribbon bookmark drapes from the open book's center gutter.",
    "",
    "THE THREE DESIGN NOTES FROM FABLE'S COMPARISON:",
    "1. HALO CONTAINMENT: in the concept, the ring crowns and encloses the E — a halo over the child,",
    "   'God has answered.' In the premium version the E bursts through the ring's bottom arc, which reads",
    "   as a luxury monogram instead. Restore the E fully INSIDE an unbroken halo ring, spark at the apex,",
    "   without shrinking the E into timidity — let it fill the ring's interior confidently.",
    "2. THE OLIVE SPRIG: the concept's leafy sprig crossing the ring gave it life and asymmetry — without",
    "   it the mark risks reading as a generic hotel monogram. Reintroduce a single elegant olive sprig",
    "   crossing the ring's right side, rendered in GOLD to match the metal.",
    "3. ELIANA'S RIBBON: the concept's lavender ribbon bookmark was the one cool accent — the daughter's",
    "   color, the personal signature. As the final variant, add a slim ribbon bookmark draping from the",
    "   book's center gutter in a deep royal lavender-violet (rich, jewel-toned, not pastel) — the ONLY",
    "   non-gold hue in the composition.",
    "",
    "GENERATE THREE VARIANTS, ASCENDING (use your image-generation skill):",
    "- Variant A 'halo-restored': your premium design, changed ONLY so the E sits fully inside an unbroken",
    "  halo ring with the spark at the apex.",
    "- Variant B 'sprig': Variant A plus the gold olive sprig crossing the ring's right side.",
    "- Variant C 'eliana-ribbon': Variant B plus the deep lavender-violet ribbon bookmark from the book's",
    "  center gutter.",
    "",
    "HARD CONSTRAINTS (all three variants):",
    "- Square canvas, 1024x1024 or larger. Jet-black background (#000000 family) — this app's identity is",
    "  gold on true black (its flagship theme is pure-black OLED).",
    "- The composition must survive being displayed at 48 pixels: bold silhouette, no fine filigree that",
    "  turns to noise. Keep all meaningful content inside the central ~80% (launcher masks crop corners).",
    "- No text other than the letter E. No watermarks.",
    "- Premium metallic gold finish matching your current icon — not flat yellow, not brass-brown.",
    "",
    "SAVE each variant into the CURRENT WORKING DIRECTORY with EXACTLY these filenames:",
    "- icon-refined-A-halo-restored.png",
    "- icon-refined-B-sprig.png",
    "- icon-refined-C-eliana-ribbon.png",
    "",
    "After generating and saving all three, end your response with a short section titled 'DESIGN NOTES'",
    "explaining, per variant, what you changed and any judgment calls you made (e.g., sprig placement,",
    "ribbon width, how you kept the E dominant inside the ring). If a file save fails, say so explicitly",
    "and name which files did land on disk.",
  ].join("\n");

  log("Running codex_cli (sandbox: workspace-write) — Sol, image-gen refinement commission...");
  const adapter = new CodexCliAdapter({ sandbox: "workspace-write" });
  const start = Date.now();
  const result = await adapter.run(prompt, OUT_DIR, TIMEOUT_MS);
  const elapsedS = (Date.now() - start) / 1000;

  log(`success=${result.success} elapsed=${elapsedS.toFixed(1)}s output_len=${result.output.length}`);
  if (!result.success) log(`ERROR: ${result.error ?? "(no error message)"}`);

  writeFileSync(
    join(OUT_DIR, "sol-raw-response.md"),
    [
      "# Sol icon refinement — raw response",
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
  log(`Raw response saved to: ${join(OUT_DIR, "sol-raw-response.md")}`);

  for (const f of [
    "icon-refined-A-halo-restored.png",
    "icon-refined-B-sprig.png",
    "icon-refined-C-eliana-ribbon.png",
  ]) {
    log(`${existsSync(join(OUT_DIR, f)) ? "OK   " : "MISS "} ${f}`);
  }
}

main().catch((err) => {
  console.error("[icon-refine-sol] FAILED:", err);
  process.exit(1);
});
