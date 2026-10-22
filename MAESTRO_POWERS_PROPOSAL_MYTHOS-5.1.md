# Maestro — Ten Powers Proposal

**Author:** Claude Code (claude-mythos-5-1), 2026-10-19
**Status:** Proposal for the Conductor and the council to challenge. No code changed.
**Asked:** "New skills, new features, new powers that could level this project up in a major way, so that if I share it publicly it stands."
**Read first:** `MAESTRO_STATE.md`, `AGENTS.md`, `docs/MAESTRO_PHILOSOPHY.md`, `docs/audits/maestro/2026-09-22-vision-council/SYNTHESIS.md`, `C:\New folder\Elay\RETRO-MAESTRO.md`.

This document does not re-litigate what the council already ruled on 2026-09-22 (routing is not the moat; no T0–T7 ladder; adopt MCP / A2A / Agent Skills; grounding attestation is the escalation signal) or what was decided 2026-07-01 (trust spine, then Rate v1 thin keyed on resolved model + harness). It builds on those rulings and names what to build next.

---

## 0. Diagnosis — what the repo actually says

Six things fell out of reading the state file, the audits, the scripts and the Elay retro together. Every proposal below traces to one of them.

1. **The product moved and the repo has not noticed.** The web app (Claw Mode, 19 edge functions, 52 migrations) took its last feature on 2026-07-06. Since 2026-08-17, every result that mattered came from `packages/maestroclaw/scripts/council-dispatch.ts` plus a Claude Code concierge, markdown briefs, `docs/audits/<project>/<run>/` outputs, a hand-built agreement matrix, and a `SYNTHESIS.md`. The Elay run built a working app in one day with Michael typing nothing after kickoff. That script-and-protocol spine is the thing worth shipping. Today it is 30 project-specific scripts, four skills in another repo, and hard-coded `C:\New folder\...` paths.
2. **The verify-before-close loop is the product; the models are parts.** The retro's final answer. The orchestrator's own error class never went away; it was caught every time by an independent verifier. Nothing in the runtime enforces that loop. It lives in skills and in the conductor's discipline.
3. **Grounding predicts quality more than generation does.** The 09-06 five-seat experiment: seats that ran the corpus were right every time checked; the seat that could not but said so was also right; the seats that stayed silent about skipping verification were the worst. The vision council made this the escalation signal. No field in any schema records it.
4. **Decisions ruled, not built.** Rate layer (net-new per the graph, decided twice), top-k seat selection, prompt provenance, grounding attestation, the decision-capture step, the fix-pass ledger, the regression seat. All named in session logs as "what Maestro lacked and the conductor did by hand".
5. **Roster and cost are fiction.** `src/types/index.ts` lists Gemini 2.5, GPT-5.4 and Haiku 4.5. The seats that actually sat this autumn were gpt-6-astra, gpt-5.6-sol, gemini-4-argon, gemini-3.8-flash, kimi K3, fable-5.1, mythos-5.1. Local CLI seats have no usage ledger; usage windows and quotas were the single most frequent operational failure in the log.
6. **OpenClaw has moved on skills, resumption, cost and catalogs.** As of 2026.10.5 it searches installed skills on demand instead of stuffing the prompt, learns repeatable procedures with one-press Undo, resumes interrupted subagent work after restarts, reports 30-day usage by who started the session, and refreshes model catalogs live. The June verdict stands: borrow patterns, never the runtime. The borrow list is longer now.

---

## 1. The ten powers

Ranked by leverage per week of work. Each entry: what, why now (evidence), how (files), borrowed from, first consumer.

### Power 1 — Council Runtime: the protocol becomes the product

**What.** Promote the script spine to a first-class, versioned CLI: `maestroclaw council` with sub-commands `brief`, `run`, `status`, `resume`, `matrix`, `synthesize`, `rule`. A run is a directory with a manifest; briefs are files; seats are declared, not hard-coded; outputs are the same `<seat>.md` + `<seat>-verdict.json` the audits already use. The web app becomes a viewer of runs, not a second implementation.

**Why now.** Diagnosis 1. A public user cannot run `eliana-votd-cohesion.ts`. The generic `council-dispatch.ts` already proved the shape; the Elay `/council` skill is its manual.

