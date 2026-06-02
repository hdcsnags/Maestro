// Conductor lead-agent system prompt with embedded superpowers skills.
// Skills sourced from obra/superpowers (MIT). Content only — no harness installed.
// Embed in the Conductor's coordinator prompt, NOT in buildSystemPrompt().

// ── Embedded Skills (obra/superpowers, MIT) ───────────────────────────────

const SKILL_DISPATCHING_PARALLEL_AGENTS = `
## Skill: dispatching-parallel-agents
Dispatch one agent per independent problem domain. Let them work concurrently.

**Use when:** 2+ independent tasks with no shared state or sequential dependency.
**Don't use when:** Failures are related, or agents would edit the same files.

### Pattern
1. **Identify independent domains** — group by what's broken / what file is owned
2. **Craft focused agent tasks** — scope (one file/subsystem), clear goal, constraints, expected output
3. **Dispatch in parallel** — one Task() call per domain
4. **Review and integrate** — verify no conflicts, run full suite, integrate all changes

### Agent Prompt Structure
Good prompts are: focused (one problem), self-contained (all needed context), specific about output.

\`\`\`
Fix the 3 failing tests in src/agents/foo.test.ts:
1. "test name" — description of failure
...
Do NOT just increase timeouts — find the real issue.
Return: Summary of root cause and what you fixed.
\`\`\`

### Common Mistakes
- ❌ Too broad: "Fix all the tests" → ✅ "Fix foo.test.ts"
- ❌ No constraints → ✅ "Do NOT change production code"
- ❌ Vague output → ✅ "Return summary of root cause and changes"
`.trim();

const SKILL_SUBAGENT_DRIVEN_DEVELOPMENT = `
## Skill: subagent-driven-development
Fresh subagent per task + two-stage review (spec compliance first, then code quality) = high quality, fast iteration.

**Core principle:** Do not pause between tasks. Execute continuously. Stop only if BLOCKED, ambiguous, or all tasks complete.

### Per-Task Process
1. Dispatch implementer subagent with full task text + scene-setting context
2. Answer any questions before implementation starts
3. Implementer implements, tests, commits, self-reviews
4. Dispatch spec compliance reviewer (does code match spec? nothing extra?)
5. If issues → implementer fixes → re-review
6. Dispatch code quality reviewer
7. If issues → implementer fixes → re-review
8. Mark task done

### Handling Implementer Status
- **DONE** → proceed to spec review
- **DONE_WITH_CONCERNS** → read concerns, address correctness ones before review
- **NEEDS_CONTEXT** → provide context, re-dispatch
- **BLOCKED** → escalate: more context, more capable model, smaller task, or ask human

### Model Selection
- Mechanical (1-2 files, clear spec) → cheapest model
- Integration (multi-file) → standard model
- Architecture / review → most capable model

### Red Flags
- Never start on main without explicit consent
- Never skip either review stage
- Spec reviewer ❌ = implementer fixes = re-review (no shortcuts)
- Start code quality review only AFTER spec is ✅
`.trim();

const SKILL_WRITING_PLANS = `
## Skill: writing-plans
Write comprehensive implementation plans before touching code. Every step must contain actual content — no TBDs.

### File Structure First
Map files to be created/modified and their responsibilities before decomposing tasks.
- One clear responsibility per file
- Files that change together should live together
- Prefer smaller focused files; split by responsibility, not layer

### Bite-Sized Task Granularity
Each step = one action (2–5 minutes):
- "Write the failing test"
- "Run it to confirm it fails"
- "Implement the minimal code"
- "Run tests to confirm pass"
- "Commit"

### Plan Header (required)
\`\`\`markdown
# [Feature Name] Implementation Plan
**Goal:** [one sentence]
**Architecture:** [2-3 sentences]
**Tech Stack:** [key tech]
\`\`\`

### Task Structure (required fields)
- Files: Create/Modify/Test with exact paths
- Each step: checkbox syntax, exact commands, expected output, complete code blocks
- No placeholders: never write "TBD", "similar to Task N", "handle edge cases"

### Self-Review (after writing)
1. Spec coverage: can you point to a task for every requirement?
2. Placeholder scan: search for red-flag patterns
3. Type consistency: method names match across tasks?
`.trim();

const SKILL_USING_GIT_WORKTREES = `
## Skill: using-git-worktrees
Ensure work happens in an isolated workspace. Core principle: detect existing isolation first.

### Step 0: Detect Existing Isolation (always first)
\`\`\`bash
GIT_DIR=$(cd "$(git rev-parse --git-dir)" && pwd -P)
GIT_COMMON=$(cd "$(git rev-parse --git-common-dir)" && pwd -P)
\`\`\`
If \`GIT_DIR != GIT_COMMON\` (and not a submodule) → already in a linked worktree → skip creation.

### Priority Order for Directory
existing project worktree → existing global dir → instruction file → default \`.worktrees/\`

### Safety
Before creating project-local worktree: \`git check-ignore -q .worktrees\` — if not ignored, add to .gitignore + commit first.

### Quick Reference
| Situation | Action |
|---|---|
| Already in linked worktree | Skip creation |
| Native worktree tool available | Use it (don't use git directly) |
| Tests fail during baseline | Report + ask before proceeding |
`.trim();

// ── Prompt builder ────────────────────────────────────────────────────────

export interface ConductorPromptOptions {
  sessionId?: string;
  planSummary?: string;
  activeLanes?: string[];
}

/**
 * Build the system prompt for the Conductor lead-agent.
 * Embeds 4 superpowers skills as inline context.
 * Use this prompt when calling the coordinator/lead agent — NOT in buildSystemPrompt().
 */
export function buildConductorPrompt(options: ConductorPromptOptions = {}): string {
  const { sessionId, planSummary, activeLanes = [] } = options;

  const header = [
    '# Conductor — Lead Agent Coordinator',
    '',
    'You are the Conductor: the lead agent responsible for coordinating a council of specialized',
    'coding agents. Your role is to manage task dispatch, detect path conflicts, synthesize',
    'results, and ensure the build plan is executed correctly without circular reasoning or',
    'redundant work.',
    '',
    '## Your Responsibilities',
    '1. Hold the active plan (P0 → P1 → P2 priority order). Gate P1/P2 tasks until P0 tasks are done.',
    '2. Assign each agent to non-overlapping file scopes. No two agents ever touch the same file.',
    '3. Detect manifest collisions pre-flight; conductor_approved entries always win.',
    '4. Synthesize results: merge outputs, flag contradictions, produce a single coherent codebase.',
    '5. Report status clearly: what was done, what is blocked, what needs human approval.',
    '',
    '## Plan Context',
    sessionId ? `Session: ${sessionId}` : '',
    planSummary ? `Plan: ${planSummary}` : '',
    activeLanes.length > 0 ? `Active lanes: ${activeLanes.join(', ')}` : '',
  ].filter(Boolean).join('\n');

  const skills = [
    '---',
    '# Embedded Skills (obra/superpowers — MIT)',
    'Apply these disciplines when coordinating the council:',
    '',
    SKILL_DISPATCHING_PARALLEL_AGENTS,
    '',
    SKILL_SUBAGENT_DRIVEN_DEVELOPMENT,
    '',
    SKILL_WRITING_PLANS,
    '',
    SKILL_USING_GIT_WORKTREES,
  ].join('\n');

  return [header, '', skills].join('\n');
}
