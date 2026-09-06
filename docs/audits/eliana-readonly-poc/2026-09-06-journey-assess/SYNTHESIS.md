# Journey assessment — synthesis

*Conductor: Fable 5.1, 2026-09-06. Seats: GPT-6 Astra (codex_cli, 2m13s, verdict parsed), Gemini 3.8 Flash (agy, 1m26s, verdict parsed). Kimi K3: **monthly usage limit exhausted** (403 `access_terminated_error`, "quota will be refreshed in the next cycle") — seat empty. Not blind by design: both seats had the old Journey (`origin/main`), the rebuilt one (`ux-council-fixes`), Home, and Michael's reaction verbatim. Read-only verified clean for both.*

## Verdicts

| | Astra | Gemini |
|---|---|---|
| Verdict | revise | revise |
| Rebuild got right | Write/Pray first; placeholder stats gone; real journal material; opaque flat surfaces | same, plus the RecentEntriesCard as "living history" |
| Rebuild got wrong | Treated de-duplication as the goal; four cards for two activities; big greeting card first; "Practice"; previews not tappable | "Practice" reads like a secular habit tracker; helpers on equal footing with their parents; stripped the Library with no other home |
| "Practice" label | remove | remove |
| Write vs Guided prompts | one card; "Help me start" as a subordinate text link | one card; "Guided Prompts" as an embedded chip |
| Pray vs Generate a prayer | **remove the generator from Journey entirely** — Throne Room already opens with it (verified: `ThromeRoomScreen.kt:57-61`) | keep as an embedded chip inside the Prayer card |
| Greeting card | remove the card; static title + subtitle instead | drop the greeting (duplicates Home), keep Ps 119:105 as the header |
| Stillness / Eliana back? | **yes, as secondary rows** — "a useful Journey can hold them even though they have tabs" | **no** — "toxic redundancy" |
| Library back? | **no** — belongs with Home's study activity | **yes** — routes `teachings`/`aliyah`/`foundations` already light the Journey tab; long-form study has no anchor without it |
| Look back | ONE latest preview + Read your journal · Search · Revisit your prayers; counts as a quiet footer | keep all three previews + All entries · Search; keep the stats card |
| Where Michael is wrong | "A second home still needs hierarchy; restoring every shortcut at equal weight would weaken it. Keep Home's passage-specific Pray this / Journal." | "'Everything else' is a junk-drawer rule; Home can't be Word-only because the verse demands Pray/Journal beneath it." |

## Where they converge (and with Michael)
1. Keep the emphasis on Write and Pray. Keep the flat, opaque surfaces.
2. Kill "Practice". Kill the 2×2: helpers are not peers of their parents. Conductor verified both redundancies in code — the Throne Room's second card IS "Generate a Prayer", and the journal's top bar already has Guided Journal and History icons. Michael's instinct was exactly right.
3. Keep a memory section; both drop the time-of-day greeting (Home now says good morning).
4. Both reject "second home" **only** in the sense of *equal-weight* shortcuts. Neither objects to Journey holding more than write/pray/look-back if the hierarchy is clear.

## Where they split
- **Stillness and Eliana** on Journey: Astra yes (secondary), Gemini no.
- **The Library** on Journey: Gemini yes, Astra no.
- **Previews**: three (Gemini) vs one (Astra).

## Conductor's merged recommendation
Michael's rule (Home = the Word and reading; Journey = everything else) with Astra's hierarchy and Gemini's Library:

```
JOURNEY
  "Prayer, reflection, and room to be still."          — subtitle; Ps 119:105 as a one-line epigraph, no card

WRITE   (hero, gold hairline)  "Put what is on your heart into words."          → journal
        small text link        "Help me start"                                  → guidedJournal
PRAY    (hero, gold hairline)  "Find a prayer, revisit your own, or get help finding words." → throne_room
        (no separate generator — the Throne Room opens with it)

Also here (secondary rows, one line each):
  Sacred Stillness   "Make room to pause and be still with God."    → stillness
  Talk with Eliana   "Bring a question or what is on your mind."    → eliana
  The Library        "Foundations, Aliyah, and guided studies."     → teachings

LOOK BACK
  latest entry (title · date · two lines)  ·  Read your journal → journalHistory  ·  Search → searchJournal
  Revisit your prayers → throne_room
  footer: "N entries · N days written"
```
Rationale: the hero pair is what Michael liked; the three secondary rows are his "everything else" without the equal-weight clutter both seats warned about; the Library row answers Gemini's real point that `teachings`/`aliyah`/`foundations` already light this tab; one preview keeps Journey useful to someone whose walk is prayer or stillness rather than writing.

## Bug found by Astra (verified, fixed on the branch)
`BottomNavigationBar.kt` ignores a tap on the tab it considers already selected. Because journal, prayer, library and study routes map to the Journey tab, tapping **Journey** from any of them did nothing — you could not get back to the hub. Fix: a tap on the selected tab pops back to that tab's root, and navigates to it when the root isn't on the stack.

## Michael's open point, not answered by either seat
"Word search we literally just added" — the reader's tap-a-word study is not reachable from Journey and neither seat proposed it; Astra noted there is no standalone word-lookup route. If Michael wants a Journey door to word study, it needs a real destination first (a search UI over `WordLookupMap`), which is the WordLookupScreen rebuild the council scoped as "rebuild or delete" — we deleted.
