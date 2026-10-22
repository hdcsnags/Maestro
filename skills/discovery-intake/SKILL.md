---
name: discovery-intake
description: Run a software discovery intake with a non-developer — a prospective client, a partner, or someone bringing an app idea — conversationally, a few questions at a time, and write a structured intake record the council can scope, price and plan from. Use when someone says "I have an app idea", books a discovery call, or the composer's Discovery intent fires.
harness: [any]
---

# Discovery intake

The questions live in `schema.json` beside this file (same schema as the First Call page): 11 parts, ~50 questions, each with `id`, `t` (text | long | single | multi), the question as asked on a call, an optional `client` wording for self-fill, an optional `hint` for the interviewer, and `o` options for choice questions. Part `p` (private notes) is never shown to the person being interviewed.

## How to run it in conversation
1. Open: say what this is ("a few questions so we can come back with a clear plan and a realistic range"), ask permission to take notes, and set the frame: today is listening; no price or date is quoted on this call.
2. Walk the parts in order. Ask **two or three questions at a time**, in the person's language, in plain words. Let them skip. Capture answers in their words; do not paraphrase into jargon.
3. Steer back when it drifts: note the tangent under the nearest question, then "can I come back to the main flow?"
4. The three questions that decide scope: `s3_mvp` (the one thing on day one), `s3_reference` (an app that is close, what to keep, what to change), `s9_budget` (ask plainly; do not react to the number). Never skip these.
5. Close with `s11_*`: what they still need to find out, what you will send, when the follow-up is. State the next step: "I'll write this up, go through it with my team, and come back with questions, a suggested first version and a rough range within a few days."
6. After the call, fill part `p` yourself: your read, the signal checklist, gut viability 1–5, questions for the scoping session.

## The record
Write `intake-<slug>-<date>.md` exactly like the First Call export: a heading with client and date, one `##` per part, `**question**` then the answer or `_(no answer)_`, and a final `## Not yet answered` list. In Maestro, the same content is the `discovery` thread's structured message (`metadata.intake` = the answers object keyed by question id) so the scoping job can read it.

## Hand-off to scoping
A scoping brief for the council (`council`) takes the record plus these numbered questions: Q1 viability and the one-line pitch; Q2 the smallest launchable version (what is in, what waits); Q3 platform and stack with reasons; Q4 risks and unknowns to clear before quoting; Q5 a phased plan with rough ranges per phase; Q6 the questions to send back before a proposal. Seats must mark every estimate `inferred`; nothing in an intake is verified.

## Signals to weigh (from `p_flags`)
No budget or will not discuss it; expects it in weeks; scope grew while talking; equity instead of payment; a marketplace with two sides to fill; money moving through the app; no clear decision maker; a previous developer relationship that ended badly. Positive: a clear problem with real users, assets ready, realistic about phasing.
