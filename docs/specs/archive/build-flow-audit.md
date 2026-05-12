# MAESTRO APP — COMPREHENSIVE USER FLOW AUDIT

## EXECUTIVE SUMMARY
The Maestro app implements a 6-phase workflow (Analysis → Design → Pre-Build → Build → Bouncer → Complete) with intelligent concierge routing, agent orchestration, and security-gated code execution. The flow is **session-based** and driven by `current_phase` field changes in the database. Below is the complete trace from cold start to build completion.

---

## 1. APP LOAD & SESSION START

### 1.1 Initial Page Load
**File:** `src/pages/WorkspacePage.tsx`

On mount, checks:
1. **`if (state.initError)`** → Shows error modal with Retry/Sign Out buttons (lines 153–204)
2. **`if (!state.workspace)`** → Shows `<LoadingScreen />` (line 207)
3. **Otherwise** → Renders the full stage with topbar, empty state/carousel, composer, and modals (lines 210–248)

**Key Initial State:** From `src/context/MaestroContext.tsx` (lines 103–139):
```javascript
const initial: MaestroState = {
  workspace: null,
  activeSession: null,
  rounds: [],
  responses: [],
  isBroadcasting: false,
  isSynthesizing: false,
  conciergeVisible: false,
  orchestrationMode: 'analysis',
  executionMode: 'pr_flow',
  carouselVisible: false,
  // ... more fields
};
```

### 1.2 Session Initialization Hook
**File:** `src/hooks/useWorkspace.ts` (lines 325–349)

Runs on user sign-in:
1. **`ensureWorkspace()`** → Creates workspace if none exists (lines 11–46)
2. **`ensureAgents(workspaceId)`** → Race-safe seed of 15 canonical agents via upsert (lines 48–88)
3. **`loadSessions(workspaceId)`** → Loads all sessions for the workspace (lines 90–100)
4. **`loadProviderConnections()`** → Loads user's API keys for Claude, OpenAI, etc. (lines 154–162)
5. **`loadAgentSkills()`** → Loads custom agent skills (lines 164–172)
6. **`loadRepoConnections(workspaceId)`** → Loads GitHub repo connections and sets active one (lines 174–185)

**CRITICAL:** Does **NOT** auto-load the latest active session. User lands in clean state (comment at line 341–343).

### 1.3 Empty Stage Display
**File:** `src/components/reveal/EmptyStage.tsx`

Shows the **Maestro orb** with 4 animation modes:
- **`idle`** (default) — 3s pulse, status: `"{activeCount} voices standing by"`
- **`broadcasting`** — 1.5s pulse, cycles through BROADCAST_MESSAGES (lines 18–24)
- **`synthesizing`** — breathing expand/contract + expanding ring, cycles SYNTH_MESSAGES (lines 26–30)
- **`concierge`** — steady glow, status: `"Concierge ready"`

When carousel hidden but responses exist: Shows `"N responses ready — watch council →"` button (lines 138–162).

### 1.4 No Session → Type to Auto-Start Flow
**File:** `src/pages/WorkspacePage.tsx` (lines 58–69)

```typescript
const handleBroadcast = useCallback(async (prompt: string, selectedAgentIds: string[]) => {
  let sessionForBroadcast = state.activeSession;
  if (!sessionForBroadcast && state.workspace) {
    const created = await createSession(state.workspace.id);
    if (!created) return;
    sessionForBroadcast = created;
  }
  await broadcast(prompt, selectedAgentIds, sessionForBroadcast);
}, [...]
```

**What happens:**
1. User types in composer (textarea in `RevealComposer`)
2. Clicks "Broadcast" or hits Ctrl+Enter
3. If no active session → `createSession()` fires (from `useWorkspace.ts` line 240–271)
4. New session created in DB with title `"Session {count}"`, `execution_mode: 'pr_flow'`, `status: 'active'`
5. Context updated: `SET_ACTIVE_SESSION`, rounds/responses/syntheses cleared
6. `broadcast()` immediately called with fresh session

---

## 2. FIRST MESSAGE / BROADCAST

### 2.1 Input Component
**File:** `src/components/reveal/RevealComposer.tsx`

**UI Elements:**
- Textarea placeholder: `"Direct the orchestra..."`
- Agent toggle buttons (tiny circles, 18px) to select which agents to target
- Three mode toggle buttons: `analysis`, `build`, `artifact`
- Cost estimate display (local calculation, not billed)
- Context fill meter (tokens / 128k limit)
- "Orchestra" button to open agent drawer
- "Broadcast" button (disabled if `!prompt.trim() || isBroadcasting || capBlocks || capNeedsAck`)

**State management:**
- `selectedIds`: array of agent IDs to target (defaults to all active agents)
- `prompt`: text content
- `elevatedCapAck`: checkbox for elevated mode confirmation
- Premium slot cap warning if >3 premium agents selected

### 2.2 Full Broadcast Flow
**File:** `src/hooks/useOrchestration.ts` (lines 103–233)

#### 2.2.1 Triage Check (Lines 114–156)
**Triggered on first broadcast only** (`!skipTriage` when `phase !== 'build'` && `phase !== 'pre_build'` && `rounds.length === 0`):

