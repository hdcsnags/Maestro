# UX_FLOW_FIRST_SPEC.md

**Codename:** FLOW-FIRST
**Status:** Spec — pending Conductor approval, no implementation started
**Authored:** 2026-05-10 by Opus 4.7 (Claude Code, this conversation)
**Builds on (already shipped):** `UNIFIED_UX_SPEC.md` Phases 0–10 (one shell, thread spine, in-thread cards, premium event cards, realtime progress, status chip)
**Composes with (not yet shipped):** `SOCIETY_OF_MIND_NATIVE_SPEC.md` (streaming, personas)
**Required reading:** `UNIFIED_UX_SPEC.md`, `MAESTRO_STATE.md`, `CLAW_MODE_SPEC.md`, `HANDOFF_CLAW_UX.md`, `CLAW_UI_ISSUES.md`, `SOCIETY_OF_MIND_NATIVE_SPEC.md`

---

## 1. Why this exists

`UNIFIED_UX_SPEC.md` collapsed two parallel apps into one chat-first shell. That ship was correct and is in production. But the surface still **leaks the underlying machinery**:

- **Four-mode routing bar** (`Direct / Council / Execute / Build`) forces the Conductor to classify intent before sending — backwards. Concierge can do this.
- **Orb is decorative**, not a status instrument. The Conductor reads system messages to learn what's happening; the orb is wallpaper.
- **System messages and event cards are verbose by default**. Build flow scrolls a wall of text. The Conductor wants a clean stream of one-liners they can expand on demand.
- **Build still feels like a takeover.** The in-thread card works, but rich review (manifest, PR follow-up, bouncer findings) ejects to BuildWorkspace.
- **Personas can't be summoned conversationally.** Calling in specific voices requires menu navigation.
- **Drawer hot keys from v1 may still be wired but are hidden.** No command palette. Power flow is mouse-driven.

The Conductor's stated mental model: *"land at the main page, from general conversation direct the flow, bring in the council or council with persona-driven debate only when necessary, ping-pong between ideas while a build runs."*

This spec is the surface layer that delivers that.

---

## 2. Scope

| In | Out (deferred) |
|----|----------------|
| Concierge-classified intent (kills the segmented bar) | Voice input / output |
| Orb as primary status instrument with caption | Mobile-first redesign (mobile must not break, desktop-first stays) |
| In-chat sticky build runway with collapsible inspection | Replacing the carousel (gains expand actions only) |
| Verbosity tiers (one-line default, expand on demand) | Retiring BuildWorkspace (becomes pure advanced inspection) |
| Conversational persona summoning (`@name`, natural language) | Multi-user / collaborative threads |
| Command palette + hot keys audit | Real-time co-editing |
| "Council watching" awareness chip | Per-project Supabase config (still removed, not built) |

---

## 3. Owner split

This is mostly UX wiring — Sonnet territory. Opus owns three small prompt artifacts and one heuristic.

**Opus 4.7:**
- FLOW-01 intent classification prompt extension (concierge-triage)
- FLOW-04 one-line summary generation prompt (where LLM-summarized cards are needed; some cards can use deterministic templates)
- FLOW-05 natural-language persona-trigger prompt ("the Chinese AIs", "a contrarian read", etc.)
- FLOW-02 system-tension derivation rules (small heuristic spec, not code)

**Sonnet 4.6:**
- All UI components, hooks, types, reducer extensions, hot key wiring
- Slash command parser
- Realtime selector for orb state
- Verbosity tier components (collapsed/expanded variants)
- Mention autocomplete
- Command palette
- Sticky build runway behavior

If Sonnet hits an Opus-owned section, ship the structural code with a `TODO(opus)` placeholder. Same convention as PRO-01 / SOM-NATIVE.

---

## 4. Sub-features

### FLOW-01 — Kill the intent toggle. Concierge classifies.

