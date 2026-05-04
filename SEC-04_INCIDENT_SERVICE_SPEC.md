# SEC-04 — IncidentService Wiring & System Events Spec

**Status:** Ready for implementation
**Authored:** 2026-05-03 by Opus 4.7
**Implementing agent:** Sonnet 4.6
**Parent plan:** `IMPLEMENTATION_PLAN.md` task `SEC-04`
**Dependencies:** `SEC-01` (kernel hardening — incidents fire from kernel violations)

---

## Summary

`IncidentService` (`packages/maestroclaw/src/lib/kernel/incident-service.ts`) is implemented but **instantiated nowhere**. Its fallback `targetJobId = "system_node_event"` would fail at `executor-api`'s validation layer because that's not a real UUID in `executor_jobs`.

This spec wires the service into the runtime, fixes the fallback, and surfaces incidents in the UI so the user can actually see when their kernel rejected something.

---

## Why This Matters

The kernel's value comes from being **observable**. Right now if the kernel rejects `git status; rm -rf .` (post SEC-01), the rejection is logged to local stdout and disappears. The user has no way to know. For a security boundary, silent rejection is almost as bad as no rejection.

Wiring incidents up makes:
- The kernel's work visible (good for trust)
- Patterns detectable ("why is my agent generating bad commands lately?")
- Forensics possible (audit trail beyond `audit_events`)

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│ MAESTROCLAW WORKER                                       │
│                                                          │
│  index.ts boot:                                          │
│    const incidents = new IncidentService(config);       │
│    passes to adapter factory                             │
│                                                          │
│  approved-shell.ts / pty-shell.ts:                       │
│    On Kernel Violation or Security Violation:            │
│      incidents.report({ severity, title, message,       │
│                          metadata: { command, binary } })│
└─────────────────────────────────────────────────────────┘
                       │
                       ▼ POST executor-api?action=report_incident
                       │
┌─────────────────────────────────────────────────────────┐
│ SUPABASE                                                 │
│                                                          │
│  executor-api validates payload, writes:                 │
│    executor_incidents row                                │
│  (NOT a job event — incidents are first-class)          │
└─────────────────────────────────────────────────────────┘
                       ▲
                       │ Realtime subscribe
                       │
┌─────────────────────────────────────────────────────────┐
│ FRONTEND                                                 │
│                                                          │
│  TrustDrawer "Security" panel:                           │
│    Recent incidents list (last 30 days)                  │
│    Filter by severity                                    │
│    Click to see full metadata                            │
└─────────────────────────────────────────────────────────┘
```

---

## Data Model

### New table: `executor_incidents`

```sql
CREATE TABLE executor_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  executor_id uuid REFERENCES executors(id),         -- which executor generated it
  job_id uuid REFERENCES executor_jobs(id),          -- nullable: incident may have no job context
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  category text NOT NULL CHECK (category IN (
    'kernel_violation',     -- shell-analyzer rejected the pipeline
    'security_violation',   -- binary not on allowlist
    'auth_violation',       -- token/IP/identity mismatch (future)
    'scope_violation',      -- diff or write touched out-of-scope path (future)
    'system_error',         -- worker-internal (out of disk, etc.)
    'manual'                -- user-reported via UI (future)
  )),
  title text NOT NULL,
  message text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,        -- e.g., { command, binary, segments }
  acknowledged_at timestamptz,                         -- user clicked acknowledge in UI
  acknowledged_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_incidents_user_recent ON executor_incidents(user_id, created_at DESC);
CREATE INDEX idx_incidents_severity ON executor_incidents(user_id, severity, created_at DESC);
CREATE INDEX idx_incidents_unacknowledged
  ON executor_incidents(user_id, created_at DESC)
  WHERE acknowledged_at IS NULL;

ALTER TABLE executor_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY incidents_owner ON executor_incidents
  FOR ALL USING (user_id = auth.uid());

-- Incidents are append-only from user perspective; updates only allowed for ack.
CREATE POLICY incidents_ack_only ON executor_incidents
  FOR UPDATE USING (user_id = auth.uid())
  WITH CHECK (
    -- Only acknowledged_at and acknowledged_by may change
    user_id = auth.uid()
  );

-- Auto-purge after 90 days via scheduled job (out of scope for v1; flag for v1.1)
```

### Enable Realtime

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE executor_incidents;
```

### TypeScript types in `src/types/index.ts`