```javascript
dispatch({ type: 'SET_IS_TRIAGING', payload: true });
// POST /concierge-triage with 5s timeout
const triageRes = await Promise.race([fetch(...), 5s timeout]);
```

**Concierge triage decides:** If `route === 'simple_ask'` && `confidence >= 0.75`:
- Sets `triageResult` in context
- **Returns early** — no broadcast
- ConciergePanel shows quick answer with "Ask the council anyway" button (lines 137–146)

Otherwise → proceeds to full broadcast.

#### 2.2.2 Round Creation (Lines 158–197)
Creates a `Round` in DB:
```javascript
{
  session_id: session.id,
  user_id: user.id,
  round_number: nextRoundNumber,
  prompt,
  target_agents: selectedAgentIds,
  status: 'broadcasting'
}
```

Dispatches: `ADD_ROUND` to context.

#### 2.2.3 Agent Calling (Lines 204–211)
For each target agent, calls `callAgent()`:

```javascript
await Promise.all(
  targetAgents.map(agent => callAgent(agent, prompt, roundId, orchestrationMode, tiered.contextText, tiered.contextFiles))
);
```

**`callAgent()` (lines 235–382):**
- Builds augmented prompt with tiered context (Tier 1–3: latest synthesis, recent rounds, pinned responses)
- Adds context_files for build mode (literal scoped paths only, max 5 files, 50KB each)
- POSTs to `/orchestrate` edge function with:
  - `prompt`, `provider`, `model`, `agentName`, `agentRole`, `agentSkills`, `mode`, `repo_connection_id`, `context_files`
- Parses response: `content`, `title`, `signals`, `artifacts`, `file_manifest`
- Inserts into `responses` table
- On error: inserts error response with message "Error: Could not reach {agent}..."

#### 2.2.4 Auto-Synthesize & Concierge (Lines 218–226)
After all agents respond:
```javascript
dispatch({ type: 'SET_IS_BROADCASTING', payload: false });
dispatch({ type: 'SET_IS_SYNTHESIZING', payload: true });
await synthesizeRef.current?.(roundId);
dispatch({ type: 'SET_IS_SYNTHESIZING', payload: false });
```

**`synthesize()` (lines 462–516):**
- Filters responses: if any flagged, use flagged; else all
- Combines into one string: `[{agent_name} — {agent_role}]:\n{content}`
- POSTs to `/synthesize` → gets back synthesized content
- Inserts into `syntheses` table
- **Auto-triggers concierge:** `triggerConcierge(phase, roundId, synthesis_content)`

**`triggerConcierge()` (lines 385–460):**
- POSTs to `/concierge` with `phase`, `responses`, `synthesis`
- Returns `ConciergeDecision`:
  ```javascript
  {
    alignment_summary,
    tension_points: [],
    recommended_direction,
    recommended_next_phase?: 'design' | 'pre_build' | 'build' | 'analysis',
    design_mode?: 'lite' | 'standard' | 'exploration',
    model_used
  }
  ```
- Sets `conciergeVisible: true`

### 2.3 UI During Broadcasting
**File:** `src/components/reveal/EmptyStage.tsx`

When `isBroadcasting` is true:
- Orb animates in **broadcasting mode** (faster pulse, intensified glow)
- Status text cycles: `"Consulting the council…" → "Weighing perspectives…" → "Agents are thinking…" → "Synthesizing views…" → "Reading the room…"` (3.5s intervals)

When `isSynthesizing` is true:
- Orb animates in **synthesizing mode** (breathing + expanding ring)
- Status cycles: `"Synthesizing…" → "Finding alignment…" → "Resolving tensions…"`

---

## 3. CONCIERGE / SYNTHESIS

### 3.1 Concierge Decision Display
**File:** `src/components/reveal/ConciergePanel.tsx`

#### 3.1.1 Simple Ask (Triage Route)
If `triageResult.route === 'simple_ask'`:
- Shows centered modal with confidence score
- Displays `triage.direct_answer` or `triage.reasoning`
- Two action buttons:
  - **"Ask the council anyway"** → Clears triage, re-broadcasts with full agents (line 138)
  - **"Got it"** → Closes panel

#### 3.1.2 Full Concierge Decision
For analysis/design/build routes:
- **Header:** Concierge label + phase badge + "quick answer" badge (if simple_ask)
- **Recommended next phase** (if not simple ask): e.g., `"→ Recommended: Design Phase (2 designers)"`
- **Body sections:**
  - **"Where the council agrees"** — `alignment_summary`
  - **"Points of tension"** — bullet list of `tension_points`
  - **"Recommended direction"** — `recommended_direction` text
- **Action bar:**
  - **"→ {Phase}"** button (gold) → Calls `advancePhase()`, updates `sessions.current_phase`, shows toast, closes panel
  - **"Round 2"** button → Re-broadcasts with same agents
  - **"Override"** button → Clears decision, hides panel (allows manual routing)
  - **"Report"** button → Downloads markdown report
  - Model attribution: `"via {model}"`

### 3.2 What ConciergePanel Shows by Phase

| Phase | Next Recommendation | UI Elements |
|-------|---------------------|-------------|
| `post_round1` | `'design'` or `'analysis'` | Design mode badge (lite/standard/exploration), Proceed button |
| `post_round2` | `'pre_build'` or `'analysis'` | Proceed button, Round 2 option |
| `design` | `'pre_build'` | Shown after design artifacts selected |
| `pre_build` | `'build'` | Shown after architect generates scaffold |
| `post_build` | `'bouncer'` | Shown after build execution |

