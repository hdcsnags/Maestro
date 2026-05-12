import { useCallback, useRef } from 'react';
import { EdgeFunctionError, invokeEdgeFunction } from '../lib/functions';
import { supabase } from '../lib/supabase';
import { useMaestro } from '../context/MaestroContext';
import { useAuth } from '../context/AuthContext';
import {
  Agent,
  Response,
  AuditEvent,
  Round,
  Synthesis,
  ResponseArtifact,
  FileManifestEntry,
  ConciergeDecision,
  ConciergePhase,
  Session,
  Thread,
  ThreadMessage,
  TriageResult,
} from '../types';

type BroadcastMode = 'analysis' | 'build';
type AgentCallMode = BroadcastMode | 'build_task';

interface BroadcastOptions {
  modeOverride?: BroadcastMode;
  skipSynthesis?: boolean;
  skipTriage?: boolean;
  promptOverridesByAgentId?: Record<string, string>;
}

interface AgentInvokeResult {
  title?: string;
  content?: string;
  text?: string;
  signals?: Record<string, string | undefined>;
  artifacts?: ResponseArtifact[];
  file_manifest?: FileManifestEntry[];
  artifact_protocol?: string;
  complete?: boolean;
  continuation_prompt?: string;
  manifest_errors?: Array<{ path?: string; reason?: string }>;
  usage?: { total_tokens?: number };
}

interface TriageInvokeResult {
  route?: unknown;
  intent?: unknown;
  confidence?: unknown;
  reasoning?: unknown;
  direct_answer?: unknown;
}

interface ConciergeInvokeResult {
  error?: string;
  message?: string;
  alignment_summary?: string;
  tension_points?: string[];
  recommended_direction?: string;
  model_used?: string | null;
  intent?: ConciergeDecision['intent'];
  design_mode?: ConciergeDecision['design_mode'];
  recommended_next_phase?: ConciergeDecision['recommended_next_phase'];
  intent_reasoning?: string;
  applied_phase?: ConciergeDecision['applied_phase'];
}

interface SynthesizeInvokeResult {
  content?: string;
  synthesis?: string;
  // Deliberation-aware synthesis fields (PRO-01). Empty for classic syntheses.
  consensus?: string;
  trade_offs?: unknown[];
  acknowledged_weaknesses?: unknown[];
  unresolved_tensions?: string[];
  recommendation?: string;
  model_used?: string;
}

function isEdgeDetails(value: unknown): value is { error?: unknown; message?: unknown } {
  return typeof value === 'object' && value !== null;
}

