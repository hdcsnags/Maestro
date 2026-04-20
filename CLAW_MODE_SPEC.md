# Claw Mode — Maestro v2 Architecture Spec

*Draft v0.1 — 2026-04-20. Author: GitHub Copilot (Opus 4.6) with Michael. For council review.*

---

## The Vision

Maestro today is a phase-gated orchestration tool: analysis → design → pre-build → build. The user navigates between phases, each with its own UI surface. It works, but it forces the user to think in Maestro's structure rather than their own.

**Claw Mode replaces this with a chat-first experience.** The user talks to Concierge. Concierge routes work to the Council (thinking) or Claw (execution). The phase transitions happen naturally through conversation, not through UI state machines.

The user never leaves the chat. The chat IS the IDE.

### System Model

```
Maestro    = The operating system (platform, data, auth, state)
Concierge  = The kernel (routing, flow control, context management)
Council    = Distributed intelligence layer (thinking agents — analysis, design, review)
Claw       = Execution engine (local CLI tools — build, scaffold, environment setup)
```

**Council thinks. Claw does. Concierge decides who does what. The user directs.**

---

## 1. Thread Model

### The Problem with Rounds

Today, every interaction is a "round" — one prompt broadcast to N agents, N responses, optional synthesis. This is the only conversational primitive. It doesn't support:

- Back-and-forth with one agent
- Conversational flow with Concierge
- Execution command/result pairs
- Context that accumulates across interactions

### Threads as the Primitive

A **thread** is an ordered sequence of messages between the user and one or more agents. A session contains many threads. Threads have types that determine their behavior.

```
Session
  └── Thread[]
        ├── id: uuid
        ├── session_id: uuid
        ├── type: 'concierge' | 'broadcast' | 'direct' | 'execution'
        ├── agent_id: uuid (nullable — null for concierge/broadcast)
        ├── status: 'active' | 'completed' | 'pinned' | 'archived'
        ├── parent_thread_id: uuid (nullable — for threads spawned from another)
        ├── created_at, updated_at
        └── Message[]
              ├── id: uuid
              ├── thread_id: uuid
              ├── role: 'user' | 'agent' | 'concierge' | 'system'
              ├── agent_id: uuid (nullable — which agent authored this)
              ├── content: text
              ├── context_weight: 'primary' | 'supporting' | 'background'
              ├── metadata: jsonb (artifacts, tool calls, execution results)
              └── created_at
```

### Thread Types

| Type | Shape | Description |
|------|-------|-------------|
| `concierge` | 1:1 | Back-and-forth with Concierge. The default thread. Always exists. |
| `broadcast` | 1:N | Prompt sent to all active council agents. This is today's "round" — same data, new framing. Contains N agent response messages. |
| `direct` | 1:1 | Back-and-forth with a specific agent. Created when user focuses on a carousel card and starts chatting. |
| `execution` | 1:Claw | Command/result pairs with MaestroClaw. Concierge dispatches, Claw executes, results appear as messages. |

### Thread Lifecycle

Threads persist by default. Never auto-deleted. Lifecycle affects context weight, not existence.

| Status | Meaning | Context Weight |
|--------|---------|----------------|
| `active` | User is currently in this thread | Primary |
| `completed` | Synthesis done or user moved on | Supporting (if recent) or Background |
| `pinned` | User explicitly marked as important | Always Supporting (never fades) |
| `archived` | Old, low priority | Background (minimal token allocation) |

### Rounds → Broadcast Threads (Migration)

Existing `rounds` and `responses` tables don't die. A broadcast thread maps directly:

- `round` → `thread` with `type: 'broadcast'`
- `response` → `message` within that thread, `role: 'agent'`
- `synthesis` → `message` with `role: 'concierge'` appended to the broadcast thread (or to the parent concierge thread)

No data loss. The `rounds`/`responses` tables can remain as backing storage or be migrated incrementally.

---

## 2. Layered Context Priority

When Concierge synthesizes, broadcasts, or sends context to any agent, not all threads are equal. Context is assembled with a token budget:

### Priority Tiers

| Tier | Budget | Sources |
|------|--------|---------|
| **Primary** (60%) | Current thread + user's prompt | The active conversation — what we're doing right now |
| **Supporting** (30%) | Pinned threads, recent synthesis results, concierge decisions, active execution results | Important context the user or system flagged |
| **Background** (10%) | Older broadcast threads, completed direct chats, repo state summary, build history | Available if needed, heavily summarized |

### Context Assembly Rules

