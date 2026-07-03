# Memo — Task 003: Launch Readiness

## 1. Honest read

Maestro is not a public product yet; it is a powerful, opinionated build orchestrator that still serves its builders better than a stranger. The codebase has real depth: deliberation-aware synthesis is finally deployed, MaestroClaw can execute locally, the thread-first Claw shell exists, personas are wired, security gates are designed, and CI/lint are clean. Recent state is healthier than most prototypes at this stage.

But the graph tells the truth: 68 communities, very low cohesion, a 99-edge `useMaestro()` god context, two import cycles in MaestroClaw, and — most importantly — no reputation/scoring community. The empirical grading loop that the philosophy calls "the engine" is still mostly aspiration. Operational State lists active blockers (Sonnet timeouts), unscoped `agent_query` reads, replayable HMAC tokens, `approved-shell` injection risk, and an untested Claw→GitHub artifact bridge. A stranger could probably get something to run, but only with BYOK setup, manual GitHub App install, tolerance for split chat/workspace build UX, and hand-holding.

## 2. The one thing I'd do next

Freeze all new surfaces and run a single clean "stranger journey": a fresh user, fresh machine, fresh repo, no docs, no coaching, attempting one chat-to-local-build-to-PR flow. Instrument every drop-off. Then fix only the blockers it surfaces.

That almost certainly means finishing the trust spine first: the c-06 Conductor wiring/reconcile fix, hardened `approved-shell`, scoped `agent_query`, non-replayable HMAC approval tokens, and a one-command local executor setup. Do not build mobile. Do not build Rate v1. Do not launch. Make the current surface honest before expanding it.

## 3. Ready to show the world?

**Not yet.** Maestro can impress in a demo, but a public launch invites users who will hit the manual GitHub App install, missing real-time streaming, the split Claw/BuildWorkspace build UX, untested artifact bridges, and security rough edges. Launching now would convert genuine technical differentiation into churn and skepticism.

My answer flips when a new user can sign up, add keys, run a council build locally, review the output, and push a PR without reading a wiki or filing a support issue.

## 4. Biggest thing they're missing

The closed empirical loop. Maestro's whole thesis is that composition beats single models because the system learns from graded outcomes. Right now that loop is hand-operated: grading exists in experiments, not as live routing. The graph confirms there is no reputation/scoring community; State calls Rate "net-new." Until graded outcomes automatically reshape roster, persona, and lane choices, Maestro is a configurable multi-model UI, not a self-improving council. The blind spot is mistaking the presence of a grading UX for a learning system.