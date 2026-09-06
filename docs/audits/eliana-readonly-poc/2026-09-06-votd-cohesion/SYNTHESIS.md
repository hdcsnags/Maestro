# VOTD ↔ Deeper Lens cohesion — synthesis

*Conductor: Fable 5.1, 2026-09-06. Task from Michael: the Verse-of-the-Day cards "are written in actual disagreement in some cases … some talk about grammar for no reason … then you go to the deeper insight and the original text may vastly differ." Five seats, deliberately mixed generations, each judged all 72 card/insight pairs in two inline batches: **GPT-6 Astra** and **GPT-5.6 Sol** (codex), **Gemini 3.8 Flash** and **Gemini 3.6 Flash** (agy), **Claude Fable 5** (claude_code). Kimi: monthly quota exhausted. Payload: `Michael/votd-cohesion/cohesion-batch-{A,B}.json` (calendar day + its cached `verse_insights` doc from the 2026-09-05 Firestore backup). Seat outputs, verdict JSON and `matrix.md` sit beside this file.*

## 1. The headline: Michael is right that there's incoherence — but the offender is usually the insight, not the card

Three of the five seats said this unprompted, in nearly the same words:

- **Sol:** "Michael's concern is warranted, but the direction often runs opposite his premise: the later card is frequently the repair, not the offender."
- **Fable 5:** "This batch inverts your premise … the dominant pattern is cards *quietly correcting* insights … each time the card is right and the insight is the document that needs revision. Recommendation: back-port card hedges into insights, not the reverse."
- **Astra:** "The problem is real, but it runs in both directions … Several cards improve on their studies: they restore Israel's context, limit an overclaim, or distinguish a promise from its pastoral application. Those improvements should flow back into the studies."

The recurring insight failure is one thing wearing five costumes: **interpretation presented as something grammar proves.** A perfect tense made to establish perseverance (Eph 2:8), a passive participle made to assign who caused the wound (Ps 34:18), a Hitpolel made to mean "settling in, not passing through" (Ps 91:1), prefixes made to prove "complete and decisive withdrawal" (Matt 27:46), a lexical contrast (ζωή vs βίος) made into "a different kind of life" (John 10:10), a Hitpael imperative made to mean "work yourself into delight" (Ps 37:4). The cards, written later and more carefully, mostly hedge those claims — and Michael read the hedges as the cards "disagreeing."

**Conductor verification** (all against `sources/verify.py`, WLC/SBLGNT/LXX):

| Entry | Insight claim | Corpus says | Verdict |
|---|---|---|---|
| #52 Ps 91:1 | Hitpolel *yitlonan* = "settling in, not a brief visit" | lemma 3885 לון "lodge / pass the night", HVri3ms | **Insight overclaims; card ("traveler's overnight stop") is lexically right.** The settled-trust reading belongs to the *yoshev / yitlonan* parallelism, not the stem. |
| #46 Isa 26:3 | *samukh* = "a mind actively leaning its weight on God" | HVqsmsa — Qal **passive** participle, "supported/upheld" | **Insight overclaims; card right.** Passive preaches better anyway: a mind held steady. |
| #14 Gen 16:13 | first *ro'i* = possessive "who sees me", unambiguous | רֳאִי lemma 7210 HNcmsa — absolute noun, no suffix (the "who sees me" form is the *second* clause, 7200 + 1cs) | **Insight wrong on morphology; card's caution right.** |
| #35 Ps 139:14 | "the same root, פ־ל־א, appears twice" | נִפְלֵיתִי = 6395 (palah), נִפְלָאִים = 6381 (pala) | **Insight overclaims; card's "related, not identical" right.** |
| #30 Lam 3:22 | renders "His loyal loves never cease" while glossing MT | תָמְנוּ = Qal perfect 1cp — MT: "**we** are not consumed" | **Insight conflates MT with the emendation without flagging it; card names the fork.** |
| #18 Rom 8:28 | absence of explicit ὁ θεός forces an alternative subject | SBLGNT: πάντα συνεργεῖ, variant marked | **Insight overreads the variant; God remains the implied agent either way.** |
| #24 1 Pet 5:7 | "Greek OT cloak over an animal's back" | LXX Ps 54:23: ἐπίρριψον ἐπὶ κύριον τὴν μέριμνάν σου — same verb, same noun as 1 Pet 5:7 | **Insight misses the direct echo Fable 5 identified; conflates Luke 19:35 with the LXX.** |
| #12 Heb 10:31 | (card) "with a compound verb, for falling among robbers" | Luke 10:36 τοῦ ἐμπεσόντος — ἐμπίπτω, plain | **Card's hedge is muddled filler; the insight's parallel is correct.** |
| Isa 53:7 (Fable 5 flag) | insight cites Isa 53:7 for *charash* | verse has נִגַּשׂ / נַעֲנֶה / לֹא יִפְתַּח פִּיו — no חרש | **Miscitation in the insight.** |

