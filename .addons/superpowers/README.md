# superpowers — Plugin Summary

**Source:** https://github.com/obra/superpowers  
**Pulled:** 2026-06-02  
**License:** MIT  
**Author:** Jesse Vincent / Prime Radiant

## Overview
Complete software development methodology delivered as composable skills. Skills trigger automatically — brainstorming → plan → parallel subagents → TDD → review → merge.

## Key Skills for Maestro
- `dispatching-parallel-agents` — concurrent subagent workflows (Conductor Sprint 1)
- `subagent-driven-development` — two-stage spec+quality review per task
- `writing-plans` — structured P0/P1/P2 plans the Conductor ingests
- `using-git-worktrees` — parallel branch isolation per lane
- `test-driven-development` — RED-GREEN-REFACTOR enforcement in build lanes
- `systematic-debugging` — 4-phase root-cause process for lane failures
- `brainstorming` — Socratic design refinement (Council input)

## Compatibility: ✅ HIGH
Pull `dispatching-parallel-agents/SKILL.md` and `subagent-driven-development/SKILL.md` for embedding in `orchestrate/index.ts:buildSystemPrompt()`.

## Installation (for reference)
```bash
# GitHub Copilot CLI
copilot plugin marketplace add obra/superpowers-marketplace
copilot plugin install superpowers@superpowers-marketplace
```
