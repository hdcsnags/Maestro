# affaan-m / ECC — Plugin Summary

**Source:** https://github.com/affaan-m/ECC  
**Pulled:** 2026-06-02  
**License:** MIT  
**Scale:** 182K★ | 28K forks | 170+ contributors | 249 skills | 63 agents | 79 legacy shims  
**npm:** `ecc-universal` (weekly downloads tracked)

> **Note:** Link in original message was truncated (`affaan-m/everythin...`). Confirmed correct repo: `affaan-m/ECC`.

## What It Is
**The harness-native operator system for agentic work.** Not just configs — a complete system: skills, instincts, memory optimization, continuous learning, security scanning, and research-first development. Production-ready, evolved over 10+ months of intensive daily use.

Works across: Claude Code, Codex, Cursor, OpenCode, Gemini, Zed, GitHub Copilot, and more.

## The Four Pillars (Longform Guide covers all)
| Pillar | What it does | Maestro relevance |
|---|---|---|
| **Token Optimization** | Model selection, system prompt slimming, background processes | `orchestrate/index.ts:buildSystemPrompt()` |
| **Memory Persistence** | Hooks that auto-save/load context across sessions | Solves cold-start audit re-mapping problem |
| **Continuous Learning** | Auto-extract patterns from sessions into reusable skills | Council persona memory (Sprint 3) |
| **Verification Loops** | Checkpoint vs continuous evals, grader types, pass@k metrics | Build lane quality gates |

## Key Features
- **249 skills** across coding, security, architecture, DevOps, media, prediction markets
- **63 agents** including `typescript-reviewer`, language-specific build resolvers
- **SQLite state store** with session adapters for structured recording
- **`ecc status --markdown --write status.md`** → portable operator handoff doc (similar to MAESTRO_STATE.md but auto-generated)
- **AgentShield integration** — `/security-scan` runs vulnerability scanning directly
- **NanoClaw v2** — model routing, skill hot-load, session branch/search/export/compact/metrics
- **Parallelization** — git worktrees, cascade method, subagent orchestration
- **Harness audit scoring** — deterministic orchestration status

## Fit for Maestro: ✅ HIGH

### Immediate applications:
1. **Memory persistence hooks** → solve the "agents re-map the project every session" problem from AGENTS.md
2. **`ecc status --markdown`** → auto-generate equivalent of MAESTRO_STATE.md Part 2 from live state
3. **AgentShield** → Maestro's planned Security Review phase (Sprint 3+)
4. **249 skills** → review for skills Maestro's council agents can invoke
5. **Verification loops** → build lane quality gates for the Conductor

### Also look at: affaan-m/claude-swarm
Multi-agent orchestration for Claude Code — decompose tasks, coordinate agents, rich terminal UI (Python, 191★). Conductor-adjacent patterns worth studying for Sprint 1.

## Integration Path
- Install ECC hooks for memory persistence in the dev workflow immediately
- Pull memory persistence + token optimization docs before Sprint 1 Conductor work
- Review AgentShield before Sprint 3 Security Review phase design
