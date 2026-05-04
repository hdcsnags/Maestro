# Agents Onboarding — Read Before Touching This Repo

**Audience:** Sonnet 4.6, GPT-5.5, Gemini 3.1 Pro, future Opus sessions, any agent picking up work cold.
**Length:** Short on purpose. The 5-minute version of how to be useful here.

---

## You are joining a multi-agent project

This repo is **Maestro** — a multi-agent AI orchestration console. The codebase itself is built by multiple agents working in coordinated rotation:
- **Opus 4.7** writes architectural specs and reviews security-critical implementations.
- **Sonnet 4.6** is the implementation workhorse — most code lands through Sonnet.
- **GPT-5.5** is used for mid-size refactors and prompt-engineering work.
- **Gemini 3.1 Pro** is used for long-context multi-file refactors and UI work.
- **Human (Michael)** is the Conductor — he coordinates the rotation, makes final calls.

Your session is **one slice of one stream** of work. Three implications:
1. Other agents are also touching this repo. Read commit history before assuming code is in the state your spec describes.
2. The Conductor is paying for your time. Be efficient. No 2000-word preambles.
3. **Document your work.** Future sessions inherit your decisions. Underdocumented work creates confusion and rework.

---

## Read These Three Files Before Anything Else

In order:

### 1. `MAESTRO_STATE.md`
The universal onboarding doc. Has three parts:
- **Part 1 — Stable Architecture:** stack, key files, DB tables, edge functions. Doesn't change session-to-session.
- **Part 2 — Operational State:** "what's working" (with verification dates) and "what's broken" tables. Verify these claims if you're going to act on them — dates can drift.
- **Part 3 — Session Log:** append-only. Newest first. Read the last 3-5 entries to understand recent work.

If something in Part 2 conflicts with code you're reading, **trust the code**. Update the state doc.

### 2. `IMPLEMENTATION_PLAN.md`
The master plan. 17 task blocks (`SEC-01`, `UX-02`, `PRO-01`, etc.) plus 3 tech-debt items. Each task block has:
- Files Touched
- Current State (where the code is now)
- Target State (where the code should end)
- Acceptance Criteria
- Verification (specific tests, not just "typecheck passes")
- Dependencies
- Open Questions (where the spec is intentionally vague)

If a task has Open Questions, **a dedicated spec doc resolves them.** Look for `<TASK-ID>_*_SPEC.md` (e.g., `SEC-02_TRUST_MODEL_SPEC.md`). The dedicated spec is authoritative; the master plan task block is the summary.

### 3. `IMPLEMENTATION_PLAN_STATUS.md`
The append-only ledger. Shows what's claimed, in progress, verified. Update it when you finish.

---

## How To Pick Up A Task

1. Look at `IMPLEMENTATION_PLAN_STATUS.md`. Find a task tagged "not started" or "spec ready" with no agent claimed.
2. Confirm the recommended agent in the task block matches you. **Do not implement Opus-tagged tasks on Sonnet without explicit human approval.** Those tasks have architectural decisions that need senior judgment.
3. If a dedicated spec doc exists for the task (e.g., `SEC-02_TRUST_MODEL_SPEC.md`), **read that doc, not just the master plan block.** Sonnet sessions have gotten confused by reading only the master plan.
4. Check Dependencies. If a dependency isn't `verified` in the status file, do not start.
5. Resolve all Open Questions in the task/spec **before writing code**. If a question is unresolved and there's no dedicated spec answer, **stop and ask the human**. Do not invent an answer to a security-critical or architectural question.
6. Implement.
7. Verify (see standards below).
8. Update status + state.

---

## Verification Standards — Non-Negotiable

The previous 30 days of this codebase shipped 10 UX phases verified with `npm run typecheck` only. None of them have been browser-smoke-tested. **This is the failure mode of this project.** Don't repeat it.

For every task:

| Required | Why |
|----------|-----|
| `npm run typecheck` | TypeScript clean |
| `npm run build` | Production build succeeds |
| `npm --prefix packages\maestroclaw run build` | If you touched MaestroClaw |
| **Browser smoke test** | Actually open the app, click through the changed flow. Watch network tab. Confirm runtime behavior matches spec. |
| Unit tests where the task block specifies | Some tasks (security-critical) require tests |

If you can't run a browser smoke test (e.g., you're in a non-interactive sandbox), **say so explicitly in your status update**. Mark verification status `partial` not `verified`. Don't pretend.

---

## How To Update Status & State

### `IMPLEMENTATION_PLAN_STATUS.md`

