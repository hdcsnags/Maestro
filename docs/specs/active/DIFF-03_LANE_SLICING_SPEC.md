# DIFF-03 — Lane-Scoped Prompt Slicing Spec

**Status:** Ready for implementation
**Authored:** 2026-05-04 by Opus 4.7
**Implementing agent:** Sonnet 4.6 (Opus reviews architect prompt + cross-lane API contract before merge)
**Parent plan:** `IMPLEMENTATION_PLAN.md` task `DIFF-03`
**Source pain:** `smoketestaudit.md` items #1 (build prompts overstuffed), #2 (stale failure context bleeds into builds), #6 (loading/progress weak — partially addressed by current build state UI but root prompt-cost issue remains)
**Dependencies:** REL-01 (✅ done — phantom agent fix prevents test pollution).
**Unblocks:** DIFF-04 (provider fallback matrix needs clean per-lane prompts to switch models without re-injecting full project context).

---

## The Problem in One Diagram

```
TODAY: Each builder gets the same monolithic prompt
─────────────────────────────────────────────────────
Sonnet (lane: src/api/**)     ←  10-15k tokens
GPT-5.4 (lane: src/ui/**)     ←  Same 10-15k tokens
Opus (lane: src/db/**)        ←  Same 10-15k tokens
ClawClaude (lane: tests/**)   ←  Same 10-15k tokens

Each builder reads:
  - Full project summary
  - Global architecture
  - ALL lanes' file lists
  - ALL risk notes
  - ALL do-not-touch rules
  - Stale prior-round error text
  - Files outside its scope
  → spends ~70% of tokens before reaching its actual task

AFTER DIFF-03: Each builder gets shared + their lane only
─────────────────────────────────────────────────────────
Sonnet                ←  shared (~1k) + lane (~2-4k) = ~3-5k
GPT-5.4               ←  shared (~1k) + lane (~2-4k) = ~3-5k
Opus                  ←  shared (~1k) + lane (~2-4k) = ~3-5k
ClawClaude            ←  shared (~1k) + lane (~2-4k) = ~3-5k

50%+ token reduction. Cleaner reasoning. Better output quality.
Cost reduction is a bonus; the primary win is build quality.
```

---

## Why This Is Worth Doing Now

The build pipeline currently works "good enough" for small projects. As project complexity scales:
- Builders timeout on artifact-heavy prompts (per state doc active blocker for Sonnet).
- Build cost compounds: 4 builders × 15k tokens × 8 tasks ≈ 480k tokens per build.
- Builder output quality degrades because the model spends most tokens on irrelevant context.
- DIFF-04 fallbacks won't help if every reroute injects the full project context again — same token bloat, just on a different model.

This is the highest-leverage build-quality fix available. Per `smoketestaudit.md`: **"No builder should receive the full world unless it truly owns the full world."**

---

## Architecture — Where the Slicing Happens

Three edge functions touch build prompts. The slicing happens at the **architect** level (where the plan is born), and downstream functions consume the structured plan.

```
┌──────────────────────────────────────────────────────────────┐
│ architect (edge function)                                     │
│                                                                │
│ Generates ARCHITECT.md AND a structured `build_plan` JSON:    │
│   {                                                            │
│     shared_context: { ... },                                   │
│     lanes: [ { agent_id, lane_paths, slice, exports, ... } ]  │
│   }                                                            │
│                                                                │
│ Stored in sessions.architect_plan (jsonb, NEW column)         │
└──────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ concierge.decompose_tasks                                     │
│                                                                │
│ Reads sessions.architect_plan.                                │
│ Generates per-file build_tasks rows.                          │
│ Each task's prompt_slice contains ONLY:                       │
│   - shared_context (small, ~1k tokens)                        │
│   - this task's lane's slice                                  │
│   - cross-lane API contracts (imports/exports as needed)      │
└──────────────────────────────────────────────────────────────┘
                             │
                             ▼
┌──────────────────────────────────────────────────────────────┐
│ orchestrate.build_task mode                                   │
│                                                                │
│ Receives build_task with prompt_slice.                        │
│ Renders system prompt = shared + lane slice + minimal task    │
│   context. NO full ARCHITECT.md re-injection. NO scraping     │
│   of prior-round responses.                                   │
└──────────────────────────────────────────────────────────────┘
```

