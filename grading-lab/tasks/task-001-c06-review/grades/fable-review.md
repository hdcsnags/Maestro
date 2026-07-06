# Conductor review — Fable (Claude Code)

*Written before reading worker reviews (grok's opening paragraphs were skimmed
during dispatch monitoring — noted for contamination tracking in meta.json).
Kept out of the anonymized blind set.*

## Findings

1. **Major — `useBuildExecution.ts` `collectManifest`: the caller starves the
   ranking function.** Candidates are built with only `lane_name`
   (`t.lane_owner ?? ''`); `priority` and `conductor_approved` are never passed,
   so `rankCandidate` degenerates: every entry ranks as default-P1 and the
   entire collision resolution collapses to the lane-name tie-break. The task
   objects *do* carry `priority` (a **number**, line ~124 of the hook — note the
   type mismatch with the reconciler's `'P0'|'P1'|'P2'` scale), and
   `conductor_approved` exists in the web layer only as a patch-level flag to
   `github-execute`, not per-entry. So two of the three ranking criteria are
   structurally dead in this integration, and mapping numeric priority into the
   rank scale was never designed.

2. **Major — `conductor.ts` `rankCandidate`: tie-break is first-code-point, not
   lexicographic.** The comment says "lane_name lexicographic" but the code is
   `lane_name?.codePointAt(0) ?? 0`. Lanes sharing a first character (e.g.
   `claude-a`, `claude-b`, or any UUID-prefixed lanes) rank identically; the
   winner then falls to JS stable-sort order, i.e. position in
   `tasksRef.current`. **This defect is inherited faithfully from
   `packages/maestroclaw/src/conductor/reconcile.ts` (same comment, same
   `codePointAt(0)!`)** — so the mirror is accurate, but the documented
   semantics are wrong in both copies. Fix both or the "KEEP IN SYNC" contract
   makes the bug permanent.

3. **Minor — `selectReadyTasks` diverges from the maestroclaw plan semantics it
   claims to mirror.** `plan.getReadyEntries` unblocks a task only when every
   dep is `done`; the web version also unblocks on `failed`/`skipped` (carried
   over from the old inline filter, and the code comment argues for it). The
   behavior is defensible — but it is a *policy divergence* inside a file whose
   header says "same ranking, same rules." Either port the policy back to
   maestroclaw or document the divergence explicitly.

4. **Minor — colliding `delete` vs `create`/`upsert` operations are resolved
   by lane rank with no operation awareness.** If one lane deletes a path and
   another writes it, the reconciler silently drops one side based on lane
   name. Last-write-wins at least had a temporal rationale; lane-alphabetical
   delete-vs-write resolution has none. Worth an explicit rule (e.g. delete
   loses unless conductor-approved) or at least a louder warning.

5. **Nit — collision logging is `console.warn` only**, invisible to the user in
   the built UI; the state log's own P1-4 framing calls this the "real fix" but
   the authoritative server-side enforcement in `github-execute` (Deno) is
   still open, per the commit's own MAESTRO_STATE note. The client fix is
   advisory — which matches maestroclaw reconcile.ts's stated contract, but the
   commit message oversells it.

6. **Nit — `lane_name` optionality**: frontend `ManifestCandidate.lane_name?`
   with `?? 0` fallback vs maestroclaw's required `lane_name` + `!`. Defensive
   improvement, fine, but it's another silent divergence in a "faithful mirror."

## Mirror-faithfulness

`reconcileManifest` is a faithful port (including the tie-break bug and the
first-collision-position insertion order). `selectReadyTasks` is **not** a port
of `getReadyEntries` — it is the old inline web filter re-housed under the
Conductor banner (different status vocabulary is fine; the failed/skipped
unblock policy is the real semantic difference).

## Does it fix P1-4?

Partially. Duplicate paths no longer resolve by last-write-wins; resolution is
deterministic *per session* (rank, then stable input order). But with the
caller passing only lane names, "deterministic" means "first lane letter, then
array order" — an arbitrary rule that will surprise anyone reading the
documented priority/approval semantics. And the authoritative fix (server-side
in `github-execute`) remains open by the author's own admission.

## Verdict

**Rework required** — but small and targeted, not a rejection of the approach:
1. Map numeric task priority → `P0/P1/P2` and pass it (plus a real per-entry
   approval signal if one exists) in `collectManifest`.
2. Fix the lexicographic tie-break in **both** copies (`localeCompare` or full
   string comparison).
3. Document (or reconcile) the failed/skipped-unblock divergence from
   maestroclaw.
4. Decide the delete-vs-write collision rule.

The structure is right, the wiring points are right, typecheck/lint/build are
claimed clean; with the four items above this merges.
