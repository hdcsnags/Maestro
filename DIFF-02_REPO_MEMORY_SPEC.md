# DIFF-02 — Per-Repo Memory Spec

**Status:** Ready for implementation
**Authored:** 2026-05-04 by Opus 4.7
**Implementing agent:** Sonnet 4.6 (Opus reviews summarization prompt before ship)
**Parent plan:** `IMPLEMENTATION_PLAN.md` task `DIFF-02`. Closes the only Phase 3 task without a dedicated spec.
**Source pain:** Audit finding — *"Memory across sessions is shallow. Every new session starts the concierge cold. The user re-explains the project. For a tool the user lives in, that's friction."*
**Dependencies:** None hard. Soft synergy with `LIVE-01` (coordinator can reference past builds), `BOUNCER-01` (memory can record "this is a training_lab repo").

---

## The Problem

Every new session against the same repo is a stranger to the concierge. The Conductor opens a session, says "let's add the new auth flow," and concierge has no memory of:
- The previous session's architectural decisions
- Why certain libraries were chosen
- Which files are sensitive / load-bearing
- What was tried and didn't work
- Conductor's voiced preferences ("we use Zustand here, not Redux")

Result: every session re-derives context from scratch. Multi-paragraph re-explanations. Sub-optimal first responses. Wasted tokens on context the project ALREADY HAS but didn't surface.

This is exactly the friction `MAESTRO_STATE.md` solves for *agents working on Maestro itself.* The Conductor's projects deserve the same.

---

## What This Adds

A **per-(user, repo) markdown memory file** that:

1. **Auto-loads** at the start of every session bound to a known repo. Memory content is prepended to concierge's system prompt.
2. **Auto-updates** at session-defining moments — build completed, bouncer pass, session archived, or user manual save.
3. **User-editable** via TrustDrawer "Memory" tab per repo. Conductor can correct, prune, or wipe.
4. **Capped at ~8KB** to fit in any concierge prompt without hurting latency. Auto-summarized when growing past cap.
5. **Repo-scoped** — never cross-pollinates between repos (no "in your other project we did X").

The product story: *"Maestro remembers your project across sessions. The board doesn't reintroduce themselves every meeting."*

---

## Data Model

### New table: `repo_memory`

```sql
CREATE TABLE repo_memory (
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  repo_full_name text NOT NULL,            -- e.g., "owner/repo"
  content text NOT NULL DEFAULT '',         -- markdown blob, capped at ~8KB
  byte_count int NOT NULL DEFAULT 0,        -- denormalized for quick cap checks
  -- Lifecycle
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_summarized_at timestamptz,           -- when did we last consolidate
  last_session_id uuid REFERENCES sessions(id),  -- which session last contributed
  -- Optional structured fields (extracted from content during summarize)
  metadata jsonb DEFAULT '{}'::jsonb,       -- e.g., { project_type, primary_lang, frameworks }
  PRIMARY KEY (user_id, repo_full_name)
);

CREATE INDEX idx_repo_memory_user ON repo_memory(user_id);
CREATE INDEX idx_repo_memory_recent ON repo_memory(user_id, updated_at DESC);

ALTER TABLE repo_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY repo_memory_owner ON repo_memory
  FOR ALL USING (user_id = auth.uid());

-- Realtime: enable so the TrustDrawer Memory tab updates live as session-close summarization writes
ALTER PUBLICATION supabase_realtime ADD TABLE repo_memory;
```

### Why composite PK on (user_id, repo_full_name)
Memory is per-user (privacy) and per-repo (no cross-pollination). One row per pair. Update via UPSERT.

### Cap enforcement
`byte_count` denormalized so trigger / write path can check size without re-measuring. Hard cap: 8192 bytes (8KB markdown). If a write would exceed, summarization runs first.

### `metadata` jsonb shape (optional)

