import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Loader2, Bot, User, Radio, ArrowLeft, MessageSquare, Zap, Hammer, PanelLeftOpen, PanelLeftClose, GitBranch, Mic, LayoutGrid } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMaestro } from '../../context/MaestroContext';
import { useThreads } from '../../hooks/useThreads';
import { useWorkspace } from '../../hooks/useWorkspace';
import { CONCIERGE_MODELS, type ThreadMessage, type ClawView, type Thread } from '../../types';
import FolioCarousel from './FolioCarousel';
import BuildRunwayCard from './BuildRunwayCard';
import ConciergeEventCard from './ConciergeEventCard';
import SystemEventCard from './EventCards/SystemEventCard';
import PlanCardRenderer from './PlanCards/PlanCardRenderer';
import RevealComposer from './RevealComposer';
import StatusChip from './StatusChip';

const THREAD_GROUPS = [
  { type: 'concierge', Icon: Mic, label: 'Concierge' },
  { type: 'broadcast', Icon: Radio, label: 'Broadcasts' },
  { type: 'direct', Icon: MessageSquare, label: 'Direct' },
  { type: 'execution', Icon: Zap, label: 'Execution' },
] as const;

const iconButtonClass = 'p-1.5 rounded-lg hover:bg-white/5 text-white/55 hover:text-white/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50';
const focusRingClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50';
const headerButtonClass = 'flex items-center gap-1.5 rounded-lg p-1.5 sm:px-2.5 sm:py-1.5 hover:bg-white/5 text-white/55 hover:text-white/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
}

