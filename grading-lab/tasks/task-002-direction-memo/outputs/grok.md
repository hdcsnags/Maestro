Reading TASK.md and the context files it references.
# Direction Memo: Maestro — Six-Week Focus

**To:** Project leadership  
**From:** Independent senior technical advisor  
**Re:** Single highest-leverage focus, July–August 2026  
**Question:** What should Maestro commit to for the next six weeks?

---

## 1. Where the project actually is

Maestro is not a prototype council chatbot and not a v3 self-improving system yet. It is a **broad, feature-rich orchestration product** with a mature deliberation/synthesis surface (PRO-01 deployed, unified Claw shell, persona layer, repo memory) sitting on top of an **execution chassis that is built in pieces but not closed end-to-end**. The knowledge graph confirms this split: `useMaestro()` is a 99-edge god node wiring 20+ communities, while the Conductor module (C11) is a **structural island** disconnected from the iteration runner (C3), and there is **no reputation/scoring community at all** — the Rate layer the philosophy treats as "the engine" does not exist in code.

The operational state file oversells completeness. Dozens of capabilities are marked "working" on the basis of **code verification or single smoke tests from April–May**, not recent end-to-end validation. PRO-02 Iteration Loop appears in "What's Working" with a `(pending)` migration note — an internal contradiction. The philosophy document claims v2 includes a "stable, pushed" grading loop; the July 1 session log shows the Grading Lab was **founded that week** specifically to calibrate peer grading before Rate ships, and task-001 found unanimous bugs in Conductor reconciliation logic. The v3 flywheel (graded outcomes → adaptive routing → better councils) is a **design thesis**, not an operational loop. What *is* real: CI is green, 19 edge functions are deployed, MaestroClaw v0.1 runs locally with parallel job polling, and the builder has demonstrated manual multi-model council workflows. The gap is not vision or feature count — it is **one trustworthy path from intent to merged code on the local-first stack**.

---

## 2. The bet

**Close the local build loop: multi-builder `build_session` → Conductor-coordinated parallel execution → artifact aggregation → GitHub PR — with one repeatable smoke test that proves it.**

This means wiring C-06 (Conductor into `runIterationLoop`), unifying the in-thread Claw session card with the BuildWorkspace multi-builder session controller, and completing the artifact→`github-execute` bridge for session builds. The deliverable is not "more features" but **one path that works every time the builder runs it**.

**What it wins:** It converts Maestro from an impressive council UI into a tool that **actually ships code** on the local-first path — the surface the philosophy identifies as "where Maestro builds Maestro." It wires the Conductor island into real execution, producing the conflict-reconciliation and manifest-merge behavior the project has already built but never battle-tested. It creates the **substrate** that every downstream bet depends on: grading needs graded build outcomes, Rate needs task-type performance data, the pattern library needs successful build traces, and security review needs real artifacts to bounce. Six weeks spent here produces evidence; six weeks spent on v3 narrative produces slides.

**Why now:** The hard primitives exist (parallel poll loop, session executor, Conductor plan/reconcile modules, Claw→GitHub push helpers). The state file's own "Next Logical Steps" list items 10, 14, and 15 are all variants of this same unfinished closure. The active blocker (Sonnet timeouts on artifact-heavy prompts) is a symptom of an execution path still routing heavy work through cloud orchestrate instead of a proven local session pipeline. The Grading Lab's July 1 calibration run proved the team is ready to measure quality — but measuring quality on a build path that hasn't been E2E smoke-tested is measuring noise.

---

## 3. What I am explicitly deferring

| Deferred | Why not now | Cost of waiting |
|----------|-------------|-----------------|
| **Shipping the Rate / peer-grading loop** | Grading Lab just started calibration; C-06 reconcile has known bugs (task-001 unanimous rework verdict). Routing on uncalibrated grades would encode bad roster decisions. | Adaptive council composition stays manual for six more weeks. Acceptable — the builder already runs councils manually today. |
| **v3 self-improvement routing** (task-aware council selection from graded outcomes) | Requires Rate data that doesn't exist and a closed execution loop to generate it. | Philosophy narrative stays ahead of product reality. Honest, not harmful. |
| **Pattern library / RAG across personal repos** | Needs successful build traces and decision records from a reliable loop; `repo_memory` graph columns exist but the ingestion flywheel has no fuel. | "What apps have SSE streaming?" semantic search stays a manual Obsidian/Graphify exercise. |
| **Mobile consumer chat surface** | Consumer value prop ("better answers, invisible council") requires a council that produces measurably better outputs — unproven without closed loop + grading. | No consumer launch. Correct — launching now would expose the execution gaps. |
| **UX redesign sprint** | The UI shell is already thread-first and functional (10 unified-UX phases shipped May 1). Redesigning before the execution path is proven risks polishing a flow that may need structural change. | UI stays "good enough for builder." The philosophy admits UX is ready for change — but after the loop closes, not before. |
| **Full security audit Phases 1–5** (sandbox-approved-shell, HMAC nonce, agent-query scope) | Critical, but scoped containment within the local build bet (see mitigations) is sufficient for a single-user local threat model. Full hardening can follow once the execution surface stops moving. | Local execution retains known P0 issues (approved-shell injection, replayable HMAC tokens) for weeks longer. Mitigated by builder-only use and scoped workspaces. |

