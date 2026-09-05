#!/usr/bin/env -S npx tsx
/**
 * MaestroClaw — Play Store listing copy, Fable's independent take.
 *
 * Michael wants a second, genuinely independent voice on the short + full
 * Play Store description (Sonnet already drafted one, not shown to Fable
 * here on purpose — this is meant to be a real second opinion, not a
 * polish pass on an existing draft). Explicitly asked for Fable to look at
 * the real app content, not work from a summary — Study Mode especially,
 * plus the books/study modules, journal, and prayer features.
 *
 * Points directly at the live Elianas Rhythm working tree (no scratch clone
 * needed — this is a read/write-a-response task, and claude_code's default
 * task mode has no write permission anyway, so nothing here can touch the
 * repo). Fable is free to open and read any file he wants; the prompt names
 * the highest-signal starting points.
 *
 * Usage:
 *   cd packages/maestroclaw
 *   CLAUDE_CONFIG_DIR="$HOME/.claude-thamos" CLAW_CLAUDE_MODEL=claude-fable-5 \
 *     npx tsx scripts/eliana-store-listing-fable.ts
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { ClaudeCodeAdapter } from "../src/adapters/claude-code.js";

const ELIANA_SOURCE = "C:\\New folder\\Elianas RhythmMigrate\\Elianas Rhythm";
const TIMEOUT_MS = 10 * 60 * 1000;
const OUT_DIR = join(
  "C:\\New folder\\MaestroOrchestra\\project\\Maestro\\docs\\audits\\eliana-readonly-poc",
  "2026-08-21-store-listing",
);

const PROMPT = `You're Fable. Michael wants your independent take on the Google Play Store listing copy for
"Eliana - God has Answered" (package com.eliana.rhythm) — a short description (hard limit: 80
characters) and a full description (hard limit: 4000 characters). Sonnet already drafted a version,
which is deliberately NOT being shown to you — Michael wants a genuinely separate voice to compare
against, not a polish pass on an existing draft.

Before writing anything, actually look at the real app in this directory (${ELIANA_SOURCE}) rather
than work from a summary — Michael's explicit instruction. Highest-signal places to read, in this
priority order:

1. Study Mode itself: app/src/main/java/com/eliana/rhythm/ui/components/bible/ElianaVerseTiers.kt
   — the actual tier structure (original text -> transliteration -> Eliana rendering -> key word
   study) that renders under every verse. This is the app's core differentiator; read it closely.
2. At least one full Aliyah study module, read start to finish, to feel the actual depth and
   citation discipline: app/src/main/assets/studies/entries/the_forsaken_cry.json (or pick another
   in that folder if you want a different flavor -- sign_of_jonah.json and den_of_robbers.json are
   both strong).
3. app/src/main/assets/studies/votd_calendar.json -- skim a handful of entries for the daily-card
   register (shorter, still evidence-disciplined).
4. app/src/main/assets/studies/chains.json -- the chain-link structure connecting passages across
   the canon (Michael's "links" -- Thompson-chain-style connections, not just verse-of-the-day).
5. Journal: app/src/main/java/com/eliana/rhythm/data/EnhancedJournalManager.kt and
   ui/screens/JournalHistoryScreen.kt.
6. Prayer: app/src/main/java/com/eliana/rhythm/viewmodel/PrayerGenerationViewModel.kt and
   ui/screens/ThromeRoomScreen.kt.
7. The Eliana Bible itself (original-language grounded translation, word studies,
   transliteration) -- you'll see it rendered directly in ElianaVerseTiers.kt already; the
   original-language source is the Westminster Leningrad Codex (Hebrew) and SBLGNT (Greek), per
   ../eliana-bible-cli/CLAUDE.md if you want the full pipeline picture, but that's optional --
   what's rendered in the app tier is what a store-listing reader would actually experience.

Michael's own words on what he wants this to communicate -- read these closely, they're the actual
brief, not paraphrase:

"an app that reveals not just the text, but the wider context of the text, showing you what is
based in the text, not just [a distinction] like the difference between Doctrine and Theology...
basically, we are unlocking the word, presenting it as accurately as we can, trying to get people
to be interested in the search and pursuit of his word and wisdom."

He's also floated "unlock the bible" or "unflatten the bible" as possible framing -- "unflatten" is
a word this whole project has used before (the Forsaken Cry study itself talks about "the
unflattened reading" as opposed to a flat one), so it's not a random word choice; weigh it if it
fits your own draft, don't feel bound to it.

Write your own short description (<=80 characters, count them) and full description (<=4000
characters, well under is fine) in your own voice, grounded in what you actually read in the app,
not generic devotional-app marketing copy. State the character counts for both when you're done.`;

async function main() {
  if (!existsSync(ELIANA_SOURCE)) throw new Error(`Eliana's Rhythm source not found at ${ELIANA_SOURCE}`);
  mkdirSync(OUT_DIR, { recursive: true });

  console.log("[store-listing-fable] Running Fable (claude_code, task mode, read-only by construction)...");
  const adapter = new ClaudeCodeAdapter();
  const start = Date.now();
  const result = await adapter.run(PROMPT, ELIANA_SOURCE, TIMEOUT_MS);
  const elapsedS = (Date.now() - start) / 1000;
  console.log(`[store-listing-fable] success=${result.success} elapsed=${elapsedS.toFixed(1)}s`);
  if (!result.success) console.error(`[store-listing-fable] stderr: ${(result.error || "").slice(0, 3000)}`);

  const outPath = join(OUT_DIR, "fable-store-listing.md");
  writeFileSync(outPath, [
    "# Fable — Play Store listing copy (independent take)",
    "",
    `- success: ${result.success}`,
    `- elapsed: ${elapsedS.toFixed(1)}s`,
    result.error ? `- adapter error: ${result.error.slice(0, 500)}` : "",
    "",
    "## Output",
    "",
    result.output || "(no output)",
  ].join("\n"), "utf-8");
  console.log(`[store-listing-fable] Written to ${outPath}`);
}

main().catch((err) => { console.error("[store-listing-fable] FAILED:", err); process.exit(1); });
