# The 72 Sacred Word cards — do they read pastorally, educationally and accurately? (18 Oct 2026)

Hi — you're one of two independent seats reading every Verse of the Day card in **Eliana's Rhythm** before it leaves the Play closed-test track. Work alone; you won't see the other report until afterwards.

## Who and what

Michael Thomas builds Eliana's Rhythm, a Christian spiritual-companion Android app named for his daughter. A church is already using it. Every day the Home screen shows one **Sacred Word** card: a verse in Michael's own rendering (the Eliana Bible), then three short sections — *Notice This*, *Why It Matters*, *Carry It With You* — with doors into the full written study, prayer and the journal. The 72 cards cycle; the ones for 2026-08-04 → 2026-10-14 are in your folder.

Michael's standing on voice, in his words today: *"This is a Christian app that has a corpus of origin, we aren't necessarily trying to be neutral, on the contrary, we are aiming for accuracy and education but to a very specific demographic that may welcome people from different walks."* So: confessional, warm, honest; not hedged into neutrality; never inaccurate about the text. The house rule from the Foundations book: a contested reading is labelled contested, never quietly picked. The Eliana rendering says *Yeshua*; other versions are untouched.

## What is in your working directory

- `INDEX.md` — the 72 days with chain numbers.
- `days/NN_<key>.md` — one file per day: the card as the user sees it (rendering, Notice This, Why It Matters, Carry It With You), then the verse's entry in the Eliana Bible (original, transliteration, rendering, key word, key-word essay) and the full written Deeper insight (Scripture · Fresh Rendering · Deeper Lens · Everyday Insight · Take-Home Practice).

Known already, so don't spend your time rediscovering them: Habakkuk 3:17 and Ephesians 3:20 end mid-sentence (the sentence continues in the next verse); Romans 8:38 and Galatians 5:22 show a two-verse text under a one-verse label; seven cards double their quotation marks. Judge them if you like, but the ask is everything else.

## Primary sources

You cannot run anything here, so **ground every lexical, grammatical or textual claim in what the files themselves show** (the original text, the transliteration, the parsing already quoted in the essays) and say plainly when you are relying on your own knowledge. Do not assert a Hebrew or Greek fact you cannot point to. A claim you flag as doubtful is more useful than one you assert from memory.

## The ask

Read all 72 cards as the people who will meet them: a believer opening the app at 6:40 am; a church member sent the link by their pastor; a curious friend from a different walk who was told "just read the card". For each card judge:

1. **Pastoral** — does it meet a real person where they are, without flattery, without guilt-mechanics, without clinical distance? Does *Carry It With You* ask for something a person can actually do today?
2. **Educational** — does *Notice This* teach something true about the verse that a reader could not have guessed, and does *Why It Matters* earn its claim from the text rather than from a sermon the writer remembers?
3. **Accurate** — does the card say anything the verse does not say? Any grammar-as-proof ("the aorist means once for all"), root fallacy, invented manuscript claim, over-claimed etymology, or cross-reference that does not bear the weight? Does the card agree with the fuller Deeper insight beneath it, or do the two drift?
4. **Voice** — does it sound like one author across the 72, and like the Eliana Bible rendering above it? Flag cards that sound like a different hand.
5. **Fit for the demographic** — confessional and warm by design; flag only where a card would make a visitor from a different walk feel judged rather than welcomed, or where it is so inside-baseball a newcomer is lost.

Also tell Michael: the five best cards (the standard the rest should reach), the five weakest and why, and whether 72 is the right cycle length for an app people open daily for a year.

If you think the brief has the priorities wrong, say so. Disagreement is useful.

## Output contract

1. **Grounding line** — what you read, what you could not open, where you relied on your own knowledge.
2. **Overall** — three paragraphs: pastoral, educational, accurate. Then voice and fit.
3. **Per-card table**, all 72 rows: `Day | Reference | Pastoral /5 | Educational /5 | Accurate /5 | One-line note (or "clean")`.
4. **Findings that need a fix**: `ID | Severity (P0 wrong / P1 misleading / P2 weak / P3 polish) | Day | Reference | Field | What is wrong | Proposed wording`. Quote the exact sentence you would change.
5. **Best five / weakest five**, with the reason in one line each.
6. A machine-readable block at the very end:

```
BEGIN VERDICT
{"overall": {"pastoral": 0, "educational": 0, "accurate": 0, "voice": 0, "fit": 0},
 "cards": [{"day": 0, "reference": "", "pastoral": 0, "educational": 0, "accurate": 0, "note": ""}],
 "fixes": [{"id": "", "severity": "P0|P1|P2|P3", "day": 0, "reference": "", "field": "", "wrong": "", "proposed": ""}],
 "best": [0], "weakest": [0]}
END VERDICT
```
