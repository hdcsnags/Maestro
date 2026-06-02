# Maestro — Deep Technical Assessment

**Auditor:** Claude Opus 4.8 (GitHub Copilot CLI)
**Date:** 2026-05-28
**Scope:** Full-stack — frontend (React/TS), Supabase edge functions (Deno), Postgres + RLS, and the MaestroClaw local execution node.
**Method:** Doc review (`MAESTRO_STATE.md`, `REFERENCE.md`, `ARCHITECTURE.md`) → codebase mapping → four parallel deep-dive探 passes (edge-orchestration, build-pipeline, claw-security, data/RLS/frontend) → **independent verification of every high-stakes claim by reading the source myself**. Where an agent's claim disagreed with the code, I trust the code (and say so).

> **Note on verification discipline.** I did not take the state doc at face value. I read `_shared/auth.ts`, `_shared/secrets.ts`, `_shared/approval-tokens.ts`, `_shared/trusted-commands.ts`, `lib/kernel/shell-analyzer.ts`, `adapters/approved-shell.ts`, `adapters/pty-shell.ts`, the RLS lockdown migrations, and the frontend state metrics directly. I also installed deps and ran `npm run typecheck` (root) — **it passes clean (exit 0)**.

---

## Executive Summary

Maestro is an ambitious and genuinely novel system: a "Conductor" that broadcasts one prompt to a roster of competing AI agents across providers, deliberates, synthesizes, and — in build mode — decomposes work into per-file tasks and commits real code to GitHub, optionally routing execution to a **local** MaestroClaw node that runs AI CLIs and shell commands on your machine.

The good news: **the parts that protect your data and your money are genuinely well-built.** JWT auth, server-side rate limiting, AES-GCM secret encryption, and a deny-all RLS lockdown on `encrypted_secrets` are all real and correct — not aspirational. The frontend typechecks clean under strict TS.

The debt is concentrated in two places:
1. **The build/execution pipeline** carries real robustness debt — non-deterministic conflict resolution, dispatch-loop stalls, a completeness gate with both false positives and negatives, and a half-migrated "unified UX" that leaves two parallel build entrypoints.
2. **The local-execution trust boundary is soft.** The shell injection guard is actually sound (it blocks `$()`, backticks, redirects, chaining) — but the *allowlist it protects* contains `rm`, `npm`, `find`, `git`, `cp`, `mv` executed under `shell: true` with the full parent environment, and cloud jobs are trusted without local authenticity checks. The security model rests on trusting the cloud control plane.

**Overall grade: B / B−.** A high-ceiling, security-conscious system with a maintainability and pipeline-reliability tax that will compound if not paid down.

---

## Grade Card

| Area | Grade | One-line justification |
|------|:---:|---|
| **Auth & request security** (`_shared/auth.ts`) | **A** | JWT verification + per-function server-side rate limiting + clean error contracts with request IDs. No token logging. |
| **Secret encryption** (`_shared/secrets.ts`) | **A−** | AES-GCM, random IV, AAD-bound, lazy migration of legacy plaintext. Minus: crypto root falls back to the service-role key; no rotation beyond `v1`. |
| **Data model & RLS** (migrations) | **A−** | Every core table RLS-enabled and user-scoped; `encrypted_secrets` deny-all to clients; `audit_events` append-only by policy. Minus: append-only not DB-enforced; `executor_jobs` scoped only by `requested_by`. |
| **Local execution security** (MaestroClaw) | **B−** | Injection guard is sound; HMAC approval flow is correct. Minus: allowlist breadth (`rm`/`npm`/`find`) + `shell:true` + full env + cloud-trusted jobs + AI adapters with full-auto flags. |
| **Edge orchestration robustness** | **B−** | Strong multi-provider abstraction; but fragile LLM-JSON parsing, silent degradation paths, and provider/model routing duplicated across 7+ functions. |
| **Build / execution pipeline** | **C+** | Works end-to-end (proven), but last-write-wins collisions, dispatch stalls on stale snapshots, a noisy completeness gate, and split build entrypoints. |
| **Frontend architecture** | **B−** | Typechecks clean; good session-reset isolation. Minus: 87-action / ~158-field god-context, a 126 KB component, thin a11y, manual state mirroring that can drift. |
| **Documentation & state discipline** | **B+** | `MAESTRO_STATE.md` discipline is genuinely exceptional. Minus: `ARCHITECTURE.md` has drifted badly from reality. |

---

## P0 — Address Before Wider Use

