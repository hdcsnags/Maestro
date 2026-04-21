# MaestroClaw — Local Execution Node

MaestroClaw is Maestro's local execution worker. It polls the Maestro control plane for approved jobs and runs them on your machine using local CLI tools (Claude Code, Copilot CLI, etc.) — so you use your existing subscriptions instead of burning API tokens through edge functions.

## Architecture

```
Maestro (web)  ──submit job──▶  Supabase (executor_jobs table)
                                       │
MaestroClaw (local)  ◀──poll──         │
       │                               │
       ├── claim job                   │
       ├── run adapter (claude_code)   │
       ├── report events               │
       └── complete ──────────────────▶│
```

**Outbound-only**: MaestroClaw polls Maestro. Maestro never reaches into your machine.

## Quick Start

### 1. Install

```bash
cd packages/maestroclaw
npm install
```

### 2. Register an Executor

In the Maestro web UI (Vault → Executors), or via API:

```bash
curl -X POST "${SUPABASE_URL}/functions/v1/executor-api?action=register" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name": "my-laptop"}'
```

Save the returned `token` — it's shown only once.

### 3. Configure

```bash
cp .env.example .env
# Fill in SUPABASE_URL, SUPABASE_ANON_KEY, EXECUTOR_TOKEN
```

### 4. Run

```bash
npm run dev    # Development (tsx, no build step)
npm run build  # Compile TypeScript
npm start      # Run compiled JS
```

You'll see:
```
🐾 MaestroClaw v0.1.0 — Local Execution Node
──────────────────────────────────────────────────
📡 Supabase: https://your-project.supabase.co
⏱  Poll interval: 5000ms
🔌 Adapters:
   ✅ shell_stub
   ✅ claude_code
💓 Heartbeat sent — executor is online
──────────────────────────────────────────────────
👀 Polling for jobs...
```

## Adapters

| Adapter | Description | Requires |
|---------|-------------|----------|
| `shell_stub` | Echo adapter for testing | Nothing |
| `claude_code` | Runs prompts via `claude --print` | [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed + authenticated |

### Adding an Adapter

1. Create `src/adapters/your-adapter.ts` implementing the `Adapter` interface
2. Register it in `src/adapters/index.ts`
3. The adapter name becomes the `adapter` field in job submissions

## Job Lifecycle

```
queued → approved → claimed → running → succeeded/failed
```

- **queued**: Job submitted, waiting for approval
- **approved**: Human approved (or auto-approved), ready for pickup
- **claimed**: MaestroClaw locked it — running next
- **running**: Adapter is executing
- **succeeded/failed**: Done, result synced back

MaestroClaw now advertises its supported adapters on heartbeat. The control plane only hands a worker jobs whose `adapter` matches that advertised capability set, and stale `claimed`/`running` jobs are re-queued automatically if the worker stops renewing its lease.

## Configuration

| Env Var | Required | Description |
|---------|----------|-------------|
| `SUPABASE_URL` | ✅ | Your Maestro Supabase URL |
| `SUPABASE_ANON_KEY` | ✅ | Supabase anon key |
| `EXECUTOR_TOKEN` | ✅ | Token from registration |
| `POLL_INTERVAL_MS` | | Poll frequency (default: 5000) |
| `WORKSPACE_DIR` | | Ephemeral clone dir (default: ~/.maestroclaw/workspaces) |

## Security

- **Outbound-only**: Worker initiates all connections
- **Executor token auth**: Worker actions authenticate with `X-Executor-Token` (SHA-256 hashed, stored server-side)
- **Ephemeral workspaces**: Cloned per job, deleted after
- **Scoped paths**: Jobs can restrict which files the adapter may touch
- **Approval gate**: Jobs require explicit approval before execution (auto-approve configurable)