**How.**
- `packages/maestroclaw/src/council/` — `brief.ts` (template + validation: who asks, what to read, numbered questions with word budgets, output contract), `run.ts` (the current dispatch loop, with seats from a `seats.json` catalog instead of a `switch`), `manifest.ts` (promote `scripts/lib/eliana-manifest.ts`), `matrix.ts` (port `matrix.py`; one row per item, one column per seat, agreement count, grounding column), `verdict.ts` (the `BEGIN VERDICT` contract as a schema, verdict-first ordering, re-ask for the block alone when truncated).
- `packages/maestroclaw/src/cli.ts` — `council` command group. Paths from env or config, never literals.
- Keep `scripts/eliana-*.ts` as frozen history; move anything still useful into `examples/`.

**Borrowed from.** OpenClaw's gateway-as-runtime split (policy outside the model), MiroFish's ReportAgent as the synthesis stage.

**First consumer.** The next Eliana or Elay study runs on the CLI, not a new script.

### Power 2 — Debate Room: multi-round deliberation with a convergence governor

**What.** Seats talk back and forth for as many rounds as the disagreement is still moving, then stop. Not "until they agree". The output is a partition: settled, contested with the axis named, unverifiable. This is the ask in the brief, built on PRO-01 instead of against it.

**Why now.** PRO-01 chose one round in v1 ("by R3 agents are echoing R2"). That is true when nothing changes between rounds. It is false when round N+1 carries new evidence (a verifier's result, a conductor's correction, a seat's self-critique). The research since says the same: stop on evidence of convergence, not on a round count; and beware judge-driven consensus collapsing into majority voting and conformity (Free-MAD). Maestro's own 09-06 result adds the fix the papers lack: weight stances by grounding, not by count.

**How.**
- **Transcript as artifact.** One append-only `DEBATE.md` per run: round headers, redacted voices (reuse `supabase/functions/deliberate/redact.ts` logic locally), each seat's `objection / agreement / self_critique` block from PRO-01. Seats read the file and append; nothing else is shared. This makes the blindness-leak rule of 09-05 mechanical: what a seat saw is in the transcript.
- **Stance matrix.** After each round, `convergence.ts` builds a matrix: items × seats, cell = `{stance, grounded, changed_since_last_round}`. Convergence score = fraction of cells that did not change. Stop when the score is stable for one round, or budget/round cap is hit, or every remaining contested item is marked unverifiable by all seats.
- **Dissent seat.** Each round one seat is assigned the skeptic persona (`personas` table, slug `skeptic`) and must file the strongest objection to the current majority. Rotates. Prevents conformity collapse.
- **Silence rule.** A seat whose stances have not changed for two rounds is not re-prompted (saves tokens; borrowed from rank-adaptive cross-round debate).
- **Two-seat mode.** PRO-01 refuses under three seats. Add a `duel` mode: two seats, a verifier breaks ties by running the claim. The VOTD and Deeper-insight councils were two-seat runs.
- **Synthesis reads the trajectory.** `synthesize` already preserves tension (v14). Give it the matrix history: "settled in round 2 after Voice B conceded; contested on axis X across all rounds; unverifiable: 3 items".
- Cloud path: `deliberate` gains `round_index`; `rounds.deliberation_round_index`; `responses.kind` stays `deliberation`, add `round_index`. Local path: `council run --rounds auto`.

**Borrowed from.** Sequential consensus governors (Wald-SPRT stopping on judge evidence), adaptive stability detection for judges, Free-MAD's warning. See sources.

**First consumer.** Re-run the 09-22 vision council as a three-round debate and compare the settled/contested partition to the hand-written SYNTHESIS §4.

### Power 3 — Grounding attestation, claim ledger, prompt provenance

**What.** Every seat output carries a machine-readable attestation: did it run the verifier, which tools it used, and per claim: `verified | unverified | inferred | disputed`. Every prompt carries provenance: `human | concierge | agent | synthesized | system`. The matrix, the synthesis, the grader and the router all read these fields.

**Why now.** Diagnosis 3. The 09-22 council made grounding the escalation signal and ruled that no model inherits another model's certainty (vision §13). Not one field exists. Gemini 3.6 "never mentions the verifier and never says it skipped it" is the failure this closes.

**How.**
- Verdict contract gains `attestation: { ran_verifier, tools: [], corpus_access: granted|denied|unknown }` and `claims: [{ id, text, status, evidence_ref }]`. Seats that omit it get one re-ask, then are marked `attestation: missing` (which is itself a grade).
- `brief.ts` stamps `provenance` on every section; peer output pasted into a brief is labelled `claims by Voice A, not requirements`.
- Local ledger `runs/<id>/claims.jsonl`; cloud mirror as `claims` table later.
- Trust displayed as grounding × agreement, never agreement alone. A unanimous ungrounded row ranks below a single verified one.

**Borrowed from.** Nothing external. This is Maestro's own finding and nobody else ships it.

**First consumer.** The matrix's grounding column; Rate v1 (Power 6) keys on it.

### Power 4 — Verifier seat and hollow-green detection as runtime

**What.** No round closes without an adversarial verifier from a different model and harness, and the runtime checks the verifier's evidence, not just its verdict.

**Why now.** Diagnosis 2. The retro lists what verifiers caught that green gates did not: three silently failed edits, byte-identical screenshots under different names, zero-test "allTests", NO-SOURCE lint, a false "fixed" line in STATE, a `| tail` that swallowed BUILD FAILED.

**How.**
- `council run --verify <seat>`: after coder seats return patches, a verifier seat receives the patch, the brief and the claims ledger and must return per-claim `confirmed | refuted | could_not_run`.
- `evidence.ts` runs mechanical checks before a round can be marked closed: screenshots md5-distinct and filename matches capture description; test runners report non-zero test counts; lint reports non-zero source files; gate scripts run under `pipefail` and must print a `GATE_GREEN` marker. Any miss is a hard block with a named reason.
- `/build-gate` and `/usage-windows` from Elay move into the Maestro repo as the canonical skills (Power 7) and are what the runtime invokes.

**Borrowed from.** The Elay retro, verbatim.

**First consumer.** `MODE=code` council runs; the C-06 style merge gates in `grading-lab`.

### Power 5 — Ruling Ledger: flags with a lifecycle

**What.** Replace the boolean `responses.is_flagged` (and the unused legacy `flags` table) with a typed flag that moves through `raised → verified → ruled → fixed → regressed`. Decision capture is a step in the runtime, not a chat the conductor remembers to have.

**Why now.** The 09-06 session named exactly this as what the conductor did by hand: a decision-capture step between synthesis and build, a fix-pass ledger mapping matrix rows to commits, and a regression seat. MEM-02 decision records exist but only fire from iteration loops.

**How.**
- `rulings` table (or `runs/<id>/rulings.json` locally): `{ id, run_id, item_ref, severity, raised_by, verified_by, grounding, status, ruling: adopt|reject|defer|needs_owner, ruled_by, ruled_at, commits[], regressed_by }`.
- `council rule`: presents open verified rows with defaults ("adopt, 2 seats + verifier"), captures the owner's one-word ruling, writes the ledger. The four-question pattern from 09-06 is the UI.
- Commit messages reference ruling IDs; `council status` shows unfixed-adopted rows; the regression seat (Power 4) re-checks only `fixed` rows.
- Web: `FolioCard` flag chip opens the ruling, not a toggle. Drop the legacy `flags` table in the same migration.

**Borrowed from.** OpenClaw's Workboard "run status, rules, pins"; standard ADR practice.

**First consumer.** The next Eliana fix pass, which today maps SYNTHESIS rows to commits by hand.

### Power 6 — Rate v1 local, seat ablation, top-k seats

**What.** The reputation layer the graph says does not exist, built where the data already is: on disk. Plus one genuinely new instrument: leave-one-seat-out synthesis to measure each seat's marginal contribution.

**Why now.** Decided 2026-07-01 and again 2026-07-06; still a structural island. `grading-lab/` has graded tasks with Spearman 0.90 to the human anchor; `docs/audits/**/-verdict.json` holds dozens of seat verdicts; the 09-06 table is a reputation record written by hand. Waiting for a Supabase schema has cost three months.

**How.**
- `packages/maestroclaw/src/rate/` — `ledger.ts` (SQLite or JSONL under the Maestro data dir), `ingest.ts` (walks `grading-lab/tasks/*/grades/` and `docs/audits/**/*-verdict.json` plus manifests), `score.ts` (key = resolved model + harness + task class + domain; signals = verified-claim rate, overclaim rate, attestation honesty, agreement-with-verified-consensus, latency, cost, window failures; cold-start priors from PHILOSOPHY Part 2, decayed as data arrives).
- **Seat ablation.** `council synthesize --ablate`: re-run the synthesis N times, each with one seat's output removed; the diff in settled/contested rows is that seat's marginal contribution for this task class. Shapley-lite, cheap, and the most honest reputation signal available. Record it.
- **Top-k.** `council run --seats auto --k 3 --diversity 1` picks the top-k by reputation for the task class and forces one seat from a different provider family. Deliberation runs only when the stance matrix shows disagreement (Power 2).
- Resolved model identity is captured from the adapter (`kimi_cli` emits none; record `unresolved` and treat it as a reputation penalty until fixed).
- Supabase `grades` table comes later as a sync target, not a prerequisite.

**Borrowed from.** The 07-01 wrapper lesson (copilot "auto" resolved to fable-5); MiroFish's God's-eye variable injection, turned inward.

**First consumer.** Builder-lane scoring in Pre-Build, per the 07-01 decision; seat selection for the next council.

### Power 7 — Skills flywheel on the Agent Skills standard, with learned-procedure harvest

**What.** A `skills/` directory in the Maestro repo in `SKILL.md` format (the open standard Claude Code, Codex, agy and OpenClaw all read), injected per harness by description search rather than whole-library dumping, and a harvest step that proposes new skills from session logs with Undo.

**Why now.** Diagnosis 6. The "Maestro-side takeaways" paragraphs in the session log are skill candidates nobody files: `python -X utf8` on this machine, `df /data` before an emulator install, agy wants the verdict block first, `--rerun` a Gradle task restored from cache, one seat per process because adapters read env at import. OpenClaw 2026.10.5 makes "learned skills are repeatable procedures, not facts" the rule and gives them one-press Undo; 2026.10.1 searches skills on demand. The Elay repo already holds four skills that belong here.

**How.**
- `skills/<name>/SKILL.md` with frontmatter `name, description, harness: [claude_code|codex_cli|agy_cli|kimi_cli|any], triggers[]`. Start by moving `/council`, `/build-gate`, `/usage-windows`, `/concierge` from Elay and Eliana.
- `skills/index.json` built by a script; adapters receive only the index (name + description) and read a skill on demand. Replace the inline superpowers embed in `conductor/prompt.ts` with a reference to the same mechanism.
- **Harvest.** `council harvest <session-log-entry>`: a cheap model extracts candidate procedures ("when X, do Y, because Z, verified on date") from a session log entry, proposes a skill diff, the conductor accepts or rejects, and the acceptance is a commit that can be reverted with one command. Only procedures; never facts about the codebase (those belong in `repo_memory`).
- **Harness registry.** `harnesses/<id>.json` per vision §14: tools, sandbox flags, filesystem and network scope, known quirks. A skill declares which harnesses it applies to. The AndroidDevHarness the retro describes is the reference entry.

**Borrowed from.** OpenClaw learned skills + ClawHub search; the Agent Skills open standard.

**First consumer.** Every council run (skills injected into briefs by harness) and the end of every session (harvest).

### Power 8 — Reader swarm: distribution before judgment

**What.** The MiroFish pattern that actually transfers: generate N stakeholder personas from the project's own material, run a cheap wide pass (20 to 50 lightweight readers, local or free-tier models) to get a distribution, then spend the expensive council on the places where the distribution is bimodal. Plus per-seat temporal memory so a returning seat knows what it flagged last time.

**Why now.** The theology persona pack (`.michael/opus/PERSONAS_THEOLOGY.md`) and the pastor/scholar reviews did this by hand for Eliana. The reader council's best findings came from the device pass, which no code-only seat could see. A swarm answers "what fraction of first-time readers stumble here"; a council answers "is this claim true". Maestro conflates the two.

**How.**
- `swarm/personas.ts`: seed material (docs, screenshots, store listing) in, `personas.json` out (name, priors, blind spots, what they read first, what they skip), generated once per project and edited by the owner.
- `council swarm --readers 30 --model <cheap>`: one brief, N persona-conditioned runs, structured reactions per item (`stumbled | neutral | delighted` plus one sentence). Output is a histogram per item, not prose.
- Council brief gains a "swarm says" section with the bimodal items only.
- **Seat memory.** `runs/` indexed by project and seat; a seat's brief gets "you reviewed this project on <dates>; your open rows: …; rows since fixed: …". Enables a true regression seat and stops re-finding. Store as files first (OpenClaw's memory plugin pattern is overkill until there are 30 runs).
- Local inference: the swarm is the first consumer of the OpenAI-compatible `base_url` provider the 09-22 council recommended for grading. OpenClaw 2026.10.5 ships a worker-local inference runtime; Maestro needs only an adapter.

