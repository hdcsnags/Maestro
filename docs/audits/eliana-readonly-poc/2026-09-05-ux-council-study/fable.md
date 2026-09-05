# fable — claude_code (claude-fable-5-1) — UX/UI council study

- success: true
- elapsed: 361s
- read-only verification: **UNEXPECTED_WRITE_DETECTED** (new status lines: M session.log)
- clone: C:\Users\Owner\AppData\Local\Temp\ux-council-fable-qbrpi0\repo


## Output

Claude Fable 5.1 (claude-fable-5-1).

## 1. Executive read

The reader's data layer is the strongest thing in this codebase, and the UI mostly gets out of its way. The seamless-page work, the tier cards, the contested-verse apparatus, and the word sheet are coherent and honest. Two things undercut the felt quality. First, the reader has two gesture grammars: in Reading mode a tap on a ✦ verse opens depth, a tap on any other verse selects it invisibly, and annotation does not exist; in Study mode a tap selects and depth is always open. A reader who lives in the app daily will feel that seam every session, and Study mode forgets itself on every cold start. Second, the information architecture has two launchers (Home Quick Access and Journey) pointing at the same five destinations, while the bottom bar's Journey tab never lights up on its own screen. The theme system is one language on the two flagship themes and a different, older language on the three remaining dark themes and on every screen that never learned about premium tokens. On the premise: Study depth is why someone would choose this app, but the code does not yet make depth the default or continuous, and the return loop lives on Home, which currently resumes a chapter, not a verse.

## 2. Ranked findings

**F1 · high · nav · bug · `app/src/main/java/com/eliana/rhythm/BottomNavigationBar.kt:40`**
The Journey tab's selection test matches routes starting with `journal`, `teachings`, or `throne_room` but never the route `journey` itself. Standing on the Journey screen, no tab is highlighted. Verified by reading only, not run. Fix: add `currentRoute == "journey"` to the match, and consider a route-to-tab map instead of prefix tests.

**F2 · high · reader · design · `ui/components/bible/ReadingDisplayComponents.kt:492`**
In Reading mode, tapping a verse with an Eliana tier toggles the tier; tapping any other verse selects it. Annotation is not offered in Reading mode at all, since the flowing text never receives the annotate callback. As Eliana coverage grows, tap-to-select disappears from Reading mode verse by verse. The user experiences a reader whose tap means different things on adjacent verses and cannot highlight a translated verse without switching modes. Fix: one gesture grammar in both modes. Tap selects and shows a verse action bar with Deeper, Original, Note, Compare, Ask Eliana, and any Chain doorway. The ✦ glyph, given its own clickable span, opens the tier.

**F3 · high · reader · bug · `ui/components/bible/ReadingDisplayComponents.kt:382`**
The flowing text builder receives annotations but not the selected-verse set, so a Reading-mode selection changes nothing on the page. The action bar says one verse is selected while the text looks untouched. Fix: pass `selectedVerses` into the run builder and apply a `primaryContainer` background span to selected ranges.

**F4 · high · home · design · `ui/components/home/BreathingVerseCard.kt:202`**
The card offers only a back arrow. Once a reader steps to yesterday they cannot return to today without leaving Home, and nothing on the card says which day is showing. The state is plain `remember`, so a rotation or process death silently jumps back to today. Fix: add a forward button that hides at today, a small "Today" or "2 days ago" label under the reference, and hold the index in `rememberSaveable`.

**F5 · medium · reader · design · `viewmodel/EnhancedBibleReaderViewModel.kt:71`**
Reading mode is in-memory state while font size and version are persisted. Every cold start opens in Reading mode. If your wife is right that Study depth drives retention, the daily reader re-toggles into Study every morning. Fix: persist the mode in the same `bible_reader` prefs, and while there persist the first visible verse so Home can resume to it.

**F6 · medium · reader · design · `ui/components/bible/ReadingDisplayComponents.kt:747`**
Scripture is rendered twice within a screen height. In Study mode with the Eliana version, the verse text prints in `onSurfaceVariant` (the secondary text colour), then the tier card repeats the same rendering in `onSurface`. Reading mode with a tier open shows the same duplication, visible in the 02-bible screenshot. The copy is brighter than the scripture. Fix: when a tier exists and the active version is ELIANA, drop tier 3 or drop the card's own text line, and render scripture in `onSurface` everywhere.

