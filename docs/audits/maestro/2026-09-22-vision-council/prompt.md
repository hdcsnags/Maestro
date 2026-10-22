Hi — Michael here, via Fable (my concierge agent, who conducts this council and also holds a seat). You are one independent seat on the Maestro Council. This is a strategic architecture review, NOT a code audit and NOT a blind bug hunt. I want you to think, disagree, and tell me what I am missing.

CONTEXT. The working directory is a fresh read-only clone of the Maestro repo (multi-agent orchestration console: React/Vite frontend, Supabase edge functions in Deno, `packages/maestroclaw` local execution node with CLI adapters). Read, in this order, before forming any opinion:
  1. `AGENTS.md` (how agents work here), then `MAESTRO_STATE.md` (Read This First block, Part 2 Operational State, and the Part 3 session log — the 2026-07-01, 2026-07-06, 2026-09-05 and 2026-09-06 entries matter most: the Grading Lab, the "resolved model + harness" wrapper lesson, the grounding-predicts-quality finding, and the "what Maestro lacked" takeaways).
  2. `docs/MAESTRO_PHILOSOPHY.md` (the thesis Maestro was founded on — the council as the product, the grading loop as the engine).
  3. `docs/reference/REFERENCE.md` (stack, 19 edge functions, 21 tables, roster).
  4. Then the vision document reproduced in full at the bottom of this prompt (`MAESTRO_INTELLIGENCE_ORCHESTRATION_VISION.md`, written by Sol from my dictation on 2026-09-21). It is untracked, so it is not in your clone — read it here.
  5. Code you MUST open to test the vision's claims against reality: `supabase/functions/concierge-triage/index.ts` (the current LLM triage), `src/hooks/useThreads.ts` (search for `tryParseLocalExecutionIntent`) and `src/lib/trustHints.ts` (a client-side command classifier), `packages/maestroclaw/src/conductor/plan.ts` and `reconcile.ts`, `packages/maestroclaw/src/adapters/types.ts` and one adapter, `supabase/functions/orchestrate/index.ts` (how providers are called — look for the OpenRouter/OpenAI-compatible path), `grading-lab/PROTOCOL.md`, `docs/specs/active/MULTI_EXECUTOR_ROUTING_SPEC.md`, `docs/specs/active/MAESTRO_INTELLIGENCE_LAYER_SPEC.md`, `docs/audits/MAESTROCLAW-ATTACK-PLAN.md` §1. Open more if you need to. Quote paths for every claim about what exists.

MY INTENT, in my own words (2026-09-22): "I think Maestro needs to become something we can use to build for local models, for any task, any industry. A home doesn't need frontier to check the weather, plan a vacation, keep up with bills that are upcoming, maybe even paying bills. A dentist office or school board can have a local model and ask who has upcoming visits, who hasn't been here over 9 months — and that can be programmatically handled, no LLM, no AI calls. How can I make Maestro not stay in the race and enter a new race?" I have been reading the history of LLMs (Attention Is All You Need onward). Sol caught the vision and wrote the document below. I told Fable: "don't be bound by my vision, show me what I am also missing."

HOUSE RULES. Read-only: do not create, modify or delete any file. No flattery. If you rely on something from memory (a paper, a product, a regulation) rather than from a file in the clone, mark it (unverified). Distinguish "the vision says" from "the code does" from "I believe". If you did not read a file, say so rather than guessing its contents. Every claim that something "already exists" must cite a path.

THE ASK. Write 2,000–3,000 words, in these numbered sections:
  1. **Model and reading list.** State the model you are actually running as, and list the files you actually opened.
  2. **What already exists.** Map each major vision concept (deterministic pre-router, capability registry, harness registry, model+harness reputation, top-k council, prompt provenance, local inference, telemetry, function-extraction loop, observable routing GUI) to code or specs in the clone. Grade each: full / partial / stub / absent, with path. Be exact about `concierge-triage`: are its routing rules deterministic in shape? Is a model needed to apply them?
  3. **Contradictions.** Where the vision contradicts (a) the current architecture (e.g. where the router would physically run, cloud vs local node; Supabase as a hard dependency vs "local-first"), and (b) Maestro's own founding philosophy (the council as differentiator vs "council as escalation only"; the grading flywheel needing data vs a router that starves it). Say which side should win and why.
  4. **Fashionable complexity to reject.** Name the parts of the vision that are architecture-fashion rather than measurable improvement. Be specific (tier taxonomy, utility formula, provenance tags, names…).
  5. **What Michael is missing.** This is the most important section. Do not stay inside the document. Consider: prior art that already does cost-aware model cascading or intent-first routing (name it; what is genuinely left to differentiate on?); whether the dentist / school-board / household examples are routing problems at all or connector/policy problems; what "enter a new race" could concretely mean; what the field's history (MoE gating, cascades, distillation, on-device + private-cloud hybrids, small-language-model agent research) suggests about where value accrues; what standards Maestro should adopt rather than invent (tool/capability advertisement, agent cards, skills formats); what a non-developer deployment needs that a developer console never did (connectors, schemas, scheduling, identity, audit, offline). Give me the three ideas you think Michael would not have reached alone.
  6. **Security and regulatory.** Local model + shell/browser/credentials in a dentist office (health data), a school board (student data), a household (money movement). What boundary must exist before any of that is safe? Which of the vision's Rules are necessary but not sufficient?
  7. **Minimal architecture.** One text diagram of the smallest system that honours the intent, and one paragraph on where each box physically runs (browser / Supabase edge / local node).
  8. **Smallest useful implementation sequence.** The first three engineering steps, each buildable by an agent in ≤1 week, each shippable behind a flag with zero regression to current behaviour, each with the tests that must exist BEFORE it ships and the metric that proves it helped. Say which existing files each step touches.
  9. **Five of the twenty questions** in the vision's §27 that matter most, answered in ≤3 sentences each; and the five you would strike as premature.
  10. **≤3 sentences: what Michael is wrong about.**