### P0-1 — Local execution allowlist is broad and runs under a real shell with the full environment
**Where:** `packages/maestroclaw/src/adapters/approved-shell.ts:7-10,69-73`, `adapters/pty-shell.ts:11-15,76-85`
**Verified myself.** The kernel analyzer (`shell-analyzer.ts`) is genuinely sound — it is applied *first* (`approved-shell.ts:35`) and blocks `(` `)` `` ` `` `>` `<` `&` newlines and unbalanced quotes, so `$()` and backtick command substitution **are** rejected (this corrects a sub-agent claim that `$()` was open). The real problem is downstream:
- The allowlist itself includes `rm`, `npm`, `find`, `git`, `cp`, `mv`, `cat` — then executes via `spawn(command, { shell: true, env: { ...process.env } })` (`approved-shell.ts:69-73`) or `powershell.exe -Command` / `bash -c` (`pty-shell.ts:76-85`).
- Consequences with no metachars needed: `rm -rf <path>` (destructive), `npm install <pkg>` / `npm run <script>` (arbitrary code via lifecycle scripts), `find . -exec <binary> ... +` (allowlist bypass — `find` is trusted, the spawned child is not parsed), and bare `$VAR`/`${VAR}` env expansion leaking the inherited environment.
- `trusted-commands.ts` (the *edge-side* allowlist) is much tighter (anchored regexes + a `UNSAFE_SHELL_PATTERN` blocking `;&|><`$%()`). The local node does **not** apply that second filter.

**Fix:** (a) Drop `rm`/`cp`/`mv` from the local allowlist or gate them behind explicit per-command approval; (b) execute without `shell: true` (pass argv directly) so shell metasemantics can't apply; (c) pass a *minimal* curated env, not `process.env`; (d) for `npm`, allowlist only specific subcommands (`npm test`, `npm run build`) the way the edge list already does; (e) consider `--ignore-scripts` for npm.

### P0-2 — Cloud jobs drive local execution with no local authenticity check
**Where:** `packages/maestroclaw/src/index.ts:74-103`, `api.ts:73-88`; AI adapters `claude-code.ts:205-233`, `copilot-cli.ts:120-140`, `gemini-cli.ts:112-137`, `codex-cli.ts:101-136`
The node polls the cloud, claims a job with `X-Executor-Token`, and feeds the job prompt straight into an adapter. The AI adapters are *more* privileged than the shell ones — they run the CLIs with full-auto / dangerous flags. So the entire local blast radius is bounded only by "is the cloud control plane (and the agent that produced this job) trustworthy?" A prompt-injected agent or a compromised account → arbitrary local action.
**Fix:** Treat the cloud as semi-trusted. Add a local policy layer the operator controls (path jail, command/adapter allowlist, and an explicit "dangerous flag" opt-in per workspace) that the node enforces *regardless* of what the job asks for. Document the threat model in `REFERENCE.md`.

---

## P1 — High-Value Robustness & Security Hardening

### P1-1 — `orchestrate` LLM-JSON parsing is fragile; no repair/retry path
**Where:** `supabase/functions/orchestrate/index.ts:339-395,583-645,784-815`
`extractJsonCandidate()` (4-strategy: direct → fence-strip → first-`{`-to-last-`}` → string-aware brace scan) still assumes a single well-formed object and can misfire on nested braces in prose, multiple JSON blobs, or truncated output. Truncation is only *detected* via provider finish reasons — there's no repair or continuation retry. This is the same family as the documented "Sonnet timeouts on artifact-heavy prompts" active blocker.
**Fix:** Add a bounded "repair" pass (ask the model to re-emit valid JSON, or run a tolerant JSON5/partial parser) and a single continuation retry on detected truncation.

### P1-2 — Silent degradation hides real failures
**Where:** `concierge/index.ts:249-317,1026-1072`; `runner.ts:584-608` (`processControls` swallows all poll errors); `incident-service.ts:21-25` ("all errors are swallowed"); `runner.ts:165-187` (`completeLoopWithRecord` swallows save failures)
Parse/model failures default to "orchestra" or partial results instead of surfacing; several catch blocks discard the error entirely. This makes production incidents invisible and is exactly how a "looks healthy but isn't" state arises.
**Fix:** Log-and-surface (structured, with request ID) at minimum; reserve silent fallback for genuinely cosmetic paths.

### P1-3 — Secret-encryption root key falls back to the service-role key
**Where:** `_shared/secrets.ts:54-71`
**Verified myself.** Crypto key = `SHA-256(MAESTRO_SECRETS_KEY ?? SUPABASE_SERVICE_ROLE_KEY)`. If `MAESTRO_SECRETS_KEY` isn't set, the encryption root *is* the service-role key — so a service-role compromise also yields plaintext BYOK keys, and rotating the service key silently breaks decryption. No versioning beyond `enc:v1:`.
**Fix:** Make `MAESTRO_SECRETS_KEY` mandatory (fail closed if absent), use HKDF rather than raw SHA-256, and add a key-version field to support rotation.