---

## 4. Risks of this bet and mitigations

**Risk: C-06 Conductor wiring introduces regressions in an already-complex iteration loop.**  
The task-001 grading lab found real bugs in `reconcile.ts` (starved ranking inputs, `codePointAt` tie-break ≠ lexicographic order, mirror divergences). Wiring broken Conductor logic into the live loop could make parallel builds *worse*, not better.  
*Mitigation:* Fix the merged task-001 rework list **before** C-06 integration, not after. Run the enterprise-Fable independent audit on the same commit. Add a minimal Conductor unit-test suite covering the six failure modes task-001 identified. No wiring until those tests pass.

**Risk: The smoke test passes on one happy-path project but the flow fails on Windows-specific issues (Sonnet timeouts, 8K stdin truncation, WDAC blocks).**  
The state file documents all three as live or recent blockers.  
*Mitigation:* Design the smoke test as a **5-file scoped build** (proven April 20), not a 40-file stress test. Use `build_session` with Claude headless via stdin pipe (fixed April 19), Codex/Copilot adapters as fallback chain (May 11), and cap concurrent jobs at 3 (C-04). Record adapter ID + resolved model in every job row — the Grading Lab's "wrapper lesson" applies here too.

**Risk: Six weeks is consumed unifying Claw and BuildWorkspace UI controllers without reaching GitHub.**  
Item 14 ("unify in-thread Claw card with BuildWorkspace session controller") is integration debt that can expand indefinitely.  
*Mitigation:* Define "done" as **functional parity, not UI parity**. The shared `sessionBuildState` already exists (April 29). Extend it to multi-builder dispatch; accept thinner manifest review in Claw thread. GitHub PR creation is the acceptance criterion, not pixel-perfect cards.

**Risk: Deferring security hardening exposes the builder's machine during local execution.**  
June 9 audit flagged `approved-shell` shell injection, unscoped `agent_query` reads, and replayable HMAC tokens.  
*Mitigation:* Within this bet, ship **one** containment measure: scope-lock `agent_query` to session `scope_paths` and add HMAC nonce expiry (both are surgical, not a full Phase 1). Do not defer these two — they guard the exact surface this bet activates.

**Risk: Closing the local loop proves the hosted/edge build path is neglected, creating a two-tier product.**  
*Mitigation:* Explicitly out of scope. The philosophy's "local is where Maestro builds Maestro" is correct prioritization. Edge builds worked in April smoke tests; they don't need six weeks. Local-first is the gap.

---

## 5. First three concrete steps

**Step 1 (Days 1–5): Fix Conductor reconcile, then wire C-06.**  
Apply the task-001 merged rework list to `packages/maestroclaw/src/conductor/reconcile.ts` and `collectManifest`. Add unit tests for: failed/skipped-unblock, unknown-dep stall, empty-lane-wins, non-ASCII priority inversion, and lexicographic tie-break. Pass the enterprise-Fable audit. Then integrate `createConductorRun()` into `runIterationLoop` at loop claim — the wiring point identified in the June 2 session log and confirmed as missing by the graph report.

**Step 2 (Days 6–15): Unify multi-builder session dispatch and complete artifact→GitHub bridge.**  
Extend the shared `sessionBuildState` / `sessionBuild.ts` path so `ClawBuildSessionCard` and `BuildWorkspace` both dispatch multi-builder `build_session` jobs through the same Conductor-aware controller (not separate per-surface logic). Wire `fetchExecutorJobArtifactManifest` → `normalizeSessionManifest` → `github-execute` with `mode: 'synthesized'` for session builds. Test with a repo-bound session that has no prior commits (greenfield path exists in code since April 13 but is listed as untested via Pre-Build UI).

**Step 3 (Days 16–30): Ship `scripts/smoke-local-build.sh` (or `.ps1`) as a CI-optional gate and run it on three projects.**  
The script: start MaestroClaw worker → create session with 2 locked Claw builders → dispatch 5-file scoped build → poll to completion → assert artifact manifest completeness → push branch → open PR. Run against (a) a greenfield repo, (b) an existing TypeScript project, (c) a build that intentionally creates a manifest conflict to verify Conductor reconcile. Log adapter ID, resolved model, wall-clock time, and token cost per job. This harness becomes the regression gate for every future bet (Rate, security, UX).

---

**Bottom line:** Maestro has spent six months building the council. The next six weeks should be spent making the council **ship one thing reliably** on the local stack. Everything else — grading, routing, RAG, mobile, self-improvement — is a multiplier on a product that does not yet have a proven multiplier base.
