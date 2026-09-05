# Reproducibility envelope — 2026-08-21-votd-risk-weighting

- **Timestamp (UTC):** 2026-08-21T19:55:28.819Z
- **Task:** Likelihood x impact x fix-cost weighting of the 8 candidate safety-risk flags from the prior Pastor/Scholar VOTD review, against the app's real, known, intended audience (closed test track, church-recruited initial users, general public at wider release) — per Michael's explicit instruction not to treat every theoretical misuse as equally weighted regardless of realistic likelihood. Also checks whether the calendar, or the proposed safety fixes, cost real theological depth/conviction for a diffuse or low-probability concern.
- **Read-only:** true

## Source repo
- Path: `C:\New folder\Elianas RhythmMigrate\Elianas Rhythm`
- Git commit: `00d1eb34ce58b47e85f7a7bb6187a4768ad89594` (branch: `main`)
- Note: votd_calendar.json read live from source, unmodified.

## Content reviewed
Full votd_calendar.json (72 entries) plus the 8 flagged references from the prior round.

- `app\src\main\assets\studies\votd_calendar.json` — sha256 `fb71d884b9a40954ca3be94626c101dfc335a43794631cd97614c3fba9090c78`

## Prompt
- File: `prompt-pastor-risk-weighting.md`
- sha256: `f8cb0d46569d5b41317a784bb033ad76da97f11e6207a08a1b27bf35dbaa2dbc`

## Runs

### risk-weighting-fable
- Adapter: `claude_code` (task mode)
- Persona: **pastor** (verbatim from `.michael\opus\PERSONAS_THEOLOGY.md`)
- CLI version: 2.1.238 (Claude Code)
- Read-only mechanism: Claude Code default permission model (no --dangerously-skip-permissions in task mode).
- Requested model: claude-fable-5
- Success: true
- Elapsed: 201.9s
- Read-only verification: **clean**
- Output file: `risk-weighting-fable.md` (sha256 `f8b6d835720dc616724a2d0d0d12fae06dc1a38c60b1c9d7693d9fba457853bf`)

### risk-weighting-sol
- Adapter: `codex_cli` (task mode)
- Persona: **pastor** (verbatim from `.michael\opus\PERSONAS_THEOLOGY.md`)
- CLI version: codex-cli 0.147.0
- Read-only mechanism: Codex native OS-level sandbox, --sandbox read-only.
- Requested model: gpt-5.6-sol
- Resolved model (from adapter's own banner/output): gpt-5.6-sol
- Session id: 01a025e2-fecf-7df2-8542-af3bc9370f61
- Success: true
- Elapsed: 100.2s
- Read-only verification: **clean**
- Output file: `risk-weighting-sol.md` (sha256 `19ce2b67e0604dcfb2f6635448b6e6a6901fc9a3db9abf514db315b6527f49bc`)

## Known gaps (run-set level)
- Pastor persona only, not Scholar — this task is pastoral/audience judgment, not textual rigor.
- The app's actual future audience composition (post-closed-test-track) is genuinely unknown; both runs were told to say so where it matters rather than assume.

## Notes
- Direct follow-up to Michael's 2026-08-21 instruction to weigh likelihood and impact against the actual user base rather than treat any theoretical misuse as sufficient grounds for a fix.
