# Reproducibility envelope — 2026-08-17-forsaken-cry

- **Timestamp (UTC):** 2026-08-18T01:48:10.021Z
- **Task:** Round 2 of the Eliana read-only proof workload. Run A: independent editorial/theological review of the full 'The Forsaken Cry' Aliyah study module, both adapters — direct comparison basis to three existing hand-run audits on this exact file (SOL-AUDIT/FABLE-AUDIT/KIMI-AUDIT-forsaken-cry-sol-pro.md). Run B: first real test of the New Believer and Pastor personas from .michael/opus/PERSONAS_THEOLOGY.md against real content, both through claude_code only (adapter held constant to isolate the persona variable).
- **Read-only:** true

## Source repo
- Path: `C:\New folder\Elianas RhythmMigrate\Elianas Rhythm`
- Git commit: `00d1eb34ce58b47e85f7a7bb6187a4768ad89594` (branch: `main`)
- Note: ALIYAH-ASCENT-DRAFT-the-forsaken-cry-sol-pro.md is uncommitted in the source repo (untracked) — copied explicitly into the clone, same handling as the VOTD round. Content hash recorded below.

## Content reviewed
Full text of the Aliyah study module 'The Forsaken Cry' (Eli Eli lema sabachthani / Psalm 22 / Matthew 27:46).

- `ALIYAH-ASCENT-DRAFT-the-forsaken-cry-sol-pro.md` — sha256 `baca0d57aae351366514601ba742bb593f82737cc98a1762f610773b939724da` — Full document, uncommitted in source, copied into clone.

## Prompt
- File: `prompt-independent-review.md (Run A); prompt-new-believer.md / prompt-pastor.md (Run B, personas verbatim from PERSONAS_THEOLOGY.md prefixed to the same review task)`
- sha256: `8be48c18fee5b66cef8a71c0e4ba03ff33ccb0e6a14fd6b204451e1a4e1c2db0`

## Runs

