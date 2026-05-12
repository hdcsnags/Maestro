# Unified UX — Scope of Work & Phased Plan

*Draft v0.1 — 2026-05-01. Author: Claude Sonnet 4.6 (with Michael). Source: fresh-eyes audit of regular mode + Claw mode after the chat-first migration. Every agent picking up a phase below should read this doc plus `MAESTRO_STATE.md`, `CLAW_MODE_SPEC.md`, `CLAW_BUILD_V2_SPEC.md`, and `HANDOFF_CLAW_UX.md` before editing.*

---

## TL;DR

Maestro currently runs as **two parallel apps glued by state shims**:

- A phase-gated workspace shell (`WorkspacePage` → orb + carousel + drawers + modals)
- A chat-first execution shell (`ClawMode` → threads + segmented routing bar + in-thread cards) that **replaces** the workspace when active.

Every "lagging restraint" the conductor feels comes from the same root: there are two ways to do every phase, and the seams are visible to the user. This SOW deletes the seams. The end state is **one workspace, one thread spine, one composer, one build runway** that handles edge / local / hybrid execution uniformly. Claw is no longer a mode — it's the workspace. The drawers and modals become advanced inspection surfaces, not the primary UX.

**Goal:** ship a seamless flow where the conductor never thinks "am I in Claw or regular?" — only "what phase am I in, what does Send do right now, what's the next decision?"

---

## 1. Root cause — the five (six) mode-axes problem

Today the user must align state across these axes:

| Axis | Where it lives | What it controls | Today's surface |
|------|----------------|------------------|-----------------|
| `sessions.mode` | DB | Ask vs Build | Composer pill (`RevealComposer.tsx:282`) |
| `state.orchestrationMode` | reducer | analysis / build / artifact for `orchestrate` | Composer pill |
| `state.executionMode` | reducer | analyze / pr_flow / elevated (GH safety) | Trust drawer |
| `sessions.execution_backend` | DB | edge / local / auto (where build runs) | Pre-Build only |
| `sessions.current_phase` | DB | analysis / design / pre_build / build / bouncer / complete | Phase rail in BuildWorkspace |
| `state.clawModeActive` | reducer | which shell renders | Claw button in composer |

Six places state lives. Three of them dictate *"what does Send do right now."* No conductor can hold that in their head. Collapsing this is the highest-leverage fix in the entire SOW.

**Target reduction:**

- Drop `state.orchestrationMode` — fold into `sessions.mode` ('ask' = analysis-only; 'build' = full pipeline; artifact stays available as a tool inside chat).
- Drop `state.clawModeActive` — there's only one shell.
- `sessions.execution_backend` becomes a per-build choice surfaced in the build runway card, not a Pre-Build pre-flight.
- `state.executionMode` (analyze / pr_flow / elevated) becomes a header chip in the topbar.

Final mental model: **`mode` (Ask/Build) + `current_phase` (timeline position) + `executionMode` (safety chip)**. Three axes, all visible at once.

---

## 2. Audit findings (condensed, by phase)

For each phase: regular mode today / claw mode today / what's broken. The full audit lives in chat history; below is the version another agent needs to act on.

### 2.1 Chat (concierge) phase

**Regular today:** `ConciergePanel` is a modal overlay that appears *only after* a council round, with alignment/tension/direction cards and a "Proceed → next phase" pill. There is no "just chat with concierge" surface. EmptyStage shows the orb but no chat affordance.

**Claw today:** Concierge is a real 1:1 thread (`ClawMode.tsx:1055-1142`) with a model picker and a sidebar of past threads. Correct primitive — but:

- Intent consequence label is `text-white/40` and tiny (`ClawMode.tsx:1264-1267`). The most important "what will Send do?" signal in the app, set to ghost.
- System messages are emoji-prefix plain text parsed by `detectSystemCategory` (`ClawMode.tsx:1336-1342`) — looks like cheap chat noise, not a premium event log.
- Pending execution approval is a card inside the thread (`ClawMode.tsx:1092-1133`) but exits Claw with no persistence (`SET_PENDING_EXECUTION` is transient).
- Ask-the-council-anyway / Convert-to-Build / Round 2 / Override / Report actions exist only in the modal (`ConciergePanel.tsx:401-440`). Power users lose them in Claw.

