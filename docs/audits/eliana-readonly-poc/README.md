# Eliana read-only proof workload — run archive

Durable storage for MaestroClaw's read-only proof-workload runs against the
"Elianas Rhythm" Bible-study app content (`C:\New folder\Elianas RhythmMigrate\Elianas Rhythm`).
Background and the architectural decision behind this whole exercise are in
`docs/audits/MAESTROCLAW-ATTACK-PLAN.md` §1 and §8 — this directory is the
data, not the narrative.

Michael's go-ahead (2026-08-17): *"go ahead and use Maestro on Eliana,
read-only for now."* Every run here is read-only by construction (verified
per-run via `git status`/`git diff` diffing, not just trusted) and exercises
MaestroClaw's real adapter-execution core locally — not the live hosted
Supabase job queue (see MAESTROCLAW-ATTACK-PLAN.md §8 for why).

## Why this exists, per-run

Each run directory is a **reproducibility envelope** — Michael's framing,
matching the full audit's own recommendation (`MAESTRO-2026-FULL-AUDIT.md`
Section M: "Reproducibility envelope: inputs/commit/skills/MCP/policy/
network/env/model/harness/session/artifact hashes"). This is the first real
instance of that idea, not a one-off writeup: `manifest.json` follows one
shared schema (`packages/maestroclaw/scripts/lib/eliana-manifest.ts`) so
future runs — any adapter, any content, any persona — are directly
comparable to these, not bespoke each time.

Every run directory contains:
- `manifest.json` / `manifest.md` — the reproducibility envelope: source repo
  commit, content hashes, exact prompt (hashed and saved in full), adapter
  CLI versions, requested/resolved models where observable, the read-only
  enforcement mechanism used per adapter, per-run read-only verification
  result, and output hashes.
- The exact prompt text used (`prompt.md` or similar).
- The exact review output text per adapter/persona combination run.
- An honest `known_gaps` list — anything the manifest *couldn't* capture for
  that run, rather than silently omitting it.

## Runs

| Run | Date | Content | Adapters | Personas | Notes |
|---|---|---|---|---|---|
| [`2026-08-17-votd-first10/`](./2026-08-17-votd-first10/) | 2026-08-17 | First 10 of 72 Verse-of-the-Day calendar entries (`votd_calendar.json`) | `claude_code` (task mode), `codex_cli` (sandbox: read-only) | none — independent review | First proof-of-concept run. Surfaced and fixed a real `codex_cli` regression (see MAESTROCLAW-ATTACK-PLAN.md §8) along the way. |
| [`2026-08-17-forsaken-cry/`](./2026-08-17-forsaken-cry/) | 2026-08-17/18 | Full "The Forsaken Cry" Aliyah study module (`ALIYAH-ASCENT-DRAFT-the-forsaken-cry-sol-pro.md`) — Psalm 22 / Matthew 27:46 | `claude_code` (task mode, models: default/sonnet-alias and explicit `claude-fable-5`), `codex_cli` (sandbox: read-only, models: default and explicit `gpt-5.6-sol`) | none (2 runs, direct comparison to 3 existing hand-run audits on this exact file), `new_believer`, `pastor`, `christian_canonical_reader` — run in **two task modes** per `PERSONAS_THEOLOGY.md` §6a: `underclaim_challenge` (the original, one-sided-by-design prompt, x3: default model + `claude-fable-5` + `gpt-5.6-sol`) and `canonical_calibration` (new, symmetric overclaim-AND-underclaim check, x2: `claude-fable-5` + `gpt-5.6-sol`) | 9 total runs. First real test of any persona from `PERSONAS_THEOLOGY.md` against real content, and a genuine methodological control: `canonical_calibration` was added after Sol flagged that the original persona prompt was one-sided by construction, then run through the same two models to see whether the original findings hold up under a symmetric task — they did, and the calibration runs also surfaced genuine overclaims the one-sided task wasn't positioned to find. The first `claude-fable-5` attempts failed on a config-profile issue (fixed with `CLAUDE_CONFIG_DIR`, not a real quota — see manifest notes); corrected re-runs are the versions recorded here. |

## Reading these

The manifests are meant to be read directly, not summarized through chat —
that's the whole point of persisting them here rather than leaving results
in a scratch directory or relaying descriptions secondhand. Open a run's
`manifest.md` first for the provenance, then the adapter/persona output
files for the actual review content.
