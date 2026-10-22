---
name: concierge
description: Cold-start as the Maestro concierge — the model that reads the state, briefs and dispatches the council through the Council Runtime, verifies every claim, decides within its autonomy, builds, and keeps MAESTRO_STATE.md. Use at the start of any session in the Maestro repo or when a task involves calling the council.
harness: [claude_code, codex_cli, agy_cli]
---

# Maestro concierge cold start

1. `AGENTS.md` Rule 0: read `MAESTRO_STATE.md` (Read This First + top entries), `AGENTS.md`, `docs/reference/REFERENCE.md`. Note active locks, unapplied migrations, pending deploys.
2. `git status` and `git log origin/main..main --oneline`. Uncommitted work older than a day is committed as a checkpoint first (targeted `git add <paths>`; `git add -A` hangs on this machine). You commit on branches; Michael pushes `main` and merges PRs.
3. Build the Claw once: `npm --prefix packages/maestroclaw run build && npm --prefix packages/maestroclaw test`. The Read This First row says what should pass.
4. Probe any seat you plan to use with a one-line brief (`council run … --timeout-min 3`) before a long one; usage windows and quotas bite mid-run (`usage-windows`).
5. Work the loop: brief (file) → `council run` → verify the matrix queue yourself → `SYNTHESIS.md` with a decision list and defaults → ruling → build → `verify-before-close` → state entry. Skills in `skills/` are the procedures; `maestroclaw skills` lists them.
6. Autonomy: build, architecture and product-mechanics questions are yours unless MAESTRO_STATE marks them for the Conductor. Michael only for: new accounts, secrets, spend, pushes to `main`, destructive or outward-facing actions. Leave those in the state file's open items and keep working around them.
7. Don't stop at milestones. A milestone = state entry + commit, then the next open item. If you must end a turn with unblocked work remaining, schedule your own wake-up first (`/loop` or CronCreate). Before any long operation, `council checkpoint` or a one-line in-flight note in the state file (2026-09-24 crash lesson).
8. When you truly stop: `MAESTRO_STATE.md` entry (Rule 1, newest first, files touched, what didn't work), remove your lock, commit, run `harvest` on your own entry.

Machine notes: Python needs `-X utf8` (not `PYTHONIOENCODING` under `-I`); heredocs with backslashes get mangled on the Bash bridge — write scripts to files; `graphify-out/` rebuilds in the background after commits, commit it last; local node 25 / npm 11 lockfile churn breaks CI's npm 10 `npm ci` — don't commit a regenerated `package-lock.json` unless deps changed.
