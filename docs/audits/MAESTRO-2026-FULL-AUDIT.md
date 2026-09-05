# Maestro 2026 Full Architecture Audit

**Audit date:** 2026-08-17  
**Audited checkout:** main at 27c1960d34d90a3d4341ab0a925f047b2e355fdc  
**Mode:** Read-only archaeology, code verification, installed-CLI inspection, and official-source research

Labels: **VERIFIED** = code/runtime/test evidence; **INFERRED** = reconstruction; **RECOMMENDED** = proposed direction; **OBSOLETE/SUPERSEDED** = unreliable current intent.

## Audit basis and limits

The AGENTS.md precedence was followed: running code, recently verified state, stable reference, specs/roadmaps, history, then inference. The audit read governing/state/reference files, active specs, relevant history and commits, Grading Lab protocol/results, and Graphify reports; it traced browser, edge, database, Claw, harness, GitHub, memory, and grading paths. Graphify was navigation evidence, not runtime authority.

The pre-existing dirty Graphify output and untracked research were preserved. No production code was changed.

| Safe verification, 2026-08-17 | Result | What it proves |
|---|---:|---|
| Web tests | **20/20 passed** | Current web Conductor contract |
| MaestroClaw tests | **34/34 passed** | Shell analyzer and Claw Conductor reconcile |
| Web and Claw TypeScript | **Passed** | Compilation |
| ESLint | **0 errors, 10 warnings** | Hook/refresh warnings remain |
| Vite production build | **Passed** | SPA bundles; main JS ~996 kB minified, 271 kB gzip |

**VERIFIED — limit:** this is not a live browser → Supabase → queue → Claw → CLI → filesystem → artifact → GitHub proof. No automated suite covers that corridor. MAESTRO_STATE.md says migration 20260703000000_build_tasks_priority.sql was not yet applied remotely. Remote deployment was not re-probed.

## A. Executive verdict

**VERIFIED:** Maestro is a React/Supabase control plane plus a Node workstation daemon coordinating a heterogeneous council, build decomposition, local execution, artifact reconciliation, GitHub delivery, and memory. Its strongest differentiated evidence is blind cross-harness grading and structured deliberation, not generic autonomous coding.

**INFERRED:** three products accumulated together: a cross-provider council, a durable build/control plane, and a local terminal/security/runtime reimplementation. The first remains differentiated. The second is connective tissue. The third is the largest risk and most commoditized.

**RECOMMENDED:** Maestro should be the **owner-governed heterogeneous-agent control plane and evaluation layer**. It owns identity, council protocol, blind deliberation, provenance, policy intent, durable orchestration, Rate, and owner decisions. MaestroClaw becomes a **thin capability broker plus policy/audit boundary**.

- **[FINISH]** Trust baseline: isolation, capability negotiation, execution identity, canonical paths, one-time/idempotent approvals, live E2E. Impact **Critical** · Confidence **High** · Evidence code/docs/runtime/installed-cli/web
- **[KEEP]** Cross-provider council, blind review/deliberation, owner-over-consensus, empirical grading. Impact **Critical** · Confidence **High** · Evidence code/docs/grading-lab
- **[DELEGATE-NATIVE]** Terminal UX, worktrees, native sessions/resume, subagents, permissions, tool sandboxing. Impact **High** · Confidence **High** · Evidence code/installed-cli/web
- **[EXPERIMENT]** Rate v1 on council Q&A before build routing. Impact **High** · Confidence **High** · Evidence grading-lab/inference

## B. What Maestro was originally trying to solve

