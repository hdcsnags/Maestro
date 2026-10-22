# fable-conductor — Claude Code (claude-fable-5-1) — 2026-09-22-vision-council

*Conductor's seat. NOT blind: I wrote the brief, read AGENTS.md, MAESTRO_STATE.md, MAESTRO_PHILOSOPHY.md, REFERENCE.md, the vision doc, MAESTRO-2026-FULL-AUDIT.md §A,G–O,S,W–Z, MAESTROCLAW-ATTACK-PLAN.md §1, concierge-triage/index.ts, useOrchestration.ts:440–485, useThreads.ts:100–235, trustHints.ts, orchestrate/index.ts (provider fetch sites), adapters/types.ts, grading-lab/PROTOCOL.md, MULTI_EXECUTOR_ROUTING_SPEC.md, MAESTRO_INTELLIGENCE_LAYER_SPEC.md, and the migrations for concierge_decisions. Written BEFORE reading any other seat's output. Web research 2026-09-22 is cited inline and marked (web).*

## 1. The vision has a predecessor it does not cite

`docs/audits/MAESTRO-2026-FULL-AUDIT.md` (2026-08-17) already ruled on most of this ground:

| Full-audit ruling (Aug 17) | Vision doc (Sep 21) | Status |
|---|---|---|
| Z1: product = owner-governed heterogeneous council/evaluation plane, **coding first** | any task, any industry, local-first | **Conflict** — needs an owner ruling, not a quiet overwrite |
| Y-LATER 6: "Local models for low-risk routing/grading" — LATER | Phase 5 Local Intelligence; Ollama-class adapters | Vision pulls a LATER item forward |
| Y-LATER 1: "Headless/local-first on same core" — LATER, after Core extraction (Y-NEXT 1) | router "behind Fable", no statement of where it runs | Vision skips the prerequisite |
| W-8 DELETE live local↔cloud DB sync; W-10 DELETE second local orchestration engine | silent | Constrains how local-first can be built |
| J/S: ADOPT Agent Skills + MCP now; A2A watch | proposes bespoke `Capability` and `Harness` schemas | Vision would re-invent what the audit said to adopt |
| M-1: versioned capability negotiation **with attestation**; H: execution identity (provider, requested/resolved model, harness/version, profile, location) | §12 reputation tuple, §14 harness registry | Same idea, audit's is more precise and adds attestation |
| Y-NOW 1: trust spine FIRST (paths, one-time approvals, fencing, cancellation) | Rule 3 "intelligence ≠ authority" | Vision states the rule; the audit says the spine is unfinished. `20260817000000_approval_token_replay_guard.sql` is still *unverified applied* (STATE.md Read-This-First) |

**Verdict:** the vision's *principle* (minimum sufficient intelligence) is compatible with the audit's *product identity* (a governance/evidence plane above heterogeneous agents). The vision's *deployment targets* are a new product line the audit deliberately deferred. Michael must say which sequencing stands. My recommendation: keep the audit's NOW list (trust spine, execution identity), and let the vision re-order NEXT/LATER, not NOW.

## 2. What already exists (graded)

| Concept | Where | Grade |
|---|---|---|
| Deterministic pre-router | `src/hooks/useThreads.ts` `tryParseLocalExecutionIntent` + `src/lib/trustHints.ts` `TRUSTED_COMMANDS` — shell-only, client-only, UX hint not security | **stub** |
| LLM triage whose rules are deterministic in shape | `supabase/functions/concierge-triage/index.ts` `TRIAGE_SYSTEM_PROMPT` — "starts with What/How/Why", "no action verbs", hard overrides on `round_count>0`, phase, `has_build_spec`, confidence<0.75. Every rule but "needs perspectives" is regex/boolean. **Correction after reading Astra (verified at lines 150–153 vs 193):** the boolean hard overrides already short-circuit in code before the Anthropic fetch; Haiku evaluates only the lexical/semantic rules AND writes the `direct_answer`. So substituting the classifier saves one call per *orchestra*-routed prompt; a `simple_ask` still needs one model call to answer. Caller at `useOrchestration.ts:444` applies the ≥0.75 gate client-side | **first substitution target, smaller win than I first wrote** |
| Capability advertising (executors) | `docs/specs/active/MULTI_EXECUTOR_ROUTING_SPEC.md`, `executors.capabilities` jsonb, `resolveBackend()` in `useBuildExecution.ts` | **partial** (executors only, not models/tools) |
| T0 dependency resolution | `packages/maestroclaw/src/conductor/plan.ts`, `reconcile.ts`, mirror `src/lib/conductor.ts` | **full** |
| Model+harness reputation | `grading-lab/PROTOCOL.md` + 07-01 wrapper lesson + 09-06 grounding finding; no table, no consumer | **partial (data, no schema)** |
| Telemetry | `concierge_decisions` (phase-level, not per-route), `audit_events`, `build_prompt_logs`; no `route_decisions` | **stub** |
| Local inference | nothing in `src/`, `supabase/`, or `packages/maestroclaw/src`. `orchestrate/index.ts:799` and `:852` hardcode `api.openai.com` and `openrouter.ai` chat-completions URLs — same wire format Ollama and Foundry Local speak | **absent, but ~1 day away** |
| Prompt provenance | structural only: blind R1, anonymised grading, the 09-05 STATE.md-scrub rule in `eliana-ux-council-study.ts` header | **partial (structural, no tags)** |
| Function-extraction loop | none; but `decision-record.ts` `detectProblemType()` is keyword-based already | **absent** |
| Observable routing GUI | `StatusChip`, `BuildRunwayCard` "Overridden work"; no route-reason surface | **stub** |
| Top-k council | `AGENT_DEFAULTS` slot-0-only default; broadcast-to-all otherwise | **absent** |