**Why:** The `Direct / Council / Execute / Build` segmented bar (kept by `UNIFIED_UX_SPEC.md` Phase 1) is the loudest thing in the composer. It also forces intent classification before the message is written. Concierge triage already classifies in <300ms — it can route.

**What:**
- Remove the segmented bar from `RevealComposer`. The composer is one textarea + one Send.
- Concierge triage extends to return `{ intent: 'chat' | 'broadcast' | 'execute' | 'build' | 'iterate' | 'persona_summon', confidence, reason }`.
- Send dispatches based on classification.
- If classification is below confidence threshold (start: 0.7), an inline pill in the response says: *"I treated this as a build request — switch to council instead?"* — single tap reroutes with no re-typing.
- **Slash-command override:** `/council`, `/build`, `/execute`, `/iterate`, `/direct <agent>` force routing. Power user escape hatch.
- "What will Send do?" preview: a small caption under the textarea predicts intent **before send** (debounced classification on typing, only fires after 12+ chars). Same caption Unified UX Phase 1 specced as a consequence label, now driven by classification not by toggle state.

**Files:**
- `src/components/reveal/RevealComposer.tsx` — strip segmented bar, add slash parser, add live preview caption
- `supabase/functions/concierge-triage/index.ts` — extend response shape
- `src/hooks/useThreads.ts` — `handleSubmit` dispatches based on classification
- `src/types/index.ts` — `ClassifiedIntent`, `IntentMisroute` types
- `src/components/reveal/IntentMisroutePill.tsx` (new) — inline reroute pill
- `src/lib/slashCommands.ts` (new) — parser

**Owner:** Sonnet (plumbing) + Opus (classification prompt extension)

**Ship size:** ~2 days Sonnet + 1 day Opus prompt validation

**Verification:** 20-prompt fixture (mix of intents) hits ≥85% correct routing; misroute pill renders correctly when confidence < threshold; slash commands always override.

**Risks:**
- Misclassification on ambiguous prompts is the failure mode. Mitigation: threshold + pill + slash override gives three layers of correction.
- Removing a visible state surface can feel like loss-of-control to power users. Mitigation: classification preview caption keeps the signal visible.

---

### FLOW-02 — Orb as the status sentence

**Why:** The orb is currently decorative. The Conductor wants visual state awareness *before* reading any text. One glance at the orb should answer "what's the system doing right now?"

**What:**
- **Color** = system tension/state:
  - Gold = consensus / idle
  - Amber = disagreement detected (deliberation triggers fired) OR build retry in flight
  - Red = blocker / human gate (bouncer findings critical, approval pending, executor offline mid-build)
  - Blue = active streaming (council mid-response, build mid-write)
- **Pulse** = activity heartbeat: slow = thinking, fast = build executing, irregular = waiting on provider
- **One-line caption directly underneath** updates live: *"3 builders writing"*, *"Sonnet vs Kimi disagree on auth approach"*, *"PR #42 ready for review"*, *"Bouncer found 2 informational issues"*
- **Caption is clickable** — opens the relevant thread/card in the spine
- **"Council watching" badge** in caption when broader council is reading the conversation. Cue for the Conductor's stated insight that *"the council itself being aware that other agents are reading everything do naturally do better."*