**Key principle:** the architect emits a structured plan ONCE. Downstream functions consume the slice; they do not re-derive the full project view per task.

---

## The `architect_plan` JSON Shape

Stored in `sessions.architect_plan` (new jsonb column). Source of truth for build prompts.

```ts
export interface ArchitectPlan {
  schema_version: 1;

  // Shared context — small, every builder sees this. Target: <1k tokens.
  shared_context: {
    project_summary: string;          // 2-3 sentences. What is being built and why.
    build_intent: string;             // 1 sentence. What this build's goal is.
    security_constraints: string[];   // global do-not's (e.g., "no eval", "no inline secrets")
    do_not_touch: string[];           // file paths or patterns no builder may modify
    manifest_rules: string;           // standard "return file_manifest format" instructions
  };

  // Per-lane slices — each builder sees only their own. Target: 2-4k tokens each.
  lanes: ArchitectLane[];
}

export interface ArchitectLane {
  agent_id: string;                   // assigned builder
  agent_name: string;                 // for human-readable error messages
  role: BuildLaneRole;                // builder | reviewer | read_only | security_audit

  // What this lane owns
  lane_paths: string[];               // globs or literal paths

  // The lane's slice — what the LLM sees in the per-task prompt
  slice: {
    // File tree — only the subtree this lane touches, not the whole repo
    file_subtree: FileTreeNode[];

    // Per-lane risk notes (what to watch out for IN THIS LANE only)
    risk_notes: string[];

    // Design notes specific to this lane (from design phase output)
    design_notes?: string;

    // Brief description of what this lane does in plain English
    description: string;
  };

  // Cross-lane API contracts — minimal references to OTHER lanes
  // Only what this lane consumes from others or exposes to others.
  exports: LaneApiExport[];           // what this lane EXPOSES to other lanes
  imports: LaneApiImport[];           // what this lane CONSUMES from other lanes
}

export interface FileTreeNode {
  path: string;                       // relative to repo root
  kind: 'file' | 'dir';
  description?: string;               // 1-line description for files (helps the LLM understand role)
}

export interface LaneApiExport {
  symbol: string;                     // e.g., "useAuth", "AuthContext", "verifyToken"
  kind: 'function' | 'type' | 'component' | 'constant' | 'hook';
  signature: string;                  // TypeScript signature (compact)
  source_file: string;                // where this symbol lives within the lane
  description: string;                // 1 sentence
}

export interface LaneApiImport {
  symbol: string;                     // what we're importing
  from_lane: string;                  // which lane provides it (lane.agent_name)
  reason: string;                     // 1 sentence — why this lane needs it
}
```

### Why this shape

- **`shared_context` is small and immutable across builders** — fits a single, cheap, cached prompt prefix.
- **`slice` is per-lane** — each builder only loads its own.
- **`exports/imports` is the minimum cross-lane info** — Lane B doesn't need Lane A's full code, just A's API surface area. This is how human teams actually work: you read your colleague's signature, not their implementation.

### Token math
- `shared_context`: ~500-1000 tokens
- `slice` (typical): ~1500-3000 tokens
- `exports + imports` per lane (cross-lane refs only): ~200-500 tokens
- **Total per builder:** ~2200-4500 tokens
- **vs current:** ~10000-15000 tokens
- **Reduction:** 60-75%

---

## File-Level Changes

### Migration: `supabase/migrations/{ts}_architect_plan.sql`