export default function ClawMode() {
  const { state, dispatch } = useMaestro();
  const { ensureConciergeThread, focusDirectThread, loadThreads, loadThreadMessages } = useThreads();
  const { createSession } = useWorkspace();
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || !window.matchMedia('(max-width: 767px)').matches,
  );
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const initializedSessionRef = useRef<string | null>(null);

  const clawView = state.clawView as ClawView;
  const focusedAgent = useMemo(
    () => state.focusedAgentId ? state.agents.find(a => a.id === state.focusedAgentId) ?? null : null,
    [state.focusedAgentId, state.agents],
  );

  // Messages for the active thread (concierge or direct)
  const messages = useMemo(() => {
    if (!state.activeThread) return [];
    return state.threadMessages
      .filter(m => m.thread_id === state.activeThread!.id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [state.activeThread, state.threadMessages]);

  // Current concierge model label
  const currentModelLabel = useMemo(() => {
    const found = CONCIERGE_MODELS.find(m => m.id === state.conciergeModel);
    return found?.label ?? state.conciergeModel;
  }, [state.conciergeModel]);

  // Latest round info for carousel view
  const latestRound = useMemo(
    () => (state.rounds.length > 0 ? state.rounds[state.rounds.length - 1] : null),
    [state.rounds],
  );
  const latestResponses = useMemo(
    () => (latestRound ? state.responses.filter(r => r.round_id === latestRound.id) : []),
    [latestRound, state.responses],
  );
  const councilAgents = useMemo(
    () => state.agents.filter(a => a.is_active && a.agent_role !== 'executor' && a.provider_group !== 'maestroclaw'),
    [state.agents],
  );
  const hasRepo = useMemo(
    () => state.repoConnections?.some((connection: { is_active: boolean }) => connection.is_active) ?? false,
    [state.repoConnections],
  );

  // Below md, the thread sidebar behaves as an overlay instead of consuming the layout.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const applyLayoutMode = (mobile: boolean) => {
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    };

    applyLayoutMode(mediaQuery.matches);
    const handleChange = (event: MediaQueryListEvent) => applyLayoutMode(event.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Group threads by type for sidebar
  const threadGroups = useMemo(() => {
    const groups: Record<string, Thread[]> = {
      concierge: [],
      broadcast: [],
      direct: [],
      execution: [],
    };
    for (const t of state.threads) {
      if (t.status !== 'active') continue;
      const bucket = groups[t.type];
      if (bucket) bucket.push(t);
    }
    return groups;
  }, [state.threads]);

  // Active repo connection for context header
  const activeRepo = useMemo(
    () => state.repoConnections?.find((r: { is_active: boolean }) => r.is_active),
    [state.repoConnections],
  );
  const activeRepoName = useMemo(
    () => (activeRepo as { repo_full_name?: string } | undefined)?.repo_full_name?.split('/')[1] || null,
    [activeRepo],
  );
  const activeClawBuildSession = useMemo(
    () => state.clawBuildSession?.threadId === state.activeThread?.id ? state.clawBuildSession : null,
    [state.clawBuildSession, state.activeThread?.id],
  );
  const isExecutionThread = state.activeThread?.type === 'execution';
  const isExecutionPending = !!state.pendingExecution && state.pendingExecution.threadId === state.activeThread?.id;
  const isBuildSessionActive = !!activeClawBuildSession;

  // Determine thread type label for context header
  const threadTypeLabel = useMemo(() => {
    if (!state.activeThread) return 'No Thread';
    switch (state.activeThread.type) {
      case 'concierge': return 'Concierge';
      case 'broadcast': return 'Broadcast';
      case 'direct': return 'Direct Chat';
      case 'execution': return 'Execution';
      default: return 'Thread';
    }
  }, [state.activeThread]);

  const surfaceState = useMemo(() => {
    if (isExecutionPending) {
      return {
        kind: 'execute' as const,
        Icon: Zap,
        badgeLabel: 'Execution Review',
        bannerTitle: 'Execution waiting for approval',
        description: 'Review the parsed command below before it is handed to MaestroClaw for local execution.',
        status: 'Awaiting approval',
      };
    }

    if (isExecutionThread) {
      return {
        kind: 'execute' as const,
        Icon: Zap,
        badgeLabel: 'Execution Thread',
        bannerTitle: 'Execution thread active',
        description: 'Command parsing, approvals, and run updates stay here so Concierge chat does not get buried in shell output.',
        status: 'Shell + GitHub actions',
      };
    }

    if (isBuildSessionActive) {
      const backendLabel = activeClawBuildSession.executionBackend === 'auto'
        ? 'Auto resolved to local executor'
        : 'Local executor';
      return {
        kind: 'build' as const,
        Icon: Hammer,
        badgeLabel: 'Build Runway',
        bannerTitle: 'Build runway active',
        description: 'This thread owns the build handoff now. Use the runway card below to review the plan, execute the build, and push the results.',
        status: backendLabel,
      };
    }

    if (state.composerIntent === 'execute') {
      return {
        kind: 'execute' as const,
        Icon: Zap,
        badgeLabel: 'Execute Mode',
        bannerTitle: 'Execution mode armed',
        description: 'Commands run through MaestroClaw. Read-only tasks can auto-run; anything risky stops for approval first.',
        status: 'Local executor',
      };
    }

    if (state.composerIntent === 'build') {
      return {
        kind: 'build' as const,
        Icon: Hammer,
        badgeLabel: 'Build Mode',
        bannerTitle: 'Build mode armed',
        description: 'Build checks Pre-Build, then routes to a local session card or the Build Workspace based on your locked builders and backend.',
        status: activeRepoName || 'Local-first handoff',
      };
    }

    return {
      kind: 'default' as const,
      Icon: clawView === 'carousel' ? Radio : clawView === 'focus' ? MessageSquare : state.activeThread?.type === 'broadcast' ? Radio : state.activeThread?.type === 'direct' ? MessageSquare : Mic,
      badgeLabel: threadTypeLabel,
      bannerTitle: threadTypeLabel,
      description: '',
      status: null,
    };
  }, [
    activeRepoName,
    activeClawBuildSession,
    clawView,
    isBuildSessionActive,
    isExecutionPending,
    isExecutionThread,
    state.composerIntent,
    state.activeThread?.type,
    threadTypeLabel,
  ]);

  const modeTheme = surfaceState.kind === 'execute'
    ? {
        badge: 'border-signal-warn/25 bg-signal-warn/10 text-signal-warn/95',
        banner: 'border-signal-warn/15 bg-signal-warn/10',
        bannerIcon: 'bg-signal-warn/15 text-signal-warn/95',
        bannerTitle: 'text-signal-warn/95',
        status: 'border-signal-warn/25 bg-signal-warn/10 text-signal-warn/95',
        input: 'bg-signal-warn/5 border-signal-warn/20 focus:border-signal-warn/35 focus:ring-signal-warn/40',
        helper: 'text-signal-warn/90',
        busyIcon: 'bg-signal-warn/15 text-signal-warn/95',
      }
    : surfaceState.kind === 'build'
      ? {
          badge: 'border-signal-ok/25 bg-signal-ok/10 text-signal-ok/95',
          banner: 'border-signal-ok/15 bg-signal-ok/10',
          bannerIcon: 'bg-signal-ok/15 text-signal-ok/95',
          bannerTitle: 'text-signal-ok/95',
          status: 'border-signal-ok/25 bg-signal-ok/10 text-signal-ok/95',
          input: 'bg-signal-ok/5 border-signal-ok/20 focus:border-signal-ok/35 focus:ring-signal-ok/40',
          helper: 'text-signal-ok/90',
          busyIcon: 'bg-signal-ok/15 text-signal-ok/95',
        }
      : {
          badge: 'border-gold/20 bg-gold/10 text-gold/95',
          banner: 'border-white/[0.06] bg-white/[0.02]',
          bannerIcon: 'bg-gold/10 text-gold/80',
          bannerTitle: 'text-white/80',
          status: 'border-white/10 bg-white/[0.04] text-white/75',
          input: 'bg-white/[0.04] border-white/[0.08] focus:border-gold/30 focus:ring-gold/50',
          helper: 'text-white/60',
          busyIcon: 'bg-gold/10 text-gold/60',
        };
  const shouldPulseHeader = state.isBroadcasting || state.isConciergeSending || isExecutionPending;

  // Initialize per session: load persisted threads + ensure concierge thread
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      let sessionId = state.activeSession?.id;
      if (!sessionId && state.workspace) {
        const session = await createSession(state.workspace.id, 'ask');
        if (!session || cancelled) return;
        sessionId = session.id;
      }
      if (!sessionId || cancelled) return;

      const alreadyInitialized = initializedSessionRef.current === sessionId;
      if (alreadyInitialized && state.activeThread?.session_id === sessionId) {
        return;
      }

      await loadThreads(sessionId);
      if (cancelled) return;

      const thread = await ensureConciergeThread(sessionId);
      if (!thread || cancelled) return;

      initializedSessionRef.current = sessionId;
      dispatch({ type: 'SET_ACTIVE_THREAD', payload: thread });
      dispatch({ type: 'SET_CLAW_VIEW', payload: 'concierge' });
      dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: null });
      await loadThreadMessages(thread.id);
    };
    void init();

    return () => {
      cancelled = true;
    };
  }, [state.activeSession?.id, state.workspace?.id, state.activeThread?.session_id, createSession, loadThreads, ensureConciergeThread, loadThreadMessages, dispatch]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Auto-switch to carousel when broadcast finishes
  const wasBroadcasting = useRef(false);
  useEffect(() => {
    if (state.isBroadcasting) {
      wasBroadcasting.current = true;
      return;
    }

    if (wasBroadcasting.current && latestResponses.length > 0) {
      wasBroadcasting.current = false;
      if (clawView === 'concierge') {
        dispatch({ type: 'SET_CLAW_VIEW', payload: 'carousel' });
      }
    }
  }, [state.isBroadcasting, latestResponses.length, clawView, dispatch]);

  // ─── Handlers ───────────────────────────────────────────────

  const handleDialogKeyDownCapture = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      if (isMobile && sidebarOpen) {
        e.preventDefault();
        e.stopPropagation();
        setSidebarOpen(false);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const conciergeThread = state.threads.find(t => t.type === 'concierge' && t.status === 'active');
      if (conciergeThread) {
        dispatch({ type: 'SET_ACTIVE_THREAD', payload: conciergeThread });
      }
      dispatch({ type: 'SET_CLAW_VIEW', payload: 'concierge' });
      dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: null });
      return;
    }

    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusable = getFocusableElements(dialogRef.current);
    if (focusable.length === 0) return;

    const activeElement = document.activeElement as HTMLElement | null;
    const currentIndex = activeElement ? focusable.indexOf(activeElement) : -1;
    const nextIndex = e.shiftKey
      ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
      : (currentIndex === -1 || currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);

    e.preventDefault();
    focusable[nextIndex]?.focus();
  }, [dispatch, isMobile, sidebarOpen, state.threads]);

  const handleFocusAgent = useCallback(async (agentId: string) => {
    const agent = state.agents.find(a => a.id === agentId);
    const agentResponse = latestResponses.find(r => r.agent_id === agentId);

    await focusDirectThread(agentId, {
      title: agent?.display_name || agent?.name || 'Agent',
      seedContent: agentResponse?.content,
    });
  }, [state.agents, latestResponses, focusDirectThread]);

  const handleBackToCarousel = useCallback(() => {
    dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: null });
    // Restore concierge thread as active
    const conciergeThread = state.threads.find(t => t.type === 'concierge' && t.status === 'active');
    if (conciergeThread) {
      dispatch({ type: 'SET_ACTIVE_THREAD', payload: conciergeThread });
    }
    dispatch({ type: 'SET_CLAW_VIEW', payload: latestRound ? 'carousel' : 'concierge' });
  }, [state.threads, latestRound, dispatch]);

  const handleBackToConcierge = useCallback(() => {
    dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: null });
    const conciergeThread = state.threads.find(t => t.type === 'concierge' && t.status === 'active');
    if (conciergeThread) {
      dispatch({ type: 'SET_ACTIVE_THREAD', payload: conciergeThread });
    }
    dispatch({ type: 'SET_CLAW_VIEW', payload: 'concierge' });
  }, [state.threads, dispatch]);

  const handleClose = useCallback(() => {
    const conciergeThread = state.threads.find(t => t.type === 'concierge' && t.status === 'active');
    if (conciergeThread) {
      dispatch({ type: 'SET_ACTIVE_THREAD', payload: conciergeThread });
    }
    dispatch({ type: 'SET_CLAW_VIEW', payload: 'concierge' });
    dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: null });
  }, [dispatch, state.threads]);

  // Handle thread click in sidebar
  const handleThreadClick = useCallback(async (thread: Thread) => {
    dispatch({ type: 'SET_ACTIVE_THREAD', payload: thread });
    await loadThreadMessages(thread.id);
    if (isMobile) {
      setSidebarOpen(false);
    }
    if (thread.type === 'concierge') {
      dispatch({ type: 'SET_CLAW_VIEW', payload: 'concierge' });
      dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: null });
    } else if (thread.type === 'direct' && thread.agent_id) {
      dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: thread.agent_id });
      dispatch({ type: 'SET_CLAW_VIEW', payload: 'focus' });
    } else {
      dispatch({ type: 'SET_CLAW_VIEW', payload: 'concierge' });
    }
  }, [dispatch, isMobile, loadThreadMessages]);

  const SurfaceIcon = surfaceState.Icon;
  const backLabel = clawView === 'focus' ? 'Back to Orchestra' : 'Back to Concierge';
  const emptyStateIconClass = surfaceState.kind === 'execute'
    ? 'bg-signal-warn/10 text-signal-warn/85'
    : surfaceState.kind === 'build'
      ? 'bg-signal-ok/10 text-signal-ok/85'
      : 'bg-gold/10 text-gold/60';
  const emptyStateTitle = isExecutionThread
    ? 'Execution thread ready'
    : surfaceState.kind === 'build'
      ? surfaceState.bannerTitle
      : 'Concierge is ready';
  const emptyStateDescription = isExecutionThread
    ? 'Describe a command or repo task. Claw will parse it, request approval when needed, and keep run updates here.'
    : surfaceState.kind === 'build'
      ? 'Describe the feature or refactor you want. Claw will plan the repo changes before asking to write anything.'
      : 'Chat, broadcast to the orchestra, execute commands, or build to a repo.';

  // ─── Render ───────────────────────────────────────────────
  const isBuilding = state.activeSession?.current_phase === 'build' || state.activeSession?.current_phase === 'bouncer';
  const drawerPadding = isBuilding
    ? (state.buildDrawerExpanded ? 'clamp(56px, 50dvh, calc(100dvh - 240px))' : '56px')
    : '0px';

  return (
    <div
      ref={dialogRef}
      onKeyDownCapture={handleDialogKeyDownCapture}
      className="relative flex flex-col h-full w-full"
      style={{ isolation: 'isolate', paddingBottom: drawerPadding }}
      role="dialog"
      aria-modal="true"
      aria-label="Claw Mode workspace"
    >

      {/* ─── Context Header ────────────────────────────────── */}
      <div className="relative z-20 flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/[0.06]">
        <div className="flex min-w-0 items-center gap-3">
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={iconButtonClass}
            aria-label={sidebarOpen ? 'Collapse thread sidebar' : 'Expand thread sidebar'}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>

          {/* Back button when in carousel/focus */}
          {clawView !== 'concierge' && (
            <button
              onClick={clawView === 'focus' ? handleBackToCarousel : handleBackToConcierge}
              className={headerButtonClass}
              aria-label={backLabel}
              title={backLabel}
            >
              <ArrowLeft size={14} />
              <span className="hidden sm:inline text-xs">{backLabel}</span>
            </button>
          )}

          <StatusChip
            kind={surfaceState.kind}
            label={surfaceState.badgeLabel}
            description={surfaceState.description}
            detailStatus={surfaceState.status}
            pulse={shouldPulseHeader}
            repoName={activeRepoName}
          />

          {/* Context pills */}
          <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap" style={{ scrollbarWidth: 'none' }}>
            {clawView === 'focus' && focusedAgent && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] text-[11px] text-white/70">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: focusedAgent.color }} />
                {focusedAgent.display_name || focusedAgent.name}
              </span>
            )}
            {clawView === 'carousel' && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] text-[11px] text-white/70">
                <Radio size={10} />
                {latestResponses.length} responses
              </span>
            )}
            {hasRepo && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] text-[11px] text-white/65">
                <GitBranch size={10} />
                {(activeRepo as { repo_full_name?: string })?.repo_full_name?.split('/')[1] || 'repo'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleClose}
            className={iconButtonClass}
            aria-label="Return to concierge thread"
            title="Return to concierge thread"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* ─── Body: Sidebar + Content ───────────────────────── */}
      <div className="relative flex-1 flex overflow-hidden">

        {isMobile && sidebarOpen && (
          <button
            type="button"
            aria-label="Close thread sidebar"
            className="absolute inset-0 z-20 bg-black/45 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Thread Sidebar */}
        {sidebarOpen && (
          <div
            className={`${isMobile ? 'absolute inset-y-0 left-0 z-30 w-56 max-w-[80vw] shadow-2xl' : 'w-56 flex-shrink-0'} border-r border-white/[0.06] overflow-y-auto py-2 claw-sidebar`}
            style={{ background: 'rgba(0,0,0,0.15)' }}
            aria-label="Thread sidebar"
          >
            {/* Thread groups */}
            {THREAD_GROUPS.map(group => {
              const GroupIcon = group.Icon;
              const threads = threadGroups[group.type] || [];
              if (threads.length === 0 && group.type !== 'concierge') return null;
              return (
                <div key={group.type} className="mb-1">
                  <div className="px-3 py-1.5 text-[10px] text-white/55 uppercase tracking-widest font-medium flex items-center gap-1.5">
                    <GroupIcon size={11} />
                    {group.label}
                  </div>
                  {threads.length === 0 && (
                    <div className="px-3 py-1 text-[11px] text-white/50 italic">No threads yet</div>
                  )}
                  {threads.map(thread => {
                    const isActive = state.activeThread?.id === thread.id;
                    const agent = thread.agent_id ? state.agents.find(a => a.id === thread.agent_id) : null;
                    const threadLabel = thread.title || agent?.display_name || agent?.name || group.label;
                    const ThreadIcon = thread.type === 'execution'
                      ? Zap
                      : thread.type === 'broadcast'
                        ? Radio
                        : thread.type === 'direct'
                          ? MessageSquare
                          : Mic;
                    const activeClasses = thread.type === 'execution'
                      ? 'bg-signal-warn/10 text-signal-warn/95 border-l-2 border-signal-warn/50'
                      : 'bg-gold/10 text-gold/90 border-l-2 border-gold/40';
                    const inactiveClasses = thread.type === 'execution'
                      ? 'text-white/70 hover:bg-signal-warn/10 hover:text-signal-warn/90 border-l-2 border-transparent'
                      : 'text-white/70 hover:bg-white/[0.04] hover:text-white/85 border-l-2 border-transparent';
                    return (
                      <button
                        key={thread.id}
                        onClick={() => handleThreadClick(thread)}
                        className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors rounded-md mx-1 
                          ${isActive
                            ? activeClasses
                            : inactiveClasses
                          } ${focusRingClass}`}
                        style={{ width: 'calc(100% - 8px)' }}
                        aria-current={isActive ? 'true' : undefined}
                      >
                        <div className="truncate flex items-center gap-1.5">
                          {thread.type === 'direct' && agent ? (
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: agent.color }} />
                          ) : (
                            <ThreadIcon
                              size={12}
                              className={thread.type === 'execution' ? 'text-signal-warn/90 flex-shrink-0' : 'text-white/45 flex-shrink-0'}
                            />
                          )}
                          {threadLabel}
                          {thread.type === 'execution' && (
                            <span className="ml-auto text-[9px] uppercase tracking-[0.18em] text-signal-warn/80">
                              Run
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {/* Carousel shortcut */}
            {latestResponses.length > 0 && (
              <div className="mt-2 border-t border-white/[0.04] pt-2">
                <button
                  onClick={() => { dispatch({ type: 'SET_CLAW_VIEW', payload: 'carousel' }); }}
                  className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors rounded-md mx-1 
                    ${clawView === 'carousel'
                      ? 'bg-white/[0.06] text-white/70'
                      : 'text-white/65 hover:bg-white/[0.04] hover:text-white/80'
                    } ${focusRingClass}`}
                  style={{ width: 'calc(100% - 8px)' }}
                >
                  <span className="flex items-center gap-1.5">
                    <LayoutGrid size={12} />
                    Carousel ({latestResponses.length})
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col">

          {/* Concierge View — Chat */}
          {clawView === 'concierge' && (
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 claw-view-enter">
              {messages.length === 0 && !state.isConciergeSending && (
                <BoardroomStage />
              )}

              {messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} modelLabel={currentModelLabel} />
              ))}

              {state.isConciergeSending && (
                <div className="flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${modeTheme.busyIcon}`}>
                    <SurfaceIcon size={14} />
                  </div>
                  <div className="flex items-center gap-2 py-3 text-white/60 text-sm">
                    <Loader2 size={14} className="animate-spin" />
                    {surfaceState.kind === 'execute'
                      ? 'Preparing execution...'
                      : surfaceState.kind === 'build'
                        ? 'Advancing build...'
                        : 'Thinking...'}
                  </div>
                </div>
              )}

              {/* In-thread build session card (local executor) */}
              {activeClawBuildSession && (
                <BuildRunwayCard session={activeClawBuildSession} />
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Carousel View — Show FolioCarousel + agent click-to-focus */}
          {clawView === 'carousel' && (
            <div className="flex-1 overflow-hidden flex flex-col claw-view-enter">
              {state.isBroadcasting && (
                <div className="flex items-center gap-2 px-6 py-2 text-xs text-gold/60">
                  <Loader2 size={12} className="animate-spin" />
                  Broadcasting to {councilAgents.length} agents...
                </div>
              )}

              <div className="flex-1 overflow-hidden">
                <FolioCarousel />
              </div>

              {/* Agent quick-focus bar */}
              {latestResponses.length > 0 && (
                <div className="flex items-center gap-2 px-6 py-2 border-t border-white/[0.06] overflow-x-auto flex-shrink-0">
                  <MessageSquare size={12} className="text-white/60 flex-shrink-0" />
                  <span className="text-[10px] text-white/60 mr-1 flex-shrink-0">Direct chat:</span>
                  {latestResponses.map(r => (
                    <button
                      key={r.id}
                      onClick={() => r.agent_id && handleFocusAgent(r.agent_id)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] 
                                 text-[11px] text-white/70 hover:text-white/85 transition-all flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
                    >
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.agent_color }} />
                      {r.agent_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Focus View — Direct agent chat */}
          {clawView === 'focus' && (
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 claw-view-enter">
              {messages.length === 0 && !state.isConciergeSending && focusedAgent && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                   <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                        style={{ backgroundColor: `${focusedAgent.color}15` }}>
                     <Bot size={28} style={{ color: `${focusedAgent.color}90` }} />
                   </div>
                   <h3 className="text-lg font-medium text-white/70 mb-2">
                     {focusedAgent.display_name || focusedAgent.name}
                   </h3>
                   <p className="text-sm text-white/60 max-w-md">
                     Direct conversation. This thread is preserved and included in synthesis.
                   </p>
                 </div>
              )}

              {messages.map(msg => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  modelLabel={focusedAgent?.display_name || focusedAgent?.name || 'Agent'}
                  agentColor={focusedAgent?.color}
                />
              ))}

              {state.isConciergeSending && focusedAgent && (
                <div className="flex items-start gap-3">
                   <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: `${focusedAgent.color}15` }}>
                     <Bot size={14} style={{ color: `${focusedAgent.color}90` }} />
                   </div>
                   <div className="flex items-center gap-2 py-3 text-white/60 text-sm">
                     <Loader2 size={14} className="animate-spin" />
                     Thinking...
                   </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      <RevealComposer variant="thread" />
    </div>
  );
}

function MessageBubble({ message, modelLabel, agentColor }: {
  message: ThreadMessage;
  modelLabel: string;
  agentColor?: string;
}) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const accentColor = agentColor || '#D6B24A';
  const remarkPlugins = useMemo(() => [remarkGfm], []);
  const metadataKind = typeof message.metadata.kind === 'string' ? message.metadata.kind : null;

  if (!isUser && !isSystem && (metadataKind === 'concierge_decision' || metadataKind === 'concierge_triage')) {
    return <ConciergeEventCard message={message} />;
  }

  if (isSystem && metadataKind === 'plan_card') {
    return <PlanCardRenderer message={message} />;
  }

  if (isSystem) {
    if (metadataKind) {
      return <SystemEventCard message={message} />;
    }

    return (
      <div className="mx-1 my-0.5 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5">
        <div
          className="text-sm leading-relaxed text-white/65 whitespace-pre-wrap"
          style={{ whiteSpace: 'pre-wrap' }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex items-start gap-3 justify-end">
        <div className="py-2.5 px-4 rounded-2xl rounded-br-sm bg-gold/10 border border-gold/10 
                        text-sm text-white/80 max-w-[80%] whitespace-pre-wrap">
          {message.content}
        </div>
        <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
          <User size={14} className="text-white/70" />
        </div>
      </div>
    );
  }

  // Agent / Concierge message — rendered with markdown
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
           style={{ backgroundColor: `${accentColor}15` }}>
        <Bot size={14} style={{ color: `${accentColor}90` }} />
      </div>
      <div className="flex-1 max-w-[80%]">
        <div className="text-[10px] text-white/60 mb-1">{modelLabel}</div>
        <div className="py-2.5 px-4 rounded-2xl rounded-bl-sm bg-white/[0.04] border border-white/[0.06] 
                        text-sm text-white/80 leading-relaxed claw-prose">
          <ReactMarkdown remarkPlugins={remarkPlugins}>{message.content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
