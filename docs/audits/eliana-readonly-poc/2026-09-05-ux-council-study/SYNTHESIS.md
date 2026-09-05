# UX/UI Council Study — Home, Bible reader, themes, navigation — Synthesis

*Conductor: Claude Fable 5.1 (interactive session), 2026-09-05. Seats: Gemini 3.8 Flash (agy), Kimi K3 swarm (kimi_cli), Claude Fable 5.1 (claude_code, blind seat), GPT-6 Astra (codex_cli — seated on its third attempt, see §8 for the blindness caveat). One shared prompt (`prompt.md`), the model as the only variable. Every finding below marked VERIFIED was re-read by the conductor in the live source at commit `11a2c01` of Elianas Rhythm; nothing here rests on a model's say-so.*

---

## 1. What this run shows that August's council could not

| | August 2026 hand-run council | This run |
|---|---|---|
| Dispatch | One model at a time, hand-typed CLI calls, results relayed through chat | Four seats through MaestroClaw adapters; three in parallel in ~11 min wall-clock, the fourth re-seated in 3½ min |
| Blindness | Trusted | Enforced: per-seat disposable clone, prior report deleted from every clone before dispatch (one leak found and disclosed by the model itself — §8) |
| Read-only | Trusted | Verified per seat by `git status` / `git diff` against a baseline; one false positive found and corrected (§8) |
| Comparability | Prose reviews, compared by eye | Same prompt, same scope, machine-readable `BEGIN FINDINGS` blocks → convergence matrix (§2) |
| Provenance | Chat memory | `manifest.json`: source commit, content hashes, prompt hash, CLI versions, requested/resolved model, output hashes, honest `known_gaps` |
| Failure mode | Silent | Astra, blocked twice, returned an empty findings array and said why, rather than inventing evidence; when finally seated it disclosed unprompted that it was not fully blind |

Against the 2026-09-03 baseline UX report (author unknown, in the app repo as `ui-ux-assessment-report.md`): the four seated models re-found all six of the baseline's in-scope findings **and surfaced twenty additional verified defects** the baseline missed, several of them higher-consequence than anything in it (§3).

---

## 2. Convergence matrix

Issue → who raised it. B = baseline report (09-03), G = Gemini 3.8 Flash, K = Kimi K3, F = Fable 5.1, A = GPT-6 Astra. Conductor column = verified in source by me. Astra's marks on rows A–S carry an asterisk: those rows were summarised in the STATE.md its clone contained, so its agreement there is confirmation, not independent discovery (§8). Rows AA–AF are Astra's own.

