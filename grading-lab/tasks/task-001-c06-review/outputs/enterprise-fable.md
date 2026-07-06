# Review — C-06 Conductor web-dispatch (`22a04a1`, `c-06-conductor-web-dispatch`)

*Reviewer: Claude Fable 5 under GitHub Enterprise Copilot harness ("enterprise-fable"), blind, 2026-07-01.*

## Findings

### F1 (major) — The reconcile's ranking inputs are never supplied by the caller; the "deterministic winner" is effectively "smallest first character of agent id"

`src/hooks/useBuildExecution.ts:1554-1568` builds the candidate entries with exactly
`{ path, content, operation, content_hash, lane_name }`. It never passes `priority`
and never passes `conductor_approved`. In `src/lib/conductor.ts:63-67`,
`rankCandidate` therefore evaluates identically for every entry down to the last
term: `conductor_approved` is always `undefined` → skip tier 0; `priority` is always
`undefined` → defaults to `'P1'` → `pRank = 2` for everyone. The entire collision
policy collapses to `2000 + (lane_name.codePointAt(0) ?? 0)`.

`lane_name` is `t.lane_owner ?? ''` (`useBuildExecution.ts:1563`), which is an agent
**id** (see `resolveAgent(task.lane_owner)` at lines 643/1193 — it's a lookup key,
not a human lane label). So the shipped collision rule is: *the completed output of
the agent whose id starts with the lexically-smallest character wins; all other
completed work on that path is silently discarded.* That is deterministic in the
narrow sense, but it is not the conductor policy the mirror encodes (approval >
priority > lane), because two of the three tiers are structurally dead code in the
only integration that exists.

Aggravating detail: task priority **is available** at decompose time —
`DecomposeResult.tasks[].priority: number` (`useBuildExecution.ts:124`) — but (a) it
isn't plumbed into the manifest entries, and (b) even if it were, it's a **number**,
while the conductor expects `'P0' | 'P1' | 'P2'` string literals
(`conductor.ts:13`). `PRIORITY_RANK[3 as any]` would be `undefined` and fall back to
2 anyway. There is no mapping layer. The type mismatch means the priority tier can't
be lit up without additional work, which the commit neither does nor mentions.

**Consequence:** on the first real path collision, a P0 task's output can be dropped
in favor of a P2 task's output because of the first byte of an agent id. The commit
claims this is "the real P1-4 fix"; it is a placebo policy wearing the fix's types.

### F2 (major) — Overridden work is silently discarded; the only surface is `console.warn`

`useBuildExecution.ts:1569-1574`: collisions are logged to the dev console and then
the losing entries — fully completed, paid-for model outputs — vanish. The user
approving the push (`pushTaskBuildToGithub`, and whatever approval modal consumes
`collectManifest`) sees the post-reconcile manifest with no indication that N
completed task results were dropped. Nothing is written to the tasks themselves
(no status change, no `skip_reason`), nothing reaches `audit_events`, nothing
reaches the UI. For a product whose core promise is auditable multi-agent
orchestration, a silent client-side drop of completed work is a trust bug, not a
logging nit.

### F3 (major) — P1-4 is only "fixed" on one of the two GitHub push paths

The diff patches `collectManifest` (task-queue build path →
`pushTaskBuildToGithub`). The session-build path — `collectSessionManifest` at
`useBuildExecution.ts:1050-1053`, feeding `pushSessionBuildToGithub` — still merges
lane manifests via `mergeSessionManifest(...flatMap(run => run.manifest))`
(lines 181, 971, 1052) with no reconcile. Whatever `mergeSessionManifest` does on
duplicate paths (its source is outside the provided context, but by the commit's own
framing the pre-existing behavior was last-write-wins), that path is untouched.
P1-4 as stated — "two parallel lanes produce the same path" — is *more* likely in
session builds (multiple executor runs flat-mapped together) than in the task queue,
where decompose assigns one file per task. The commit fixes the narrower path and
leaves the wider one, without saying so. (The diff's MAESTRO_STATE entry does
honestly note the server-side authoritative fix in `github-execute` is still open —
but not this second client-side gap.)

### F4 (major) — "Faithful frontend mirror" is false for ready-selection; it mirrors the old inline filter, not maestroclaw

`conductor.ts:26-37` (`selectReadyTasks`) unblocks a task when every dependency is
`completed` **or `failed` or `skipped`**. maestroclaw's `plan.getReadyEntries`
(`context-maestroclaw-plan.ts.txt:51-59`) unblocks **only on `done`** — a failed
dependency permanently blocks its dependents there. These are opposite policies for
the most consequential scheduling decision the conductor makes (build on top of a
file that was never produced vs. stall the frontier). The new code is
behavior-preserving with respect to the *old web inline filter* (which had the same
failed/skipped unblocking — see diff lines 39-56), so the refactor is safe, but the
header comment "faithful FRONTEND MIRROR ... same ranking, same rules"
(`conductor.ts:3-7`) and the claim "mirror of plan.getReadyEntries"
(`conductor.ts:15`) are inaccurate on the plan half. Whoever next "syncs" these two
files per the KEEP IN SYNC instruction has a coin-flip chance of propagating the
wrong semantics in either direction. Full divergence list in the mirror section
below.

