● Read TASK.md
  └ 56 lines read

● List task folder files with sizes (shell)
  │ Get-ChildItem "C:\New
  │ folder\MaestroOrchestra\project\Maestro\grading-lab\tasks\task-001-c06-review" | Select-Object
  │ Name, Length
  └ 13 lines…

● Read c06.diff
  └ 202 lines read

● Read context-maestroclaw-plan.ts.txt
  └ 78 lines read

● Read context-conductor.ts.txt
  └ 99 lines read

● Read context-maestroclaw-reconcile.ts.txt
  └ 76 lines read

/ Search (grep)
  │ "lane_owner|priority|conductor_approved|result_operation|task_id|status.*=|dependencies"
  │ (context-useBuildExecution.ts.txt)
  └ 61 lines found

The mirror files reveal key divergences already. Let me read the relevant regions of the post-image `useBuildExecution.ts` to verify the caller context.

● Read context-useBuildExecution.ts.txt
  └ L100:160 (61 lines read)

● Read context-useBuildExecution.ts.txt
  └ L1395:1530 (135 lines read)

● Read context-useBuildExecution.ts.txt
  └ L1530:1660 (131 lines read)

/ Search (grep)
  │ "BuildTask|import \{|from '\.\./" (context-useBuildExecution.ts.txt)
  └ 57 lines found

All context reviewed. Printing the complete review.

---

# Code Review — Commit `22a04a1` (`c-06-conductor-web-dispatch`)

**Scope reviewed:** `c06.diff` against post-images of `src/lib/conductor.ts`, `src/hooks/useBuildExecution.ts`, and the maestroclaw source it claims to mirror (`plan.ts`, `reconcile.ts`).

---

## 1. Findings

### F1 — **Major** — The reconcile's ranking inputs are never supplied by its only caller; the "deterministic winner" degenerates to *first code point of an opaque agent ID*
`src/hooks/useBuildExecution.ts:1554–1581` (`collectManifest`) + `src/lib/conductor.ts:63–67` (`rankCandidate`)

`rankCandidate` ranks on three signals: `conductor_approved` → `priority` → `lane_name`. The sole caller passes **none of the first two**:

- `conductor_approved` is never set per-entry. (It *is* set at the patch/payload level in `pushTaskBuildToGithub`, lines 1617 and 1632 — but that never reaches `ManifestCandidate` entries, so the `return 0` branch is dead code.)
- `priority` is never mapped in, even though the task data carries one (`DecomposeResult.tasks[].priority: number`, line 124). Note that even if it were passed through naively, it's a `number`, not `'P0' | 'P1' | 'P2'`, so `PRIORITY_RANK[...]` would miss and fall to the `?? 2` default anyway.

So every entry ranks as `2000 + lane_name.codePointAt(0)`, where `lane_name` is `t.lane_owner ?? ''` — a builder/agent **ID** (line 1563), not a human-meaningful lane name. The "real P1-4 fix" reduces to: *the agent whose ID starts with the lowest code point wins the file*. That is deterministic in the narrow sense but semantically arbitrary — it considers neither content, recency, operation, nor task priority. Two of the three advertised tie-break tiers are unreachable.

**Consequence:** collision resolution has no relationship to which result is *better*; a stale or worse result wins whenever its lane ID sorts lower. The commit's central claim is substantially overstated.

### F2 — **Major** — Tie-break is *first code point only*, not lexicographic; ties fall back to array order; and non-ASCII lane names cause priority inversion
`src/lib/conductor.ts:66` (inherited verbatim from `reconcile.ts:32`)

The comment says "lane_name lexicographic as a deterministic, stable tie-break," but `codePointAt(0)` compares only the **first character**. Three concrete defects:

1. Two lanes whose IDs/names share a first character (for hex UUIDs, ~1/16 per pair; for names like `claude-sonnet` vs `claude-haiku`, guaranteed) rank identically. `Array.prototype.sort` is stable, so the winner is whichever entry appears first in `tasksRef.current` — i.e., DB row/insertion order. That is only deterministic if row order is; across reloads or requery paths (see the fallback query at line 1393–1396) the "deterministic" guarantee quietly depends on query ordering.
2. Two colliding entries from the **same** lane (the most plausible real collision source — reroute/retry producing two completed tasks for one path) always tie and resolve by array order: effectively *first-write-wins by row order*, not a rule anyone chose.
3. `pRank * 1000 + codePointAt(0)` breaks when the first code point ≥ 1000 (any CJK/emoji/non-Latin lane name): a P1 entry with lane `"语..."` scores 2000 + 35821 = 37821 and **loses to a P2** entry with lane `"a"` (3097). Priority inversion. Low practical risk with ASCII agent IDs, but it's flatly wrong for a function whose entire job is deterministic ranking — and it's faithfully copied from the buggy original.

