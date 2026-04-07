# Copilot Instructions for Maestro

## What This App Does

Maestro is an AI orchestration console. It automates the manual process of consulting multiple AI models (Claude, GPT, Gemini, Qwen, DeepSeek, Kimi, OpenRouter) simultaneously, synthesizing their outputs, and executing resulting code changes to GitHub. The target workflow replaces manually copy-pasting between Claude Pro, ChatGPT, Gemini, Bolt, etc.

### The Intended Product Flow (phases — partially built)

```
1. Ideation        → User broadcasts initial prompt. Orb pulses with status text.
                     Council responds. Toggle reveals carousel of all responses.
2. Synthesis       → Responses synthesized. Lead agent (Sonnet + best OpenAI) does
                     final review to prevent circular reasoning. User gets clear path.
3. Design          → Agents produce HTML mockups, downloadable from carousel cards.
                     User reviews, picks features/colors/layout, locks design.
4. Pre-Build       → New repo OR existing repo? Tech stack confirmed. Supabase wired
                     (per-project). Agents produce full build spec: folder tree, file
                     list, role assignments. Each agent scoped to non-overlapping files.
5. Build           → Code written to GitHub. Agents read from GitHub for full context.
                     No two agents ever touch the same file simultaneously.
                     Human approves all role transfers.
6. Security Review → OpenAI + Claude review full codebase. Report surfaced. Human
                     decides on revamp sprint.
```

**What's built today:** phases 1–2 partially, execution flow, GitHub PR creation.
**What's not built yet:** Design phase, Pre-Build phase, project type detection (new vs existing repo), per-project Supabase config, lead agent single-chat mode, MODEL_REGISTRY, agent capability weighting.

## Commands

```bash
npm run dev          # Start Vite dev server
npm run build        # Production build
npm run lint         # ESLint
npm run typecheck    # TypeScript check (tsc --noEmit), no separate test suite
npm run preview      # Preview production build
```

There is no test suite — `npm run typecheck` is the closest equivalent to a validation pass.

## Reference Docs

`ARCHITECTURE.md` is the detailed reference. **Sections that are now outdated** (superseded by Last Shipped):
- Any mention of `maestro-patches/` as the commit directory — replaced by real `file_manifest` writes (Task 2)
- "Patch files are markdown summaries" under Known Limitations — no longer true
- `orchestrate` described as ~244 lines — it is now ~1000+ lines after Task 2 changes
- `github-execute` described as ~252 lines — significantly expanded by Task 2

## Architecture

```
src/
├── App.tsx                    # Root: AuthProvider → MaestroProvider → WorkspacePage
├── context/
│   ├── AuthContext.tsx        # Supabase auth state (user, session, signIn/Out/Up)
│   └── MaestroContext.tsx     # Global app state (useReducer, ~23 fields, 40+ action types)
├── hooks/
│   ├── useWorkspace.ts        # Workspace init, session CRUD, data loading
│   └── useOrchestration.ts   # Broadcast to agents, synthesis, GitHub execution, audit logging
├── lib/
│   ├── supabase.ts            # Supabase client singleton
│   └── database.types.ts     # Generated DB types (do not hand-edit)
├── types/index.ts             # All shared TypeScript interfaces
├── pages/
│   ├── AuthPage.tsx           # Login/signup
│   └── WorkspacePage.tsx      # Main workspace (keyboard shortcuts, drawers, carousel)
└── components/
    ├── reveal/                # All 19 workspace UI components
    └── ui/                    # Generic UI (LoadingScreen, etc.)
```

**Boot sequence** (in `useWorkspace.ts`): `ensureWorkspace` → `ensureAgents` → `loadSessions` → `loadProviderConnections` → `loadAgentSkills` (legacy, unused) → `loadRepoConnections` → `ensureSession` → `loadSessionHistory`

**No router is used.** Navigation is purely state-driven: `AuthPage` vs. `WorkspacePage` based on auth, and drawers/modals controlled via `activeDrawer` state (`'orchestra' | 'trust' | 'synthesis' | 'vault' | null`).

**Backend is Supabase** — PostgreSQL with RLS on all 13 tables, plus 6 Deno Edge Functions in `supabase/functions/`:

| Function | Role |
|---|---|
| `orchestrate` | Routes prompts to AI providers (Anthropic, OpenAI, Google, OpenRouter, Moonshot, Qwen) |
| `synthesize` | Synthesis via Claude Haiku |
| `vault` | Encrypted API key management |
| `github-auth` | OAuth flow |
| `github-repos` | List user repos |
| `github-execute` | Create branches, commits, PRs |