1. **Active thread is always primary.** If you're in a direct chat with Claude, Claude's thread history is primary context.
2. **Synthesis results are always supporting.** They represent agreed-upon decisions.
3. **Pinned threads never fade below supporting.** User-pinned = "this matters."
4. **Execution results (Claw) are supporting while build is active**, background after.
5. **Older broadcast threads decay to background** unless pinned.
6. **Concierge thread is always at least supporting** — it's the session's reasoning spine.

### Token Budget Example (16K context window)

```
Primary:    ~9,600 tokens — current direct chat with Claude (full history)
Supporting: ~4,800 tokens — last synthesis + pinned "auth strategy" thread (summarized)
Background: ~1,600 tokens — 3 old broadcast rounds (titles + key decisions only)
```

---

## 3. The Concierge Role (Upgraded)

### Current State

Concierge today: receives broadcast responses → synthesizes → optional triage. It's a **post-processor**.

### New State

Concierge becomes: the user's **primary conversation partner + router + state manager**.

### Concierge Capabilities

| Capability | Description |
|------------|-------------|
| **Conversation** | Back-and-forth chat. Answers questions, explains decisions, helps plan. |
| **Broadcast** | User says "ask the orchestra" or Concierge decides a question needs multiple perspectives → creates broadcast thread. |
| **Synthesis** | Reads across all threads (respecting context priority) → produces unified synthesis. |
| **Execution dispatch** | Recognizes when a task needs Claw → creates execution thread → dispatches job → reports results. |
| **Flow management** | Knows where we are: ideation, design, pre-build, build, review. Suggests next steps. Asks the right questions. |
| **Model swap** | User can change which model backs Concierge at any time. Default: Claude Haiku (fast, cheap). Power mode: Sonnet/GPT-5.4. |

### Concierge Routing Logic

When the user sends a message in the concierge thread, Concierge decides:

```
User message
  ├── Is this a question I can answer directly? → Respond in concierge thread
  ├── Does this need multiple perspectives? → Create broadcast thread
  ├── Is this an execution task? → Create execution thread → dispatch to Claw
  ├── Does this need a specific agent? → Create/resume direct thread
  └── Is this a flow transition? → Update session state, guide next step
```

This routing can start **dumb** (explicit buttons: "Broadcast", "Execute", "Ask Claude") and get **smart** later (Concierge infers intent from the message).

### Model-Agnostic Concierge

Any model can be Concierge. A toggle in the chat header lets the user swap:

```
[Concierge: Claude Haiku ▾]  →  [Claude Sonnet 4.6]
                              →  [GPT-5.4]
                              →  [Gemini 2.5 Pro]
```

The concierge thread continues seamlessly — context is in the thread, not in the model.

---

## 4. Council vs Claw — Hard Split

### The Rule

**Council agents think. Claw agents execute. They never mix.**

### Implementation

Add `agent_role` to the agent type system:

```typescript
type AgentRole = 'council' | 'executor';
```

| Role | Appears in | Can do |
|------|-----------|--------|
| `council` | Orchestra drawer, broadcast, carousel, direct chat | Respond to prompts, analyze, design, review |
| `executor` | Claw section only, execution threads | Run CLI commands, scaffold projects, build files, environment setup |

**Enforcement points:**
- `broadcast()` filters to `agent_role === 'council'` only
- `dispatchTaskLocal()` only accepts `agent_role === 'executor'`
- Orchestra drawer shows council agents in the top section, Claw agents in a separate "Execution" section
- Pre-Build builder selection: Claw agents for local, council agents for edge

### This Fixes

- ✅ Claw agents no longer error on broadcast
- ✅ GPT OSS phantom agent issue (if it's not a council agent, it can't fire during broadcast)
- ✅ Clean mental model for the user: "these agents think, these agents build"

---

## 5. Three Views

The workspace has three visual states. Transitions are fluid — no page navigation, no drawer open/close. The chat bar is always visible at the bottom.

### View 1: Orb View (Default — Directing)

```
         ┌─────────────────────────────────────┐
         │          [Claude]                    │
         │            ╲                         │
         │   [Gemini]──(ORB)──[GPT]            │
         │            ╱                         │
         │         [Kimi]                       │
         │                                      │
         │  ┌──────────────────────────────┐    │
         │  │ Concierge: Here's what I     │    │
         │  │ suggest for the auth layer...│    │
         │  │                              │    │
         │  │ You: What about JWT vs       │    │
         │  │ session tokens?              │    │
         │  │                              │    │
         │  │ Concierge: Good question...  │    │
         │  └──────────────────────────────┘    │
         │                                      │
         │  [Direct the orchestra...      ][▶]  │
         └─────────────────────────────────────┘
```

