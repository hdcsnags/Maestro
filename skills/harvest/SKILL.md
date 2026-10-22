---
name: harvest
description: Turn the "takeaways" paragraphs of a session-log entry into skill proposals — repeatable procedures only, never facts about the codebase — and land them as a reviewable diff under skills/ with the entry that justified them, so the next agent inherits the procedure instead of rediscovering it.
harness: [claude_code, codex_cli]
---

# Harvest learned procedures

OpenClaw's rule (2026.10.5) is the right one: learned skills hold **repeatable procedures**, not facts. Facts about the codebase belong in `docs/reference/REFERENCE.md` or `repo_memory`; one-off results belong in the session log.

## When
At the end of every session that wrote a "Maestro-side takeaways", "What didn't work" or "Adapter lessons" paragraph. Also on request: `harvest <date>` for an older entry.

## Procedure
1. Read the entry. Extract candidate lines shaped as **when X, do Y, because Z** (verified on a date). Examples that qualified: "`python -I` ignores `PYTHONIOENCODING`; use `-X utf8`", "check `df /data` before an emulator install; uninstall to recover", "ask agy seats to emit the verdict block first or cap per-card notes", "one seat per process because adapters read env at import" (now obsolete — retire it).
2. For each candidate decide the home: an existing skill (add a line under the right heading) or a new `skills/<name>/SKILL.md` (frontmatter `name`, `description` that says when to use it, `harness`). Skip anything that is a fact, a result, or a one-time workaround already fixed in code.
3. Write the diff. Cite the session entry date in the line you add (`(2026-10-18)`), so a future reader can find the evidence.
4. Retire procedures the entry proves wrong (edit or delete the stale line; say why in the commit).
5. `maestroclaw skills` regenerates `skills/index.json` and the `.claude/skills` pointers. Commit as `skills: harvest <date>` — one commit per harvest so it can be reverted with one command.
6. Note in the session entry which lines were harvested and where.

## Don'ts
- No persona text, no rubric wording from briefs, no model opinions. Procedures only.
- Don't duplicate a line that exists in another skill; link to that skill by name.
- Don't harvest unverified claims. "(unverified)" lines stay in the log until someone checks them.
