import { useEffect, useCallback, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useMaestro } from '../context/MaestroContext';
import { useWorkspace } from '../hooks/useWorkspace';
import { useOrchestration } from '../hooks/useOrchestration';
import { useAuth } from '../context/AuthContext';
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
import ConciergePanel from '../components/reveal/ConciergePanel';
import PreBuildPanel from '../components/reveal/PreBuildPanel';
import DesignPhase from '../components/reveal/DesignPhase';
import BuildWorkspace from '../components/reveal/BuildWorkspace';
import BuildReport from '../components/reveal/BuildReport';
import Toast from '../components/ui/Toast';

export default function WorkspacePage() {
  const { state, dispatch } = useMaestro();
  const { broadcast } = useOrchestration();
  const { signOut } = useAuth();
  const { createSession } = useWorkspace();

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

  // Auto-show carousel when broadcast finishes and responses exist
  const wasBroadcasting = useRef(false);
  useEffect(() => {
    if (state.isBroadcasting) {
      wasBroadcasting.current = true;
    } else if (wasBroadcasting.current && latestResponses.length > 0 && state.autoShowCarousel) {
      dispatch({ type: 'SET_CAROUSEL_VISIBLE', payload: true });
      wasBroadcasting.current = false;
    } else {
      wasBroadcasting.current = false;
    }
  }, [state.isBroadcasting, latestResponses.length, state.autoShowCarousel, dispatch]);

  const handleBroadcast = useCallback(async (prompt: string, selectedAgentIds: string[]) => {
    // Option A — lazy session creation. If the user lands fresh and broadcasts,
    // create a new session on demand and pass it directly to broadcast
    // (state.activeSession hasn't updated yet in this render cycle).
    let sessionForBroadcast = state.activeSession;
    if (!sessionForBroadcast && state.workspace) {
      const created = await createSession(state.workspace.id);
      if (!created) return;
      sessionForBroadcast = created;
    }
    await broadcast(prompt, selectedAgentIds, sessionForBroadcast);
  }, [broadcast, createSession, state.activeSession, state.workspace]);

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

      const ctrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (ctrl && key === '/') {
        e.preventDefault();
        dispatch({ type: 'TOGGLE_SHORTCUTS' });
        return;
      }

      if (ctrl && key === 'o') {
        e.preventDefault();
        dispatch({ type: 'OPEN_DRAWER', payload: 'orchestra' });
        return;
      }

      if (ctrl && key === 'j') {
        e.preventDefault();
        dispatch({ type: 'OPEN_DRAWER', payload: 'trust' });
        return;
      }

      if (ctrl && key === 'e') {
        e.preventDefault();
        dispatch({ type: 'OPEN_DRAWER', payload: 'synthesis' });
        return;
      }

      if (ctrl && key === 'k') {
        e.preventDefault();
        dispatch({ type: 'OPEN_DRAWER', payload: 'vault' });
        return;
      }

      if (ctrl && key === 'b') {
        e.preventDefault();
        dispatch({ type: 'OPEN_DRAWER', payload: 'pre-build' });
        return;
      }

      if (ctrl && key === '.') {
        e.preventDefault();
        dispatch({ type: 'TOGGLE_FOCUS_MODE' });
        return;
      }

      if (isTyping || anyTransientOpen) return;

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

  if (state.initError) {
    return (
      <div className="relative z-10 flex items-center justify-center h-screen">
        <div className="flex flex-col items-center gap-4 max-w-md px-6 text-center">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(224,90,90,0.1)', border: '1px solid rgba(224,90,90,0.25)' }}
          >
            <AlertTriangle size={20} style={{ color: 'var(--risk)' }} />
          </div>
          <p
            className="text-xs tracking-widest uppercase"
            style={{ fontFamily: 'DM Mono', color: 'var(--risk)', letterSpacing: '0.22em' }}
          >
            Initialization Failed
          </p>
          <p className="text-sm" style={{ color: 'var(--text-muted)', lineHeight: '1.6' }}>
            {state.initError}
          </p>
          <div className="flex gap-3 mt-2">
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl text-xs font-medium transition-all duration-200"
              style={{
                fontFamily: 'DM Mono',
                letterSpacing: '0.14em',
                textTransform: 'uppercase' as const,
                background: 'var(--text)',
                color: 'var(--void)',
              }}
            >
              Retry
            </button>
            <button
              onClick={() => signOut()}
              className="px-5 py-2.5 rounded-xl text-xs font-medium transition-all duration-200"
              style={{
                fontFamily: 'DM Mono',
                letterSpacing: '0.14em',
                textTransform: 'uppercase' as const,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
              }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

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
        {!state.focusMode && <RevealTopbar />}
        {!state.focusMode && <HeroContext />}

        {hasContent && state.carouselVisible ? (
          <FolioCarousel />
        ) : (
          <EmptyStage />
        )}

        {!state.focusMode && <RevealComposer onBroadcast={handleBroadcast} />}
      </div>

      <OrchestraDrawer />
      <TrustDrawer />
      <SynthesisDrawer />
      <VaultDrawer />
      <ShortcutOverlay />
      <PatchModal />
      <ExecutionModal />
      <PreBuildPanel />
      <DesignPhase />
      <BuildWorkspace />
      <BuildReport />
      {state.conciergeVisible && <ConciergePanel />}
      <Toast />
    </div>
  );
}
