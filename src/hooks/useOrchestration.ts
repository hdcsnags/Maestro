import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useMaestro } from '../context/MaestroContext';
import { useAuth } from '../context/AuthContext';
import { Agent, Response, AuditEvent, Round, Synthesis, ResponseArtifact, OrchestrationMode } from '../types';

export function useOrchestration() {
  const { state, dispatch } = useMaestro();
  const { user } = useAuth();

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

  const broadcast = useCallback(async (
    prompt: string,
    selectedAgentIds: string[]
  ) => {
    if (!user || !state.activeSession || !state.workspace) return;

    dispatch({ type: 'SET_IS_BROADCASTING', payload: true });
    dispatch({ type: 'SET_BROADCASTING_AGENTS', payload: selectedAgentIds });

    try {
      const nextRoundNumber = (state.rounds.length > 0
        ? Math.max(...state.rounds.map(r => r.round_number)) + 1
        : 1);

      const { data: rawRound, error: roundError } = await supabase
        .from('rounds')
        .insert({
          session_id: state.activeSession.id,
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
        sessionId: state.activeSession.id,
        mode: state.executionMode,
      });

      const targetAgents = state.agents.filter(a => selectedAgentIds.includes(a.id));
      const roundId = roundData.id as string;

      await Promise.all(
        targetAgents.map(agent => callAgent(agent, prompt, roundId, state.orchestrationMode))
      );

      await supabase
        .from('rounds')
        .update({ status: 'complete' } as never)
        .eq('id', roundId);

    } finally {
      dispatch({ type: 'SET_IS_BROADCASTING', payload: false });
      dispatch({ type: 'SET_BROADCASTING_AGENTS', payload: [] });
    }
  }, [user, state, dispatch, logAudit]);

  const callAgent = useCallback(async (agent: Agent, prompt: string, roundId: string, mode: OrchestrationMode = 'analysis') => {
    if (!user) return;

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    const { data: { session } } = await supabase.auth.getSession();
    const accessToken = session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

    const agentSkills = state.agentSkills
      .filter(s => s.agent_id === agent.id && s.is_active)
      .map(s => ({ name: s.name, instruction: s.instruction }));

    try {
      const response = await fetch(`${supabaseUrl}/functions/v1/orchestrate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt,
          provider: agent.provider,
          model: agent.model,
          agentName: agent.name,
          agentRole: agent.role,
          agentSkills: agentSkills.length > 0 ? agentSkills : undefined,
          scopedPaths: agent.scoped_paths && agent.scoped_paths.length > 0 ? agent.scoped_paths : undefined,
          mode,
          repo_connection_id: state.activeRepoConnection?.id,
        }),
      });

      if (!response.ok) {
        throw new Error(`Agent call failed: ${response.status}`);
      }

      const result = await response.json();
      const artifacts: ResponseArtifact[] = Array.isArray(result.artifacts) ? result.artifacts : [];

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
    } catch (err) {
      console.error('Synthesis error:', err);
    }
  }, [user, state.responses, dispatch, logAudit]);

  const newRound = useCallback(async () => {
    if (!user || !state.activeSession) return;
    dispatch({ type: 'CLEAR_STAGE' });
    dispatch({ type: 'CLOSE_TRANSIENT' });
    await logAudit('new_round', 'Conductor', { sessionId: state.activeSession.id });
  }, [user, state.activeSession, dispatch, logAudit]);

  return { broadcast, synthesize, logAudit, newRound };
}
