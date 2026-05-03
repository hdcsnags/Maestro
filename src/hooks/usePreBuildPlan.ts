import { useCallback, useMemo } from 'react';
import { useMaestro } from '../context/MaestroContext';
import { useThreads } from './useThreads';
import { invokeEdgeFunction } from '../lib/functions';
import { supabase } from '../lib/supabase';
import type { BuildLaneRole, IntakeSummary, RepoConnection, SuggestedLane } from '../types';

const BUILDER_COUNT_OPTIONS = [1, 2, 3, 4, 5] as const;

interface BuildAgentCandidate {
  id: string;
  name: string;
  display_name: string;
  role: string;
  provider: string;
  provider_group: string;
  model: string;
}

function normBuilderValue(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function scoreBuildCandidate(agent: BuildAgentCandidate, hasOnlineExecutor?: boolean): number {
  const role = normBuilderValue(agent.role);
  const name = normBuilderValue(`${agent.display_name} ${agent.name}`);
  const provider = normBuilderValue(`${agent.provider_group} ${agent.model}`);

  let score = 0;
  if (role.includes('build') || role.includes('build lead') || role.includes('code generation')) score += 50;
  if (role.includes('local build')) score += 40;
  if (name.includes('builder')) score += 22;
  if (name.includes('sonnet')) score += 35;
  if (name.includes('gpt 5 4') || name.includes('gpt 5')) score += 25;
  if (provider.includes('anthropic')) score += 18;
  if (provider.includes('openai')) score += 14;
  if (provider.includes('maestroclaw')) score += hasOnlineExecutor ? 60 : -40;
  if (role.includes('triage') || role.includes('summarization') || role.includes('general purpose')) score -= 18;
  if (role.includes('free') || name.includes('gpt oss') || name.includes('gemma')) score -= 24;
  if (provider.includes('openrouter a')) score -= 10;
  return score;
}

function normalizeBuilderSelection(currentIds: string[], targetCount: number, rankedAgents: BuildAgentCandidate[]): string[] {
  const availableIds = new Set(rankedAgents.map(agent => agent.id));
  const next: string[] = [];

  for (const id of currentIds) {
    if (availableIds.has(id) && !next.includes(id)) next.push(id);
    if (next.length >= targetCount) return next;
  }

  for (const agent of rankedAgents) {
    if (!next.includes(agent.id)) next.push(agent.id);
    if (next.length >= targetCount) break;
  }

  return next.slice(0, targetCount);
}

function isSuggestedLane(value: unknown): value is SuggestedLane {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { agent_name?: unknown }).agent_name === 'string'
    && Array.isArray((value as { lane_paths?: unknown }).lane_paths)
    && typeof (value as { role?: unknown }).role === 'string';
}

function uniquePaths(paths: string[]): string[] {
  return Array.from(new Set(paths.map(path => path.trim()).filter(Boolean)));
}

function buildDefaultLanes(selectedBuilders: BuildAgentCandidate[]): SuggestedLane[] {
  return selectedBuilders.map((builder, index) => ({
    agent_name: builder.display_name || builder.name,
    agent_id: builder.id,
    lane_paths: [index === 0 ? 'src/**' : '**'],
    role: 'builder',
  }));
}

