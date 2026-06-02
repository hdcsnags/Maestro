# Obsidian CLI Skill — Plugin Summary

**Source:** https://github.com/pablo-mano/Obsidian-CLI-skill  
**Pulled:** 2026-06-02  
**Version:** v1.3.0  
**Requires:** Obsidian v1.12+

## Overview
A `SKILL.md`-based skill giving AI agents full control of Obsidian vaults via the official Obsidian CLI. Covers 130+ commands: files, daily notes, search, properties, tags, tasks, links, bookmarks, templates, plugins, sync, themes, dev tools.

## Compatibility: ✅ MEDIUM-HIGH — RAG / Persistent Project Memory layer

**The actual use case (not note-taking):** Obsidian as a persistent knowledge graph for Maestro's project documentation. Every audit agent currently has to re-map the entire project from scratch — reading `MAESTRO_STATE.md`, `AGENTS.md`, `REFERENCE.md`, `ARCHITECTURE.md`, specs in `docs/specs/active/`, etc. This is:
- Expensive in tokens every cold-start
- Inconsistent (each agent interprets the map differently)
- Not persistent across agent sessions

An Obsidian vault with proper wikilinks solves this:
- Document relationships are pre-built and stored (e.g., `orchestrate/index.ts` → `buildSystemPrompt` → `ResponseSignals` → `FolioCard`)
- Agents query the vault instead of re-reading the codebase
- The vault updates incrementally — not a full re-read on each audit

### The Obsidian CLI skill makes the vault *programmable*:
- Agent reads architecture graph: `obsidian search query="buildSystemPrompt"` or `obsidian backlinks path="orchestrate.md"`
- Agent updates the map after making changes: `obsidian property:set path="..." name="last-verified" value="2026-06-02"`
- Daily session log: `obsidian daily:append content="- Sprint 1 Conductor: locks.ts verified"`

### Fit for Maestro
This directly addresses the "MAESTRO_STATE.md gets stale / agents re-map every session" problem documented in AGENTS.md. The vault becomes the live project memory that survives agent sessions, reducing cold-start mapping cost.

**Also relevant:** ECC (affaan-m/ECC) solves this with hooks that auto-save/load context. Both approaches are complementary — ECC for agent-side memory, Obsidian for the human-readable project knowledge graph.

## Integration Path
1. Create an Obsidian vault mirroring Maestro's doc structure
2. Build wikilink graph: edge functions ↔ Supabase tables ↔ key source files
3. Use this CLI skill to let build agents query/update the vault
4. Vault becomes the "warm handoff" document for every new agent session

## Revisit: ✅ Not a skip — evaluate for Sprint 3 Council memory layer
