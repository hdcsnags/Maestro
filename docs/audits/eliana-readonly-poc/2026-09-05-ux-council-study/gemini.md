# gemini — agy_cli (gemini-3.8-flash-high) — UX/UI council study

- success: true
- elapsed: 233s
- read-only verification: **UNEXPECTED_WRITE_DETECTED** (new status lines: M session.log)
- clone: C:\Users\Owner\AppData\Local\Temp\ux-council-gemini-BFaWzE\repo


## Output

Running as Gemini 3.8 Flash.

### Framing Assessment & Premise Check
Your wife's premise—*"retention lives in Study-mode depth"*—is half-true, and the missing half is where consumer mobile apps succeed or die. 

Study depth is the **anchor of credibility**: it gives the app intellectual integrity, distinguishes it from lightweight daily-quote widgets, and justifies long-term commitment from serious students. However, **retention on a daily mobile device lives in emotional friction and liturgical cadence, not analytic workload.** A believer opening an app at 6:00 AM while half-awake does not possess the cognitive bandwidth to parse Hebrew verbal stems, compare three analytical exegesis blocks, or navigate a multi-tiered curriculum. If an app greets a tired soul with heavy cognitive labor, they will reserve the app for "deep study days" (which happen once a week or once a month) and open something lighter tomorrow morning. 

Study depth provides the *trust and gravity*; daily rhythm and accessible prayer provide the *habit*.

---

### 1. Executive Read
*Eliana's Rhythm* is an extraordinary work of devotional scholarship trapped in an unresolved architectural transition. The data layer, canonical calibration, and original-language apparatus (notably the A-carve contested verses in [`ContestedVerseCard.kt`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/components/bible/ContestedVerseCard.kt#L41-L111) and precomputed Strong's mappings) exhibit world-class care and rigor. 

Yet the user-facing interface bears the scars of three competing eras:
1. **The opening experience is over-intellectualized**: Home reads like an editorial syllabus rather than a morning sanctuary.
2. **The Bible reader suffers from gesture collisions and typography errors**: Flowing mode locks out verse selection on translated verses, while forced full-justification creates gaping rivers across scripture text.
3. **Information architecture is disjointed**: The bottom navigation bar lies about route states (leaving the Journey tab unselected when visited), duplicates the Home screen's directory, and exiles core daily practices like Prayer and Journaling into sub-screens while elevating guided meditation and AI chat to permanent top-level tabs.
4. **The theme system is bifurcated**: An elite, bespoke token architecture for Shekinah and Ivory sits atop legacy Material 3 gradient/scrim scaffolding.

Polishing these seams will transform the app from a brilliant developer prototype into a serene, indispensable companion.

---

### 2. Ranked Findings

#### F1 · High · Reader · Bug · [`ReadingDisplayComponents.kt:492`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/components/bible/ReadingDisplayComponents.kt#L492-L497)
- **What's wrong**: In [`FlowingVerseRun`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/components/bible/ReadingDisplayComponents.kt#L370-L500), tap detection executes:
  ```kotlin
  if (elianaEntries.containsKey(tapped.verse)) {
      onToggleTier(tapped.verse)
  } else {
      onVerseClick(tapped)
  }
  ```
  There is no long-press gesture recognizer in `FlowingVerseRun`.
- **What user experiences**: In Flowing reading mode, tapping anywhere on a verse with an Eliana translation *only* toggles the tier expansion. The user cannot select the verse, cannot access the Selection Action Bar, cannot copy, cannot annotate, and cannot trigger "Ask Eliana" or "Compare Translations" on any verse that has an Eliana rendering. Only un-translated fallback verses can be selected.
- **Concrete fix**: In `FlowingVerseRun`, attach an `onLongPress` callback to `detectTapGestures` that routes to `onVerseClick(tapped)` (or dedicate the ✦ superscript glyph to tier expansion while letting taps on the text body select the verse).

#### F2 · High · Nav · Bug · [`BottomNavigationBar.kt:40`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/BottomNavigationBar.kt#L40-L42)
- **What's wrong**: `isTabSelected` defines the `"journey"` tab selection as:
  ```kotlin
  "journey" -> currentRoute?.startsWith("journal") ?: false ||
               currentRoute?.startsWith("teachings") ?: false ||
               currentRoute?.startsWith("throne_room") ?: false
  ```
  It does **not** check `currentRoute == "journey"`.
