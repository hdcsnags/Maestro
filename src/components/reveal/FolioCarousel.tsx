import { useMemo } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { Response as MaestroResponse } from '../../types';
import FolioCard from './FolioCard';
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

  const latestRound = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1] : null;
  // Use selected round for carousel content (supports round navigation)
  const selectedIdx = state.selectedRoundIndex === -1
    ? state.rounds.length - 1
    : Math.min(state.selectedRoundIndex, state.rounds.length - 1);
  const selectedRound = selectedIdx >= 0 ? state.rounds[selectedIdx] : null;
  const isViewingLatest = !selectedRound || selectedRound.id === latestRound?.id;

  const selectedResponses = useMemo(
    () => selectedRound ? state.responses.filter(r => r.round_id === selectedRound.id) : [],
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
      result.push({ type: 'streaming', color: a.color, agentName: a.display_name || a.name, agentRole: a.role, agentProvider: a.provider, agentModel: a.model, agentDisplayName: a.display_name || a.name, roundNumber });
    }
    return result;
  }, [selectedResponses, streamingAgents, roundNumber]);

  const safeIndex = Math.min(state.folioIndex, Math.max(items.length - 1, 0));

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
                    <FolioCard response={item.response!} />
                  ) : (
                    <StreamingFolio agentName={item.agentName!} agentRole={item.agentRole!} agentColor={item.color} agentProvider={item.agentProvider} agentModel={item.agentModel} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
