import { useState, useMemo, useEffect } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { useOrchestration } from '../../hooks/useOrchestration';
import { Response as MaestroResponse, ExecutionMode } from '../../types';
import { supabase } from '../../lib/supabase';

interface Contradiction {
  topic: string;
  agents: Array<{ name: string; color: string; position: string }>;
}

const PATTERNS = [
  { topic: 'Database', keywords: ['supabase', 'firebase', 'postgres', 'mongodb', 'mysql', 'sqlite'] },
  { topic: 'Auth strategy', keywords: ['oauth', 'jwt', 'session', 'magic link', 'password', 'passkey'] },
  { topic: 'Architecture', keywords: ['monolith', 'microservice', 'serverless', 'edge function', 'lambda'] },
  { topic: 'Framework', keywords: ['react', 'vue', 'angular', 'svelte', 'next', 'remix', 'astro'] },
  { topic: 'Deployment', keywords: ['vercel', 'netlify', 'aws', 'gcp', 'azure', 'fly.io', 'render'] },
  { topic: 'Scope', keywords: ['phase 1', 'phase 2', 'v1', 'mvp', 'scope', 'later', 'defer', 'now'] },
];

function detectContradictions(responses: MaestroResponse[]): Contradiction[] {
  if (responses.length < 2) return [];
  const result: Contradiction[] = [];
  for (const pattern of PATTERNS) {
    const matches: Array<{ name: string; color: string; position: string; keyword: string }> = [];
    for (const r of responses) {
      const text = (r.content + ' ' + r.title).toLowerCase();
      const kw = pattern.keywords.find(k => text.includes(k));
      if (kw) matches.push({ name: r.agent_name, color: r.agent_color, position: kw, keyword: kw });
    }
    if (matches.length >= 2 && new Set(matches.map(m => m.keyword)).size >= 2) {
      result.push({ topic: pattern.topic, agents: matches });
    }
  }
  return result.slice(0, 4);
}

type VerificationState = 'idle' | 'running' | 'passed' | 'failed';