### 3.3 Triage Simple Ask Path
When triage confidence >= 0.75 and route === 'simple_ask':
- **ConciergePanel.tsx line 149–210:** Shows quick answer modal
- **Button "Ask the council anyway"** (line 138–146):
  ```javascript
  dispatch({ type: 'SET_TRIAGE_RESULT', payload: null });
  dispatch({ type: 'SET_CONCIERGE_VISIBLE', payload: false });
  // Re-broadcast with active agents
  broadcast(lastPrompt, activeAgentIds);
  ```

---

## 4. DESIGN PHASE

### 4.1 Trigger: How to Enter Design
**File:** `src/components/reveal/ConciergePanel.tsx` (lines 53–77)

User clicks **"→ Design Phase"** in Concierge panel:
```javascript
const handleProceed = async () => {
  if (next === 'design') {
    const toast = modeLabel ? `Starting Design (${modeLabel})` : 'Moving to Design phase';
    await advancePhase('design', toast);
  }
}

const advancePhase = async (phase: SessionPhase, toastMsg: string) => {
  await supabase.from('sessions').update({ current_phase: phase }).eq('id', session.id);
  dispatch({ type: 'SET_ACTIVE_SESSION', payload: { ...session, current_phase: phase } });
  dispatch({ type: 'SHOW_TOAST', payload: toastMsg });
}
```

This updates `sessions.current_phase = 'design'` in DB. The DesignPhase component renders when `session.current_phase === 'design'`.

### 4.2 Design Phase Component
**File:** `src/components/reveal/DesignPhase.tsx`

#### 4.2.1 Header & Controls
- Title: `"Design Phase"` + mode badge (Lite/Standard/Exploration)
- **"Skip design →"** button (lines 335–343) → Skips to pre_build
- **"Run designers"** button (lines 344–350) → Calls `/design` edge function

#### 4.2.2 Designer Triggering
`handleRun()` (lines 141–197):
```javascript
const res = await fetch(`${supabaseUrl}/functions/v1/design`, {
  method: 'POST',
  body: JSON.stringify({
    session_id: session.id,
    design_mode: designMode,  // 'lite' | 'standard' | 'exploration'
    brief: recommended_direction,
  }),
});
```

**Design modes:**
- **`lite`** → 1 designer (visual_spatial only)
- **`standard`** → 2 designers (visual_spatial + structure_ux)
- **`exploration`** → 4 designers (all roles)

Returns array of `DesignArtifact[]`:
```javascript
{
  designer_role: 'visual_spatial' | 'structure_ux' | 'product_practical' | 'wildcard_fusion',
  agent_name: string,
  html_content: string,  // raw HTML, often wrapped in JSON
  rationale: string,
  tradeoffs: string,
  model_used: string,
  error?: string
}
```

#### 4.2.3 HTML Extraction & Preview
**Lines 33–79:** `extractHtml()` helper:
- Strips markdown code fences (```html, ```json)
- Handles JSON-wrapped content (double-escape scenarios)
- Unescapes JSON string escapes (`\n`, `\"`, etc.)
- Returns clean HTML

**Fallback for blank previews:** If `extractHtml()` returns empty string, the iframe shows nothing (no fallback text in current code).

#### 4.2.4 Selection / Flag / Skip Flow

**Select artifact:**
```javascript
const handleSelect = async (role: DesignerRole) => {
  // Mark selected in DB
  await supabase.from('design_artifacts').update({ selected_for_build: true })
    .eq('session_id', session.id).eq('designer_role', role);
  // Advance to pre_build
  await supabase.from('sessions').update({ current_phase: 'pre_build' })
    .eq('id', session.id);
  dispatch({ type: 'SET_ACTIVE_SESSION', payload: { ...session, current_phase: 'pre_build' } });
  dispatch({ type: 'OPEN_DRAWER', payload: 'pre-build' });
  dispatch({ type: 'SHOW_TOAST', payload: `${lane?.display_name} selected. Moving to Pre-Build.` });
};
```

**Flag artifacts:**
```javascript
const toggleFlag = (role: DesignerRole) => {
  setFlagged(prev => { ... });  // Toggle in local state
}
```

**Merge flagged:**
If 2+ flagged: `handleMerge()` (lines 238–250):
```javascript
// Mark flagged in DB, then advance to pre_build
await supabase.from('design_artifacts').update({ flagged_by_conductor: true })
  .eq('session_id', session.id).eq('designer_role', role);
// Update phase to pre_build
```

**Skip design:**
```javascript
const handleSkip = async () => {
  await supabase.from('sessions').update({ current_phase: 'pre_build' }).eq('id', session.id);
  dispatch({ type: 'SET_ACTIVE_SESSION', payload: { ...session, current_phase: 'pre_build' } });
  dispatch({ type: 'OPEN_DRAWER', payload: 'pre-build' });
  dispatch({ type: 'SHOW_TOAST', payload: 'Design skipped. Moving to Pre-Build.' });
};
```

---

## 5. PRE-BUILD PHASE

