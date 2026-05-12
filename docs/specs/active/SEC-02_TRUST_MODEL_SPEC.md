# SEC-02 — Trust Model Migration Spec

**Status:** Ready for implementation
**Authored:** 2026-05-03 by Opus 4.7
**Implementing agent:** Sonnet 4.6 (after this spec is reviewed)
**Parent plan:** `IMPLEMENTATION_PLAN.md` task `SEC-02`
**Prerequisite:** `SEC-01` (shell analyzer hardening) must ship first

---

## Executive Summary

The current trust model is **client-authoritative**. The frontend's `classifyCommandTrust()` regex array (`src/types/index.ts:712-727`) decides whether a command needs user approval before execution. The backend honors that flag without re-validation.

**This is the same class of mistake as "client sends the price."** A modified frontend, browser extension, or replayed network call could submit any command with `approval_required: false` and skip the approval gate.

This spec defines the migration to a **server-authoritative trust model** with **five-layer defense in depth**.

---

## The Five-Layer Trust Stack (Target State)

```
┌──────────────────────────────────────────────────────────────┐
│ Layer 1: Frontend prediction (UX hint only)                  │
│   - predictCommandTrust() in src/lib/trustHints.ts           │
│   - NOT authoritative; frontend never sets approval flags    │
│   - Used for instant UI feedback ("this will need approval") │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 2: Edge function classification (server authoritative) │
│   - classifyCommand() in _shared/trust.ts                    │
│   - Runs on every executor-api?action=submit                 │
│   - Returns { trust: 'trusted' | 'approval_required' }       │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 3: Approval token validation                           │
│   - Server issues short-lived signed tokens for risky cmds   │
│   - Frontend resubmits with token after user clicks Approve  │
│   - Server validates: signature, user, command-binding, TTL  │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 4: Kernel binary allowlist (hard floor)                │
│   - In packages/maestroclaw/src/adapters/{approved,pty}-shell│
│   - Even an approved command is REJECTED if argv[0] not in   │
│     TRUSTED_BINARIES set                                     │
└──────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────┐
│ Layer 5: Kernel pipeline analysis                            │
│   - analyzeShellCommand() (post SEC-01: blocks &&, ||, ;)   │
│   - Every segment's binary checked, not just argv[0]         │
└──────────────────────────────────────────────────────────────┘
```

Each layer **fails closed**. Frontend manipulation defeats Layer 1 (UX hint) but cannot bypass 2-5.

---

## What Is Authoritative Where

There are **two separate registries**, often confused:

### Registry A — Trust Classifier (server-authoritative)
- **What:** Regex patterns that map command strings → `'trusted' | 'approval_required'`.
- **Where:** `supabase/functions/_shared/trusted-commands.ts`
- **Used by:** `executor-api` (Layer 2)
- **Purpose:** Decide whether the user needs to click "Approve" before execution.
- **Examples:** `git status`, `git log`, `ls -la` → trusted. `git push`, `rm -rf`, `npm install` → approval required.

### Registry B — Kernel Binary Allowlist (Claw-authoritative)
- **What:** A flat set of binary names that may execute under the kernel.
- **Where:** `packages/maestroclaw/src/adapters/approved-shell.ts:5-8` and `pty-shell.ts:5-9`
- **Used by:** Claw worker (Layer 4)
- **Purpose:** Hard floor — blocks unknown binaries entirely.
- **Examples:** `git`, `npm`, `ls`, `cat` allowed. `curl`, `wget`, `bash` not allowed.

**These DO NOT need to share a source.** They serve different purposes. Registry A is policy ("does this need approval?"). Registry B is bedrock ("does this binary even run?").

---

## File-Level Changes

### New files

#### `supabase/functions/_shared/trusted-commands.ts`
The canonical trust regex registry. Single source. Edge functions import it.

