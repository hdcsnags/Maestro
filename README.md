# Maestro

A multi-agent AI orchestration console. You (the **Conductor**) direct a council of AI agents — broadcast a prompt across providers, watch them deliberate in persona, synthesize the strongest ideas, and hand the resulting plan to scoped, lane-assigned builder agents that commit real code to GitHub. Local execution routes through your existing CLI subscriptions (Claude Code, Copilot, Codex, Gemini) via the **MaestroClaw** worker instead of burning API tokens.

> **Agents working on this repo:** read `MAESTRO_STATE.md` and `AGENTS.md` before touching anything. Stable architecture lives in `docs/reference/REFERENCE.md`. A pre-built code knowledge graph for cold-start onboarding lives in `graphify-out/` (`GRAPH_REPORT.md` + `graph.html`).

## What It Does

**Claw Mode — the thread-first shell (primary UI).** One conversation surface with an intent router (Chat / Broadcast / Execute / Build). Concierge triage fast-paths simple questions; anything heavier fans out to the council or the build pipeline. Live build progress, execution approvals, PR results, and security reviews all render as typed thread cards.

**The Council — deliberation, not just broadcast.**
- Broadcast one prompt to up to 15 cloud agents (Anthropic, OpenAI, Google, OpenRouter incl. Kimi/Llama/Gemma) and review responses in a 3D card carousel.
- **Deliberation rounds (PRO-01):** agents read each other's answers and file structured pushbacks; synthesis is deliberation-aware, weighing challenges against originals.
- **Personas (SOM-04):** council seats carry persistent personas (builder / skeptic / archivist / critic) with distinct priors, voice, and deliberation signatures — productive disagreement by design.
- **Verify:** contradiction detection across agent responses before you act.

**The Build Pipeline** — `analysis → design → pre_build → build → bouncer → complete`:
- **Intake** scans the target repo for stack and risks; **Design** generates multi-lane HTML mockups.
- **Pre-Build** locks a build spec: project type, builder roster, backend (edge / local / auto), and an `ARCHITECT.md` plan parsed into per-lane file scopes.
- **Build** decomposes the plan into dependency-ordered tasks, dispatches them to builder lanes in parallel, and reconciles file-manifest collisions deterministically (Conductor module) instead of last-write-wins.
- **Bouncer** runs a security/code-quality gate before anything merges.
- **Execute** pushes to GitHub as branches + PRs (per-agent or synthesized), with server-side scope enforcement, truncation guards, and an append-only audit trail.

**MaestroClaw — local execution node** (`packages/maestroclaw/`):
- Polls Supabase for jobs and runs them on your machine through pluggable adapters: `claude_code`, `codex_cli`, `copilot_cli`, `gemini_cli`, `approved_shell` (HMAC-approved commands through a quote-aware shell analyzer), `pty_shell`, `shell_stub`.
- Concurrent job pool with lease expiry, adapter fallback chains, and per-file Ralph-loop retries with quality checks and git checkpoints.
- **Iteration loops (PRO-02):** long-running local agent loops with path locks, structured session logging, step approval UI, and **decision records (MEM-02)** that feed institutional memory back into future concierge prompts.
- **Conductor module:** plan ingestion, dependency-ready task selection, and deterministic manifest reconciliation (priority tier → lane order → stable tie-break), mirrored between the worker and the web dispatch layer.

**Memory & self-knowledge:**
- **Repo memory (DIFF-02):** per-user, per-repo persistent context with a graph layer (`kind` + `relations`), surfaced in the Trust drawer and injected into concierge prompts.
- **Knowledge graph:** `graphify-out/` holds an AST-derived graph of the codebase (~1,260 nodes / 2,660 edges / 60+ labeled communities), auto-rebuilt by git hooks — zero-token cold starts for new agents.
- **Grading lab (`grading-lab/`):** benchmark harness that fans a review task out to independent CLI agents (Codex, Copilot, Grok, Kimi, …) and collects graded verdicts — the prototype for the agent-reputation ("Rate") layer.

## Tech Stack

| Layer        | Technology |
|--------------|------------|
| Frontend     | React 18 + TypeScript (strict) + Tailwind CSS + Vite |
| Backend      | Supabase — Postgres (21 active tables, 52 migrations) + Deno Edge Functions (19) |
| Auth         | Supabase email/password; edge auth enforced in-function (`_shared/auth.ts`) |
| AI Providers | Anthropic, OpenAI, Google, OpenRouter (BYOK via AES-GCM `encrypted_secrets`) |
| VCS          | GitHub App ("MaestroThamos", user-to-server tokens) + REST API |
| Local Exec   | MaestroClaw — Node.js worker in `packages/maestroclaw/` |
| CI           | GitHub Actions — typecheck + lint + build + maestroclaw tests on push/PR to `main` |

### Edge Functions (19)

