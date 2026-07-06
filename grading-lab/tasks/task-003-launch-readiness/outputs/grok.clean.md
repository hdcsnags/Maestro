# Council Memo — Launch Readiness (Task 003)

## 1. Your Honest Read

Maestro is a **credible power-user orchestration prototype**, not the empirically adaptive council its philosophy claims. The evidence is structural: the knowledge graph shows orchestration, deliberation, build execution, and MaestroClaw — but **no reputation or scoring community**. The Conductor module is an island, unwired to the iteration runner. The grading loop — called "the engine" — lives in docs and a grading-lab experiment, not in the product.

What works is real and non-trivial. Council broadcast, deliberation-aware synthesis (deployed v14, verified June 9), the thread-first Claw shell, local executor round-trips, and Build v2's proven 76/76-task PR path demonstrate serious engineering. CI is green. A technical user with BYOK, GitHub OAuth, and tolerance for setup can run multi-model rounds, deliberate, synthesize, and push code.

The gap between claim and stranger-usable product is large. The north star — compositions that improve from graded outcomes — does not exist in runtime. Security debt from the June audit (`approved-shell` injection, replayable HMAC tokens, unscoped `agent_query`) still sits on a prototype trust chassis. Claw's artifact→GitHub bridge is untested through Pre-Build UI. Sonnet timeouts on artifact-heavy prompts remain an active blocker. Mobile and consumer surfaces are roadmap only.

**Product / functional:** Maestro delivers orchestrated multi-model labor for operators who already think in councils. It does not yet deliver learning which compositions win.

**UX / flow:** The unified composer (Direct / Council / Execute / Build) helps, but cognitive load stays Conductor-grade. A new user must configure keys, bind a repo, and choose routing modes before the magic moment — three models disagreeing, then a sharp synthesis. That payoff is buried. Claw chat partially hides complexity, but chat and BuildWorkspace still split capability and review depth. Streaming is visual-only; progress arrives in chunks. Power users can learn the flow; strangers bounce at setup or mode confusion.

**Go-to-market:** Months from a broad public launch. Weeks from a **narrow builder preview** if scoped honestly: multi-model deliberation plus local Claw builds, BYOK, rough edges expected. Launching now with the v3 philosophy narrative oversells and attracts users who will feel misled. The story says the council learns; the product does not learn yet.

## 2. The One Thing I'd Do Next

**Ship the thinnest possible grading loop end-to-end: one schema, one blind post-round grade, one routing decision that consumes it.**

After a council round, persist blind peer grades keyed on **resolved model plus harness** (the grading-lab lesson: CLI wrapper ≠ model identity). Use that history to reorder the default builder roster on the next build in the same session. One consumer, one closed loop, one UI signal that a lane "earned its seat."

Security hardening and Claw→GitHub E2E matter, but without a grading signal Maestro competes on UI against lighter multi-agent tools with a heavier setup tax. The moat is operational knowledge encoded as runtime adaptation. Prove that in-product before widening the surface. Run trust-spine fixes in parallel; do not let them block the first grade write.

## 3. Ready to Show the World?

**Not yet.**

**What changes my answer:** A cold user, without Conductor coaching, completes one documented golden path — connect GitHub, run a council round on a real question, deliberate, synthesize, trigger a local build, open a PR — in under 45 minutes, with **at least one routing decision visibly informed by a stored grade**. Until then, show Maestro only in controlled demos to multi-model power users who understand it is an alpha proving a loop, not a finished product that learns.

## 4. Biggest Blind Spot

**Optimizing council machinery while the moat is composition quality over time.**

The team invests in lanes, cards, drawers, and Conductor plans — but the insight is *which models, together, for this task type, improved last time*. Users do not want a boardroom; they want better output faster. The hosted surface exposes the theater; the philosophy correctly says the consumer surface should hide it. Without grades feeding routing, Maestro reads as complexity for its own sake. Build the invisible flywheel first; then decide how much council to show.