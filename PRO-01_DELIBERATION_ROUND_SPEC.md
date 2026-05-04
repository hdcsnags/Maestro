# PRO-01 — Inter-Agent Deliberation Round Spec

**Status:** Ready for review
**Authored:** 2026-05-03 by Opus 4.7
**Implementing agent:** Opus 4.7 (architectural — do not delegate to Sonnet without explicit approval)
**Parent plan:** `IMPLEMENTATION_PLAN.md` task `PRO-01`
**Why Opus-only:** Prompt engineering decisions are non-obvious; failure modes of redacted attribution and dissent feedback loops require senior judgment.

---

## The Core Insight

A **panel of consultants** delivers parallel monologues — that's the current Maestro Council.
A **board of directors** pushes back on each other in real time.

This spec converts Maestro from the first to the second. The mechanism is a structured deliberation round between Round 1 broadcast and Round N synthesis. It is the single highest-leverage product differentiator available — no other multi-agent tool does this today.

---

## Why This Is Hard

Three non-obvious problems must be solved together:

1. **Brand bias.** If Agent X knows the response it's critiquing came from Agent Y, the critique is colored by training-data sentiment about Y. Solution: redacted attribution.
2. **Echo collapse.** If you naively ask "do you agree?" agents converge on agreement to be polite. Solution: explicit objection-elicitation prompts that reward dissent.
3. **Synthesis drift.** A naive synthesis flattens dissent back into "blended consensus" and erases the value of deliberation. Solution: synthesis prompt reformulated to PRESERVE tension, not blend it.

Solving any one of these without the other two produces a feature that costs 2x tokens and adds nothing.

---

## Architecture Overview

```
USER PROMPT
    │
    ▼
ROUND 1: Standard broadcast
    │  Each agent answers independently (no awareness of others)
    │  Stored in `responses` with kind='primary'
    │
    ▼
[Optional] DELIBERATION ROUND  ←── Toggle in composer or auto-triggered
    │  Each agent receives:
    │   - their own R1 response (with attribution)
    │   - other R1 responses (redacted, labeled "Voice A", "Voice B"…)
    │   - three explicit questions (objection / agreement / self-critique)
    │  Stored in `responses` with kind='deliberation'
    │  Linked to R1 responses via `deliberation_targets[]`
    │
    ▼
SYNTHESIS (informed by both rounds)
    │  Concierge prompt rewritten to preserve tension explicitly:
    │   - "Where did agents agree, and what does that suggest?"
    │   - "Where did agents push back, and which side won?"
    │   - "What objection was raised that no agent fully answered?"
    │  Output references both rounds explicitly.
    │
    ▼
SYNTHESIS CARD with `unresolved_tensions: string[]`
```

---

## Data Model Changes

### `responses` table additions

```sql
ALTER TABLE responses ADD COLUMN kind text DEFAULT 'primary' CHECK (kind IN ('primary','deliberation'));
ALTER TABLE responses ADD COLUMN deliberation_targets uuid[] DEFAULT '{}';
-- targets are the response IDs from R1 that this deliberation reacts to
ALTER TABLE responses ADD COLUMN deliberation_pushbacks jsonb DEFAULT '[]'::jsonb;
-- Structured: [{ target_response_id, stance: 'agree'|'disagree'|'partial', summary: '...' }]
CREATE INDEX idx_responses_kind ON responses(round_id, kind);
```

### `rounds` table addition

```sql
ALTER TABLE rounds ADD COLUMN deliberation_enabled boolean DEFAULT false;
ALTER TABLE rounds ADD COLUMN deliberation_completed_at timestamptz;
```

### TypeScript additions in `src/types/index.ts`

```ts
export type ResponseKind = 'primary' | 'deliberation';

export interface DeliberationPushback {
  target_response_id: string;
  stance: 'agree' | 'disagree' | 'partial';
  summary: string; // 1-2 sentence rationale
}

export interface Response {
  // ... existing fields ...
  kind?: ResponseKind;
  deliberation_targets?: string[];
  deliberation_pushbacks?: DeliberationPushback[];
}

export interface Round {
  // ... existing fields ...
  deliberation_enabled?: boolean;
  deliberation_completed_at?: string | null;
}
```

---

## The Prompt Design

### Per-agent deliberation prompt template