```ts
interface RepoMemoryMetadata {
  project_type?: 'web_app' | 'api' | 'cli' | 'library' | 'training_lab' | 'ctf' | 'other';
  primary_language?: string;     // e.g., "TypeScript", "Python"
  frameworks?: string[];          // e.g., ["React", "Vite", "Tailwind"]
  package_manager?: string;       // e.g., "npm", "pnpm", "uv", "poetry"
  test_runner?: string;           // e.g., "vitest", "jest", "pytest"
  preferred_patterns?: string[];  // e.g., ["Zustand for state", "react-query for fetching"]
  do_not_touch?: string[];        // e.g., ["src/legacy/**"]
  notable_decisions?: { date: string; decision: string }[]; // log of key choices
}
```

This is extracted by the summarize call (Haiku reads the markdown and produces structured fields). Useful for UI ("this project uses React + Vite") and for concierge to reference quickly without re-parsing markdown.

---

## Memory Content — What Goes In

The markdown blob is structured but loose. Suggested sections (the summarizer enforces these via prompt):

```markdown
# Project: <repo full name>

## Summary
<1-2 paragraphs: what this project is, what it does, who it's for>

## Stack
<bullet list: language, framework, key libraries, package manager, test runner>

## Architecture Decisions
<chronological log of key decisions with brief rationale>
- 2026-04-22: Chose Zustand over Redux (lighter footprint, simpler API for this team size)
- 2026-04-25: Adopted Vitest (existing Jest config was slow)
- 2026-05-01: Auth via JWT in HttpOnly cookies (CSRF protection via SameSite=Strict)

## Sensitive / Load-Bearing Files
<list of files that need extra care>
- `src/lib/auth.ts` — JWT signing/verification logic. Don't refactor without security review.
- `src/db/schema.sql` — production migrations. Append-only.

## Patterns Conductor Prefers
<observations from past sessions about user style>
- Functions over classes for new code
- Comments only when non-obvious
- No `any` types — use `unknown` and narrow

## Recent Sessions
<last 5 sessions, 1 line each>
- 2026-05-04: Added /api/users/me endpoint, JWT cookie validation. PR #142 merged.
- 2026-05-02: Migrated to Vitest. All tests passing.
- 2026-04-30: Pre-build for landing page redesign — paused, design phase still iterating.

## Known Pitfalls
<things that didn't work, traps to avoid>
- Auto-deploy on push to `main` is enabled. Don't push WIP commits.
- Provider X has flaky 429 responses on this account during 9-11am ET (per provider_health observations).
```

The structure is suggested, not enforced rigidly. Markdown parser doesn't need to validate sections — concierge just prepends the whole blob. The structure helps the summarizer keep the file coherent over many updates.

---

## Read Path — How Concierge Sees Memory

### When loaded
At the start of any concierge call against a session bound to a repo:
1. `useThreads.ts` (or the concierge edge function directly) checks `sessions.github_repo`.
2. If set, query `repo_memory` for `(user_id, repo_full_name)`.
3. If found, prepend memory content to concierge's system prompt.

### Where in the prompt

```
You are Maestro's concierge. You are guiding the user through their session.

PROJECT MEMORY (from prior sessions):
{repo_memory.content}

CURRENT SESSION CONTEXT:
- Session phase: {current_phase}
- Active builders: {builders}
- ... (existing concierge context)

USER'S MESSAGE:
{user_message}
```

The memory is a clear, separated section so concierge can reference it ("In your prior session you decided X — does this approach align?") without confusing it with current-session context.

### Performance implications
Memory is at most 8KB markdown ≈ ~2000 tokens. Concierge's existing context is typically 1-3k tokens. Adding memory: ~30-50% prompt growth. Worth it for the cold-start fix.

If a user has no `github_repo` on the session (greenfield project), no memory load. Behavior unchanged.

---

## Write Path — When Memory Updates

Memory updates happen at four trigger types, in priority order:

### Trigger 1: Build completed (auto)
After a build's bouncer review completes (whether passed or paused), the watcher edge function fires `summarize_memory` with:
- The session's `architect_md` and `architect_plan` (architectural decisions)
- The build's task outcomes (what was built)
- Bouncer findings (security context)
- The session's user prompts and concierge responses (preferences observed)