### 5.1 Component & Visibility
**File:** `src/components/reveal/PreBuildPanel.tsx`

Renders as drawer when `state.activeDrawer === 'pre-build'`. Opened by:
- Design phase: selecting/flagging/skipping (opens drawer, advances phase to pre_build)
- ConciergePanel: after concierge recommends pre_build
- Ctrl+B keyboard shortcut

### 5.2 Three Sub-Steps

#### 5.2.1 B6 — Intake Scan (Existing Repos Only)
**File:** `src/components/reveal/PreBuildPanel.tsx` (lines 232–281)

Visible only if `projectType === 'existing'` and `hasRepo`.

`handleScan()`:
```javascript
const res = await fetch(`${supabaseUrl}/functions/v1/intake`, {
  method: 'POST',
  body: JSON.stringify({
    session_id: state.activeSession.id,
    repo_connection_id: state.activeRepoConnection.id,
  }),
});

const data = await res.json();
setScanResult(data.intake_summary);  // IntakeSummary

// Refresh session in context
dispatch({
  type: 'SET_ACTIVE_SESSION',
  payload: {
    ...state.activeSession,
    build_spec: {
      ...(state.activeSession.build_spec ?? {}),
      intake_summary: data.intake_summary,
    },
  },
});
```

Returns `IntakeSummary`:
```javascript
{
  stack: string[],
  architecture_notes: string,
  risk_files: string[],
  safe_zones: string[],
  estimated_complexity: 'low' | 'medium' | 'high'
}
```

**Error handling:** If Anthropic key missing → throws "Add an Anthropic API key in the Vault first."

#### 5.2.2 B7 — Architect Generation
**File:** `src/components/reveal/PreBuildPanel.tsx` (lines 284–340)

`handleGenerate()`:
```javascript
const res = await fetch(`${supabaseUrl}/functions/v1/architect`, {
  method: 'POST',
  body: JSON.stringify({ session_id: state.activeSession.id }),
});

const data = await res.json();
setArchitectMd(data.architect_md);

// C1: Architect auto-assigns lanes and locks spec
const autoLocked = data.build_spec_locked === true;
const lanesAssigned = data.lanes_assigned === true;

dispatch({
  type: 'SET_ACTIVE_SESSION',
  payload: {
    ...state.activeSession,
    architect_md: data.architect_md,
    ...(autoLocked ? { build_spec_locked: true } : {}),
  },
});
```

Returns:
- **`architect_md`** — markdown file describing tech stack, file structure, lanes, build instructions
- **`suggested_lanes`** — `SuggestedLane[]` with `agent_name`, `lane_paths`, `role`
- **`build_spec_locked`** — boolean (true if architect auto-locked)
- **`lanes_assigned`** — boolean (true if lanes auto-assigned)

**Auto-lock from C1:** If architect returns `build_spec_locked: true`:
```javascript
await supabase.from('sessions').update({ build_spec_locked: true }).eq('id', session.id);
setLanesLocked(true);
dispatch({ type: 'SHOW_TOAST', payload: 'Lanes auto-assigned and locked by Architect' });
```

#### 5.2.3 B5 — Lane Assignment & Lock
**File:** `src/components/reveal/PreBuildPanel.tsx` (lines 67–217)

**Lane Entry structure:**
```javascript
interface LaneEntry {
  agent_name: string;
  agent_id: string;
  lane_paths: string[];
  role: BuildLaneRole;  // 'builder' | 'reviewer' | 'read_only' | 'security_audit'
  editing: boolean;
  pathDraft: string;
}
```

**UI options:**
- **"Auto-fill from suggestions"** → Populates lanes from architect's `suggested_lanes` (line 102)
- **"Add lane"** → Adds blank lane entry (line 120)
- **"Remove lane"** → Deletes lane by index (line 134)
- **Role dropdown** per lane: builder, reviewer, read_only, security_audit
- **Path editor** — comma-separated list of file paths (line 142)

**Validation:** `getOverlaps()` (lines 151–165) detects duplicate paths among builder lanes. Shows error if overlap exists.

**Lock spec:**
```javascript
const handleLockSpec = async () => {
  // Validate: must have builders, no overlaps
  if (!canLock) return;
  
  // Upsert lanes into build_lanes table
  const rows = lanes.map(l => ({
    session_id: state.activeSession.id,
    agent_id: l.agent_id || null,
    agent_name: l.agent_name,
    lane_paths: l.lane_paths,
    role: l.role,
  }));
  
  await supabase.from('build_lanes').delete().eq('session_id', session.id);
  await supabase.from('build_lanes').insert(rows);
  
  // Lock spec
  await supabase.from('sessions').update({ build_spec_locked: true }).eq('id', session.id);
  setLanesLocked(true);
  dispatch({ type: 'SHOW_TOAST', payload: 'Build Spec Locked ✓' });
};
```

**"Go to Build" button:**
```javascript
const handleGoToBuild = async () => {
  await supabase.from('sessions').update({ current_phase: 'build' }).eq('id', session.id);
  dispatch({
    type: 'SET_ACTIVE_SESSION',
    payload: { ...state.activeSession, current_phase: 'build' },
  });
  dispatch({ type: 'SHOW_TOAST', payload: 'Entering Build phase' });
};
```

---

## 6. BUILD PHASE

