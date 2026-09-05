#!/usr/bin/env -S npx tsx
/**
 * Sol (gpt-5.6-sol via codex_cli, READ-ONLY sandbox) audits the Eliana's Rhythm
 * Room database setup, independently of Fable's own review — Michael's ask
 * (2026-08-23): "make sure room itself is setup the best way possible, call sol
 * from codex through maestro and have him run his own audit so you can see if
 * you're also missing anything."
 *
 * Read-only: Codex native OS sandbox (`--sandbox read-only`) against the LIVE
 * repo — Sol can read everything, write nothing.
 *
 * Usage:
 *   cd packages/maestroclaw
 *   CLAW_CODEX_MODEL=gpt-5.6-sol npx tsx scripts/eliana-room-audit-sol.ts
 */

import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { CodexCliAdapter } from "../src/adapters/codex-cli.js";

const ELIANA_SOURCE = "C:\\New folder\\Elianas RhythmMigrate\\Elianas Rhythm";
const TIMEOUT_MS = 15 * 60 * 1000;
const OUT_DIR = join(
  "C:\\New folder\\MaestroOrchestra\\project\\Maestro\\docs\\audits\\eliana-readonly-poc",
  "2026-08-23-room-audit",
);

const PROMPT = `You are Sol, running an independent, read-only engineering audit of the Room
database setup in this Android app (Kotlin, Jetpack Compose, package com.eliana.rhythm). The app
ships two prepackaged SQLite databases via createFromAsset and is about to go to a closed test
group at a church. Fable has done his own pass; Michael wants YOUR independent findings so gaps in
either review surface. Do not assume Fable's conclusions; read the code yourself.

Scope — read these and anything they pull in:
- app/src/main/java/com/eliana/rhythm/data/local/BibleRoomDatabase.kt (prepackaged
  eliana_bible.db, ~30MB, version 3, migrations)
- app/src/main/java/com/eliana/rhythm/data/local/OriginalsDatabase.kt (originals.db, ~92MB,
  fallbackToDestructiveMigration)
- app/src/main/java/com/eliana/rhythm/data/local/BibleRoomRepository.kt, the DAOs
  (BibleDao.kt etc.), OriginalsEntities.kt
- How the Bible tab loads: MainScreen.kt route "bible_reader" -> ui screens
  EnhancedBibleReaderScreen.kt + EnhancedBibleReaderViewModel.kt (initial load path, UiState
  handling), and the onboarding warm-up (OnboardingScreen.kt warms the DB in background)
- Any other Room/SQLite usage you find (grep Room, createFromAsset, SQLite)

Symptom to explain if you can: Michael navigated to the Bible tab on the emulator and got a BLANK
screen; after a few retries it rendered. Could be emulator flakiness — but check whether the
initial-load path has a state where neither content, nor loading indicator, nor error card is
shown (e.g. first composition before the ViewModel emits, a race between the 30MB/92MB asset copy
and first query, cold-start contention, or a nav re-composition issue).

Audit for, at minimum: createFromAsset correctness (identity hash/version pinning, what happens on
app UPDATE when the shipped asset changes but user DB already exists — Room does NOT re-copy the
asset; is that handled?), migration strategy on both DBs, fallbackToDestructiveMigration risk on
originals.db, main-thread I/O (queries, allowMainThreadQueries, synchronous JSON/asset parsing on
composition), WAL/journal mode, missing indices for the hot verse lookups (book+chapter queries),
memory (loading whole chapters/books), and anything else a careful reviewer would flag. Severity-
rank every finding (BLOCKER / HIGH / MEDIUM / LOW) with file:line references. If something is
actually done WELL, say so in one line — Michael values calibration, not alarm.

FYI per house rules: primary-source Greek/Hebrew datasets live at ../sources/ with a verify.py
claim-checker — not needed for a Room audit, but do not speculate about scripture data contents;
the DBs are real and checkable.

Output: plain-text findings report, most severe first. No file writes — your sandbox is read-only
by design; report text is your only deliverable.`;

function log(msg: string): void {
  console.log(`[room-audit-sol] ${msg}`);
}

async function main() {
  if (!existsSync(ELIANA_SOURCE)) throw new Error(`source not found: ${ELIANA_SOURCE}`);
  mkdirSync(OUT_DIR, { recursive: true });

  log("Running Sol (codex_cli, --sandbox read-only) against the live repo...");
  const adapter = new CodexCliAdapter({ sandbox: "read-only" });
  const start = Date.now();
  const result = await adapter.run(PROMPT, ELIANA_SOURCE, TIMEOUT_MS);
  const elapsedS = (Date.now() - start) / 1000;
  log(`success=${result.success} elapsed=${elapsedS.toFixed(1)}s`);

  const reportPath = join(OUT_DIR, "sol-room-audit.md");
  writeFileSync(reportPath, [
    "# Sol — independent Room setup audit (read-only, 2026-08-23)",
    "",
    `- success: ${result.success}`,
    `- elapsed: ${elapsedS.toFixed(1)}s`,
    `- sandbox: read-only (Codex native)`,
    "",
    result.error ? `## adapter stderr\n\n\`\`\`\n${result.error}\n\`\`\`\n` : "",
    "## Sol's findings",
    "",
    result.output || "(no output)",
  ].join("\n"), "utf-8");
  log(`Report written to ${reportPath}`);
}

main().catch((err) => {
  console.error("[room-audit-sol] FAILED:", err);
  process.exit(1);
});
