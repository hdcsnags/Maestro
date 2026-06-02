# Maestro — Plugin Addons Shelf

Sourced 2026-06-02. Each subfolder holds a summary + compatibility assessment for one external plugin/skill repo. Nothing here is installed — this is a review layer so you can decide what's worth integrating.

---

## Quick Compatibility Matrix

| Plugin | Source | Fit for Maestro | Priority |
|---|---|---|---|
| [superpowers](#1-superpowers) | obra/superpowers | ✅ HIGH — parallel subagent dispatch, TDD, planning workflow | Sprint 1/3 candidate |
| [andrej-karpathy-skills](#6-andrej-karpathy-skills) | multica-ai/andrej-karpathy-skills | ✅ HIGH — coding behavior guidelines for agents | Apply to orchestrate prompt now |
| [ECC](#2-affaan-m--ecc) | affaan-m/ECC | ✅ HIGH — 249 skills, memory persistence, token optimization, security | Pre-Sprint 1 (install hooks now) |
| [open-design](#4-open-design) | nexu-io/open-design | ✅ MEDIUM — directly addresses Maestro's unbuilt Design Phase | Sprint 3 reference |
| [ruflo](#3-ruflo) | ruvnet/ruflo | ✅ MEDIUM — local agent substrate; could power the Conductor | Study before Sprint 1 |
| [obsidian-cli-skill](#5-obsidian-cli-skill) | pablo-mano/Obsidian-CLI-skill | ✅ MEDIUM — RAG layer for persistent project memory across agent sessions | Sprint 3 / Council memory |

---

## 1. Superpowers

**Repo:** https://github.com/obra/superpowers  
**Author:** Jesse Vincent / Prime Radiant  
**License:** MIT

### What It Is
A complete software development methodology delivered as composable skills for Claude Code, Codex, Gemini CLI, Cursor, and GitHub Copilot CLI. Skills trigger automatically — the agent uses them before any task.

### Core Skills Relevant to Maestro
| Skill | Maestro relevance |
|---|---|
| `dispatching-parallel-agents` | Direct match to Conductor's parallel lane dispatch |
| `subagent-driven-development` | Two-stage spec + code-quality review — fits build lane QA |
| `writing-plans` | P0/P1/P2 plan authorship the Conductor ingests |
| `brainstorming` | Council deliberation input |
| `using-git-worktrees` | Parallel branch isolation per lane |
| `requesting-code-review` / `receiving-code-review` | Pre-merge QA gate |
| `test-driven-development` | Enforces RED-GREEN-REFACTOR in build lanes |
| `systematic-debugging` | Root-cause process for lane failures |

### Fit Assessment
**High.** The `dispatching-parallel-agents` + `subagent-driven-development` skills are essentially the Sprint 1 Conductor workflow in skill form. Worth pulling these two skill files and embedding in `orchestrate/index.ts` system prompt logic or as context for the Conductor module.

The TDD + systematic-debugging skills are directly applicable to build-lane quality checks.

### Integration Path
- Extract `skills/dispatching-parallel-agents/SKILL.md` and `skills/subagent-driven-development/SKILL.md`
- Embed as system-prompt context for builder agents in `orchestrate/index.ts:buildSystemPrompt()`
- Do NOT import the full plugin harness — just the skill content

---

## 2. affaan-m — ECC (closest match)

**Note:** The link provided (`https://github.com/affaan-m/everythin...`) was truncated and the `everything` repo returns 404. The closest match by description is **affaan-m/ECC** — "The agent harness performance optimization system. Skills, instincts, memory, security, and research-first development for Claude Code, Codex, Opencode, Cursor and beyond."

Also notable: **affaan-m/claude-swarm** — "Multi-agent orchestration for Claude Code — decompose tasks, coordinate agents, visualize everything in a rich terminal UI" (Python, 191★).

**Repo:** https://github.com/affaan-m/ECC  
**License:** Check repo

### What ECC Appears to Cover
- Skills system for agent harnesses
- Instincts (behavioral rules)
- Memory layer
- Security scanning
- Research-first development workflow

### Fit Assessment
**Medium, pending full review.** If ECC includes a memory layer and skills system, it could complement the Council's per-persona memory gap (Sprint 3). The security angle overlaps with Maestro's planned Security Review phase.

**Also look at:** `affaan-m/claude-swarm` for task decomposition + coordination patterns — it's closer to the Conductor concept.

### Action
Pull and review ECC + claude-swarm before Sprint 3 Council work. Confirm the truncated link with the Conductor.

---

## 3. Ruflo

**Repo:** https://github.com/ruvnet/ruflo  
**Author:** ruvnet / Cognitum  
**License:** MIT  
**npm:** `ruflo` (22.2M+ ecosystem downloads)

### What It Is
A plugin/skill runner and agentic engineering platform for Claude Code agents. Has a live UI at flo.ruv.io, a goal planner, and live agent management. Built on TypeScript with a structured plugin system (`plugins/`, `plugin/`, `.claude-plugin/`).

### Structure
- `plugins/` — composable plugin modules
- `plugin/` — plugin runtime
- `.claude-plugin/` — Claude Code plugin manifest
- `ruflo/` — core runner
- `.agents/` — agent configurations
- `.claude/` — Claude Code settings

### Fit Assessment
**Mixed.** Ruflo is itself an orchestration runtime — it partially overlaps what Maestro is building. Don't import the runner. Instead:
- Inspect `plugins/` for individual skill/plugin patterns worth adapting
- The `.agents/` agent configuration format may inform Maestro's agent roster approach
- The goal planner (goal.ruv.io) could inform Council → plan handoff design

### Integration Path
- Browse `plugins/` contents before Sprint 3
- Do NOT add ruflo as a dependency — it competes with Maestro's orchestration layer

---

## 4. Open Design

**Repo:** https://github.com/nexu-io/open-design  
**License:** Apache 2.0  
**Stars:** ~40K in 2 weeks

### What It Is
Open-source alternative to Claude Design. Auto-detects 16 CLI agents on your PATH, drives them with 139 composable Skills and 150 brand-grade Design Systems. Local-first, BYOK. Web-deployable.

### What's Relevant to Maestro
Maestro's **Design Phase** (between Synthesis and Pre-Build) is entirely unbuilt. Open Design directly addresses this gap:
- Agents produce HTML mockups → user picks features/colors/layout → locks design
- 150 design systems = the design token library the Design Phase needs
- 139 skills covering layout, color, typography, component generation

### Fit Assessment
**High for the Design Phase specifically.** This is the closest existing open-source implementation of what Maestro's Design Phase spec describes. Worth a detailed read before designing Maestro's Design Phase (Sprint 3 or beyond).

### Integration Path
- Study the skill system and design-token approach
- Consider embedding a subset of design system tokens in Maestro's Design Phase prompts
- The HTML mockup generation flow is directly borrowable for `FolioCard` artifact output in Design mode

---

## 5. Obsidian CLI Skill

**Repo:** https://github.com/pablo-mano/Obsidian-CLI-skill  
**License:** As-is  
**Version:** v1.3.0

### What It Is
A `SKILL.md`-based skill that gives AI agents control over Obsidian vaults via the official Obsidian CLI (v1.12+). 130+ commands covering files, daily notes, search, properties, tags, tasks, links, bookmarks, templates, plugins, sync, themes, dev tools.

### Fit Assessment
**Low for Maestro core.** No overlap with Maestro's orchestration, build, or council functionality. Obsidian is a knowledge management tool — not part of the Maestro stack.

**Possible future use:** If the Conductor's session log / MAESTRO_STATE.md workflow ever moves into an Obsidian vault, this skill becomes relevant. Currently: skip.

---

## 6. Andrej Karpathy Skills

**Repo:** https://github.com/multica-ai/andrej-karpathy-skills  
**Author:** multica-ai (forrestchang)  
**License:** MIT

### What It Is
A `CLAUDE.md` / plugin that enforces four behavioral principles for LLM coding agents, derived from Karpathy's public observations:

| Principle | What it fixes |
|---|---|
| **Think Before Coding** | Wrong assumptions, hidden confusion, missing tradeoffs |
| **Simplicity First** | Overcomplication, bloated abstractions |
| **Surgical Changes** | Orthogonal edits, touching code you shouldn't |
| **Goal-Driven Execution** | "Give it success criteria and watch it go" |

### Fit Assessment
**High, apply immediately.** These four principles address exact failure modes Maestro's audit flagged — agents producing stubs, over-reaching file scope, not surfacing tradeoffs. The "Goal-Driven Execution" principle is directly aligned with `file_manifest` success criteria (Sprint 1 already has truncation guards — this reinforces the behavioral layer).

### Integration Path
**Option A (immediate):** Embed the four principles verbatim in `orchestrate/index.ts:buildSystemPrompt()` under a "Coding Standards" section — applies to all builder agents.  
**Option B (plugin):** Install as a Claude Code plugin via `/plugin install andrej-karpathy-skills@karpathy-skills` for the development workflow itself.

Both are worth doing. Option A improves build output quality today.
