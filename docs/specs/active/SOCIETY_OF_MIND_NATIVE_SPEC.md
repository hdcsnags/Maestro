# SOCIETY_OF_MIND_NATIVE_SPEC.md

**Codename:** SOM-NATIVE
**Status:** Spec — pending Conductor approval, no implementation started
**Authored:** 2026-05-10 by Opus 4.7 (Claude Code, this conversation)
**Builds on (already shipped):** PRO-01 deliberation, PRO-02 iteration loop, DIFF-02 repo memory, MaestroClaw v0.1, executor capability advertising
**Required reading:** `MAESTRO_STATE.md`, `AGENTS.md`, `PRO-01_DELIBERATION_ROUND_SPEC.md`, `PRO-02_ITERATION_LOOP_SPEC.md`, `DIFF-02_REPO_MEMORY_SPEC.md`, `INTELLIGENCE_LAYER_REVIEW.md`

---

## 1. Why this exists

PRO-01 shipped deliberation as a manual pill the user clicks. PRO-02 shipped iteration as a single-agent loop. DIFF-02 shipped per-repo memory as a flat blob. Each is correct in isolation. None of them combine into the experience the Conductor actually wants:

- A council where Society-of-Mind dynamics are **the default**, not an opt-in button
- Local CLI builders that **critique each other** instead of running parallel monologues
- Memory that captures **decisions and structure**, not just summary prose
- A live cockpit that **streams** rather than waiting for one-shot returns

This spec ties those gaps together under one banner. It is intentionally not a feature buffet — every item composes with at least one other and shares primitives.

The thesis: **Maestro is already a real orchestration system. The next leap is making the agents aware of each other in flow, and giving the system structural memory of what it has decided.**

---

## 2. Scope

| In | Out (deferred to v2) |
|----|----------------------|
| Streaming for council + deliberation rounds | Streaming for build artifact emission |
| Auto-triggered deliberation (Modes 2 + 3 from PRO-01 spec) | Auto-triggered iteration loops |
| Cross-CLI critique inside `build_session` jobs | Multi-agent collaborative editing inside one session |
| Persona layer for council + Claw seats | Persona memory across sessions (depends on memory work below) |
| Project graph (file → module → export → call-site) | Devpost / corpus ingest (Library v2 territory) |
| Decision graph (per-session decision provenance) | Cross-session decision similarity search (depends on graph) |
| Inline `// WHY:` / `// HACK:` markers from bouncer surfaces | Author voice fine-tuning |
| Adapter prompts inherit AGENTS.md principles | Local Maestro LLM training |

---

## 3. Owner split

Following the PRO-01 precedent (Opus owns prompts + correctness floor; Sonnet owns schema, frontend, executor wiring):

**Opus 4.7 — must hand off shipped artifacts before Sonnet can finish:**
- SOM-04 persona voice templates (one per default persona)
- SOM-03 cross-CLI critique adapter prompt
- SOM-02 trigger-heuristic validation against real council fixtures
- MEM-02 "what counts as a decision" extraction prompt
- ANNO-01 marker-suggestion prompt (bouncer surface)

**Sonnet 4.6 — primary implementer, can ship without Opus on:**
- SOM-01 streaming (mechanical SSE wiring)
- SOM-02 trigger detection plumbing + Concierge signal emission
- SOM-03 adapter interface change + executor integration + UI for critique results
- SOM-04 persona schema, prompt injection layer, agent record extension
- MEM-01 project graph migration + ingestion pipeline + query helpers
- MEM-02 decision graph schema + reducer hooks + UI surface
- AGENT-01 adapter prompt updates for Read-Before-Work / Update-After-Work
- ANNO-01 bouncer integration + accept/reject UI for markers

If Sonnet hits a section marked Opus-owned, do the structural work and leave the prompt content as a `TODO(opus)` placeholder. Don't guess on prompts — that's the same trap PRO-01 spec called out.

---

## 4. Sub-features

