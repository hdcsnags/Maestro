# Rate v1 — model + harness reputation (on-disk ledger)

Records: 18 (3 council seat runs, 15 grading-lab ranks). Keys are resolved model + harness; "resolved" says how often the CLI itself reported the model (copilot "auto" lesson, 2026-07-01).

| model | harness | runs | done | window/timeout | verdict parsed | attested | ran verifier | verified claims | pushback items | median s | peer rank (avg/of) | human rank | resolved |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| claude-fable-5 | copilot | 3 | – | 0/0 | – | – | – | – (0/0) | – | – | 1.7 / 5.0 | 1.5 | 100% |
| gpt-5.4 | copilot | 3 | – | 0/0 | – | – | – | – (0/0) | – | – | 4.7 / 5.0 | 4.0 | 100% |
| gpt-5.5 | codex | 3 | – | 0/0 | – | – | – | – (0/0) | – | – | 2.7 / 5.0 | 2.5 | 100% |
| grok | grok | 3 | – | 0/0 | – | – | – | – (0/0) | – | – | 1.7 / 5.0 | 2.0 | 0% |
| K2.7 | kimi | 3 | – | 0/0 | – | – | – | – (0/0) | – | – | 4.3 / 5.0 | 5.0 | 100% |
| claude-opus-5-5-high | agy_cli | 1 | 100% | 0/0 | 100% | 100% | 100% | 95% (21/22) | 86% | 253 | – | – | 0% |
| gemini-4-argon-high | agy_cli | 1 | 0% | 0/0 | 0% | 0% | 0% | – (0/0) | – | – | – | – | 0% |
| gpt-6.1-sol | codex_cli | 1 | 100% | 0/0 | 100% | 100% | 100% | 92% (11/12) | 100% | 110 | – | – | 100% |

Read it as evidence, not a leaderboard: grounding columns (attested, ran verifier, verified claims) predicted quality in the 2026-09-06 study; pushback share is engagement, not correctness; rank columns are blind peer consensus from grading-lab (1 = best).