```ts
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export type IncidentCategory =
  | 'kernel_violation'
  | 'security_violation'
  | 'auth_violation'
  | 'scope_violation'
  | 'system_error'
  | 'manual';

export interface ExecutorIncident {
  id: string;
  user_id: string;
  executor_id?: string | null;
  job_id?: string | null;
  severity: IncidentSeverity;
  category: IncidentCategory;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  acknowledged_at?: string | null;
  acknowledged_by?: string | null;
  created_at: string;
}
```

---

## File-Level Changes

### Modified: `packages/maestroclaw/src/lib/kernel/incident-service.ts`

The current implementation calls `reportEvent` with a fake job ID. Rewrite to use a dedicated endpoint:

```ts
import type { ClawConfig } from "../../config.js";

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentCategory =
  | 'kernel_violation' | 'security_violation' | 'auth_violation'
  | 'scope_violation' | 'system_error' | 'manual';

export interface IncidentReport {
  severity: IncidentSeverity;
  category: IncidentCategory;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  jobId?: string;       // optional: link to the job if there is one
}

/**
 * IncidentService — bridges kernel-level security events to the Thamos UI
 * via a dedicated executor-api endpoint. Failures are non-fatal: the
 * worker continues operating even if incident reporting fails (we don't
 * want a reporting bug to break the kernel).
 */
export class IncidentService {
  constructor(private config: ClawConfig) {}

  async report(incident: IncidentReport): Promise<boolean> {
    const tag = `[${incident.category.toUpperCase()}]`;
    console.log(
      `🚨 ${tag} ${incident.title} (${incident.severity})`
    );

    try {
      const res = await fetch(
        `${this.config.supabaseUrl}/functions/v1/executor-api?action=report_incident`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.executorToken}`,
          },
          body: JSON.stringify({
            severity: incident.severity,
            category: incident.category,
            title: incident.title,
            message: incident.message,
            metadata: incident.metadata ?? {},
            job_id: incident.jobId ?? null,
          }),
        }
      );

      if (!res.ok) {
        console.error(
          `⚠️ Incident report rejected: ${res.status} ${await res.text()}`
        );
        return false;
      }
      return true;
    } catch (err) {
      console.error(`⚠️ Incident report failed (network):`, err);
      return false;
    }
  }
}
```

Key changes from current implementation:
- Removed the `"system_node_event"` fallback — incidents go to a dedicated endpoint, not piggyback on event reporting.
- Renamed `reportIncident` → `report` (cleaner API).
- Added `category` field as required (was missing).
- `metadata` typed as `Record<string, unknown>` not `any`.
- Returns boolean for clarity (success/failure).
- Network errors are caught and logged, NOT thrown — kernel must not break on reporting failure.

### Modified: `packages/maestroclaw/src/index.ts`

```ts
// In main() bootstrap, after loading config:
import { IncidentService } from "./lib/kernel/incident-service.js";

const incidents = new IncidentService(config);

// Pass to executor module:
// (This requires executor.ts to accept incidents in its function signatures,
//  OR a module-level setter. Recommend: setter to keep signatures clean.)
import { setIncidentService } from "./executor.js";
setIncidentService(incidents);
```

### Modified: `packages/maestroclaw/src/executor.ts`

Add a module-level instance accessor:

```ts
let incidentServiceInstance: IncidentService | null = null;

export function setIncidentService(svc: IncidentService): void {
  incidentServiceInstance = svc;
}

export function getIncidentService(): IncidentService | null {
  return incidentServiceInstance;
}
```

The adapters call `getIncidentService()` to fetch the instance. If null (e.g., during unit tests), report becomes a no-op silently.

### Modified: `packages/maestroclaw/src/adapters/approved-shell.ts`

Replace the silent rejection paths with incident reporting:

```ts
import { getIncidentService } from "../executor.js";

// Inside ApprovedShellAdapter.run():

// 1. Analyze command via Kernel
const analysis = analyzeShellCommand(command);
if (!analysis.ok) {
  await getIncidentService()?.report({
    severity: 'high',
    category: 'kernel_violation',
    title: 'Shell pipeline rejected by kernel',
    message: `Kernel Violation: ${analysis.reason}`,
    metadata: { command, reason: analysis.reason },
  });
  return { success: false, output: "", error: `Kernel Violation: ${analysis.reason}` };
}