```ts
// supabase/functions/_shared/trusted-commands.ts
export interface TrustPattern {
  pattern: RegExp;
  description: string;
}

export const TRUSTED_PATTERNS: TrustPattern[] = [
  { pattern: /^git\s+status\b/, description: 'Check repo status' },
  { pattern: /^git\s+log\b/, description: 'View commit history' },
  { pattern: /^git\s+diff\b/, description: 'View changes' },
  { pattern: /^git\s+branch\b/, description: 'List branches' },
  { pattern: /^ls\b/, description: 'List directory' },
  { pattern: /^dir\b/, description: 'List directory (Windows)' },
  { pattern: /^cat\b/, description: 'View file contents' },
  { pattern: /^type\b/, description: 'View file contents (Windows)' },
  { pattern: /^pwd\b/, description: 'Print working directory' },
  { pattern: /^whoami\b/, description: 'Current user' },
  { pattern: /^npm\s+list\b/, description: 'List packages' },
  { pattern: /^npm\s+outdated\b/, description: 'Check outdated packages' },
  { pattern: /^npm\s+--version\b/, description: 'npm version' },
  { pattern: /^node\s+--version\b/, description: 'Node version' },
  { pattern: /^gh\s+repo\s+view\b/, description: 'View repo info' },
  { pattern: /^gh\s+issue\s+list\b/, description: 'List issues' },
  { pattern: /^gh\s+pr\s+list\b/, description: 'List pull requests' },
];

export type TrustLevel = 'trusted' | 'approval_required';

export function classifyCommand(command: string): { level: TrustLevel; matchedDescription?: string } {
  const trimmed = command.trim();
  for (const t of TRUSTED_PATTERNS) {
    if (t.pattern.test(trimmed)) {
      return { level: 'trusted', matchedDescription: t.description };
    }
  }
  return { level: 'approval_required' };
}
```

**Note:** This is the same regex set currently in `src/types/index.ts:TRUSTED_COMMANDS` but transplanted to the edge environment. The frontend's `TRUSTED_COMMANDS` becomes a parallel hint-only copy (see `src/lib/trustHints.ts` below).

#### `supabase/functions/_shared/approval-tokens.ts`
HMAC-signed approval token issuance and validation.

```ts
// supabase/functions/_shared/approval-tokens.ts
import { createHmac, timingSafeEqual } from 'node:crypto'; // Deno equivalent

const APPROVAL_SECRET = Deno.env.get('APPROVAL_TOKEN_SECRET'); // 32+ random bytes
const TTL_MS = 5 * 60_000; // 5 minutes

export interface ApprovalTokenPayload {
  user_id: string;
  command_hash: string; // sha256 of normalized command string
  adapter: string;
  expires_at: number; // unix ms
}

export function issueApprovalToken(payload: ApprovalTokenPayload): string {
  const body = JSON.stringify(payload);
  const sig = sign(body);
  return `${btoa(body)}.${sig}`;
}

export function validateApprovalToken(
  token: string,
  expected: { user_id: string; command_hash: string; adapter: string }
): { ok: true } | { ok: false; reason: string } {
  // Parse, verify HMAC, check expiry, check expected fields match.
  // Returns { ok: false, reason: 'expired' | 'forged' | 'mismatch' } on any failure.
}

function sign(body: string): string {
  if (!APPROVAL_SECRET) throw new Error('APPROVAL_TOKEN_SECRET not set');
  return createHmac('sha256', APPROVAL_SECRET).update(body).digest('hex');
}
```

#### `src/lib/trustHints.ts`
Renamed/relocated frontend predictor. Replaces `TRUSTED_COMMANDS` and `classifyCommandTrust` in `src/types/index.ts`.

```ts
// src/lib/trustHints.ts
// IMPORTANT: This is a UX prediction layer, NOT a security boundary.
// The server (executor-api) is authoritative. This exists ONLY to
// give the user instant feedback before round-tripping the server.

import type { ExecutionCommandTrust } from '../types';

const HINT_PATTERNS: { pattern: RegExp }[] = [
  // Same patterns as server, mirrored for instant UX. If they drift,
  // user sees a "Hmm, this needs approval" reclassification after submit
  // — annoying but safe.
  { pattern: /^git\s+(status|log|diff|branch)\b/ },
  { pattern: /^(ls|dir|cat|type|pwd|whoami)\b/ },
  { pattern: /^npm\s+(list|outdated|--version)\b/ },
  { pattern: /^node\s+--version\b/ },
  { pattern: /^gh\s+(repo\s+view|issue\s+list|pr\s+list)\b/ },
];

export function predictCommandTrust(command: string): ExecutionCommandTrust {
  const trimmed = command.trim();
  return HINT_PATTERNS.some(t => t.pattern.test(trimmed))
    ? 'trusted'
    : 'approval_required';
}
```

### Modified files

#### `supabase/functions/executor-api/index.ts`
The submit action becomes the trust gate.