### Trigger 2: Session archived (auto)
When a session transitions to status `archived`, summarize once at archive time. This catches sessions that don't go through full build flow (e.g., analysis-only sessions).

### Trigger 3: User explicit save (manual)
TrustDrawer Memory tab has a "Save current session insights" button. Triggers immediate summarize. Useful when the user knows something happened that should be remembered (e.g., "concierge just helped me decide to drop a dependency — remember this").

### Trigger 4: User direct edit (manual)
TrustDrawer Memory tab is a markdown editor. User edits, hits save, content goes straight to `repo_memory.content` without summarization. User-authored memory is authoritative — bypasses the auto-summarization size cap (warns at 8KB, allows up to 16KB for manual edits, summarizer kicks in on next auto-trigger).

---

## The Summarization Prompt

Lives in `supabase/functions/_shared/repo-memory-prompt.ts`. Called by a new edge function `repo-memory-update`.

```
You are updating a long-running project memory file. The user works on this
project across many sessions. The memory must stay coherent and useful as
new sessions add information.

REPO: {repo_full_name}

CURRENT MEMORY (existing content, may be empty):
{existing_content}

NEW SESSION CONTEXT (just completed):
- Session goal: {session_goal_summary}
- Build outcome: {build_status} ({tasks_completed}/{tasks_total} tasks; PR: {pr_url || 'none'})
- Bouncer findings: {bouncer_summary}
- Key concierge decisions: {concierge_decisions_summary}
- User explicit preferences voiced: {user_preferences}

YOUR JOB:
Produce updated memory content. Preserve historical decisions. Add what's new.
Compress when needed. Stay under 8000 bytes total.

GUIDELINES:
1. Keep the section structure: Summary, Stack, Architecture Decisions, Sensitive Files, Patterns Conductor Prefers, Recent Sessions, Known Pitfalls.
2. "Architecture Decisions" is a chronological log — APPEND new decisions, do not rewrite old ones.
3. "Recent Sessions" — keep last 5 entries; drop the oldest if adding the 6th.
4. "Patterns Conductor Prefers" — only add if observed THIS session OR if a prior session pattern was reinforced.
5. Compress aggressively in "Summary" and "Architecture Decisions" sections to stay under cap. Old decisions can be merged ("Auth flow refactored 3x — current state: JWT in HttpOnly cookies with CSRF tokens" instead of listing each refactor).
6. Do NOT invent details that weren't in the input. Speculation is worse than absence.
7. Do NOT include user-identifying info (real names, emails) — keep it project-focused.

Output JSON:
{
  "content": "<full updated markdown, all sections>",
  "metadata": {
    "project_type": "...",
    "primary_language": "...",
    "frameworks": ["..."],
    "package_manager": "...",
    "test_runner": "...",
    "preferred_patterns": ["..."],
    "do_not_touch": ["..."]
  },
  "summary_notes": "<1 sentence: what was added/changed in this update — for audit only, not stored>"
}
```

### Model choice
**Haiku 4.5.** Memory summarization is high-frequency-low-stakes (every session close). Haiku produces coherent markdown updates and JSON output reliably. Cost: ~$0.002 per summarize. Cheap.

### Failure handling
If the summarize call fails (network, JSON parse error):
- Don't write to `repo_memory`
- Log to `audit_events` as `repo_memory_update_failed` with reason
- User can manually retry from TrustDrawer
- Existing memory is preserved (not corrupted by partial write)

### Cap enforcement
After Haiku returns, validate:
- `byte_count(content) <= 8192`
- If exceeds: retry summarize with stricter "compress aggressively" prompt
- If still exceeds after retry: truncate "Recent Sessions" section to 3 entries; if still over, log warning and accept slight overflow (better than data loss)

---

## File-Level Changes

### New
- `supabase/functions/repo-memory-update/index.ts` — the summarization edge function. Single action: `?action=summarize` (called from frontend) or invoked from concierge after build completion.
- `supabase/functions/_shared/repo-memory-prompt.ts` — the prompt template + JSON parser.
- `src/components/reveal/MemoryPanel.tsx` — TrustDrawer Memory tab.
- `src/hooks/useRepoMemory.ts` — frontend hook (load on session start, save manual edits, trigger summarize).
- New migration `{ts}_repo_memory.sql` — table + indexes + Realtime publication.

