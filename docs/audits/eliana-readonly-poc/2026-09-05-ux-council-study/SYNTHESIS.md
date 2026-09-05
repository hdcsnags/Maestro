# UX/UI Council Study — Home, Bible reader, themes, navigation — Synthesis

*Conductor: Claude Fable 5.1 (interactive session), 2026-09-05. Seats: Gemini 3.8 Flash (agy), Kimi K3 swarm (kimi_cli), Claude Fable 5.1 (claude_code, blind seat), GPT-6 Astra (codex_cli — blocked, see §8). One shared prompt (`prompt.md`), the model as the only variable. Every finding below marked VERIFIED was re-read by the conductor in the live source at commit `11a2c01` of Elianas Rhythm; nothing here rests on a model's say-so.*

---

## 1. What this run shows that August's council could not

| | August 2026 hand-run council | This run |
|---|---|---|
| Dispatch | One model at a time, hand-typed CLI calls, results relayed through chat | Four seats in parallel through MaestroClaw adapters, ~11 min wall-clock for three reports |
| Blindness | Trusted | Enforced: per-seat disposable clone, prior report deleted from every clone before dispatch |
| Read-only | Trusted | Verified per seat by `git status` / `git diff` against a baseline; one false positive found and corrected (§8) |
| Comparability | Prose reviews, compared by eye | Same prompt, same scope, machine-readable `BEGIN FINDINGS` blocks → convergence matrix (§2) |
| Provenance | Chat memory | `manifest.json`: source commit, content hashes, prompt hash, CLI versions, requested/resolved model, output hashes, honest `known_gaps` |
| Failure mode | Silent | Astra, blocked twice, returned an empty findings array and said why, rather than inventing evidence |

Against the 2026-09-03 baseline UX report (author unknown, in the app repo as `ui-ux-assessment-report.md`): the three seated models independently re-found all six of the baseline's in-scope findings **and surfaced fourteen additional verified defects** the baseline missed, several of them higher-consequence than anything in it (§3).

---

## 2. Convergence matrix

Issue → who raised it. B = baseline report (09-03), G = Gemini 3.8 Flash, K = Kimi K3, F = Fable 5.1. Conductor column = verified in source by me.

