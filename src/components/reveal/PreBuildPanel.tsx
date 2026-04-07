import { useState, useCallback } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { supabase } from '../../lib/supabase';
import { IntakeSummary } from '../../types';
import {
  Hammer, GitBranch, Database, ScanSearch, FileCode2,
  ChevronDown, ChevronUp, Loader2, Check, AlertTriangle, Copy,
} from 'lucide-react';
import RepoSection from './RepoSection';

type ProjectType = 'new' | 'existing';

const COMPLEXITY_COLOR: Record<string, string> = {
  low: 'var(--ok)',
  medium: 'var(--gold)',
  high: 'var(--risk)',
};

export default function PreBuildPanel() {
  const { state, dispatch } = useMaestro();
  const isOpen = state.activeDrawer === 'pre-build';

  const [projectType, setProjectType] = useState<ProjectType>(
    state.activeSession?.project_type ?? 'new',
  );
  const [supabaseExpanded, setSupabaseExpanded] = useState(false);

  // B6 intake state
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<IntakeSummary | null>(
    (state.activeSession?.build_spec?.intake_summary as IntakeSummary) ?? null,
  );
  const [scanError, setScanError] = useState('');

  // B7 architect state
  const [generating, setGenerating] = useState(false);
  const [architectMd, setArchitectMd] = useState<string | null>(
    state.activeSession?.architect_md ?? null,
  );
  const [architectError, setArchitectError] = useState('');
  const [copied, setCopied] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? '';
  }, []);

  const hasRepo = !!state.activeRepoConnection;
  const hasSession = !!state.activeSession;
  const canScan = hasSession && hasRepo && projectType === 'existing';
  const canGenerate = hasSession;

  /* ── B6: Intake scan ─────────────────────────────────────── */
  const handleScan = useCallback(async () => {
    if (!state.activeSession || !state.activeRepoConnection) return;
    setScanning(true);
    setScanError('');
    setScanResult(null);

    try {
      const token = await getToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/intake`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: state.activeSession.id,
          repo_connection_id: state.activeRepoConnection.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const code = data.error ?? '';
        if (code === 'ANTHROPIC_KEY_MISSING') {
          throw new Error('Add an Anthropic API key in the Vault first.');
        }
        throw new Error(data.message || `Scan failed (${res.status})`);
      }

      setScanResult(data.intake_summary as IntakeSummary);

      // Refresh session in context with updated build_spec
      if (state.activeSession) {
        dispatch({
          type: 'SET_ACTIVE_SESSION',
          payload: {
            ...state.activeSession,
            build_spec: {
              ...(state.activeSession.build_spec ?? {}),
              intake_summary: data.intake_summary,
            },
          },
        });
      }
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  }, [state.activeSession, state.activeRepoConnection, getToken, supabaseUrl, dispatch]);

  /* ── B7: Architect generation ────────────────────────────── */
  const handleGenerate = useCallback(async () => {
    if (!state.activeSession) return;
    setGenerating(true);
    setArchitectError('');
    setArchitectMd(null);

    try {
      const token = await getToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/architect`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: state.activeSession.id,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        const code = data.error ?? '';
        if (code === 'ANTHROPIC_KEY_MISSING') {
          throw new Error('Add an Anthropic API key in the Vault first.');
        }
        throw new Error(data.message || `Generation failed (${res.status})`);
      }

      setArchitectMd(data.architect_md as string);

      // Refresh session in context
      if (state.activeSession) {
        dispatch({
          type: 'SET_ACTIVE_SESSION',
          payload: { ...state.activeSession, architect_md: data.architect_md },
        });
      }
    } catch (err) {
      setArchitectError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }, [state.activeSession, getToken, supabaseUrl, dispatch]);

  const handleCopyArchitect = useCallback(() => {
    if (!architectMd) return;
    navigator.clipboard.writeText(architectMd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [architectMd]);

  return (
    <aside className={`drawer-panel drawer-right ${isOpen ? 'open' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <div className="reveal-label" style={{ marginBottom: '6px' }}>Pre-Build</div>
          <h3
            className="font-syne"
            style={{
              margin: 0,
              fontSize: '24px',
              fontWeight: 400,
              letterSpacing: '-0.03em',
              color: 'var(--text)',
            }}
          >
            Set up your build
          </h3>
        </div>
        <button className="keycap" onClick={() => dispatch({ type: 'CLOSE_TRANSIENT' })}>
          Esc
        </button>
      </div>

      <p
        className="font-mono-dm"
        style={{
          fontSize: '11px',
          lineHeight: 1.6,
          color: 'var(--text-muted)',
          marginBottom: '24px',
        }}
      >
        Configure your project before agents begin building. Connect a repo,
        set infrastructure, and generate a scaffold when ready.
      </p>

      {/* ── Project type toggle ────────────────────────────── */}
      <div className="reveal-label mb-3">Project type</div>
      <div className="flex gap-2 mb-6">
        {(['new', 'existing'] as const).map(t => {
          const active = projectType === t;
          return (
            <button
              key={t}
              onClick={() => setProjectType(t)}
              className="font-mono-dm"
              style={{
                flex: 1,
                height: '42px',
                borderRadius: '12px',
                border: `1px solid ${active ? 'rgba(201,168,76,0.35)' : 'var(--border)'}`,
                background: active ? 'rgba(201,168,76,0.08)' : 'transparent',
                color: active ? 'var(--gold)' : 'var(--text-dim)',
                fontSize: '11px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase' as const,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
              }}
            >
              {t === 'new' ? <FileCode2 size={13} /> : <GitBranch size={13} />}
              {t === 'new' ? 'New app' : 'Existing app'}
            </button>
          );
        })}
      </div>

      {projectType === 'existing' && (
        <div
          className="font-mono-dm"
          style={{
            fontSize: '10px',
            padding: '10px 14px',
            marginBottom: '16px',
            borderRadius: '10px',
            background: 'rgba(78,187,127,0.05)',
            border: '1px solid rgba(78,187,127,0.15)',
            color: 'var(--ok)',
            lineHeight: 1.5,
          }}
        >
          Agents will scan the existing repo to build context before writing code.
        </div>
      )}

      {/* ── Repo connection ─────────────────────────────────── */}
      <div className="reveal-label mb-3">
        <div className="flex items-center gap-2">
          <GitBranch size={12} />
          Repository
        </div>
      </div>
      <div style={{ marginBottom: '20px' }}>
        <RepoSection />
      </div>

      {/* ── Supabase (collapsible) ──────────────────────────── */}
      <button
        onClick={() => setSupabaseExpanded(!supabaseExpanded)}
        className="flex items-center gap-2 w-full mb-3"
        style={{
          padding: '0',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-dim)',
        }}
      >
        <div className="reveal-label flex items-center gap-2" style={{ margin: 0 }}>
          <Database size={12} />
          Infrastructure
        </div>
        {supabaseExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
      </button>

      {supabaseExpanded && (
        <div className="reveal-card" style={{ marginBottom: '20px' }}>
          <div className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '10px' }}>
            Per-project Supabase credentials for edge functions and database access.
          </div>
          <div className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="Project URL (https://xxx.supabase.co)"
              disabled
              style={{
                height: '34px', padding: '0 12px', borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.02)',
                color: 'var(--text-dim)', fontSize: '12px', outline: 'none',
                width: '100%', opacity: 0.5,
              }}
            />
            <input
              type="password"
              placeholder="Service Role Key"
              disabled
              style={{
                height: '34px', padding: '0 12px', borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.02)',
                color: 'var(--text-dim)', fontSize: '12px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                outline: 'none', width: '100%', opacity: 0.5,
              }}
            />
            <div className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--text-dim)', opacity: 0.6, padding: '4px 0' }}>
              Per-project credentials — coming in a future sprint.
            </div>
          </div>
        </div>
      )}

      {/* ── Build actions ───────────────────────────────────── */}
      <div className="reveal-label mb-3" style={{ marginTop: '4px' }}>
        <div className="flex items-center gap-2">
          <Hammer size={12} />
          Build actions
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {/* ── B6: Scan repository ─────────────────────────── */}
        <button
          disabled={!canScan || scanning}
          onClick={handleScan}
          className="font-mono-dm flex items-center gap-3"
          title={
            !hasSession ? 'No active session'
            : !hasRepo ? 'Connect a repository first'
            : projectType !== 'existing' ? 'Switch to "Existing app" to scan'
            : scanning ? 'Scanning…'
            : scanResult ? 'Re-scan repository'
            : 'Scan repository for context'
          }
          style={{
            width: '100%',
            height: '48px',
            borderRadius: '14px',
            border: `1px solid ${scanResult ? 'rgba(78,187,127,0.25)' : 'var(--border)'}`,
            background: scanResult ? 'rgba(78,187,127,0.04)' : 'rgba(255,255,255,0.02)',
            color: canScan ? (scanResult ? 'var(--ok)' : 'var(--text)') : 'var(--text-dim)',
            fontSize: '11px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            cursor: canScan && !scanning ? 'pointer' : 'not-allowed',
            opacity: canScan ? 1 : 0.4,
            padding: '0 16px',
            transition: 'all 0.2s ease',
          }}
        >
          {scanning ? <Loader2 size={16} className="animate-spin" /> : scanResult ? <Check size={16} /> : <ScanSearch size={16} />}
          <div className="flex flex-col items-start">
            <span>{scanning ? 'Scanning…' : scanResult ? 'Scan complete' : 'Scan repository'}</span>
            <span style={{ fontSize: '8px', letterSpacing: '0.05em', opacity: 0.7, textTransform: 'none' }}>
              {scanning ? 'Agents reading the codebase…' : scanResult ? 'Click to re-scan' : 'Agents read the codebase for context'}
            </span>
          </div>
        </button>

        {scanError && (
          <div
            className="font-mono-dm flex items-center gap-2"
            style={{
              fontSize: '10px', padding: '8px 12px', borderRadius: '10px',
              background: 'rgba(224,90,90,0.06)', border: '1px solid rgba(224,90,90,0.2)',
              color: 'var(--risk)',
            }}
          >
            <AlertTriangle size={12} />
            {scanError}
          </div>
        )}

        {/* Intake summary results */}
        {scanResult && <IntakeSummaryCard summary={scanResult} />}

        {/* ── B7: Generate scaffold ───────────────────────── */}
        <button
          disabled={!canGenerate || generating}
          onClick={handleGenerate}
          className="font-mono-dm flex items-center gap-3"
          title={
            !hasSession ? 'No active session'
            : generating ? 'Generating…'
            : architectMd ? 'Re-generate ARCHITECT.md'
            : 'Generate ARCHITECT.md scaffold'
          }
          style={{
            width: '100%',
            height: '48px',
            borderRadius: '14px',
            border: `1px solid ${architectMd ? 'rgba(78,187,127,0.25)' : 'var(--border)'}`,
            background: architectMd ? 'rgba(78,187,127,0.04)' : 'rgba(255,255,255,0.02)',
            color: canGenerate ? (architectMd ? 'var(--ok)' : 'var(--text)') : 'var(--text-dim)',
            fontSize: '11px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            cursor: canGenerate && !generating ? 'pointer' : 'not-allowed',
            opacity: canGenerate ? 1 : 0.4,
            padding: '0 16px',
            transition: 'all 0.2s ease',
          }}
        >
          {generating ? <Loader2 size={16} className="animate-spin" /> : architectMd ? <Check size={16} /> : <FileCode2 size={16} />}
          <div className="flex flex-col items-start">
            <span>{generating ? 'Generating…' : architectMd ? 'Scaffold ready' : 'Generate scaffold'}</span>
            <span style={{ fontSize: '8px', letterSpacing: '0.05em', opacity: 0.7, textTransform: 'none' }}>
              {generating ? 'Building ARCHITECT.md…' : architectMd ? 'Click to re-generate' : 'File tree, tech stack, agent assignments'}
            </span>
          </div>
        </button>

        {architectError && (
          <div
            className="font-mono-dm flex items-center gap-2"
            style={{
              fontSize: '10px', padding: '8px 12px', borderRadius: '10px',
              background: 'rgba(224,90,90,0.06)', border: '1px solid rgba(224,90,90,0.2)',
              color: 'var(--risk)',
            }}
          >
            <AlertTriangle size={12} />
            {architectError}
          </div>
        )}

        {/* Architect.md preview */}
        {architectMd && (
          <div
            style={{
              borderRadius: '12px',
              border: '1px solid var(--border)',
              background: 'rgba(255,255,255,0.02)',
              overflow: 'hidden',
            }}
          >
            <div className="flex items-center justify-between" style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)' }}>
              <span className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                ARCHITECT.md
              </span>
              <button
                onClick={handleCopyArchitect}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: copied ? 'var(--ok)' : 'var(--text-dim)',
                  padding: '4px', display: 'flex', alignItems: 'center', gap: '4px',
                }}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                <span className="font-mono-dm" style={{ fontSize: '9px' }}>
                  {copied ? 'Copied' : 'Copy'}
                </span>
              </button>
            </div>
            <pre
              style={{
                padding: '12px',
                margin: 0,
                fontSize: '10px',
                lineHeight: 1.5,
                color: 'var(--text-muted)',
                maxHeight: '200px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              }}
            >
              {architectMd}
            </pre>
          </div>
        )}
      </div>

      {/* ── Phase status ────────────────────────────────────── */}
      <div
        className="font-mono-dm"
        style={{
          marginTop: '24px',
          padding: '12px 14px',
          borderRadius: '12px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border)',
          fontSize: '10px',
          color: 'var(--text-dim)',
          lineHeight: 1.5,
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: scanResult && architectMd ? 'var(--ok)' : 'var(--gold)',
              boxShadow: `0 0 8px ${scanResult && architectMd ? 'rgba(78,187,127,0.4)' : 'rgba(201,168,76,0.4)'}`,
            }}
          />
          <span style={{ letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>
            {scanResult && architectMd ? 'Ready to build' : 'Pre-build'}
          </span>
        </div>
        <span style={{ opacity: 0.7 }}>
          {scanResult && architectMd
            ? 'Intake scan and ARCHITECT.md generated. Ready to transition to build phase.'
            : 'Connect a repo, run intake scan, then generate the build scaffold.'}
        </span>
      </div>
    </aside>
  );
}

/* ── Intake summary display card ────────────────────────────── */

function IntakeSummaryCard({ summary }: { summary: IntakeSummary }) {
  const [expanded, setExpanded] = useState(false);
  const complexityColor = COMPLEXITY_COLOR[summary.estimated_complexity] ?? 'var(--text-dim)';

  return (
    <div
      style={{
        borderRadius: '12px',
        border: '1px solid rgba(78,187,127,0.15)',
        background: 'rgba(78,187,127,0.03)',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full"
        style={{
          padding: '10px 12px',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text)',
        }}
      >
        <div className="flex items-center gap-2">
          <span className="font-mono-dm" style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ok)' }}>
            Intake summary
          </span>
          <span
            className="font-mono-dm"
            style={{
              fontSize: '9px',
              padding: '2px 8px',
              borderRadius: '6px',
              background: `${complexityColor}15`,
              border: `1px solid ${complexityColor}30`,
              color: complexityColor,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}
          >
            {summary.estimated_complexity}
          </span>
        </div>
        {expanded ? <ChevronUp size={12} style={{ color: 'var(--text-dim)' }} /> : <ChevronDown size={12} style={{ color: 'var(--text-dim)' }} />}
      </button>

      {expanded && (
        <div className="font-mono-dm" style={{ padding: '0 12px 12px', fontSize: '10px', lineHeight: 1.6, color: 'var(--text-muted)' }}>
          {/* Stack */}
          <div style={{ marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '9px' }}>Stack</span>
            <div className="flex flex-wrap gap-1" style={{ marginTop: '4px' }}>
              {summary.stack.map(s => (
                <span
                  key={s}
                  className="reveal-chip"
                  style={{ fontSize: '9px', height: '20px', padding: '0 6px' }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>

          {/* Architecture notes */}
          <div style={{ marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '9px' }}>Architecture</span>
            <p style={{ margin: '4px 0 0' }}>{summary.architecture_notes}</p>
          </div>

          {/* Risk files */}
          {summary.risk_files.length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <span style={{ color: 'var(--risk)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '9px' }}>Risk files</span>
              <div style={{ marginTop: '4px' }}>
                {summary.risk_files.map(f => (
                  <div key={f} style={{ color: 'var(--risk)', opacity: 0.8 }}>• {f}</div>
                ))}
              </div>
            </div>
          )}

          {/* Safe zones */}
          {summary.safe_zones.length > 0 && (
            <div>
              <span style={{ color: 'var(--ok)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: '9px' }}>Safe zones</span>
              <div style={{ marginTop: '4px' }}>
                {summary.safe_zones.map(z => (
                  <div key={z} style={{ color: 'var(--ok)', opacity: 0.8 }}>• {z}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
