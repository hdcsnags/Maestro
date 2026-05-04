import { useMaestro } from '../../context/MaestroContext';
import { AuditEvent } from '../../types';
import SecurityPanel from './SecurityPanel';

export default function TrustDrawer() {
  const { state, dispatch } = useMaestro();
  const isOpen = state.activeDrawer === 'trust';

  const mainBranchWrite = state.executionMode === 'elevated';

  return (
    <aside className={`drawer-panel drawer-right ${isOpen ? 'open' : ''}`}>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <div className="reveal-label" style={{ marginBottom: '6px' }}>Trust Rail</div>
          <h3
            className="font-syne"
            style={{ margin: 0, fontSize: '24px', fontWeight: 400, letterSpacing: '-0.03em', color: 'var(--text)' }}
          >
            Execution without clutter
          </h3>
        </div>
        <button className="keycap" onClick={() => dispatch({ type: 'CLOSE_TRANSIENT' })}>Esc</button>
      </div>

      <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, fontSize: '14px', marginBottom: '20px' }}>
        Everything here is essential once action begins. It stays offstage during
        planning so you can think clearly.
      </p>

      <div className="flex flex-col gap-3 mb-5">
        <div
          onClick={() => dispatch({ type: 'OPEN_DRAWER', payload: 'vault' })}
          style={{ cursor: 'pointer' }}
        >
          <TrustCard
            label="Vault"
            chip={`${state.providerConnections.filter(p => p.is_connected).length} keys`}
            chipAccent
          >
            Provider keys stored encrypted at rest. Click to manage keys.
          </TrustCard>
        </div>
        <TrustCard
          label="Repo Mode"
          chip={state.executionMode === 'pr_flow' ? 'PR Only' : state.executionMode === 'analyze' ? 'Analyze' : 'Elevated'}
        >
          {state.activeRepoConnection
            ? `Connected to ${state.activeRepoConnection.owner}/${state.activeRepoConnection.repo} (${state.activeRepoConnection.default_branch}). Action path: branch, patch, PR, approve, merge.`
            : 'No repository connected. Open the Vault (V) to connect GitHub.'}
        </TrustCard>
        <TrustCard label="Permissions" chip="Scoped">
          Agents can inspect broadly, but writes stay limited to approved lanes and workflows.
        </TrustCard>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        <StatCell label="Connected providers" value={String(state.providerConnections.filter(p => p.is_connected).length)} />
        <StatCell
          label="Current mode"
          value={state.executionMode === 'pr_flow' ? 'PR Flow' : state.executionMode === 'analyze' ? 'Analyze' : 'Elevated'}
        />
        <StatCell label="Write access" value={mainBranchWrite ? 'Open' : 'Locked'} color={mainBranchWrite ? 'var(--risk)' : undefined} />
        <StatCell label="Execution runs" value={String(state.executionRuns.length)} />
        <StatCell label="Audit events" value={String(state.auditEvents.length)} />
        <StatCell label="Repo" value={state.activeRepoConnection ? `${state.activeRepoConnection.owner}/${state.activeRepoConnection.repo}` : 'None'} />
      </div>

      <div className="reveal-label mb-3">Run Timeline</div>
      <AuditList events={state.auditEvents} />

      <div className="reveal-label mb-3 mt-6">Security Incidents</div>
      <SecurityPanel />
    </aside>
  );
}

function TrustCard({ label, chip, chipAccent, children }: { label: string; chip: string; chipAccent?: boolean; children: React.ReactNode }) {
  return (
    <div className="reveal-card">
      <div className="flex items-center justify-between gap-2 mb-2">
        <strong style={{ color: 'var(--text)', fontWeight: 500, fontSize: '14px' }}>{label}</strong>
        <span className={`reveal-chip ${chipAccent ? 'accent' : ''}`}>{chip}</span>
      </div>
      <div style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5 }}>{children}</div>
    </div>
  );
}

function StatCell({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="stat-block">
      <div className="reveal-label" style={{ fontSize: '9px', marginBottom: '4px' }}>{label}</div>
      <div
        style={{
          fontSize: '20px',
          fontWeight: 400,
          letterSpacing: '-0.03em',
          color: color ?? 'var(--text)',
        }}
      >
        {value}
      </div>
    </div>
  );
}

function AuditList({ events }: { events: AuditEvent[] }) {
  const display = events.slice(0, 8);

  if (display.length === 0) {
    return (
      <div className="flex items-center gap-2.5 py-2 px-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--text-dim)' }} />
        <span style={{ color: 'var(--text-dim)', fontSize: '13px' }}>Awaiting first broadcast</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {display.map((event, i) => {
        const time = new Date(event.created_at).toLocaleTimeString('en-US', { hour12: false, minute: '2-digit', second: '2-digit' });
        return (
          <div key={event.id} className="flex gap-2.5 py-1.5 relative">
            {i < display.length - 1 && (
              <div className="absolute left-1 top-5 bottom-0 w-px" style={{ background: 'rgba(255,255,255,0.06)' }} />
            )}
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                flexShrink: 0,
                marginTop: '4px',
                background: event.succeeded ? 'var(--ok)' : 'var(--risk)',
                boxShadow: `0 0 6px ${event.succeeded ? 'var(--ok)' : 'var(--risk)'}`,
              }}
            />
            <div>
              <div className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--text-dim)', marginBottom: '2px' }}>{time}</div>
              <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text)', fontWeight: 500 }}>{event.actor || event.event_type}</strong>
                {event.execution_mode && ` -- ${event.execution_mode}`}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