export function useOrchestration() {
  const { state, dispatch } = useMaestro();
  const { user, session } = useAuth();

  const synthesizeRef = useRef<(roundId: string) => Promise<unknown>>();

  const ensureSession = useCallback(async () => {
    if (session?.access_token) return session;
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) {
      throw new Error('Session expired. Sign in again to call Maestro services.');
    }
    return data.session;
  }, [session]);

  const ensureConciergeThread = useCallback(async (sessionId: string): Promise<Thread | null> => {
    const existing = state.threads.find(
      thread => thread.session_id === sessionId && thread.type === 'concierge' && thread.status === 'active',
    );
    if (existing) return existing;

    const { data: existingThread } = await supabase
      .from('threads')
      .select('*')
      .eq('session_id', sessionId)
      .eq('type', 'concierge')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingThread) {
      const thread = existingThread as Thread;
      dispatch({ type: 'ADD_THREAD', payload: thread });
      return thread;
    }

    const { data: createdThread, error } = await supabase
      .from('threads')
      .insert({
        session_id: sessionId,
        type: 'concierge',
        status: 'active',
        include_in_synthesis: true,
        title: 'Concierge',
        metadata: {},
      } as never)
      .select()
      .maybeSingle();

    if (error || !createdThread) {
      console.error('Failed to ensure concierge thread:', error);
      return null;
    }

    const thread = createdThread as Thread;
    dispatch({ type: 'ADD_THREAD', payload: thread });
    return thread;
  }, [state.threads, dispatch]);

  const appendConciergeEventMessage = useCallback(async (
    sessionId: string,
    content: string,
    metadata: ThreadMessage['metadata'],
  ) => {
    const conciergeThread = await ensureConciergeThread(sessionId);
    if (!conciergeThread) return null;

    const { data, error } = await supabase
      .from('thread_messages')
      .insert({
        thread_id: conciergeThread.id,
        role: 'concierge',
        agent_id: null,
        content,
        context_weight: 'primary',
        metadata,
      } as never)
      .select()
      .maybeSingle();

    if (error || !data) {
      console.error('Failed to persist concierge event card:', error);
      return null;
    }

    const message = data as ThreadMessage;
    dispatch({ type: 'ADD_THREAD_MESSAGE', payload: message });
    dispatch({ type: 'SET_ACTIVE_THREAD', payload: conciergeThread });
    dispatch({ type: 'SET_CLAW_VIEW', payload: 'concierge' });
    dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: null });
    return message;
  }, [ensureConciergeThread, dispatch]);

  const logAudit = useCallback(async (
    eventType: string,
    actor: string,
    options: { sessionId?: string; provider?: string; model?: string; mode?: string } = {},
  ) => {
    if (!user) return;
    const row = await invokeEdgeFunction<AuditEvent>('audit-log', {
      session_id: options.sessionId ?? state.activeSession?.id ?? null,
      event_type: eventType,
      actor,
      provider: options.provider ?? '',
      model: options.model ?? '',
      execution_mode: options.mode ?? state.executionMode,
      requires_approval: state.executionMode !== 'analyze',
      succeeded: true,
    });

    if (row) {
      dispatch({ type: 'ADD_AUDIT_EVENT', payload: row });
    }
  }, [user, state.activeSession, state.executionMode, dispatch]);

  const buildTieredContext = useCallback((prompt: string, mode?: BroadcastMode) => {
    const sessionId = state.activeSession?.id;
    if (!sessionId) return { contextText: '', indicator: [] as string[], contextFiles: [] as { path: string }[] };
    const resolvedMode = mode ?? (state.activeSession?.mode === 'build' ? 'build' : 'analysis');
    if (resolvedMode === 'build') return { contextText: '', indicator: [] as string[], contextFiles: [] as { path: string }[] };

    const sessionRounds = state.rounds
      .filter(r => r.session_id === sessionId)
      .sort((a, b) => a.round_number - b.round_number);
    const roundIds = new Set(sessionRounds.map(r => r.id));

    const parts: string[] = [];
    const indicator: string[] = [];

    const sessionSyntheses = state.syntheses.filter(s => roundIds.has(s.round_id));
    if (sessionSyntheses.length > 0) {
      const latest = sessionSyntheses[sessionSyntheses.length - 1];
      const roundForSynth = sessionRounds.find(r => r.id === latest.round_id);
      parts.push(`[Latest Synthesis — Round ${roundForSynth?.round_number ?? '?'}]:\n${latest.content}`);
      indicator.push(`Synthesis R${roundForSynth?.round_number ?? '?'}`);
    }

    if (sessionRounds.length < 10 && sessionRounds.length > 0) {
      const recent = sessionRounds.slice(-2);
      for (const rnd of recent) {
        const rndResponses = state.responses.filter(r => r.round_id === rnd.id);
        if (rndResponses.length === 0) continue;
        const summary = rndResponses
          .map(r => `${r.agent_name}: ${r.title || r.content.slice(0, 140)}`)
          .join('\n');
        parts.push(`[Round ${rnd.round_number} — "${rnd.prompt.slice(0, 80)}"]:\n${summary}`);
        indicator.push(`Round ${rnd.round_number}`);
      }
    }

    const pinned = state.responses.filter(r => r.is_pinned && roundIds.has(r.round_id));
    if (pinned.length > 0) {
      const pinnedText = pinned
        .map(r => `[Pinned — ${r.agent_name}]:\n${r.title ? `${r.title}\n` : ''}${r.content}`)
        .join('\n\n');
      parts.push(pinnedText);
      indicator.push(`${pinned.length} pinned`);
    }

    const contextFiles: { path: string }[] = [];
    const filePattern = /(?:^|\s|[`'\"])((?:[\w.-]+\/)+[\w.-]+\.\w{1,8}|[.\w-]+\.\w{1,8})(?:[`'\"\s.,;!?]|$)/g;
    const seen = new Set<string>();
    const allowedExtensions = new Set(['js', 'jsx', 'ts', 'tsx', 'json', 'md', 'sql', 'sh', 'css', 'scss', 'html', 'ejs', 'yml', 'yaml', 'toml', 'txt', 'env']);
    const isUsefulPath = (value: string) => {
      if (value.length < 3 || value.length > 120) return false;
      if (!/[./]/.test(value) || !/[A-Za-z]/.test(value)) return false;
      if (/^\d+(?:\.\d+)+$/.test(value) || /^\d+\.\d+\.\d+\.\d+$/.test(value)) return false;
      const extMatch = value.match(/\.([A-Za-z0-9]{1,8})$/);
      if (!extMatch) return false;
      return allowedExtensions.has(extMatch[1].toLowerCase());
    };

    let match: RegExpExecArray | null;
    while ((match = filePattern.exec(prompt)) !== null) {
      const path = match[1];
      if (seen.has(path) || !isUsefulPath(path)) continue;
      seen.add(path);
      contextFiles.push({ path });
      if (contextFiles.length >= 12) break;
    }
    if (contextFiles.length > 0) {
      indicator.push(contextFiles.map(f => f.path).slice(0, 2).join(' · '));
    }
    const contextText = parts.length > 0 ? parts.join('\n\n---\n\n') : '';
    return { contextText, indicator, contextFiles };
  }, [state.activeSession, state.rounds, state.syntheses, state.responses]);

  const callAgent = useCallback(async (
    agent: Agent,
    prompt: string,
    roundId: string,
    mode: AgentCallMode = 'analysis',
    tieredContext = '',
    contextFiles: { path: string }[] = [],
  ) => {
    if (!user) return;

    await ensureSession();

    const agentSkills = state.agentSkills
      .filter(s => s.agent_id === agent.id && s.is_active)
      .map(s => ({ name: s.name, instruction: s.instruction }));

    const augmentedPrompt = tieredContext
      ? `Prior session context (for reference only):\n\n${tieredContext}\n\n---\n\nCurrent request:\n${prompt}`
      : prompt;

    const mergedContextFiles = mode === 'build' && agent.scoped_paths && state.activeRepoConnection
      ? (() => {
        const isLiteral = (p: string) => !p.includes('*') && !p.endsWith('/');
        const literals = agent.scoped_paths.filter(isLiteral).slice(0, 5);
        const next = [...contextFiles];
        const seen = new Set(next.map(f => f.path));
        for (const path of literals) {
          if (seen.has(path)) continue;
          next.push({ path });
          seen.add(path);
        }
        return next;
      })()
      : contextFiles;

    try {
      const result = await invokeEdgeFunction<AgentInvokeResult>('orchestrate', {
        prompt: augmentedPrompt,
        provider: agent.provider,
        model: agent.model,
        agentName: agent.name,
        agentRole: agent.role,
        agentSkills: agentSkills.length > 0 ? agentSkills : undefined,
        scopedPaths: agent.scoped_paths && agent.scoped_paths.length > 0 ? agent.scoped_paths : undefined,
        mode,
        repo_connection_id: state.activeRepoConnection?.id,
        session_id: state.activeSession?.id,
        context_files: mergedContextFiles.length > 0 ? mergedContextFiles : undefined,
        verbosityTier: state.verbosityTier,
      });

      const artifacts: ResponseArtifact[] = Array.isArray(result.artifacts) ? result.artifacts : [];
      const fileManifest: FileManifestEntry[] = Array.isArray(result.file_manifest) ? result.file_manifest : [];
      const manifestErrors = Array.isArray(result.manifest_errors) ? result.manifest_errors : [];
      const signals = {
        ...(result.signals ?? {}),
        ...(mode === 'build' ? {
          artifact_protocol: result.artifact_protocol ?? 'maestro.build.legacy',
          build_complete: result.complete === false ? 'false' : 'true',
          manifest_errors: manifestErrors.length > 0
            ? manifestErrors.map(e => `${e.path ?? '<unknown>'}: ${e.reason ?? 'invalid'}`).join('; ')
            : undefined,
          continuation_prompt: result.continuation_prompt || undefined,
        } : {}),
      };

      const { data: rawResponse } = await supabase
        .from('responses')
        .insert({
          round_id: roundId,
          user_id: user.id,
          agent_id: agent.id,
          agent_name: agent.name,
          agent_role: agent.role,
          agent_color: agent.color,
          provider: agent.provider,
          model: agent.model,
          content: result.content ?? result.text ?? '',
          title: result.title ?? '',
          signals,
          artifacts: artifacts as unknown as never,
          file_manifest: fileManifest as unknown as never,
          is_flagged: false,
          is_lead: false,
          tokens_used: result.usage?.total_tokens ?? 0,
        } as never)
        .select()
        .maybeSingle();

      const responseData = rawResponse as Response | null;
      if (responseData) {
        dispatch({
          type: 'ADD_RESPONSE',
          payload: {
            ...responseData,
            signals: responseData.signals as Response['signals'],
            artifacts: (responseData.artifacts ?? []) as ResponseArtifact[],
            file_manifest: ((responseData as Response).file_manifest ?? []) as FileManifestEntry[],
          },
        });
      }

      await logAudit('agent_response', agent.name, {
        provider: agent.provider,
        model: agent.model,
      });
    } catch (err) {
      console.error(`Error calling ${agent.name}:`, err);

      const rawMessage = err instanceof Error ? err.message : 'Provider request failed.';
      const errorMessage = rawMessage.trim().slice(0, 240) || 'Provider request failed.';
      const isAuthIssue = /api key|unauthorized|forbidden|auth|authentication/i.test(errorMessage);
      const title = isAuthIssue ? 'Connection error' : 'Provider error';
      const content = isAuthIssue
        ? `Error: ${agent.name} could not run because ${agent.provider} is not authenticated for this workspace. Add or refresh the ${agent.provider} key in the Provider Vault.`
        : `Error: ${agent.name} could not complete the request. ${errorMessage}`;

      const { data: rawErrResponse } = await supabase
        .from('responses')
        .insert({
          round_id: roundId,
          user_id: user.id,
          agent_id: agent.id,
          agent_name: agent.name,
          agent_role: agent.role,
          agent_color: agent.color,
          provider: agent.provider,
          model: agent.model,
          content,
          title,
          signals: { status: 'error', note: errorMessage },
          artifacts: [] as unknown as never,
          is_flagged: false,
          is_lead: false,
          tokens_used: 0,
        } as never)
        .select()
        .maybeSingle();

      const errData = rawErrResponse as Response | null;
      if (errData) {
        dispatch({
          type: 'ADD_RESPONSE',
          payload: {
            ...errData,
            signals: errData.signals as Response['signals'],
            artifacts: [],
          },
        });
      }
    }
  }, [user, state.agentSkills, state.activeRepoConnection, state.activeSession?.id, dispatch, logAudit, ensureSession]);

  const broadcast = useCallback(async (
    prompt: string,
    selectedAgentIds: string[],
    sessionOverride?: Session | null,
    options: BroadcastOptions = {},
  ) => {
    const activeSession = sessionOverride ?? state.activeSession;
    if (!user || !activeSession || !state.workspace) return;
    const phase = activeSession.current_phase;
    const broadcastMode = options.modeOverride ?? (
      activeSession.mode === 'build'
      || phase === 'pre_build'
      || phase === 'build'
      || phase === 'bouncer'
        ? 'build'
        : 'analysis'
    );
    const skipTriage = options.skipTriage || activeSession.mode === 'build' || broadcastMode === 'build' || phase === 'build' || phase === 'pre_build' || state.rounds.length > 0;

    if (!skipTriage) {
      try {
        dispatch({ type: 'SET_IS_TRIAGING', payload: true });
        await ensureSession();
        const triageRes = await Promise.race([
          invokeEdgeFunction<TriageInvokeResult>('concierge-triage', {
            session_id: activeSession.id,
            prompt,
            agent_count: selectedAgentIds.length,
            session_context: {
              current_phase: phase ?? 'analysis',
              round_count: state.rounds.length,
              has_build_spec: !!activeSession.build_spec,
            },
          }).then((data) => ({ data, error: null })).catch((error) => ({ data: null, error })),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
        ]);

        if (triageRes && !(triageRes as { error?: unknown }).error) {
          const triageData = (triageRes as { data?: TriageInvokeResult }).data;
          if (
            triageData?.route === 'simple_ask'
            && typeof triageData.confidence === 'number'
            && triageData.confidence >= 0.75
          ) {
            const triageResult: TriageResult = {
              route: 'simple_ask',
              intent: typeof triageData.intent === 'string'
                ? triageData.intent as 'simple_ask' | 'analysis' | 'design' | 'pre_build' | 'build'
                : 'simple_ask',
              confidence: triageData.confidence,
              reasoning: typeof triageData.reasoning === 'string' ? triageData.reasoning : '',
              direct_answer: typeof triageData.direct_answer === 'string' ? triageData.direct_answer : undefined,
              prompt,
            };
            dispatch({
              type: 'SET_TRIAGE_RESULT',
              payload: triageResult,
            });
            await appendConciergeEventMessage(
              activeSession.id,
              triageResult.direct_answer || triageResult.reasoning || 'Concierge posted a quick answer.',
              { kind: 'concierge_triage', triage: triageResult, prompt },
            );
            dispatch({ type: 'SET_IS_TRIAGING', payload: false });
            return;
          }
        }
      } catch {
        // Triage failure is non-fatal.
      } finally {
        dispatch({ type: 'SET_IS_TRIAGING', payload: false });
      }
    }

    dispatch({ type: 'SET_IS_BROADCASTING', payload: true });
    dispatch({ type: 'SET_BROADCASTING_AGENTS', payload: selectedAgentIds });

    try {
      const nextRoundNumber = state.rounds.length > 0
        ? Math.max(...state.rounds.map(r => r.round_number)) + 1
        : 1;

      const { data: rawRound, error: roundError } = await supabase
        .from('rounds')
        .insert({
          session_id: activeSession.id,
          user_id: user.id,
          round_number: nextRoundNumber,
          prompt,
          target_agents: selectedAgentIds as unknown as never,
          status: 'broadcasting',
        } as never)
        .select()
        .maybeSingle();

      const roundData = rawRound as Record<string, unknown> | null;
      if (roundError || !roundData) {
        console.error('Failed to create round', roundError);
        dispatch({ type: 'SET_IS_BROADCASTING', payload: false });
        return;
      }

      const round: Round = {
        id: roundData.id as string,
        session_id: roundData.session_id as string,
        round_number: roundData.round_number as number,
        prompt: roundData.prompt as string,
        target_agents: roundData.target_agents as string[],
        status: roundData.status as 'broadcasting',
        created_at: roundData.created_at as string,
      };

      dispatch({ type: 'ADD_ROUND', payload: round });

      await logAudit('broadcast', 'Conductor', {
        sessionId: activeSession.id,
        mode: broadcastMode,
      });

      // Claw agents are executor-only — they cannot participate in cloud broadcast.
      const targetAgents = state.agents.filter(
        a => selectedAgentIds.includes(a.id) && a.provider_group !== 'maestroclaw',
      );
      if (targetAgents.length === 0) {
        console.warn('[Broadcast] No cloud-eligible agents in selection — aborting broadcast');
        dispatch({ type: 'SET_IS_BROADCASTING', payload: false });
        dispatch({ type: 'SET_BROADCASTING_AGENTS', payload: [] });
        return;
      }
      const roundId = roundData.id as string;

      await Promise.all(
        targetAgents.map(agent => {
          const promptForAgent = options.promptOverridesByAgentId?.[agent.id] ?? prompt;
          const tiered = buildTieredContext(promptForAgent, broadcastMode);
          return callAgent(agent, promptForAgent, roundId, broadcastMode, tiered.contextText, tiered.contextFiles);
        }),
      );

      await supabase
        .from('rounds')
        .update({ status: 'complete' } as never)
        .eq('id', roundId);

      dispatch({ type: 'SET_IS_BROADCASTING', payload: false });
      dispatch({ type: 'SET_BROADCASTING_AGENTS', payload: [] });
      if (options.skipSynthesis) return;

      dispatch({ type: 'SET_IS_SYNTHESIZING', payload: true });
      try {
        await synthesizeRef.current?.(roundId);
      } finally {
        dispatch({ type: 'SET_IS_SYNTHESIZING', payload: false });
      }
    } catch (err) {
      console.error('Broadcast error:', err);
      dispatch({ type: 'SET_IS_BROADCASTING', payload: false });
      dispatch({ type: 'SET_BROADCASTING_AGENTS', payload: [] });
    }
  }, [user, state, dispatch, logAudit, buildTieredContext, callAgent, ensureSession]);

  const triggerConcierge = useCallback(async (
    phase: ConciergePhase,
    roundId?: string,
    synthesisContent?: string,
  ) => {
    const activeSessionId = state.activeSession?.id;
    if (!user || !activeSessionId) return;

    const targetRoundId = roundId
      ?? [...state.rounds]
        .filter(r => r.session_id === activeSessionId)
        .sort((a, b) => b.round_number - a.round_number)[0]?.id;
    if (!targetRoundId) return;
    const targetRound = state.rounds.find(round => round.id === targetRoundId) ?? null;

    const responses = state.responses
      .filter(r => r.round_id === targetRoundId)
      .map(r => ({ agent_name: r.agent_name, content: r.content, signals: r.signals }));
    if (responses.length === 0) return;

    let synthesis = synthesisContent ?? null;
    if (!synthesis) {
      const synth = state.syntheses.find(s => s.round_id === targetRoundId);
      synthesis = synth?.content ?? null;
    }

    await ensureSession();

    try {
      const result = await invokeEdgeFunction<ConciergeInvokeResult>('concierge', {
        session_id: activeSessionId,
        phase,
        responses,
        synthesis,
      });

      const decision: ConciergeDecision = {
        session_id: activeSessionId,
        phase,
        alignment_summary: result.alignment_summary ?? '',
        tension_points: Array.isArray(result.tension_points) ? result.tension_points : [],
        recommended_direction: result.recommended_direction ?? '',
        model_used: result.model_used ?? null,
        intent: result.intent,
        design_mode: result.design_mode,
        recommended_next_phase: result.recommended_next_phase,
        intent_reasoning: result.intent_reasoning,
        applied_phase: result.applied_phase,
      };
      dispatch({ type: 'SET_CONCIERGE_DECISION', payload: decision });
      await appendConciergeEventMessage(
        activeSessionId,
        decision.recommended_direction || decision.alignment_summary || 'Concierge posted a new decision.',
        {
          kind: 'concierge_decision',
          decision,
          round_id: targetRoundId,
          round_number: targetRound?.round_number,
          prompt: targetRound?.prompt,
        },
      );
      console.log('[Concierge] decision received', { phase, model: decision.model_used });
      await logAudit('concierge', 'Concierge', { mode: phase });
    } catch (err) {
      const details = err instanceof EdgeFunctionError ? err.details : null;
      if (isEdgeDetails(details)) {
        console.error('Concierge error:', details);
        const errDecision: ConciergeDecision = {
          session_id: activeSessionId,
          phase,
          alignment_summary: typeof details.message === 'string' ? details.message : 'Concierge unavailable.',
          tension_points: [],
          recommended_direction: details.error === 'ANTHROPIC_KEY_MISSING'
            ? 'Add an Anthropic API key in the Provider Vault to enable Concierge guidance.'
            : 'Concierge could not produce guidance for this round.',
          model_used: null,
          };
        dispatch({ type: 'SET_CONCIERGE_DECISION', payload: errDecision });
        await appendConciergeEventMessage(
          activeSessionId,
          errDecision.recommended_direction || errDecision.alignment_summary || 'Concierge could not produce guidance.',
          {
            kind: 'concierge_decision',
            decision: errDecision,
            round_id: targetRoundId,
            round_number: targetRound?.round_number,
            prompt: targetRound?.prompt,
          },
        );
        return;
      }
      console.error('Concierge call failed:', err);
    }
  }, [user, state.activeSession?.id, state.rounds, state.responses, state.syntheses, dispatch, logAudit, ensureSession, appendConciergeEventMessage]);

  const synthesize = useCallback(async (roundId: string) => {
    if (!user) return;

    let roundResponses = state.responses.filter(r => r.round_id === roundId);
    if (roundResponses.length === 0) {
      const { data: rawResponses } = await supabase
        .from('responses')
        .select('*')
        .eq('round_id', roundId)
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      roundResponses = (rawResponses ?? []) as Response[];
    }
    const flagged = roundResponses.filter(r => r.is_flagged);
    const toSynthesize = flagged.length > 0 ? flagged : roundResponses;

    if (toSynthesize.length === 0) return;

    // Base: broadcast responses
    const broadcastContent = toSynthesize
      .map(r => `[${r.agent_name} — ${r.agent_role}]:\n${r.content}`)
      .join('\n\n---\n\n');

    // Enrich: append direct thread conversations so synthesis includes follow-up exchanges
    const directThreads = state.threads.filter(t => t.type === 'direct' && t.status === 'active');
    let directContext = '';
    if (directThreads.length > 0) {
      const threadSections: string[] = [];
      for (const thread of directThreads) {
        const msgs = state.threadMessages
          .filter(m => m.thread_id === thread.id)
          .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        if (msgs.length > 1) {
          // Only include threads with actual conversation (skip if just the seeded broadcast msg)
          const agent = state.agents.find(a => a.id === thread.agent_id);
          const agentLabel = agent?.display_name || agent?.name || 'Agent';
          const convo = msgs.map(m =>
            m.role === 'user' ? `User: ${m.content}` : `${agentLabel}: ${m.content}`
          ).join('\n\n');
          threadSections.push(`[Direct conversation with ${agentLabel}]:\n${convo}`);
        }
      }
      if (threadSections.length > 0) {
        directContext = '\n\n===== DIRECT THREAD CONVERSATIONS =====\n\n' + threadSections.join('\n\n---\n\n');
      }
    }

    const combinedContent = broadcastContent + directContext;

    try {
      await ensureSession();
      // Pass round_id so the synthesize edge function can detect deliberation
      // completion and switch to deliberation-aware mode (PRO-01). When the
      // round has no deliberation, the function falls back to classic mode and
      // metadata fields are simply absent.
      const result = await invokeEdgeFunction<SynthesizeInvokeResult>('synthesize', {
        round_id: roundId,
        responses: combinedContent,
      });
      const content = result.content ?? result.synthesis ?? combinedContent;

      // Capture the deliberation-aware fields if any. Classic mode returns
      // none of these; deliberation mode returns the full set.
      const metadata: Record<string, unknown> = {};
      if (typeof result.consensus === 'string' && result.consensus.length > 0) metadata.consensus = result.consensus;
      if (Array.isArray(result.trade_offs) && result.trade_offs.length > 0) metadata.trade_offs = result.trade_offs;
      if (Array.isArray(result.acknowledged_weaknesses) && result.acknowledged_weaknesses.length > 0) metadata.acknowledged_weaknesses = result.acknowledged_weaknesses;
      if (Array.isArray(result.unresolved_tensions) && result.unresolved_tensions.length > 0) metadata.unresolved_tensions = result.unresolved_tensions;
      if (typeof result.recommendation === 'string' && result.recommendation.length > 0) metadata.recommendation = result.recommendation;
      if (typeof result.model_used === 'string' && result.model_used.length > 0) metadata.model_used = result.model_used;

      const { data: rawSynth } = await supabase
        .from('syntheses')
        .insert({
          round_id: roundId,
          user_id: user.id,
          content,
          source_response_ids: toSynthesize.map(r => r.id) as unknown as never,
          ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
        } as never)
        .select()
        .maybeSingle();

      const synthData = rawSynth as Synthesis | null;
      if (synthData) {
        dispatch({ type: 'ADD_SYNTHESIS', payload: synthData });
      }

      await logAudit('synthesis', 'Conductor');

      const sessionRoundCount = state.rounds.filter(r => r.session_id === state.activeSession?.id).length;
      const phase: ConciergePhase = sessionRoundCount <= 1 ? 'post_round1' : 'post_round2';
      void triggerConcierge(phase, roundId, content);

      return { content };
    } catch (err) {
      console.error('Synthesis error:', err);
      return null;
    }
  }, [user, state.responses, state.rounds, state.activeSession, state.threads, state.threadMessages, state.agents, dispatch, logAudit, triggerConcierge, ensureSession]);

  synthesizeRef.current = synthesize;

  const newRound = useCallback(async () => {
    if (!user || !state.activeSession) return;
    dispatch({ type: 'CLEAR_STAGE' });
    dispatch({ type: 'CLOSE_TRANSIENT' });
    await logAudit('new_round', 'Conductor', { sessionId: state.activeSession.id });
  }, [user, state.activeSession, dispatch, logAudit]);

  return { broadcast, synthesize, logAudit, newRound, buildTieredContext, triggerConcierge };
}




