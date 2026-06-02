# Addon Integration Plan
*Claude Opus 4.8 assessment, 2026-06-02. Answers five targeted questions about addon integration sequencing and architectural decisions.*

---

## Framing Correction (Opus, pre-answers)

Two addons were originally pitched against gaps that no longer exist:
- **open-design** — the Design Phase IS built (`design` edge function, full-screen carousel UX, verified 2026-04-14). Treat as content enrichment, not architecture gap.
- **Cold-start problem** — real, but `repo_memory` + MAESTRO_STATE.md discipline already partially addresses it. The fix is enrichment (add `kind`+`relations` columns), not greenfield.

---

## Q1 — ECC Skills Curation

### (a) For building Maestro itself — 12 skills (process-as-prompt)

| Skill | Why |
|---|---|
| `dispatching-parallel-agents` | This IS the Sprint 1 Conductor workflow in prose |
| `subagent-driven-development` | Two-stage spec→quality gate per lane (no QA gate exists today) |
| `writing-plans` (P0/P1/P2) | Exact Council→plan handoff format for Sprint 3 |
| `using-git-worktrees` | Lane isolation cleaner than path-locks alone |
| `test-driven-development` | RED-GREEN-REFACTOR as build-lane quality check |
| `systematic-debugging` | 4-phase root-cause for lane failures; feeds runner.ts retry prompts |
| `requesting-code-review` / `receiving-code-review` | Pre-merge gate before github-execute opens PR |
| ECC `verification-loops` (pass@k) | Turns "watch the first PR carefully" into a measurable gate |
| ECC `/security-scan` (AgentShield) | Prompt content for existing `bouncer` gate — not a new runtime |
| ECC `token-optimization` | Relevant to Sonnet-timeout blocker in MAESTRO_STATE.md |
| ECC session `compact`/`metrics` | Operator hygiene for long Claw sessions |

### (b) For bundling into user projects — ~13 skills (capability-as-file)

Ship as a curated ~10-file SKILL pack chosen by project type:
- `test-driven-development`, `systematic-debugging`, `requesting-code-review`, `receiving-code-review` — universal quality
- `writing-plans`, `using-git-worktrees`, `dispatching-parallel-agents` — project is itself agent-orchestratable
- ECC memory-persistence hooks — cold-start fix for the user's future agents
- ECC `ecc status --markdown --write` generator — auto-PROJECT_STATE.md for user repo
- ECC `/security-scan`, `continuous-learning`
- One language-stack pack matching project type (TypeScript OR Python OR Go — not all)

**Rule:** ~10 skills per project type profile. Never bundle all 249.

---

## Q2 — Ruflo as Conductor Substrate

**Recommendation: No. Build Conductor on maestroclaw primitives. Mine Ruflo for two design patterns, take zero code.**

**Against Ruflo (decisive):**
1. maestroclaw already owns the hard 80%: poll loop is genuinely parallel (index.ts:74-114), locks.ts does per-path locking, runner.ts does retry/rollback. The 2-at-a-time cap is in `useBuildExecution.ts` (web layer), NOT in maestroclaw.
2. Layer collision: Ruflo is "local CLI harness below web UI." maestroclaw IS already the local harness. Two harnesses = Bridge to Ruflo instead of to your own node.
3. Dependency surface: 33 plugins to use 2 of them.
4. Non-determinism: ruflo-swarm's adaptive topology is the OPPOSITE of deterministic collision reconciliation (which is a correctness requirement, not a preference).

**What to steal (patterns only):**
- `ruflo-goals` GOAP plan representation → schema for `plan.ts` in Conductor
- `ruflo-swarm` topology vocabulary (hierarchical = lead+lanes) → mental model only

---

## Q3 — Cold-Start / RAG Layer

**Recommendation: repo_memory first → ECC episodic hooks → Obsidian last (optional projection).**

| Tier | Consumer | Tool | When |
|---|---|---|---|
| Project knowledge (structured, queryable) | Agents at session start | Enhance `repo_memory` (add kind+relations) | First |
| Agent working memory (episodic, cross-session) | Each persona | ECC memory hooks pattern, in Postgres | Sprint 3 |
| Human-readable knowledge graph | The Conductor (you) | Obsidian vault — projection FROM repo_memory | Last / optional |

**Why NOT Obsidian first:** Desktop app requiring CLI on machine. Maestro is a web console; agents run in Edge Functions. Desktop GUI as core query path = fragile coupling. Obsidian's real value is human (you, reading the graph as wikilinked notes). Source-of-truth-in-Obsidian violates Rule 4 hierarchy (codebase > state docs > everything else).

