import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { useAuth } from '../../context/AuthContext';
import { useOrchestration } from '../../hooks/useOrchestration';
import { invokeEdgeFunction } from '../../lib/functions';
import { supabase } from '../../lib/supabase';
import type { BuildLaneRole, BuildPlan, SessionPhase, Response } from '../../types';
import {
  Hammer, Play, Shield, CheckCircle2, AlertTriangle,
  ExternalLink, Loader2, ChevronDown, ChevronUp,
  Pause, XCircle, ThumbsUp, GitBranch,
} from 'lucide-react';

/* ── Types ─────────────────────────────────────────────────── */

interface LaneRow {
  id: string;
  agent_id: string | null;
  agent_name: string;
  lane_paths: string[];
  role: BuildLaneRole;
}

interface Finding {
  file: string;
  issue: string;
  severity: 'minor' | 'critical_pause' | 'critical_approved';
  suggestion: string;
}

interface BouncerResult {
  findings: Finding[];
  overall_severity: string;
  summary: string;
  model_used: string;
}

type BuildStage = 'preparing' | 'plan_review' | 'broadcast' | 'broadcasting' | 'reviewing' | 'ready' | 'executing' | 'complete' | 'bouncer' | 'done';

interface NormalizedBuilderAgent {
  agent_id: string;
  agent_name: string;
  scoped_paths: string[];
  instruction: string;
}

interface NormalizedBuildPlan {
  build_prompt: string;
  build_summary: string;
  builder_agents: NormalizedBuilderAgent[];
}

/* ── Constants ─────────────────────────────────────────────── */

const SEVERITY_STYLE: Record<string, { color: string; bg: string; label: string }> = {
  minor: { color: '#d4a843', bg: 'rgba(212,168,67,0.08)', label: 'Minor' },
  critical_pause: { color: '#e05a5a', bg: 'rgba(224,90,90,0.08)', label: 'Critical' },
  critical_approved: { color: '#e0925a', bg: 'rgba(224,146,90,0.08)', label: 'Approved' },
};

const ROLE_BADGE: Record<BuildLaneRole, { color: string; label: string }> = {
  builder: { color: '#5ab88e', label: 'Builder' },
  reviewer: { color: '#5a8fe0', label: 'Reviewer' },
  read_only: { color: '#8a8ae0', label: 'Read Only' },
  security_audit: { color: '#e07b5a', label: 'Security' },
};

const PHASES: { key: SessionPhase; label: string }[] = [
  { key: 'analysis', label: 'Analysis' },
  { key: 'design', label: 'Design' },
  { key: 'pre_build', label: 'Pre-Build' },
  { key: 'build', label: 'Build' },
  { key: 'bouncer', label: 'Bouncer' },
  { key: 'complete', label: 'Complete' },
];

const BUILD_BROADCAST_MESSAGES = [
  'Agents are writing code…',
  'Generating patches…',
  'Applying architecture…',
  'Building from Architect.md…',
];

const PREPARING_MESSAGES = [
  'Concierge is reading the blueprint…',
  'Mapping builder assignments…',
  'Scoping file paths…',
  'Preparing build prompt…',
];

function safeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function safeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function hasWriteManifest(response: Response): boolean {
  return Array.isArray(response.file_manifest) && response.file_manifest.length > 0;
}

function hasExecutableManifest(response: Response): boolean {
  return hasWriteManifest(response)
    && response.signals?.build_complete !== 'false';
}

/* ── Component ─────────────────────────────────────────────── */