| Subsystem | Problem and original custom answer | Current status | 2026 relevance |
|---|---|---|---|
| Council | One model's blind spots → multi-provider broadcast/synthesis | **VERIFIED implemented** | Vendor fleets remain mostly single-platform. |
| Deliberation | Parallel answers were a pile → blind R1, anonymized peers, critique, tension preservation | **VERIFIED; R2 direct only Anthropic/OpenAI** | More valuable as generation becomes cheap. |
| Personas | Model names mistaken for roles → persisted lenses/signatures | **VERIFIED** | Useful only when identity-independent and measured. |
| Conductor | Manual dependency/lane/collision work → deterministic readiness/reconcile | **VERIFIED, tested after seven-review rework** | Semantics remain; duplication does not. |
| Build lanes | Full-context builds costly/collision-prone → scoped plan/tasks/slicing/reconcile | **VERIFIED code; E2E unproven** | Native worktrees can isolate. |
| Bouncer | Generated code incomplete/unsafe → review/completeness/profile plans | **VERIFIED base; profile/observer unbuilt** | Borrow scanners/hooks; keep judgment. |
| MaestroClaw | Web could not reach subscription CLIs safely → queue/tokens/adapters/shell/PTY/workspaces | **VERIFIED partial** | Bridge remains; runtime reimplementation does not. |
| Iteration | Need bounded read→diff→verify→rollback → durable loops/locks/checkpoints | **VERIFIED code; critical paths untested** | Use structured native sessions beneath it. |
| Memory | Context/reasons disappeared → repo summaries/graph/decisions | **VERIFIED partial** | Portable decisions remain valuable. |
| Graphify | Repo too large for linear reading → derived graph | **VERIFIED latest main graph at 27c1960** | Index, not authority/proof. |
| Grading/Rate | Routing by intuition → blind grading/human anchor/ranks | **VERIFIED lab; Rate absent** | Central differentiator. |
| Fallback | Limits/timeouts broke builds → static chains/health | **VERIFIED multiple implementations** | Must resolve model+harness+account. |
| Local/headless | Owner managed many tabs/handoffs → local/headless branch | **VERIFIED historical/unmerged** | Valid direction; no second scheduler. |
| Skills | Good processes not portable → table/prompt embedding/custom packs | **VERIFIED partial/proprietary** | Agent Skills supersedes custom format. |

**OBSOLETE/SUPERSEDED:** some active specs still claim no implementation for shipped work. “Active” is design context, not verified status.

## C. What Maestro actually is today

**VERIFIED:** a browser-led, database-backed orchestration app with 19 edge-function directories, 52 code migrations, stateful React hooks/context, and a Node executor. Migration files define materially more tables than simplified overview prose; docs are not schema authority.

**VERIFIED:** Graphify identifies useMaestro as the dominant bridge (99 edges) and adapter/shell/executor cycles. Browser orchestration is concentrated in hooks/global state; local execution in executor.ts and adapters.

**INFERRED:** a prototype control plane with production-minded islands. Auth, RLS, rate limits, leases, and events are substantial; local isolation, deployment drift, and E2E proof lag the surface.

## D. Verified current architecture

~~~mermaid
flowchart LR
 U["Owner/browser"] --> UI["React + Vite<br/>context + hooks"]
 UI --> AUTH["Supabase Auth"]
 UI <--> DB["Postgres + RLS + Realtime<br/>rounds, jobs, events, memory"]
 UI --> EDGE["Deno functions<br/>orchestrate/deliberate/synthesize<br/>concierge/architect/bouncer"]
 EDGE --> LLM["Model APIs"]
 EDGE <--> DB
 UI --> Q["executor-api"] <--> DB
 Q <-->|"poll, claim, lease, events"| CLAW["MaestroClaw Node"]
 CLAW --> ADAPT["Adapters"] --> CLI["Codex/Claude/Copilot/Gemini/shell"]
 CLI --> FS["Host filesystem/workspace"]
 CLAW -->|"manifests/events"| Q
 UI --> GHE["GitHub functions"] --> GH["GitHub"]
 DB --> MEM["repo memory/decisions/responses"] --> UI
~~~

Actual paths:

1. useThreads builds context, resolves provider/model, calls orchestrate, persists direct conversation.
2. useOrchestration creates rounds, calls orchestrate per agent, persists primaries, optionally deliberate, then synthesize.
3. deliberate creates redacted Voice A/B views, persona signatures, parallel calls, stored pushbacks. **VERIFIED:** Anthropic/OpenAI only.
4. Browser build hooks decompose/select/dispatch/collect/reconcile/audit/bounce/deliver.
5. Claw heartbeats adapters, polls/claims, creates workspace, invokes wrapper, parses text or observes files, reports.
6. Iteration locks paths, reads scope, requests diff, resolves agent_query, applies/verifies, commits or cleans, stores decision.

**VERIFIED drift:** Conductor reconcile exists in web and Claw; C-06 found divergence before mirrored tests. Fallback exists in frontend/shared edge and a separate iteration chain. Semantics span browser, Deno, SQL, Node.

## E. Historical intent / unfinished ideas recovered

Git chronology: April built web/build/Claw/GitHub/thread foundations; early May added shell hardening, incidents, fallback, slicing, memory, deliberation, iteration; mid-May added personas, agent_query, structured logs, decisions; June added Conductor, skills embedding, Graphify, drift recovery, CI; July added C-06 review/rework and Grading Lab.