### F5 (minor) — Tie-break is first-code-point only, mislabeled "lexicographic", and ties fall through to DB ordering that isn't guaranteed stable

`conductor.ts:66`: `lane_name?.codePointAt(0) ?? 0` compares exactly one code point.
Two lanes/agents whose ids share a first character (`claude-opus`, `claude-haiku`;
or two UUIDs starting with the same hex digit — a 1-in-16 chance) rank identically;
the winner is then whichever entry `Array.prototype.sort` (stable) saw first, i.e.
input order, i.e. `tasksRef` order, i.e. `.order('created_at')`
(`useBuildExecution.ts:327/1396`) with no secondary sort key. Batch-inserted rows
with equal timestamps have unspecified relative order in Postgres, so the "same
build, reloaded page, different winner" scenario is live. The comment on line 62
("lane_name lexicographic") describes code that was never written — the same
single-code-point comparison exists in maestroclaw (`reconcile.ts:32`), so this is a
faithfully mirrored bug plus an unfaithful comment. Also mathematically unsound:
code points ≥ U+03E8 (1000) would leak across the `pRank * 1000` band boundary —
irrelevant for ASCII agent ids, but the arithmetic invariant the design relies on is
unstated and unenforced.

### F6 (minor) — Duplicate `task_id` handling silently changed from first-wins to last-wins

Old inline filter resolved deps via `currentTasks.find(...)` (first match); new
`selectReadyTasks` builds `new Map(tasks.map(t => [t.task_id, t]))`
(`conductor.ts:27`), where a duplicated `task_id` keeps the **last** row. With dup
ids (decomposer bug, retry artifacts), dependency readiness can now be judged
against a different row than before. Edge case, but it's an unacknowledged
behavioral delta inside a commit whose selling point is "one shared deterministic
rule".

### F7 (nit) — Mirror API drift: dropped `candidates`, different `operation` union, duplicated types

Web `ManifestCollision` (`conductor.ts:48-52`) drops maestroclaw's
`candidates` field (`reconcile.ts:15-20`); web operation union is
`'upsert' | 'create' | 'delete'` at the call site vs maestroclaw's
`'create' | 'update' | 'delete'`; `TaskPriority` is now defined in two places. Each
is defensible alone; together they erode the "same shapes, same rules" contract the
file's own header demands. (One divergence is an *improvement*: web guards
`codePointAt(0) ?? 0` where maestroclaw uses a non-null assertion on a
possibly-empty string — worth back-porting, worth documenting.)

### F8 (nit) — `ReadyTask.status: string` loses the state machine

`conductor.ts:19` types status as bare `string`. The whole point of centralizing
selection is to make the status contract explicit; a union
(`'queued' | 'rerouted' | ...`) would catch the next status-rename at compile time.

## Mirror-faithfulness assessment

**Verdict: not faithful — the reconcile half is a near-mirror; the plan half is a
mirror of the wrong source.**

- `reconcileManifest` vs `reconcile.ts`: same grouping, same first-occurrence
  placement of winners, same rank formula, same stable-sort reliance —
  **faithful in algorithm**, with drift in API shape (F7) and one deliberate
  safety improvement (`?? 0`). It also silently drops maestroclaw's *framing*:
  `reconcile.ts:2` explicitly says "This is advisory — the authoritative
  enforcement happens in github-execute." The web copy's header omits that caveat
  while the commit simultaneously promotes the advisory pass to "the real P1-4
  fix." The mirror kept the code and shed the humility.
- `selectReadyTasks` vs `plan.getReadyEntries`: **not faithful** (F4). Divergences:
  (1) failed/skipped deps unblock in web, block forever in maestroclaw;
  (2) maestroclaw's `buildPlan` drops dep ids that don't resolve to a known task
  (`plan.ts:33` — task becomes ready), while the web version treats an unknown dep
  id as permanently unresolved (`!!dep` at `conductor.ts:34`) — the task deadlocks
  until the 3-no-progress-wave abort;
  (3) different status vocabularies, unmapped.
  What `selectReadyTasks` actually mirrors, line for line, is the deleted inline
  filter from `useBuildExecution.ts`. That's the honest description of this commit:
  a clean *extraction*, labeled a *mirror*.

## Does it fix P1-4?

**Partially — it converts "last-write-wins" into "deterministic-but-arbitrary-wins"
on one of two push paths, with the intended policy unreachable.**

- Determinism: yes-with-asterisks. Duplicate paths are collapsed client-side before
  `github-execute` ever sees them, so the edge function's last-write-wins is
  bypassed *on the task-build path*. But because the caller supplies neither
  `conductor_approved` nor `priority` (F1), and the tie-break is one code point deep
  over agent ids with an input-order fallback resting on un-keyed `created_at`
  ordering (F5), true cross-reload determinism is not guaranteed in the tie case.
