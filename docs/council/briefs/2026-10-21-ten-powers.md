# Brief: the Ten Powers proposal

## Who is asking and why
Michael (the Conductor), 2026-10-19 and 2026-10-21, verbatim: "what I am looking for is new skills, new features, new 'powers' so to speak that could level this project up in a major way, if I decide to share it publicly, allow it to stand." And: "build the skills, ten powers, feel free to run smoke tests … make sure the claw works … lets get maestro up." And on a new idea: "I'll build the onboard skill into maestro, my girlfriend can get an account later … onboard and have it pushed out to the concierge of choice, the claw can pick it up here … give her some ability up front, she can even use it for the council debates etc if she's brainstorming something, what do you think? Maestro could evolve even further if it makes sense or you have a better idea or refinement."

The concierge (Claude Code, claude-mythos-5-1) wrote the proposal and is now building it. This council is the proposal's own review before more of it ships. You are blind to the other seats. Disagree where you disagree.

## What to read (in this copy of the repo)
- `MAESTRO_POWERS_PROPOSAL_MYTHOS-5.1.md` — the proposal (read all of it).
- `MAESTRO_STATE.md` — Read This First block and the session-log entries from 2026-09-05 onward (the evidence the proposal cites).
- `docs/audits/maestro/2026-09-22-vision-council/SYNTHESIS.md` — the prior council's rulings; the proposal claims not to re-litigate them.
- `packages/maestroclaw/src/council/` — the Council Runtime built today (Power 1), including the verdict contract you are filling in right now (`verdict.ts`).
- `skills/` — the first skills, including `discovery-intake/`.
- `docs/MAESTRO_PHILOSOPHY.md` Parts 2, 5, 7.

## Questions (answer each; word budgets are maximums)
Q1 (120 words). The proposal assumes the public artifact is the council protocol CLI with the web console as a viewer of runs. Right call, or should the hosted web product stay primary? Ground your answer in what the repo shows actually produced results since August.
Q2 (200 words). Rank: which of the ten powers would you move up or down, and which would you cut outright? Name them by number.
Q3 (150 words). Debate Room design (Power 2): stop on stance stability, three-round cap, rotating dissent seat, silence rule, grounding-weighted stances, settled/contested/unverifiable partition. What breaks, what is missing, what would you change?
Q4 (150 words). The verdict and attestation contract in `verdict.ts` (the one you are using): what is gameable, what is missing, what would you remove?
Q5 (120 words). Public-readiness (proposal §3): what in this repo must not ship publicly that the checklist misses? Be specific (paths).
Q6 (150 words). Michael's new idea: a non-developer (his partner, a software engineer by training) uses Maestro directly — a Discovery intent that runs the intake conversationally and a Brainstorm intent that runs council plus deliberation in plain language, seats routed through the local Claw on his CLI subscriptions, the record then scoped by the council. Sound, a distraction, or the wrong shape? What is the smallest version worth building first?
Q7 (150 words). What is the proposal missing entirely — a power it should have, a risk it does not name?

Overall verdict word: ADOPT | ADOPT_WITH_CHANGES | REWORK.

Ground every claim in the files; read-only; begin your reply with the model you are running as.
