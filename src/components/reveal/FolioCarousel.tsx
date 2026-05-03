import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { Response as MaestroResponse } from '../../types';
import { supabase } from '../../lib/supabase';
import { useOrchestration } from '../../hooks/useOrchestration';
import { useThreads } from '../../hooks/useThreads';
import FolioCard, { getFolioDisplayContent } from './FolioCard';
import StreamingFolio from './StreamingFolio';
import OrbitDots from './OrbitDots';

interface FolioItem {
  type: 'response' | 'streaming';
  color: string;
  response?: MaestroResponse;
  agentName?: string;
  agentRole?: string;
  agentProvider?: string;
  agentModel?: string;
  agentDisplayName?: string;
  roundNumber: number;
}

function getFolioItemLabel(item: FolioItem): string {
  if (item.type === 'response' && item.response) {
    return item.response.agent_name;
  }

  return item.agentDisplayName || item.agentName || 'Agent';
}

export default function FolioCarousel() {
  const { state, dispatch } = useMaestro();
  const { synthesize } = useOrchestration();
  const { askFollowUp, compareResponses, extractDecision, pinResponse } = useThreads();
  const [compareSourceId, setCompareSourceId] = useState<string | null>(null);
  const [compareTargetId, setCompareTargetId] = useState<string | null>(null);
  const [savingComparison, setSavingComparison] = useState(false);
  const [synthesizingResponseId, setSynthesizingResponseId] = useState<string | null>(null);

  const latestRound = (state.rounds?.length ?? 0) > 0 ? state.rounds[state.rounds.length - 1] : null;
  const selectedIdx = state.selectedRoundIndex === -1
    ? (state.rounds?.length ?? 0) - 1
    : Math.min(state.selectedRoundIndex, (state.rounds?.length ?? 0) - 1);
  const selectedRound = selectedIdx >= 0 && state.rounds ? state.rounds[selectedIdx] : null;
  const isViewingLatest = !selectedRound || selectedRound.id === latestRound?.id;

  const selectedResponses = useMemo(
    () => selectedRound ? (state.responses || []).filter(r => r.round_id === selectedRound.id) : [],
    [selectedRound, state.responses],
  );
  const roundNumber = selectedRound?.round_number ?? 0;

  const broadcastingAgentObjs = state.agents.filter(a => state.broadcastingAgents.includes(a.id));
  const streamingAgents = useMemo(
    () => state.isBroadcasting && latestRound && isViewingLatest
      ? broadcastingAgentObjs.filter(a => !selectedResponses.find(r => r.agent_id === a.id))
      : [],
    [state.isBroadcasting, latestRound, isViewingLatest, broadcastingAgentObjs, selectedResponses],
  );

  const items: FolioItem[] = useMemo(() => {
    const result: FolioItem[] = [];
    for (const r of selectedResponses) {
      result.push({ type: 'response', color: r.agent_color, response: r, roundNumber });
    }
    for (const a of streamingAgents) {
      result.push({
        type: 'streaming',
        color: a.color,
        agentName: a.display_name || a.name,
        agentRole: a.role,
        agentProvider: a.provider,
        agentModel: a.model,
        agentDisplayName: a.display_name || a.name,
        roundNumber,
      });
    }
    return result;
  }, [selectedResponses, streamingAgents, roundNumber]);

  const safeIndex = Math.min(state.folioIndex, Math.max(items.length - 1, 0));
  const compareSource = compareSourceId
    ? selectedResponses.find((response) => response.id === compareSourceId) ?? null
    : null;
  const compareTarget = compareTargetId
    ? selectedResponses.find((response) => response.id === compareTargetId) ?? null
    : null;

  useEffect(() => {
    setCompareSourceId(null);
    setCompareTargetId(null);
  }, [selectedRound?.id]);

  const getFolioClass = (i: number): string => {
    const diff = i - safeIndex;
    if (diff === 0) return 'folio-active';
    if (diff === -1) return 'folio-left';
    if (diff === 1) return 'folio-right';
    if (diff < -1) return 'folio-far-left';
    return 'folio-far-right';
  };

  const handleFolioClick = (i: number) => {
    if (i !== safeIndex) {
      dispatch({ type: 'SET_FOLIO_INDEX', payload: i });
    }
  };

  const handleCompare = useCallback((response: MaestroResponse) => {
    if (selectedResponses.length < 2) return;

    if (!compareSourceId || compareSourceId === response.id) {
      setCompareSourceId(compareSourceId === response.id ? null : response.id);
      setCompareTargetId(null);
      return;
    }

    setCompareTargetId(response.id);
  }, [compareSourceId, selectedResponses.length]);

  const handleSaveComparison = useCallback(async () => {
    if (!compareSource || !compareTarget) return;

    setSavingComparison(true);
    try {
      await compareResponses(compareSource, compareTarget);
      setCompareSourceId(null);
      setCompareTargetId(null);
    } finally {
      setSavingComparison(false);
    }
  }, [compareResponses, compareSource, compareTarget]);

  const handleSynthesizeSelection = useCallback(async (response: MaestroResponse) => {
    const otherResponses = selectedResponses.filter((candidate) => candidate.id !== response.id);
    setSynthesizingResponseId(response.id);

    try {
      if (otherResponses.length > 0) {
        await supabase
          .from('responses')
          .update({ is_flagged: false } as never)
          .in('id', otherResponses.map((candidate) => candidate.id));
      }

      await supabase
        .from('responses')
        .update({ is_flagged: true } as never)
        .eq('id', response.id);

      for (const candidate of otherResponses) {
        if (candidate.is_flagged) {
          dispatch({ type: 'UPDATE_RESPONSE', payload: { id: candidate.id, is_flagged: false } });
        }
      }
      if (!response.is_flagged) {
        dispatch({ type: 'UPDATE_RESPONSE', payload: { id: response.id, is_flagged: true } });
      }

      await synthesize(response.round_id);
      dispatch({ type: 'SHOW_TOAST', payload: `${response.agent_name} queued for synthesis` });
    } finally {
      setSynthesizingResponseId(null);
    }
  }, [dispatch, selectedResponses, synthesize]);

  if (items.length === 0) return null;

  return (
    <>
      <OrbitDots items={items} />
      <div
        className="absolute folio-perspective"
        role="region"
        aria-label={`Response carousel${roundNumber > 0 ? ` for round ${roundNumber}` : ''}`}
        style={{ inset: state.focusMode ? '20px 0 20px' : '140px 0 126px', display: 'grid', placeItems: 'center', zIndex: 10, transition: 'inset 0.35s ease' }}
      >
        {compareSource && !compareTarget && (
          <div
            className="absolute"
            style={{
              top: '-52px',
              left: '50%',
              transform: 'translateX(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              padding: '10px 14px',
              borderRadius: '999px',
              background: 'rgba(15,18,24,0.88)',
              border: '1px solid rgba(255,255,255,0.08)',
              color: 'var(--text)',
              zIndex: 30,
            }}
          >
            <span className="font-mono-dm" style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase' as const }}>
              Compare mode
            </span>
            <span style={{ fontSize: '13px', color: 'var(--text-dim)' }}>
              Select another response to open a side-by-side sheet.
            </span>
            <button
              type="button"
              className="reveal-chip"
              onClick={() => setCompareSourceId(null)}
              style={{ cursor: 'pointer' }}
            >
              Cancel
            </button>
          </div>
        )}

        <div className="relative" style={{ width: 'min(1260px, 100vw - 60px)', height: state.focusMode ? 'min(90vh, 900px)' : 'min(62vh, 700px)', transition: 'height 0.35s ease' }}>
          {items.map((item, i) => {
            const isAdjacent = Math.abs(i - safeIndex) === 1;
            const isFar = Math.abs(i - safeIndex) > 1;

            return (
              <div
                key={item.type === 'response' ? item.response!.id : `streaming-${item.agentName}`}
                className={`folio-card ${getFolioClass(i)}`}
                role={isFar ? undefined : 'group'}
                aria-hidden={isFar ? true : undefined}
                aria-label={isFar ? undefined : `${getFolioItemLabel(item)} (${i + 1} of ${items.length})`}
                style={{
                  '--folio-accent': item.color,
                  width: 'min(860px, calc(100vw - 140px))',
                  height: '100%',
                } as React.CSSProperties}
              >
                {isAdjacent && (
                  <button
                    type="button"
                    className="folio-select-button"
                    onClick={() => handleFolioClick(i)}
                    aria-label={`Focus ${getFolioItemLabel(item)} card`}
                    title={getFolioItemLabel(item)}
                  />
                )}
                <div aria-hidden={i !== safeIndex}>
                  {item.type === 'response' ? (
                    <FolioCard
                      response={item.response!}
                      onPinToThread={() => pinResponse(item.response!)}
                      onCompare={() => handleCompare(item.response!)}
                      onAskFollowUp={item.response!.agent_id ? async () => { await askFollowUp(item.response!); } : undefined}
                      onExtractDecision={() => extractDecision(item.response!)}
                      onSynthesizeSelection={() => handleSynthesizeSelection(item.response!)}
                      compareLabel={compareSourceId === item.response!.id ? 'Select target' : compareSourceId ? 'Compare here' : 'Compare'}
                      compareActive={compareSourceId === item.response!.id}
                      compareDisabled={item.response!.id === synthesizingResponseId || selectedResponses.length < 2}
                    />
                  ) : (
                    <StreamingFolio agentName={item.agentName!} agentRole={item.agentRole!} agentColor={item.color} agentProvider={item.agentProvider} agentModel={item.agentModel} />
                  )}
                </div>
              </div>
            );
          })}

          {compareSource && compareTarget && (
            <div
              className="absolute"
              style={{
                inset: '18px',
                borderRadius: '28px',
                background: 'rgba(6,8,12,0.96)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 24px 80px rgba(0,0,0,0.45)',
                zIndex: 40,
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
              }}
            >
              <div
                className="flex items-center justify-between"
                style={{ padding: '18px 22px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div>
                  <div className="font-mono-dm" style={{ fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: 'var(--text-dim)', marginBottom: '6px' }}>
                    Comparison sheet
                  </div>
                  <div style={{ fontSize: '15px', color: 'var(--text)' }}>
                    {compareSource.agent_name} vs {compareTarget.agent_name}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="reveal-chip"
                    disabled={savingComparison}
                    onClick={() => {
                      setCompareSourceId(null);
                      setCompareTargetId(null);
                    }}
                    style={{ cursor: savingComparison ? 'default' : 'pointer' }}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className="reveal-chip"
                    disabled={savingComparison}
                    onClick={() => void handleSaveComparison()}
                    style={{
                      cursor: savingComparison ? 'default' : 'pointer',
                      color: 'var(--text)',
                      borderColor: 'rgba(255,255,255,0.2)',
                      background: 'rgba(255,255,255,0.08)',
                    }}
                  >
                    {savingComparison ? 'Saving...' : 'Save comparison to thread'}
                  </button>
                </div>
              </div>

              <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '1px', background: 'rgba(255,255,255,0.06)', flex: 1, minHeight: 0 }}>
                {[compareSource, compareTarget].map((response) => (
                  <div key={response.id} style={{ background: 'rgba(10,12,18,0.98)', padding: '20px 22px', overflowY: 'auto' }}>
                    <div className="flex items-center gap-2" style={{ marginBottom: '12px' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: response.agent_color, boxShadow: `0 0 18px ${response.agent_color}` }} />
                      <div>
                        <div style={{ fontSize: '13px', color: 'var(--text)' }}>{response.agent_name}</div>
                        <div className="font-mono-dm" style={{ fontSize: '10px', letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--text-dim)' }}>
                          {response.agent_role || 'Agent'}
                        </div>
                      </div>
                    </div>
                    {response.title && (
                      <div style={{ fontSize: '22px', lineHeight: 1.1, color: 'var(--text)', marginBottom: '14px' }}>
                        {response.title}
                      </div>
                    )}
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '14px', lineHeight: 1.7, color: 'rgba(232,230,224,0.86)' }}>
                      {getFolioDisplayContent(response.content)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