Begin with the model you are running as. End with a JSON block between the exact lines BEGIN VERDICT and END VERDICT:
  {"model":"<resolved model>",
   "already_exists":[{"concept":"...","where":"<path>","grade":"full|partial|stub|absent"}],
   "contradictions":[{"issue":"...","winner":"vision|current|neither","why":"..."}],
   "reject":["..."],
   "missing":[{"idea":"...","why_it_matters":"..."}],
   "new_race":"<one sentence>",
   "prior_art":[{"name":"...","relation":"...","verified":true|false}],
   "security_boundary":"<one sentence>",
   "first_three":[{"step":"...","files":["..."],"tests":["..."],"metric":"..."}],
   "router_name":"<your pick>",
   "michael_is_wrong_about":"<or null>"}

=====================================================================
THE VISION DOCUMENT (MAESTRO_INTELLIGENCE_ORCHESTRATION_VISION.md, Sol, 2026-09-21) follows verbatim:
=====================================================================

# MAESTRO: Intelligence Orchestration Vision

**Status:** Vision / Architecture Direction  
**Audience:** Maestro Council, builders, reviewers, and future maintainers  
**Purpose:** Define the next architectural evolution of Maestro without discarding the systems that already work.

---

## 1. Executive Summary

Maestro began as a system for coordinating multiple AI agents.

It should evolve into a system for coordinating **intelligence itself**.

The distinction matters.

The future architecture should not begin with:

> Which model should answer this?

It should begin with:

> What is the smallest, safest, cheapest, fastest, and most reliable capability that can complete this task?

Sometimes the correct answer is a frontier model.

Sometimes it is a local model.

Sometimes it is a specialized agent.

Sometimes it is a council.

Sometimes it is a deterministic program, API call, database query, cached result, script, rule, or function.

And sometimes the correct answer is:

> No model is needed at all.

The next phase of Maestro should therefore treat models as one class of capability among many and introduce a first-class **Intelligence Routing Layer** capable of choosing between deterministic execution, tools, local inference, specialist models, cloud models, frontier reasoning, multi-agent deliberation, and human review.

The long-term product is not "a collection of agents."

The long-term product is:

> **An adaptive intelligence orchestration platform that routes each task to the minimum sufficient capability, learns which model+harness combinations perform best for each class of work, preserves privacy where possible, and escalates only when evidence says escalation is warranted.**

This is the core direction.

---

# 2. Why This Direction Exists

Maestro already contains much of the machinery required for this evolution:

- Concierge interaction
- multiple model providers
- council deliberation
- model adapters
- local execution
- task assignment
- build/review/test loops
- deterministic dependency handling
- Conductor logic
- MaestroClaw
- tool execution
- iteration runners
- model fallback
- grading/evaluation
- persona-driven debate
- local and remote capabilities
- long-running autonomous projects

The missing piece is not another agent.

The missing piece is an explicit system for deciding **when intelligence is necessary, what kind is necessary, and how much intelligence should be purchased or invoked**.

A useful principle already exists elsewhere in the author's systems:

> **If a process is repeatable, it is probably calculable.  
> If it is calculable, prefer code over an AI call.  
> If AI repeatedly performs the same deterministic transformation, consider replacing that behavior with a function.**

Maestro should inherit this philosophy.

---

# 3. The Core Architectural Principle

## Minimum Sufficient Intelligence

Every task should be routed to the least expensive capability that can satisfy the required quality and safety threshold.

Conceptually:

```text
request
   |
   v
Can deterministic logic solve it?
   |
   +-- yes --> function / script / tool / query --> result
   |
   +-- no
       |
       v
Can a tiny/local capability solve it reliably?
       |
       +-- yes --> local execution --> result
       |
       +-- no
           |
           v
Can a specialist solve it?
           |
           +-- yes --> specialist --> result
           |
           +-- no
               |
               v
Efficient cloud model?
               |
               +-- sufficient --> result
               |
               +-- insufficient
                   |
                   v
Frontier reasoning
                   |
                   v
Still uncertain / contested?
                   |
                   v
Council / deliberation / human review
```

This should eventually become the meaning of **Auto** inside Maestro.

Auto should not merely mean:

> local versus cloud

or:

> choose an available model

Auto should mean:

> **Select the minimum sufficient capability under the current policy, quality, privacy, latency, and cost constraints.**

---

# 4. Terminology

Clear terminology matters because Maestro now spans several architectural layers.

## 4.1 Model

A model is an inference engine.

Examples:

- local language model
- frontier language model
- embedding model
- vision model
- classifier
- code model

The model alone is not the agent and is not the complete intelligence system.

---

## 4.2 Harness

A harness is the operational environment surrounding a model.

A harness may provide:

- filesystem access
- shell execution
- Android Studio
- emulator interaction
- browser control
- repository access
- tool APIs
- database access
- memory
- retrieval
- structured prompts
- context management
- execution policy
- approval boundaries
- retries
- logging
- checkpoints
- output validation
- test execution
- GUI interaction

Example:

A model may initially report:

> I cannot see the Android emulator.

That statement may be true of the raw model interface but false of the **harness**.

If the harness exposes emulator screenshots, device interaction, Gradle execution, logs, UI automation, and relevant instructions, the model effectively possesses those capabilities.

Therefore:

> **Capability belongs to the model+harness system, not necessarily to the model alone.**

This distinction must become explicit in Maestro.

---

## 4.3 Skill

Use "skill" for a reusable procedure, instruction package, or domain workflow.

A skill may teach an agent:

- how to perform a deployment
- how to run a test suite
- how to inspect an Android application
- how to conduct a Bible lexical analysis
- how to query a specific system
- how to prepare a release

A skill can be **part of a harness**, but a harness is broader.

Recommended distinction:

```text
SKILL
Reusable knowledge/procedure

HARNESS
Operational environment and capability envelope

MODEL
Inference engine

AGENT
Model + harness + role + policy + context

ORCHESTRATOR
Coordinates agents/capabilities

ROUTER
Chooses the capability/path for a task
```

---

## 4.4 Agent

An agent is an instantiated actor with:

- a model
- a harness
- a role/persona
- permissions
- context
- tools
- policies
- memory strategy
- potentially a reputation profile

The same model inside two different harnesses should be treated as two meaningfully different execution configurations.

---

## 4.5 Orchestrator

The orchestrator coordinates work.

It determines:

- decomposition
- sequencing
- dependencies
- delegation
- synchronization
- synthesis
- escalation
- completion

Maestro is already an orchestrator.

The next phase is to expand what Maestro is capable of orchestrating.

---

# 5. A Critical Observation: The Wrapper Matters

Testing has repeatedly shown that identical or nearly identical underlying models can behave very differently depending on:

- system prompt
- wrapper
- harness
- role framing
- assumed authority
- tools
- context structure
- instructions
- intermediate summarization
- whether another model authored the prompt
- what claims are presented as settled fact

Therefore Maestro must avoid simplistic reputation records such as:

```text
"Model X is good at coding."
```

Instead, performance should eventually be attributed to something closer to:

```text
Model
+
Harness
+
Role
+
Context Strategy
+
Tool Set
+
Task Type
+
Prompt Origin
+
Execution Environment
```

A frontier model is not automatically superior for every task.

A newer model is not automatically superior for every task.

A model that performs poorly in one wrapper may perform extremely well in another.

A model that reasons brilliantly may be wasteful for deterministic work.

A cheap specialist may outperform a frontier generalist inside a narrow domain.

The Grading Lab should become the empirical engine that measures this.

---

# 6. Proposed New Layer: Intelligence Router

Working names:

- Intelligence Router
- Compute Governor
- Capability Router
- Intelligence Scheduler
- Cognitive Router

The Council should debate the final name.

Its role is more important than its name.

## 6.1 Core Question

For every request:

> What is the minimum sufficient capability that can satisfy the task under the current requirements?

---

## 6.2 Candidate Capability Tiers

A useful initial hierarchy:

### T0 — Deterministic Logic

Examples:

- arithmetic
- static transformations
- dependency resolution
- routing tables
- known validation rules
- parsing
- filtering
- schema conversion
- cache lookup

No generative model call.

---

### T1 — Tool / Function

Examples:

- weather API
- database query
- repository search
- calendar lookup
- HTTP request
- build command
- Gradle sync
- test runner
- security query
- file operation

