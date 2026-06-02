# ruflo — Plugin Summary

**Source:** https://github.com/ruvnet/ruflo  
**Pulled:** 2026-06-02  
**License:** MIT  
**Author:** ruvnet / Cognitum (formerly Claude Flow)  
**npm:** `ruflo` (22.2M+ ecosystem downloads, 115K git clones/14d)  
**Web UI:** https://flo.ruv.io | **Goal Planner:** https://goal.ruv.io

## What It Is
**Multi-agent AI harness for Claude Code and Codex.** Orchestrates 100+ specialized agents across machines, teams, and trust boundaries. Adds coordinated swarms, self-learning memory, federated comms, and enterprise security to Claude Code.

```
User --> Ruflo (CLI/MCP) --> Router --> Swarm --> Agents --> Memory --> LLM Providers
                          ^                           |
                          +---- Learning Loop <-------+
```

## The 33 Plugins — Key Ones for Maestro

| Plugin | What it does | Maestro relevance |
|---|---|---|
| `ruflo-swarm` | Coordinate multiple agents as a team | Conductor parallel lanes |
| `ruflo-rag-memory` | Hybrid search, graph hops, diversity ranking | Council/Obsidian memory layer |
| `ruflo-knowledge-graph` | Build and traverse entity relationship maps | Project doc graph |
| `ruflo-intelligence` | Agents learn from past successes | Persona continuous learning |
| `ruflo-goals` | Break big goals into plans and track progress | Council → plan handoff |
| `ruflo-cost-tracker` | Track token usage, set budgets, get cost alerts | Token management |
| `ruflo-autopilot` | Let agents run autonomously in a loop | Conductor autonomous mode |
| `ruflo-security-audit` | Scan for vulnerabilities and CVEs | Security Review phase |
| `ruflo-adr` | Track architecture decisions with a living record | MAESTRO_STATE.md equivalent |
| `ruflo-ruvector` | GPU-accelerated search, Graph RAG, 103 tools | RAG memory substrate |

## Ruflo vs Maestro — Not Competition, Different Layers

| | **Ruflo** | **Maestro** |
|---|---|---|
| **Layer** | Local CLI harness (Claude Code / Codex) | Web UI orchestration console |
| **Interface** | Terminal / MCP server | Browser + Supabase |
| **Providers** | Claude + local LLMs (Ollama) | Claude, GPT, Gemini, Qwen, DeepSeek, Kimi |
| **Memory** | Local vector DB (HNSW), session hooks | Supabase Postgres, `repo_memory` |
| **Swarm** | Local agents, agent federation across machines | Edge functions, `build_lanes` |
| **UI** | flo.ruv.io (separate web app) | Maestro (the thing you're building) |

**Key insight:** Ruflo operates *below* Maestro. It's a local agent substrate. Maestro's **Bridge layer (Sprint 2)** — the bidirectional web↔CLI channel — is exactly the layer that *talks to* something like Ruflo running locally. Rather than building the Conductor from scratch, the Conductor module could invoke Ruflo's swarm/orchestration layer locally and surface controls in Maestro's web UI.

## Is Ruflo "Better" Than Maestro?

Different dimension entirely. Ruflo is stronger at:
- Local agent coordination (no cloud round-trip)
- Self-learning / memory persistence
- Agent federation across machines
- Cost tracking, vector memory

Maestro is stronger at (or will be):
- Multi-provider broadcast (5×3 roster across Claude/GPT/Gemini/Qwen/DeepSeek simultaneously)
- Web-based control surface for non-technical users
- Synthesis + deliberation across providers
- GitHub PR creation workflow

**The real question:** Can Ruflo's swarm engine be the *local execution layer* for Maestro's Conductor? Worth prototyping before writing the Conductor from scratch.

## Integration Path

**Option 1 (recommended):** Use `ruflo-swarm` + `ruflo-goals` as the Conductor's local execution substrate in Sprint 1. Maestro's web UI becomes the control surface for Ruflo's swarm.

**Option 2:** Extract `ruflo-rag-memory` + `ruflo-knowledge-graph` as the memory layer for the Council (Sprint 3). Complements or replaces the Postgres-based per-persona memory approach.

**Option 3 (current assessment):** Study plugins before Sprint 1. Don't install ruflo-core as a full dependency yet — prototype first.

## Action
Pull `ruflo-swarm` and `ruflo-goals` plugin READMEs. Compare against `packages/maestroclaw/src/iteration/` before writing Sprint 1 Conductor from scratch.