```sql
ALTER TABLE sessions ADD COLUMN architect_plan jsonb;

-- For backwards compat: old sessions without architect_plan still work.
-- Build dispatch checks for plan; if missing, falls back to legacy monolithic prompt
-- (with a warning logged to audit_events).

-- Optional: a debug-only log table for prompt inspection
CREATE TABLE IF NOT EXISTS build_prompt_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  build_task_id uuid REFERENCES build_tasks(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  rendered_prompt text NOT NULL,
  token_count int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_prompt_logs_task ON build_prompt_logs(build_task_id);
ALTER TABLE build_prompt_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY prompt_logs_owner ON build_prompt_logs
  FOR ALL USING (user_id = auth.uid());
-- This table is only written when MAESTRO_BUILD_PROMPT_DEBUG=1.
-- Auto-purge after 7 days via scheduled job (out of scope for v1).
```

### Modified: `supabase/functions/architect/index.ts`

The architect's job grows: now produces both ARCHITECT.md (existing — human-readable) AND `architect_plan` JSON (new — machine-consumed).

The architect prompt is updated to require structured output:

```
You are Maestro's architect. You are designing the build plan for:
{build_spec.project_summary}

INTENT: {build_spec.build_intent}

ACTIVE BUILDERS:
{for each builder in locked roster:}
  - {agent_name} ({model}): scoped to {lane_paths}

EXISTING REPO STRUCTURE:
{repo_tree}

INTAKE FINDINGS (if existing repo):
{intake.risk_files, intake.safe_zones, intake.architecture_notes}

DESIGN BRIEF (if design phase ran):
{design_artifacts}

YOUR JOB:
1. Write ARCHITECT.md as the human-readable design document.
2. Output a structured architect_plan JSON for the build dispatcher.

CRITICAL: each builder will receive ONLY the shared_context + their lane's
slice + cross-lane exports/imports. Builders will NOT see other lanes' file
contents or implementation. So:
  - Per-lane file_subtree must include EVERY file the lane will read or write.
  - exports must include EVERY public symbol another lane might depend on.
  - imports must include EVERY symbol this lane will need from another lane.
  - If a builder needs a file outside their lane to do their work, that file
    must appear in their slice OR be exposed via another lane's exports.

Output JSON:
{
  "schema_version": 1,
  "architect_md": "<full ARCHITECT.md content as markdown>",
  "build_plan": {
    "shared_context": {
      "project_summary": "...",
      "build_intent": "...",
      "security_constraints": ["..."],
      "do_not_touch": ["..."],
      "manifest_rules": "..."
    },
    "lanes": [
      {
        "agent_id": "...",
        "agent_name": "...",
        "role": "builder",
        "lane_paths": ["src/api/**"],
        "slice": {
          "file_subtree": [
            { "path": "src/api/auth.ts", "kind": "file", "description": "auth route handlers" },
            { "path": "src/api/users.ts", "kind": "file", "description": "user CRUD endpoints" }
          ],
          "risk_notes": ["JWT secrets must come from env, never hardcoded"],
          "design_notes": "...",
          "description": "Backend API routes for auth and user management"
        },
        "exports": [
          {
            "symbol": "verifyToken",
            "kind": "function",
            "signature": "(token: string) => Promise<UserClaims | null>",
            "source_file": "src/api/auth.ts",
            "description": "Validates a JWT and returns claims or null"
          }
        ],
        "imports": [
          {
            "symbol": "userSchema",
            "from_lane": "Lane: Database",
            "reason": "Need user table schema for query typing"
          }
        ]
      }
    ]
  }
}
```

The architect's existing ARCHITECT.md generation is preserved — it's the human-readable artifact and stays useful. The new `build_plan` is the machine-consumed artifact.

After architect generates the response:
1. Parse JSON output (with the existing 4-strategy fallback chain).
2. Validate the plan: every lane's exports referenced by other lanes' imports must exist.
3. Write `sessions.architect_md = <architect_md>` (existing field).
4. Write `sessions.architect_plan = <build_plan>` (new column).
5. Audit-log the plan dimensions (lane count, total exports, total imports).