**Borrowed from.** MiroFish: persona generation from seed, parallel agents with independent personalities, temporal memory updates, report stage. Not its simulation engine.

**First consumer.** Eliana's next content audit; the Solar Explorer toddler app (a 30-reader "parent" swarm would have found the parent-gate gap in minutes).

### Power 9 — Live roster, usage windows and a cost ledger that includes local seats

**What.** The roster comes from probing the installed CLIs and providers, not from a TypeScript constant. Usage windows and quotas are tracked per seat with reset times, and the scheduler routes around them. Every seat run, local or cloud, lands in one cost and usage ledger with "started by" attribution.

**Why now.** Diagnosis 5. The `/usage-windows` skill describes a manual loop; OpenClaw does this in the runtime (30-day usage, by creator, CSV export, live catalog refresh, per-run model fallback). Astra's windows, Kimi's monthly quota and agy's five-minute payload cap each cost a seat in at least two studies.

**How.**
- `roster/probe.ts`: `agy models`, `codex` config default model, `claude` model list, `kimi -m` probe, provider `/models` endpoints. Output `roster.json` with `resolved_model`, `harness`, `last_seen`, `stability`. `src/types/index.ts` `AGENT_DEFAULTS` becomes a fallback only, with a staleness warning in the UI.
- `quota/windows.ts`: parse adapter errors for reset times (the skill already lists the patterns), persist `{ seat, reset_at, reason }`, expose to `council run` so it skips or schedules; `council resume` re-dispatches the same brief at reset with the same `RUN_ID`.
- `usage/ledger.jsonl`: per run, per seat: tokens if known, wall time, exit class (success, window, quota, timeout, empty), `started_by`. Extend `src/lib/cost.ts` to read it. Report: `council usage --days 30`.
- Fix the two known adapter honesty bugs on the way: `agy_cli` empty response is not success; a truncated `BEGIN VERDICT` triggers one re-ask for the block alone.

