# Maestro — Sprint Master Spec
*Single source of truth for the current multi-agent sprint. Combines Opus SOM-NATIVE + FLOW-FIRST specs + routing_rules extension + agent-to-agent protocol. Read this alongside `MAESTRO_STATE.md` and `AGENTS.md`.*

---

## Vision (1 paragraph)

Maestro is not a chat app with tabs. It is a **Society of Mind** — a team of agents that know their own limits, route to agents with complementary strengths, and build toward a shared goal without a human holding their hand at every step. The Conductor sets the direction. The council disagrees productively. The lead agent closes the loop. The result is code, deployed.

---

## Part A — What We Are Building (priority order)

### 1. Orb Status Instrument (FLOW-02) 🟡
**Problem:** The orb pulses but says nothing. Users have no sense of what the system is doing.  
**Fix:** Map orb state to text + color + pulse rhythm. States:
- `idle` — solid, dim — "Ready"
- `triage` — slow pulse, gold — "Routing…"
- `broadcasting` — fast pulse, gold — "Asking council…"
- `deliberating` — medium pulse, amber — "Deliberating…"
- `synthesizing` — slow pulse, green — "Synthesizing…"
- `executing` — fast pulse, blue — "Executing…"
- `iterating` — medium pulse, purple — "Iterating…"
- `error` — solid red — "Something went wrong"

**Files:** `EmptyStage.tsx`, `ClawMode.tsx` (compact orb), `MaestroContext.tsx` (derive state from `isBroadcasting`, `activeDrawer`, iteration loop status)  
**Owner:** Sonnet

---

### 2. Verbosity Tiers (FLOW-04) 🟡
**Problem:** Agent responses default to max length. For quick questions this is noise.  
**Fix:** Composer has 3 verbosity tiers: `brief` / `standard` / `detailed`. Injected into system prompt as a postscript. Default: `standard`.  
- `brief`: "Respond in ≤100 words. No preamble."
- `detailed`: "Expand fully. Include reasoning, tradeoffs, code examples."

**Files:** `RevealComposer.tsx` (tier picker UI), `useOrchestration.ts` (`buildSystemPrompt` injection)  
**Owner:** Sonnet or Gemini (pure structural, no prompt-author work)

---

### 3. Structured Session Log in Adapters (AGENT-01) 🟡
**Problem:** Claw session adapters emit raw stdout. Errors are hard to trace. Success is invisible.  
**Fix:** Every adapter step emits a structured `{ type, ts, content }` JSON line to a local `session.log` in the workspace. Runner reads this for its stuck-detection and step summary.  
**Types:** `tool_use`, `file_write`, `file_read`, `test_run`, `error`, `complete`, `give_up`  

**Files:** `packages/maestroclaw/src/adapters/claude-code.ts`, `copilot-cli.ts`, `codex-cli.ts`, `gemini-cli.ts`, `packages/maestroclaw/src/iteration/runner.ts`  
**Owner:** OpenAI / Codex / GPT (adapter code + defensive review) or Sonnet

---

### 4. Command Palette (FLOW-06) 🟡
**Problem:** Power users bounce between keyboard and clicking drawer icons.  
**Fix:** `Cmd+K` / `Ctrl+K` opens a floating palette with fuzzy search over: drawer opens, session switch, intent change, verbosity change, agent toggle, iteration loop control.

**Files:** New `CommandPalette.tsx`, `WorkspacePage.tsx` (mount + keydown), `ShortcutOverlay.tsx` (add to docs)  
**Owner:** Gemini (large-context UI, no prompt work, pure structure)

---

### 5. Personas as Capability Routers (SOM-04) 🔴 *Opus-owned*
**Problem:** Personas today are just debate voices. We want them to self-organize.  
**Design:**
```ts
interface Persona {
  name: string;           // "The Skeptic", "The Builder", "The Security Guard"
  voice: string;          // Injected into system prompt — Opus authors these
  strengths: string[];    // e.g. ["security analysis", "adversarial thinking"]
  weaknesses: string[];   // e.g. ["frontend polish", "streaming"]
  routing_rules: Record<string, string>; // weakness → "route to X adapter/model"
}
```
When a persona detects a task outside its strengths, it emits a structured `{ agent_query: { to: "...", question: "...", files: [...] } }` in its response. The executor detects this, routes to the target, injects the answer as context, re-runs the step.  

**Opus deliverables:** Voice strings for 4 personas: `skeptic`, `builder`, `archivist`, `critic`. Routing rule map. `agent_query` detection in `orchestrate/index.ts`.  
**Sonnet deliverables:** Wire `agent_query` detection in executor step completion → re-route logic.  
**Owner:** Opus (voice + routing rules), Sonnet (wiring)

---

### 6. SSE Streaming (SOM-01) 🔵 *Port from existing code*
**Problem:** Responses arrive all at once. For long outputs users stare at a spinner.  
**Note:** User has working SSE streaming in Android native app and T6 Maestro variants. This is a **port**, not a build.  
**Steps:**
1. Identify the working streaming code (which machine/repo).
2. Port SSE response handling into `orchestrate` edge function.
3. Update `useOrchestration.callAgent` to consume the stream.
4. Update `FolioCard` to render progressive content.