Behavior changes:
1. On `action=submit`, call `classifyCommand()` from `_shared/trusted-commands.ts`.
2. Override any `approval_required` value sent by the client. Server's classification wins.
3. If classified as `approval_required` AND no valid approval token in payload → return `{ status: 'pending_approval', approval_token: <issued> }` (status code 200, not 400 — this is a normal flow).
4. If classified as `approval_required` AND a valid approval token IS in payload → mark job approved, dispatch normally.
5. If classified as `trusted` → dispatch normally, no token required.
6. **Audit:** every classification decision writes an `audit_events` row.

Pseudocode for the relevant block (in the existing `action=submit` handler):

```ts
// After authenticating user and parsing body...
const userCommand = body.prompt; // for approved_shell / pty_shell adapters
const adapter = body.adapter;

const isShellAdapter = adapter === 'approved_shell' || adapter === 'pty_shell';
let serverTrust: 'trusted' | 'approval_required' = 'approval_required';
let matchedDescription: string | undefined;

if (isShellAdapter) {
  const result = classifyCommand(userCommand);
  serverTrust = result.level;
  matchedDescription = result.matchedDescription;
} else {
  // Non-shell adapters (claude_code, etc.) do not use this gate.
  // They have their own flow — build_session jobs etc.
  serverTrust = body.approval_required === false ? 'trusted' : 'approval_required';
}

const commandHash = await sha256Normalized(userCommand);

if (serverTrust === 'approval_required') {
  if (body.approval_token) {
    const validation = validateApprovalToken(body.approval_token, {
      user_id: user.id,
      command_hash: commandHash,
      adapter,
    });
    if (!validation.ok) {
      await audit('approval_token_invalid', { reason: validation.reason });
      return jsonError(403, `Approval token invalid: ${validation.reason}`);
    }
    // Token valid — fall through to dispatch
  } else {
    // Issue a token; do NOT dispatch yet
    const token = issueApprovalToken({
      user_id: user.id,
      command_hash: commandHash,
      adapter,
      expires_at: Date.now() + 5 * 60_000,
    });
    await audit('approval_required_issued', { command_hash: commandHash });
    return jsonOk({
      status: 'pending_approval',
      approval_token: token,
      classification: 'approval_required',
      description: 'Command requires user approval before execution.',
    });
  }
}

// Continue with the existing dispatch path...
await audit('command_dispatched', {
  trust: serverTrust,
  matched: matchedDescription,
});
```

#### `src/hooks/useThreads.ts`
Update `executeFromChat` to handle the new pending-approval response.

The current flow: classify locally → submit with `approval_required` flag → if true, show modal → on user approve, resubmit with flag false.

The new flow:
1. `predictCommandTrust(command)` for instant UI hint (renders the approval card immediately if predicted risky).
2. Call `executor-api?action=submit` WITHOUT any approval flag (server decides).
3. If response is `{ status: 'pending_approval', approval_token }`, render the approval card (which probably already exists from prediction). Wait for user click.
4. On user approve, resubmit with `approval_token: <token>` in body.
5. On reject or timeout, do nothing.

If predicted-trusted but server-classified as needs-approval (drift), the UI will get the pending-approval response and switch to the approval card — slight jank but safe.

#### `src/types/index.ts`
- DELETE `TRUSTED_COMMANDS` array.
- DELETE `classifyCommandTrust` function.
- DELETE `EXECUTION_INTENT_PROMPT` (this should also be server-side; flag for SEC-02b follow-up).
- KEEP `ExecutionCommandTrust` type alias.
- ADD: `interface PendingApprovalResponse { status: 'pending_approval'; approval_token: string; classification: 'approval_required'; description: string; }` for the new server response shape.

#### Frontend callers of removed exports
Anywhere that imported `classifyCommandTrust` or `TRUSTED_COMMANDS` from `../types` must switch to `predictCommandTrust` from `../lib/trustHints`. Likely candidates:
- `src/hooks/useThreads.ts`
- `src/components/reveal/EventCards/ExecutionApprovalCard.tsx`
- `src/components/reveal/RevealComposer.tsx` (if it shows trust hints)

The implementing agent should grep for `TRUSTED_COMMANDS` and `classifyCommandTrust` to find all sites.

---

## Migration / Rollout Order

This must ship in **one PR**, not staged across deploys, because the contract change is breaking. Frontend and edge function must deploy together.

