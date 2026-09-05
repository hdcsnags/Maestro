# Reproducibility envelope — 2026-08-17-votd-first10

- **Timestamp (UTC):** 2026-08-17T~20:07:00Z (approximate — exact adapter start times were not machine-recorded for this first run)
- **Task:** Independent editorial/theological review of the first 10 of 72 Verse-of-the-Day calendar entries. No persona injected — plain independent-review prompt only. First real proof-of-concept run of MaestroClaw's adapter-execution core against non-coding content, per Michael's explicit read-only go-ahead.
- **Read-only:** true

## Source repo
- Path: `C:\New folder\Elianas RhythmMigrate\Elianas Rhythm`
- Git commit: `00d1eb34ce58b47e85f7a7bb6187a4768ad89594` (branch: `main`)
- Note: app/src/main/assets/studies/votd_calendar.json is uncommitted in the source repo (untracked, "?? " in git status) — not covered by the git commit above. Its content hash is recorded separately below since a plain git clone does not include uncommitted content (the same way a real hosted job cloning from a repo_url over the network never would).

## Content reviewed
First 10 entries (by array order) of app/src/main/assets/studies/votd_calendar.json's 72-entry `days` array. Each entry: reference, chainNumber, elianaTranslation, noticeThis, whyItMatters, carryItWithYou.

- `app/src/main/assets/studies/votd_calendar.json` — sha256 `c1a31f45893ad7fc4b38cd82585bf9c84a90b10fe1f130941ce2f9e544d97ee0` — Full-file hash (all 72 entries) at time of this run — only the first 10 were extracted into the prompt.

## Prompt
- File: `prompt.md`
- sha256: `5c5a176aa9ad3986e7fdfade0a7a8ce1bef36c8f535d46083ab416f816021455`

## Runs

### claude_code-task-mode
- Adapter: `claude_code` (task mode)
- Persona: none — independent review
- CLI version: 2.1.234 (Claude Code)
- Read-only mechanism: Claude Code default permission model — --dangerously-skip-permissions is never passed in task mode, so unresolvable write/edit requests are denied rather than executed in non-interactive mode.
- Requested model: sonnet (alias; CLAW_CLAUDE_MODEL not set, adapter default)
- Resolved model (from adapter's own banner/output): not observable — --print --output-format text emits no banner/metadata; known gap, see below
- Success: true
- Elapsed: 124.9s
- Read-only verification: **clean** (new status lines: ?? session.log (expected MaestroClaw session-log instrumentation))
- Output file: `claude_code-task-mode.md` (sha256 `e6bdef6388545e4ccd62fb932107255f93634f0bd4e2c5afcc62152af9737092`)
- Known gaps for this run: Exact resolved Claude model snapshot not captured — text output mode emits no banner. Would require --output-format json to observe; not changed mid-run to avoid altering adapter behavior for this benchmark.

### codex_cli-sandbox-read-only
- Adapter: `codex_cli` (task mode)
- Persona: none — independent review
- CLI version: codex-cli 0.147.0
- Read-only mechanism: Codex native OS-level sandbox, --sandbox read-only (CodexCliAdapter constructor option added this session).
- Resolved model (from adapter's own banner/output): not captured for this specific run — see known gap below
- Session id: not captured for this specific run — see known gap below
- Success: true
- Elapsed: 152s
- Read-only verification: **clean**
- Output file: `codex_cli-sandbox-read-only.md` (sha256 `c15ed4ecddf299ca7405decd0432a85af024295765fded92609bdafeb1c685c8`)
- Known gaps for this run: Codex prints its resolved model/session id to stdout in a startup banner even in exec mode, but this run's harness only captured the final --output-last-message content, discarding the banner. Fixed going forward: scripts/lib/eliana-manifest.ts's parseCodexBanner() + an onLine capture hook in the Forsaken Cry round's harness recovers this for all subsequent runs.

## Known gaps (run-set level)
- Adapter start timestamps were not individually machine-recorded for this first run (elapsed durations were captured; absolute start/end times were not) — fixed going forward.
- Network policy was not explicitly configured or observed for either adapter in this run.
- No MCP servers or Agent Skills were configured or used in this run.

## Notes
- Both reviews were generated independently — neither adapter was shown any of the existing manual review files (FABLE-REVIEW-votd-calendar-72-entries.md, SOL-AUDIT-votd-calendar-72-entries.md, SOL-AUDIT-votd-calendar-pass2-final.md) already present in the Elianas Rhythm repo from tonight's hand-run council process.
- Building this run's { sandbox: 'read-only' } codex_cli option surfaced and fixed a real regression: '--ask-for-approval never' (added in Sprint 1) does not parse on the actually-installed Codex CLI when placed after the exec subcommand — every real codex_cli invocation had been failing since Sprint 1 shipped. See docs/audits/MAESTROCLAW-ATTACK-PLAN.md §8 for the full account.
