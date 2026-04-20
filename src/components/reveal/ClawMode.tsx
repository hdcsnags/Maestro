import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Send, ChevronDown, X, Loader2, Bot, User, AlertCircle, Radio, RefreshCw, ArrowLeft, MessageSquare } from 'lucide-react';
import { useMaestro } from '../../context/MaestroContext';
import { useThreads } from '../../hooks/useThreads';
import { useOrchestration } from '../../hooks/useOrchestration';
import { useWorkspace } from '../../hooks/useWorkspace';
import { CONCIERGE_MODELS, type ThreadMessage, type ClawView } from '../../types';
import FolioCarousel from './FolioCarousel';

export default function ClawMode() {
  const { state, dispatch } = useMaestro();
  const { ensureConciergeThread, sendToConcierge, sendToAgent, createThread, loadThreadMessages, addMessage } = useThreads();
  const { broadcast, synthesize } = useOrchestration();
  const { createSession } = useWorkspace();
  const [input, setInput] = useState('');
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const initRef = useRef(false);
  const pickerRef = useRef<HTMLDivElement>(null);

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

  // Initialize concierge thread on mount
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

    // Ensure session exists
    let sessionId = state.activeSession?.id;
    if (!sessionId && state.workspace) {
      const session = await createSession(state.workspace.id, 'ask');
      if (!session) return;
      sessionId = session.id;
    }
    if (!sessionId) return;

    // Log the broadcast intent in the concierge thread
    if (state.activeThread?.type === 'concierge') {
      await addMessage(state.activeThread.id, 'user', `📡 Broadcasting: ${text}`);
    }

    // Create a broadcast thread
    await createThread(sessionId, 'broadcast', { title: text.slice(0, 60) });

    // Dispatch to existing broadcast infrastructure
    const agentIds = councilAgents.map(a => a.id);
    await broadcast(text, agentIds, state.activeSession, { skipTriage: true });

    dispatch({ type: 'SET_CLAW_VIEW', payload: 'carousel' });
  }, [input, state.isBroadcasting, state.activeSession, state.workspace, state.activeThread, councilAgents, broadcast, createSession, createThread, addMessage, dispatch]);

  const handleSynthesize = useCallback(async () => {
    if (state.isSynthesizing || !latestRound) return;

    await synthesize(latestRound.id);

    // Get the latest synthesis and write it to the concierge thread
    const conciergeThread = state.threads.find(t => t.type === 'concierge' && t.status === 'active');
    if (conciergeThread) {
      const latestSynth = state.syntheses[state.syntheses.length - 1];
      if (latestSynth?.content) {
        await addMessage(conciergeThread.id, 'concierge', `🔄 **Synthesis**\n\n${latestSynth.content}`);
      }
      dispatch({ type: 'SET_ACTIVE_THREAD', payload: conciergeThread });
    }

    dispatch({ type: 'SET_CLAW_VIEW', payload: 'concierge' });
    dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: null });
  }, [state.isSynthesizing, latestRound, state.threads, state.syntheses, synthesize, addMessage, dispatch]);

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

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  // ─── Placeholder text based on view ───────────────────────
  const placeholder = clawView === 'focus' && focusedAgent
    ? `Chat with ${focusedAgent.display_name || focusedAgent.name}...`
    : 'Talk to Concierge...';

  // ─── Render ───────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col reveal-bg" style={{ isolation: 'isolate' }}>
      <div className="grain-layer" />
      <div className="vignette-layer" />

      {/* Header — z-20 so model picker dropdown (z-9999 inside this context) paints above z-10 content */}
      <div className="relative z-20 flex items-center justify-between px-6 py-3 border-b border-white/5">
        <div className="flex items-center gap-3">
          {/* Back button when in carousel/focus */}
          {clawView !== 'concierge' && (
            <button
              onClick={clawView === 'focus' ? handleBackToCarousel : handleBackToConcierge}
              className="p-1.5 rounded-lg hover:bg-white/5 text-white/40 hover:text-white/80 transition-colors"
            >
              <ArrowLeft size={14} />
            </button>
          )}

          <div className="w-2 h-2 rounded-full bg-gold animate-pulse" />
          <span className="text-sm font-medium text-white/80 tracking-wide uppercase">
            Claw Mode
          </span>
          <span className="text-xs text-white/30">·</span>
          <span className="text-xs text-white/40">
            {clawView === 'focus' && focusedAgent
              ? focusedAgent.display_name || focusedAgent.name
              : clawView === 'carousel'
              ? 'Orchestra'
              : 'Concierge'}
          </span>

          {/* View indicator pills */}
          <div className="flex items-center gap-1 ml-3">
            {(['concierge', 'carousel', 'focus'] as ClawView[]).map(v => (
              <div
                key={v}
                className={`w-1.5 h-1.5 rounded-full transition-colors ${
                  clawView === v ? 'bg-gold' : 'bg-white/10'
                }`}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Model picker (concierge view only) */}
          {clawView === 'concierge' && (
            <div ref={pickerRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setModelPickerOpen(!modelPickerOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 
                           text-xs text-white/60 hover:text-white/80 transition-all"
              >
                <Bot size={12} />
                {currentModelLabel}
                <ChevronDown size={12} className={`transition-transform ${modelPickerOpen ? 'rotate-180' : ''}`} />
              </button>

              {modelPickerOpen && (
                <div
                  style={{
                    position: 'fixed',
                    top: pickerRef.current ? pickerRef.current.getBoundingClientRect().bottom + 4 : 0,
                    right: 60,
                    width: 224,
                    zIndex: 9999,
                  }}
                  className="rounded-lg bg-void-2 border border-white/10 shadow-xl overflow-hidden"
                >
                  {CONCIERGE_MODELS.map(m => (
                    <button
                      key={m.id}
                      onClick={() => handleModelSelect(m.id)}
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
          )}

          {/* Focus view: agent info badge */}
          {clawView === 'focus' && focusedAgent && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-xs text-white/40">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: focusedAgent.color }} />
              {focusedAgent.model}
            </div>
          )}

          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-white/5 text-white/40 hover:text-white/80 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ─── Main Content Area ─────────────────────────────── */}
      <div className="relative z-10 flex-1 overflow-hidden flex flex-col">

        {/* Concierge View — Chat */}
        {clawView === 'concierge' && (
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {messages.length === 0 && !state.isConciergeSending && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-full bg-gold/10 flex items-center justify-center mb-4">
                  <Bot size={28} className="text-gold/60" />
                </div>
                <h3 className="text-lg font-medium text-white/70 mb-2">Concierge is ready</h3>
                <p className="text-sm text-white/30 max-w-md">
                  Chat with your concierge, broadcast to the orchestra, or dive into a direct conversation with any agent.
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

            <div ref={messagesEndRef} />
          </div>
        )}

        {/* Carousel View — Show FolioCarousel + agent click-to-focus */}
        {clawView === 'carousel' && (
          <div className="flex-1 overflow-hidden flex flex-col">
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
              <div className="flex items-center gap-2 px-6 py-2 border-t border-white/5">
                <MessageSquare size={12} className="text-white/20" />
                <span className="text-[10px] text-white/20 mr-1">Chat with:</span>
                {latestResponses.map(r => (
                  <button
                    key={r.id}
                    onClick={() => r.agent_id && handleFocusAgent(r.agent_id)}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 
                               text-[11px] text-white/50 hover:text-white/80 transition-all"
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
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {messages.length === 0 && !state.isConciergeSending && focusedAgent && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                     style={{ backgroundColor: `${focusedAgent.color}15` }}>
                  <Bot size={28} style={{ color: `${focusedAgent.color}90` }} />
                </div>
                <h3 className="text-lg font-medium text-white/70 mb-2">
                  {focusedAgent.display_name || focusedAgent.name}
                </h3>
                <p className="text-sm text-white/30 max-w-md">
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

      {/* ─── Input Bar + Action Buttons ────────────────────── */}
      <div className="relative z-10 border-t border-white/5 px-6 py-4">
        <div className="flex items-end gap-3 max-w-4xl mx-auto">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className="flex-1 resize-none rounded-xl bg-white/5 border border-white/10 
                       px-4 py-3 text-sm text-white/90 placeholder:text-white/20
                       focus:outline-none focus:border-gold/30 focus:ring-1 focus:ring-gold/20
                       transition-all min-h-[44px] max-h-[200px]"
            style={{ height: 'auto', overflow: 'hidden' }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 200) + 'px';
            }}
          />

          {/* Send */}
          <button
            onClick={handleSend}
            disabled={!input.trim() || state.isConciergeSending}
            className="flex items-center justify-center w-10 h-10 rounded-xl bg-gold/80 
                       hover:bg-gold text-void disabled:opacity-30 disabled:cursor-not-allowed
                       transition-all flex-shrink-0"
            title="Send (Enter)"
          >
            <Send size={16} />
          </button>

          {/* Broadcast — available in concierge and carousel views */}
          {clawView !== 'focus' && (
            <button
              onClick={handleBroadcast}
              disabled={!input.trim() || state.isBroadcasting || councilAgents.length === 0}
              className="flex items-center gap-1.5 px-3 h-10 rounded-xl bg-white/5 border border-white/10
                         hover:bg-white/10 text-white/50 hover:text-white/80 
                         disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0 text-xs"
              title="Broadcast to Orchestra"
            >
              <Radio size={14} />
              <span className="hidden sm:inline">Broadcast</span>
            </button>
          )}

          {/* Synthesize — available when responses exist */}
          {latestRound && latestResponses.length > 0 && (
            <button
              onClick={handleSynthesize}
              disabled={state.isSynthesizing}
              className="flex items-center gap-1.5 px-3 h-10 rounded-xl bg-white/5 border border-white/10
                         hover:bg-white/10 text-white/50 hover:text-white/80
                         disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0 text-xs"
              title="Synthesize responses"
            >
              <RefreshCw size={14} className={state.isSynthesizing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Synthesize</span>
            </button>
          )}
        </div>

        <div className="text-center mt-2">
          <span className="text-[10px] text-white/15">
            {clawView === 'focus'
              ? 'Enter to send · Esc to close · ← Back to orchestra'
              : 'Enter to send · Broadcast to ask the orchestra · Esc to close'}
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

  // Agent / Concierge message
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
           style={{ backgroundColor: `${accentColor}15` }}>
        <Bot size={14} style={{ color: `${accentColor}90` }} />
      </div>
      <div className="flex-1 max-w-[80%]">
        <div className="text-[10px] text-white/20 mb-1">{modelLabel}</div>
        <div className="py-2.5 px-4 rounded-2xl rounded-bl-sm bg-white/[0.03] border border-white/5 
                        text-sm text-white/70 whitespace-pre-wrap leading-relaxed">
          {message.content}
        </div>
      </div>
    </div>
  );
}
