# Maestro — What’s Next Handoff
### Consolidated status, findings, and next actions
### Prepared for Claude / council continuation
### Date: 2026-04-12

---

## 1. Executive summary

Maestro has crossed from concept into a functioning orchestration product.

It now has a real end-to-end path that can:
- route a project through phased flow,
- generate scoped builder responses,
- write real files to GitHub,
- open a real pull request,
- create a backup branch,
- surface handoffs,
- and run a structured bouncer review.

The latest successful build run produced **20 files written, 1 skipped, 0 collisions, and 1 handoff**, with a real pull request and backup branch generated. The skipped file was correctly marked out-of-scope and handed off instead of being force-written. fileciteturn21file0

This is major progress.

The next frontier is no longer “can Maestro work?”
It is:
- making the product easier to enter,
- making phase transitions clearer,
- tightening build governance,
- and teaching the review system to understand project intent.

---

## 2. Biggest milestone reached

### What is now proven

Maestro now has a real execution loop, not just a council/synthesis loop.

Verified outcomes from the successful run:
- Build phase progressed to completion.
- GitHub received real changes.
- A real PR was created.
- A backup branch was created.
- A handoff was surfaced.
- A build report was generated.
- A bouncer review was generated.
- Scope enforcement worked: one out-of-scope file was skipped and handed off instead of being written. fileciteturn21file0

### Why this matters

This means Maestro is no longer just a “society of mind” concept or planning interface.
It is now a functioning build orchestration system.

---

## 3. Major architecture / product lessons learned

### 3.1 Parallel minds, serialized writes

This emerged as one of the clearest operating principles for the whole project.

**Meaning:**
- multiple agents can think in parallel,
- but writes must remain serialized per file lane / ownership boundary.

This principle should become part of Maestro’s doctrine and user/build documentation.

### 3.2 Shared judgment, scoped execution

A related principle that became clearer through the live work:
- reasoning can be broad,
- execution must be governed.

The conductor can trust the council’s reasoning while still constraining how code is written.

### 3.3 Choose the best operator, not just the best thinker

One major operational lesson from the auth-fix sprint:
- the best reasoning model is not always the best execution tool,
- environment friction matters,
- Windows/PowerShell/sandbox issues can make the “smartest” model the wrong operator for a given lane.

Going forward, tool selection should account for:
1. reasoning quality,
2. repo familiarity,
3. environment competence,
4. approval friction,
5. deploy/runtime access.

The corrected orchestration lesson:
**Reason anywhere. Execute where friction is lowest.**

---

## 4. Concierge doctrine learned from the live parallel sprint

A dedicated lessons document was created from the first real two-agent parallel sprint. It identified three critical rules for Concierge prompt generation: fileciteturn19file0

### Rule 1 — Split dependency language
Do not say “wait for X.”
Instead say:
- do this independent work now,
- wire the dependent portion after signal Y.

This avoids false deadlocks where one agent pauses unnecessarily. fileciteturn19file0

### Rule 2 — No urgency language
Do not tell agents “as fast as possible,” “ASAP,” etc.
Urgency wording adds noise and can subtly encourage corner-cutting. fileciteturn19file0

### Rule 3 — One prompt per agent
When multiple agents need instructions, output one prompt per agent.
The conductor should approve and send, not parse and split a combined message. fileciteturn19file0

### Proposed Rule 4 — Explicit signal contracts
This should be added next.
Concierge output should include:
- Agent
- Instruction
- Can start now: yes/no
- Waiting for: exact signal name
- Deliverable now
- Deliverable after signal
- Done when

This will reduce human interpretation overhead even further.

---

## 5. Current product identity clarification

A major insight from demoing Maestro and using it live:

### Maestro should not start as a build tool.
It should start as a **council**.

The better front-door model is:
- **Ask**
- **Build**

For many users, especially non-build users, Maestro should work as a room of professionals:
- ask a question,
- route through concierge,
- optionally escalate to council,
- get a synthesized, enriched answer.

Examples:
- parenting / sleep training
- research brainstorming
- decision support
- multi-perspective explanations

Then, when a discussion becomes execution-oriented, Concierge can say:
> “This seems like it’s moving from discussion into execution. Want me to turn it into a build flow?”

This is a major product opportunity.

### Product identity in one line
**A council for thinking. A concierge for guiding. An orchestra for building.**

---

## 6. Home / entry experience insight

Current demos still show too much machinery too early.
Feedback from DevOps/senior technical viewers made it clear that Maestro’s capability is impressive, but the entry point still feels power-user heavy.

### Core issue
The app still behaves too much like a power tool when it should feel like a great host.

### Corrective product direction
Use progressive disclosure:
- novice sees one clean entry point,
- intermediate user can “show council,”
- advanced user can open the orchestra,
- power user can use drawers, overrides, lanes, and deeper controls.

