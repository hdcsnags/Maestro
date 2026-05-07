# NEXT SPRINT — Implementation Priority

**Status:** Living doc. Refresh when sprint shape changes.
**Last updated:** 2026-05-04 by Opus 4.7
**Audience:** The next Sonnet/Gemini session picking up work cold. Read this before scrolling through `IMPLEMENTATION_PLAN_STATUS.md` looking for "not started" rows.

---

## TL;DR — Pick One Of These In Order

```
🟥  IMMEDIATE (no spec needed; do these first if not done):
    1. SEC-02 deploy gap     ← live in code, NOT live in production yet

🟧  HIGH-IMPACT NEXT:
    2. SANDBOX-01 Phase 1    ← biggest security hardening, no hard deps
    3. LIVE-01               ← biggest product-feel change ("Maestro is alive")

🟨  STRONG-VALUE PARALLEL:
    4. DIFF-02               ← closes Phase 3, kills cold-start friction
    5. MULTIEXEC-01          ← closes "work anywhere" vision
    6. BOUNCER-01            ← unblocks BOUNCER-02 + CTF/lab use cases

🟩  PHASE 4 (Opus territory; bigger):
    7. PRO-01                ← inter-agent deliberation; product differentiator
    8. PRO-02                ← iteration loops; Cursor competitor

🟦  CHAINS BEHIND OTHERS:
    9. BOUNCER-02            ← needs BOUNCER-01 + LIVE-01 for full integration

🟪  TECH DEBT (run in parallel, low priority):
    TD-01, TD-02, TD-03
```

---

## What Just Shipped (since last sprint plan)

### ✅ Implementations (Sonnet 4.6)
- **SEC-01** — Shell analyzer hardening. Kernel injection vector closed. 26/26 tests pass.
- **SEC-02** — HMAC approval token flow. **DEPLOY GAP** — code merged, not yet live (see Immediate below).
- **SEC-04** — IncidentService end-to-end. Live and reporting kernel/security violations.
- **REL-01** — 4-layer phantom-agent defense. Plus the legacy broadcast Claw fix.
- **REL-02** — ESLint cleanup.
- **REL-03** — State doc drift fix (4 Claw agents now reflected).
- **UX-02 / UX-03 / UX-04** — Streaming output, kick-stuck-job button, PTY routing.
- **DIFF-01** — Cost rollup card.
- **DIFF-03** — Lane-scoped prompt slicing with two-call architect.
- **DIFF-04** — Provider fallback matrix with cost-gated reroute approval.

### ✅ Implementation (Gemini CLI)
- **UX-01** — Brought the orb back into ClawMode. Went beyond scope and integrated full Atelier visual direction via `BoardroomStage`.

### ✅ Specs Ready (Opus 4.7) — Awaiting Implementation
- DIFF-02, BOUNCER-01, BOUNCER-02, LIVE-01, MULTIEXEC-01, SANDBOX-01, PRO-01, PRO-02
- AGENTS_ONBOARDING.md, DEPLOY_RUNBOOK.md, NEXT_SPRINT.md (this doc)

---

## 🟥 Immediate — Deploy Gap

### SEC-02 deploy

**State:** Code merged 2026-05-09. Live behavior: still uses legacy queued-job approval path because `APPROVAL_TOKEN_SECRET` is not set in Supabase secrets.

