# LOCAL_FIRST_SPEC.md

*Local-first Maestro: run the full experience on the Conductor's machine — GUI, orchestration, and builds — with Supabase/GitHub as opt-in externals for projects that leave the house.*

**Author:** Claude Fable 5 (Claude Code), 2026-07-06 session
**Status:** Approved direction (Conductor, in-session 2026-07-06). Phases L1–L2 are Sonnet-executable from this spec; L3–L4 need Fable-authored contracts first (marked below).
**Origin:** Conductor's workflow pain — 8 PowerShell tabs, hand-carried handoffs between models on one project, manual blind-spot consults. Maestro's foundation covers all of it; what's missing is the ability to *stand inside the product locally*.

---

## 0. The insight this spec is built on

The frontend is a Vite SPA — it already runs locally. The only cloud binding is Supabase (auth, tables-as-job-bus, edge functions). Supabase ships its full stack as local Docker containers: `supabase start` serves Postgres + Auth + Realtime + the repo's own `supabase/functions/` on localhost. MaestroClaw reads its URL from env. **Local Maestro is a bring-up and small patches, not a rebuild.**

Cloud Supabase (`hhlnadxbrdwxcxwfbvwh`) remains the remote deployment (Claw from anywhere). GitHub is the transfer medium between worlds. **No live DB sync between local and cloud — ever, in this spec.** Two workspaces is the model.

---

## L1 — Local stack bring-up *(Sonnet-executable now)*

**Goal:** `localhost:5173` + local Supabase + MaestroClaw polling localhost. A Claw build runs against a real folder with zero internet (cloud LLM council seats excepted — those are BYOK by nature).

**Tasks:**
1. `supabase start` (Docker Desktop required — it is installed on the main machine; note prior WDAC weirdness on this box, see MAESTRO_STATE 2026-06-26). Record container versions in the runbook.
2. `supabase db reset` locally → all 52 migrations apply. Verify agent seed migrations produce the 5×3 roster + 4 Claw agents; if seeds are workspace-triggered rather than migration-triggered, document the first-signup flow instead.
3. Env split: `.env.local` with `VITE_SUPABASE_URL=http://127.0.0.1:54321` + local anon key (from `supabase status`). NEVER commit local keys even though they are default/public-ish; keep the pattern consistent.
4. Edge functions served locally (`supabase functions serve` or the bundled runtime from `supabase start`). Gotchas to resolve and document:
   - `_shared/secrets.ts` encryption root key env (`supabase secrets set` local equivalent / `functions/.env`),
   - `config.toml` `verify_jwt = false` functions must still see the user JWT via `supabase.functions.invoke` against the local URL,
   - Realtime channels (executor job events, Unified UX Phase 10) work against local Realtime.
5. MaestroClaw `.env` variant pointing at localhost; register executor; verify heartbeat + capability advertisement in the local Executor panel.
6. **Exit test (the whole point):** from the local GUI, run a Claw `build_session` against a scratch project folder, watch live progress in the thread card, artifacts written to disk. Then run the *deliberate path-collision* variant: two lanes writing one file → reconcile resolves deterministically → "Overridden work" panel + `manifest_reconcile` audit row appear. This doubles as MAESTRO_STATE Next-Steps item #10 (the long-stuck E2E smoke).
7. Deliverable: `docs/reference/LOCAL_RUNBOOK.md` — every command, every gotcha hit, teardown/restart (`supabase stop`), and how to switch a checkout between local and cloud envs.

**Escalate to Fable if:** WDAC blocks Docker/Deno binaries; auth model needs code changes (not just config) to work locally; Realtime requires schema changes.

---

## L2 — Local concierge/router (Ollama provider) *(Sonnet wires; contract below is fixed)*

