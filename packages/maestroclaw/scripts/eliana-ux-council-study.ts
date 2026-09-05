#!/usr/bin/env -S npx tsx
/**
 * UX/UI council study — Home, Bible reader, Themes, navigation — Eliana's Rhythm.
 * First run of the NEW-GENERATION council through MaestroClaw, all four in parallel,
 * one shared prompt, one variable (the model):
 *
 *   astra   — gpt-6-astra          via codex_cli   (sandbox: read-only, OS-enforced)
 *   kimi    — kimi-code/k3 swarm   via kimi_cli    (no sandbox — read-only by instruction + git verification)
 *   gemini  — gemini-3.8-flash-high via agy_cli    (skip-permissions + --add-dir clone; git verification)
 *   fable   — claude-fable-5-1     via claude_code (task mode — no skip-permissions, writes denied)
 *
 * Each model gets its OWN disposable `git clone --depth 1 --no-hardlinks` of the app repo so
 * read-only verification is per-model (a shared clone would interleave the adapters' own
 * session.log instrumentation and misattribute writes). The existing human-readable UX report
 * (`ui-ux-assessment-report.md`, 2026-09-03) is DELETED from every clone before dispatch so all
 * four reviews are blind to it; the conductor (Fable, this session) compares against it afterward.
 *
 * Outputs + a reproducibility envelope (scripts/lib/eliana-manifest.ts schema) land under
 * docs/audits/eliana-readonly-poc/2026-09-05-ux-council-study/. Nothing is written into the app repo.
 *
 * Usage (from packages/maestroclaw):
 *   CLAW_CODEX_MODEL=gpt-6-astra CLAW_KIMI_MODEL=kimi-code/k3 \
 *   CLAW_AGY_MODEL=gemini-3.8-flash-high CLAW_CLAUDE_MODEL=claude-fable-5-1 \
 *   CLAUDE_CONFIG_DIR="$HOME/.claude-thamos" PYTHONIOENCODING=utf-8 \
 *     npx tsx scripts/eliana-ux-council-study.ts [only=astra,kimi,gemini,fable]
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { CodexCliAdapter } from "../src/adapters/codex-cli.js";
import { KimiCliAdapter } from "../src/adapters/kimi-cli.js";
import { AgyCliAdapter } from "../src/adapters/agy-cli.js";
import { ClaudeCodeAdapter } from "../src/adapters/claude-code.js";
import type { AdapterResult } from "../src/adapters/types.js";
import {
  captureSourceRepoInfo, cliVersion, parseCodexBanner, sha256, sha256OfFile, writeManifest,
  type EnvelopeManifest, type RunRecord,
} from "./lib/eliana-manifest.js";

const ELIANA_SOURCE = "C:\\New folder\\Elianas RhythmMigrate\\Elianas Rhythm";
const RUN_ID = "2026-09-05-ux-council-study";
const OUT_DIR = join("C:\\New folder\\MaestroOrchestra\\project\\Maestro\\docs\\audits\\eliana-readonly-poc", RUN_ID);
const TIMEOUT_MS = 35 * 60 * 1000;
// NOT the user's %TEMP%: Codex's read-only Windows sandbox runs as a restricted identity that
// gets "Access to the path is denied" under AppData\Local\Temp (first astra run, 2026-09-05:
// `CreateProcessWithLogonW failed: 267`). Every August codex run that read files used a path
// under C:\New folder, so scratch clones live there too.
const SCRATCH_ROOT = "C:\\New folder\\claw-scratch";
// ui-ux-assessment-report.md: the prior human-readable UX report — removed so reads are blind.
// session.log: the app repo TRACKS MaestroClaw's own instrumentation log, so an adapter appending
// to it shows up as a modified tracked file and false-positives the read-only check. Removing it
// (in the clone only) makes the adapter's append create an untracked file, which is filtered.
const BLIND_REMOVE = ["ui-ux-assessment-report.md", "session.log"];
const INSTRUMENTATION = ["session.log", ".maestroclaw-session.log"];

// The files the study is about. Named explicitly so every model reads the same surface.
const SCOPE_FILES = [
  "app/src/main/java/com/eliana/rhythm/HomeScreen.kt",
  "app/src/main/java/com/eliana/rhythm/MainScreen.kt",
  "app/src/main/java/com/eliana/rhythm/BottomNavigationBar.kt",
  "app/src/main/java/com/eliana/rhythm/navigation/MainDestination.kt",
  "app/src/main/java/com/eliana/rhythm/ui/components/home/",
  "app/src/main/java/com/eliana/rhythm/ui/screens/EnhancedBibleReaderScreen.kt",
  "app/src/main/java/com/eliana/rhythm/ui/screens/VerseStudyScreen.kt",
  "app/src/main/java/com/eliana/rhythm/ui/screens/WordLookupScreen.kt",
  "app/src/main/java/com/eliana/rhythm/ui/components/bible/",
  "app/src/main/java/com/eliana/rhythm/ui/theme/",
  "app/src/main/java/com/eliana/rhythm/ui/components/BackgroundWrapper.kt",
  "app/src/main/java/com/eliana/rhythm/ui/screens/SettingsScreen.kt",
];
const HASHED_FILES = [
  "app/src/main/java/com/eliana/rhythm/HomeScreen.kt",
  "app/src/main/java/com/eliana/rhythm/BottomNavigationBar.kt",
  "app/src/main/java/com/eliana/rhythm/ui/screens/EnhancedBibleReaderScreen.kt",
  "app/src/main/java/com/eliana/rhythm/ui/components/bible/ReadingDisplayComponents.kt",
  "app/src/main/java/com/eliana/rhythm/ui/theme/FourThemeSystem.kt",
  "app/src/main/java/com/eliana/rhythm/ui/screens/SettingsScreen.kt",
  "app/src/main/java/com/eliana/rhythm/ui/components/BackgroundWrapper.kt",
];

function buildPrompt(greeting: string): string {
  return `${greeting} — Michael here, via Fable (my concierge agent, who is running this study and will read
your work alongside three other models' — you won't see theirs and they won't see yours).

WHO WE ARE. Eliana's Rhythm is a Christian spiritual companion Android app I've built over two years,
named for my daughter. Kotlin + Jetpack Compose, MVVM, Room, Firebase. It has a Bible reader with the
full original-language canon (pointed Hebrew, accented Greek, transliteration toggle), tap-a-word studies
backed by 22,694 audited word essays, a multi-book study library ("Aliyah — The Ascent"), an AI companion,
stillness/meditation, prayer, journaling, and a multi-theme system (Shekinah black/gold, Ivory paper,
plus older gradient themes). We're weeks from a Play Store closed test. The word-study corpus audit is
done; the app is now at the stage where how it FEELS in the hand — Home and the Bible reader most of
all — decides whether people come back. My wife's read: retention lives in Study-mode depth.

THE ASK. A clinical UX/UI study of four surfaces, from the source code itself:
  1. Home (HomeScreen.kt + ui/components/home/*) — greeting, breathing verse, quick access, study path,
     continue-reading. What does the first screen say to a believer opening the app at 6am?
  2. The Bible reader (EnhancedBibleReaderScreen.kt, ui/components/bible/*, VerseStudyScreen.kt,
     WordLookupScreen.kt) — flowing vs study mode, verse selection, the word-study sheet, contested-verse
     cards, original-language rendering, version picker.
  3. The theme system (ui/theme/*, BackgroundWrapper.kt, the ThemeCard in SettingsScreen.kt) — does it
     hold together as one design language, or is it several eras stacked?
  4. Navigation and information architecture (MainScreen.kt, BottomNavigationBar.kt,
     navigation/MainDestination.kt) — do Home and Journey overlap, is the bottom bar honest, where do
     daily practices (prayer, journal) live?

You are in a fresh disposable clone of the repo; the working directory is the repo root. Read the real
files — the scope above, plus anything they call. README.md, ARCHITECTURE.md, STATE.md, AGENTS.md at the
root are fair game for context. Screenshots exist at play-store-assets/phone/ if you can read images.
Do NOT read any other root-level markdown (drafts, audits, reviews) — this is a blind, independent read.

GROUND RULES.
- Read-only. Do not create, modify, or delete any file. Do not run builds. Put your entire report in
  your final response text.
- Every finding cites file and line (file.kt:123). If you can't point at code, mark it (unverified).
- Clinical, evidence-based. No flattery, no "legendary"/"fortress-level". Say what works, what doesn't,
  what's uncertain. If you think a premise of mine is wrong (including "retention lives in Study
  depth"), say so and why.
- Distinguish a bug (code does the wrong thing) from a design weakness (code does what it says, and
  what it says is the problem) from a taste call.

DELIVERABLE — markdown, 1,500–3,000 words plus the JSON block. Begin with one line: the model you are
running as, as best you know it.
  1. Executive read (≤200 words): what a careful reviewer would say after one honest hour with this code.
  2. Ranked findings, max 12. Each: severity (blocker / high / medium / low) · area (home / reader /
     theme / nav) · kind (bug / design / taste) · file:line · what's wrong · what a user actually
     experiences · a concrete fix at code-direction level.
  3. Themes verdict: one design language or several? Name the seams.
  4. The one big move: the single change that most raises the felt quality of Home + Bible for a
     Christian reader who opens this app daily. Sketch it — what it looks like, what it replaces, rough
     build cost. Be specific enough that a builder could start.
  5. What you could not verify from source alone (device behavior, timing, real content density).
  6. Where YOUR model should be used on this project going forward — honestly, ≤6 lines. What are you
     actually better at here than a generic reviewer would be? What should be sent elsewhere?
  7. Machine-readable block, last thing in your response, between the exact lines BEGIN FINDINGS and
     END FINDINGS — a JSON array, one object per finding from §2, same order:
     {"id":"F1","severity":"high","area":"reader","kind":"bug","file":"path/File.kt","line":123,
      "claim":"<one sentence>","fix":"<one sentence>"}

If you disagree with the framing, say so at the top and then do the study anyway.`;
}

function log(m: string): void { console.log(`[ux-council] ${m}`); }
function git(dir: string, args: string[]): string {
  try { return execFileSync("git", args, { cwd: dir, encoding: "utf8" }); }
  catch (err) { return `(git ${args[0]} failed: ${err instanceof Error ? err.message : String(err)})`; }
}
function newStatusLines(baseline: string, after: string): string[] {
  const base = new Set(baseline.split("\n").map((l) => l.trim()).filter(Boolean));
  return after.split("\n").map((l) => l.trim()).filter(Boolean).filter((l) => !base.has(l));
}

function makeClone(label: string): { root: string; clone: string } {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const root = mkdtempSync(join(SCRATCH_ROOT, `ux-council-${label}-`));
  const clone = join(root, "repo");
  execFileSync("git", ["clone", "--depth", "1", "--no-hardlinks", ELIANA_SOURCE, clone], { stdio: "pipe" });
  for (const f of BLIND_REMOVE) {
    const p = join(clone, f);
    if (existsSync(p)) { rmSync(p); log(`${label}: removed ${f} from clone (blind read)`); }
  }
  // Commit the removal inside the disposable clone so the baseline git status is clean and
  // any later write shows up unambiguously.
  execFileSync("git", ["-c", "user.email=claw@local", "-c", "user.name=claw", "commit", "-qam", "blind: remove prior UX report + tracked instrumentation log"], { cwd: clone, stdio: "pipe" });
  return { root, clone };
}

// Each member persists its own run record so a single seat can be re-run (only=<label>) and
// the manifest re-assembled from disk (manifest-only) without disturbing the other seats.
function runRecordPath(label: string): string { return join(OUT_DIR, `${label}-run.json`); }
function loadRunRecords(): RunRecord[] {
  return MEMBERS.map((m) => runRecordPath(m.label)).filter(existsSync)
    .map((p) => JSON.parse(readFileSync(p, "utf-8")) as RunRecord);
}

interface Member {
  label: string;
  adapterName: string;
  requestedModel: string;
  readOnlyMechanism: string;
  greeting: string;
  make: () => { run: (p: string, d: string, t: number) => Promise<AdapterResult> };
}

const MEMBERS: Member[] = [
  {
    label: "astra", adapterName: "codex_cli", requestedModel: process.env.CLAW_CODEX_MODEL ?? "(codex default)",
    readOnlyMechanism: "codex --sandbox read-only (OS-enforced) + git verification",
    greeting: "Hi Astra", make: () => new CodexCliAdapter({ sandbox: "read-only" }),
  },
  {
    label: "kimi", adapterName: "kimi_cli", requestedModel: process.env.CLAW_KIMI_MODEL ?? "(kimi default)",
    readOnlyMechanism: "instruction only (kimi has no sandbox) + git verification in a disposable clone",
    greeting: "Hi Swarm", make: () => new KimiCliAdapter(),
  },
  {
    label: "gemini", adapterName: "agy_cli", requestedModel: process.env.CLAW_AGY_MODEL ?? "(agy default)",
    readOnlyMechanism: "instruction only (agy runs --dangerously-skip-permissions scoped by --add-dir) + git verification",
    greeting: "Hi Gemini", make: () => new AgyCliAdapter(),
  },
  {
    label: "fable", adapterName: "claude_code", requestedModel: process.env.CLAW_CLAUDE_MODEL ?? "sonnet",
    readOnlyMechanism: "claude --print task mode without --dangerously-skip-permissions (writes denied) + git verification",
    greeting: "Hi Fable", make: () => new ClaudeCodeAdapter(),
  },
];

function extractFindings(text: string): unknown[] | null {
  const b = text.indexOf("BEGIN FINDINGS"), e = text.indexOf("END FINDINGS");
  if (b < 0 || e <= b) return null;
  const sec = text.slice(b + "BEGIN FINDINGS".length, e).trim().replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(sec) as unknown[]; } catch { return null; }
}

async function runMember(m: Member, promptSha: string): Promise<RunRecord> {
  const { root, clone } = makeClone(m.label);
  const prompt = buildPrompt(m.greeting);
  const baseline = git(clone, ["status", "--short"]);
  log(`${m.label}: dispatching ${m.adapterName} (${m.requestedModel}) in ${clone}`);
  const t0 = Date.now();
  let res: AdapterResult;
  try { res = await m.make().run(prompt, clone, TIMEOUT_MS); }
  catch (err) { res = { success: false, output: "", error: err instanceof Error ? err.message : String(err) }; }
  const elapsed = Math.round((Date.now() - t0) / 1000);

  const after = git(clone, ["status", "--short"]);
  const diffStat = git(clone, ["diff", "--stat", "--", ".", ...INSTRUMENTATION.map((f) => `:!${f}`)]);
  const fresh = newStatusLines(baseline, after);
  const unexpected = fresh.filter((l) => !INSTRUMENTATION.some((f) => l.endsWith(f)));
  const verification: RunRecord["read_only_verification"] =
    unexpected.length > 0 || diffStat.trim().length > 0 ? "UNEXPECTED_WRITE_DETECTED" : "clean";
  log(`${m.label}: success=${res.success} elapsed=${elapsed}s chars=${res.output.length} read-only=${verification}`);

  const outFile = join(OUT_DIR, `${m.label}.md`);
  writeFileSync(outFile, [
    `# ${m.label} — ${m.adapterName} (${m.requestedModel}) — UX/UI council study`,
    "",
    `- success: ${res.success}`,
    `- elapsed: ${elapsed}s`,
    `- read-only verification: **${verification}**${fresh.length ? ` (new status lines: ${fresh.join("; ")})` : ""}`,
    `- clone: ${clone}`,
    res.error ? `\n## adapter error\n\n\`\`\`\n${res.error.slice(0, 4000)}\n\`\`\`` : "",
    "",
    "## Output",
    "",
    res.output || "(no output)",
  ].join("\n"), "utf-8");

  const findings = extractFindings(res.output || "");
  if (findings) {
    writeFileSync(join(OUT_DIR, `${m.label}-findings.json`), JSON.stringify(findings, null, 1), "utf-8");
    log(`${m.label}: parsed ${findings.length} findings`);
  } else {
    log(`${m.label}: no parseable BEGIN/END FINDINGS block`);
  }

  const banner = m.adapterName === "codex_cli" ? parseCodexBanner(res.output || "") : {};
  const gaps: string[] = [];
  if (!findings) gaps.push("findings JSON block missing or unparseable");
  if (m.adapterName !== "codex_cli") gaps.push("resolved model not observable from adapter output; requested model recorded only");

  const record: RunRecord = {
    label: m.label, adapter: m.adapterName, mode: "task", persona: null,
    cli_version: cliVersion(m.adapterName === "codex_cli" ? "codex" : m.adapterName === "kimi_cli" ? "kimi" : m.adapterName === "agy_cli" ? "agy" : "claude"),
    read_only_mechanism: m.readOnlyMechanism,
    requested_model: m.requestedModel,
    ...(banner.model ? { resolved_model: banner.model } : {}),
    ...(banner.session_id ? { session_id: banner.session_id } : {}),
    success: res.success, elapsed_seconds: elapsed,
    read_only_verification: verification, new_status_lines_beyond_baseline: fresh,
    output_file: `${m.label}.md`, output_sha256: sha256(res.output || ""),
    ...(gaps.length ? { known_gaps: gaps } : {}),
  };
  (record as unknown as { scratch_clone: string }).scratch_clone = clone;
  writeFileSync(runRecordPath(m.label), JSON.stringify(record, null, 2), "utf-8");
  return record;
}

function writeAssembledManifest(promptSha: string): void {
  const runs = loadRunRecords();
  const manifest: EnvelopeManifest = {
    run_id: RUN_ID,
    timestamp_utc: new Date().toISOString(),
    task_description: "Blind, parallel UX/UI study of Home, Bible reader, theme system and navigation by the new-generation council (gpt-6-astra, Kimi K3 swarm, Gemini 3.8 Flash, Claude Fable 5.1), one shared prompt, per-model disposable clones. Conductor: Fable 5.1 (interactive session).",
    read_only: true,
    source_repo: captureSourceRepoInfo(ELIANA_SOURCE, "each model ran in its own --depth 1 --no-hardlinks clone under C:\\New folder\\claw-scratch; ui-ux-assessment-report.md and the tracked session.log removed from every clone before dispatch"),
    content: {
      description: "Source files in scope (hashes of the load-bearing ones; the prompt names the full scope).",
      files: HASHED_FILES.map((f) => ({ path: f, sha256: sha256OfFile(join(ELIANA_SOURCE, f)) })),
    },
    prompt: { file: "prompt.md", sha256: promptSha },
    runs,
    known_gaps: [
      "Greeting line differs per model (Hi Astra / Hi Swarm / Hi Gemini / Hi Fable); prompt.md records the canonical body with 'Hi'. Everything after the greeting is byte-identical.",
      "kimi_cli and agy_cli have no sandbox; read-only rests on instruction plus post-run git verification inside a disposable clone.",
      "Screenshots were available in the clone but no adapter's image ingestion was verified.",
      "astra's first attempt (clone under %TEMP%) was blocked by the Codex sandbox's path access (`CreateProcessWithLogonW failed: 267`); the model correctly returned an empty findings array rather than inventing evidence. Re-run from C:\\New folder\\claw-scratch is the recorded run.",
    ],
    notes: [
      "First MaestroClaw run of the new-generation council (Astra / K3 / 3.8 Flash / Fable 5.1) and the first four-adapter parallel run.",
      "Per-seat run records live in <label>-run.json (each carries its scratch_clone path); manifest assembled from them.",
    ],
  };
  writeManifest(OUT_DIR, manifest);
}

async function main() {
  if (!existsSync(ELIANA_SOURCE)) throw new Error(`source repo not found: ${ELIANA_SOURCE}`);
  mkdirSync(OUT_DIR, { recursive: true });
  const onlyArg = process.argv.find((a) => a.startsWith("only="));
  const only = onlyArg ? new Set(onlyArg.slice(5).split(",")) : null;
  const members = MEMBERS.filter((m) => !only || only.has(m.label));

  const promptCanonical = buildPrompt("Hi");
  writeFileSync(join(OUT_DIR, "prompt.md"), promptCanonical, "utf-8");
  const promptSha = sha256(promptCanonical);

  if (process.argv.includes("manifest-only")) {
    writeAssembledManifest(promptSha);
    log(`manifest re-assembled from ${loadRunRecords().length} run record(s) → ${OUT_DIR}`);
    return;
  }

  log(`Run ${RUN_ID}: ${members.map((m) => `${m.label}=${m.requestedModel}`).join(", ")}`);
  const t0 = Date.now();
  await Promise.all(members.map((m) => runMember(m, promptSha)));
  log(`all done in ${Math.round((Date.now() - t0) / 1000)}s`);

  writeAssembledManifest(promptSha);
  log(`manifest written → ${OUT_DIR}`);
}

main().catch((err) => { console.error("[ux-council] FAILED:", err); process.exit(1); });
