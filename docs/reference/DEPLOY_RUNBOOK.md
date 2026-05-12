# DEPLOY_RUNBOOK

**Status:** Living document. Add a section per deploy.
**Audience:** Any agent or human running a Supabase / frontend deploy.
**Authored:** 2026-05-04 by Opus 4.7
**Use this when:** A spec says "ship live" or a status row says "deploy step remains."

---

## Pre-Deploy Standard Checklist

Run through this before ANY deploy:

- [ ] `npm run typecheck` clean
- [ ] `npm run build` clean
- [ ] `npm --prefix packages\maestroclaw run build` clean (if MaestroClaw touched)
- [ ] Migrations reviewed: `supabase db diff` shows no surprises
- [ ] Environment secrets identified (any new env vars the spec required?)
- [ ] Browser smoke test of the changed flow — `npm run dev` and click through it
- [ ] `MAESTRO_STATE.md` "Last verified deploy" line updated AFTER deploy succeeds
- [ ] `IMPLEMENTATION_PLAN_STATUS.md` task row updated to `verified` after live verification

---

## Standard Deploy Flow

### A. Migrations First (if any)

```sh
# Push pending migrations to remote
supabase db push

# Verify
supabase db diff   # should report no diffs
```

If a migration adds a Realtime publication, **also confirm the table is published**:
```sql
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
```

### B. Edge Functions

```sh
# Deploy a single function
supabase functions deploy <function-name>

# Or deploy all
supabase functions deploy

# Verify deployment
supabase functions list
```

For functions that read environment secrets, confirm secrets are set:
```sh
supabase secrets list
```

### C. Frontend

```sh
npm run build
# Push to your hosting (Vercel/Netlify/manual). Project-specific.
```

### D. Smoke Test Live

Run the spec's "Verification (Live Tests)" section against the deployed environment. Compile-only is not acceptance.

---

## Per-Spec Runbooks

### SEC-02 — Server-Authoritative Trust (HMAC Approval Tokens)

**Context:** Migrates trust classification from frontend-authoritative to server-authoritative. Frontend was the gate; now `executor-api` issues HMAC-signed approval tokens with 5-minute TTL bound to user + command hash + adapter.

**Code shipped:** Per `SEC-02_TRUST_MODEL_SPEC.md`. Verified 2026-05-09 by Sonnet.

**Deploy steps:**