1. **Edge function changes first in branch:** add `_shared/trusted-commands.ts`, `_shared/approval-tokens.ts`, modify `executor-api` submit handler.
2. **Frontend changes in same branch:** add `trustHints.ts`, remove the deleted exports from `types/index.ts`, update `useThreads.ts` to handle `pending_approval` response.
3. **Set environment variable** `APPROVAL_TOKEN_SECRET` in Supabase project (32+ random bytes; document in README + AGENTS.md).
4. **Deploy edge function**: `supabase functions deploy executor-api`.
5. **Deploy frontend**: standard `npm run build` + push.
6. **Smoke test live** before declaring done (see Verification).
7. **Monitor `audit_events`** for `approval_required_issued` and `approval_token_invalid` rows for 24h. If `_invalid` is non-zero from legitimate users, there's a bug.

---

## Acceptance Criteria

1. **Forged trust is rejected.** Direct call to `executor-api?action=submit` with `{ "prompt": "rm -rf .", "adapter": "approved_shell", "approval_required": false }` does NOT execute. Returns `pending_approval` with token. Without the token, no execution happens.
2. **Trusted commands still bypass approval.** Calling submit with `git status` does NOT return `pending_approval` — dispatches directly.
3. **Approval flow works end-to-end.** A risky command in chat shows the approval card. User clicks approve. Command executes. The two-call sequence is invisible to the user.
4. **Token forging fails.** Manually constructed token without HMAC secret returns 403 with `forged` reason.
5. **Token expiry works.** Approval token from > 5 min ago returns 403 with `expired` reason.
6. **Token replay across commands fails.** A token issued for `rm -rf foo` cannot approve `rm -rf bar` (different `command_hash`).
7. **Audit log is complete.** Every dispatch has an `audit_events` row with `trust` and `matched` fields. Every rejected token has a row with `reason`.
8. **Frontend predictor stays accurate.** `predictCommandTrust` and server `classifyCommand` agree on at least 95% of common commands (mirror the regex sets exactly).
9. **`TRUSTED_COMMANDS` and `classifyCommandTrust` are gone from frontend code.** Grep returns zero matches in `src/`.
10. **Existing trusted flows unchanged from user perspective.** No new clicks needed for `git status` etc.

---

## Verification (Live, Not Compile-Only)

### Required test sequence

1. **Server-authoritative test:**
   ```sh
   # Forge a trusted submit for a risky command
   curl -X POST $SUPABASE_URL/functions/v1/executor-api \
     -H "Authorization: Bearer $JWT" \
     -H "Content-Type: application/json" \
     -d '{"action":"submit","prompt":"rm -rf .","adapter":"approved_shell","approval_required":false}'
   # Expect: { status: "pending_approval", approval_token: "...", classification: "approval_required" }
   # Expect NOT: a queued executor_jobs row.
   ```
2. **Approval round-trip:**
   - Submit `rm -rf foo` from the chat.
   - Approval card appears.
   - Click Approve.
   - Verify `executor_jobs` row created.
   - Verify two `audit_events` rows: `approval_required_issued` and `command_dispatched`.
3. **Token forge:**
   ```sh
   curl ... -d '{"action":"submit","prompt":"rm -rf .","adapter":"approved_shell","approval_token":"definitely-not-real.fakehex"}'
   # Expect: 403 with reason "forged"
   ```
4. **Token expiry:**
   - Issue a token, wait 6 minutes, attempt to use.
   - Expect: 403 with reason "expired"
5. **Token mismatch:**
   - Issue token for `rm -rf foo`.
   - Resubmit with that token but `prompt: "rm -rf bar"`.
   - Expect: 403 with reason "mismatch"
6. **Trusted bypass:**
   - Submit `git status` from chat.
   - Expect: NO approval card. Job runs immediately.
7. **Frontend grep:**
   ```sh
   grep -r "TRUSTED_COMMANDS\|classifyCommandTrust" src/
   # Expect: zero matches
   ```

### MAESTRO_STATE.md update
After verification, add to "What's Working":
- `SEC-02 trust model: server-authoritative classification, HMAC approval tokens with 5-minute TTL, command-bound non-replayable. Frontend retains UX hints only (predictCommandTrust). | 2026-MM-DD (live smoke + curl forge tests)`

---

## Decisions Made (Why These Choices)

### Q: TS regex registry vs database-backed table?
**A: TS file in `_shared/`.** Code-reviewable, version-controlled, no DB latency. Per-user customization is a v2 feature; v1 ships with one global registry. The migration path is straightforward: replace `TRUSTED_PATTERNS` import with a `loadUserPatterns(userId)` call when v2 lands.

### Q: HMAC tokens vs database-stored approval rows?
**A: HMAC tokens.** A DB row per approval costs reads on every approval validation and creates state to clean up. HMAC tokens are stateless and self-validating. Trade-off: revocation is impossible (the token is good for 5 minutes regardless). For a 5-minute TTL on individual user actions, this is acceptable.