**F7 · medium · nav · design · `ui/screens/JourneyScreen.kt:64`**
Journey lists Bible, Library, Stillness, Journal, Prayer, Ask Eliana, history, and search. Bible, Stillness, and Eliana are already bottom tabs. Bible, Library, Prayer, and Journal are already Home's Quick Access grid. Journey is a second Home, and Prayer and Journal, the daily practices, have two parents and no address of their own. `navigation/MainDestination.kt` is unreferenced and describes a four-tab layout the app no longer has, which suggests the architecture drifted rather than being decided. Fix: make the third tab the practices tab. Keep Journal, Prayer, history, search, and progress. Remove Bible, Library, Stillness, and Eliana from it. Then cut Home's Quick Access to Prayer and Journal or remove it, and delete `MainDestination.kt`.

**F8 · medium · theme · design · `ui/components/BackgroundWrapper.kt:43`**
Two rendering eras coexist behind `premium != null`. Shekinah, Ivory, and Crisp Paper get a flat ground, opaque fills, and zero elevation. Sacred, Vesper, and Selah still get a background-to-primaryContainer gradient, translucent `surfaceVariant.copy(alpha = 0.7f)` cards, and 2dp to 8dp shadows, which is exactly the bleed the premium themes were fixed to avoid. Journey, Settings, and WordLookup never branch on premium at all, so even on Shekinah they paint 6dp-elevated `primaryContainer` cards. Fix: make `PremiumTokens` non-null on every theme, delete the gradient path, and remove every `premium?.x ?: legacy` branch so components have one code path.

**F9 · medium · home · design · `HomeScreen.kt:69`**
The Study path slot scans only the teaching books from `BookRepository`. Aliyah and Foundations entries have no progress record anywhere I could find, so the flagship study library never appears as "continue" on Home. A reader who spent twenty minutes in Chain 4 last night opens the app to a card inviting them to browse. Fix: record the last opened study entry and scroll position in the study reader, and have the slot prefer the most recent of the two sources.

**F10 · medium · home · design · `ui/screens/VerseStudyScreen.kt:69`**
"Go Deeper" from Home depends on one Firestore read. Any failure, including being offline at 6am, shows "This study isn't available yet" with no retry and no way to open the verse in the reader. Loading and failure are also indistinguishable until the call returns. Fix: always show an "Open in Bible" action in the header, add retry on failure, and fall back to the reader with the verse targeted.

**F11 · low · theme · design · `ui/screens/SettingsScreen.kt:776`**
Theme cards preview `primary`, `primaryContainer`, and `secondary` swatches inside a card painted in the current theme's surface. Background, which is each theme's identity, is not shown, so Ivory and Crisp Paper look identical and Shekinah's black is invisible. The tagline map at line 812 duplicates knowledge that belongs on the theme config. Fix: paint each card in `theme.colorScheme.background`, set a short verse line in `onBackground` with the theme's gold hairline, and move taglines into `ElianaThemeConfig`.

**F12 · low · reader · taste · `ui/screens/EnhancedBibleReaderScreen.kt:244`**
The brain icon means Eliana in the bottom bar, in Ask Eliana, and in the study tools, but in the reader toolbar it means Study mode. The font strip labels size as "18sp", a developer unit. Fix: a two-segment "Read | Study" control replaces the icon toggle, and the size strip shows the letter A at three sizes.

## 3. Themes verdict

Several eras stacked, with a clear plan visible for collapsing them. The seams:

- **Premium versus legacy.** `FourThemeSystem.kt:26` defines a considered token set with authored fills, hairline borders, etched titles, and a body neutral off the gold family. Only three of six themes carry it. Sacred, Vesper, and Selah fall through to alpha-derived fills and elevation, the very thing the token comments call mud.
- **Ground.** `BackgroundWrapper.kt:50` still paints a gradient for legacy themes and its docstring describes peach-to-rose and deep-violet themes that no longer exist.
- **Screens that never learned.** `JourneyScreen.kt:143` uses `primaryContainer` at 6dp; `WordLookupScreen.kt:70` uses `primaryContainer` at 8dp; `SettingsScreen.kt` theme cards at 4dp to 8dp. On Shekinah `surfaceTint == surface` neutralises the tonal wash but the shadows still argue with the border-only depth doctrine.
- **Typography.** `Type.kt` gives scripture a serif family and correct Hebrew leading; the rest of the app is the default sans. That contrast is defensible as design. Justified text on a phone column (`BreathingVerseCard.kt:158`, `ReadingDisplayComponents.kt:483`) is not; the 01-home screenshot shows word rivers in the verse box.
- **Ivory and Crisp Paper** share architecture and differ by warmth, as the code comments already admit. That is an A/B, not two themes, and the picker (F11) cannot show the difference.

