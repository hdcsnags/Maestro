import { useState } from 'react';
import { ShieldAlert, Check, X, GitBranch, FileCode2 } from 'lucide-react';
import { ApprovalRequest } from '../../types';

interface Props {
  approval: ApprovalRequest;
  repoOwner: string;
  repoName: string;
  onApprove: (expiresInMinutes: number | null) => Promise<void>;
  onDeny: () => Promise<void>;
  busy: boolean;
}

export default function ApprovalModal({ approval, repoOwner, repoName, onApprove, onDeny, busy }: Props) {
  const [reuse, setReuse] = useState(false);

  const files = approval.files_affected ?? [];
  const paths = approval.scope_paths ?? [];
  const linesAdded = approval.lines_added ?? 0;
  const linesRemoved = approval.lines_removed ?? 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(8px)' }}
    >
      <div
        style={{
          width: 'min(560px, calc(100vw - 40px))',
          maxHeight: 'calc(100vh - 80px)',
          overflow: 'auto',
          borderRadius: '20px',
          border: '1px solid rgba(224,169,74,0.28)',
          background: 'linear-gradient(180deg, rgba(28,24,20,0.98), rgba(20,18,16,0.98))',
          boxShadow: '0 40px 120px rgba(0,0,0,0.6)',
          padding: '22px 24px',
        }}
      >
        <div className="flex items-center gap-2 mb-4">
          <ShieldAlert size={16} style={{ color: 'var(--gold)' }} />
          <h2 className="font-mono-dm" style={{ fontSize: '11px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)' }}>
            Elevated Execution — Approval Required
          </h2>
        </div>

        <div style={{ fontSize: '14px', color: 'var(--text)', marginBottom: '6px' }}>
          <strong>{approval.agent_name || 'Agent'}</strong> wants to {approval.action_type || 'apply changes'}
        </div>
        {approval.description && (
          <div style={{ fontSize: '12px', color: 'var(--text-dim)', marginBottom: '14px', lineHeight: 1.5 }}>
            {approval.description}
          </div>
        )}

        <div style={{ display: 'grid', gap: '10px', marginBottom: '16px' }}>
          <Row icon={<GitBranch size={12} />} label="Branch">
            <span className="font-mono-dm" style={{ fontSize: '11px' }}>
              {repoOwner}/{repoName} · {approval.branch_name || '(default)'}
            </span>
          </Row>

          {paths.length > 0 && (
            <Row icon={<FileCode2 size={12} />} label="Scope">
              <div className="flex flex-wrap gap-1">
                {paths.map(p => (
                  <span
                    key={p}
                    className="font-mono-dm"
                    style={{
                      fontSize: '10px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.08)',
                    }}
                  >
                    {p}
                  </span>
                ))}
              </div>
            </Row>
          )}

          {files.length > 0 && (
            <Row icon={<FileCode2 size={12} />} label={`Files (${files.length})`}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '140px', overflow: 'auto' }}>
                {files.map(f => (
                  <div key={f.path} className="flex items-center justify-between gap-2 font-mono-dm" style={{ fontSize: '10px' }}>
                    <span style={{ color: 'var(--text)' }}>{f.path}</span>
                    <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>
                      {f.lines_added ? <span style={{ color: 'var(--ok)' }}>+{f.lines_added}</span> : null}
                      {f.lines_removed ? <span style={{ color: 'var(--risk)', marginLeft: '4px' }}>−{f.lines_removed}</span> : null}
                    </span>
                  </div>
                ))}
                {(linesAdded > 0 || linesRemoved > 0) && (
                  <div className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '4px', paddingTop: '4px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    Total: <span style={{ color: 'var(--ok)' }}>+{linesAdded}</span> <span style={{ color: 'var(--risk)' }}>−{linesRemoved}</span>
                  </div>
                )}
              </div>
            </Row>
          )}
        </div>

        <label className="flex items-center gap-2 cursor-pointer mb-4" style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
          <input
            type="checkbox"
            checked={reuse}
            onChange={e => setReuse(e.target.checked)}
            disabled={busy}
            style={{ accentColor: 'var(--gold)' }}
          />
          <span>
            Approve for 10 minutes <span style={{ opacity: 0.6 }}>(reuse only for this exact repo + branch + scope)</span>
          </span>
        </label>

        <div className="flex items-center gap-2 justify-end">
          <button
            onClick={onDeny}
            disabled={busy}
            className="flex items-center gap-1.5"
            style={{
              height: '36px',
              padding: '0 16px',
              borderRadius: '999px',
              border: '1px solid rgba(255,255,255,0.1)',
              background: 'transparent',
              color: 'var(--text-dim)',
              fontSize: '12px',
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            <X size={13} /> Deny
          </button>
          <button
            onClick={() => onApprove(reuse ? 10 : null)}
            disabled={busy}
            className="flex items-center gap-1.5"
            style={{
              height: '36px',
              padding: '0 18px',
              borderRadius: '999px',
              border: 'none',
              background: busy
                ? 'rgba(224,169,74,0.25)'
                : 'linear-gradient(180deg, rgba(224,169,74,0.95), rgba(201,145,58,0.95))',
              color: '#1a1410',
              fontSize: '12px',
              fontWeight: 500,
              cursor: busy ? 'default' : 'pointer',
            }}
          >
            <Check size={13} /> {busy ? 'Approving…' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '88px 1fr', alignItems: 'start', gap: '10px' }}>
      <div className="flex items-center gap-1.5 font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-dim)', paddingTop: '2px' }}>
        {icon} {label}
      </div>
      <div>{children}</div>
    </div>
  );
}
