import { useState, useEffect, useCallback } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { supabase } from '../../lib/supabase';
import {
  CheckCircle2, Download, ExternalLink, GitBranch,
  Plus, Wrench, RotateCcw, FileText, Loader2,
  Shield, X,
} from 'lucide-react';

/* ── Types ─────────────────────────────────────────────────── */

interface BuildReport {
  id: string;
  session_id: string;
  files_written: string[];
  files_skipped: { path: string; reason: string }[];
  collisions: { path: string; agents: string[] }[];
  handoffs_pending: { from_agent: string; to_lane: string; path: string; reason: string }[];
  bouncer_summary: { findings: BouncerFinding[]; overall_severity: string; summary: string } | null;
  pr_links: string[];
  backup_branch: string | null;
  architect_md_updated: boolean;
  created_at: string;
}

interface BouncerFinding {
  file: string;
  issue: string;
  severity: 'minor' | 'critical_pause' | 'critical_approved';
  suggestion: string;
}

/* ── Severity styling ──────────────────────────────────────── */

const SEV_STYLE: Record<string, { color: string; label: string }> = {
  minor: { color: '#d4a843', label: 'minor' },
  critical_pause: { color: '#e05a5a', label: 'critical' },
  critical_approved: { color: '#e0925a', label: 'approved' },
};

/* ── Component ─────────────────────────────────────────────── */