### Modified
- `supabase/functions/concierge/index.ts` — load `repo_memory` for the session's repo (if any) and prepend to system prompt. Trigger `repo-memory-update` on build/bouncer completion.
- `supabase/functions/bouncer/index.ts` — after final review, post a summary blob that the memory updater consumes (Bouncer findings → "Sensitive Files" section material).
- `src/hooks/useWorkspace.ts` — on session activation, fetch `repo_memory` for the session's repo, store in context.
- `src/context/MaestroContext.tsx` — add `repoMemory: RepoMemoryRecord | null` to state.
- `src/types/index.ts` — type additions: `RepoMemoryRecord`, `RepoMemoryMetadata`, `RepoMemoryUpdateTrigger`.
- `src/components/reveal/TrustDrawer.tsx` — add Memory tab.
- `src/components/reveal/StatusChip.tsx` — small "memory loaded" indicator (📝) when active session has loaded memory.
- `MAESTRO_STATE.md` — Stable Architecture additions.

---

## TrustDrawer Memory Tab UI

```
┌─ Memory ─────────────────────────────────────────────────┐
│                                                           │
│ Repo: owner/my-app                            8.0 KB / 8KB│
│ Last updated: 2026-05-04 09:14 (after session #142 build) │
│                                                           │
│ [ Edit ] [ Refresh from current session ] [ Forget repo ] │
│                                                           │
│ ─── Content ─────────────────────────────────────────    │
│ # Project: owner/my-app                                  │
│                                                           │
│ ## Summary                                                │
│ A SaaS project management dashboard for small teams.     │
│ React + Vite frontend; Supabase backend.                 │
│                                                           │
│ ## Stack                                                  │
│ - Language: TypeScript                                    │
│ - Frontend: React 18, Vite, Tailwind CSS                  │
│ - State: Zustand (chosen 2026-04-22)                      │
│ - Backend: Supabase (Postgres + Auth + Edge Functions)   │
│ - Tests: Vitest                                           │
│ - Package mgr: pnpm                                       │
│                                                           │
│ ## Architecture Decisions                                 │
│ - 2026-04-22: Zustand over Redux (...)                    │
│ - 2026-04-25: Vitest replacement of Jest                  │
│ - 2026-05-01: Auth via JWT HttpOnly + SameSite=Strict     │
│                                                           │
│ ... (rest of memory, scrollable)                          │
└───────────────────────────────────────────────────────────┘
```

When `[ Edit ]` clicked, the content area becomes a textarea. Save commits directly. Cap warning at 8KB; allows up to 16KB for manual; auto-summarize on next trigger compresses back.

`[ Refresh from current session ]` → calls `repo-memory-update` with the current session's data, even if session isn't archived yet.

`[ Forget repo ]` → confirmation modal, then deletes the row. Useful if memory has gone stale or got polluted.

---

## Concierge UI Indicator

When `repo_memory` is loaded for the active session, StatusChip shows a small 📝 icon. Click → opens TrustDrawer Memory tab. Hover → "Loaded {N} bytes of memory from {last_updated_at}."

If no memory loaded (greenfield project, or first session against this repo), no icon. No noise.

---

## Acceptance Criteria

1. **First session against new repo:** No memory loaded, behavior unchanged. After session archive (or build completion), `repo_memory` row created with non-trivial content.
2. **Second session against same repo:** Memory loaded into concierge prompt at first user message. Concierge response references prior decisions.
3. **Manual save:** TrustDrawer Memory tab "Refresh from current session" button. Click mid-session. Memory updates.
4. **Manual edit:** Edit button switches to textarea. User pastes/types content. Save commits. Next session sees the edited content.
5. **Forget:** "Forget repo" deletes the row. Next session is cold-start again.
6. **Cap enforcement:** Engineered scenario where summarize would exceed 8KB. Verify retry with stricter compression. If retry still over: 6th-oldest "Recent Sessions" entry removed.
7. **Failure resilience:** Force the summarize edge function to error. Existing `repo_memory.content` is unchanged. Audit event logged.
8. **Realtime UI:** Memory tab is open. Session in another tab finishes a build. Memory tab updates without refresh.
9. **Privacy:** Memory for repo A is never loaded into a session bound to repo B. SQL injection / RLS test: user 1 cannot SELECT user 2's memory.
10. **No memory ≠ broken:** Greenfield project with no GitHub repo bound to session. No memory load attempted, no error, concierge behavior unchanged.
11. **Indicator visible:** StatusChip shows 📝 only when memory is loaded for active session. Click opens TrustDrawer Memory tab focused on the active repo.

