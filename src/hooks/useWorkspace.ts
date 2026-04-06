import { useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useMaestro } from '../context/MaestroContext';
import { useAuth } from '../context/AuthContext';
import { AGENT_DEFAULTS, Agent, AgentSkill, AuditEvent, Round, Session, Workspace, Response as MaestroResponse, Synthesis, ProviderConnection, RepoConnection, ExecutionMode } from '../types';

export function useWorkspace() {
  const { state, dispatch } = useMaestro();
  const { user } = useAuth();

  const ensureWorkspace = useCallback(async () => {
    if (!user) return null;

    const { data: rawExisting } = await supabase
      .from('workspaces')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    const existing = rawExisting as Workspace | null;
    if (existing) {
      dispatch({ type: 'SET_WORKSPACE', payload: existing });
      return existing;
    }

    const email = user.email ?? 'user';
    const displayName = email.split('@')[0];
    const { data: rawNewWs } = await supabase
      .from('workspaces')
      .insert({
        user_id: user.id,
        name: `${displayName}'s Workspace`,
        slug: displayName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
        description: 'Primary orchestration workspace',
      } as never)
      .select()
      .maybeSingle();

    const newWs = rawNewWs as Workspace | null;
    if (!newWs) return null;

    dispatch({ type: 'SET_WORKSPACE', payload: newWs });
    return newWs;
  }, [user, dispatch]);

  const ensureAgents = useCallback(async (workspaceId: string) => {
    if (!user) return;

    // Race-safe seed. Upsert all 15 canonical defaults in one round trip,
    // keyed on the unique (workspace_id, provider_group, slot_index)
    // constraint added in 20260406150100_unique_agent_slots.sql. Existing
    // rows are left untouched (ignoreDuplicates: true) so user toggles like
    // is_active aren't clobbered on every page load. Concurrent calls from
    // multiple tabs collapse to a single canonical row per slot.
    await supabase
      .from('agents')
      .upsert(
        AGENT_DEFAULTS.map(a => ({
          workspace_id: workspaceId,
          user_id: user.id,
          name: a.name,
          display_name: a.display_name,
          role: a.role,
          provider: a.provider,
          model: a.model,
          color: a.color,
          is_active: a.is_active,
          sort_order: a.slot_index,
          slot_index: a.slot_index,
          provider_group: a.provider_group,
        })) as never,
        { onConflict: 'workspace_id,provider_group,slot_index', ignoreDuplicates: true }
      );

    // Read back the canonical state, ordered by provider group then slot.
    const { data: rawAgents } = await supabase
      .from('agents')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .order('provider_group', { ascending: true })
      .order('slot_index', { ascending: true });

    const agents = (rawAgents ?? []) as Agent[];
    dispatch({ type: 'SET_AGENTS', payload: agents });
  }, [user, dispatch]);

  const loadSessions = useCallback(async (workspaceId: string) => {
    if (!user) return;
    const { data: rawSessions } = await supabase
      .from('sessions')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    const sessions = (rawSessions ?? []) as Session[];
    dispatch({ type: 'SET_SESSIONS', payload: sessions });
  }, [user, dispatch]);

  const ensureSession = useCallback(async (workspaceId: string) => {
    if (!user) return null;

    const { data: rawLatest } = await supabase
      .from('sessions')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const latest = rawLatest as Session | null;
    if (latest) {
      dispatch({ type: 'SET_ACTIVE_SESSION', payload: latest });
      dispatch({ type: 'SET_EXECUTION_MODE', payload: latest.execution_mode as ExecutionMode });
      return latest;
    }

    // Auto-bind to the active repo connection if one exists for this workspace
    const { data: rawActiveRepo } = await supabase
      .from('repo_connections')
      .select('owner, repo')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();
    const activeRepo = rawActiveRepo as { owner: string; repo: string } | null;
    const githubRepo = activeRepo ? `${activeRepo.owner}/${activeRepo.repo}` : '';

    const { data: rawNewSession } = await supabase
      .from('sessions')
      .insert({
        workspace_id: workspaceId,
        user_id: user.id,
        title: 'Maestro — Session 1',
        execution_mode: 'pr_flow',
        status: 'active',
        github_repo: githubRepo,
      } as never)
      .select()
      .maybeSingle();

    const newSession = rawNewSession as Session | null;
    if (!newSession) return null;

    dispatch({ type: 'SET_ACTIVE_SESSION', payload: newSession });
    dispatch({ type: 'SET_EXECUTION_MODE', payload: newSession.execution_mode as ExecutionMode });
    return newSession;
  }, [user, dispatch]);

  const loadProviderConnections = useCallback(async () => {
    if (!user) return;
    const { data: rawConns } = await supabase
      .from('provider_connections')
      .select('*')
      .eq('user_id', user.id);
    const conns = (rawConns ?? []) as ProviderConnection[];
    dispatch({ type: 'SET_PROVIDER_CONNECTIONS', payload: conns });
  }, [user, dispatch]);

  const loadAgentSkills = useCallback(async () => {
    if (!user) return;
    const { data: rawSkills } = await supabase
      .from('agent_skills')
      .select('*')
      .eq('user_id', user.id);
    const skills = (rawSkills ?? []) as AgentSkill[];
    dispatch({ type: 'SET_AGENT_SKILLS', payload: skills });
  }, [user, dispatch]);

  const loadRepoConnections = useCallback(async (workspaceId: string) => {
    if (!user) return;
    const { data: rawRepos } = await supabase
      .from('repo_connections')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('user_id', user.id);
    const repos = (rawRepos ?? []) as RepoConnection[];
    dispatch({ type: 'SET_REPO_CONNECTIONS', payload: repos });
    const active = repos.find(r => r.is_active) ?? null;
    dispatch({ type: 'SET_ACTIVE_REPO_CONNECTION', payload: active });
  }, [user, dispatch]);

  const loadSessionHistory = useCallback(async (sessionId: string) => {
    if (!user) return;

    const { data: rawRounds } = await supabase
      .from('rounds')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .order('round_number', { ascending: true });

    const rounds = (rawRounds ?? []) as Round[];
    if (rounds.length === 0) return;

    dispatch({ type: 'SET_ROUNDS', payload: rounds });

    const roundIds = rounds.map(r => r.id);
    const { data: rawResponses } = await supabase
      .from('responses')
      .select('*')
      .in('round_id', roundIds)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });

    const responses = (rawResponses ?? []) as MaestroResponse[];
    if (responses.length > 0) {
      dispatch({ type: 'SET_RESPONSES', payload: responses });
    }

    const { data: rawSyntheses } = await supabase
      .from('syntheses')
      .select('*')
      .in('round_id', roundIds)
      .eq('user_id', user.id);

    const syntheses = (rawSyntheses ?? []) as Synthesis[];
    if (syntheses.length > 0) {
      dispatch({ type: 'SET_SYNTHESES', payload: syntheses });
    }

    const { data: rawAudits } = await supabase
      .from('audit_events')
      .select('*')
      .eq('session_id', sessionId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    const audits = (rawAudits ?? []) as AuditEvent[];
    if (audits.length > 0) {
      dispatch({ type: 'SET_AUDIT_EVENTS', payload: audits });
    }
  }, [user, dispatch]);

  const createSession = useCallback(async (workspaceId: string) => {
    if (!user) return null;
    const sessionCount = state.sessions.length + 1;
    const activeRepo = state.activeRepoConnection;
    const githubRepo = activeRepo ? `${activeRepo.owner}/${activeRepo.repo}` : '';

    const { data: rawNew } = await supabase
      .from('sessions')
      .insert({
        workspace_id: workspaceId,
        user_id: user.id,
        title: `Session ${sessionCount}`,
        execution_mode: 'pr_flow',
        status: 'active',
        github_repo: githubRepo,
      } as never)
      .select()
      .maybeSingle();

    const newSession = rawNew as Session | null;
    if (!newSession) return null;

    dispatch({ type: 'SET_ACTIVE_SESSION', payload: newSession });
    dispatch({ type: 'SET_EXECUTION_MODE', payload: 'pr_flow' });
    dispatch({ type: 'SET_ROUNDS', payload: [] });
    dispatch({ type: 'SET_RESPONSES', payload: [] });
    dispatch({ type: 'SET_SYNTHESES', payload: [] });
    dispatch({ type: 'SET_AUDIT_EVENTS', payload: [] });
    dispatch({ type: 'SET_FOLIO_INDEX', payload: 0 });
    dispatch({ type: 'SET_SESSIONS', payload: [newSession, ...state.sessions] });
    return newSession;
  }, [user, state.sessions, state.activeRepoConnection, dispatch]);

  const switchSession = useCallback(async (session: Session) => {
    dispatch({ type: 'SET_ACTIVE_SESSION', payload: session });
    dispatch({ type: 'SET_EXECUTION_MODE', payload: session.execution_mode as ExecutionMode });
    dispatch({ type: 'SET_ROUNDS', payload: [] });
    dispatch({ type: 'SET_RESPONSES', payload: [] });
    dispatch({ type: 'SET_SYNTHESES', payload: [] });
    dispatch({ type: 'SET_AUDIT_EVENTS', payload: [] });
    dispatch({ type: 'SET_FOLIO_INDEX', payload: 0 });
    await loadSessionHistory(session.id);
  }, [dispatch, loadSessionHistory]);

  const renameSession = useCallback(async (sessionId: string, title: string) => {
    if (!user) return;
    await supabase
      .from('sessions')
      .update({ title } as never)
      .eq('id', sessionId);
    dispatch({ type: 'SET_SESSIONS', payload: state.sessions.map(s => s.id === sessionId ? { ...s, title } : s) });
    if (state.activeSession?.id === sessionId) {
      dispatch({ type: 'SET_ACTIVE_SESSION', payload: { ...state.activeSession, title } });
    }
  }, [user, state.sessions, state.activeSession, dispatch]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const ws = await ensureWorkspace();
        if (!ws) {
          dispatch({ type: 'SET_INIT_ERROR', payload: 'Failed to load workspace. Check your connection and try again.' });
          return;
        }
        await Promise.all([
          ensureAgents(ws.id),
          loadSessions(ws.id),
          loadProviderConnections(),
          loadAgentSkills(),
          loadRepoConnections(ws.id),
        ]);
        const sess = await ensureSession(ws.id);
        if (sess) await loadSessionHistory(sess.id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown initialization error';
        dispatch({ type: 'SET_INIT_ERROR', payload: msg });
      }
    })();
  }, [user]);

  return {
    ensureWorkspace,
    ensureAgents,
    ensureSession,
    loadSessionHistory,
    loadSessions,
    loadProviderConnections,
    loadAgentSkills,
    loadRepoConnections,
    createSession,
    switchSession,
    renameSession,
  };
}