export default function SynthesisDrawer() {
  const { state, dispatch } = useMaestro();
  const { synthesize, newRound } = useOrchestration();
  const isOpen = state.activeDrawer === 'synthesis';

  const [isWide, setIsWide] = useState(() => typeof window !== 'undefined' && window.innerWidth > 860);
  useEffect(() => {
    const handler = () => setIsWide(window.innerWidth > 860);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const latestRound = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1] : null;
  const latestResponses = useMemo(
    () => latestRound ? state.responses.filter(r => r.round_id === latestRound.id) : [],
    [latestRound, state.responses],
  );
  const latestSynthesis = latestRound ? state.syntheses.find(s => s.round_id === latestRound.id) : null;
  const flaggedResponses = latestResponses.filter(r => r.is_flagged);

  const contradictions = useMemo(() => detectContradictions(latestResponses), [latestResponses]);
  const hasContradictions = contradictions.length > 0;

  const [verificationState, setVerificationState] = useState<VerificationState>('idle');
  const [verificationNote, setVerificationNote] = useState('');

  const handleSynthesize = () => {
    if (latestRound) synthesize(latestRound.id);
  };

  const handleVerify = async () => {
    setVerificationState('running');
    setVerificationNote('');
    await new Promise(r => setTimeout(r, 1400));
    if (hasContradictions) {
      setVerificationState('failed');
      setVerificationNote(`${contradictions.length} contradiction(s) detected. Resolve divergences before proceeding to execution.`);
    } else {
      setVerificationState('passed');
      setVerificationNote('No contradictions detected. Scope within session bounds. Safe to proceed to patch generation.');
    }
  };

  const handleNewRound = () => {
    newRound();
  };

  const handleModeChange = async (mode: ExecutionMode) => {
    dispatch({ type: 'SET_EXECUTION_MODE', payload: mode });
    if (state.activeSession) {
      await supabase
        .from('sessions')
        .update({ execution_mode: mode } as never)
        .eq('id', state.activeSession.id);
      dispatch({ type: 'UPDATE_ACTIVE_SESSION', payload: { execution_mode: mode } });
    }
  };

  const canExecute = verificationState === 'passed';
  const verificationColor =
    verificationState === 'passed' ? 'var(--ok)' :
    verificationState === 'failed' ? 'var(--risk)' :
    verificationState === 'running' ? 'var(--warn)' : 'var(--text-dim)';

  return (
    <aside className={`drawer-panel drawer-bottom ${isOpen ? 'open' : ''}`}>
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <div className="reveal-label" style={{ marginBottom: '6px' }}>Council Synthesis</div>
          <h3
            className="font-syne"
            style={{ margin: 0, fontSize: '24px', fontWeight: 400, letterSpacing: '-0.03em', color: 'var(--text)' }}
          >
            Merge the signal, not the clutter
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {hasContradictions && (
            <span className="reveal-chip" style={{ color: 'var(--warn)', borderColor: 'rgba(224,169,74,0.25)', background: 'rgba(224,169,74,0.08)' }}>
              {contradictions.length} conflict{contradictions.length > 1 ? 's' : ''}
            </span>
          )}
          {latestResponses.length > 0 && !latestSynthesis && (
            <button className="reveal-pill primary" style={{ height: '34px', fontSize: '12px' }} onClick={handleSynthesize}>
              Synthesize
            </button>
          )}
          <button className="keycap" onClick={() => dispatch({ type: 'CLOSE_TRANSIENT' })}>Esc</button>
        </div>
      </div>

      <div
        className="grid gap-5"
        style={{
          gridTemplateColumns: isWide ? '0.86fr 1.14fr' : '1fr',
          height: 'calc(100% - 80px)',
          overflow: 'auto',
        }}
      >
        <div className="flex flex-col gap-3">
          {hasContradictions && (
            <div className="flex flex-col gap-2">
              {contradictions.map((c) => (
                <div
                  key={c.topic}
                  className="rounded-xl p-3"
                  style={{ background: 'rgba(224,169,74,0.06)', border: '1px solid rgba(224,169,74,0.18)' }}
                >
                  <div
                    className="font-mono-dm mb-2"
                    style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--warn)' }}
                  >
                    {c.topic}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {c.agents.slice(0, 3).map((agent, j) => (
                      <div key={agent.name} className="flex items-center gap-1.5">
                        {j > 0 && <span style={{ color: 'var(--text-dim)', fontSize: '10px' }}>vs</span>}
                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: agent.color, boxShadow: `0 0 4px ${agent.color}` }} />
                        <span className="font-mono-dm" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{agent.name}</span>
                        <span className="font-mono-dm" style={{ color: agent.color, background: `${agent.color}14`, fontSize: '9px', padding: '1px 6px', borderRadius: '4px' }}>
                          {agent.position}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {latestSynthesis && (
            <div className="reveal-card">
              <div className="reveal-label mb-2">Consensus</div>
              <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6, margin: 0 }}>
                {latestSynthesis.metadata?.consensus || latestSynthesis.content}
              </p>
              {latestSynthesis.metadata?.recommendation && (
                <>
                  <div className="reveal-label mt-3 mb-2" style={{ color: 'var(--gold)' }}>Recommendation</div>
                  <p style={{ color: 'var(--text-muted)', fontSize: '14px', lineHeight: 1.6, margin: 0 }}>
                    {latestSynthesis.metadata.recommendation}
                  </p>
                </>
              )}
            </div>
          )}

          {latestSynthesis?.metadata?.trade_offs && latestSynthesis.metadata.trade_offs.length > 0 && (
            <div className="reveal-card">
              <div className="reveal-label mb-3" style={{ color: 'var(--warn)' }}>
                Trade-offs · {latestSynthesis.metadata.trade_offs.length}
              </div>
              <div className="flex flex-col gap-3">
                {latestSynthesis.metadata.trade_offs.map((trade, i) => (
                  <div
                    key={i}
                    className="rounded-xl p-3"
                    style={{ background: 'rgba(224,169,74,0.05)', border: '1px solid rgba(224,169,74,0.15)' }}
                  >
                    <div
                      className="font-mono-dm mb-2"
                      style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--warn)' }}
                    >
                      {trade.axis}
                    </div>
                    <div className="flex flex-col gap-2">
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        <span style={{ color: 'var(--text)', fontWeight: 500 }}>{trade.side_a.agent}:</span> {trade.side_a.position}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-dim)', textAlign: 'center' }}>vs</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                        <span style={{ color: 'var(--text)', fontWeight: 500 }}>{trade.side_b.agent}:</span> {trade.side_b.position}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {latestSynthesis?.metadata?.unresolved_tensions && latestSynthesis.metadata.unresolved_tensions.length > 0 && (
            <div
              className="rounded-xl p-3"
              style={{ background: 'rgba(224,90,90,0.05)', border: '1px solid rgba(224,90,90,0.18)' }}
            >
              <div
                className="font-mono-dm mb-2"
                style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--risk)' }}
              >
                Unresolved · You decide
              </div>
              <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.6 }}>
                {latestSynthesis.metadata.unresolved_tensions.map((tension, i) => (
                  <li key={i} style={{ marginBottom: '4px' }}>{tension}</li>
                ))}
              </ul>
            </div>
          )}

          {latestSynthesis?.metadata?.acknowledged_weaknesses && latestSynthesis.metadata.acknowledged_weaknesses.length > 0 && (
            <div className="reveal-card">
              <div className="reveal-label mb-2">Acknowledged weaknesses</div>
              <div className="flex flex-col gap-2">
                {latestSynthesis.metadata.acknowledged_weaknesses.map((aw, i) => (
                  <div key={i} style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    <span style={{ color: 'var(--text)', fontWeight: 500 }}>{aw.agent}:</span> {aw.weakness}
                  </div>
                ))}
              </div>
            </div>
          )}

          {flaggedResponses.length > 0 && (
            <div className="reveal-card">
              <div className="reveal-label mb-2">Flagged responses ({flaggedResponses.length})</div>
              <div className="flex flex-col gap-1.5">
                {flaggedResponses.map(r => (
                  <div key={r.id} className="flex items-center gap-2">
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: r.agent_color }} />
                    <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{r.agent_name}: {r.title || 'Untitled'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {verificationState !== 'idle' && (
            <div
              className="rounded-xl p-3"
              style={{
                background: verificationState === 'passed' ? 'rgba(78,187,127,0.06)' : verificationState === 'failed' ? 'rgba(224,90,90,0.06)' : 'rgba(224,169,74,0.06)',
                border: `1px solid ${verificationState === 'passed' ? 'rgba(78,187,127,0.2)' : verificationState === 'failed' ? 'rgba(224,90,90,0.2)' : 'rgba(224,169,74,0.2)'}`,
              }}
            >
              <div className="flex items-center gap-2 mb-1">
                <div
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    background: verificationColor,
                    boxShadow: `0 0 6px ${verificationColor}`,
                    animation: verificationState === 'running' ? 'heartbeat 1s ease-in-out infinite' : 'none',
                  }}
                />
                <span className="font-mono-dm" style={{ fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: verificationColor }}>
                  {verificationState === 'running' && 'Verification running...'}
                  {verificationState === 'passed' && 'Verification passed'}
                  {verificationState === 'failed' && 'Verification failed'}
                </span>
              </div>
              {verificationNote && (
                <p style={{ color: 'var(--text-muted)', fontSize: '12px', margin: 0, lineHeight: 1.5 }}>{verificationNote}</p>
              )}
            </div>
          )}

          <div className="flex gap-2 flex-wrap mt-auto">
            {verificationState === 'idle' && latestSynthesis && (
              <button className="reveal-pill" style={{ height: '34px', fontSize: '12px', color: 'var(--ok)', borderColor: 'rgba(78,187,127,0.25)' }} onClick={handleVerify}>
                Verify
              </button>
            )}
            {(verificationState === 'passed' || verificationState === 'failed') && (
              <button className="reveal-pill" style={{ height: '34px', fontSize: '12px' }} onClick={() => { setVerificationState('idle'); setVerificationNote(''); }}>
                Re-verify
              </button>
            )}
            <button
              className="reveal-pill"
              style={{ height: '34px', fontSize: '12px', opacity: canExecute ? 1 : 0.4, pointerEvents: canExecute ? 'auto' : 'none' }}
              onClick={() => dispatch({ type: 'SET_PATCH_MODAL', payload: true })}
            >
              Generate patch
            </button>
            {state.activeRepoConnection && (
              <button
                className="reveal-pill primary"
                style={{ height: '34px', fontSize: '12px', opacity: canExecute ? 1 : 0.4, pointerEvents: canExecute ? 'auto' : 'none' }}
                onClick={() => { dispatch({ type: 'CLOSE_TRANSIENT' }); dispatch({ type: 'SET_EXECUTION_MODAL', payload: true }); }}
              >
                Prepare execution
              </button>
            )}
            <button className="reveal-pill" style={{ height: '34px', fontSize: '12px' }} onClick={handleNewRound}>
              New round
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="reveal-card">
            <div className="reveal-label mb-3">Execution Mode</div>
            <div className="flex flex-col gap-2">
              {([
                { id: 'analyze' as const, label: 'Analyze', desc: 'Read-only inspection. No writes.' },
                { id: 'pr_flow' as const, label: 'PR Flow', desc: 'Branch, patch, pull request.' },
                { id: 'elevated' as const, label: 'Elevated', desc: 'Direct write. Requires approval.' },
              ]).map(mode => (
                <button
                  key={mode.id}
                  onClick={() => handleModeChange(mode.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px 14px',
                    borderRadius: '16px',
                    border: state.executionMode === mode.id
                      ? `1px solid ${mode.id === 'elevated' ? 'rgba(224,90,90,0.3)' : 'rgba(201,168,76,0.3)'}`
                      : '1px solid rgba(255,255,255,0.05)',
                    background: state.executionMode === mode.id
                      ? mode.id === 'elevated' ? 'rgba(224,90,90,0.06)' : 'rgba(201,168,76,0.06)'
                      : 'rgba(255,255,255,0.02)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      flexShrink: 0,
                      background: state.executionMode === mode.id
                        ? mode.id === 'elevated' ? 'var(--risk)' : 'var(--gold)'
                        : 'rgba(255,255,255,0.12)',
                      boxShadow: state.executionMode === mode.id
                        ? `0 0 8px ${mode.id === 'elevated' ? 'var(--risk)' : 'var(--gold)'}`
                        : 'none',
                    }}
                  />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: state.executionMode === mode.id ? 'var(--text)' : 'var(--text-muted)' }}>
                      {mode.label}
                    </div>
                    <div className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px' }}>
                      {mode.desc}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="reveal-codeblock" style={{ minHeight: '120px', fontSize: '12px' }}>
{`> Session: ${state.activeSession?.title ?? 'Untitled'}
> Round: ${latestRound ? String(latestRound.round_number).padStart(2, '0') : '--'}
> Responses: ${latestResponses.length}
> Flagged: ${flaggedResponses.length}
> Contradictions: ${contradictions.length}
> Verification: ${verificationState}
> Mode: ${state.executionMode}`}
          </div>
        </div>
      </div>
    </aside>
  );
}
