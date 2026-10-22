---
name: council
description: Dispatch the model council (Sol, Astra, Gemini 4 Argon, Opus 5.5, Kimi, Sonnet, Fable) on any project folder through the Council Runtime (`maestroclaw council`) for a read-only study or a write-capable coding round — brief template, seats, verdict contract, matrix, resume after usage windows, and what to verify before a row becomes a decision.
harness: [claude_code, codex_cli, agy_cli, any]
---

# Council dispatch

## The runtime
`packages/maestroclaw` → `node dist/index.js council …` (build first: `npm --prefix packages/maestroclaw run build`). No Supabase needed. Seats on different models run in one process.

```
cd "<Maestro>/packages/maestroclaw"
PYTHONIOENCODING=utf-8 node dist/index.js council run \
  --source "<project folder or repo>" --prompt "<brief file>" --seats sol,gemini,opus \
  [--no-git] [--branch main] [--mode audit|code] [--project slug] [--label name] [--timeout-min 25]
```
- `council seats` lists the catalog (sol = codex default, astra = gpt-6-astra, gemini = gemini-4-argon-high, gemini38, opus = claude-opus-5-5-high via agy, kimi = kimi-code/k3, sonnet / fable5 = claude_code). Any seat: `label=adapter:model`.
- `--no-git` copies a plain folder; without it the source is `git clone --depth 1` (untracked files are NOT seen by seats — commit first).
- `--mode code` lets coder seats write in their own copy; the runtime emits `<seat>.patch` for `git apply --3way`. Codex workspace-write was broken on this Windows box on 2026-09-11; probe with a one-line write before trusting it.
- Outputs: `docs/audits/<project>/<run-id>/` → `prompt.md`, `<seat>.md`, `<seat>-verdict.json`, `manifest.json`, `matrix.md`, `CHECKPOINT.md`. Env overrides: `COUNCIL_OUT_ROOT`, `COUNCIL_SCRATCH` (per-seat copies; default `~/.maestroclaw/council/scratch`), `MAESTRO_COUNCIL_HOME`.
- The old `scripts/council-dispatch.ts` still works as an env-driven shim (`SOURCE`, `PROMPT_FILE`, `SEATS`, `NO_GIT`, `MODE`).

## Brief template (a file; never argv)
1. Who is asking and why — Michael's words verbatim.
2. What to read — paths and sections.
3. The questions, **numbered Q1…Qn**, each with a word budget. The matrix keys on these ids.
4. "Ground every claim in the files; read-only; begin with the model you are running as."
5. The overall verdict words (e.g. `ADOPT | ADOPT_WITH_CHANGES | REWORK`).
The runtime appends the output contract (BEGIN VERDICT … END VERDICT with `attestation`, `items[{id, stance, summary, claims[{text, status, evidence}]}]`, `verdict`) unless the brief already has one. Rubrics yes, personas no ("if you disagree, say so").

## After a run
- `council status --run <dir>` — every seat `done`? A seat at `window` or `timeout` → `council resume --run <dir>` after the reset (see `usage-windows`).
- `matrix.md` is written automatically when any verdict parsed; `council matrix --run <dir>` rebuilds it. Read the **verification queue** (pushback from ≥2 seats) and the **attestation** table: a seat with `ran_verifier=no` or `attestation missing` is read-only opinion. Grounding predicts quality more than generation (2026-09-06).
- Verify every queued row yourself before it becomes a decision. Then write `SYNTHESIS.md` beside the outputs: settled / contested (name the axis) / unverifiable, decision list with defaults for Michael.
- Log the run in `MAESTRO_STATE.md` (Rule 1).

## Known seat behaviour
Astra: sharpest, expensive, usage windows on personal accounts. Sol (gpt-6.1-sol default on this box): reliable. Gemini 4 Argon: reads whole files, strong single findings, states UI facts it has not seen — pair with a grounded seat or a device pass; long payloads hit agy's response window, so keep payloads ≤ 18 items. Opus 5.5 via agy: new on this machine, probe first. Kimi K3: monthly quota, often empty. Fable 5 / Sonnet via claude_code: best framing, may lack tool access in sandboxes — the contract makes them mark claims unverified. Empty agy responses are now failures, not successes (fixed 2026-10-21).

## Blindness
Seats never see each other's output in a round. Scrub STATE entries that summarise other seats before re-seating a model mid-study (2026-09-05 leak). Multi-round debate (Debate Room) shares a redacted transcript on purpose; that is the only sanctioned way.
