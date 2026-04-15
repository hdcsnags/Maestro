import { useMaestro } from '../../context/MaestroContext';
import { useOrchestration } from '../../hooks/useOrchestration';
import { Github, Layers, ChevronLeft, ChevronRight } from 'lucide-react';

export default function HeroContext() {
  const { state, dispatch } = useMaestro();
  const { buildTieredContext } = useOrchestration();

  const totalRounds = state.rounds.length;
  const selectedIdx = state.selectedRoundIndex === -1
    ? totalRounds - 1
    : Math.min(state.selectedRoundIndex, totalRounds - 1);
  const selectedRound = selectedIdx >= 0 ? state.rounds[selectedIdx] : null;
  const displayRound = selectedIdx + 1; // 1-based for display

  const hasContent = totalRounds > 0;
  const boundRepo = state.activeSession?.github_repo
    || (state.activeRepoConnection ? `${state.activeRepoConnection.owner}/${state.activeRepoConnection.repo}` : '');

  const contextPreview = buildTieredContext('');
  const contextParts = contextPreview.indicator;

  const prompt = selectedRound?.prompt ?? '';
  const truncatedPrompt = prompt.length > 180 ? prompt.slice(0, 180) + '…' : prompt;

  const goBack = () => {
    if (selectedIdx > 0) {
      dispatch({ type: 'SET_SELECTED_ROUND', payload: selectedIdx - 1 });
    }
  };
  const goForward = () => {
    if (selectedIdx < totalRounds - 1) {
      const next = selectedIdx + 1;
      dispatch({ type: 'SET_SELECTED_ROUND', payload: next === totalRounds - 1 ? -1 : next });
    }
  };

  return (
    <section
      className="absolute left-1/2 z-20 text-center pointer-events-none"
      style={{
        top: '78px',
        transform: 'translateX(-50%)',
        width: 'min(920px, calc(100vw - 80px))',
      }}
    >
      {/* Round navigator */}
      {hasContent ? (
        <div className="flex items-center justify-center gap-3" style={{ marginBottom: '8px' }}>
          <button
            onClick={goBack}
            disabled={selectedIdx <= 0}
            style={{
              background: 'none', border: 'none', cursor: selectedIdx > 0 ? 'pointer' : 'default',
              color: selectedIdx > 0 ? 'rgba(201,168,76,0.88)' : 'rgba(201,168,76,0.25)',
              pointerEvents: 'auto', padding: '4px', display: 'flex', alignItems: 'center',
              transition: 'color 0.15s ease',
            }}
          >
            <ChevronLeft size={14} />
          </button>
          <span
            className="font-mono-dm"
            style={{
              color: 'rgba(201,168,76,0.88)',
              fontSize: '11px',
              letterSpacing: '0.24em',
              textTransform: 'uppercase' as const,
            }}
          >
            Round {displayRound} / {totalRounds}
            {state.selectedRoundIndex === -1 && totalRounds > 1 && (
              <span style={{ color: 'rgba(201,168,76,0.4)', marginLeft: '8px', fontSize: '9px' }}>latest</span>
            )}
          </span>
          <button
            onClick={goForward}
            disabled={selectedIdx >= totalRounds - 1}
            style={{
              background: 'none', border: 'none', cursor: selectedIdx < totalRounds - 1 ? 'pointer' : 'default',
              color: selectedIdx < totalRounds - 1 ? 'rgba(201,168,76,0.88)' : 'rgba(201,168,76,0.25)',
              pointerEvents: 'auto', padding: '4px', display: 'flex', alignItems: 'center',
              transition: 'color 0.15s ease',
            }}
          >
            <ChevronRight size={14} />
          </button>
        </div>
      ) : (
        <div
          className="font-mono-dm"
          style={{
            color: 'rgba(201,168,76,0.88)',
            fontSize: '11px',
            letterSpacing: '0.24em',
            textTransform: 'uppercase' as const,
            marginBottom: '8px',
          }}
        >
          Intentional by Design
        </div>
      )}

      {/* Prompt preview */}
      {truncatedPrompt && (
        <div
          style={{
            color: 'rgba(232,230,224,0.5)',
            fontSize: '12px',
            lineHeight: 1.5,
            maxWidth: '640px',
            margin: '0 auto 10px',
            fontStyle: 'italic',
          }}
        >
          "{truncatedPrompt}"
        </div>
      )}

      {boundRepo && (
        <div
          className="font-mono-dm flex items-center justify-center gap-1.5"
          style={{
            color: 'var(--text-dim)',
            fontSize: '10px',
            letterSpacing: '0.14em',
            textTransform: 'uppercase' as const,
            marginBottom: '8px',
            opacity: 0.8,
          }}
        >
          <Github size={10} />
          <span>{boundRepo}</span>
        </div>
      )}

      {contextParts.length > 0 && (
        <div
          className="font-mono-dm flex items-center justify-center gap-1.5"
          style={{
            color: 'rgba(138,168,224,0.7)',
            fontSize: '10px',
            letterSpacing: '0.1em',
          }}
        >
          <Layers size={10} />
          <span>Context: {contextParts.join(' · ')}</span>
        </div>
      )}
    </section>
  );
}
