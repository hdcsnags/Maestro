# Reproducibility envelope — 2026-08-21-votd-pastor-scholar

- **Timestamp (UTC):** 2026-08-21T19:42:28.262Z
- **Task:** First persona-based review of the full 72-entry VOTD calendar (previously only model-diversity reviews had run against it). Pastor + Scholar personas, each through Fable (claude_code) and Sol (codex_cli, read-only sandbox) — 4 runs. Prompt explicitly asks each run to distinguish a genuine, specific misuse-pattern risk from a generic hedge triggered by proximity to suffering language, per Michael's 2026-08-21 pushback on reflexive safety-flagging.
- **Read-only:** true

## Source repo
- Path: `C:\New folder\Elianas RhythmMigrate\Elianas Rhythm`
- Git commit: `00d1eb34ce58b47e85f7a7bb6187a4768ad89594` (branch: `main`)
- Note: votd_calendar.json read live from source, unmodified — this is a read-only review round, no edits applied by this script.

## Content reviewed
Full votd_calendar.json (72 entries).

- `app\src\main\assets\studies\votd_calendar.json` — sha256 `fb71d884b9a40954ca3be94626c101dfc335a43794631cd97614c3fba9090c78`

## Prompt
- File: `prompt-pastor.md; prompt-scholar.md`
- sha256: `a69ec098cc0bbb03336677602e19e608eafe0aca2b1c1519cf2d9b9c42192d00`

## Runs

### pastor-fable
- Adapter: `claude_code` (task mode)
- Persona: **pastor** (verbatim from `.michael\opus\PERSONAS_THEOLOGY.md`)
- CLI version: 2.1.238 (Claude Code)
- Read-only mechanism: Claude Code default permission model (no --dangerously-skip-permissions in task mode).
- Requested model: claude-fable-5
- Success: true
- Elapsed: 277.8s
- Read-only verification: **clean**
- Output file: `pastor-fable.md` (sha256 `af23be4d3de9d4727890fe39153edf1cf3c5470803295a27a3cec1112a8c3dd3`)

### pastor-sol
- Adapter: `codex_cli` (task mode)
- Persona: **pastor** (verbatim from `.michael\opus\PERSONAS_THEOLOGY.md`)
- CLI version: codex-cli 0.147.0
- Read-only mechanism: Codex native OS-level sandbox, --sandbox read-only.
- Requested model: gpt-5.6-sol
- Resolved model (from adapter's own banner/output): gpt-5.6-sol
- Session id: 01a025ce-6b74-7040-859e-2deff6690bff
- Success: true
- Elapsed: 179s
- Read-only verification: **clean**
- Output file: `pastor-sol.md` (sha256 `846d3e2a2f1f1bf90765621d8f520537b5862b8827107ed4cbd420bc027acb19`)

### scholar-fable
- Adapter: `claude_code` (task mode)
- Persona: **scholar** (verbatim from `.michael\opus\PERSONAS_THEOLOGY.md`)
- CLI version: 2.1.238 (Claude Code)
- Read-only mechanism: Claude Code default permission model (no --dangerously-skip-permissions in task mode).
- Requested model: claude-fable-5
- Success: true
- Elapsed: 252.8s
- Read-only verification: **clean**
- Output file: `scholar-fable.md` (sha256 `2b1a0e39324f941dd638592764f47ce1ab61ced3a883fa1bd86118305a3e7d80`)

### scholar-sol
- Adapter: `codex_cli` (task mode)
- Persona: **scholar** (verbatim from `.michael\opus\PERSONAS_THEOLOGY.md`)
- CLI version: codex-cli 0.147.0
- Read-only mechanism: Codex native OS-level sandbox, --sandbox read-only.
- Requested model: gpt-5.6-sol
- Resolved model (from adapter's own banner/output): gpt-5.6-sol
- Session id: 01a025d5-0485-73e1-929d-59dfcddc38a2
- Success: true
- Elapsed: 235.7s
- Read-only verification: **clean**
- Output file: `scholar-sol.md` (sha256 `29ba099ac6814c40617f0bf2ded585239088b31ecc92ab4ef95538bc32f380fd`)

## Known gaps (run-set level)
- This round did not apply any fixes — findings only, for Michael/Sonnet to weigh, matching the project's standing 'don't force consensus' discipline.

## Notes
- Closes the gap Michael identified: no persona had ever been run against the VOTD calendar, only model-diversity (Fable/Sol/Kimi as themselves).