export default function BuildReport() {
  const { state, dispatch } = useMaestro();
  const session = state.activeSession;
  const [report, setReport] = useState<BuildReport | null>(null);
  const [loading, setLoading] = useState(true);

  // Only render when session is complete
  const isComplete = session?.current_phase === 'complete';

  // Fetch build report
  useEffect(() => {
    if (!isComplete || !session) { setLoading(false); return; }

    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('build_reports')
        .select('*')
        .eq('session_id', session.id)
        .order('created_at', { ascending: false })
        .limit(1);

      if (data?.[0]) {
        const row = data[0] as Record<string, unknown>;
        setReport({
          id: row.id as string,
          session_id: row.session_id as string,
          files_written: (row.files_written as string[]) ?? [],
          files_skipped: (row.files_skipped as BuildReport['files_skipped']) ?? [],
          collisions: (row.collisions as BuildReport['collisions']) ?? [],
          handoffs_pending: (row.handoffs_pending as BuildReport['handoffs_pending']) ?? [],
          bouncer_summary: row.bouncer_summary as BuildReport['bouncer_summary'],
          pr_links: (row.pr_links as string[]) ?? [],
          backup_branch: (row.backup_branch as string) ?? null,
          architect_md_updated: (row.architect_md_updated as boolean) ?? false,
          created_at: row.created_at as string,
        });
      }
      setLoading(false);
    })();
  }, [isComplete, session]);

  // Download build report as markdown
  const handleDownloadReport = useCallback(() => {
    if (!report || !session) return;

    const lines: string[] = [
      `# Build Report — ${session.title}`,
      '',
      `**Completed:** ${new Date(report.created_at).toLocaleString()}`,
      '',
      '---',
      '',
      '## Summary',
      '',
      `| Metric | Count |`,
      `|--------|-------|`,
      `| Files Written | ${report.files_written.length} |`,
      `| Files Skipped | ${report.files_skipped.length} |`,
      `| Collisions Blocked | ${report.collisions.length} |`,
      `| Handoffs | ${report.handoffs_pending.length} |`,
    ];

    if (report.bouncer_summary?.findings) {
      const minor = report.bouncer_summary.findings.filter(f => f.severity === 'minor').length;
      const critical = report.bouncer_summary.findings.filter(f => f.severity !== 'minor').length;
      lines.push(`| Bouncer Findings | ${minor} minor, ${critical} critical |`);
    }

    lines.push('', '## Files Written', '');
    if (report.files_written.length === 0) {
      lines.push('_No files written._');
    } else {
      report.files_written.forEach(f => lines.push(`- \`${f}\``));
    }

    lines.push('', '## Files Skipped', '');
    if (report.files_skipped.length === 0) {
      lines.push('_None._');
    } else {
      report.files_skipped.forEach(f => lines.push(`- \`${f.path}\` — ${f.reason}`));
    }

    lines.push('', '## Collisions', '');
    if (report.collisions.length === 0) {
      lines.push('_No collisions detected._');
    } else {
      report.collisions.forEach(c => lines.push(`- \`${c.path}\` — agents: ${c.agents.join(', ')}`));
    }

    lines.push('', '## Handoffs', '');
    if (report.handoffs_pending.length === 0) {
      lines.push('_No pending handoffs._');
    } else {
      report.handoffs_pending.forEach(h =>
        lines.push(`- **${h.from_agent}** → \`${h.path}\` (${h.reason})`)
      );
    }

    if (report.bouncer_summary) {
      lines.push('', '## Bouncer Findings', '');
      if (report.bouncer_summary.findings.length === 0) {
        lines.push('_No findings._');
      } else {
        report.bouncer_summary.findings.forEach(f =>
          lines.push(`- **[${f.severity}]** \`${f.file}\` — ${f.issue}`, `  - Suggestion: ${f.suggestion}`)
        );
      }
    }

    lines.push('', '## Pull Requests', '');
    if (report.pr_links.length === 0) {
      lines.push('_No PRs created._');
    } else {
      report.pr_links.forEach(url => lines.push(`- [${url.split('/').slice(-2).join(' #')}](${url})`));
    }

    lines.push('', '## Backup Branch', '');
    lines.push(report.backup_branch ? `\`${report.backup_branch}\`` : '_No backup branch._');

    const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `build-report-${session.title.replace(/\s+/g, '-').toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }, [report, session]);

  // Download ARCHITECT.md
  const handleDownloadArchitect = useCallback(() => {
    if (!session?.architect_md) return;
    const blob = new Blob([session.architect_md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ARCHITECT.md';
    a.click();
    URL.revokeObjectURL(url);
  }, [session]);

  // "What next" actions
  const handleAddFeature = useCallback(async () => {
    if (!session) return;
    await supabase
      .from('sessions')
      .update({ current_phase: 'analysis' } as never)
      .eq('id', session.id);
    dispatch({ type: 'SHOW_TOAST', payload: 'Starting new analysis round' });
  }, [session, dispatch]);

  const handleFixFindings = useCallback(async () => {
    if (!session) return;
    await supabase
      .from('sessions')
      .update({ current_phase: 'build' } as never)
      .eq('id', session.id);
    dispatch({ type: 'SHOW_TOAST', payload: 'Returning to build — bouncer findings as context' });
  }, [session, dispatch]);

  const handleNewSession = useCallback(() => {
    dispatch({ type: 'SHOW_TOAST', payload: 'Create a new session from the sidebar' });
  }, [dispatch]);

  // Don't render if not complete or no report
  if (!isComplete) return null;

  if (loading) {
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 80,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(8,8,12,0.92)', backdropFilter: 'blur(20px)',
      }}>
        <Loader2 size={28} className="animate-spin" style={{ color: 'var(--gold)' }} />
      </div>
    );
  }

  if (!report) return null;

  // Aggregate bouncer counts
  const findings = report.bouncer_summary?.findings ?? [];
  const minorCount = findings.filter(f => f.severity === 'minor').length;
  const criticalCount = findings.filter(f => f.severity !== 'minor').length;
  const completedDate = new Date(report.created_at);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 80,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(8,8,12,0.92)', backdropFilter: 'blur(20px)',
    }}>
      <div style={{
        width: '640px', maxHeight: '90vh',
        borderRadius: '24px', overflow: 'hidden',
        border: '1px solid rgba(78,187,127,0.15)',
        background: 'rgba(18,18,24,0.95)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* ── Header ───────────────────────────────────── */}
        <div style={{
          padding: '32px 32px 0',
          background: 'linear-gradient(180deg, rgba(78,187,127,0.06) 0%, transparent 100%)',
        }}>
          <div className="flex items-center justify-between" style={{ marginBottom: '20px' }}>
            <div className="flex items-center gap-3">
              <CheckCircle2 size={24} style={{ color: 'var(--ok)' }} />
              <span className="font-mono-dm" style={{
                fontSize: '11px', letterSpacing: '0.22em',
                textTransform: 'uppercase', color: 'var(--ok)', fontWeight: 500,
              }}>
                Build Complete
              </span>
            </div>
            <button
              onClick={() => {
                // Allow dismissing — re-show by navigating back to complete phase
                if (session) {
                  supabase.from('sessions').update({ current_phase: 'bouncer' } as never).eq('id', session.id);
                }
              }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-dim)', padding: '4px',
              }}
              title="Dismiss report"
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <h2 className="font-syne" style={{
              fontSize: '18px', fontWeight: 600,
              color: 'var(--text)', margin: 0, lineHeight: 1.3,
            }}>
              {session?.title ?? 'Session'}
            </h2>
            <span className="font-mono-dm" style={{
              fontSize: '10px', color: 'var(--text-dim)',
              letterSpacing: '0.08em', marginTop: '4px', display: 'block',
            }}>
              Completed {completedDate.toLocaleDateString('en-US', {
                year: 'numeric', month: 'long', day: 'numeric',
              })} at {completedDate.toLocaleTimeString('en-US', {
                hour: 'numeric', minute: '2-digit', hour12: true,
              })}
            </span>
          </div>
        </div>

        {/* ── Scrollable body ──────────────────────────── */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '24px 32px 32px',
        }}>
          {/* Stats grid */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '8px', marginBottom: '28px',
          }}>
            <StatBox label="Files Written" value={report.files_written.length} color="var(--ok)" />
            <StatBox label="Files Skipped" value={report.files_skipped.length} color="var(--gold)"
              sub={report.files_skipped.length > 0 ? report.files_skipped.map(f => f.reason).filter((v, i, a) => a.indexOf(v) === i).join(', ') : undefined}
            />
            <StatBox label="Collisions" value={report.collisions.length} color={report.collisions.length > 0 ? 'var(--risk)' : 'var(--text-dim)'} />
            <StatBox label="Handoffs" value={report.handoffs_pending.length} color={report.handoffs_pending.length > 0 ? 'var(--gold)' : 'var(--text-dim)'} />
            <StatBox
              label="Bouncer"
              value={findings.length}
              color={criticalCount > 0 ? 'var(--risk)' : minorCount > 0 ? 'var(--gold)' : 'var(--ok)'}
              sub={findings.length > 0 ? `${minorCount} minor, ${criticalCount} critical` : 'clean'}
            />
            {report.architect_md_updated && (
              <StatBox label="Architect" value="✓" color="var(--ok)" sub="ARCHITECT.md updated" />
            )}
          </div>

          {/* Pull Requests */}
          {report.pr_links.length > 0 && (
            <section style={{ marginBottom: '24px' }}>
              <SectionLabel icon={<GitBranch size={12} />} label="Pull Requests" />
              <div className="flex flex-col gap-2">
                {report.pr_links.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                    style={{
                      fontSize: '12px', color: 'var(--gold)', textDecoration: 'none',
                      padding: '8px 14px', borderRadius: '10px',
                      background: 'rgba(201,168,76,0.06)',
                      border: '1px solid rgba(201,168,76,0.12)',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.12)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'rgba(201,168,76,0.06)')}
                  >
                    <GitBranch size={12} />
                    <span style={{ flex: 1 }}>{url.split('/').slice(-2).join(' #')}</span>
                    <ExternalLink size={10} style={{ opacity: 0.6 }} />
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* Backup branch */}
          {report.backup_branch && (
            <section style={{ marginBottom: '24px' }}>
              <SectionLabel icon={<RotateCcw size={12} />} label="Backup Branch" />
              <div className="flex items-center gap-2" style={{
                fontSize: '11px', padding: '8px 14px', borderRadius: '10px',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
              }}>
                <span className="font-mono-dm" style={{ color: 'var(--text-muted)' }}>
                  {report.backup_branch}
                </span>
              </div>
            </section>
          )}

          {/* Bouncer findings summary */}
          {findings.length > 0 && (
            <section style={{ marginBottom: '24px' }}>
              <SectionLabel icon={<Shield size={12} />} label="Bouncer Findings" />
              <div className="flex flex-col gap-2">
                {findings.map((f, i) => {
                  const sev = SEV_STYLE[f.severity] ?? SEV_STYLE.minor;
                  return (
                    <div key={i} style={{
                      padding: '10px 14px', borderRadius: '10px',
                      background: 'rgba(255,255,255,0.02)',
                      border: '1px solid rgba(255,255,255,0.05)',
                    }}>
                      <div className="flex items-center gap-2" style={{ marginBottom: '4px' }}>
                        <span className="font-mono-dm" style={{
                          fontSize: '9px', letterSpacing: '0.1em',
                          textTransform: 'uppercase', color: sev.color,
                        }}>
                          {sev.label}
                        </span>
                        <span className="font-mono-dm" style={{
                          fontSize: '10px', color: 'var(--text-dim)',
                        }}>
                          {f.file}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        {f.issue}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* Download buttons */}
          <div className="flex items-center gap-3" style={{ marginBottom: '28px' }}>
            {session?.architect_md && (
              <button
                className="reveal-pill"
                onClick={handleDownloadArchitect}
                style={{
                  height: '36px', fontSize: '11px', padding: '0 16px',
                  background: 'rgba(255,255,255,0.04)',
                  borderColor: 'rgba(255,255,255,0.08)',
                }}
              >
                <FileText size={13} />
                Download ARCHITECT.md
              </button>
            )}
            <button
              className="reveal-pill"
              onClick={handleDownloadReport}
              style={{
                height: '36px', fontSize: '11px', padding: '0 16px',
                background: 'rgba(255,255,255,0.04)',
                borderColor: 'rgba(255,255,255,0.08)',
              }}
            >
              <Download size={13} />
              Download Build Report
            </button>
          </div>

          {/* ── What next ──────────────────────────────── */}
          <div style={{
            borderTop: '1px solid rgba(255,255,255,0.06)',
            paddingTop: '24px',
          }}>
            <span className="font-mono-dm" style={{
              fontSize: '10px', letterSpacing: '0.18em',
              textTransform: 'uppercase', color: 'var(--text-dim)',
              display: 'block', marginBottom: '14px',
            }}>
              What next?
            </span>

            <div className="flex items-center gap-3 flex-wrap">
              <button
                className="reveal-pill"
                onClick={handleAddFeature}
                style={{
                  height: '40px', fontSize: '12px', padding: '0 20px',
                  background: 'rgba(201,168,76,0.08)',
                  borderColor: 'rgba(201,168,76,0.2)',
                  color: 'var(--text)', fontWeight: 500,
                }}
              >
                <Plus size={14} />
                Add a feature
              </button>

              {findings.length > 0 && (
                <button
                  className="reveal-pill"
                  onClick={handleFixFindings}
                  style={{
                    height: '40px', fontSize: '12px', padding: '0 20px',
                    background: 'rgba(224,123,90,0.08)',
                    borderColor: 'rgba(224,123,90,0.2)',
                    color: 'var(--text)',
                  }}
                >
                  <Wrench size={14} />
                  Fix bouncer findings
                </button>
              )}

              <button
                className="reveal-pill"
                onClick={handleNewSession}
                style={{
                  height: '40px', fontSize: '12px', padding: '0 20px',
                  borderColor: 'rgba(255,255,255,0.08)',
                  color: 'var(--text-muted)',
                }}
              >
                <RotateCcw size={14} />
                Start new session
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────── */

function StatBox({ label, value, color, sub }: {
  label: string;
  value: number | string;
  color: string;
  sub?: string;
}) {
  return (
    <div style={{
      padding: '14px', borderRadius: '12px',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
      textAlign: 'center',
    }}>
      <div className="font-mono-dm" style={{ fontSize: '22px', fontWeight: 600, color, marginBottom: '4px' }}>
        {value}
      </div>
      <div className="font-mono-dm" style={{
        fontSize: '8px', letterSpacing: '0.15em',
        textTransform: 'uppercase', color: 'var(--text-dim)',
      }}>
        {label}
      </div>
      {sub && (
        <div className="font-mono-dm" style={{
          fontSize: '8px', color: 'var(--text-dim)',
          marginTop: '3px', opacity: 0.7,
        }}>
          {sub}
        </div>
      )}
    </div>
  );
}

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2" style={{
      marginBottom: '10px',
    }}>
      <span style={{ color: 'var(--text-dim)' }}>{icon}</span>
      <span className="font-mono-dm" style={{
        fontSize: '9px', letterSpacing: '0.18em',
        textTransform: 'uppercase', color: 'var(--text-dim)',
      }}>
        {label}
      </span>
    </div>
  );
}