### 6.1 Component & Visibility
**File:** `src/components/reveal/BuildWorkspace.tsx`

Full-screen overlay. Visible when `session.current_phase === 'build'` or `'bouncer'`.

**Render gate (line 85):**
```javascript
const isVisible = session?.current_phase === 'build' || session?.current_phase === 'bouncer';
```

### 6.2 Build Stages State Machine
**Type:** `BuildStage` (line 37):
```javascript
type BuildStage = 'preparing' | 'plan_review' | 'broadcast' | 'broadcasting' | 'reviewing' | 'ready' | 'executing' | 'complete' | 'bouncer' | 'done';
```

### 6.3 Stage-by-Stage Flow

#### 6.3.1 **`preparing`**
**Entry:** When component mounts or `stage === 'preparing'`

**Auto-triggered (lines 146–173):**
```javascript
useEffect(() => {
  if (stage !== 'preparing' || preparingTriggered.current) return;
  preparingTriggered.current = true;
  
  (async () => {
    const res = await fetch(`${supabaseUrl}/functions/v1/concierge`, {
      method: 'POST',
      body: JSON.stringify({
        session_id: session.id,
        phase: 'pre_build_complete'
      }),
    });
    const plan = await res.json();
    dispatch({ type: 'SET_BUILD_PLAN', payload: plan });
    setStage('plan_review');  // Advance if success
  })();
}, [session, isVisible, stage, ...]);
```

**UI:** Spinner + cycling "Concierge is reading the blueprint…" messages (lines 617–627)

**On success:** Transitions to `plan_review`

**On failure:** Falls back to `broadcast` (manual mode)

#### 6.3.2 **`plan_review`**
**Concierge build plan displayed.**

**`buildPlan` structure:**
```javascript
{
  build_summary: string,
  builder_agents: [{
    agent_id: string,
    agent_name: string,
    instruction: string,
    scoped_paths: string[]
  }],
  build_prompt: string
}
```

**UI (lines 630–703):**
- Summary card: `build_summary` text
- Builder assignments list with scoped paths
- Collapsible "Build Prompt Preview"
- **"Approve & Build"** button (gold, top-right) → `handleApprovePlan()`
- **"Skip to manual broadcast"** button → jumps to `broadcast` stage

**`handleApprovePlan()` (lines 176–198):**
```javascript
const builderAgentIds = buildPlan.builder_agents
  .map(b => b.agent_id)
  .filter(Boolean);

if (builderAgentIds.length === 0) {
  setError('No builder agents in concierge plan.');
  setStage('broadcast');
  return;
}

setStage('broadcasting');
await broadcast(buildPlan.build_prompt, builderAgentIds);
```

#### 6.3.3 **`broadcast`** (Manual Fallback)
**Entry:** If plan_review skipped or approval failed

**UI (lines 558–570):**
- **"Start Building"** button calls `handleBuildBroadcast()`

**`handleBuildBroadcast()` (lines 260–303):**
```javascript
const builderAgentIds = lanes
  .filter(l => l.role === 'builder')
  .map(l => {
    // Prefer agent_id from build_lanes, fall back to fuzzy name match
    if (l.agent_id) return l.agent_id;
    const agent = state.agents.find(a =>
      a.name === l.agent_name ||
      a.name.toLowerCase().includes(l.agent_name.toLowerCase())
    );
    return agent?.id;
  })
  .filter((id): id is string => !!id);

const architectMd = session.architect_md ?? '';
const prompt = [
  'BUILD MODE — Generate code patches for your assigned files.',
  '',
  architectMd ? `## ARCHITECT.md\n\n${architectMd}` : '',
  '',
  'For each file in your lane, produce the complete file content.',
  'Follow the architecture, file tree, and tech stack defined above.',
  'Return your output as code blocks with file paths.',
].filter(Boolean).join('\n');