- Correctness: no. The winner is chosen by a semantically meaningless key (first
  byte of agent id), losing work is discarded invisibly (F2), and the session-build
  path keeps the original bug entirely (F3). The commit's own MAESTRO_STATE entry
  concedes the authoritative server-side fix is still open; `reconcile.ts`'s header
  says the client pass was always meant to be advisory. Calling this "the real
  P1-4 fix" inverts that design.

## Verdict

**rework required**

The extraction of `selectReadyTasks` is a genuinely safe, behavior-preserving
refactor and could merge alone. But the commit's two headline claims are both
unsound: the "faithful mirror" diverges from maestroclaw on the highest-stakes
scheduling rule (F4), and the "real P1-4 fix" is a collision policy whose top two
tiers can never fire because the caller doesn't — and, due to a type mismatch,
can't — feed them (F1), while silently deleting completed work (F2) and leaving the
second push path unfixed (F3). Required rework: plumb real `priority` (with a
number→P0/P1/P2 mapping) and per-entry approval into the manifest entries; surface
dropped entries in the approval UI and/or audit trail; either reconcile
`collectSessionManifest` too or document why not; and rewrite the mirror header to
state the actual divergences instead of promising sync that isn't there. None of
this is large — but merging it as-is would enshrine a fix that doesn't do what the
state file now permanently records it as doing.

---

# Post-unblind comparison (appended after reading meta.json, outputs/, grades/)

**Replication caveat first:** per `meta.json`, the council's #1-ranked worker
("copilot") was *also* Copilot CLI resolving to claude-fable-5. So this run is less
a sixth harness data point than a **replication of the top worker's configuration**
(Enterprise vs. individual Copilot plan being the only delta). Read the convergence
below in that light — it is a stability result, not independent corroboration.

## Convergence

Verdict: `rework required` — matching all five workers and the conductor, now 7/7
unanimous. My F1 (starved ranking inputs, including the numeric-vs-`'P0'|'P1'|'P2'`
type mismatch), F4 (failed/skipped unblock divergence), F5 (first-code-point
tie-break + created_at tie nondeterminism + band-overflow), and F7 (API drift) all
appear across the council, most completely in the copilot review — with which my
review converges to a near-duplicate in structure, findings, severities, and even
phrasing ("deterministic in the narrow sense", the mirror table, the
"extraction-labeled-a-mirror" framing). Same weights, same harness family, same
review — a clean replication. (F1 was partially steered by the leaked hint in TASK.md
question 3, per meta.json — true for all workers equally.)

## What I caught that the council missed (or stated less specifically)

1. **F3 — the second client push path.** I specifically identified
   `collectSessionManifest` → `pushSessionBuildToGithub` (via `mergeSessionManifest`,
   lines 181/971/1052) as an unreconciled client-side path where P1-4 survives.
   The council's nearest statements were generic ("client-side only; github-execute
   remains last-write-wins for every other caller" — copilot) or only echoed the
   commit's own server-side admission (codex, kimi). Nobody else named the
   session-build path.
2. **F6 — duplicate `task_id` semantics changed from first-wins (`find`) to
   last-wins (`Map`).** No other reviewer caught this behavioral delta.
3. The "advisory" framing drop — `reconcile.ts`'s header disclaims authority while
   the web copy's header omits it and the commit promotes it to "the real fix"
   ("kept the code and shed the humility"). Only the conductor's own review
   (fable-review.md finding 5) made this point; no blind worker did.

## What the council caught that I missed

1. **Same-lane collisions always tie** (copilot F2.2) — retry/reroute duplicates
   from one lane rank identically, resolving by row order: the *most plausible*
   real collision source, and I only analyzed the shared-first-character case.
2. **Empty `lane_name` always wins** (copilot F6, grok 4) — I noted the `?? 0`
   guard as a safety improvement but missed its inversion (ownerless entries beat
   every named lane) and maestroclaw's `NaN` → unspecified-sort-order counterpart.
3. **Operation-blind delete-vs-create resolution** (copilot F8, fable-conductor 4)
   — I considered it during analysis and wrongly cut it, keeping only the
   operation-union type drift in F7.
4. **No tests / shared test vectors** for the "KEEP IN SYNC" contract (grok 5) —
   a fair, actionable gap I didn't flag.

## Verdict differences

None. 7/7 `rework required`, and my required-rework list matches the consensus set
(plumb priority/approval, fix the tie-break in both copies, surface dropped work,
correct the mirror/state-file claims) plus my two additions (reconcile or document
the session-build path; note the dup-task_id delta).

**On the harness hypothesis:** this run does not support "Enterprise Fable is more
aggressive" — it supports "Copilot-harness Fable is *consistent*." The Enterprise
instance reproduced the individual-plan instance's review almost verbatim, missing
three secondary findings and adding two specific ones (the unpatched second push
path being arguably the most consequential single addition to the task-001 corpus).
The harness effect visible here is Copilot-vs-Claude-Code, not Enterprise-vs-Pro.
