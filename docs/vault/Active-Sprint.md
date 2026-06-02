# Active Sprint

Last updated: 2026-06-02 — Copilot CLI (Sonnet 4.6)

## Two Concurrent Tracks

---

### Track A — FLOW / SOM / AGENT / MEM
Full spec in `docs/SPRINT_MASTER.md`. Last updated: 2026-05-11.

| Item | Code | Status | Owner |
|---|---|---|---|
| Orb Status Instrument | FLOW-02 | 🟡 In progress | Sonnet |
| Verbosity Tiers | FLOW-04 | 🟡 In progress | Gemini |
| Structured Session Log | AGENT-01 | 🟡 In progress | Sonnet/OpenAI |
| Command Palette (Cmd+K) | FLOW-06 | 🟡 In progress | Gemini |
| Personas as Capability Routers | SOM-04 | 🔴 Opus-owned | Opus |
| SSE Streaming | SOM-01 | 🔵 Blocked | Sonnet (needs source repo) |
| Cross-CLI Critique Protocol | SOM-02 | 🔵 After SOM-04 | Sonnet |
| Decision Graph + Institutional Memory | MEM-02 | 🔵 Sprint Round 4 | Sonnet |

---

### Track B — Conductor Sprint 1
Full spec in `docs/CONDUCTOR_SPRINT_1.md`. Started: 2026-06-02.

| Item | Code | Status | Owner |
|---|---|---|---|
| Karpathy principles in buildSystemPrompt | C-01 | ✅ Done 2026-06-02 | Sonnet |
| repo_memory kind+relations enhancement | C-02 | ⬜ Next | Sonnet |
| Conductor coordinator module (maestroclaw) | C-03 | ⬜ After C-02 | Sonnet |
| Remove 2-at-a-time cap from useBuildExecution.ts | C-04 | ⬜ With C-03 | Sonnet |
| Superpowers skills embed in Conductor prompt | C-05 | ⬜ With C-03 | Sonnet |
| Born Organized scaffold pack | C-06 | ⬜ Post-Conductor, opt-in | Sonnet |

---

## Completed This Session (2026-06-02)

- **C-01** ✅ Karpathy 4 principles added to `orchestrate/index.ts:buildSystemPrompt()` (build + build_task modes)
- **Addon shelf** ✅ `.addons/` shelf with 6 plugin assessments + `INTEGRATION_PLAN.md` (Opus 4.8 assessment)
- **Vault seeded** ✅ `docs/vault/` Obsidian knowledge graph initialized (7 core notes)
- **Sprint doc** ✅ `docs/CONDUCTOR_SPRINT_1.md` created

---

## Blocked / Needs Input

| Blocker | Needs |
|---|---|
| SOM-01 SSE Streaming | User to identify which machine/repo has working SSE code (Android native? T6 Maestro?) |
| GitHub sync verification | User providing live GitHub repo URL (in progress this session) |
| Supabase function deploy | Verify C-01 Karpathy embed is in deployed `orchestrate` — needs Supabase CLI push or GitHub Actions trigger |

---

## P1 Bugs Outstanding (from Opus audit)

| ID | Issue | File | Sprint |
|---|---|---|---|
| P1-4 | github-execute last-write-wins on path collisions | `github-execute/index.ts:973-979` | C-03 |
| P1-5 | Dispatch-loop false-deadlock (gates on claimed not terminal state) | `useBuildExecution.ts` | C-03 |

---

## Related Notes
- [[Architecture]]
- [[Key-Files]]
- [[MaestroClaw]]