| # | Issue | B | G | K | F | Conductor |
|---|---|---|---|---|---|---|
| A | Journey tab never highlights on its own route (`BottomNavigationBar.kt:40-42` tests `journal*`/`teachings*`/`throne_room*`, never `"journey"`) | ✓ | ✓ | inverse¹ | ✓ | **VERIFIED** |
| B | Reading-mode tap on a ✦ verse only toggles the tier; the verse can never be selected (`ReadingDisplayComponents.kt:492`) | ✓ | ✓ | ✓ | ✓ | **VERIFIED** — 4/4 |
| C | Reading mode has no highlight/annotate at all; selection bar = "Ask Eliana" + Clear only (`EnhancedBibleReaderScreen.kt:385-395`) | | | ✓ | ✓ | **VERIFIED** |
| D | Reading-mode selection is invisible: `FlowingVerseRun` never receives `selectedVerses` (`:370-378`) | | | | ✓ | **VERIFIED** |
| E | Reading/Study mode is in-memory only; every cold start is Reading mode (`EnhancedBibleReaderViewModel.kt:71`; only version/book/chapter persist) | | | | ✓ | **VERIFIED** |
| F | `BackgroundWrapper` forks on `premium != null`: flat ground for 3 themes, gradient+scrim for the other 3 (`:43-48`) | ✓ | ✓ | ✓ | ✓ | **VERIFIED** — 4/4 |
| G | ThemeCard paints in the *active* theme's surface, fixed 120×100dp (`SettingsScreen.kt:747-757`) | ✓ | ✓ | | ✓² | **VERIFIED** |
| H | Translucent `surfaceVariant.copy(alpha=…)` survives in tier card / dialogs / invite (`ElianaVerseTiers.kt:53`, `StudyToolsComponents.kt:164,249`) | ✓ | ✓ | ✓ | ✓ | **VERIFIED** |
| I | Home and Journey are duplicate launchpads; Prayer and Journal have no tab of their own | ✓ | ✓ | ✓ | ✓ | **VERIFIED** — 4/4 |
| J | `TextAlign.Justify` hardcoded on English scripture → word rivers on phone columns (`ReadingDisplayComponents.kt:483`, `BreathingVerseCard.kt:158`) | | ✓ | ✓ | ✓ | **VERIFIED** |
| K | Sacred Word card offers only a back-a-day arrow; no forward, no "Today", plain `remember` (`BreathingVerseCard.kt:202`, `HomeScreen.kt:185`) | | ✓ | | ✓ | **VERIFIED** |
| L | Strong's `AssistChip(onClick = {})` does nothing (`WordStudySheet.kt:204`) | | ✓ | | | **VERIFIED** |
| M | `WordLookupScreen` is a "Coming Soon" stub with a `// TODO` search, route still registered (`MainActivity.kt:246`); unreachable from UI since Journey's link was removed | | ✓ | ✓ | | **VERIFIED** — Kimi's "unreachable today" is the accurate framing; Gemini's "stumble onto it from search" is not |
| N | `navigation/MainDestination.kt` describes a 4-tab app, omits Bible, has **zero references** | | ✓ | ✓ | ✓ | **VERIFIED** |
| O | **Eleven** routes registered in both the root NavHost (`MainActivity.kt`) and the tab NavHost (`MainScreen.kt`): aliyah, bible_reader, eliana, guided, journal, prayer_generator, search, stillness, teachings, teachings_book, throne_room. Same screen, different back stack and exit behaviour depending on the door | | | ✓ | | **VERIFIED** — Kimi listed 6; the real count is 11 |
| P | Two font-size systems compound: Settings Small/Normal/Large scales the whole typography ramp (`ElianaTheme.kt:45`) AND the reader's A−/A+ moves 12–28sp on top (`EnhancedBibleReaderViewModel.kt:465-475`) | | | ✓ | | **VERIFIED** |
| Q | "Go Deeper" dead-ends on one failed Firestore read: "This study isn't available yet", no retry, no path to the reader (`VerseStudyScreen.kt:69-75`) | | | ✓ | ✓ | **VERIFIED** |
| R | Home study slot scans only teaching books; Aliyah/Foundations progress is never recorded, so the flagship studies never surface as "continue" (`HomeScreen.kt:69-107`) | | | | ✓ | **VERIFIED** (no study-progress persistence found in `data/study`, `StudyReaderScreen`, `AliyahScreen`) |
| S | Home collects `profileUiState`/`needsOnboarding`/`userProfile` and uses none of them (`HomeScreen.kt:53-61`) | | ✓ | | | **VERIFIED** |
| T | Journey ships placeholder stats "Prayers --" / "Sessions --" (`JourneyScreen.kt:389-390`) | | | ✓ | | **VERIFIED** |
| U | Dead components: `QuickAccessGrid`, `ElianaGreetingCard`, `DevotionalCard`, `BreathingElianaButton`, `VoiceCommandDialog` have zero references | | | ✓ | | **VERIFIED** 5/6 (`VersionSelectionComponents` still has one Kotlin reference) |
| V | Brain icon means Eliana everywhere but Study mode in the reader toolbar; font strip shows raw "18sp" (`EnhancedBibleReaderScreen.kt:244, 296`) | | | | ✓ | **VERIFIED** |
| W | Study-card tool buttons are 32dp with 16dp icons — under the 48dp touch target (`ReadingDisplayComponents.kt:611-666`) | | | | ✓ | **VERIFIED** |
| X | Compare dialog shows `take(6)` versions but sends `take(4)` to Eliana, no note (`StudyToolsComponents.kt:159,194`) | | | ✓ | | **VERIFIED** |
| Y | `restoreState = item.route != "journey"` — Journey alone discards its saved stack (`BottomNavigationBar.kt:89`) | | | ✓ | | **VERIFIED** |
| Z | Scripture renders twice when a tier is open, verse in `onSurfaceVariant`, copy in `onSurface` (`ReadingDisplayComponents.kt:747`) | | | | ✓ | PARTIAL — the secondary colour is confirmed; the duplication needs a device |

¹ Kimi described the same predicate from the other side: the bar lights "Journey" when you are on Prayer or Library. Both readings are true; together they are the finding.
² Fable's version: the swatches omit `background`, so Ivory and Crisp Paper look identical in the picker.

**Baseline items the council did not raise** (scope differed — the baseline roamed into Journal and Throne Room): the "armed" chapter→verse toggle in `BiblePickerSheet`, `ThromeRoomScreen.kt` typo, RTL back arrow, Journal's re-randomising quote, top-bar alpha. Still valid; carry them on the work order.