**Coexistence model:** `repo_memory` (Postgres) is canonical. A generator renders it to MAESTRO_STATE.md-class docs for agents AND to Obsidian vault for you. One source, multiple projections.

**First implementation:** Add `kind` + `relations` columns to `repo_memory`; seed from existing docs; have Conductor query at session start. Ship Obsidian export later.

---

## Q4 — "Born Organized" User Projects

**Verdict: Sound concept. Ship as opt-in `--organized` profile. Default OFF for existing repos, default ON for net-new repos.**

**(a) Architecturally feasible?** Yes. It's additional `file_manifest` entries appended in the Pre-Build step. No new infrastructure — rides existing Task 2 pipeline.

**(b) MVP scaffold pack (~7 files):**
- `AGENTS.md` (project-scoped template)
- `CLAUDE.md` (Karpathy 4 principles verbatim)
- `PROJECT_STATE.md` (MAESTRO_STATE.md-lite)
- `.maestro/repo_memory.json` (architecture graph seed from build spec)
- `skills/` (~5 language-matched files from ECC)
- `README.md` section documenting the agentic layer
- Optional: ECC memory-persistence hook config

**(c) Risks:**
1. Wrong-fit projects (landing pages, throwaway scripts) — gate on project complexity + opt-in
2. Imposition/surprise — default OFF for existing repos
3. Maintenance/staleness — don't promise auto-updating you won't build; MVP ships the seed only
4. Template rot — version the scaffold pack; it's content, easy to bump

**Honest pitch:** "Maestro-built projects ship with the docs and conventions that make the next agent productive instead of cold." Not "pre-wired agentic collaboration from day 0" — that implies runtime capability the repo doesn't have yet.

---

## Q5 — Integration Priority Table

| Addon | When | Layer | Integration Point | Risk |
|---|---|---|---|---|
| **andrej-karpathy-skills** | Now (pre-Sprint 1) | Prompt | `orchestrate/index.ts:buildSystemPrompt()` — build modes only | Very low. Pure prompt content. |
| **superpowers** (4 skills) | Sprint 1 | Conductor prompt | `dispatching-parallel-agents` + `subagent-driven-development` + `writing-plans` + `using-git-worktrees` in new Conductor coordinator prompt | Low. Content only. |
| **ECC process skills** | Sprint 1 (process) → ongoing | Conductor + QA gate | `verification-loops`/pass@k in build-lane quality check; `/security-scan` content into `bouncer` | Medium. Cherry-pick skill content; resist installing ECC runtime. |
| **repo_memory enhancement** | Sprint 1/2 seam | Data | Add `kind`+`relations` to `repo_memory`; Conductor queries at session start | Low. Extends shipped table. |
| **ruflo** | Study only — do not integrate | (conflicts with maestroclaw) | Mine `ruflo-goals` GOAP schema for `plan.ts` (C-03). Zero code adopted. | High if integrated; Low if studied. |
| **ECC memory hooks (episodic)** | Sprint 3 | Council memory | Per-persona Postgres memory (already on roadmap); ECC hook pattern stored in PG not SQLite | Medium. Don't adopt ECC SQLite store. |
| **obsidian-cli-skill** | Sprint 3+ (optional) | Human read-projection | Export generator renders `repo_memory` → vault. Never source of truth. | Low if read-only projection; High if made canonical. |
| **open-design tokens** | Post-Sprint 3, content only | Design Phase (already built) | Feed design-system tokens into `design` edge fn prompts | Low. Phase exists — enrichment only. |
| **Born organized scaffold** | After Sprint 1, opt-in | Pre-Build → manifest | `intake`/`architect` edge fn appends scaffold pack to `file_manifest` | Medium. Gate on project type + opt-in. |

---

## One-Line Strategy

Take the **content** of all six (principles, skills, plan schemas, design tokens), the **patterns** of two (Ruflo GOAP, ECC memory hooks), the **runtime** of **none**.

Maestro's differentiation is being the orchestration control surface — every runtime adopted below it (Ruflo) or beside it (ECC harness) dilutes that and re-introduces dependency/layer risks the audit already flagged.

---

*Prepared by Claude Opus 4.8, 2026-06-02. Grounded against codebase before answering — Design Phase and Pre-Build are confirmed built. Per AGENTS.md Rule 6 (web agent): no files written directly; this is decision input for the Conductor to act on.*
