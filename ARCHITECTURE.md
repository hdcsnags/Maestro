# Maestro Architecture Guide

This document is your "come back in a year" reference. It describes every feature, where the code lives, which files to touch for any given change, and how all the pieces connect.

---

## Table of Contents

1. [High-Level Architecture](#high-level-architecture)
2. [Application Bootstrap](#application-bootstrap)
3. [State Management](#state-management)
4. [Feature Map](#feature-map)
5. [Edge Functions](#edge-functions)
6. [Database Schema](#database-schema)
7. [UI Component Map](#ui-component-map)
8. [How-To: Common Changes](#how-to-common-changes)
9. [Design System and Theming](#design-system-and-theming)
10. [Data Flow Diagrams](#data-flow-diagrams)
11. [Environment Variables](#environment-variables)
12. [Known Limitations and Future Work](#known-limitations-and-future-work)

---

## High-Level Architecture

```
Browser (React SPA)
  |
  |-- Supabase Auth (email/password)
  |-- Supabase Postgres (13 tables, RLS on all)
  |-- Supabase Edge Functions (6 Deno functions)
  |     |-- orchestrate    -> Anthropic / OpenAI / Gemini / OpenRouter APIs
  |     |-- synthesize     -> Anthropic API (Claude Haiku)
  |     |-- vault          -> Supabase DB (encrypted_secrets, provider_connections)
  |     |-- github-auth    -> GitHub OAuth API
  |     |-- github-repos   -> GitHub REST API
  |     |-- github-execute -> GitHub REST API (branches, commits, PRs)
  |
  v
GitHub (branches, files, pull requests)
```

The frontend is a single-page React app. There is no server-rendered layer. All backend logic runs through Supabase Edge Functions (Deno). The database is Supabase Postgres with Row Level Security on every table.

---

## Application Bootstrap

**Entry:** `src/main.tsx` renders `<App />`

**Boot sequence in `src/App.tsx`:**

```
AuthProvider (context/AuthContext.tsx)
  -> checks Supabase session
  -> if not logged in: renders AuthPage
  -> if logged in:
       MaestroProvider (context/MaestroContext.tsx)
         -> WorkspacePage (pages/WorkspacePage.tsx)
              -> useWorkspace() hook initializes:
                   1. ensureWorkspace()    -- find or create workspace
                   2. ensureAgents()       -- find or create default agent roster
                   3. loadSessions()       -- fetch all sessions
                   4. loadProviderConnections() -- fetch API key status
                   5. loadAgentSkills()    -- fetch skills for all agents
                   6. loadRepoConnections()-- fetch GitHub repo connections
                   7. ensureSession()      -- find or create active session
                   8. loadSessionHistory() -- fetch rounds, responses, syntheses, audit events
```

Files involved: `App.tsx`, `context/AuthContext.tsx`, `context/MaestroContext.tsx`, `hooks/useWorkspace.ts`, `pages/WorkspacePage.tsx`

---

## State Management

All application state lives in a single `useReducer` in `src/context/MaestroContext.tsx`.

### State Shape

| Field | Type | Purpose |
|-------|------|---------|
| `workspace` | `Workspace \| null` | Current workspace |
| `agents` | `Agent[]` | Agent roster for this workspace |
| `agentSkills` | `AgentSkill[]` | All skills across all agents |
| `activeSession` | `Session \| null` | Current orchestration session |
| `sessions` | `Session[]` | All sessions in the workspace |
| `rounds` | `Round[]` | Rounds in the active session |
| `responses` | `Response[]` | Agent responses for all loaded rounds |
| `syntheses` | `Synthesis[]` | Synthesis outputs per round |
| `auditEvents` | `AuditEvent[]` | Immutable audit trail |
| `providerConnections` | `ProviderConnection[]` | AI provider key status |
| `repoConnections` | `RepoConnection[]` | GitHub repo connections |
| `activeRepoConnection` | `RepoConnection \| null` | Currently selected repo |
| `executionRuns` | `ExecutionRun[]` | GitHub execution history |
| `executionMode` | `'analyze' \| 'pr_flow' \| 'elevated'` | Current safety level |
| `executionStrategy` | `'per_agent' \| 'synthesized'` | Branch strategy for GitHub execution |
| `broadcastingAgents` | `string[]` | Agent IDs currently generating responses |
| `isBroadcasting` | `boolean` | Whether a broadcast is in progress |
| `viewMode` | `'stacked' \| 'carousel'` | Response display mode |
| `activeDrawer` | `DrawerTarget` | Which drawer is open (orchestra/trust/synthesis/vault/null) |
| `shortcutOverlayOpen` | `boolean` | Whether shortcut legend is visible |
| `folioIndex` | `number` | Current position in the response carousel |
| `patchModalOpen` | `boolean` | Whether patch modal is visible |
| `executionModalOpen` | `boolean` | Whether execution modal is visible |

### Key Actions

| Action | What it does |
|--------|-------------|
| `SET_AGENTS` | Replace entire agent roster |
| `UPDATE_AGENT` | Update a single agent by ID (used for scoped_paths changes) |
| `ADD_AGENT_SKILL` / `REMOVE_AGENT_SKILL` / `UPDATE_AGENT_SKILL` | CRUD for agent skills |
| `ADD_RESPONSE` | Append a new agent response (after broadcast) |
| `UPDATE_RESPONSE` | Update flag/lead status on a response |
| `ADD_SYNTHESIS` | Append a synthesis result |
| `SET_EXECUTION_STRATEGY` | Toggle between per_agent and synthesized |
| `SET_EXECUTION_MODAL` | Open/close the execution modal |
| `UPSERT_REPO_CONNECTION` | Add or update a GitHub repo connection |
| `ADD_EXECUTION_RUN` / `UPDATE_EXECUTION_RUN` | Track GitHub execution lifecycle |
| `OPEN_DRAWER` | Open a specific drawer (toggles if already open) |
| `CLOSE_TRANSIENT` | Close all drawers and overlays |

### Adding new state

1. Add the field to `MaestroState` interface in `context/MaestroContext.tsx`
2. Add the initial value in the `initial` object
3. Add the action type(s) to the `Action` union
4. Add the reducer case(s) in the `reducer` function
5. Add the TypeScript interface in `types/index.ts` if it's a new entity

---

## Feature Map

### Feature: Broadcasting (multi-agent prompt)

The core interaction loop. User writes a prompt, selects which agents to target, and broadcasts.

| What | Where |
|------|-------|
| Prompt input and agent selector | `components/reveal/RevealComposer.tsx` |
| Broadcast orchestration logic | `hooks/useOrchestration.ts` -> `broadcast()` |
| Individual agent API call | `hooks/useOrchestration.ts` -> `callAgent()` |
| Edge function that calls AI providers | `supabase/functions/orchestrate/index.ts` |
| Response display (carousel card) | `components/reveal/FolioCard.tsx` |
| Streaming placeholder | `components/reveal/StreamingFolio.tsx` |
| Carousel container | `components/reveal/FolioCarousel.tsx` |
| Carousel navigation dots | `components/reveal/OrbitDots.tsx` |
| Round context banner | `components/reveal/HeroContext.tsx` |
| Empty state | `components/reveal/EmptyStage.tsx` |

**Flow:** RevealComposer -> useOrchestration.broadcast() -> creates Round in DB -> calls callAgent() for each selected agent in parallel -> callAgent() calls `orchestrate` edge function -> edge function calls AI provider API -> response saved to DB -> dispatched to state -> FolioCard renders it

### Feature: Synthesis and Verification

After broadcasting, the user can synthesize agent responses into a unified output, then verify for contradictions.

| What | Where |
|------|-------|
| Synthesis drawer UI | `components/reveal/SynthesisDrawer.tsx` |
| Synthesize function | `hooks/useOrchestration.ts` -> `synthesize()` |
| Synthesis edge function | `supabase/functions/synthesize/index.ts` |
| Contradiction detection | `components/reveal/SynthesisDrawer.tsx` -> `detectContradictions()` |
| Execution mode selector | `components/reveal/SynthesisDrawer.tsx` -> `handleModeChange()` |
| Patch generation | `components/reveal/PatchModal.tsx` |
| Execution trigger | `components/reveal/SynthesisDrawer.tsx` -> "Prepare execution" button |

**Flow:** User opens Synthesis drawer (S) -> clicks "Synthesize" -> useOrchestration.synthesize() -> calls `synthesize` edge function -> Claude Haiku merges agent outputs -> synthesis saved to DB -> user clicks "Verify" -> detectContradictions() scans for keyword conflicts -> if passed, "Generate patch" and "Prepare execution" buttons enable

### Feature: Agent Skills

Reusable instruction fragments attached to agents that get injected into their system prompts during orchestration.

| What | Where |
|------|-------|
| Skills UI (add, remove, toggle) | `components/reveal/OrchestraDrawer.tsx` |
| Skills type definition | `types/index.ts` -> `AgentSkill` |
| Skills state management | `context/MaestroContext.tsx` -> `agentSkills` state + actions |
| Skills loading on init | `hooks/useWorkspace.ts` -> `loadAgentSkills()` |
| Skills injection into AI prompt | `supabase/functions/orchestrate/index.ts` -> `buildSystemPrompt()` |
| Skills passed to edge function | `hooks/useOrchestration.ts` -> `callAgent()` body |
| Database table | `agent_skills` (migration: `add_skills_artifacts_scoped_paths.sql`) |

**Flow:** User opens Orchestra drawer (O) -> expands an agent -> adds a skill with name + instruction -> saved to `agent_skills` table -> on next broadcast, `callAgent()` filters skills by agent_id and sends them to orchestrate edge function -> `buildSystemPrompt()` appends skill instructions to the system prompt

### Feature: Artifact Downloads

Agents can generate downloadable files (MD, HTML, etc.) that appear below the response content.

| What | Where |
|------|-------|
| Artifact download UI | `components/reveal/ArtifactDownload.tsx` |
| Artifact rendering in card | `components/reveal/FolioCard.tsx` (renders `<ArtifactDownload>`) |
| Artifact type definition | `types/index.ts` -> `ResponseArtifact` |
| Artifact extraction from API response | `hooks/useOrchestration.ts` -> `callAgent()` (extracts `result.artifacts`) |
| Artifact generation instructions | `supabase/functions/orchestrate/index.ts` -> system prompt |
| Database column | `responses.artifacts` (jsonb, migration: `add_skills_artifacts_scoped_paths.sql`) |

**Flow:** User asks an agent to generate a file in their prompt -> orchestrate edge function instructs the AI to include an `artifacts` array in its JSON output -> callAgent() extracts artifacts and saves them to the `responses` table -> FolioCard renders ArtifactDownload component -> user clicks download (creates Blob + URL.createObjectURL) or preview (opens HTML in new tab)

### Feature: Collapsible Signals

Response cards have a signals panel (synthesis_fit, risk, confidence, etc.) that can be collapsed to give more reading space.

| What | Where |
|------|-------|
| Signal collapse toggle | `components/reveal/FolioCard.tsx` -> `signalsExpanded` state |
| Persistence | localStorage key: `maestro:signals-expanded` |
| Collapsed view | Thin inline strip of colored dots with hover tooltips |
| Expanded view | Full aside panel with labeled rows |

### Feature: GitHub Integration

Full OAuth flow to connect a GitHub account, select a repository, and execute code changes.

| What | Where |
|------|-------|
| GitHub OAuth UI | `components/reveal/RepoSection.tsx` (inside VaultDrawer) |
| OAuth edge function | `supabase/functions/github-auth/index.ts` |
| Repo listing edge function | `supabase/functions/github-repos/index.ts` |
| Repo selection + scoped paths | `components/reveal/RepoSection.tsx` |
| Repo connection loading | `hooks/useWorkspace.ts` -> `loadRepoConnections()` |
| Execution modal | `components/reveal/ExecutionModal.tsx` |
| Execution edge function | `supabase/functions/github-execute/index.ts` |
| Execution status in Trust Rail | `components/reveal/TrustDrawer.tsx` |

**OAuth Flow:** User clicks "Connect GitHub" in VaultDrawer -> RepoSection calls `github-auth?action=get_auth_url` -> opens popup to GitHub OAuth -> user authorizes -> popup redirects with code -> RepoSection polls for code -> calls `github-auth?action=exchange_code` -> token stored in `encrypted_secrets` -> connection status in `provider_connections`

**Execution Flow:** User clicks "Prepare execution" in SynthesisDrawer -> ExecutionModal opens -> user picks strategy (per-agent or synthesized) -> if elevated mode, types "EXECUTE" to confirm -> creates `execution_runs` record -> calls `github-execute` edge function -> edge function creates branch, commits files to `maestro-patches/` directory, opens PR -> PR URL displayed in modal

### Feature: Sessions

Multiple orchestration sessions per workspace, with create, switch, and rename.

| What | Where |
|------|-------|
| Session switcher dropdown | `components/reveal/SessionSwitcher.tsx` |
| Session CRUD | `hooks/useWorkspace.ts` -> `createSession()`, `switchSession()`, `renameSession()` |
| Session history loading | `hooks/useWorkspace.ts` -> `loadSessionHistory()` |

### Feature: Provider Vault

BYOK (Bring Your Own Key) system for AI provider API keys.

| What | Where |
|------|-------|
| Vault drawer UI | `components/reveal/VaultDrawer.tsx` |
| Key save/remove logic | `supabase/functions/vault/index.ts` |
| Key storage | `encrypted_secrets` table (accessed via service role, bypasses RLS) |
| Connection metadata | `provider_connections` table |

### Feature: Trust Rail

Execution overview, permissions, audit timeline.

| What | Where |
|------|-------|
| Trust drawer UI | `components/reveal/TrustDrawer.tsx` |
| Audit event logging | `hooks/useOrchestration.ts` -> `logAudit()` |
| Audit event loading | `hooks/useWorkspace.ts` -> `loadSessionHistory()` |
| Execution mode display | `components/reveal/TrustDrawer.tsx` -> TrustCard "Repo Mode" |

---

## Edge Functions

All edge functions live in `supabase/functions/`. Each is a standalone Deno module deployed via the Supabase platform.

### orchestrate

**File:** `supabase/functions/orchestrate/index.ts` (~244 lines)
**Purpose:** Calls an AI provider with the user's prompt and agent persona, returns structured JSON.
**Method:** POST
**Providers supported:** Anthropic, OpenAI, Google Gemini, OpenRouter
**Key functions:**
- `buildSystemPrompt()` -- constructs the system prompt with agent role, skills, and scoped paths
- `parseResult()` -- extracts JSON from raw LLM output via regex, with fallback to raw text
**Environment vars:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`
**Tables used:** None (stateless)

### synthesize

**File:** `supabase/functions/synthesize/index.ts` (~70 lines)
**Purpose:** Merges multiple agent responses into a unified synthesis using Claude Haiku 3.5.
**Method:** POST
**Environment vars:** `ANTHROPIC_API_KEY`
**Tables used:** None (stateless)
**Note:** Uses `max_tokens: 512` and requests pure prose (no markdown).

### vault

**File:** `supabase/functions/vault/index.ts` (~183 lines)
**Purpose:** Manages API key storage and provider connection status.
**Methods:** GET, POST
**Actions (via `?action=` query param):**
- `list` -- list all provider connections for the user
- `save_key` -- save or update an API key
- `remove_key` -- remove an API key
**Environment vars:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
**Tables used:** `encrypted_secrets` (via service role), `provider_connections` (via user auth)

### github-auth

**File:** `supabase/functions/github-auth/index.ts` (~205 lines)
**Purpose:** Handles the GitHub OAuth flow.
**Methods:** GET, POST
**Actions (via `?action=` query param):**
- `get_auth_url` -- returns the GitHub OAuth authorization URL
- `exchange_code` -- exchanges an auth code for an access token, stores it
- `check_status` -- checks if the user has a GitHub connection
**External APIs:** GitHub OAuth (`github.com/login/oauth/*`), GitHub REST API (`api.github.com/user`)
**Environment vars:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`
**Tables used:** `encrypted_secrets`, `provider_connections`

### github-repos

**File:** `supabase/functions/github-repos/index.ts` (~93 lines)
**Purpose:** Lists the user's GitHub repos using their stored token.
**Method:** POST
**External APIs:** GitHub REST API (`api.github.com/user/repos`)
**Environment vars:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
**Tables used:** `encrypted_secrets` (read token)

### github-execute

**File:** `supabase/functions/github-execute/index.ts` (~252 lines)
**Purpose:** Creates branches, commits files, and opens PRs on GitHub.
**Method:** POST
**Modes:**
- `per_agent` -- one branch + PR per agent: `maestro/<agent-slug>/run-<id>`
- `synthesized` -- one branch + PR with combined output: `maestro/synthesis/run-<id>`
**External APIs:** GitHub REST API (refs, contents, pulls)
**Environment vars:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
**Tables used:** `repo_connections` (read), `encrypted_secrets` (read token), `execution_runs` (update status)
**Note:** Files are committed to the `maestro-patches/` directory in the repo as markdown files.

---

## Database Schema

13 tables total, across 2 migrations. All tables have RLS enabled.

### Tables

| Table | Purpose | Key Columns |
|-------|---------|-------------|
| `workspaces` | Named environment per user | `user_id`, `name`, `slug` |
| `provider_connections` | AI provider connection status | `user_id`, `provider`, `is_connected`, `models` |
| `encrypted_secrets` | Stored API keys (AI providers + GitHub) | `user_id`, `provider`, `encrypted_key`, `key_hint` |
| `agents` | AI agent roster per workspace | `workspace_id`, `name`, `role`, `provider`, `model`, `color`, `is_active`, `scoped_paths` |
| `agent_skills` | Skill instructions per agent | `agent_id`, `user_id`, `name`, `instruction`, `is_active` |
| `sessions` | Orchestration sessions | `workspace_id`, `title`, `execution_mode`, `status` |
| `rounds` | Broadcast rounds within a session | `session_id`, `round_number`, `prompt`, `target_agents`, `status` |
| `responses` | Agent outputs per round | `round_id`, `agent_id`, `content`, `title`, `signals`, `artifacts`, `is_flagged`, `is_lead` |
| `flags` | Standalone flag records (legacy) | `response_id`, `note` |
| `syntheses` | Synthesis outputs per round | `round_id`, `content`, `source_response_ids` |
| `repo_connections` | GitHub repo attachments | `workspace_id`, `owner`, `repo`, `default_branch`, `scoped_paths` |
| `execution_runs` | GitHub execution records | `session_id`, `synthesis_id`, `status`, `strategy`, `branch_name`, `pr_url` |
| `audit_events` | Immutable action trail | `session_id`, `event_type`, `actor`, `succeeded` (no UPDATE/DELETE policies) |
| `approval_requests` | Approval gates for risky actions | `execution_run_id`, `action_type`, `status` |

### Migrations

1. **`20260331044524_create_maestro_schema.sql`** -- Creates all 13 tables, RLS policies, and indexes.
2. **`20260404144809_add_skills_artifacts_scoped_paths.sql`** -- Adds `artifacts` column to `responses`, `scoped_paths` column to `agents`, creates `agent_skills` table.

### Adding a new table

1. Create a new migration file in `supabase/migrations/`
2. Define the table with `IF NOT EXISTS`
3. Enable RLS: `ALTER TABLE tablename ENABLE ROW LEVEL SECURITY`
4. Create separate SELECT, INSERT, UPDATE, DELETE policies using `auth.uid() = user_id`
5. Add indexes for frequently queried columns
6. Add the TypeScript interface in `src/types/index.ts`
7. Add the state field and actions in `src/context/MaestroContext.tsx`

---

## UI Component Map

### Layout Hierarchy

```
WorkspacePage
  |-- RevealTopbar (fixed top bar)
  |     |-- BrandMark (logo)
  |     |-- SessionSwitcher (session dropdown)
  |     |-- Keycap buttons (O, T, S, V, ?, sign out)
  |
  |-- HeroContext (round banner, centered)
  |
  |-- FolioCarousel (3D card carousel) OR EmptyStage
  |     |-- FolioCard (response card, one per agent)
  |     |     |-- ArtifactDownload (file download section)
  |     |-- StreamingFolio (loading placeholder)
  |     |-- OrbitDots (navigation dots)
  |
  |-- RevealComposer (prompt input, fixed bottom)
  |
  |-- [Drawers] (overlays, triggered by keyboard or topbar)
  |     |-- OrchestraDrawer (left) -- agents, skills, scoped paths
  |     |-- TrustDrawer (right) -- status, audit trail
  |     |-- SynthesisDrawer (bottom) -- synthesis, verification, mode
  |     |-- VaultDrawer (right) -- API keys, GitHub connection
  |     |     |-- RepoSection (GitHub OAuth, repo picker)
  |
  |-- [Modals]
  |     |-- PatchModal -- read-only patch summary
  |     |-- ExecutionModal -- GitHub execution with strategy toggle
  |
  |-- [Overlays]
  |     |-- ShortcutOverlay -- keyboard shortcut legend
  |
  |-- [Atmospheric layers] (CSS-only, decorative)
        |-- grain-layer
        |-- stage-glow-layer
        |-- vignette-layer
        |-- scrim (backdrop when drawer is open)
```

### Component Responsibilities

| Component | Renders | Reads from state | Writes to state | Writes to DB |
|-----------|---------|-----------------|----------------|-------------|
| RevealTopbar | Nav bar, session switcher | `agents`, `rounds` | `OPEN_DRAWER`, `TOGGLE_SHORTCUTS` | -- |
| HeroContext | Round banner | `rounds`, `agents` | -- | -- |
| FolioCarousel | Card carousel | `rounds`, `responses`, `broadcastingAgents`, `folioIndex` | `SET_FOLIO_INDEX` | -- |
| FolioCard | Response card | `responses` | `UPDATE_RESPONSE`, `OPEN_DRAWER` | `responses` (flag/lead) |
| ArtifactDownload | File downloads | -- (props only) | -- | -- |
| StreamingFolio | Loading placeholder | -- (props only) | -- | -- |
| EmptyStage | Empty state | `agents` | -- | -- |
| OrbitDots | Nav dots | `folioIndex` | `SET_FOLIO_INDEX` | -- |
| RevealComposer | Prompt input | `agents`, `isBroadcasting` | `SET_FOLIO_INDEX`, `OPEN_DRAWER` | -- |
| OrchestraDrawer | Agent management | `agents`, `agentSkills` | `ADD/REMOVE/UPDATE_AGENT_SKILL`, `UPDATE_AGENT` | `agent_skills`, `agents` |
| TrustDrawer | Status overview | `providerConnections`, `executionMode`, `auditEvents`, `executionRuns`, `activeRepoConnection` | -- | -- |
| SynthesisDrawer | Synthesis + verify | `rounds`, `responses`, `syntheses`, `activeSession`, `activeRepoConnection` | `SET_EXECUTION_MODE`, `SET_PATCH_MODAL`, `SET_EXECUTION_MODAL` | `sessions` |
| VaultDrawer | API key management | `providerConnections` | `UPSERT_PROVIDER_CONNECTION` | via `vault` edge function |
| RepoSection | GitHub connection | `activeRepoConnection`, `repoConnections` | `UPSERT_REPO_CONNECTION` | `repo_connections`, via edge functions |
| SessionSwitcher | Session list | `sessions`, `activeSession`, `workspace` | via useWorkspace hooks | `sessions` |
| PatchModal | Patch summary | `patchModalOpen`, `syntheses`, `activeSession`, `rounds` | `SET_PATCH_MODAL` | -- |
| ExecutionModal | Execution approval | `executionModalOpen`, `executionStrategy`, `agents`, `responses`, `syntheses`, `activeRepoConnection`, `executionMode`, `activeSession` | `SET_EXECUTION_MODAL`, `SET_EXECUTION_STRATEGY`, `ADD/UPDATE_EXECUTION_RUN` | `execution_runs`, via `github-execute` |
| ShortcutOverlay | Shortcut legend | `shortcutOverlayOpen` | `CLOSE_TRANSIENT` | -- |

---

## How-To: Common Changes

### Change the theme / colors

**Files to edit:** `src/index.css`

All colors are CSS custom properties defined in `:root` at the top of `index.css`:

- `--void`, `--void-2`, `--void-3` -- background shades
- `--surface`, `--surface-hov` -- card/element backgrounds
- `--border`, `--border-lit` -- border colors
- `--text`, `--text-muted`, `--text-dim` -- text hierarchy
- `--claude`, `--gpt`, `--gemini`, `--kimi`, `--qwen` -- agent accent colors
- `--gold`, `--gold-dim`, `--gold-glow` -- primary accent (gold)
- `--ok`, `--warn`, `--risk` -- status colors
- `--spring`, `--ease-out-expo`, `--drawer-ease` -- easing curves
- `--folio-radius` -- card border radius

The atmospheric gradient backgrounds are in `.reveal-bg`. The grain texture is in `.grain-layer`.

### Change fonts

**Files to edit:** `index.html` (Google Fonts links), `src/index.css`

Current fonts:
- **DM Sans** -- body text (set on `body`)
- **Syne** -- headings (utility class `.font-syne`)
- **DM Mono** -- monospace labels, chips, keycaps (utility class `.font-mono-dm`)

### Add a new AI provider

1. Add the provider to `PROVIDER_REGISTRY` in `src/types/index.ts`
2. Add a color in `PROVIDER_COLORS` in the same file
3. Add a CSS variable in `src/index.css` (e.g., `--newprovider: #color`)
4. Add the API call logic in `supabase/functions/orchestrate/index.ts` (add an `else if` block for the new provider)
5. Add the API key name to the environment variables (e.g., `NEWPROVIDER_API_KEY`)
6. Redeploy the `orchestrate` edge function

### Add a new agent to the default roster

**File to edit:** `src/types/index.ts` -> `AGENT_DEFAULTS` array

This only affects new workspaces. Existing workspaces keep their current agent roster.

### Add a new drawer

1. Add the drawer name to `DrawerTarget` type in `src/context/MaestroContext.tsx`
2. Create the drawer component in `src/components/reveal/YourDrawer.tsx`
3. Use CSS class `drawer-panel drawer-left`, `drawer-right`, or `drawer-bottom`
4. Add to `WorkspacePage.tsx` render
5. Add a keyboard shortcut in `WorkspacePage.tsx` key handler
6. Add the shortcut to `SHORTCUTS` array in `ShortcutOverlay.tsx`
7. Add a keycap button in `RevealTopbar.tsx`

### Add a new modal

1. Add a boolean state field to `MaestroState` in `context/MaestroContext.tsx`
2. Add a `SET_YOUR_MODAL` action
3. Create the modal component
4. Add to `WorkspacePage.tsx` render
5. Add to the Escape key handler in `WorkspacePage.tsx` (check it before `patchModalOpen`)

### Change the orchestrate system prompt

**File to edit:** `supabase/functions/orchestrate/index.ts` -> `buildSystemPrompt()` function

This controls what every agent receives as its system prompt. The function builds the prompt from:
1. Base instructions (JSON output format, signal types)
2. Agent name and role
3. Active skills (appended as numbered instructions)
4. Scoped paths (appended as file path context)
5. Artifact generation instructions

After editing, redeploy the function.

### Change which signals agents report

**Files to edit:**
- `supabase/functions/orchestrate/index.ts` -> system prompt (tell the agent what signals to report)
- `src/types/index.ts` -> `ResponseSignals` interface
- `src/components/reveal/FolioCard.tsx` -> `SignalRow` component (color logic for signal values)

### Change the GitHub branch naming convention

**File to edit:** `supabase/functions/github-execute/index.ts`

Search for `maestro/` to find the branch name construction logic:
- Per-agent: `maestro/${agentSlug}/run-${runIdShort}`
- Synthesized: `maestro/synthesis/run-${runIdShort}`

### Change where files are committed in GitHub

**File to edit:** `supabase/functions/github-execute/index.ts`

Search for `maestro-patches/` -- this is the directory where all files are committed. Agent outputs are written as markdown files within this directory.

### Add a new database table

1. Create migration: `supabase/migrations/YYYYMMDDHHMMSS_your_migration.sql`
2. Use `CREATE TABLE IF NOT EXISTS`
3. Enable RLS + create policies
4. Add TypeScript interface in `src/types/index.ts`
5. Add state + actions in `src/context/MaestroContext.tsx`
6. Add loading logic in `src/hooks/useWorkspace.ts`

### Change the verification logic

**File to edit:** `src/components/reveal/SynthesisDrawer.tsx` -> `detectContradictions()` function

This function scans response content for keyword-based conflicts across 6 categories: Database, Auth, Architecture, Framework, Deployment, Scope. Each category has an array of PATTERNS with competing keywords. You can add, remove, or modify patterns here.

### Change execution mode options

**Files to edit:**
- `src/types/index.ts` -> `ExecutionMode` type
- `src/components/reveal/SynthesisDrawer.tsx` -> mode selector section
- `src/components/reveal/TrustDrawer.tsx` -> mode display

### Change execution strategy options

**Files to edit:**
- `src/types/index.ts` -> `ExecutionStrategy` type
- `src/components/reveal/ExecutionModal.tsx` -> strategy toggle
- `supabase/functions/github-execute/index.ts` -> mode handling

---

## Design System and Theming

### CSS Architecture

All styles are in `src/index.css`. The project uses Tailwind CSS utility classes inline plus custom CSS classes for:

- **Atmospheric layers:** `.reveal-bg`, `.grain-layer`, `.vignette-layer`, `.stage-glow-layer`
- **Cards:** `.folio-card` (with positional variants `.folio-active`, `.folio-left`, `.folio-right`, etc.)
- **Drawers:** `.drawer-panel` (with position variants `.drawer-left`, `.drawer-right`, `.drawer-bottom`)
- **Buttons:** `.reveal-pill`, `.reveal-pill.primary`, `.keycap`
- **Labels:** `.reveal-label`, `.section-label`
- **Chips:** `.reveal-chip`, `.reveal-chip.accent`
- **Cards:** `.reveal-card`
- **Stats:** `.stat-block`
- **Code:** `.reveal-codeblock`
- **Overlay:** `.shortcut-overlay`
- **Stage effects:** `.stage-container`, `.stage-container.dimmed`, `.scrim`

### Spacing

The project uses Tailwind's default spacing scale (4px base). Common patterns:
- `gap-2` / `gap-3` for element spacing
- `mb-5` / `mb-6` for section spacing
- `p-6` / `px-4 py-3` for padding

### Responsive Breakpoints

Defined in `src/index.css`:
- `980px` -- carousel card positions adjust
- `720px` -- drawers become bottom sheets, carousel cards tighten

### Animations

Defined as `@keyframes` in `index.css`:
- `fade-in` -- general entrance
- `slide-in-right` -- lateral entrance
- `pulse-dot` -- broadcasting indicator
- `carousel-enter` -- card entrance
- `heartbeat` -- status pulse
- `shimmer` -- loading placeholder

---

## Data Flow Diagrams

### Broadcast Flow

```
User types prompt in RevealComposer
  |
  v
handleBroadcast(prompt, selectedAgentIds)
  |
  v
useOrchestration.broadcast()
  |-- creates Round in DB (status: 'broadcasting')
  |-- dispatches ADD_ROUND
  |-- logs 'broadcast' audit event
  |-- for each selected agent (in parallel):
  |     |
  |     v
  |   callAgent(agent, prompt, roundId)
  |     |-- filters agentSkills for this agent
  |     |-- calls orchestrate edge function
  |     |-- edge function calls AI provider API
  |     |-- extracts artifacts from response
  |     |-- saves Response to DB
  |     |-- dispatches ADD_RESPONSE
  |     |-- logs 'agent_response' audit event
  |
  |-- updates Round status to 'complete'
  |-- clears broadcasting state
```

### Execution Flow

```
User clicks "Prepare execution" in SynthesisDrawer
  |
  v
ExecutionModal opens (SET_EXECUTION_MODAL)
  |
  v
User selects strategy (per_agent / synthesized)
  |
  v
User confirms (types "EXECUTE" in elevated mode)
  |
  v
handleExecute()
  |-- creates execution_runs record (status: 'pending')
  |-- dispatches ADD_EXECUTION_RUN
  |-- calls github-execute edge function
  |     |-- reads repo_connections for owner/repo/branch
  |     |-- reads encrypted_secrets for GitHub token
  |     |-- updates execution_runs status to 'running'
  |     |-- creates branch from default branch
  |     |-- commits files to maestro-patches/ directory
  |     |-- opens pull request
  |     |-- updates execution_runs with PR URL, status 'complete'
  |
  |-- dispatches UPDATE_EXECUTION_RUN
  |-- displays PR link(s) in modal
```

---

## Environment Variables

### Frontend (.env)

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key (public, used for auth) |

### Edge Functions (auto-populated)

| Variable | Purpose | Used by |
|----------|---------|---------|
| `SUPABASE_URL` | Supabase project URL | vault, github-auth, github-repos, github-execute |
| `SUPABASE_ANON_KEY` | Anonymous key | vault |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (bypasses RLS) | vault, github-auth, github-repos, github-execute |
| `ANTHROPIC_API_KEY` | Anthropic API key | orchestrate, synthesize |
| `OPENAI_API_KEY` | OpenAI API key | orchestrate |
| `GEMINI_API_KEY` | Google Gemini API key | orchestrate |
| `OPENROUTER_API_KEY` | OpenRouter API key | orchestrate |
| `GITHUB_CLIENT_ID` | GitHub OAuth App client ID | github-auth |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth App client secret | github-auth |

---

## Known Limitations and Future Work

### Current limitations

- **No real-time streaming:** Agent responses arrive all at once after the API call completes. The streaming placeholder is visual only.
- **Verification is keyword-based:** The contradiction detection in SynthesisDrawer uses simple keyword matching, not semantic analysis.
- **Single workspace:** The UI currently shows one workspace. The data model supports multiple, but the workspace switcher isn't built.
- **No approval workflow:** The `approval_requests` table exists but isn't wired into the UI yet. The EXECUTE confirmation is a client-side gate only.
- **Patch files are markdown summaries:** The GitHub execution writes agent responses as markdown files to `maestro-patches/`, not actual code diffs. Applying real code changes would require a diff/patch system.
- **GitHub token storage:** Tokens are stored in `encrypted_secrets` but the "encryption" is at the database level, not application-level encryption.
- **No pagination:** Session history, audit events, and repo lists load with fixed limits.

### Features referenced in the schema but not yet built

- **Approval requests UI** -- table exists, no frontend
- **Flags table** -- exists as standalone table, but flagging is done via `is_flagged` column on responses directly
- **Multiple workspaces** -- data model supports it, no UI switcher

### Potential enhancements

- Real-time streaming via Supabase Realtime or SSE from edge functions
- Semantic contradiction detection using embeddings
- Workspace switcher
- Agent response diffing (show what changed between rounds)
- Approval workflow for elevated operations
- Real code patch generation and application
- Conversation history passed to agents for multi-round context