Potentially zero LLM calls.

---

### T2 — Tiny Local Model

Examples:

- intent classification
- conversational response
- formatting
- simple summarization
- extraction
- low-risk rewrite
- light routing assistance

Cheap and private.

---

### T3 — Local Specialist

Examples:

- code specialist
- security specialist
- theology/linguistics specialist
- organizational policy model
- family assistant
- dentistry/domain assistant

May use local RAG and domain-specific tools.

---

### T4 — Efficient Cloud Model

Used where:

- local quality is insufficient
- privacy policy permits cloud execution
- the task does not require frontier reasoning
- cost/latency matter

---

### T5 — Frontier Model

Used for:

- novel reasoning
- difficult architecture
- ambiguous analysis
- high-complexity synthesis
- planning across many constraints
- tasks where lower tiers fail evaluation

---

### T6 — Council / Multi-Agent Deliberation

Used when:

- independent perspectives add measurable value
- graders disagree
- uncertainty remains high
- the problem benefits from specialization
- adversarial review is useful
- important tradeoffs require explicit debate

Council should be an escalation mechanism, not mandatory ceremony.

---

### T7 — Human Decision / Approval

Required when:

- authority must remain human
- risk exceeds policy threshold
- destructive execution is proposed
- confidence is inadequate
- policy requires human confirmation
- the system detects irreducible ambiguity

---

# 7. Router Inputs

The route should not depend on "smartness" alone.

Suggested inputs:

```text
task_type
complexity
domain
required_quality
privacy_level
data_sensitivity
latency_target
cost_budget
tool_availability
local_model_availability
historical_reputation
confidence
blast_radius
reversibility
required_permissions
current_context
human_presence
```

A conceptual score could be:

```text
Utility(capability, task) =
    expected_quality
  - cost_penalty
  - latency_penalty
  - privacy_penalty
  - risk_penalty
```

subject to:

```text
expected_quality >= required_quality
policy_allows(capability) == true
```

Do not overengineer the mathematics initially.

Start with deterministic policy.

Collect telemetry.

Learn from reality.

---

# 8. Deterministic First

Before invoking any model, Maestro should ask:

> Is this actually a reasoning problem?

Examples:

## Weather

Bad path:

```text
user
 -> frontier LLM
 -> frontier LLM reasons about request
 -> tool
 -> frontier LLM summarizes result
```

Better path:

```text
intent recognizer
 -> weather tool
 -> lightweight formatter / local companion response
```

Potential frontier calls:

```text
0
```

---

## Currency Conversion

Likely:

```text
FX tool
 -> formatted response
```

No model required.

---

## Build Dependency Resolution

Use Conductor logic.

Do not ask a model which dependency should execute first when the answer is encoded in the dependency graph.

---

## Repeatable Model Behavior

If Maestro repeatedly asks a model to perform the same deterministic operation:

1. identify the repeated pattern
2. formalize it
3. create a function
4. test it
5. replace the model call where safe

This should become an explicit optimization loop.

---

# 9. Concierge Evolution

Fable currently functions as a powerful Concierge.

That role should remain.

However, the Concierge should eventually sit **behind or alongside deterministic routing**, not necessarily above it.

Today, a semantic classifier may call a model to determine whether another model/council is needed.

Future direction:

```text
request
   |
   v
deterministic recognizers / policy rules
   |
   v
tool/function route available?
   |
   +-- yes --> execute
   |
   +-- no --> lightweight/local classifier
                    |
                    v
             semantic routing
                    |
                    v
        specialist / frontier / council
```

Fable then becomes more valuable, not less.

Fable should handle:

- conversation
- ambiguity
- user intent
- negotiation
- synthesis
- clarification
- high-level delegation
- identity/personality continuity

Fable should not spend intelligence rediscovering facts that can be known programmatically.

---

# 10. Fable as Interface, Not Bottleneck

Fable should remain the user's familiar point of interaction while becoming increasingly decoupled from execution.

Conceptually:

```text
                    USER
                     |
                     v
                   FABLE
          conversational continuity
                     |
                     v
              INTELLIGENCE ROUTER
                     |
         +-----------+-----------+
         |           |           |
    deterministic   local     frontier
       tools       agents      models
         |           |           |
         +-----------+-----------+
                     |
                     v
                ORCHESTRATOR
                     |
                     v
                  RESULT
                     |
                     v
                   FABLE
```

The user experiences one persistent assistant.

Internally, many capabilities may perform the work.

This allows the visible identity to remain stable even while the underlying models change.

---

# 11. Council Evolution

The Council should evolve from:

> broadcast a problem to everyone

toward:

> select the smallest useful set of independent experts.

Potential routing:

```text
task classifier
    |
    v
historical reputation
    |
    v
top-k relevant experts
    |
    v
independent responses
    |
    v
grader / disagreement detection
    |
    +-- strong agreement --> synthesize
    |
    +-- disagreement --> deliberation
    |
    +-- unresolved --> frontier/human escalation
```

This is conceptually similar to Mixture of Experts at the system level, though it is not the same mechanism as neural MoE.

Possible internal term:

> **Mixture of Capabilities**

because the selectable units are broader than models.

---

# 12. Reputation Must Be Task-Specific

Do not maintain a universal leaderboard.

A useful reputation tuple may eventually resemble:

```text
{
  model_id,
  harness_id,
  role_id,
  task_class,
  domain,
  quality_score,
  latency,
  cost,
  failure_rate,
  disagreement_rate,
  sample_count,
  confidence_interval,
  last_updated
}
```

Example:

```text
Fable + MaestroClaw + Repo Harness
Task: TypeScript debugging
Quality: high

Fable + Generic Chat Harness
Task: TypeScript debugging
Quality: medium

Local Security Model + Sentinel Harness
Task: alert triage
Quality: very high
Cost: near-zero
Privacy: local

Frontier Generalist
Task: alert triage
Quality: very high
Cost: high
Latency: higher
Privacy: cloud
```

The router should be able to select the local security model despite the frontier model being nominally "smarter."

---

# 13. Prompt Provenance Matters

Observed behavior suggests that prompts authored by another model can introduce hidden authority assumptions.

Example pattern:

```text
Model A tells Model B:

"Assume X is true.
Do not challenge Y.
Do not perform Z."
```

Model B may treat those constraints as authoritative and inherit Model A's error.

A direct human prompt may not trigger the same failure.

Therefore Maestro should track prompt provenance.

Possible metadata:

```text
origin:
  human
  concierge
  agent
  synthesized
  system
```

And potentially:

```text
claims:
  verified
  asserted
  inferred
  disputed
```

Future Council protocols should distinguish between:

- user requirements
- system policy
- verified facts
- another model's claims
- hypotheses

No model should automatically inherit another model's certainty.

---

# 14. Harness Registry

Maestro should gain a first-class registry of harness capabilities.

Possible schema:

```text
Harness {
  id
  name
  environment
  tools[]
  skills[]
  permissions[]
  local_or_remote
  filesystem_scope
  network_scope
  gui_capabilities[]
  execution_capabilities[]
  supported_models[]
  sandbox_level
  approval_requirements[]
}
```

Example:

```text
AndroidDevHarness
  - Gradle
  - Android Studio
  - emulator boot
  - APK install
  - logcat
  - screenshots
  - UI interaction
  - tests
  - filesystem
  - repository
```

Any compatible model entering this harness can be told:

> You can inspect and interact with the emulator. Use the harness documentation.

This prevents rediscovering the capability in every conversation.

---

# 15. Skills vs Harnesses

Do not replace the word "skill" universally.

Use both.

Example:

```text
AndroidDevHarness
    |
    +-- Skill: build_project
    +-- Skill: sync_gradle
    +-- Skill: launch_emulator
    +-- Skill: inspect_logcat
    +-- Skill: run_ui_test
    +-- Skill: capture_screen
```

The harness is the environment.

The skill describes how to use part of that environment.

This distinction will make Maestro easier to reason about.

---

# 16. Local Intelligence as a First-Class Capability

Maestro should prepare for a world where local models are common.

Do not hard-code assumptions that useful intelligence is remote.

Introduce:

```text
LOCAL_INFERENCE
```

as a first-class capability.

Local models should advertise capabilities rather than requiring callers to know implementation details.

Example:

```json
{
  "id": "security-local-01",
  "runtime": "local",
  "domains": ["security", "identity"],
  "tasks": ["log_triage", "ioc_analysis", "signin_analysis"],
  "context": 32768,
  "privacy": "local_only",
  "tools": ["sentinel", "entra", "defender"],
  "cost_class": "very_low",
  "latency_class": "low"
}
```

Maestro then decides whether to use it.

---

# 17. Local Does Not Mean Safe

A local model with shell, browser, filesystem, credentials, or administrative APIs can cause serious damage.

Therefore:

> **Authority must be enforced by the harness and policy layer, not inferred from model intelligence or trust.**

Required concepts:

- least privilege
- scoped filesystem access
- command policy
- destructive-action gating
- approvals
- sandboxing
- audit logs
- reversible execution where possible
- secret isolation
- timeout/budget controls

The model may propose.

Policy decides whether execution is allowed.

---

# 18. The GUI Should Return

The GUI should eventually expose the new architecture visually.

Not merely:

```text
Model: Fable
```

but something closer to:

```text
Request
  |
  v
Route: Local Specialist

Reason:
- domain match: security
- quality requirement: medium
- privacy requirement: high
- local model reputation: 0.94
- frontier escalation unnecessary

Cost avoided:
- estimated frontier tokens: ...
```

Optional advanced view:

```text
PLAN
  T0 parser
    -> T1 repository search
    -> T3 local code specialist
    -> tests
    -> grader

Escalation rule:
  if grader confidence < 0.80 -> frontier reviewer
```

This would make Maestro's intelligence routing observable rather than magical.

Observability is important for debugging and trust.

---

# 19. The Grading Lab Becomes Core Infrastructure

The Grading Lab should not remain a side experiment.

It can become the mechanism that allows routing policy to improve empirically.

It should measure:

- correctness
- completeness
- regression rate
- hallucination rate
- test success
- latency
- token/API cost
- local compute cost
- tool-call count
- retries
- human corrections
- disagreement
- confidence calibration
- task type
- model+harness combination

Long term:

> Maestro should learn which capabilities actually work.

Not which ones are marketed as best.

---

# 20. Suggested Architecture

```text
                             USER
                              |
                              v
                         FABLE / UI
                              |
                              v
                   +----------------------+
                   | INTELLIGENCE ROUTER  |
                   +----------------------+
                     |    |    |    |   |
          +----------+    |    |    |   +-----------+
          |               |    |    |               |
          v               v    v    v               v
    DETERMINISTIC       TOOL  LOCAL CLOUD       HUMAN/POLICY
       ENGINE                 MODEL MODEL
          |                    |     |
          |                    v     v
          |                SPECIALISTS
          |                    |
          +----------+---------+
                     |
                     v
               ORCHESTRATOR
                     |
              +------+------+
              |             |
              v             v
          CONDUCTOR      COUNCIL
              |             |
              v             v
         task graph       debate/
         execution       independent
                         evaluation
              |             |
              +------+------+
                     |
                     v
                  HARNESS
                     |
         +-----------+-----------+
         |           |           |
         v           v           v
       tools        GUI         shell
       APIs         apps        files
                     |
                     v
                 EVALUATION
                     |
                     v
                REPUTATION
                     |
                     +-----> feeds router
```

---

# 21. Proposed Workstreams

The Council should challenge these, reorder them where appropriate, and identify existing code that already satisfies part of the work.

## Workstream A — Capability Model

Goal:

Create a unified representation of things Maestro can use.

Tasks:

- define `Capability`
- define capability types
- define local/remote metadata
- define cost classes
- define privacy classes
- define task/domain tags
- define tool requirements
- define quality/reputation references
- create capability registry
- map existing models and executors into registry

Initial capability types:

```text
deterministic
tool
local_model
cloud_model
frontier_model
agent
council
human
```

---

## Workstream B — Harness Model

Goal:

Make execution environments explicit.

Tasks:

- define `Harness`
- inventory current MaestroClaw capabilities
- inventory cloud/edge capabilities
- inventory GUI/browser/android capabilities
- distinguish skills from harnesses
- add harness metadata to agents
- expose supported tools
- expose permission boundaries
- expose sandbox policy
- document Android development harness as reference implementation

---

## Workstream C — Intelligence Router v1

Goal:

Route obvious tasks without requiring LLM triage.

Start simple.

Rules before ML.

Examples:

```text
known deterministic operation -> T0
known tool intent -> T1
local specialist domain match -> T3
otherwise -> current Concierge flow
```

Tasks:

- define routing request
- define routing response
- build deterministic rule engine
- add fallback to current Concierge
- instrument decisions
- preserve existing behavior when uncertain

Do not attempt a perfect router.

Build an observable router.

---

## Workstream D — Router Telemetry

Every route should record:

```text
request_class
chosen_capability
alternatives
reason
latency
cost
result
evaluation
escalations
human_correction
```

This dataset will later be more valuable than speculative routing logic.

---

## Workstream E — Reputation v2

Goal:

Move from model reputation to configuration reputation.

Key should account for:

```text
model
harness
role
task type
domain
```

Potential later variables:

```text
prompt origin
tool set
context strategy
```

Do not introduce all dimensions before enough data exists.

---

## Workstream F — Council Top-K Routing

Goal:

Stop broadcasting every complex request to every available agent.

Tasks:

- classify task/domain
- fetch relevant reputation
- choose top-k independent experts
- encourage diversity where useful
- compare results
- deliberate only on disagreement
- escalate when required

---

## Workstream G — Prompt Provenance

Goal:

Prevent one model's assumptions from silently becoming another model's facts.

Tasks:

- mark prompt origin
- distinguish requirements from claims
- tag assertions
- allow reviewers to challenge upstream assumptions
- prevent agents from treating peer output as system authority

---

## Workstream H — Local Model Support

Goal:

Treat local inference as a peer of cloud inference.

Tasks:

- define local model adapter contract
- runtime discovery
- health checks
- capability advertisement
- quantization/runtime metadata
- local context limits
- tool/harness compatibility
- performance telemetry
- fallback behavior

Do not begin by fine-tuning.

First make Maestro capable of evaluating local models.

---

## Workstream I — GUI Revival

Goal:

Make intelligence routing understandable.

Views:

- active route
- execution graph
- capability chosen
- reason selected
- cost
- latency
- privacy status
- escalation
- Council participants
- model+harness identity
- grader output
- history

Optional visualization:

> "Why did Maestro choose this path?"

This should be inspectable.

---

## Workstream J — Function Extraction Loop

Goal:

Automatically identify work that should stop being performed by AI.

Possible process:

```text
repeated model task detected
    |
    v
high output consistency?
    |
    v
formalizable transformation?
    |
    v
candidate function generated
    |
    v
tests generated
    |
    v
human review
    |
    v
replace model path with deterministic function
```

This creates a system that becomes **less dependent on model calls as workflows mature**.

That is a major differentiator.

---

# 22. Proposed Build Phases

These are architectural phases, not calendar commitments.

## Phase 1 — Formalize What Already Exists

- capability inventory
- harness inventory
- model+harness identity
- routing telemetry schema
- architecture documentation
- current flow diagrams
- preserve all existing behavior

Deliverable:

> Maestro understands what capabilities it currently possesses.

---

## Phase 2 — Deterministic Pre-Router

- add T0/T1 routing
- bypass LLM triage where possible
- fall back safely
- measure savings
- expose route reasoning

Deliverable:

> Maestro can decide that no model is needed.

---

## Phase 3 — Compute-Aware Auto

- introduce quality/cost/privacy/latency policy
- choose local vs cloud based on evidence
- support task-specific rules
- collect outcome telemetry

Deliverable:

> Auto becomes an intelligence scheduling policy.

---

## Phase 4 — Reputation Routing

- model+harness reputation
- task/domain specialization
- top-k Council selection
- disagreement-driven deliberation

Deliverable:

> Maestro stops treating every agent as equally suitable.

---

## Phase 5 — Local Intelligence

- local inference adapters
- local specialists
- local RAG
- domain tools
- privacy-aware routing
- frontier escalation

Deliverable:

> Maestro can operate meaningful workflows without frontier dependence.

---

## Phase 6 — Adaptive Optimization

- learn from Grading Lab
- recommend route changes
- identify functions that can replace LLM work
- detect underperforming wrappers
- detect tasks where frontier models add no value
- detect tasks where frontier escalation materially improves quality

Deliverable:

> Maestro improves its orchestration based on measured performance.

---

# 23. Potential Differentiators

The project should avoid competing merely on:

- number of models
- number of agents
- number of integrations
- chatbot UX
- generic "AI automation"

Those will commoditize quickly.

Potential meaningful differentiators:

## 23.1 Minimum Sufficient Intelligence

Maestro optimizes for capability sufficiency rather than maximum model power.

---

## 23.2 Model + Harness Reputation

Maestro measures the actual execution system rather than assuming the model name determines quality.

---

## 23.3 Deterministic Substitution

Maestro actively removes AI from workflows when AI is no longer needed.

---

## 23.4 Local-First Escalation

Private/local execution is preferred where capable; frontier intelligence becomes a selective advisor rather than the default runtime.

---

## 23.5 Observable Routing

Users can see:

- what handled the request
- why
- what it cost
- what alternatives existed
- why escalation occurred

---

## 23.6 Persistent Identity Above Models

A user interacts with Fable, Astra, or another stable identity while underlying models change freely.

The assistant is the product.

The model is infrastructure.

---

## 23.7 Council as Evidence-Based Escalation

Multi-agent debate occurs because evidence says multiple perspectives are useful, not because "more agents" sounds impressive.

---

# 24. Future Organizational Deployment Model

A future Maestro deployment could look like:

```text
Organization Maestro
    |
    +-- deterministic business functions
    +-- internal tools
    +-- local knowledge/RAG
    +-- local general model
    +-- domain specialists
    +-- cloud efficient models
    +-- frontier advisor
    +-- Council
    +-- human approval
```

Examples:

- school board
- software company
- dental office
- legal practice
- engineering company
- household
- individual researcher

The architecture remains consistent.

The capability registry changes.

---

# 25. The Business Thesis

The company should not necessarily sell:

> custom models

It may instead sell:

> **custom intelligence systems**

A customer-specific system may contain:

- zero fine-tuning
- RAG
- tools
- local models
- adapters
- workflows
- memory
- policy
- local data
- frontier escalation

Fine-tuning is one tool, not the product.

Possible positioning:

> We build private intelligence systems that understand your environment, use local capabilities wherever practical, and invoke expensive frontier intelligence only when it adds measurable value.