**Verdict:** Two visual grammars for the same role. Concierge needs to be one persistent thread surface, with synthesis rendered as a **structured event card inside the thread** (not a modal).

### 2.2 Broadcast phase

**Regular today:** Strongest part of the app. `RevealComposer` agent dots → `broadcast()` → `FolioCarousel` → `HeroContext` round navigator (Up/Down rounds, Left/Right cards) → `SynthesisDrawer` → `ConciergePanel`. Carousel is good UX. Round navigator is the right pattern.

**Claw today:** Carousel view embeds the same `FolioCarousel` (`ClawMode.tsx:1145-1177`) plus an agent quick-focus bar to spawn direct threads.

**Broken:**

1. **Discoverability** — segmented bar is too quiet, consequence label invisible.
2. **Auto-show transitions differ** — regular shows "watch council →" pill in EmptyStage (`EmptyStage.tsx:114-138`); Claw silently posts a system message. Same event, two different transitions.
3. **No reading tools** — carousel lets you read but not operate. No "Compare", "Pin claim", "Extract decision", "Ask follow-up from here". Direct-thread is the only follow-up affordance.
4. **Synthesize button** lives in two homes (Synthesis drawer in regular, composer in Claw) with different rules.
5. **Triage modal** (`ConciergePanel.tsx:165-226`) only fires in regular mode. Claw silently bypasses fast-path triage. Inconsistent product behavior.

**Verdict:** Broadcast becomes an action you take in the persistent thread, not a mode you toggle. The carousel is a reading view of a broadcast event card. Reading tools write back to the thread so the spine stays intact.

### 2.3 Plan / Pre-Build phase

**Regular today:** `PreBuildPanel` is a right-side drawer (1429 lines). Sections: project type → repo connect → builder roster (count + dropdowns) → infrastructure (placeholder, **dead**, `:769-824`) → scan + architect → lane assignment → backend selector (Edge/Local/Auto, `:1236-1251`) → "Go to Build" (`:1271`).

**Claw today:** No native plan UX. `useThreads.buildFromChat` (`:887-1000`) detects setup-not-ready (`:925`) and **ejects** to the Pre-Build drawer.

**Broken:**

1. Densest screen in the app, only entered via ejection. Power-user wall on first Build.
2. Builder dropdown only shows status for Claw agents (`:755-757`) — cloud agents have no API-key-status indicator. Information asymmetry.
3. Selecting a Claw builder silently flips backend to Local (`:299-302`). No banner, no confirmation. If executor is offline, user is stuck and confused.
4. Backend selector is below the Lock button (`:1230-1262`). Two-step dance to change.
5. ARCHITECT.md preview clipped to 200px (`:983-1000`). For the doc that defines the build, way too small.
6. Status indicator says "Ready to build" but the CTA is 50px above (`:1264-1314`). Discovery split.
7. Dead Supabase placeholder (`:769-824`) explicitly marked "coming in a future sprint."
8. Plan never appears in the timeline. No event card to scroll back to or fork.

**Verdict:** Pre-Build becomes a sequence of plan event cards Concierge produces in the thread. The drawer becomes optional power-user inspection.

### 2.4 Build phase

**Regular today:** `BuildWorkspace.tsx` (2819 lines) owns: phase rail, broadcasting, reviewing, task_decomposing, task_building, session_building, executing, bouncer, complete. Almost every UX feature you want is in here, but it's a drawer.

**Claw today:** `ClawBuildSessionCard` (454 lines) renders an in-thread card with adapter dropdown, scope input, builder list, executor status, Start, progress, manifest preview, Push to GitHub. **Only** triggered when `buildFromChat` decides backend is local-with-online-executor (`useThreads.ts:962`). Anything else punts to the drawer.

**Broken:**