**Fix (5 minutes):**
1. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` — copy hex.
2. Supabase Dashboard → Project Settings → Edge Functions → Secrets → set `APPROVAL_TOKEN_SECRET` = the hex.
3. `supabase functions deploy executor-api` (already done per state doc, but redeploy to ensure secret is loaded).
4. Run the 4 curl forge tests from `SEC-02_TRUST_MODEL_SPEC.md` Verification section. Most important: forged `rm -rf .` returns `pending_approval`, not a queued job.
5. Update `MAESTRO_STATE.md` Active Blockers — remove the SEC-02 deploy line.

**Why this is #1:** Until the secret is set, the server-authoritative trust gate isn't actually live. We're still running on the legacy frontend-classified flow. Code is in production; security model is not. Fix is trivial.

---

## 🟧 High-Impact Next

### #2 — SANDBOX-01 Phase 1 (Process Isolation)

**Spec:** `SANDBOX_SEQUENCE_SPEC.md`
**Estimated effort:** 3-5 days for Sonnet
**Hard dependencies:** None
**Why now:** The kernel allowlist (SEC-01) is a binary gate. The sandbox is a permission gate. Even with kernel enforcement, ANY kernel-allowed binary today runs with the user's full credentials, full PATH, full HOME. Phase 1 closes that. Per-job workspace dirs, env scrubbing (positive allowlist + denylist regex `(_TOKEN|_SECRET|_KEY|_PASSWORD|_PRIVATE)$`), restricted PATH, HOME redirect. Defense in depth — even if a future malicious prompt finds a clever path past the kernel, blast radius is bounded.

**What Opus must review:**
- Step 1 (env handling) — denylist regex completeness, allowlist correctness. Wrong here = secret leakage.
- One adapter migration as the template.

**Risk callouts:**
- Adapter signature change (`AdapterRunContext` parameter) is breaking-internal but trivially mechanical. One PR migrates all 7 adapters. Don't ship adapter migrations separately.
- HOME redirect breaks tools that rely on user `~/.gitconfig` / `~/.npmrc`. Documented limitation; v1.1 adds curated config-seeding.

---

### #3 — LIVE-01 (Concierge Live Build Coordinator)

**Spec:** `LIVE_CONCIERGE_COORDINATOR_SPEC.md`
**Estimated effort:** ~1 week for Sonnet
**Hard dependencies:** None (DIFF-04 is shipped, so reroute integration works)
**Why now:** The product-feel change. The Council currently goes silent during build. After LIVE-01: concierge speaks at the right moments — narrating reroutes, surfacing decisions that need user attention, calmly reporting recoveries. Converts "panel that adjourns when work starts" → "coordinator continuously present." Smoketest audit #7.

**What Opus must review:**
- Step 3 (prompt template) — the voice lives here. Validate against real Haiku output before wiring trigger emitters. Wrong voice = wrong product feel.

**Risk callouts:**
- Browser-closed scenario is a v1 limitation (frontend-driven triggers). Acceptable since user-watching-build is the dominant case. v1.1 adds DB-trigger queue.
- Per-build $0.10 budget cap is conservative; tune if real telemetry shows different patterns.

---

## 🟨 Strong-Value Parallel

These three can run in parallel windows. None block each other.

### #4 — DIFF-02 (Per-Repo Memory)

**Spec:** `DIFF-02_REPO_MEMORY_SPEC.md`
**Estimated effort:** ~3-4 days for Sonnet
**Hard dependencies:** None
**Why now:** Closes Phase 3 (the only unspec'd task is now spec'd; only DIFF-02 is not yet implemented). Kills "cold-start friction" — every new session against the same repo currently starts blind. After DIFF-02: concierge auto-loads per-repo memory at session start, summarizes via Haiku on session close. The Conductor's "every session re-explains context" pain goes away.

**What Opus must review:**
- Step 3 (summarize prompt) — coherence over many session updates. Test against 5+ compounding fixture data before merge.

**Risk callouts:**
- 8KB cap is empirical. Watch real-world sizes for a week post-deploy; tune if needed.
- HOME redirect from SANDBOX-01 affects per-repo `~/.gitconfig`. They compose fine but ordering matters: ship SANDBOX-01 first (foundation) before DIFF-02 if doing both this sprint.

---

### #5 — MULTIEXEC-01 (Multi-Executor Capability Routing)

**Spec:** `MULTI_EXECUTOR_ROUTING_SPEC.md`
**Estimated effort:** ~1 week for Sonnet
**Hard dependencies:** None
**Why now:** Closes the Conductor's stated vision: *"It allows me to be able to work, build, analyze, code execute anywhere."* Today, one executor per user. After MULTIEXEC-01: laptop + desktop + cloud node, all advertising capabilities (PTY, GPU, git_installed, labels), with sticky-session routing that follows the user's active machine. Backwards-compat: single-executor users have zero behavior change.

**What Opus must review:**
- Step 2 (selection function) — scoring weights and filter logic. Wrong = wrong routing for every job.
- Step 5 (poll query) — runs on every Claw poll cycle. Use `EXPLAIN ANALYZE` against populated DB before ship.

**Risk callouts:**
- 30-second grace period for fallback claim is empirical. May tune.
- 5-minute sticky-offline grace is empirical.
- Captures cleanly with SANDBOX-01: `capabilities.sandbox: { phase: 1, ... }` advertises sandbox tier; MULTIEXEC's `meets_required_capabilities` filters on it. Ship order doesn't matter.

---

### #6 — BOUNCER-01 (Review Profiles)

**Spec:** `BOUNCER_PROFILES_SPEC.md`
**Estimated effort:** ~3-4 days for Sonnet
**Hard dependencies:** None
**Why now:** Unblocks the CTF/training-lab use case the Conductor explicitly wants ("Maestro will allow users to build entire projects"). Without this, Bouncer flags every deliberate vulnerability in a CTF challenge as critical and pauses the build. With four review profiles + 16-category × 4-profile reclassification matrix, Bouncer becomes intent-aware. Containment-critical hard floor stays critical regardless. Closes smoketest #10.

**What Opus must review:**
- Step 3 (matrix table) — policy. Getting it wrong ships either too-loose (security holes) or too-strict (lab builds blocked).

**Risk callouts:**
- Acknowledgment modal for `training_lab` and `security_ctf` is friction-by-design — prevents accidentally shipping a "training_lab" production app. Don't make it dismissable.
- Path-based pedagogical markers via `bouncer.config.json` need documentation; some users won't find the config file.

**Sequence note:** BOUNCER-01 should ship BEFORE BOUNCER-02. BOUNCER-02 imports BOUNCER-01's reclassification matrix.

---

## 🟩 Phase 4 — Opus Territory

These are bigger, more architecturally novel, and better suited to Opus implementation (not just Opus review). Consider scheduling Opus sessions for the prompt-engineering and synthesis-prompt steps.

### #7 — PRO-01 (Inter-Agent Deliberation Round)

**Spec:** `PRO-01_DELIBERATION_ROUND_SPEC.md`
**Estimated effort:** ~2 weeks for Sonnet implementation; ~3-4 hours of Opus prompt design
**Hard dependencies:** None for v1 (PRO-01 + PRO-02 integration is v1.2)
**Why now:** This is the biggest product differentiator in the entire plan. Today's Council is parallel monologues. After PRO-01: agents push back on each other, surface tensions, acknowledge their own weaknesses. Synthesis preserves dissent rather than blending it into mush. **No other multi-agent tool does this today.** It's the thing that makes Maestro feel like a board of directors instead of a panel of consultants.

**What Opus must own:**
- Step 3 (prompt template) — the deliberation prompt design with redacted attribution and three-question structure.
- Synthesis prompt update (preserves tension, doesn't blend it).

**Risk callouts:**
- Cost: deliberation = 2× round-1 token spend. Default off; opt-in via "Deliberate" pill in composer.
- Streaming UX (UX-02, shipped) is essential during deliberation since round 2 doubles wait time.
- v1 accepts style leakage (Sonnet writes differently than Gemini); v2 adds neutral-voice rewriting.

---

### #8 — PRO-02 (Iteration Loop Primitive)

**Spec:** `PRO-02_ITERATION_LOOP_SPEC.md` (largest spec in the plan)
**Estimated effort:** ~3-4 weeks of mixed Sonnet + Opus work
**Hard dependencies:** None hard. Optional integration with PRO-01 deferred to v1.2.
**Why now:** Maestro currently has two execution modes: one-shot execute and full build. The most valuable everyday workflow is in between — *read → suggest → apply → verify → repeat.* This is what Cursor/Claude Code own. Without PRO-02, users keep Cursor/CC alongside Maestro. With PRO-02, they don't have to.

**What Opus must own:**
- Step 5 (prompt template) with `give_up` signal and embedded file hashes.
- Step 6 (diff application) — git apply with per-step checkpoints, rollback on verification fail.

**Risk callouts:**
- Largest single feature in the plan. Don't try to ship in one PR; the 10-step impl order is meant to be staged ships.
- Opus reviews steps 5-6 before merge. If Sonnet implements solo, they should stop after step 4 (runner skeleton) and request Opus review.
- Auto-apply NEVER bypasses sensitive-path approval — this is the security floor that must hold.

---

## 🟦 Chains Behind Others

### #9 — BOUNCER-02 (Continuous Bouncer / Observer Mode)

**Spec:** `BOUNCER_OBSERVER_MODE_SPEC.md`
**Estimated effort:** ~1 week for Sonnet
**Soft dependencies:** BOUNCER-01 (reclassification matrix), LIVE-01 (coordinator narration)
**Why later:** BOUNCER-02 reuses BOUNCER-01's matrix and integrates with LIVE-01's coordinator for narration. Can technically ship before LIVE-01 (renders findings directly to a card), but the narration integration is what makes it feel cohesive. Best ship order: BOUNCER-01 → LIVE-01 → BOUNCER-02.

**What Opus must review:**
- Step 3 (mid-build prompt scope/voice).
- Step 4 (trigger logic — too-frequent blows budget; too-rare misses issues).

---

## 🟪 Tech Debt — Run In Parallel

Low priority but bites later if neglected.

### TD-01 — Split `useThreads.ts`
1377 lines. Approaching unmaintainable. Split into `useConcierge.ts` + `useBroadcast.ts` + `useExecutionIntent.ts`.

### TD-02 — Split `useBuildExecution.ts`
1521 lines. Approaching unmaintainable. Split into `useTaskQueue.ts` + `useSessionBuild.ts` + `useBuildGitHub.ts`. Easier AFTER PRO-02 ships (refactor once with iteration patterns in scope).

### TD-03 — Browser Smoke Tests for the 10 UX Phases
The 10 unified UX phases shipped 2026-05-01 with typecheck-only verification. Live browser smoke tests still missing. Sonnet shipped UX-02/03/04 with browser verification (good pattern); the original 10 phases never got that. Build a Playwright suite for the top 5 critical paths: login → broadcast → council card → build runway → bouncer.

---

## Pragmatic Deviations to Be Aware Of

These are choices Sonnet made during implementation that deviated from my original specs. They're not bugs — they're pragmatic calls that work fine. Documenting so the next session understands the actual code.

### DIFF-03 — "Additive enrichment with graceful fallback"

**Spec said:** Architect must produce non-overlapping `lane_paths`. Hard fail on validation error.

**Sonnet shipped:** Two-call architect (call 1 = ARCHITECT.md unchanged; call 2 = Haiku derives architect_plan JSON). Concierge applies "additive enrichment" — files in file_subtree get structured prompts; uncovered files fall back gracefully to legacy monolithic style.

**Why it's fine:** LLMs miss files sometimes. Strict fail would make builds brittle. Graceful fallback maintains progress.

**Watch for:** Token-reduction goal (50%+ per builder). If too many files fall through the fallback, slicing isn't actually working. Verify on next live build by inspecting `build_prompt_logs` (or whatever Sonnet ended up using for inspection).

---

## Cross-Spec Composition Notes

### SANDBOX-01 + MULTIEXEC-01
Compose cleanly. SANDBOX-01 advertises `capabilities.sandbox.phase: 1`; MULTIEXEC-01's `meets_required_capabilities` filters on it. Future jobs can require `sandbox.container_isolation: true` via `required_capabilities` once Phase 2 ships.

### LIVE-01 + DIFF-04
LIVE-01 narrates reroutes. DIFF-04's RerouteApprovalCard is the action card LIVE-01 surfaces when cost escalation needs user input. Already designed to share the action handler.

### LIVE-01 + BOUNCER-02
BOUNCER-02 emits `bouncer.findings` triggers consumed by LIVE-01's coordinator prompt. LIVE-01 narrates the findings inline.

### PRO-01 + PRO-02
Spec'd to ship independently. Future v1.2 integration: deliberation rounds on iteration step diffs ("Council thinks this diff has a security issue — push back?"). Out of scope for first ships.

### DIFF-02 + DIFF-03
DIFF-02 (per-repo memory) feeds into concierge's pre-build context. DIFF-03 (architect plan) is separate — it's about building the build prompt. They don't collide. Memory could enrich architect's input in v1.1 (pass per-repo memory to architect prompt).

---

## What's Still Unspec'd

These were on my Opus plate but didn't get specced. Lower priority; flag for future.

- **Auto-pilot vs manual mode** — let Conductor offload routine decisions (build dispatch, simple reroutes), surface only strategic ones. Probably belongs as a v1.2 enhancement after LIVE-01 ships and we see which decisions actually need user input.
- **SANDBOX-01 Phase 2** (Docker per-job) — sketched in SANDBOX_SEQUENCE_SPEC.md; full spec when prioritized.
- **SANDBOX-01 Phase 3** (persistent dev containers) — sketched; needs business model decisions (local Docker vs Maestro-hosted vs Codespaces-like).
- **CTF flag-handling validation** for security_ctf bouncer profile — separate spec when CTF support proves useful in real builds.
- **DEPLOY_RUNBOOK additions** for each spec as they ship — SEC-04 entry exists, others can be added incrementally.

---

## How To Use This Doc

When you're a fresh Sonnet/Gemini session about to pick up work:

1. **Read this doc first.** It's curated; the status doc is raw.
2. **Pick the highest-priority unblocked item** in your tier capability (Sonnet = anything except Phase 4 prompt design; Gemini = UI work shines).
3. **Read the dedicated spec** before implementing. The master plan task block is summary; specs are authoritative.
4. **Follow the spec's implementation order.** It's there for a reason — usually to let migrations + types ship before logic + UI.
5. **Stop at any Opus-review checkpoint** if working solo on a Sonnet/Gemini session. Don't guess on the items I flagged.
6. **Update `IMPLEMENTATION_PLAN_STATUS.md` AND `MAESTRO_STATE.md`** when done.
7. **Refresh this doc** when sprint shape changes (verified ships, new dependencies, deviations worth flagging). Don't let it go stale.

---

*End of NEXT_SPRINT.md. Refresh after each major implementation lands.*
