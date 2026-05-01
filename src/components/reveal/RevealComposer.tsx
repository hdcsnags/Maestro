import { useState, useRef, useMemo, useEffect, useCallback, KeyboardEvent } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { useOrchestration } from '../../hooks/useOrchestration';
import { useThreads } from '../../hooks/useThreads';
import { useWorkspace } from '../../hooks/useWorkspace';
import { supabase } from '../../lib/supabase';
import {
  AlertTriangle, Bot, ChevronDown, Hammer, MessageSquare, Music, Radio,
  RefreshCw, Send, Terminal, Zap,
} from 'lucide-react';
import { CONCIERGE_MODELS, ComposerIntent, SessionMode, Thread } from '../../types';
import { estimateBroadcastCost, formatCostRange, isFreeModel, PREMIUM_SLOT_CAP } from '../../lib/cost';

type ComposerVariant = 'workspace' | 'thread';

interface Props {
  variant?: ComposerVariant;
}

interface IntentConfig {
  label: string;
  consequence: string;
  Icon: typeof MessageSquare;
  color: string;
  bg: string;
  border: string;
  buttonText: string;
}

const INTENT_CONFIG: Record<ComposerIntent, IntentConfig> = {
  chat: {
    label: 'Direct',
    consequence: 'Concierge replies in this thread',
    Icon: MessageSquare,
    color: 'text-white/85',
    bg: 'bg-gold/80',
    border: 'border-gold/30',
    buttonText: 'text-void',
  },
  broadcast: {
    label: 'Council',
    consequence: 'Broadcasts to active council agents',
    Icon: Radio,
    color: 'text-white/80',
    bg: 'bg-white/10',
    border: 'border-white/15',
    buttonText: 'text-white/90',
  },
  execute: {
    label: 'Execute',
    consequence: 'Runs through the local executor',
    Icon: Zap,
    color: 'text-signal-warn/95',
    bg: 'bg-signal-warn/15',
    border: 'border-signal-warn/25',
    buttonText: 'text-signal-warn/95',
  },
  build: {
    label: 'Build',
    consequence: 'Routes into the build flow',
    Icon: Hammer,
    color: 'text-signal-ok/95',
    bg: 'bg-signal-ok/15',
    border: 'border-signal-ok/25',
    buttonText: 'text-signal-ok/95',
  },
};

const routingKeys = Object.keys(INTENT_CONFIG) as ComposerIntent[];