| # | Issue | B | G | K | F | A | Conductor |
|---|---|---|---|---|---|---|---|
| A | Journey tab never highlights on its own route (`BottomNavigationBar.kt:40-42` tests `journal*`/`teachings*`/`throne_room*`, never `"journey"`) | ✓ | ✓ | inverse¹ | ✓ | ✓* | **VERIFIED** |
| B | Reading-mode tap on a ✦ verse only toggles the tier; the verse can never be selected (`ReadingDisplayComponents.kt:492`) | ✓ | ✓ | ✓ | ✓ | ✓* | **VERIFIED** — 5/5 |
| C | Reading mode has no highlight/annotate at all; selection bar = "Ask Eliana" + Clear only (`EnhancedBibleReaderScreen.kt:385-395`) | | | ✓ | ✓ | ✓* | **VERIFIED** |
| D | Reading-mode selection is invisible: `FlowingVerseRun` never receives `selectedVerses` (`:370-378`) | | | | ✓ | ✓* | **VERIFIED** |
| E | Reading/Study mode is in-memory only; every cold start is Reading mode (`EnhancedBibleReaderViewModel.kt:71`) | | | | ✓ | ✓* | **VERIFIED** |
| F | `BackgroundWrapper` forks on `premium != null`: flat ground for 3 themes, gradient+scrim for the other 3 (`:43-48`) | ✓ | ✓ | ✓ | ✓ | ✓* | **VERIFIED** — 5/5 |
| G | ThemeCard paints in the *active* theme's surface, fixed 120×100dp (`SettingsScreen.kt:747-757`) | ✓ | ✓ | | ✓² | ✓* | **VERIFIED** |
| H | Translucent `surfaceVariant.copy(alpha=…)` survives in tier card / dialogs / invite (`ElianaVerseTiers.kt:53`, `StudyToolsComponents.kt:164,249`) | ✓ | ✓ | ✓ | ✓ | ✓* | **VERIFIED** |
| I | Home and Journey are duplicate launchpads; Prayer and Journal have no tab of their own | ✓ | ✓ | ✓ | ✓ | ✓* | **VERIFIED** — 5/5 |
| J | `TextAlign.Justify` hardcoded on English scripture → word rivers (`ReadingDisplayComponents.kt:483`, `BreathingVerseCard.kt:158`) | | ✓ | ✓ | ✓ | taste³ | **VERIFIED** |
| K | Sacred Word card offers only a back-a-day arrow; no forward, no "Today"; label always says "Today's Sacred Word" (`BreathingVerseCard.kt:108,202`, `HomeScreen.kt:185`) | | ✓ | | ✓ | ✓* | **VERIFIED** — Astra added the always-"Today" label and the missing date refresh |
| L | Strong's `AssistChip(onClick = {})` does nothing (`WordStudySheet.kt:204`) | | ✓ | | | ✓ | **VERIFIED** |
| M | `WordLookupScreen` is a "Coming Soon" stub with a `// TODO` search, route still registered; unreachable from UI | | ✓ | ✓ | | ✓ | **VERIFIED** — Kimi and Astra both correctly declined to rank it as a live dead end |
| N | `navigation/MainDestination.kt` describes a 4-tab app, omits Bible, has **zero references** | | ✓ | ✓ | ✓ | ✓* | **VERIFIED** |
| O | **Eleven** routes registered in both the root NavHost (`MainActivity.kt`) and the tab NavHost (`MainScreen.kt`) | | | ✓ | | ✓*⁴ | **VERIFIED** — Kimi listed 6; the real count is 11 |
| P | Two font-size systems compound: Settings scale × reader 12–28sp A−/A+ | | | ✓ | | ✓⁵ | **VERIFIED** |
| Q | "Go Deeper" dead-ends on one failed Firestore read, no retry, no path to the reader (`VerseStudyScreen.kt:69-75`) | | | ✓ | ✓ | ✓⁵ | **VERIFIED** |
| R | Home study slot scans only teaching books; Aliyah/Foundations progress never recorded (`HomeScreen.kt:69-107`) | | | | ✓ | ✓* | **VERIFIED** |
| S | Home collects profile state and uses none of it (`HomeScreen.kt:53-61`) | | ✓ | | | | **VERIFIED** |
| T | Journey ships placeholder stats "Prayers --" / "Sessions --" (`JourneyScreen.kt:389-390`) | | | ✓ | | | **VERIFIED** |
| U | Dead components: five `ui/components/home/` files with zero references | | | ✓ | | | **VERIFIED** 5/6 |
| V | Brain icon = Study mode in the reader toolbar; font strip shows raw "18sp" (`EnhancedBibleReaderScreen.kt:244,296`) | | | | ✓ | ✓ | **VERIFIED** |
| W | Study-card tool buttons 32dp with 16dp icons, under the 48dp target (`ReadingDisplayComponents.kt:611-666`) | | | | ✓ | | **VERIFIED** |
| X | Compare dialog shows `take(6)` versions but sends `take(4)` to Eliana (`StudyToolsComponents.kt:159,194`) | | | ✓ | | | **VERIFIED** |
| Y | `restoreState = item.route != "journey"` — Journey alone discards its saved stack (`BottomNavigationBar.kt:89`) | | | ✓ | | ✓* | **VERIFIED** |
| Z | Scripture renders twice when a tier is open, verse in `onSurfaceVariant` (`ReadingDisplayComponents.kt:747`) | | | | ✓ | | PARTIAL — colour confirmed; duplication needs a device |
| **AA** | **Verse jumps address the wrong layout.** `scrollToVerse` becomes `animateScrollToItem(verse-1)` (`ReadingDisplayComponents.kt:108-113`), but Reading mode renders the whole chapter as ONE list item (`:160`) and Study mode's item indices include the invite card and contested-verse apparatus (`:180-190`). Search, occurrence chips, and the picker cannot reliably land on a verse; progress reads 0 whenever the list has one item (`:119`) | | | | | ✓ | **VERIFIED** — the highest-consequence reader bug anyone found |
| **AB** | **Word-study sheet body is a plain `Column` with no scroll** (`WordStudySheet.kt:173-180`); full 1,200-char essays plus occurrence chips can fall below the reachable area. `ChainSheet.kt:41` already uses `LazyColumn` | | | | | ✓ | **VERIFIED** |
| **AC** | **Retrieval failure and absent content collapse to `null`** in `FirebaseFirestoreManager.kt:65` and `:397`, so offline reads render as "This study isn't available yet" / silently essay-less | | | | | ✓ | **VERIFIED** — the root cause under row Q |
| **AD** | **Text-size controls do not govern original-language text**: `OriginalHebrewStyle`/`OriginalGreekStyle` are fixed `TextStyle`s from `Type.kt:31,39`, used at `WordStudySheet.kt:84` regardless of reader size | | | | | ✓ | **VERIFIED** — the third leg of row P |
| **AE** | **Crisp Paper's `accentGold` `#B8912E` is used for informative labels** (reference, "✦ Eliana Bible" attribution; `BreathingVerseCard.kt:131,149`) on a white `heroFill` (`FourThemeSystem.kt:448,452`) | | | | | ✓ | **VERIFIED** — conductor recomputed the contrast: **2.95:1**, exactly Astra's figure; below WCAG AA (4.5:1) for small text |
| **AF** | **Selection survives passage changes**: `selectBookAndChapter` (`EnhancedBibleReaderViewModel.kt:195-207`) never clears `_selectedVerses`; Study cards match on verse number alone (`ReadingDisplayComponents.kt:207`), so the new chapter's verse 3 lights up for the old chapter's selection | | | | | ✓ | **VERIFIED** |
| **AG** | **Aliyah opens in different shells by door**: Library → `rootNavController.navigate("aliyah")` (`MainScreen.kt:202`, fullscreen, no bottom bar); Bible-linked studies → tab graph (`:159`) | | | | | ✓ | **VERIFIED** — the user-facing face of row O |

