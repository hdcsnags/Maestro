# kimi — kimi_cli (kimi-code/k3) — UX/UI council study

- success: true
- elapsed: 640s
- read-only verification: **UNEXPECTED_WRITE_DETECTED** (new status lines: M session.log)
- clone: C:\Users\Owner\AppData\Local\Temp\ux-council-kimi-Ir5Nte\repo


## Output

I have everything I need — source, screenshots, and docs. Writing the report.

---

Running as **Kimi** (Moonshot AI's Kimi Code CLI / K2-class coding model), dispatched by Fable via MaestroClaw.

No disagreement with the framing. One note on the premise: "retention lives in Study-mode depth" is half-right per the code — the depth is real, but it is gated behind discoverability (a superscript ✦ with no legend) and behind a mode toggle. Retention probably lives in whether *Reading* mode quietly betrays the existence of depth, which today it mostly doesn't. Details below.

# Clinical UX/UI study — Home, Bible reader, themes, navigation

## 1. Executive read (≤200 words)

A careful reviewer would say: this codebase had a genuine design doctrine installed recently (the 2026-08 "opaque fills, one gold family, flat premium ground" settlement) and it shows — Home and the reader's core are coherent, restrained, and unusually well-commented. But the app is two eras stacked, not one. The new doctrine covers Home's cards and the Shekinah/Ivory flagships; the old era survives intact in JourneyScreen (elevated `primaryContainer` cards, fixed-height buttons), the translucent tier card, a shipped "Coming Soon" Word Lookup stub with a live route, ~800 lines of dead components, and docs (README, ARCHITECTURE, MainDestination) that describe an app that no longer exists. Navigation is the weakest surface: routes are registered in two parallel NavHosts, the bottom bar highlights "Journey" for Prayer and Library, and Journey itself is a redundant directory of things the bottom bar and Home already offer. The reader is the best surface and the most cramped: five icon buttons in the top bar, and Reading mode — the default — cannot highlight or annotate a verse at all.

## 2. Ranked findings

**F1 · high · nav · design — Two parallel NavHosts register the same routes.** `MainActivity.kt:109,124,141,207,225,243` registers `eliana`, `stillness`, `teachings`, `throne_room`, `journal`, `bible_reader` in the root graph; `MainScreen.kt:120–242` registers the same routes in the tab graph. Which instance a user gets depends on which controller navigated: Home's grid sends `stillness` to the *root* graph (`HomeScreen.kt:256–258`, fullscreen, `onExit` pops to root) while the bottom tab and Journey (`JourneyScreen.kt:60`) use the *tab* graph (`onExit` navigates to `home`, `MainScreen.kt:127`). Two instances of Stillness with different exit behavior, different bottom-nav visibility, different back stacks. **User experience:** the same destination behaves differently depending on the door they took; back sometimes exits to Home, sometimes pops a root screen. **Fix:** one graph. Keep tab routes exclusively in the tab `NavHost`; root keeps only truly fullscreen flows; delete the duplicate registrations from `MainActivity.kt`.

**F2 · high · reader · design — Reading mode is interaction-poor and its one gesture is ambiguous.** In flowing mode, tapping a ✦ verse toggles its tier expansion; tapping any other verse selects it (`ReadingDisplayComponents.kt:491–496`) — identical gesture, two unrelated outcomes, and nothing on screen explains the ✦. Worse: the selection action bar offers only "Ask Eliana" and Clear (`EnhancedBibleReaderScreen.kt:385–395`). Highlight, note, and compare exist only on Study-mode cards (`ReadingDisplayComponents.kt:606–688`). **User experience:** in the default mode of a Bible app, a reader cannot highlight John 3:16 — the single most habitual Bible-app gesture (YouVersion: tap → highlight). Tapping a verse with a ✦ silently does something else than tapping its neighbor. **Fix:** make tap = select uniformly (✦ verses included); move tier expansion to the ✦ glyph itself (its char range is already tracked in `verseRanges`) or a small per-verse chip; add Highlight/Note to the selection bar — the dialog already exists.

**F3 · high · home · design — Home's hierarchy buries the two retention loops.** Rendered order (`HomeScreen.kt:116–266`, confirmed in `play-store-assets/phone/01-home.png`): wordmark → Continue Reading (one thin row) → Sacred Word card containing verse + "Notice This" + "Why It Matters" + "Carry It With You" → Study Path → Quick Access. The Sacred Word card alone fills more than a full phone viewport; the study path and quick actions are below the fold, and Continue Reading — the daily-reader's loop — is the visually weakest element above it. **User experience:** at 6am the app says "read my three-paragraph essay about Isaiah 40:31" before it says "welcome back to Genesis 1." **Fix:** collapse Sacred Word to verse + one field ("Carry It With You" is the pastoral one) with the rest behind Ascend; promote Continue Reading to a full-width hero above it.

**F4 · medium · nav · design — The bottom bar is not honest, and Journey is asymmetric.** `BottomNavigationBar.kt:40–42` maps `journal*`, `teachings*`, `throne_room*` onto the *Journey* tab highlight — tap Home's "Prayer" tile and the bar lights "Journey," a word on no screen the user saw. And `restoreState = item.route != "journey"` (`BottomNavigationBar.kt:89`) makes Journey the only tab that discards its saved stack when re-selected. **User experience:** the one persistent wayfinding element points at a tab the user isn't on; returning to Journey loses their place in journal history. **Fix:** fold throne_room/teachings/journal under an honest tab structure (see §4), and give `restoreState` one rule for all tabs or a comment justifying the exception.

**F5 · medium · theme/reader · design — Two font-size systems multiply each other.** Settings offers Small/Normal/Large (`SettingsScreen.kt:241–263`) which scales the entire typography ramp (`ElianaTheme.kt:45–77`); the reader independently offers A−/A+ across 12–28sp (`EnhancedBibleReaderViewModel.kt:465–475`) applied on top of `bodyLarge`. A user who sets "Large" and then taps A+ twice is in a compounding state neither control describes. **User experience:** "I set Large and the Bible is still small" / text balloons unpredictably. **Fix:** the reader's control should *be* the setting (write through to the same scale, or scope the global scale out of the reader and say so in Settings).

**F6 · medium · theme · design — The translucent-fill era survives inside the flagship surfaces.** The 2026-08-26 doctrine (authored opaque fills; see `ReadingDisplayComponents.kt:533–538`, `ContinueReadingCard.kt:37–44`) is contradicted by `ElianaVerseTiers.kt:53` (`surfaceVariant.copy(alpha = 0.55f)`), `ElianaChapterInviteCard.kt:167` (0.35), `StudyToolsComponents.kt:164,249` (0.5), and all of `JourneyScreen.kt` (6dp-elevated `primaryContainer`/`secondaryContainer` cards, e.g. `:143–149, :190–193`). **User experience:** the tier card — the app's signature object — composites to a different, muddier fill than the card doctrine it sits inside; Journey looks like a different app from Home. **Fix:** run the same opaque-fill pass over `ui/components/bible/ElianaVerseTiers.kt`, `StudyToolsComponents.kt`, and JourneyScreen that Home already got.

**F7 · medium · nav/reader · bug — A "Coming Soon" stub ships with a live route.** `WordLookupScreen.kt:49` is literally `// TODO: Implement word search` inside a screen that promises Strong's lookup "in a future update" (`:174–181`) — while the *real* Strong's/morphology/word-study feature already ships in `WordStudySheet.kt`. The route stays registered (`MainActivity.kt:246–248`); the UI entry was removed (`JourneyScreen.kt:77–79`). **User experience:** none today (unreachable), but the route is one stray `navigate("word_lookup")` from a dead end, and it misrepresents a shipped capability. **Fix:** delete screen + route, or rebuild it as a search front-end over the existing `WordLookupMap` data.

**F8 · medium · home · design — Ascend can dead-end on an apology.** Home's primary CTA falls back to `verse_study/{reference}` (`HomeScreen.kt:197`) which shows "This study isn't available yet." (`VerseStudyScreen.kt:69–75`) whenever no cached Firestore insight exists — coverage-dependent and network-dependent. **User experience:** the golden path off Home's hero card can terminate in a shrug. **Fix:** route Ascend into the reader's Study mode at that verse (see §4), where *some* depth (originals, morphology, chains) always exists offline.

**F9 · low · nav · design — Journey ships dead stats.** "Prayers --" and "Sessions --" (`JourneyScreen.kt:389–390`) are placeholders next to live counts. A dashboard that admits two of its four dials are disconnected reads unfinished. **Fix:** wire them (prayer history and stillness sessions both have managers) or cut the card to the two live stats.

**F10 · low · home/theme · bug — Dead components from removed eras.** Unreferenced: `QuickAccessGrid.kt`, `ElianaGreetingCard.kt`, `DevotionalCard.kt`, `BreathingElianaButton.kt`, `VoiceCommandDialog.kt` (all of `ui/components/home/`), `VersionSelectionComponents.kt` (205 LOC, cited only by the stale `BibleScreen-architectural-guide.md`), `HomeScreen.kt:272–273` (`encodeURL`), and the orphaned `greeting_preferences` DataStore (`HomeScreen.kt:26–28`). **Fix:** delete; git remembers.

**F11 · low · reader · taste — Justified body text on a phone.** `ReadingDisplayComponents.kt:483`, `BreathingVerseCard.kt:158,265`. `01-home.png` shows the rivers ("Instead  of  pushing  through…"). Scripture set flush-left with generous leading reads more like a printed Bible anyway. **Fix:** `TextAlign.Start`.

**F12 · low · nav/theme · bug — The docs describe a different app.** `MainDestination.kt:10–11` documents "4-tab architecture" (actual: 5) and omits Bible; `ARCHITECTURE.md:108–119` lists Journal and Throne Room as tabs; `README.md:36` names "Daybreak, Heavenly, Nightfall, Midnight" (actual: Sacred/Vesper/Shekinah/Selah/Ivory/Crisp Paper); `STATE.md:34` repeats the retired names. Even the class name `FourThemeSystem` (`FourThemeSystem.kt:9,65`) is false — six themes ship. **Fix:** one doc pass; rename the object when convenient.

Also noted, below the cutoff: `CompareTranslationsDialog` displays `take(6)` versions but sends only `take(4)` to Eliana with no truncation note (`StudyToolsComponents.kt:159,194`); the store screenshot `01-home.png` shows the removed glowing-brain voice button (stale asset).

## 3. Themes verdict

**One language at the token layer, several eras at the component layer.** The engine is genuinely unified: a single `ElianaTheme` (`ElianaTheme.kt:63–83`), one `ElianaThemeConfig` per theme, a disciplined `premium != null` branch pattern (`FourThemeSystem.kt:13–18`), and authored (never alpha-derived) neutrals with contrast annotations. That is a real design language. The seams:

1. **Fill doctrine** — opaque/flat premium Home vs translucent `surfaceVariant @ 0.35–0.55` cards in the tiers, dialogs, and Journey (F6).
2. **Ground doctrine** — `BackgroundWrapper.kt:43–48` paints flat black for premium themes but a `background → primaryContainer` gradient for the other four; two different concepts of "page."
3. **Naming** — "Crisp Paper" sits among Sacred/Vesper/Shekinah/Selah/Ivory in the Settings picker (`SettingsScreen.kt:126–149`): five liturgical names and one print-shop name. The A/B candidate is shipping in the closed test's theme list.
4. **Elevation** — Home premium cards are 0dp + hairline border; Journey runs 4–6dp shadows over colored containers. Different physics.

Verdict: several eras stacked, with a clear winner already identified in-code. The finish work is mechanical, not conceptual.

## 4. The one big move

**Make the reader the single depth surface: "Ascend lands in the text."** Today scripture depth lives in five surfaces — Sacred Word card, `VerseStudyScreen` (Firestore study), `StudyReaderScreen`, the reader's tiers, the word sheet — and Home's CTA routes to a *different screen than the Bible*. The fix unifies Home and Bible into one loop:

- Add a deep-link route `bible_reader?ref=John 3:16&mode=study` — the ViewModel already persists last position and has `selectBookAndChapter(book, chapter, verse)`; add an init-by-reference path plus seeding `expandedTierVerses` and scrolling to the verse (`EnhancedBibleReaderScreen.kt:483` already supports `scrollToVerse`).
- Home's **Ascend/Go Deeper** navigates there instead of `verse_study/…` (replaces `HomeScreen.kt:186–203`); `VerseStudyScreen` becomes a redirect or dies. Continue Reading already lands in the reader — now everything does.
- In Reading mode, adopt F2's tap doctrine so a user who arrives mid-flow can immediately highlight.

What the user feels: every door that mentions a verse opens *the Bible at that verse*, with the gold thread already glowing — Home and Bible stop being two apps. Build cost: route + VM init (~1 day), tap-resolution change in `FlowingVerseRun` (~½ day, `verseRanges` already exist), selection-bar buttons reuse existing dialogs (~½ day), VerseStudyScreen retirement (~1 hour). Call it 2–3 days. The "full Deeper Lens study" that VerseStudyScreen renders can later attach as a bottom tier of the same verse card, preserving the content investment.

## 5. What I could not verify from source alone

- Whether Home's `ContinueReadingCard` ever shows a stale position: the prefs read at `HomeScreen.kt:64–66` re-executes only on recomposition, and whether returning from the reader tab triggers one depends on NavBackStackEntry lifecycle at runtime.
- Real `votd_calendar.json` density: how many days have `chainNumber`/`eliana` links determines how often Ascend/Reflect even appear or dead-end (F8's blast radius).
- `getCachedInsight` hit-rate and offline behavior for `VerseStudyScreen` — Firestore latency/failure on device.
- Performance of the per-chapter justified `AnnotatedString` with tap mapping on low-end devices, and TalkBack behavior of the flowing-text tap target.
- Immersive-mode exit discoverability (pill-only, `EnhancedBibleReaderScreen.kt:532–555`) — needs a human in hand.
- Screenshot currency: `01-home.png` predates the 2026-08-25 voice-button removal.

## 6. Where my model should be used here

I'm strongest as the **cross-file consistency auditor**: 6,500 lines across 40 files read against each other, dead code proven by negative grep, every claim pinned to file:line, era-seams surfaced from comment archaeology. That's cheap, fast, and reliable for me. Also good: generating the mechanical fix-patches for F1/F6/F10/F12 once Michael approves direction. Send elsewhere: felt aesthetic judgment (needs the app in hand, and honestly Michael's wife), theological adjudication of the study content itself, and any final call on information architecture — I can map the overlap, but choosing what Journey *means* is a product decision, not a code reading.

BEGIN FINDINGS
[
  {"id":"F1","severity":"high","area":"nav","kind":"design","file":"MainActivity.kt","line":124,"claim":"stillness/eliana/teachings/throne_room/journal/bible_reader are registered in both the root and tab NavHosts, so the same screen behaves differently depending on entry path.","fix":"Keep tab routes exclusively in MainScreen's tab NavHost and delete the duplicate registrations from MainActivity's root graph."},
  {"id":"F2","severity":"high","area":"reader","kind":"design","file":"app/src/main/java/com/eliana/rhythm/ui/components/bible/ReadingDisplayComponents.kt","line":492,"claim":"In Reading mode, tap toggles tiers on ✦ verses but selects all other verses, and the selection bar offers no highlight/note/compare — the default mode cannot annotate scripture.","fix":"Make tap=select uniform, move tier expansion to the ✦ glyph range, and add Highlight/Note (existing dialog) to the selection action bar."},
  {"id":"F3","severity":"high","area":"home","kind":"design","file":"app/src/main/java/com/eliana/rhythm/HomeScreen.kt","line":182,"claim":"The Sacred Word card (verse + 3 essay fields) fills a full viewport, pushing Continue Reading, study path, and quick access below the fold or into visual subordination.","fix":"Collapse Sacred Word to verse + one field with the rest behind Ascend, and promote Continue Reading to a full-width hero above it."},
  {"id":"F4","severity":"medium","area":"nav","kind":"design","file":"app/src/main/java/com/eliana/rhythm/BottomNavigationBar.kt","line":40,"claim":"The bottom bar highlights 'Journey' for journal/teachings/throne_room routes and uniquely disables restoreState for Journey, so the wayfinding lies and Journey loses its stack.","fix":"Map routes to tabs the user actually navigated from and apply one restoreState rule to all tabs."},
  {"id":"F5","severity":"medium","area":"theme","kind":"design","file":"app/src/main/java/com/eliana/rhythm/ui/screens/SettingsScreen.kt","line":241,"claim":"Settings' Small/Normal/Large typography scale compounds with the reader's independent 12–28sp A−/A+ control, so font size behaves unpredictably.","fix":"Unify on one font-size store — the reader control should write through to the same setting."},
  {"id":"F6","severity":"medium","area":"theme","kind":"design","file":"app/src/main/java/com/eliana/rhythm/ui/components/bible/ElianaVerseTiers.kt","line":53,"claim":"The signature tier card, invite card, dialogs, and all of JourneyScreen still use translucent fills and elevated colored containers that the 2026-08 opaque/flat doctrine banned on Home.","fix":"Apply the opaque-fill, zero-elevation doctrine to ElianaVerseTiers, StudyToolsComponents, and JourneyScreen."},
  {"id":"F7","severity":"medium","area":"nav","kind":"bug","file":"app/src/main/java/com/eliana/rhythm/ui/screens/WordLookupScreen.kt","line":49,"claim":"A 'Coming Soon' word-lookup stub with a TODO ships with a live registered route while the real Strong's/word-study feature exists in WordStudySheet.","fix":"Delete the stub screen and route, or rebuild it as a search UI over the existing WordLookupMap data."},
  {"id":"F8","severity":"medium","area":"home","kind":"design","file":"app/src/main/java/com/eliana/rhythm/ui/screens/VerseStudyScreen.kt","line":72,"claim":"Home's primary Ascend CTA can land on 'This study isn't available yet' when no cached Firestore insight exists for the verse.","fix":"Route Ascend into the reader's Study mode at that verse, where offline depth (originals, morphology, chains) always exists."},
  {"id":"F9","severity":"low","area":"nav","kind":"design","file":"app/src/main/java/com/eliana/rhythm/ui/screens/JourneyScreen.kt","line":389,"claim":"Journey's progress card ships two placeholder stats ('Prayers --', 'Sessions --') next to live ones.","fix":"Wire prayers/sessions counts from their managers or remove the dead stats."},
  {"id":"F10","severity":"low","area":"home","kind":"bug","file":"app/src/main/java/com/eliana/rhythm/ui/components/home/QuickAccessGrid.kt","line":14,"claim":"~800 LOC of unreferenced components (QuickAccessGrid, ElianaGreetingCard, DevotionalCard, BreathingElianaButton, VoiceCommandDialog, VersionSelectionComponents) remain from removed eras.","fix":"Delete the dead files; git history preserves them."},
  {"id":"F11","severity":"low","area":"reader","kind":"taste","file":"app/src/main/java/com/eliana/rhythm/ui/components/bible/ReadingDisplayComponents.kt","line":483,"claim":"Justified body text produces visible word-spacing rivers on phone-width columns (visible in 01-home.png).","fix":"Use TextAlign.Start for verse and card body text."},
  {"id":"F12","severity":"low","area":"nav","kind":"bug","file":"app/src/main/java/com/eliana/rhythm/navigation/MainDestination.kt","line":10,"claim":"MainDestination, ARCHITECTURE.md, README.md, and STATE.md describe a retired 4-tab/4-theme app; even the name FourThemeSystem is false (six themes ship).","fix":"One documentation pass over the four files; rename the theme object when convenient."}
]
END FINDINGS