setStage('broadcasting');
await broadcast(prompt, builderAgentIds);
```

**Key detail:** Uses architecture.md in prompt, agent lane assignment for context.

#### 6.3.4 **`broadcasting`**
**Entry:** After broadcast() starts

**Auto-detect build round (lines 224–237):**
```javascript
const sessionRounds = state.rounds.filter(r => r.session_id === session.id);
const lastRound = sessionRounds[sessionRounds.length - 1];
if (lastRound) {
  setBuildRoundId(lastRound.id);
}
```

**Watch for responses (lines 241–246):**
```javascript
useEffect(() => {
  if (stage !== 'broadcasting' || buildRoundId) return;
  const sessionRounds = state.rounds.filter(r => r.session_id === session?.id);
  const lastRound = sessionRounds[sessionRounds.length - 1];
  if (lastRound) setBuildRoundId(lastRound.id);
}, [stage, buildRoundId, state.rounds, session]);
```

**Auto-transition to reviewing (lines 248–256):**
```javascript
useEffect(() => {
  if (stage !== 'broadcasting' || !buildRoundId) return;
  const roundResponses = state.responses.filter(r => r.round_id === buildRoundId);
  const builderCount = lanes.filter(l => l.role === 'builder').length || 1;
  if (roundResponses.length >= builderCount) {
    setApprovedResponseIds(new Set(roundResponses.map(r => r.id)));
    setStage('reviewing');
  }
}, [stage, buildRoundId, state.responses, lanes]);
```

**UI:** Spinner + cycling BUILD_BROADCAST_MESSAGES (lines 99–111)

#### 6.3.5 **`reviewing`**
**Shows response cards from builder agents.**

**UI (lines 572–587):**
- Each response card displays agent name, role, content preview
- Toggle checkbox per response for approval
- **"Approve & Continue ({count})"** button calls `setStage('ready')`

**`toggleResponseApproval()` (lines 305–312):**
```javascript
const toggleResponseApproval = (responseId: string) => {
  setApprovedResponseIds(prev => {
    const next = new Set(prev);
    if (next.has(responseId)) next.delete(responseId);
    else next.add(responseId);
    return next;
  });
};
```

#### 6.3.6 **`ready`**
**Final checkpoint before execution.**

**UI (lines 589–601):**
- **"Execute Build"** button (gold) calls `handleExecute()`

#### 6.3.7 **`executing`**
**Entry:** `handleExecute()` starts

**Full execution logic (lines 315–413):**

1. **Create execution_run** in DB:
```javascript
const { data: runData } = await supabase.from('execution_runs').insert({
  session_id: session.id,
  user_id: user.id,
  execution_mode: state.executionMode,
  strategy: state.executionStrategy,
  status: 'approved',
  requires_approval: state.executionMode === 'elevated',
  patch_content: '',
  branch_name: '',
  pr_url: '',
  result: {},
});
```

2. **Assemble patches from approved responses:**
```javascript
const approved = buildResponses.filter(r => approvedResponseIds.has(r.id));
const patches = approved.map(r => {
  const lane = lanes.find(l => l.agent_id === r.agent_id)
    || lanes.find(l => l.agent_name === r.agent_name)
    || lanes.find(l => l.agent_name.toLowerCase().includes((r.agent_name ?? '').toLowerCase()));
  return {
    agent_name: lane?.agent_name ?? r.agent_name,
    agent_id: r.agent_id,  // ← C2 fix: match by agent_id first
    content: r.content,
    scoped_paths: lane?.lane_paths ?? [],
    commit_message: `${lane?.agent_name ?? r.agent_name}: build patch`,
    conductor_approved: true,
    file_manifest: r.file_manifest ?? [],
  };
});
```

**Key note:** `agent_id` matching is now reliable (C2 commit fixed this).

3. **Call github-execute:**
```javascript
const res = await fetch(`${supabaseUrl}/functions/v1/github-execute`, {
  method: 'POST',
  body: JSON.stringify({
    execution_run_id: run.id,
    session_id: session.id,
    execution_mode: state.executionMode,
    strategy: state.executionStrategy,
    patches,
  }),
});
```

4. **Handle response:**
```javascript
const result = data.result ?? data;
setWrittenFiles((result.written_files as string[]) ?? []);
setSkippedFiles((result.skipped_files as { path: string; reason: string }[]) ?? []);
setPrUrls((result.prs as string[]) ?? []);
setCollisionCount(((result.collisions as unknown[]) ?? []).length);
setHandoffs((result.handoffs_requested as { from_agent: string; path: string }[]) ?? []);
setBackupBranch((result.backup_branch as string) ?? '');
setStage('complete');

dispatch({ type: 'UPDATE_EXECUTION_RUN', payload: { id: run.id, status: 'complete', result } });
dispatch({ type: 'SHOW_TOAST', payload: `Build complete — ${written_files.length} files written` });
```

#### 6.3.8 **`complete`**
**Build finished successfully.**

**UI shows:**
- Written files count
- Skipped files (with reasons)
- PR links
- Collision warnings
- Handoff requests

**"Go to Bouncer" button** (line 601) → calls `handleBouncer()` → transitions to `bouncer` stage

#### 6.3.9 **`bouncer`** (Security Review)
**Entry:** User clicks "Go to Bouncer" after execute completes

**`handleBouncer()` (lines 416–460):**
```javascript
await supabase.from('sessions').update({ current_phase: 'bouncer' }).eq('id', session.id);
dispatch({ type: 'SET_ACTIVE_SESSION', payload: { ...session, current_phase: 'bouncer' } });

const res = await fetch(`${supabaseUrl}/functions/v1/bouncer`, {
  method: 'POST',
  body: JSON.stringify({
    session_id: session.id,
    trigger: 'end_of_build',
    files: writtenFiles,
  }),
});