## Feature → File Map

| Feature | Key files |
|---|---|
| Broadcast prompt to agents | `RevealComposer.tsx` → `useOrchestration.broadcast()` → `callAgent()` → `orchestrate` edge fn |
| Response carousel | `FolioCarousel.tsx`, `FolioCard.tsx`, `StreamingFolio.tsx`, `OrbitDots.tsx` |
| Synthesis + verification | `SynthesisDrawer.tsx`, `useOrchestration.synthesize()`, `synthesize` edge fn |
| GitHub execution / PRs | `ExecutionModal.tsx`, `useOrchestration`, `github-execute` edge fn |
| Agent roster / voice picker | `OrchestraDrawer.tsx`, `useWorkspace.ensureAgents()`, `types/index.ts:AGENT_DEFAULTS` |
| API key management (Vault) | `VaultDrawer.tsx`, `vault` edge fn |
| GitHub OAuth + repo picker | `RepoSection.tsx` (inside VaultDrawer), `github-auth` + `github-repos` edge fns |
| Sessions (create/switch/rename) | `SessionSwitcher.tsx`, `useWorkspace.ts` |
| Audit trail | `TrustDrawer.tsx`, `useOrchestration.logAudit()`, `audit_events` table |
| Artifact downloads | `ArtifactDownload.tsx`, `FolioCard.tsx`, `responses.artifacts` column |
| Keyboard shortcuts | `WorkspacePage.tsx` key handler, `ShortcutOverlay.tsx` |
| Empty state | `EmptyStage.tsx` (shown when active session has zero rounds) |

## 5×3 Agent Roster

| Provider group | Slot 0 (default-on) | Slot 1 | Slot 2 |
|---|---|---|---|
| `anthropic` | Claude Haiku 4.5 | Claude Sonnet 4.6 | Claude Opus 4.6 |
| `openai` | GPT-4o mini | GPT-4o | o1 |
| `google` | Gemini 3 Flash | Gemini 1.5 Pro | Gemini 1.5 Flash |
| `openrouter_a` | Qwen 3.6 Plus | DeepSeek V3 (free) | Llama 4 Maverick |
| `openrouter_b` | Sonnet 4.6 (OR) | GPT-4o (OR) | Kimi K2 |

Slot 0 agents (except `openrouter_b`) start `is_active=true` so a new user can broadcast at $0 with zero config.

## Common Change Recipes

**New AI provider:** `types/index.ts:PROVIDER_REGISTRY` + `PROVIDER_COLORS` → `index.css` CSS var → `orchestrate/index.ts` (add `else if` block) → redeploy function.

**New drawer:** Add to `DrawerTarget` type → create `YourDrawer.tsx` with `.drawer-panel .drawer-left/right/bottom` → add to `WorkspacePage.tsx` render + key handler → add to `ShortcutOverlay.tsx:SHORTCUTS` → add keycap in `RevealTopbar.tsx`.

**New modal:** Add boolean to `MaestroState` + `SET_YOUR_MODAL` action → create component → add to `WorkspacePage.tsx` render + Escape handler.

**New DB table:** Migration with `IF NOT EXISTS` + RLS + policies → `types/index.ts` interface → `MaestroContext.tsx` state + actions → loading logic in `useWorkspace.ts`.

**Change system prompt / signals:** `orchestrate/index.ts:buildSystemPrompt()` → update `types/index.ts:ResponseSignals` → update `FolioCard.tsx:SignalRow` color logic → redeploy.

**Change contradiction detection:** `SynthesisDrawer.tsx:detectContradictions()` — keyword-based, 6 categories (Database, Auth, Architecture, Framework, Deployment, Scope).

## Design System CSS Classes

Custom classes defined in `src/index.css` (do not replicate with Tailwind):
- Atmospheric: `.reveal-bg`, `.grain-layer`, `.vignette-layer`, `.stage-glow-layer`, `.scrim`
- Cards: `.folio-card`, `.folio-active`, `.folio-left`, `.folio-right`, `.folio-far-left`, `.folio-far-right`
- Drawers: `.drawer-panel`, `.drawer-left`, `.drawer-right`, `.drawer-bottom`
- Buttons: `.reveal-pill`, `.reveal-pill.primary`, `.keycap`
- Labels/chips: `.reveal-label`, `.section-label`, `.reveal-chip`, `.reveal-chip.accent`
- Misc: `.reveal-card`, `.stat-block`, `.reveal-codeblock`, `.shortcut-overlay`

