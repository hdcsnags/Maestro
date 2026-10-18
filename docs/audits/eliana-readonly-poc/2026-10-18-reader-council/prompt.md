# Bible reading experience + Deeper insight flow — UI/UX second opinion (18 Oct 2026)

Hi — you're one of two independent seats reviewing the Bible reader of **Eliana's Rhythm** before Michael takes it off the Play closed-test track and launches it to everyone. Work alone; you won't see the other report until afterwards.

## Who and what

Michael Thomas builds Eliana's Rhythm, a Christian spiritual-companion Android app named for his daughter. Kotlin + Jetpack Compose + Material 3, MVVM, Room (+ a read-only `originals.db` of Hebrew/Greek words with Strong's and morphology), Firebase (Auth, Firestore). It has been on the Play closed-test track since August; versionCode 21 is current. Michael wants clinical, evidence-based assessment and no flattery.

The reader is the heart of the app. What it holds, and where the depth comes from:

- **Bible text on device** (Room): BSB (the star version), KJV, ASV, a Farsi version (FA-GNB), and "ORIG" (Hebrew/Greek from `originals.db`, every word tappable to Strong's/morphology/gloss).
- **The Eliana Bible** — Michael's own rendering of every verse, 31,069 documents in Firestore collection `eliana_bible`, key `book_chapter_verse` lowercase (`psalms_34_18`, `1_chronicles_10_1`, `song_of_solomon_1_1`). Fields: `original_text`, `transliteration`, `eliana_translation` (the ✦ rendering), `key_word`, `key_word_transliteration`, `key_word_meaning`.
- **Deeper insights** — a full written study for every verse, 31,069 documents in `verse_insights`, same key, field `content` (markdown: Scripture · Fresh Rendering · Deeper Lens · …).
- **Word studies** — 22,694 essays in `word_studies`, keyed by transliteration.
- **Chains** of connected verses; **contested verses** (`assets/contested_verses.json`) rendered as apparatus cards.

The whole corpus is finished. Any "this study isn't written yet" a user sees is a bug (16 known chapter-final verses aside — a pipeline gap being closed separately).

## How the reader works today (verified in code — but please judge it, not just confirm it)

- `ui/screens/EnhancedBibleReaderScreen.kt` is the canonical reader (`BibleReaderScreen.kt` is legacy). Components in `ui/components/bible/`: `ReadingDisplayComponents.kt` (the chapter list, Read and Study layouts), `ElianaVerseTiers.kt` (the per-verse depth card: original → transliteration → ✦ rendering → key word), `WordStudySheet.kt`, `ChainSheet.kt`, `BiblePickerSheet.kt`, `NavigationComponents.kt`, `StudyToolsComponents.kt`.
- Two modes: **Read** (flowing text; a verse's tier card can be expanded under it) and **Study** (every verse as a card with its tier card always open; a "Top voice" strip picks which version sits above the Eliana rendering).
- Chapter depth is loaded per chapter in one Firestore prefix query (`FirebaseFirestoreManager.getElianaEntriesForChapter`, `EnhancedBibleReaderViewModel.kt:328`). An empty result shows "This chapter is awaiting its Eliana rendering" (`ElianaChapterInviteCard`).
- Selecting a verse opens a bottom **verse action bar** (`VerseActionBar` in the reader screen): `✦ Deeper` (toggles the tier card), `א Original`, `Highlight · Note`, `Compare`, `✦ Deeper insight` (opens the written study — `ui/screens/VerseStudyScreen.kt`, route `verse_study/{ref}`), `Ask Eliana`, `Copy`, and chain chips.
- The written study is read instantly from Firestore and rendered as markdown on `VerseStudyScreen`; it offers "Open in Bible" and "Ask Eliana a question about this".
- Tapping the gold key word in a tier card also opens the written study. Tapping any Hebrew/Greek or transliteration token opens the word-study sheet.
- A top-bar download icon is "Keep this chapter offline" (`data/OfflinePackManager.kt`): reads every depth layer once so Firestore's cache holds it.
- The `✦ Deeper insight` chip and its key-word door were added on Oct 3 and ARE in this copy (it is a working-tree copy, not a commit).

History you should know, so you can judge it: until Sep 6 every verse card had a brain icon ("Ask Eliana") that doubled as the door to the insight because it auto-asked "explore this verse". Sep 6 moved it to the action bar; Sep 10 removed the auto-question, which silently removed the reader's only door to the insights; Oct 3 added the explicit chip. Michael's reaction to the Sep 10 state: *"there is a uh like download icon where the original icon/flow? wth is it even downloading?"*

## Michael's words (verbatim, Oct 18 2026)

> "assess Eliana for potential upgrades, UI and UX, features, functionality … I want to get this app out of closed testing and fully live on the playstore for everyone. Look at my bible reading experience, how I call the deeper insights as I have the entire bible manually re translated with everything inside of firebase along with deeper insights"

## What is in your working directory

- `app/` — the Kotlin source (`app/src/main/java/com/eliana/rhythm/**`), `app/build.gradle.kts`, `app/src/main/res/values/`, `app/src/main/assets/contested_verses.json`.
- `AGENTS.md`, `ARCHITECTURE.md` (parts stale; verify against code), `firestore.rules`.
- `shots/` — real screenshots. `theme-audit/*-bible.png` and `*-home.png` (Sep 10, v17: the reader in Study mode on each of the six themes; Shekinah is the flagship), `design-tech-review/*.png` (Sep 9, v16: `04-insight-select` = the written-study screen, `08-study-selectall` = Study mode with a verse selected and the action bar open, `12-two-selected`, `32-eliana-select`), `play-store/*.png` (Aug 22 store listing shots). The Oct 3 "✦ Deeper insight" chip is NOT in any screenshot — read it from code.

You cannot run the app. Ground every UI claim in code (`file:line`) or in a named screenshot, and say which. Do not modify any file.

## The ask

Judge the **Bible reading experience as a product** a stranger installs from the Play Store, with the depth Michael has built as the thing that should make them stay. Specifically:

1. **The reading surface.** Read mode and Study mode: typography, density, hierarchy, the "Top voice" strip, the tier card (original / transliteration / ✦ rendering / key word), the verse-number and ✦ affordances, dark and light themes. Where does it feel crafted, where like a prototype?
2. **The doors to depth.** How a first-time reader discovers and returns to: the Eliana rendering, the written Deeper insight, word studies, chains, compare. Judge the action-bar vocabulary (`✦ Deeper` vs `✦ Deeper insight`, `א Original` on Greek verses, `Ask Eliana`), the key-word tap, tappable words with no visible affordance, the download icon. Propose the vocabulary and placement you would ship — concretely: labels, icons, where each lives, what one tap does.
3. **Navigation and orientation.** Book/chapter picker, search, prev/next chapter, cross-book movement, back-stack behaviour with sheets and selections open, deep links (`bible_reader?ref=John%203:16&mode=study`).
4. **States.** Loading, offline, failed, and empty states for chapter depth and for the written study. A user with no connection — what do they see, and is it honest?
5. **The written-study screen** (`VerseStudyScreen`): is a markdown page the right form for a 1,000-word study? Hierarchy, provenance line ("✦ Eliana pipeline"), the two doors at top and bottom.
6. **Upgrades worth building before launch vs after.** Features that would make the reader the reason to open the app daily (reading plans, resume-where-I-left, cross-references, audio, sharing, memorisation, …) — rank them by value to a Play Store audience against build cost, and say which you would NOT build.
7. **Launch readiness of the reader specifically**: accessibility (TalkBack on a chapter of text, font scaling, touch targets, contrast on the six themes), tablets/foldables, Firestore read cost per chapter at scale, anything in `firestore.rules` or the fetch path that would hurt at 10,000 users.

If you think Michael's framing is off, or that something he is proud of is in the way, say so. Disagreement is useful.

## Output contract

1. **Grounding line**: what you read, what you could not open, which screenshots you looked at.
2. **Scores /10** with one line each: reading surface, doors to depth, navigation, states, written study, launch readiness.
3. **Findings table**: `ID | Severity (P0 blocker / P1 / P2 / P3 polish) | Surface | file:line or screenshot | What the user sees | Recommended fix`. Depth over count; merge duplicates.
4. **The design you would ship** for the verse action bar and the tier card: labels, icons, order, one sentence per element on why. A text mock-up is welcome.
5. **Upgrade ranking** (build before launch / after launch / don't build), each with one line of reasoning.
6. **Ten steps, in order**, from where the reader is to a 1.0 you would put your name on.
7. A machine-readable block at the very end:

```
BEGIN VERDICT
{"scores": {"reading_surface": 0, "doors_to_depth": 0, "navigation": 0, "states": 0, "written_study": 0, "launch_readiness": 0},
 "blockers": [{"id": "", "title": "", "file": ""}],
 "findings": [{"id": "", "severity": "P0|P1|P2|P3", "surface": "", "file": "", "title": ""}],
 "upgrades": [{"name": "", "when": "before|after|never", "why": ""}]}
END VERDICT
```