**Borrowed from.** OpenClaw 2026.9.6 usage reporting and 2026.10.x live catalog.

**First consumer.** The very next multi-seat run.

### Power 10 — Attested sandbox, resumable runs, in-flight checkpoints

**What.** Table stakes in the OpenClaw era, scoped to what the attack plan already decided: delegate isolation to each CLI's native sandbox, but record which sandbox flag was active and refuse to mark a run read-only-clean if the attestation is missing. Runs survive a crash or a closed window. The conductor writes a one-line in-flight checkpoint that outlives the session.

**Why now.** The 09-24 crash recovery found the transcript was the only record of what was running. The 16-hour stall in the Elay retro is the same failure from the other side. OpenClaw 2026.9.6 and 10.5 resume interrupted turns and subagent work after restarts. Codex `workspace-write` is broken on this machine and nobody can tell from a run folder whether a seat ran sandboxed.

**How.**
- Adapters emit `sandbox: { mode, flag, verified: bool }` in `AdapterResult`; `council run` writes it into the seat header next to read-only verification.
- `runs/<id>/manifest.json` carries seat status (`queued | running | done | window | failed`), so `council resume <id>` re-dispatches only what is missing. The `usage-windows` wake-up becomes a runtime feature.
- `council checkpoint "gate running over D2+D3"` appends to `runs/<id>/CHECKPOINT.md`; `MAESTRO_STATE.md` Read This First shows the last checkpoint line. Cheap, and it would have saved the 09-24 reconstruction.
- Outer isolation (VM or container for the whole worker) stays an owner decision, flagged, not built.