```
You delivered the following response in Round 1 to this prompt:

> ORIGINAL PROMPT:
> {original_user_prompt}

> YOUR ROUND 1 RESPONSE:
> {agent_own_r1_response}

Three other voices also responded. They are presented below WITHOUT attribution.
Their identities have been deliberately withheld to keep your reasoning focused
on the ideas, not the source.

---
VOICE A:
{redacted_response_1}

---
VOICE B:
{redacted_response_2}

---
VOICE C:
{redacted_response_3}

---

Now answer THREE questions. Be specific. Reference voices by their letter.
A vague answer wastes the deliberation. Disagreement is welcomed; do not
soften your objections to be polite.

QUESTION 1 — STRONGEST OBJECTION YOU'D RAISE
What is the most important critique you would raise against any other voice?
Identify the voice (A/B/C) and the specific point. Do NOT critique your own.
If you have multiple, pick the one most likely to change someone's decision.

QUESTION 2 — WHERE YOU GENUINELY AGREE
Identify ONE point where another voice (A/B/C) said something you wish
YOU had said in Round 1. This is not flattery — only flag it if you
think the point is correct AND you missed it.

QUESTION 3 — STRONGEST OBJECTION TO YOUR OWN POSITION
Read your Round 1 response again. What is the strongest objection a
careful critic would raise against it? You must identify a real weakness.
Saying "no significant weakness" is not acceptable.

Return your answer as JSON:
{
  "objection": {
    "target_voice": "A" | "B" | "C",
    "point": "the specific claim being objected to",
    "rationale": "why this point is wrong or weak"
  },
  "agreement": {
    "target_voice": "A" | "B" | "C",
    "point": "the specific point being acknowledged",
    "why_i_missed_it": "why my Round 1 response did not include this"
  },
  "self_critique": {
    "weakness": "the strongest objection to my own Round 1 response",
    "rationale": "why this is a real weakness, not a hypothetical one"
  }
}
```

### Why these three questions specifically

- **Q1** elicits the dissent agents naturally suppress. Forcing an objection prevents echo collapse.
- **Q2** reveals where the consensus is real (not socially-pressured). If multiple agents flag the same point as "I missed this," it's signal.
- **Q3** is the most important. An agent that can articulate the strongest critique of its own position is doing real reasoning, not pattern-matching. This is also what surfaces in synthesis as "X agent acknowledged Y was a weakness in their proposal."

### Redaction algorithm

```
Voice mapping:
  - Get all R1 responses for this round (excluding the agent currently being prompted).
  - Sort deterministically by response.id (consistent ordering across calls).
  - Label first as "Voice A", second as "Voice B", etc.
  - Keep a per-agent voice_map: { 'A': response_id_x, 'B': response_id_y, ... }
  - Strip from each response:
      - Agent name in any leading/trailing context
      - Provider/model identifiers if mentioned
      - Stylistic markers? — NO (style leakage accepted in v1)
  - Keep ALL the substance. Markdown, code blocks, structure preserved.
```

After deliberation completes, reverse-map "Voice A" → real response ID before storing pushbacks.

---

## Synthesis Reformulation

The current concierge synthesis prompt blends responses. It must be rewritten to preserve tension explicitly.

### New synthesis prompt template (deliberation-aware)

```
You are synthesizing multiple expert voices on a question, AFTER they had
the opportunity to push back on each other. Both rounds are below.

ORIGINAL QUESTION:
{original_prompt}

ROUND 1 — INDEPENDENT RESPONSES:
{r1_responses_with_attribution}

ROUND 2 — DELIBERATION (each voice's objection / agreement / self-critique):
{r2_pushbacks_with_attribution}

Your synthesis MUST do all of the following:

1. Identify points where agents AGREED post-deliberation. These are the
   strongest signals — what did everyone, after pushback, still believe?

2. Identify points where agents DISAGREED post-deliberation. Do NOT blend
   these into a compromise. Surface them as: "Agent X argued for A;
   Agent Y argued for B; the disagreement was about [specific axis]."

3. Identify ACKNOWLEDGED WEAKNESSES — points where an agent admitted in
   self-critique that their own position had a real flaw. These are
   high-confidence concerns regardless of what was synthesized.

4. End with `unresolved_tensions` — a list of disagreements that were
   raised but not resolved. The user needs to make these calls themselves.

Output JSON:
{
  "consensus": "what survived deliberation",
  "trade_offs": [{ "axis": "...", "side_a": {...}, "side_b": {...} }],
  "acknowledged_weaknesses": [...],
  "unresolved_tensions": [...],
  "recommendation": "your best synthesis-of-record, with caveats"
}
```

