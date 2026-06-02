# Maestro — Project Vault

Agent cold-start document. Read this first, then follow links. Last updated: 2026-06-02.

## In One Paragraph
Maestro is a web-based AI orchestration console. It broadcasts prompts to a 5×3 agent roster (15 agents across Claude, GPT, Gemini, Qwen, DeepSeek, Kimi providers), collects responses in a 3D carousel, synthesizes them, and executes code changes to GitHub via Supabase Edge Functions. The local execution node (`maestroclaw`) runs CLI adapters in a parallel poll loop. The Conductor sprint (next major build) will add a lead-agent coordinator layer.

## Quick Navigation
- [[Architecture]] — 3-layer system design and data flow
- [[Edge-Functions]] — All 19 edge functions and their roles
- [[Database]] — 13 Supabase tables
- [[MaestroClaw]] — Local execution node (`packages/maestroclaw/`)
- [[Key-Files]] — Where to find things in the codebase
- [[Active-Sprint]] — What's being built right now

## Stack
- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + custom design system
- **Backend:** Supabase (PostgreSQL + RLS + 19 Deno Edge Functions)
- **Auth:** Supabase auth (session token used for all Edge Function calls)
- **Local node:** Node.js `packages/maestroclaw/`
- **No router** — navigation is pure state (`AuthPage` vs `WorkspacePage` + drawers)

## Key Rules for Agents (from AGENTS.md)
1. Read `MAESTRO_STATE.md` + `AGENTS.md` before any work
2. Update `MAESTRO_STATE.md` after every work session
3. Source of truth: codebase > MAESTRO_STATE.md > REFERENCE.md > agent memory
4. Active locks go in the "Read This First" block of MAESTRO_STATE.md
5. `audit_events` is append-only — never update or delete rows
6. `database.types.ts` is generated — never hand-edit

## What's NOT Built Yet
- [[Architecture#Layer 1 Conductor]] — Sprint 1
- [[Architecture#Layer 2 Bridge]] — Sprint 2
- Concierge-triage edge function
- SSE streaming (port from Android/T6 variant — source TBD)
- Per-persona persistent memory (only flat `repo_memory` exists)
- Obsidian export generator (vault currently hand-seeded)

## How to Use This Vault
Open `docs/vault/` as an Obsidian vault. Use `[[WikiLinks]]` to navigate relationships. 
When architecture changes: update the relevant note AND `MAESTRO_STATE.md`.
This vault is a **read-projection** of `repo_memory` — it will eventually be auto-generated. Until then, keep it updated manually after major sprints.
