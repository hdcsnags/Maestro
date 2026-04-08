import { useState, useCallback } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { supabase } from '../../lib/supabase';
import {
  DesignerRole, DesignMode, DESIGNER_LANES, DESIGN_MODE_LANES,
} from '../../types';
import {
  Palette, Play, Star, GitMerge, ExternalLink, Download,
  Loader2, AlertTriangle, SkipForward,
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

/* ── Helpers ────────────────────────────────────────────────── */

/** Safely extract clean HTML from an artifact's html_content field.
 *  The design edge function often returns AI-generated responses where
 *  html_content is double-wrapped: ```json fence around {"html_content": "<!DOCTYPE..."}
 *  with escaped newlines that break JSON.parse. This handles all cases. */
function extractHtml(raw: string): string {
  if (!raw) return '';
  let html = raw;

  // Strip markdown code fences first (```html, ```json, ```)
  html = html.replace(/^```(?:html|json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');

  // Try JSON parse (works if the inner JSON is well-formed)
  if (html.trimStart().startsWith('{')) {
    try {
      const parsed = JSON.parse(html);
      if (parsed.html_content) html = parsed.html_content;
    } catch {
      // JSON.parse failed (likely raw newlines inside string values).
      // Use regex to extract the html_content value.
      const match = html.match(/"html_content"\s*:\s*"(<!DOCTYPE[\s\S]*)/i);
      if (match) {
        // Grab everything after "html_content": " up to the last closing structure
        let extracted = match[1];
        // Remove trailing ",\n  "rationale"..." or "}\n}" junk after the HTML
        // Find the last </html> and cut there
        const htmlEnd = extracted.lastIndexOf('</html>');
        if (htmlEnd !== -1) {
          extracted = extracted.substring(0, htmlEnd + 7);
        } else {
          // No </html> found — trim trailing JSON structure
          extracted = extracted.replace(/"\s*,\s*"rationale"[\s\S]*$/, '');
          extracted = extracted.replace(/"\s*\}\s*$/, '');
        }
        html = extracted;
      }
    }
  }

  // Replace escaped newlines with real newlines
  html = html.replace(/\\n/g, '\n');
  // Replace escaped quotes
  html = html.replace(/\\"/g, '"');
  // Replace escaped backslashes
  html = html.replace(/\\\\/g, '\\');

  return html;
}

/* ── Constants ─────────────────────────────────────────────── */

const ROLE_COLOR: Record<DesignerRole, string> = {
  visual_spatial: '#5a8fe0',
  structure_ux: '#e07b5a',
  product_practical: '#5ab88e',
  wildcard_fusion: '#8a8ae0',
};

const MODE_LABELS: Record<DesignMode, string> = {
  lite: 'Lite',
  standard: 'Standard',
  exploration: 'Exploration',
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

  const isVisible = session?.current_phase === 'design';
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? '';
  }, []);

  /* ── Run designers ───────────────────────────────────────── */
  const handleRun = useCallback(async () => {
    if (!session) return;
    setRunning(true);
    setGlobalError('');
    setSelected(null);
    setFlagged(new Set());

    // Set all active lanes to loading
    const newStatuses = { ...statuses };
    activeRoles.forEach(r => { newStatuses[r] = 'loading'; });
    setStatuses(newStatuses);

    try {
      const token = await getToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/design`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: session.id,
          design_mode: designMode,
          brief,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
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
  }, [session, designMode, brief, activeRoles, artifacts, statuses, supabaseUrl, getToken]);

  /* ── Selection / merge ───────────────────────────────────── */
  const handleSelect = useCallback(async (role: DesignerRole) => {
    if (!session) return;
    setSelected(role);
    setFlagged(new Set());

    // Mark in DB
    await supabase
      .from('design_artifacts')
      .update({ selected_for_build: true } as never)
      .eq('session_id', session.id)
      .eq('designer_role', role);

    // Advance to pre_build
    await supabase
      .from('sessions')
      .update({ current_phase: 'pre_build' } as never)
      .eq('id', session.id);

    dispatch({
      type: 'SET_ACTIVE_SESSION',
      payload: { ...session, current_phase: 'pre_build' },
    });

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

    // Mark flagged in DB
    for (const role of roles) {
      await supabase
        .from('design_artifacts')
        .update({ flagged_by_conductor: true } as never)
        .eq('session_id', session.id)
        .eq('designer_role', role);
    }

    // Advance to pre_build
    await supabase
      .from('sessions')
      .update({ current_phase: 'pre_build' } as never)
      .eq('id', session.id);

    dispatch({
      type: 'SET_ACTIVE_SESSION',
      payload: { ...session, current_phase: 'pre_build' },
    });

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
    dispatch({
      type: 'SET_ACTIVE_SESSION',
      payload: { ...session, current_phase: 'pre_build' },
    });
    dispatch({ type: 'OPEN_DRAWER', payload: 'pre-build' });
    dispatch({ type: 'SHOW_TOAST', payload: 'Design skipped. Moving to Pre-Build.' });
  }, [session, dispatch]);

  /* ── Download HTML ───────────────────────────────────────── */
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
  const canMerge = flagged.size >= 2;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center" style={{ background: 'rgba(8,8,6,0.6)', backdropFilter: 'blur(6px)' }}>
      <div
        style={{
          width: '100%', maxWidth: '960px', maxHeight: '90vh',
          margin: '0 24px', borderRadius: '24px',
          border: '1px solid rgba(201,168,76,0.15)',
          background: 'linear-gradient(180deg, rgba(18,17,14,0.99), rgba(12,11,9,0.99))',
          boxShadow: '0 0 80px rgba(201,168,76,0.06), 0 24px 48px rgba(0,0,0,0.4)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        {/* ── Header ───────────────────────────────────────────── */}
        <div className="flex items-center justify-between" style={{ padding: '20px 28px', borderBottom: '1px solid rgba(255,255,255,0.045)' }}>
          <div className="flex items-center gap-3">
            <Palette size={16} style={{ color: 'var(--gold)' }} />
            <span className="font-mono-dm" style={{ fontSize: '11px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold)' }}>
              Design Phase
            </span>
            <span className="font-mono-dm" style={{
              fontSize: '9px', letterSpacing: '0.12em',
              color: ROLE_COLOR.visual_spatial, padding: '2px 10px',
              borderRadius: '6px', background: 'rgba(90,143,224,0.08)',
              border: '1px solid rgba(90,143,224,0.15)',
            }}>
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
              Skip design →
            </button>
            <button
              className="reveal-pill"
              style={{
                height: '34px', fontSize: '11px', padding: '0 16px',
                background: running ? 'transparent' : 'var(--gold)',
                color: running ? 'var(--text-muted)' : 'var(--void)',
                borderColor: running ? undefined : 'transparent',
                fontWeight: 500, cursor: running ? 'not-allowed' : 'pointer',
              }}
              onClick={handleRun}
              disabled={running}
            >
              {running ? <Loader2 size={14} className="animate-spin" /> : <Play size={12} />}
              {running ? 'Running…' : 'Run Designers →'}
            </button>
          </div>
        </div>

        {/* ── Global error ─────────────────────────────────────── */}
        {globalError && (
          <div className="flex items-center gap-2" style={{ padding: '12px 28px', background: 'rgba(224,90,90,0.06)', borderBottom: '1px solid rgba(224,90,90,0.12)' }}>
            <AlertTriangle size={14} style={{ color: 'var(--risk)' }} />
            <span style={{ fontSize: '13px', color: 'var(--risk)' }}>{globalError}</span>
          </div>
        )}

        {/* ── Designer cards grid ──────────────────────────────── */}
        <div style={{
          padding: '24px 28px', overflowY: 'auto', flex: 1,
          display: 'grid',
          gridTemplateColumns: activeRoles.length <= 2 ? 'repeat(auto-fit, minmax(360px, 1fr))' : 'repeat(2, 1fr)',
          gap: '20px',
        }}>
          {activeRoles.map(role => {
            const lane = DESIGNER_LANES.find(l => l.role === role)!;
            const artifact = artifacts[role];
            const status = statuses[role];
            const isFlagged = flagged.has(role);
            const isSelected = selected === role;
            const color = ROLE_COLOR[role];

            return (
              <DesignerCard
                key={role}
                lane={lane}
                artifact={artifact}
                status={status}
                color={color}
                isFlagged={isFlagged}
                isSelected={isSelected}
                allDone={allDone}
                onSelect={() => handleSelect(role)}
                onToggleFlag={() => toggleFlag(role)}
                onDownload={() => artifact && downloadHtml(artifact)}
                onOpenTab={() => artifact && openInTab(artifact)}
              />
            );
          })}
        </div>

        {/* ── Footer actions ───────────────────────────────────── */}
        {anyDone && (
          <div className="flex items-center justify-between" style={{ padding: '16px 28px', borderTop: '1px solid rgba(255,255,255,0.045)' }}>
            <div className="flex items-center gap-3">
              {canMerge && (
                <button
                  className="reveal-pill"
                  style={{
                    height: '36px', fontSize: '12px', padding: '0 18px',
                    background: 'var(--gold)', color: 'var(--void)',
                    borderColor: 'transparent', fontWeight: 500,
                  }}
                  onClick={handleMerge}
                >
                  <GitMerge size={14} />
                  Merge {flagged.size} flagged →
                </button>
              )}
            </div>
            <span className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.1em' }}>
              {allDone ? 'Select a winner or flag two+ to merge' : 'Waiting for all designers…'}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── DesignerCard sub-component ───────────────────────────── */

interface DesignerCardProps {
  lane: { role: DesignerRole; display_name: string; description: string };
  artifact: DesignArtifact | null;
  status: ArtifactStatus;
  color: string;
  isFlagged: boolean;
  isSelected: boolean;
  allDone: boolean;
  onSelect: () => void;
  onToggleFlag: () => void;
  onDownload: () => void;
  onOpenTab: () => void;
}

function DesignerCard({
  lane, artifact, status, color,
  isFlagged, isSelected, allDone,
  onSelect, onToggleFlag, onDownload, onOpenTab,
}: DesignerCardProps) {
  const [previewExpanded, setPreviewExpanded] = useState(false);

  return (
    <div style={{
      borderRadius: '16px',
      border: `1px solid ${isSelected ? color : isFlagged ? 'rgba(201,168,76,0.35)' : 'rgba(255,255,255,0.06)'}`,
      background: isSelected ? `${color}08` : isFlagged ? 'rgba(201,168,76,0.04)' : 'rgba(255,255,255,0.02)',
      overflow: 'hidden',
      transition: 'border-color 0.2s, background 0.2s',
    }}>
      {/* Card header */}
      <div className="flex items-center gap-3" style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, boxShadow: `0 0 8px ${color}60` }} />
        <span className="font-mono-dm" style={{ fontSize: '11px', letterSpacing: '0.15em', textTransform: 'uppercase', color }}>
          {lane.display_name}
        </span>
        {artifact?.model_used && (
          <span className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--text-dim)', marginLeft: 'auto' }}>
            {artifact.model_used}
          </span>
        )}
      </div>

      {/* Card body */}
      <div style={{ padding: '16px 20px' }}>
        {status === 'idle' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Palette size={24} style={{ color: 'var(--text-dim)', margin: '0 auto 12px', display: 'block' }} />
            <p className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.12em' }}>
              {lane.description}
            </p>
          </div>
        )}

        {status === 'loading' && (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Loader2 size={24} className="animate-spin" style={{ color, margin: '0 auto 12px', display: 'block' }} />
            <p className="font-mono-dm" style={{ fontSize: '11px', color, letterSpacing: '0.1em', fontWeight: 500 }}>
              {lane.display_name} is designing…
            </p>
            <p className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.08em', marginTop: '6px' }}>
              This may take 30–60 seconds
            </p>
          </div>
        )}

        {status === 'error' && artifact?.error && (
          <div style={{ padding: '20px 0' }}>
            <div className="flex items-center gap-2" style={{ marginBottom: '8px' }}>
              <AlertTriangle size={14} style={{ color: 'var(--risk)' }} />
              <span style={{ fontSize: '12px', color: 'var(--risk)', fontWeight: 500 }}>Failed</span>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5, margin: 0, wordBreak: 'break-word' }}>
              {artifact.error}
            </p>
          </div>
        )}

        {status === 'done' && artifact && (
          <>
            {/* HTML preview */}
            <div
              style={{
                borderRadius: '10px', overflow: 'hidden',
                border: '1px solid rgba(255,255,255,0.06)',
                marginBottom: '16px', cursor: 'pointer',
                height: previewExpanded ? '500px' : '240px',
                transition: 'height 0.3s ease',
              }}
              onClick={() => setPreviewExpanded(!previewExpanded)}
            >
              <iframe
                srcDoc={extractHtml(artifact.html_content)}
                sandbox="allow-scripts"
                title={`${lane.display_name} mockup`}
                style={{ width: '100%', height: '100%', border: 'none', pointerEvents: previewExpanded ? 'auto' : 'none' }}
              />
            </div>

            {/* Action row */}
            <div className="flex items-center gap-2" style={{ marginBottom: '16px' }}>
              <button className="reveal-pill" style={{ height: '30px', fontSize: '10px', padding: '0 12px' }} onClick={onOpenTab}>
                <ExternalLink size={10} /> Open ↗
              </button>
              <button className="reveal-pill" style={{ height: '30px', fontSize: '10px', padding: '0 12px' }} onClick={onDownload}>
                <Download size={10} /> HTML
              </button>
            </div>

            {/* Rationale */}
            {artifact.rationale && (
              <section style={{ marginBottom: '12px' }}>
                <div className="font-mono-dm" style={{ fontSize: '8px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '6px' }}>
                  Rationale
                </div>
                <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'rgba(232,230,224,0.82)', margin: 0, fontWeight: 300 }}>
                  {artifact.rationale}
                </p>
              </section>
            )}

            {/* Tradeoffs */}
            {artifact.tradeoffs && (
              <section style={{ marginBottom: '16px' }}>
                <div className="font-mono-dm" style={{ fontSize: '8px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '6px' }}>
                  Tradeoffs
                </div>
                <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'rgba(232,230,224,0.72)', margin: 0, fontWeight: 300 }}>
                  {artifact.tradeoffs}
                </p>
              </section>
            )}

            {/* Select / Flag buttons */}
            {allDone && (
              <div className="flex items-center gap-2">
                <button
                  className="reveal-pill"
                  style={{
                    height: '32px', fontSize: '11px', padding: '0 14px',
                    background: isSelected ? color : 'transparent',
                    color: isSelected ? 'var(--void)' : color,
                    borderColor: isSelected ? 'transparent' : `${color}40`,
                    fontWeight: isSelected ? 600 : 400,
                  }}
                  onClick={onSelect}
                >
                  <Star size={12} />
                  {isSelected ? 'Selected' : 'Select this'}
                </button>
                <button
                  className="reveal-pill"
                  style={{
                    height: '32px', fontSize: '11px', padding: '0 14px',
                    background: isFlagged ? 'rgba(201,168,76,0.12)' : 'transparent',
                    borderColor: isFlagged ? 'var(--gold)' : undefined,
                  }}
                  onClick={onToggleFlag}
                >
                  <GitMerge size={12} />
                  {isFlagged ? 'Flagged' : 'Flag for merge'}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