export default function BuildWorkspace() {
  const { state, dispatch } = useMaestro();
  const { user } = useAuth();
  const { broadcast } = useOrchestration();
  const session = state.activeSession;
  const agents = state.agents;

  const isVisible = session?.current_phase === 'build' || session?.current_phase === 'bouncer';

  const [lanes, setLanes] = useState<LaneRow[]>([]);
  const [stage, setStage] = useState<BuildStage>('preparing');
  const [error, setError] = useState('');

  // Broadcast step state
  const [buildRoundId, setBuildRoundId] = useState<string | null>(null);
  const [approvedResponseIds, setApprovedResponseIds] = useState<Set<string>>(new Set());
  const [broadcastMsgIdx, setBroadcastMsgIdx] = useState(0);
  const [stageHydrated, setStageHydrated] = useState(false);
  const broadcastTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preparingTriggered = useRef(false);

  // Cycling broadcast/preparing message
  useEffect(() => {
    if (stage === 'broadcasting' || stage === 'preparing') {
      setBroadcastMsgIdx(0);
      const msgs = stage === 'preparing' ? PREPARING_MESSAGES : BUILD_BROADCAST_MESSAGES;
      broadcastTimerRef.current = setInterval(() => {
        setBroadcastMsgIdx(prev => (prev + 1) % msgs.length);
      }, 3000);
    } else if (broadcastTimerRef.current) {
      clearInterval(broadcastTimerRef.current);
      broadcastTimerRef.current = null;
    }
    return () => { if (broadcastTimerRef.current) clearInterval(broadcastTimerRef.current); };
  }, [stage]);

  // Execution state
  const [writtenFiles, setWrittenFiles] = useState<string[]>([]);
  const [skippedFiles, setSkippedFiles] = useState<{ path: string; reason: string }[]>([]);
  const [prUrls, setPrUrls] = useState<string[]>([]);
  const [collisionCount, setCollisionCount] = useState(0);
  const [handoffs, setHandoffs] = useState<{ from_agent: string; path: string }[]>([]);
  const [backupBranch, setBackupBranch] = useState('');

  // Bouncer state
  const [bouncerLoading, setBouncerLoading] = useState(false);
  const [bouncerResult, setBouncerResult] = useState<BouncerResult | null>(null);
  const [bouncerError, setBouncerError] = useState('');
  const [findingsExpanded, setFindingsExpanded] = useState(true);

  useEffect(() => {
    if (!session || !isVisible) return;
    preparingTriggered.current = false;
    setStage('preparing');
    setStageHydrated(false);
    setBuildRoundId(null);
    setApprovedResponseIds(new Set());
    setError('');
    setWrittenFiles([]);
    setSkippedFiles([]);
    setPrUrls([]);
    setCollisionCount(0);
    setHandoffs([]);
    setBackupBranch('');
    setBouncerResult(null);
    setBouncerError('');
    setBouncerLoading(false);
  }, [session?.id, isVisible]);

  const normalizedBuildPlan: NormalizedBuildPlan | null = useMemo(() => {
    if (!state.buildPlan) return null;
    return {
      build_prompt: safeText(state.buildPlan.build_prompt),
      build_summary: safeText(state.buildPlan.build_summary, 'Concierge prepared a build plan.'),
      builder_agents: Array.isArray(state.buildPlan.builder_agents)
        ? state.buildPlan.builder_agents.map(agent => ({
          agent_id: safeText(agent.agent_id),
          agent_name: safeText(agent.agent_name, 'Builder'),
          scoped_paths: safeStringArray(agent.scoped_paths),
          instruction: safeText(agent.instruction, 'Build the assigned files from Architect.md.'),
        }))
        : [],
    };
  }, [state.buildPlan]);

  const sessionRounds = useMemo(() => (
    session ? state.rounds.filter(round => round.session_id === session.id) : []
  ), [session, state.rounds]);

  const resolveBuilderAgentIds = useCallback((plan: NormalizedBuildPlan | null) => {
    const ids = new Set<string>();
    for (const agent of plan?.builder_agents ?? []) {
      if (agent.agent_id) ids.add(agent.agent_id);
    }

    if (ids.size > 0) return { ids: [...ids], warning: '' };

    const scoreAgentForLane = (agent: typeof agents[number], lane: LaneRow, index: number): number => {
      const label = norm(lane.agent_name);
      const role = norm(agent.role);
      const name = norm(`${agent.display_name} ${agent.name}`);
      const provider = norm(`${agent.provider} ${agent.provider_group ?? ''} ${agent.model}`);
      const paths = norm(lane.lane_paths.join(' '));

      let score = 0;
      if (name === label) score += 100;
      if (name.includes(label) || label.includes(name)) score += 80;
      if (role.includes(label) || label.includes(role)) score += 25;

      if (role.includes('build') || role.includes('code generation')) score += 45;
      if (name.includes('sonnet')) score += 35;
      if (name.includes('gpt 5 4') || name.includes('gpt 5')) score += 25;
      if (provider.includes('anthropic')) score += 18;
      if (provider.includes('openai')) score += 14;

      if (paths.includes('component') || paths.includes('page') || paths.includes('style') || paths.includes('ui')) {
        if (role.includes('design') || role.includes('spatial') || role.includes('ui')) score += 12;
        if (role.includes('build')) score += 18;
      }

      if (paths.includes('api') || paths.includes('lib') || paths.includes('hook') || paths.includes('server') || paths.includes('function')) {
        if (role.includes('reasoning') || role.includes('architecture') || role.includes('build')) score += 18;
      }

      if (agent.is_active) score += 8;
      score -= index * 2;
      return score;
    };

    const pickFallbackAgent = (lane: LaneRow, index: number) => {
      const available = agents.filter(a => !ids.has(a.id));
      const candidates = available.length > 0 ? available : agents;
      return candidates
        .map(agent => ({ agent, score: scoreAgentForLane(agent, lane, index) }))
        .sort((a, b) => b.score - a.score)[0]?.agent ?? null;
    };

    const builderLanes = lanes.filter(l => l.role === 'builder');
    for (const lane of builderLanes) {
      if (lane.agent_id) {
        ids.add(lane.agent_id);
        continue;
      }
      const laneName = norm(lane.agent_name);
      const match = agents.find(a => {
        const name = norm(a.name);
        const display = norm(a.display_name);
        const role = norm(a.role);
        return display === laneName
          || name === laneName
          || display.includes(laneName)
          || laneName.includes(display)
          || role.includes(laneName)
          || laneName.includes(role);
      });
      if (match) ids.add(match.id);
    }

    if (ids.size > 0) {
      return { ids: [...ids], warning: 'Some builder IDs were recovered from lane assignments.' };
    }

    builderLanes.forEach((lane, index) => {
      const fallback = pickFallbackAgent(lane, index);
      if (fallback) ids.add(fallback.id);
    });

    if (ids.size > 0) {
      return {
        ids: [...ids],
        warning: 'Builder lanes used generic labels, so Maestro assigned the strongest available build agents.',
      };
    }

    return {
      ids: [],
      warning: builderLanes.length === 0
        ? 'No builder lanes were found. Return to Pre-Build and regenerate Architect.md.'
        : 'Builder lanes exist but could not be matched to active agents.',
    };
  }, [lanes, agents]);

  const resolvedBuilderAgentIds = useMemo(
    () => resolveBuilderAgentIds(normalizedBuildPlan).ids,
    [resolveBuilderAgentIds, normalizedBuildPlan],
  );

  // Load lanes on mount
  useEffect(() => {
    if (!session || !isVisible) return;
    supabase
      .from('build_lanes')
      .select('id, agent_id, agent_name, lane_paths, role')
      .eq('session_id', session.id)
      .then(({ data }) => {
        if (data) {
          setLanes((data as LaneRow[]).map(lane => ({
            ...lane,
            lane_paths: safeStringArray(lane.lane_paths),
          })));
        }
      });
  }, [session, isVisible]);

  // Restore persisted build state before triggering a fresh concierge plan.
  useEffect(() => {
    if (!session || !isVisible || stageHydrated) return;

    const latestRun = state.executionRuns
      .filter(run => run.session_id === session.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

    if (latestRun?.status === 'complete' && latestRun.result) {
      preparingTriggered.current = true;
      setStageHydrated(true);
      setStage(session.current_phase === 'bouncer' ? 'bouncer' : 'complete');
      return;
    }

    const buildRound = [...sessionRounds].reverse().find(round => {
      const roundResponses = state.responses.filter(response => response.round_id === round.id);
      if (roundResponses.some(hasWriteManifest)) return true;
      if (resolvedBuilderAgentIds.length === 0) return false;
      return round.target_agents.some(agentId => resolvedBuilderAgentIds.includes(agentId));
    });

    if (buildRound) {
      const roundResponses = state.responses.filter(response => response.round_id === buildRound.id);
      setBuildRoundId(buildRound.id);
      if (roundResponses.length > 0) {
        setApprovedResponseIds(new Set(roundResponses.filter(hasExecutableManifest).map(response => response.id)));
        setStage('reviewing');
      } else {
        setStage('broadcasting');
      }
      preparingTriggered.current = true;
      setStageHydrated(true);
      return;
    }

    if (normalizedBuildPlan) {
      preparingTriggered.current = true;
      setStage('plan_review');
      setStageHydrated(true);
      return;
    }

    setStage('preparing');
    setStageHydrated(true);
  }, [session, isVisible, stageHydrated, state.executionRuns, state.responses, sessionRounds, normalizedBuildPlan, resolvedBuilderAgentIds]);

  // Sprint C · F2 — Auto-call concierge on build phase entry
  useEffect(() => {
    if (!session || !isVisible || !stageHydrated || stage !== 'preparing' || preparingTriggered.current) return;
    preparingTriggered.current = true;

    (async () => {
      try {
        const plan = await invokeEdgeFunction<BuildPlan>('concierge', { session_id: session.id, phase: 'pre_build_complete' });
        dispatch({ type: 'SET_BUILD_PLAN', payload: plan });
        setStage('plan_review');
      } catch (err) {
        console.warn('Concierge build plan error:', err);
        setError(err instanceof Error ? err.message : 'Concierge could not prepare a build plan.');
        setStage('plan_review');
      }
    })();
  }, [session, isVisible, stage, stageHydrated, dispatch]);
  // Approve build plan and start broadcasting
  const handleApprovePlan = useCallback(async () => {
    const buildPlan = normalizedBuildPlan;
    if (!session || !buildPlan) return;
    setStage('broadcasting');
    setError('');

    const resolved = resolveBuilderAgentIds(buildPlan);
    const builderAgentIds = resolved.ids;

    if (builderAgentIds.length === 0) {
      setError(resolved.warning || 'No builder agents in concierge plan.');
      setStage('plan_review');
      return;
    }

    if (!buildPlan.build_prompt) {
      setError('Concierge returned an incomplete build plan with no build prompt.');
      setStage('plan_review');
      return;
    }

    if (resolved.warning) {
      dispatch({ type: 'SHOW_TOAST', payload: resolved.warning });
    }

    try {
      await broadcast(buildPlan.build_prompt, builderAgentIds, session, {
        modeOverride: 'build',
        skipSynthesis: true,
        skipTriage: true,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('plan_review');
    }
  }, [session, normalizedBuildPlan, resolveBuilderAgentIds, dispatch, broadcast]);

  // Check for existing execution runs
  useEffect(() => {
    if (!session || !isVisible) return;
    const latestRun = state.executionRuns
      .filter(r => r.session_id === session.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

    if (latestRun?.status === 'complete' && latestRun.result) {
      const r = latestRun.result as Record<string, unknown>;
      setWrittenFiles((r.written_files as string[]) ?? []);
      setSkippedFiles((r.skipped_files as { path: string; reason: string }[]) ?? []);
      setPrUrls((r.prs as string[]) ?? []);
      setCollisionCount(((r.collisions as unknown[]) ?? []).length);
      setHandoffs((r.handoffs_requested as { from_agent: string; path: string }[]) ?? []);
      setBackupBranch((r.backup_branch as string) ?? '');
      setStage(session.current_phase === 'bouncer' ? 'bouncer' : 'complete');
    }
  }, [session, isVisible, state.executionRuns]);

  // Derive build responses: responses from the build broadcast round
  const buildResponses: Response[] = useMemo(() => (
    buildRoundId
      ? state.responses.filter(r =>
        r.round_id === buildRoundId
        && !!r.agent_id
        && (resolvedBuilderAgentIds.length === 0 || resolvedBuilderAgentIds.includes(r.agent_id))
      )
      : []
  ), [buildRoundId, state.responses, resolvedBuilderAgentIds]);

  const executableResponseCount = useMemo(
    () => buildResponses.filter(hasExecutableManifest).length,
    [buildResponses],
  );
  const blockedResponseCount = buildResponses.length - executableResponseCount;

  // When broadcasting, detect the new round created by broadcast()
  useEffect(() => {
    if (stage !== 'broadcasting' || buildRoundId) return;
    const sessionRounds = state.rounds.filter(r => r.session_id === session?.id);
    const lastRound = sessionRounds[sessionRounds.length - 1];
    if (lastRound) setBuildRoundId(lastRound.id);
  }, [stage, buildRoundId, state.rounds, session]);

  // When broadcasting, watch for responses to auto-transition to reviewing
  useEffect(() => {
    if (stage !== 'broadcasting' || !buildRoundId) return;
    const roundResponses = state.responses.filter(r =>
      r.round_id === buildRoundId
      && resolvedBuilderAgentIds.length > 0
      && !!r.agent_id
      && resolvedBuilderAgentIds.includes(r.agent_id)
    );
    const builderCount = lanes.filter(l => l.role === 'builder').length || 1;
    if (roundResponses.length >= builderCount) {
      setApprovedResponseIds(new Set(roundResponses.filter(hasExecutableManifest).map(r => r.id)));
      setStage('reviewing');
    }
  }, [stage, buildRoundId, state.responses, lanes, resolvedBuilderAgentIds]);

  const toggleResponseApproval = useCallback((responseId: string) => {
    setApprovedResponseIds(prev => {
      const next = new Set(prev);
      if (next.has(responseId)) next.delete(responseId);
      else next.add(responseId);
      return next;
    });
  }, []);

  /* ── Execute build ───────────────────────────────────────── */
  const handleExecute = useCallback(async () => {
    if (!session || !user) return;
    setStage('executing');
    setError('');

    try {
      if (!state.activeRepoConnection?.id) {
        throw new Error('No active GitHub repo is connected. Pick or create a repo before executing the build.');
      }

      // Create execution run
      const { data: runData, error: runErr } = await supabase
        .from('execution_runs')
        .insert({
          session_id: session.id,
          user_id: user.id,
          execution_mode: state.executionMode,
          strategy: state.executionStrategy,
          status: 'approved',
          requires_approval: state.executionMode === 'elevated',
          patch_content: '',
          branch_name: '',
          pr_url: '',
          result: {},
        } as never)
        .select()
        .single();

      if (runErr || !runData) throw new Error(runErr?.message ?? 'Failed to create run');

      const run = runData as Record<string, unknown>;
      dispatch({ type: 'ADD_EXECUTION_RUN', payload: run as never });

      // Assemble patches from approved build broadcast responses. github-execute
      // requires a non-empty patches[] — without this it (correctly) 400s with
      // NO_PATCHES because nothing else in the pipeline forwards them.
      const approved = buildResponses.filter(r =>
        approvedResponseIds.has(r.id)
        && !!r.agent_id
        && (resolvedBuilderAgentIds.length === 0 || resolvedBuilderAgentIds.includes(r.agent_id))
      );
      if (approved.length === 0) {
        throw new Error('Select at least one builder response before executing.');
      }
      if (!approved.some(hasExecutableManifest)) {
        throw new Error('No selected builder response included a file_manifest. Re-run Build; agents must return complete file contents before GitHub can be written.');
      }
      const patches = approved.filter(hasExecutableManifest).map(r => {
        // Match by agent_id first (reliable), fall back to name match
        const lane = lanes.find(l => l.agent_id === r.agent_id)
          || lanes.find(l => l.agent_name === r.agent_name)
          || lanes.find(l => l.agent_name.toLowerCase().includes((r.agent_name ?? '').toLowerCase()));
        return {
          agent_name: lane?.agent_name ?? r.agent_name,
          agent_id: r.agent_id,
          content: r.content,
          scoped_paths: lane?.lane_paths ?? [],
          commit_message: `${lane?.agent_name ?? r.agent_name}: build patch`,
          conductor_approved: false,
          file_manifest: r.file_manifest ?? [],
        };
      });      const data = await invokeEdgeFunction<{
        success?: boolean;
        result?: Record<string, unknown>;
        error?: string;
        message?: string;
      }>('github-execute', {
        mode: state.executionStrategy,
        repo_connection_id: state.activeRepoConnection.id,
        execution_run_id: run.id,
        session_id: session.id,
        execution_mode: state.executionMode,
        patches,
      });

      const result = (data.result ?? data) as Record<string, unknown> & {
        status?: string;
        blocked?: Array<{ agent?: string; reason?: string }>;
        errors?: string[];
        skipped_files?: Array<{ path?: string; reason?: string }>;
        written_files?: string[];
        prs?: string[];
        collisions?: unknown[];
        handoffs_requested?: Array<{ from_agent: string; path: string }>;
        backup_branch?: string;
      };
      if (data.success === false || result.status === 'failed') {
        const details = [
          ...(Array.isArray(result.blocked) ? result.blocked.map((b: { agent?: string; reason?: string }) => `${b.agent ?? 'agent'}: ${b.reason ?? 'blocked'}`) : []),
          ...(Array.isArray(result.errors) ? result.errors : []),
          ...(Array.isArray(result.skipped_files) ? result.skipped_files.map((s: { path?: string; reason?: string }) => `${s.path ?? 'file'}: ${s.reason ?? 'skipped'}`) : []),
        ].filter(Boolean);
        throw new Error(details.length > 0 ? `GitHub execution produced no writes: ${details.slice(0, 3).join('; ')}` : 'GitHub execution produced no writes.');
      }

      setWrittenFiles((result.written_files as string[]) ?? []);
      setSkippedFiles((result.skipped_files as { path: string; reason: string }[]) ?? []);
      setPrUrls((result.prs as string[]) ?? []);
      setCollisionCount(((result.collisions as unknown[]) ?? []).length);
      setHandoffs((result.handoffs_requested as { from_agent: string; path: string }[]) ?? []);
      setBackupBranch((result.backup_branch as string) ?? '');
      setStage('complete');

      dispatch({
        type: 'UPDATE_EXECUTION_RUN',
        payload: { id: run.id as string, status: 'complete', result },
      });

      dispatch({ type: 'SHOW_TOAST', payload: `Build complete — ${(result.written_files as string[])?.length ?? 0} files written` });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('ready');
    }
  }, [session, user, state.executionMode, state.executionStrategy, state.activeRepoConnection, dispatch, buildResponses, approvedResponseIds, resolvedBuilderAgentIds, lanes]);

  /* ── Trigger bouncer ─────────────────────────────────────── */
  const handleBouncer = useCallback(async () => {
    if (!session) return;
    setBouncerLoading(true);
    setBouncerError('');
    setBouncerResult(null);

    // Advance session phase to bouncer
    await supabase
      .from('sessions')
      .update({ current_phase: 'bouncer' } as never)
      .eq('id', session.id);
    dispatch({ type: 'UPDATE_ACTIVE_SESSION', payload: { current_phase: 'bouncer' } });

    try {
      const data = await invokeEdgeFunction<BouncerResult & { error?: string; message?: string }>('bouncer', {
        session_id: session.id,
        trigger: 'end_of_build',
        files: writtenFiles,
      });

      if (data.error === 'ANTHROPIC_KEY_MISSING') throw new Error('Add an Anthropic API key in the Vault to run bouncer review.');

      setBouncerResult(data as BouncerResult);
      setStage('bouncer');
    } catch (err) {
      setBouncerError(err instanceof Error ? err.message : String(err));
    } finally {
      setBouncerLoading(false);
    }
  }, [session, writtenFiles, dispatch]);

  /* ── Conductor decisions ─────────────────────────────────── */
  const handleConductorDecision = useCallback(async (decision: string) => {
    if (!session || !bouncerResult) return;

    // Record decision in bouncer_events
    const { data: events } = await supabase
      .from('bouncer_events')
      .select('id')
      .eq('session_id', session.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (events?.[0]) {
      const eventId = (events[0] as { id: string }).id;
      await supabase
        .from('bouncer_events')
        .update({ conductor_decision: decision } as never)
        .eq('id', eventId);
    }

    if (decision === 'pause') {
      dispatch({ type: 'SHOW_TOAST', payload: 'Build paused — fix critical findings first' });
      return;
    }

    if (decision === 'abort') {
      await supabase
        .from('sessions')
        .update({ current_phase: 'pre_build' } as never)
        .eq('id', session.id);
      dispatch({ type: 'UPDATE_ACTIVE_SESSION', payload: { current_phase: 'pre_build' } });
      dispatch({ type: 'SHOW_TOAST', payload: 'Build aborted — returning to Pre-Build' });
      return;
    }

    // approve_continue or acknowledge
    await supabase
      .from('sessions')
      .update({ current_phase: 'complete' } as never)
      .eq('id', session.id);
    dispatch({ type: 'UPDATE_ACTIVE_SESSION', payload: { current_phase: 'complete' } });
    setStage('done');
    dispatch({ type: 'SHOW_TOAST', payload: 'Build approved — session complete ✓' });
  }, [session, bouncerResult, dispatch]);

  /* ── Render gate ─────────────────────────────────────────── */
  if (!isVisible || !session) return null;

  const builders = lanes.filter(l => l.role === 'builder');
  const reviewers = lanes.filter(l => l.role !== 'builder');
  const hasCritical = bouncerResult?.findings.some(f => f.severity === 'critical_pause') ?? false;

  return (
    <div className="fixed inset-0 z-40 flex flex-col" style={{ background: 'rgba(8,8,6,0.92)', backdropFilter: 'blur(8px)' }}>
      {/* ── Phase rail ─────────────────────────────────────── */}
      <PhaseRail currentPhase={session.current_phase ?? 'build'} />

      {/* ── Main content ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '0 32px 32px' }}>
        <div style={{ maxWidth: '880px', margin: '0 auto' }}>

          {/* Header */}
          <div className="flex items-center justify-between" style={{ marginBottom: '28px' }}>
            <div className="flex items-center gap-3">
              <Hammer size={18} style={{ color: 'var(--gold)' }} />
              <span className="font-mono-dm" style={{ fontSize: '13px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold)' }}>
                {stage === 'preparing' ? 'Build — Preparing Plan'
                  : stage === 'plan_review' ? 'Build — Review Plan'
                  : stage === 'broadcast' ? 'Build — Broadcast to Agents'
                  : stage === 'broadcasting' ? 'Build — Agents Working'
                  : stage === 'reviewing' ? 'Build — Review Responses'
                  : stage === 'bouncer' ? 'Bouncer Review'
                  : stage === 'done' ? 'Build Complete'
                  : 'Build in Progress'}
              </span>
            </div>
            {stage === 'plan_review' && normalizedBuildPlan && (
              <button
                className="reveal-pill"
                style={{
                  height: '36px', fontSize: '12px', padding: '0 20px',
                  background: 'var(--gold)', color: 'var(--void)',
                  borderColor: 'transparent', fontWeight: 500,
                }}
                onClick={handleApprovePlan}
              >
                <Play size={14} />
                Approve &amp; Build
              </button>
            )}
            {stage === 'reviewing' && buildResponses.length > 0 && (
              <button
                className="reveal-pill"
                style={{
                  height: '36px', fontSize: '12px', padding: '0 20px',
                  background: approvedResponseIds.size > 0 ? 'var(--gold)' : 'rgba(255,255,255,0.06)',
                  color: approvedResponseIds.size > 0 ? 'var(--void)' : 'var(--text-dim)',
                  borderColor: 'transparent', fontWeight: 500,
                  cursor: approvedResponseIds.size > 0 ? 'pointer' : 'not-allowed',
                }}
                disabled={approvedResponseIds.size === 0}
                onClick={() => setStage('ready')}
              >
                <Play size={14} />
                Approve &amp; Continue ({approvedResponseIds.size})
              </button>
            )}
            {stage === 'ready' && (
              <button
                className="reveal-pill"
                style={{
                  height: '36px', fontSize: '12px', padding: '0 20px',
                  background: 'var(--gold)', color: 'var(--void)',
                  borderColor: 'transparent', fontWeight: 500,
                }}
                onClick={handleExecute}
              >
                <Play size={14} />
                Execute Build
              </button>
            )}
          </div>

          {/* Error banner */}
          {error && (
            <div className="flex items-center gap-2" style={{
              padding: '12px 16px', marginBottom: '20px', borderRadius: '12px',
              background: 'rgba(224,90,90,0.06)', border: '1px solid rgba(224,90,90,0.15)',
            }}>
              <AlertTriangle size={14} style={{ color: 'var(--risk)' }} />
              <span style={{ fontSize: '13px', color: 'var(--risk)' }}>{error}</span>
            </div>
          )}

          {/* ── Preparing: concierge loading ─────────────────── */}
          {stage === 'preparing' && (
            <section style={{ textAlign: 'center', padding: '60px 0' }}>
              <Loader2 size={28} className="animate-spin" style={{ color: 'var(--gold)', margin: '0 auto 16px' }} />
              <p className="font-mono-dm" style={{ fontSize: '12px', color: 'var(--gold)', letterSpacing: '0.15em', marginBottom: '8px' }}>
                {PREPARING_MESSAGES[broadcastMsgIdx]}
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Concierge is analyzing the architecture and preparing builder assignments.
              </p>
            </section>
          )}

          {/* ── Plan Review: concierge build plan ────────────── */}
          {stage === 'plan_review' && normalizedBuildPlan && (
            <section style={{ marginBottom: '28px' }}>
              {/* Summary card */}
              <div style={{
                padding: '20px 24px', marginBottom: '20px', borderRadius: '16px',
                background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.12)',
              }}>
                <div className="font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '12px' }}>
                  Build Plan Summary
                </div>
                <p style={{ fontSize: '14px', color: 'var(--text-primary)', lineHeight: 1.6, margin: 0 }}>
                  {normalizedBuildPlan.build_summary}
                </p>
              </div>

              {/* Builder assignments */}
              <div className="font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '12px' }}>
                Builder Assignments
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                {normalizedBuildPlan.builder_agents.length > 0 ? normalizedBuildPlan.builder_agents.map((agent, i) => (
                  <div key={i} style={{
                    padding: '14px 18px', borderRadius: '12px',
                    background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    <div className="flex items-center gap-2" style={{ marginBottom: '6px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-primary)' }}>{agent.agent_name}</span>
                      <span style={{
                        fontSize: '10px', padding: '2px 8px', borderRadius: '6px',
                        background: 'rgba(90,184,142,0.08)', color: '#5ab88e', fontWeight: 500,
                      }}>Builder</span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                      {agent.instruction}
                    </div>
                    <div className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                      {agent.scoped_paths.length > 0 ? agent.scoped_paths.join(' · ') : '(paths unavailable)'}
                    </div>
                  </div>
                )) : (
                  <div style={{
                    padding: '14px 18px', borderRadius: '12px',
                    background: 'rgba(224,90,90,0.04)', border: '1px solid rgba(224,90,90,0.12)',
                    color: 'var(--risk)', fontSize: '12px',
                  }}>
                    Concierge returned no builder assignments. Return to Pre-Build and regenerate Architect.md.
                  </div>
                )}
              </div>

              {/* Build prompt preview */}
              <details style={{ marginBottom: '16px' }}>
                <summary className="font-mono-dm" style={{
                  fontSize: '10px', letterSpacing: '0.15em', textTransform: 'uppercase',
                  color: 'var(--text-dim)', cursor: 'pointer', marginBottom: '8px',
                }}>
                  Build Prompt Preview
                </summary>
                <pre style={{
                  fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '200px',
                  overflow: 'auto', fontFamily: 'var(--font-mono)',
                  padding: '12px', borderRadius: '8px',
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.04)',
                }}>
                  {normalizedBuildPlan.build_prompt.slice(0, 1500)}{normalizedBuildPlan.build_prompt.length > 1500 ? '\n…' : ''}
                </pre>
              </details>

            </section>
          )}

          {/* ── Broadcast: pre-build overview ───────────────── */}
          {stage === 'broadcast' && (
            <section style={{ marginBottom: '28px' }}>
              {session.architect_md && (
                <div style={{
                  padding: '16px 20px', marginBottom: '16px', borderRadius: '12px',
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div className="font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '8px' }}>
                    Architect.md Context
                  </div>
                  <pre style={{
                    fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.6,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: '200px',
                    overflow: 'auto', fontFamily: 'var(--font-mono)',
                  }}>
                    {session.architect_md.slice(0, 1200)}{session.architect_md.length > 1200 ? '\n…' : ''}
                  </pre>
                </div>
              )}
              <div style={{
                padding: '20px', borderRadius: '12px',
                background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.12)',
              }}>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Builder agents will generate code based on <strong style={{ color: 'var(--gold)' }}>Architect.md</strong> and their lane assignments.
                  After they respond, you'll review their output before executing.
                </p>
                {lanes.filter(l => l.role === 'builder').length === 0 && (
                  <p style={{ fontSize: '12px', color: 'var(--risk)', marginTop: '10px' }}>
                    No builder lanes assigned — go back to Pre-Build to set up lanes.
                  </p>
                )}
              </div>
            </section>
          )}

          {/* ── Broadcasting: agents working ────────────────── */}
          {stage === 'broadcasting' && (
            <div className="flex flex-col items-center" style={{ padding: '48px 0' }}>
              <Loader2 size={32} className="animate-spin" style={{ color: 'var(--gold)', marginBottom: '16px' }} />
              <span className="font-mono-dm" style={{ fontSize: '12px', letterSpacing: '0.12em', color: 'var(--gold)', marginBottom: '8px' }}>
                {BUILD_BROADCAST_MESSAGES[broadcastMsgIdx]}
              </span>
              <span className="font-mono-dm" style={{ fontSize: '10px', letterSpacing: '0.08em', color: 'var(--text-dim)' }}>
                {buildResponses.length} / {lanes.filter(l => l.role === 'builder').length} agents responded
              </span>
            </div>
          )}

          {/* ── Reviewing: agent responses ───────────────────── */}
          {stage === 'reviewing' && buildResponses.length > 0 && (
            <section style={{ marginBottom: '28px' }}>
              <div className="font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '12px' }}>
                Builder Responses — select which to include in execution
              </div>
              {(blockedResponseCount > 0 || executableResponseCount === 0) && (
                <div style={{
                  marginBottom: '12px',
                  padding: '10px 12px',
                  borderRadius: '10px',
                  border: '1px solid rgba(224,90,90,0.18)',
                  background: 'rgba(224,90,90,0.05)',
                  color: 'var(--text-dim)',
                  fontSize: '11px',
                  lineHeight: 1.5,
                }}>
                  {executableResponseCount === 0
                    ? 'No executable builder responses are ready yet. Maestro can show blocked drafts here, but execution stays disabled until at least one response includes a complete manifest.'
                    : (blockedResponseCount + ' response' + (blockedResponseCount === 1 ? '' : 's') + ' are visible for review but blocked from execution until they include a complete manifest.')}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {buildResponses.map(resp => {
                  const approved = approvedResponseIds.has(resp.id);
                  const executable = hasExecutableManifest(resp);
                  const manifestIssue = resp.signals?.manifest_errors
                    || (resp.signals?.build_complete === 'false' ? 'Response marked incomplete; re-broadcast or continue before execution.' : '');
                  return (
                    <div
                      key={resp.id}
                      onClick={() => executable && toggleResponseApproval(resp.id)}
                      style={{
                        padding: '16px 20px', borderRadius: '12px', cursor: executable ? 'pointer' : 'not-allowed',
                        background: approved ? 'rgba(90,184,142,0.04)' : 'rgba(255,255,255,0.02)',
                        border: `1px solid ${manifestIssue ? 'rgba(224,90,90,0.22)' : approved ? 'rgba(90,184,142,0.25)' : 'rgba(255,255,255,0.06)'}`,
                        opacity: executable ? 1 : 0.78,
                        transition: 'all 0.2s',
                      }}
                    >
                      <div className="flex items-center justify-between" style={{ marginBottom: '10px' }}>
                        <div className="flex items-center gap-2">
                          <div style={{
                            width: '20px', height: '20px', borderRadius: '6px',
                            background: approved ? 'var(--ok)' : 'rgba(255,255,255,0.06)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'background 0.2s',
                          }}>
                            {approved && <CheckCircle2 size={12} style={{ color: 'var(--void)' }} />}
                          </div>
                          <span className="font-mono-dm" style={{
                            fontSize: '12px', letterSpacing: '0.1em',
                            color: resp.agent_color || 'var(--text-secondary)',
                            fontWeight: 500,
                          }}>
                            {resp.agent_name}
                          </span>
                          <span className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--text-dim)' }}>
                            {resp.model}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {resp.file_manifest && resp.file_manifest.length > 0 && (
                            <span className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--text-dim)' }}>
                              {resp.file_manifest.length} files
                            </span>
                          )}
                          {manifestIssue && (
                            <span className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--risk)' }}>
                              {executable ? 'warning' : 'blocked'}
                            </span>
                          )}
                          <span className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--text-dim)' }}>
                            {resp.tokens_used.toLocaleString()} tok
                          </span>
                        </div>
                      </div>
                      {manifestIssue && (
                        <div style={{
                          marginBottom: '10px', padding: '8px 10px', borderRadius: '8px',
                          background: 'rgba(224,90,90,0.06)', color: 'var(--risk)',
                          fontSize: '11px', lineHeight: 1.5,
                        }}>
                          {manifestIssue}
                          {resp.signals?.continuation_prompt && (
                            <span style={{ color: 'var(--text-muted)' }}> Continue with: {resp.signals.continuation_prompt}</span>
                          )}
                        </div>
                      )}
                      <pre style={{
                        fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5,
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                        maxHeight: '120px', overflow: 'hidden',
                        fontFamily: 'var(--font-mono)',
                      }}>
                        {resp.content.slice(0, 500)}{resp.content.length > 500 ? '…' : ''}
                      </pre>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Lane assignments ────────────────────────────── */}
          <section style={{ marginBottom: '28px' }}>
            <div className="font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '12px' }}>
              Lane Assignments
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {builders.map(lane => (
                <LaneBar key={lane.id} lane={lane} stage={stage} writtenFiles={writtenFiles} />
              ))}
              {reviewers.map(lane => (
                <LaneBar key={lane.id} lane={lane} stage={stage} writtenFiles={writtenFiles} />
              ))}
              {lanes.length === 0 && (
                <p style={{ fontSize: '12px', color: 'var(--text-dim)', fontStyle: 'italic' }}>No lanes assigned</p>
              )}
            </div>
          </section>

          {/* ── Executing indicator ────────────────────────── */}
          {stage === 'executing' && (
            <div className="flex flex-col items-center" style={{ padding: '48px 0' }}>
              <Loader2 size={32} className="animate-spin" style={{ color: 'var(--gold)', marginBottom: '16px' }} />
              <span className="font-mono-dm" style={{ fontSize: '11px', letterSpacing: '0.15em', color: 'var(--text-dim)' }}>
                Writing files to GitHub…
              </span>
            </div>
          )}

          {/* ── Build results ──────────────────────────────── */}
          {(stage === 'complete' || stage === 'bouncer' || stage === 'done') && (
            <section style={{ marginBottom: '28px' }}>
              <div className="font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '12px' }}>
                Build Results
              </div>

              {/* Stats row */}
              <div className="flex flex-wrap gap-4" style={{ marginBottom: '16px' }}>
                <StatChip label="Files written" value={writtenFiles.length} color="var(--ok)" />
                <StatChip label="Skipped" value={skippedFiles.length} color="var(--gold)" />
                <StatChip label="Collisions" value={collisionCount} color={collisionCount > 0 ? 'var(--risk)' : 'var(--text-dim)'} />
                <StatChip label="Handoffs" value={handoffs.length} color={handoffs.length > 0 ? 'var(--gold)' : 'var(--text-dim)'} />
              </div>

              {/* PR links */}
              {prUrls.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div className="font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '8px' }}>
                    Pull Requests
                  </div>
                  {prUrls.map((url, i) => (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2"
                      style={{
                        fontSize: '12px', color: 'var(--gold)', textDecoration: 'none',
                        padding: '6px 12px', borderRadius: '8px',
                        background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.12)',
                        marginBottom: '6px', display: 'inline-flex',
                      }}
                    >
                      <GitBranch size={12} />
                      {url.split('/').slice(-2).join(' #')}
                      <ExternalLink size={10} />
                    </a>
                  ))}
                </div>
              )}

              {/* Backup branch */}
              {backupBranch && (
                <div className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '16px' }}>
                  Backup: <span style={{ color: 'var(--text-muted)' }}>{backupBranch}</span>
                </div>
              )}

              {/* Handoffs */}
              {handoffs.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div className="font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--gold)', marginBottom: '8px' }}>
                    Handoffs Pending
                  </div>
                  {handoffs.map((h, i) => (
                    <div key={i} className="flex items-center gap-2" style={{
                      fontSize: '11px', color: 'var(--text-muted)',
                      padding: '6px 12px', borderRadius: '8px',
                      background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.08)',
                      marginBottom: '4px',
                    }}>
                      <span style={{ color: 'var(--text)' }}>{h.from_agent}</span>
                      <span style={{ opacity: 0.4 }}>→</span>
                      <span>{h.path}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Bouncer trigger */}
              {stage === 'complete' && (
                <button
                  className="reveal-pill"
                  style={{
                    height: '36px', fontSize: '12px', padding: '0 20px',
                    background: bouncerLoading ? 'transparent' : 'rgba(224,123,90,0.12)',
                    borderColor: 'rgba(224,123,90,0.25)',
                    color: 'var(--text)',
                  }}
                  onClick={handleBouncer}
                  disabled={bouncerLoading}
                >
                  {bouncerLoading ? <Loader2 size={14} className="animate-spin" /> : <Shield size={14} />}
                  {bouncerLoading ? 'Reviewing…' : 'Run Bouncer Review'}
                </button>
              )}

              {bouncerError && (
                <div className="flex items-center gap-2" style={{ marginTop: '8px' }}>
                  <AlertTriangle size={12} style={{ color: 'var(--risk)' }} />
                  <span style={{ fontSize: '11px', color: 'var(--risk)' }}>{bouncerError}</span>
                </div>
              )}
            </section>
          )}

          {/* ── Bouncer findings ───────────────────────────── */}
          {bouncerResult && (stage === 'bouncer' || stage === 'done') && (
            <section style={{ marginBottom: '28px' }}>
              <button
                className="flex items-center gap-2 w-full"
                style={{ background: 'none', border: 'none', cursor: 'pointer', marginBottom: '12px', padding: 0 }}
                onClick={() => setFindingsExpanded(!findingsExpanded)}
              >
                <Shield size={14} style={{ color: hasCritical ? 'var(--risk)' : 'var(--gold)' }} />
                <span className="font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: hasCritical ? 'var(--risk)' : 'var(--gold)' }}>
                  Bouncer Findings
                </span>
                <span className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--text-dim)', marginLeft: '8px' }}>
                  {bouncerResult.findings.length} finding{bouncerResult.findings.length !== 1 ? 's' : ''}
                </span>
                {findingsExpanded ? <ChevronUp size={12} style={{ color: 'var(--text-dim)', marginLeft: 'auto' }} /> : <ChevronDown size={12} style={{ color: 'var(--text-dim)', marginLeft: 'auto' }} />}
              </button>

              {findingsExpanded && (
                <>
                  {/* Summary */}
                  <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'rgba(232,230,224,0.8)', marginBottom: '16px', fontWeight: 300 }}>
                    {bouncerResult.summary}
                  </p>

                  {/* Finding cards */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                    {bouncerResult.findings.map((f, i) => {
                      const sev = SEVERITY_STYLE[f.severity] ?? SEVERITY_STYLE.minor;
                      return (
                        <div key={i} style={{
                          borderRadius: '12px', padding: '12px 16px',
                          border: `1px solid ${sev.color}25`,
                          background: sev.bg,
                        }}>
                          <div className="flex items-center gap-2" style={{ marginBottom: '6px' }}>
                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: sev.color }} />
                            <span className="font-mono-dm" style={{ fontSize: '10px', letterSpacing: '0.08em', color: sev.color }}>
                              {sev.label}
                            </span>
                            <span className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-muted)', marginLeft: 'auto' }}>
                              {f.file}
                            </span>
                          </div>
                          <p style={{ fontSize: '12px', color: 'var(--text)', lineHeight: 1.5, margin: '0 0 4px' }}>
                            {f.issue}
                          </p>
                          <p style={{ fontSize: '11px', color: 'var(--text-dim)', lineHeight: 1.5, margin: 0, fontStyle: 'italic' }}>
                            → {f.suggestion}
                          </p>
                        </div>
                      );
                    })}
                  </div>

                  {/* Conductor actions */}
                  {stage === 'bouncer' && (
                    <div className="flex items-center gap-3">
                      {!hasCritical && (
                        <button
                          className="reveal-pill"
                          style={{
                            height: '36px', fontSize: '12px', padding: '0 18px',
                            background: 'var(--ok)', color: 'var(--void)',
                            borderColor: 'transparent', fontWeight: 500,
                          }}
                          onClick={() => handleConductorDecision('approve_continue')}
                        >
                          <CheckCircle2 size={14} />
                          Approve & continue
                        </button>
                      )}
                      <button
                        className="reveal-pill"
                        style={{ height: '36px', fontSize: '12px', padding: '0 16px' }}
                        onClick={() => handleConductorDecision('acknowledge')}
                      >
                        <ThumbsUp size={12} />
                        Acknowledge minor
                      </button>
                      {hasCritical && (
                        <button
                          className="reveal-pill"
                          style={{
                            height: '36px', fontSize: '12px', padding: '0 16px',
                            borderColor: 'rgba(224,90,90,0.3)',
                          }}
                          onClick={() => handleConductorDecision('pause')}
                        >
                          <Pause size={12} />
                          Pause — fix critical
                        </button>
                      )}
                      <button
                        className="reveal-pill"
                        style={{ height: '36px', fontSize: '12px', padding: '0 16px', opacity: 0.7 }}
                        onClick={() => handleConductorDecision('abort')}
                      >
                        <XCircle size={12} />
                        Abort
                      </button>
                    </div>
                  )}
                </>
              )}

              {bouncerResult.model_used && (
                <span className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--text-dim)', letterSpacing: '0.08em', display: 'block', marginTop: '8px' }}>
                  reviewed via {bouncerResult.model_used}
                </span>
              )}
            </section>
          )}

          {/* ── Done state ─────────────────────────────────── */}
          {stage === 'done' && (
            <div style={{
              padding: '24px', borderRadius: '16px', textAlign: 'center',
              border: '1px solid rgba(78,187,127,0.2)',
              background: 'rgba(78,187,127,0.04)',
            }}>
              <CheckCircle2 size={28} style={{ color: 'var(--ok)', margin: '0 auto 12px', display: 'block' }} />
              <span className="font-mono-dm" style={{ fontSize: '11px', letterSpacing: '0.15em', color: 'var(--ok)' }}>
                Build Complete & Approved
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Phase rail sub-component ──────────────────────────────── */

function PhaseRail({ currentPhase }: { currentPhase: SessionPhase }) {
  const phaseIdx = PHASES.findIndex(p => p.key === currentPhase);

  return (
    <div className="flex items-center justify-center gap-1" style={{ padding: '16px 32px 12px' }}>
      {PHASES.map((p, i) => {
        const isComplete = i < phaseIdx;
        const isCurrent = i === phaseIdx;
        return (
          <div key={p.key} className="flex items-center gap-1">
            {i > 0 && (
              <div style={{
                width: '20px', height: '1px',
                background: isComplete ? 'var(--ok)' : 'rgba(255,255,255,0.08)',
              }} />
            )}
            <span className="font-mono-dm" style={{
              fontSize: '9px', letterSpacing: '0.1em',
              padding: '3px 8px', borderRadius: '6px',
              color: isCurrent ? 'var(--gold)' : isComplete ? 'var(--ok)' : 'var(--text-dim)',
              background: isCurrent ? 'rgba(201,168,76,0.1)' : 'transparent',
              border: isCurrent ? '1px solid rgba(201,168,76,0.2)' : '1px solid transparent',
              fontWeight: isCurrent ? 500 : 400,
            }}>
              {isComplete ? '✓ ' : ''}{p.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ── Lane progress bar sub-component ───────────────────────── */

function LaneBar({ lane, stage, writtenFiles }: { lane: LaneRow; stage: BuildStage; writtenFiles: string[] }) {
  const badge = ROLE_BADGE[lane.role];
  const isBuilder = lane.role === 'builder';

  // Calculate progress for builders
  const laneFiles = isBuilder
    ? writtenFiles.filter(f => lane.lane_paths.some(p => f.startsWith(p.replace(/\*+$/, ''))))
    : [];
  const hasProgress = stage !== 'ready' && isBuilder;
  const isDone = stage === 'complete' || stage === 'bouncer' || stage === 'done';
  const isWaiting = stage === 'executing' && !isBuilder;

  return (
    <div className="flex items-center gap-3" style={{
      padding: '10px 14px', borderRadius: '10px',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
    }}>
      {/* Agent name */}
      <span className="font-mono-dm" style={{ fontSize: '11px', color: 'var(--text)', minWidth: '140px' }}>
        {lane.agent_name}
      </span>

      {/* Paths */}
      <span className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', flex: 1 }}>
        {isBuilder ? lane.lane_paths.join(', ') : '(reads all)'}
      </span>

      {/* Progress / status */}
      {hasProgress && (
        <div style={{ width: '80px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <div style={{
            width: isDone ? '100%' : '60%',
            height: '100%', borderRadius: '2px',
            background: isDone ? 'var(--ok)' : badge.color,
            transition: 'width 0.5s ease',
          }} />
        </div>
      )}

      {/* Status label */}
      <span className="font-mono-dm" style={{
        fontSize: '9px', letterSpacing: '0.1em',
        color: isDone && isBuilder ? 'var(--ok)'
          : stage === 'executing' ? badge.color
          : 'var(--text-dim)',
        minWidth: '60px', textAlign: 'right',
      }}>
        {isDone && isBuilder ? `${laneFiles.length} files`
          : stage === 'executing' && isBuilder ? 'Writing…'
          : isWaiting ? 'Waiting'
          : stage === 'ready' ? badge.label
          : isDone ? badge.label
          : ''}
      </span>
    </div>
  );
}

/* ── Stat chip sub-component ───────────────────────────────── */

function StatChip({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-2" style={{
      padding: '8px 14px', borderRadius: '10px',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
    }}>
      <span className="font-mono-dm" style={{ fontSize: '18px', fontWeight: 600, color }}>{value}</span>
      <span className="font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.1em', color: 'var(--text-dim)', textTransform: 'uppercase' }}>{label}</span>
    </div>
  );
}













