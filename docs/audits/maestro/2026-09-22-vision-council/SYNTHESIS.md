# Vision Council — Synthesis (2026-09-22)

*Subject: `MAESTRO_INTELLIGENCE_ORCHESTRATION_VISION (1).md` (Sol, from Michael's dictation, 2026-09-21).*
*Conductor: Claude Code (claude-fable-5-1). Brief: `prompt.md`. Michael's instruction: "don't be bound by my vision, show me what I am also missing, do research."*

## 1. Run record

| Seat | Adapter / model | Result | Read-only | Notes |
|---|---|---|---|---|
| astra | codex_cli / gpt-6-astra | **success**, 200 s, 22 KB, verdict parsed | clean | Self-identified as GPT-6; declined to infer the slug from the workspace name (correct) |
| gemini | agy_cli / default (self-reports Gemini 3.8 Flash High) | **success**, 128 s, 46 KB, verdict parsed | clean | Run 1 with `CLAW_AGY_MODEL=gemini-3.8-flash-high` returned agy `status: SUCCESS` with an **empty response** in 17 s; discarded, rerun with the adapter default |
| kimi | kimi_cli / kimi-code/k3 | **failed**, 11 s | clean | `403 access_terminated_error` — monthly quota; third study in a row (09-05, 09-06, 09-22). Seat empty. |
| fable-conductor | Claude Code / claude-fable-5-1 | written **before** reading any seat | n/a | NOT blind: wrote the brief. One correction applied after Astra, marked in place. |

Both external seats read the clone and cited paths. Every checkable code claim was checked (§4).

## 2. Three-way convergence (independent seats, one brief)

Reached by three different models; Fable's written before reading the others. Treat as the council's strongest signal.

| # | Finding | Astra | Gemini | Fable |
|---|---|---|---|---|
| C1 | **Routing is commoditized; not the moat.** FrugalGPT, RouteLLM, Martian, Aurelio Semantic Router, Home Assistant's local-intent-first. | ✓ | ✓ | ✓ |
| C2 | **Dentist / school board / household are connector + semantics + policy problems, not routing problems.** "9 months" needs definitions; PMS connectors (Open Dental `GET /recalls/List`) and audit are the product. | ✓ | ✓ | ✓ |
| C3 | **Reject the T0–T7 ladder as architecture.** Dimensions intersect (a tool can be riskier than frontier advice). | ✓ | ✓ | ✓ |
| C4 | **Reject the utility formula** until quality/latency/cost are measurable; privacy and authority are hard constraints. | ✓ | ✓ | ✓ |
| C5 | **Reject clause-level provenance tags.** Keep structural blindness + payload-level origin/evidence. | ✓ | ✓ | ✓ |
| C6 | **Minimum-sufficient routing starves the grading flywheel**; reserve a bounded exploration budget. Gemini names the mechanism: **asynchronous Shadow Council**, 5–10% of completed tasks re-run and graded in the background at zero user latency. | ✓ | ✓ (mechanism) | ✓ |
| C7 | **Adopt MCP / A2A Agent Cards / Agent Skills at boundaries; do not invent `Capability`/`Harness` JSON.** Advertised capability ≠ authority. Gemini adds: strike vision Q16 — models cannot self-assess; capability is assigned by grading, not advertised. | ✓ | ✓ | ✓ |
| C8 | **Security boundary = broker outside the model process** owning credentials and authorizing typed, parameter-validated operations. Gemini: "schema-first inversion" — models slot-fill parameters, never generate logic against production data. Fable: small models must not call tools; code does. Astra: typed read-only op as the template. | ✓ | ✓ | ✓ |
| C9 | **"Any task, any industry" is the wrong unit.** One workflow, proven. | ✓ | ✓ | ✓ |
| C10 | **Grounding attestation beats model confidence as the escalation signal.** 09-06 evidence: models are overconfident and fail silently. Astra: "verification-first selection"; Gemini: "grounding-gated cascade"; Fable: `grounding: ran\|declined\|silent` as a ledger field. | ✓ | ✓ | ✓ |
| C11 | **`concierge-triage` conflates classification with fulfilment.** Hard overrides already short-circuit in code (:150–153 before the fetch at :193); Haiku evaluates lexical rules AND writes `direct_answer`. Separating them makes routing a zero-token function; answering still costs one call. | ✓ | ✓ | ✓ (after correction) |
| C12 | **Same first three steps**, different order: (a) deterministic triage extracted + shadowed, (b) OpenAI-compatible `base_url` → local inference provider, (c) route receipt / execution ledger. | receipts→extract→typed op | classifier→local→ledger | ledger→classifier→local |
| C13 | Grades of what exists: local HTTP inference **absent**, reputation **stub**, top-k **absent**, function-extraction **absent**, telemetry **partial**, pre-router **partial**. | ✓ | ✓ | ✓ |
| C14 | Router name: **Capability Router** (2 of 3); nobody wants a milestone spent on it. | Capability Router | Capability Router | Router; name the ledger |

## 3. Divergences and the conductor's call

| # | Question | Astra | Gemini | Fable | Call |
|---|---|---|---|---|---|
| D1 | **What is the new race?** | Private, verifiable business workflows whose cost and human intervention decline with operating evidence. Sell **workflow contracts**; the council becomes a **workflow qualification service** (expensive at install/change/incident, cheap afterward). | "The local, private operating system for verified domain workflows and grounded code delivery." Value accrues to verified connectors, grounding engines, deterministic state orchestration. | The institutional buyer buys **evidence and control**, not intelligence; the **ledger** (resolved model + harness + profile + task class + grounding) is the spine, the router a consumer. | **One race, three lenses.** Unit of sale = a qualified workflow (Astra). What makes "qualified" a true word = the ledger (Fable). Where it runs = local node with verified connectors (Gemini). This also dissolves the council-vs-escalation fight: the council *qualifies*, the runtime *executes*. |
| D2 | **Where does the router physically run?** | Current wins for first release; `localhost` in an edge function can't reach Michael's PC; offline is a separate deployment mode. | **Split**: client/local node evaluates deterministic and private intents first; cloud edge orchestrates cloud seats. | Current wins; Aug-17 audit sequenced Core extraction NEXT, local-first LATER, no second engine, no live sync. | **Gemini's split is what step 2 already does** (shell fast-path is client-side today). So: deterministic pre-router in the client/local node; cloud orchestrates cloud seats; nothing new runs in Supabase. Full local-first waits for Core extraction per the audit. |
| D3 | **Council: product or escalation?** | Vision wins — council for qualification and consequential uncertainty. | **Current wins** — gating on model-reported uncertainty lets an overconfident cheap model never escalate. | Council qualifies; runtime executes. | **Both right; the disagreement is about the gate.** Council is first-class for blast radius and irreducible ambiguity (Gemini Q11), and for qualifying workflows (Astra). The gate is **grounding attestation + blast radius**, never model self-confidence (C10). |
| D4 | **Third step** | Typed read-only op (`workspace.list_files` via scoped FS, never shell text). | Ledger + "Saved $X" in StatusChip. | Local inference provider for grading only. | Order below (§6). Astra's caution stands: **no "cost avoided" counter without an observed comparison**; Gemini's "≥40% reduction" is a prediction to be measured, not a target to be claimed. |
| D5 | **PHILOSOPHY Part 2 (model personalities)** | Conflicts with wrapper + grounding evidence; measured configuration wins. | Not raised. | Not raised. | **Astra right.** Re-label Part 2 as hypothesis; the ledger tests it. |
| D6 | **Jurisdiction** | US (HIPAA BAA, FERPA school-official). | US (HIPAA §164.312, FERPA). | Ontario: MFIPPA/FIPPA amendments (Bill 194 / Bill 97) phasing Jul 2026 → Jan 2027 incl. PIA + breach duties; PHIPA for health data (web, unverified in detail). | **Both external seats assumed the wrong country.** Principle survives (a local appliance does not create the legal basis). Michael's privacy officer is the source for the actual spec. |
| D7 | **Windows-first local inference** | — | Ollama / vLLM / LM Studio. | Foundry Local (Microsoft; OpenAI-compatible; ONNX; NPU/GPU/CPU; Intune-deployable) for institutions; Ollama for home/dev; same wire. | Unopposed; probe on this machine before relying on it. |
| D8 | **Local inference grade** | absent | partial (CLI adapters run locally; HTTP inference absent) | absent (~1 day away) | Labelling difference only; facts agree. |
| D9 | **Q5 harness dimensions** | — | "As proven in 07-01: tool availability, context framing, grounding attestations." | — | **Overclaim.** 07-01 showed one wrapper divergence; it did not isolate dimensions. Record as hypothesis. |

## 4. Verification of seat claims (conductor)

| Claim | Seat | Checked against | Result |
|---|---|---|---|
| Triage hard overrides execute before any model call | Astra, Gemini | `concierge-triage/index.ts` :150–153 vs :193 | **True** |
| Haiku returns `direct_answer` (classification + fulfilment conflated) | Astra, Gemini | `TRIAGE_SYSTEM_PROMPT`, `parseTriageResult` | **True** |
| MaestroClaw requires Supabase credentials | Astra | `packages/maestroclaw/src/config.ts` :42–44 | **True** |
| Claw advertises adapters/platform/node_version | Astra | `packages/maestroclaw/src/index.ts` :35–38 | **True** |
| No local HTTP inference anywhere in runtime code | all | grep over `src/`, `supabase/`, `packages/maestroclaw/src`; `adapters/` listing | **True** |
| `orchestrate` hardcodes OpenAI + OpenRouter URLs | Fable, Gemini | `orchestrate/index.ts` :799, :852 | **True** |
| 4-mode routing bar with consequence labels exists | Gemini | `RevealComposer.tsx` `INTENT_CONFIG` :29–60 | **True** (5 intents incl. Iterate) |
| Provenance tracked manually in Eliana manifests | Gemini | `docs/audits/eliana-readonly-poc/README.md` :44, :51 | **True** |
| Aug-17 audit sequenced local-first LATER, Core NEXT, no second engine / no live sync | Fable | `MAESTRO-2026-FULL-AUDIT.md` §O, §W-8/10, §Y | **True** |
| Nonce-ledger migration remote status unverified | Fable | `MAESTRO_STATE.md` Read This First | **True (as of 09-05)** |
| HIPAA / FERPA statements | Astra, Gemini | not checked — wrong jurisdiction | **N/A** |
| "≥40% fewer triage calls" | Gemini | — | **Prediction, unmeasured** |

## 5. Owner decisions the council needs from Michael

1. **Sequencing vs the Aug-17 audit.** Council: the audit's NOW list (trust spine, execution identity, sandbox defaults, E2E) stands; the vision re-orders NEXT/LATER only. The vision doc should cite the audit or explicitly overturn it.
2. **Proving grounds.** Council: **Maestro's own routing** (triage substitution + ledger) and **one read-only household workflow** (bills due / weather / vacation planning; no money movement). School board = **design partner for the MFIPPA/PHIPA compliance spec** (interview the privacy officer; never test on student data). Dentist = the example, not the target, until a connector exists.
3. **Money movement** out of scope for v1 (always human-approved; approval bound to payee/amount/account/expiry; idempotent; reconcile before retry).
4. **Name the assistant** (not a vendor model's name — the vision's own Rule 12). No milestone on the router's name.
5. **Re-label PHILOSOPHY.md Part 2** (innate model personalities) as a hypothesis the ledger tests.
6. **Gate for council escalation** = grounding attestation + blast radius, never model self-confidence. Confirm as a design rule.

## 6. Recommended first steps (reconciled across three seats)

Each ≤1 agent-week, default-off flag, no behaviour change when off, tests before ship, one measured metric.

| # | Step | Touches | Tests before ship | Metric (measured, not estimated) |
|---|---|---|---|---|
| 1 | **Route receipt + execution identity (the ledger).** One `route_decisions` row per routing decision: request id, policy version, route, reason code, requested/resolved model, harness+version, profile, location, `grounding: ran\|declined\|silent\|n/a`, elapsed, outcome, explicit unknowns. Fail-open: telemetry failure never blocks the user path. | `useOrchestration.ts`, `useThreads.ts`, `types/index.ts`, `audit-log/index.ts`, one migration | redaction; flag-off parity; failure isolation; no inferred identities (Kimi → `unknown`) | ≥99% receipt coverage on eligible traffic; the 09-06 grounding split reproducible in one SQL query |
| 2 | **Deterministic triage, shadowed, then flipped.** Port `TRIAGE_SYSTEM_PROMPT`'s lexical rules to `src/lib/triageRules.ts`; move `tryParseLocalExecutionIntent` into a pure `src/lib/capabilityRouter.ts`; compute rule verdicts client-side, still call Haiku, log both to the ledger. Separate classification from `direct_answer` in `concierge-triage`. | `useOrchestration.ts:444`, `useThreads.ts`, `concierge-triage/index.ts`, new lib files | fixture table from the prompt's own examples + 100 real `thread_messages`; property "hard overrides always win"; adversarial quoting/negation; abstain on ambiguity | agreement ≥95% over two weeks → flip; Haiku calls avoided counted from receipts |
| 3 | **Local inference as a provider — for grading and classification only.** Factor `orchestrate` :799/:852 into `callOpenAICompatible(baseUrl, …)`; provider_group `local` with `base_url`. Ollama first; Foundry Local second (same wire). First consumer: a Grading Lab seat (audit X-4), not tool execution. | `orchestrate/index.ts`, `types/index.ts`, `OrchestraDrawer.tsx`, provider config | contract test vs mock `/v1/chat/completions` (stream + non-stream); `finish_reason`/truncation parity; tool-call path disabled | a Qwen3/Gemma-4-class seat completes ten Q&A grading tasks; grades land in the ledger keyed by resolved model + harness |
| 4 | **Shadow Council sampler.** 5–10% of routed-down tasks re-run one tier up asynchronously and graded; never for side-effecting tasks. | ledger + grading-lab runner | no duplicate side effects; budget cap | exploration rows accrue without user-visible latency |
| 5 | **Typed read-only operation** (`workspace.list_files` via scoped FS API, never shell text) as the template for every future connector. | `executor-api`, `executor.ts`, `useThreads.ts` | traversal/symlink, tenant isolation, output limits, idempotency, literal metacharacters | zero model or shell calls for the eligible op; lower median latency |

Then top-k, specialists, GUI and function-extraction automation are decided **from the ledger**, not from the document.

## 7. What the council says Michael is missing (merged, attributed)

1. **The moat is the ledger + qualified workflows, not the router.** (all three)
2. **Grounding attestation is the escalation signal you already discovered on 09-06 and left out of §7.** (all three)
3. **Models slot-fill parameters; code executes.** Small models fail tool calls at 5–10% on single steps (web); a school board cannot accept that rate. (Gemini's schema-first inversion; Fable's T1/T2 boundary; Astra's typed ops)
4. **The council survives by becoming the qualification service** for workflows and the shadow grader for the runtime; it is not demoted, it is repositioned. (Astra + Gemini mechanism)
5. **Non-dev deployments need product plumbing the console never had**: installation/updates, connector credential renewal, schema migration, scheduling/cron, RBAC ("a receptionist cannot ask for billing"), backup/restore, audit export, offline behaviour, support diagnostics. (Astra, Gemini)
6. **Your day job is the market research**: the compliance spec is what DSBN's privacy officer requires before AI touches student data; Ontario's MFIPPA/PHIPA, not HIPAA/FERPA. (Fable)
7. **Windows-first local inference (Foundry Local) is a lever only a Microsoft-shop insider would pull.** (Fable, unverified on this machine)
8. **The Aug-17 audit already decided most of this**; the vision must engage it. (Fable)
9. **Standards exist for every schema the vision proposes**: MCP, A2A cards, Agent Skills, JSON Schema/OpenAPI, OCI sandboxes. (all three)
10. **PHILOSOPHY Part 2 is a hypothesis**, and your own evidence (wrapper lesson, grounding split) already strains it. (Astra)

## 8. Method notes

- Kimi's monthly quota is now a recurring hole (three studies). Roster rule: Kimi is best-effort until a paid quota exists.
- agy returned `status: SUCCESS` with an empty `response` on run 1 with an explicit `CLAW_AGY_MODEL`; the adapter treats that as success. Fix candidate: `success = status === "SUCCESS" && response.trim().length > 0` in `agy-cli.ts`. Cause of the empty run not determined (model tag vs transient).
- Fable's seat is not blind (wrote the brief); written before reading the others; corrected once after Astra, marked in place.
- Prompt was 44 KB inline because the vision doc is untracked (a clone can't carry it). Fine for codex/kimi via stdin; agy via `COUNCIL_PROMPT.md` in the clone.
- Both external seats assumed US law. Future briefs should state jurisdiction.