**Goal:** a local model (Conductor's 3060 12GB → Qwen3-14B Q4 or an 8B for latency; Ollama, native Windows) selectable as the concierge/triage model in the existing UI.

**Provider contract (Fable-authored — do not improvise beyond this):**
- New provider group `local` in `orchestrate` (and `concierge-triage` if it has its own dispatch), speaking **OpenAI chat-completions dialect** against a configurable base URL. Default `http://127.0.0.1:11434/v1` (Ollama).
- Base URL lives in the **vault** like other provider config (per-user), NOT hardcoded; `hasKey()` returns true when a base URL is set (no API key required — mirror the maestroclaw pattern in `VaultDrawer`/`hasKey`).
- **Model identity for Rate:** responses must record `resolved model + harness` (e.g. `qwen3:14b-q4 @ ollama`) — per the 2026-07-01 wrapper lesson, reputation keys on resolved model, never on "local".
- **Fallback semantics:** timeout 30s; on connection-refused or timeout, concierge falls back to the user's configured cloud concierge model and appends a one-line notice to the thread ("local router offline — used <model>"). Never silently swap.
- Edge-function reachability note: functions run in Docker → `host.docker.internal:11434`, browser direct calls (if any) → `127.0.0.1`. Resolve per call site; document in the runbook.

**Exit test:** concierge triage + quick-answers run on the local model with cloud disabled; pulling the Ollama process mid-session produces the fallback notice, not a hang.

---

## L3 — Headless conductor: `maestroclaw run BUILDPLAN.md` *(✅ v1 IMPLEMENTED 2026-07-06 — Fable, same session)*

**Goal:** terminal-first multi-lane builds with no GUI and no Supabase. **Shipped as `packages/maestroclaw/src/local/`** (`plan-file.ts` contract+parser, `fs-snapshot.ts` isolation+diff, `run-local.ts` runner) with an argv branch in `index.ts` — `maestroclaw run <plan> [--workspace] [--max-concurrent] [--adapter-override] [--dry-run]`.

**Contracts as implemented (the format IS the spec — see `plan-file.ts` header):**
1. `BUILDPLAN.md` = markdown with exactly one ```json fence: `{ project, shared_context?, lanes: [{ name, adapter, prompt, scope_paths?, deps?, priority?, timeout_minutes? }] }`. Prose outside the fence is commentary, ignored by the runner. Unknown deps and cycles are **rejected loudly at parse time** (hand-authored files should fail on typos — deliberate divergence from the web dispatcher's tolerant semantics).
2. **Lanes are the unit, not per-file tasks** — a lane is one agent session with a scope (the headless mirror of a Pre-Build builder lane, and of the Conductor's 8-tab workflow).
3. Isolation decision: **seeded copy per lane** (works on non-repos/greenfield; excludes .git/node_modules/dist/graphify-out/.maestro-runs), writes collected by content diff, scope-enforced (prefix match), cross-lane collisions resolved by `conductor/reconcile` (same review-hardened ranking as the web), winners written back to the workspace. Failed lanes fail-fast their dependents (`blocked`). Report → stdout + `.maestro-runs/<ts>/report.json`. Worktree-per-lane = later `--seed` mode.

**Verified:** 13 new node:test cases (parser + injected-adapter E2E: wave ordering, parallel isolation proof, deliberate P0-beats-P2 collision, out-of-scope drop, fail-fast blocking) — 47/47 package total; live smoke `maestroclaw run` with shell_stub lanes (dry-run wave print + real dispatch, exit 0).

**Still open for L3.1 (Sonnet-able):** `--report` flag mirroring job rows to Supabase (web UI as viewer — the Bridge), glob scope support, `--seed git-worktree` mode, Ralph-style per-lane retry, real-CLI exit test (3–5 live adapters on a scratch repo — needs the Conductor's machine + subscriptions).

---

## L4 — Routing upgrades + Claw UX *(mixed ownership; aligns with six-week weeks 3–6)*

- **Handoff automation:** builder emits `agent_query` (blocked/question) → concierge routes to council or a designated consultant → answer injected into the builder's next iteration step. Kills the hand-carried back-and-forth. Fable designs the protocol/state machine; Sonnet implements.
- **Rate v1 thin** lands here per the 2026-07-01 six-week decision (grades schema keyed resolved-model+harness, post-round blind grading, builder-lane scoring first consumer). Fable owns scoring math (decay, grader-agreement weighting, cold-start priors).
- **Claw UX debt:** review-surface reconcile (carousel/drawers × thread runway), premium card polish. Sonnet with design skills.
- Local router gets Rate signal: route free/local first, escalate on low confidence or grader disagreement.

---

## Sequencing & dependencies

L1 → L2 (needs local stack) ; L1 → L3 exit-test overlap (both satisfy smoke #10 — L1's GUI variant counts first) ; L4 rides the six-week weeks 3–6 slot. Spare-machine setup (always-on executor + Ollama host) is deliberately NOT a phase gate — `MULTI_EXECUTOR_ROUTING_SPEC` covers it when the hardware exists.

## Out of scope (intentional)

Electron/Tauri desktop shell; live local↔cloud DB sync; local models as builders (12GB VRAM ≠ trustworthy builder; council/router seats only); replacing BYOK for cloud council seats.

## Verification gates

- L1: exit test #6 recorded in MAESTRO_STATE with date; runbook exists and a fresh clone can follow it.
- L2: fallback test passes; model identity string verified in a stored response row.
- L3: grading-lab review gate (the C-06 pattern) before merge.
- L4: per-item, defined at spec time in the Rate spec.