- **What user experiences**: When the user taps "Journey" in the bottom bar, the navigation transitions to [`JourneyScreen`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/screens/JourneyScreen.kt#L27), but the Journey tab does not highlight. No tab is selected. Tapping "Journey" a second time does not re-select; because `!isTabSelected("journey", currentRoute)` evaluates to `true`, it pushes another redundant instance of `JourneyScreen` onto the backstack. Conversely, navigating to Prayer or Journal from Home unexpectedly highlights the "Journey" tab.
- **Concrete fix**: Add `currentRoute == "journey"` to the `"journey"` match clause in `isTabSelected`.

#### F3 · High · Home · Bug · [`BreathingVerseCard.kt:202`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/components/home/BreathingVerseCard.kt#L202-L213) & [`HomeScreen.kt:185`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/HomeScreen.kt#L185)
- **What's wrong**: `BreathingVerseCard` renders an `OutlinedIconButton` with `Icons.AutoMirrored.Filled.ArrowBack` ("Yesterday's sacred word"), invoking `dayIndex -= 1`. There is no corresponding forward arrow or "Return to Today" button.
- **What user experiences**: A curious user taps the back arrow to see yesterday's verse. The card steps back in the 72-day calendar. The user is now permanently stranded in the past; they cannot return to today's verse without restarting the app or manually tapping the back arrow 71 more times to wrap around the modulo array.
- **Concrete fix**: Pair the back arrow with a forward arrow (`dayIndex += 1`), disabled when `dayIndex == today`, or show a "Today" pill chip whenever `dayIndex != today`.

#### F4 · High · Nav · Design · [`BottomNavigationBar.kt:23`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/BottomNavigationBar.kt#L23-L29) & [`JourneyScreen.kt:58-102`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/screens/JourneyScreen.kt#L58-L102)
- **What's wrong**: Architecture duplication and missing primary functions. Home provides shortcuts to Bible, Library, Prayer, and Journal. Journey reproduces almost the exact same directory: Sacred Stillness, Bible, Library, Journal, Prayer, Ask Eliana. Meanwhile, Prayer and Journal have no dedicated bottom nav presence.
- **What user experiences**: Navigation disorientation. Users wonder why there are two separate dashboard screens (`Home` and `Journey`) that both route to the same sub-features, while the primary spiritual practices they perform daily (talking to God in Prayer, writing reflections in Journal) are tucked away in secondary sub-routes. Meanwhile, `Eliana` (AI chat) and `Stillness` occupy permanent bottom real estate.
- **Concrete fix**: Eliminate `JourneyScreen` as an autonomous tab. Reallocate the 5 tabs to reflect true daily Christian spiritual practice: `Home` (Sanctuary/Rhythm), `Bible`, `Prayer`, `Journal`, and `Stillness` (or `Eliana`).

#### F5 · Medium · Reader · Design · [`ReadingDisplayComponents.kt:483`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/components/bible/ReadingDisplayComponents.kt#L483) & [`BreathingVerseCard.kt:158`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/components/home/BreathingVerseCard.kt#L158)
- **What's wrong**: Full text justification is hardcoded:
  `textAlign = if (hasHebrew) TextAlign.Start else TextAlign.Justify`.
- **What user experiences**: Visible typographical ugliness (demonstrated clearly in `play-store-assets/phone/02-bible.png`). Genesis 1:1 renders as: `"1 ✦ In   the   beginning   God   created   the   heavens and the earth."` On mobile line widths, without hyphenation dictionaries, justifying short biblical clauses creates enormous, uneven whitespace rivers that look like typesetting glitches.
- **Concrete fix**: Set `textAlign = TextAlign.Start` for English text across [`FlowingVerseRun`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/components/bible/ReadingDisplayComponents.kt#L483) and [`BreathingVerseCard`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/components/home/BreathingVerseCard.kt#L158).

#### F6 · Medium · Theme · Design · [`BackgroundWrapper.kt:43-48`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/components/BackgroundWrapper.kt#L43-L48)
- **What's wrong**: `BackgroundWrapper` checks `if (selectedTheme.premium != null)`: if true (Shekinah, Ivory, Crisp Paper), it renders flat `MaterialTheme.colorScheme.background`. If null (Sacred, Vesper, Selah), it renders an old-school gradient from `background` to `primaryContainer` plus an alpha scrim box at `zIndex(1f)` with content at `zIndex(2f)`.
- **What user experiences**: Inconsistent visual physics. On Shekinah or Ivory, the app feels modern, flat, and grounded. On Sacred, Vesper, or Selah, the screen has an artificial vertical gradient wash that clashes with card fills and creates noticeable z-ordering overdraw.
- **Concrete fix**: Standardize `BackgroundWrapper` across all themes to render a clean solid background. Retire the legacy gradient and scrim layers completely.

#### F7 · Medium · Theme · Bug · [`SettingsScreen.kt:752-756`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/screens/SettingsScreen.kt#L752-L756)
- **What's wrong**: In `ThemeCard`, the container color is determined by the *active* theme, not the *card's* theme:
  ```kotlin
  containerColor = if (isSelected) {
      MaterialTheme.colorScheme.primaryContainer
  } else {
      MaterialTheme.colorScheme.surface
  }
  ```
- **What user experiences**: When a user is in dark mode (e.g. Shekinah) and scrolls through the "Light Themes" row in Settings, the cards for Ivory and Crisp Paper are painted jet black with white text. The user cannot see what Ivory or Crisp Paper actually looks like before activating them.
- **Concrete fix**: Bind the `ThemeCard` container and text colors to the target theme's own color scheme: `containerColor = if (isSelected) theme.colorScheme.primaryContainer else theme.colorScheme.surface`, with content tinted by `theme.colorScheme.onSurface`.

#### F8 · Medium · Reader · Design · [`WordStudySheet.kt:204`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/components/bible/WordStudySheet.kt#L204) & [`WordLookupScreen.kt:56`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/screens/WordLookupScreen.kt#L56)
- **What's wrong**: In `WordDetailBottomSheet`, the Strong's tag is an interactive `AssistChip(onClick = {}, label = { Text("Strong's ${word.strongs}") })` with an empty lambda. Meanwhile, [`WordLookupScreen.kt`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/screens/WordLookupScreen.kt) is an abandoned stub displaying an `Icons.Default.Construction` "Coming Soon" card with an empty search action (`onSearch = { /* TODO */ }`).
- **What user experiences**: A reader taps a Greek/Hebrew word, sees a button labeled "Strong's 2424", taps it, and nothing happens. If they stumble onto Word Lookup from search, they hit a hard construction barrier, despite the 22,694 word studies being fully audited and indexed in assets.
- **Concrete fix**: Wire the Strong's chip to filter occurrences by Strong's number, and either connect `WordLookupScreen` to query `WordLookupMap` or remove the dead route until closed testing is finished.

#### F9 · Low · Home · Design · [`HomeScreen.kt:53-61`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/HomeScreen.kt#L53-L61)
- **What's wrong**: `HomeScreen` instantiates `userProfileViewModel`, triggers `loadProfile()`, and collects `profileUiState`, `needsOnboarding`, and `userProfile` into state. None of these variables are ever referenced in `HomeScreen.kt`. The greeting card was removed on 2026-08-25 (`HomeScreen.kt:26`), leaving dead ViewModel observation.
- **What user experiences**: The opening screen says "Eliana / God has answered", followed immediately by study cards. It never acknowledges the believer opening the app. The personal warmth of a spiritual companion is missing.
- **Concrete fix**: Either strip the dead ViewModel collection or use `userProfile.displayName` to restore a quiet, dignified one-line greeting above the date (e.g., *"Good morning, Michael"*).

#### F10 · Low · Theme · Bug · [`SettingsScreen.kt:748-749`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/screens/SettingsScreen.kt#L748-L749)
- **What's wrong**: `ThemeCard` has a rigid layout:
  `Modifier.width(120.dp).height(100.dp)`.
- **What user experiences**: When the user increases the app font scale (or uses system accessibility text scaling > 1.15x), the theme name and the 2-line description ("Paper, ink, and gold leaf") collide with the color swatches and clip off the bottom of the card.
- **Concrete fix**: Change `.height(100.dp)` to `.heightIn(min = 100.dp)` and allow the card to wrap its content cleanly.

#### F11 · Low · Reader · Design · [`ElianaVerseTiers.kt:53`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/components/bible/ElianaVerseTiers.kt#L53)
- **What's wrong**: The tier container color is set to:
  `containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f)`.
- **What user experiences**: This is the exact translucency pattern that caused the "study-mode bleed" in `StudyVerseCard` (noted in `STATE.md:464`). On light themes (Ivory/Crisp Paper), translucent surfaces layered over light backgrounds produce faint grey mud rings rather than crisp parchment boxes.
- **Concrete fix**: Use an opaque token: `containerColor = premium?.heroFillInner ?: MaterialTheme.colorScheme.surfaceContainerLow`.

#### F12 · Low · Nav · Design · [`navigation/MainDestination.kt:47`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/navigation/MainDestination.kt#L47)
- **What's wrong**: `MainDestination.kt` contains:
  `allDestinations = listOf(Home, Stillness, Journey, Eliana)`.
  It completely omits `Bible`, retaining the obsolete 4-tab model from early 2026.
- **What user experiences**: This is developer confusion rather than direct user friction, but any deep-link or route utility relying on `MainDestination.fromRoute("bible_reader")` returns `null`.
- **Concrete fix**: Add `object Bible : MainDestination("bible_reader", "Bible", ...)` to `MainDestination` or consolidate route definitions into a single source of truth.

---

### 3. Themes Verdict: One Design Language or Several?

**Verdict: Several eras stacked together.**

The theme system has three distinct architectural layers coexisting in code:

1. **The Legacy M3 Era (Sacred, Vesper, Selah)**:
   Born from standard Android Material 3 scaffolds. These themes rely on [`BackgroundWrapper.kt`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/components/BackgroundWrapper.kt) painting a vertical gradient (`background` to `primaryContainer`) and layering an alpha scrim over the content. They rely on standard drop shadows and alpha-derived surface variants.
2. **The High Luxury / Flat Surface Era (Shekinah, Ivory/Alabaster)**:
   Rebuilt late August 2026. This layer introduces [`PremiumTokens`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/theme/FourThemeSystem.kt#L26) to enforce true OLED black (#000000) and soft warm paper (#FAFAF8). It explicitly disables `BackgroundWrapper`'s gradient via an early return (`if (selectedTheme.premium != null)`), authoring opaque fills (`heroFill`, `heroFillInner`), 0dp elevations, hairline gold borders, and etched title shadows.
3. **The Cool Print Experiment (Crisp Paper)**:
   Added on 2026-08-25 as an A/B alternative to Ivory. It clones the `PremiumTokens` pattern but shifts the paper to cool white (`#F8F9FA`) and charcoal (`#202124`).

#### The Seams
- **The Background Fork**: In [`BackgroundWrapper.kt:43`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/components/BackgroundWrapper.kt#L43), the app forks its rendering pipeline based on `theme.premium != null`. If you choose Shekinah, you get a flat canvas. If you choose Sacred, you get a gradient wash with two layers of `Modifier.zIndex`.
- **Conditional Premium Styling**: Across [`HomeScreen.kt`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/HomeScreen.kt), [`BreathingVerseCard.kt`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/components/home/BreathingVerseCard.kt#L63), and [`ContinueReadingCard.kt`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/components/home/ContinueReadingCard.kt#L25), every component is littered with:
  ```kotlin
  val premium = LocalElianaThemeConfig.current.premium
  // if (premium != null) use opaque fill, 0dp elevation, gold border
  // else use surfaceVariant.copy(alpha=0.7f), 8dp elevation shadow
  ```
  This makes Sacred, Vesper, and Selah second-class themes that suffer from translucent color bleeds that were intentionally cured in Shekinah and Ivory.
- **Preview Blindness**: In [`SettingsScreen.kt:752`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/screens/SettingsScreen.kt#L752), the settings card previews light themes using the *active* dark theme's background.

**The Fix**: Retire the legacy gradient wrapper completely. Promote `PremiumTokens` into the baseline `ElianaThemeConfig`. Every theme (dark or light) should have an authored flat ground, authored opaque card fills, and zero elevation bleeds.

---

### 4. The One Big Move: The Morning Liturgy Flow

The single change that will most raise the felt quality of Home + Bible is **collapsing the fragmented 5-card Home dashboard and the 2-mode Bible Reader into a unified "Morning Liturgy & Progressive Reader".**

```
Current Experience (Cognitive Clutter):
[Home Screen]
  ├─ Brand Banner (Eliana / God has answered)
  ├─ Continue Reading Card (Genesis 1)
  ├─ Sacred Word (Dense 3-paragraph exegesis)
  ├─ Study Path Card (Linear progress & chapter)
  └─ Sacred Quick Access (4 tiles)
       ↓ Tap Bible
[Bible Reader]
  ├─ Mode Toggle (Reading vs Study)
  └─ If Study Mode: 50 heavy stacked cards with Greek/Hebrew text, 
     transliterations, and notes dominating the screen.
```

#### What It Looks Like
1. **Home Becomes "The Morning Office" (Single Scrollable Sanctuary)**:
   - **Greeting & Quiet**: A calm, breathable header with the user's name and the day's liturgical marker.
   - **The Sacred Word (Distilled)**: Today's verse in large, un-justified, beautiful typography, followed by *one* single contemplative insight (not three separate headers).
   - **The Sacred Response (The Liturgical Bridge)**: Directly beneath the verse, two tranquil action buttons:
     - **"Pray This"**: Opens Throne Room pre-seeded with this verse as the prayer altar.
     - **"Read in Context"**: Opens the Bible Reader directly to this verse with a subtle gold highlight pulse.
   - **The Study Ribbon**: A compact, single-row card showing active Aliyah study progress, kept quiet below the fold.

2. **The Bible Reader Becomes a Progressive Sanctuary**:
   - Scrap the hard mental barrier between "Reading Mode" and "Study Mode".
   - Scripture *always* flows as continuous, clean, dignified typography.
   - Verses with rich original language or Eliana studies retain a subtle, elegant gold margin tick (or the ✦ superscript).
   - **Tapping a verse** does not break the text apart into a wall of technical cards; it gently reveals an anchored bottom drawer or inline accordion with the three tiers: Original Words (tappable for Strong's), English Rendering, and Key Word Study.

#### What It Replaces
- Replaces the redundant `JourneyScreen` entirely.
- Replaces the 5-card disjointed stack on `HomeScreen`.
- Replaces the visual dissonance of switching the Bible Reader between flowing prose and 50 isolated technical cards.

#### Rough Build Cost
- **Home restructuring**: 1 developer day (streamlining [`HomeScreen.kt`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/HomeScreen.kt) and [`BreathingVerseCard.kt`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/components/home/BreathingVerseCard.kt)).
- **Reader progressive sheet**: 2 developer days (refactoring [`FlowingBibleText`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/components/bible/ReadingDisplayComponents.kt#L272) to host an anchored verse inspection sheet instead of maintaining separate `StudyModeVerseCard` implementations).
- **Navigation cleanup**: 0.5 developer days (retiring `"journey"` route, wiring `"throne_room"` and `"journal"` directly to bottom nav).
- **Total build cost**: ~3.5 to 4 focused days.

---

### 5. What Could Not Be Verified from Source Alone
1. **Cold-Start Database Latency**: In [`MainScreen.kt:58-63`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/MainScreen.kt#L58-L63), `BibleRoomDatabase.getDatabase(context).bibleDao().getBookCount()` is fired on IO dispatchers. The initial SQLite asset unpack time on budget Android hardware (e.g. MediaTek Helio processors) cannot be verified without physical testing.
2. **Scroll Jank on Complex Original-Language Flows**: In [`WordStudySheet.kt:93`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/components/bible/WordStudySheet.kt#L93), `OriginalWordsFlow` creates a Compose `FlowRow` containing individual `Text` and `Modifier.clickable` nodes for every single word in a verse. In a long chapter like Psalm 119, the recomposition overhead during high-speed fling gestures cannot be benchmarked from source alone.
3. **Firestore Hit Latency in Bottom Sheet**: In [`WordStudySheet.kt:158`](file:///C:/Users/Owner/AppData/Local/Temp/ux-council-gemini-BFaWzE/repo/app/src/main/java/com/eliana/rhythm/ui/components/bible/WordStudySheet.kt#L158), `FirebaseFirestoreManager().getWordStudyFuzzy()` is launched inside a coroutine when a word is tapped. The real-world latency and offline cache behavior on poor cellular connections cannot be verified without network throttling tests.

---

### 6. Where Gemini Should Be Used on This Project
- **What I am best at**: High-speed, whole-repo structural auditing; parsing multi-file Jetpack Compose state trees; detecting subtle gesture conflicts, missing coroutine cancelations, and theme token bleeds; and verifying large JSON/Room dataset schemas.
- **What should be sent elsewhere**: Deep lyrical and devotional prose (send to Claude/Fable), nuanced theological dispute synthesis (send to Sol/Codex or human pastoral oversight), and pixel-perfect native Android vector iconography.

---

BEGIN FINDINGS
[
  {"id":"F1","severity":"high","area":"reader","kind":"bug","file":"app/src/main/java/com/eliana/rhythm/ui/components/bible/ReadingDisplayComponents.kt","line":492,"claim":"Tapping an Eliana-translated verse in Flowing reading mode unconditionally toggles tier expansion, preventing verse selection, copying, annotating, or translation comparison.","fix":"Add a long-press gesture recognizer to FlowingVerseRun for verse selection, or isolate the tier expansion trigger to the ✦ glyph."},
  {"id":"F2","severity":"high","area":"nav","kind":"bug","file":"app/src/main/java/com/eliana/rhythm/BottomNavigationBar.kt","line":40,"claim":"The Journey bottom-nav tab fails to highlight when navigating to the journey route and permits duplicate backstack pushes because isTabSelected omits the route check.","fix":"Include currentRoute == 'journey' in the isTabSelected check for the journey tab."},
  {"id":"F3","severity":"high","area":"home","kind":"bug","file":"app/src/main/java/com/eliana/rhythm/ui/components/home/BreathingVerseCard.kt","line":202,"claim":"The yesterday button decrements the calendar day with no forward arrow or today reset button, trapping the user in past days.","fix":"Add a forward arrow and a return-to-today control that displays whenever dayIndex is not the current day of the year."},
  {"id":"F4","severity":"high","area":"nav","kind":"design","file":"app/src/main/java/com/eliana/rhythm/BottomNavigationBar.kt","line":23,"claim":"Home and Journey heavily duplicate each other as directory dashboards, while daily spiritual practices like Prayer and Journaling lack primary bottom-nav destinations.","fix":"Retire Journey as an autonomous tab and promote Prayer and Journal directly to the bottom navigation bar."},
  {"id":"F5","severity":"medium","area":"reader","kind":"design","file":"app/src/main/java/com/eliana/rhythm/ui/components/bible/ReadingDisplayComponents.kt","line":483,"claim":"Forced full text justification across English scripture and devotional cards creates unsightly whitespace rivers on mobile displays.","fix":"Replace TextAlign.Justify with TextAlign.Start on all English body and scripture text composables."},
  {"id":"F6","severity":"medium","area":"theme","kind":"design","file":"app/src/main/java/com/eliana/rhythm/ui/components/BackgroundWrapper.kt","line":43,"claim":"BackgroundWrapper forks between flat opaque grounds for premium themes and gradient-scrim overdraw for legacy themes.","fix":"Remove the legacy gradient and scrim layers completely, rendering a unified solid background across all themes."},
  {"id":"F7","severity":"medium","area":"theme","kind":"bug","file":"app/src/main/java/com/eliana/rhythm/ui/screens/SettingsScreen.kt","line":752,"claim":"Settings theme preview cards use the active theme's surface color instead of their own palette, displaying dark surfaces for light theme previews.","fix":"Bind ThemeCard container and text colors to theme.colorScheme rather than MaterialTheme.colorScheme."},
  {"id":"F8","severity":"medium","area":"reader","kind":"design","file":"app/src/main/java/com/eliana/rhythm/ui/components/bible/WordStudySheet.kt","line":204,"claim":"Strong's Concordance chips have empty click handlers and the standalone Word Lookup screen is an abandoned construction stub.","fix":"Wire the Strong's assist chip to filter lemma occurrences and connect WordLookupScreen to query the local WordLookupMap."},
  {"id":"F9","severity":"low","area":"home","kind":"design","file":"app/src/main/java/com/eliana/rhythm/HomeScreen.kt","line":53,"claim":"UserProfileViewModel is observed into Compose state on Home but never rendered, leaving the opening screen impersonal.","fix":"Use the loaded profile state to render a quiet morning greeting or remove the unused ViewModel collection."},
  {"id":"F10","severity":"low","area":"theme","kind":"bug","file":"app/src/main/java/com/eliana/rhythm/ui/screens/SettingsScreen.kt","line":748,"claim":"ThemeCard has a hardcoded 100dp height that truncates text when accessibility font scaling is enabled.","fix":"Change height(100.dp) to heightIn(min = 100.dp) and allow dynamic content wrapping."},
  {"id":"F11","severity":"low","area":"reader","kind":"design","file":"app/src/main/java/com/eliana/rhythm/ui/components/bible/ElianaVerseTiers.kt","line":53,"claim":"In-card tier containers use translucent surfaceVariant fills that produce muddy color fringes on light themes.","fix":"Replace the translucent alpha copy with an opaque heroFillInner or surfaceContainerLow container color."},
  {"id":"F12","severity":"low","area":"nav","kind":"design","file":"app/src/main/java/com/eliana/rhythm/navigation/MainDestination.kt","line":47,"claim":"MainDestination maintains an obsolete 4-tab list that conflicts with the actual 5-tab BottomNavigationBar implementation.","fix":"Update MainDestination to include the Bible destination or synchronize it directly with BottomNavItem."}
]
END FINDINGS