**Borrowed from.** OpenClaw sandbox verification ("refuses sources it cannot verify") and restart-safe resumption; the attack plan's own §1 table.

**First consumer.** `MODE=code` runs and every long study.

---

## 2. What I would not build

- **Not the OpenClaw runtime, still.** Its vision rejects orchestration layers; Maestro is one. Borrow the four patterns above.
- **Not MiroFish's simulation engine.** OASIS-scale social simulation is a different product. Take persona generation, temporal memory and the report stage; leave the digital world.
- **Not a universal leaderboard.** Reputation is per task class and domain or it is noise (vision §12).
- **Not consensus as the goal.** The Debate Room optimizes for a stable, grounded partition. A unanimous ungrounded council is the failure mode, not the success.
- **Not a custom PTY or shell policy engine.** The attack plan already ruled; the native sandboxes own that.
- **Not streaming first.** SOM-01 is the biggest "feel" win, but it polishes the surface that is no longer where the work happens. After Powers 1 to 5.
- **Not fine-tuning a local Maestro model.** First make Maestro able to evaluate local models (vision Workstream H); the swarm in Power 8 is that evaluation.

---

## 3. Public-readiness checklist (what has to be true before it stands)

1. One entry point: `maestroclaw council …` runs a study on any folder with a brief file and no edits to source. Paths from config.
2. `scripts/eliana-*.ts` frozen or moved to `examples/`; `.michael/` and project audits with private content (Eliana theology, Elay business) excluded from the public tree or moved to a private sibling repo. `docs/audits/maestro/` can stay as the worked example.
3. Roster probed, not hard-coded; the UI shows staleness.
4. Supabase project id, GitHub App name and `gh` account names out of tracked docs.
5. The two adapter honesty bugs fixed (`agy_cli` empty-success, truncated verdict).
6. `README.md` leads with the council protocol and a five-minute worked run, then the web console.
7. One public worked example end to end: brief → seats → matrix → rulings → fix pass → regression seat, on a small open repo.
8. Threat model written in two columns, hosted and local, as `PHILOSOPHY` Part 6 promises.

