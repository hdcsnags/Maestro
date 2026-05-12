# BOUNCER-01 — Bouncer Review Profiles Spec

**Status:** Ready for review
**Authored:** 2026-05-03 by Opus 4.7
**Implementing agent:** Sonnet 4.6 (with Opus review of the profile classification table before ship)
**Parent plan:** Addresses smoketestaudit.md item #10 ("Bouncer should become intent-aware"). Listed in `IMPLEMENTATION_PLAN.md` "Remaining Non-Audited Risks" — promoted to a real spec.
**Dependencies:** None — can ship independently of other work.

---

## Why This Exists

Bouncer currently behaves as a production-grade security reviewer. It flags any SQL injection, XSS, IDOR, CSRF, JWT mistake, or insecure route as critical. That is correct for a production app. **It is wrong for an intentionally vulnerable training lab or CTF challenge.**

The Conductor has explicitly stated Maestro should support building "entire projects, using SOM with a Human at the helm." Some of those projects are **security training labs** that are *deliberately vulnerable by design*. A user trying to ship a CTF challenge gets blocked by Bouncer flagging the very vulnerabilities the challenge is supposed to teach.

This spec adds **review profiles** — a per-session/per-build classification that tells Bouncer how to interpret findings.

---

## The Two Categories Of Vulnerability

This is the key distinction that drives the profile model.

### Pedagogical / Spec'd Vulnerabilities
Vulnerabilities the project deliberately ships. In a CTF, these are the challenges. In a training lab, these are the lessons. They include:
- SQLi (deliberate user-input → query interpolation)
- XSS (deliberate `dangerouslySetInnerHTML` or unescaped output)
- IDOR (object references with no authorization check)
- CSRF (state-changing GETs, missing tokens)
- JWT mistakes (none-algorithm, hardcoded secrets, no expiry)
- Open redirects, path traversal, command injection (in challenge routes only)
- Hardcoded credentials in challenge code

In a CTF/training-lab profile, these are **expected** or **informational** — not blocking.

### Containment-Critical Vulnerabilities
Vulnerabilities that break **out of** the intended sandbox into the host system, the user's data, or the network. These remain **critical regardless of profile**:
- Real outbound SSRF reachability (the attacker can hit your AWS metadata service from inside the lab)
- Real OS execution that escapes the container
- Real production secrets in code (not lab secrets — actual API keys, real credentials)
- Real user PII or auth data accessible
- Public network exposure of admin/debug endpoints
- Non-isolated Docker / network configuration that lets lab containers reach prod
- Dangerous deployment defaults (e.g., `0.0.0.0` bind on what should be `127.0.0.1`)

These are **always critical**. No profile can downgrade them.

---

## Profile Types

Four profiles for v1:

### `production_app` (default)
Everything serious is critical. The current Bouncer behavior. No reclassification.

### `internal_demo`
For internal-only tools, demo-grade scaffolding, hackathon projects. Pedagogical-class vulnerabilities downgrade to `informational`. Containment-critical stays critical. Production secrets, public exposure, and PII handling stay critical.