1. **Two task models in one hook.** `useBuildExecution.ts` has both per-file `build_task` (`:730-796`) and per-builder `build_session` (`:387-515`). `BuildWorkspace.tsx:365` decides at runtime via `prefersSessionBuild`. User can't tell which is running; failure modes differ.
2. **Hybrid builds aren't truly hybrid.** "Auto" backend resolves per task (`:226-238`) but progress UI is single-surface only. No timeline that says "12 tasks edge, 4 tasks local, here's the unified view."
3. **Bouncer is BuildWorkspace-only** (`:2525-2629`). If you triggered the build from a thread, you're forced back into the drawer to read findings. No event card for "Bouncer ran, here's the verdict."
4. **PR push duplicates UI.** `ClawBuildSessionCard.tsx:135-150` and `BuildWorkspace.tsx:2388-2415` both render PR results. Helper unified (good), rendering not.
5. **Lane bars** show name + status but not model (`BuildWorkspace.tsx:2697-2781`). Multi-builder runs need this.
6. **Findings expand by default** (`:253, 2525-2629`). 20+ findings → wall of text.
7. **Conductor decision buttons** lack hierarchy (`:2582-2626`). Approve/Abort visually similar.
8. **Workspace escape on Claw card** (`ClawBuildSessionCard.tsx:438-441`) routes back to the drawer — even from the in-thread card, the natural escape is to the legacy surface.
9. **No live progress channel.** Local progress relies on Supabase polling every 2-5s. Build feels stuttery.

**Verdict:** One **build runway card** in the thread. Phase strip inside (Plan → Scope → Execute → Review → Push). Per-task `☁️/🖥️` glyphs. One push UI. Bouncer is a card in the runway. The drawer becomes "open advanced view" for power users.

---

## 3. Target unified flow

```
┌────────────────────────────────────────────────────────────────┐
│ Topbar: [Maestro orb · status]  Session ▾  Trust · Vault · ?  │
├──────────────┬─────────────────────────────────────────────────┤
│ Threads      │ ┌──────────────── Thread spine ────────────┐    │
│ ─ Concierge  │ │  [Concierge event card]                   │    │
│ ─ Broadcasts │ │  [Plan: Project type · Repo · Roster ·    │    │
│ ─ Direct     │ │   Architect · Lanes · Backend · Lock]    │    │
│ ─ Executions │ │  [Build runway: Edge 12 + Local 4]       │    │
│ ─ Pinned     │ │  [Bouncer findings (collapsed, 12⚠ 3🚨)]  │    │
│              │ │  [PR card: opened, backup branch, files] │    │
│              │ │                                           │    │
│              │ │  [Carousel sheet ↗ over a broadcast card] │    │
│              │ └───────────────────────────────────────────┘    │
│              │ ┌─── Composer ─────────────────────────────┐    │
│              │ │ Direct · Council · Execute · Build [Ask] │    │
│              │ │ "Concierge will reply in this thread."   │    │
│              │ │ [textarea]   [model: Haiku ▾]   [Send →] │    │
│              │ └──────────────────────────────────────────┘    │
└──────────────┴─────────────────────────────────────────────────┘
```

Key contracts:

- **Empty state** is the orb above the composer with one inviting line ("Ask the council, or describe what you want to build"). EmptyStage's animations stay; an entry message is added.
- **Carousel** opens as an in-thread sheet over the broadcast event card it belongs to. Closing returns to the thread at the same scroll position.
- **Pre-Build** is a sequence of plan cards Concierge produces. The drawer is optional advanced inspection.
- **Build runway** is one card with a phase strip inside. Per-task backend glyphs. "View advanced workspace" link for power users.
- **Bouncer** is the next runway card, collapsed by default with severity counts.
- **PR result** is the last runway card with backup branch, skipped files, PR links.

---

## 4. Scope boundaries — explicitly out of scope

- ❌ Real-time streaming of orchestrate responses (still arrive all-at-once for now; carousel reading actions are a separate concern).
- ❌ Multi-user / collaborative sessions.
- ❌ Voice input/output.
- ❌ Mobile-first redesign (mobile must not break, but desktop-first stays).
- ❌ Replacing the carousel — it stays, gains reading actions only.
- ❌ Retiring `BuildWorkspace.tsx` — it becomes the advanced inspection drawer, not deleted.
- ❌ Retiring per-file `build_task` model — stays for edge until session builds are battle-tested across edge.
- ❌ Per-project Supabase config (the placeholder in PreBuildPanel `:769-824` gets removed, not implemented).
- ❌ Docker isolation (`BUILD_V3_SPEC.md` Phase 6 — separate sprint).

---

## 5. Phased plan

Phases 0–2 must ship in order. Phases 3–10 may parallelize where dependencies allow (noted per phase).

### Phase 0 — Mode-axis collapse (foundation)

**Goal:** reduce six state axes to three. Nothing visible changes for the user; this is pure model surgery so subsequent phases have one source of truth.

