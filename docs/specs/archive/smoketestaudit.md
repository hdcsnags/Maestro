# Maestro — Build Reliability Audit
### April 2026
### For: Codex (WSL), Claude Code, Opus 4.6, and the council

---

## Executive summary

Maestro has crossed an important threshold: it can now progress from analysis through design, pre-build, build execution, GitHub PR creation, backup branch creation, handoff tracking, and bouncer review. The engine is real.

The next reliability problems are not “can it build at all?” but:

1. Build prompts are too monolithic and waste tokens  
2. Builder roster selection is too naive  
3. Fallback / failover logic is weak or absent  
4. Build progression is too synchronous and too opaque  
5. New-repo bootstrap and session-bound repo state still need hardening  
6. Concierge needs to become a live build coordinator, not just a pre-build guide

This document is the focused audit and the recommended fix path.

---

## What we now know from live testing

### Confirmed working
- Phase progression can reach Build and Bouncer
- Real files are written to GitHub
- Pull requests are created
- Backup branch creation works
- Handoffs are tracked
- Bouncer returns structured findings
- Build reports are generated and downloadable

### Confirmed weak points
- Build can appear stuck until refresh
- Repo state can carry over unexpectedly between sessions
- Design preview reliability is uneven
- Some builders write 0 files without clear reroute behavior
- Dead / overloaded providers still participate too long before being treated as failed
- Empty repo bootstrap still appears brittle in some paths
- Build payloads appear too large and too stale for reliable multi-agent generation

---

## Clarification on “Round 2” in build payloads

The current payload structure appears to be carrying forward context that looks like:
- prior session context
- latest synthesis
- earlier round outputs
- possibly “Round 2” style artifacts

In actual user flow, the conductor is not manually doing a second round during build preparation. The typical path is:

1. Broadcast  
2. Concierge synthesis  
3. Accept  
4. Design pass  
5. Select / test design  
6. Pre-Build  
7. Scaffold / Architect / lanes  
8. Build

So the issue is not literally “the user ran Round 2.” The issue is that the build payload is carrying stale or over-broad conversational context that behaves like multi-round baggage.

---

## Root causes

## 1. Build prompts are overstuffed

Each builder is receiving too much context:
- prior session synthesis
- earlier error messages
- global architecture
- full file tree
- all agent lanes
- all known risks
- all do-not-touch rules
- sometimes old provider failure text

That means a lane-specific builder is spending tokens re-reading irrelevant information before it ever reaches its actual scope.

### Why this is bad
- higher latency
- higher timeout risk
- more cost
- more context noise
- worse build quality
- stale errors bleeding into active work

### Desired correction
Move from one monolithic architect/build prompt to **lane-scoped prompt slicing**.

Each builder should get:

#### Shared for all builders
- short project summary
- global security constraints
- non-negotiable do-not-touch rules
- build intent
- continuation / manifest rules

#### Per-builder only
- that lane’s paths
- relevant subtree of the file structure
- relevant risk notes
- relevant design or scaffold notes
- relevant handoff references only

No builder should receive the full world unless it truly owns the full world.

---

## 2. Stale failure context is bleeding into build

Build payloads currently appear to carry old provider failures and prior round noise into the active build request.

Examples:
- “Could not reach Claude Sonnet 4.6”
- “Could not reach GPT-OSS 20B”
- “Gemini is under high demand”

Those details may be useful for orchestration memory, but they are **not** useful inside the builder prompt itself.

### Desired correction
Build mode should carry only:
- latest accepted concierge synthesis
- final design choice / design brief
- pre-build scaffold / architect slice
- lane assignment
- current model health state

It should **not** carry old failed outputs as prompt prose.

---

## 3. Builder roster and lane assignment are too weak

The roster currently feels too automatic and too broad.
The conductor is seeing too many builders on projects that do not justify that many active lanes.

There are also lane assignments that do not always feel sensible for the actual work.

### Core problem
Concierge is assigning builders without enough intelligence around:
- project size
- project type
- provider health
- cost
- actual lane necessity
- whether a lane can be merged or simplified

### Desired correction
Concierge should assign a build roster from a smaller decision tree:

#### Small project
- 1 builder
- optional reviewer

#### Standard project
- 2 builders
- 1 reviewer / verifier

#### Complex project
- 3 builders
- 1 reviewer
- optional bouncer

#### Exploration / large architecture
- 4 builders maximum
- only if clearly justified

Default should be fewer builders, not more.

---

## 4. No reliable fallback matrix exists yet

When a builder fails because of:
- missing key
- provider outage
- model overload
- timeout
- repeated 504s

…the system does not yet reroute cleanly enough.

### Desired correction
Add a **provider health + fallback matrix** before and during build.

For each lane:
- primary model
- alternate same-role model
- emergency fallback model
- reviewer downgrade if needed

Example:
- Sonnet unavailable → Sonnet OR / Opus / GPT builder fallback
- Gemini overloaded → alternate design-capable model
- Kimi unavailable → Qwen / GPT-OSS / other reasoning fallback
- reviewer missing → degrade reviewer, do not kill build

This must happen:
- before build starts
- and during build if a model fails mid-flight

---

## 5. Build is too synchronous

The current UX strongly suggests the browser is still waiting too closely on orchestrate/build generation to finish in a single request/response loop.

That is why:
- 504s feel like hard failures
- refresh sometimes “fixes” the flow
- progress feels ambiguous
- state awareness lags behind reality

### Desired correction
Build needs to become **asynchronous at the orchestration level**.