### SOM-01 — Streaming for council + deliberation
**Why:** `MAESTRO_STATE.md` line 274 logs this as the highest-impact missing piece for live-feel. Deliberation especially feels glacial without it.
**What:** SSE endpoint variant of `orchestrate` and `deliberate` edge functions. FolioCard renders incremental tokens. StreamingFolio (currently visual-only) becomes real.
**Files:**
- `supabase/functions/orchestrate/index.ts` — add SSE branch keyed on `accept: text/event-stream`
- `supabase/functions/deliberate/index.ts` — same
- `src/lib/functions.ts` — add `invokeStream()` helper
- `src/components/reveal/FolioCard.tsx` — incremental content render
- `src/components/reveal/StreamingFolio.tsx` — wire to real stream
**Owner:** Sonnet (no prompt work)
**Ship size:** ~1 day
**Verification:** live council round shows token-by-token render in 3+ cards simultaneously without dropping reconnects.

### SOM-02 — Auto-trigger deliberation (PRO-01 Mode 2 + Mode 3)
**Why:** The "Deliberate" pill being manual means SoM is opt-in instead of native flow. PRO-01 spec's Modes 2 and 3 were called out and never shipped.
**What:**
- **Mode 2 — concierge-suggested**: after R1 returns, concierge inspects responses and emits `{ deliberation_recommended: true, reason: '<short>'}` when triggers fire. Pill changes from gold to pulsing-amber with the reason on hover.
- **Mode 3 — auto-fire** (gated by user setting): same triggers, but skips the click and runs deliberate inline.
**Trigger heuristics (Opus must validate against fixtures before shipping):**
- Embedding cosine distance across primary responses > threshold (start at 0.35, tune)
- Prompt contains decision keywords: `should we`, `which approach`, `vs`, `trade-off`, `is it better to`
- Build-mode: architect plan touches > 5 files OR introduces > 1 new dependency
- File contents disagree across builders for same target path
**Files:**
- `supabase/functions/concierge/index.ts` — add trigger evaluator
- `src/types/index.ts` — extend `Synthesis` metadata with `deliberation_recommended`
- `src/components/reveal/FolioCarousel.tsx` — pill state machine (gold → amber → auto)
- `src/components/reveal/SettingsDrawer.tsx` (or equivalent) — Mode 3 toggle
**Owner:** Sonnet (plumbing) + Opus (heuristic tuning)
**Ship size:** ~2 days, plus 1 day Opus validation
**Verification:** 5 fixture rounds (3 known-disagreement, 2 known-consensus) — heuristics fire on the right ones.

### SOM-03 — Local cross-CLI critique inside `build_session`
**Why:** ClawClaude / ClawCopilot / ClawCodex / ClawGemini run as parallel monologues today. The cloud council deliberates; the local council doesn't.
**What:** Optional `critique_adapter` field on `build_session` jobs. After Pass 1 writes files, the executor invokes a *different* CLI adapter on `{manifest, scope, original_prompt}`. The critique adapter returns `{verdict: 'ok' | 'fix_required' | 'reject', notes, proposed_diff?}`. Pass 2 (the existing Ralph fix pass) runs only if critique returns `fix_required` OR there are missing expected files. Reject surfaces in UI for human gate.
**Files:**
- `packages/maestroclaw/src/adapters/types.ts` — new `runCritique()` method on `Adapter` interface
- `packages/maestroclaw/src/adapters/{claude-code,copilot-cli,codex-cli,gemini-cli}.ts` — implement
- `packages/maestroclaw/src/executor.ts` — `executeSessionJob` wires critique step between Pass 1 and Pass 2
- `supabase/functions/executor-api/index.ts` — accept `critique_adapter` on submit
- `src/lib/sessionBuild.ts` — surface `critique_adapter` in submit payload
- `src/components/reveal/ClawBuildSessionCard.tsx` — render critique result inline
- `src/types/index.ts` — `ExecutorJob.critique_adapter`, critique event types
**Owner:** Sonnet (plumbing) + Opus (`runCritique` prompt template)
**Ship size:** ~3 days + 1 day Opus prompt
**Verification:** smoke build with `critique_adapter: codex_cli` against a Claude session — critique catches at least one real defect (planted or organic) on a 5-file build.