---

## 4. Sequencing

Keeps the 2026-07-01 decision intact (trust spine, then Rate v1 thin) and the 09-22 ruling (ledger and route receipts first).

| Weeks | Build | Why this order |
|---|---|---|
| 1–2 | Power 1 (Council Runtime) + Power 9's adapter bug fixes and usage ledger | Everything else needs a runtime and a ledger to write to |
| 2–3 | Power 3 (attestation, claims, provenance) + Power 4 (verifier, evidence checks) | The spine the council ruled on; both are schema plus a brief template |
| 3–4 | Power 5 (Ruling Ledger) + Power 7 (skills moved in, index, harvest) | Closes the by-hand steps from 09-06; skills unblock every later brief |
| 4–6 | Power 6 (Rate v1 local, ablation, top-k) | Data exists; the 07-01 plan's weeks 3–6 |
| 6–7 | Power 2 (Debate Room) | Needs the matrix, attestation and Rate to be meaningful |
| 7–8 | Power 8 (swarm) + Power 10 (attested sandbox, resume, checkpoint) | Swarm needs the local provider; resume needs the manifest from Power 1 |
| after | Public checklist §3, then SOM-01 streaming and the web viewer of runs | Surface polish last |

Each item is Sonnet-executable from this document except the Debate Room prompts, the convergence rule, the persona generator and the Rate scoring math, which should be authored by a senior seat and reviewed by a second one, per the PRO-01 precedent.

---

## 5. Questions for the Conductor

1. Is the public artifact the council protocol (CLI plus docs), with the web console as a viewer? Or does the hosted web product stay primary? Every ranking above assumes the former.
2. May the Elay and Eliana skills move into this repo as canonical, with the other repos pointing here?
3. Rate v1 on disk first, Supabase later: acceptable, or must grades live in Postgres from day one?
4. Debate Room default: stop on stability, cap three rounds, dissent seat rotates. Any of those you want different?
5. Which project is the public worked example: a small open repo, or Maestro itself?
6. R4 (empty lane outranks named lanes) is still open from 2026-07-06.

---

## Sources

- OpenClaw release notes: [v2026.10.1](https://docs.openclaw.ai/releases/2026.10.1), [v2026.9.6](https://docs.openclaw.ai/releases/2026.9.6), [GitHub releases incl. 2026.10.5 and 2026.10.10-beta.1](https://github.com/openclaw/openclaw/releases)
- MiroFish: vendored README at `.michael/MiroFish-main/MiroFish-main/README.md` (AGPL-3.0; patterns only)
- Sequential consensus with a Wald-SPRT compute governor: [arXiv 2605.19193](https://arxiv.org/abs/2605.19193)
- Rank-adaptive cross-round debate: [arXiv 2603.28813](https://arxiv.org/abs/2603.28813)
- Multi-agent debate for LLM judges with adaptive stability detection: [NeurIPS 2025](https://proceedings.neurips.cc/paper_files/paper/2025/hash/42475c537936b2394b5015e871765056-Abstract-Conference.html)
- Free-MAD, consensus-free multi-agent debate: [arXiv 2509.11035](https://arxiv.org/html/2509.11035v1)
- In-repo evidence: `MAESTRO_STATE.md` session log 2026-09-05 → 2026-10-18; `docs/audits/eliana-readonly-poc/2026-09-06-votd-cohesion/SYNTHESIS.md` §3; `docs/audits/maestro/2026-09-22-vision-council/`; `docs/audits/MAESTROCLAW-ATTACK-PLAN.md` §1; `C:\New folder\Elay\RETRO-MAESTRO.md`; `C:\New folder\Elay\.claude\skills/*`.
