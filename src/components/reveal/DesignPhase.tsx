import { useState, useCallback, useEffect, useRef } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { invokeEdgeFunction } from '../../lib/functions';
import { supabase } from '../../lib/supabase';
import { ROLE_META } from '../../lib/designRoles';
import {
  DesignerRole, DesignMode, DESIGNER_LANES, DESIGN_MODE_LANES,
} from '../../types';
import {
  Palette, Play, Star, GitMerge, ExternalLink, Download,
  Loader2, AlertTriangle, SkipForward, ChevronLeft, ChevronRight,
} from 'lucide-react';

/* ── Types for local state ─────────────────────────────────── */

interface DesignArtifact {
  designer_role: DesignerRole;
  agent_name: string;
  html_content: string;
  rationale: string;
  tradeoffs: string;
  model_used: string;
  error?: string;
}

type ArtifactStatus = 'idle' | 'loading' | 'done' | 'error';

/* ── HTML extraction helpers ───────────────────────────────── */

function stripFence(value: string): string {
  const text = value.trim();
  const fenced = text.match(/^```(?:json|html)?\s*([\s\S]*?)\s*```$/i);
  return (fenced?.[1] ?? text).trim();
}

function decodeEscapedHtml(value: string): string {
  let decoded = value.trim();
  for (let i = 0; i < 3; i += 1) {
    const next = decoded
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      .trim();
    if (next === decoded) break;
    decoded = next;
  }
  return decoded;
}

function parseJson(value: string): unknown {
  try { return JSON.parse(value); } catch { return null; }
}

function readHtmlContent(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('html_content' in value)) return null;
  const html = (value as { html_content?: unknown }).html_content;
  return typeof html === 'string' ? html : null;
}