**Files:** `src/types/index.ts`, `src/context/MaestroContext.tsx`, `src/hooks/useOrchestration.ts`, `src/hooks/useThreads.ts`, `src/hooks/useBuildExecution.ts`, `src/components/reveal/RevealComposer.tsx`, `src/components/reveal/ConciergePanel.tsx`, `src/components/reveal/PreBuildPanel.tsx`, `src/components/reveal/BuildWorkspace.tsx`, `src/components/reveal/ClawMode.tsx`, `src/pages/WorkspacePage.tsx`, `supabase/migrations/<new>_drop_orchestration_mode.sql`.

**Scope:**

1. Delete `state.orchestrationMode`. Replace every read with derivation from `sessions.mode` and the active intent: Ask → analysis; Build → orchestrate decides per call (`build_task` mode for builds, otherwise `analysis`).
2. Delete `state.clawModeActive`. Replace with a derived UI state tied to whether a thread is currently focused (sidebar open vs collapsed).
3. Keep `sessions.mode`, `sessions.current_phase`, `sessions.execution_backend`, `state.executionMode` for now. `executionMode` migrates to a topbar chip in Phase 9.
4. Migration: no DB column drop yet — leave `orchestrationMode` derivations intact at the call sites where edge functions still read it. Drop only after all callers route through `sessions.mode`.

**Exit criteria:** `npm run typecheck` clean; `npm run build` clean; smoke test confirms an Ask round and a Build round both still work end-to-end with no UI change visible to the user; reducer has fewer actions than before.

**Risk:** Medium. Touches every hook and most reveal components. Mitigation: do the deletions one axis at a time with typecheck between each.

### Phase 1 — Unified composer

**Goal:** one composer that lives in the workspace shell, regardless of whether a thread is in focus. The Claw segmented routing bar (Chat / Broadcast / Execute / Build) becomes the primary intent selector. Ask/Build pill stays as a session-level mode chip.

**Depends on:** Phase 0.

**Files:** `src/components/reveal/RevealComposer.tsx` (consolidate), `src/components/reveal/ClawMode.tsx` (remove its composer), `src/types/index.ts` (`Intent` type), `src/context/MaestroContext.tsx` (composer-intent state).

**Scope:**

1. Move the segmented routing bar from `ClawMode.tsx:1228-1261` into `RevealComposer.tsx`.
2. Promote the consequence label (`ClawMode.tsx:1264-1267`) and bump it to `text-white/70` minimum. It must be visible at idle.
3. Replace the agent dot picker + Orchestra button with the routing bar's Council intent (Council = "broadcast to all active council agents"). Selecting council surfaces the active agent count + a "configure roster" link to OrchestraDrawer.
4. The model picker chip from `ClawMode.tsx:854-895` lives in the composer chrome, always visible.
5. Send button is one button, not a pair. Behavior switches by intent.

**Exit criteria:** Build / Execute / Council / Direct can all be initiated from the workspace shell without entering a separate Claw mode. The composer height stays under 96px at rest. Typecheck clean.

**Risk:** Medium. Composer is the most-touched component in the app.

### Phase 2 — Thread spine becomes the workspace shell

**Goal:** stop having two shells. `WorkspacePage` always renders the thread spine; the orb + carousel + drawers are presentation layers over a thread, not separate states.

**Depends on:** Phase 1.

**Files:** `src/pages/WorkspacePage.tsx` (large rewrite), `src/components/reveal/ClawMode.tsx` (deleted or shrunk to a transitional shim that just re-exports the new shell), `src/components/reveal/EmptyStage.tsx` (becomes the empty-thread state inside the shell), `src/components/reveal/HeroContext.tsx` (round navigator slides into the broadcast event card it belongs to).

**Scope:**

1. The `state.clawModeActive ? <ClawMode /> : <stage>` switch (`WorkspacePage.tsx:261-276`) is removed. The shell is one tree.
2. Threads from `useThreads` are the primary data source. The concierge thread is always present.
3. Carousel becomes an in-thread sheet that overlays a broadcast event card. Click an agent response → focus that card; press Esc → return.
4. EmptyStage's orb + status keeps its animation system (`EmptyStage.tsx:141-244`); the "watch council →" pill becomes a thread event card link instead.
5. Sidebar of threads is collapsible and remembered per-session.
6. Drawers (Orchestra, Trust, Synthesis, Vault) keep their hotkeys and stay as overlays — they're advanced surfaces.