// 2. Security: Validate every segment against allowlist
for (const segment of analysis.segments) {
  const binary = segment.argv[0]?.toLowerCase();
  if (!binary || !TRUSTED_COMMANDS.has(binary)) {
    await getIncidentService()?.report({
      severity: 'critical',
      category: 'security_violation',
      title: `Disallowed binary: ${binary || '<empty>'}`,
      message: `Binary '${binary}' is not on the workstation allowlist.`,
      metadata: {
        command,
        rejected_binary: binary,
        rejected_segment: segment.raw,
        all_segments: analysis.segments.map(s => s.raw),
      },
    });
    return {
      success: false,
      output: "",
      error: `Security Violation: Binary '${binary}' is not on the workstation allowlist.`
    };
  }
}
```

### Modified: `packages/maestroclaw/src/adapters/pty-shell.ts`

Mirror the changes to `approved-shell.ts` for both kernel violation and security violation paths.

### Modified: `supabase/functions/executor-api/index.ts`

Add a new action `report_incident`:

```ts
if (action === 'report_incident') {
  // Authenticate via executor token (existing helper)
  const executor = await authenticateExecutor(req);
  if (!executor) return jsonError(401, 'Invalid executor token');

  const body = await req.json();

  // Validate
  const requiredFields = ['severity', 'category', 'title', 'message'];
  for (const f of requiredFields) {
    if (!body[f]) return jsonError(400, `Missing field: ${f}`);
  }
  if (!['low','medium','high','critical'].includes(body.severity)) {
    return jsonError(400, 'Invalid severity');
  }
  if (!['kernel_violation','security_violation','auth_violation',
        'scope_violation','system_error','manual'].includes(body.category)) {
    return jsonError(400, 'Invalid category');
  }

  // Insert
  const { data, error } = await supabase
    .from('executor_incidents')
    .insert({
      user_id: executor.owner_user_id,
      executor_id: executor.id,
      job_id: body.job_id ?? null,
      severity: body.severity,
      category: body.category,
      title: body.title,
      message: body.message,
      metadata: body.metadata ?? {},
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to insert incident:', error);
    return jsonError(500, 'Database write failed');
  }

  // Audit (uses existing audit helper)
  await audit('incident_reported', {
    incident_id: data.id,
    severity: body.severity,
    category: body.category,
  });

  return jsonOk({ status: 'ok', incident_id: data.id });
}
```

### New: `src/components/reveal/SecurityPanel.tsx`

Renders inside TrustDrawer. Subscribes to executor_incidents via Realtime.

```tsx
// Pseudocode structure — Sonnet implements full component

import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, AlertTriangle, AlertCircle, Info, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useMaestro } from '../../context/MaestroContext';
import type { ExecutorIncident, IncidentSeverity } from '../../types';

const SEVERITY_CONFIG: Record<IncidentSeverity, { Icon: any; color: string; label: string }> = {
  critical: { Icon: ShieldAlert, color: 'text-red-400', label: 'Critical' },
  high:     { Icon: AlertTriangle, color: 'text-orange-400', label: 'High' },
  medium:   { Icon: AlertCircle, color: 'text-yellow-400', label: 'Medium' },
  low:      { Icon: Info, color: 'text-blue-400', label: 'Low' },
};

