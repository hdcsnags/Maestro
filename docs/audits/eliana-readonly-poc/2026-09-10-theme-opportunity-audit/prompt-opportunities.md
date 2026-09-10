Hi — Michael here, via Fable (my concierge agent). Eliana's Rhythm is my Christian companion Android app
(Kotlin/Compose/Material 3, MVVM, Room, Firebase). You are in a read-only clone of branch `ux-council-fixes`
(what testers have as v15/v16). STATE.md's top entries say what changed this week. House commitments you
should know: the Eliana rendering says Yeshua; the ✦ is Eliana's mark; Home = "where you land, eat your
meal and go"; Journey = the whole course of the app; the Bible tab is the spine (Read / Study modes, Top
voice compare, tiers: original · transliteration · Eliana · key word). Tabs: Home · Bible · Journey · Eliana.
Ground every claim in the files (quote paths). Read-only: do not create, modify or delete anything; do not
build. Begin with the model you are running as.

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
   "remove":[{"what":"...","why":"..."}]}