### Modified: `supabase/functions/concierge/index.ts` (`decompose_tasks` phase)

The decompose phase reads `sessions.architect_plan` and produces `build_tasks` rows. Each task's `prompt_slice` is now the lane's slice + cross-lane API contracts (NOT a copy of the full plan).

```ts
// In decompose_tasks:
const plan = session.architect_plan as ArchitectPlan;
if (!plan) {
  // Fallback: legacy path. Use monolithic ARCHITECT.md.
  // Log a warning so we know slicing isn't running.
  await audit('build_plan_missing_falling_back_to_monolithic');
  return decomposeTasksLegacy(session);
}

const sharedContext = plan.shared_context;

for (const lane of plan.lanes) {
  if (lane.role !== 'builder') continue;  // only builders get tasks

  // For each file in this lane's lane_paths, create a build_task
  for (const filePath of expandLanePaths(lane.lane_paths, repo)) {
    // Compose this task's prompt_slice
    const promptSlice: BuildTaskPromptSlice = {
      shared_context: sharedContext,
      lane_slice: lane.slice,
      lane_imports: lane.imports,
      // Pull in exports from OTHER lanes that this lane imports from
      cross_lane_exports: getCrossLaneExports(plan, lane),
      target_file: filePath,
      task_instruction: buildTaskInstruction(filePath, lane),
    };

    await db.insert('build_tasks', {
      session_id: session.id,
      file_path: filePath,
      lane_owner: lane.agent_id,
      status: 'queued',
      prompt_slice: JSON.stringify(promptSlice),
      // ... other existing fields
    });
  }
}
```

```ts
function getCrossLaneExports(plan: ArchitectPlan, lane: ArchitectLane): LaneApiExport[] {
  const importedSymbols = new Set(lane.imports.map(i => i.symbol));
  const exports: LaneApiExport[] = [];

  for (const otherLane of plan.lanes) {
    if (otherLane.agent_id === lane.agent_id) continue;
    for (const exp of otherLane.exports) {
      if (importedSymbols.has(exp.symbol)) {
        exports.push(exp);
      }
    }
  }
  return exports;
}
```

### Modified: `supabase/functions/orchestrate/index.ts` (`build_task` mode)

The current `build_task` mode is described as "lighter single-file prompt, 8192 max output tokens, no ARCHITECT.md injection." Update to consume the structured `prompt_slice` instead of recreating context.

```ts
// In build_task mode:
const slice = JSON.parse(task.prompt_slice) as BuildTaskPromptSlice;

const systemPrompt = renderBuilderSystemPrompt(slice);
// renderBuilderSystemPrompt is the NEW templating function
// (see prompt template below)

// Optional: log the rendered prompt for inspection
if (Deno.env.get('MAESTRO_BUILD_PROMPT_DEBUG') === '1') {
  await db.insert('build_prompt_logs', {
    build_task_id: task.id,
    user_id: task.user_id,
    rendered_prompt: systemPrompt,
    token_count: estimateTokens(systemPrompt),
  });
}

// Continue with existing model call...
```

### New: `supabase/functions/_shared/builder-prompt.ts`

The lane-aware prompt template lives here so both `concierge` and `orchestrate` can produce identical prompts (avoiding drift):

```ts
import type { BuildTaskPromptSlice } from "./types.ts";

export function renderBuilderSystemPrompt(slice: BuildTaskPromptSlice): string {
  const { shared_context, lane_slice, cross_lane_exports, lane_imports, target_file, task_instruction } = slice;

  return `You are a builder agent in a multi-agent build pipeline.

PROJECT:
${shared_context.project_summary}

BUILD INTENT:
${shared_context.build_intent}

GLOBAL CONSTRAINTS (apply to every builder):
${shared_context.security_constraints.map(c => `- ${c}`).join('\n')}