### SOM-04 — Persona layer for council + Claw seats
**Why:** `(model, role)` tuples produce homogeneous output. MiroFish's actual borrowable pattern is independent personalities with stable behavioral logic. Makes deliberation produce real disagreement and survives across sessions.
**What:** New `personas` table. `agents.persona_id` FK. Persona record:
```
{ id, name, voice_summary, priors[], blind_spots[], preferred_arguments[], anti_patterns[] }
```
Persona injected into system prompt as a stable preamble (not as a roleplay instruction — as a **prior set**). Default seed: 4-6 hand-authored personas the Conductor approves. Personas are agent-attached, not user-attached.
**Files:**
- `supabase/migrations/<date>_personas.sql` — new table + FK + seed inserts
- `supabase/functions/_shared/persona-prompt.ts` — render persona block
- `supabase/functions/orchestrate/index.ts` — inject persona block into system prompt
- `supabase/functions/deliberate/index.ts` — same; deliberation already has voice labels — persona becomes the *content* behind the label
- `src/types/index.ts` — `Persona` type, `Agent.persona_id`
- `src/components/reveal/OrchestraDrawer.tsx` — persona badge per agent
- `src/components/reveal/PersonaPicker.tsx` (new) — assign persona to agent slot
**Owner:** Sonnet (everything except voice content) + Opus (the actual persona voice templates — this is the equivalent of the PRO-01 deliberation prompt; do not ship homogeneous voices)
**Ship size:** ~2 days Sonnet + 2 days Opus
**Verification:** same council, same prompt, with vs without personas — diff the responses, confirm voice differentiation is materially higher (manual read).

### MEM-01 — Project graph
**Why:** Repo memory is a 16KB blob today. Concierge can't answer "what depends on X?" without re-grepping. Lane scoping is glob-aware, not graph-aware. Cheap to build incrementally during intake.
**What:** Three tables — `repo_files`, `repo_symbols`, `repo_edges`. Built on intake, refreshed on `github-execute` write. Edges typed: `imports`, `exports`, `calls`, `extends`, `references`. Concierge gets a `query_repo_graph` tool. Lane assignment in architect uses graph traversal to scope correctly (paths reachable from a feature root, not glob match).
**Files:**
- `supabase/migrations/<date>_project_graph.sql` — 3 tables + composite indexes
- `supabase/functions/intake/index.ts` — add graph extraction step (uses tree-sitter or a per-language regex pack — Sonnet picks)
- `supabase/functions/_shared/repo-graph.ts` — shared helpers
- `supabase/functions/concierge/index.ts` — graph tool exposed
- `supabase/functions/architect/index.ts` — graph-aware lane scoping
- `src/components/reveal/RepoGraphPanel.tsx` (new) — small viewer in TrustDrawer
**Owner:** Sonnet — entirely. Mechanical work. Use existing tree-sitter wasm bindings or per-language regex; do not invent a parser.
**Ship size:** ~4 days
**Verification:** intake on Maestro itself produces a graph that correctly identifies `useBuildExecution` as imported by `BuildWorkspace.tsx` and `ClawMode.tsx`.

### MEM-02 — Decision graph
**Why:** This is the institutional-memory layer the INTELLIGENCE_LAYER_REVIEW called for, scoped down. Replaces "next session inherits a 16KB summary" with "next session inherits structured precedent."
**What:** New `decisions` table. Decision is created on five existing events: architect plan accepted, deliberation completed, builder rerouted, bouncer override, build completed. Schema:
```
{ id, session_id, decision_type, prompt_excerpt, options_considered[], outcome,
  agents_involved[], files_touched[], embedding, created_at }
```
Concierge gets a `find_similar_decisions` tool. On new session start, concierge runs the user's prompt against the decision embedding index and surfaces "you decided X for similar reason Y in <session> — apply, override, or ignore?"
**Files:**
- `supabase/migrations/<date>_decisions.sql` — table + pgvector index
- `supabase/functions/_shared/decision-extractor.ts` — extracts decision record from event payload (prompt is Opus-authored)
- Edge functions that fire decision events: `architect`, `deliberate`, `bouncer`, `executor-api` (build complete)
- `supabase/functions/concierge/index.ts` — `find_similar_decisions` tool
- `src/components/reveal/DecisionPrecedentCard.tsx` (new) — surfaces in concierge thread
**Owner:** Sonnet (schema, hooks, UI) + Opus (extraction prompt — the "what counts as a decision worth remembering" judgment is the hard part)
**Ship size:** ~3 days Sonnet + 1 day Opus
**Verification:** synthetic test — submit two structurally-similar prompts in different sessions. Second session surfaces the first's decision before responding.

