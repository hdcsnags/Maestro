# Edge Functions

19 Deno edge functions deployed to Supabase. All authenticated via `Authorization: Bearer <token>`. Base URL: `${VITE_SUPABASE_URL}/functions/v1/<name>`.

## Core AI Pipeline

| Function | Role |
|---|---|
| `orchestrate` | Routes prompts to AI providers (Anthropic/OpenAI/Google/OpenRouter/Moonshot/Qwen). Contains `buildSystemPrompt()`, `parseResult()`, `capabilitiesFor()`. ~1000+ lines. |
| `synthesize` | Synthesis pass via Claude Haiku. Reads all council responses, returns unified synthesis. |
| `deliberate` | PRO-01 deliberation — round 2 pushbacks. Takes council responses, runs counter-arguments. |

## Build Pipeline

| Function | Role |
|---|---|
| `github-execute` | Creates branches, commits files from `file_manifest`, opens PRs. Contains `upsertFile`, `deleteFile`, `applyManifest`, truncation guard, length sanity guard. |
| `intake` | Pre-Build phase — detects new vs existing repo, collects project info. |
| `architect` | Pre-Build phase — generates build spec (folder tree, file list, agent role assignments). |
| `design` | Design Phase — agents produce HTML mockups. Verified built 2026-04-14. Full-screen carousel UX, tiered roles (Lite/Standard/Exploration). |

## Memory & Context

| Function | Role |
|---|---|
| `repo-memory-update` | DIFF-02 repo memory: `get` / `summarize` / `update_direct` / `forget` operations on `repo_memory` table. Injected by `concierge`. |
| `concierge` | Project triage/routing. Reads `decision_records` + `repo_memory` for context injection at session start. |

## Auth & Security

| Function | Role |
|---|---|
| `vault` | Encrypted API key management — stores/retrieves provider API keys. |
| `github-auth` | GitHub OAuth flow — exchange code for token. |
| `github-repos` | Lists user GitHub repos after OAuth. |
| `bouncer` | Security gate — shell injection guard, HMAC approval tokens (SEC-01/02). |

## Status
19 total deployed. Above lists ~13 confirmed. Remaining ~6 visible in `supabase/functions/` directory.

## Key Shared Utilities (`supabase/functions/_shared/`)

| File | Exports |
|---|---|
| `auth.ts` | `requireAuthenticatedRequest()` |
| `secrets.ts` | `getDecryptedSecret()` |
| `cors.ts` | `buildCorsHeaders()` |
| `body.ts` | `readJsonBody()` |
| `persona-prompt.ts` | `renderPersonaBlock()`, `extractAgentQuery()`, `PersonaRecord` type |

## buildSystemPrompt() Injection Order

1. Codebase context (if any)
2. Persona voice block (analysis mode only — SOM-04)
3. Agent name + role
4. Mode block: `build` | `build_task` | `artifact` | `analysis`
5. **Karpathy coding standards** (build + build_task modes only — added 2026-06-02)
6. Skills (if any)
7. Scoped paths (if any)
8. Verbosity tier (if any)

## Related Notes
- [[Architecture]]
- [[Database]]
- [[Key-Files]]