Nine checked, nine confirmed. The seats that ran the corpus were right every time I could test them.

## 2. What is actually wrong with the cards

Three real card defects, each named by ≥3 seats:

1. **Retreat-to-vagueness / duplicated hedging.** Cards that take the insight's committed, defensible claim and turn it into "many readers have understood…" (#48 Ps 37:4), or re-litigate Notice This's hedge inside Why It Matters in method vocabulary — "synonymous poetic parallelism" (#58 Ps 119:105), "'leans' should be treated as its picture, not as lexical meaning" (#46 Isa 26:3). This IS the "grammar for no reason" Michael felt: not lexical fruit, but *defensive* grammar. Fable 5 called it "under-claiming to the point of sterilizing the warm slot" — the narrator-posture bug from 2026-08-22, again.
2. **Genuine drift by addition** — the card imports a point the insight never made: Rom 8:29 defining "good" (#18), "cannot be evaluated in advance" on the sign of Jonah (#10), a second sense of "in truth" (#15). Four seats agree these are additions, and three of four say **#18's is an improvement to back-port**; #10's is "too absolute" (Sol); #15's "dilutes the concrete practice" (Fable 5).
3. **Cards that drop the insight's fruit** while adding hedges: #8 Mark 11:17 drops the Court-of-the-Gentiles explanation for a "deeper doorway" gesture; #10 drops the *kētos* and part-of-a-day points.

Of Michael's specific claim that the *original text* "may vastly differ": the calendar's `elianaTranslation` and the insight's "Fresh Rendering" were not found to disagree substantively anywhere by any seat; the differences are house-style (Jesus→Yeshua, which Astra applies throughout) and wording.

## 3. Newer is not always better — the experiment Michael asked for

| Seat | Generation | Time | Ran the corpus? | Flagged | Questioned the insight | Verdict quality |
|---|---|---|---|---|---|---|
| GPT-6 Astra | newest OpenAI | 5m/batch (B died on usage limit at 7:49 PM window) | **yes, all 36** + STEP lexicons | 69% | 22/36 | Every lexical claim I checked held. Most granular rank labels ("Text / reading / application"). |
| GPT-5.6 Sol | previous OpenAI | 4m/batch | **yes** (noted MT verse offsets) | 52% | 34/72 | Every claim checked held; found the morphology errors (#14, #35, #30). |
| Claude Fable 5 | previous Anthropic | 7m/batch | **no** — sandbox denied python and the sources path; marked every claim (unverified) | 29% | 11/72 | Named the pattern inversion first; its unverified flags (LXX Ps 54:23, Isa 53:7 miscitation, Lam 3:22) all **verified true** by the conductor. |
| Gemini 3.8 Flash | newest Google | 4m/batch (a 36-pair batch exceeds agy's ~5-min response window twice; ran as 18+18) | says yes | **26%** (19/72) | 6/72 | Passed pairs Sol/Astra/Fable5/conductor show to be insight errors (#52, #46). |
| Gemini 3.6 Flash | older Google | **1m45s**/batch | **no, and did not say so** | 16% | 1/72 | Fastest; found real DRIFTs by addition; sided with the insight on Ps 91:1 (wrong). |

Readings for Michael:
- **Grounding, not generation, predicted quality.** The two seats that ran the corpus (Astra, Sol) and the one that couldn't but *said so and marked everything* (Fable 5) were the ones whose flags survived verification. The Gemini seats were the least willing to question the *insight* (3.6: 1/72, 3.8: 6/72, against Sol's 34/72), and 3.6 was the most permissive overall. **Correction on 3.8:** at full coverage it flagged 26% — between Fable 5 and 3.6 — but 15 of its 19 flags are DRIFT-by-addition against the card; it almost never turned the lens on the insight, which is where the errors were. Note also that 3.8's flag rate rose from 8% (one 36-pair batch) to 26% (two 18-pair halves + one 36): payload size changed its verdicts, which is its own finding. Gemini 3.6's report never mentions the verifier and never says it skipped it; that silence is the worst failure mode in the table.
- **Older Sol matched newer Astra on substance** at roughly the same cost, and covered both batches where Astra lost one to the usage window. For a content audit like this Sol is not obsolete.
- **Fable 5 (not 5.1) read the *shape* of the problem best** ("cards quietly correcting insights; back-port the hedges") and did it blind of the corpus. Its weakness was tooling access, not judgment.
- **Gemini's speed is real** (3.6 in under two minutes) and its DRIFT-by-addition catches are genuine; it is a good *first pass*, not a court.

## 4. What to do — for Michael's ruling

The fix is two-directional and mostly aimed at the **insights** (Firestore `verse_insights`, editable through the CLI's Admin SDK path), not the cards:

1. **Insight corrections (9 verified above + the seats' ranked "insight should say" lines).** Replace grammar-as-proof with ranked language: *Text* / *reading* / *pastoral application*. The seats supplied the exact wording in their JSON `insight_issue` fields. This is a Deeper Lens correction pass, same shape as the 2026-08-26 word-study adjudication.
2. **Card de-hedging (≈8 cards):** #48, #58, #46, #14, #12, #8, #25 (Astra: "grammatical safeguards crowd out the pastoral point"), #10. Put the committed claim back where the insight, corrected, supports it; delete method vocabulary from Why It Matters.
3. **Back-port three card improvements into insights:** #18 (Rom 8:29 defines the good), #9 (the abuse safeguard on Jonah's confinement), #20 (the Israel-timetable guardrail).
4. **House style:** Jesus → Yeshua in both layers (Astra caught remaining instances).
5. Leave the rest alone: 45 of 72 pairs are clean by majority, and "divergence is not inherently a defect" (Sol) — the goal is *ranked* cohesion, not mechanical sameness.

Nothing in the calendar or Firestore has been changed. Proposed rewrites are in each seat's `*-verdicts.json` (`rewrite` and `insight_issue`); the conductor's recommendation is to start from Sol's and Astra's rewrites (grounded) and Fable 5's framing.

## 5. Gaps
- Astra batch B (entries 37–72) failed at the OpenAI usage limit mid-verification; window reopens 7:49 PM. Rerun: `CLAW_CODEX_MODEL=gpt-6-astra npx tsx scripts/eliana-votd-cohesion.ts only=astra batch=B`.
- Gemini 3.8 batch A failed twice inside agy ("timeout waiting for response" at ~5 min); completed as two 18-pair halves (A1, A2). Lesson: agy seats need ≤18-pair payloads.
- Kimi's swarm is the one seat built for exactly this adversarial content work and is quota-blocked for the cycle.
- agy cannot take a 131 KB prompt on the command line (`spawn ENAMETOOLONG`); the script now hands agy seats the payload as a file in their working directory.