### AGENT-01 — AGENTS.md principles applied to Claw adapters
**Why:** AGENTS.md is an excellent agent-coordination contract. Most of it should apply to the Claw adapters themselves. Cheap shipping, immediate quality bump.
**What:** Adapter system prompts inherit:
- **Read before work** — adapter prompt includes a mandatory pre-read step: list lane files, read the 3 most relevant, summarize, *then* propose changes. Refuse to write until pre-read is acknowledged in the response.
- **Update after work** — structured `session_log` JSON appended to result_summary: `{ built[], decisions[], didnt_work[], next_steps[] }`. Aggregates into `thread_messages.metadata`.
- **Verification discipline** — Ralph Loop already enforces for files. Extend: builder can't claim "I added auth" if no auth route exists in the manifest.
**Files:**
- `packages/maestroclaw/src/adapters/{claude-code,copilot-cli,codex-cli,gemini-cli}.ts` — system prompt extensions
- `packages/maestroclaw/src/executor.ts` — parse `session_log` JSON from result, attach to event payload
- `src/types/index.ts` — `BuildSessionLog` type
- `src/components/reveal/ClawBuildSessionCard.tsx` — render structured session log
**Owner:** Sonnet entirely
**Ship size:** ~2 days
**Verification:** before/after diff on a real build — structured logs replace free-text summaries; pre-read step actually runs (visible in stdout events).