What holds together: gold reserved for `primary`, silver or ink for content, the ✦ attribution mark, the №n chain glyph, and the seamless page. Those are the design language. The rest is pre-language.

## 4. The one big move

**One reader grammar, and Home resumes the verse.**

What it looks like: the reader keeps a persisted Read | Study control, but both modes share one interaction model. Tap a verse and it highlights in `primaryContainer` and a verse action bar rises from the bottom with Deeper ✦, Original א, Note, Compare, Ask Eliana, and Chain №n when present. Deeper expands the existing `ElianaVerseTiers` in place; Original expands the existing `OriginalWordsFlow` in place. Study mode is the same reader with every tier pre-expanded. Home's Continue reading card reads "Genesis 1:14 · last night" and opens the reader at that verse.

What it replaces: the tap dispatcher at `ReadingDisplayComponents.kt:485` to 498, the selection bar at `EnhancedBibleReaderScreen.kt:367` to 399, the per-card tool row at `ReadingDisplayComponents.kt:607` to 688 (its 16dp icons in 32dp buttons are also under the 48dp touch target), and the in-memory mode flag.

Build steps:

1. Persist `reading_mode` and `last_verse` in the ViewModel prefs; write `last_verse` from `listState.firstVisibleItemIndex` in `BibleReadingDisplay`.
2. Pass `selectedVerses` into `FlowingVerseRun` and add a background span for selected ranges. Give the ✦ span its own tap target via string annotations.
3. Build `VerseActionBar` as a `Surface` anchored above the bottom nav, driven by the current selection and the existing callbacks.
4. Remove the tool row from `StudyModeVerseCard`; keep the number and chain glyph.
5. Home: `ContinueReadingCard` takes verse and a relative timestamp; its click navigates and sets the target verse through `selectBookAndChapter(book, chapter, verse)`, which already exists.

Rough cost: three to four builder days including manual testing on both flagship themes. No data-layer change.

## 5. What I could not verify from source alone

- Whether the Journey tab highlight bug reproduces on device; I confirmed it by reading the predicate, not by running the app.
- Gesture conflict between the consumed horizontal drag at `ReadingDisplayComponents.kt:136` and text taps or system back gestures.
- Layout jump when Eliana entries arrive after the chapter text and ✦ glyphs are inserted into an already-laid-out paragraph (`EnhancedBibleReaderViewModel.kt:246`).
- Real Hebrew rendering: whether 44sp leading clips cantillation on Samsung's font stack, and how RTL word flow wraps on narrow phones.
- Firestore latency and offline behaviour for tiers, word studies, and the Deeper Lens.
- How the 72-entry verse calendar feels once it repeats, and content density on days without Ascend or Reflect.
- TalkBack order on the flowing text, where verse numbers, ✦, and text are one node.
- Actual colour perception of Ivory versus Crisp Paper and of Shekinah's `#0E0E0E` fills on a real OLED.

## 6. Where my model fits

Use me for cross-file state tracing and honesty audits like this one: finding where a callback is never passed, where a flag is not persisted, where a comment claims something the code does not do. Use me for Hebrew and Greek content checks against the corpus, which this repo already does. Do not use me for taste verdicts on colour or rhythm; those need a person holding the phone. Do not use me for user research or to confirm that a fix feels right; send those to your testers and to analytics, which Firebase already provides and Home does not yet instrument.

## 7. Machine-readable block