The biggest missed opportunity identified:
**Ask mode and Build mode should be separate front-door paths.**

---

## 7. Phase model — where Maestro is headed

A clearer phase flow has emerged across the council docs and follow-up corrections.

### Recommended macro-flow
1. Ask / initial prompt
2. Concierge routing
3. Council (if needed)
4. Concierge synthesis
5. Optional Design Phase
6. Pre-Build
7. Build Spec Freeze
8. Scoped Build
9. Bouncer Review
10. Report / next step

### Important correction
**New project vs existing project belongs in Pre-Build, not Build.**
This was already the right direction and should stay that way. fileciteturn17file0turn18file0turn18file1

---

## 8. Design phase conclusions

The council converged on an important refinement:

### Design should be conditional, not mandatory.
Do not always run four designers.

Recommended structure:
- **Design Lite**: 1 designer + Concierge
- **Design Standard**: 2 designers + Concierge
- **Design Exploration**: 4 designers + Concierge

Use four designers only for:
- high-importance visual work,
- branding,
- consumer-facing UI,
- or explicit user request.

### Recommended designer concept
Think in **design roles**, not hardcoded model names:
1. Visual / Spatial Lead
2. Structure / UX Systems Lead
3. Product / Practicality Lead
4. Wildcard / Fusion Lead

The registry can decide which actual model fills each role.

---

## 9. Pre-Build conclusions

Pre-Build is now clearly the missing intelligence and governance layer.

It should own:
- new vs existing project path,
- repo creation or selection,
- Supabase connection,
- intake scan,
- initial backup branch/tag,
- architecture doc generation,
- file tree,
- scoped lane assignment,
- selected builder roster,
- selected bouncer roster,
- budget estimate,
- build spec freeze.

### Spec freeze is mandatory
Pre-Build must end with a locked build contract.
This is not just a UI state.

Needed build spec contents:
- project type,
- repo,
- Supabase target,
- file tree / structure plan,
- agent lanes,
- builder roster,
- bouncer roster,
- security constraints,
- allowed handoffs,
- budget estimate,
- locked state.

This was one of the main missing enforcement pieces identified in the addendum. fileciteturn17file0

---

## 10. Build phase conclusions

### What is working now
- builder lanes exist,
- responses can be reviewed,
- builds can execute,
- files can be written,
- PRs can be opened,
- backup branches can be created,
- handoffs can be surfaced,
- bouncer can run afterward.

### What still needs refinement
- some builders may write 0 files,
- build status and progress need clearer visibility,
- some earlier moments likely reflected **state awareness / UI progression issues**, not core engine failure,
- users need more confidence feedback that work is happening.

### File leases / collision handling
Collision detection and scope governance are essential and already part of the direction. The rule remains:
- no two agents write the same file at the same time,
- collisions are blocked or partialized,
- handoffs are explicit.

---

## 11. Bouncer insight — the big new realization

A major realization happened during the first successful end-to-end build.

The project being built was intentionally vulnerable by design:
- CTF-style,
- meant to teach DevOps/family secure coding by showing what poor coding can cause,
- intentionally including PortSwigger-style vulnerability classes.

The current bouncer findings were therefore flagging many of the exact flaws the lab was supposed to include.

### This means:
Bouncer is **not broken**.
Bouncer is behaving like a **production security reviewer**.

The mismatch is between:
- **project intent** = training lab / vulnerable-by-design
- **review profile** = production-safe review

### Correct next evolution
Do **not** make bouncer blindly ignore criticals.
Instead, make bouncer **intent-aware**.

#### Proposed review profiles
- `production_app`
- `training_lab`
- `security_ctf`
- `internal_demo`

#### In training / lab mode
Expected vulnerabilities should become:
- allowed,
- informational,
- or “lab-approved”

#### But some things must remain critical in all modes
Even for a training lab, bouncer should still treat these as critical:
- real secrets or API keys,
- outbound SSRF to real internet / metadata services,
- lack of containment,
- public exposure without gating,
- real user data,
- host escape risk,
- real infrastructure compromise risk,
- insecure lab flaws that are not actually sandboxed.

### Clean principle
**Allowed teaching flaws ≠ allowed containment failures**

This should become a major next-sprint feature:
**Intent-Aware Bouncer / Review Profiles**

---

## 12. Auth model fix — major resolved blocker

A major blocker around Supabase Edge Function auth was resolved.

### Root cause
Maestro had been split between:
- old gateway JWT enforcement,
- and manual frontend fetch/header paths.

After moving to Supabase JWT Signing Keys, protected functions were failing with gateway-level:
`{"code":401,"message":"Invalid JWT"}`

