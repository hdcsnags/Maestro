import React, { useState, useRef, useMemo, useEffect, useCallback, KeyboardEvent } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { useOrchestration } from '../../hooks/useOrchestration';
import { useThreads } from '../../hooks/useThreads';
import { useWorkspace } from '../../hooks/useWorkspace';
import { useIterationLoop } from '../../hooks/useIterationLoop';
import { supabase } from '../../lib/supabase';
import {
  AlertTriangle, ChevronDown, Hammer, MessageSquare, Radio,
  RefreshCw, Zap,
} from 'lucide-react';
import { CONCIERGE_MODELS, ComposerIntent, SessionMode, Thread } from '../../types';
import { estimateBroadcastCost, formatCostRange, isFreeModel, PREMIUM_SLOT_CAP } from '../../lib/cost';

type ComposerVariant = 'workspace' | 'thread';

interface Props {
  variant?: ComposerVariant; // Kept for legacy signature, but we only render one unified design now.
}

interface IntentConfig {
  label: string;
  consequence: string;
  Icon: typeof MessageSquare;
  color: string;
  bg: string;
}

const INTENT_CONFIG: Record<ComposerIntent, IntentConfig> = {
  chat: {
    label: 'Direct',
    consequence: 'Concierge replies in this thread',
    Icon: MessageSquare,
    color: 'var(--ember)',
    bg: 'var(--ember-soft)',
  },
  broadcast: {
    label: 'Council',
    consequence: 'Broadcasts to active council agents',
    Icon: Radio,
    color: 'var(--gemini)',
    bg: 'rgba(110, 143, 196, 0.15)', // gemini soft
  },
  execute: {
    label: 'Execute',
    consequence: 'Runs through the local executor',
    Icon: Zap,
    color: 'var(--warn)',
    bg: 'rgba(201, 160, 96, 0.15)', // warn soft
  },
  build: {
    label: 'Build',
    consequence: 'Routes into the build flow',
    Icon: Hammer,
    color: 'var(--ok)',
    bg: 'rgba(110, 168, 138, 0.15)', // ok soft
  },
  iterate: {
    label: 'Iterate',
    consequence: 'Starts an AI-driven iteration loop',
    Icon: Zap,
    color: 'var(--gold)',
    bg: 'rgba(214, 178, 74, 0.12)',
  },
};

const routingKeys = Object.keys(INTENT_CONFIG) as ComposerIntent[];

