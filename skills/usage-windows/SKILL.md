---
name: usage-windows
description: What to do when a council or coder seat hits a usage window, quota or payload cap mid-run — recognise it from the seat status, keep working, and resume the same run after the reset with `council resume`.
harness: [any]
---

# Usage windows and quotas

## Recognise (the runtime classifies these as seat status)
- `window` — adapter output names a reset ("usage limit … resets at HH:MM", 429, `403 access_terminated` for Kimi's monthly quota). Codex personal/Plus accounts hit this in minutes on Astra; the work account rarely does.
- `timeout` — agy's ~5-minute response window on a large payload. Split the payload; waiting does not help.
- `empty` — the seat exited cleanly with no text (agy auto-denied a tool, or a seat refused). Rerun once; if it repeats, the brief is asking for a tool the seat cannot use.
- `failed` — read `<seat>.md` "adapter error". Claude Code adapter: set `CLAW_CLAUDE_FALLBACK_MODEL` so rate limits fall to a smaller model.

## Respond
1. `council checkpoint --run <dir> "sol window, resets 19:49; resume"` — the line lands in `CHECKPOINT.md` and the manifest, so a crash or a new session can see it.
2. Continue: your own build, verification, another seat that has budget. Never spend Astra to cover Sol.
3. Schedule the retry. Inside a `/loop`, `ScheduleWakeup(delaySeconds, prompt, reason)` with the same instruction ("council resume --run <dir>") and a delay to the reset (clamped to 1 h; chain wake-ups if longer). Outside a loop, `CronCreate` a one-shot.
4. On wake: `node dist/index.js council resume --run <dir>` — only seats that are not `done` re-dispatch; outputs land beside the finished ones; the matrix is rebuilt.

`council usage --days 30` shows which seats have been hitting windows; use it to pick seats for the next brief.
