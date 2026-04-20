import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Send, ChevronDown, X, Loader2, Bot, User, AlertCircle, Radio, RefreshCw, ArrowLeft, MessageSquare, Zap, Check, XCircle, Hammer, PanelLeftOpen, PanelLeftClose, GitBranch } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMaestro } from '../../context/MaestroContext';
import { useThreads } from '../../hooks/useThreads';
import { useOrchestration } from '../../hooks/useOrchestration';
import { useWorkspace } from '../../hooks/useWorkspace';
import { CONCIERGE_MODELS, type ThreadMessage, type ClawView, type Thread } from '../../types';
import FolioCarousel from './FolioCarousel';

type ComposerIntent = 'chat' | 'broadcast' | 'execute' | 'build';

const INTENT_CONFIG: Record<ComposerIntent, { label: string; icon: string; color: string; bg: string; border: string }> = {
  chat:      { label: 'Chat',      icon: '💬', color: 'text-white/70',       bg: 'bg-gold/80',         border: 'border-gold/30' },
  broadcast: { label: 'Broadcast', icon: '📡', color: 'text-white/60',       bg: 'bg-white/10',        border: 'border-white/10' },
  execute:   { label: 'Execute',   icon: '⚡', color: 'text-amber-400/80',   bg: 'bg-amber-500/20',    border: 'border-amber-500/20' },
  build:     { label: 'Build',     icon: '🏗️', color: 'text-emerald-400/80', bg: 'bg-emerald-500/20',  border: 'border-emerald-500/20' },
};