BEGIN FINDINGS
[
{"id":"F1","severity":"high","area":"nav","kind":"bug","file":"app/src/main/java/com/eliana/rhythm/BottomNavigationBar.kt","line":40,"claim":"The Journey tab's selection predicate never matches the route \"journey\", so no tab is highlighted while on the Journey screen.","fix":"Add currentRoute == \"journey\" to the match or replace prefix tests with a route-to-tab map."},
{"id":"F2","severity":"high","area":"reader","kind":"design","file":"app/src/main/java/com/eliana/rhythm/ui/components/bible/ReadingDisplayComponents.kt","line":492,"claim":"In Reading mode a tap on a tiered verse opens depth while a tap elsewhere selects, and annotation is unavailable, so the gesture grammar differs verse to verse.","fix":"Unify on tap-to-select with a verse action bar and give the ✦ glyph its own tap target for depth."},
{"id":"F3","severity":"high","area":"reader","kind":"bug","file":"app/src/main/java/com/eliana/rhythm/ui/components/bible/ReadingDisplayComponents.kt","line":382,"claim":"Reading-mode selection is never rendered because the flowing text builder does not receive the selected-verse set.","fix":"Pass selectedVerses into FlowingVerseRun and apply a primaryContainer background span to selected ranges."},
{"id":"F4","severity":"high","area":"home","kind":"design","file":"app/src/main/java/com/eliana/rhythm/ui/components/home/BreathingVerseCard.kt","line":202,"claim":"The verse card offers only a back-a-day button with no return to today and no indication of which day is shown.","fix":"Add a forward button hidden at today, a relative-day label, and hold dayIndex in rememberSaveable."},
{"id":"F5","severity":"medium","area":"reader","kind":"design","file":"app/src/main/java/com/eliana/rhythm/viewmodel/EnhancedBibleReaderViewModel.kt","line":71,"claim":"Reading versus Study mode is in-memory only, so every cold start opens in Reading mode.","fix":"Persist the mode and the first visible verse in the bible_reader SharedPreferences alongside font size."},
{"id":"F6","severity":"medium","area":"reader","kind":"design","file":"app/src/main/java/com/eliana/rhythm/ui/components/bible/ReadingDisplayComponents.kt","line":747,"claim":"Scripture renders twice per verse when a tier is open, with the verse in secondary colour and its copy in primary text colour.","fix":"Suppress the duplicate line when the active version is ELIANA and render scripture in onSurface."},
{"id":"F7","severity":"medium","area":"nav","kind":"design","file":"app/src/main/java/com/eliana/rhythm/ui/screens/JourneyScreen.kt","line":64,"claim":"Journey duplicates the bottom bar and Home Quick Access, leaving Prayer and Journal with two parents and no home.","fix":"Make the third tab the practices tab with Journal, Prayer, history, and progress, and trim Home Quick Access."},
{"id":"F8","severity":"medium","area":"theme","kind":"design","file":"app/src/main/java/com/eliana/rhythm/ui/components/BackgroundWrapper.kt","line":43,"claim":"Premium and legacy rendering paths coexist, so three dark themes and several screens still use gradients, translucent fills, and shadows the flagship doctrine rejects.","fix":"Give every theme PremiumTokens, delete the gradient path, and remove premium-null branches."},
{"id":"F9","severity":"medium","area":"home","kind":"design","file":"app/src/main/java/com/eliana/rhythm/HomeScreen.kt","line":69,"claim":"The Home study slot tracks only teaching books, and Aliyah or Foundations progress is never recorded, so the flagship studies never surface as continue.","fix":"Record last opened study entry in the study reader and prefer the most recent source in the slot."},
{"id":"F10","severity":"medium","area":"home","kind":"design","file":"app/src/main/java/com/eliana/rhythm/ui/screens/VerseStudyScreen.kt","line":69,"claim":"Go Deeper depends on one Firestore read and fails to a dead end with no retry and no path to the reader.","fix":"Add an Open in Bible header action, a retry, and a reader fallback with the verse targeted."},
{"id":"F11","severity":"low","area":"theme","kind":"design","file":"app/src/main/java/com/eliana/rhythm/ui/screens/SettingsScreen.kt","line":776,"claim":"Theme cards preview accent swatches inside the current theme's surface and omit background, so themes look alike.","fix":"Paint each card in its own background with a sample verse line and move taglines into ElianaThemeConfig."},
{"id":"F12","severity":"low","area":"reader","kind":"taste","file":"app/src/main/java/com/eliana/rhythm/ui/screens/EnhancedBibleReaderScreen.kt","line":244,"claim":"The brain icon means Eliana everywhere else but Study mode in the reader toolbar, and the font strip exposes sp units.","fix":"Use a Read | Study segmented control and show three letter sizes instead of sp values."}
]
END FINDINGS
