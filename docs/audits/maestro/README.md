# Maestro — council runs on Maestro itself

Runs of `packages/maestroclaw/scripts/council-dispatch.ts` where `SOURCE` is this repo. Each folder holds `prompt.md`, per-seat `<seat>.md` (+ `<seat>-verdict.json` when the seat ended with a BEGIN/END VERDICT block), and a conductor `SYNTHESIS.md`. Read `SYNTHESIS.md` first; per-seat files are the evidence.

| Run | Date | Question | Seats | Result |
|---|---|---|---|---|
| [`2026-09-22-vision-council/`](./2026-09-22-vision-council/) | 2026-09-22 | Review of `MAESTRO_INTELLIGENCE_ORCHESTRATION_VISION (1).md` (minimum sufficient intelligence, local-first, any industry). "Don't be bound by the vision; what is Michael missing?" | astra (gpt-6-astra) ✓ · gemini (agy default, Gemini 3.8 Flash High) ✓ · kimi (K3) ✗ quota · fable-conductor (not blind) | 14-row three-way convergence; 9 ruled divergences; 6 owner decisions; 5-step reconciled sequence. See `SYNTHESIS.md`. |
