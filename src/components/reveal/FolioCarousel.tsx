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

export default function FolioCarousel() {
  const { state, dispatch } = useMaestro();

  const latestRound = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1] : null;
  const latestResponses = latestRound ? state.responses.filter(r => r.round_id === latestRound.id) : [];
  const roundNumber = latestRound?.round_number ?? 0;

  const broadcastingAgentObjs = state.agents.filter(a => state.broadcastingAgents.includes(a.id));
  const streamingAgents = state.isBroadcasting && latestRound
    ? broadcastingAgentObjs.filter(a => !latestResponses.find(r => r.agent_id === a.id))
    : [];

  const items: FolioItem[] = useMemo(() => {
    const result: FolioItem[] = [];
    for (const r of latestResponses) {
      result.push({ type: 'response', color: r.agent_color, response: r, roundNumber });
    }
    for (const a of streamingAgents) {
      result.push({ type: 'streaming', color: a.color, agentName: a.display_name || a.name, agentRole: a.role, agentProvider: a.provider, agentModel: a.model, agentDisplayName: a.display_name || a.name, roundNumber });
    }
    return result;
  }, [latestResponses, streamingAgents, roundNumber]);

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
        style={{ inset: state.focusMode ? '20px 0 20px' : '140px 0 126px', display: 'grid', placeItems: 'center', zIndex: 10, transition: 'inset 0.35s ease' }}
      >
        <div className="relative" style={{ width: 'min(1260px, 100vw - 60px)', height: state.focusMode ? 'min(90vh, 900px)' : 'min(62vh, 700px)', transition: 'height 0.35s ease' }}>
          {items.map((item, i) => (
            <div
              key={item.type === 'response' ? item.response!.id : `streaming-${item.agentName}`}
              className={`folio-card ${getFolioClass(i)}`}
              style={{
                '--folio-accent': item.color,
                width: 'min(860px, calc(100vw - 140px))',
                height: '100%',
              } as React.CSSProperties}
              onClick={() => handleFolioClick(i)}
            >
              {item.type === 'response' ? (
                <FolioCard response={item.response!} roundNumber={item.roundNumber} />
              ) : (
                <StreamingFolio agentName={item.agentName!} agentRole={item.agentRole!} agentColor={item.color} agentProvider={item.agentProvider} agentModel={item.agentModel} />
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