`orchestrate` (multi-provider agent calls) · `synthesize` (deliberation-aware synthesis) · `deliberate` (pushback rounds) · `concierge` / `concierge-triage` (routing + build planning) · `architect` (ARCHITECT.md + lanes) · `design` (mockup lanes) · `intake` (repo scan) · `bouncer` (security gate) · `iteration-init` (loop bootstrap) · `executor-api` (MaestroClaw control plane) · `repo-memory-update` (memory CRUD + graph) · `vault` (BYOK keys) · `audit-log` · `github-auth` / `github-repos` / `github-read` / `github-execute` / `github-create-repo`

## Getting Started

1. Create `.env` with `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
2. Apply migrations: `supabase db push` (or via the dashboard). All 52 should apply clean.
3. `npm install && npm run dev`.
4. Add provider API keys through the in-app Provider Vault (`V`).
5. Connect GitHub through the Vault to enable execution (requires the GitHub App installation).
6. Optional — local execution:
   ```bash
   cd packages/maestroclaw
   cp .env.example .env   # Supabase URL, credentials, executor token
   npm install && npm run build
   npm run dev            # start polling for jobs
   ```
   Rotate/reissue executor tokens from the Executor panel or `executor-api`.

**Dev commands:** `npm run typecheck` · `npm run lint` (0 errors expected) · `npm run build` · `npm --prefix packages/maestroclaw test`

## Project Structure

```
src/
  context/MaestroContext.tsx    # Global state (useReducer) — all entities + UI state
  hooks/
    useThreads.ts               # Claw Mode threads: chat, broadcast, execute, build routing
    useOrchestration.ts         # Council broadcast, agent calls, synthesis
    useBuildExecution.ts        # Build dispatch loop: decompose, dispatch, retry, reconcile
    useIterationLoop.ts         # PRO-02 iteration loop control
    useWorkspace.ts             # Workspace init, session CRUD
  lib/
    conductor.ts                # Web mirror: dep-ready task selection + manifest reconcile
    sessionBuild.ts             # Shared local build_session submit/poll/cancel
  components/reveal/            # All workspace UI (ClawMode, FolioCarousel, BuildWorkspace,
                                #   PreBuildPanel, DesignPhase, drawers, thread cards, Orb…)
  types/index.ts                # Source of truth for all shared types + agent roster

supabase/
  functions/                    # 19 Deno edge functions (+ _shared auth/personas/secrets)
  migrations/                   # 52 SQL migrations

packages/maestroclaw/
  src/
    index.ts                    # Poll loop — concurrent job pool
    executor.ts                 # Job runner: workspace, adapter dispatch, artifacts
    adapters/                   # claude-code, codex-cli, copilot-cli, gemini-cli,
                                #   approved-shell, pty-shell, shell-stub
    conductor/                  # Plan, reconcile, prompt (lead-agent coordination)
    iteration/                  # Runner, locks, apply-diff, prompts (PRO-02)
    lib/kernel/                 # shell-analyzer (injection guard), incident-service

docs/
  reference/REFERENCE.md        # Stable architecture (tables, functions, key decisions)
  specs/active/                 # Live feature specs (SOM, PRO, DIFF, SEC, CLAW, SANDBOX…)
  specs/archive/                # Superseded specs
  session-log/HISTORY.md        # Pre-May-2026 session history
  vault/                        # Obsidian read-projection of repo memory

graphify-out/                   # Code knowledge graph (report, HTML viz, JSON)
grading-lab/                    # Multi-CLI review/grading benchmark tasks
MAESTRO_STATE.md                # Operational state + session log — read first
AGENTS.md                       # Mandatory workflow rules for all agents
```

## Multi-Agent Development Workflow

This repo is built *by* the kind of system it implements. Multiple CLI and web agents work it in sessions, coordinated through:

- **`MAESTRO_STATE.md`** — verified operational state ("what's working", with dates) + append-only session log. Every agent updates it after every session.
- **`AGENTS.md`** — the rules: read-before-work, verification discipline (never claim untested things work), active locks, source-of-truth hierarchy (codebase > state file > reference > memory).
- **`graphify-out/`** — the code graph agents query instead of re-reading the tree.
- **`grading-lab/`** — independent multi-model review gates for high-risk merges.

## Security Model

- Server-authoritative scope enforcement: builder writes outside declared lane paths are blocked in `github-execute`.
- Shell execution is gated: quote/escape-aware command segmentation (`shell-analyzer.ts`), a trusted-command allowlist, and HMAC-signed approval tokens (SEC-02) that are never persisted.
- BYOK secrets encrypted with AES-GCM + AAD; append-only `audit_events` under RLS.
- Known open items are tracked in `opus4.8.md` (graded audit): local-execution sandbox hardening (P0-1/P0-2) is the top of the security backlog — see `docs/specs/active/SANDBOX_SEQUENCE_SPEC.md`.