DO NOT MODIFY:
${shared_context.do_not_touch.map(p => `- ${p}`).join('\n')}

YOUR LANE:
${lane_slice.description}

FILES IN YOUR LANE:
${lane_slice.file_subtree.map(n => `  ${n.path}${n.description ? ' — ' + n.description : ''}`).join('\n')}

LANE-SPECIFIC RISKS:
${lane_slice.risk_notes.map(r => `- ${r}`).join('\n')}

${lane_slice.design_notes ? `DESIGN NOTES:\n${lane_slice.design_notes}\n\n` : ''}${cross_lane_exports.length > 0 ? `
CROSS-LANE API YOU CAN USE (provided by other lanes):
${cross_lane_exports.map(e => `- ${e.symbol} (${e.kind}, from ${e.source_file}): ${e.signature}\n  ${e.description}`).join('\n')}
` : ''}

YOUR CURRENT TASK:
File to write: ${target_file}
${task_instruction}

OUTPUT FORMAT:
${shared_context.manifest_rules}

CRITICAL:
- Modify ONLY files inside your lane's file_subtree.
- Use ONLY the cross-lane API listed above to call other lanes' code. Do not assume other lanes have symbols not listed here.
- Do not include unchanged hunks "for safety" — only the actual changes.
`;
}
```

### Modified: types in `src/types/index.ts`

```ts
export interface BuildTaskPromptSlice {
  shared_context: ArchitectPlan['shared_context'];
  lane_slice: ArchitectLane['slice'];
  lane_imports: LaneApiImport[];
  cross_lane_exports: LaneApiExport[];
  target_file: string;
  task_instruction: string;
}

// Plus all the types from the "architect_plan JSON Shape" section above:
// ArchitectPlan, ArchitectLane, FileTreeNode, LaneApiExport, LaneApiImport
```

### Modified: `src/components/reveal/PlanCards/ArchitectCard.tsx`

The plan card now displays the lane structure (not just ARCHITECT.md). Show:
- Shared context summary (collapsible)
- Per-lane breakdown with file count, exports/imports counts
- Visual cross-lane dependency graph (optional in v1; can be a list of "Lane A imports X from Lane B" lines)

This gives the user pre-build visibility into the slicing — they can see which lanes depend on which before locking the spec.

### Stripping Stale Failure Context

Per `smoketestaudit.md` #2: build prompts can carry stale "Could not reach Claude Sonnet" type messages from prior round responses.

Per state doc, build-mode broadcasts already "skip prior-round baggage" since 2026-04-13. **Verify this is still true.** Specifically:
- `useBuildExecution.ts` dispatch path must not pass prior round context unless explicitly required.
- The `tieredContext` system in `useOrchestration.ts` is for ASK mode, NOT build mode. Confirm build skips it.
- `buildTieredContext` should never be called from a `build_task` dispatch.

If stale context bleeding is found during DIFF-03 implementation, fix it in the same PR. Add a test: run a build, confirm the prompt sent to the LLM contains zero prior-round response text or error text.

---

## Backwards Compatibility

Old sessions in flight may not have `architect_plan`. Handle gracefully:

1. `concierge.decompose_tasks` checks for `sessions.architect_plan`. If null:
   - Log audit event `build_plan_missing_legacy_fallback`.
   - Use existing monolithic ARCHITECT.md path (with the prior 4-strategy parser).
   - Set a flag on `sessions.metadata.legacy_build_plan = true` so dispatcher knows.

2. `orchestrate.build_task` checks `task.prompt_slice` shape:
   - If new structured shape — use new prompt template.
   - If legacy text — use existing monolithic prompt rendering.

3. Migration script (one-time, optional): for sessions in `pre_build` phase that haven't locked their spec yet, mark them as needing re-architect. Surface in UI: "This session was created before lane slicing — please re-run Architect step." Less invasive than auto-migrating.

---

## Debug Logging — `MAESTRO_BUILD_PROMPT_DEBUG`

