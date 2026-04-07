import { useState } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { Hammer, GitBranch, Database, ScanSearch, FileCode2, ChevronDown, ChevronUp } from 'lucide-react';
import RepoSection from './RepoSection';

type ProjectType = 'new' | 'existing';

export default function PreBuildPanel() {
  const { state, dispatch } = useMaestro();
  const isOpen = state.activeDrawer === 'pre-build';

  const [projectType, setProjectType] = useState<ProjectType>('new');
  const [supabaseExpanded, setSupabaseExpanded] = useState(false);

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
        <div
          className="reveal-card"
          style={{ marginBottom: '20px' }}
        >
          <div className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '10px' }}>
            Per-project Supabase credentials for edge functions and database access.
          </div>

          <div className="flex flex-col gap-2">
            <input
              type="text"
              placeholder="Project URL (https://xxx.supabase.co)"
              disabled
              style={{
                height: '34px',
                padding: '0 12px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.02)',
                color: 'var(--text-dim)',
                fontSize: '12px',
                outline: 'none',
                width: '100%',
                opacity: 0.5,
              }}
            />
            <input
              type="password"
              placeholder="Service Role Key"
              disabled
              style={{
                height: '34px',
                padding: '0 12px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.02)',
                color: 'var(--text-dim)',
                fontSize: '12px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                outline: 'none',
                width: '100%',
                opacity: 0.5,
              }}
            />
            <div
              className="font-mono-dm"
              style={{
                fontSize: '9px',
                color: 'var(--text-dim)',
                opacity: 0.6,
                padding: '4px 0',
              }}
            >
              Per-project credentials — wiring available after B6/B7 land.
            </div>
          </div>
        </div>
      )}

      {/* ── Actions ─────────────────────────────────────────── */}
      <div className="reveal-label mb-3" style={{ marginTop: '4px' }}>
        <div className="flex items-center gap-2">
          <Hammer size={12} />
          Build actions
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {/* Scan repo (B6) */}
        <button
          disabled
          className="font-mono-dm flex items-center gap-3"
          title="Available after repo scan backend (B6) lands"
          style={{
            width: '100%',
            height: '48px',
            borderRadius: '14px',
            border: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.02)',
            color: 'var(--text-dim)',
            fontSize: '11px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            cursor: 'not-allowed',
            opacity: 0.4,
            padding: '0 16px',
          }}
        >
          <ScanSearch size={16} />
          <div className="flex flex-col items-start">
            <span>Scan repository</span>
            <span style={{ fontSize: '8px', letterSpacing: '0.05em', opacity: 0.7, textTransform: 'none' }}>
              Agents read the codebase for context
            </span>
          </div>
        </button>

        {/* Generate scaffold (B7) */}
        <button
          disabled
          className="font-mono-dm flex items-center gap-3"
          title="Available after scaffold generation backend (B7) lands"
          style={{
            width: '100%',
            height: '48px',
            borderRadius: '14px',
            border: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.02)',
            color: 'var(--text-dim)',
            fontSize: '11px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase' as const,
            cursor: 'not-allowed',
            opacity: 0.4,
            padding: '0 16px',
          }}
        >
          <FileCode2 size={16} />
          <div className="flex flex-col items-start">
            <span>Generate scaffold</span>
            <span style={{ fontSize: '8px', letterSpacing: '0.05em', opacity: 0.7, textTransform: 'none' }}>
              File tree, tech stack, agent assignments
            </span>
          </div>
        </button>
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
              background: 'var(--gold)',
              boxShadow: '0 0 8px rgba(201,168,76,0.4)',
            }}
          />
          <span style={{ letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>
            Shell mode
          </span>
        </div>
        <span style={{ opacity: 0.7 }}>
          Pre-build panel ready. Scan and scaffold actions unlock when
          backend phases B6 and B7 are complete.
        </span>
      </div>
    </aside>
  );
}
