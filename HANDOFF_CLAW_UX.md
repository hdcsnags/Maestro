# Claw UX Handoff

Date: 2026-04-27
Author: OpenAI Codex

## Required Reading

Before editing, read:
- `AGENTS.md`
- `MAESTRO_STATE.md`
- `CLAW_BUILD_V2_SPEC.md`
- `CLAW_MODE_SPEC.md`
- `CLAW_UI_ISSUES.md`

Then inspect:
- `src/components/reveal/ClawMode.tsx`
- `src/hooks/useThreads.ts`
- `src/hooks/useBuildExecution.ts`
- `src/components/reveal/BuildWorkspace.tsx`
- `src/components/reveal/PreBuildPanel.tsx`

## Current State

Claw Build v2 backend/plumbing is moving toward the correct primitive: session-granular local CLI builds via `build_session`, not isolated single-file `build_task` jobs.

Recent Claw work shipped:
- `executor-api` forwards `context_bundle` into `executor_jobs`.
- `useBuildExecution.ts` can submit and poll `build_session` jobs.
- Phase 5 added advisory Concierge scope intelligence for local builds.

However, the UX still exposes Claw Build v2 mostly through the classic Build drawer.

## Main UX Problem

Claw mode has the right conceptual direction: threads, Concierge chat, execution threads, and explicit routing controls.

But Claw Build is not yet first-class in Claw mode.

Current behavior:
- User selects Build intent in Claw chat.
- `useThreads.buildFromChat()` checks setup.
- If setup is incomplete, it opens Pre-Build.
- If setup is ready, it moves the session to Build, expands the classic Build drawer, and tells the user to continue there.
- Session Build controls exist in `BuildWorkspace.tsx`, but they are buried inside the `task_building` stage as a secondary option.

This means the user still experiences Claw Build v2 as "go use the old build workspace," not as a native Claw thread/workspace flow.

## Product Direction

Claw should feel like an execution cockpit, not generic chat plus drawer handoff.

Claw mode should own:
- Build plan state
- Scope suggestions
- Executor status
- Session build approval
- Running job progress
- Files written
- Errors/retries
- Push/PR result

The classic Build drawer should remain as fallback and advanced/classic mode, but it should not be the primary Claw Build v2 experience.

## Recommended First Implementation Slice

Do not attempt a full redesign in one pass.

First slice:
1. Keep classic BuildWorkspace intact.
2. In Claw mode, when Build setup is ready and backend is `local` or `auto`, show a first-class Build Session card in the active Claw thread.
3. The card should show:
   - selected local adapter/builder
   - suggested scope
   - repo name
   - executor online/offline state
   - approval/start action
   - running/succeeded/failed state
   - files written count and manifest preview
4. Reuse existing `useBuildExecution.executeSession()` / `sessionProgress` if possible.
5. Do not duplicate executor polling logic.
6. Keep BuildWorkspace handoff available as fallback if no executor is online, backend is edge, setup is incomplete, or session execution fails.

## Strong UX Recommendations

- Promote `Chat / Broadcast / Execute / Build` from a tiny dropdown into a visible routing bar near the composer.
- Replace emoji-heavy system messages with structured event cards.
- Add a persistent right context rail for Claw mode later:
  - repo
  - executor
  - adapter
  - scope
  - build phase
  - files written
  - PR/result
- Keep the carousel for council comparison; do not make it the primary Claw execution UI.
- Bring the Maestro orb into Claw mode as a compact status instrument, not the large empty-stage orb.

## Normal Mode Notes

Normal/classic mode is visually stronger than Claw mode today:
- Orb is a good state-aware centerpiece.
- Drawers reduce clutter.
- Carousel is the right pattern for reading 4+ long agent responses.

Main classic-mode gaps:
- Too much critical workflow lives in drawers.
- Pre-Build is dense and internal-system heavy.
- Carousel needs more reading actions: compare, pin, ask follow-up, extract decision, synthesize.

## Environment Notes

Windows/PowerShell currently sees the repo as clean after Claude's latest commits.

WSL over `/mnt/c` may show many false modified files due to Git config / line-ending / metadata differences. Before letting a WSL agent edit, verify:

```bash
git status --short
git rev-parse --short HEAD
git config core.filemode false
git update-index -q --refresh
git status --short
```

If WSL still shows many modified files while PowerShell is clean, do not edit from the `/mnt/c` checkout. Use a fresh WSL-native clone under `~/projects/Maestro`.

## Suggested Prompt For Next UX Agent

```text
Read AGENTS.md, MAESTRO_STATE.md, CLAW_BUILD_V2_SPEC.md, CLAW_MODE_SPEC.md, CLAW_UI_ISSUES.md, and HANDOFF_CLAW_UX.md.

Goal: make Claw Build v2 session builds first-class in Claw mode without removing the classic Build drawer.

Before editing, inspect git status/diff and avoid overwriting unrelated dirty changes.

Implement only the first UX slice:
1. In Claw Mode, when build setup is ready and backend is local/auto with an executor available, show a first-class Build Session approval/progress card in the Claw thread instead of only telling users to open BuildWorkspace.
2. Reuse existing useBuildExecution session APIs if possible; do not duplicate executor polling logic.
3. Keep the classic BuildWorkspace path intact as fallback.
4. Update MAESTRO_STATE.md with the session log and any verified state corrections.
5. Run npm run typecheck.
```