export default function RevealComposer({ variant = 'workspace' }: Props) {
  const { state, dispatch } = useMaestro();
  const { buildTieredContext, synthesize, broadcast } = useOrchestration();
  const {
    ensureConciergeThread,
    sendToConcierge,
    sendToAgent,
    createThread,
    loadThreadMessages,
    addMessage,
    executeFromChat,
    buildFromChat,
  } = useThreads();
  const { createSession } = useWorkspace();
  const [prompt, setPrompt] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>(
    state.agents.filter(a => a.is_active).map(a => a.id),
  );
  const [elevatedCapAck, setElevatedCapAck] = useState(false);
  const [pendingSessionMode, setPendingSessionMode] = useState<SessionMode>('ask');
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const modelOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const routingBarRef = useRef<Array<HTMLButtonElement | null>>([]);

  const threadVariant = variant === 'thread';
  const activeAgents = state.agents.filter(a => a.is_active);
  const councilAgents = useMemo(
    () => activeAgents.filter(a => a.agent_role !== 'executor' && a.provider_group !== 'maestroclaw'),
    [activeAgents],
  );
  const focusedAgent = useMemo(
    () => state.focusedAgentId ? state.agents.find(a => a.id === state.focusedAgentId) ?? null : null,
    [state.agents, state.focusedAgentId],
  );
  const latestRound = useMemo(
    () => (state.rounds.length > 0 ? state.rounds[state.rounds.length - 1] : null),
    [state.rounds],
  );
  const latestResponses = useMemo(
    () => (latestRound ? state.responses.filter(r => r.round_id === latestRound.id) : []),
    [latestRound, state.responses],
  );

  useEffect(() => {
    if (state.activeSession?.mode) {
      setPendingSessionMode(state.activeSession.mode);
    }
  }, [state.activeSession?.id, state.activeSession?.mode]);

  useEffect(() => {
    if (!threadVariant) return;
    textareaRef.current?.focus();
  }, [threadVariant, state.clawView, state.activeThread?.id]);

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

  useEffect(() => {
    if (!modelPickerOpen) return;
    const selectedIndex = Math.max(
      CONCIERGE_MODELS.findIndex(model => model.id === state.conciergeModel),
      0,
    );
    requestAnimationFrame(() => {
      modelOptionRefs.current[selectedIndex]?.focus();
    });
  }, [modelPickerOpen, state.conciergeModel]);

  const sessionMode = state.activeSession?.mode ?? pendingSessionMode;
  const composerIntent = state.composerIntent;
  const currentModelLabel = useMemo(() => {
    const found = CONCIERGE_MODELS.find(m => m.id === state.conciergeModel);
    return found?.label ?? state.conciergeModel;
  }, [state.conciergeModel]);
  const intentCfg = INTENT_CONFIG[composerIntent];

  const selectedAgents = useMemo(() => {
    if (threadVariant) {
      return composerIntent === 'broadcast' ? councilAgents : activeAgents;
    }
    return state.agents.filter(a => selectedIds.includes(a.id));
  }, [threadVariant, composerIntent, councilAgents, activeAgents, state.agents, selectedIds]);

  const { costEstimate, premiumSelected } = useMemo(() => {
    const models = selectedAgents.map(a => a.model);
    const tiered = buildTieredContext(prompt);
    const estimate = estimateBroadcastCost(models, prompt.length, tiered.contextText.length);
    const premium = models.filter(m => !isFreeModel(m)).length;
    return { costEstimate: estimate, premiumSelected: premium };
  }, [selectedAgents, prompt, buildTieredContext]);

  const exceedsCap = premiumSelected > PREMIUM_SLOT_CAP;
  const isElevated = state.executionMode === 'elevated';
  const capBlocks = exceedsCap && !isElevated;
  const capNeedsAck = exceedsCap && isElevated && !elevatedCapAck;
  const isBusy = state.isConciergeSending || state.isBroadcasting;
  const canSend = prompt.trim() && !isBusy && !capBlocks && !capNeedsAck;

  const totalChars = state.responses.reduce((acc, r) => acc + r.content.length, 0);
  const estimatedTokens = Math.round(totalChars / 4);
  const contextLimit = 128000;
  const fillPct = Math.min((estimatedTokens / contextLimit) * 100, 100);
  const fillColor = fillPct > 80 ? 'var(--risk)' : fillPct > 55 ? 'var(--warn)' : 'var(--ok)';

  const placeholder = state.clawView === 'focus' && focusedAgent
    ? `Chat with ${focusedAgent.display_name || focusedAgent.name}...`
    : composerIntent === 'broadcast'
      ? 'Ask the council...'
      : composerIntent === 'execute'
        ? 'Describe a command to execute...'
        : composerIntent === 'build'
          ? 'Describe what you want to build...'
          : 'Talk to Concierge...';

  const clearPrompt = useCallback(() => {
    setPrompt('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, []);

  const handleSessionModeChange = async (mode: SessionMode) => {
    setPendingSessionMode(mode);

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

  const ensureThreadContext = useCallback(async (): Promise<{ sessionId: string; thread: Thread } | null> => {
    let sessionForThread = state.activeSession;
    if (!sessionForThread && state.workspace) {
      const created = await createSession(state.workspace.id, sessionMode);
      if (!created) return null;
      sessionForThread = created;
    }
    if (!sessionForThread) return null;

    const conciergeThread = await ensureConciergeThread(sessionForThread.id);
    if (!conciergeThread) return null;

    dispatch({ type: 'SET_ACTIVE_THREAD', payload: conciergeThread });
    dispatch({ type: 'SET_CLAW_VIEW', payload: 'concierge' });
    dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: null });
    await loadThreadMessages(conciergeThread.id);

    return { sessionId: sessionForThread.id, thread: conciergeThread };
  }, [state.activeSession, state.workspace, sessionMode, createSession, ensureConciergeThread, dispatch, loadThreadMessages]);

  const handleChatSend = useCallback(async () => {
    const text = prompt.trim();
    if (!text || state.isConciergeSending) return;

    clearPrompt();

    if (state.clawView === 'focus' && focusedAgent && state.activeThread?.type === 'direct') {
      await sendToAgent(state.activeThread.id, focusedAgent.id, text);
      return;
    }

    const context = await ensureThreadContext();
    if (!context) return;
    await sendToConcierge(context.thread.id, text);
  }, [prompt, state.isConciergeSending, state.clawView, state.activeThread, focusedAgent, clearPrompt, sendToAgent, ensureThreadContext, sendToConcierge]);

  const handleCouncilBroadcast = useCallback(async () => {
    const text = prompt.trim();
    if (!text || state.isBroadcasting) return;

    clearPrompt();

    let sessionForBroadcast = state.activeSession;
    if (!sessionForBroadcast && state.workspace) {
      const created = await createSession(state.workspace.id, sessionMode);
      if (!created) return;
      sessionForBroadcast = created;
    }
    if (!sessionForBroadcast) return;

    const conciergeThread = await ensureConciergeThread(sessionForBroadcast.id);
    if (conciergeThread) {
      dispatch({ type: 'SET_ACTIVE_THREAD', payload: conciergeThread });
      dispatch({ type: 'SET_CLAW_VIEW', payload: 'concierge' });
      dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: null });
      await addMessage(conciergeThread.id, 'user', `Broadcasting: ${text}`);
    }

    const broadcastThread = await createThread(sessionForBroadcast.id, 'broadcast', { title: text.slice(0, 60) });
    if (broadcastThread) {
      await addMessage(broadcastThread.id, 'user', text);
    }

    const agentIds = threadVariant
      ? councilAgents.map(a => a.id)
      : (selectedIds.length > 0 ? selectedIds : activeAgents.map(a => a.id));

    dispatch({ type: 'SET_FOLIO_INDEX', payload: 0 });
    await broadcast(text, agentIds, sessionForBroadcast, { skipTriage: true });
  }, [
    prompt, state.isBroadcasting, state.activeSession, state.workspace, sessionMode, clearPrompt, createSession,
    ensureConciergeThread, dispatch, addMessage, createThread, threadVariant, councilAgents, selectedIds, activeAgents, broadcast,
  ]);

  const handleExecute = useCallback(async () => {
    const text = prompt.trim();
    if (!text) return;

    if (state.isConciergeSending) {
      dispatch({ type: 'SHOW_TOAST', payload: 'Please wait — a request is still in progress.' });
      return;
    }

    clearPrompt();

    const context = await ensureThreadContext();
    if (!context) return;

    let executionThreadId = context.thread.id;
    if (state.activeThread?.type === 'execution') {
      executionThreadId = state.activeThread.id;
    } else {
      const executionThread = await createThread(context.sessionId, 'execution', {
        title: `Execute: ${text.slice(0, 50)}`,
      });
      if (executionThread) {
        executionThreadId = executionThread.id;
        dispatch({ type: 'SET_ACTIVE_THREAD', payload: executionThread });
      }
    }

    await executeFromChat(executionThreadId, text);
    await loadThreadMessages(executionThreadId);
  }, [prompt, state.isConciergeSending, state.activeThread, clearPrompt, ensureThreadContext, createThread, dispatch, executeFromChat, loadThreadMessages]);

  const handleBuild = useCallback(async () => {
    const text = prompt.trim();
    if (!text) return;

    if (state.isConciergeSending) {
      dispatch({ type: 'SHOW_TOAST', payload: 'Please wait — a request is still in progress.' });
      return;
    }

    clearPrompt();

    const context = await ensureThreadContext();
    if (!context) return;

    await buildFromChat(context.thread.id, text);
    await loadThreadMessages(context.thread.id);
    dispatch({ type: 'SET_COMPOSER_INTENT', payload: 'chat' });
  }, [prompt, state.isConciergeSending, clearPrompt, ensureThreadContext, buildFromChat, loadThreadMessages, dispatch]);

  const handleSynthesize = useCallback(async () => {
    if (state.isSynthesizing || !latestRound) return;

    await synthesize(latestRound.id);
  }, [state.isSynthesizing, latestRound, synthesize]);

  const handleSubmit = useCallback(async () => {
    if (!canSend) return;

    if (composerIntent === 'chat') {
      await handleChatSend();
    } else if (composerIntent === 'broadcast') {
      await handleCouncilBroadcast();
    } else if (composerIntent === 'execute') {
      await handleExecute();
    } else if (composerIntent === 'build') {
      await handleBuild();
    }
  }, [canSend, composerIntent, handleChatSend, handleCouncilBroadcast, handleExecute, handleBuild]);

  const handleModelSelect = useCallback((modelId: string) => {
    dispatch({ type: 'SET_CONCIERGE_MODEL', payload: modelId });
    setModelPickerOpen(false);
  }, [dispatch]);

  const handleRoutingKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIdx = (index + 1) % routingKeys.length;
      routingBarRef.current[nextIdx]?.focus();
      dispatch({ type: 'SET_COMPOSER_INTENT', payload: routingKeys[nextIdx] });
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIdx = (index - 1 + routingKeys.length) % routingKeys.length;
      routingBarRef.current[prevIdx]?.focus();
      dispatch({ type: 'SET_COMPOSER_INTENT', payload: routingKeys[prevIdx] });
    } else if (e.key === 'Home') {
      e.preventDefault();
      routingBarRef.current[0]?.focus();
      dispatch({ type: 'SET_COMPOSER_INTENT', payload: routingKeys[0] });
    } else if (e.key === 'End') {
      e.preventDefault();
      const last = routingKeys.length - 1;
      routingBarRef.current[last]?.focus();
      dispatch({ type: 'SET_COMPOSER_INTENT', payload: routingKeys[last] });
    }
  }, [dispatch]);

  const handleTextareaKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (threadVariant) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void handleSubmit();
      }
      return;
    }

    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const toggleAgent = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  if (threadVariant) {
    return (
      <div className="relative z-10 border-t border-white/[0.06] px-4 py-3">
        {exceedsCap && (
          <div
            className="max-w-4xl mx-auto flex items-center gap-2 mb-2"
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

        <div className="max-w-4xl mx-auto space-y-2">
          <div className="flex items-center gap-2">
            <div
              role="radiogroup"
              aria-label="Composer intent"
              className="flex-1 flex items-center gap-1 rounded-xl bg-white/[0.03] border border-white/[0.07] p-1"
            >
              {routingKeys.map((intent, index) => {
                const cfg = INTENT_CONFIG[intent];
                const BarIcon = cfg.Icon;
                const isActive = composerIntent === intent;
                return (
                  <button
                    key={intent}
                    ref={(el) => { routingBarRef.current[index] = el; }}
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => dispatch({ type: 'SET_COMPOSER_INTENT', payload: intent })}
                    onKeyDown={(e) => handleRoutingKeyDown(e, index)}
                    title={cfg.consequence}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium
                               transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50
                               ${isActive
                                 ? `${cfg.bg} ${cfg.color} border ${cfg.border}`
                                 : 'text-white/50 hover:text-white/75 hover:bg-white/[0.05]'}`}
                  >
                    <BarIcon size={12} />
                    <span className="hidden sm:inline">{cfg.label}</span>
                  </button>
                );
              })}
            </div>

            <div ref={pickerRef} className="relative flex-shrink-0">
              <button
                ref={modelButtonRef}
                onClick={() => setModelPickerOpen(!modelPickerOpen)}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08]
                           text-[11px] text-white/70 hover:text-white/85 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
                aria-expanded={modelPickerOpen}
                aria-haspopup="listbox"
                aria-label="Select concierge model"
              >
                <Bot size={11} />
                <span className="hidden sm:inline">{currentModelLabel}</span>
                <ChevronDown size={11} className={`transition-transform ${modelPickerOpen ? 'rotate-180' : ''}`} />
              </button>

              {modelPickerOpen && (
                <div
                  className="absolute right-0 bottom-full mb-2 w-56 rounded-lg bg-void-2 border border-white/10 shadow-xl overflow-hidden z-[60]"
                  role="listbox"
                  aria-label="Concierge model"
                >
                  {CONCIERGE_MODELS.map((m, index) => (
                    <button
                      key={m.id}
                      ref={(element) => { modelOptionRefs.current[index] = element; }}
                      onClick={() => handleModelSelect(m.id)}
                      role="option"
                      aria-selected={m.id === state.conciergeModel}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/50
                        ${m.id === state.conciergeModel
                          ? 'bg-gold/10 text-gold'
                          : 'text-white/60 hover:bg-white/5 hover:text-white/80'}`}
                    >
                      <div className="font-medium">{m.label}</div>
                      <div className="text-xs opacity-50 mt-0.5">{m.provider}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="text-[10px] text-white/70 px-1">
            {intentCfg.consequence}
            {composerIntent === 'broadcast' && (
              <span className="text-white/45 ml-2">
                {councilAgents.length} active agent{councilAgents.length === 1 ? '' : 's'}
              </span>
            )}
          </div>

          <div className="flex items-end gap-2">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder={placeholder}
              rows={1}
              className={`flex-1 resize-none rounded-xl border px-4 py-3 text-sm text-white/90 placeholder:text-white/60
                         focus:outline-none focus:ring-2 transition-all min-h-[44px] max-h-[200px]
                         ${intentCfg.border} bg-white/[0.04] focus:ring-gold/40`}
              style={{ height: 'auto', overflow: 'hidden' }}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = 'auto';
                el.style.height = Math.min(el.scrollHeight, 200) + 'px';
              }}
            />

            <button
              onClick={() => { void handleSubmit(); }}
              disabled={!canSend}
              className={`flex items-center justify-center w-10 h-10 rounded-xl ${intentCfg.bg} ${intentCfg.buttonText}
                         disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0 hover:brightness-110
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50`}
              aria-label={`${intentCfg.label} (Enter)`}
              title={`${intentCfg.label} (Enter)`}
            >
              <intentCfg.Icon size={15} />
            </button>

            {latestRound && latestResponses.length > 0 && (
              <button
                onClick={() => { void handleSynthesize(); }}
                disabled={state.isSynthesizing}
                className="flex items-center gap-1.5 px-3 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08]
                           hover:bg-white/[0.08] text-white/70 hover:text-white/85
                           disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0 text-xs
                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
                aria-label="Synthesize responses"
                title="Synthesize responses"
              >
                <RefreshCw size={13} className={state.isSynthesizing ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">Synth</span>
              </button>
            )}
          </div>

          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] text-white/45">
              Enter to send, Shift+Enter for newline
            </span>
            <button
              onClick={() => dispatch({ type: 'OPEN_DRAWER', payload: 'orchestra' })}
              className="text-[10px] text-gold/75 hover:text-gold transition-colors uppercase tracking-[0.18em]"
            >
              Configure roster
            </button>
          </div>
        </div>
      </div>
    );
  }

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
          gridTemplateColumns: '1fr auto',
          padding: '10px 12px',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '28px',
          background: 'linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.035))',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          boxShadow: '0 16px 60px rgba(0,0,0,0.34)',
        }}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <div
              role="radiogroup"
              aria-label="Composer intent"
              className="flex-1 flex items-center gap-1 rounded-xl bg-white/[0.03] border border-white/[0.07] p-1"
            >
              {routingKeys.map((intent, index) => {
                const cfg = INTENT_CONFIG[intent];
                const BarIcon = cfg.Icon;
                const isActive = composerIntent === intent;
                return (
                  <button
                    key={intent}
                    ref={(el) => { routingBarRef.current[index] = el; }}
                    role="radio"
                    aria-checked={isActive}
                    onClick={() => dispatch({ type: 'SET_COMPOSER_INTENT', payload: intent })}
                    onKeyDown={(e) => handleRoutingKeyDown(e, index)}
                    title={cfg.consequence}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium
                               transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50
                               ${isActive
                                 ? `${cfg.bg} ${cfg.color} border ${cfg.border}`
                                 : 'text-white/50 hover:text-white/75 hover:bg-white/[0.05]'}`}
                  >
                    <BarIcon size={12} />
                    <span>{cfg.label}</span>
                  </button>
                );
              })}
            </div>

            <div ref={pickerRef} className="relative">
              <button
                ref={modelButtonRef}
                onClick={() => setModelPickerOpen(!modelPickerOpen)}
                className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] hover:bg-white/[0.08]
                           text-[11px] text-white/70 hover:text-white/85 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
                aria-expanded={modelPickerOpen}
                aria-haspopup="listbox"
                aria-label="Select concierge model"
              >
                <Bot size={11} />
                <span className="hidden lg:inline">{currentModelLabel}</span>
                <ChevronDown size={11} className={`transition-transform ${modelPickerOpen ? 'rotate-180' : ''}`} />
              </button>

              {modelPickerOpen && (
                <div
                  className="absolute right-0 bottom-full mb-2 w-56 rounded-lg bg-void-2 border border-white/10 shadow-xl overflow-hidden z-[60]"
                  role="listbox"
                  aria-label="Concierge model"
                >
                  {CONCIERGE_MODELS.map((m, index) => (
                    <button
                      key={m.id}
                      ref={(element) => { modelOptionRefs.current[index] = element; }}
                      onClick={() => handleModelSelect(m.id)}
                      role="option"
                      aria-selected={m.id === state.conciergeModel}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/50
                        ${m.id === state.conciergeModel
                          ? 'bg-gold/10 text-gold'
                          : 'text-white/60 hover:bg-white/5 hover:text-white/80'}`}
                    >
                      <div className="font-medium">{m.label}</div>
                      <div className="text-xs opacity-50 mt-0.5">{m.provider}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="text-[10px] text-white/70 px-1">
            {intentCfg.consequence}
          </div>

          <div className="flex items-start gap-3">
            <div className="flex-1 flex flex-col">
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                }}
                onKeyDown={handleTextareaKeyDown}
                disabled={state.isBroadcasting}
                rows={1}
                placeholder={placeholder}
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
                      title="Estimated input cost (local calculation, not billed)"
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

              <button
                className="reveal-pill"
                onClick={() => dispatch({ type: 'OPEN_DRAWER', payload: 'orchestra' })}
                style={{ height: '42px', fontSize: '13px' }}
              >
                <Music size={14} />
                Roster
              </button>

              <button
                className="reveal-pill"
                onClick={() => { void ensureThreadContext(); }}
                style={{
                  height: '42px',
                  fontSize: '13px',
                  background: state.activeThread ? 'rgba(201,168,76,0.14)' : undefined,
                  color: state.activeThread ? 'var(--gold)' : undefined,
                }}
              >
                <Terminal size={14} />
                Thread
              </button>

              <button
                onClick={() => { void handleSubmit(); }}
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
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-center mt-1.5">
        <span className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.08em', opacity: 0.6 }}>
          {navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'} + Enter to send
        </span>
      </div>
    </footer>
  );
}