### F3 — **Major** — The "faithful frontend mirror" claim is false: dependency-unblock semantics diverge from maestroclaw
`src/lib/conductor.ts:23–37` vs `context-maestroclaw-plan.ts.txt:51–59`

- maestroclaw's `getReadyEntries` unblocks a task **only when all deps are `'done'`**. A failed dependency blocks its dependents forever.
- `selectReadyTasks` unblocks on `completed` **or `failed` or `skipped`**.

This preserves the behavior of the old inline filter it replaced (good — no regression), and the doc comment on lines 23–25 even describes the divergence. But the file header (lines 3–7) claims "faithful FRONTEND MIRROR … same ranking, same rules. KEEP THIS IN SYNC," and the MAESTRO_STATE.md entry repeats "faithful frontend mirror." The two conductors will disagree on the dispatch frontier for any plan containing a failed dependency — the maintenance contract ("keep in sync") is unfulfillable because they are out of sync at birth. Under the repo's own Rule 2 (verification discipline), the state-file claim needs correcting.

### F4 — **Minor** — Unknown dependency IDs silently and permanently stall a task (divergence from maestroclaw, latent bug)
`src/lib/conductor.ts:32–35`

maestroclaw's `buildPlan` prunes dep IDs not present in the task set (`plan.ts:33`), so an unknown dep can never block. `selectReadyTasks` returns `!!dep && …` — an unknown dep ID makes the task permanently not-ready. In the dispatch loop, `ready.length === 0` → `break` (line 1434): the task is never dispatched, no error surfaces, the build "finishes" incomplete. Pre-existing behavior (the old filter did the same), so not a regression — but it contradicts the mirror claim and is exactly the kind of thing the Conductor extraction was supposed to fix.

### F5 — **Minor** — Collision resolution silently discards completed work with only a `console.warn`
`src/hooks/useBuildExecution.ts:1569–1574`

P1-4 is a *silent data-loss* bug. The fix drops the losing lane's completed output (paid model work) with a browser-console warning — invisible to the user in the approval flow and absent from the append-only `audit_events` trail. From the user's perspective the loss is still silent; only the mechanism changed. The `collisions` report exists precisely to surface this; it should reach the UI and/or audit log.

### F6 — **Minor** — Empty `lane_name` wins every same-priority collision; maestroclaw would go non-deterministic instead
`src/lib/conductor.ts:66` vs `reconcile.ts:32`

Frontend: `lane_name?.codePointAt(0) ?? 0` — a task with `lane_owner = null` gets `lane_name = ''` (line 1563) → rank 2000, beating every named lane. Ownerless entries always win, which is backwards if anything. maestroclaw: `entry.lane_name.codePointAt(0)!` on `''` yields `undefined` (the `!` is a type assertion only) → `2000 + undefined = NaN` → comparator returns NaN → **unspecified sort order**. So the frontend "hardened" a spot where the original is actually broken — a defensible change, but an undocumented semantic divergence in a file that promises none.

### F7 — **Nit** — Collision report omits maestroclaw's `candidates` field
`src/lib/conductor.ts:48–52` vs `reconcile.ts:15–20`. `CollisionReport.candidates` is dropped from the mirror's `ManifestCollision`. Cosmetic, but another unlisted divergence.

### F8 — **Nit** — Operation-blind collision resolution
A `delete` colliding with a `create`/`upsert` on the same path is resolved by lane-ID code point — whether the file *exists* after push is decided by an accident of agent ID spelling. `rankCandidate` never looks at `operation`. (Also note line 1621 later collapses `create` → `upsert`, so operation fidelity is already loose in this pipeline.)

---

## 2. Mirror-faithfulness assessment

**Verdict: not faithful.** Structurally similar; semantically divergent in ways the header comment denies.