Responsive breakpoints in `index.css`: `980px` (carousel adjusts), `720px` (drawers become bottom sheets).

## Known Limitations

- No real-time streaming — responses arrive all at once; streaming placeholder is visual only
- Verification (`detectContradictions`) is keyword-based, not semantic
- Single workspace in UI — data model supports multiples, no switcher built yet
- No pagination on session history, audit events, or repo lists
- `agent_skills` table and `AgentSkill` type still exist but are **legacy/unused** since the cleanup sprint; safe to drop in a future migration
- `flags` table is also legacy — flagging is done via `is_flagged` on `responses` directly



All global state lives in `MaestroContext` — a single `useReducer` with typed actions. Consume it with `const { state, dispatch } = useMaestro()`. Business logic lives in hooks (`useWorkspace`, `useOrchestration`), not in components.

Key state fields: `agents`, `activeSession`, `rounds`, `responses`, `syntheses`, `executionRuns`, `broadcastingAgents`, `isBroadcasting`, `activeDrawer`, `folioIndex`.

Dispatch pattern for drawers: `dispatch({ type: 'OPEN_DRAWER', payload: 'vault' })`.

## API Call Patterns

**Direct Supabase queries** (data CRUD):
```ts
const { data, error } = await supabase
  .from('responses')
  .insert({ ... })
  .select()
  .maybeSingle();
```

**Edge Function calls** (AI operations, GitHub):
```ts
const response = await fetch(`${supabaseUrl}/functions/v1/orchestrate`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(payload),
});
```

Use `.maybeSingle()` (not `.single()`) for queries that may return no rows.

## Conventions

- **TypeScript strict mode** is on — `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`. Every new field/param must be used or removed.
- All shared types go in `src/types/index.ts`. Do not define types inline in components.
- Component files: **PascalCase** (`RevealTopbar.tsx`). Hooks/utilities: **camelCase** (`useWorkspace.ts`).
- Component internal ordering: state declarations → effects → handlers → JSX.
- Use `useCallback` for event handlers and async operations passed as props; use `useMemo` for expensive derived data.
- The 5×3 agent roster (15 agents, 5 provider groups × 3 slots) is canonical — it is seeded by `supabase/migrations/*reseed_agents_5x3.sql`. Agent slots are identified by `(workspace_id, provider_group, slot_index)`.
- Agents have `scoped_paths` (e.g., `src/**`) constraining which repo paths they operate on.
- `audit_events` is an **append-only** table — never update or delete rows from it.
- `database.types.ts` is generated from the Supabase schema. Regenerate with `npx supabase gen types typescript` after migrations; do not edit manually.

## Styling

Tailwind CSS with a custom design system. Key custom color tokens (from `tailwind.config.js`):

- `void` / `void-2` / `void-3` — background layers
- `gold` — primary accent
- `agent.claude`, `agent.gpt`, `agent.gemini`, etc. — per-provider accent colors
- `signal.ok`, `signal.warn`, `signal.risk` — status colors

Custom CSS classes for the 3D carousel (`.folio-active`, `.folio-left`, `.folio-right`, etc.) are defined in `src/index.css` — do not replicate with Tailwind utilities.

## Planned Architecture Changes (not yet built)

### MODEL_REGISTRY
Replace the hardcoded 5×3 DB-seeded agent roster with a `MODEL_REGISTRY` constant in `src/types/index.ts` that maps capability tags to recommended models. Orchestra drawer reads from the registry. Adding/updating a model = one file change, no DB migration required.

### Lead Agent Mode
After synthesis, the Lead agent receives all council outputs and the carousel collapses to a single-chat view with that agent. User can confirm or return to the full council. Lead agent for coding = Claude Sonnet 4.6 + best available OpenAI (OpenAI is strong on defensive/compliance thinking).

### Pre-Build Phase
A structured setup phase before any code is written:
- **Project type gate:** New repo (create fresh) vs existing repo (scan in for context)
- **Per-project Supabase config** — currently global in Vault, needs to be per-session/project
- **Tech stack confirmation** — council weighs in before scaffold
- **Build spec generation** — full folder/file tree, agent role assignments
- **Scope assignment** — each agent gets non-overlapping file groups (e.g., Gemini/Qwen → UI files only if strongest for UI; Sonnet + OpenAI → logic/backend)

### Design Phase
Between Synthesis and Pre-Build. Agents produce downloadable HTML mockups directly from their carousel cards. User reviews, selects features/colors/layout from each, synthesizes on design, locks it before proceeding.

