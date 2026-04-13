import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { invokeEdgeFunction } from '../../lib/functions';
import { supabase } from '../../lib/supabase';
import { IntakeSummary, BuildLaneRole, SuggestedLane } from '../../types';
import {
  Hammer, GitBranch, Database, ScanSearch, FileCode2,
  ChevronDown, ChevronUp, Loader2, Check, AlertTriangle, Copy, Download,
  Users, Lock, Sparkles, Pencil, Trash2,
} from 'lucide-react';
import RepoSection from './RepoSection';

type ProjectType = 'new' | 'existing';

const COMPLEXITY_COLOR: Record<string, string> = {
  low: 'var(--ok)',
  medium: 'var(--gold)',
  high: 'var(--risk)',
};

const SCAFFOLD_MESSAGES = [
  'Reading your codebase…',
  'Mapping file structure…',
  'Assigning agent lanes…',
  'Generating Architect.md…',
];

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

  // Scaffold generation cycling messages
  const [scaffoldMsgIdx, setScaffoldMsgIdx] = useState(0);
  const scaffoldTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousSessionIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (generating) {
      setScaffoldMsgIdx(0);
      scaffoldTimerRef.current = setInterval(() => {
        setScaffoldMsgIdx(prev => (prev + 1) % SCAFFOLD_MESSAGES.length);
      }, 2500);
    } else if (scaffoldTimerRef.current) {
      clearInterval(scaffoldTimerRef.current);
      scaffoldTimerRef.current = null;
    }
    return () => { if (scaffoldTimerRef.current) clearInterval(scaffoldTimerRef.current); };
  }, [generating]);

  // B5 lane assignment state
  interface LaneEntry {
    agent_name: string;
    agent_id: string;
    lane_paths: string[];
    role: BuildLaneRole;
    editing: boolean;
    pathDraft: string;
  }
  const suggestedLanes = useMemo(
    () => (state.activeSession?.build_spec?.suggested_lanes ?? []) as SuggestedLane[],
    [state.activeSession?.build_spec],
  );
  const [lanes, setLanes] = useState<LaneEntry[]>([]);
  const [lanesLocked, setLanesLocked] = useState(state.activeSession?.build_spec_locked ?? false);
  const [laneError, setLaneError] = useState('');
  const [locking, setLocking] = useState(false);


  useEffect(() => {
    const session = state.activeSession;
    if (!session) return;
    const sessionChanged = previousSessionIdRef.current !== session.id;
    previousSessionIdRef.current = session.id;

    setProjectType(session.project_type ?? 'new');
    setScanResult((session.build_spec?.intake_summary as IntakeSummary) ?? null);
    setArchitectMd(session.architect_md ?? null);
    setLanesLocked(session.build_spec_locked ?? false);
    if (sessionChanged) {
      setLanes([]);
      setLaneError('');
      setScanError('');
      setArchitectError('');
    }
  }, [state.activeSession]);

  const hasRepo = !!state.activeRepoConnection;
  const hasSession = !!state.activeSession;
  const canScan = hasSession && hasRepo && projectType === 'existing';
  const canGenerate = hasSession;

  useEffect(() => {
    const session = state.activeSession;
    if (!session || session.project_type === projectType) return;

    const patch: { project_type?: ProjectType } = { project_type: projectType };

    void supabase
      .from('sessions')
      .update(patch as never)
      .eq('id', session.id);
    dispatch({ type: 'UPDATE_ACTIVE_SESSION', payload: patch });
  }, [state.activeSession, projectType, dispatch]);

  /* ── B5: Lane assignment helpers ──────────────────────────── */
  const ROLE_OPTIONS: { value: BuildLaneRole; label: string }[] = [
    { value: 'builder', label: 'Builder' },
    { value: 'reviewer', label: 'Reviewer' },
    { value: 'read_only', label: 'Read Only' },
    { value: 'security_audit', label: 'Security Audit' },
  ];

  const autoFillFromSuggestions = useCallback(() => {
    if (suggestedLanes.length === 0) return;
    const activeAgents = state.agents.filter(a => a.is_active);
    const entries: LaneEntry[] = suggestedLanes.map(s => {
      const matched = activeAgents.find(a => a.display_name === s.agent_name || a.name === s.agent_name);
      return {
        agent_name: s.agent_name,
        agent_id: matched?.id ?? '',
        lane_paths: s.lane_paths,
        role: s.role,
        editing: false,
        pathDraft: s.lane_paths.join(', '),
      };
    });
    setLanes(entries);
    setLaneError('');
  }, [suggestedLanes, state.agents]);

  const addLane = useCallback(() => {
    const activeAgents = state.agents.filter(a => a.is_active);
    const usedNames = new Set(lanes.map(l => l.agent_name));
    const next = activeAgents.find(a => !usedNames.has(a.display_name));
    setLanes(prev => [...prev, {
      agent_name: next?.display_name ?? 'Agent',
      agent_id: next?.id ?? '',
      lane_paths: [],
      role: 'builder',
      editing: true,
      pathDraft: '',
    }]);
  }, [state.agents, lanes]);

  const removeLane = useCallback((idx: number) => {
    setLanes(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const updateLane = useCallback((idx: number, patch: Partial<LaneEntry>) => {
    setLanes(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l));
  }, []);

  const commitPathEdit = useCallback((idx: number) => {
    setLanes(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const paths = l.pathDraft.split(',').map(p => p.trim()).filter(Boolean);
      return { ...l, lane_paths: paths, editing: false };
    }));
  }, []);

  // Detect path overlaps between builder lanes
  const getOverlaps = useCallback((): Map<number, string> => {
    const overlaps = new Map<number, string>();
    const builders = lanes.map((l, i) => ({ ...l, idx: i })).filter(l => l.role === 'builder');
    for (let i = 0; i < builders.length; i++) {
      for (let j = i + 1; j < builders.length; j++) {
        for (const p of builders[i].lane_paths) {
          if (builders[j].lane_paths.includes(p)) {
            overlaps.set(builders[i].idx, `Overlap with ${builders[j].agent_name} on "${p}"`);
            overlaps.set(builders[j].idx, `Overlap with ${builders[i].agent_name} on "${p}"`);
          }
        }
      }
    }
    return overlaps;
  }, [lanes]);

  const overlaps = getOverlaps();
  const hasOverlaps = overlaps.size > 0;
  const hasBuilders = lanes.some(l => l.role === 'builder');
  const canLock = lanes.length > 0 && hasBuilders && !hasOverlaps && !lanesLocked;

  const handleLockSpec = useCallback(async () => {
    if (!state.activeSession || !canLock) return;
    setLocking(true);
    setLaneError('');

    try {
      // Upsert lanes into build_lanes table
      const rows = lanes.map(l => ({
        session_id: state.activeSession!.id,
        agent_id: l.agent_id || null,
        agent_name: l.agent_name,
        lane_paths: l.lane_paths,
        role: l.role,
      }));

      // Delete old lanes for this session first
      await supabase
        .from('build_lanes')
        .delete()
        .eq('session_id', state.activeSession.id);

      const { error: insertErr } = await supabase
        .from('build_lanes')
        .insert(rows as never[]);

      if (insertErr) throw new Error(insertErr.message);

      // Lock build spec
      await supabase
        .from('sessions')
        .update({ build_spec_locked: true } as never)
        .eq('id', state.activeSession.id);

      setLanesLocked(true);
      dispatch({ type: 'UPDATE_ACTIVE_SESSION', payload: { build_spec_locked: true } });
      dispatch({ type: 'SHOW_TOAST', payload: 'Build Spec Locked ✓' });
    } catch (err) {
      setLaneError(err instanceof Error ? err.message : String(err));
    } finally {
      setLocking(false);
    }
  }, [state.activeSession, canLock, lanes, dispatch]);

  const handleGoToBuild = useCallback(async () => {
    if (!state.activeSession) return;
    await supabase
      .from('sessions')
      .update({ current_phase: 'build' } as never)
      .eq('id', state.activeSession.id);
    dispatch({ type: 'UPDATE_ACTIVE_SESSION', payload: { current_phase: 'build' } });
    dispatch({ type: 'SHOW_TOAST', payload: 'Entering Build phase' });
  }, [state.activeSession, dispatch]);

  /* ── B6: Intake scan ─────────────────────────────────────── */
  const handleScan = useCallback(async () => {
    if (!state.activeSession || !state.activeRepoConnection) return;
    setScanning(true);
    setScanError('');
    setScanResult(null);

    try {
      const data = await invokeEdgeFunction<{ intake_summary?: IntakeSummary; error?: string }>('intake', {
        session_id: state.activeSession.id,
        repo_connection_id: state.activeRepoConnection.id,
      });

      if (data.error === 'ANTHROPIC_KEY_MISSING') {
        throw new Error('Add an Anthropic API key in the Vault first.');
      }

      setScanResult((data.intake_summary ?? null) as IntakeSummary | null);

      // Refresh session in context with updated build_spec
      if (state.activeSession) {
        dispatch({
          type: 'UPDATE_ACTIVE_SESSION',
          payload: {
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
  }, [state.activeSession, state.activeRepoConnection, dispatch]);

  /* ── B7: Architect generation ────────────────────────────── */
  const handleGenerate = useCallback(async () => {
    if (!state.activeSession) return;
    setGenerating(true);
    setArchitectError('');
    setArchitectMd(null);

    try {
      const data = await invokeEdgeFunction<{
        architect_md?: string;
        build_spec_locked?: boolean;
        lanes_assigned?: boolean;
        error?: string;
      }>('architect', {
        session_id: state.activeSession.id,
      });

      if (data.error === 'ANTHROPIC_KEY_MISSING') {
        throw new Error('Add an Anthropic API key in the Vault first.');
      }

      setArchitectMd(data.architect_md ?? null);

      // C1: architect now auto-assigns lanes and locks build_spec
      const autoLocked = data.build_spec_locked === true;
      const lanesAssigned = data.lanes_assigned === true;

      // Refresh session in context
      if (state.activeSession) {
        dispatch({
          type: 'UPDATE_ACTIVE_SESSION',
          payload: {
            architect_md: data.architect_md,
            ...(autoLocked ? { build_spec_locked: true } : {}),
          },
        });
        if (autoLocked) setLanesLocked(true);
      }

      // Auto-lock toast feedback
      if (lanesAssigned && autoLocked) {
        dispatch({ type: 'SHOW_TOAST', payload: 'Lanes auto-assigned and locked by Architect' });
      }
    } catch (err) {
      setArchitectError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }, [state.activeSession, dispatch]);

  const handleCopyArchitect = useCallback(() => {
    if (!architectMd) return;
    navigator.clipboard.writeText(architectMd);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [architectMd]);

  const handleDownloadArchitect = useCallback(() => {
    if (!architectMd) return;
    const blob = new Blob([architectMd], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ARCHITECT.md';
    a.click();
    URL.revokeObjectURL(url);
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
              {generating ? SCAFFOLD_MESSAGES[scaffoldMsgIdx] : architectMd ? 'Click to re-generate' : 'File tree, tech stack, agent assignments'}
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
              <div className="flex items-center gap-2">
                <button
                  onClick={handleDownloadArchitect}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-dim)',
                    padding: '4px', display: 'flex', alignItems: 'center', gap: '4px',
                  }}
                >
                  <Download size={12} />
                  <span className="font-mono-dm" style={{ fontSize: '9px' }}>
                    Download
                  </span>
                </button>
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

      {/* ── B5: Lane assignment ─────────────────────────────── */}
      <div style={{ marginTop: '24px' }}>
        <div className="flex items-center gap-2" style={{ marginBottom: '14px' }}>
          <Users size={14} style={{ color: 'var(--gold)' }} />
          <span className="font-mono-dm" style={{ fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--gold)' }}>
            Assign Agent Lanes
          </span>
        </div>

        <p style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5, margin: '0 0 14px' }}>
          Assign each active agent to a lane. Builders in the same session cannot write to the same paths.
        </p>

        {/* Suggested lanes auto-fill */}
        {suggestedLanes.length > 0 && lanes.length === 0 && !lanesLocked && (
          <button
            className="reveal-pill w-full"
            style={{
              height: '34px', fontSize: '10px', padding: '0 14px',
              marginBottom: '12px', justifyContent: 'center',
              background: 'rgba(201,168,76,0.06)',
              borderColor: 'rgba(201,168,76,0.2)',
            }}
            onClick={autoFillFromSuggestions}
          >
            <Sparkles size={12} style={{ color: 'var(--gold)' }} />
            Auto-fill from Concierge suggestions ({suggestedLanes.length} lanes)
          </button>
        )}

        {/* Lane cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {lanes.map((lane, idx) => (
            <div
              key={idx}
              style={{
                borderRadius: '12px',
                border: `1px solid ${overlaps.has(idx) ? 'rgba(224,90,90,0.3)' : 'rgba(255,255,255,0.06)'}`,
                background: overlaps.has(idx) ? 'rgba(224,90,90,0.04)' : 'rgba(255,255,255,0.02)',
                padding: '12px 14px',
              }}
            >
              <div className="flex items-center justify-between" style={{ marginBottom: '8px' }}>
                {/* Agent name (select from active agents) */}
                <select
                  value={lane.agent_name}
                  disabled={lanesLocked}
                  onChange={e => {
                    const agent = state.agents.find(a => a.display_name === e.target.value);
                    updateLane(idx, {
                      agent_name: e.target.value,
                      agent_id: agent?.id ?? '',
                    });
                  }}
                  className="font-mono-dm"
                  style={{
                    fontSize: '11px', background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px',
                    color: 'var(--text)', padding: '4px 8px', cursor: lanesLocked ? 'default' : 'pointer',
                  }}
                >
                  {state.agents.filter(a => a.is_active).map(a => (
                    <option key={a.id} value={a.display_name}>{a.display_name}</option>
                  ))}
                  {/* Keep current value if not in active agents */}
                  {!state.agents.find(a => a.is_active && a.display_name === lane.agent_name) && (
                    <option value={lane.agent_name}>{lane.agent_name}</option>
                  )}
                </select>

                <div className="flex items-center gap-2">
                  {/* Role select */}
                  <select
                    value={lane.role}
                    disabled={lanesLocked}
                    onChange={e => updateLane(idx, { role: e.target.value as BuildLaneRole })}
                    className="font-mono-dm"
                    style={{
                      fontSize: '10px', background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.08)', borderRadius: '6px',
                      color: 'var(--text-muted)', padding: '3px 6px', cursor: lanesLocked ? 'default' : 'pointer',
                    }}
                  >
                    {ROLE_OPTIONS.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>

                  {!lanesLocked && (
                    <button
                      onClick={() => removeLane(idx)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-dim)', padding: '2px' }}
                      title="Remove lane"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>

              {/* Path display / edit */}
              <div className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                <span style={{ opacity: 0.6, marginRight: '6px' }}>Paths:</span>
                {lane.role === 'read_only' || lane.role === 'security_audit' ? (
                  <span style={{ fontStyle: 'italic', opacity: 0.5 }}>(reads all, writes none)</span>
                ) : lane.editing && !lanesLocked ? (
                  <div className="flex items-center gap-1" style={{ marginTop: '4px' }}>
                    <input
                      type="text"
                      value={lane.pathDraft}
                      onChange={e => updateLane(idx, { pathDraft: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') commitPathEdit(idx); }}
                      placeholder="src/components/**, src/hooks/**"
                      className="font-mono-dm"
                      style={{
                        flex: 1, fontSize: '10px', padding: '4px 8px',
                        background: 'rgba(255,255,255,0.04)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '4px', color: 'var(--text)',
                        outline: 'none',
                      }}
                      autoFocus
                    />
                    <button
                      onClick={() => commitPathEdit(idx)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ok)', padding: '2px' }}
                    >
                      <Check size={12} />
                    </button>
                  </div>
                ) : (
                  <span
                    className="flex items-center gap-1"
                    style={{ cursor: lanesLocked ? 'default' : 'pointer' }}
                    onClick={() => !lanesLocked && updateLane(idx, { editing: true, pathDraft: lane.lane_paths.join(', ') })}
                  >
                    {lane.lane_paths.length > 0
                      ? lane.lane_paths.join(', ')
                      : <span style={{ fontStyle: 'italic', opacity: 0.5 }}>click to set paths</span>
                    }
                    {!lanesLocked && <Pencil size={9} style={{ opacity: 0.4, marginLeft: '4px' }} />}
                  </span>
                )}
              </div>

              {/* Overlap warning */}
              {overlaps.has(idx) && (
                <div className="flex items-center gap-1" style={{ marginTop: '6px' }}>
                  <AlertTriangle size={10} style={{ color: 'var(--risk)' }} />
                  <span style={{ fontSize: '9px', color: 'var(--risk)' }}>
                    {overlaps.get(idx)}
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Add lane + lock buttons */}
        {!lanesLocked && (
          <div className="flex items-center gap-2" style={{ marginTop: '12px' }}>
            <button
              className="reveal-pill"
              style={{ height: '30px', fontSize: '10px', padding: '0 12px' }}
              onClick={addLane}
            >
              + Add lane
            </button>
            {lanes.length > 0 && (
              <button
                className="reveal-pill"
                style={{
                  height: '30px', fontSize: '10px', padding: '0 14px',
                  background: canLock ? 'var(--gold)' : 'transparent',
                  color: canLock ? 'var(--void)' : 'var(--text-dim)',
                  borderColor: canLock ? 'transparent' : undefined,
                  fontWeight: canLock ? 500 : 400,
                  cursor: canLock ? 'pointer' : 'not-allowed',
                  opacity: canLock ? 1 : 0.5,
                }}
                onClick={handleLockSpec}
                disabled={!canLock || locking}
              >
                {locking ? <Loader2 size={12} className="animate-spin" /> : <Lock size={10} />}
                {locking ? 'Locking…' : 'Lock Build Spec'}
              </button>
            )}
          </div>
        )}

        {/* Lane error */}
        {laneError && (
          <div className="flex items-center gap-2" style={{ marginTop: '8px' }}>
            <AlertTriangle size={12} style={{ color: 'var(--risk)' }} />
            <span style={{ fontSize: '10px', color: 'var(--risk)' }}>{laneError}</span>
          </div>
        )}

        {/* Locked state */}
        {lanesLocked && (
          <div style={{ marginTop: '12px' }}>
            <div className="flex items-center gap-2" style={{ marginBottom: '10px' }}>
              <Check size={12} style={{ color: 'var(--ok)' }} />
              <span className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--ok)', letterSpacing: '0.1em' }}>
                Build Spec Locked ✓
              </span>
            </div>
            <button
              className="reveal-pill"
              style={{
                height: '34px', fontSize: '11px', padding: '0 18px',
                background: 'var(--gold)', color: 'var(--void)',
                borderColor: 'transparent', fontWeight: 500,
              }}
              onClick={handleGoToBuild}
            >
              Go to Build →
            </button>
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
              background: lanesLocked ? 'var(--ok)' : 'var(--gold)',
              boxShadow: `0 0 8px ${lanesLocked ? 'rgba(78,187,127,0.4)' : 'rgba(201,168,76,0.4)'}`,
            }}
          />
          <span style={{ letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>
            {lanesLocked ? 'Ready to build' : scanResult && architectMd ? 'Lanes needed' : 'Pre-build'}
          </span>
        </div>
        <span style={{ opacity: 0.7 }}>
          {lanesLocked
            ? 'Build spec locked. Lane assignments confirmed. Ready to transition to build phase.'
            : scanResult && architectMd
            ? 'Intake scan and ARCHITECT.md generated. Assign agent lanes and lock the build spec.'
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