| Aspect | maestroclaw | `src/lib/conductor.ts` | Faithful? |
|---|---|---|---|
| Ready selection: dep unblock | `done` only (`getReadyEntries`) | `completed`/`failed`/`skipped` | **No** (F3) |
| Unknown dep IDs | Pruned at `buildPlan` → never block | Block forever | **No** (F4) |
| Status vocabulary | `pending`/`ready` | `queued`/`rerouted` | Adaptation — acceptable |
| Rank: `conductor_approved` → priority → `codePointAt(0)` | Same | Same (incl. first-codepoint bug, F2) | Yes — bug faithfully copied |
| `lane_name` handling | Required; `''` → NaN rank (nondeterministic) | Optional; `?? 0` → always wins ties | **No** (F6) |
| Collision report shape | Includes `candidates` | Omits `candidates` | No (F7, cosmetic) |
| Reconcile algorithm (group, sort, winner-at-first-occurrence, order preservation) | — | Identical | Yes |
| `operation` union | `create/update/delete` | `upsert/create/delete` (in caller pipeline) | Type-level drift, no reconcile impact |

The reconcile half is a close mirror (including its defects). The plan half mirrors the *old inline filter*, not maestroclaw's `getReadyEntries`. The "faithful mirror / same rules / KEEP IN SYNC" header and the MAESTRO_STATE.md claim are inaccurate and will mislead the next agent that tries to sync them.

## 3. Does it fix P1-4?

**Partially — deterministic in name, arbitrary in substance, and still nearly silent.**

What the caller actually passes: `path`, `content`, `operation`, `content_hash: null`, `lane_name = lane_owner ?? ''`. No `priority`, no `conductor_approved` (F1). Effective resolution rule:

> Winner = colliding entry whose agent ID has the lowest first code point; if tied (same lane, or same first character), whichever row appears first in `tasksRef.current`.

Compared to the prior state (last-write-wins by array position, zero visibility):
- ✅ It is *more* deterministic than before and no longer purely positional in the common distinct-lane case.
- ✅ Collisions are at least detected and enumerated.
- ❌ Determinism still bottoms out in array order for same-lane and shared-first-char ties (F2) — the likeliest real collisions.
- ❌ The rule is content-, recency-, priority-, and operation-blind; "winner" is not meaningfully *correct*, just repeatable-ish.
- ❌ Loss is still invisible to the user and audit trail (F5).
- ❌ Client-side only; `github-execute` remains last-write-wins for every other caller — the commit message honestly acknowledges this ("Authoritative server-side P1-4 fix … still open"), so this must be treated as a mitigation, not "the real P1-4 fix" as the state-file entry brands it.

## 4. Verdict

## `rework required`

**Rationale.** The `selectReadyTasks` refactor is clean and verifiably behavior-preserving — that part could merge today. But the commit's headline deliverable, the P1-4 fix, does not do what it claims with the data its only caller supplies: two of three ranking tiers are dead code (F1), the live tier compares one character of an opaque ID with a priority-inversion bug for non-ASCII names (F2), and dropped work remains effectively silent (F5). Meanwhile the "faithful mirror" framing is false (F3, F4, F6) in a file whose header instructs future maintainers to keep two divergent implementations "in sync," and the same overclaim is written into MAESTRO_STATE.md — a documentation time bomb under this repo's own Rule 2.

**Required before merge:**
1. Feed real signals into `rankCandidate` from `collectManifest` (map task `priority`; set `conductor_approved` per-entry where applicable) — or delete the dead tiers and document the actual rule honestly.
2. Fix the tie-break: full `lane_name` lexicographic comparison (e.g., `localeCompare`), with a defined final tie-break (e.g., `task_id`), removing dependence on array order; fix or bound the `pRank * 1000` collision (F2). Upstream the fix to maestroclaw's `reconcile.ts` to keep the mirror truthful.
3. Surface collisions to the user (approval modal / audit event), not just `console.warn`.
4. Correct the "faithful mirror" header and the MAESTRO_STATE.md session-log claim to enumerate the deliberate divergences (failed/skipped unblock, unknown-dep behavior, empty-lane handling).

Nits F7/F8 can follow later; F4 should at least get a logged warning when a task is stalled by an unknown dep.