**Exit criteria:** Toggling between "regular" and "Claw" no longer exists; the user always sees the same shell. Carousel still works. Drawers still work. Typecheck clean.

**Risk:** High. This is the biggest single phase. Recommend feature-flagging the new shell behind `state.unifiedShellEnabled` for one merge cycle, then deleting the old branch.

### Phase 3 — Concierge as thread event cards (delete the modal)

**Goal:** replace `ConciergePanel` with a structured event card rendered inline in the concierge thread.

**Depends on:** Phase 2.

**Parallelizable with:** Phase 4 (different files).

**Files:** `src/components/reveal/ConciergePanel.tsx` (delete or shrink to the triage card), new `src/components/reveal/ConciergeEventCard.tsx`, `src/hooks/useThreads.ts` (write synthesis as a card-typed message instead of opening a modal), `src/components/reveal/ClawMode.tsx` or its successor (render the card inline).

**Scope:**

1. New `ConciergeEventCard` renders alignment / tension / direction with the same Proceed / Round 2 / Override / Report actions from `ConciergePanel.tsx:401-440`.
2. Triage / quick-answer (`ConciergePanel.tsx:165-226`) becomes a triage event card that fires from any phase, not only after a council round.
3. `ConciergeDecision` written to `thread_messages` with `metadata.kind = 'concierge_decision'`. Existing edge function output unchanged; only rendering moves.
4. Convert-to-Build action surfaces as a button on the concierge card (no modal needed).

**Exit criteria:** No remaining `<ConciergePanel>` instance; concierge synthesis appears in the thread; all five modal actions work from the card.

**Risk:** Low. Pure presentation move once Phase 2 is done.

### Phase 4 — Unified build runway card

**Goal:** one in-thread card that owns plan → scope → execute → review → push regardless of edge / local / hybrid backend. The drawer becomes "advanced inspection."

**Depends on:** Phase 2.

**Parallelizable with:** Phase 3, Phase 7.

**Files:** `src/components/reveal/ClawBuildSessionCard.tsx` → renamed/expanded to `BuildRunwayCard.tsx`, `src/hooks/useBuildExecution.ts` (expose progress that mixes edge + local), `src/hooks/useThreads.ts` (delete the dual-routing `buildFromChat` branch), `src/components/reveal/BuildWorkspace.tsx` (kept, but its phase rail no longer drives the primary UX — it becomes the advanced view).

**Scope:**

1. `BuildRunwayCard` renders a phase strip: Plan → Scope → Execute → Review → Push.
2. Each task in the Execute phase shows a `☁️/🖥️` glyph from `task.execution_backend`. The progress count is unified: "12/16 tasks complete (8 ☁️ · 4 🖥️)".
3. `useThreads.buildFromChat` no longer branches on backend (`:962` vs `:978`). It always opens the runway card. The card itself decides whether to call `executeSessionPlan` (multi-builder local) or the legacy `decompose + execute` loop (per-file edge).
4. PR push UI from `ClawBuildSessionCard.tsx:135-150` and `BuildWorkspace.tsx:2388-2415` is consolidated into the runway's Push phase. One render path.
5. "Open advanced view" link replaces the existing "Workspace" button (`ClawBuildSessionCard.tsx:438-441`). Wording matters — make purpose explicit.
6. Lane bars from `BuildWorkspace.tsx:2697-2781` are reused inside the runway's Execute phase but show model name in addition to agent name.

**Exit criteria:** A user can run an Edge build, a Local build, and an Auto/hybrid build entirely from the runway card without opening the drawer. Typecheck clean. End-to-end smoke test for each backend path.

**Risk:** High. This is where the two task models meet. Bring the legacy path along; don't delete it.

### Phase 5 — Pre-Build as plan cards

**Goal:** Pre-Build becomes a sequence of plan event cards Concierge writes into the thread. The drawer becomes advanced inspection.