---

## Verification (Live Tests)

1. **Two-session smoke test:** Bind session 1 to repo `foo/bar`. Complete a build. Archive session. Open new session 2 bound to same repo. First user message: "What did we decide about state management?" — concierge references prior decision from memory.
2. **Manual edit smoke:** Open Memory tab, edit content (add a fake decision "We hate semicolons" to Patterns section). Save. Open new session, ask about preferences — concierge references the edit.
3. **Forget smoke:** Add a fake unique decision to memory. Click "Forget repo." Open new session. Ask the same question — concierge has no knowledge.
4. **Cap test:** Simulate a session with very long context (force 30+ architecture decisions). After summarize, confirm content stays ≤ 8KB. Confirm "Architecture Decisions" section retains the most important entries (older entries merged or dropped).
5. **Cross-repo isolation:** Two sessions, two different repos. Memory for A doesn't leak into B's concierge prompt. Inspect via curl-tap on the actual API call.

---

## Decisions Made

### Q: Why per-repo, not per-user-global?
**A:** Avoids cross-pollination. Architecture decisions for a React app shouldn't bleed into a CLI tool project. The Conductor's preferences vary by project context. Per-repo keeps memory relevant.

### Q: Why 8KB cap?
**A:** Empirical balance. ~2000 tokens. Memory + concierge's existing context = ~3-5k tokens, fits comfortably in any provider's window without latency cost. Larger memories add noise without proportional value.

### Q: Why Haiku for summarization?
**A:** Frequency × cost. Memory updates run on every session close — could be many per day for a productive user. Haiku does coherent markdown summarization at ~$0.002/call. Sonnet would be 10× cost for marginal quality gain.

### Q: Why optional structured `metadata` jsonb when content is markdown?
**A:** Two reasons:
- **UI render speed**: showing project type / language / frameworks doesn't require parsing markdown.
- **Concierge fast-path**: simple questions ("what package manager does this use?") can answer from `metadata` without loading full memory into prompt.

The markdown content is canonical; metadata is derived. If they conflict, content wins.

### Q: Why don't we summarize from session events directly instead of an existing-content rewrite?
**A:** Two reasons:
- **Compression over time**: forcing rewrite means stale information naturally gets compressed. Append-only would balloon.
- **Coherence**: rewriting lets the summarizer notice contradictions ("we said use Zustand last session; this session says use Redux — flag for user").

Trade-off: each summarize call sees existing content + new info, slightly more tokens. Worth it.

### Q: Should memory be encrypted at rest?
**A:** No. Same RLS protection as other user data. If a user's auth is compromised, their memory is the least of the issues. Plain markdown also lets users export/version-control if they want.

### Q: What about teams sharing a repo?
**A:** Out of scope for v1 (Maestro is single-user). Each user has their own memory of the same repo. When workspace sharing ships, "shared memory" can be a separate column or table.

### Q: What if user has multiple sessions open simultaneously against the same repo?
**A:** Memory is loaded per-session at session-activation time. Both sessions see the same memory at start. If session 1 archives and triggers summarize during session 2, session 2's already-loaded memory is stale until session 2 reloads. Acceptable — sessions don't intercommunicate in real-time today, this would be a weird edge case.

### Q: When does the summarize trigger fire vs when does the user see the update?
**A:** Trigger fires on backend (build complete, archive). User sees the update via Realtime push to Memory tab IF that tab is open. If not open, they see the updated content next time they open it. No notification banner — memory updates are background hygiene, not user-facing events.

