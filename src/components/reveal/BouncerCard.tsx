import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Pause, Shield, ThumbsUp, XCircle } from 'lucide-react';
import type { BouncerResult } from '../../types';

const SEVERITY_META: Record<string, { label: string; countLabel: string; tone: string; border: string; bg: string }> = {
  critical_pause: {
    label: 'Critical',
    countLabel: 'critical',
    tone: 'text-signal-risk/90',
    border: 'border-signal-risk/20',
    bg: 'bg-signal-risk/8',
  },
  critical_approved: {
    label: 'Approved critical',
    countLabel: 'approved',
    tone: 'text-[#e0925a]',
    border: 'border-[#e0925a]/20',
    bg: 'bg-[#e0925a]/10',
  },
  minor: {
    label: 'Minor',
    countLabel: 'minor',
    tone: 'text-gold/90',
    border: 'border-gold/20',
    bg: 'bg-gold/8',
  },
};

export default function BouncerCard({
  result,
  loading,
  error,
  elapsedMs,
  showActions,
  onRun,
  onDecision,
}: {
  result: BouncerResult | null;
  loading: boolean;
  error: string;
  elapsedMs?: number | null;
  showActions?: boolean;
  onRun?: () => void;
  onDecision?: (decision: 'acknowledge' | 'pause' | 'approve_continue' | 'abort') => void;
}) {
  const [expandedSeverities, setExpandedSeverities] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setExpandedSeverities({});
  }, [result]);

  const counts = useMemo(() => {
    const next = { critical_pause: 0, critical_approved: 0, minor: 0 };
    result?.findings.forEach((finding) => {
      if (finding.severity in next) {
        next[finding.severity as keyof typeof next] += 1;
      }
    });
    return next;
  }, [result]);

  const groupedFindings = useMemo(() => {
    const groups: Record<string, NonNullable<typeof result>['findings']> = {
      critical_pause: [],
      critical_approved: [],
      minor: [],
    };
    result?.findings.forEach((finding) => {
      groups[finding.severity]?.push(finding);
    });
    return groups;
  }, [result]);

  const hasCritical = (counts.critical_pause ?? 0) > 0;
  const elapsedLabel = elapsedMs != null ? `${(elapsedMs / 1000).toFixed(1)}s` : null;

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${hasCritical ? 'bg-signal-risk/12 text-signal-risk/90' : 'bg-gold/10 text-gold/90'}`}>
            {loading ? <Shield size={15} className="animate-pulse" /> : <Shield size={15} />}
          </div>
          <div>
            <div className="font-mono-dm text-[10px] uppercase tracking-[0.16em] text-white/40">Bouncer review</div>
            <div className="mt-1 text-sm text-white/70">
              {result
                ? `${counts.critical_pause} critical · ${counts.minor} minor${counts.critical_approved ? ` · ${counts.critical_approved} approved` : ''}`
                : 'Run the final review pass before signing off the build.'}
            </div>
          </div>
        </div>
        {onRun && !result && (
          <button
            onClick={onRun}
            disabled={loading}
            className="reveal-pill"
            style={{ height: '36px', fontSize: '11px', padding: '0 14px', opacity: loading ? 0.6 : 1 }}
          >
            <Shield size={12} />
            {loading ? 'Reviewing…' : 'Run bouncer review'}
          </button>
        )}
      </div>

      {(result || error) && (
        <div className="mt-4 space-y-4">
          {result && (
            <>
              <div className="flex flex-wrap gap-3 text-xs text-white/50">
                {elapsedLabel && <span>{elapsedLabel}</span>}
                {result.model_used && <span>via {result.model_used}</span>}
                {result.review_source && <span>{result.review_source === 'build_tasks' ? 'code review' : result.review_source === 'github_files' ? 'paths only' : 'no files'}</span>}
              </div>
              <div className="text-sm leading-7 text-white/70">
                {result.summary}
              </div>

              <div className="space-y-3">
                {(['critical_pause', 'critical_approved', 'minor'] as const).map((severity) => {
                  const findings = groupedFindings[severity];
                  if (!findings || findings.length === 0) return null;
                  const meta = SEVERITY_META[severity];
                  const expanded = expandedSeverities[severity] === true;
                  return (
                    <div key={severity} className={`rounded-xl border ${meta.border} ${meta.bg}`}>
                      <button
                        onClick={() => setExpandedSeverities((prev) => ({ ...prev, [severity]: !expanded }))}
                        className="flex w-full items-center gap-3 px-3 py-3 text-left"
                      >
                        <span className={`font-mono-dm text-[10px] uppercase tracking-[0.14em] ${meta.tone}`}>{meta.label}</span>
                        <span className="text-xs text-white/50">{findings.length} {meta.countLabel}</span>
                        <span className="ml-auto text-white/35">{expanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</span>
                      </button>
                      {expanded && (
                        <div className="space-y-2 border-t border-white/[0.06] px-3 py-3">
                          {findings.map((finding, index) => (
                            <div key={`${finding.file}-${index}`} className="rounded-xl border border-white/[0.06] bg-black/10 px-3 py-3">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-sm text-white/80">{finding.issue}</span>
                                <span className="font-mono text-xs text-white/45">{finding.file}</span>
                              </div>
                              <div className="mt-2 text-sm text-white/55">
                                {finding.suggestion}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-signal-risk/20 bg-signal-risk/8 px-3 py-2 text-sm text-signal-risk/85">
              <AlertTriangle size={14} />
              {error}
            </div>
          )}

          {result && showActions && onDecision && (
            <div className="flex flex-wrap items-center gap-2">
              {!hasCritical && (
                <button
                  onClick={() => onDecision('approve_continue')}
                  className="reveal-pill"
                  style={{ height: '38px', fontSize: '12px', padding: '0 16px', background: 'var(--ok)', color: 'var(--void)', borderColor: 'transparent', fontWeight: 600 }}
                >
                  <CheckCircle2 size={12} />
                  Approve
                </button>
              )}
              <button
                onClick={() => onDecision('acknowledge')}
                className="reveal-pill"
                style={{ height: '38px', fontSize: '12px', padding: '0 16px' }}
              >
                <ThumbsUp size={12} />
                Acknowledge minor
              </button>
              {hasCritical && (
                <button
                  onClick={() => onDecision('pause')}
                  className="reveal-pill"
                  style={{ height: '38px', fontSize: '12px', padding: '0 16px', borderColor: 'rgba(255,255,255,0.12)' }}
                >
                  <Pause size={12} />
                  Pause
                </button>
              )}
              <button
                onClick={() => onDecision('abort')}
                className="reveal-pill"
                style={{ height: '38px', fontSize: '12px', padding: '0 16px', color: 'var(--risk)', borderColor: 'rgba(224,90,90,0.2)', background: 'transparent' }}
              >
                <XCircle size={12} />
                Abort
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