### claude_code-independent
- Adapter: `claude_code` (task mode)
- Persona: none — independent review
- CLI version: 2.1.234 (Claude Code)
- Read-only mechanism: Claude Code default permission model (no --dangerously-skip-permissions in task mode).
- Requested model: sonnet (alias; adapter default)
- Resolved model (from adapter's own banner/output): not observable — --print --output-format text emits no banner
- Success: true
- Elapsed: 179.5s
- Read-only verification: **clean** (new status lines: ?? session.log)
- Output file: `claude_code-independent.md` (sha256 `326a47a0c8f83ed0ae878d53b0a26d91a8ff2885463893eba85a2e7b6bfbb457`)

### codex_cli-independent
- Adapter: `codex_cli` (task mode)
- Persona: none — independent review
- CLI version: codex-cli 0.147.0
- Read-only mechanism: Codex native OS-level sandbox, --sandbox read-only.
- Resolved model (from adapter's own banner/output): gpt-5.6-sol
- Session id: 01a0128a-81f6-7021-a14a-d42cab9cec27
- Success: true
- Elapsed: 127.7s
- Read-only verification: **clean**
- Output file: `codex_cli-independent.md` (sha256 `fb1a0584e3f9323f4edf1e257fcac067f6d0118080d714a13b452abc1a9c731d`)

### claude_code-persona-new_believer
- Adapter: `claude_code` (task mode)
- Persona: **new_believer** (verbatim from `.michael/opus/PERSONAS_THEOLOGY.md`)
- CLI version: 2.1.234 (Claude Code)
- Read-only mechanism: Claude Code default permission model (no --dangerously-skip-permissions in task mode).
- Requested model: sonnet (alias; adapter default)
- Success: true
- Elapsed: 24.3s
- Read-only verification: **clean**
- Output file: `claude_code-persona-new_believer.md` (sha256 `9e436d9a50dc74d0aa6f7551fbea3ab5614a36e0255ca6ea6a10b86a326ba8c0`)

### claude_code-persona-pastor
- Adapter: `claude_code` (task mode)
- Persona: **pastor** (verbatim from `.michael/opus/PERSONAS_THEOLOGY.md`)
- CLI version: 2.1.234 (Claude Code)
- Read-only mechanism: Claude Code default permission model (no --dangerously-skip-permissions in task mode).
- Requested model: sonnet (alias; adapter default)
- Success: true
- Elapsed: 75s
- Read-only verification: **clean**
- Output file: `claude_code-persona-pastor.md` (sha256 `db08129c9ed2c50602bbf51e9049d73aca46d4a722f55f61213f1f7583668fc3`)

### claude_code-persona-christian_canonical_reader
- Adapter: `claude_code` (task mode)
- Persona: **christian_canonical_reader** (verbatim from `.michael/opus/PERSONAS_THEOLOGY.md`)
- CLI version: 2.1.234 (Claude Code)
- Read-only mechanism: Claude Code default permission model (no --dangerously-skip-permissions in task mode).
- Requested model: sonnet (alias; adapter default)
- Success: true
- Elapsed: 53s
- Read-only verification: **clean** (new status lines: ?? session.log)
- Output file: `claude_code-persona-christian_canonical_reader.md` (sha256 `fab4500c6b084ee19078af2060bcb459ce94deb403ef431e7c7ebac69396061a`)

### claude_code-persona-christian_canonical_reader-fable
- Adapter: `claude_code` (task mode)
- Persona: **christian_canonical_reader** (verbatim from `.michael/opus/PERSONAS_THEOLOGY.md`)
- CLI version: 2.1.234 (Claude Code)
- Read-only mechanism: Claude Code default permission model (no --dangerously-skip-permissions in task mode).
- Requested model: claude-fable-5
- Resolved model (from adapter's own banner/output): not observable — --print --output-format text emits no banner/metadata (same known gap as prior claude_code runs)
- Success: true
- Elapsed: 112.3s
- Read-only verification: **clean** (new status lines: ?? session.log)
- Output file: `claude_code-persona-christian_canonical_reader-fable.md` (sha256 `6a6233f4c834d9ae22356df331a99195ee05f7ae0e27062f6aefab0e6273edf3`)

### codex_cli-persona-christian_canonical_reader-sol
- Adapter: `codex_cli` (task mode)
- Persona: **christian_canonical_reader** (verbatim from `.michael/opus/PERSONAS_THEOLOGY.md`)
- CLI version: codex-cli 0.147.0
- Read-only mechanism: Codex native OS-level sandbox, --sandbox read-only.
- Requested model: gpt-5.6-sol
- Resolved model (from adapter's own banner/output): gpt-5.6-sol
- Session id: 01a012eb-7909-7613-987d-57fc2010d441
- Success: true
- Elapsed: 61.1s
- Read-only verification: **clean** (new status lines: ?? session.log)
- Output file: `codex_cli-persona-christian_canonical_reader-sol.md` (sha256 `651085e9f24ffb053c9438c3ca3086e033e80dc31e87dea53bcd0b9372dd5c12`)

### claude_code-persona-christian_canonical_reader-canonical_calibration-fable
- Adapter: `claude_code` (task mode)
- Persona: **christian_canonical_reader** (verbatim from `.michael/opus/PERSONAS_THEOLOGY.md`)
- CLI version: 2.1.234 (Claude Code)
- Read-only mechanism: Claude Code default permission model (no --dangerously-skip-permissions in task mode).
- Requested model: claude-fable-5
- Resolved model (from adapter's own banner/output): not observable — --print --output-format text emits no banner/metadata (same known gap as prior claude_code runs)
- Success: true
- Elapsed: 102s
- Read-only verification: **clean** (new status lines: ?? session.log)
- Output file: `claude_code-persona-christian_canonical_reader-canonical_calibration-fable.md` (sha256 `0b7e720065dcf6c9e048ed0b6918ec1ae6065a79713e87703880ae988c436a59`)

### codex_cli-persona-christian_canonical_reader-canonical_calibration-sol
- Adapter: `codex_cli` (task mode)
- Persona: **christian_canonical_reader** (verbatim from `.michael/opus/PERSONAS_THEOLOGY.md`)
- CLI version: codex-cli 0.147.0
- Read-only mechanism: Codex native OS-level sandbox, --sandbox read-only.
- Requested model: gpt-5.6-sol
- Resolved model (from adapter's own banner/output): gpt-5.6-sol
- Session id: 01a014aa-be08-7613-b782-723261bd9230
- Success: true
- Elapsed: 64.8s
- Read-only verification: **clean** (new status lines: ?? session.log)
- Output file: `codex_cli-persona-christian_canonical_reader-canonical_calibration-sol.md` (sha256 `7427399e655865dfa3af02a2e4a5a7ce7f40477bfd884f4c5b7fe39840000713`)

## Known gaps (run-set level)
- Claude Code's exact resolved model snapshot is not observable in --print --output-format text mode for any of the three claude_code runs (same known gap as the VOTD round).
- Personas were run through claude_code only, not codex_cli — deliberate scope choice to isolate the persona variable, not an oversight; see file header comment.
- Only 2 of the 5 personas in PERSONAS_THEOLOGY.md were run (New Believer, Pastor) — Atheist/Skeptical Reader, Jewish Reader, and Scholar are candidates for a later round.
- Christian Canonical Reader was run alone (not alongside a fresh run of the other five personas on the same content in the same sitting) — a full six-persona comparison on this document is a candidate for a later round, not done here.

## Notes
- Direct comparison basis: SOL-AUDIT-forsaken-cry-sol-pro.md, FABLE-AUDIT-forsaken-cry-sol-pro.md, and KIMI-AUDIT-forsaken-cry-sol-pro.md (all in the Elianas Rhythm repo root) are hand-run independent audits of this exact file from earlier the same night — Run A is directly comparable to those three.
- PERSONAS_THEOLOGY.md's own 'Verification note' asks whether persona outputs are structurally different from each other, not just differently worded — read new_believer's and pastor's outputs side by side with that question in mind.
- Addendum run added after Michael read all four original outputs and identified a real, specific gap: every review (both independent runs, New Believer, Pastor) treated authorial intent behind the psalm-quotation as requiring a heavy hedge every time, on the grounds of no interior access to Yeshua's consciousness — sidestepping that within the app's own confessed Christian canonical frame, an established narrative pattern across the whole Gospel record already licenses a more confident reading. Sonnet added persona #6, christian_canonical_reader, to PERSONAS_THEOLOGY.md (with an origin note quoting Michael's reasoning verbatim) specifically to make this argument systematically. This run is that persona's first real test, against the same document, same adapter, isolated the same way as the other two persona runs.
- Model/wrapper consistency addendum (2 more runs, same persona, same document): first attempt at claude_code with CLAW_CLAUDE_MODEL=claude-fable-5 failed with "Fable 5 requires usage credits..." (exit code 1) — this looked like an account quota issue but was actually a config-profile issue, already documented in COUNCIL-INVOCATION.md and confirmed by Michael on 2026-08-15: the default session profile isn't provisioned for Fable 5 at all; a separate profile is. Re-run with CLAUDE_CONFIG_DIR="$HOME/.claude-thamos" set alongside CLAW_CLAUDE_MODEL=claude-fable-5 (propagated through to the spawned claude child process via buildChildEnv()'s passthrough — no adapter code change needed) succeeded. codex_cli with CLAW_CODEX_MODEL=gpt-5.6-sol succeeded on the first attempt, with the banner confirming the requested model actually resolved (model: gpt-5.6-sol) rather than silently falling back to a default. Both persona runs are now complete and comparable.
- Symmetric-calibration control (2 more runs, 9 total): Sol reviewed the earlier christian_canonical_reader outputs and identified a real methodological point — the persona as originally drafted is one-sided by construction, built specifically to hunt for underclaiming. PERSONAS_THEOLOGY.md §6a now splits this persona into two task modes: `underclaim_challenge` (the original prompt, preserved exactly — Sol: "it's a really good prosecution prompt") and new `canonical_calibration` (checks for BOTH overclaiming and underclaiming, explicitly instructed not to assume either exists, its own CANONICAL CALIBRATION / Overclaimed: / Underclaimed: required ending format overriding the persona's default deliberation_signature). Ran canonical_calibration through the same two models as the underclaim_challenge control (claude-fable-5 via claude_code, gpt-5.6-sol via codex_cli) as an explicit test of whether the earlier underclaim_challenge findings hold up when the persona isn't told in advance which direction to look. Result: both calibration runs independently re-surfaced the same central underclaim as the original runs (the 'he chooses — or, at minimum, Matthew deliberately gives him' hedge on Yeshua's intentionality) while ALSO surfacing genuine, specific overclaims the one-sided underclaim_challenge task was never positioned to find (e.g. a citation graded as 'steel'/direct-quotation that the module's own wording concedes is closer allusion) — evidence the original finding wasn't an artifact of a leading prompt, and that the symmetric task mode does its own distinct, additional work rather than just softening the original.