A later **unmerged** line contains approved LOCAL_FIRST_SPEC and headless maestroclaw run BUILDPLAN.md. It is not current main.

- **INFERRED:** “Maestro represents the owner” evolved to decisions/personas/Rate; fine-tuning is not prerequisite.
- **VERIFIED:** Grading Lab found model + harness is the behavioral unit.
- **VERIFIED:** R2 turned a 4-vs-1 framing into shared sequencing plus sharper dissent: trust spine, then one grading loop; Q&A versus build-to-PR stayed open.
- **INFERRED:** Graphify/skills anticipated portable institutional artifacts; the bespoke corpus plan is too broad for NOW.
- **VERIFIED:** multi-executor, Bouncer observer/profiles, sandbox, local-first specs are intent, not capability.

## F. 2026 ecosystem capability matrix

| Harness | Installed | Current native surface | Consequence |
|---|---:|---|---|
| Codex CLI | 0.147.0 | sandbox/approval, worktrees, subagents, skills, hooks, MCP/plugins, review, resume/fork, cloud, experimental servers/remote | Current wrapper loses session/capability structure. |
| Claude Code | 2.1.233 | trust/permissions, sandbox, worktrees/subagent isolation, agents/teams, skills/hooks/MCP/plugins, cloud/web/remote | dangerously-skip-permissions disables what Maestro should attest. |
| Copilot CLI | 1.0.80 | local/cloud sandbox, tool/path/URL policy, remote steer/resume/session, skills/plugins/MCP/ACP, subagents, JSONL, OTel, env redaction | allow-all-tools + text discards policy/stream/session. |
| Gemini CLI | 0.49.0 | Docker/tool sandbox, policy/expansion, trust, worktrees, sessions, skills/hooks/MCP, ACP, structured output | Maestro does not verify effective yolo sandbox. |
| agy | 1.1.13 | profiles, sessions, schema output, plan/accept-edits, sandbox flag, plugins/models | Add by discovery; do not replace Gemini. |
| Kimi CLI | 1.41.0 | sessions/resume, agents/subagents, JSONL, ACP, MCP, Skills, Ralph, tracing/plugins/web | Strong structured adapter candidate. |