export default function RevealComposer(_props: Props) {
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
  const { createLoop, getStepsForLoop } = useIterationLoop();
  const [prompt, setPrompt] = useState('');
  const [elevatedCapAck, setElevatedCapAck] = useState(false);
  const [pendingSessionMode, setPendingSessionMode] = useState<SessionMode>('ask');
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [scopeFilling, setScopeFilling] = useState(false);
  // Iterate form state
  const [iterateGoal, setIterateGoal] = useState('');
  const [iterateScopePaths, setIterateScopePaths] = useState('');
  const [iterateVerifyCmd, setIterateVerifyCmd] = useState('');
  const [iterateAutoApply, setIterateAutoApply] = useState(false);
  const [iterateMaxSteps, setIterateMaxSteps] = useState(10);
  const [iterateSubmitting, setIterateSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const modelOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const routingBarRef = useRef<Array<HTMLButtonElement | null>>([]);

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
    () => ((state.rounds?.length ?? 0) > 0 ? state.rounds[state.rounds.length - 1] : null),
    [state.rounds],
  );
  const latestResponses = useMemo(
    () => (latestRound ? (state.responses || []).filter(r => r.round_id === latestRound.id) : []),
    [latestRound, state.responses],
  );

  useEffect(() => {
    if (state.activeSession?.mode) {
      setPendingSessionMode(state.activeSession.mode);
    }
  }, [state.activeSession?.id, state.activeSession?.mode]);

  // Sync external composer draft (set by quick-start chips in EmptyStage)
  useEffect(() => {
    if (state.composerDraft) {
      setPrompt(state.composerDraft);
      dispatch({ type: 'SET_COMPOSER_DRAFT', payload: '' });
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
  }, [state.composerDraft, dispatch]);

  useEffect(() => {
    // Focus text area if we just opened the shell or thread changes
    textareaRef.current?.focus();
  }, [state.clawView, state.activeThread?.id]);

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

  const { costEstimate, premiumSelected } = useMemo(() => {
    const models = councilAgents.map(a => a.model);
    const tiered = buildTieredContext(prompt);
    const estimate = estimateBroadcastCost(models, prompt.length, tiered.contextText.length);
    const premium = models.filter(m => !isFreeModel(m)).length;
    return { costEstimate: estimate, premiumSelected: premium };
  }, [councilAgents, prompt, buildTieredContext]);
  const costLabel = useMemo(() => formatCostRange(costEstimate), [costEstimate]);

  const exceedsCap = composerIntent === 'broadcast' && premiumSelected > PREMIUM_SLOT_CAP;
  const isElevated = state.executionMode === 'elevated';
  const capBlocks = exceedsCap && !isElevated;
  const capNeedsAck = exceedsCap && isElevated && !elevatedCapAck;
  const isBusy = state.isConciergeSending || state.isBroadcasting;
  const canSend = prompt.trim() && !isBusy && !capBlocks && !capNeedsAck;

  const totalChars = (state.responses || []).reduce((acc, r) => acc + r.content.length, 0);
  const estimatedTokens = Math.round(totalChars / 4);
  const contextLimit = 128000;
  const fillPct = Math.min((estimatedTokens / contextLimit) * 100, 100);
  const fillColor = fillPct > 80 ? 'var(--risk)' : fillPct > 55 ? 'var(--warn)' : 'var(--ok)';

  const placeholder = state.clawView === 'focus' && focusedAgent
    ? `Chat with ${focusedAgent.display_name || focusedAgent.name}…`
    : composerIntent === 'broadcast'
      ? 'Ask the council…'
      : composerIntent === 'execute'
        ? 'Describe a command to execute…'
        : composerIntent === 'build'
          ? 'Describe what you want to build…'
          : 'Talk to Concierge…';

  const clearPrompt = useCallback(() => {
    setPrompt('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, []);

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

    const agentIds = councilAgents.map(a => a.id);

    dispatch({ type: 'SET_FOLIO_INDEX', payload: 0 });
    await broadcast(text, agentIds, sessionForBroadcast, { skipTriage: true });
  }, [
    prompt, state.isBroadcasting, state.activeSession, state.workspace, sessionMode, clearPrompt, createSession,
    ensureConciergeThread, dispatch, addMessage, createThread, councilAgents, broadcast,
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

  const handleIterateSubmit = useCallback(async () => {
    const goal = iterateGoal.trim();
    const scopePaths = iterateScopePaths.split('\n').map(p => p.trim()).filter(Boolean);
    if (!goal || scopePaths.length === 0 || !state.activeSession) return;
    setIterateSubmitting(true);
    try {
      const onlineExecutor = state.executors?.find(e => e.status === 'online');
      const loopId = await createLoop({
        sessionId: state.activeSession.id,
        threadId: state.activeThread?.id,
        goal,
        scopePaths,
        verificationCommand: iterateVerifyCmd.trim() || undefined,
        autoApply: iterateAutoApply,
        maxSteps: iterateMaxSteps,
        executorId: onlineExecutor?.id,
      });
      dispatch({ type: 'SHOW_TOAST', payload: `Iteration loop ${loopId.slice(0, 8)} created` });
      setIterateGoal('');
      setIterateScopePaths('');
      setIterateVerifyCmd('');
      setIterateAutoApply(false);
      setIterateMaxSteps(10);
      // Stay in iterate mode so the user can see the active loop progress below
    } catch (e) {
      dispatch({ type: 'SHOW_TOAST', payload: e instanceof Error ? e.message : 'Failed to create iteration loop' });
    } finally {
      setIterateSubmitting(false);
    }
  }, [iterateGoal, iterateScopePaths, iterateVerifyCmd, iterateAutoApply, iterateMaxSteps, state.activeSession, state.activeThread?.id, state.executors, createLoop, dispatch]);

  const fillScopeFromLanes = useCallback(async () => {
    if (!state.activeSession) return;
    setScopeFilling(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: lanes } = await (supabase as any)
        .from('build_lanes')
        .select('lane_paths, role')
        .eq('session_id', state.activeSession.id)
        .in('role', ['builder', 'reviewer']);
      if (lanes && lanes.length > 0) {
        const paths = (lanes as { lane_paths: string[] }[])
          .flatMap(l => l.lane_paths)
          .filter((p, i, arr) => arr.indexOf(p) === i); // dedupe
        setIterateScopePaths(paths.join('\n'));
        return;
      }
      // Fallback: parse ARCHITECT.md lane table
      const md = state.activeSession.architect_md;
      if (!md) return;
      const paths: string[] = [];
      for (const line of md.split('\n')) {
        const cells = line.split('|').map(c => c.trim()).filter(Boolean);
        if (cells.length < 2) continue;
        // Look for cells that contain path-like tokens (contain / or *)
        for (const cell of cells.slice(1)) {
          const parts = cell.split(',').map(p => p.trim()).filter(p => p.includes('/') || p.includes('*'));
          paths.push(...parts);
        }
      }
      const dedupedPaths = [...new Set(paths)];
      if (dedupedPaths.length > 0) setIterateScopePaths(dedupedPaths.join('\n'));
    } catch { /* best-effort */ } finally {
      setScopeFilling(false);
    }
  }, [state.activeSession]);

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
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div style={{
      position: 'absolute', bottom: 32, left: '50%', transform: 'translateX(-50%)',
      width: 'min(760px, calc(100% - 44px))', zIndex: 30,
    }}>
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

      <div style={{
        background: 'rgba(8,9,11,0.85)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid var(--edge-1)', borderRadius: 24,
        boxShadow: '0 24px 80px rgba(0,0,0,0.5)',
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Intent Tabs */}
        <div style={{
          display: 'flex', borderBottom: '1px solid var(--edge-0)',
          background: 'rgba(255,255,255,0.015)',
        }}>
          {routingKeys.map((intent, index) => {
            const cfg = INTENT_CONFIG[intent];
            const BarIcon = cfg.Icon;
            const isActive = composerIntent === intent;
            return (
              <button key={intent}
                ref={(el) => { routingBarRef.current[index] = el; }}
                onClick={() => dispatch({ type: 'SET_COMPOSER_INTENT', payload: intent })}
                onKeyDown={(e) => handleRoutingKeyDown(e, index)}
                style={{
                  flex: 1, padding: '12px 0',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  fontFamily: 'var(--mono)', fontSize: '10px', letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: isActive ? cfg.color : 'var(--ink-3)',
                  background: isActive ? cfg.bg : 'transparent',
                  border: 'none', borderBottom: isActive ? `1px solid ${cfg.color}` : '1px solid transparent',
                  cursor: 'pointer', transition: 'all 0.2s ease', outline: 'none'
                }}>
                <BarIcon size={12} />
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Input Area */}
        <div style={{ padding: '16px 20px 14px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)',
            letterSpacing: '0.1em',
          }}>
            <span style={{ color: intentCfg.color, textTransform: 'uppercase', letterSpacing: '0.18em' }}>
              {intentCfg.label}
            </span>
            <span style={{ opacity: 0.5 }}>—</span>
            <span>{intentCfg.consequence}</span>
            {composerIntent === 'broadcast' && (
              <>
                <span style={{ opacity: 0.5 }}>·</span>
                <span>{councilAgents.length} active agent{councilAgents.length === 1 ? '' : 's'}</span>
              </>
            )}
          </div>
          
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
            }}
            onKeyDown={handleTextareaKeyDown}
            placeholder={placeholder}
            disabled={state.isBroadcasting}
            rows={1}
            style={{
              width: '100%', resize: 'none',
              background: 'transparent', border: 'none', outline: 'none',
              fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 300,
              color: 'var(--ink-0)', lineHeight: 1.5,
              padding: '2px 0', minHeight: '24px', maxHeight: '200px',
              display: composerIntent === 'iterate' ? 'none' : undefined,
            }}
          />

          {/* Iterate form — shown when intent is 'iterate' */}
          {composerIntent === 'iterate' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <textarea
                value={iterateGoal}
                onChange={e => setIterateGoal(e.target.value)}
                placeholder="Goal: what should the agent achieve? (e.g. 'Fix all TypeScript errors in src/auth.ts')"
                rows={3}
                style={{
                  width: '100%', resize: 'none',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--edge-1)',
                  borderRadius: 8, outline: 'none', padding: '8px 10px',
                  fontFamily: 'var(--serif)', fontSize: 14, fontWeight: 300,
                  color: 'var(--ink-0)', lineHeight: 1.5,
                }}
              />
              <textarea
                value={iterateScopePaths}
                onChange={e => setIterateScopePaths(e.target.value)}
                placeholder={'Scope paths (one per line):\nsrc/auth.ts\nsrc/auth.test.ts'}
                rows={2}
                style={{
                  width: '100%', resize: 'none',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--edge-1)',
                  borderRadius: 8, outline: 'none', padding: '8px 10px',
                  fontFamily: 'var(--mono)', fontSize: 12,
                  color: 'var(--ink-1)', lineHeight: 1.5,
                }}
              />
              {(state.activeSession?.architect_md || true) && (
                <button
                  onClick={() => { void fillScopeFromLanes(); }}
                  disabled={scopeFilling || !state.activeSession}
                  style={{
                    alignSelf: 'flex-start', padding: '3px 10px', borderRadius: 6,
                    background: 'var(--surf-1)', border: '1px solid var(--edge-1)',
                    fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-2)',
                    letterSpacing: '0.08em', textTransform: 'uppercase', cursor: 'pointer', outline: 'none',
                  }}
                >
                  {scopeFilling ? 'Filling…' : 'Fill from ARCHITECT.md lanes'}
                </button>
              )}
              <input
                type="text"
                value={iterateVerifyCmd}
                onChange={e => setIterateVerifyCmd(e.target.value)}
                placeholder="Verification command (optional): npm test src/auth.test.ts"
                style={{
                  width: '100%',
                  background: 'rgba(255,255,255,0.04)', border: '1px solid var(--edge-1)',
                  borderRadius: 8, outline: 'none', padding: '7px 10px',
                  fontFamily: 'var(--mono)', fontSize: 12,
                  color: 'var(--ink-1)',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-2)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  <input
                    type="checkbox"
                    checked={iterateAutoApply}
                    onChange={e => setIterateAutoApply(e.target.checked)}
                    style={{ accentColor: 'var(--gold)', width: 13, height: 13 }}
                  />
                  Auto-apply
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-2)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Max steps
                  <input
                    type="number"
                    value={iterateMaxSteps}
                    min={1}
                    max={20}
                    onChange={e => setIterateMaxSteps(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 10)))}
                    style={{
                      width: 48,
                      background: 'rgba(255,255,255,0.06)', border: '1px solid var(--edge-1)',
                      borderRadius: 4, outline: 'none', padding: '2px 6px',
                      fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-1)',
                      textAlign: 'center',
                    }}
                  />
                </label>
                <div style={{ flex: 1 }} />
                <button
                  onClick={() => { void handleIterateSubmit(); }}
                  disabled={!iterateGoal.trim() || !iterateScopePaths.trim() || iterateSubmitting || !state.activeSession}
                  style={{
                    padding: '6px 18px', borderRadius: 999,
                    background: iterateGoal.trim() && iterateScopePaths.trim() && !iterateSubmitting ? 'var(--gold)' : 'var(--surf-2)',
                    color: iterateGoal.trim() && iterateScopePaths.trim() && !iterateSubmitting ? 'var(--void-0)' : 'var(--ink-3)',
                    fontSize: 12, fontWeight: 500,
                    cursor: iterateGoal.trim() && iterateScopePaths.trim() && !iterateSubmitting ? 'pointer' : 'default',
                    border: 'none', outline: 'none', fontFamily: 'var(--sans)',
                  }}
                >
                  {iterateSubmitting ? 'Creating…' : 'Start Loop'}
                </button>
              </div>
            </div>
          )}

          {/* Active loop progress banner */}
          {composerIntent === 'iterate' && state.iterationLoops.length > 0 && (() => {
            const activeLoops = state.iterationLoops
              .filter(l => l.session_id === state.activeSession?.id)
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
            if (activeLoops.length === 0) return null;
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
                {activeLoops.slice(0, 3).map(loop => {
                  const steps = getStepsForLoop(loop.id);
                  const latestStep = steps[steps.length - 1];
                  const isTerminal = ['succeeded', 'failed', 'aborted', 'unrecoverable'].includes(loop.status);
                  const statusColor = loop.status === 'succeeded' ? 'var(--ok)' : isTerminal ? 'var(--risk)' : 'var(--gold)';
                  return (
                    <div key={loop.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px',
                      borderRadius: 6, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--edge-0)',
                      fontFamily: 'var(--mono)', fontSize: 11,
                    }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, flexShrink: 0 }} />
                      <span style={{ color: 'var(--ink-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {loop.goal.slice(0, 48)}{loop.goal.length > 48 ? '…' : ''}
                      </span>
                      <span style={{ color: statusColor, flexShrink: 0 }}>
                        {isTerminal ? loop.status : (
                          latestStep
                            ? `step ${loop.step_count}/${loop.max_steps} · ${latestStep.state.replace('_', ' ')}`
                            : `step ${loop.step_count}/${loop.max_steps}`
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginTop: 6,
            paddingTop: 8, borderTop: '1px solid var(--edge-0)',
          }}>
            {/* Model Picker */}
            <div ref={pickerRef} style={{ position: 'relative' }}>
              <button
                ref={modelButtonRef}
                onClick={() => setModelPickerOpen(!modelPickerOpen)}
                style={{
                  padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                  border: '1px solid var(--edge-1)', background: 'var(--surf-0)',
                  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-2)',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  display: 'flex', alignItems: 'center', gap: 4, outline: 'none'
                }}>
                {currentModelLabel} <ChevronDown size={10} className={`transition-transform ${modelPickerOpen ? 'rotate-180' : ''}`} />
              </button>

              {modelPickerOpen && (
                <div
                  style={{
                    position: 'absolute', bottom: '100%', left: 0, marginBottom: '8px',
                    width: '224px', borderRadius: '12px', background: 'var(--void-2)',
                    border: '1px solid var(--edge-1)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
                    overflow: 'hidden', zIndex: 60, display: 'flex', flexDirection: 'column'
                  }}
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
                      style={{
                        width: '100%', textAlign: 'left', padding: '10px 16px',
                        background: m.id === state.conciergeModel ? 'var(--ember-soft)' : 'transparent',
                        color: m.id === state.conciergeModel ? 'var(--ember)' : 'var(--ink-1)',
                        border: 'none', outline: 'none', cursor: 'pointer',
                        transition: 'background 0.2s ease',
                      }}
                    >
                      <div style={{ fontWeight: 500, fontSize: '13px' }}>{m.label}</div>
                      <div style={{ fontSize: '11px', opacity: 0.5, marginTop: '2px' }}>{m.provider}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button 
              onClick={() => dispatch({ type: 'OPEN_DRAWER', payload: 'orchestra' })}
              style={{
                padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                border: '1px solid var(--edge-1)', background: 'var(--surf-0)',
                fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-2)',
                letterSpacing: '0.08em', textTransform: 'uppercase', outline: 'none'
              }}>
              Roster · {activeAgents.length}
            </button>

            {latestRound && latestResponses.length > 0 && (
              <button
                onClick={() => { void handleSynthesize(); }}
                disabled={state.isSynthesizing}
                style={{
                  padding: '4px 10px', borderRadius: 6, cursor: state.isSynthesizing ? 'default' : 'pointer',
                  border: '1px solid var(--edge-1)', background: 'var(--surf-0)',
                  fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-2)',
                  letterSpacing: '0.08em', textTransform: 'uppercase',
                  opacity: state.isSynthesizing ? 0.5 : 1, outline: 'none',
                  display: 'flex', alignItems: 'center', gap: 4
                }}>
                <RefreshCw size={10} className={state.isSynthesizing ? 'animate-spin' : ''} />
                Synth
              </button>
            )}

            <div
              title={`${Math.round(fillPct)}% of the current synthesis context estimate`}
              style={{
                minWidth: 112,
                display: 'flex',
                flexDirection: 'column',
                gap: 3,
                color: 'var(--ink-3)',
                fontFamily: 'var(--mono)',
                fontSize: 9,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
              }}
            >
              <span>{composerIntent === 'broadcast' ? `Est. ${costLabel}` : 'Context'}</span>
              <span style={{ height: 3, borderRadius: 999, background: 'var(--surf-2)', overflow: 'hidden' }}>
                <span
                  style={{
                    display: 'block',
                    width: `${fillPct}%`,
                    height: '100%',
                    borderRadius: 999,
                    background: fillColor,
                  }}
                />
              </span>
            </div>

            <div style={{ flex: 1 }} />
            
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.1em' }}>
              {navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl'} ↵
            </span>
            
            <button 
              onClick={() => { void handleSubmit(); }}
              disabled={!canSend}
              style={{
                padding: '6px 18px', borderRadius: 999,
                background: canSend ? intentCfg.color : 'var(--surf-2)', 
                color: canSend ? 'var(--void-0)' : 'var(--ink-3)',
                fontSize: 12, fontWeight: 500, cursor: canSend ? 'pointer' : 'default',
                boxShadow: canSend ? `0 0 18px ${intentCfg.bg}` : 'none',
                border: 'none', outline: 'none', transition: 'all 0.2s ease',
                fontFamily: 'var(--sans)'
              }}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
