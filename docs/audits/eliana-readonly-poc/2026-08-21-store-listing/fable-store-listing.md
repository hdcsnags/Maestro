# Fable — Play Store listing copy (independent take)

- success: true
- elapsed: 277.4s


## Output

Here's my independent take, grounded in what I actually read — the tier component (`ElianaVerseTiers.kt`), the full Forsaken Cry study end to end, the VOTD calendar entries, the chains registry with its evidence grades, the journal and Throne Room code, and the reader's database layer (which confirmed a complete offline Bible baseline plus the original-language and Eliana layers).

**Short description — 80 characters (exactly at the limit):**

> The Bible, unflattened: Hebrew & Greek under every verse, evidence you can weigh

**Full description — 3,016 characters:**

> Eliana means "God has answered."
>
> The first study in this app begins with the loudest question in Scripture — "My God, my God, why have you forsaken me?" A dying man spends breath he cannot spare quoting the first line of a poem written a thousand years earlier. Follow that poem to its turn and you find, waiting mid-verse, the three words almost nobody quotes: "You have answered me." The question and the answer lived in the same psalm all along. Most of us were only ever handed the question.
>
> That gap — between the flat reading and the whole one — is the reason this app exists. We are here to unflatten the Bible.
>
> THE TEXT IN LAYERS
> A complete Bible lives on your device, readable and searchable offline. Open Study Mode and each verse unfolds in tiers: the original Hebrew or Greek, a transliteration you can sound out, a fresh English rendering translated directly from the Hebrew of the Westminster Leningrad Codex and the Greek of the SBL Greek New Testament, and a key word study beneath it. Tap any original word for its meaning, root, and grammar. The Eliana rendering grows every day — and where a chapter is not yet translated, the app tells you so plainly and counts the verses with you. No pretending.
>
> CHAINS ACROSS THE CANON
> Scripture quotes itself constantly — a psalm surfaces on a Roman cross, a prophet's warning echoes in the Temple courts, an exodus happens twice. The chain registry links these passages across the centuries, the way the old chain-reference Bibles did, with one difference that changes everything: every link is graded by its evidence. Direct quotation. Strong allusion. Shared theme. Theological synthesis. Contested text. You will always know whether you are being handed a fact about the text or an argument about it — and when a beloved proof-text turns out to rest on one disputed Hebrew letter, the study says so, and sets it down. The case is stronger without it.
>
> ALIYAH — THE ASCENT
> Full studies, not devotional snippets. Each one starts at a locked door — out of everything a dying man could say, why did he shout THAT? — and hands you the shovel: the languages, the manuscripts, the first-century reading habits, the honest disagreements. You are not told what to conclude. You are shown the work and trusted to weigh it.
>
> A VERSE A DAY, WITH ITS ROOTS ATTACHED
> The daily verse comes from a curated calendar, not a random generator. Each day carries three short movements — notice this, why it matters, carry it with you — and many days link into the chains, so a single verse becomes a doorway instead of a poster.
>
> A PLACE TO ANSWER BACK
> A word this alive asks something of you. Keep a private journal — searchable, tagged, synced when you sign in. Enter the Throne Room to pray: curated prayers, your own saved prayers, and help shaping the words when yours run out.
>
> The Bible is not flat. It is a deep, cross-woven, answering book — and the tools to read it that way should not be locked away in seminary libraries. They are here, in your hand.
>
> Come dig.

A few notes on the choices, so you can compare against Sonnet's draft on the merits:

- **The opening is the app's name meeting Chain №1.** "Eliana means God has answered" and Psalm 22's turn ("You have answered me") are the same fact from two directions — the app's title is literally the turn of the psalm your first study is built on. I don't think a listing for this app should open any other way; it's the one hook that is both marketing and true.
- **I used "unflatten" and committed to it.** It's the project's own working vocabulary (the Forsaken Cry's "unflattened reading"), it's distinctive on a store page full of "grow closer to God daily," and the short description immediately cashes it out concretely (Hebrew & Greek, evidence) so it doesn't read as a puzzle.
- **The evidence-label system gets its own paragraph, by name.** After reading the study, I'm convinced the claim-labeling is the app's real differentiator — more than the original languages, which other apps have. "You will always know whether you are being handed a fact about the text or an argument about it" is the doctrine/theology distinction from Michael's brief, in store-listing register. The "disputed Hebrew letter" line (Psalm 22:16) is there because nothing signals intellectual honesty faster than an app admitting a famous proof-text is contested.
- **Every claim is checked against the code.** Offline complete Bible: confirmed (pre-populated Room database, BSB baseline). On-device word lookup: confirmed (OriginalWordsFlow, per the SPEC-5.0 comment). Growing-translation honesty: confirmed (ElianaChapterInviteCard counts verses "and growing daily"). Curated VOTD calendar: confirmed (bundled `votd_calendar.json`, zero live fetch, per the HomeScreen comment). I deliberately did *not* claim the prayer help works offline (it's an API call), and kept it to "help shaping the words when yours run out."
- One flag: the short description is exactly 80 characters. If the Play Console counts differently than expected (it shouldn't — these are all plain ASCII), a 79-character fallback is the same line with "claims you can weigh" in place of "evidence you can weigh."

I tried to write both files to the repo (`FABLE-PLAY-LISTING-short.txt` / `-full.txt`) but the writes weren't permitted in this session, so the text above is the deliverable.