**State derivation (Opus-spec'd, Sonnet-implemented):**

System tension is computed from a selector across:
- `state.executorJobs` — any running/claimed → blue pulse + count caption
- `state.iterationLoops` — any awaiting approval → red + caption
- `state.responses` (current round) — embedding distance > 0.35 across 3+ → amber
- `state.buildTasks` — retries > 0 → amber
- `state.bouncerFindings` — severity critical → red, severity warn → amber, severity info → no escalation
- Concierge-emitted `deliberation_recommended` signal → amber

**Files:**
- `src/lib/systemTension.ts` (new) — derivation selector
- `src/components/orb/OrbStatus.tsx` (audit existing — likely refactor) — color + pulse driven by tension state
- `src/components/orb/OrbCaption.tsx` (new) — one-line caption
- `src/context/MaestroContext.tsx` — `systemTension` derived state hook
- Existing realtime subscriptions in `useThreads`, `useBuildExecution`, `useIterationLoop` feed this — no new subscriptions needed

**Owner:** Sonnet (everything except the derivation rules) + Opus (rules document — shipped as inline comments in `systemTension.ts`)

**Ship size:** ~2 days Sonnet + 0.5 day Opus

**Verification:** scripted test cases — submit a contentious round, watch orb go gold → blue (streaming) → amber (disagreement) → gold (consensus). Bouncer flags critical → red. Build runs → blue pulse fast.

---

### FLOW-03 — Sticky in-chat build runway. Drawer is advanced-only.

**Why:** Unified UX Phase 4 made build runway in-thread, but rich manifest review and PR follow-up still eject to BuildWorkspace. The Conductor wants to ping-pong between ideas while build runs — chat must stay open, build card must stay reachable.

**What:**
- Build runway card sticks at the bottom of the active thread when build is running. Collapses to a one-line strip *"Build • 4 builders • 12/76 files • 3m elapsed"* when scrolled past. Click strip = expand + scroll to position.
- Manifest review opens as an **in-card tab**, not a drawer. Three tabs in expanded card: `Progress`, `Manifest`, `Logs`.
- PR-opened becomes an **event card in the thread** with `Review on GitHub`, `Ask about this build`, `Roll back` actions. No drawer.
- Bouncer findings render as a **runway sub-card** below the build card, collapsed by default with severity counts (`12⚠ 3🚨`). Click to expand.
- Composer textarea **stays mounted at the bottom of the screen at all times**. Build active or not. Conductor can chat while build runs — those messages fork into new context cards Concierge can answer without aborting the build.
- BuildWorkspace stays as advanced/inspect mode, reachable via `⌘B` or a `View advanced` link in the runway card. Never the default.

**Files:**
- `src/components/reveal/ClawBuildSessionCard.tsx` — sticky bottom positioning, collapsed-strip mode, three-tab expansion
- `src/components/reveal/BuildManifestPanel.tsx` (new — extract from BuildWorkspace) — inline manifest viewer
- `src/components/reveal/PROpenedCard.tsx` (audit, likely promote to event card) — surface as thread message
- `src/components/reveal/BouncerCard.tsx` — collapsed-by-default mode with counts
- `src/components/reveal/ClawMode.tsx` — sticky positioning logic, composer stays mounted
- `src/components/reveal/BuildWorkspace.tsx` — relegated to advanced; add "advanced" badge

**Owner:** Sonnet entirely

**Ship size:** ~3 days

**Verification:** real build run; chat input remains reachable through entire build flow; PR opens without modal; bouncer findings collapse-by-default with one-glance severity counts; clicking strip expands at correct scroll position.

---

### FLOW-04 — Verbosity tiers. Default terse, expand on demand.

**Why:** Premium event cards (Unified UX Phase 7) are structurally right but visually long. Build flow currently scrolls a wall of expanded cards. The Conductor wants to skim one-liners and dive into anything specific.

**What:**

Every event card has two display states: **summary** (one line) and **detail** (current full render).

| Card type | Summary line example |
|-----------|---------------------|
| Synthesis | `Council reached consensus · 2 unresolved tensions · click to read` |
| Build runway | `Build · 4 builders · 76/76 ✓ · PR #42 · 8m total` |
| Bouncer | `Bouncer · 12⚠ 3🚨 · review pending` |
| Pre-Build (combined) | `Plan · React + Supabase · 4 lanes · spec locked` |
| Deliberation | `Deliberated · 3 objections · 1 acknowledged weakness` |
| PR opened | `PR #42 opened · 12 files · backup branch saved` |
| Execution approval | `Approve: npm run build · trusted command` |
| Iteration loop | `Iterating · step 3/20 · last verify ✓` |

- Default state for every card: **summary**.
- Click anywhere on the summary line → expand to detail.
- Detail view has a `collapse` action top-right.
- Per-thread "expand all" / "collapse all" in command palette.
- **Global terse mode toggle** in settings (default: on). When off, cards default to detail.

**Implementation pattern:**

```ts
type EventCardDisplay = 'summary' | 'detail';

interface EventCard<Payload> {
  id: string;
  type: EventCardType;
  payload: Payload;
  defaultDisplay: EventCardDisplay;  // user-overridable
  summarize: (payload: Payload) => string;  // deterministic where possible
  Detail: React.FC<{ payload: Payload }>;
}
```

Most summaries are deterministic (counts, phase names, file totals). Synthesis and deliberation summaries benefit from LLM compression — that's the Opus-prompt slice.

**Files:**
- `src/components/reveal/EventCardShell.tsx` (new) — shared summary/detail wrapper
- `src/lib/cardSummaries.ts` (new) — deterministic summary generators per card type
- `supabase/functions/_shared/card-summary-prompt.ts` (new, Opus) — LLM summary for synthesis / deliberation
- All existing `*Card.tsx` files in `src/components/reveal/` — refactor through `EventCardShell`
- `src/types/index.ts` — `EventCardDisplay`, per-card display preference
- `src/components/reveal/SettingsDrawer.tsx` — global terse mode toggle

**Owner:** Sonnet (everything) + Opus (compression prompt for synthesis/deliberation summaries)

**Ship size:** ~3 days Sonnet + 0.5 day Opus

**Verification:** full build flow renders as a stream of ≤8 one-line cards; expand any card returns to current detail view; "expand all" via palette restores legacy verbose mode for power users.

---

### FLOW-05 — Conversational persona summoning

**Why:** The Conductor wants persona-driven debate to feel summoned, not menu-driven. *"@Ada what would security think?"* should fire a specific persona inline. *"Have the Chinese AIs review this"* should target Kimi/Qwen agents. The current path requires picking agents in OrchestraDrawer.

**Depends on:** SOM-04 personas being live (FLOW-05 cannot ship before SOM-04).

**What:**
- `@<name>` autocomplete in composer — surfaces persona names + agent names
- Sending with `@mention` routes to that persona/agent's direct thread, with the current thread context attached as a quoted block (so the agent has context without re-reading)
- Concierge-triage natural-language intent `persona_summon` (FLOW-01 wires this) detects:
  - *"the Chinese AIs"* → Kimi + Qwen agents
  - *"a contrarian read"* → highest-priors-disagreement persona
  - *"what does security think?"* → security-priors persona (when one exists)
  - *"have the council debate"* → fires deliberation manually
- Concierge confirms the routing in a one-line caption: *"Asking @Ada and @Kimi to weigh in"*

**Files:**
- `src/components/reveal/RevealComposer.tsx` — `@mention` parsing
- `src/components/reveal/MentionAutocomplete.tsx` (new)
- `supabase/functions/concierge-triage/index.ts` — natural-language persona triggers
- `src/hooks/useThreads.ts` — handle persona-summon intent
- `src/lib/personaTriggers.ts` (new) — natural-language → persona-set mapping (Opus-spec'd)

**Owner:** Sonnet (UI + plumbing) + Opus (natural-language trigger prompt + mapping table seed)

**Ship size:** ~2 days Sonnet + 1 day Opus, **after SOM-04 ships**

**Verification:** typing `@A` autocompletes "Ada"; sending with mention spawns direct thread with persona; saying "have the Chinese AIs review this" fires Kimi + Qwen with current thread context attached.

---

### FLOW-06 — Command palette + hot keys audit

**Why:** v1 had drawer hot keys. Code likely still wires them — `useEffect` keydown listeners don't decay. They're invisible to new users. Power flow should be keyboard-only.

**What:**

Audit pass first:
1. `grep` for `keydown` listeners across `src/`
2. Catalog every existing shortcut
3. Document in palette help

Then ship a `⌘K` command palette (Cmd on Mac, Ctrl on Win) that searches:
- Agents (focus / direct chat)
- Threads (switch)
- Sessions (switch)
- Files in repo (when bound)
- Commands (slash command equivalents)
- Settings (terse mode, execution mode, model picker)

Default keymap (audit may surface conflicts — adjust):

| Combo | Action |
|-------|--------|
| `⌘K` | Open palette |
| `⌘Enter` | Send composer |
| `⌘1`-`⌘9` | Switch thread by index in sidebar |
| `⌘B` | Open BuildWorkspace (advanced) |
| `⌘D` | Fire deliberation manually |
| `⌘E` | Escape to concierge thread |
| `⌘.` | Toggle terse / verbose mode |
| `⌘Shift+P` | Fire all personas (debate) |
| `⌘/` | Open keymap help |
| `Esc` | Collapse expanded card / close drawer |
| `↑` in composer | Recall last prompt |

**Files:**
- `src/components/CommandPalette.tsx` (new)
- `src/hooks/useHotkeys.ts` (audit + new shared hook)
- `src/lib/keymap.ts` (new) — single source of truth
- `src/components/reveal/ClawMode.tsx` — wire palette
- `src/pages/WorkspacePage.tsx` — wire palette
- Audit removes: any duplicate / orphan keydown listeners

**Owner:** Sonnet entirely

**Ship size:** ~3 days (1 day audit, 2 days palette + wiring)

**Verification:** every shortcut documented in palette help; no duplicate listeners; palette opens in <100ms; fuzzy search matches across all categories.

---

## 5. Implementation order

Priority based on highest "feels different" return per ship-day:

1. **FLOW-02 orb status + FLOW-04 verbosity tiers** — biggest single visual shift, can ship in parallel by different agents (no shared files)
2. **FLOW-03 sticky build runway** — delivers ping-pong-while-building experience
3. **FLOW-06 command palette + hot keys** — exposes existing power flow, low risk
4. **FLOW-01 kill intent toggle** — riskier (depends on classification accuracy); ship after orb cleanup so misroute pill cost is observable in calm UI
5. **FLOW-05 persona summoning** — must ship after SOM-04 (persona records)

Sonnet can pick up FLOW-02 immediately. FLOW-04 in parallel. FLOW-03 after either lands. FLOW-06 anytime. FLOW-01 needs Opus on the classification prompt before it can land cleanly.

---

## 6. Dependencies and composition

| Ships | Depends on | Composes with |
|-------|-----------|---------------|
| FLOW-01 | concierge-triage extension | SOM-02 (auto-deliberation classifies as one of the routed intents) |
| FLOW-02 | existing realtime subscriptions | SOM-01 streaming (orb pulses on token stream) |
| FLOW-03 | Unified UX Phase 4 (in-thread runway) | SOM-03 cross-CLI critique (renders in runway as critique tab) |
| FLOW-04 | premium event cards (Unified UX Phase 7) | All event-emitting features benefit |
| FLOW-05 | SOM-04 personas | FLOW-01 (persona summon is a classified intent) |
| FLOW-06 | nothing | All features become keyboard-driven |

**Key composition with SOM-NATIVE spec:**
- SOM-01 streaming + FLOW-02 orb = orb pulses blue while council streams. Without streaming, the blue state is brief.
- SOM-02 auto-deliberation + FLOW-01 = classifier surfaces deliberation as a routing decision, not a button.
- SOM-04 personas + FLOW-05 = persona names become real `@mention` targets.
- SOM-03 cross-CLI critique + FLOW-03 = critique results render as a tab in the build runway, not a separate surface.

If both specs ship, they reinforce each other. If only one ships, both work independently but feel less complete.

---

## 7. Open questions for the Conductor

1. **Orb location:** stays in topbar (Unified UX placement) or promoted to a larger persistent surface left of the thread? Recommendation: topbar stays, but increase size 1.5× and pin caption directly below. Don't add a new surface.
2. **Verbosity default:** terse on or terse off out-of-box? Recommendation: terse on. Power users discover expand quickly; new users aren't drowned.
3. **Misroute pill persistence:** show on every misroute, or once per session per misroute type? Recommendation: every misroute for first 50 sends, then auto-hide if accuracy > 90%. Telemetry-driven.
4. **Slash command list:** the seven I listed (`/council`, `/build`, `/execute`, `/iterate`, `/direct`, `/persona`, `/help`) — add or trim?
5. **Hot keys audit:** if v1 keys conflict with palette defaults, which wins? Recommendation: palette wins for new keys; preserve v1 keys that don't conflict.
6. **"Council watching" badge:** is it always-on (council is always reading) or toggle-able (some sessions are private)? Recommendation: always-on — that's the alignment behavior the Conductor described as productive.
7. **Mobile:** Unified UX kept desktop-first. Confirm same constraint here? Recommendation: yes — sticky build runway and command palette assume desktop screen real estate.

---

## 8. Out of scope (intentional)

- Voice input/output
- Mobile-first redesign (mobile must not break, desktop-first stays)
- Replacing the carousel — gains expand / pin / compare actions only (already in Unified UX scope)
- Retiring BuildWorkspace — becomes pure advanced inspection
- Per-project Supabase config (placeholder removed, not built — Unified UX position)
- Real-time co-editing
- Theming / aesthetic redesign (separate concern)

---

## 9. Verification gates

Same as SOM-NATIVE:
1. `npm run typecheck` clean
2. `npm run build` clean
3. Live verification entry in `MAESTRO_STATE.md` Part 2 with date
4. Session log entry in Part 3 per AGENTS.md Rule 1
5. **Additional gate for this spec:** Conductor walk-through of one full build flow before marking shipped. UX is felt, not unit-tested.

---

## 10. Conductor sign-off needed

This spec deliberately overrides three decisions from `UNIFIED_UX_SPEC.md`:
- **Segmented routing bar** (Unified UX Phase 1) — kill it (FLOW-01)
- **Orb as topbar status** (Unified UX Phase 9) — promote to primary instrument (FLOW-02)
- **Verbose event cards** (Unified UX Phase 7) — flip default to summary (FLOW-04)

Each override is intentional based on the Conductor's stated direction. Conductor should explicitly confirm or reject each override before Sonnet starts.

Conductor should also:
- Approve order
- Approve open question recommendations or override
- Confirm FLOW-05 sequencing behind SOM-04
- Decide whether FLOW-FIRST and SOM-NATIVE ship in parallel (different file surfaces, low conflict) or sequentially

Once approved, Sonnet starts FLOW-02 + FLOW-04 in parallel; Opus drafts the four prompt artifacts (FLOW-01 classification, FLOW-04 LLM summaries, FLOW-05 trigger prompt, FLOW-02 tension rules document).

---

## 11. Anti-goals (what good looks like)

- The Conductor lands on the page. Orb is gold and idle. One-line caption: *"Ready when you are."* Composer is one textarea + Send.
- Conductor types: *"build me a flashcard app with spaced repetition"*. Caption preview reads *"build request — will draft plan with concierge"*. Send.
- Concierge replies in one event card collapsed to *"Plan drafted · 4 lanes · review?"*. Conductor expands, approves.
- Build runs. Orb pulses blue. Caption updates: *"4 builders writing"*. Conductor scrolls up, asks a follow-up about a previous council round. Concierge answers in the thread. Build keeps running.
- Disagreement detected mid-build. Orb goes amber. Caption: *"Sonnet vs Kimi disagree on session storage."* Conductor types *"have the council debate this"*. Deliberation fires. Carousel sheet opens with three voices. Streams in.
- Build completes. PR card lands. Bouncer card collapses with `12⚠ 3🚨`. Conductor expands bouncer, approves. Done.
- Whole flow: ~6 cards in the thread, 2 expansions, 0 drawer takeovers, no mode toggling.

If the build above feels heavier than that paragraph reads, the spec failed.