export function usePreBuildPlan(threadId: string) {
  const { state, dispatch } = useMaestro();
  const { activateBuildRunway } = useThreads();

  const activeSession = state.activeSession;
  const buildSpec = useMemo(
    () => ((activeSession?.build_spec ?? {}) as Record<string, unknown>),
    [activeSession?.build_spec],
  );
  const activeRepoConnection = useMemo<RepoConnection | null>(() => {
    const sessionRepo = activeSession?.github_repo?.trim();
    if (sessionRepo) {
      return state.repoConnections.find((connection) => `${connection.owner}/${connection.repo}` === sessionRepo) ?? null;
    }
    return state.activeRepoConnection;
  }, [activeSession?.github_repo, state.activeRepoConnection, state.repoConnections]);
  const projectType = activeSession?.project_type ?? 'new';
  const executionBackend = activeSession?.execution_backend ?? 'edge';
  const requestedBuildPrompt = typeof buildSpec.requested_build_prompt === 'string' ? buildSpec.requested_build_prompt : '';
  const architectMd = activeSession?.architect_md ?? null;
  const scanResult = (buildSpec.intake_summary as IntakeSummary | undefined) ?? null;
  const connectedProviders = useMemo(
    () => new Set(state.providerConnections.filter((connection) => connection.is_connected).map((connection) => connection.provider)),
    [state.providerConnections],
  );
  const hasOnlineExecutor = useMemo(
    () => state.executors.some((executor) =>
      executor.status === 'online'
      && executor.last_seen_at
      && Date.now() - new Date(executor.last_seen_at).getTime() < 60_000,
    ),
    [state.executors],
  );
  const allAgents = state.agents;
  const activeAgents = useMemo(
    () => allAgents.filter((agent) => agent.is_active),
    [allAgents],
  );
  const persistedBuilderIds = useMemo(
    () => Array.isArray(buildSpec.primary_builder_agent_ids)
      ? buildSpec.primary_builder_agent_ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [],
    [buildSpec],
  );
  const builderCandidateAgents = useMemo(
    () => allAgents.filter((agent) =>
      agent.provider_group !== 'openrouter_a' && // ineligible as builders (reliably 504/stub on build tasks)
      (agent.is_active
        || agent.provider_group === 'maestroclaw'
        || connectedProviders.has(agent.provider)
        || persistedBuilderIds.includes(agent.id)),
    ).map((agent) => ({
      id: agent.id,
      name: agent.name,
      display_name: agent.display_name,
      role: agent.role,
      provider: agent.provider,
      provider_group: agent.provider_group,
      model: agent.model,
    })),
    [allAgents, connectedProviders, persistedBuilderIds],
  );
  const rankedBuilderAgents = useMemo(
    () => builderCandidateAgents
      .slice()
      .sort((a, b) => scoreBuildCandidate(b, hasOnlineExecutor) - scoreBuildCandidate(a, hasOnlineExecutor)),
    [builderCandidateAgents, hasOnlineExecutor],
  );
  const persistedBuilderCount = useMemo(() => {
    const raw = buildSpec.builder_count;
    return typeof raw === 'number' && BUILDER_COUNT_OPTIONS.includes(raw as typeof BUILDER_COUNT_OPTIONS[number])
      ? raw
      : 2;
  }, [buildSpec]);
  const builderCount = rankedBuilderAgents.length > 0
    ? Math.min(Math.max(persistedBuilderCount, 1), rankedBuilderAgents.length)
    : 1;
  const selectedBuilderIds = useMemo(
    () => normalizeBuilderSelection(persistedBuilderIds, builderCount, rankedBuilderAgents),
    [persistedBuilderIds, builderCount, rankedBuilderAgents],
  );
  const selectedBuilderSet = useMemo(() => new Set(selectedBuilderIds), [selectedBuilderIds]);
  const selectedBuilderAgents = useMemo(
    () => selectedBuilderIds
      .map((id) => rankedBuilderAgents.find((agent) => agent.id === id))
      .filter((agent): agent is BuildAgentCandidate => Boolean(agent)),
    [selectedBuilderIds, rankedBuilderAgents],
  );
  const suggestedLanes = useMemo(
    () => Array.isArray(buildSpec.suggested_lanes)
      ? buildSpec.suggested_lanes.filter(isSuggestedLane).map((lane) => ({
        ...lane,
        lane_paths: uniquePaths(lane.lane_paths),
      }))
      : [],
    [buildSpec],
  );
  const recommendedBackend = useMemo<'edge' | 'local' | 'auto'>(() => {
    const hasClawBuilder = selectedBuilderAgents.some((agent) => agent.provider_group === 'maestroclaw');
    if (hasClawBuilder && hasOnlineExecutor) return 'local';
    if (hasClawBuilder) return 'edge';
    return 'edge';
  }, [selectedBuilderAgents, hasOnlineExecutor]);
  const laneIssues = useMemo(() => {
    const overlaps = new Map<number, string>();
    const invalidBuilderLaneIndexes = new Set<number>();
    const builders = suggestedLanes.map((lane, index) => ({ lane, index })).filter(({ lane }) => lane.role === 'builder');

    for (let i = 0; i < builders.length; i += 1) {
      for (let j = i + 1; j < builders.length; j += 1) {
        for (const path of builders[i].lane.lane_paths) {
          if (builders[j].lane.lane_paths.includes(path)) {
            overlaps.set(builders[i].index, `Overlap with ${builders[j].lane.agent_name} on "${path}"`);
            overlaps.set(builders[j].index, `Overlap with ${builders[i].lane.agent_name} on "${path}"`);
          }
        }
      }
    }

    suggestedLanes.forEach((lane, index) => {
      if (lane.role !== 'builder') return;
      if (!lane.agent_id || !selectedBuilderSet.has(lane.agent_id)) {
        invalidBuilderLaneIndexes.add(index);
      }
    });

    return {
      overlaps,
      invalidBuilderLaneIndexes,
      hasBuilders: suggestedLanes.some((lane) => lane.role === 'builder'),
    };
  }, [suggestedLanes, selectedBuilderSet]);
  const canLock = suggestedLanes.length > 0
    && laneIssues.hasBuilders
    && laneIssues.overlaps.size === 0
    && laneIssues.invalidBuilderLaneIndexes.size === 0
    && activeSession?.build_spec_locked !== true
    && selectedBuilderIds.length > 0;

  const persistSessionPatch = useCallback(async (patch: Record<string, unknown>) => {
    if (!activeSession) throw new Error('No active session');
    await supabase.from('sessions').update(patch as never).eq('id', activeSession.id);
    dispatch({ type: 'UPDATE_ACTIVE_SESSION', payload: patch });
  }, [activeSession, dispatch]);

  const persistBuildSpecPatch = useCallback(async (patch: Record<string, unknown>) => {
    const nextBuildSpec = {
      ...buildSpec,
      ...patch,
    };
    await persistSessionPatch({ build_spec: nextBuildSpec });
    return nextBuildSpec;
  }, [buildSpec, persistSessionPatch]);

  const hydrateSuggestedLanes = useCallback((incoming: SuggestedLane[]) => {
    return incoming.map((lane, index) => {
      const agentPool = lane.role === 'builder' ? selectedBuilderAgents : activeAgents;
      const matched = lane.agent_id
        ? allAgents.find((agent) => agent.id === lane.agent_id)
        : agentPool.find((agent) => agent.display_name === lane.agent_name || agent.name === lane.agent_name)
          ?? (lane.role === 'builder'
            ? selectedBuilderAgents[index] ?? selectedBuilderAgents[0]
            : activeAgents[index] ?? activeAgents[0]);

      return {
        ...lane,
        agent_id: matched?.id,
        agent_name: matched?.display_name ?? matched?.name ?? lane.agent_name,
        lane_paths: uniquePaths(lane.lane_paths),
      };
    });
  }, [allAgents, selectedBuilderAgents, activeAgents]);

  const setProjectType = useCallback(async (nextType: 'new' | 'existing') => {
    await persistSessionPatch({ project_type: nextType });
  }, [persistSessionPatch]);

  const setExecutionBackend = useCallback(async (backend: 'edge' | 'local' | 'auto') => {
    await persistSessionPatch({ execution_backend: backend });
  }, [persistSessionPatch]);

  const setBuilderCount = useCallback(async (nextCount: number) => {
    const safeCount = rankedBuilderAgents.length > 0
      ? Math.min(Math.max(nextCount, 1), rankedBuilderAgents.length)
      : 1;
    const nextSelected = normalizeBuilderSelection(selectedBuilderIds, safeCount, rankedBuilderAgents);
    await persistBuildSpecPatch({
      builder_count: safeCount,
      primary_builder_agent_ids: nextSelected,
    });
  }, [rankedBuilderAgents, selectedBuilderIds, persistBuildSpecPatch]);

  const setBuilderAt = useCallback(async (index: number, agentId: string) => {
    const next = normalizeBuilderSelection(selectedBuilderIds, builderCount, rankedBuilderAgents);
    next[index] = agentId;
    const unique = next.filter((value, valueIndex) => value && next.indexOf(value) === valueIndex);
    const normalized = normalizeBuilderSelection(unique, builderCount, rankedBuilderAgents);

    await persistBuildSpecPatch({
      builder_count: builderCount,
      primary_builder_agent_ids: normalized,
    });

    if (executionBackend !== 'local') {
      const picked = normalized
        .map((id) => rankedBuilderAgents.find((agent) => agent.id === id))
        .filter((agent): agent is BuildAgentCandidate => Boolean(agent));
      if (picked.some((agent) => agent.provider_group === 'maestroclaw') && hasOnlineExecutor) {
        await setExecutionBackend('local');
      }
    }
  }, [selectedBuilderIds, builderCount, rankedBuilderAgents, persistBuildSpecPatch, executionBackend, hasOnlineExecutor, setExecutionBackend]);

  const setSuggestedLanes = useCallback(async (lanes: SuggestedLane[]) => {
    await persistBuildSpecPatch({ suggested_lanes: lanes });
  }, [persistBuildSpecPatch]);

  const updateLaneAt = useCallback(async (index: number, patch: Partial<SuggestedLane>) => {
    const next = suggestedLanes.map((lane, laneIndex) => laneIndex === index ? {
      ...lane,
      ...patch,
      lane_paths: patch.lane_paths ? uniquePaths(patch.lane_paths) : lane.lane_paths,
    } : lane);
    await setSuggestedLanes(next);
  }, [suggestedLanes, setSuggestedLanes]);

  const addLane = useCallback(async () => {
    const next = [...suggestedLanes, {
      agent_name: selectedBuilderAgents[0]?.display_name ?? 'Builder',
      agent_id: selectedBuilderAgents[0]?.id,
      lane_paths: ['**'],
      role: 'builder' as BuildLaneRole,
    }];
    await setSuggestedLanes(next);
  }, [suggestedLanes, selectedBuilderAgents, setSuggestedLanes]);

  const removeLane = useCallback(async (index: number) => {
    await setSuggestedLanes(suggestedLanes.filter((_, laneIndex) => laneIndex !== index));
  }, [suggestedLanes, setSuggestedLanes]);

  const seedDefaultLanes = useCallback(async () => {
    const defaults = buildDefaultLanes(selectedBuilderAgents);
    await setSuggestedLanes(defaults);
  }, [selectedBuilderAgents, setSuggestedLanes]);

  const scanRepository = useCallback(async () => {
    if (!activeSession || !activeRepoConnection) throw new Error('Connect a repository first.');
    const data = await invokeEdgeFunction<{ intake_summary?: IntakeSummary; error?: string }>('intake', {
      session_id: activeSession.id,
      repo_connection_id: activeRepoConnection.id,
    });

    if (data.error === 'ANTHROPIC_KEY_MISSING') {
      throw new Error('Add an Anthropic API key in the Vault first.');
    }

    await persistBuildSpecPatch({ intake_summary: data.intake_summary ?? null });
    return (data.intake_summary ?? null) as IntakeSummary | null;
  }, [activeSession, activeRepoConnection, persistBuildSpecPatch]);

  const generateArchitect = useCallback(async () => {
    if (!activeSession) throw new Error('No active session');
    if (selectedBuilderIds.length === 0) throw new Error('Select at least one builder before generating ARCHITECT.md.');

    const nextBuildSpec = await persistBuildSpecPatch({
      builder_count: builderCount,
      primary_builder_agent_ids: selectedBuilderIds,
    });

    const data = await invokeEdgeFunction<{
      architect_md?: string;
      build_spec_locked?: boolean;
      lanes_assigned?: boolean;
      suggested_lanes?: SuggestedLane[];
      error?: string;
    }>('architect', {
      session_id: activeSession.id,
    });

    if (data.error === 'ANTHROPIC_KEY_MISSING') {
      throw new Error('Add an Anthropic API key in the Vault first.');
    }

    const nextSuggestedLanes = Array.isArray(data.suggested_lanes)
      ? hydrateSuggestedLanes(data.suggested_lanes)
      : suggestedLanes;
    await persistSessionPatch({
      architect_md: data.architect_md ?? null,
      build_spec: {
        ...nextBuildSpec,
        suggested_lanes: nextSuggestedLanes,
      },
      ...(data.build_spec_locked === true ? { build_spec_locked: true } : {}),
    });
  }, [activeSession, selectedBuilderIds, builderCount, persistBuildSpecPatch, hydrateSuggestedLanes, suggestedLanes, persistSessionPatch]);

  const lockSpec = useCallback(async () => {
    if (!activeSession) throw new Error('No active session');
    if (!canLock) throw new Error('Fix the lane assignments before locking the spec.');

    const rows = suggestedLanes.map((lane) => ({
      session_id: activeSession.id,
      agent_id: lane.agent_id || null,
      agent_name: lane.agent_name,
      lane_paths: lane.lane_paths,
      role: lane.role,
    }));

    await supabase.from('build_lanes').delete().eq('session_id', activeSession.id);
    const { error } = await supabase.from('build_lanes').insert(rows as never[]);
    if (error) throw new Error(error.message);

    const nextBuildSpec = {
      ...buildSpec,
      builder_count: builderCount,
      primary_builder_agent_ids: selectedBuilderIds,
      suggested_lanes: suggestedLanes,
    };
    await persistSessionPatch({ build_spec: nextBuildSpec, build_spec_locked: true });
  }, [activeSession, canLock, suggestedLanes, buildSpec, builderCount, selectedBuilderIds, persistSessionPatch]);

  const startBuild = useCallback(async () => {
    if (!activeSession) throw new Error('No active session');
    if (activeSession.build_spec_locked !== true) throw new Error('Lock the Pre-Build spec first.');
    const prompt = requestedBuildPrompt || 'Continue the requested build';
    await activateBuildRunway(threadId, prompt, {
      ...buildSpec,
      requested_build_prompt: prompt,
    });
  }, [activeSession, requestedBuildPrompt, activateBuildRunway, threadId, buildSpec]);

  const openAdvancedView = useCallback(() => {
    dispatch({ type: 'OPEN_DRAWER', payload: 'pre-build' });
  }, [dispatch]);

  const getBuilderAvailability = useCallback((agent: BuildAgentCandidate) => {
    if (agent.provider_group === 'maestroclaw') {
      return hasOnlineExecutor
        ? { label: 'Executor online', tone: 'ok' as const }
        : { label: 'Executor offline', tone: 'warn' as const };
    }
    return connectedProviders.has(agent.provider)
      ? { label: 'API key connected', tone: 'ok' as const }
      : { label: 'API key missing', tone: 'warn' as const };
  }, [connectedProviders, hasOnlineExecutor]);

  return {
    activeSession,
    activeRepoConnection,
    projectType,
    executionBackend,
    recommendedBackend,
    requestedBuildPrompt,
    architectMd,
    scanResult,
    hasOnlineExecutor,
    rankedBuilderAgents,
    selectedBuilderIds,
    selectedBuilderAgents,
    builderCount,
    suggestedLanes,
    laneIssues,
    canLock,
    lanesLocked: activeSession?.build_spec_locked === true,
    setProjectType,
    setExecutionBackend,
    setBuilderCount,
    setBuilderAt,
    setSuggestedLanes,
    updateLaneAt,
    addLane,
    removeLane,
    seedDefaultLanes,
    scanRepository,
    generateArchitect,
    lockSpec,
    startBuild,
    openAdvancedView,
    getBuilderAvailability,
    activeAgents,
    allAgents,
  };
}