function extractJsonStringField(source: string, key: string): string | null {
  const match = new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`).exec(source);
  if (!match) return null;
  const parsed = parseJson(`"${match[1]}"`);
  return typeof parsed === 'string' ? parsed : match[1];
}

function extractHtml(raw: string): string {
  if (!raw) return '';
  let text = stripFence(raw);

  for (let i = 0; i < 2; i += 1) {
    const parsed = parseJson(text);
    if (typeof parsed === 'string') { text = stripFence(parsed); continue; }
    const html = readHtmlContent(parsed);
    if (html !== null) return decodeEscapedHtml(html);
    break;
  }

  const fencedJson = text.match(/```json\s*([\s\S]*?)```/i);
  if (fencedJson) {
    const html = readHtmlContent(parseJson(fencedJson[1].trim()));
    if (html !== null) return decodeEscapedHtml(html);
  }

  const htmlField = extractJsonStringField(text, 'html_content');
  if (htmlField !== null) return decodeEscapedHtml(htmlField);

  const htmlStart = text.search(/<!doctype html|<html[\s>]/i);
  if (htmlStart !== -1) {
    const htmlEnd = text.toLowerCase().lastIndexOf('</html>');
    const html = htmlEnd === -1 ? text.slice(htmlStart) : text.slice(htmlStart, htmlEnd + 7);
    return decodeEscapedHtml(html);
  }

  return decodeEscapedHtml(text);
}

/* ── Constants ─────────────────────────────────────────────── */

const MODE_LABELS: Record<DesignMode, string> = {
  lite: 'Lite — 1 designer',
  standard: 'Standard — 2 designers',
  exploration: 'Exploration — 4 designers',
};

/* ── Component ─────────────────────────────────────────────── */

export default function DesignPhase() {
  const { state, dispatch } = useMaestro();
  const session = state.activeSession;
  const decision = state.conciergeDecision;

  const designMode: DesignMode = decision?.design_mode ?? 'standard';
  const brief = decision?.recommended_direction ?? '';
  const activeRoles = DESIGN_MODE_LANES[designMode];

  const [artifacts, setArtifacts] = useState<Record<DesignerRole, DesignArtifact | null>>({
    visual_spatial: null, structure_ux: null, product_practical: null, wildcard_fusion: null,
  });
  const [statuses, setStatuses] = useState<Record<DesignerRole, ArtifactStatus>>({
    visual_spatial: 'idle', structure_ux: 'idle', product_practical: 'idle', wildcard_fusion: 'idle',
  });
  const [flagged, setFlagged] = useState<Set<DesignerRole>>(new Set());
  const [selected, setSelected] = useState<DesignerRole | null>(null);
  const [globalError, setGlobalError] = useState('');
  const [running, setRunning] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  // Elapsed time counter
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (running) {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [running]);

  const isVisible = session?.current_phase === 'design';

  // Keyboard navigation
  useEffect(() => {
    if (!isVisible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setCurrentSlide(s => Math.max(0, s - 1));
      if (e.key === 'ArrowRight') setCurrentSlide(s => Math.min(activeRoles.length - 1, s + 1));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isVisible, activeRoles.length]);

  // Clamp slide index when activeRoles changes
  useEffect(() => {
    setCurrentSlide(s => Math.min(s, Math.max(0, activeRoles.length - 1)));
  }, [activeRoles.length]);

  /* ── Run designers ───────────────────────────────────────── */
  const handleRun = useCallback(async () => {
    if (!session) return;
    setRunning(true);
    setGlobalError('');
    setSelected(null);
    setFlagged(new Set());
    setCurrentSlide(0);

    const newStatuses = { ...statuses };
    activeRoles.forEach(r => { newStatuses[r] = 'loading'; });
    setStatuses(newStatuses);

    try {
      const data = await invokeEdgeFunction<{ artifacts?: DesignArtifact[]; message?: string; error?: string }>('design', {
        session_id: session.id,
        design_mode: designMode,
        brief,
      });

      if (data.error) {
        setGlobalError(data.message || data.error || 'Design call failed');
        const errStatuses = { ...statuses };
        activeRoles.forEach(r => { errStatuses[r] = 'error'; });
        setStatuses(errStatuses);
        setRunning(false);
        return;
      }

      const incoming = (data.artifacts ?? []) as DesignArtifact[];
      const nextArtifacts = { ...artifacts };
      const nextStatuses = { ...statuses };

      for (const a of incoming) {
        nextArtifacts[a.designer_role] = a;
        nextStatuses[a.designer_role] = a.error ? 'error' : 'done';
      }

      setArtifacts(nextArtifacts);
      setStatuses(nextStatuses);
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : String(err));
      const errStatuses = { ...statuses };
      activeRoles.forEach(r => { errStatuses[r] = 'error'; });
      setStatuses(errStatuses);
    } finally {
      setRunning(false);
    }
  }, [session, designMode, brief, activeRoles, artifacts, statuses]);

  /* ── Selection / merge ───────────────────────────────────── */
  const handleSelect = useCallback(async (role: DesignerRole) => {
    if (!session) return;
    setSelected(role);
    setFlagged(new Set());

    await supabase
      .from('design_artifacts')
      .update({ selected_for_build: true } as never)
      .eq('session_id', session.id)
      .eq('designer_role', role);

    await supabase
      .from('sessions')
      .update({ current_phase: 'pre_build' } as never)
      .eq('id', session.id);

    dispatch({ type: 'UPDATE_ACTIVE_SESSION', payload: { current_phase: 'pre_build' } });
    dispatch({ type: 'OPEN_DRAWER', payload: 'pre-build' });

    const lane = DESIGNER_LANES.find(l => l.role === role);
    dispatch({ type: 'SHOW_TOAST', payload: `${lane?.display_name ?? role} selected. Moving to Pre-Build.` });
  }, [session, dispatch]);

  const toggleFlag = useCallback((role: DesignerRole) => {
    setFlagged(prev => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role); else next.add(role);
      return next;
    });
    if (selected) setSelected(null);
  }, [selected]);

  const handleMerge = useCallback(async () => {
    if (!session || flagged.size < 2) return;
    const roles = Array.from(flagged);

    for (const role of roles) {
      await supabase
        .from('design_artifacts')
        .update({ flagged_by_conductor: true } as never)
        .eq('session_id', session.id)
        .eq('designer_role', role);
    }

    await supabase
      .from('sessions')
      .update({ current_phase: 'pre_build' } as never)
      .eq('id', session.id);

    dispatch({ type: 'UPDATE_ACTIVE_SESSION', payload: { current_phase: 'pre_build' } });
    dispatch({ type: 'OPEN_DRAWER', payload: 'pre-build' });

    const names = roles.map(r => DESIGNER_LANES.find(l => l.role === r)?.display_name ?? r);
    dispatch({ type: 'SHOW_TOAST', payload: `Merging ${names.join(' + ')}. Moving to Pre-Build.` });
  }, [session, flagged, dispatch]);

  const handleSkip = useCallback(async () => {
    if (!session) return;
    await supabase
      .from('sessions')
      .update({ current_phase: 'pre_build' } as never)
      .eq('id', session.id);
    dispatch({ type: 'UPDATE_ACTIVE_SESSION', payload: { current_phase: 'pre_build' } });
    dispatch({ type: 'OPEN_DRAWER', payload: 'pre-build' });
    dispatch({ type: 'SHOW_TOAST', payload: 'Design skipped. Moving to Pre-Build.' });
  }, [session, dispatch]);

  /* ── Download / open ────────────────────────────────────── */
  const downloadHtml = useCallback((artifact: DesignArtifact) => {
    const blob = new Blob([extractHtml(artifact.html_content)], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${artifact.designer_role}-mockup.html`;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const openInTab = useCallback((artifact: DesignArtifact) => {
    const blob = new Blob([extractHtml(artifact.html_content)], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }, []);

  /* ── Render gate ─────────────────────────────────────────── */
  if (!isVisible) return null;

  const allDone = activeRoles.every(r => statuses[r] === 'done');
  const anyDone = activeRoles.some(r => statuses[r] === 'done');
  const anyLoading = activeRoles.some(r => statuses[r] === 'loading');
  const canMerge = flagged.size >= 2;
  const currentRole = activeRoles[currentSlide];
  const currentArtifact = currentRole ? artifacts[currentRole] : null;
  const currentStatus = currentRole ? statuses[currentRole] : 'idle';
  const currentMeta = currentRole ? ROLE_META[currentRole] : null;
  const previewHtml = currentArtifact ? extractHtml(currentArtifact.html_content) : '';

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col"
      style={{ background: 'rgba(8,8,6,0.96)', backdropFilter: 'blur(12px)' }}
    >
      {/* ── Top bar ──────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: '16px 28px',
          borderBottom: '1px solid rgba(255,255,255,0.045)',
          flexShrink: 0,
        }}
      >
        <div className="flex items-center gap-3">
          <Palette size={16} style={{ color: 'var(--gold)' }} />
          <span
            className="font-mono-dm"
            style={{
              fontSize: '11px',
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--gold)',
            }}
          >
            Design Phase
          </span>
          <span
            className="font-mono-dm"
            style={{
              fontSize: '9px',
              letterSpacing: '0.12em',
              color: 'var(--text-dim)',
              padding: '2px 10px',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            {MODE_LABELS[designMode]}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            className="reveal-pill"
            style={{ height: '34px', fontSize: '11px', padding: '0 14px', opacity: running ? 0.5 : 1 }}
            onClick={handleSkip}
            disabled={running}
          >
            <SkipForward size={12} />
            Skip to Build
          </button>
          <button
            className="reveal-pill"
            style={{
              height: '34px',
              fontSize: '11px',
              padding: '0 16px',
              background: running ? 'transparent' : 'var(--gold)',
              color: running ? 'var(--text-muted)' : 'var(--void)',
              borderColor: running ? undefined : 'transparent',
              fontWeight: 500,
              cursor: running ? 'not-allowed' : 'pointer',
            }}
            onClick={handleRun}
            disabled={running}
          >
            {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={12} />}
            {running ? 'Running...' : 'Run Designers'}
          </button>
        </div>
      </div>

      {/* ── Global error ─────────────────────────────────────── */}
      {globalError && (
        <div
          className="flex items-center gap-2"
          style={{
            padding: '12px 28px',
            background: 'rgba(224,90,90,0.06)',
            borderBottom: '1px solid rgba(224,90,90,0.12)',
            flexShrink: 0,
          }}
        >
          <AlertTriangle size={14} style={{ color: 'var(--risk)' }} />
          <span style={{ fontSize: '13px', color: 'var(--risk)' }}>{globalError}</span>
        </div>
      )}

      {/* ── Carousel body ────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

        {/* Slide indicators — role pills across the top */}
        {activeRoles.length > 1 && (
          <div
            className="flex items-center justify-center gap-3"
            style={{ padding: '16px 28px 8px', flexShrink: 0 }}
          >
            {activeRoles.map((role, i) => {
              const meta = ROLE_META[role];
              const isActive = i === currentSlide;
              const isDone = statuses[role] === 'done';
              const isFl = flagged.has(role);
              const isSel = selected === role;
              return (
                <button
                  key={role}
                  onClick={() => setCurrentSlide(i)}
                  className="font-mono-dm"
                  style={{
                    padding: '6px 16px',
                    borderRadius: '999px',
                    border: `1px solid ${isActive ? meta.color : isFl ? 'var(--gold)' : 'rgba(255,255,255,0.08)'}`,
                    background: isActive
                      ? `${meta.color}18`
                      : isSel
                        ? `${meta.color}10`
                        : 'transparent',
                    color: isActive ? meta.color : 'var(--text-muted)',
                    fontSize: '11px',
                    letterSpacing: '0.08em',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <div
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: isDone ? meta.color : statuses[role] === 'loading' ? meta.color : 'rgba(255,255,255,0.15)',
                      boxShadow: isDone ? `0 0 6px ${meta.color}60` : 'none',
                      animation: statuses[role] === 'loading' ? 'designPulse 2s ease-in-out infinite' : undefined,
                    }}
                  />
                  {meta.label}
                  {isSel && <Star size={10} style={{ color: meta.color }} />}
                  {isFl && <GitMerge size={10} style={{ color: 'var(--gold)' }} />}
                </button>
              );
            })}
          </div>
        )}

        {/* Main slide area */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'stretch', overflow: 'hidden', position: 'relative' }}>

          {/* Left arrow */}
          {activeRoles.length > 1 && currentSlide > 0 && (
            <button
              onClick={() => setCurrentSlide(s => s - 1)}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 10,
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(8px)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
            >
              <ChevronLeft size={18} />
            </button>
          )}

          {/* Right arrow */}
          {activeRoles.length > 1 && currentSlide < activeRoles.length - 1 && (
            <button
              onClick={() => setCurrentSlide(s => s + 1)}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                zIndex: 10,
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                border: '1px solid rgba(255,255,255,0.1)',
                background: 'rgba(0,0,0,0.5)',
                backdropFilter: 'blur(8px)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s ease',
              }}
            >
              <ChevronRight size={18} />
            </button>
          )}

          {/* Current slide content */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 60px', overflow: 'hidden' }}>

            {/* Role header */}
            {currentMeta && (
              <div
                className="flex items-center gap-3"
                style={{ padding: '12px 0 8px', flexShrink: 0 }}
              >
                <div
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: currentMeta.color,
                    boxShadow: `0 0 10px ${currentMeta.color}60`,
                  }}
                />
                <span
                  className="font-mono-dm"
                  style={{
                    fontSize: '13px',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    color: currentMeta.color,
                    fontWeight: 500,
                  }}
                >
                  {currentMeta.label}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-dim)' }}>
                  {currentMeta.description}
                </span>
                {currentArtifact?.model_used && (
                  <span
                    className="font-mono-dm"
                    style={{
                      fontSize: '9px',
                      color: 'var(--text-dim)',
                      marginLeft: 'auto',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      background: 'rgba(255,255,255,0.03)',
                    }}
                  >
                    {currentArtifact.model_used}
                  </span>
                )}
              </div>
            )}

            {/* Preview / loading / idle states */}
            <div style={{ flex: 1, overflow: 'hidden', borderRadius: '12px', position: 'relative' }}>
              {currentStatus === 'idle' && (
                <div
                  style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '16px',
                  }}
                >
                  <Palette size={36} style={{ color: 'var(--text-dim)', opacity: 0.4 }} />
                  <p
                    className="font-mono-dm"
                    style={{
                      fontSize: '12px',
                      color: 'var(--text-dim)',
                      letterSpacing: '0.1em',
                      textAlign: 'center',
                      maxWidth: '320px',
                      lineHeight: 1.6,
                    }}
                  >
                    Click "Run Designers" to generate mockups.
                    {brief && (
                      <span style={{ display: 'block', marginTop: '12px', fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                        Brief: {brief.length > 120 ? brief.slice(0, 120) + '...' : brief}
                      </span>
                    )}
                  </p>
                </div>
              )}

              {currentStatus === 'loading' && (
                <div
                  style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '16px',
                  }}
                >
                  <Loader2
                    size={32}
                    className="animate-spin"
                    style={{ color: currentMeta?.color ?? 'var(--gold)' }}
                  />
                  <p
                    className="font-mono-dm"
                    style={{
                      fontSize: '13px',
                      color: currentMeta?.color ?? 'var(--gold)',
                      letterSpacing: '0.1em',
                      fontWeight: 500,
                    }}
                  >
                    {currentMeta?.label} is designing... ({elapsed}s)
                  </p>
                  <p
                    className="font-mono-dm"
                    style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}
                  >
                    This may take 30-60 seconds
                  </p>
                </div>
              )}

              {currentStatus === 'error' && currentArtifact?.error && (
                <div
                  style={{
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '12px',
                    padding: '40px',
                  }}
                >
                  <AlertTriangle size={28} style={{ color: 'var(--risk)' }} />
                  <span style={{ fontSize: '14px', color: 'var(--risk)', fontWeight: 500 }}>
                    Design generation failed
                  </span>
                  <p style={{ fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '480px', wordBreak: 'break-word' }}>
                    {currentArtifact.error}
                  </p>
                </div>
              )}

              {currentStatus === 'done' && currentArtifact && (
                <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                  {/* Full-screen iframe preview */}
                  <div
                    style={{
                      flex: 1,
                      borderRadius: '12px',
                      overflow: 'hidden',
                      border: '1px solid rgba(255,255,255,0.06)',
                      background: '#fff',
                      position: 'relative',
                    }}
                  >
                    {previewHtml.trimStart()[0] === '<' ? (
                      <iframe
                        srcDoc={previewHtml}
                        sandbox="allow-scripts"
                        title={`${currentMeta?.label} mockup`}
                        style={{
                          width: '100%',
                          height: '100%',
                          border: 'none',
                        }}
                      />
                    ) : (
                      <div
                        style={{
                          height: '100%',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '16px',
                          background: 'rgba(8,8,6,0.95)',
                        }}
                      >
                        <AlertTriangle size={24} style={{ color: 'var(--text-dim)' }} />
                        <p className="font-mono-dm" style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                          Preview unavailable — open in a new tab instead
                        </p>
                        <div className="flex items-center gap-3">
                          <button
                            className="reveal-pill"
                            style={{ height: '34px', fontSize: '11px', padding: '0 16px' }}
                            onClick={() => openInTab(currentArtifact)}
                          >
                            <ExternalLink size={12} /> Open in new tab
                          </button>
                          <button
                            className="reveal-pill"
                            style={{ height: '34px', fontSize: '11px', padding: '0 16px' }}
                            onClick={() => downloadHtml(currentArtifact)}
                          >
                            <Download size={12} /> Download HTML
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Bottom action bar ────────────────────────────────── */}
      <div
        className="flex items-center justify-between"
        style={{
          padding: '14px 28px',
          borderTop: '1px solid rgba(255,255,255,0.045)',
          flexShrink: 0,
          background: 'rgba(8,8,6,0.8)',
        }}
      >
        <div className="flex items-center gap-3">
          {/* Rationale / tradeoffs (collapsed summary for current slide) */}
          {currentStatus === 'done' && currentArtifact && (
            <>
              {currentArtifact.rationale && (
                <span
                  style={{ fontSize: '12px', color: 'var(--text-muted)', maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  title={currentArtifact.rationale}
                >
                  {currentArtifact.rationale}
                </span>
              )}
              <div style={{ width: '1px', height: '16px', background: 'rgba(255,255,255,0.08)' }} />
              <button
                className="reveal-pill"
                style={{ height: '30px', fontSize: '10px', padding: '0 10px' }}
                onClick={() => openInTab(currentArtifact)}
              >
                <ExternalLink size={10} /> Open
              </button>
              <button
                className="reveal-pill"
                style={{ height: '30px', fontSize: '10px', padding: '0 10px' }}
                onClick={() => downloadHtml(currentArtifact)}
              >
                <Download size={10} /> HTML
              </button>
            </>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Slide counter */}
          {activeRoles.length > 1 && (
            <span className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
              {currentSlide + 1} / {activeRoles.length}
            </span>
          )}

          {/* Flag for merge */}
          {allDone && currentRole && activeRoles.length > 1 && (
            <button
              className="reveal-pill"
              style={{
                height: '36px',
                fontSize: '11px',
                padding: '0 14px',
                background: flagged.has(currentRole) ? 'rgba(201,168,76,0.12)' : 'transparent',
                borderColor: flagged.has(currentRole) ? 'var(--gold)' : undefined,
              }}
              onClick={() => toggleFlag(currentRole)}
            >
              <GitMerge size={12} />
              {flagged.has(currentRole) ? 'Flagged' : 'Flag for merge'}
            </button>
          )}

          {/* Merge button */}
          {canMerge && (
            <button
              className="reveal-pill"
              style={{
                height: '36px',
                fontSize: '12px',
                padding: '0 18px',
                background: 'var(--gold)',
                color: 'var(--void)',
                borderColor: 'transparent',
                fontWeight: 500,
              }}
              onClick={handleMerge}
            >
              <GitMerge size={14} />
              Merge {flagged.size} designs
            </button>
          )}

          {/* Accept design (select winner) */}
          {allDone && currentRole && !canMerge && (
            <button
              className="reveal-pill"
              style={{
                height: '36px',
                fontSize: '12px',
                padding: '0 18px',
                background: selected === currentRole ? (currentMeta?.color ?? 'var(--gold)') : 'var(--gold)',
                color: 'var(--void)',
                borderColor: 'transparent',
                fontWeight: 500,
              }}
              onClick={() => handleSelect(currentRole)}
            >
              <Star size={14} />
              {selected === currentRole ? 'Selected' : 'Accept Design'}
            </button>
          )}

          {/* Status text */}
          {anyLoading && (
            <span className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
              Generating designs...
            </span>
          )}
          {anyDone && !allDone && !anyLoading && (
            <span className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
              Some designers still pending
            </span>
          )}
          {allDone && !canMerge && activeRoles.length > 1 && (
            <span className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
              Accept a design or flag 2+ to merge
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
