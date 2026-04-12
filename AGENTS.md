# AGENTS.md
*Mandatory workflow for all agents working on the Maestro codebase.*

---

## Rule 0 — Read Before You Work

Before writing any code, making any changes, or answering architecture questions:

1. Read `MAESTRO_STATE.md` in the repo root.
2. Read this file (`AGENTS.md`).
3. If you are a CLI agent, verify the "Read This First" block at the top of MAESTRO_STATE.md is current. If it's stale, update it before proceeding.
4. If you are a web agent receiving MAESTRO_STATE.md as context, treat Part 1 (Stable Architecture) as reliable and Part 2 (Operational State) as directional — check verification dates before trusting volatile claims.

---

## Rule 1 — Update After Every Work Session

After completing any meaningful work, update MAESTRO_STATE.md:

**Part 2 (Operational State):**
- If you fixed something listed as broken, move it to "What's Working" with today's date.
- If you broke something or discovered a new issue, add it to "What's Broken or Incomplete" with today's date.
- If you verified something works, update its verification date.
- If you changed files listed in Known Drift Risks, verify and update the relevant section.

**Part 3 (Session Log):**
- Add a new entry at the top (newest first) with: date, agent name/model, what was done, files touched, decisions made, what didn't work.
- Never delete existing entries.

**Part 1 (Stable Architecture):**
- Only update if you changed the system structurally: new edge functions, new tables, new providers, new key files, changed build phases.
- If you update Part 1, note it in your session log entry.

---

## Rule 2 — Verification Discipline

- Never claim something is "working" unless you tested it or directly verified it in this session.
- If you inherit a claim from a previous session and didn't verify it, leave it as-is. Do not add your verification date to something you didn't verify.
- If you find a claim that's wrong, fix it immediately, even if it wasn't your task. Note the correction in your session log.
- Mark unverifiable claims as `(unverified)`.

---

## Rule 3 — Active Locks

If you are doing work that could conflict with another agent:

- Add an active lock to the "Read This First" block with: your name, date, what files are locked, and what condition clears the lock.
- Format: `ACTIVE LOCK (Agent, Date): Description. Locked files: [list]. Clear when: [condition].`
- When your work is done, **remove the lock immediately** in the same session. Do not leave locks for someone else to clean up.
- If you encounter a stale lock (no session log entry from that agent in 24+ hours), flag it in your session log but do not override it without Conductor approval.

---

## Rule 4 — Source of Truth Hierarchy

When information conflicts between sources, trust in this order:

1. The actual codebase (files, types, configs)
2. MAESTRO_STATE.md Part 2 (Operational State, if recently verified)
3. MAESTRO_STATE.md Part 1 (Stable Architecture)
4. Anything an agent says from memory or training data

If MAESTRO_STATE.md contradicts the codebase, the codebase wins and the document must be updated.

---

## Rule 5 — Cross-Agent Etiquette

- Do not modify another agent's session log entries.
- Do not remove information from Part 1 without Conductor approval.
- If you disagree with a decision logged by another agent, note your disagreement in your own session log entry. Do not silently revert.
- If you find something a previous agent left broken or incomplete, fix it if you can. Log what you found and what you did.

---

## Rule 6 — Web Agent Onboarding

If you are a web-based agent (Claude.ai, ChatGPT, Gemini, Kimi, etc.) receiving MAESTRO_STATE.md as pasted context:

- You cannot modify the file directly. Provide your session log entry as output for the Conductor to append.
- Clearly state any assumptions you're making that depend on Operational State claims.
- If you need information not in the document, say so explicitly rather than guessing.
- The Conductor manages the feedback loop between your output and the state file.

---

## Rule 7 — What Not to Put in MAESTRO_STATE.md

- No speculation or roadmap items. Only record what exists or what's concretely next.
- Avoid unnecessary duplication of durable reference material, but keep concise architecture summaries that web agents need for cold-start onboarding.
- No prose explanations of how things work. Keep it terse: tables, bullets, dates, file paths.
- If the document exceeds ~500 lines, it's time to extract durable reference material into `docs/architecture/` and keep MAESTRO_STATE.md as the operational layer with pointers.

---

## File Inventory

| File | Purpose | Who maintains |
|------|---------|---------------|
| `MAESTRO_STATE.md` | Universal system context + operational state + session log | Every agent, every session |
| `AGENTS.md` | Agent workflow rules (this file) | Conductor only — agents follow, don't modify |
| `docs/architecture/` | Deep reference material if MAESTRO_STATE.md outgrows its scope | Created on demand by any agent with Conductor approval |