## 3. What Michael is missing

**3.1 The router is commoditized; the ledger is not.** Cost-aware cascading and routing is a crowded field: FrugalGPT (2023), RouteLLM (2024), xRouter, SeqRoute, "Cluster, Route, Escalate", vLLM Semantic Router, OpenRouter auto, Not Diamond, Martian (web). Home Assistant ships the household case today: "prefer handling commands locally" runs sentence-matched intents first and falls through to an LLM only on miss, and its own users report turning the LLM *off* for most commands because intents are 100% predictable and locks/garage doors must never be hallucinated (web). None of these has what Maestro has data for: a longitudinal, owner-governed ledger keyed on **resolved model + harness + profile + task class**, with blind peer grades, a human anchor, and a grounding attestation. §12 and §19 of the vision know this but rank it Workstream E. It should be the spine; the router is a *consumer* of it.

**3.2 The most predictive routing feature you've found is not in the router-inputs list.** The 09-06 VOTD study: grounding, not generation, predicted quality (Astra/Sol ran the corpus: 69%/52% flagged, every check held; Fable denied the corpus and said so; Gemini 3.6 skipped verification silently). §7 lists `historical_reputation` and `confidence` but not **grounding attestation** (did the seat run the verifier? did it disclose?). That field is cheaper than any learned router and you already have five weeks of runs in `docs/audits/eliana-readonly-poc/` and `grading-lab/` that could populate it. Build the ledger schema from *that* data, not from a speculative telemetry list.

**3.3 Small models must not call tools; code must.** 2026 measurements: 7B general models malformed-call rate high enough that single-step tool tasks stall 5–10% of runs; the working guidance is "3B for triage classification, 27B+ for anything that calls a tool" (web, unverified individually). So the T1/T2 boundary in the vision is drawn wrong. The cheap tier's only job is to emit a **typed intent**; deterministic code validates arguments against a schema and executes. That is exactly Home Assistant's design and it is why it is safe. Reframe: the router does not pick "which model calls the tool"; it decides whether a model is in the loop at all and, if so, only as a classifier.

**3.4 The non-developer targets are connector + compliance problems, and Michael already has the market research job.** Open Dental exposes `GET /recalls/List` with `DueDate`, `NumRemind`, `LastRemind` (web): "who hasn't been in 9 months" is one HTTP call and every practice-management suite already does recall. A school board cannot adopt a router; it adopts a system that passes a privacy impact assessment, keeps an append-only audit trail, states data residency, and has a vendor who accepts contract-level accountability (Ontario Bill 194 / Bill 97 amendments to FIPPA/MFIPPA phase in July 2026 → Jan 2027 and add PIA and breach-reporting duties for institutions — web, unverified in detail; TDSB/VSB approve only "walled-garden" Copilot with Enterprise Data Protection — web). Maestro's `audit_events` append-only table, one-time approval tokens, execution identity and reproducibility envelope are **compliance artifacts**. The idea Michael would not reach alone: *the institutional buyer buys evidence and control, not intelligence.* "Why did it route here, what did it cost, what left the building" is the product for that buyer. Interview DSBN's privacy officer about what must be true before any AI touches student data; that list is the spec. Do not test on student data.

**3.5 Windows-first local inference is a lever only Michael has.** Foundry Local (Microsoft): OpenAI-compatible API incl. Responses format, ONNX Runtime, auto-selects NPU/GPU/CPU, ~20 MB, part of Windows AI Foundry (web). School boards are Microsoft shops with Intune-managed fleets; "IT deploys a signed Microsoft runtime" is a different procurement conversation from "install Ollama". Ollama for dev/home; Foundry Local for institution; **same wire format**, so one `base_url`-per-provider change in `orchestrate` covers both.

**3.6 The flywheel starves if Auto routes everything down.** PHILOSOPHY.md: "the grading loop is the engine." A router that sends 90% of traffic to T0–T2 produces no grades. Every cascade paper handles this with an exploration budget; the vision has none. Rule to add: a fixed sample of routed-down tasks is also run one tier up and graded, forever.

