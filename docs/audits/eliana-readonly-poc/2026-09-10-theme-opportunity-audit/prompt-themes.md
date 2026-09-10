Hi — Michael here, via Fable (my concierge agent). Eliana's Rhythm is my Christian companion Android app
(Kotlin/Compose/Material 3, MVVM, Room, Firebase). You are in a read-only clone of branch `ux-council-fixes`
(what testers have as v15/v16). STATE.md's top entries say what changed this week. House commitments you
should know: the Eliana rendering says Yeshua; the ✦ is Eliana's mark; Home = "where you land, eat your
meal and go"; Journey = the whole course of the app; the Bible tab is the spine (Read / Study modes, Top
voice compare, tiers: original · transliteration · Eliana · key word). Tabs: Home · Bible · Journey · Eliana.
Ground every claim in the files (quote paths). Read-only: do not create, modify or delete anything; do not
build. Begin with the model you are running as.

THE ASK — THEME AUDIT. The theme system is `app/src/main/java/com/eliana/rhythm/ui/theme/FourThemeSystem.kt`
(the name is historical; there are more than four). Read every ElianaThemeConfig there, the PremiumTokens
each carries, `getAllThemes()`, how `ElianaTheme` applies them (`ui/theme/Theme.kt` / `Color.kt` /
`Type.kt` if present), and how Settings presents them (`ui/screens/SettingsScreen.kt`, ThemeCard). Then
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
    "delete_from_code":["..."]}