#!/usr/bin/env -S npx tsx
/**
 * Theme audit + missed-opportunities sweep — Michael, 2026-09-10: "You and astra should audit the
 * themes, see what makes sense to keep … what makes sense to tweak and just give me a list/grading.
 * I also wanted you and astra to see if there's any missed opportunities in the app."
 *
 * Two prompts, one seat each per process (adapters read their model env at import). Read-only
 * clone of `ux-council-fixes` under C:\New folder\claw-scratch; git status/diff verified after.
 *
 * Usage (from packages/maestroclaw):
 *   CLAW_CODEX_MODEL=gpt-6-astra PYTHONIOENCODING=utf-8 npx tsx scripts/eliana-theme-opportunity-audit.ts [only=themes,opportunities] [seat=astra|sol]
 */
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { CodexCliAdapter } from "../src/adapters/codex-cli.js";
import type { AdapterResult } from "../src/adapters/types.js";

const SOURCE = "C:\\New folder\\Elianas RhythmMigrate\\Elianas Rhythm";
const BRANCH = "ux-council-fixes";
const RUN_ID = "2026-09-10-theme-opportunity-audit";
const OUT_DIR = join("C:\\New folder\\MaestroOrchestra\\project\\Maestro\\docs\\audits\\eliana-readonly-poc", RUN_ID);
const SCRATCH_ROOT = "C:\\New folder\\claw-scratch";
const TIMEOUT_MS = 25 * 60 * 1000;
const INSTRUMENTATION = ["session.log", ".maestroclaw-session.log"];
const seatArg = process.argv.find(a => a.startsWith("seat="));
const SEAT = seatArg ? seatArg.slice(5) : "astra";

const COMMON = `Hi — Michael here, via Fable (my concierge agent). Eliana's Rhythm is my Christian companion Android app
(Kotlin/Compose/Material 3, MVVM, Room, Firebase). You are in a read-only clone of branch \`${BRANCH}\`
(what testers have as v15/v16). STATE.md's top entries say what changed this week. House commitments you
should know: the Eliana rendering says Yeshua; the ✦ is Eliana's mark; Home = "where you land, eat your
meal and go"; Journey = the whole course of the app; the Bible tab is the spine (Read / Study modes, Top
voice compare, tiers: original · transliteration · Eliana · key word). Tabs: Home · Bible · Journey · Eliana.
Ground every claim in the files (quote paths). Read-only: do not create, modify or delete anything; do not
build. Begin with the model you are running as.`;

const THEMES_PROMPT = `${COMMON}

THE ASK — THEME AUDIT. The theme system is \`app/src/main/java/com/eliana/rhythm/ui/theme/FourThemeSystem.kt\`
(the name is historical; there are more than four). Read every ElianaThemeConfig there, the PremiumTokens
each carries, \`getAllThemes()\`, how \`ElianaTheme\` applies them (\`ui/theme/Theme.kt\` / \`Color.kt\` /
\`Type.kt\` if present), and how Settings presents them (\`ui/screens/SettingsScreen.kt\`, ThemeCard). Then
look at the biggest consumers: HomeScreen.kt + ui/components/home/*, ui/screens/EnhancedBibleReaderScreen.kt
+ ui/components/bible/*, ui/screens/JourneyScreen.kt, ElianaCompanionScreen.kt.

Give me, for EACH theme: a grade A–F and one line of reasoning on (a) legibility of long-form scripture
(contrast of onSurface/onBackground on background/surface — compute the WCAG ratio for the body text pair
and say the number), (b) distinctiveness from the other themes (is it a real choice or a near-duplicate?),
(c) coherence of its accent (does the gold/teal read as one material across chips, buttons, ✦, borders?),
(d) dark/light and OLED sense. Then a KEEP / TWEAK / CUT verdict with the exact tweak (token + value) if
TWEAK. Also: which themes are defined but not offered (compare the configs to getAllThemes()) and whether
they should be deleted from code. Finally, one paragraph: if the app should have exactly four themes, which
four and why — and whether a "match my wallpaper" dynamic-color theme belongs as a fifth. 900–1,500 words.
End with a JSON block between the exact lines BEGIN VERDICT and END VERDICT:
  {"themes":[{"name":"...","offered":true,"grade":"B","contrast_body":4.9,"verdict":"keep|tweak|cut",
    "tweak":"<token=value or null>","why":"..."}],"keep_four":["..."],"dynamic_color_fifth":true|false,
    "delete_from_code":["..."]}`;