### Correct fix direction
The system was moved to the current recommended model:
- protected edge functions no longer depend on gateway verify_jwt,
- auth is enforced inside the function using a shared helper,
- frontend protected calls now use `supabase.functions.invoke(...)`,
- valid session auth now passes,
- missing auth now fails cleanly in-function.

### Verified outcome
Codex reported:
- shared auth helper added,
- all 14 protected functions moved to in-function auth,
- remaining raw fetch callers removed for protected paths,
- `npm run typecheck` passes,
- live smoke passed for both missing-auth and valid-session cases,
- `MAESTRO_STATE.md` updated with the new auth model.

This should be treated as a major resolved infrastructure issue.

---

## 13. Internal operating docs — good decision

Two important internal docs were created and are strong foundations:
- `MAESTRO_STATE.md`
- `AGENTS.md` fileciteturn20file0turn20file1

### Why they matter
They reduce cold-start confusion for any agent and turn Maestro from tribal memory into a project with operating discipline.

### Strong qualities already present
- stable architecture vs operational state separation,
- verification dates,
- append-only session log,
- source-of-truth hierarchy,
- agent workflow rules,
- lock discipline,
- non-obvious decision archive. fileciteturn20file0turn20file1

### Recommended additions
1. Add **parallel minds, serialized writes**
2. Add **shared hot files** warning section
3. Keep the new auth model in Non-Obvious Decisions
4. Add a smoke-test checklist
5. Add a session-log template

These docs are working and should continue evolving.

---

## 14. Tooling / manual council conclusions

### Key lesson
The best thinker does not automatically get the keyboard.

The auth migration exposed an important orchestration lesson:
- a model can reason well,
- but still be the wrong operator in a given terminal/runtime environment.

### Updated manual team rule
Use the agent that best matches:
1. reasoning quality,
2. repo familiarity,
3. environment competence,
4. approval friction,
5. deploy/runtime access.

### Practical manual orchestration model
- **Claude Code**: Supabase, migrations, edge functions, backend/runtime truth
- **Copilot / Opus**: large bounded UI/frontend lifts
- **Sonnet / smaller passes**: cleanup, follow-up fixes, local patching
- **Codex**: strong repo reading, audits, auth reasoning, targeted edits when environment friction is low

This should inform future conductor decisions.

---

## 15. What still feels rough / known UX gaps

The big engine works, but confidence UX is still behind.

### Known rough edges surfaced in live use
- build progression sometimes needed clearer state awareness,
- some earlier “stuck” states may have been UI awareness issues,
- design preview was flaky earlier in the run,
- bouncer has no visible loading / processing state,
- build review / continue / execute transitions need to feel more obvious,
- phase handoff clarity still needs work,
- front door is still more complex than it should be for novice users.

### Short version
The engine is ahead of the interface.

---

## 16. Rebuild / audit items to carry forward

### Build / flow rebuild audit
Flag these for dedicated later review:
- design artifact preview reliability,
- Pre-Build clarity and repo setup UX,
- Build review → approve → continue progression,
- GitHub integration choke points,
- dead-end states where the conductor is unsure what to do next,
- state synchronization after phase transitions,
- bouncer loading/processing state.

### Product simplification audit
- Ask vs Build entry point,
- progressive disclosure,
- Concierge as the always-visible face,
- “show council” as optional,
- user-safe project memory layer.

---

## 17. Suggested immediate next steps

### Priority 1 — Document this milestone cleanly
Update state/session docs with:
- first real end-to-end build success,
- PR created,
- backup branch created,
- bouncer review generated,
- known UX gaps.

### Priority 2 — Add intent-aware bouncer
Teach bouncer to distinguish:
- intentional pedagogical vulnerability,
- vs dangerous containment failure.

### Priority 3 — Improve confidence UX
Add visible processing/loading states for:
- bouncer,
- phase transitions,
- build progression.

### Priority 4 — Simplify the front door
Introduce:
- **Ask**
- **Build**

Let Concierge route beneath that.

### Priority 5 — Formalize review profiles and build spec intent
Add project intent and expected vulnerability families to Pre-Build / build spec.

### Priority 6 — Keep collecting doctrine from live runs
Each real sprint is teaching Maestro how it should behave.
Keep converting those lessons into:
- Concierge rules,
- bouncer rules,
- build governance,
- user-facing simplifications.

---

## 18. Short message to Claude / council continuation

Maestro is now materially farther along than the earlier council docs assumed.

The core orchestration engine has proven that it can:
- move through phased flow,
- write real code to GitHub,
- create PRs,
- respect scope,
- surface handoffs,
- and run a bouncer review.

The biggest open work is no longer “can it build?”
It is:
- intent-aware review,
- cleaner phase confidence UX,
- stronger Pre-Build governance,
- and a much simpler front door for real users.

The project has crossed from imaginative prototype into working orchestration system.
Now it needs refinement, trust, and humane product shaping.