### P1-4 — GitHub synthesized execution is last-write-wins on path collisions
**Where:** `supabase/functions/github-execute/index.ts:973-979,1007-1029`
The merge applies manifest entries sequentially with an explicit "last write wins" comment, so when two agents target the same path the committed result depends on iteration order. Non-deterministic and silently lossy.
**Fix:** Detect collisions, surface them, and either require a synthesized single-author for shared paths or run a deliberate merge step.

### P1-5 — Build dispatch loop can false-trip its deadlock guard
**Where:** `src/hooks/useBuildExecution.ts:1372-1487,1186-1226`
The loop reads `tasksRef.current`, dispatches a wave, then re-evaluates progress — but status mutations land via async DB writes + Realtime, so in-flight jobs can look like "no progress" and trip the 3-wave deadlock guard. Local dispatch also marks tasks `dispatched` before backend execution, leaving transient state on failure.
**Fix:** Gate the deadlock guard on confirmed terminal states (or an in-flight counter), not on snapshot deltas.

### P1-6 — Completeness gate has both false positives and false negatives
**Where:** `src/lib/buildCompleteness.ts:46-81,184-263`
Framework is inferred from deps/files (not runtime wiring); `activeFiles.length <= 2` can label a valid-but-minimal project `scaffold_only`; import-drift only flags at >3 issues; dynamic imports and path aliases are ignored.
**Fix:** Treat the gate as advisory (warn, don't block), or tighten with alias-aware import resolution.

---

## P2 — Maintainability & Polish

- **P2-1 — God-context.** `src/context/MaestroContext.tsx` (verified: **87 action types, ~158 state fields, 524 lines**) mixes workspace/session/build/claw/iteration/UI concerns. Coherent but monolithic; every build feature widens it. **Fix:** split into domain reducers (`useReducer` composition or context slices). *Strength preserved:* session-switch reset (`:247-285`) is a good isolation measure — keep it.
- **P2-2 — Oversized components.** `BuildWorkspace.tsx` is **126 KB**; `PreBuildPanel.tsx` 56 KB does scanning + lane assignment + backend selection + persistence + navigation in one file. **Fix:** extract hooks/subcomponents; these are the files most likely to harbor latent bugs.
- **P2-3 — Provider/model routing duplicated 7×.** Per-provider branches and hardcoded token caps recur across `orchestrate`, `design`, `deliberate`, `concierge`, `intake`, `architect`, `synthesize`. **Fix:** one shared `callProvider({provider, model, maxTokens})` module.
- **P2-4 — Adapter temp-file leakage.** `copilot-cli.ts:71-84` and `codex-cli.ts:66-99` write the full prompt to a file in the workspace with best-effort-only cleanup — leaves prompt text on crash. **Fix:** use OS temp dir + `finally` cleanup.
- **P2-5 — Thin accessibility.** `ClawMode.tsx` has custom mobile layout logic but little visible ARIA; keyboard/screen-reader affordance looks weak in the large reveal components. **Fix:** an a11y pass on the drawers/cards (focus management, roles, `aria-*`).
- **P2-6 — State mirroring drift.** `PreBuildPanel.tsx:116-123,223-280` and `BuildWorkspace.tsx:151-179` mirror `state.activeSession`/backend flags into local state and write back manually — classic drift source. **Fix:** single source of truth via context/selectors.
- **P2-7 — `executor_jobs` RLS scoped only by `requested_by`.** (`20260420190000_executor_jobs_server_gate.sql:4-9`) Functionally OK today, but it's the weakest core-table policy. **Fix:** add session/executor ownership constraints if jobs ever become shareable.
- **P2-8 — `audit_events` append-only by policy, not by DB.** (`20260331044524_create_maestro_schema.sql:402-427`) No UPDATE/DELETE policy = clients can't mutate (good), but a privileged/service path could. **Fix:** a `BEFORE UPDATE/DELETE` trigger that raises, for true immutability.
- **P2-9 — Naive arg splitting in iteration verify.** `runner.ts:535-548` uses `verificationCommand.split(/\s+/)` — quoted args break. **Fix:** reuse the kernel's `splitArgs`.
- **P2-10 — No mid-run agent abort.** `runner.ts:565-581` can't cancel an adapter mid-call; abort only surfaces after return. Acceptable, but document it.

---

## What's Genuinely Strong (don't regress these)

- **Auth done right.** `_shared/auth.ts:138-196` — in-function JWT verification via `getClaims`, server-side rate limiting through an RPC (`consume_edge_rate_limit`), separated admin/user clients, structured 401/429/500 with request IDs, and **no token logging**.
- **Secrets at rest.** `_shared/secrets.ts` — AES-GCM, fresh random 12-byte IV per write, AAD bound to `userId:provider` (anti-confused-deputy), versioned prefix, and transparent lazy migration of legacy plaintext rows.
- **RLS lockdowns are real, not aspirational.** `encrypted_secrets` has **all** client policies dropped (`20260420193000_encrypted_secrets_lockdown.sql`) → deny-all to the browser, service-role only. `audit_events` client INSERT dropped (`20260420191000`) → append-only, read-own. No world-open table exists among the core set.
- **HMAC approval tokens** (`_shared/approval-tokens.ts`) — HMAC-SHA256, payload+sig, 5-min TTL, **never persisted**, verify-then-expiry ordering. Correct.
- **Shell kernel** (`shell-analyzer.ts`) — quote/escape-aware pipeline segmentation, comment stripping, platform-specific metachar sets. The analysis layer itself is solid (the risk is the allowlist it guards, see P0-1).
- **GitHub execution guardrails** — scope enforcement, collision filtering, backup-branch snapshots, empty-repo bootstrap, and a truncation guard that rejects `// ... existing code` stubs.
- **State-doc discipline.** `MAESTRO_STATE.md` with dated, verification-stamped entries is better than most production teams maintain.

---

## Missed Opportunities

1. **Make the local node a first-class trust boundary.** Right now it inherits the cloud's trust. A small, operator-owned policy file (path jail + command/flag allowlist + "dangerous opt-in") would turn MaestroClaw from "powerful but scary" into a genuine selling point ("your machine, your rules").
2. **Unify provider routing into one module** (P2-3). This single refactor would also let you centralize the JSON-repair logic (P1-1) and token-cap config — paying down three findings at once.
3. **Determinism layer for synthesized builds.** A real merge/conflict step (P1-4) would unlock confident multi-agent writes to overlapping files — currently the system quietly avoids the hard part.
4. **Promote the completeness gate into a "build report."** Instead of a pass/fail that mislabels minimal projects, surface a structured readiness report (framework detected, entrypoints, unresolved imports). Higher trust, fewer false blocks.
5. **Observability.** Given how much silently degrades (P1-2), a lightweight structured-event sink (you already have `audit_events` and `executor_job_events`) surfaced in the Trust Rail would make "looks healthy but isn't" states visible.
6. **Doc consolidation.** `ARCHITECTURE.md` claims 6 edge functions / 13 tables / a GitHub *OAuth App*; reality is ~20 functions / 21+ tables / a GitHub *App*. It's actively misleading now — fold the still-true bits into `REFERENCE.md` and archive it, or stamp it `superseded`.
7. **Drop legacy `agent_skills`/`flags`.** Carrying dead tables/state (acknowledged in the docs) is a small but ongoing cognitive tax.

---

## Verification Appendix

| Claim | How I verified | Result |
|---|---|---|
| Frontend typechecks | `npm install` + `npm run typecheck` (root) | ✅ exit 0, clean |
| Auth verifies JWT + rate limits | Read `_shared/auth.ts` end-to-end | ✅ confirmed |
| Secrets use AES-GCM + AAD | Read `_shared/secrets.ts` | ✅ confirmed; ⚠️ service-key fallback (P1-3) |
| `encrypted_secrets` not client-readable | Read lockdown migration | ✅ all client policies dropped |
| `audit_events` append-only | Read write-lockdown migration | ✅ by policy (⚠️ not DB-enforced) |
| Shell guard blocks `$()`/backticks | Read `shell-analyzer.ts` + both shell adapters | ✅ blocked (corrects sub-agent claim); ⚠️ allowlist breadth is the real risk (P0-1) |
| Only one `USING(true)` policy | grep across 50 migrations | ✅ `personas` SELECT-only reference data — benign |
| God-context scale | Counted actions/fields in `MaestroContext.tsx` | ✅ 87 actions / ~158 fields / 524 lines |

*Caveat:* This snapshot is an extracted copy with no `.git` (confirmed by the owner — the GitHub repo simply isn't linked here), so commit-level history claims in the state doc were not re-verified against git. Edge functions and migrations were assessed as source, not against the live deployment.

---

*Prepared by Claude Opus 4.8 for the Conductor. Ready to discuss your pain points — I've deliberately formed an independent view first.*