When env var is `1`:
- Every builder system prompt rendered is written to `build_prompt_logs` with the task_id and a token-count estimate.
- Auditable from the user's TrustDrawer (future "Build Inspector" tab).
- Critical for tuning — without this, no way to verify slicing is actually working.

In `orchestrate.build_task` mode, after rendering:
```ts
if (Deno.env.get('MAESTRO_BUILD_PROMPT_DEBUG') === '1') {
  await supabase.from('build_prompt_logs').insert({
    build_task_id: task.id,
    user_id: task.user_id,
    rendered_prompt: systemPrompt,
    token_count: estimateTokens(systemPrompt),
  });
}
```

The flag is project-wide for now (set in Supabase project secrets). Per-user toggle in TrustDrawer is a v1.1 enhancement.

---

## Acceptance Criteria

1. **Architect emits structured plan.** Run pre-build → architect step. Confirm `sessions.architect_plan` jsonb populated with valid `ArchitectPlan` shape. Lanes match the locked builder roster.
2. **Plan validation works.** Force the architect to emit a plan with a lane importing a symbol no other lane exports. Architect should retry once, then fail with a clear error before persisting.
3. **Per-task prompt is sliced.** Run a 4-builder build. Inspect `build_prompt_logs` (with debug flag on) for one task. Confirm the rendered prompt contains:
   - Shared context (small, ~500-1000 tokens)
   - Only this lane's file subtree (NOT other lanes' files)
   - Cross-lane exports for symbols this lane imports (NOT all exports from all lanes)
   - The target file name and task instruction
4. **Token reduction measured.** Compare token counts: legacy prompt (manually constructed for the same project) vs new prompt for the same task. Target: 50%+ reduction.
5. **Cross-lane API works.** Build a project where Lane A defines `verifyToken` and Lane B uses it. Lane B's prompt includes `verifyToken`'s signature in cross_lane_exports. Lane B's output references it correctly.
6. **Backwards compat: legacy path.** Force a session with no `architect_plan` (manually null the column). Run a build. Confirm legacy monolithic path used; audit event logged.
7. **No stale failure context.** Run a build after a prior round had agent failures (simulate by inserting failure responses). Inspect a builder prompt — must contain zero text from prior failures.
8. **No `buildTieredContext` in build mode.** Grep `useBuildExecution.ts` and confirm `buildTieredContext` is never called in the build_task dispatch path.
9. **ArchitectCard displays plan.** Pre-build UI shows lanes, file counts, and cross-lane import/export indicators before spec lock.
10. **Debug log writes.** With `MAESTRO_BUILD_PROMPT_DEBUG=1`, `build_prompt_logs` rows written one-per-task. With flag unset, no rows written.

---

## Verification (Live Tests)

1. **Setup:** clean repo, simple 3-lane project (api / ui / db). Lock the spec.
2. **Architect runs:** observe `sessions.architect_plan` populated. Open in DB GUI to inspect structure.
3. **Token count comparison:**
   - Run with debug flag ON.
   - Pick one task from each lane. Read `build_prompt_logs.rendered_prompt`.
   - For comparison: also run the legacy monolithic build for the same project (e.g., backup branch + revert PR for DIFF-03). Compare token counts.
   - Target: ≥50% reduction.
4. **Cross-lane reference test:** verify that ui lane's prompt has the api lane's exported types/functions, but NOT api lane's implementation.
5. **Stale context test:** force a prior round with simulated agent failure ("Sonnet 504 timeout" message in responses). Then start a build. Inspect prompt — must NOT contain "Sonnet 504" text.
6. **Build quality regression check:** run the same project with old (monolithic) and new (sliced) paths. Compare:
   - Build success rate (% tasks completing cleanly)
   - Average token usage per task
   - User-perceived output quality (subjective — does the produced code work?)
   - Target: equal or better quality at 50%+ less cost.

---

## Decisions Made

