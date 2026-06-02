# Andrej Karpathy Skills — Plugin Summary

**Source:** https://github.com/multica-ai/andrej-karpathy-skills  
**Pulled:** 2026-06-02  
**License:** MIT  
**Author:** multica-ai (forrestchang)

## Overview
A `CLAUDE.md` / plugin enforcing four behavioral principles for LLM coding agents, derived from Karpathy's observations on LLM coding pitfalls.

## The Four Principles

| Principle | Fixes |
|---|---|
| **Think Before Coding** | Wrong assumptions, hidden confusion, missing tradeoffs |
| **Simplicity First** | Overcomplication, bloated abstractions |
| **Surgical Changes** | Orthogonal edits, touching code it shouldn't |
| **Goal-Driven Execution** | "Give it success criteria and watch it go" |

## Key Quote
> "LLMs are exceptionally good at looping until they meet specific goals... Don't tell it what to do, give it success criteria and watch it go."

## Compatibility: ✅ HIGH — apply immediately

These four principles address exact failure modes Maestro's audit flagged (agents producing stubs, over-reaching file scope, not surfacing tradeoffs). The `file_manifest` truncation guard is a mechanical fix; these principles are the behavioral layer that prevents the problem upstream.

## Integration Path

**Option A — Immediate, affects all builder agents:**  
Embed the four principles verbatim in `orchestrate/index.ts:buildSystemPrompt()` under a "Coding Standards" section.

**Option B — Dev workflow:**  
```bash
/plugin install andrej-karpathy-skills@karpathy-skills
```

**Recommended:** Do both. Option A improves build output quality today without waiting for plugin infrastructure.

## The Principles (embed-ready)

```
CODING STANDARDS — apply to every task:

1. THINK BEFORE CODING: State assumptions explicitly. Present multiple interpretations when ambiguous — don't pick silently. Push back if a simpler approach exists. Stop and name what's unclear rather than guessing.

2. SIMPLICITY FIRST: Write the minimum code that solves the problem. No speculative features, no abstractions for single-use code, no "flexibility" not requested. If 200 lines could be 50, rewrite it.

3. SURGICAL CHANGES: Touch only what you must. Don't improve adjacent code, comments, or formatting. Match existing style. If you notice unrelated dead code, mention it — don't delete it. Every changed line must trace directly to the task.

4. GOAL-DRIVEN EXECUTION: Transform tasks into verifiable goals. Write tests that define success, then make them pass. For multi-step tasks, state a brief plan with verification steps.
```