### Q: Privacy — what counts as "user-identifying info" the prompt says to strip?
**A:** Names, emails, exact API endpoints with potential auth-revealing path structure (e.g., `/api/users/me` is fine; `/api/users/123/secrets/oauth_clientid_xyz` is not — strip the IDs). The summarize prompt explicitly instructs Haiku to keep it project-focused, not user-focused.

### Q: Markdown parser to extract metadata or LLM?
**A:** LLM (Haiku, included in summarize call). Cheaper than maintaining a markdown parser; more flexible to evolving section structure.

---

## Open Questions

1. **Should memory survive a "Forget" + recreate?** No — Forget = delete. If user wants to backup, they should copy-paste before clicking. v1.1 could add "Export memory" button.
2. **Versioning — track edit history?** Useful for "what did concierge add yesterday vs what was there before?" Out of scope for v1; v2 could add `repo_memory_history` append-only table.
3. **Concierge writing into memory mid-session?** "I'm noting this decision in your memory" with confirm. Out of scope — auto-on-events is sufficient for v1.
4. **What if the summarize prompt produces invalid JSON?** Same 4-strategy parser as `orchestrate` already uses. Single retry then fail with audit event.
5. **Triggers from non-build sessions (analysis-only, design-only)?** Currently only build-completion and session-archive trigger summarize. An analysis session that ends without archiving has no auto-trigger. Acceptable for v1 — user can manually save.

---

## Implementation Order

1. **Migration + types.** `repo_memory` table + Realtime + RLS + TypeScript types. Ship alone.
2. **Summarize edge function.** `repo-memory-update/index.ts`. Test via curl with fixture session data.
3. **Summarize prompt module.** `_shared/repo-memory-prompt.ts`. Validate Haiku output JSON against schema.
4. **Concierge read integration.** `concierge/index.ts` loads memory at session start. Test: session with a populated memory row → concierge prompt includes it.
5. **Concierge write trigger.** Concierge invokes summarize edge function on build/bouncer completion.
6. **Frontend hook.** `useRepoMemory` loads on session activation, exposes load/edit/save/forget operations.
7. **MemoryPanel UI.** TrustDrawer Memory tab with view/edit/save/refresh/forget controls.
8. **StatusChip indicator.** Show 📝 when memory loaded.
9. **Cap enforcement.** Summarize call retries with stricter prompt if over cap; truncates Recent Sessions if still over.
10. **Live verification per acceptance criteria.** Update status + state docs.

Suggested split:
- **Sonnet:** 1, 2, 4, 5, 6, 9 (data, edge, hooks, cap logic).
- **Sonnet or Gemini:** 7, 8 (UI).
- **Opus must review step 3** — the summarize prompt sets memory's coherence and voice. Validate against fixture data before merge.

---

## What This Spec Does NOT Cover

- **Cross-user shared memory** — out of scope; revisit when workspace sharing ships.
- **Memory versioning / edit history** — v2.
- **Mid-session concierge-driven memory writes** ("I'm noting this") — v2.
- **Encryption** — RLS is sufficient for the threat model.
- **Memory export / backup** — v1.1; user can copy-paste for now.
- **Per-branch memory** (different memory for `main` vs `feature/auth`) — out of scope; per-repo only.
- **Memory-aware agents during builds** — concierge gets it; builders don't (their context is via DIFF-03 architect_plan, not memory). Possibly v2 to enrich architect with relevant memory excerpts.

---

## Hand-off Notes

This spec is mostly Sonnet-implementable. The one place that needs Opus eyes:

- **Step 3 (summarize prompt)** — the prompt determines whether memory stays coherent over many updates. Test against a multi-session fixture (5+ updates compounding) before merge. Specifically validate that "Architecture Decisions" stays chronological and that compression preserves the most-important entries.

If Sonnet implements solo, **stop after step 2 (edge function skeleton)** and request Opus to evaluate the summarize prompt on a real fixture. Wrong prompt = corrupted memory over time.

---

*End of DIFF-02 spec.*
