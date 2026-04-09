import { useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useMaestro } from '../context/MaestroContext';
import { useAuth } from '../context/AuthContext';
import { Agent, Response, AuditEvent, Round, Synthesis, ResponseArtifact, OrchestrationMode, FileManifestEntry, ConciergeDecision, ConciergePhase, Session } from '../types';

export function useOrchestration() {
  const { state, dispatch } = useMaestro();
  const { user } = useAuth();

  // Ref so broadcast() can call synthesize() without circular useCallback deps
  const synthesizeRef = useRef<(roundId: string) => Promise<void>>();

  const logAudit = useCallback(async (
    eventType: string,
    actor: string,
    options: { sessionId?: string; provider?: string; model?: string; mode?: string } = {}
  ) => {
    if (!user) return;
    const { data } = await supabase.from('audit_events').insert({
      user_id: user.id,
      session_id: options.sessionId ?? state.activeSession?.id ?? null,
      event_type: eventType,
      actor,
      provider: options.provider ?? '',
      model: options.model ?? '',
      execution_mode: options.mode ?? state.executionMode,
      requires_approval: state.executionMode !== 'analyze',
      succeeded: true,
    } as never).select().maybeSingle();

    const row = data as AuditEvent | null;
    if (row) {
      dispatch({ type: 'ADD_AUDIT_EVENT', payload: row });
    }
  }, [user, state.activeSession, state.executionMode, dispatch]);

  const buildTieredContext = useCallback((prompt: string) => {
    const sessionId = state.activeSession?.id;
    if (!sessionId) return { contextText: '', indicator: [] as string[], contextFiles: [] as { path: string }[] };

    const sessionRounds = state.rounds
      .filter(r => r.session_id === sessionId)
      .sort((a, b) => a.round_number - b.round_number);
    const roundIds = new Set(sessionRounds.map(r => r.id));

    const parts: string[] = [];
    const indicator: string[] = [];

    // Tier 1 — latest synthesis in this session
    const sessionSyntheses = state.syntheses.filter(s => roundIds.has(s.round_id));
    if (sessionSyntheses.length > 0) {
      const latest = sessionSyntheses[sessionSyntheses.length - 1];
      const roundForSynth = sessionRounds.find(r => r.id === latest.round_id);
      parts.push(`[Latest Synthesis — Round ${roundForSynth?.round_number ?? '?'}]:\n${latest.content}`);
      indicator.push(`Synthesis R${roundForSynth?.round_number ?? '?'}`);
    }

    // Tier 2 — previous 2 round summaries if session has fewer than 10 rounds
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

    // Tier 3 — pinned responses across the session
    const pinned = state.responses.filter(r => r.is_pinned && roundIds.has(r.round_id));
    if (pinned.length > 0) {
      const pinnedText = pinned
        .map(r => `[Pinned — ${r.agent_name}]:\n${r.title ? r.title + '\n' : ''}${r.content}`)
        .join('\n\n');
      parts.push(pinnedText);
      indicator.push(`${pinned.length} pinned`);
    }

    // Tier 4 — detect filename references in prompt, queue as context_files
    const contextFiles: { path: string }[] = [];
    const filePattern = /(?:^|\s|[`'"])((?:[\w.-]+\/)+[\w.-]+\.\w{1,8}|[\w.-]+\.\w{1,8})(?:[`'"\s.,;!?]|$)/g;
    const seen = new Set<string>();
    let m;
    while ((m = filePattern.exec(prompt)) !== null) {
      const path = m[1];
      if (path.length < 3 || seen.has(path)) continue;
      if (!/[./]/.test(path)) continue;
      seen.add(path);
      contextFiles.push({ path });
    }
    if (contextFiles.length > 0) {
      indicator.push(contextFiles.map(f => f.path).slice(0, 2).join(' · '));
    }

    const contextText = parts.length > 0 ? parts.join('\n\n---\n\n') : '';
    return { contextText, indicator, contextFiles };
  }, [state.activeSession, state.rounds, state.syntheses, state.responses]);

  const broadcast = useCallback(async (
    prompt: string,
    selectedAgentIds: string[],
    sessionOverride?: Session | null
  ) => {
    const session = sessionOverride ?? state.activeSession;
    if (!user || !session || !state.workspace) return;

    dispatch({ type: 'SET_IS_BROADCASTING', payload: true });
    dispatch({ type: 'SET_BROADCASTING_AGENTS', payload: selectedAgentIds });

    try {
      const nextRoundNumber = (state.rounds.length > 0
        ? Math.max(...state.rounds.map(r => r.round_number)) + 1
        : 1);

      const { data: rawRound, error: roundError } = await supabase
        .from('rounds')
        .insert({
          session_id: session.id,
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
        sessionId: session.id,
        mode: state.executionMode,
      });

      const targetAgents = state.agents.filter(a => selectedAgentIds.includes(a.id));
      const roundId = roundData.id as string;

      const tiered = buildTieredContext(prompt);

      await Promise.all(
        targetAgents.map(agent => callAgent(agent, prompt, roundId, state.orchestrationMode, tiered.contextText, tiered.contextFiles))
      );

      await supabase
        .from('rounds')
        .update({ status: 'complete' } as never)
        .eq('id', roundId);

      // Auto-synthesize after all agents respond, then concierge fires after synthesis
      dispatch({ type: 'SET_IS_BROADCASTING', payload: false });
      dispatch({ type: 'SET_BROADCASTING_AGENTS', payload: [] });
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
  }, [user, state, dispatch, logAudit, buildTieredContext]);

  const callAgent = useCallback(async (
    agent: Agent,
    prompt: string,
    roundId: string,
    mode: OrchestrationMode = 'analysis',
    tieredContext: string = '',
    contextFiles: { path: string }[] = [],
  ) => {
    if (!user) return;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

    const agentSkills = state.agentSkills
      .filter(s => s.agent_id === agent.id && s.is_active)
      .map(s => ({ name: s.name, instruction: s.instruction }));

    // Tiered context (T1-T3) is prepended to the user prompt.
    // Tier 4 context_files are resolved server-side via fetchFileContent.
    const augmentedPrompt = tieredContext
      ? `Prior session context (for reference only):\n\n${tieredContext}\n\n---\n\nCurrent request:\n${prompt}`
      : prompt;

    // Task 4 — Build mode auto-inject literal scoped paths as context_files.
    // Globs (*, **) are NOT expanded here; they remain hint text in the system
    // prompt. Hard limits: max 5 files, 50KB each. Oversize files become path
    // hints only. The actual fetch happens server-side in orchestrate.
    let mergedContextFiles = [...contextFiles];
    if (mode === 'build' && agent.scoped_paths && state.activeRepoConnection) {
      const isLiteral = (p: string) => !p.includes('*') && !p.endsWith('/');
      const literals = agent.scoped_paths.filter(isLiteral).slice(0, 5);
      const seen = new Set(mergedContextFiles.map(f => f.path));
      for (const path of literals) {
        if (seen.has(path)) continue;
        mergedContextFiles.push({ path });
        seen.add(path);
      }
    }

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/orchestrate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
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
        }),
      });

      if (!response.ok) {
        throw new Error(`Agent call failed: ${response.status}`);
      }

      const result = await response.json();
      const artifacts: ResponseArtifact[] = Array.isArray(result.artifacts) ? result.artifacts : [];
      const fileManifest: FileManifestEntry[] = Array.isArray(result.file_manifest) ? result.file_manifest : [];

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
          signals: result.signals ?? {},
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
          content: `Error: Could not reach ${agent.name}. Please verify your API key for ${agent.provider} in the Provider Vault.`,
          title: 'Connection error',
          signals: { status: 'error', note: 'API key may not be configured' },
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
  }, [user, state.agentSkills, state.activeRepoConnection, dispatch, logAudit]);

  const triggerConcierge = useCallback(async (
    phase: ConciergePhase,
    roundId?: string,
    synthesisContent?: string,
  ) => {
    if (!user || !state.activeSession) return;

    const targetRoundId = roundId
      ?? [...state.rounds].filter(r => r.session_id === state.activeSession?.id).sort((a, b) => b.round_number - a.round_number)[0]?.id;
    if (!targetRoundId) return;

    const responses = state.responses
      .filter(r => r.round_id === targetRoundId)
      .map(r => ({ agent_name: r.agent_name, content: r.content, signals: r.signals }));
    if (responses.length === 0) return;

    let synthesis = synthesisContent ?? null;
    if (!synthesis) {
      const synth = state.syntheses.find(s => s.round_id === targetRoundId);
      synthesis = synth?.content ?? null;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/concierge`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: state.activeSession.id,
          phase,
          responses,
          synthesis,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('Concierge error:', result);
        const errDecision: ConciergeDecision = {
          session_id: state.activeSession.id,
          phase,
          alignment_summary: result.message ?? 'Concierge unavailable.',
          tension_points: [],
          recommended_direction: result.error === 'ANTHROPIC_KEY_MISSING'
            ? 'Add an Anthropic API key in the Provider Vault to enable Concierge guidance.'
            : 'Concierge could not produce guidance for this round.',
          model_used: null,
        };
        dispatch({ type: 'SET_CONCIERGE_DECISION', payload: errDecision });
        dispatch({ type: 'SET_CONCIERGE_VISIBLE', payload: true });
        return;
      }

      const decision: ConciergeDecision = {
        session_id: state.activeSession.id,
        phase,
        alignment_summary: result.alignment_summary ?? '',
        tension_points: Array.isArray(result.tension_points) ? result.tension_points : [],
        recommended_direction: result.recommended_direction ?? '',
        model_used: result.model_used ?? null,
      };
      dispatch({ type: 'SET_CONCIERGE_DECISION', payload: decision });
      dispatch({ type: 'SET_CONCIERGE_VISIBLE', payload: true });
      console.log('[Concierge] decision received', { phase, model: decision.model_used });
      await logAudit('concierge', 'Concierge', { mode: phase });
    } catch (err) {
      console.error('Concierge call failed:', err);
    }
  }, [user, state.activeSession, state.rounds, state.responses, state.syntheses, dispatch, logAudit]);

  const synthesize = useCallback(async (roundId: string) => {
    if (!user) return;

    const roundResponses = state.responses.filter(r => r.round_id === roundId);
    const flagged = roundResponses.filter(r => r.is_flagged);
    const toSynthesize = flagged.length > 0 ? flagged : roundResponses;

    if (toSynthesize.length === 0) return;

    const combinedContent = toSynthesize
      .map(r => `[${r.agent_name} — ${r.agent_role}]:\n${r.content}`)
      .join('\n\n---\n\n');

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/synthesize`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ responses: combinedContent }),
      });

      const result = await response.json();
      const content = result.content ?? result.synthesis ?? combinedContent;

      const { data: rawSynth } = await supabase
        .from('syntheses')
        .insert({
          round_id: roundId,
          user_id: user.id,
          content,
          source_response_ids: toSynthesize.map(r => r.id) as unknown as never,
        } as never)
        .select()
        .maybeSingle();

      const synthData = rawSynth as Synthesis | null;
      if (synthData) {
        dispatch({ type: 'ADD_SYNTHESIS', payload: synthData });
      }

      await logAudit('synthesis', 'Conductor');

      // B3 — auto-trigger concierge after synthesis lands
      const sessionRoundCount = state.rounds.filter(r => r.session_id === state.activeSession?.id).length;
      const phase: ConciergePhase = sessionRoundCount <= 1 ? 'post_round1' : 'post_round2';
      void triggerConcierge(phase, roundId, content);
    } catch (err) {
      console.error('Synthesis error:', err);
    }
  }, [user, state.responses, state.rounds, state.activeSession, dispatch, logAudit, triggerConcierge]);

  // Keep ref current so broadcast() can call synthesize without circular deps
  synthesizeRef.current = synthesize;

  const newRound = useCallback(async () => {
    if (!user || !state.activeSession) return;
    dispatch({ type: 'CLEAR_STAGE' });
    dispatch({ type: 'CLOSE_TRANSIENT' });
    await logAudit('new_round', 'Conductor', { sessionId: state.activeSession.id });
  }, [user, state.activeSession, dispatch, logAudit]);

  return { broadcast, synthesize, logAudit, newRound, buildTieredContext, triggerConcierge };
}