1. Generate the HMAC secret (32 random bytes, hex):
   ```sh
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

2. Set in Supabase project secrets:
   - **Dashboard path:** Project Settings → Edge Functions → Secrets
   - **Key:** `APPROVAL_TOKEN_SECRET`
   - **Value:** the hex string from step 1
   - Or via CLI: `supabase secrets set APPROVAL_TOKEN_SECRET=<hex>`

3. Redeploy `executor-api`:
   ```sh
   supabase functions deploy executor-api
   ```

4. **Live verification (the four forge tests from `SEC-02_TRUST_MODEL_SPEC.md`):**

   ```sh
   # Test 1 — server-authoritative classification
   # Expect: { status: "pending_approval", approval_token: "..." } NOT a queued job.
   curl -X POST $SUPABASE_URL/functions/v1/executor-api \
     -H "Authorization: Bearer $JWT" \
     -H "Content-Type: application/json" \
     -d '{"action":"submit","prompt":"rm -rf .","adapter":"approved_shell","approval_required":false}'

   # Test 2 — token forge
   # Expect: 403 with reason "forged"
   curl -X POST $SUPABASE_URL/functions/v1/executor-api \
     -H "Authorization: Bearer $JWT" \
     -H "Content-Type: application/json" \
     -d '{"action":"submit","prompt":"rm -rf .","adapter":"approved_shell","approval_token":"forged.fakehex"}'

   # Test 3 — token mismatch (token issued for X, used for Y)
   # Expect: 403 with reason "mismatch"
   #   (1) Submit "rm -rf foo" → save token
   #   (2) Resubmit token but prompt: "rm -rf bar"

   # Test 4 — trusted bypass
   # Expect: NO approval_required; job queues directly
   curl -X POST ... -d '{"action":"submit","prompt":"git status","adapter":"approved_shell"}'
   ```

5. **Frontend grep:** `grep -r "TRUSTED_COMMANDS\|classifyCommandTrust" src/` returns zero matches.

6. **Update `MAESTRO_STATE.md`:**
   - "Last verified deploy" → add `executor-api redeployed YYYY-MM-DD (SEC-02 HMAC trust live)`
   - Active blockers → remove SEC-02 row entirely
   - Append session log entry with verification results

**Rollback:** If issues found, unset `APPROVAL_TOKEN_SECRET`. Code falls back to legacy queued-job path. Then redeploy or revert.

---

### SEC-04 — IncidentService (Already Deployed 2026-05-04)

**Status:** ✅ Live. Reference for pattern only.

**What was deployed:**
- Migration: `executor_incidents` table + RLS + Realtime publication
- `executor-api` `report_incident` action
- `IncidentService` instantiated in MaestroClaw
- TrustDrawer Security panel + StatusChip dot

**No further deploy steps.** This section exists as a pattern reference for similar future deploys (new edge action + migration + UI).

---

### DIFF-04 — Provider Fallback Matrix (NOT Yet Implemented)

**Status:** Spec ready (`DIFF-04_PROVIDER_FALLBACK_SPEC.md`), no code yet.

**When implemented, deploy steps will be:**

1. Migration: `supabase db push` (creates `provider_health` table + Realtime publication)
2. New edge function: `supabase functions deploy provider-health-probe`
3. `concierge` edge function update (probe call before plan-finalize): `supabase functions deploy concierge`
4. `orchestrate` edge function update (failure-class metadata in errors): `supabase functions deploy orchestrate`
5. Frontend redeploy
6. **Live verification:** the 6 tests from `DIFF-04` Verification section. Critically:
   - Pre-build probe runs and BuilderRosterCard shows health dots within 5s
   - Force a 5xx — observe degraded transition + auto-reroute
   - Lower threshold to $0.05 — force a reroute with delta > $0.05 → approval card

**Critical gotcha:** the failure classification table in `providerHealth.ts` has tunable constants (2-failures-in-5-min for degraded, 3-in-10-min for down). These are first-pass values. Watch the first week of telemetry.

---

### LIVE-01 — Concierge Live Coordinator (NOT Yet Implemented)

**Status:** Spec ready (`LIVE_CONCIERGE_COORDINATOR_SPEC.md`), no code yet.

**When implemented, deploy steps:**

1. Migration: `supabase db push` (creates `coordinator_invocations` table + sessions extension)
2. New edge function: `supabase functions deploy build-coordinator`
3. Frontend redeploy
4. **Live verification:** the 7 tests from `LIVE-01` Verification section. Critically:
   - Real 8-task build produces 3-5 messages over duration (not per-task spam)
   - Force a cost-escalation reroute → approval card with three buttons
   - Set per-session budget to $0.005 → coordinator silences mid-build, build still completes

**Critical gotcha:** the prompt template in `coordinator-prompt.ts` is the voice. Get Opus to validate it against real Haiku output BEFORE wiring the trigger emitters. Wrong voice = wrong product feel.

---

### BOUNCER-01 — Review Profiles (NOT Yet Implemented)

**Status:** Spec ready (`BOUNCER_PROFILES_SPEC.md`), no code yet.

**When implemented, deploy steps:**

1. Migration: `supabase db push` (sessions + bouncer_events column additions)
2. `bouncer` edge function update: `supabase functions deploy bouncer`
3. `concierge` edge function update (profile-suggestion classifier): `supabase functions deploy concierge`
4. Frontend redeploy
5. **Live verification:** the 6 tests from `BOUNCER-01` Verification section. Critically:
   - Production-app baseline still flags everything as critical (no regression)
   - `training_lab` profile suppresses pedagogical SQLi in `src/challenges/sqli/`
   - Containment-critical (e.g., `child_process.exec(req.body.cmd)` in admin route) stays critical regardless of profile

**Critical gotcha:** the matrix table in `profiles.ts` is policy. Opus must review the table before merge. Getting it wrong ships either too-loose (security holes) or too-strict (lab builds blocked).

---

## Production Deploy Checklist (Compounding Multi-Spec Deploys)

When shipping multiple specs in one deploy window (e.g., DIFF-04 + LIVE-01 + BOUNCER-01 together):

- [ ] Each spec's pre-deploy checklist passes individually
- [ ] All migrations reviewed in one `supabase db diff`
- [ ] Each edge function deployed in dependency order:
  1. `_shared/*.ts` changes (zero-deploy — pulled in via imports)
  2. New edge functions first
  3. Modified edge functions next
  4. Frontend last
- [ ] Each spec's live verification run independently after deploy
- [ ] One `MAESTRO_STATE.md` session log entry covering all shipped specs
- [ ] One `IMPLEMENTATION_PLAN_STATUS.md` append-log entry per task

---

## Rollback Procedures

### Edge function rollback

```sh
# Supabase keeps function version history
supabase functions list --include-deleted

# To roll back:
git checkout <prior-commit> -- supabase/functions/<function-name>/
supabase functions deploy <function-name>
```

### Migration rollback

**Migrations are not auto-reversible.** If a migration must be undone:

1. Write a NEW migration that reverses the change (`supabase migration new revert_<migration-name>`).
2. Apply via `supabase db push`.
3. Document in MAESTRO_STATE.md "Unapplied migrations" with reasoning.

**Never use `supabase db reset` against a remote.** It nukes everything.

### Frontend rollback

Revert the deployment in your hosting provider's UI (Vercel / Netlify keep version history). Always faster than a fresh deploy.

---

## Post-Deploy Hygiene

Within 1 hour of every deploy:

- [ ] Spot-check `audit_events` for 4xx/5xx surge (look for new error patterns)
- [ ] Check `executor_incidents` if SEC-related deploy
- [ ] Check `coordinator_invocations` if LIVE-related deploy
- [ ] Confirm Realtime subscriptions still receive events (open browser, do a test action, watch network panel)
- [ ] If anything looks off, **roll back rather than debug live.** Roll back is reversible; debugging in prod creates downstream weirdness.

---

## Useful One-Liners

```sh
# Fresh secret generation (any spec needing HMAC/encryption)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# What edge functions are live?
supabase functions list

# What env vars are set?
supabase secrets list

# Last 10 audit events for a session
psql "$DATABASE_URL" -c "SELECT created_at, event_type, succeeded FROM audit_events WHERE session_id = '<id>' ORDER BY created_at DESC LIMIT 10;"

# What's pending in a build?
psql "$DATABASE_URL" -c "SELECT status, count(*) FROM build_tasks WHERE session_id = '<id>' GROUP BY status;"

# Incidents in the last 24h
psql "$DATABASE_URL" -c "SELECT severity, category, count(*) FROM executor_incidents WHERE created_at > now() - interval '1 day' GROUP BY severity, category ORDER BY count DESC;"
```

---

*Add new sections per spec as they reach the deploy stage. Keep examples current.*