export default function ClawMode() {
  const { state, dispatch } = useMaestro();
  const { ensureConciergeThread, sendToConcierge, sendToAgent, createThread, loadThreads, loadThreadMessages, addMessage, executeFromChat, approveExecutionJob, pollJobStatus, buildFromChat, approveBuildPlan, cancelBuildPlan } = useThreads();
  const { broadcast, synthesize } = useOrchestration();
  const { createSession } = useWorkspace();
  const [input, setInput] = useState('');
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [composerIntent, setComposerIntent] = useState<ComposerIntent>('chat');
  const [intentMenuOpen, setIntentMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initRef = useRef(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const intentRef = useRef<HTMLDivElement>(null);

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

  // Council agents (exclude executors) for broadcast
  const councilAgents = useMemo(
    () => state.agents.filter(a => a.is_active && a.agent_role !== 'executor' && a.provider_group !== 'maestroclaw'),
    [state.agents],
  );

  // Latest round info for carousel view
  const latestRound = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1] : null;
  const latestResponses = latestRound ? state.responses.filter(r => r.round_id === latestRound.id) : [];

  // Close model picker on click outside
  useEffect(() => {
    if (!modelPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setModelPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modelPickerOpen]);

  // Close intent menu on click outside
  useEffect(() => {
    if (!intentMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (intentRef.current && !intentRef.current.contains(e.target as Node)) {
        setIntentMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [intentMenuOpen]);

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

  // Initialize: load persisted threads + ensure concierge thread
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      let sessionId = state.activeSession?.id;
      if (!sessionId && state.workspace) {
        const session = await createSession(state.workspace.id, 'ask');
        if (!session) return;
        sessionId = session.id;
      }
      if (!sessionId) return;

      // Load all persisted threads for the sidebar
      await loadThreads(sessionId);

      const thread = await ensureConciergeThread(sessionId);
      if (thread) {
        dispatch({ type: 'SET_ACTIVE_THREAD', payload: thread });
        await loadThreadMessages(thread.id);
      }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Focus input on mount and view change
  useEffect(() => {
    inputRef.current?.focus();
  }, [clawView]);

  // Auto-switch to carousel when broadcast finishes
  const wasBroadcasting = useRef(false);
  useEffect(() => {
    if (state.isBroadcasting) {
      wasBroadcasting.current = true;
      if (clawView !== 'carousel') {
        dispatch({ type: 'SET_CLAW_VIEW', payload: 'carousel' });
      }
    } else if (wasBroadcasting.current && latestResponses.length > 0) {
      wasBroadcasting.current = false;
      dispatch({ type: 'SET_CLAW_VIEW', payload: 'carousel' });
    }
  }, [state.isBroadcasting, latestResponses.length, clawView, dispatch]);

  // ─── Handlers ───────────────────────────────────────────────

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || state.isConciergeSending) return;
    setInput('');

    if (clawView === 'focus' && focusedAgent && state.activeThread?.type === 'direct') {
      // Direct chat with focused agent
      await sendToAgent(state.activeThread.id, focusedAgent.id, text);
    } else if (state.activeThread) {
      // Send to concierge
      await sendToConcierge(state.activeThread.id, text);
    }
  }, [input, state.isConciergeSending, state.activeThread, clawView, focusedAgent, sendToConcierge, sendToAgent]);

  const handleBroadcast = useCallback(async () => {
    const text = input.trim();
    if (!text || state.isBroadcasting || councilAgents.length === 0) return;
    setInput('');

    // Ensure session exists — pass created session directly (not stale state)
    let sessionForBroadcast = state.activeSession;
    if (!sessionForBroadcast && state.workspace) {
      const created = await createSession(state.workspace.id, 'ask');
      if (!created) return;
      sessionForBroadcast = created;
    }
    if (!sessionForBroadcast) return;

    // Log the broadcast intent in the concierge thread
    if (state.activeThread?.type === 'concierge') {
      await addMessage(state.activeThread.id, 'user', `📡 Broadcasting: ${text}`);
    }

    // Create a broadcast thread and write the prompt as its first message
    const broadcastThread = await createThread(sessionForBroadcast.id, 'broadcast', { title: text.slice(0, 60) });
    if (broadcastThread) {
      await addMessage(broadcastThread.id, 'user', text);
    }

    // Dispatch to existing broadcast infrastructure
    const agentIds = councilAgents.map(a => a.id);
    await broadcast(text, agentIds, sessionForBroadcast, { skipTriage: true });

    dispatch({ type: 'SET_CLAW_VIEW', payload: 'carousel' });
  }, [input, state.isBroadcasting, state.activeSession, state.workspace, state.activeThread, councilAgents, broadcast, createSession, createThread, addMessage, dispatch]);

  const handleSynthesize = useCallback(async () => {
    if (state.isSynthesizing || !latestRound) return;

    const result = await synthesize(latestRound.id);

    // Get synthesis from the returned result, not from stale closure state
    const conciergeThread = state.threads.find(t => t.type === 'concierge' && t.status === 'active');
    if (conciergeThread && result?.content) {
      await addMessage(conciergeThread.id, 'concierge', `🔄 **Synthesis**\n\n${result.content}`);
      dispatch({ type: 'SET_ACTIVE_THREAD', payload: conciergeThread });
    }

    dispatch({ type: 'SET_CLAW_VIEW', payload: 'concierge' });
    dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: null });
  }, [state.isSynthesizing, latestRound, state.threads, synthesize, addMessage, dispatch]);

  const handleFocusAgent = useCallback(async (agentId: string) => {
    if (!state.activeSession) return;

    dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: agentId });

    // Find or create a direct thread for this agent
    let directThread = state.threads.find(
      t => t.type === 'direct' && t.agent_id === agentId && t.status === 'active'
    );

    const isNewThread = !directThread;

    if (!directThread) {
      const agent = state.agents.find(a => a.id === agentId);
      directThread = await createThread(state.activeSession.id, 'direct', {
        agentId,
        title: agent?.display_name || agent?.name || 'Agent',
      });
    }

    if (directThread) {
      dispatch({ type: 'SET_ACTIVE_THREAD', payload: directThread });

      if (isNewThread) {
        // Seed the new thread with the agent's broadcast response so context is preserved
        const agentResponse = latestResponses.find(r => r.agent_id === agentId);
        if (agentResponse?.content) {
          await addMessage(directThread.id, 'concierge', agentResponse.content);
        }
      }

      await loadThreadMessages(directThread.id);
    }

    dispatch({ type: 'SET_CLAW_VIEW', payload: 'focus' });
  }, [state.activeSession, state.threads, state.agents, latestResponses, createThread, loadThreadMessages, addMessage, dispatch]);

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
    dispatch({ type: 'SET_CLAW_MODE_ACTIVE', payload: false });
  }, [dispatch]);

  const handleModelSelect = useCallback((modelId: string) => {
    dispatch({ type: 'SET_CONCIERGE_MODEL', payload: modelId });
    setModelPickerOpen(false);
  }, [dispatch]);

  const handleExecute = useCallback(async () => {
    const text = input.trim();
    if (!text || state.isConciergeSending) return;
    setInput('');

    // Ensure we have a concierge thread
    const threadId = state.activeThread?.id;
    if (!threadId) return;

    // Create an execution thread if we're in concierge view
    let execThreadId = threadId;
    if (state.activeThread?.type === 'concierge' && state.activeSession) {
      const execThread = await createThread(state.activeSession.id, 'execution', {
        title: `⚡ ${text.slice(0, 50)}`,
      });
      if (execThread) {
        execThreadId = execThread.id;
        dispatch({ type: 'SET_ACTIVE_THREAD', payload: execThread });
      }
    }

    await executeFromChat(execThreadId, text);
    await loadThreadMessages(execThreadId);
  }, [input, state.isConciergeSending, state.activeThread, state.activeSession, createThread, executeFromChat, loadThreadMessages, dispatch]);

  const handleApproveExecution = useCallback(async () => {
    const pending = state.pendingExecution;
    if (!pending) return;

    await approveExecutionJob(pending.jobId, pending.threadId);
    dispatch({ type: 'SET_PENDING_EXECUTION', payload: null });

    // Start polling for result
    let attempts = 0;
    const maxAttempts = 30;
    const pollInterval = 2000;
    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, pollInterval));
      attempts++;
      const updated = await pollJobStatus(pending.jobId, pending.threadId);
      if (updated && (updated.status === 'succeeded' || updated.status === 'failed')) break;
    }
    await loadThreadMessages(pending.threadId);
  }, [state.pendingExecution, approveExecutionJob, pollJobStatus, loadThreadMessages, dispatch]);

  const handleRejectExecution = useCallback(async () => {
    const pending = state.pendingExecution;
    if (!pending) return;
    await addMessage(pending.threadId, 'system', '🚫 Execution rejected by user.');
    dispatch({ type: 'SET_PENDING_EXECUTION', payload: null });
    await loadThreadMessages(pending.threadId);
  }, [state.pendingExecution, addMessage, loadThreadMessages, dispatch]);

  const handleBuild = useCallback(async () => {
    const text = input.trim();
    if (!text || state.isConciergeSending) return;
    setInput('');

    const threadId = state.activeThread?.id;
    if (!threadId) return;

    await buildFromChat(threadId, text);
    await loadThreadMessages(threadId);
  }, [input, state.isConciergeSending, state.activeThread, buildFromChat, loadThreadMessages]);

  const handleApproveBuild = useCallback(async () => {
    const threadId = state.activeThread?.id;
    if (!threadId) return;
    await approveBuildPlan(threadId);
    await loadThreadMessages(threadId);
  }, [state.activeThread, approveBuildPlan, loadThreadMessages]);

  const handleCancelBuild = useCallback(async () => {
    const threadId = state.activeThread?.id;
    if (!threadId) return;
    await cancelBuildPlan(threadId);
    await loadThreadMessages(threadId);
  }, [state.activeThread, cancelBuildPlan, loadThreadMessages]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (composerIntent === 'chat') handleSend();
      else if (composerIntent === 'broadcast') handleBroadcast();
      else if (composerIntent === 'execute') handleExecute();
      else if (composerIntent === 'build') handleBuild();
    }
    // Escape closes intent menu first, then model picker, then claw
    if (e.key === 'Escape') {
      if (intentMenuOpen) { setIntentMenuOpen(false); e.stopPropagation(); return; }
      if (modelPickerOpen) { setModelPickerOpen(false); e.stopPropagation(); return; }
    }
  }, [composerIntent, handleSend, handleBroadcast, handleExecute, handleBuild, intentMenuOpen, modelPickerOpen]);

  // Handle thread click in sidebar
  const handleThreadClick = useCallback(async (thread: Thread) => {
    dispatch({ type: 'SET_ACTIVE_THREAD', payload: thread });
    await loadThreadMessages(thread.id);
    if (thread.type === 'concierge') {
      dispatch({ type: 'SET_CLAW_VIEW', payload: 'concierge' });
      dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: null });
    } else if (thread.type === 'direct' && thread.agent_id) {
      dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: thread.agent_id });
      dispatch({ type: 'SET_CLAW_VIEW', payload: 'focus' });
    } else {
      dispatch({ type: 'SET_CLAW_VIEW', payload: 'concierge' });
    }
  }, [dispatch, loadThreadMessages]);

  // ─── Placeholder text based on view + intent ──────────────
  const placeholder = clawView === 'focus' && focusedAgent
    ? `Chat with ${focusedAgent.display_name || focusedAgent.name}...`
    : composerIntent === 'broadcast' ? 'Broadcast to the orchestra...'
    : composerIntent === 'execute' ? 'Describe a command to execute...'
    : composerIntent === 'build' ? 'Describe what to build...'
    : 'Talk to Concierge...';

  const intentCfg = INTENT_CONFIG[composerIntent];
  const hasRepo = !!activeRepo;

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full w-full" style={{ isolation: 'isolate' }}>

      {/* ─── Context Header ────────────────────────────────── */}
      <div className="relative z-20 flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>

          {/* Back button when in carousel/focus */}
          {clawView !== 'concierge' && (
            <button
              onClick={clawView === 'focus' ? handleBackToCarousel : handleBackToConcierge}
              className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors"
            >
              <ArrowLeft size={14} />
            </button>
          )}

          {/* Thread type badge */}
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-gold animate-pulse" />
            <span className="text-xs font-medium text-white/60 tracking-wide uppercase">
              {threadTypeLabel}
            </span>
          </div>

          {/* Context pills */}
          <div className="flex items-center gap-1.5">
            {clawView === 'focus' && focusedAgent && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] text-[11px] text-white/40">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: focusedAgent.color }} />
                {focusedAgent.display_name || focusedAgent.name}
              </span>
            )}
            {clawView === 'carousel' && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] text-[11px] text-white/40">
                <Radio size={10} />
                {latestResponses.length} responses
              </span>
            )}
            {state.chatBuildPhase !== 'idle' && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-[11px] text-emerald-400/70">
                <Hammer size={10} />
                {state.chatBuildPhase}
              </span>
            )}
            {hasRepo && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] text-[11px] text-white/30">
                <GitBranch size={10} />
                {(activeRepo as { repo_full_name?: string })?.repo_full_name?.split('/')[1] || 'repo'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Model picker */}
          <div ref={pickerRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setModelPickerOpen(!modelPickerOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] 
                         text-[11px] text-white/50 hover:text-white/70 transition-all"
              aria-expanded={modelPickerOpen}
              aria-haspopup="listbox"
            >
              <Bot size={11} />
              {currentModelLabel}
              <ChevronDown size={11} className={`transition-transform ${modelPickerOpen ? 'rotate-180' : ''}`} />
            </button>

            {modelPickerOpen && (
              <div
                style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, width: 224, zIndex: 9999 }}
                className="rounded-lg bg-void-2 border border-white/10 shadow-xl overflow-hidden"
                role="listbox"
              >
                {CONCIERGE_MODELS.map(m => (
                  <button
                    key={m.id}
                    onClick={() => handleModelSelect(m.id)}
                    role="option"
                    aria-selected={m.id === state.conciergeModel}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors
                      ${m.id === state.conciergeModel
                        ? 'bg-gold/10 text-gold'
                        : 'text-white/60 hover:bg-white/5 hover:text-white/80'
                      }`}
                  >
                    <div className="font-medium">{m.label}</div>
                    <div className="text-xs opacity-50 mt-0.5">{m.provider}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Focus view: agent info badge */}
          {clawView === 'focus' && focusedAgent && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] text-[11px] text-white/40">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: focusedAgent.color }} />
              {focusedAgent.model}
            </div>
          )}

          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-colors"
            title="Exit to legacy workspace"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {/* ─── Body: Sidebar + Content ───────────────────────── */}
      <div className="flex-1 flex overflow-hidden">

        {/* Thread Sidebar */}
        {sidebarOpen && (
          <div className="w-56 flex-shrink-0 border-r border-white/[0.06] overflow-y-auto py-2 claw-sidebar" 
               style={{ background: 'rgba(0,0,0,0.15)' }}>
            {/* Thread groups */}
            {([
              { type: 'concierge', icon: '🎙', label: 'Concierge' },
              { type: 'broadcast', icon: '📡', label: 'Broadcasts' },
              { type: 'direct',    icon: '💬', label: 'Direct' },
              { type: 'execution', icon: '⚡', label: 'Execution' },
            ] as const).map(group => {
              const threads = threadGroups[group.type] || [];
              if (threads.length === 0 && group.type !== 'concierge') return null;
              return (
                <div key={group.type} className="mb-1">
                  <div className="px-3 py-1.5 text-[10px] text-white/35 uppercase tracking-widest font-medium">
                    {group.icon} {group.label}
                  </div>
                  {threads.length === 0 && (
                    <div className="px-3 py-1 text-[11px] text-white/25 italic">No threads yet</div>
                  )}
                  {threads.map(thread => {
                    const isActive = state.activeThread?.id === thread.id;
                    const agent = thread.agent_id ? state.agents.find(a => a.id === thread.agent_id) : null;
                    const threadLabel = thread.title || agent?.display_name || agent?.name || group.label;
                    return (
                      <button
                        key={thread.id}
                        onClick={() => handleThreadClick(thread)}
                        className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors rounded-md mx-1 
                          ${isActive
                            ? 'bg-gold/10 text-gold/90 border-l-2 border-gold/40'
                            : 'text-white/40 hover:bg-white/[0.04] hover:text-white/60 border-l-2 border-transparent'
                          }`}
                        style={{ width: 'calc(100% - 8px)' }}
                      >
                        <div className="truncate flex items-center gap-1.5">
                          {agent && (
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: agent.color }} />
                          )}
                          {threadLabel}
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
                      : 'text-white/30 hover:bg-white/[0.04] hover:text-white/50'
                    }`}
                  style={{ width: 'calc(100% - 8px)' }}
                >
                  🎠 Carousel ({latestResponses.length})
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
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className="w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center mb-4">
                    <Bot size={28} className="text-gold/60" />
                  </div>
                  <h3 className="text-lg font-medium text-white/70 mb-2">Concierge is ready</h3>
                  <p className="text-sm text-white/40 max-w-md">
                    Chat, broadcast to the orchestra, execute commands, or build to a repo.
                  </p>
                </div>
              )}

              {messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} modelLabel={currentModelLabel} />
              ))}

              {state.isConciergeSending && (
                <div className="flex items-start gap-3">
                  <div className="w-7 h-7 rounded-full bg-gold/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Bot size={14} className="text-gold/60" />
                  </div>
                  <div className="flex items-center gap-2 py-3 text-white/30 text-sm">
                    <Loader2 size={14} className="animate-spin" />
                    Thinking...
                  </div>
                </div>
              )}

              {/* Pending execution approval card */}
              {state.pendingExecution && state.pendingExecution.threadId === state.activeThread?.id && (
                <div className="mx-auto max-w-md rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 my-3">
                  <div className="flex items-center gap-2 text-amber-400 text-sm font-medium mb-2">
                    <Zap size={14} />
                    Approval Required
                  </div>
                  <div className="text-white/70 text-sm mb-1">
                    {state.pendingExecution.intent.description}
                  </div>
                  {state.pendingExecution.intent.command && (
                    <code className="block text-xs text-white/50 bg-black/30 rounded px-2 py-1 mb-3 font-mono">
                      {state.pendingExecution.intent.command}
                    </code>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleApproveExecution}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600/80 hover:bg-green-600 
                                 text-white text-xs transition-all"
                    >
                      <Check size={12} /> Approve
                    </button>
                    <button
                      onClick={handleRejectExecution}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/30 hover:bg-red-600/50 
                                 text-red-300 text-xs transition-all"
                    >
                      <XCircle size={12} /> Reject
                    </button>
                  </div>
                </div>
              )}

              {/* Pending build plan approval card */}
              {state.chatBuildPhase === 'reviewing' && state.chatBuildPlan && (
                <div className="mx-auto max-w-md rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 my-3">
                  <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium mb-2">
                    <Hammer size={14} />
                    Build Plan Ready
                  </div>
                  <div className="text-white/70 text-sm mb-2">
                    {state.chatBuildPlan.description}
                  </div>
                  <div className="space-y-1 mb-3">
                    {state.chatBuildPlan.files.map((f, i) => {
                      const icon = f.action === 'create' ? '📄' : f.action === 'update' ? '📝' : '🗑️';
                      return (
                        <div key={i} className="text-xs text-white/50 font-mono">
                          {icon} {f.path} — <span className="text-white/30">{f.description}</span>
                        </div>
                      );
                    })}
                  </div>
                  <code className="block text-xs text-white/40 bg-black/30 rounded px-2 py-1 mb-3 font-mono">
                    {state.chatBuildPlan.commit_message}
                  </code>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleApproveBuild}
                      disabled={state.isConciergeSending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-600 
                                 text-white text-xs transition-all disabled:opacity-50"
                    >
                      <Check size={12} /> Approve Build
                    </button>
                    <button
                      onClick={handleCancelBuild}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/30 hover:bg-red-600/50 
                                 text-red-300 text-xs transition-all"
                    >
                      <XCircle size={12} /> Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Build progress indicator */}
              {(state.chatBuildPhase === 'building' || state.chatBuildPhase === 'committing') && (
                <div className="mx-auto max-w-md rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 my-3">
                  <div className="flex items-center gap-2 text-emerald-400/70 text-sm">
                    <Loader2 size={14} className="animate-spin" />
                    {state.chatBuildPhase === 'building' ? 'Building files...' : 'Committing to GitHub...'}
                  </div>
                </div>
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
                  <MessageSquare size={12} className="text-white/35 flex-shrink-0" />
                  <span className="text-[10px] text-white/35 mr-1 flex-shrink-0">Chat:</span>
                  {latestResponses.map(r => (
                    <button
                      key={r.id}
                      onClick={() => r.agent_id && handleFocusAgent(r.agent_id)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.08] 
                                 text-[11px] text-white/40 hover:text-white/70 transition-all flex-shrink-0"
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
                  <p className="text-sm text-white/40 max-w-md">
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
                  <div className="flex items-center gap-2 py-3 text-white/30 text-sm">
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

      {/* ─── Intent-First Composer ──────────────────────────── */}
      <div className="relative z-10 border-t border-white/[0.06] px-4 py-3">
        <div className="flex items-end gap-2 max-w-4xl mx-auto">
          {/* Intent selector */}
          <div ref={intentRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setIntentMenuOpen(!intentMenuOpen)}
              className={`flex items-center gap-1.5 px-3 h-10 rounded-xl ${intentCfg.bg} border ${intentCfg.border}
                         ${intentCfg.color} transition-all text-xs font-medium flex-shrink-0`}
              aria-expanded={intentMenuOpen}
            >
              <span>{intentCfg.icon}</span>
              <span className="hidden sm:inline">{intentCfg.label}</span>
              <ChevronDown size={11} className={`transition-transform ${intentMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {intentMenuOpen && (
              <div
                style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, width: 180, zIndex: 9999 }}
                className="rounded-lg bg-void-2 border border-white/10 shadow-xl overflow-hidden"
              >
                {(Object.keys(INTENT_CONFIG) as ComposerIntent[]).map(intent => {
                  const cfg = INTENT_CONFIG[intent];
                  const disabled = intent === 'build' && !hasRepo;
                  return (
                    <button
                      key={intent}
                      onClick={() => { if (!disabled) { setComposerIntent(intent); setIntentMenuOpen(false); } }}
                      disabled={disabled}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2
                        ${composerIntent === intent ? 'bg-gold/10 text-gold' : 'text-white/60 hover:bg-white/5 hover:text-white/80'}
                        ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
                    >
                      <span>{cfg.icon}</span>
                      <span>{cfg.label}</span>
                      {disabled && <span className="text-[10px] text-white/30 ml-auto">No repo</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Input */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className="flex-1 resize-none rounded-xl bg-white/[0.04] border border-white/[0.08] 
                       px-4 py-3 text-sm text-white/90 placeholder:text-white/30
                       focus:outline-none focus:border-gold/30 focus:ring-1 focus:ring-gold/20
                       transition-all min-h-[44px] max-h-[200px]"
            style={{ height: 'auto', overflow: 'hidden' }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 200) + 'px';
            }}
          />

          {/* Send button */}
          <button
            onClick={() => {
              if (composerIntent === 'chat') handleSend();
              else if (composerIntent === 'broadcast') handleBroadcast();
              else if (composerIntent === 'execute') handleExecute();
              else if (composerIntent === 'build') handleBuild();
            }}
            disabled={!input.trim() || state.isConciergeSending || state.isBroadcasting}
            className={`flex items-center justify-center w-10 h-10 rounded-xl ${intentCfg.bg}
                       text-void disabled:opacity-30 disabled:cursor-not-allowed
                       transition-all flex-shrink-0 hover:brightness-110`}
            title={`${intentCfg.label} (Enter)`}
          >
            <Send size={15} />
          </button>

          {/* Synthesize — contextual, appears when responses exist */}
          {latestRound && latestResponses.length > 0 && (
            <button
              onClick={handleSynthesize}
              disabled={state.isSynthesizing}
              className="flex items-center gap-1.5 px-3 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08]
                         hover:bg-white/[0.08] text-white/40 hover:text-white/60
                         disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0 text-xs"
              title="Synthesize responses"
            >
              <RefreshCw size={13} className={state.isSynthesizing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Synth</span>
            </button>
          )}
        </div>

        <div className="text-center mt-1.5">
          <span className="text-[10px] text-white/30">
            Enter to {intentCfg.label.toLowerCase()} · Shift+Enter for newline · Esc to exit
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Message Bubble Component ──────────────────────────────

function MessageBubble({ message, modelLabel, agentColor }: {
  message: ThreadMessage;
  modelLabel: string;
  agentColor?: string;
}) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const accentColor = agentColor || '#D6B24A';
  const remarkPlugins = useMemo(() => [remarkGfm], []);

  if (isSystem) {
    return (
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-full bg-red-500/10 flex items-center justify-center flex-shrink-0 mt-0.5">
          <AlertCircle size={14} className="text-red-400/60" />
        </div>
        <div className="py-2 px-3 rounded-lg bg-red-500/5 border border-red-500/10 text-sm text-red-300/70 max-w-[80%]">
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
          <User size={14} className="text-white/40" />
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
        <div className="text-[10px] text-white/40 mb-1">{modelLabel}</div>
        <div className="py-2.5 px-4 rounded-2xl rounded-bl-sm bg-white/[0.04] border border-white/[0.06] 
                        text-sm text-white/80 leading-relaxed claw-prose">
          <ReactMarkdown remarkPlugins={remarkPlugins}>{message.content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