---

# 26. Design Rules

The Council should treat the following as proposed invariants and challenge them only with explicit reasoning.

### Rule 1

If deterministic code can reliably solve a problem, prefer deterministic code.

### Rule 2

Do not invoke a frontier model merely because one is available.

### Rule 3

Model intelligence does not grant execution authority.

### Rule 4

Harness capability must be explicit.

### Rule 5

Measure model+harness performance, not model reputation alone.

### Rule 6

Council deliberation should be earned by uncertainty, disagreement, or value.

### Rule 7

Local execution should be preferred when quality is sufficient and policy favors privacy/cost.

### Rule 8

Escalation should be evidence-driven.

### Rule 9

Prompt provenance matters.

### Rule 10

Repeated AI behavior should be evaluated as a candidate for deterministic replacement.

### Rule 11

Auto must eventually mean minimum sufficient intelligence.

### Rule 12

The visible assistant identity should remain stable even when underlying infrastructure changes.

---

# 27. Questions for the Council

The Council should explicitly debate these rather than accepting this document uncritically.

1. Which parts of this architecture already exist under different names?
2. What is the correct boundary between Concierge and Intelligence Router?
3. Should routing and orchestration be separate subsystems?
4. What should the Capability schema contain in v1?
5. What dimensions of harness identity materially change performance?
6. How should Maestro represent a skill relative to a harness?
7. Which existing model calls can already be replaced by deterministic functions?
8. What telemetry is necessary before reputation-based routing is trustworthy?
9. How should task classes be defined without creating an unmaintainable taxonomy?
10. How should router confidence be calibrated?
11. When should the system deliberately choose multiple independent agents?
12. How should prompt provenance be represented?
13. What security boundary should exist between local models and privileged tools?
14. How should the revived GUI visualize routing without overwhelming the user?
15. Which local inference runtime should be supported first?
16. Should local models advertise capability dynamically?
17. What is the smallest useful implementation of Compute-Aware Auto?
18. How do we prove that the new router improves cost, quality, or latency?
19. What aspects of the proposal create genuine differentiation?
20. Which parts are fashionable complexity that should be rejected?

---

# 28. Immediate Council Assignment

The Council is not being asked to implement this entire document immediately.

First assignment:

## Review and Reconcile

Each participating agent should:

1. read this vision
2. compare it against the current Maestro architecture
3. identify what already exists
4. identify contradictions
5. identify unnecessary complexity
6. identify missing concepts
7. identify security concerns
8. propose a minimal architecture
9. propose the smallest useful implementation sequence
10. identify tests required before implementation

Agents should work independently before seeing each other's conclusions where practical.

After independent review:

- compare findings
- surface disagreements
- deliberate only where disagreement matters
- synthesize a revised architecture
- create implementation tasks

---

# 29. Recommended First Engineering Target

If the Council agrees with the direction, the first implementation should be deliberately small:

## Intelligence Router v0

Inputs:

```text
request
available_capabilities
policy
```

Outputs:

```text
selected_capability
reason
confidence
fallback
```

Initial routes:

```text
deterministic function
tool
current Concierge
```

No new local model work is required.

No learned router is required.

No complex scoring system is required.

Success criteria:

- existing behavior does not regress
- obvious deterministic/tool tasks bypass LLM classification
- routing decisions are logged
- decisions can be inspected
- fallback is safe
- tests prove deterministic behavior

Then collect data.

Do not predict the future architecture when Maestro can measure it.

---

# 30. Long-Term Vision

Maestro should become capable of receiving an arbitrary task and reasoning not only about **how to solve it**, but also about **what kind of intelligence should be allowed to solve it**.

A future request may be handled by:

- a function
- a cached answer
- a database
- an API
- a local tiny model
- a specialist model
- Fable
- a frontier model
- three independently selected Council members
- a human

The user should not need to know.

They should simply interact with their chosen persistent assistant.

Behind that identity, Maestro conducts the available intelligence.

That is the vision:

> **Do not send every problem to the smartest intelligence available.  
> Send every problem to the smallest capability sufficient to solve it reliably.  
> Measure the result.  
> Escalate when necessary.  
> Replace learned behavior with deterministic machinery when the problem becomes understood.**

Maestro began by conducting agents.

The next Maestro should conduct **intelligence**.

---

## Closing Directive to the Council

Treat this document as a hypothesis, not doctrine.

Preserve what already works.

Prefer measurable improvements over architectural fashion.

Do not introduce AI where software is sufficient.

Do not introduce distributed complexity where a function is sufficient.

Do not assume newer means better.

Do not assume larger means better.

Do not assume the same model is the same agent when its harness changes.

Build the instrumentation required to discover what is actually true.

Then let Maestro learn which intelligence deserves the baton.