### Q: Why store the plan as JSON in `sessions.architect_plan` instead of a separate table?
**A:** The plan is one-per-session, not one-per-row of anything. JSON column is the natural fit. Separate table would add joins for a one-to-one relationship. Modeling exports/imports as separate rows would be cleaner relationally but harder to atomic-update.

### Q: Why preserve ARCHITECT.md alongside the JSON plan?
**A:** ARCHITECT.md is the human-readable artifact. The structured JSON is the machine artifact. Removing the markdown would lose the human review surface (concierge surface architect output as markdown for the user to skim). Keep both.

### Q: Why per-lane file_subtree instead of a global file tree filtered per-builder?
**A:** Two reasons:
- Filtering at prompt-build time is wasted work (we re-filter on every task).
- The architect understands lane responsibilities and can curate the subtree (e.g., include a config file the lane reads but doesn't write — a literal "filter on lane_paths" would miss this).

### Q: What if the architect's JSON output is malformed?
**A:** Use the existing 4-strategy JSON extraction (already shipped per state doc). If still unparseable, retry the architect call once with stricter prompt. If still fails, surface error to user — do NOT silently fall back to legacy path. The architect IS the slicing; if it fails, slicing isn't happening.

### Q: Why a flat `cross_lane_exports` array instead of nested-per-from-lane?
**A:** Simpler at prompt-render time. The "from which lane" info is in `LaneApiExport.source_file` already. Flat array iterates cleanly into prompt text.

### Q: Token estimation — exact or approximate?
**A:** Approximate via heuristic (chars ÷ 4) for `build_prompt_logs.token_count`. Exact tokenization (per-model) is expensive and not required for relative measurement of "is slicing working." Document the heuristic so future analysis isn't misled.

### Q: Should lanes be allowed to overlap (e.g., two lanes both write to `src/types/index.ts`)?
**A:** No. The architect must produce non-overlapping `lane_paths`. Overlap is a build-spec error and should be caught at architect-validation step, not at build-dispatch time.

### Q: What about files that EVERY lane reads (e.g., `package.json`, `tsconfig.json`)?
**A:** Add them to `shared_context` as a `read_only_files` array (small set of always-visible files). Not a separate lane — these are part of the shared prefix.

Actually, refine: include their **paths** in shared_context. The actual contents are too large to share unless small. Let the architect curate which read-only-files to include based on size.

```ts
shared_context.read_only_files: { path: string; content?: string }[]
```

If `content` is provided, include it. If just path, builder knows the file exists but reads it from cross-lane exports if needed.

### Q: Lane-specific design notes — where do they come from?
**A:** The design phase output (when present). The architect translates design artifacts into per-lane prose. If no design phase ran, `design_notes` is omitted.

### Q: How does this interact with build_task `prompt_slice` already being a column?
**A:** The column already exists per BUILD_V2_SPEC. It's currently a string blob. Change semantics: now it's a JSON-stringified `BuildTaskPromptSlice`. No migration needed beyond the new ArchitectPlan column. Backwards compat: orchestrate detects shape on read.

### Q: Cost of this change?
**A:** Architect step's LLM call gets a slightly bigger response (now includes structured JSON, not just markdown). ~10-20% architect cost increase. Per-builder cost drops 50-75%. Net: significantly cheaper builds, more expensive architect. Worth it.

---

## Open Questions

1. **What if a lane needs MORE cross-lane info than the architect predicted?** E.g., builder discovers it needs to call `useAuth` (which lane A exports) but `useAuth` wasn't in the imports list. v1 answer: builder fails the task with `out_of_scope_call`; concierge picks up and re-routes or asks user to re-architect. v2: smarter on-demand fetch of additional exports.
2. **Should imports/exports be auto-discovered from existing code (intake)?** For existing-repo builds, intake could surface "these symbols are commonly used across files" and seed exports. v1: architect generates from scratch using LLM judgment. v2: intake assists.
3. **Per-builder prompt caching?** Anthropic and OpenAI both support prompt caching now. The shared_context prefix is identical across all of a lane's tasks — perfect cache target. Defer cache integration to a follow-up; the slicing alone is the win.
4. **What if the project has only ONE lane?** Single-builder project. Slicing still works (one lane, no cross-lane exports needed). No special-case logic required.
5. **Test files: own lane or part of source lane?** Recommendation: `tests/**` is its own lane assigned to a reviewer-role builder, with imports of the source lanes' exports. Keeps the slicing clean.

---

## Implementation Order

1. **Migration + types.** `architect_plan` jsonb column on sessions. `build_prompt_logs` table. TypeScript type additions in `src/types/index.ts`. Ship alone.
2. **Builder prompt template module.** `_shared/builder-prompt.ts`. Renders the prompt from a slice. Unit-test with fixture slices.
3. **Architect prompt update.** Update the architect's system prompt to emit structured JSON. Test against a known fixture project. Validate the output JSON schema.
4. **Architect validation.** Validate that lane imports reference real exports. Single retry on failure. Then surface error.
5. **Concierge `decompose_tasks` integration.** Read `architect_plan`, slice per task. Backwards-compat fallback to legacy path. Test with both new and legacy sessions.
6. **`orchestrate.build_task` mode update.** Consume structured `prompt_slice`. Render via builder-prompt template. Optional debug log writes.
7. **Stale failure context audit.** Grep `useBuildExecution.ts` for `buildTieredContext` calls in build path. Add a test that confirms zero stale context in build prompts.
8. **ArchitectCard UI update.** Render plan structure in pre-build flow.
9. **Live verification per acceptance criteria.** Token count comparison, cross-lane test, regression check.
10. **Update DEPLOY_RUNBOOK.md** with DIFF-03 deploy steps and `MAESTRO_BUILD_PROMPT_DEBUG` flag instructions.

Suggested split:
- **Sonnet:** 1, 2, 5, 6, 7, 9 (data, prompt template, edge integration, tests, verification)
- **Opus must review step 3** — the architect prompt is where slicing's quality begins. Wrong prompt = wrong slices. Validate against real-model output before merge.
- **Opus must review step 4** — validation logic for cross-lane imports/exports references.
- **Sonnet or Gemini:** 8 (UI), 10 (runbook)

---

## What This Spec Does NOT Cover

- **Prompt caching with provider APIs.** The shared_context is cache-friendly but cache integration is its own work.
- **Auto-detect imports/exports from intake.** v1 has architect generate from scratch.
- **Smart on-demand fetch of additional cross-lane info during build.** v1 fails the task if a builder needs unforecast info.
- **Lane-level token budgets.** v1 trusts the architect's curation; v2 could enforce "no lane slice exceeds 4k tokens" as a hard limit.
- **Per-user `MAESTRO_BUILD_PROMPT_DEBUG` toggle.** v1 is project-wide flag; v1.1 adds UI toggle.
- **Build prompt versioning.** If the prompt template changes, old build_prompt_logs rows have outdated context. Acceptable in v1 since logs are 7-day retention.

---

## Hand-off Notes

This is a moderately complex spec because it touches three edge functions and changes a fundamental contract (the build prompt). The TWO things that need Opus eyes:

1. **The architect prompt (step 3)** — defines how lanes are decomposed. Wrong here = bad slicing for every build. Validate against real-model output with a fixture project before merge.
2. **The cross-lane validation (step 4)** — getting "lane A imports X from lane B but lane B doesn't export X" wrong means the build dispatcher generates broken prompts.

Everything else is implementation. Sonnet can move fast on steps 1, 2, 5, 6, 7, 9. The plan card UI (step 8) can run in parallel.

If implementing solo on Sonnet, **stop after step 2 (template) and request Opus to validate it produces clean prompts for fixture slices BEFORE step 3 (architect prompt)**. The template defines the contract the architect must produce.

---

*End of DIFF-03 spec.*