**3.7 Standards over schemas.** Do not invent `Capability` / `Harness` JSON. MCP tool descriptors are the capability advertisement; A2A Agent Cards (v1.0 April 2026, 150+ orgs — web) are the agent advertisement; Agent Skills SKILL.md (adopted by Codex, Copilot, Gemini CLI, Cursor, ~40 products by June 2026 — web) is the skill format. The audit already said ADOPT/ADOPT/WATCH. Maestro's schema should be the **ledger row**, which nobody standardises: identity + route + grade + attestation.

## 4. Fashionable complexity to reject

- Seven tiers. Four classes suffice for a year: **code**, **classify** (tiny model, typed output only), **generate** (any LLM, chosen by ledger), **escalate** (council / human). Tiers are what the ledger learns, not what you design.
- The utility formula (§7). Policy table first; the doc says so itself.
- Claim tags `verified/asserted/inferred/disputed` (§13). Two bits: `origin: human|model` plus structural blindness (already practiced). Tags on every claim is a taxonomy nobody maintains.
- Compute Governor / Cognitive Router names. It is a **Router** reading a **Ledger** under a **Policy**. Name the assistant, not the plumbing.
- "Fable as interface" (§9–10, Rule 12). The stable identity above models cannot carry a vendor model's name; the doc's own Rule 12 forbids it.
- Workstream J as automation. The first extraction is manual and obvious (§2 row 2). Automate after the third manual one.

## 5. Security

Local ≠ safe (vision Rule 3 is right). Necessary but not sufficient. Missing: **data classification on every capability and every payload** (public / internal / PII / PHI), with a router invariant *PHI-tagged data never reaches location=cloud*; **household money movement = T7 always** (approval + one-time token + audit) and out of scope for v1; the unfinished trust spine (nonce ledger unverified applied, native sandbox flags per attack plan Sprint 1) closed before any unattended non-dev workload. Full audit Z2 stands: unattended = verified sandbox, fail closed.

## 6. Minimal architecture

```
 [Assistant identity — not "Fable"]        browser · mobile · CLI
                 |
 [Maestro Core — pure TS, transport-neutral]   (audit Y-NEXT-1; no second engine, no live sync)
    ├─ Intent: deterministic recognizers → typed Intent | null
    ├─ Router: policy table (data class × action class × capability) → capability + reason
    ├─ Ledger: route_decisions · grades · execution_identity · grounding_attestation
    └─ Policy: approvals · blast radius · T7 gates
                 |
 [Capabilities]  MCP tools (Open Dental, M365 Graph, weather…) · local inference (Ollama / Foundry Local, OpenAI wire)
                 · cloud providers (existing orchestrate) · council (existing) · human
                 |
 [Runs on]  local node (MaestroClaw) for local-first · Supabase edge for hosted · SAME Core in both
```

## 7. First three steps (≤1 week each, flagged, no regression)

1. **Shadow deterministic triage.** Port `TRIAGE_SYSTEM_PROMPT`'s rules to `src/lib/triageRules.ts`; at `useOrchestration.ts:444` compute the rule verdict, still call Haiku, write both to new `route_decisions` (session_id, prompt_hash, rule_route, llm_route, agree, latency_ms, est_cost). Tests before ship: fixture table from the prompt's own examples + 50 real prompts pulled from `thread_messages`; property test "hard overrides always win". Metric: ≥95% agreement over two weeks, then flip the flag; count Haiku calls avoided. **This is Workstream J's first extraction and Router v0 in one.**
2. **OpenAI-compatible `base_url` per provider → local inference.** Factor `orchestrate/index.ts:799/852` into `callOpenAICompatible(baseUrl, …)`; add provider_group `local` with `base_url`. Ollama first, Foundry Local second (same code). Tests: contract test against a mock server; truncation/finish_reason parity. Metric: a Qwen3 / Gemma 4 seat completes the Grading Lab Q&A wedge (audit X-4) and its grades land in the ledger.
3. **Execution identity + grounding attestation on every result.** One `execution_identity` jsonb on `responses`, `executor_jobs`, grades: provider, requested/resolved model, harness+version, profile, location, `grounding: ran|declined|silent|n/a`. Kimi emits no resolved model → record `unknown` (known gap). Metric: the 09-06 grounding split reproducible with one SQL query.

Then decide top-k / local specialists / GUI from the ledger, not from this document.

## 8. What Michael is wrong about

"Any task, any industry" is the wrong unit. What generalises is the evidence-and-policy plane and the connector pattern; the product does not. Pick two proving grounds you can actually test: **Maestro's own routing** (step 1) and **your household** (weather / bills-due read-only / vacation planning; no money movement). Use the school board as a **design partner for the compliance spec**, never as a test deployment. The dentist office is a connector you don't have; leave it as the example, not the target.

## Router name

**Router.** The thing worth naming is the ledger: **the Baton** — "which intelligence deserves the baton" is already the doc's last line.