**Depends on:** Phase 4 (because the runway's Plan phase consumes the locked spec).

**Files:** new `src/components/reveal/PlanCards/` directory (`ProjectTypeCard.tsx`, `RepoCard.tsx`, `BuilderRosterCard.tsx`, `ArchitectCard.tsx`, `LaneCard.tsx`, `BackendCard.tsx`, `SpecLockCard.tsx`), `src/components/reveal/PreBuildPanel.tsx` (kept, now opened explicitly via "Open advanced view"), `src/hooks/useThreads.ts` (advance through plan cards conversationally).

**Scope:**

1. Each plan card is a focused, single-decision surface. Concierge proposes; user accepts/edits inline.
2. Builder roster card shows API-key status for cloud agents alongside online status for Claw agents — fix the `PreBuildPanel.tsx:755-757` asymmetry.
3. Backend card auto-resolves: "I see you picked ClawClaude — Local, executor online ✓. Run here? [Use Edge instead]". One click instead of the two-step dance.
4. Architect card opens the ARCHITECT.md preview as a full thread sheet, not a 200-px clipped `<pre>`.
5. Spec lock is the final card. "Lock and start build" advances to the runway.
6. Delete the dead Supabase placeholder (`PreBuildPanel.tsx:769-824`).
7. Drawer remains as advanced inspection — same component, opened on demand from "Open advanced view" links on plan cards.

**Exit criteria:** A new build can be set up entirely through plan cards in the thread, with no drawer interaction required. Typecheck clean. Power-user can still open the drawer for deep edits.

**Risk:** Medium. Lots of new components, but each is small.

### Phase 6 — Bouncer as a runway card

**Goal:** Bouncer findings render as a runway phase card with a count badge and collapsed-by-default findings list.

**Depends on:** Phase 4.

**Parallelizable with:** Phase 5, Phase 7.

**Files:** new `src/components/reveal/BouncerCard.tsx`, `src/components/reveal/BuildWorkspace.tsx` (extract bouncer presentation into the new component), `supabase/functions/bouncer/index.ts` (no behavioral change — output stays the same).

**Scope:**

1. Header shows: severity counts (`🚨 3 critical · ⚠ 12 minor`), elapsed time, model used.
2. Findings collapsed by default. Expanding a severity group reveals the structured cards from `BuildWorkspace.tsx:2551-2577`.
3. Conductor decision buttons get a hierarchy: primary (Approve), secondary (Acknowledge minor), tertiary outline (Pause), destructive ghost (Abort). Use the existing button primitives but standardize weights.
4. The card is the same in both the runway view and the advanced workspace view — one component.

**Exit criteria:** A user can review bouncer findings and make a decision without leaving the thread. Typecheck clean.

**Risk:** Low.

### Phase 7 — Premium event cards (delete emoji-prefix system messages)

**Goal:** replace the emoji-prefix plain-text system messages (`useThreads.ts` system prefixes; `ClawMode.tsx:1336-1342`) with structured event cards.

**Parallelizable with:** Phase 3, Phase 4, Phase 6.

**Files:** new `src/components/reveal/EventCards/` (`ExecutionApprovalCard.tsx`, `CommandResultCard.tsx`, `FileManifestCard.tsx`, `PrOpenedCard.tsx`, `ErrorRetryCard.tsx`, `InfoCard.tsx`), `src/hooks/useThreads.ts` (write `metadata.kind` instead of emoji prefixes), `src/components/reveal/ClawMode.tsx` or successor (render by `metadata.kind` instead of regex on emoji).

**Scope:**

1. Every system message in `useThreads.ts` that uses an emoji prefix (build 🏗️, execute ⚡, approval ✅, pr 🔀, error ❌, info 📻) becomes an event card with a typed payload.
2. Existing approval card from `ClawMode.tsx:1092-1133` becomes one of the event cards in this set, persisted in `thread_messages.metadata`.
3. `detectSystemCategory` (`ClawMode.tsx:1336-1342`) is deleted.
4. Migration: existing emoji-prefix messages stay rendered as legacy plain text; only new messages use the typed format. Backwards-compatible.

**Exit criteria:** No emoji-prefix detection logic remains in component code. New flows render structured cards.

**Risk:** Low. Pure rendering layer.

### Phase 8 — Carousel reading actions

**Goal:** the carousel becomes a reading + operating surface. Reading actions write back into the thread.

**Depends on:** Phase 2 (for the thread sheet pattern).

**Parallelizable with:** Phase 5, Phase 6, Phase 7.

**Files:** `src/components/reveal/FolioCard.tsx`, `src/components/reveal/FolioCarousel.tsx`, `src/hooks/useThreads.ts` (new actions: `pinResponse`, `compareResponses`, `extractDecision`, `askFollowUp`).

**Scope:**

1. Each `FolioCard` gains a small action rail: Pin, Compare, Ask follow-up, Extract decision, Synthesize from selection.
2. Pin → adds a pinned reference card in the thread (and respects the `threads.include_in_synthesis` flag from `CLAW_MODE_SPEC.md`).
3. Compare → opens a side-by-side sheet of the focused card and one other; result is a thread event card with the diff/contrast.
4. Ask follow-up → opens a direct thread with that agent, seeded with the current response as context (the existing direct-thread seeding logic is the right primitive — surface it).
5. Extract decision → posts a "decision recorded" event card in the concierge thread.

**Exit criteria:** All five actions work from the carousel. Each writes back to the thread. Typecheck clean.

**Risk:** Low-medium.

### Phase 9 — Topbar status chip

**Goal:** one chip in the topbar that shows model + executor + key status, replacing scattered indicators.

**Depends on:** Phase 1 (for the unified shell layout).

**Parallelizable with:** Phase 5–8.

**Files:** `src/components/reveal/RevealTopbar.tsx`, new `src/components/reveal/StatusChip.tsx`.

**Scope:**

1. Format: `Concierge: Haiku · ClawClaude online · 2 keys connected`. Click → opens an inline detail panel.
2. `executionMode` (analyze / pr_flow / elevated) becomes an inline pill on this chip; clicking switches modes.
3. Status indicator from `EmptyStage.tsx:99-110` and the duplicate dot from `PreBuildPanel.tsx:1294-1314` both retire in favor of the chip.

**Exit criteria:** One canonical status surface. No duplicate executor/key indicators elsewhere.

**Risk:** Low.

### Phase 10 — Real-time progress channel

**Goal:** replace the 2-5s Supabase polling with a real-time channel for executor jobs and orchestrate progress.

**Depends on:** Phase 4 (so the runway is consuming the new channel from day one).

**Files:** `src/hooks/useBuildExecution.ts`, `src/lib/supabase.ts` (channel setup), possibly new `supabase/migrations/<new>_realtime_publication.sql` to ensure publication on `executor_jobs` and `executor_job_events`.

**Scope:**

1. Subscribe to Supabase Realtime on `executor_jobs` filtered by `requested_by = auth.uid()`.
2. Subscribe to `executor_job_events` for live stdout streaming into the runway's Execute phase.
3. Polling stays as the fallback for slow-network or Realtime-unavailable scenarios.
4. Edge function progress (orchestrate) — out of scope here; SSE from edge functions is a separate sprint.

**Exit criteria:** Local builds show live file counts and executor job events without polling. Polling fallback proven by disabling Realtime and re-running.

**Risk:** Medium. Realtime setup on a new table is straightforward, but auth/RLS on subscriptions needs verification.

---

## 6. Delete / build / polish inventory

### Delete (remnants and dead arms)

| Item | Where | Phase |
|------|-------|-------|
| `state.orchestrationMode` axis | reducer + every read | 0 |
| `state.clawModeActive` flag | reducer + `WorkspacePage:261` | 0–2 |
| `ConciergePanel` modal (replaced by event cards) | `src/components/reveal/ConciergePanel.tsx` | 3 |
| Per-project Supabase placeholder | `PreBuildPanel.tsx:769-824` | 5 |
| Dual `buildFromChat` routing | `useThreads.ts:962` vs `:978` | 4 |
| `detectSystemCategory` regex on emoji | `ClawMode.tsx:1336-1342` | 7 |
| Emoji-prefix system message convention | `useThreads.ts` system messages | 7 |
| Duplicate status indicators | `EmptyStage.tsx:99-110`, `PreBuildPanel.tsx:1294-1314` | 9 |
| `clawBuildSession` separate routing metadata (folded into runway state) | `state.clawBuildSession` | 4 |

### Build (the real upgrades)

| Item | Phase |
|------|-------|
| Unified composer with prominent intent + consequence label | 1 |
| Thread spine as the workspace shell | 2 |
| Concierge event card | 3 |
| Build runway card (edge / local / hybrid) | 4 |
| Plan cards (project type, repo, roster, architect, lanes, backend, lock) | 5 |
| Bouncer card (collapsed findings, severity counts, hierarchy buttons) | 6 |
| Event card library (approval, command, manifest, PR, error, info) | 7 |
| Carousel reading actions (Pin, Compare, Ask, Extract, Synthesize) | 8 |
| Topbar status chip | 9 |
| Realtime progress channel | 10 |

### Polish (small but high-impact, attached to nearest phase)

| Item | Phase | File:line |
|------|-------|-----------|
| Cloud-agent API-key status in builder dropdown | 5 | `PreBuildPanel.tsx:755-757` |
| Lane bars show model name | 4 | `BuildWorkspace.tsx:2697-2781` |
| Findings collapsed by default | 6 | `BuildWorkspace.tsx:253, 2525-2629` |
| Conductor decision buttons get visual hierarchy | 6 | `BuildWorkspace.tsx:2582-2626` |
| ARCHITECT.md preview opens as full sheet | 5 | `PreBuildPanel.tsx:983-1000` |
| Backend selector above Lock button | 5 | `PreBuildPanel.tsx:1230-1271` |
| "Open advanced view" wording on Workspace escape | 4 | `ClawBuildSessionCard.tsx:438-441` |
| Intent consequence label visible at idle | 1 | `ClawMode.tsx:1264-1267` |

---

## 7. Required reading for any agent picking up a phase

1. `MAESTRO_STATE.md` — Part 1 (Stable Architecture) + the most recent Session Log entries.
2. `CLAW_MODE_SPEC.md` — thread model, three views, council/claw split, context priority tiers.
3. `CLAW_BUILD_V2_SPEC.md` — session-granular build job model, adapter session mode, file diffing.
4. `BUILD_V3_SPEC.md` — execution backend routing, context bundles, project lifecycle.
5. `HANDOFF_CLAW_UX.md` — Codex's Claw UX direction: cockpit not chat-app, premium event cards.
6. `CLAW_UI_ISSUES.md` — open polish items by phase.
7. `AGENTS.md` — update rules for shared docs.

---

## 8. Open questions for the council

1. **Phase 2 cutover strategy.** Feature flag (`state.unifiedShellEnabled`) for one merge cycle, then delete `clawModeActive`? Or hard cutover behind a session log entry? Risk vs deploy speed tradeoff.
2. **Per-file `build_task` retirement.** Keep indefinitely as the edge fallback, or schedule retirement after N successful session-build cycles?
3. **Concierge model default.** Haiku (cheap, fast) vs Sonnet (better synthesis). Today it's Haiku — should the unified composer expose the model toggle prominently, or keep it in a dropdown?
4. **Carousel reading actions backend.** Compare and Extract Decision both want server-side synthesis — do they reuse `synthesize` edge function, or get their own action types in `concierge`?
5. **Realtime subscription scope.** Subscribe per-session or per-user? Per-user is simpler but pushes more events to the client.
6. **Thread sidebar default state.** Open or collapsed for new users? Collapsed reduces noise but hides the threading model.

---

## 9. Success criteria (when this SOW is "done")

A user can:

1. ✅ Land on the empty state, see one orb + one inviting line + one composer.
2. ✅ Ask a question — concierge replies inline in the thread, no modal.
3. ✅ Broadcast — carousel slides in over the broadcast event card; reading actions work.
4. ✅ Use carousel actions to pin, compare, ask follow-up, or extract a decision — all reflected back in the thread.
5. ✅ Synthesize at any time from the composer; result is a card in the thread.
6. ✅ Move to Build — Concierge produces plan cards inline; user accepts each.
7. ✅ Lock the spec from the final plan card; runway card appears immediately after.
8. ✅ Watch a hybrid edge+local build run with per-task backend glyphs in one progress UI.
9. ✅ Read bouncer findings in a collapsed card with severity counts; approve / abort with clear button hierarchy.
10. ✅ See PR opened, backup branch, files written/skipped — all in one runway card.
11. ✅ Never have to open the legacy drawer for a normal build (drawer is power-user inspection only).
12. ✅ Never see "am I in Claw or regular mode?" — there is one shell.

---

*This SOW is intended for council review. Submit to the AI council for feedback on phasing, dependencies, and cutover strategy before Phase 0 begins. Each phase is sized so a single agent can pick it up, ship it, append a `MAESTRO_STATE.md` Part 3 session log entry, and hand off cleanly.*