### `training_lab`
For deliberately-instructive vulnerable apps used for security training. Pedagogical-class vulnerabilities are `expected` (not flagged at all). Containment-critical issues are critical. Bouncer additionally flags **missing pedagogical hooks** — e.g., a lab teaching SQLi that has no actual SQLi in it (the lesson can't be completed).

### `security_ctf`
For CTF challenges. Stricter than training_lab on containment (CTF participants WILL try to escape), looser on pedagogy. Pedagogical vulns are `expected`. Containment-critical is hyper-critical (auto-reject build). The CTF profile additionally validates **flag delivery hooks** — flags must be retrievable from the challenge but not from the host.

---

## Finding Reclassification Matrix

The core of the spec. For each finding category × profile, what severity should the user see?

| Finding Category | production_app | internal_demo | training_lab | security_ctf |
|-----------------|----------------|---------------|--------------|--------------|
| **SQL injection** (in normal route) | critical | informational | expected | expected |
| **SQL injection** (escapes the intended challenge → reaches non-challenge data) | critical | critical | critical | critical |
| **XSS** (in challenge route) | critical | informational | expected | expected |
| **XSS** (in admin/non-challenge route) | critical | minor | minor | critical |
| **IDOR** (deliberate, in lab route) | critical | informational | expected | expected |
| **IDOR** (lets user access OTHER USER's real data) | critical | critical | critical | critical |
| **CSRF** (in lab route) | critical | informational | expected | expected |
| **JWT none-alg / weak secret** (in lab) | critical | informational | expected | expected |
| **Hardcoded credential** (lab user/pass like `admin/admin`) | critical | minor | expected | expected |
| **Hardcoded credential** (real-looking API key, AWS access key, etc.) | critical | critical | critical | critical |
| **Path traversal** (in challenge sandbox path) | critical | informational | expected | expected |
| **Path traversal** (escapes to host fs / `/etc/passwd`) | critical | critical | critical | critical |
| **Command injection** (in challenge sandbox) | critical | informational | expected | expected |
| **Command injection** (executes outside sandbox / reaches host) | critical | critical | critical | critical |
| **SSRF** (to localhost-only mocks) | critical | minor | expected | expected |
| **SSRF** (real outbound; reaches metadata/internal IPs) | critical | critical | critical | critical |
| **Open admin/debug endpoint** (no auth on `/admin`) | critical | minor | minor | critical |
| **Public bind on debug port** (`0.0.0.0:8000` for a debug tool) | critical | critical | critical | critical |
| **Missing CORS** | critical | minor | informational | informational |
| **Old vulnerable dependency** (pinned, used in challenge) | critical | minor | informational | informational |
| **Old vulnerable dependency** (used in build/admin/scaffold) | critical | critical | critical | critical |
| **Insecure deployment default** (debug=True in prod-ish path) | critical | minor | informational | minor |
| **Real PII / user auth data accessible** | critical | critical | critical | critical |
| **Container/Docker escape config** | critical | critical | critical | critical |

### How to read the table
- `critical` — Bouncer pauses the build. User must approve, downgrade, or fix.
- `minor` — Bouncer notes it. Build proceeds. User can review.
- `informational` — Bouncer notes it for completeness. Build proceeds; no UI banner.
- `expected` — Bouncer suppresses entirely. The vulnerability is part of the spec.

### The "in challenge route" vs "outside" distinction
The matrix references "lab route" / "challenge route" / "admin/non-challenge route" because the same finding category has different severity depending on **where in the codebase it lives**. Pedagogical SQLi in a route deliberately tagged as a challenge is fine; SQLi in `/api/admin/users` is critical regardless of profile.

How does Bouncer know which is which? **Path-based annotation**. The user marks routes via:
- A directory convention: anything under `src/challenges/`, `src/labs/`, `routes/ctf/`, etc., is challenge code.
- Explicit comment markers: `// @pedagogical-vuln: sqli` or `/** @lab-route */` annotations.
- A config file in the repo (`bouncer.config.json`) with a `pedagogical_paths: string[]` array.

The user configures this once per repo. Bouncer respects the config when classifying findings.

---

## Profile Selection

### Per session
A session has a `bouncer_profile` field. Defaults to `production_app`. User changes it via:
- Pre-build plan card: a new "Review Profile" card in the plan sequence.
- Concierge can suggest based on intent: if the prompt is "build me a CTF challenge for SQLi," concierge auto-suggests `security_ctf` profile. Same for words like "training lab," "intentionally vulnerable," "security learning," etc.
- TrustDrawer Settings: per-session and per-repo defaults.

### Per repo
A user can also set a repo-default profile in `bouncer.config.json`:
```json
{
  "bouncer": {
    "default_profile": "training_lab",
    "pedagogical_paths": [
      "src/challenges/**",
      "labs/**"
    ],
    "containment_critical_overrides": {
      "src/challenges/sandbox-escape/**": "expected"
    }
  }
}
```

The repo config wins over the user's account default. Per-session selection wins over both.

### Confirmation gate for risky profiles
When user selects `training_lab` or `security_ctf`, Bouncer requires explicit confirmation: "You are entering a profile that suppresses certain vulnerabilities by design. Confirm you understand: [✓] yes." Audit log entry written. This is friction-by-design — accidentally shipping a "training_lab" production app is the worst possible failure mode.

---

## Data Model

### `sessions` table additions

```sql
ALTER TABLE sessions ADD COLUMN bouncer_profile text DEFAULT 'production_app'
  CHECK (bouncer_profile IN ('production_app','internal_demo','training_lab','security_ctf'));
ALTER TABLE sessions ADD COLUMN bouncer_profile_acknowledged_at timestamptz;
ALTER TABLE sessions ADD COLUMN bouncer_profile_acknowledged_by uuid REFERENCES auth.users(id);
```

### `bouncer_events` table additions

The existing `bouncer_events` table records each Bouncer review run. Add:

```sql
ALTER TABLE bouncer_events ADD COLUMN profile text NOT NULL DEFAULT 'production_app';
ALTER TABLE bouncer_events ADD COLUMN raw_findings jsonb;            -- pre-reclassification
ALTER TABLE bouncer_events ADD COLUMN reclassified_findings jsonb;   -- post-reclassification
ALTER TABLE bouncer_events ADD COLUMN suppressed_count int DEFAULT 0;
```

Storing both raw and reclassified findings is intentional — auditors need to see what Bouncer originally found AND what the user's selected profile downgraded.

### `BouncerFinding` type extension

```ts
export type FindingClassification =
  | 'critical_pause'      // existing — build must pause
  | 'critical_approved'   // existing — user can approve to continue
  | 'minor'               // existing
  | 'informational'       // NEW — visible but not blocking
  | 'expected'            // NEW — suppressed, recorded only
  | 'containment_critical'; // NEW — never reclassified down

export interface BouncerFinding {
  file: string;
  issue: string;
  category: FindingCategory;        // NEW — controlled vocabulary for matrix lookup
  raw_severity: 'critical' | 'minor';  // NEW — what the model originally said
  effective_severity: FindingClassification;  // NEW — after profile reclassification
  profile_applied?: BouncerProfile;  // NEW — which profile produced effective_severity
  is_pedagogical_path?: boolean;     // NEW — was this in a marked challenge path
  suggestion: string;
}

export type BouncerProfile = 'production_app' | 'internal_demo' | 'training_lab' | 'security_ctf';

export type FindingCategory =
  | 'sql_injection'
  | 'xss'
  | 'idor'
  | 'csrf'
  | 'jwt_weak'
  | 'hardcoded_credential'
  | 'path_traversal'
  | 'command_injection'
  | 'ssrf'
  | 'open_admin_endpoint'
  | 'public_bind'
  | 'missing_cors'
  | 'vulnerable_dependency'
  | 'insecure_default'
  | 'pii_exposure'
  | 'container_escape'
  | 'other';
```

### `BouncerResult` extension

```ts
export interface BouncerResult {
  findings: BouncerFinding[];
  overall_severity: string;
  summary: string;
  model_used: string;
  review_source?: 'build_tasks' | 'github_files' | 'file_names_only';
  // NEW
  profile: BouncerProfile;
  profile_acknowledgment_required?: boolean;  // first-time use of risky profile
  suppressed_findings_count?: number;
  containment_critical_count: number;
  pedagogical_findings_count: number;
}
```

---

## Bouncer Edge Function Changes

### `supabase/functions/bouncer/index.ts`

The Bouncer prompt currently asks the model to flag security issues. Update to:
1. Have the model emit findings with explicit `category` (controlled vocabulary above) and `raw_severity`.
2. Emit `is_pedagogical_path` true/false based on file path matching the user's `pedagogical_paths` config.
3. Apply reclassification post-LLM via the matrix (in code, not in the prompt — deterministic, auditable).

```ts
// Pseudocode for the reclassification step
function reclassifyFinding(
  finding: { category: FindingCategory; raw_severity: 'critical' | 'minor';
             is_pedagogical_path: boolean; file: string; },
  profile: BouncerProfile,
  config: RepoBouncerConfig
): FindingClassification {
  // Hard floor: containment-critical categories stay critical regardless
  const CONTAINMENT_ALWAYS_CRITICAL = new Set([
    'pii_exposure', 'container_escape', 'public_bind',
    // also: SSRF that's been sub-classified as 'real outbound' (separate category)
  ]);

  if (CONTAINMENT_ALWAYS_CRITICAL.has(finding.category)) {
    return 'containment_critical';
  }

  // Repo config override (user explicitly marked this path)
  const override = config.containment_critical_overrides?.[finding.file];
  if (override) return override;

  // Matrix lookup
  return RECLASSIFICATION_MATRIX[finding.category]?.[profile]
    ?? mapRawSeverity(finding.raw_severity);  // fallback
}

const RECLASSIFICATION_MATRIX: Record<FindingCategory, Partial<Record<BouncerProfile, FindingClassification>>> = {
  sql_injection: {
    // matrix encodes: pedagogical-path SQLi only — see below
    production_app: 'critical_pause',
    internal_demo: 'informational',  // when pedagogical-path
    training_lab: 'expected',
    security_ctf: 'expected',
  },
  // ... full matrix for every category
};
```

The matrix is **only consulted when `is_pedagogical_path` is true**. If a finding is in a non-pedagogical path, it stays at its raw severity regardless of profile (with `containment_critical` floor).

### Containment-critical sub-classification

For categories that COULD be either pedagogical or containment-critical (SQLi, command injection, path traversal, SSRF), the LLM is prompted to additionally classify whether the vulnerability **escapes the intended sandbox**. If yes → containment_critical regardless of path/profile. If no → pedagogical-path-aware reclassification.

The prompt addition for these categories:
```
For each finding in this category, also answer: does this vulnerability allow the attacker to ESCAPE the intended sandbox boundary into:
  - The host filesystem (outside the workspace)?
  - Network resources beyond the lab (real internet, internal AWS metadata, other tenants)?
  - Other users' data in the system?
  - The CI/CD or build pipeline?

If YES to any: set "containment_critical": true.
```

This is the LLM doing one more classification step. Two findings of the same category can have different containment status.

---

## UI Surfaces

### Pre-Build "Review Profile" plan card

New plan card in the existing plan-card sequence. Renders after Repo and Builder Roster cards.

```
┌─ Review Profile ────────────────────────────────────────┐
│                                                          │
│ How should Bouncer review this build?                   │
│                                                          │
│   ◉ Production app                                      │
│       Standard security review. All vulnerabilities     │
│       blocked. (Most projects.)                         │
│                                                          │
│   ○ Internal demo                                       │
│       Hackathon / scaffolding / internal tools.         │
│       Pedagogical issues downgraded to notes.           │
│                                                          │
│   ○ Training lab                                        │
│       ⚠ Deliberately vulnerable. Pedagogical issues     │
│       suppressed. Containment kept critical.            │
│                                                          │
│   ○ Security CTF                                        │
│       ⚠ For CTF challenges. Strictest containment;      │
│       loosest pedagogical review.                       │
│                                                          │
│ [Use suggested: production_app]   [Configure repo conf] │
└──────────────────────────────────────────────────────────┘
```

If user selects `training_lab` or `security_ctf`, an acknowledgment modal pops:
```
You are entering a review profile that suppresses certain
vulnerabilities by design. This profile is intended for
deliberately-vulnerable applications used for security
training or CTF challenges.

DO NOT use this profile for production code.

[ ] I understand and want to use the training_lab profile
                  [Cancel]   [Confirm]
```

### BouncerCard updates

The existing `BouncerCard.tsx` (Phase 6 unified UX) renders bouncer review results. Add:
- Profile badge in card header: `[ Profile: training_lab ]` color-coded by risk
- Suppressed-findings counter: "+ 7 findings suppressed by training_lab profile (view all)"
- Click "view all" → expands a collapsed section showing the raw findings AND their reclassification reason
- Containment-critical findings always visible regardless of profile, with a red bar and "containment-critical" label

### TrustDrawer Settings → Bouncer

Add a "Bouncer" section in TrustDrawer Settings with:
- Account default profile (defaults to `production_app`)
- Recent profile usage log (last 10 sessions, what profile was used)
- Audit: "you've used training_lab profile 3 times this month"

This is observability — helps the user catch their own mistakes.

---

## Concierge Integration

When the user opens a build flow, concierge checks the prompt and suggests a profile if the intent is clear:

| Prompt contains words like… | Suggested profile |
|----------------------------|-------------------|
| "CTF", "capture the flag", "challenge for [vuln]" | `security_ctf` |
| "training lab", "vulnerable by design", "security learning", "deliberately insecure" | `training_lab` |
| "demo", "hackathon", "scaffold", "prototype", "MVP" | `internal_demo` |
| (anything else) | `production_app` |

The suggestion is just a default selection on the plan card — user always gets the final say. The matching logic lives in `concierge` edge function as a small classifier (could even be a Haiku call: "Classify this build prompt: production / internal_demo / training_lab / ctf"; cached per session).

---

## File-Level Changes

### New
- `supabase/functions/bouncer/profiles.ts` — the reclassification matrix and logic.
- `supabase/functions/bouncer/categories.ts` — finding category controlled vocabulary + LLM prompt segments.
- `src/components/reveal/PlanCards/ReviewProfileCard.tsx` — the plan card.
- `src/lib/bouncerProfiles.ts` — frontend types + helpers (default per-repo config loader, matrix display).
- New migration `{ts}_bouncer_profiles.sql` — sessions/bouncer_events column additions.

### Modified
- `supabase/functions/bouncer/index.ts` — split prompt to elicit category + raw_severity + containment_critical; apply reclassification post-LLM.
- `src/types/index.ts` — type additions above.
- `src/hooks/useBouncerReview.ts` — pass profile to bouncer; render reclassification metadata.
- `src/components/reveal/BouncerCard.tsx` — profile badge, suppressed-findings disclosure.
- `src/hooks/usePreBuildPlan.ts` — add ReviewProfileCard to plan-card sequence.
- `src/components/reveal/TrustDrawer.tsx` — Bouncer settings section.
- `supabase/functions/concierge/index.ts` — profile-suggestion classifier.
- `MAESTRO_STATE.md` — Stable Architecture additions.

### Optional (user-facing repo helpers)
- `bouncer.config.json` schema documentation in README — let advanced users configure repo-level paths.

---

## Acceptance Criteria

1. **Default behavior unchanged.** A build with no profile selection runs Bouncer as `production_app` — identical findings to current behavior.
2. **Profile selection works.** User selects `training_lab` on the plan card, acknowledges, build proceeds. Bouncer review applies reclassification.
3. **Reclassification correct.** A SQLi finding in `src/challenges/sqli/` becomes `expected` under `training_lab`. The same finding in `src/api/users.ts` (no pedagogical marker) stays `critical_pause`.
4. **Containment-critical floor holds.** A finding tagged `container_escape` stays `containment_critical` even with `security_ctf` profile.
5. **Acknowledgment required.** First time selecting `training_lab` in a session triggers the modal. Subsequent selections within the session don't re-prompt.
6. **Audit trail.** `bouncer_events.raw_findings` stores LLM output. `bouncer_events.reclassified_findings` stores post-matrix output. Both retrievable for forensics.
7. **Suppressed counter visible.** BouncerCard shows "+ N findings suppressed by training_lab profile" with click-to-expand. Click reveals the raw findings + reason.
8. **Concierge suggestion fires.** Prompt "Build me a CTF challenge for SQL injection" → concierge suggests `security_ctf` on the plan card.
9. **Config file respected.** Repo with `bouncer.config.json` setting `default_profile: training_lab` and `pedagogical_paths: ["labs/**"]` — Bouncer applies that config without user re-entering.
10. **Fail-closed for unknown categories.** A finding with a category not in the matrix uses `mapRawSeverity()` fallback (treats raw_severity:critical as critical_pause). Never silently suppresses.

---

## Verification (Live Tests)

1. **Production-app baseline:** build a known-vulnerable scaffold without selecting a profile. Confirm Bouncer flags everything as critical (current behavior).
2. **Training-lab smoke:** create `src/challenges/sqli/route.ts` with a deliberate SQLi. Build with `training_lab` profile. Confirm Bouncer review:
   - Marks the SQLi as `expected` (not surfaced in critical list)
   - Shows it in the "suppressed" expansion
   - Build does NOT pause on the finding
3. **Containment-critical:** add to the same build a `child_process.exec(req.body.cmd)` in `src/api/admin/exec.ts`. Confirm Bouncer flags this as `containment_critical` regardless of profile.
4. **Acknowledgment modal:** first time selecting `security_ctf` in a fresh session — modal appears. Second time same session — no modal.
5. **Concierge suggestion:** new session with prompt "build me a CTF challenge for XSS." Open Pre-Build plan cards. ReviewProfileCard pre-selects `security_ctf`.
6. **Config override:** put `bouncer.config.json` with `default_profile: training_lab` in repo root. New session against that repo. Plan card pre-selects `training_lab`.

---

## Decisions Made

### Q: Why both raw and reclassified findings stored?
**A:** Auditability. A future auditor (or paranoid Conductor) needs to see what Bouncer ORIGINALLY found and what the user's profile suppressed. Without both, "the user shipped X vulnerability" can't be distinguished from "Bouncer didn't catch X."

### Q: Why a path-based pedagogical marker instead of just per-profile reclassification?
**A:** Same project can mix pedagogical and production code. A training app's marketing site (`/api/contact`) shouldn't have its SQLi suppressed just because the lab routes (`/labs/sqli`) need theirs suppressed. Path scope is the correct granularity.

### Q: Why deterministic matrix in code, not LLM-driven reclassification?
**A:** Deterministic + auditable. An LLM-reclassified Bouncer would be unpredictable run-to-run and impossible to audit. The matrix is reviewable, version-controlled, and consistent.

### Q: Why ask the LLM for `containment_critical` boolean separately?
**A:** It's the one classification the matrix can't determine from category alone — same SQLi might or might not escape sandbox. The LLM has the code in front of it; it can judge. The matrix then respects the LLM's containment_critical flag as a hard floor.

### Q: Why an explicit acknowledgment modal for training_lab/security_ctf?
**A:** Because the worst failure mode is shipping a "training_lab" production app. Friction-by-design. The audit log of acknowledgments also creates forensic evidence ("user explicitly opted in").

### Q: What about `internal_demo` — does it need acknowledgment?
**A:** No. `internal_demo` only DOWNGRADES to informational; it doesn't suppress. Worst case in `internal_demo` is a slightly noisier build, not a missed critical vulnerability.

### Q: Why fall back on raw_severity when category isn't in matrix?
**A:** Defense in depth. A finding type Bouncer hasn't seen before should be treated conservatively (critical if model said critical), not silently bypassed.

### Q: Should `pedagogical_paths` support globs?
**A:** Yes. The matrix uses minimatch globs. Standard `**` and `?` and `[]` semantics. Path-relative to repo root.

### Q: Can the user manually re-classify a single finding?
**A:** Out of scope for v1. v1.1 should add "downgrade this finding" with a reason field. v1 is matrix-driven only.

### Q: Per-profile bouncer prompts — same model, different system prompt?
**A:** Same model, same prompt structure. The reclassification happens AFTER the LLM. This keeps the LLM stateless and the matrix the only place per-profile policy lives. Auditable.

---

## Open Questions

1. **What about open-source projects shipping training labs publicly?** They have a legitimate need for `training_lab` profile but the matrix is internal. Recommendation: ship the matrix as a JSON file in the repo so it's self-documenting + reviewable. Defer.
2. **Should there be a way for the user to ADD a category to "always containment-critical"?** Their threat model might consider some other category as a hard floor. Recommendation: per-repo `bouncer.config.json` `containment_critical_categories: string[]` extension. v1.1.
3. **CTF profile may need flag-handling validation** (where does the flag live? is it accidentally retrievable from outside?). Defer to a `BOUNCER_CTF_VALIDATION.md` follow-up spec.

---

## Implementation Order

1. **Migration.** Sessions + bouncer_events column additions. Ship alone.
2. **Type additions.** TypeScript types in `src/types/index.ts`. Build clean.
3. **Profiles + matrix module.** `supabase/functions/bouncer/profiles.ts` and `categories.ts`. Unit-test the matrix lookup with edge cases (containment floor, fallback path).
4. **Bouncer edge function update.** Update prompt to elicit category + containment_critical. Apply reclassification post-LLM. Test against a known-vulnerable fixture repo.
5. **Frontend hook update.** `useBouncerReview` carries profile. Reclassification metadata flows to UI.
6. **ReviewProfileCard** in plan-card sequence. Acknowledgment modal.
7. **BouncerCard updates.** Profile badge, suppressed-findings disclosure, containment-critical highlighting.
8. **Concierge classifier.** Suggest profile based on prompt keywords. Pre-fill ReviewProfileCard.
9. **TrustDrawer Bouncer section.** Account-level defaults, usage history.
10. **Repo config loader.** Read `bouncer.config.json`, apply defaults.
11. **Live verification per acceptance criteria.** Update status + state docs.

Suggested split: Sonnet does 1-7 (bulk implementation). Gemini can do 6-7 UI components if available. Step 8 (concierge classifier) is small enough Sonnet can include it. **Opus must review step 3 (matrix table) before merge.** That table is policy — getting it wrong ships either too-loose or too-strict reviews.

---

## What This Spec Does NOT Cover

- **Continuous bouncer (mid-build observer mode)** — Bouncer running during build, not just after. Separate spec, deferred.
- **Per-finding manual override** — user marks a single finding as expected. v1.1.
- **Cross-team / shared profile policies** — when workspace sharing ships.
- **CTF flag validation** — where flag lives, is it retrievable, etc. Separate spec.
- **Training-lab integrity check** — "the lesson can't be completed because the lab has no SQLi." Mentioned as a v2 nice-to-have; out of scope for first ship.
- **Auto-classification of "in challenge route" without user marking.** v1 requires explicit pedagogical_paths config or directory convention.

---

*End of BOUNCER-01 spec.*