### ANNO-01 — Inline `// WHY:` / `// HACK:` / `// DECISION:` markers
**Why:** Audit-annotated corpus harvested from your own work, not Devpost. Anchor points for the next agent. Seeds for MEM-02.
**What:** Bouncer post-build pass scans the diff for non-obvious decisions (regex + LLM judge for top-N candidates). Surfaces 3-5 marker proposals: `{ file, line, marker_type, suggested_text, reason }`. User accepts/rejects per marker. Accepted markers get committed inline. Marker text feeds into MEM-02 decision extraction.
**Files:**
- `supabase/functions/bouncer/index.ts` — add `marker_proposals` to output
- `supabase/functions/_shared/marker-prompt.ts` — Opus-authored
- `src/components/reveal/BouncerCard.tsx` — marker accept/reject section
- `supabase/functions/github-execute/index.ts` — accept marker patches without truncation guard tripping (markers contain `// WHY:` which currently doesn't trip the guard, but verify)
**Owner:** Sonnet (everything except the suggestion prompt) + Opus (marker-prompt.ts)
**Ship size:** ~2 days Sonnet + 1 day Opus
**Verification:** real build PR shows 3+ accepted markers anchored at decision points; markers do not duplicate trivial commentary.

---

## 5. Implementation order

Priority based on "what changes the feel of the system most per day of work":

1. **SOM-01 streaming** — biggest single feel improvement, mechanical, no dependencies
2. **SOM-02 auto-trigger deliberation** — completes PRO-01's stated v1 scope; with streaming this becomes "council debates live"
3. **AGENT-01 AGENTS.md downward** — cheap, ships independently, immediate build-quality bump
4. **SOM-03 cross-CLI critique** — extends SoM into the local layer; depends on adapter interface stable
5. **SOM-04 persona layer** — works without 1-3 but composes with deliberation; do after streaming so persona-differentiated tokens are visible
6. **MEM-01 project graph** — heavier lift, unlocks better lane scoping; can run in parallel with persona work
7. **MEM-02 decision graph** — depends on MEM-01 and SOM-04 being stable so decisions reference real graph nodes
8. **ANNO-01 markers** — small, depends on MEM-02 being able to ingest marker text

Sonnet should not start MEM-02 until SOM-04 ships — decisions referencing personas need stable persona IDs. Everything else is parallelizable.

---

## 6. Dependencies and composition with shipped specs

| New | Depends on shipped | Composes with |
|-----|-------------------|---------------|
| SOM-01 | orchestrate, deliberate | All response-rendering UI |
| SOM-02 | PRO-01 deliberation, concierge synthesis | SOM-01 (streaming makes auto-fire feel less abrupt) |
| SOM-03 | MaestroClaw adapters, build_session, Ralph Loop | PRO-02 iteration loop (critique = single-step iteration with peer model) |
| SOM-04 | orchestrate, deliberate, agents table | SOM-02 (heterogeneous voices fire deliberation triggers more often, correctly) |
| MEM-01 | intake, github-execute, repo_connections | DIFF-02 repo_memory (graph supplements blob, doesn't replace) |
| MEM-02 | architect, deliberate, bouncer, executor-api | MEM-01 (decisions edge into graph nodes), DIFF-02 (decisions feed memory updates) |
| AGENT-01 | MaestroClaw adapters | SOM-03 (structured session_log feeds critique context) |
| ANNO-01 | bouncer, github-execute | MEM-02 (markers seed decision extraction) |

---

## 7. Open questions for the Conductor

1. **Mode 3 default:** auto-fire deliberation OR require user opt-in via setting? Recommendation: opt-in for v1, observe trigger precision for 1 month, then flip default if precision > 80%.
2. **Persona authorship:** should the Conductor author the seed personas, or should Opus draft and Conductor edit? Recommendation: Opus drafts 6, Conductor cuts to 4. Personas should reflect *the Conductor's mental model of disagreement*, not generic archetypes.
3. **Critique adapter pairing:** auto-pick (different adapter from primary) or user-selectable per build? Recommendation: auto-pick with user override in advanced settings.
4. **Decision graph privacy:** decisions can leak prompt content. Per-user only, never shared. Confirmed?
5. **Marker noise floor:** if bouncer surfaces > 5 marker candidates, cap or let user see all? Recommendation: cap at 5 sorted by confidence; "show more" expands.
6. **Project graph language coverage:** start with TS/JS/Python/Go, or wider? Recommendation: TS/JS only for v1 — Maestro itself is TS-heavy and that's the validation surface.
7. **Streaming reconnect:** SSE drops on flaky networks. Resume from token cursor or re-fetch full response on reconnect? Recommendation: re-fetch — simpler, council rounds are bounded.

---

## 8. Out of scope (intentional)

- **Multi-agent collaborative editing inside one session** — the Anthropic concurrent-tool-use territory. Big lift, separate spec when ready.
- **Library / Devpost corpus** — kept in INTELLIGENCE_LAYER_REVIEW.md scope. Compose with MEM-02 later.
- **Local Maestro LLM** — explicitly deferred per INTELLIGENCE_LAYER_REVIEW.
- **Cross-session decision similarity dashboards** — depends on MEM-02 being live for ~30 sessions of accumulated data.
- **Persona memory across sessions** — depends on DIFF-02 v2 with per-agent memory, not currently scoped.

---

## 9. Verification gates per item

Each ship must pass:
1. `npm run typecheck` clean
2. `npm run build` clean
3. Migration applied to remote (where applicable) — listed in `MAESTRO_STATE.md` Read This First block
4. Edge function deployed (where applicable)
5. Live verification entry added to `MAESTRO_STATE.md` Part 2 with date
6. Session log entry in Part 3 per AGENTS.md Rule 1

If verification fails on any gate, do not mark the item shipped. PRO-02 already had a 2-day gap between code and deploy because verification gates were skipped — see `MAESTRO_STATE.md` lines 371-374.

---

## 10. Conductor sign-off needed before any work begins

This spec adds 8 new sub-features composing on 4 already-shipped systems. That's a lot. Conductor should:
- Strike anything not aligned with current product priorities
- Confirm the Opus/Sonnet split (especially SOM-04 personas — that's a meaningful authorial commitment)
- Approve order
- Approve open question recommendations or override

Once approved, Sonnet can pick up SOM-01 immediately (no Opus blocker) while Opus drafts the four prompt artifacts (SOM-02 fixtures, SOM-03 critique prompt, SOM-04 personas, MEM-02 extractor, ANNO-01 marker prompt).