Update the row in the relevant phase table:
```
| SEC-04 | Sonnet 4.6 | verified | 2026-05-04 | <one-line note> |
```

Then prepend a line to the Append Log:
```
- 2026-05-04 | SEC-04 | Sonnet 4.6 | verified | <2-3 sentences on what shipped, what's worth knowing>
```

### `MAESTRO_STATE.md`

Add an entry at the **top** of Part 3 — Session Log:
```
### YYYY-MM-DD — <Agent Name> — <Short title>

**What was done**:
1. ...
2. ...

**Files touched**: `path/to/file.ts`, ...

**Decisions made**:
- ...
- ...

**What didn't work**:
- ...
```

If your work fixed an active blocker or added a working capability, **also update the relevant table in Part 2.** "What's Working" gains a row with date. "What's Broken" loses one.

If your work changed something in Part 1 (Stable Architecture — new tables, new edge functions, new key files), **also update Part 1.** Don't let architecture facts drift.

---

## What You Should NOT Do

- **Do not skip the spec.** "I read the master plan and figured out the rest" is how confusion ships. Read the dedicated spec doc if one exists.
- **Do not invent schemas or API contracts.** If a spec defines a JSON shape, use that shape. If it doesn't define one, **stop and ask** before defining your own.
- **Do not refactor outside scope.** A task touches the files it touches. If you see something else that "should" be cleaned up, leave it. Note it in your "What didn't work" section as future work.
- **Do not skip verification.** Even small tasks. Especially small tasks — they're where regressions hide.
- **Do not destroy work.** Never `git push --force`, `git reset --hard`, or `rm` a file that you didn't create in this session, without explicit human approval.
- **Do not commit secrets.** Even in test fixtures. Use env vars or `*.example` patterns.
- **Do not silently change a contract.** If you discover the spec is wrong, **stop and document the gap.** Do not "fix" it by silently modifying the contract.

---

## When To Stop And Ask

Stop and surface to the human if:

- You hit an Open Question in a spec that wasn't resolved.
- You discover the spec contradicts the code you're reading.
- A security-critical decision needs to be made that isn't in the spec.
- You've spent more than 30 minutes on what was supposed to be a "small" task.
- A test that should pass doesn't, and you don't understand why.
- You're tempted to add a "TODO" or "FIXME" comment — that's a sign you're stopping early; either fix it or stop and document.

The Conductor would much rather you stop and ask for 2 minutes of clarification than ship something subtly wrong.

---

## Agent-Specific Notes

### Sonnet
You are the workhorse. Most tasks are tagged Sonnet. Trust the spec — it's been written for you. Implement crisply. Don't overengineer. If you finish a task in 30% of the estimated time, that's good — move on.

### Opus
You write the specs others implement. When you implement, you're doing the security-critical or architecturally-novel work. **Your judgment is the decider** — when in doubt, you decide and document. Other agents will follow what you decide.

### Gemini
You shine on long-context refactors and UI multi-file work. Many UI tasks (`UX-01` orb, `UX-03` stuck-job UI, `DIFF-01` cost rollup card) are good fits. Watch for TypeScript strict-mode edge cases — that's your historical weak spot here.

### GPT-5.5
You're tagged on mid-size refactors (`DIFF-03` lane-scoped slicing). You write good test coverage; lean into that.

---

## Quick Reference — Files By Purpose

| If you need to… | Look at… |
|----------------|----------|
| Understand what Maestro is | `MAESTRO_STATE.md` Part 1 |
| Find a task to do | `IMPLEMENTATION_PLAN_STATUS.md` |
| Implement a task | `<TASK-ID>_*_SPEC.md` if it exists, else `IMPLEMENTATION_PLAN.md` task block |
| Find type definitions | `src/types/index.ts` (single source of truth) |
| Find an edge function | `supabase/functions/<name>/index.ts` |
| Find a migration | `supabase/migrations/` |
| Understand a recent change | Last 3 entries of `MAESTRO_STATE.md` Part 3 |
| Understand the kernel | `packages/maestroclaw/src/lib/kernel/` + `THAMOSCLAW_KERNEL.md` |
| Understand build reliability concerns | `smoketestaudit.md` |

---

## One Last Thing

This project is the Conductor's vision. He has been pacing himself across multiple agent sessions for weeks because no single agent has enough context to hold all of it. Your contribution is more valuable when it builds on what came before than when it tries to redo what came before. Read first. Implement crisply. Document well. Hand off cleanly to the next agent.

Welcome to the council.

---

*This document supersedes any agent's training-data assumptions about how this repo works. If something here conflicts with what you "know," trust the document.*
