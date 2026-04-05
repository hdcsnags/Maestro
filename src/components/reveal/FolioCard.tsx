import { Response as MaestroResponse } from '../../types';
import { useMaestro } from '../../context/MaestroContext';
import { supabase } from '../../lib/supabase';
import { useState, useEffect } from 'react';
import { Flag, Star, ChevronDown, ChevronUp } from 'lucide-react';
import ArtifactDownload from './ArtifactDownload';

const STORAGE_KEY = 'maestro:signals-expanded';

interface Props {
  response: MaestroResponse;
  roundNumber: number;
}

export default function FolioCard({ response, roundNumber }: Props) {
  const { dispatch } = useMaestro();
  const [flagging, setFlagging] = useState(false);
  const [signalsExpanded, setSignalsExpanded] = useState(() => {
    try { return localStorage.getItem(STORAGE_KEY) === 'true'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, String(signalsExpanded)); } catch { /* noop */ }
  }, [signalsExpanded]);

  const handleFlag = async () => {
    setFlagging(true);
    const newFlagged = !response.is_flagged;
    await supabase
      .from('responses')
      .update({ is_flagged: newFlagged } as never)
      .eq('id', response.id);
    dispatch({ type: 'UPDATE_RESPONSE', payload: { id: response.id, is_flagged: newFlagged } });
    setFlagging(false);
  };

  const handleLead = async () => {
    const newLead = !response.is_lead;
    await supabase
      .from('responses')
      .update({ is_lead: newLead } as never)
      .eq('id', response.id);
    dispatch({ type: 'UPDATE_RESPONSE', payload: { id: response.id, is_lead: newLead } });
  };

  const signals = response.signals || {};
  const signalEntries = Object.entries(signals).filter(([, v]) => v).slice(0, 3);
  const roundLabel = `Round ${String(roundNumber).padStart(2, '0')}`;
  const artifacts = response.artifacts || [];

  return (
    <div className="h-full flex flex-col" style={{ position: 'relative', zIndex: 2 }}>
      <div
        className="flex items-center justify-between flex-shrink-0"
        style={{ padding: '22px 28px 16px', borderBottom: '1px solid rgba(255,255,255,0.045)' }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex-shrink-0"
            style={{
              width: '9px',
              height: '9px',
              borderRadius: '50%',
              background: response.agent_color,
              boxShadow: `0 0 18px ${response.agent_color}`,
            }}
          />
          <div className="min-w-0">
            <div
              className="font-mono-dm"
              style={{
                fontSize: '11px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase' as const,
                color: response.agent_color,
                whiteSpace: 'nowrap',
              }}
            >
              {response.agent_name} -- {response.agent_role}
            </div>
            <div
              className="font-mono-dm"
              style={{ fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase' as const, color: 'var(--text-dim)' }}
            >
              {roundLabel}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleFlag}
            disabled={flagging}
            className="reveal-chip"
            style={response.is_flagged ? {
              color: 'var(--gold)',
              borderColor: 'rgba(201,168,76,0.3)',
              background: 'rgba(201,168,76,0.08)',
              cursor: 'pointer',
            } : { cursor: 'pointer' }}
          >
            <Flag size={11} />
            {response.is_flagged ? 'Flagged' : 'Flag'}
          </button>
          <button
            onClick={handleLead}
            className="reveal-chip"
            style={response.is_lead ? {
              color: 'var(--text)',
              borderColor: 'rgba(255,255,255,0.2)',
              background: 'rgba(255,255,255,0.06)',
              cursor: 'pointer',
            } : { cursor: 'pointer' }}
          >
            <Star size={11} />
            {response.is_lead ? 'Lead' : 'Set lead'}
          </button>
        </div>
      </div>

      {!signalsExpanded && signalEntries.length > 0 && (
        <div
          className="flex items-center gap-2 flex-shrink-0"
          style={{
            padding: '8px 28px',
            borderBottom: '1px solid rgba(255,255,255,0.03)',
            background: 'rgba(255,255,255,0.012)',
          }}
        >
          <div className="flex items-center gap-2 flex-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
            {signalEntries.map(([key, val]) => {
              const lc = String(val ?? '').toLowerCase();
              const isPositive = lc.includes('high') || lc.includes('ok') || lc.includes('safe') || lc.includes('strong');
              const isWarning = lc.includes('warn') || lc.includes('risk') || lc.includes('caution') || lc.includes('medium');
              const dotColor = isPositive ? 'var(--ok)' : isWarning ? 'var(--warn)' : 'var(--text-muted)';
              return (
                <div
                  key={key}
                  className="flex items-center gap-1.5"
                  title={`${key.replace(/_/g, ' ')}: ${val}`}
                  style={{ flexShrink: 0 }}
                >
                  <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: dotColor, boxShadow: `0 0 4px ${dotColor}` }} />
                  <span className="font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.1em', textTransform: 'uppercase' as const, color: 'var(--text-dim)' }}>
                    {key.replace(/_/g, ' ')}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              className="keycap"
              style={{ width: '22px', height: '22px', minWidth: '22px', fontSize: '9px' }}
              onClick={handleFlag}
              title="Flag for synthesis"
            >
              <Flag size={9} />
            </button>
            <button
              className="keycap"
              style={{ width: '22px', height: '22px', minWidth: '22px', fontSize: '9px' }}
              onClick={() => dispatch({ type: 'OPEN_DRAWER', payload: 'synthesis' })}
              title="Open synthesis"
            >
              S
            </button>
            <button
              className="keycap"
              style={{ width: '22px', height: '22px', minWidth: '22px' }}
              onClick={() => setSignalsExpanded(true)}
              title="Expand signals"
            >
              <ChevronDown size={10} />
            </button>
          </div>
        </div>
      )}

      <div
        className="flex-1 overflow-y-auto"
        style={{ padding: '28px 28px 24px' }}
      >
        <div
          className="gap-6"
          style={{
            display: signalsExpanded ? 'grid' : 'block',
            gridTemplateColumns: signalsExpanded && window.innerWidth > 860 ? '1.25fr 0.9fr' : '1fr',
            height: '100%',
          }}
        >
          <div className="flex flex-col min-w-0">
            {response.title && (
              <h2
                className="font-syne"
                style={{
                  margin: '0 0 16px',
                  fontSize: 'clamp(22px, 2.4vw, 36px)',
                  lineHeight: 1.06,
                  fontWeight: 400,
                  letterSpacing: '-0.04em',
                  color: 'var(--text)',
                  maxWidth: signalsExpanded ? '14ch' : '28ch',
                }}
              >
                {response.title}
              </h2>
            )}
            <div
              style={{
                fontSize: '17px',
                lineHeight: 1.72,
                color: 'rgba(232,230,224,0.88)',
                fontWeight: 300,
                maxWidth: signalsExpanded ? '36ch' : '60ch',
              }}
            >
              {response.content}
            </div>

            <ArtifactDownload artifacts={artifacts} agentColor={response.agent_color} />

            <div className="mt-auto pt-6 flex items-center gap-3" style={{ color: 'var(--text-dim)' }}>
              <div style={{ height: '1px', width: '72px', background: 'linear-gradient(90deg, rgba(255,255,255,0.22), transparent)' }} />
              <span className="font-mono-dm" style={{ fontSize: '11px', letterSpacing: '0.18em', textTransform: 'uppercase' as const }}>
                {response.agent_name} -- {response.model}
              </span>
            </div>
          </div>

          {signalsExpanded && (
            <aside
              className="flex flex-col gap-4"
              style={{
                border: '1px solid rgba(255,255,255,0.055)',
                background: 'rgba(255,255,255,0.025)',
                borderRadius: '24px',
                padding: '20px',
              }}
            >
              <div className="flex items-center justify-between">
                <span className="reveal-label">Signals</span>
                <button
                  className="keycap"
                  style={{ width: '22px', height: '22px', minWidth: '22px' }}
                  onClick={() => setSignalsExpanded(false)}
                  title="Collapse signals"
                >
                  <ChevronUp size={10} />
                </button>
              </div>

              {signalEntries.length > 0 ? (
                <div className="flex flex-col gap-3">
                  {signalEntries.map(([key, val]) => (
                    <SignalRow key={key} label={key} value={String(val ?? '')} />
                  ))}
                </div>
              ) : (
                <div style={{ color: 'var(--text-dim)', fontSize: '13px' }}>
                  No structured signals returned.
                </div>
              )}

              <div className="mt-auto flex gap-2 flex-wrap">
                <button className="reveal-pill" onClick={handleFlag} style={{ fontSize: '12px', height: '34px' }}>
                  Flag for synthesis
                </button>
                <button className="reveal-pill primary" style={{ fontSize: '12px', height: '34px' }}
                  onClick={() => dispatch({ type: 'OPEN_DRAWER', payload: 'synthesis' })}
                >
                  Open synthesis
                </button>
              </div>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}

function SignalRow({ label, value }: { label: string; value: string }) {
  const lc = value.toLowerCase();
  const isPositive = lc.includes('high') || lc.includes('ok') || lc.includes('safe') || lc.includes('strong');
  const isWarning = lc.includes('warn') || lc.includes('risk') || lc.includes('caution') || lc.includes('medium');
  const color = isPositive ? 'var(--ok)' : isWarning ? 'var(--warn)' : 'var(--text)';

  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: '18px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.045)',
      }}
    >
      <div className="font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: 'var(--text-dim)', marginBottom: '4px' }}>
        {label.replace(/_/g, ' ')}
      </div>
      <div className="text-sm" style={{ color, fontWeight: 500 }}>{value}</div>
    </div>
  );
}
