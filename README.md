# Maestro

An AI orchestration console that lets you conduct a council of AI agents, synthesize their outputs, and execute changes against real GitHub repositories.

## What It Does

Maestro is a "society of mind" tool. You write a single prompt, broadcast it to multiple AI models simultaneously (Claude, GPT, Gemini, Kimi, Qwen, OpenRouter), and review their responses in a 3D card carousel. From there you can:

- **Flag and synthesize** -- mark the best responses, then synthesize them into a single unified output
- **Verify** -- run contradiction detection across agent responses before committing to action
- **Execute** -- push agent outputs to GitHub as branches and pull requests, with two strategies:
  - *Per-agent branches*: each agent gets its own branch and PR
  - *Synthesized PR*: one combined branch with the merged output
- **Download artifacts** -- agents can generate MD/HTML files you download directly, useful for planning and UX design stages
- **Scope agents to paths** -- restrict each agent to specific directories (e.g. frontend agent only touches `src/**`); the server blocks writes outside declared scopes
- **Run locally with MaestroClaw** -- a poll-based execution node that runs on your machine, routing jobs through your existing Claude Code / Copilot CLI subscriptions instead of burning API tokens

## Tech Stack

| Layer       | Technology                                |
|-------------|-------------------------------------------|
| Frontend    | React 18 + TypeScript + Tailwind CSS      |
| Build       | Vite                                      |
| Icons       | Lucide React                              |
| Backend     | Supabase (Postgres + Edge Functions)      |
| Auth        | Supabase email/password authentication    |
| AI Providers| Anthropic, OpenAI, Google Gemini, Moonshot (Kimi), Qwen, OpenRouter |
| VCS         | GitHub OAuth App + GitHub REST API        |
| Local Exec  | MaestroClaw (Node.js worker in `packages/maestroclaw/`) |

## Getting Started

1. The project expects a `.env` file with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
2. Run database migrations via the Supabase dashboard or CLI
3. Add your AI provider API keys through the in-app Provider Vault (press `V`)
4. Connect your GitHub account through the Vault to enable execution

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `O` | Open the Orchestra drawer (toggle voices, manage scoped paths) |
| `T` | Open the Trust Rail (execution status, audit timeline) |
| `S` | Open the Synthesis drawer (synthesize, verify, execute) |
| `V` | Open the Provider Vault (API keys, GitHub connection) |
| `?` | Toggle the shortcut legend |
| `<-` / `->` | Navigate the folio carousel |
| `Esc` | Dismiss drawers, modals, and overlays |
| `Cmd/Ctrl+Enter` | Send broadcast from composer |

## Project Structure

```
src/
  App.tsx                    # Root: AuthProvider > MaestroProvider > WorkspacePage
  main.tsx                   # Vite entry point
  index.css                  # Global styles, CSS variables, animations

  context/
    AuthContext.tsx           # Supabase auth state (user, session, signIn/signUp/signOut)
    MaestroContext.tsx        # Global app state via useReducer (all entities + UI state)

  hooks/
    useWorkspace.ts           # Workspace init, session CRUD, data loading
    useOrchestration.ts       # Broadcast, agent calls, synthesis, audit logging

  lib/
    supabase.ts               # Supabase client singleton
    database.types.ts         # Generated database types

  types/
    index.ts                  # All TypeScript interfaces and constants

  pages/
    AuthPage.tsx              # Login / signup form
    WorkspacePage.tsx          # Main workspace (carousel, drawers, modals, composer)

  components/
    reveal/                   # All workspace UI components
      RevealTopbar.tsx        # Top navigation bar with drawer shortcuts
      HeroContext.tsx          # Current round banner
      FolioCarousel.tsx       # 3D card carousel for agent responses
      FolioCard.tsx           # Individual response card with collapsible signals
      StreamingFolio.tsx      # Loading placeholder while agent is generating
      EmptyStage.tsx          # Breathing gold Maestro orb shown when session has zero rounds
      OrbitDots.tsx           # Carousel navigation dots
      RevealComposer.tsx      # Prompt input + agent selector + broadcast button
      OrchestraDrawer.tsx     # 5x3 voice picker (toggle agents, edit scoped paths)
      TrustDrawer.tsx         # Execution status, audit timeline, permissions
      SynthesisDrawer.tsx     # Synthesis, verification, execution mode
      VaultDrawer.tsx         # API key management
      RepoSection.tsx         # GitHub OAuth + repo picker (inside VaultDrawer)
      SessionSwitcher.tsx     # Session dropdown (create, switch, rename)
      PatchModal.tsx          # Read-only patch summary modal
      ExecutionModal.tsx      # GitHub execution approval + strategy toggle
      ArtifactDownload.tsx    # File download/preview for agent artifacts
      ShortcutOverlay.tsx     # Keyboard shortcut legend
    ui/
      LoadingScreen.tsx       # Full-screen loading indicator

supabase/
  migrations/
    20260331..._create_maestro_schema.sql           # Full initial schema (13 tables)
    20260404..._add_skills_artifacts_scoped_paths.sql # Adds scoped_paths + artifacts (skills table now unused)
    20260406150000_reseed_agents_5x3.sql             # Canonical 5x3 = 15 agents per workspace
    20260406150100_unique_agent_slots.sql            # UNIQUE(workspace_id, provider_group, slot_index)
    20260406160000_fix_stale_model_slugs.sql         # Qwen + Gemini slug refresh
    20260414040000_build_tasks.sql                    # Build v2 task queue
    20260417160000_maestroclaw_executors.sql           # MaestroClaw executor registration
    20260417160100_maestroclaw_jobs.sql                # MaestroClaw job queue
    20260417160200_maestroclaw_events.sql              # MaestroClaw audit events
    20260417160300_maestroclaw_bridge.sql              # Build task → executor bridge

  functions/
    orchestrate/index.ts          # Core AI agent execution (multi-provider)
    synthesize/index.ts           # Response synthesis via Claude Haiku
    vault/index.ts                # API key management (save/remove/list)
    github-auth/index.ts          # GitHub OAuth flow
    github-repos/index.ts         # List user's GitHub repos
    github-execute/index.ts       # Create branches, commits, PRs on GitHub
    github-create-repo/index.ts   # Create a new repo on the user's account (Build mode)
    executor-api/index.ts         # MaestroClaw control plane (register, poll, claim, complete)

packages/
  maestroclaw/
    src/
      index.ts                    # CLI entry point — poll loop + graceful shutdown
      config.ts                   # Env var loader
      auth.ts                     # Supabase email/password auth
      api.ts                      # Edge function API client (heartbeat, poll, claim, complete)
      executor.ts                 # Job runner — workspace setup, adapter dispatch, cleanup
      adapters/
        types.ts                  # Adapter interface
        index.ts                  # Adapter registry
        shell-stub.ts             # Echo adapter for smoke testing
        claude-code.ts            # Claude Code CLI adapter
```

## MaestroClaw (Local Execution)

MaestroClaw is a local worker that polls Maestro for jobs and runs them on your machine. See [`packages/maestroclaw/README.md`](packages/maestroclaw/README.md) for setup instructions.

```bash
cd packages/maestroclaw
cp .env.example .env   # Fill in Supabase URL, credentials, executor token
npm install
npm run dev            # Start polling for jobs
```
