# Task-003 Round 2 — Deliberation Summary

*First deliberation round run in the grading lab (2026-07-02→03). Each worker saw
its own round-1 memo (labeled) + the other four anonymized (shuffled), with
round-1 rankings deliberately withheld to prevent bandwagon bias. Each produced a
peer assessment + a revised memo with a mandatory "what changed" note.*

## Round-1 positions (prescription only; readiness was unanimous "not yet")

| Model | Round-1 next-step bet |
|-------|-----------------------|
| copilot (fable-5) | Ship Rate v1 now, freeze new surface — **moat-first (solo)** |
| codex | No new system; make one narrow loop work for a stranger, instrumented |
| copilot-gpt54 | Close "present in code" vs "lived path" gap (E2E Claw, split UX) |
| grok | Usability/trust-first — operator path before learning-which-wins |
| kimi | Usability/trust-first — fix install/streaming/UX/security |

**Round-1 shape: 4-vs-1.** Four leaned usability/trust-first; only Fable led moat-first.

## Round-2 positions (after seeing peers)

| Model | Moved? | Revised bet |
|-------|--------|-------------|
| copilot (fable-5) | **Held core, moved scope+mechanism** | Thinnest in-product grading loop — but run it on the **council Q&A corridor, NOT the build path**; dropped the full 6-week plan for a minimal loop |
| codex | **Moved toward Rate** | One "proof wedge": prompt→council→synthesis→blind grade→**one visible routing change**→optional hardened build→PR. Smallest Rate v1, one decision |
| copilot-gpt54 | **Moved toward Rate** | One "proof-grade golden path with the first closed empirical loop" — repo→build question→council→synthesize→local build→PR→blind grades→one routing change |
| grok | **Held core, absorbed sequencing** | Grading loop is the moat, but trust spine + stranger-instrumented golden path are now explicit **prerequisites**, not parallel work |
| kimi | **Held, sharpened** | Instrumented "stranger journey" on a fresh machine; finish trust spine first (c-06, approved-shell, agent_query, HMAC) |

## The two headline results

1. **Strong convergence.** Round 1 was 4-vs-1. After deliberation, the council
   collapsed toward a shared synthesis: **"ship ONE instrumented wedge that also
   closes the first empirical grading loop (blind grades keyed on resolved model
   + harness → one visible routing change), and freeze everything else."** codex,
   gpt-5.4, and grok all explicitly folded Rate/blind-grading into their single
   wedge; Fable folded the peers' "de-risk / prove-with-a-stranger / go thin"
   framing into its moat bet. Convergence by mutual refinement, not by everyone
   deferring to one voice — each named the specific peer argument that moved them.

2. **One crisp, isolated, decision-relevant dissent emerged that did NOT exist in
   round 1.** Four models converged on the **build-to-PR corridor** as the golden
   path. Fable uniquely **rejected** it: that corridor runs through the untested
   Claw→GitHub bridge, manual GitHub App install, and prototype-grade shell trust,
   so proving the loop there couples the moat to the riskiest infra. Fable's
   counter: run the first grading loop on the **council Q&A flow**
   (prompt→deliberate→synthesize→blind grade→roster reorder), which needs none of
   that. This is a genuine minority insight that only surfaced once the council
   could see where the majority was converging.

## The decision this leaves the builder

Not "Rate vs. usability" anymore — the council dissolved that. The live question is
now **which corridor proves the first loop:**
- **Build-to-PR** (codex, gpt-5.4, grok, kimi) — proves the whole value chain and
  the untested infra at once; higher stakes, higher payoff.
- **Council-Q&A** (Fable) — proves the moat cheaply and independently of the build
  infra; lower stakes, decouples the flywheel from the trust-spine timeline.

Both are testable. This is the kind of sharp, grounded fork a synthesis layer
should surface — and the deliberation round produced it where round 1 could not.

## Method note
Deliberation behaved as designed: no collapse toward the loudest voice, no
conformity cascade (rankings were withheld), and every model updated on argument,
citing it. Convergence + one sharpened dissent is the ideal shape — it means the
council reasoned rather than averaged.
