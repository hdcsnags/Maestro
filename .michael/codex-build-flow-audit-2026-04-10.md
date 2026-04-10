# Codex Build Flow Audit — 2026-04-10

## Executive read

Maestro's product thesis is coherent: replace a manual multi-model PM/design/build loop with a constrained orchestration pipeline that can create or attach a repo, produce an architecture plan, assign lanes, collect builder manifests, and write real files through GitHub.

The current highest-leverage work is not adding more agents. It is making the write path boring and deterministic:

1. Concierge owns the user-facing flow.
2. Architect owns build spec and lane generation.
3. Builder broadcasts target only lane-assigned builder agents.
4. `orchestrate` must return complete `file_manifest` entries.
5. `github-execute` is the only authority that writes files and advances post-build state.

## Changes shipped in this pass

### 1. Build execution now sends the real server contract

File: `src/components/reveal/BuildWorkspace.tsx`

Previously BuildWorkspace sent `strategy` to `github-execute`, but the edge function expects `mode`. That could make the server silently follow the synthesized path by accident. BuildWorkspace now sends:

- `mode: state.executionStrategy`
- `repo_connection_id: state.activeRepoConnection.id`
- `session_id`
- selected builder patches

It also blocks execution if no active repo is connected.

### 2. Lane scope bypass removed

File: `src/components/reveal/BuildWorkspace.tsx`

BuildWorkspace was sending every build patch with `conductor_approved: true`, which bypassed lane scope enforcement. It now sends `false`, so `github-execute` enforces the assigned lane paths and turns out-of-scope writes into handoffs/skips.

### 3. Server now rejects missing execution mode

File: `supabase/functions/github-execute/index.ts`

`github-execute` now fails fast with `INVALID_EXECUTION_MODE` unless `mode` is `per_agent` or `synthesized`. This prevents future frontend drift from silently taking the wrong execution branch.

Deployed: yes, `supabase functions deploy github-execute`

### 4. Pre-Build persists project binding

File: `src/components/reveal/PreBuildPanel.tsx`

The UI's `new` vs `existing` project type and active GitHub repo are now persisted into `sessions.project_type` and `sessions.github_repo`. This matters because server execution checks project type for backup behavior and project context.

### 5. Manual build fallback removed

File: `src/components/reveal/BuildWorkspace.tsx`

The old "skip to manual broadcast" path is removed. If Concierge cannot produce a build plan or builder assignments, the UI now fails loud and points the user back to Pre-Build / Architect.md generation.

### 6. Build-mode output budget increased

File: `supabase/functions/orchestrate/index.ts`

Build mode now requests 8192 output tokens instead of 4096. Analysis/artifact modes remain at 4096. This should reduce truncated `file_manifest` scaffolds.

Deployed: yes, `supabase functions deploy orchestrate`

## Validation

All checks passed after the patches:

- `npm run typecheck`
- `npm run lint`
- `npm run build`

## Remaining risks

### Critical: frontend still owns some phase transitions

`github-execute` correctly advances `sessions.current_phase` to `bouncer` after successful writes. But frontend components still directly write phases in several places:

- `BuildWorkspace.tsx`: bouncer, pre_build, complete
- `BuildReport.tsx`: analysis, build, bouncer
- `ConciergePanel.tsx`: design, pre_build, build
- `DesignPhase.tsx`: pre_build
- `PreBuildPanel.tsx`: build

Some of these are legitimate conductor choices, but post-build/bouncer ownership should be consolidated. The clean target is:

- Frontend may request a transition.
- Edge functions perform authoritative post-build and post-review transitions.
- UI only reflects the session row.

### Critical: manifest parsing is still model-fragile

`orchestrate.parseResult()` still depends on model-valid JSON. If a model emits invalid JSON with unescaped newlines inside file content, the manifest becomes empty. OpenAI JSON mode helps, but Anthropic/OpenRouter can still wrap or malform output.

Best next fix: add a stronger build-output contract, likely one of:

- Require `file_manifest` entries with base64 file content.
- Or split code generation per file so each response is smaller and easier to parse.
- Or add a repair pass when JSON parsing fails, but do not silently execute repaired content without validation.

### High: full-repo context is still shallow

Literal scoped files are injected, but globs and existing repo context are not deeply hydrated. For an existing app, builders may write plausible files without enough context.

Best next fix: make Intake produce a repo map plus selected file snapshots, then let Architect choose exact files to hydrate per builder lane.

### High: docs are stale

`Architecture.MD` still says GitHub execution writes markdown summaries under `maestro-patches/`. That is now false. `.github/copilot-instructions.md` has the newer truth. The docs should be reconciled before more agents are brought in, otherwise future agents will reintroduce old assumptions.

### Medium: Build report UX can mask partial success

`github-execute` returns `success` for partial writes if at least one file landed. That is useful, but the UI should make skipped files, handoffs, and blocked agents visually prominent enough that the user does not mistake a partial scaffold for a complete one.

### Medium: token budget is improved but not solved

8192 output tokens helps but does not guarantee complete multi-file scaffolds. The more reliable architecture is smaller lane manifests or one-file-at-a-time generation.

## Recommended next sprint

1. Make `orchestrate` build output more reliable with base64 file content or per-file generation.
2. Move post-build and bouncer phase transitions fully server-side.
3. Strengthen existing-repo context hydration for glob-scoped lanes.
4. Update `Architecture.MD` to remove obsolete `maestro-patches/` execution docs.
5. Run one controlled scaffold test with only Sonnet 4.6 plus GPT-5.4 and inspect the created PR, skipped files, and build report.