¹ Kimi described the same predicate from the other side: the bar lights "Journey" when you are on Prayer or Library. Both readings are true.
² Fable's version: the swatches omit `background`, so Ivory and Crisp Paper look identical in the picker.
³ Astra classed justification as "a taste call with readability consequences" and asked for a device test rather than asserting a defect. Defensible; the other three call it a defect.
⁴ Astra reached the same fact through its AG finding rather than by counting registrations.
⁵ Not in STATE.md; independent.

**Baseline items the council did not raise** (scope differed — the baseline roamed into Journal and Throne Room): the "armed" chapter→verse toggle in `BiblePickerSheet`, `ThromeRoomScreen.kt` typo, RTL back arrow, Journal's re-randomising quote, top-bar alpha. Still valid; carried on the work order.

---

## 3. Unique catches, by model (all verified)

- **GPT-6 Astra**: AA (verse jumps address the wrong layout), AB (unscrollable word sheet), AC (null collapses failure and absence), AD (originals ignore text size), AE (Crisp Paper gold at 2.95:1 — with the number computed correctly), AF (selection outlives the passage), AG (Aliyah's two shells). Pattern: *tracing a visible promise through state, rendering, persistence and navigation until it breaks; quantifying when it can.* Also the only seat to disclose a blindness compromise unprompted.
- **Fable 5.1**: D (selection never rendered), E (mode not persisted), R (Aliyah progress never reaches Home), V, W, Z. Pattern: *where a callback is never passed, a flag is never persisted, a comment promises what the code doesn't do.*
- **Kimi K3**: O (eleven duplicate routes), P (compounding font scales), T, U, X, Y, plus the stale-docs cluster. Pattern: *cross-file consistency, dead code proven by negative grep, comment archaeology.*
- **Gemini 3.8 Flash**: L (dead Strong's chip), S (dead ViewModel on Home), the sharpest user-story framing of K. Pattern: *fast whole-repo sweep, Compose gesture and state-tree defects, under four minutes.*

## 4. Where they disagree

**The premise ("retention lives in Study-mode depth").** Nobody accepted it whole; nobody rejected it. Gemini: depth is credibility, habit is cadence. Kimi: depth is real but gated behind an unexplained ✦ and a toggle. Fable: depth is why someone chooses the app, but the code doesn't make it default or continuous. Astra: the effect on retention is *unverified*; "dependable return to a meaningful passage matters before additional depth." **Synthesis:** depth is the reason to choose; rhythm, discoverability, and *reliable return to the passage* are the reason to come back. Today the depth hides behind a glyph with no legend, a toggle that forgets itself nightly, and a verse-jump that lands in the wrong place.

**The one big move — four drafts of one idea.**
- Fable: *one reader grammar* — tap selects everywhere, verse action bar (Deeper ✦ · Original א · Note · Compare · Ask · Chain №), Study = same reader with tiers pre-expanded, persist mode and last verse. 3–4 days.
- Kimi: *Ascend lands in the text* — `bible_reader?ref=John 3:16&mode=study` deep link; every Home CTA opens the Bible at the verse; retire `VerseStudyScreen`. 2–3 days.
- Gemini: *the Morning Office* — Home collapses to greeting, one distilled verse, "Pray This" / "Read in Context", study ribbon below the fold. 3.5–4 days.
- Astra: *the passage, not the screen, is the unit of continuity* — a passage target (book, chapter, verse, version, depth), a corrected reference→layout mapping (AA), persisted verse + offset, a recent-activity record, a shared verse-action component; Home shows Today → Read in context / Study this verse / Pray / Journal → Continue. 6–10 days including device testing.

They compose, and Astra's is the load-bearing prerequisite: without AA fixed, Kimi's deep link and Fable's "resume the verse" land on the wrong item. Order: Astra's mapping → Fable's grammar → Kimi's routing → Gemini's Home. Combined 7–10 builder days, no data-layer change.

**Information architecture.** Gemini and the baseline: Prayer and Journal as tabs. Fable: Journey *becomes* the practices tab. Astra: Home = today and recent, Journey = saved reflection and history; the root-vs-tab ownership rule "requires Michael's sign-off, not a rewrite during a polish pass." Kimi declines to choose. Michael's call; the code facts (I, N, O, Y, AG) are settled either way.

## 5. Overclaims caught

- Gemini: re-tapping Journey "pushes another redundant instance" — false; `launchSingleTop = true`.
- Gemini: users "stumble onto Word Lookup from search" — no UI path exists; Kimi and Astra got this right.
- Kimi self-identified as "K2-class" while `kimi-code/k3` was requested; unverifiable from output.
- Fable's Z (double rendering) is plausible from source but unconfirmed without a device.
- Astra: nothing false found. Its cost estimate is self-labelled unverified; its blindness disclosure is accurate.
- All four estimate build cost in days without seeing the build system; treat as relative.

## 6. Recommended work order (verified defects only, ranked by user consequence)

1. **Reference→layout mapping** (AA): key Study items by verse number (including apparatus), address flowing text by measured offset or split into per-paragraph items; derive progress from visible content. Everything below that navigates to a verse depends on this.
2. **Unify reader gesture grammar** (B, C, D, AF): tap = select on every verse including ✦; ✦ glyph gets its own tap range; selection renders in flowing text; selection keyed by full passage identity and cleared on chapter change; verse action bar with Highlight/Note/Compare/Ask/Deeper/Original.
3. **Collapse the two NavHosts** (O, AG, A, Y, N): tab routes only in `MainScreen.kt`; root keeps sign-in/splash/onboarding/settings/teaching_day/fullscreen flows; Journey predicate via route→tab map; one `restoreState` rule; delete `MainDestination.kt`.
4. **Explicit retrieval states** (AC, Q): `Loading / Found / Missing / Failed` from `FirebaseFirestoreManager`; retry and Open-in-Bible on failure; keep local morphology visible while the essay loads.
5. **Persist reader mode + last verse; Home resumes the verse** (E, R): prefs gain `reading_mode` and `last_verse`; record last opened Aliyah/Foundations entry; `ContinueReadingCard` prefers the most recent.
6. **Word-study sheet scrolls** (AB): `LazyColumn` body per `ChainSheet`. Half a day.
7. **Sacred Word card: forward + Today + accurate label + `rememberSaveable`** (K). Half a day.
8. **Theme doctrine finish** (F, G, H, AE): `PremiumTokens` non-null on all six themes; delete the gradient path; opaque fills in `ElianaVerseTiers`, `StudyToolsComponents`, `JourneyScreen`; ThemeCard paints in `theme.colorScheme.background` with `heightIn(min=)`; **split decorative gold from text gold** and give Crisp Paper a ≥4.5:1 label token.
9. **One reader typography config** (P, AD, J, V, W): scripture, originals, transliteration, commentary sizes coordinated with Settings; `TextAlign.Start` on English scripture; Read|Study segmented control and "A A A"; 48dp targets on study tools.
10. **Dead weight**: dead Strong's chip (L); `WordLookupScreen` + route (M); five dead components (U); Journey stats (T); `take(6)`/`take(4)` (X); dead profile collection on Home (S); docs pass (README themes, ARCHITECTURE tabs, `FourThemeSystem` name).
11. **Carried from baseline**: `BiblePickerSheet` armed toggle → breadcrumb; `ThromeRoom` typo; RTL arrow; Journal quote keyed to day.

## 7. Roster guidance — what each seat is for (their own words, checked against performance)

| Seat | Time | Findings | Verified | Best used for | Send elsewhere |
|---|---|---|---|---|---|
| GPT-6 Astra (codex_cli) | 3m35s | 12 | 12/12, 0 overclaims | Deepest single-path tracing (promise → state → render → persist → nav); quantified claims (contrast math was exact); turning findings into bounded implementation contracts; independent regression review | Visual refinement; retention hypotheses |
| Gemini 3.8 Flash (agy) | 3m53s | 12 | 12/12, 2 framing overclaims | Fast whole-repo structural sweeps; Compose gesture/state defects; first pass before a slower model | Devotional prose; theology; taste |
| Fable 5.1 (claude_code) | 6m01s | 12 | 11/12 + 1 partial | Cross-file state tracing; "does the code do what the comment says"; original-language checks against `sources/` | Colour/rhythm taste; user research |
| Kimi K3 swarm (kimi_cli) | 10m40s | 12 (+2) | 14/14 | Cross-file consistency; dead-code proofs; era archaeology; mechanical fix-patches once direction is set | Felt aesthetics; IA decisions; theology |

Michael's question — *how do we use Fable 5.1 and Astra together?* — now has a concrete answer from the data. They are complementary and both belong on every serious review: Fable finds where a wire is never connected (D, E, R); Astra follows a connected wire until it fails (AA, AC, AF). Fable conducts (brief, dispatch, verify, synthesise) and takes a blind seat so its own model is graded; Astra is the seat to trust for "is this actually broken, and how badly" and for the regression pass after a fix. Neither is the seat for taste — that is Michael's wife with the phone in her hand, as three of four models said in nearly the same words.

## 8. Method notes and gaps

- **Astra's blindness was compromised, by the conductor.** Attempt 3 ran after the conductor had committed a STATE.md entry to the app repo summarising the first three seats' headline findings. The prompt allowed STATE.md. Astra read it before the code and disclosed this at the top of its report unprompted. Consequence: Astra's marks on rows A–S count as confirmation, not discovery; rows AA–AG and its P/Q marks are independent (not in STATE.md). Rule for future runs, now in the script header: **remove or scrub STATE.md session-log entries about the study in progress before dispatch**, or forbid STATE.md outright.
- **Astra attempts 1–2**: attempt 1 blocked because Codex's read-only Windows sandbox cannot read clones under `%TEMP%` (`CreateProcessWithLogonW failed: 267`) — fixed, clones live under `C:\New folder\claw-scratch`. Attempt 2 blocked by the OpenAI usage limit (reset earlier than the stated 4:16 AM). Both attempts archived (`astra-attempt1-blocked-temp-path.md`, `astra-attempt2-usage-limit.md`, `astra-attempt2-run.json`).
- **Read-only false positive**: the app repo tracked `session.log`, which MaestroClaw appends to; the script removes it from clones and the app repo now gitignores it. Kimi/Gemini/Fable records were corrected to `clean` after hand verification.
- **Greeting variance**: first line differs per seat; body byte-identical.
- **Screenshots**: all four seats cited `play-store-assets/phone/01-home.png` / `02-bible.png`; Kimi and Astra both noted `01-home.png` predates the 08-25 voice-button removal and is stale.
- **Baseline authorship**: the 09-03 report's author is unrecorded; treated as "before", not as a fifth seat.