**Estimate:** 1 day (port) vs 3 days (build from scratch)  
**Owner:** Sonnet (once user identifies the source code)

---

### 7. Cross-CLI Critique Protocol (SOM-02) 🔵 *Agent-to-agent*
**Problem:** One agent can't ask another a question without going through the user.  
**Design:** When any adapter output contains `{ "agent_query": { "to": "<adapter>", "question": "...", "files": ["..."] } }`, the runner/executor:
1. Detects the signal.
2. Instantiates the target adapter inline.
3. Injects the question + file content.
4. Appends the answer as context for the next step re-run.

**This extends the existing adapter fallback chain pattern — it's the same routing logic, but pull-not-push.**  
**Owner:** Sonnet (after SOM-04 persona wiring)

---

### 8. Decision Graph + Institutional Memory (MEM-02) 🔵 *Complexity-high*
**Problem:** Every solved problem is forgotten. Same errors recur.  
**Design:** When a Claw session completes, the runner saves a `decision_record.json` to the workspace:
```json
{ "task": "...", "problem_type": "...", "what_worked": "...", "what_failed": "...", "agent_used": "...", "files_touched": [...] }
```
The concierge reads decision_records from recent sessions when planning new builds. DIFF-02 repo memory is the storage layer (already built).  
**Owner:** Sonnet + DIFF-02 (reuses `repo-memory-update` edge fn)

---

## Part B — Anti-Goals (Opus Section 11, verbatim)

These behaviors mean the UX has failed:
- The user opens drawers to see what the orb already knows.
- The user clicks Council when they want a direct answer.
- The user cancels a build because they can't see what's happening.
- The user reads a long response looking for the recommendation.
- The user has to switch tabs to get a different model's opinion.

**The test:** A user new to Maestro should complete their first build in <15 minutes without reading the docs.

---

## Part C — Agent Team + Lane Assignments

| Agent | Role | What they build |
|-------|------|----------------|
| **Sonnet (Copilot CLI)** | Lead implementer | All wiring, schema changes, executor logic, FLOW-02, AGENT-01, SOM-02, MEM-02 |
| **Opus (Claude CLI)** | Prompt author + critic | SOM-04 persona voices + routing rules, agent_query detection signal, `deliberate` prompt refinement, FLOW-01 classification prompt |
| **Gemini 2.5 Pro** | Large-context UI | FLOW-04 verbosity tiers, FLOW-06 command palette, REFERENCE.md completeness review |
| **OpenAI / Codex / GPT** | Adapter specialist + defensive reviewer | AGENT-01 structured logging in Claw adapters, security review of agent_query routing (SOM-02), DIFF-04 provider fallback matrix, validation of Codex CLI execution paths |

**How they coordinate:**
- Each agent reads `MAESTRO_STATE.md` + `AGENTS.md` on start.
- Active specs are in `docs/specs/active/` — each agent reads only their assigned spec.
- Completed work → session log entry in `MAESTRO_STATE.md` (CLI agents write directly; web agents deliver entry text to Conductor for append).
- No two agents touch the same file in the same pass. Overlap = ACTIVE LOCK.

---

## Part D — Execution Order

```
Sprint Round 1 (parallel):
  Sonnet:   FLOW-02 (orb state machine)
  Gemini:   FLOW-04 (verbosity tiers)
  Opus:     SOM-04 persona voice templates (output to .michael/opus/PERSONAS.md)

Sprint Round 2 (parallel):
  Sonnet:   AGENT-01 (structured session log in runner + adapters)
  Gemini:   FLOW-06 (command palette)
  OpenAI / Codex / GPT: DIFF-04 provider fallback matrix (if not already done)

Sprint Round 3 (sequential):
  Sonnet:   SOM-02 agent_query detection (depends on Opus persona signal format)
  Sonnet:   SOM-01 streaming (depends on user finding source repo)

Sprint Round 4:
  Sonnet:   MEM-02 decision graph (builds on DIFF-02 repo memory)
  Opus:     Critique pass on Round 1-3 output
```

---

## Part E — Open Questions for Conductor

1. **Streaming source:** Which machine/repo has the working SSE streaming code? Android native app? T6 Maestro variant? Identify before Sprint Round 3.
2. **Opus CLI:** Is Opus running on this machine with repo access? Confirm before Sprint Round 1.
3. **Gemini CLI:** Is Gemini 2.5 Pro available as a CLI tool locally? Confirm before Round 1.
4. **build_lanes rows:** Do existing sessions have populated `build_lanes` rows? If not, "Fill from ARCHITECT.md lanes" button in RevealComposer won't show data until a new build runs.
5. **FLOW-01 (kill intent toggle):** Deliberately excluded from this sprint — requires `concierge-triage` edge function (not yet built). Confirm: FLOW-01 stays out.

---

*Last updated: 2026-05-11 — Copilot CLI (Sonnet 4.6), doc cleanup + sprint planning session*
