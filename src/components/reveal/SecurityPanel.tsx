import { useState } from 'react';
import { ShieldAlert, ShieldCheck, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useUnackIncidents } from '../../hooks/useUnackIncidents';
import type { ExecutorIncident, IncidentSeverity } from '../../types';

const SEVERITY_COLOR: Record<IncidentSeverity, string> = {
  low: 'var(--text-muted)',
  medium: 'var(--signal-warn, #f5a623)',
  high: 'var(--signal-warn, #f5a623)',
  critical: 'var(--risk)',
};

const SEVERITY_DOT: Record<IncidentSeverity, string> = {
  low: 'bg-white/25',
  medium: 'bg-yellow-400/70',
  high: 'bg-orange-400/80',
  critical: 'bg-red-500',
};

const CATEGORY_LABEL: Record<string, string> = {
  kernel_violation: 'Kernel Violation',
  security_violation: 'Security Violation',
  auth_violation: 'Auth Violation',
  scope_violation: 'Scope Violation',
  system_error: 'System Error',
  manual: 'Manual',
};

type FilterSeverity = 'all' | IncidentSeverity;

export default function SecurityPanel() {
  const { incidents, unackCritical } = useUnackIncidents();
  const [filter, setFilter] = useState<FilterSeverity>('all');
  const [expanded, setExpanded] = useState<string | null>(null);

  const visible = filter === 'all' ? incidents : incidents.filter((i) => i.severity === filter);

  async function acknowledge(id: string) {
    await (supabase
      .from('executor_incidents') as ReturnType<typeof supabase.from>)
      .update({ acknowledged_at: new Date().toISOString() } as Record<string, string>)
      .eq('id', id);
  }

  if (incidents.length === 0) {
    return (
      <div className="flex items-center gap-2.5 py-2 px-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)' }}>
        <ShieldCheck size={14} style={{ color: 'var(--signal-ok, #4caf50)', flexShrink: 0 }} />
        <span style={{ color: 'var(--text-dim)', fontSize: '13px' }}>No incidents in the last 24 hours</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Summary + filters */}
      <div className="flex items-center justify-between gap-2 mb-1">
        {unackCritical > 0 ? (
          <div className="flex items-center gap-1.5">
            <ShieldAlert size={13} style={{ color: 'var(--risk)' }} />
            <span style={{ fontSize: '12px', color: 'var(--risk)', fontWeight: 500 }}>
              {unackCritical} unacknowledged critical
            </span>
          </div>
        ) : (
          <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
            {incidents.length} incident{incidents.length !== 1 ? 's' : ''} (24h)
          </span>
        )}
        <div className="flex gap-1">
          {(['all', 'critical', 'high', 'medium', 'low'] as FilterSeverity[]).map((s) => (
            <button
              key={s}
              type="button"
              className="reveal-chip"
              onClick={() => setFilter(s)}
              style={filter === s ? { borderColor: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', cursor: 'pointer', fontSize: '10px' } : { cursor: 'pointer', fontSize: '10px' }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Incident list */}
      {visible.length === 0 ? (
        <div style={{ color: 'var(--text-dim)', fontSize: '13px' }}>No {filter} incidents.</div>
      ) : (
        visible.map((inc) => (
          <IncidentRow
            key={inc.id}
            incident={inc}
            expanded={expanded === inc.id}
            onToggle={() => setExpanded(expanded === inc.id ? null : inc.id)}
            onAcknowledge={() => acknowledge(inc.id)}
          />
        ))
      )}
    </div>
  );
}

function IncidentRow({
  incident,
  expanded,
  onToggle,
  onAcknowledge,
}: {
  incident: ExecutorIncident;
  expanded: boolean;
  onToggle: () => void;
  onAcknowledge: () => void;
}) {
  const time = new Date(incident.created_at).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const isAcked = !!incident.acknowledged_at;

  return (
    <div
      className="reveal-card"
      style={{
        padding: '10px 12px',
        opacity: isAcked ? 0.55 : 1,
        border: !isAcked && incident.severity === 'critical' ? '1px solid rgba(239,68,68,0.35)' : undefined,
      }}
    >
      <div className="flex items-start gap-2.5">
        <div
          className={`${SEVERITY_DOT[incident.severity]} mt-1.5`}
          style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0 }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <span style={{ fontSize: '13px', fontWeight: 500, color: SEVERITY_COLOR[incident.severity], whiteSpace: 'nowrap' }}>
                {incident.severity.toUpperCase()}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                {CATEGORY_LABEL[incident.category] ?? incident.category}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>{time}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {!isAcked && (
                <button
                  type="button"
                  className="reveal-chip"
                  onClick={(e) => { e.stopPropagation(); onAcknowledge(); }}
                  style={{ fontSize: '10px', cursor: 'pointer' }}
                >
                  Ack
                </button>
              )}
              <button type="button" onClick={onToggle} style={{ color: 'var(--text-dim)', cursor: 'pointer', lineHeight: 1 }}>
                {expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              </button>
            </div>
          </div>
          <div style={{ fontSize: '13px', color: 'var(--text)', marginTop: 3 }}>{incident.title}</div>
          {expanded && (
            <div className="mt-2 flex flex-col gap-1">
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>{incident.message}</div>
              {Object.keys(incident.metadata).length > 0 && (
                <pre className="reveal-codeblock" style={{ fontSize: '11px', marginTop: 6, overflowX: 'auto' }}>
                  {JSON.stringify(incident.metadata, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