const data = await res.json();
setBouncerResult(data as BouncerResult);
setStage('bouncer');
```

**BouncerResult:**
```javascript
{
  findings: [{
    file: string,
    issue: string,
    severity: 'minor' | 'critical_pause' | 'critical_approved',
    suggestion: string
  }],
  overall_severity: string,
  summary: string,
  model_used: string
}
```

**UI displays:**
- Findings table with file, issue, severity (color-coded)
- Overall severity badge
- Summary text

**Conductor decision buttons (lines 462–511):**
- **"Pause"** → Stays in bouncer (user must fix critical issues)
- **"Abort"** → Returns to pre_build phase
- **"Approve & Continue"** → Advances to `done`, updates phase to `complete`

```javascript
const handleConductorDecision = async (decision: string) => {
  // Record decision in bouncer_events
  if (decision === 'pause') {
    // Stay in bouncer
  } else if (decision === 'abort') {
    await supabase.from('sessions').update({ current_phase: 'pre_build' }).eq('id', session.id);
    // Return to pre_build
  } else {
    // approve_continue or acknowledge
    await supabase.from('sessions').update({ current_phase: 'complete' }).eq('id', session.id);
    setStage('done');
    dispatch({ type: 'SHOW_TOAST', payload: 'Build approved — session complete ✓' });
  }
};
```

#### 6.3.10 **`done`**
**Build complete and approved.**

Session phase is now `'complete'`. WorkspacePage will show BuildReport.

---

## 7. BUILD REPORT

### 7.1 Visibility & Fetch
**File:** `src/components/reveal/BuildReport.tsx`

Renders only when `session.current_phase === 'complete'` (line 50).

**Auto-fetch on mount (lines 52–80):**
```javascript
useEffect(() => {
  if (!isComplete || !session) {
    setLoading(false);
    return;
  }

  (async () => {
    setLoading(true);
    const { data } = await supabase
      .from('build_reports')
      .select('*')
      .eq('session_id', session.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (data?.[0]) {
      const row = data[0];
      setReport({
        id: row.id,
        session_id: row.session_id,
        files_written: row.files_written ?? [],
        files_skipped: row.files_skipped ?? [],
        collisions: row.collisions ?? [],
        handoffs_pending: row.handoffs_pending ?? [],
        bouncer_summary: row.bouncer_summary,
        pr_links: row.pr_links ?? [],
        backup_branch: row.backup_branch ?? null,
        architect_md_updated: row.architect_md_updated ?? false,
        created_at: row.created_at,
      });
    }
  })();
}, [isComplete, session]);
```

### 7.2 Report Display
**Sections:**
- **Summary card:** Build completion time, file count, PR count
- **Files written:** List of paths
- **Files skipped:** Path + reason
- **Collisions:** Paths written by multiple agents
- **Handoffs pending:** from_agent, to_lane, path, reason
- **Bouncer findings:** (if ran) severity badge + issue text
- **PR links:** Clickable GitHub URLs
- **Backup branch:** Reference branch created during build

---

## 8. EDGE CASES & KNOWN GAPS

### 8.1 Concierge Failures
**If `/concierge` returns error:**
- **Non-fatal in synthesis path** (line 457): logs to console, continues
- **In build plan (lines 159–163):** Falls back to `broadcast` stage (manual override available)
- **In bouncer (line 449):** Shows error message, requires Anthropic key

**Error display (line 606–613):** Red banner with AlertTriangle icon

### 8.2 Architect Failures
**If `/architect` returns error (lines 304–309):**
- Throws error with message
- Sets `architectError` state
- Message options:
  - `'ANTHROPIC_KEY_MISSING'` → "Add an Anthropic API key in the Vault first."
  - Other → "Generation failed ({status})"

**UI:** Shows error message, user can retry.

### 8.3 No Agents Respond
**In build broadcasting (lines 279–283):**
```javascript
if (builderAgentIds.length === 0) {
  setError('No builder agents found in lane assignments. Assign builders in Pre-Build first.');
  setStage('broadcast');
  return;
}
```

**Error shown to user.** Can manually select agents and retry.

### 8.4 Session Resume / Page Reload
**On page reload:**
1. `WorkspacePage` mounts → calls `useWorkspace` initialization
2. **Does NOT auto-load active session** (comment line 341–343)
3. User can:
   - Click SessionSwitcher to pick a session
   - Type in composer to create new session
4. **Session history loads if explicitly switched:** `switchSession()` calls `loadSessionHistory()`

**State persistence:**
- Rounds/responses/syntheses are loaded fresh from DB
- Build state persists (current_phase, build_spec, architect_md)
- **Gap:** If page reloads mid-build, UI state is lost (broadcastMsgIdx, stage, etc.) but DB state is preserved

### 8.5 Repo Picker Resetting Issue
**Known issue:** If repo connection changes during session, `activeRepoConnection` updates but session's `github_repo` field doesn't auto-sync.

**Current workaround:** Manual session update in pre_build or architect steps.

**No current code fix** — this is a known gap.

### 8.6 Triage Confidence Threshold
**Threshold:** `confidence >= 0.75` (line 145)

If confidence is lower, even if route is `simple_ask`, full broadcast proceeds. This prevents low-confidence recommendations from blocking user intent.

### 8.7 Premium Slot Cap
**Limit:** 3 premium agents max in `analyze` mode (line 6 in RevealComposer)

In `elevated` mode:
- Can select more than 3 premium agents
- Requires explicit checkbox confirmation (`elevatedCapAck`)
- Still enforced: prevents accidental cost overruns

**Error message (lines 89–121):** Shows warning banner if exceeded

### 8.8 Context Fill Meter
**Limit:** 128,000 tokens (line 48)

Calculates: `(estimated_tokens / 128k) * 100 = fillPct`

**Colors:**
- Green (`var(--ok)`) if < 55%
- Gold (`var(--warn)`) if 55–80%
- Red (`var(--risk)`) if > 80%

**No blocking:** Warning only, doesn't prevent broadcast.

### 8.9 Missing Error Boundaries
**Potential crash scenarios:**
- Concierge returns malformed JSON
- Agent skill upsert fails silently
- Session creation returns null
- BuildPlan missing builder_agents array

**Current handling:** Mostly defensive null-checks and error boundaries in UI, but no explicit React Error Boundary component visible in code.

---

## SUMMARY TABLE: COMPLETE USER FLOW

| Step | File | Component | Triggered by | What Happens | UI Changes |
|------|------|-----------|--------------|--------------|-----------|
| **Load app** | `WorkspacePage.tsx` | Page | User visits | Checks auth, loads workspace, agents, sessions | Empty stage with orb |
| **Type message** | `RevealComposer.tsx` | Textarea | User types | Updates `prompt` state | Composer expands, cost/token updates |
| **Broadcast** | `useOrchestration.ts` | `broadcast()` | User clicks Send or Ctrl+Enter | Triage check → round creation → agent calls → synthesis → concierge | Orb pulsing, "Consulting council" |
| **Triage fires** | `concierge-triage` | Edge function | First broadcast only | Returns simple_ask or proceeds | Concierge quick answer OR full council |
| **Concierge shows** | `ConciergePanel.tsx` | Modal overlay | After synthesis | Displays alignment, tension, recommendation | Centered panel with "→ Phase" button |
| **Go to Design** | `DesignPhase.tsx` | Full-screen modal | User clicks "→ Design" | Updates `current_phase: 'design'`, calls `/design` | Designer artifacts with previews |
| **Select design** | `DesignPhase.tsx` | `handleSelect()` | User clicks designer | Marks selected in DB, advances to pre_build | Closes design, opens pre-build drawer |
| **Pre-Build** | `PreBuildPanel.tsx` | Drawer | Concierge or design | Scan (intake) → Architect (scaffold) → Lock lanes | Lane assignments visible, lock button enabled |
| **Lock spec** | `PreBuildPanel.tsx` | `handleLockSpec()` | User clicks Lock | Inserts into build_lanes, sets `build_spec_locked: true` | Toast "Locked ✓" |
| **Go to Build** | `BuildWorkspace.tsx` | Full-screen overlay | User clicks button or `current_phase: 'build'` | Auto-calls concierge for build plan, enters `preparing` stage | Plan review UI appears |
| **Approve plan** | `BuildWorkspace.tsx` | `handleApprovePlan()` | User clicks "Approve & Build" | Broadcasts to builder agents | Agents writing code, responses come in |
| **Reviewing** | `BuildWorkspace.tsx` | Response cards | Build round completes | Shows agent responses, approve toggles | Each response has checkbox |
| **Execute** | `BuildWorkspace.tsx` | `handleExecute()` | User clicks "Execute Build" | Calls `/github-execute`, writes files to repo | Spinner, then completion card with stats |
| **Bouncer** | `BuildWorkspace.tsx` | `handleBouncer()` | User clicks "Go to Bouncer" | Calls `/bouncer`, returns security findings | Findings table with severity colors |
| **Conductor decision** | `BuildWorkspace.tsx` | `handleConductorDecision()` | User clicks pause/abort/approve | Updates phase, potentially returns to pre_build or completes | Toast "Build approved ✓" |
| **Report** | `BuildReport.tsx` | Card | `current_phase === 'complete'` | Fetches and displays build_reports from DB | Summary + lists of files/PRs/collisions |

---

## KEY ARCHITECTURAL PATTERNS

1. **Phase-driven state machine:** Session `current_phase` in DB drives all UI rendering
2. **Lazy session creation:** No active session on load — created on first broadcast
3. **Auto-synthesis:** After agents respond, synthesis + concierge fire automatically
4. **Tiered context:** T1 (latest synth) → T2 (recent rounds) → T3 (pinned) → T4 (file refs)
5. **Agent ID matching:** C2 commit fixed lane → agent resolution (agent_id first, then name fuzzy match)
6. **Modular phases:** Each phase is a separate component, renders conditionally based on `current_phase`
7. **Error resilience:** Triage/concierge/architect failures are non-fatal, fall back to manual modes
8. **Cost transparency:** All cost estimates local (never billed), shown in composer
9. **Audit trail:** All major actions logged to `audit_events` table

---

## FILES CRITICAL TO FLOW

| File | Responsibility |
|------|-----------------|
| `src/pages/WorkspacePage.tsx` | Entry point, session/render logic |
| `src/context/MaestroContext.tsx` | Global state container |
| `src/hooks/useWorkspace.ts` | Session lifecycle (create, load, switch, delete) |
| `src/hooks/useOrchestration.ts` | Broadcast, synthesis, concierge orchestration |
| `src/components/reveal/RevealComposer.tsx` | Text input, agent selection, broadcast trigger |
| `src/components/reveal/EmptyStage.tsx` | Idle orb animations |
| `src/components/reveal/ConciergePanel.tsx` | Concierge decision display & phase routing |
| `src/components/reveal/DesignPhase.tsx` | Design artifact generation & selection |
| `src/components/reveal/PreBuildPanel.tsx` | Intake, architect, lane locking |
| `src/components/reveal/BuildWorkspace.tsx` | Build stage machine (preparing → done) |
| `src/components/reveal/BuildReport.tsx` | Final build report & stats |

---

This audit reflects the **actual code** as of the latest commit. Every step, function, error handling, and UI element is traced back to specific files and line numbers.
