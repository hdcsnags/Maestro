import { useEffect, useCallback } from 'react';
import { useMaestro } from '../context/MaestroContext';
import { useWorkspace } from '../hooks/useWorkspace';
import { useOrchestration } from '../hooks/useOrchestration';
import LoadingScreen from '../components/ui/LoadingScreen';
import RevealTopbar from '../components/reveal/RevealTopbar';
import HeroContext from '../components/reveal/HeroContext';
import FolioCarousel from '../components/reveal/FolioCarousel';
import EmptyStage from '../components/reveal/EmptyStage';
import RevealComposer from '../components/reveal/RevealComposer';
import OrchestraDrawer from '../components/reveal/OrchestraDrawer';
import TrustDrawer from '../components/reveal/TrustDrawer';
import SynthesisDrawer from '../components/reveal/SynthesisDrawer';
import ShortcutOverlay from '../components/reveal/ShortcutOverlay';
import PatchModal from '../components/reveal/PatchModal';
import VaultDrawer from '../components/reveal/VaultDrawer';
import ExecutionModal from '../components/reveal/ExecutionModal';

export default function WorkspacePage() {
  const { state, dispatch } = useMaestro();
  const { broadcast } = useOrchestration();
  useWorkspace();

  const drawerOpen = state.activeDrawer !== null;
  const overlayOpen = state.shortcutOverlayOpen;
  const anyTransientOpen = drawerOpen || overlayOpen;

  const latestRound = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1] : null;
  const latestResponses = latestRound ? state.responses.filter(r => r.round_id === latestRound.id) : [];
  const streamingAgents = state.isBroadcasting && latestRound
    ? state.agents.filter(a => state.broadcastingAgents.includes(a.id) && !latestResponses.find(r => r.agent_id === a.id))
    : [];
  const totalFolioItems = latestResponses.length + streamingAgents.length;
  const hasContent = totalFolioItems > 0 || state.isBroadcasting;

  const handleBroadcast = useCallback(async (prompt: string, selectedAgentIds: string[]) => {
    await broadcast(prompt, selectedAgentIds);
  }, [broadcast]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.isContentEditable;

      if (e.key === 'Escape') {
        if (state.executionModalOpen) {
          dispatch({ type: 'SET_EXECUTION_MODAL', payload: false });
        } else if (state.patchModalOpen) {
          dispatch({ type: 'SET_PATCH_MODAL', payload: false });
        } else if (anyTransientOpen) {
          dispatch({ type: 'CLOSE_TRANSIENT' });
        } else if (isTyping) {
          (target as HTMLTextAreaElement).blur();
        }
        return;
      }

      if (isTyping) return;

      const key = e.key.toLowerCase();

      if (key === '?') {
        dispatch({ type: 'TOGGLE_SHORTCUTS' });
        return;
      }

      if (key === 'o') {
        dispatch({ type: 'OPEN_DRAWER', payload: 'orchestra' });
        return;
      }

      if (key === 't') {
        dispatch({ type: 'OPEN_DRAWER', payload: 'trust' });
        return;
      }

      if (key === 's') {
        dispatch({ type: 'OPEN_DRAWER', payload: 'synthesis' });
        return;
      }

      if (key === 'v') {
        dispatch({ type: 'OPEN_DRAWER', payload: 'vault' });
        return;
      }

      if (anyTransientOpen) return;

      if (e.key === 'ArrowRight' && totalFolioItems > 0) {
        const next = Math.min(state.folioIndex + 1, totalFolioItems - 1);
        dispatch({ type: 'SET_FOLIO_INDEX', payload: next });
        return;
      }

      if (e.key === 'ArrowLeft' && totalFolioItems > 0) {
        const prev = Math.max(state.folioIndex - 1, 0);
        dispatch({ type: 'SET_FOLIO_INDEX', payload: prev });
        return;
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [anyTransientOpen, totalFolioItems, state.folioIndex, state.patchModalOpen, state.executionModalOpen, dispatch]);

  if (!state.workspace) {
    return <LoadingScreen />;
  }

  return (
    <div className="relative h-screen overflow-hidden reveal-bg" style={{ isolation: 'isolate' }}>
      <div className="grain-layer" />
      <div className="stage-glow-layer" />
      <div className="vignette-layer" />

      <div
        className="scrim"
        style={{ opacity: anyTransientOpen ? 1 : 0, pointerEvents: anyTransientOpen ? 'auto' : 'none' }}
        onClick={() => dispatch({ type: 'CLOSE_TRANSIENT' })}
      />

      <div className={`stage-container relative w-full h-full ${anyTransientOpen ? 'dimmed' : ''}`}>
        <RevealTopbar />
        <HeroContext />

        {hasContent ? (
          <FolioCarousel />
        ) : (
          <EmptyStage />
        )}

        <RevealComposer onBroadcast={handleBroadcast} />
      </div>

      <OrchestraDrawer />
      <TrustDrawer />
      <SynthesisDrawer />
      <VaultDrawer />
      <ShortcutOverlay />
      <PatchModal />
      <ExecutionModal />
    </div>
  );
}