export default function SecurityPanel() {
  const [incidents, setIncidents] = useState<ExecutorIncident[]>([]);
  const [filter, setFilter] = useState<IncidentSeverity | 'all'>('all');

  // Initial fetch (last 30 days)
  useEffect(() => {
    void (async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60_000).toISOString();
      const { data, error } = await supabase
        .from('executor_incidents')
        .select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(200);
      if (data) setIncidents(data as ExecutorIncident[]);
    })();
  }, []);

  // Realtime subscription for new incidents
  useEffect(() => {
    const channel = supabase
      .channel('executor_incidents_user')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'executor_incidents',
      }, (payload) => {
        setIncidents((prev) => [payload.new as ExecutorIncident, ...prev]);
      })
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, []);

  const filtered = useMemo(() =>
    filter === 'all' ? incidents : incidents.filter(i => i.severity === filter),
    [incidents, filter]
  );

  const ackIncident = async (id: string) => {
    await supabase
      .from('executor_incidents')
      .update({ acknowledged_at: new Date().toISOString() })
      .eq('id', id);
    setIncidents((prev) =>
      prev.map(i => i.id === id ? { ...i, acknowledged_at: new Date().toISOString() } : i)
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-white/80">Security Incidents</h3>
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value as any)}
          className="text-xs bg-white/5 border border-white/10 rounded px-2 py-1 text-white/70"
        >
          <option value="all">All severities</option>
          <option value="critical">Critical only</option>
          <option value="high">High+</option>
        </select>
      </div>

      {filtered.length === 0 && (
        <div className="text-xs text-white/50 italic py-4 text-center">
          No incidents in the last 30 days. Your kernel is happy.
        </div>
      )}

      {filtered.map(inc => {
        const cfg = SEVERITY_CONFIG[inc.severity];
        const Icon = cfg.Icon;
        const isUnack = !inc.acknowledged_at;
        return (
          <div
            key={inc.id}
            className={`rounded-lg border px-3 py-2.5 ${
              isUnack ? 'border-white/15 bg-white/[0.04]' : 'border-white/[0.06] bg-white/[0.02] opacity-60'
            }`}
          >
            <div className="flex items-start gap-2">
              <Icon size={14} className={`${cfg.color} flex-shrink-0 mt-0.5`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-white/85 truncate">
                    {inc.title}
                  </span>
                  <span className="text-[10px] text-white/45 flex-shrink-0">
                    {new Date(inc.created_at).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-white/60 mt-1">{inc.message}</p>
                {inc.metadata && Object.keys(inc.metadata).length > 0 && (
                  <details className="mt-1.5">
                    <summary className="text-[10px] text-white/45 cursor-pointer hover:text-white/65">
                      View metadata
                    </summary>
                    <pre className="text-[10px] text-white/55 mt-1 p-2 bg-black/20 rounded overflow-x-auto">
                      {JSON.stringify(inc.metadata, null, 2)}
                    </pre>
                  </details>
                )}
                {isUnack && (
                  <button
                    onClick={() => ackIncident(inc.id)}
                    className="mt-1.5 text-[10px] text-white/65 hover:text-white/85 inline-flex items-center gap-1"
                  >
                    <Check size={10} /> Acknowledge
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

### Modified: `src/components/reveal/TrustDrawer.tsx`

Add a "Security" tab/section that renders `<SecurityPanel />`. Existing TrustDrawer structure should already have a tab system — slot it in. If not, add a simple tab switcher.

### Modified: `src/components/reveal/StatusChip.tsx`

When there are unacknowledged critical incidents in the last 24h, the StatusChip shows a red dot. Click → opens TrustDrawer Security tab. Lightweight wiring, ~20 lines.

```tsx
// Add to existing StatusChip:
const { unacknowledgedCriticalCount } = useUnackIncidents();
// ...
{unacknowledgedCriticalCount > 0 && (
  <span className="ml-1 w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
)}
```

A small helper hook:

```ts
// src/hooks/useUnackIncidents.ts
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useUnackIncidents() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    void (async () => {
      const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
      const { count: c } = await supabase
        .from('executor_incidents')
        .select('*', { count: 'exact', head: true })
        .eq('severity', 'critical')
        .is('acknowledged_at', null)
        .gte('created_at', since);
      setCount(c ?? 0);
    })();

    const ch = supabase
      .channel('incidents_count_channel')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'executor_incidents' },
        () => {
          // re-query on any change
          void (async () => {
            const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
            const { count: c } = await supabase
              .from('executor_incidents')
              .select('*', { count: 'exact', head: true })
              .eq('severity', 'critical')
              .is('acknowledged_at', null)
              .gte('created_at', since);
            setCount(c ?? 0);
          })();
        }
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, []);
  return { unacknowledgedCriticalCount: count };
}
```

---

## Acceptance Criteria

1. **Wired:** `IncidentService` is instantiated once at Claw boot. The two kernel adapters (`approved_shell`, `pty_shell`) call `getIncidentService()?.report(...)` on every rejection path.
2. **No more `system_node_event` placeholder.** Grep `packages/maestroclaw/` for `system_node_event` returns zero matches.
3. **End-to-end:** Force a kernel violation by submitting `git status; rm -rf .` (post SEC-01). An `executor_incidents` row appears with severity `high`, category `kernel_violation`, populated metadata.
4. **End-to-end:** Force a security violation by submitting `curl example.com` (binary not allowlisted). An incident with severity `critical`, category `security_violation`, includes `rejected_binary` in metadata.
5. **UI surface:** TrustDrawer "Security" panel lists the incident immediately (Realtime push, not requiring refresh).
6. **Acknowledge:** Click Acknowledge — row updates, dot in StatusChip clears (if it was the only unacked critical).
7. **Filter:** Severity filter dropdown works.
8. **No fatal failures:** Disconnect the network; force a kernel violation; the kernel still rejects the command, the worker prints the failure, **but does not crash**. The incident does not write but the security boundary holds.
9. **Auth-correct:** Calling `executor-api?action=report_incident` without a valid executor token returns 401. With invalid payload (missing fields), returns 400.

---

## Verification (Live)

1. **Force a kernel violation:**
   ```sh
   # In a session where executor-api is wired and the Claw is running:
   curl -X POST $SUPABASE_URL/functions/v1/executor-api \
     -H "Authorization: Bearer $JWT" -H "Content-Type: application/json" \
     -d '{"action":"submit","prompt":"git status; rm -rf .","adapter":"approved_shell","approval_required":true}'
   # (After SEC-02 ships, this requires the approval flow; before SEC-02 you can directly trigger it via DB row insert.)
   # Approve the command if needed.
   # Expected: SEC-01 kernel rejects. Incident appears in TrustDrawer.
   ```
2. **Network failure resilience:**
   - Block `*.supabase.co` in your firewall.
   - Trigger a kernel violation.
   - Confirm Claw logs the report failure but does not crash.
   - Restore network. Subsequent incidents report normally.
3. **Realtime push:**
   - Open TrustDrawer Security panel.
   - Trigger an incident.
   - Confirm the new incident appears within 1 second without refresh.
4. **Acknowledge persistence:**
   - Acknowledge an incident.
   - Refresh the browser.
   - Confirm incident is dimmed/marked acknowledged on reload.

---

## Decisions Made

### Q: Why a dedicated `executor_incidents` table instead of using `executor_job_events`?
**A:** Incidents are first-class user-visible artifacts with their own UI, retention, and acknowledgment semantics. Job events are debugging telemetry. Conflating them would force `executor_job_events` to grow ack/severity/category columns it doesn't need, and would force every incident to fake a job_id. Cleaner to separate.

### Q: Why `getIncidentService()` accessor instead of dependency injection?
**A:** Adapters are factory-instantiated (`new ClaudeCodeAdapter()`) without arguments, per the existing registry pattern. Adding constructor args would ripple through every adapter. The module-level getter is pragmatic, testable (set to null in tests), and keeps the registry signature clean.

### Q: Why not `await` reports in adapter rejection paths?
**A:** We DO await — but inside a `try/catch` that swallows network errors. The await ensures the report fires before `return`; the catch ensures we don't crash if the network is dead. Fire-and-forget without await would silently lose reports on slow connections.

### Q: Severity matrix — what gets what?
- **critical**: security_violation (binary not allowlisted; this is the kernel's hard floor)
- **high**: kernel_violation (pipeline rejected; less alarming because the analyzer is conservative)
- **medium**: scope_violation (future), auth_violation (future)
- **low**: system_error (e.g., out-of-disk; informational)

### Q: 90-day retention — soft delete or hard?
**A:** Hard delete via scheduled job (cron edge function). v1 doesn't ship the cron — flag for v1.1. Until then incidents accumulate; reasonable users will see <100 incidents in months of use.

### Q: Per-executor scoping?
**A:** Already in the schema — `executor_id` foreign key. UI filter could grow per-executor scoping later. v1 shows all incidents for the user across all their executors.

### Q: Should kernel-rejected commands also write an `audit_events` row?
**A:** Yes, in addition. `audit_events` is the global audit log for everything; incidents are user-facing. Two writes, two purposes. The existing `audit('command_dispatched')` etc. patterns already cover dispatch; add `audit('command_rejected_by_kernel')` for symmetry.

---

## Open Questions

1. **Should incidents trigger an email/push notification?** Recommend: in-app only for v1. Email opt-in for `critical` incidents in v1.1.
2. **Should the user be able to mark an incident as "false positive"?** This would help us tune the kernel allowlist. Defer to v1.2 — first need volume to know if false positives are a real pattern.
3. **Cross-executor visibility — should team/workspace owners see incidents across team executors?** Out of scope for v1 (Maestro is single-user). When workspace sharing ships, revisit.

---

## Implementation Order

1. **Migration** — add `executor_incidents` table + Realtime publication. Ship alone, verify RLS works.
2. **Type additions** — `src/types/index.ts`. Build clean.
3. **Edge function** — add `report_incident` action to `executor-api`. Test via curl.
4. **IncidentService rewrite** — replace `reportIncident` impl. Unit test that report payloads match endpoint contract.
5. **Wire to executor.ts + index.ts** — `setIncidentService` / `getIncidentService` accessor.
6. **Wire to adapters** — `approved-shell.ts`, `pty-shell.ts`. Each rejection path calls `getIncidentService()?.report(...)`.
7. **Frontend hook + SecurityPanel** — implement `useUnackIncidents` and `SecurityPanel.tsx`.
8. **TrustDrawer integration** — add Security tab/section.
9. **StatusChip dot** — wire `useUnackIncidents` for unread indicator.
10. **Live smoke** — full verification per acceptance criteria. Update `IMPLEMENTATION_PLAN_STATUS.md` and `MAESTRO_STATE.md`.

Suggested split: Sonnet does steps 1-6 (DB, edge, kernel wiring) and 10 (verification). Gemini or Sonnet does 7-9 (UI). Steps 1-6 must complete before 7-9 (UI needs the data layer working).

---

*End of SEC-04 spec.*