- Orb at center, council agents orbiting
- Concierge conversation visible in the main area
- Chat bar at bottom — messages go to Concierge by default
- Agent nodes show status (idle, thinking, has-response)
- Click an agent node → transitions to Focus View
- Click "Broadcast" (or Concierge decides to) → agents light up, transitions to Carousel View when responses arrive

### View 2: Carousel View (Comparing — Post-Broadcast)

```
         ┌─────────────────────────────────────┐
         │                                      │
         │  ┌────┐  ┌────────────┐  ┌────┐     │
         │  │Left│  │  ACTIVE    │  │Rght│     │
         │  │card│  │  Claude    │  │card│     │
         │  │    │  │            │  │    │     │
         │  │    │  │  Response  │  │    │     │
         │  │    │  │  content   │  │    │     │
         │  └────┘  │            │  └────┘     │
         │          └────────────┘              │
         │                                      │
         │  [Respond to Claude...   ][▶][Synth] │
         └─────────────────────────────────────┘
```

- Existing carousel UX (it's good — keep it)
- Chat bar context-switches: typing here responds to the **focused card's agent**
- Creates a `direct` thread for that agent
- "Synthesize" button sends all threads to Concierge → transitions back to Orb View with synthesis result
- Arrow keys / swipe to navigate cards (existing behavior)

### View 3: Focus View (Direct Chat — Deep Dive)

```
         ┌─────────────────────────────────────┐
         │  ← Back to Orchestra    [Claude] 🟢 │
         │                                      │
         │  ┌──────────────────────────────┐    │
         │  │ You: Can you elaborate on    │    │
         │  │ the WebSocket approach?      │    │
         │  │                              │    │
         │  │ Claude: Sure. The key issue  │    │
         │  │ is connection management...  │    │
         │  │                              │    │
         │  │ You: What about scaling?     │    │
         │  │                              │    │
         │  │ Claude: For horizontal       │    │
         │  │ scaling you'd want...        │    │
         │  └──────────────────────────────┘    │
         │                                      │
         │  [Continue conversation... ][▶][Synth]│
         └─────────────────────────────────────┘
```

- Full-screen chat with one agent
- Thread history preserved — can re-enter later
- "Back to Orchestra" returns to Orb or Carousel
- "Synthesize" available at any time — folds this thread's context into synthesis
- Agent status visible (model name, provider, response time)

### View Transitions

```
Orb View ──[broadcast]──→ Carousel View
Orb View ──[click agent]──→ Focus View
Carousel View ──[click card / type]──→ Focus View
Carousel View ──[synthesize]──→ Orb View (with synthesis)
Focus View ──[back]──→ Orb View or Carousel View
Focus View ──[synthesize]──→ Orb View (with synthesis)
Any View ──[Claw command]──→ Execution panel (slide-up or sidebar)
```

---

## 6. Claw Execution in Chat

### How Execution Surfaces

Claw execution appears as messages in the conversation, not a separate UI:

```
You: Create a GitHub repo called "nexshield-app"

Concierge: On it — sending to Claw.

  ┌─ Claw Execution ──────────────────────┐
  │ ⚡ Running: gh repo create nexshield   │
  │ ✅ Created: github.com/hdcsnags/nex.. │
  │ 📁 Cloned to workspace               │
  └───────────────────────────────────────┘

Concierge: Repo created and cloned. Want me to
scan the structure or start fresh?
```

### Execution Thread

Each Claw dispatch creates an `execution` thread (or appends to an active one). Messages in execution threads:

- `role: 'user'` — the command (from Concierge or user)
- `role: 'system'` — status updates (running, progress)
- `role: 'agent'` — Claw's result (output, artifacts, errors)

### Claw Capabilities (Phased)

**Phase 1 — Code generation** (working today)
- Claude Code CLI builds files from prompts
- Artifacts stored in DB + written to disk

**Phase 2 — Environment commands** (new)
- `gh repo create` — create GitHub repos
- `git clone/init` — repo setup
- `supabase init/link` — project database setup
- `npm init/install` — project scaffolding
- Shell commands run through an `approved_shell` adapter with allowlisted command patterns

**Phase 3 — Interactive sessions** (future)
- Claw maintains a persistent session (not just job → result)
- User can see live CLI output streaming
- Concierge can intervene mid-execution ("stop, change approach")

### Claw State Supplement

When Claw makes environment changes (creates repos, scaffolds projects, installs deps), it appends to a machine-readable state record:

```json
// executor_jobs.environment_changes (new jsonb column)
{
  "repo_created": "hdcsnags/nexshield-app",
  "branch": "main",
  "scaffolded": true,
  "tech_stack": ["react", "typescript", "vite", "tailwind"],
  "files_written": ["package.json", "tsconfig.json", "vite.config.ts"],
  "timestamp": "2026-04-20T04:00:00Z"
}
```

Concierge reads this to maintain awareness of what Claw has done. This replaces the need for a separate `CLAW_CHANGELOG.md` — it's structured data in the DB.

---

## 7. Session Modes

Sessions still have modes, but they're lighter — more like a hint to Concierge about what phase we're in. Concierge can suggest transitions, and the user confirms.

| Mode | Concierge Behavior | Available Actions |
|------|-------------------|-------------------|
| `ask` | Conversational. Routes to council for analysis. | Broadcast, direct chat, synthesis |
| `design` | Encourages mockup requests. Agents produce HTML/visual artifacts. | Broadcast, direct chat, artifact preview |
| `build` | Execution-focused. Concierge manages build plan + Claw dispatch. | Execute, build tasks, progress tracking |
| `review` | Post-build. Routes to bouncer/security review agents. | Security scan, code review, approval |

Mode transitions happen in conversation:

```
You: I think we've got a solid plan. Let's build.

Concierge: Switching to build mode. I'll need to set up
your environment first. Do you want to:
  1. Create a new GitHub repo
  2. Use an existing repo
  3. Skip GitHub for now (local only)
```

---

## 8. Data Model Changes

### New Tables

```sql
CREATE TABLE threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES sessions(id),
  type text NOT NULL,                    -- 'concierge', 'broadcast', 'direct', 'execution'
  agent_id uuid REFERENCES agents(id),   -- null for concierge/broadcast
  status text NOT NULL DEFAULT 'active', -- 'active', 'completed', 'pinned', 'archived'
  parent_thread_id uuid REFERENCES threads(id), -- spawned from which thread
  title text,                            -- auto-generated or user-set
  metadata jsonb DEFAULT '{}',           -- type-specific data
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE thread_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES threads(id),
  role text NOT NULL,                    -- 'user', 'agent', 'concierge', 'system'
  agent_id uuid REFERENCES agents(id),  -- which agent authored (null for user/system)
  content text NOT NULL,
  context_weight text DEFAULT 'primary', -- 'primary', 'supporting', 'background'
  metadata jsonb DEFAULT '{}',           -- artifacts, tool calls, execution refs
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_threads_session ON threads(session_id);
CREATE INDEX idx_threads_type ON threads(session_id, type);
CREATE INDEX idx_messages_thread ON thread_messages(thread_id);
CREATE INDEX idx_messages_created ON thread_messages(thread_id, created_at);

-- RLS
ALTER TABLE threads ENABLE ROW LEVEL SECURITY;
CREATE POLICY threads_owner ON threads FOR ALL USING (
  EXISTS (SELECT 1 FROM sessions s
    JOIN workspaces w ON s.workspace_id = w.id
    WHERE s.id = session_id AND w.owner_id = auth.uid())
);

ALTER TABLE thread_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY messages_owner ON thread_messages FOR ALL USING (
  EXISTS (SELECT 1 FROM threads t
    JOIN sessions s ON t.session_id = s.id
    JOIN workspaces w ON s.workspace_id = w.id
    WHERE t.id = thread_id AND w.owner_id = auth.uid())
);
```

### Modified Tables

```sql
-- agents: add role
ALTER TABLE agents ADD COLUMN IF NOT EXISTS agent_role text DEFAULT 'council';
-- Values: 'council' (thinking), 'executor' (Claw)

-- executor_jobs: add environment tracking
ALTER TABLE executor_jobs ADD COLUMN IF NOT EXISTS environment_changes jsonb;
```

### Compatibility Layer

The existing `rounds`, `responses`, and `syntheses` tables remain. The thread system reads from them for historical data. New interactions go through threads. Migration is incremental:

1. **Phase 1**: Threads exist alongside rounds. Claw Mode uses threads. Legacy mode uses rounds.
2. **Phase 2**: Broadcast in Claw Mode writes to both threads AND rounds (for backward compat).
3. **Phase 3**: Rounds become a read-only view computed from broadcast threads. Rounds table retired.

---

## 9. Implementation Phasing

### Phase 0 — Thread Foundation + Concierge Chat
*The UX foundation. No execution changes.*

- Migration: `threads` + `thread_messages` tables
- `agent_role` column on agents
- New component: `ClawMode.tsx` — the chat-first workspace
- Concierge thread: back-and-forth conversation with selected model
- Model picker in chat header
- Composer mode selector: Analysis | Build | Artifact | **Claw**
- Concierge responds via `orchestrate` edge function (same infra, new UX)

**Exit criteria**: User can enter Claw Mode, chat with Concierge, swap models, have a real conversation.

### Phase 1 — Broadcast from Chat + Carousel
*Wire existing broadcast into the new chat UX.*

- "Ask the Orchestra" button in concierge chat (or Concierge decides)
- Creates broadcast thread, dispatches to council agents
- Carousel View appears when responses arrive
- Direct chat from carousel focus (creates direct thread)
- Synthesize button → Concierge merges threads → returns to Orb View
- Context assembly with priority tiers

**Exit criteria**: User can chat with Concierge → broadcast → read carousel → direct chat one agent → synthesize → back to Concierge. Full loop.

### Phase 2 — Council/Claw Split + Execution
*Hard separation + Claw commands in chat.*

- Enforce `agent_role` in broadcast and execution paths
- Concierge can dispatch execution jobs to Claw
- Execution results appear as messages in the chat
- Shell adapter for environment commands (git, gh, npm, supabase)
- Claw environment_changes tracked in DB

**Exit criteria**: User can say "create a repo" → Concierge dispatches to Claw → repo created → Concierge reports back. All in chat.

### Phase 3 — Build from Chat
*The existing build pipeline, re-routed through the chat UX.*

- Concierge manages build plan generation (replaces concierge edge function's build plan)
- Build tasks dispatch to Claw through execution threads
- Progress visible as messages ("Building src/App.tsx... ✅ Done")
- Artifacts surface inline (code blocks, previews)
- GitHub commit/PR created through Claw or edge function

**Exit criteria**: Full build from chat — plan → approve → execute → commit — without touching the old BuildWorkspace UI.

### Phase 4 — Polish + Migration
*Orb View, thread management, legacy migration.*

- Orb View with orbital agent nodes
- Thread sidebar (list of threads, statuses, pinned)
- Archive/pin UX
- Migrate legacy rounds to broadcast threads (data migration)
- Retire old phase-gate UI (or keep as "Classic Mode")

---

## 10. What We're NOT Building (Scope Boundaries)

To prevent scope creep, these are explicitly out for this spec:

- ❌ Real-time streaming (responses still arrive all-at-once for now)
- ❌ Multi-user / collaborative sessions
- ❌ Voice input/output
- ❌ Plugin/extension system
- ❌ Mobile-optimized layout
- ❌ Autonomous mode (Concierge acts without user confirmation)
- ❌ Cost tracking / token budgeting UI
- ❌ DevOps pipeline replacement (separate future spec)

---

## 11. Open Questions for Council

1. **Thread limits**: Should a session have a max number of active threads? Or let them accumulate and rely on context priority to manage token budgets?

2. **Concierge memory**: Should Concierge maintain a running "session summary" that updates after each synthesis? Like a living document it can reference without re-reading all threads?

3. **Broadcast scope**: When broadcasting from Claw Mode, should it go to ALL active council agents or should the user select a subset? Current behavior is all-active.

4. **Direct chat model**: When in Focus View chatting with "Claude Sonnet," does the message go through the `orchestrate` edge function (same as broadcast, but 1 agent) or through a new direct-chat endpoint?

5. **Execution approval**: Should all Claw commands require user confirmation, or should Concierge have a "trusted commands" list it can auto-execute (e.g., `git status` is safe, `rm -rf` is not)?

6. **Orb View vs current Orb**: The current orb is visual-only. The new Orb View makes it interactive (click agents). Is the orbital layout worth the engineering cost, or should we start with a simpler agent list and add the orbital layout later?

7. **Design round**: Should mockup generation be a special thread type, or just a regular broadcast/direct thread where the prompt asks for HTML? Leaning toward the latter — no special infrastructure, just good prompting.

---

## 12. Success Criteria

When Claw Mode ships, a user can:

1. ✅ Enter Claw Mode from the composer
2. ✅ Chat with Concierge (any model) — real conversation, not just broadcast
3. ✅ Broadcast to the orchestra from chat — carousel appears
4. ✅ Click a carousel card and have a direct 1:1 conversation
5. ✅ Synthesize at any time — Concierge merges all context
6. ✅ Ask Concierge to create a repo → Claw executes → result in chat
7. ✅ Go through a full build: plan → approve → build → commit — all in chat
8. ✅ Re-enter any previous thread without losing context
9. ✅ Pin important threads so they always inform future decisions
10. ✅ Trace any synthesis decision back to the thread/agent that generated it

---

*This spec is a living document. Council feedback welcome. Implementation begins after spec approval.*
