# Code Review: C-06 Conductor web-dispatch commit (`22a04a1`)

## Findings

### 1. Major — Collision ranking dimensions are not populated by thecaller
- **File:** `src/hooks/useBuildExecution.ts`, lines 1554–1564
- **Defect:** `collectManifest` builds candidate objects with `path`, `content`, `operation`, `content_hash`, and `lane_name`, but never sets `priority` or `conductor_approved`. Because `reconcileManifest` ranks first by `conductor_approved`, then by `priority`, then by lane name, every candidate falls through to the lane-name tie-break.
- **Consequence:** The documented priority/approval ranking isdead code. P1-4 collisions are resolved deterministically but arbitrarily — by the first Unicode code point of `lane_owner` plus input order — rather than by the intended priority/approval semantics. If `BuildTask` already carries priority data from decomposition, it is simply being dropped here.

### 2. Minor — Lane-name tie-break is not lexicographic
- **File:** `src/lib/conductor.ts`, lines 63–67
- **Defect:** `rankCandidate` computes the tie-break as `entry.lane_name?.codePointAt(0) ?? 0`, which compares only the **first** code point. The comment claims "lane_name lexicographic as a deterministic, stable tie-break," but lexicographic comparison would use the full string (e.g., `localeCompare`).
- **Consequence:** Lanes that share a first character — common with model-based lane names like `"claude-sonnet"` / `"claude-opus"` or `"gpt-4o"` / `"gpt-4-turbo"` — receive identical rank and the winner is determined by input order (stable sort), not by the full lane name. The documented rule is misleading and may produce unexpected winners.

### 3. Minor — Mirror diverges from maestroclaw in type/API surface
- **File:** `src/lib/conductor.ts`
- **Divergences:**
  - `ManifestCandidate.lane_name` is optional; `maestroclaw`'s `ManifestEntry.lane_name` is required.
  - `ManifestCollision` omits the `candidates` array that `maestroclaw`'s `CollisionReport` includes.
  - The function is named `reconcileManifest` (singular) vs. maestroclaw's `reconcileManifests` (plural).
  - `selectReadyTasks` speaks web-specific status strings (`queued`/`rerouted`/`completed`/`failed`/`skipped`) rather than maestroclaw's `pending`/`ready`/`done`. The semantics line up, but the vocabulary differs.
- **Consequence:** These are not runtime bugs, but they weaken the "faithful frontend mirror" claimand increase the cost of keeping the two modules in sync — exactly what the header comment warns against.

## Mirror-faithfulness assessment

`selectReadyTasks` is semantically faithful to `plan.ts#getReadyEntries`: it returns tasks whose dependencies have reached a terminal state, accounting for the web layer's different status vocabulary.

`reconcileManifest` reproduces the ranking algorithm and collision grouping of `reconcile.ts#reconcileManifests`, but the type shapes and exported API differ (Finding 3), and it faithfully replicates the first-code-point tie-break bug described in Finding 2. It does not export `detectManifestConflicts`, which the maestroclaw module does.

So: **structurally faithful, but not a literal mirror**, and it shares the same misleading tie-break.

## Does it fix P1-4?

**Partially, on the client side only.**

- It does replace the previous last-write-wins behavior with a deterministic single-winner-per-path manifest before `github-execute`.
- However, the winner-selection rule is degenerate because `priority` and `conductor_approved` are never supplied (Finding 1), and the lane-name tie-break is only a first-character comparison (Finding 2).
- As noted in the commit's own `MAESTRO_STATE.md` update, the authoritative server-side enforcement in `github-execute` is still open. A duplicate-path manifest submitted by another path, or a regression in this code, can still reach the edge function.

In short: collisions are now deterministic, but not necessarily correct by the intended semantics, and the fix is not authoritative.

## Verdict

**`rework required`**

The dependency-selection wiring is clean and equivalent to the previous inline logic, but the manifest reconciliation — which is the commit's central claim and the "real P1-4 fix" — is undermined by the caller not populating `priority`/`conductor_approved`and by a tie-break that does not match its documentation. Before merge:

1. Populate `priority` (mapping the task/decomposition priority to `'P0'|'P1'|'P2'` as needed) and decide/document whether `conductor_approved` has meaning in the web layer.
2. Make the lane-name tie-break truly lexicographic across the full string, and update the misleading comment.
3. Align the mirror interfaces more closely with maestroclaw (required `lane_name`, include `candidates` in the collision report, or document intentional deviations).