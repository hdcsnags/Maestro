# Reproducibility envelope — 2026-09-05-ux-council-study

- **Timestamp (UTC):** 2026-09-05T04:47:46.061Z
- **Task:** Blind, parallel UX/UI study of Home, Bible reader, theme system and navigation by the new-generation council (gpt-6-astra, Kimi K3 swarm, Gemini 3.8 Flash, Claude Fable 5.1), one shared prompt, per-model disposable clones. Conductor: Fable 5.1 (interactive session).
- **Read-only:** true

## Source repo
- Path: `C:\New folder\Elianas RhythmMigrate\Elianas Rhythm`
- Git commit: `8443db728275096df57888fdfef66b323c240964` (branch: `main`)
- Note: each model ran in its own --depth 1 --no-hardlinks clone under C:\New folder\claw-scratch; ui-ux-assessment-report.md and the tracked session.log removed from every clone before dispatch

## Content reviewed
Source files in scope (hashes of the load-bearing ones; the prompt names the full scope).

- `app/src/main/java/com/eliana/rhythm/HomeScreen.kt` — sha256 `29fa1f50a2fba1a17b75bd477d826099531efd6595b81a6239f1c78c75a5d4e2`
- `app/src/main/java/com/eliana/rhythm/BottomNavigationBar.kt` — sha256 `df9776b05e6f860fb7d574a45089ae3825ad7025009245f62f2ac040af4b2c9a`
- `app/src/main/java/com/eliana/rhythm/ui/screens/EnhancedBibleReaderScreen.kt` — sha256 `fc9830c0af78865ab074b8adf6bc23e752b77cea91d3f7dd64d6f25c4581e23f`
- `app/src/main/java/com/eliana/rhythm/ui/components/bible/ReadingDisplayComponents.kt` — sha256 `6c8a13046af6bfd417e4fc65b589a744fc650949c641f02f38937a45e1dca34c`
- `app/src/main/java/com/eliana/rhythm/ui/theme/FourThemeSystem.kt` — sha256 `0d2f41908739184f3a8a1a6862680cc5410e0ac5881de5eae3c8eeb84dea814f`
- `app/src/main/java/com/eliana/rhythm/ui/screens/SettingsScreen.kt` — sha256 `ad4c3450e9ccd10c8b3887610df48eba0de3ec259d9c7fb6c7172ef8153187c7`
- `app/src/main/java/com/eliana/rhythm/ui/components/BackgroundWrapper.kt` — sha256 `1dccef792817d22a567e1991cef6e1ef9d2e70185e5b1fe228003eab123a3b19`

## Prompt
- File: `prompt.md`
- sha256: `6e18210aedd090022a331b952eb759d91b40802533c8852b999a8a7eab0daf5b`

## Runs

### astra
- Adapter: `codex_cli` (task mode)
- Persona: none — independent review
- CLI version: codex-cli 0.153.2
- Read-only mechanism: codex --sandbox read-only (OS-enforced) + git verification
- Requested model: gpt-6-astra
- Success: true
- Elapsed: 215s
- Read-only verification: **clean**
- Output file: `astra.md` (sha256 `95b0b9d37cbce1807bc1447500bd07c7ae27814358ffc1c4aa1ee168e0a3f278`)
- Known gaps for this run: NOT FULLY BLIND: attempt 3 ran after the conductor had committed a STATE.md entry (app repo 8443db7) summarising the other seats' headline findings; the prompt permitted STATE.md and the model read it before the code, and disclosed this unprompted. Overlapping findings count as confirmation, not discovery. Attempts 1 (sandbox %TEMP% access) and 2 (usage limit) archived alongside.

### kimi
- Adapter: `kimi_cli` (task mode)
- Persona: none — independent review
- CLI version: kimi, version 1.41.0
- Read-only mechanism: instruction only (kimi has no sandbox) + git verification in a disposable clone
- Requested model: kimi-code/k3
- Success: true
- Elapsed: 640s
- Read-only verification: **clean** (new status lines: M session.log)
- Output file: `kimi.md` (sha256 `2da9fd9b9110463515b8901704a20fe02979c9cf301992a1bb3ea21377deea94`)
- Known gaps for this run: resolved model not observable from adapter output; requested model recorded only; Script flagged UNEXPECTED_WRITE_DETECTED because the app repo tracks session.log (MaestroClaw's own instrumentation). Conductor re-verified the clone by hand: only session.log changed; tracked diff excluding it is empty. Corrected to clean.; Model self-identified in its report as 'K2-class' although kimi-code/k3 was requested via -m; kimi_cli output carries no resolved-model field, so this cannot be settled from the run.

### gemini
- Adapter: `agy_cli` (task mode)
- Persona: none — independent review
- CLI version: 1.1.26
- Read-only mechanism: instruction only (agy runs --dangerously-skip-permissions scoped by --add-dir) + git verification
- Requested model: gemini-3.8-flash-high
- Success: true
- Elapsed: 233s
- Read-only verification: **clean** (new status lines: M session.log)
- Output file: `gemini.md` (sha256 `056f15b07a87297c10cefb32d5743b6d575bf64ae1203b2b693a5cc2307a953c`)
- Known gaps for this run: resolved model not observable from adapter output; requested model recorded only; Script flagged UNEXPECTED_WRITE_DETECTED because the app repo tracks session.log (MaestroClaw's own instrumentation). Conductor re-verified the clone by hand: only session.log changed; tracked diff excluding it is empty. Corrected to clean.

### fable
- Adapter: `claude_code` (task mode)
- Persona: none — independent review
- CLI version: 2.1.261 (Claude Code)
- Read-only mechanism: claude --print task mode without --dangerously-skip-permissions (writes denied) + git verification
- Requested model: claude-fable-5-1
- Success: true
- Elapsed: 361s
- Read-only verification: **clean** (new status lines: M session.log)
- Output file: `fable.md` (sha256 `ad504f4bc0b8731515964ca27f2e10185f7223356677ce5e4b1d7c60e83b4332`)
- Known gaps for this run: resolved model not observable from adapter output; requested model recorded only; Script flagged UNEXPECTED_WRITE_DETECTED because the app repo tracks session.log (MaestroClaw's own instrumentation). Conductor re-verified the clone by hand: only session.log changed; tracked diff excluding it is empty. Corrected to clean.

## Known gaps (run-set level)
- Greeting line differs per model (Hi Astra / Hi Swarm / Hi Gemini / Hi Fable); prompt.md records the canonical body with 'Hi'. Everything after the greeting is byte-identical.
- kimi_cli and agy_cli have no sandbox; read-only rests on instruction plus post-run git verification inside a disposable clone.
- Screenshots were available in the clone but no adapter's image ingestion was verified.
- astra attempt 3 (the seated run) was NOT fully blind: the clone's STATE.md carried the conductor's entry summarising the other seats' findings (app repo commit 8443db7). Astra disclosed this unprompted; its overlapping findings count as confirmation only.
- astra's first attempt (clone under %TEMP%) was blocked by the Codex sandbox's path access (`CreateProcessWithLogonW failed: 267`); the model correctly returned an empty findings array rather than inventing evidence. Re-run from C:\New folder\claw-scratch is the recorded run.

## Notes
- First MaestroClaw run of the new-generation council (Astra / K3 / 3.8 Flash / Fable 5.1) and the first four-adapter parallel run.
- Per-seat run records live in <label>-run.json (each carries its scratch_clone path); manifest assembled from them.