Ideal flow:
1. build job created
2. per-agent tasks queued
3. agent results written as they land
4. UI polls or streams progress
5. failures reroute or mark lane degraded
6. review becomes available as soon as enough work exists

That means:
- one timed-out agent does not make the whole build feel dead
- UI can show partial progress truthfully
- refresh becomes unnecessary

---

## 6. Loading / progress state is too weak

The conductor needs better visibility into what is happening.

Examples of missing clarity:
- bouncer running without a visible “working” state
- build feeling stalled even though the backend later completed
- no clear distinction between waiting on provider, rerouting, writing to GitHub, reviewing, or blocked

### Desired correction
Introduce richer build states, such as:
- queued
- dispatching builders
- waiting on provider
- rerouting
- partial results landed
- ready for review
- writing to GitHub
- handoff created
- bouncer running
- bouncer findings ready

And expose these to the user cleanly.

---

## 7. Concierge should become a live build coordinator

Concierge is already valuable before build.
The next evolution is to make Concierge useful **during** build.

### Desired behavior
Concierge should be able to say:
- “2 of 4 builders responded”
- “Gemini is overloaded; reroute to fallback?”
- “Claude key missing; skipping frontend lane”
- “Build can continue with reduced roster”
- “Bouncer is reviewing now”
- “One lane handed off due to scope”

This can be:
- automatic for safe reroutes
- user-approved for cost-escalation reroutes
- visible in a side chat / status layer during build

This is a major product upgrade.

---

## 8. Scaffold generation should not feel manual

Right now the conductor still feels too responsible for pressing “Generate Scaffold” and similar steps that should already be implied by prior approval.

That makes the system feel procedural instead of intelligent.

### Desired correction
Once the user accepts:
- the synthesized direction
- the selected design or no-design path
- the repo / project choice

…Concierge should begin scaffold / architect work in the background automatically.

The user can still see and approve outputs, but they should not feel like they are micromanaging every mechanical transition.

---

## 9. New repo bootstrap still needs hardening

There is evidence that new repo flows can still hit:
- inherited repo state
- empty repo execution failures
- weird “new app” / previous repo crossover behavior

### Desired correction
For new project flow:
1. create repo
2. create initial bootstrap commit (`README.md`, `.gitignore`, optional `.env.example`)
3. bind repo to session explicitly
4. only then allow build execution

For existing project flow:
1. select repo
2. bind repo to session explicitly
3. backup branch immediately
4. run intake
5. proceed

No session should inherit repo state from another session.

---

## 10. Bouncer should become intent-aware

Current Bouncer is behaving like a production security reviewer.
That is correct for a production app, but not always for an intentionally vulnerable training lab.

For a CTF / vulnerable-by-design lab, Bouncer should not just “ignore criticals.” It should distinguish between:

### Allowed pedagogical vulnerability
- XSS
- SQLi
- IDOR
- CSRF
- JWT mistakes
- unsafe preview route patterns
- deliberately insecure challenge routes

### Containment-critical issue
- real secrets
- real outbound SSRF reachability
- real metadata access
- real OS execution
- public exposure
- non-isolated network
- real user data
- dangerous deployment defaults

### Desired correction
Add **review profiles**:
- production_app
- training_lab
- security_ctf
- internal_demo

Then let Bouncer reclassify based on intent:
- expected
- informational
- spec violation
- containment-critical

Containment-critical should remain critical in all modes.

---

## Recommended implementation order

### Phase 1 — Reliability hardening
1. Fix session-bound repo state
2. Fix build-stage restoration / refresh behavior
3. Add initial repo bootstrap commit for new repos
4. Improve loading/progress states
5. Add explicit provider health checks before build

### Phase 2 — Smarter orchestration
6. Lane-scoped architect/build prompt slicing
7. Strip stale round/error context from build payloads
8. Reduce default builder roster sizes
9. Add provider fallback matrix
10. Let concierge initiate scaffold generation automatically after approval

### Phase 3 — Better live coordination
11. Make build asynchronous at orchestration level
12. Add live Concierge progress / reroute UX
13. Improve handoff visibility
14. Improve bouncer loading and review moment UX

### Phase 4 — Intent-aware review
15. Add Bouncer review profiles
16. Distinguish pedagogical flaws from containment failures
17. Make training-lab findings spec-aware

---

## Specific audit items to log now

These should be tracked immediately as active reliability issues:

- New app may inherit prior repo state
- Build stage may not restore cleanly on refresh
- Build progression can appear stuck until refresh
- Bouncer lacks visible loading/processing state
- Some builders respond with 0 files and no immediate reroute
- Provider health is not being used aggressively enough before dispatch
- Build payload contains stale / oversized context
- New repo execution path still brittle if bootstrap/init step is not guaranteed
- Bouncer findings need intent-aware review profiles for training-lab builds

---

## Design principle update

The biggest principle reinforced by this audit is:

**Parallel minds, serialized writes.**  
And now a second one:

**Reason anywhere. Execute where friction is lowest.**

For Maestro itself, that means:
- fewer builders by default
- scoped prompts
- explicit reroutes
- clear build states
- strong containment
- live coordination through Concierge

---

## Final verdict

Maestro is now a real orchestration system. The remaining problems are not conceptual. They are reliability, clarity, and orchestration-discipline problems.

That is good news.

The next leap is not “more features.”
It is:
- less prompt waste
- smarter lane assignment
- better provider failover
- better state restoration
- and an intent-aware Bouncer

That work will make Maestro feel not just powerful, but trustworthy.