### Agent Weighting
Agents accumulate a contribution weight per project. Redundant or low-signal agents identified and deprioritized. Scoped roles per project.

## Known UX Debt (audit findings, not yet fixed)

- **Topbar clutter:** Model name (e.g., "DEEPSEEK V3 (FREE)") aligns to its indicator dot, not screen-centered. Bleeds into the sessions tab. Round indicator + "Context: Round1" is redundant with HeroContext. Two lines used where one would do.
- **Carousel space:** Above clutter eats vertical space from the carousel, which is the primary content.
- **Composer too small:** "Direct the orchestra..." textarea doesn't visually invite long-form input.
- **Mode toggle (analysis/build/artifact):** Three small pills at composer bottom — most important workflow fork in the app but has almost no visual weight.
- **Orb is static:** No color change or state-aware text during broadcast. "Brewing / Thinking / Synthesizing" status copy is not built. The orb is visual-only right now.
- **No carousel reveal toggle:** Vision is orb-first with a toggle to reveal the carousel. Currently carousel is always the primary view once responses arrive.
- **Artifact tab UX:** Clicking artifact buttons has no visible effect to new users. Artifact download/preview works but isn't discoverable.
- **Synthesis verification is cosmetic:** 1.4s mock delay before a regex scan that already ran. Feels fake.
- **No markdown rendering in FolioCard:** Agent responses with headers/bullets/code blocks render as raw text with asterisks/hashes.

  **Bug fixes (2026-04-07)** ✅
  - Bug 1: `parseResult()` now strips ` ```json ``` ` code fences before JSON extraction
  - Bug 4: `FolioCard` unescapes `\n`/`\t`/`\"` and uses `white-space: pre-wrap`
  - Pre-existing: `ExecutionModal` duplicate id key in dispatch; `StreamingFolio` unused params

## Last Shipped State

These features are **confirmed deployed** as of the last session. Do not re-implement or second-guess them.

**OpenRouter fix (Task 1)** — `response_format` param dropped from OpenRouter requests; free-tier 500 errors unblocked.

**HeroContext fix (Task 1b)** — HeroContext no longer echoes the broadcast prompt back. Round/voices/repo/context indicators preserved.

**Real file writes via `file_manifest` (Task 2)** — Build mode PRs now write files at real paths (no `maestro-patches/` fallback).
- Migration `20260406180000` added `file_manifest jsonb` to `responses`
- `FileManifestEntry` type in `src/types/index.ts`
- Build prompt demands complete file contents; no `// ... existing code ...` placeholders allowed
- `parseResult` in `orchestrate` extracts `file_manifest` defensively
- `github-execute` has `utf8ToBase64`, `getExistingFile`, `upsertFile`, `deleteFile`, `applyManifest`
- **Truncation guard**: regex catches `// ... existing`, `/* ... unchanged */` etc → entry skipped with reason
- **Length sanity guard**: existing file >200B and new content <30% of existing size → skipped with reason
- **Loud failure**: no manifest → agent blocked with reason `"no file_manifest emitted"`
- Structured result: `{ status, written_files, deleted_files, skipped_files, errors, branches, prs, blocked }`
- Scope enforcement: out-of-scope manifest entries are skipped, run continues partial
- Synthesized mode applies union of all manifests on a single branch

**Diff preview in approval modal (Task 3)** — `ExecutionModal` shows "Files to write" panel before user approves: `[~] path (N lines) — agent` / `[×] path (deleted)`. Red warning if any selected response has no manifest.

**Literal-path auto-inject (Task 4)** — In Build mode, `useOrchestration.callAgent` auto-injects file content for literal (non-glob) scoped paths. Caps: max 5 files, max 50KB per file server-side. Glob/oversize paths fall back to system-prompt hint. Dedupes against existing `context_files`.

### Known Risks

1. **First real Build broadcast is the moment of truth.** Truncation guard is regex-based — a sufficiently terse model could produce a stub that passes both guards. Watch the first PR carefully.
2. **Synthesized mode "last write wins"** on path collisions is intentional. If two patches both touch the same file, second overwrites first. Collision detection is a future improvement.
3. **`looksTruncated` is best-effort.** False positives on files that legitimately contain `// ... existing` in string literals will cause that entry to be skipped. Tuning the patterns is the fix.
4. **Migration `20260406180000` is applied to remote.** Local devs on a separate Supabase instance need to pull and re-run.

---

## Environment Variables

Required in `.env`:
```
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

API keys for AI providers are stored **encrypted in the database** (via the `vault` Edge Function), not in `.env`.