Primary sources: [Codex sandbox](https://learn.chatgpt.com/docs/sandboxing), [worktrees](https://learn.chatgpt.com/docs/environments/git-worktrees), [subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents), [hooks](https://learn.chatgpt.com/docs/hooks), [skills](https://learn.chatgpt.com/docs/build-skills), [MCP](https://learn.chatgpt.com/docs/extend/mcp); [Claude worktrees](https://code.claude.com/docs/en/worktrees), [agents](https://code.claude.com/docs/en/agents), [remote](https://code.claude.com/docs/en/remote-control), [features](https://code.claude.com/docs/en/features-overview); [Copilot CLI](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-copilot-cli), [sandboxes](https://docs.github.com/en/copilot/concepts/about-cloud-and-local-sandboxes), [remote](https://docs.github.com/en/copilot/concepts/agents/copilot-cli/about-remote-control); [Gemini sandbox](https://geminicli.com/docs/cli/sandbox/), [ACP](https://geminicli.com/docs/cli/acp-mode/); [Kimi](https://moonshotai.github.io/kimi-cli/en/reference/kimi-command.html).

Legend N native, P partial/preview, ? not established.

| Capability | Codex | Claude | Copilot | Gemini | agy | Kimi |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| FS/tool sandbox | N | N/P | N/P | N | P | ? |
| Network policy | N | N/P | N/P | N | ? | ? |
| Permission policy | N | N | N | N | P | P |
| Worktrees | N | N | N/P | N | ? | ? |
| Resume/session | N | N | N | N | N | N |
| Remote/cloud | N/P | N/P | N/P | P | ? | P |
| Parallel agents | N | N | N | N/P | ? | N |
| Structured stream | N | N | N | N | P | N |
| Skills/hooks/MCP | N | N | N | N | P/? | N/P |
| ACP | ? | ? | N | N | ? | N |

**INFERRED:** runtime capability discovery beats static assumptions. Effective policy evidence matters more than parity.

## G. What the industry has commoditized

**VERIFIED:** permissions, filesystem/network sandboxing, trust, worktrees, resume, background tasks, subagents, skills, hooks, MCP, structured streaming, remote/cloud, review.

**OBSOLETE/SUPERSEDED:** generic PTY, Ralph retry, clone-only isolation, proprietary prompt-pack skills, regex-first session protocol, single-harness background UI, provider-name fallback, default all-tools wrappers are not moats.

**INFERRED:** commoditization validates early direction but moves value upward: portable heterogeneous governance.

## H. What Maestro should still own

- **[KEEP]** Cross-provider independent R1, controlled peer exposure, self-critique, disagreement, owner override. Impact **Critical** · Confidence **High** · Evidence code/grading-lab
- **[KEEP]** Durable state, leases, policy intent, provenance, cost, decisions, audit. Impact **Critical** · Confidence **High** · Evidence code/docs
- **[BUILD]** Execution identity: provider, requested/resolved model, harness/version, profile/account, capabilities/policy, location, native session, commit/artifact digest. Impact **Critical** · Confidence **High** · Evidence grading-lab/code
- **[FINISH]** Contextual Rate. Impact **High** · Confidence **High** · Evidence grading-lab
- **[KEEP]** Cross-agent reconcile and visible collisions. Impact **High** · Confidence **High** · Evidence code
- **[GENERALIZE]** Council/evaluation beyond coding. Impact **Medium** · Confidence **Medium** · Evidence inference
- **[KEEP]** Portable facts/decisions/evaluations/provenance. Impact **High** · Confidence **High** · Evidence code/inference

## I. What Maestro should delegate to native harnesses

| Responsibility | Classification | Maestro retains |
|---|---|---|
| Permission policies | **DELEGATE-NATIVE + defense** | Requirements, attestation, fail-closed |
| Worktrees | **DELEGATE-NATIVE** | Select/track/reconcile/clean |
| Resume/background/remote | **DELEGATE-NATIVE** | Native ID and normalized controls |
| Internal subagents | **DELEGATE-NATIVE** | Correlation-family accounting |
| Terminal/PTY | **DELEGATE-NATIVE** | Attach normalization |
| Structured events | **DELEGATE-NATIVE** | Event envelope/raw trace |
| Review mechanics | **DELEGATE-NATIVE** | Cross-provider blind grading |
| Browser/computer | **DELEGATE-NATIVE** | Capability/policy/recording gate |

**[DELEGATE-NATIVE] RECOMMENDED:** replace bypass/all-tools/unattested-yolo defaults with least privilege; otherwise outer container/VM or deny unattended work. Impact **Critical** · Confidence **High** · Evidence code/installed-cli/web

## J. What Maestro should standardize on

- **[STANDARDIZE]** [Agent Skills](https://agentskills.io/specification) SKILL.md. Impact **High** · Confidence **High** · Evidence web/installed-cli
- **[STANDARDIZE]** MCP for tools/resources, credentials/approval outside skill prose. Impact **High** · Confidence **High** · Evidence web/code
- **[EXPERIMENT]** [ACP](https://agentclientprotocol.com/get-started/introduction) for Copilot/Gemini/Kimi sessions; not universal. Impact **High** · Confidence **Medium** · Evidence installed-cli/web
- **[EXPERIMENT]** [MCP Tasks](https://modelcontextprotocol.io/specification/2025-11-25/basic/utilities/tasks) only after experimental semantics cover Maestro needs. Impact **Medium** · Confidence **Medium** · Evidence web
- **[DEPRECATE]** Adopt [A2A](https://a2a-protocol.org/latest/specification/) now; watch future opaque-agent federation. Impact **Low** · Confidence **High** · Evidence web
- **[EXTRACT]** One core schema/package for reconcile, identity/capabilities, events, persona/redaction, transitions. Impact **High** · Confidence **High** · Evidence code

## K. What should be deleted/deprecated

- **[DEPRECATE]** Text-only adapter as primary path; keep compatibility.
- **[DELETE]** Default auto-approval; allow only in verified outer sandbox.
- **[DEPRECATE]** Static adapter/fallback/model arrays.
- **[EXTRACT]** Shared Conductor, then delete mirrors.
- **[DEPRECATE]** “active spec” status; use implemented-unverified/runtime-verified/superseded/experiment.
- **[DELETE]** Near-term local fine-tune/large Devpost corpus commitments; preserve hypotheses.
- **[DEPRECATE]** Custom PTY/security expansion as product line.

Impact **Medium–High** · Confidence **Medium–High** · Evidence code/docs/ecosystem.

## L. What unfinished Maestro ideas became MORE valuable

1. **[FINISH]** Rate keyed to resolved model+harness/profile.
2. **[FINISH]** Decision memory and owner governance.
3. **[GENERALIZE]** Blind deliberation against correlated fleets.
4. **[STANDARDIZE]** Skills flywheel on Agent Skills.
5. **[FINISH]** Multi-executor negotiated capability routing.
6. **[EXPERIMENT]** Local/headless using the same core.
7. **[GENERALIZE]** Claim→evidence→grader→decision→artifact graph.

Impact **High** except claim graph **Medium** · Confidence **Medium–High** · Evidence grading-lab/docs/code/ecosystem.

## M. What Maestro is missing that old roadmaps never anticipated

- **[BUILD]** Versioned capability negotiation with attestation. Impact **Critical** · Confidence **High** · Evidence code/installed-cli
- **[BUILD]** Reproducibility envelope: inputs/commit/skills/MCP/policy/network/env/model/harness/session/artifact hashes. Impact **Critical** · Confidence **High**
- **[BUILD]** Job fencing/idempotency and one-time approvals. Impact **Critical** · Confidence **High**
- **[BUILD]** Provider/account/profile health including auth/quota/subscription route. Impact **High** · Confidence **High**
- **[BUILD]** Correlation/diversity measurement. Impact **High** · Confidence **Medium**
- **[BUILD]** Security attestation as routing input. Impact **High** · Confidence **Medium**
- **[BUILD]** Offline degradation/evidence sync rules. Impact **High** · Confidence **Medium**
- **[GENERALIZE]** Blind review beyond code. Impact **Medium** · Confidence **Medium**

**VERIFIED/INFERRED:** Maestro was early on councils, durable jobs, subscription bridges, skills, multi-machine execution, deliberation, decisions, and empirical routing. The primitives commoditized; the governance opportunity strengthened.

## N. MaestroClaw/ThamosClaw verdict

**RECOMMENDED:** Claw is a **local capability broker, policy/audit boundary, durable session supervisor**, not every CLI's terminal/parser/worktree/session/sandbox.

| Responsibility | Verdict |
|---|---|
| Queue/leases/executor identity | **KEEP CUSTOM** |
| Events/artifacts/provenance | **KEEP NORMALIZATION** |
| Outer deny/audit | **KEEP DEFENSE-IN-DEPTH** |
| Shell parser | **KEEP DEFENSE, raw shell only** |
| PTY | **DEPRECATE** |
| Clone | **KEEP FALLBACK** |
| FS/network isolation | **DELEGATE-NATIVE or outer sandbox** |
| Cross-device approval | **KEEP, redesign one-time/idempotent** |
| Prompt/stdout regex | **DEPRECATE for ACP/JSONL** |
| Routing policy | **KEEP; delegate mechanics** |
| Process lifecycle | **KEEP supervisor; delegate native session** |

**VERIFIED:** [OpenClaw sandboxing](https://docs.openclaw.ai/gateway/sandboxing) separates gateway/sandbox/tool policy/elevation; offers Docker/Podman/SSH/OpenShell, scopes, none/ro/rw, no-network defaults. Its ACP agents split broker policy from harness login/model/tools. This validates thin broker, not replacement by OpenClaw.

**[EXPERIMENT]** Native sandbox/worktree versus outer-container+native-policy on a scratch repo; measure containment/setup/events/cancel/resume/Windows/artifacts. Impact **Critical** · Confidence **High** · Evidence code/web

## O. Cloud/local architecture verdict

**VERIFIED:** semantics span browser, Deno, SQL, Claw; deliberate calls providers directly; Conductor/fallback mirror. This is real drift.

**[EXTRACT]** Pure schemas, execution identity/capabilities, Conductor, council transitions, persona/redaction, routing/failure taxonomy. Keep edges for auth/secrets/persistence/providers; browser for interaction; Claw for supervision. Impact **High** · Confidence **High** · Evidence code/history

**INFERRED:** cloud+local Claw, fully local, hosted fallback can share one transport-neutral protocol. No second local scheduler.

## P. Security verdict

**VERIFIED strengths:** ownership checks, RLS design, rate limits, encrypted secrets, token hashing/rotation, leases, shell syntax analysis, incidents, safe final artifact resolution.

**VERIFIED overall failure:** native CLIs inherit full process environment and broad unattended modes. Malicious repo/dependency/skill/MCP/model output can reach host credentials/network/files absent native containment. Maestro does not attest containment.

1. **VERIFIED Critical — no uniform sandbox/network/secret boundary.** Claude skips permissions; Copilot all-tools; Gemini yolo; process.env inherited. **[FINISH]** Least privilege, env allowlist, network deny, secret isolation. Impact **Critical** · Confidence **High** · Evidence code/installed-cli/web
2. **VERIFIED High — agent_query scope escape.** Literal scope and query files lack canonical containment; symlinks read. **[FINISH]** Canonical resolver; reject absolute/dot-dot/device/symlink escape everywhere. Impact **Critical** · Confidence **High** · Evidence code
3. **VERIFIED High — session collection follows links.** **[FINISH]** lstat/canonical root/visited/type/size limits. Impact **High** · Confidence **High** · Evidence code
4. **VERIFIED High — verification bypasses approval.** Direct argv spawn; package scripts are repo authority. **[FINISH]** Signed verification capability/sandbox/argv/network/visibility. Impact **Critical** · Confidence **High** · Evidence code
5. **VERIFIED Medium — HMAC replay.** Exact context/expiry but no nonce/consume. **[FINISH]** jti/intent/atomic consume/idempotency. Impact **High** · Confidence **High** · Evidence code
6. **VERIFIED High — cross-tenant stale reclaim.** userId ignored under service role. **[FINISH]** owner scope and two-tenant test. Impact **High** · Confidence **High** · Evidence code
7. **VERIFIED High — inconsistent path policy.** Diff scope lexical; absolute/dot-dot/Windows/symlink parents not uniform. **[FINISH]** shared canonical policy/adversarial tests. Impact **High** · Confidence **High**
8. **VERIFIED Medium — incomplete cancellation.** No general cancellable handle; process-tree behavior varies. **[BUILD]** cancellable sessions/process groups/late-result fencing. Impact **High** · Confidence **High**
9. **INFERRED High — repo hooks/config/scripts can escalate.** **[FINISH]** disable hooks/includes, sanitize Git env, immutable setup, approve lifecycle scripts/network. Impact **High** · Confidence **Medium**
10. **VERIFIED/INFERRED Medium — skill/MCP supply chain missing.** **[BUILD]** hashes/publisher/permissions/pinning/review/provenance. Impact **High** · Confidence **High**

Correct layers: owner one-time intent → Maestro policy/fencing/audit → outer OS/container/VM → native harness policy/sandbox → tool validation → canonical filesystem/artifact review. Shell parsing is not isolation.

## Q. Council/persona/deliberation verdict

**VERIFIED strengths:** independent primaries, stored identity, anonymized peer views, critique/self-critique, tension preservation, blind shuffled lab and human anchor.

**VERIFIED limits:** token redaction is not semantic anonymity; R2 only Anthropic/OpenAI; synthesis depends on Anthropic or fallback; persona effect unmeasured; browser owns lifecycle; native subagents are correlated.

- **[KEEP]** Cross-provider primaries/blind pushback/tension. Impact **Critical** · Confidence **High**
- **[EXTRACT]** Provider-neutral council protocol. Impact **High** · Confidence **High**
- **[EXPERIMENT]** R1-only vs R2 on accepted findings/false positives/time/cost/dissent. Impact **High** · Confidence **Medium**
- **[GENERALIZE]** Personas as measured lens packages independent of model. Impact **Medium** · Confidence **Medium**

Native subagents decompose one correlated identity; they do not replace council.

## R. Rate/grading verdict

**VERIFIED:** real tasks, anonymous/shuffled candidates, forced ranks, peers, human anchor, mapping. Task 001 gave unanimous rework and human Spearman ~0.90. Task 002 split argument/writing. Task 003 capped length and produced convergence plus dissent. Verbosity remains confounded. Rate is absent.

**[BUILD] Smallest Rate v1:** append-only events keyed by project/domain, problem/task, persona, requested/resolved model, harness/version, profile/account, grader, rubric, artifact digest. Store ranks/axes, owner-accepted unique findings, rejected false positives, verification survival, human agreement, cost/latency/failure/provenance/correlation. Use task-local → project/domain → global backoff with counts/uncertainty. No universal Elo first. Impact **High** · Confidence **High** · Evidence grading-lab/inference

**[EXPERIMENT]** Q&A first; one visible routing change with override/counterfactual, then build-to-PR. Impact **High** · Confidence **High**

## S. Skills/MCP/ACP/A2A verdict

| Standard | Removes | New dependency/control | Maturity | Verdict |
|---|---|---|---|---|
| Agent Skills | Proprietary packs/discovery | Supply-chain risk | Multi-harness spec | **ADOPT NOW** |
| MCP | One-off tools/resources | Server trust/auth | Mature core | **ADOPT with policy** |
| MCP Tasks | Some polling | Experimental semantics | Experimental | **EXPERIMENT; keep jobs** |
| ACP | Flags/stdout/session glue | Not universal | Real implementations | **EXPERIMENT NOW** |
| A2A | Future remote federation | External trust | Not needed locally | **WATCH** |

**[STANDARDIZE]** Candidate skill → sandbox eval → owner approval → versioned publication; no one-run promotion. Impact **High** · Confidence **High**

**[EXPERIMENT]** ACP start/stream/permission/cancel/resume/artifact proof. ACP means Agent Client Protocol. Impact **High** · Confidence **Medium**

## T. Memory/context verdict

Layers: threads/rounds/pins, repo_memory, decisions, Graphify, session/job events, builds, personas/skills, instructions, native sessions.

**VERIFIED problems:** implicit precedence, stale summaries/graphs, overlap, native state lacks provenance, docs contradict code, assembly repeated.

Hierarchy: (1) sourced fresh facts; (2) immutable owner decisions/supersession; (3) evaluations/claims; (4) append-only history/traces; (5) versioned skills; (6) rebuildable indexes; (7) ephemeral native session.

- **[BUILD]** Provenance, as-of commit, supersession, retrieval reason. Impact **High** · Confidence **High**
- **[DELEGATE-NATIVE]** Harness working context, never sole facts/decisions. Impact **Medium** · Confidence **High**

## U. Testing/operations/resilience verdict

**VERIFIED present:** heartbeat/token, atomic claim filter, lease requeue, events, records, some timeout/retry/fallback, Windows kill in parts, chunking, Conductor tests, CI.

**VERIFIED missing:** idempotency/fencing; native session restart; universal cancel; profile/auth health; structured output use; tests for executor API/approvals/paths/iteration/artifacts/RLS/edge/GitHub/Realtime; tenant reclaim. **INFERRED:** late completion can compete after lease expiry.

Adopt ladder: compiled → unit → contract → local integration → two-tenant security → live provider → live executor → live GitHub → production observed.

- **[BUILD]** Hermetic golden path with fake structured harness/local Supabase plus live canary; assert fencing/order/cancel/digests/collisions/tenants. Impact **Critical** · Confidence **High**
- **[BUILD]** Migration checksums, deployed commit/schema endpoint, generated types, shared fixtures, discovery snapshots, evidence-generated status. Impact **High** · Confidence **High**

## V. Current → target architecture diagram

~~~mermaid
flowchart LR
 subgraph CURRENT["Current"]
  CUI["Browser orchestration"] --> CEDGE["Deno orchestration"] --> CDB["Supabase"]
  CDB <--> CCLAW["Claw runtime"] --> CH["One-shot/all-tools harnesses"]
 end
 subgraph TARGET["Target"]
  CORE["Maestro Core<br/>council · identity · capabilities · policy<br/>state · reconcile · provenance · Rate"]
  TUI["Browser/local UI"] --> CORE
  TCP["Thin cloud/local control adapter"] --> CORE
  BROKER["Claw broker<br/>supervise · attest · normalize"] --> CORE
  NATIVE["Native session<br/>ACP/JSONL/permissions/worktree"] --> BROKER
  SBOX["Outer sandbox/VM"] --> NATIVE
  STORE["Events/decisions/evals/artifacts"] <--> CORE
 end
 CURRENT -->|"characterize and prove, not rewrite"| TARGET
~~~

Rules: one protocol; pure semantics in core; negotiate before dispatch; least privilege plus outer isolation; fenced/reproducible results; council/Rate above harness details.

## W. Do-not-build list

1. **[DELETE]** Universal custom terminal.
2. **[DEPRECATE]** Shell parser as sandbox.
3. **[DELEGATE-NATIVE]** Per-harness worktree manager.
4. **[STANDARDIZE]** Proprietary skill format.
5. **[DEPRECATE]** Regex-first session protocol.
6. **[DELEGATE-NATIVE]** Single-vendor subagent scheduler.
7. **[DEPRECATE]** Universal static leaderboard.
8. **[DELETE]** Live local↔cloud DB sync.
9. **[DEPRECATE]** Home-grown scanner replacement.
10. **[DELETE]** Second local orchestration engine.
11. **[DEPRECATE]** Fine-tune before preference evidence.
12. **[DELETE]** Automatic skill promotion after one success.

Impact **Medium–High** · Confidence **Medium–High** · Evidence code/docs/ecosystem.

## X. Recommended proof experiments

1. Native isolation bake-off: mounts/network/env/write escape/resume/cancel/setup/trace.
2. ACP Kimi/Gemini vs wrapper: code removed/events/permissions/resume/cancel/artifacts/Windows.
3. Council-core parity in Node/Deno.
4. Rate wedge: ten real Q&A tasks, blind/human grades, one routing change vs baselines.
5. Deliberation ablation: R1-only vs R2.
6. Standard Skill in three harnesses.
7. Adversarial trust suite: injection, symlink/dot-dot, scripts, replay, stale/late workers, MCP/skill, exfil.
8. Fresh-machine canary: register → sandbox job → stream → review → PR → restart/resume.

**[EXPERIMENT]** Each needs a kill criterion; no rewrite without measurable risk/drift/complexity reduction. Impact **High–Critical** · Confidence **High**

## Y. Prioritized roadmap

### NOW

1. **[FINISH]** Trust spine: paths, verification authority, env/secrets, tenant reclaim, one-time approval, fencing, cancellation. Impact **Critical** · Confidence **High**
2. **[BUILD]** Execution identity/capability attestation. Impact **Critical** · Confidence **High**
3. **[EXPERIMENT]** Safe native/outer sandbox defaults; remove bypass/all-tools. Impact **Critical** · Confidence **High**
4. **[BUILD]** Contract/adversarial tests and live E2E. Impact **Critical** · Confidence **High**
5. **[FINISH]** Under separate owner authority, verify/apply migration/deploy; expose commit/schema compatibility. Impact **High** · Confidence **High**

### NEXT

1. **[EXTRACT]** Maestro Core v1. Impact **High** · Confidence **High**
2. **[STANDARDIZE]** Skills + MCP governance. Impact **High** · Confidence **High**
3. **[EXPERIMENT]** ACP adapter; add Kimi/agy by capability, never replace Gemini by preference. Impact **High** · Confidence **Medium**
4. **[BUILD]** Rate v1 Q&A wedge. Impact **High** · Confidence **High**
5. **[FINISH]** Provider-neutral deliberation/correlation tracking. Impact **High** · Confidence **High**

### LATER

1. **[EXPERIMENT]** Headless/local-first on same core.
2. **[GENERALIZE]** Multi-machine after one machine is trustworthy.
3. **[EXPERIMENT]** MCP Tasks when stable.
4. **[DEPRECATE]** A2A adoption until real remote-agent need.
5. **[EXPERIMENT]** Claim/evidence graph.
6. **[EXPERIMENT]** Local models for low-risk routing/grading.
7. **[EXPERIMENT]** Owner fine-tune after clean evidence.

## Z. The 10 architectural decisions Michael actually needs to make

1. **[OWNER-DECISION]** Product = owner-governed heterogeneous council/evaluation plane, coding first workload? Recommended **yes**. Impact **Critical** · Confidence **High**
2. **[OWNER-DECISION]** Every unattended session verified native/outer sandbox with env/network policy? **Yes, fail closed.** Impact **Critical** · Confidence **High**
3. **[OWNER-DECISION]** Claw = thin broker/policy/audit/supervisor; freeze terminal growth? **Approve.** Impact **Critical** · Confidence **High**
4. **[OWNER-DECISION]** Rate corridor Q&A then build-to-PR? **Q&A first.** Impact **High** · Confidence **High**
5. **[OWNER-DECISION]** Mandatory provider+resolved model+harness/version+profile+capability+location identity? **Yes.** Impact **Critical** · Confidence **High**
6. **[OWNER-DECISION]** Skills/MCP now, ACP experiment, A2A/MCP Tasks watch? **Yes.** Impact **High** · Confidence **High/Medium**
7. **[OWNER-DECISION]** Characterization-driven pure extraction only, no rewrite? **Yes.** Impact **High** · Confidence **High**
8. **[OWNER-DECISION]** Decisions/evals authoritative, facts versioned, Graphify/summaries derived? **Yes.** Impact **High** · Confidence **High**
9. **[OWNER-DECISION]** Unmerged local-first as experiment rebased onto Core? **Yes.** Impact **Medium** · Confidence **High**
10. **[OWNER-DECISION]** Freeze Bouncer expansion/corpus/fine-tune/new UX until trust+E2E+Rate wedge? **Yes.** Impact **High** · Confidence **High**

## Final product identity

**INFERRED:** Maestro is no longer best described as a better coding agent or multi-model terminal.

**RECOMMENDED:** Maestro is the **portable, owner-governed institution above heterogeneous agents**: it decides who participates, under what capability/security contract, what independent evidence survives, where disagreement remains, how outcomes are graded, and how evidence changes the next routing decision.

That preserves what no single vendor supplies while delegating low-level execution to the ecosystem now doing it better.