---

## 3. Unique catches, by model (all verified)

- **Fable 5.1**: D (selection never rendered), E (mode not persisted), R (Aliyah progress never reaches Home), V, W, Z. Pattern: *where a callback is never passed, a flag is never persisted, a comment promises what the code doesn't do.*
- **Kimi K3**: O (eleven duplicate routes — the largest structural defect anyone found), P (compounding font scales), T, U, X, Y, plus the stale-docs cluster (README theme names, ARCHITECTURE tab list, `FourThemeSystem` naming six themes). Pattern: *cross-file consistency, dead code proven by negative grep, comment archaeology.*
- **Gemini 3.8 Flash**: L (dead Strong's chip), S (dead ViewModel on Home), and the sharpest single user-story framing of K ("stranded in the past"). Pattern: *fast whole-repo sweep, Compose gesture and state-tree defects, done in under four minutes.*

## 4. Where they disagree

**The premise ("retention lives in Study-mode depth").** Nobody accepted it whole; nobody rejected it. Gemini: depth is credibility, habit is cadence — a 6am user has no bandwidth for verbal stems. Kimi: depth is real but gated behind an unexplained ✦ and a toggle; retention lives in whether Reading mode *betrays that depth exists*. Fable: depth is why someone chooses the app, but the code doesn't make depth default or continuous, and Home resumes a chapter, not a verse. **Synthesis:** depth is the reason to choose; rhythm and discoverability are the reason to return; today the depth is hidden behind a glyph with no legend and a toggle that forgets itself nightly. All three "one big move" proposals attack exactly that.

**The one big move — three drafts of the same idea.**
- Fable: *one reader grammar* — tap selects everywhere, a verse action bar (Deeper ✦ · Original א · Note · Compare · Ask · Chain №) rises from the bottom; Study mode = same reader with tiers pre-expanded; persist mode and last verse; Home resumes "Genesis 1:14 · last night". 3–4 days.
- Kimi: *Ascend lands in the text* — a `bible_reader?ref=John 3:16&mode=study` deep link; every Home CTA opens the Bible at the verse with the tier glowing; retire `VerseStudyScreen`. 2–3 days.
- Gemini: *the Morning Office* — Home collapses to greeting, one distilled verse, "Pray This" / "Read in Context", study ribbon below the fold; reader drops the mode wall for a progressive drawer. 3.5–4 days.

They compose. Fable's is the interaction layer, Kimi's is the routing layer, Gemini's is the Home layer. Combined estimate 5–7 builder days, no data-layer change.

**Information architecture.** Gemini and the baseline want Prayer and Journal as tabs (dropping Journey and one of Eliana/Stillness). Fable wants Journey to *become* the practices tab (Journal, Prayer, history, progress) and Home Quick Access trimmed. Kimi maps the overlap and explicitly declines to choose ("what Journey *means* is a product decision"). Michael's call; the code facts (I, N, O, Y) are settled either way.

## 5. Overclaims caught

- Gemini: re-tapping Journey "pushes another redundant instance" — false; the nav call uses `launchSingleTop = true`.
- Gemini: users "stumble onto Word Lookup from search" — no UI path exists; Kimi's "unreachable today" is right.
- Kimi self-identified as "K2-class" while `kimi-code/k3` was requested; the CLI's own model attribution is unverifiable from output. Recorded in the manifest.
- Fable's Z (double rendering) is plausible from source but not confirmed without a device.
- All three estimate build cost in days without seeing the build system; treat as relative, not absolute.

## 6. Recommended work order (verified defects only, ranked by user consequence)

1. **Unify reader gesture grammar** (B, C, D): tap = select on every verse including ✦; ✦ glyph gets its own tap range for the tier; selection renders (`primaryContainer` span); verse action bar with Highlight/Note/Compare/Ask/Deeper/Original. Files: `ReadingDisplayComponents.kt` FlowingVerseRun + tap dispatcher, `EnhancedBibleReaderScreen.kt` selection bar.
2. **Collapse the two NavHosts** (O, A, Y, N): tab routes live only in `MainScreen.kt`; root keeps sign-in/splash/onboarding/settings/teaching_day/fullscreen flows; fix the Journey predicate with a route→tab map; one `restoreState` rule; delete `MainDestination.kt`.
3. **Persist reader mode + last verse; Home resumes the verse** (E, R): `bible_reader` prefs gain `reading_mode` and `last_verse`; record last opened Aliyah/Foundations entry; `ContinueReadingCard` prefers the most recent.
4. **Ascend lands in the reader** (Q): deep-link route with `ref`+`mode`; `VerseStudyScreen` gets Open-in-Bible + retry or is retired.
5. **Sacred Word card: forward + Today + `rememberSaveable`** (K). Half a day.
6. **Theme doctrine finish** (F, G, H): `PremiumTokens` non-null on all six themes; delete the gradient path; opaque fills in `ElianaVerseTiers`, `StudyToolsComponents`, `JourneyScreen`; ThemeCard paints in `theme.colorScheme.background` with `heightIn(min=)`.
7. **Typography**: `TextAlign.Start` on English scripture (J); one font-size store (P); Read|Study segmented control and "A A A" instead of "18sp" (V); 48dp targets on study tools (W).
8. **Dead weight**: dead Strong's chip → filter by lemma or remove (L); delete `WordLookupScreen` + route or rebuild over `WordLookupMap` (M); delete five dead components (U); wire or cut Journey stats (T); fix `take(6)`/`take(4)` (X); drop dead profile collection on Home (S); docs pass (README themes, ARCHITECTURE tabs, `FourThemeSystem` name).
9. **Carried from baseline**: `BiblePickerSheet` armed toggle → breadcrumb; `ThromeRoom` typo; RTL arrow; Journal quote keyed to day.

## 7. Roster guidance — what each seat is for (their own words, checked against performance)

| Seat | Time | Findings | Verified | Best used for | Send elsewhere |
|---|---|---|---|---|---|
| Gemini 3.8 Flash (agy) | 3m53s | 12 | 12/12 (2 framing overclaims) | Fast whole-repo structural sweeps; Compose gesture/state defects; first pass before a slower model | Devotional prose; theological adjudication; taste |
| Fable 5.1 (claude_code) | 6m01s | 12 | 11/12 + 1 partial | Cross-file state tracing; "does the code do what the comment says"; original-language checks against `sources/` | Colour/rhythm taste; user research |
| Kimi K3 swarm (kimi_cli) | 10m40s | 12 (+2 extras) | 14/14 | Cross-file consistency; dead-code proofs; era archaeology; mechanical fix-patches once direction is set | Felt aesthetics; IA decisions; theology |
| GPT-6 Astra (codex_cli) | blocked | 0 | — | Unknown on this task; honest under failure. Re-run after the usage window resets | — |

Michael's question — *how do we use Fable 5.1 and Astra together?* — has a partial answer: this run is the pattern. Fable as concierge/conductor (designs the brief, dispatches, verifies every claim against source, synthesises); Fable 5.1 also takes a blind seat so the conductor's own model is graded like the others. Astra's seat is the one comparison we are missing; §8 has the one-line rerun.

## 8. Method notes and gaps

- **Astra**: attempt 1 blocked because Codex's read-only Windows sandbox cannot read clones under `%TEMP%` (`CreateProcessWithLogonW failed: 267`) — fixed, clones now live under `C:\New folder\claw-scratch`. Attempt 2 blocked by the OpenAI usage limit ("try again at 4:16 AM"). Rerun from `packages/maestroclaw`:
  `CLAW_CODEX_MODEL=gpt-6-astra npx tsx scripts/eliana-ux-council-study.ts only=astra && npx tsx scripts/eliana-ux-council-study.ts manifest-only`
- **Read-only false positive**: the app repo tracks `session.log`, which MaestroClaw appends to; the script now removes it from clones. Kimi/Gemini/Fable records were corrected to `clean` after hand verification (only `session.log` changed, tracked diff otherwise empty). Recommend adding `session.log` to the app repo's `.gitignore`.
- **Greeting variance**: first line differs per seat (Hi Astra / Hi Swarm / Hi Gemini / Hi Fable); body byte-identical.
- **Screenshots**: Gemini, Kimi and Fable all cited `play-store-assets/phone/01-home.png` / `02-bible.png`, so image ingestion worked for all three; Kimi noted `01-home.png` predates the 08-25 voice-button removal and is stale.
- **Baseline authorship**: the 09-03 report's author is unrecorded; it is treated here as "before", not as a fifth seat.