const OPPS_PROMPT = `${COMMON}

THE ASK — MISSED OPPORTUNITIES. Read the app as a product designer who also reads Kotlin: MainScreen.kt
(the tab graph and every route), HomeScreen.kt, the Bible reader (ui/screens/EnhancedBibleReaderScreen.kt,
ui/components/bible/ReadingDisplayComponents.kt, ElianaVerseTiers.kt, WordStudySheet.kt, ChainSheet if
present), JourneyScreen.kt and the rooms it opens (Journal*, ThromeRoomScreen/Prayer*, StillnessScreen,
LibraryScreen/AliyahScreen/FoundationsScreen/StudyReaderScreen), ElianaCompanionScreen.kt, SettingsScreen.kt,
the data the app already holds (assets/studies/*, assets/contested_verses.json, assets/bibles/*, the
Firestore-backed Eliana rendering + verse_insights + word_studies described in FirebaseFirestoreManager.kt,
the daily reminder in notifications/DailyReminder.kt, the widget in widget/VotdWidget.kt).

List the missed opportunities — places where the app already HAS the data or the surface but does not
connect them, or where one small addition would change how a reader uses it. For each: title (≤8 words),
what exists today (file), what's missing, why a reader would care (one sentence, concrete), cost S/M/L,
and a risk. I want 10–15, ranked by value ÷ cost. Be specific to THIS app's data — a Bible app that has
per-verse Hebrew/Greek, transliteration, an original-language word study for 22k words, chains between
OT and NT, a curated verse calendar, a journal, and a companion — not generic app advice. Also name up to
three things the app does that you would REMOVE or fold away, with reasons. 1,000–1,600 words.
End with a JSON block between the exact lines BEGIN VERDICT and END VERDICT:
  {"opportunities":[{"rank":1,"title":"...","exists":"<file>","missing":"...","why":"...","cost":"S|M|L","risk":"..."}],
   "remove":[{"what":"...","why":"..."}]}`;

const TASKS: Record<string, string> = { themes: THEMES_PROMPT, opportunities: OPPS_PROMPT };

function log(m: string) { console.log(`[theme-opps] ${m}`); }
function git(dir: string, args: string[]) { try { return execFileSync("git", args, { cwd: dir, encoding: "utf8" }); } catch (e) { return `(git failed: ${String(e).slice(0, 120)})`; } }

function makeClone(label: string): string {
  mkdirSync(SCRATCH_ROOT, { recursive: true });
  const root = mkdtempSync(join(SCRATCH_ROOT, `themeopps-${label}-`));
  const clone = join(root, "repo");
  execFileSync("git", ["clone", "--no-hardlinks", "--depth", "1", "--branch", BRANCH, SOURCE, clone], { stdio: "pipe" });
  const sl = join(clone, "session.log"); if (existsSync(sl)) rmSync(sl);
  return clone;
}

async function runTask(task: string, prompt: string) {
  const clone = makeClone(task);
  const base = git(clone, ["status", "--short"]);
  const model = process.env.CLAW_CODEX_MODEL ?? "(default)";
  log(`${task}: dispatching codex_cli (${model}) as seat "${SEAT}"`);
  const t0 = Date.now();
  let res: AdapterResult;
  try { res = await new CodexCliAdapter({ sandbox: "read-only" }).run(prompt, clone, TIMEOUT_MS); } catch (e) { res = { success: false, output: "", error: String(e) }; }
  const elapsed = Math.round((Date.now() - t0) / 1000);
  const after = git(clone, ["status", "--short"]).split("\n").map(l => l.trim()).filter(Boolean).filter(l => !base.includes(l));
  const unexpected = after.filter(l => !INSTRUMENTATION.some(f => l.endsWith(f)));
  const diff = git(clone, ["diff", "--stat", "--", ".", ...INSTRUMENTATION.map(f => `:!${f}`)]).trim();
  const ro = unexpected.length || diff ? "UNEXPECTED_WRITE_DETECTED" : "clean";
  log(`${task}: success=${res.success} elapsed=${elapsed}s chars=${res.output.length} read-only=${ro}`);
  writeFileSync(join(OUT_DIR, `${SEAT}-${task}.md`), [
    `# ${SEAT} — codex_cli (${model}) — ${task}`, "",
    `- success: ${res.success}`, `- elapsed: ${elapsed}s`, `- read-only verification: **${ro}**`, `- clone: ${clone}`,
    res.error ? `\n## adapter error\n\n\`\`\`\n${res.error.slice(-3000)}\n\`\`\`` : "", "", "## Output", "", res.output || "(no output)",
  ].join("\n"), "utf-8");
  const b = res.output.indexOf("BEGIN VERDICT"), e = res.output.indexOf("END VERDICT");
  if (b >= 0 && e > b) {
    const sec = res.output.slice(b + 13, e).trim().replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
    try { writeFileSync(join(OUT_DIR, `${SEAT}-${task}-verdict.json`), JSON.stringify(JSON.parse(sec), null, 1), "utf-8"); log(`${task}: verdict parsed`); }
    catch { log(`${task}: verdict JSON unparseable`); }
  } else log(`${task}: no verdict block`);
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const onlyArg = process.argv.find(a => a.startsWith("only="));
  const only = onlyArg ? new Set(onlyArg.slice(5).split(",")) : null;
  const tasks = Object.entries(TASKS).filter(([k]) => !only || only.has(k));
  for (const [k, p] of tasks) writeFileSync(join(OUT_DIR, `prompt-${k}.md`), p, "utf-8");
  log(`run ${RUN_ID}: seat=${SEAT} tasks=${tasks.map(([k]) => k).join(",")}`);
  await Promise.all(tasks.map(([k, p]) => runTask(k, p)));
  log(`all done → ${OUT_DIR}`);
}
main().catch(e => { console.error("[theme-opps] FAILED:", e); process.exit(1); });