This is the differentiator. A normal synthesis produces "the council recommends X." This synthesis produces "the council reached consensus on A and B, disagreed about C with these specific positions, and 2 of 4 agents acknowledged their proposal had weakness D — here is the recommendation, but you should make the call on C yourself."

That output is something no other AI tool produces today.

---

## When To Trigger Deliberation

Three modes — pick all three for v1:

### Mode 1: Manual toggle (always available)
A "Deliberate" pill in the composer next to send. When active, the broadcast triggers deliberation automatically before showing synthesis. Toggle persists per session, defaults off.

### Mode 2: Concierge-suggested (post-Round 1)
After Round 1 completes, concierge runs a quick triage: "Did the agents disagree significantly?" If yes, surface a "Run deliberation round?" button on the synthesis card. The triage is a fast Haiku call — checks for divergent recommendations on the same axis (e.g., one says "use Redux," another says "use Zustand").

### Mode 3: Auto-trigger for high-stakes prompts
Concierge intent classification (already exists in `concierge-triage`) flags high-stakes prompts: anything tagged `intent: 'pre_build' | 'design'` with multiple builders selected. For these, deliberation runs automatically unless the user has explicitly opted out for the session. This is where the value is highest.

User can disable any/all modes in TrustDrawer Settings.

---

## UX Surface

### During the deliberation round

The carousel shows a **deliberation overlay state**:
- Each FolioCard from R1 gets a yellow pulse indicating "being critiqued by others."
- A new "Deliberation in progress" status banner above the carousel.
- Streaming events from each agent's deliberation arrive in real time (depends on UX-02).

### After deliberation completes

Each FolioCard grows a **Pushbacks section** below the response body:

```
┌─ Folio Card (Sonnet's response) ─────────────────────────┐
│                                                           │
│  [original response content]                              │
│                                                           │
│  ─── Pushbacks ──────────────────────────────────────    │
│  🔴 GPT-5.5 disagreed: "Sonnet's caching strategy        │
│     ignores cold-start cost. The 50ms gain on hot path   │
│     is dwarfed by the 800ms p99 first-request hit."      │
│                                                           │
│  🟢 Gemini agreed: "Sonnet's API contract is the only    │
│     one that handles partial failures cleanly."          │
│                                                           │
│  ⚪ Sonnet self-critique: "My approach assumes auth is    │
│     synchronous; if it becomes async, redesign needed."  │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

### Synthesis card

The synthesis card grows two new sections:
- **Trade-offs** (collapsible): each disagreement axis surfaced as side-A vs side-B.
- **Unresolved tensions** (always visible): a numbered list of decisions the user must make themselves.

A button "Take this to a tiebreaker" — opens a one-shot follow-up prompt that asks a single targeted agent to make the final call, with all deliberation context.

---

## Files To Create/Modify

### New
- `supabase/functions/deliberate/index.ts` — orchestrator. Takes round_id, fetches R1 responses, dispatches deliberation prompts in parallel, collects responses, parses pushbacks JSON, writes back to DB.
- `supabase/functions/deliberate/redact.ts` — voice-mapping and redaction logic.
- `supabase/functions/deliberate/prompt.ts` — the prompt template with placeholder substitution.
- `src/components/reveal/DeliberationOverlay.tsx` — yellow-pulse visual state on the carousel during deliberation.
- `src/components/reveal/PushbacksSection.tsx` — the new section on FolioCard.
- New migration: `supabase/migrations/{ts}_add_deliberation.sql` (the `responses` and `rounds` columns above).

### Modified
- `supabase/functions/synthesize/index.ts` — switch to deliberation-aware prompt when round has `deliberation_completed_at`.
- `supabase/functions/concierge/index.ts` — add post-R1 triage for "should we deliberate?"
- `src/hooks/useOrchestration.ts` — add `runDeliberation(roundId)` and wire post-broadcast trigger logic.
- `src/components/reveal/RevealComposer.tsx` — add Deliberate toggle pill.
- `src/components/reveal/FolioCard.tsx` — render pushbacks section.
- `src/components/reveal/SynthesisDrawer.tsx` — render trade-offs and unresolved tensions.
- `src/types/index.ts` — types listed above.
- `src/lib/cost.ts` — deliberation rounds count as 2x token budget.

---

## Acceptance Criteria

1. **Manual toggle works.** With "Deliberate" toggled on, sending a broadcast produces both R1 and R2 responses in the DB; synthesis card shows trade-offs section.
2. **Redaction is real.** Inspect a deliberation prompt sent to Sonnet: it must contain "Voice A/B/C" labels, must NOT contain agent names, providers, or model identifiers in the labeled response bodies.
3. **JSON parsing tolerates known failure modes.** If an agent returns malformed pushbacks JSON, the deliberation does not abort — agent's contribution is logged as `kind='deliberation'` with empty `deliberation_pushbacks` and an error note in metadata. Other agents' deliberation still proceeds.
4. **Synthesis preserves tension.** On a contentious prompt (e.g. "Should this codebase use Redux or Zustand?"), the synthesis output's `trade_offs` array has at least one entry. The recommendation must reference both sides.
5. **Concierge auto-trigger fires correctly.** A `pre_build` intent prompt with 3+ active agents triggers deliberation without manual toggle.
6. **User can disable.** TrustDrawer Settings > "Auto-deliberation" toggle persists, disables Mode 3 (auto-trigger), keeps Mode 1 (manual toggle) functional.
7. **Cost reflects deliberation.** Cost rollup card (DIFF-01) shows R1 and R2 token usage separately.
8. **Streaming works.** Deliberation responses stream into the FolioCard pushback section as agents complete (assuming UX-02 has shipped).
9. **Style leakage disclosed.** TrustDrawer or hover-tooltip somewhere documents: "Voices are labeled to reduce brand bias, but writing style may still identify the agent. v2 will add neutral-voice rewriting."
10. **Failure mode: agent times out during R2.** Synthesis still runs with whatever pushbacks arrived. Missing agent's pushback row is `null`, synthesis prompt notes the gap.

---

## Verification (Live Tests)

1. **Contentious prompt smoke test.** Send "Should I use Redux or Zustand for a 200-component React app with 30 developers?" with 4 agents active and Deliberate ON. Expected: each FolioCard shows pushbacks, synthesis surfaces "agents disagreed about scaling assumptions" or similar, recommendation has caveats.
2. **Consensus prompt test.** Send "What's the typical syntax for a TypeScript interface?" with deliberate ON. Expected: pushbacks are mostly green (agreement), trade_offs is empty or trivial, synthesis is brief.
3. **Style leakage check.** Inspect deliberation prompt logs. Confirm voice labels stable per round; confirm no model names in redacted bodies.
4. **Cost validation.** Run with deliberate OFF; same prompt with deliberate ON. Confirm token spend is roughly 1.5-2x (not 3x — deliberation responses are shorter than R1 responses).
5. **Failure injection.** Force one agent to return invalid JSON in deliberation. Confirm synthesis still completes.

---

## Decisions Made

### Q: Why redact attribution if style leaks anyway?
**A:** Even imperfect redaction reduces conscious brand bias. An agent reading "Voice C says X" treats X on its merits more than an agent reading "Sonnet says X" or "GPT says X." Style leakage is partial; explicit attribution is total. Partial mitigation > no mitigation. v2 adds neutral-voice rewriting to close the gap.

### Q: Why JSON output instead of free-form prose?
**A:** Pushbacks must be structured to render in the UI as discrete cards and to feed synthesis as enumerable trade-offs. Free-form prose forces a second-pass extraction step that adds latency, cost, and parsing failure modes.

### Q: Why three questions specifically?
**A:** Tested mentally against the failure modes. Two questions (objection + agreement) misses self-critique, which is the highest-signal output. Four questions stretches token budget and reduces per-question quality. Three is the empirical sweet spot for structured deliberation tasks.

### Q: Should deliberation be one round or N rounds?
**A:** **One round in v1.** Multi-round deliberation has diminishing returns — by R3, agents are echoing R2. The synthesis prompt is the right place to handle remaining tension, not a third round. v3 might add "deep deliberation" for high-stakes calls.

### Q: What if only 2 agents are active?
**A:** Skip deliberation. With 2 voices, deliberation collapses to a 1-on-1 critique which has different dynamics (and is more like an iteration loop than a board). Show a hint: "Deliberation requires 3+ active agents."

### Q: Where does deliberation cost get attributed in cost.ts?
**A:** Same as R1: per-agent token costs. The cost rollup card (DIFF-01) shows them as a separate line item ("Deliberation round: $0.X").

### Q: Should the user see the deliberation prompts agents received?
**A:** Yes, via a "View prompt" disclosure on the deliberation card. Transparency builds trust in the synthesis. Hidden in v1 behind a click; not a default surface.

### Q: Concierge model for the post-R1 triage (Mode 2)?
**A:** Haiku 4.5 only. Fast, cheap, sufficient for "did agents disagree significantly y/n?". Reuses existing `concierge-triage` infrastructure.

---

## Open Questions for Human Review

These do NOT block implementation but warrant judgment before final design:

1. **Default mode.** Should auto-deliberation (Mode 3) be ON or OFF by default for new users? **Opus recommendation: OFF, with a one-time prompt during onboarding asking the user to opt in.** Auto-cost surprises are bad UX.
2. **Should low-confidence R1 responses (e.g., agent admitted uncertainty) trigger deliberation regardless?** Maybe. Defer to v2.
3. **What if an agent refuses to deliberate (returns "I have no objection to raise")?** Force a retry once with a stronger prompt. If still no, accept it — but log it as a metric (which agents disengage from deliberation? This is signal about the agent's reasoning quality).
4. **Visualization of pushback graph.** A future visual showing the agree/disagree network across agents could be powerful (think: "Sonnet and Gemini converged; GPT was the dissent"). Out of scope for v1; recommended for v2.

---

## Implementation Order

This is the suggested sequence for the implementing agent. Each step is independently shippable.

1. **Migration first.** Add `responses.kind`, `responses.deliberation_targets`, `responses.deliberation_pushbacks`, `rounds.deliberation_enabled`. Backfill existing responses with `kind='primary'`. Ship migration alone.
2. **Edge function.** Build `deliberate/index.ts` with hardcoded test inputs. Run end-to-end against a real round_id via curl. Verify pushbacks JSON parsing, redaction logic, DB writes.
3. **Synthesis update.** Modify `synthesize/index.ts` to detect `deliberation_completed_at` on the round and use the new prompt template. Test that synthesis still works when deliberation_completed_at is null (backwards compat).
4. **Frontend Mode 1 (manual toggle) only.** Add the Deliberate pill to RevealComposer. Wire `runDeliberation()` in useOrchestration. Show pushbacks on FolioCard. Ship and smoke-test.
5. **Frontend pushback rendering.** PushbacksSection component. Trade-offs and unresolved tensions on synthesis card.
6. **Mode 2 (concierge-suggested) and Mode 3 (auto-trigger).** Add post-R1 triage and auto-trigger logic.
7. **TrustDrawer settings.** Allow user to disable modes individually.
8. **Cost integration.** Update cost.ts to track deliberation token spend separately.
9. **Live test on a contentious prompt.** Smoke test the full flow.
10. **Documentation.** Update CLAW_MODE_SPEC.md or create a new DELIBERATION_SPEC.md user guide.

---

## What This Spec Does NOT Cover

- **Multi-round deliberation (R3+).** v1 is one deliberation round only.
- **Neutral-voice rewriting** to defeat style leakage. Deferred to v2.
- **Iteration loop integration** (PRO-02). Iteration loops with deliberation between steps is interesting but separate.
- **Custom deliberation prompts per session.** All deliberation uses the same prompt template; user can't override yet.
- **Cross-session deliberation memory.** Deliberation is per-round only; long-term agent reputation tracking is out of scope.

---

## Hand-off Notes

This task is tagged Opus-only because the prompt design and trade-off architecture are not mechanical. Sonnet can implement the data model migration, the React components, and the route wiring — but the deliberation prompt template itself, the synthesis reformulation, and the redaction algorithm should be reviewed by Opus before they ship.

**Suggested split:**
- Opus: prompt template (`prompt.ts`), redaction (`redact.ts`), synthesis prompt update.
- Sonnet: migration, React components, hook wiring, TrustDrawer settings, cost integration.

If implementing without Opus review, **stop after step 2 (edge function)** and have an Opus session validate the prompt outputs on real test data before continuing.

---

*End of PRO-01 spec.*
