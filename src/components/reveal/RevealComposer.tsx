import { useState, useRef, useMemo, useEffect, KeyboardEvent } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { useOrchestration } from '../../hooks/useOrchestration';
import { supabase } from '../../lib/supabase';
import { Send, Music, AlertTriangle } from 'lucide-react';
import { OrchestrationMode, SessionMode } from '../../types';
import { estimateBroadcastCost, formatCostRange, isFreeModel, PREMIUM_SLOT_CAP } from '../../lib/cost';

interface Props {
  onBroadcast: (prompt: string, selectedAgentIds: string[], requestedMode?: SessionMode) => Promise<void>;
}

export default function RevealComposer({ onBroadcast }: Props) {
  const { state, dispatch } = useMaestro();
  const { buildTieredContext } = useOrchestration();
  const [prompt, setPrompt] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>(
    state.agents.filter(a => a.is_active).map(a => a.id)
  );
  const [elevatedCapAck, setElevatedCapAck] = useState(false);
  const [pendingSessionMode, setPendingSessionMode] = useState<SessionMode>('ask');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const activeAgents = state.agents.filter(a => a.is_active);

  useEffect(() => {
    if (state.activeSession?.mode) {
      setPendingSessionMode(state.activeSession.mode);
    }
  }, [state.activeSession?.id, state.activeSession?.mode]);

  const sessionMode = state.activeSession?.mode ?? pendingSessionMode;

  // P10 — cost estimate (local only, never calls an API)
  const selectedAgents = useMemo(
    () => state.agents.filter(a => selectedIds.includes(a.id)),
    [state.agents, selectedIds]
  );

  const { costEstimate, premiumSelected } = useMemo(() => {
    const models = selectedAgents.map(a => a.model);
    const tiered = buildTieredContext(prompt);
    const estimate = estimateBroadcastCost(models, prompt.length, tiered.contextText.length);
    const premium = models.filter(m => !isFreeModel(m)).length;
    return { costEstimate: estimate, premiumSelected: premium };
  }, [selectedAgents, prompt, buildTieredContext]);

  // P12 — premium slot cap
  const exceedsCap = premiumSelected > PREMIUM_SLOT_CAP;
  const isElevated = state.executionMode === 'elevated';
  const capBlocks = exceedsCap && !isElevated;
  const capNeedsAck = exceedsCap && isElevated && !elevatedCapAck;

  const canSend = prompt.trim() && !state.isBroadcasting && !capBlocks && !capNeedsAck;

  const totalChars = state.responses.reduce((acc, r) => acc + r.content.length, 0);
  const estimatedTokens = Math.round(totalChars / 4);
  const contextLimit = 128000;
  const fillPct = Math.min((estimatedTokens / contextLimit) * 100, 100);
  const fillColor = fillPct > 80 ? 'var(--risk)' : fillPct > 55 ? 'var(--warn)' : 'var(--ok)';

  const handleSessionModeChange = async (mode: SessionMode) => {
    setPendingSessionMode(mode);

    if (mode === 'ask' && state.orchestrationMode !== 'analysis') {
      dispatch({ type: 'SET_ORCHESTRATION_MODE', payload: 'analysis' });
    }

    if (!state.activeSession) return;

    await supabase
      .from('sessions')
      .update({ mode } as never)
      .eq('id', state.activeSession.id);

    dispatch({ type: 'UPDATE_ACTIVE_SESSION', payload: { mode } });
    dispatch({
      type: 'SET_SESSIONS',
      payload: state.sessions.map(session =>
        session.id === state.activeSession?.id ? { ...session, mode } : session,
      ),
    });
  };

  const handleBroadcast = async () => {
    if (!canSend) return;
    const ids = selectedIds.length > 0 ? selectedIds : activeAgents.map(a => a.id);
    const text = prompt.trim();
    setPrompt('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    dispatch({ type: 'SET_FOLIO_INDEX', payload: 0 });
    await onBroadcast(text, ids, sessionMode);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleBroadcast();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setPrompt(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const toggleAgent = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  return (
    <footer
      className="absolute z-[28]"
      style={{
        left: '50%',
        bottom: '28px',
        transform: 'translateX(-50%)',
        width: 'min(980px, calc(100vw - 44px))',
      }}
    >
      {exceedsCap && (
        <div
          className="flex items-center gap-2 mb-2"
          style={{
            padding: '10px 14px',
            borderRadius: '16px',
            background: capBlocks ? 'rgba(224,90,90,0.08)' : 'rgba(224,169,74,0.08)',
            border: `1px solid ${capBlocks ? 'rgba(224,90,90,0.22)' : 'rgba(224,169,74,0.22)'}`,
            color: capBlocks ? 'var(--risk)' : 'var(--warn)',
            fontSize: '12px',
          }}
        >
          <AlertTriangle size={13} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            {premiumSelected} premium slots active — {capBlocks
              ? `switch to Elevated mode or reduce to ${PREMIUM_SLOT_CAP}`
              : 'Elevated mode still requires explicit confirmation'}
          </span>
          {isElevated && (
            <label className="flex items-center gap-1.5 cursor-pointer" style={{ flexShrink: 0 }}>
              <input
                type="checkbox"
                checked={elevatedCapAck}
                onChange={e => setElevatedCapAck(e.target.checked)}
                style={{ accentColor: 'var(--gold)', width: '13px', height: '13px' }}
              />
              <span className="font-mono-dm" style={{ fontSize: '10px', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                Confirm
              </span>
            </label>
          )}
        </div>
      )}

      <div
        className="grid items-center gap-3"
        style={{
          gridTemplateColumns: '1fr auto auto',
          padding: '10px 12px',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '28px',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.035))',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: '0 16px 60px rgba(0,0,0,0.34)',
        }}
      >
        <div className="flex flex-col">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={state.isBroadcasting}
            rows={1}
            placeholder="Direct the orchestra..."
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text)',
              fontFamily: 'inherit',
              fontSize: '16px',
              lineHeight: 1.45,
              resize: 'none',
              minHeight: '28px',
              maxHeight: '120px',
              padding: '6px 10px',
            }}
          />
          <div className="flex items-center gap-2 px-2.5 pb-1">
            {activeAgents.map(agent => (
              <button
                key={agent.id}
                onClick={() => toggleAgent(agent.id)}
                title={agent.name}
                style={{
                  width: '18px',
                  height: '18px',
                  borderRadius: '50%',
                  border: selectedIds.includes(agent.id) ? `1.5px solid ${agent.color}` : '1.5px solid rgba(255,255,255,0.12)',
                  background: selectedIds.includes(agent.id) ? `${agent.color}15` : 'transparent',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  transition: 'all 150ms',
                }}
              >
                <div
                  style={{
                    width: '5px',
                    height: '5px',
                    borderRadius: '50%',
                    background: selectedIds.includes(agent.id) ? agent.color : 'transparent',
                    boxShadow: selectedIds.includes(agent.id) ? `0 0 6px ${agent.color}` : 'none',
                  }}
                />
              </button>
            ))}
            <span className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.08em', marginLeft: '2px' }}>
              {selectedIds.length}/{activeAgents.length}
            </span>

            {selectedIds.length > 0 && (
              <>
                <div style={{ width: '1px', height: '12px', background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
                <span
                  className="font-mono-dm"
                  title="Estimated Input Cost (local calculation, not billed)"
                  style={{
                    fontSize: '9px',
                    color: costEstimate.premiumCount > 0 ? 'var(--gold)' : 'var(--text-dim)',
                    letterSpacing: '0.06em',
                  }}
                >
                  {formatCostRange(costEstimate)} across {costEstimate.total} {costEstimate.total === 1 ? 'agent' : 'agents'}
                  {costEstimate.freeCount > 0 && costEstimate.premiumCount > 0 && (
                    <span style={{ color: 'var(--ok)', marginLeft: '4px' }}>· {costEstimate.freeCount} free</span>
                  )}
                </span>
              </>
            )}

            {estimatedTokens > 0 && (
              <>
                <div style={{ width: '1px', height: '12px', background: 'rgba(255,255,255,0.08)', margin: '0 4px' }} />
                <div className="flex items-center gap-1.5">
                  <div
                    style={{
                      width: '40px',
                      height: '3px',
                      borderRadius: '2px',
                      background: 'rgba(255,255,255,0.06)',
                      overflow: 'hidden',
                    }}
                  >
                    <div style={{ width: `${fillPct}%`, height: '100%', borderRadius: '2px', background: fillColor, transition: 'width 0.5s ease' }} />
                  </div>
                  <span className="font-mono-dm" style={{ fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '0.06em' }}>
                    {(estimatedTokens / 1000).toFixed(1)}k
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <div
            className="flex items-center"
            style={{
              padding: '3px',
              borderRadius: '999px',
              border: '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            {(['ask', 'build'] as SessionMode[]).map(mode => {
              const active = sessionMode === mode;
              return (
                <button
                  key={mode}
                  onClick={() => { void handleSessionModeChange(mode); }}
                  style={{
                    height: '28px',
                    padding: '0 12px',
                    borderRadius: '999px',
                    border: 'none',
                    background: active ? 'rgba(201,168,76,0.14)' : 'transparent',
                    color: active ? 'var(--gold)' : 'var(--text-dim)',
                    fontSize: '11px',
                    letterSpacing: '0.06em',
                    textTransform: 'capitalize' as const,
                    cursor: 'pointer',
                    fontWeight: active ? 500 : 400,
                    transition: 'all 0.15s ease',
                  }}
                  title={`${mode.charAt(0).toUpperCase() + mode.slice(1)} session`}
                >
                  {mode}
                </button>
              );
            })}
          </div>

          <div
            className="flex items-center"
            style={{
              padding: '3px',
              borderRadius: '999px',
              border: '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(255,255,255,0.02)',
            }}
          >
            {(['analysis', 'build', 'artifact'] as OrchestrationMode[])
              .filter(m => sessionMode === 'ask' ? m === 'analysis' : true)
              .map(m => {
                const active = state.orchestrationMode === m;
                return (
                  <button
                    key={m}
                    onClick={() => dispatch({ type: 'SET_ORCHESTRATION_MODE', payload: m })}
                    style={{
                      height: '28px',
                      padding: '0 12px',
                      borderRadius: '999px',
                      border: 'none',
                      background: active ? 'rgba(201,168,76,0.14)' : 'transparent',
                      color: active ? 'var(--gold)' : 'var(--text-dim)',
                      fontSize: '11px',
                      letterSpacing: '0.06em',
                      textTransform: 'capitalize' as const,
                      cursor: 'pointer',
                      fontWeight: active ? 500 : 400,
                      transition: 'all 0.15s ease',
                    }}
                    title={`${m.charAt(0).toUpperCase() + m.slice(1)} mode`}
                  >
                    {m}
                  </button>
                );
              })}
          </div>

          <button
            className="reveal-pill"
            onClick={() => dispatch({ type: 'OPEN_DRAWER', payload: 'orchestra' })}
            style={{ height: '42px', fontSize: '13px' }}
          >
            <Music size={14} />
            Orchestra
          </button>
        </div>

        <button
          onClick={handleBroadcast}
          disabled={!canSend}
          style={{
            height: '42px',
            minWidth: '42px',
            padding: '0 18px',
            borderRadius: '999px',
            border: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontSize: '13px',
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap' as const,
            cursor: canSend ? 'pointer' : 'default',
            background: canSend
              ? 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(235,237,241,0.96))'
              : 'rgba(255,255,255,0.06)',
            color: canSend ? '#111' : 'var(--text-dim)',
            boxShadow: canSend ? '0 18px 40px rgba(255,255,255,0.08)' : 'none',
            transition: 'all 0.2s ease',
          }}
        >
          <Send size={14} />
          Broadcast
        </button>
      </div>

      <div className="flex items-center justify-center mt-1.5">
        <span className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.08em', opacity: 0.6 }}>
          {navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'} + Enter to broadcast
        </span>
      </div>
    </footer>
  );
}