### Q: 5-minute TTL — too long? too short?
**A: 5 minutes is the conservative choice.** Long enough that a user who steps away briefly can still approve. Short enough that a phished token is useless after lunch. Tunable via `APPROVAL_TOKEN_TTL_MS` env var if real-world usage shows different needs.

### Q: Should the frontend predictor and server classifier share source code?
**A: No, they're parallel by design.** Sharing source means the frontend bundles the regex array (no harm — it's just patterns), but more importantly couples deploy timing. Keeping them separate lets the server classifier evolve more aggressively (with the predictor catching up later as a UX-only update).

### Q: What about non-shell adapters (claude_code, etc.)?
**A: Out of scope for SEC-02.** Those use different approval paths (build_spec_locked, scope_paths, etc.). This spec covers the `approved_shell` and `pty_shell` adapters only — the path the user invokes via natural-language execute commands. Non-shell adapters retain their existing approval semantics.

### Q: What if `APPROVAL_TOKEN_SECRET` is missing in env?
**A: Edge function fails closed** with a 500 and a clear error log. The classifier should NEVER fall back to client-authoritative on a config error — that's how vulnerabilities ship.

### Q: User customization (extend the trust list)?
**A: Deferred to SEC-02b (post-v1).** v1 ships with the static list. v2 adds a TrustDrawer "My Trusted Commands" panel with per-user regex overrides stored in `user_settings.trust_overrides JSONB`. Critical guardrail: user-added patterns must NOT be allowed to broaden the binary set — the kernel allowlist is still the hard floor.

### Q: Is there a race between approval issuance and submit?
**A: No.** The approval token is bound to `(user_id, command_hash, adapter)`. Even if the user has multiple tabs open, the same exact command from the same user can use the same token within TTL. Different commands need different tokens. This is correct.

---

## Open Questions for Human Review (Non-Blocking)

These do NOT block implementation but should be revisited after deploy:

1. **Should approval_token be one-time-use (consumed on first redeem)?** Currently it's reusable within the 5-min window. Switching to one-time would require DB state for token tracking. Trade-off vs HMAC simplicity. Recommend: keep reusable for v1, revisit if abuse seen.
2. **Visibility of `audit_events` to user.** The user can't currently see their own command audit log. TrustDrawer should grow a "Recent Actions" panel. Out of scope for SEC-02 but worth a follow-up task.
3. **Logging the actual command in audit events.** Currently audit_events stores hash of command. Should it store the command itself? Privacy vs forensics trade-off. Recommend: store hash + first 60 chars (truncated) for forensic quick-look without unbounded retention concerns.

---

## What This Spec Does NOT Cover

- The kernel binary allowlist (Layer 4) — that lives in `pty-shell.ts` / `approved-shell.ts` and is governed by SEC-01.
- The kernel pipeline analysis (Layer 5) — also SEC-01.
- IP allowlisting — SEC-03.
- Custom user trust lists — SEC-02b (future).
- Build-mode approval flows (`build_spec_locked`) — separate concern.
- LLM intent parsing security (the `EXECUTION_INTENT_PROMPT` running on `orchestrate`) — flagged for follow-up SEC-02c.

---

## Hand-off Notes for Sonnet

This spec resolves all the "Open Questions" listed in `IMPLEMENTATION_PLAN.md` for SEC-02. You should be able to implement directly from this document.

**Suggested implementation order (minimize churn):**
1. Add `_shared/trusted-commands.ts` and `_shared/approval-tokens.ts`. Add unit tests in Deno test format.
2. Add `src/lib/trustHints.ts` with `predictCommandTrust`. Don't touch `types/index.ts` yet.
3. Modify `executor-api/index.ts` submit handler. Test via curl first.
4. Modify `useThreads.ts` to handle `pending_approval` response.
5. Find and update all callers of `classifyCommandTrust` and `TRUSTED_COMMANDS` in `src/`.
6. Delete from `types/index.ts` last (this fails the build until callers are fixed).
7. Generate a fresh `APPROVAL_TOKEN_SECRET` (32+ random bytes) and set it in Supabase env.
8. Deploy edge function FIRST, then frontend.
9. Run the curl tests live before declaring done.
10. Update both `IMPLEMENTATION_PLAN_STATUS.md` and `MAESTRO_STATE.md`.

If you hit something this spec didn't anticipate, **stop and flag it**. Do not invent a solution to a security-critical question.

---

*End of SEC-02 spec.*
