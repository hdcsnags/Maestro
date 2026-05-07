import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { useAuth } from '../../context/AuthContext';
import { useOrchestration } from '../../hooks/useOrchestration';
import { useBuildExecution } from '../../hooks/useBuildExecution';
import { useBouncerReview } from '../../hooks/useBouncerReview';
import { invokeEdgeFunction } from '../../lib/functions';
import { supabase } from '../../lib/supabase';
import { checkBuildCompleteness, type CompletenessResult } from '../../lib/buildCompleteness';
import type { BuildLaneRole, BuildPlan, SessionPhase, Response } from '../../types';
import {
  Hammer, Play, CheckCircle2, AlertTriangle,
  ExternalLink, Loader2, ChevronDown, ChevronUp,
  Pause, GitBranch, RotateCcw,
  FileCode, SkipForward, ClipboardCheck, Zap,
} from 'lucide-react';
import BouncerCard from './BouncerCard';

/* ── Types ─────────────────────────────────────────────────── */

interface LaneRow {
  id: string;
  agent_id: string | null;
  agent_name: string;
  lane_paths: string[];
  role: BuildLaneRole;
}

type BuildStage = 'preparing' | 'plan_review' | 'broadcast' | 'broadcasting' | 'reviewing' | 'ready' | 'executing' | 'complete' | 'bouncer' | 'done' | 'task_decomposing' | 'task_building' | 'session_building';
type BroadcastProgressState = 'dispatching' | 'waiting' | 'partial' | 'ready';

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

function buildLanePrompt(sharedPrompt: string, instruction: string, scopedPaths: string[]): string {
  const laneScope = scopedPaths.length > 0 ? scopedPaths.join(', ') : 'your assigned lane paths';
  return `${sharedPrompt}\n\nLANE-SPECIFIC INSTRUCTION:\n${instruction}\n\nASSIGNED PATHS:\n${laneScope}\n\nFollow only this lane. Do not modify files outside these assigned paths.`;
}

/** Returns true when a lane covers multiple deep directory trees (2+ "/**" patterns),
 *  which means the agent is likely to exceed its output token budget in one pass. */
function laneHasDeepPaths(scoped_paths: string[]): boolean {
  const deepPatterns = scoped_paths.filter(p => p.includes('/**'));
  return deepPatterns.length >= 2 || (deepPatterns.length === 1 && scoped_paths.length >= 2);
}

function getBroadcastProgressState(hasRound: boolean, respondedCount: number, builderCount: number): BroadcastProgressState {
  if (!hasRound) return 'dispatching';
  if (builderCount <= 0 || respondedCount <= 0) return 'waiting';
  if (respondedCount < builderCount) return 'partial';
  return 'ready';
}

function laneMatchesResponse(lane: LaneRow, response: Response): boolean {
  if (lane.agent_id && response.agent_id === lane.agent_id) return true;
  const laneName = norm(lane.agent_name);
  const responseName = norm(response.agent_name ?? '');
  return laneName.length > 0 && responseName.length > 0 && (laneName === responseName || laneName.includes(responseName) || responseName.includes(laneName));
}

/* ── Component ─────────────────────────────────────────────── */

export default function BuildWorkspace() {
  const { state, dispatch } = useMaestro();
  const { user } = useAuth();
  const { broadcast } = useOrchestration();
  const buildExec = useBuildExecution();
  const session = state.activeSession;
  const agents = state.agents;

  // Session build state (Phase 4)
  const [selectedSessionAdapter, setSelectedSessionAdapter] = useState<string>('copilot_cli');
  const [sessionScope, setSessionScope] = useState('**');
  const [showSessionConfig, setShowSessionConfig] = useState(false);

  // Claw agents available for mid-build adapter swap
  const clawAgents = useMemo(() =>
    agents.filter(a => a.provider_group === 'maestroclaw'),
  [agents]);

  // Swap active adapter for all failed tasks and immediately resume the build loop
  const handleSwapAndRetry = useCallback(async (adapter: string) => {
    await buildExec.swapAdapter(adapter);
    buildExec.execute();
  }, [buildExec]);

  // Session build: dispatch one build_session job for the full scope
  const handleSessionBuild = useCallback(async () => {
    setShowSessionConfig(false);
    setStage('session_building');
    setError('');
    await buildExec.executeSession(selectedSessionAdapter, sessionScope);
    // Stage stays 'session_building' — user pushes to GitHub via the panel button
  }, [buildExec, selectedSessionAdapter, sessionScope]);

  // Push session build manifest to GitHub (mirrors handleTaskExecuteToGithub)
  const handleSessionExecuteToGithub = useCallback(async () => {
    if (!session || !user) return;
    setStage('executing');
    setError('');

    try {
      const result = await buildExec.pushSessionBuildToGithub(selectedSessionAdapter);
      setWrittenFiles(result.writtenFiles);
      setSkippedFiles(result.skippedFiles);
      setPrUrls(result.prUrls);
      setCollisionCount(result.collisionCount);
      setHandoffs(result.handoffs);
      setBackupBranch(result.backupBranch);

      setStage(session.current_phase === 'bouncer' ? 'bouncer' : 'complete');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('session_building');
    }
  }, [session, user, buildExec, selectedSessionAdapter]);

  const isVisible = session?.current_phase === 'build' || session?.current_phase === 'bouncer';
  const isThreadShellActive = state.activeThread !== null;

  const [lanes, setLanes] = useState<LaneRow[]>([]);
  const [stage, setStage] = useState<BuildStage>('preparing');
  const [drawerCollapsed, setDrawerCollapsed] = useState(true);
  const [error, setError] = useState('');

  // Broadcast step state
  const [buildRoundId, setBuildRoundId] = useState<string | null>(null);
  const [approvedResponseIds, setApprovedResponseIds] = useState<Set<string>>(new Set());
  const [broadcastMsgIdx, setBroadcastMsgIdx] = useState(0);
  const [stageHydrated, setStageHydrated] = useState(false);
  // Tracks whether the build_lanes DB query has returned (empty or not).
  // Hydration must wait for this before deciding whether to fire concierge —
  // otherwise it fires concierge on every remount before lanes load from DB.
  const [lanesLoaded, setLanesLoaded] = useState(false);
  const broadcastTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const preparingTriggered = useRef(false);
  const preBuildRoundCount = useRef<number>(0);

  // Concierge chat — active during broadcasting + reviewing-with-no-responses
  const [conciergeMessages, setConciergeMessages] = useState<Array<{ role: 'user' | 'concierge'; text: string }>>([]);
  const [conciergeInput, setConciergeInput] = useState('');
  const [conciergeTyping, setConciergeTyping] = useState(false);

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

  const [completenessResult, setCompletenessResult] = useState<CompletenessResult | null>(null);
  const bouncerBuildFiles = useMemo(() => {
    const manifest = buildExec.collectManifest();
    const buildManifest = manifest.length > 0
      ? manifest
      : buildExec.collectSessionManifest();
    return buildManifest
      .filter((entry) => entry.content && entry.operation !== 'delete')
      .map((entry) => ({ path: entry.path, content: entry.content!, operation: entry.operation }));
  }, [buildExec]);
  const {
    bouncerLoading,
    bouncerResult,
    bouncerError,
    elapsedMs: bouncerElapsedMs,
    runBouncer,
    handleConductorDecision,
  } = useBouncerReview({
    session,
    writtenFiles,
    buildFiles: bouncerBuildFiles,
    onApproved: () => setStage('done'),
  });

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
    setCompletenessResult(null);
  }, [session?.id, isVisible]);

  // Start drawer expanded when a build begins in Claw mode — user just triggered it from Concierge
  useEffect(() => {
    if (isVisible && isThreadShellActive && !state.clawBuildSession) setDrawerCollapsed(false);
  }, [session?.id, isVisible, isThreadShellActive, state.clawBuildSession]);

  // Sync local drawerCollapsed → context (guarded against no-op dispatches)
  useEffect(() => {
    if (!isThreadShellActive || !isVisible) {
      if (state.buildDrawerExpanded) dispatch({ type: 'SET_BUILD_DRAWER_EXPANDED', payload: false });
      return;
    }
    const expanded = !drawerCollapsed;
    if (state.buildDrawerExpanded !== expanded) {
      dispatch({ type: 'SET_BUILD_DRAWER_EXPANDED', payload: expanded });
    }
  }, [drawerCollapsed, isThreadShellActive, isVisible, state.buildDrawerExpanded, dispatch]);

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

  const lockedBuilderAgentIds = useMemo(
    () => safeStringArray(session?.build_spec?.primary_builder_agent_ids),
    [session?.build_spec],
  );

  const resolvePlannedBuilderAgent = useCallback((builder: NormalizedBuilderAgent) => {
    const lockedIds = new Set(lockedBuilderAgentIds);
    const candidates = agents.filter(agent => lockedIds.size === 0 || lockedIds.has(agent.id));

    if (builder.agent_id) {
      const exact = candidates.find(agent => agent.id === builder.agent_id);
      if (exact) return exact;
    }

    const label = norm(builder.agent_name);
    if (!label) return null;

    return candidates.find(agent => {
      const name = norm(agent.name);
      const display = norm(agent.display_name);
      const role = norm(agent.role);
      return name === label
        || display === label
        || display.includes(label)
        || label.includes(display)
        || name.includes(label)
        || label.includes(name)
        || role.includes(label)
        || label.includes(role);
    }) ?? null;
  }, [agents, lockedBuilderAgentIds]);

  const localSessionSpecs = useMemo(() => {
    if (!normalizedBuildPlan) return [];
    return normalizedBuildPlan.builder_agents.reduce<Array<{
      builderName: string;
      adapter: string;
      scopePaths: string[];
      instruction?: string;
    }>>((acc, builder) => {
      const resolved = resolvePlannedBuilderAgent(builder);
      if (!resolved || resolved.provider_group !== 'maestroclaw') return acc;
      acc.push({
          builderName: resolved.display_name || resolved.name || builder.agent_name,
          adapter: resolved.model,
          scopePaths: builder.scoped_paths.length > 0 ? builder.scoped_paths : ['**'],
          instruction: builder.instruction,
        });
      return acc;
    }, []);
  }, [normalizedBuildPlan, resolvePlannedBuilderAgent]);

  const prefersSessionBuild = useMemo(() => (
    (session?.execution_backend === 'local' || session?.execution_backend === 'auto')
    && localSessionSpecs.length > 0
  ), [session?.execution_backend, localSessionSpecs]);

  const resolveBuilderAgentIds = useCallback((plan: NormalizedBuildPlan | null) => {
    const lockedIds = new Set(lockedBuilderAgentIds);
    const builderLanes = lanes.filter(l => l.role === 'builder');
    const ids = new Set<string>();
    const lockedAgents = agents.filter(agent => lockedIds.has(agent.id));

    const matchLockedAgentByName = (label: string) => {
      const laneName = norm(label);
      if (!laneName) return null;
      return lockedAgents.find(agent => {
        const name = norm(agent.name);
        const display = norm(agent.display_name);
        const role = norm(agent.role);
        return display === laneName
          || name === laneName
          || display.includes(laneName)
          || laneName.includes(display)
          || role.includes(laneName)
          || laneName.includes(role);
      }) ?? null;
    };

    for (const agent of plan?.builder_agents ?? []) {
      if (agent.agent_id && (lockedIds.size === 0 || lockedIds.has(agent.agent_id))) {
        ids.add(agent.agent_id);
        continue;
      }
      const matched = lockedIds.size > 0 ? matchLockedAgentByName(agent.agent_name) : null;
      if (matched) ids.add(matched.id);
    }

    for (const lane of builderLanes) {
      if (lane.agent_id && (lockedIds.size === 0 || lockedIds.has(lane.agent_id))) {
        ids.add(lane.agent_id);
        continue;
      }
      const matched = lockedIds.size > 0 ? matchLockedAgentByName(lane.agent_name) : null;
      if (matched) ids.add(matched.id);
    }

    if (lockedIds.size > 0) {
      if (ids.size > 0) return { ids: [...ids], warning: '' };
      return {
        ids: [],
        warning: builderLanes.length === 0
          ? 'No locked builder lanes were found. Return to Pre-Build and regenerate Architect.md.'
          : 'Build is locked to the Pre-Build builder roster, but the current lanes do not map to those locked builders.',
      };
    }
    if (ids.size > 0) return { ids: [...ids], warning: '' };

    const activeAgentPool = agents.filter(agent => agent.is_active);
    if (activeAgentPool.length === 0) {
      return {
        ids: [],
        warning: 'No active builder agents are available. Return to Pre-Build and select builders.',
      };
    }

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

      if (role.includes('build') || role.includes('build lead') || role.includes('code generation')) score += 50;
      if (name.includes('builder')) score += 22;
      if (name.includes('sonnet')) score += 35;
      if (name.includes('gpt 5 4') || name.includes('gpt 5')) score += 25;
      if (provider.includes('anthropic')) score += 18;
      if (provider.includes('openai')) score += 14;
      if (role.includes('triage') || role.includes('summarization') || role.includes('general purpose')) score -= 18;
      if (role.includes('free') || name.includes('gpt oss') || name.includes('gemma')) score -= 24;
      if (provider.includes('openrouter a')) score -= 10;

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
      const available = activeAgentPool.filter(a => !ids.has(a.id));
      const candidates = available.length > 0 ? available : activeAgentPool;
      return candidates
        .map(agent => ({ agent, score: scoreAgentForLane(agent, lane, index) }))
        .sort((a, b) => b.score - a.score)[0]?.agent ?? null;
    };

    for (const lane of builderLanes) {
      const laneName = norm(lane.agent_name);
      const match = activeAgentPool.find(a => {
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
      return { ids: [...ids], warning: 'Some builder IDs were recovered from active lane assignments.' };
    }

    builderLanes.forEach((lane, index) => {
      const fallback = pickFallbackAgent(lane, index);
      if (fallback) ids.add(fallback.id);
    });

    if (ids.size > 0) {
      return {
        ids: [...ids],
        warning: 'Builder lanes used generic labels, so Maestro recovered active builders from the current lane assignments.',
      };
    }

    return {
      ids: [],
      warning: builderLanes.length === 0
        ? 'No builder lanes were found. Return to Pre-Build and regenerate Architect.md.'
        : 'Builder lanes exist but could not be matched to active agents.',
    };
  }, [lanes, agents, lockedBuilderAgentIds]);
  const resolvedBuilderAgentIds = useMemo(
    () => resolveBuilderAgentIds(normalizedBuildPlan).ids,
    [resolveBuilderAgentIds, normalizedBuildPlan],
  );

  // Load lanes on mount — always signal lanesLoaded so the hydration effect can proceed.
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
        // Signal ready whether or not rows exist — hydration gate depends on this.
        setLanesLoaded(true);
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

    // Wait for the lanes DB query to return before checking build round / plan state.
    // Without this gate, the concierge auto-trigger fires before we know whether
    // lanes already exist in DB, causing a re-fire on every remount.
    if (!lanesLoaded) return;

    // Only identify a round as a build round if it has at least one response with a
    // file_manifest. Using shouldIncludeBuilderAgent here was too broad — it would
    // match analysis rounds when no locked builder IDs are set, surfacing prose
    // responses in the reviewing stage instead of actual build output.
    const buildRound = [...sessionRounds].reverse().find(round => {
      const roundResponses = state.responses.filter(response => response.round_id === round.id);
      return roundResponses.some(hasWriteManifest);
    });

    if (buildRound) {
      const roundResponses = state.responses.filter(response => response.round_id === buildRound.id);
      setBuildRoundId(buildRound.id);
      if (roundResponses.length > 0) {
        setApprovedResponseIds(new Set(roundResponses.filter(hasExecutableManifest).map(response => response.id)));
        setStage('reviewing');
      } else {
        // Build round exists but zero responses arrived — the broadcast timed out or silently
        // failed. Setting stage to 'broadcasting' would be a dead end because broadcast()
        // won't re-fire. Go back to plan_review so the user can see the plan and retry.
        setError('Previous build broadcast timed out — no responses were received. Review the plan and start again.');
        setStage('plan_review');
      }
      preparingTriggered.current = true;
      setStageHydrated(true);
      return;
    }

    // Builder lanes already exist in DB → concierge already ran for this session.
    // Go to 'preparing' (not plan_review directly) so the concierge auto-effect
    // fires and reloads the build plan into state. Without this, plan_review renders
    // blank after a refresh because normalizedBuildPlan is null (MaestroContext resets).
    // Do NOT set preparingTriggered here — the auto-effect needs to run.
    if (lanes.some(l => l.role !== 'read_only')) {
      setStage('preparing');
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
  }, [session, isVisible, stageHydrated, lanesLoaded, lanes, state.executionRuns, state.responses, sessionRounds, normalizedBuildPlan, resolvedBuilderAgentIds]);

  // Sprint C · F2 — Auto-call concierge on build phase entry
  useEffect(() => {
    if (!session || !isVisible || !stageHydrated || stage !== 'preparing' || preparingTriggered.current) return;
    // When the thread-native RunwayCard is active for this thread, it owns the
    // concierge call. Let it load the plan so both surfaces read from the same
    // state.buildPlan without double-firing.
    if (state.clawBuildSession && state.clawBuildSession.threadId === state.activeThread?.id) return;
    preparingTriggered.current = true;
    let stale = false;

    (async () => {
      try {
        const plan = await invokeEdgeFunction<BuildPlan>('concierge', { session_id: session.id, phase: 'pre_build_complete' });
        if (stale) return;
        dispatch({ type: 'SET_BUILD_PLAN', payload: plan });
        setStage('plan_review');
      } catch (err) {
        if (stale) return;
        console.warn('Concierge build plan error:', err);
        setError(err instanceof Error ? err.message : 'Concierge could not prepare a build plan.');
        setStage('plan_review');
      }
    })();

    return () => { stale = true; };
  }, [session, isVisible, stage, stageHydrated, dispatch, state.clawBuildSession, state.activeThread?.id]);

  // When plan arrives externally (e.g. loaded by the in-thread RunwayCard),
  // advance out of 'preparing' without re-calling concierge.
  useEffect(() => {
    if (stage !== 'preparing' || !stageHydrated || !normalizedBuildPlan || preparingTriggered.current) return;
    preparingTriggered.current = true;
    setStage('plan_review');
  }, [stage, stageHydrated, normalizedBuildPlan]);
  // Approve build plan and start broadcasting
  const handleApprovePlan = useCallback(async () => {
    const buildPlan = normalizedBuildPlan;
    if (!session || !buildPlan) return;

    // Snapshot round count BEFORE broadcasting so the round-watch effect
    // can ignore all pre-existing rounds (analysis round, etc.).
    preBuildRoundCount.current = state.rounds.filter(r => r.session_id === session.id).length;

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

    const promptOverridesByAgentId = builderAgentIds.reduce<Record<string, string>>((acc, agentId) => {
      const matchedAgent = agents.find(agent => agent.id === agentId);
      const matchedLane = lanes.find(lane => lane.agent_id === agentId)
        || lanes.find(lane => matchedAgent ? norm(lane.agent_name) === norm(matchedAgent.display_name) : false)
        || lanes.find(lane => matchedAgent ? norm(lane.agent_name) === norm(matchedAgent.name) : false);
      const matchedPlanAgent = buildPlan.builder_agents.find(agent => agent.agent_id === agentId)
        || buildPlan.builder_agents.find(agent => matchedLane ? norm(agent.agent_name) === norm(matchedLane.agent_name) : false)
        || buildPlan.builder_agents.find(agent => matchedAgent ? norm(agent.agent_name) === norm(matchedAgent.display_name) : false);
      const scopedPaths = matchedPlanAgent?.scoped_paths.length
        ? matchedPlanAgent.scoped_paths
        : matchedLane?.lane_paths ?? [];
      const instruction = matchedPlanAgent?.instruction?.trim().length
        ? matchedPlanAgent.instruction
        : `Build only the files in: ${scopedPaths.join(', ') || 'your assigned lane paths'}`;
      acc[agentId] = buildLanePrompt(buildPlan.build_prompt, instruction, scopedPaths);
      return acc;
    }, {});

    try {
      await broadcast(buildPlan.build_prompt, builderAgentIds, session, {
        modeOverride: 'build',
        skipSynthesis: true,
        skipTriage: true,
        promptOverridesByAgentId,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('plan_review');
    }
  }, [session, state.rounds, normalizedBuildPlan, resolveBuilderAgentIds, dispatch, broadcast]);

  // Manually reload the build plan from concierge — used by "Back to Plan" and
  // "Load Build Plan" escape hatches so users are never stuck on a blank screen.
  const handleReloadPlan = useCallback(async () => {
    if (!session) return;
    setError('');
    setStage('preparing');
    try {
      const plan = await invokeEdgeFunction<BuildPlan>('concierge', { session_id: session.id, phase: 'pre_build_complete' });
      dispatch({ type: 'SET_BUILD_PLAN', payload: plan });
      setStage('plan_review');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Concierge could not prepare a build plan.');
      setStage('plan_review');
    }
  }, [session, dispatch]);

  /* ── Build v2: task-queued build flow ────────────────────── */
  const handleTaskBuild = useCallback(async () => {
    if (!session) return;
    setError('');

    if (prefersSessionBuild) {
      setStage('session_building');
      await buildExec.executeSessionPlan(localSessionSpecs);
      return;
    }

    setStage('task_decomposing');

    try {
      await buildExec.decompose(session.id);
      setStage('task_building');
      // Start execution loop
      await buildExec.execute();
      // Stay on task_building so user can see results before executing to GitHub
      // (the header buttons handle the "Execute to GitHub" transition)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Task decomposition failed.');
      setStage('plan_review');
    }
  }, [session, buildExec, prefersSessionBuild, localSessionSpecs]);

  const handleTaskExecuteToGithub = useCallback(async () => {
    if (!session) return;
    setStage('executing');
    setError('');

    try {
      const result = await buildExec.pushTaskBuildToGithub();
      setWrittenFiles(result.writtenFiles);
      setSkippedFiles(result.skippedFiles);
      setPrUrls(result.prUrls);
      setCollisionCount(result.collisionCount);
      setHandoffs(result.handoffs);
      setBackupBranch(result.backupBranch);

      if (session.current_phase === 'bouncer') {
        setStage('bouncer');
      } else {
        setStage('complete');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('task_building');
    }
  }, [session, buildExec]);

  // Greet the user when broadcasting starts so the screen isn't a dead void.
  useEffect(() => {
    if (stage === 'broadcasting' && conciergeMessages.length === 0) {
      setConciergeMessages([{
        role: 'concierge',
        text: 'Build broadcast is live — builders are generating code. This typically takes 60–120 seconds for large lane assignments. Ask me anything while you wait.',
      }]);
    }
  }, [stage, conciergeMessages.length]);

  const sendConciergeMessage = useCallback(async () => {
    if (!session || !conciergeInput.trim()) return;
    const message = conciergeInput.trim();
    setConciergeInput('');
    setConciergeMessages(prev => [...prev, { role: 'user', text: message }]);
    setConciergeTyping(true);
    try {
      const result = await invokeEdgeFunction<{ reply: string }>('concierge', {
        session_id: session.id,
        phase: 'build_chat',
        user_message: message,
        responses: [],
      });
      setConciergeMessages(prev => [...prev, { role: 'concierge', text: result.reply }]);
    } catch {
      setConciergeMessages(prev => [...prev, { role: 'concierge', text: 'Unable to reach Concierge right now.' }]);
    } finally {
      setConciergeTyping(false);
    }
  }, [session, conciergeInput]);
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

  // Derive build responses: all responses in the build broadcast round.
  // We no longer filter by shouldIncludeBuilderAgent here — buildRoundId is only
  // set for rounds containing file_manifest responses (hydration) or the round
  // just created by broadcast() (broadcasting stage), so all responses belong.
  const buildResponses: Response[] = useMemo(() => (
    buildRoundId
      ? state.responses.filter(r =>
        r.round_id === buildRoundId
        && !!r.agent_id
      )
      : []
  ), [buildRoundId, state.responses]);

  const executableResponseCount = useMemo(
    () => buildResponses.filter(hasExecutableManifest).length,
    [buildResponses],
  );
  const blockedResponseCount = buildResponses.length - executableResponseCount;

  // When broadcasting, detect the new round created by broadcast().
  // Uses preBuildRoundCount snapshot to skip all pre-existing rounds (e.g. the
  // analysis round) and only latch onto the first round created after approval.
  useEffect(() => {
    if (stage !== 'broadcasting' || buildRoundId) return;
    const sessionRounds = state.rounds.filter(r => r.session_id === session?.id);
    // Only consider rounds at index >= snapshot — these were created after approval.
    const buildRound = sessionRounds[preBuildRoundCount.current];
    if (buildRound) setBuildRoundId(buildRound.id);
  }, [stage, buildRoundId, state.rounds, session]);

  // When broadcasting, watch for responses to auto-transition to reviewing
  useEffect(() => {
    if (stage !== 'broadcasting' || !buildRoundId) return;
    const roundResponses = state.responses.filter(r => r.round_id === buildRoundId);
    // Use the round's target_agents count to know when all builders have responded.
    // Fall back to resolvedBuilderAgentIds or lane count if the round isn't loaded yet.
    const buildRound = state.rounds.find(r => r.id === buildRoundId);
    const builderCount = buildRound?.target_agents?.length
      ?? (resolvedBuilderAgentIds.length || lanes.length || 1);
    if (roundResponses.length >= builderCount) {
      setApprovedResponseIds(new Set(roundResponses.filter(hasExecutableManifest).map(r => r.id)));
      setStage('reviewing');
    }
  }, [stage, buildRoundId, state.responses, state.rounds, lanes, resolvedBuilderAgentIds]);

  const toggleResponseApproval = useCallback((responseId: string) => {
    setApprovedResponseIds(prev => {
      const next = new Set(prev);
      if (next.has(responseId)) next.delete(responseId);
      else next.add(responseId);
      return next;
    });
  }, []);

  /* ── Continue build (for incomplete agents) ──────────────── */
  const handleContinueBuild = useCallback(async () => {
    if (!session || !normalizedBuildPlan) return;

    // Collect responses where the agent signalled incomplete
    const incompleteResponses = buildResponses.filter(
      r => r.signals?.build_complete === 'false' && r.agent_id,
    );
    if (incompleteResponses.length === 0) return;

    setStage('broadcasting');
    setBuildRoundId(null); // Reset so the next round is picked up
    setError('');

    const continuationAgentIds = incompleteResponses.map(r => r.agent_id!);
    const promptOverridesByAgentId: Record<string, string> = {};

    for (const resp of incompleteResponses) {
      if (!resp.agent_id) continue;
      const continuationHint = resp.signals?.continuation_prompt || '';
      const lane = lanes.find(l => l.agent_id === resp.agent_id)
        || lanes.find(l => norm(l.agent_name) === norm(resp.agent_name ?? ''));
      const planAgent = normalizedBuildPlan.builder_agents.find(a => a.agent_id === resp.agent_id)
        || normalizedBuildPlan.builder_agents.find(a => norm(a.agent_name) === norm(resp.agent_name ?? ''));

      const scopedPaths = planAgent?.scoped_paths.length
        ? planAgent.scoped_paths
        : lane?.lane_paths ?? [];

      // Use agent's continuation_prompt as the base; fall back to a generic resume message
      const basePrompt = continuationHint.trim().length > 0
        ? `BUILD CONTINUATION — ${continuationHint}`
        : `BUILD CONTINUATION — Continue generating the remaining files from your assigned lane. Return JSON only with complete file contents in file_manifest entries.`;

      promptOverridesByAgentId[resp.agent_id] = buildLanePrompt(
        basePrompt,
        `Continue generating the remaining files in: ${scopedPaths.join(', ') || 'your assigned lane paths'}`,
        scopedPaths,
      );
    }

    try {
      await broadcast(
        'Build continuation — generating remaining files',
        continuationAgentIds,
        session,
        {
          modeOverride: 'build',
          skipSynthesis: true,
          skipTriage: true,
          promptOverridesByAgentId,
        },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('reviewing');
    }
  }, [session, normalizedBuildPlan, buildResponses, lanes, broadcast]);

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
      );
      if (approved.length === 0) {
        throw new Error('Select at least one builder response before executing.');
      }
      if (!approved.some(hasExecutableManifest)) {
        throw new Error('No selected builder response included a file_manifest. Re-run Build; agents must return complete file contents before GitHub can be written.');
      }
      // Only include patches that have a matching builder lane.
      // Agents without a lane (non-builders, substitutes, extras) are silently
      // skipped here — github-execute would reject them with LANES_NOT_ASSIGNED
      // anyway since they have no scoped_paths. Fixes the "6 agents, 2 lanes" 400.
      const patches = approved.filter(hasExecutableManifest).flatMap(r => {
        const lane = lanes.find(l => l.agent_id === r.agent_id)
          || lanes.find(l => l.agent_name === r.agent_name)
          || lanes.find(l => l.agent_name.toLowerCase().includes((r.agent_name ?? '').toLowerCase()));
        if (!lane) return [];
        return [{
          agent_name: lane.agent_name,
          agent_id: r.agent_id,
          content: r.content,
          scoped_paths: lane.lane_paths ?? [],
          commit_message: `${lane.agent_name}: build patch`,
          conductor_approved: false,
          file_manifest: r.file_manifest ?? [],
        }];
      });
      if (patches.length === 0) {
        throw new Error('None of the approved responses matched a builder lane. Ensure the correct builder agents ran in Build mode and that Architect.md lane assignments are up to date.');
      }const data = await invokeEdgeFunction<{
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
    if (bouncerBuildFiles.length > 0) {
      const completeness = checkBuildCompleteness(bouncerBuildFiles);
      setCompletenessResult(completeness);
    }
    const succeeded = await runBouncer();
    if (succeeded) setStage('bouncer');
  }, [bouncerBuildFiles, runBouncer]);

  /* ── Render gate ─────────────────────────────────────────── */
  if (!isVisible || !session) return null;

  const builders = lanes.filter(l => l.role === 'builder');
  const reviewers = lanes.filter(l => l.role !== 'builder');
  const builderCount = builders.length || normalizedBuildPlan?.builder_agents.length || resolvedBuilderAgentIds.length || 1;
  const broadcastProgress = getBroadcastProgressState(!!buildRoundId, buildResponses.length, builderCount);
  const headerLabel = stage === 'preparing' ? 'Build — Preparing Plan'
    : stage === 'plan_review' ? 'Build — Review Plan'
    : stage === 'broadcast' ? 'Build — Broadcast to Agents'
    : stage === 'broadcasting' ? (broadcastProgress === 'dispatching'
      ? 'Build — Dispatching Builders'
      : broadcastProgress === 'waiting'
        ? 'Build — Waiting on Providers'
        : broadcastProgress === 'partial'
          ? 'Build — Partial Results'
          : 'Build — Ready for Review')
    : stage === 'reviewing' ? 'Build — Review Responses'
    : stage === 'ready' ? 'Build — Execute to GitHub'
    : stage === 'executing' ? 'Build — Writing to GitHub'
    : stage === 'bouncer' ? 'Bouncer Review'
    : stage === 'done' ? 'Build Complete'
    : stage === 'task_decomposing' ? 'Build — Preparing Tasks'
    : stage === 'task_building' ? `Build — ${buildExec.progress.completed}/${buildExec.progress.total} Files`
    : 'Build in Progress';
  const drawerExpandedHeight = 'clamp(56px, 50dvh, calc(100dvh - 240px))';

  return (
    <div
      className={isThreadShellActive
        ? 'fixed left-0 right-0 bottom-0 z-50 flex flex-col'
        : 'fixed inset-0 z-40 flex flex-col'}
      style={{
        background: 'rgba(8,8,6,0.96)',
        backdropFilter: 'blur(8px)',
        ...(isThreadShellActive ? {
          height: drawerCollapsed ? '56px' : drawerExpandedHeight,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          transition: 'height 0.25s cubic-bezier(0.4,0,0.2,1)',
        } : {}),
      }}
    >
      {/* ── Claw mode: drawer handle ─────────────────────────── */}
      {isThreadShellActive && (
        <button
          type="button"
          className="flex items-center gap-3 px-4 w-full text-left flex-shrink-0 hover:bg-white/[0.02] transition-colors"
          style={{ height: '56px', borderBottom: drawerCollapsed ? 'none' : '1px solid rgba(255,255,255,0.06)' }}
          onClick={() => setDrawerCollapsed(c => !c)}
          aria-expanded={!drawerCollapsed}
          aria-label={drawerCollapsed ? 'Expand build drawer' : 'Collapse build drawer'}
        >
          <Hammer size={14} style={{ color: 'var(--gold)', flexShrink: 0 }} />
          <span className="font-mono-dm text-xs tracking-widest uppercase" style={{ color: 'var(--gold)', flexShrink: 0 }}>
            {headerLabel}
          </span>
          {(stage === 'task_building' || stage === 'task_decomposing') && (
            <>
              <span className="text-xs text-white/55 flex-shrink-0">
                {buildExec.progress.completed}/{buildExec.progress.total}
              </span>
              {buildExec.progress.failed > 0 && (
                <span className="text-xs flex-shrink-0" style={{ color: 'var(--risk)' }}>
                  · {buildExec.progress.failed} failed{drawerCollapsed && !buildExec.isRunning ? ' · open to fix ↑' : ''}
                </span>
              )}
              <div className="mx-2 h-0.5 rounded-full overflow-hidden flex-1" style={{ background: 'rgba(255,255,255,0.08)', maxWidth: '120px' }}>
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: buildExec.progress.total > 0
                      ? `${Math.round(((buildExec.progress.completed + buildExec.progress.failed) / buildExec.progress.total) * 100)}%`
                      : '0%',
                    background: buildExec.progress.failed > 0 ? 'var(--warn)' : 'var(--ok)',
                  }}
                />
              </div>
            </>
          )}
          {stage === 'session_building' && (
            <>
              <span className="text-xs flex-shrink-0" style={{ color: '#a78bfa' }}>
                {buildExec.sessionProgress.status === 'running' ? 'session running…'
                  : buildExec.sessionProgress.status === 'succeeded' ? `${buildExec.sessionProgress.filesWritten} files written`
                  : 'session failed'}
              </span>
            </>
          )}
          <span className="ml-auto text-white/40 flex-shrink-0">
            {drawerCollapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </span>
        </button>
      )}

      {/* ── Full workspace content (hidden when claw drawer is collapsed) ── */}
      {(!isThreadShellActive || !drawerCollapsed) && (
        <>
          {/* Phase rail — full-screen mode only */}
          {!isThreadShellActive && <PhaseRail currentPhase={session.current_phase ?? 'build'} />}

          {/* ── Main content ─────────────────────────────────── */}
          <div className="flex-1 overflow-y-auto overscroll-contain" style={{ padding: '0 32px 32px' }}>
            <div style={{ maxWidth: '880px', margin: '0 auto' }}>

          {/* Header */}
          <div className="flex items-center justify-between" style={{ marginBottom: '28px' }}>
            <div className="flex items-center gap-3">
              <Hammer size={18} style={{ color: 'var(--gold)' }} />
              <span className="font-mono-dm" style={{ fontSize: '13px', letterSpacing: '0.2em', textTransform: 'uppercase', color: 'var(--gold)' }}>
                {headerLabel}
              </span>
            </div>
            {stage === 'plan_review' && normalizedBuildPlan && (
              <div className="flex items-center gap-2">
                <button
                  className="reveal-pill"
                  style={{
                    height: '36px', fontSize: '12px', padding: '0 20px',
                    background: 'var(--gold)', color: 'var(--void)',
                    borderColor: 'transparent', fontWeight: 500,
                  }}
                  onClick={handleTaskBuild}
                >
                  {prefersSessionBuild ? <Zap size={14} /> : <FileCode size={14} />}
                  {prefersSessionBuild ? 'Start Claw Build' : 'Start Build'}
                </button>
                <button
                  className="reveal-pill"
                  style={{
                    height: '36px', fontSize: '12px', padding: '0 16px',
                    background: 'rgba(212,168,67,0.1)', color: 'var(--gold)',
                    borderColor: 'rgba(212,168,67,0.3)', fontWeight: 500,
                  }}
                  onClick={handleApprovePlan}
                  title="Legacy: broadcast all files to builders at once"
                >
                  <Play size={14} />
                  Broadcast (Legacy)
                </button>
              </div>
            )}
            {stage === 'reviewing' && buildResponses.length === 0 && (
              <button
                className="reveal-pill"
                style={{
                  height: '36px', fontSize: '12px', padding: '0 20px',
                  background: 'rgba(212,168,67,0.1)', color: 'var(--gold)',
                  borderColor: 'rgba(212,168,67,0.3)', fontWeight: 500,
                }}
                onClick={handleReloadPlan}
              >
                <RotateCcw size={13} />
                Back to Plan
              </button>
            )}
            {stage === 'reviewing' && buildResponses.length > 0 && (
              <div className="flex items-center gap-2">
                {buildResponses.some(r => r.signals?.build_complete === 'false') && (
                  <button
                    className="reveal-pill"
                    style={{
                      height: '36px', fontSize: '12px', padding: '0 16px',
                      background: 'rgba(212,168,67,0.1)', color: 'var(--gold)',
                      borderColor: 'rgba(212,168,67,0.3)', fontWeight: 500,
                    }}
                    onClick={handleContinueBuild}
                    title="Re-broadcast to agents that returned complete:false, using their continuation_prompt"
                  >
                    <Pause size={13} />
                    Continue Build
                  </button>
                )}
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
              </div>
            )}
            {stage === 'ready' && (
              <button
                className="reveal-pill"
                style={{
                  height: '36px', fontSize: '12px', padding: '0 20px',
                  background: 'var(--gold)', color: 'var(--void)',
                  borderColor: 'transparent', fontWeight: 500,
                }}
                onClick={buildExec.tasks.length > 0 ? handleTaskExecuteToGithub : handleExecute}
              >
                <Play size={14} />
                Execute Build
              </button>
            )}
            {stage === 'task_building' && (
              <div className="flex items-center gap-2">
                {buildExec.isRunning && (
                  <button
                    className="reveal-pill"
                    style={{
                      height: '36px', fontSize: '12px', padding: '0 16px',
                      background: 'rgba(224,90,90,0.1)', color: 'var(--risk)',
                      borderColor: 'rgba(224,90,90,0.3)', fontWeight: 500,
                    }}
                    onClick={buildExec.abort}
                  >
                    <Pause size={13} />
                    Pause
                  </button>
                )}
                {!buildExec.isRunning && buildExec.progress.completed > 0 && (
                  <button
                    className="reveal-pill"
                    style={{
                      height: '36px', fontSize: '12px', padding: '0 20px',
                      background: 'var(--gold)', color: 'var(--void)',
                      borderColor: 'transparent', fontWeight: 500,
                    }}
                    onClick={handleTaskExecuteToGithub}
                  >
                    <Play size={14} />
                    Execute to GitHub ({buildExec.progress.completed} files)
                  </button>
                )}
                {!buildExec.isRunning && buildExec.progress.queued > 0 && (
                  <button
                    className="reveal-pill"
                    style={{
                      height: '36px', fontSize: '12px', padding: '0 16px',
                      background: 'rgba(212,168,67,0.1)', color: 'var(--gold)',
                      borderColor: 'rgba(212,168,67,0.3)', fontWeight: 500,
                    }}
                    onClick={() => buildExec.execute()}
                  >
                    <RotateCcw size={13} />
                    Resume Build
                  </button>
                )}
                {!buildExec.isRunning && !prefersSessionBuild && (
                  <button
                    className="reveal-pill"
                    style={{
                      height: '36px', fontSize: '12px', padding: '0 16px',
                      background: 'rgba(120,90,200,0.1)', color: '#a78bfa',
                      borderColor: 'rgba(120,90,200,0.3)', fontWeight: 500,
                    }}
                    onClick={() => setShowSessionConfig(v => !v)}
                  >
                    <Zap size={13} />
                    Manual Session Build
                  </button>
                )}
              </div>
            )}
            {stage === 'session_building' && buildExec.sessionProgress.status === 'succeeded' && (
              <button
                className="reveal-pill"
                style={{
                  height: '36px', fontSize: '12px', padding: '0 20px',
                  background: 'var(--gold)', color: 'var(--void)',
                  borderColor: 'transparent', fontWeight: 500,
                }}
                onClick={handleSessionExecuteToGithub}
              >
                <Play size={14} />
                Push {buildExec.sessionProgress.filesWritten} files to GitHub
              </button>
            )}
            {stage === 'session_building' && buildExec.sessionProgress.status === 'failed' && (
              <button
                className="reveal-pill"
                style={{
                  height: '36px', fontSize: '12px', padding: '0 16px',
                  background: 'rgba(212,168,67,0.1)', color: 'var(--gold)',
                  borderColor: 'rgba(212,168,67,0.3)', fontWeight: 500,
                }}
                onClick={handleSessionBuild}
              >
                <RotateCcw size={13} />
                Retry Session
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
                    {laneHasDeepPaths(agent.scoped_paths) && (
                      <div style={{
                        marginTop: '8px', padding: '8px 10px', borderRadius: '8px',
                        background: 'rgba(212,168,67,0.06)', border: '1px solid rgba(212,168,67,0.18)',
                        display: 'flex', alignItems: 'flex-start', gap: '8px',
                      }}>
                        <AlertTriangle size={11} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: '1px' }} />
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                          This lane covers multiple directory trees. If the agent cannot finish all files in one pass, it will set <code style={{ fontSize: '10px', color: 'var(--gold)', background: 'rgba(201,168,76,0.08)', padding: '0 3px', borderRadius: '3px' }}>complete: false</code> — use <strong style={{ color: 'var(--gold)' }}>Continue Build</strong> in the review step to chain the next pass.
                        </span>
                      </div>
                    )}
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

          {/* ── Plan Review: no plan loaded (e.g. after refresh) ─ */}
          {stage === 'plan_review' && !normalizedBuildPlan && !error && (
            <section style={{ textAlign: 'center', padding: '60px 0' }}>
              <Loader2 size={24} style={{ color: 'var(--text-dim)', margin: '0 auto 16px' }} />
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
                Build plan not loaded.
              </p>
              <button
                className="reveal-pill"
                style={{
                  height: '36px', fontSize: '12px', padding: '0 20px',
                  background: 'rgba(212,168,67,0.1)', color: 'var(--gold)',
                  borderColor: 'rgba(212,168,67,0.3)', fontWeight: 500,
                }}
                onClick={handleReloadPlan}
              >
                <RotateCcw size={13} />
                Load Build Plan
              </button>
            </section>
          )}

          {/* ── Plan Review: error + retry ────────────────────── */}
          {stage === 'plan_review' && !normalizedBuildPlan && error && (
            <section style={{ textAlign: 'center', padding: '40px 0' }}>
              <button
                className="reveal-pill"
                style={{
                  height: '36px', fontSize: '12px', padding: '0 20px',
                  background: 'rgba(212,168,67,0.1)', color: 'var(--gold)',
                  borderColor: 'rgba(212,168,67,0.3)', fontWeight: 500,
                }}
                onClick={handleReloadPlan}
              >
                <RotateCcw size={13} />
                Retry Load
              </button>
            </section>
          )}
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
                {broadcastProgress === 'dispatching'
                  ? 'Dispatching builder requests…'
                  : broadcastProgress === 'waiting'
                    ? 'Waiting on provider responses…'
                    : broadcastProgress === 'partial'
                      ? 'Partial results landed…'
                      : 'Preparing review state…'}
              </span>
              <span className="font-mono-dm" style={{ fontSize: '10px', letterSpacing: '0.08em', color: 'var(--text-dim)', marginBottom: '10px' }}>
                {buildResponses.length} / {builderCount} builders responded
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)', textAlign: 'center', maxWidth: '520px', lineHeight: 1.6 }}>
                {broadcastProgress === 'dispatching'
                  ? 'Maestro created the build round and is fanning requests out to each builder lane.'
                  : broadcastProgress === 'waiting'
                    ? 'No builder has landed a valid response yet. Providers may still be generating or retrying.'
                    : broadcastProgress === 'partial'
                      ? 'At least one builder finished. Remaining lanes are still running, so review will unlock when enough responses land.'
                      : 'All builder responses are in. Maestro is unlocking the review step.'}
              </span>
            </div>
          )}

          {/* ── Concierge chat — shown during broadcasting so user isn't staring at a brick */}
          {stage === 'broadcasting' && (
            <section style={{
              marginTop: '8px', marginBottom: '24px',
              borderRadius: '14px',
              border: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.02)',
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '10px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                display: 'flex', alignItems: 'center', gap: '8px',
              }}>
                <span className="font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                  Concierge
                </span>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Ask anything while the build runs</span>
              </div>
              <div style={{ maxHeight: '180px', overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {conciergeMessages.map((msg, i) => (
                  <div key={i} style={{
                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '85%',
                    padding: '8px 12px',
                    borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                    background: msg.role === 'user' ? 'rgba(212,168,67,0.12)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${msg.role === 'user' ? 'rgba(212,168,67,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    fontSize: '12px',
                    color: msg.role === 'user' ? 'var(--gold)' : 'var(--text-secondary)',
                    lineHeight: 1.5,
                  }}>
                    {msg.text}
                  </div>
                ))}
                {conciergeTyping && (
                  <div style={{ alignSelf: 'flex-start', display: 'flex', gap: '4px', padding: '8px 12px' }}>
                    <Loader2 size={12} className="animate-spin" style={{ color: 'var(--text-dim)' }} />
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>Concierge is thinking…</span>
                  </div>
                )}
              </div>
              <div style={{ padding: '10px 12px', display: 'flex', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
                <input
                  value={conciergeInput}
                  onChange={e => setConciergeInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendConciergeMessage(); } }}
                  placeholder="Ask Concierge what's happening…"
                  style={{
                    flex: 1, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: '8px', padding: '7px 12px', fontSize: '12px',
                    color: 'var(--text-primary)', outline: 'none',
                  }}
                />
                <button
                  className="reveal-pill"
                  onClick={sendConciergeMessage}
                  disabled={!conciergeInput.trim() || conciergeTyping}
                  style={{
                    height: '34px', fontSize: '11px', padding: '0 14px',
                    background: conciergeInput.trim() ? 'rgba(212,168,67,0.1)' : 'rgba(255,255,255,0.04)',
                    color: conciergeInput.trim() ? 'var(--gold)' : 'var(--text-dim)',
                    borderColor: conciergeInput.trim() ? 'rgba(212,168,67,0.3)' : 'rgba(255,255,255,0.06)',
                  }}
                >
                  Send
                </button>
              </div>
            </section>
          )}

          {/* ── Task Decomposing: concierge splitting files ──── */}
          {stage === 'task_decomposing' && (
            <section style={{ textAlign: 'center', padding: '60px 0' }}>
              <Loader2 size={28} className="animate-spin" style={{ color: 'var(--gold)', margin: '0 auto 16px' }} />
              <p className="font-mono-dm" style={{ fontSize: '12px', letterSpacing: '0.15em', color: 'var(--gold)', marginBottom: '8px' }}>
                Decomposing build into file tasks…
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                Concierge is reading ARCHITECT.md, assigning files to builders, and generating per-file instructions.
              </p>
            </section>
          )}

          {/* ── Task Building: per-file progress board ────────── */}
          {stage === 'task_building' && (
            <section style={{ marginBottom: '28px' }}>
              {/* Progress bar */}
              <div style={{
                padding: '16px 20px', marginBottom: '20px', borderRadius: '12px',
                background: 'rgba(201,168,76,0.04)', border: '1px solid rgba(201,168,76,0.12)',
              }}>
                <div className="flex items-center justify-between" style={{ marginBottom: '10px' }}>
                  <span className="font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                    Build Progress
                  </span>
                  <span className="font-mono-dm" style={{ fontSize: '11px', color: 'var(--gold)' }}>
                    {buildExec.progress.completed} / {buildExec.progress.total} files
                  </span>
                </div>
                <div style={{
                  height: '6px', borderRadius: '3px',
                  background: 'rgba(255,255,255,0.06)', overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%', borderRadius: '3px',
                    background: 'var(--gold)',
                    width: buildExec.progress.total > 0
                      ? `${((buildExec.progress.completed + buildExec.progress.failed + buildExec.progress.skipped) / buildExec.progress.total) * 100}%`
                      : '0%',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
                <div className="flex items-center gap-4" style={{ marginTop: '8px' }}>
                  {buildExec.progress.completed > 0 && (
                    <span style={{ fontSize: '11px', color: '#5ab88e' }}>
                      ✓ {buildExec.progress.completed} complete
                    </span>
                  )}
                  {buildExec.progress.dispatched > 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--gold)' }}>
                      ⟳ {buildExec.progress.dispatched} building
                    </span>
                  )}
                  {buildExec.progress.failed > 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--risk)' }}>
                      ✕ {buildExec.progress.failed} failed
                    </span>
                  )}
                  {buildExec.progress.skipped > 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--text-dim)' }}>
                      ⊘ {buildExec.progress.skipped} skipped
                    </span>
                  )}
                  {buildExec.progress.queued > 0 && (
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      ◦ {buildExec.progress.queued} queued
                    </span>
                  )}
                </div>
              </div>

              {/* Adapter swap banner — shown when tasks failed and build is paused */}
              {buildExec.progress.failed > 0 && !buildExec.isRunning && clawAgents.length > 0 && (
                <div style={{
                  padding: '14px 18px', marginBottom: '16px', borderRadius: '12px',
                  background: 'rgba(224,90,90,0.05)', border: '1px solid rgba(224,90,90,0.18)',
                }}>
                  <div className="flex items-center gap-2" style={{ marginBottom: '10px' }}>
                    <Zap size={13} style={{ color: 'var(--risk)', flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', color: 'var(--risk)', fontWeight: 500 }}>
                      {buildExec.progress.failed} task{buildExec.progress.failed !== 1 ? 's' : ''} failed
                      {buildExec.adapterOverride && (
                        <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>
                          {' '}· switching to{' '}
                          <span style={{ color: '#5ab88e' }}>{buildExec.adapterOverride}</span>
                        </span>
                      )}
                    </span>
                  </div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px' }}>
                    Rate limit or adapter error — pick a builder to retry all failed tasks:
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    {clawAgents.map(agent => {
                      const isActive = buildExec.adapterOverride === agent.model;
                      return (
                        <button
                          key={agent.id}
                          className="reveal-pill"
                          style={{
                            height: '28px', fontSize: '11px', padding: '0 12px',
                            background: isActive ? 'rgba(90,184,142,0.1)' : 'rgba(255,255,255,0.04)',
                            borderColor: isActive ? 'rgba(90,184,142,0.35)' : 'rgba(255,255,255,0.08)',
                            color: isActive ? '#5ab88e' : 'var(--text-muted)',
                            fontWeight: isActive ? 500 : 400,
                          }}
                          onClick={() => handleSwapAndRetry(agent.model)}
                        >
                          {agent.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Task list */}
              <div className="font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)', marginBottom: '10px' }}>
                File Tasks
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '400px', overflowY: 'auto' }}>
                {buildExec.tasks.map((task) => {
                  const agent = state.agents.find(a => a.id === task.lane_owner);
                  // Parse Ralph Loop retry prefix from result_content e.g. "[↩ 2] ..."
                  const retryMatch = task.result_content?.match(/^\[↩ (\d+)\]/);
                  const retryCount = retryMatch ? parseInt(retryMatch[1], 10) : 0;
                  const statusColor = task.status === 'completed' ? '#5ab88e'
                    : task.status === 'dispatched' ? 'var(--gold)'
                    : task.status === 'failed' ? 'var(--risk)'
                    : task.status === 'skipped' ? 'var(--text-dim)'
                    : task.status === 'rerouted' ? '#e8a847'
                    : 'var(--text-muted)';
                  const statusIcon = task.status === 'completed' ? '✓'
                    : task.status === 'dispatched' ? '⟳'
                    : task.status === 'failed' ? '✕'
                    : task.status === 'skipped' ? '⊘'
                    : task.status === 'rerouted' ? '↻'
                    : '◦';

                  return (
                    <div key={task.id} style={{
                      padding: '8px 14px', borderRadius: '8px',
                      background: task.status === 'dispatched' ? 'rgba(201,168,76,0.04)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${task.status === 'dispatched' ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.04)'}`,
                      display: 'flex', flexDirection: 'column', gap: '8px',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%' }}>
                        <span style={{ fontSize: '13px', color: statusColor, width: '16px', textAlign: 'center' }}>
                          {statusIcon}
                        </span>
                        <span className="font-mono-dm" style={{ fontSize: '11px', color: 'var(--text-primary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {task.file_path}
                        </span>
                        {agent && (
                          <span style={{ fontSize: '10px', color: 'var(--text-dim)', flexShrink: 0 }}>
                            {agent.display_name ?? agent.name}
                          </span>
                        )}
                        {retryCount > 0 && task.status === 'completed' && (
                          <span style={{
                            fontSize: '9px', color: 'var(--warn)', flexShrink: 0,
                            background: 'rgba(230,168,60,0.1)', border: '1px solid rgba(230,168,60,0.25)',
                            borderRadius: '4px', padding: '1px 5px',
                          }} title={`Succeeded after ${retryCount + 1} attempts`}>
                            ↩ {retryCount}
                          </span>
                        )}
                        {task.status === 'failed' && (
                          <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
                            <button
                              onClick={() => buildExec.retryTask(task.id)}
                              title="Retry this file"
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                padding: '2px', color: 'var(--gold)', display: 'flex',
                              }}
                            >
                              <RotateCcw size={11} />
                            </button>
                            <button
                              onClick={() => buildExec.skipTask(task.id, 'Manually skipped')}
                              title="Skip this file"
                              style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                padding: '2px', color: 'var(--text-dim)', display: 'flex',
                              }}
                            >
                              <SkipForward size={11} />
                            </button>
                          </div>
                        )}
                        {task.failure_reason && task.status === 'failed' && (
                          <span style={{ fontSize: '9px', color: 'var(--risk)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                            title={task.failure_reason}>
                            {task.failure_reason}
                          </span>
                        )}
                      </div>
                      {buildExec.getJobOutput(task.executor_job_id)?.stdout && (
                        <pre style={{
                          margin: 0,
                          padding: '10px 12px',
                          borderRadius: '8px',
                          background: 'rgba(0,0,0,0.2)',
                          border: '1px solid rgba(255,255,255,0.06)',
                          fontSize: '11px',
                          lineHeight: 1.55,
                          color: 'rgba(232,230,224,0.72)',
                          whiteSpace: 'pre-wrap',
                          overflowX: 'auto',
                          width: '100%',
                        }}>
                          {buildExec.getJobOutput(task.executor_job_id)?.stdout}
                        </pre>
                      )}
                      {buildExec.getJobOutput(task.executor_job_id)?.stderr && (
                        <pre style={{
                          margin: 0,
                          padding: '10px 12px',
                          borderRadius: '8px',
                          background: 'rgba(224,90,90,0.08)',
                          border: '1px solid rgba(224,90,90,0.2)',
                          fontSize: '11px',
                          lineHeight: 1.55,
                          color: 'var(--risk)',
                          whiteSpace: 'pre-wrap',
                          overflowX: 'auto',
                          width: '100%',
                        }}>
                          {buildExec.getJobOutput(task.executor_job_id)?.stderr}
                        </pre>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Concierge chat during task building */}
              <div style={{
                marginTop: '20px', borderRadius: '14px',
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.02)', overflow: 'hidden',
              }}>
                <div style={{
                  padding: '10px 16px',
                  borderBottom: '1px solid rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                  <span className="font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                    Concierge
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {buildExec.isRunning ? 'Building files one at a time…' : 'Build paused — resume or execute'}
                  </span>
                </div>
                <div style={{ maxHeight: '120px', overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {conciergeMessages.length > 0 ? conciergeMessages.slice(-5).map((msg, i) => (
                    <div key={i} style={{
                      alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                      maxWidth: '85%', padding: '6px 10px',
                      borderRadius: '8px',
                      background: msg.role === 'user' ? 'rgba(212,168,67,0.12)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${msg.role === 'user' ? 'rgba(212,168,67,0.2)' : 'rgba(255,255,255,0.06)'}`,
                      fontSize: '11px',
                      color: msg.role === 'user' ? 'var(--gold)' : 'var(--text-secondary)',
                    }}>
                      {msg.text}
                    </div>
                  )) : (
                    <p style={{ fontSize: '11px', color: 'var(--text-dim)', margin: 0 }}>
                      {buildExec.isRunning
                        ? 'Files are being generated one at a time. Each file takes 3-8 seconds.'
                        : buildExec.progress.completed > 0
                          ? `${buildExec.progress.completed} files ready. Click "Execute to GitHub" to push, or resume building remaining files.`
                          : 'Task build starting…'}
                    </p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* ── Reviewing: no responses (broadcast timed out) ─── */}
          {stage === 'reviewing' && buildResponses.length === 0 && (
            <section style={{ textAlign: 'center', padding: '60px 0' }}>
              <AlertTriangle size={28} style={{ color: 'var(--risk)', margin: '0 auto 16px', display: 'block' }} />
              <p className="font-mono-dm" style={{ fontSize: '12px', letterSpacing: '0.15em', color: 'var(--text-dim)', marginBottom: '8px' }}>
                No build responses received
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '460px', margin: '0 auto 24px', lineHeight: 1.6 }}>
                The broadcast may have timed out before any agent responded. Go back to the plan and start the build again — providers can be slow on large prompts.
              </p>
              <button
                className="reveal-pill"
                style={{
                  height: '36px', fontSize: '12px', padding: '0 20px',
                  background: 'rgba(212,168,67,0.1)', color: 'var(--gold)',
                  borderColor: 'rgba(212,168,67,0.3)', fontWeight: 500,
                }}
                onClick={handleReloadPlan}
              >
                <RotateCcw size={13} />
                Back to Plan
              </button>
            </section>
          )}

          {/* ── Session config popover (shown from task_building) ──── */}
          {showSessionConfig && stage === 'task_building' && (
            <section style={{ marginBottom: '20px' }}>
              <div style={{
                padding: '18px 20px', borderRadius: '12px',
                background: 'rgba(120,90,200,0.06)', border: '1px solid rgba(120,90,200,0.2)',
              }}>
                <div className="font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: '#a78bfa', marginBottom: '14px' }}>
                  Session Build Config
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                      Adapter
                    </label>
                    <select
                      value={selectedSessionAdapter}
                      onChange={e => setSelectedSessionAdapter(e.target.value)}
                      style={{
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '8px', color: 'var(--text-primary)', fontSize: '12px',
                        padding: '8px 12px', width: '100%',
                      }}
                    >
                      <option value="claude_code">Claude Code</option>
                      <option value="copilot_cli">Copilot CLI</option>
                      <option value="codex_cli">Codex CLI</option>
                      <option value="gemini_cli">Gemini CLI</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block', marginBottom: '6px' }}>
                      Scope (glob)
                    </label>
                    <input
                      type="text"
                      value={sessionScope}
                      onChange={e => setSessionScope(e.target.value)}
                      placeholder="** (entire project)"
                      style={{
                        background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: '8px', color: 'var(--text-primary)', fontSize: '12px',
                        padding: '8px 12px', width: '100%',
                      }}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="reveal-pill primary"
                      style={{ height: '36px', fontSize: '12px', padding: '0 20px', fontWeight: 500 }}
                      onClick={handleSessionBuild}
                    >
                      <Zap size={13} />
                      Launch Session
                    </button>
                    <button
                      className="reveal-pill"
                      style={{ height: '36px', fontSize: '12px', padding: '0 16px' }}
                      onClick={() => setShowSessionConfig(false)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ── Session building panel ────────────────────────── */}
          {stage === 'session_building' && (
            <section style={{ marginBottom: '28px' }}>
              <div style={{
                padding: '24px 20px', borderRadius: '12px',
                background: 'rgba(120,90,200,0.04)', border: '1px solid rgba(120,90,200,0.15)',
              }}>
                <div className="flex items-center gap-3" style={{ marginBottom: '16px' }}>
                  {buildExec.sessionProgress.status === 'running' ? (
                    <Loader2 size={16} className="animate-spin" style={{ color: '#a78bfa', flexShrink: 0 }} />
                  ) : buildExec.sessionProgress.status === 'succeeded' ? (
                    <CheckCircle2 size={16} style={{ color: '#5ab88e', flexShrink: 0 }} />
                  ) : (
                    <AlertTriangle size={16} style={{ color: 'var(--risk)', flexShrink: 0 }} />
                  )}
                  <span style={{ fontSize: '13px', color: '#a78bfa', fontWeight: 500 }}>
                    {buildExec.sessionProgress.status === 'running'
                      ? buildExec.sessionRuns.length > 1
                        ? `Session build running… (${buildExec.sessionRuns.length} builders)`
                        : `Session build running… (${buildExec.sessionRuns[0]?.adapter ?? selectedSessionAdapter})`
                      : buildExec.sessionProgress.status === 'succeeded'
                      ? `Session complete — ${buildExec.sessionProgress.filesWritten} file${buildExec.sessionProgress.filesWritten === 1 ? '' : 's'} written`
                      : `Session failed`}
                  </span>
                </div>

                {buildExec.sessionRuns.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '14px' }}>
                    {buildExec.sessionRuns.map(run => (
                      <div
                        key={run.key}
                        style={{
                          padding: '12px 14px',
                          borderRadius: '10px',
                          background: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <div className="flex items-center justify-between gap-3" style={{ marginBottom: '6px' }}>
                          <div style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-primary)' }}>
                            {run.builderName}
                          </div>
                          <div
                            className="font-mono-dm"
                            style={{
                              fontSize: '10px',
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              color: run.status === 'succeeded'
                                ? '#5ab88e'
                                : run.status === 'failed'
                                  ? 'var(--risk)'
                                  : '#a78bfa',
                            }}
                          >
                            {run.status}
                          </div>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
                          {run.adapter} · {run.filesWritten} file{run.filesWritten === 1 ? '' : 's'}
                          {run.jobId ? ` · ${run.jobId.slice(0, 8)}` : ''}
                        </div>
                        <div className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)' }}>
                          {run.scopePaths.join(' · ')}
                        </div>
                        {run.errorText && (
                          <div style={{ fontSize: '11px', color: 'var(--risk)', marginTop: '6px' }}>
                            {run.errorText}
                          </div>
                        )}
                        {buildExec.getJobOutput(run.jobId)?.stdout && (
                          <pre style={{
                            marginTop: '8px',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: 'rgba(0,0,0,0.22)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            fontSize: '11px',
                            lineHeight: 1.55,
                            color: 'rgba(232,230,224,0.72)',
                            whiteSpace: 'pre-wrap',
                            overflowX: 'auto',
                          }}>
                            {buildExec.getJobOutput(run.jobId)?.stdout}
                          </pre>
                        )}
                        {buildExec.getJobOutput(run.jobId)?.stderr && (
                          <pre style={{
                            marginTop: '8px',
                            padding: '10px 12px',
                            borderRadius: '8px',
                            background: 'rgba(224,90,90,0.08)',
                            border: '1px solid rgba(224,90,90,0.2)',
                            fontSize: '11px',
                            lineHeight: 1.55,
                            color: 'var(--risk)',
                            whiteSpace: 'pre-wrap',
                            overflowX: 'auto',
                          }}>
                            {buildExec.getJobOutput(run.jobId)?.stderr}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {buildExec.sessionProgress.errorText && (
                  <div style={{
                    padding: '10px 14px', borderRadius: '8px',
                    background: 'rgba(224,90,90,0.06)', border: '1px solid rgba(224,90,90,0.15)',
                    fontSize: '12px', color: 'var(--risk)', marginBottom: '14px',
                  }}>
                    {buildExec.sessionProgress.errorText}
                  </div>
                )}

                {buildExec.sessionProgress.status === 'succeeded' && buildExec.sessionProgress.manifest.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '16px' }}>
                    {buildExec.sessionProgress.manifest.slice(0, 20).map(f => (
                      <div key={f.path} className="flex items-center gap-2" style={{
                        padding: '5px 10px', borderRadius: '6px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.04)',
                      }}>
                        <FileCode size={11} style={{ color: '#a78bfa', flexShrink: 0 }} />
                        <span className="font-mono-dm" style={{ fontSize: '11px', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.path}
                        </span>
                      </div>
                    ))}
                    {buildExec.sessionProgress.manifest.length > 20 && (
                      <span style={{ fontSize: '11px', color: 'var(--text-dim)', padding: '4px 10px' }}>
                        …and {buildExec.sessionProgress.manifest.length - 20} more files
                      </span>
                    )}
                  </div>
                )}

                {buildExec.sessionProgress.jobId && buildExec.sessionRuns.length <= 1 && (
                  <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'monospace', display: 'block' }}>
                    Job: {buildExec.sessionProgress.jobId.slice(0, 8)}
                  </span>
                )}
              </div>
            </section>
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
                <LaneBar key={lane.id} lane={lane} stage={stage} writtenFiles={writtenFiles} buildResponses={buildResponses} bouncerLoading={bouncerLoading} />
              ))}
              {reviewers.map(lane => (
                <LaneBar key={lane.id} lane={lane} stage={stage} writtenFiles={writtenFiles} buildResponses={buildResponses} bouncerLoading={bouncerLoading} />
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
              <span className="font-mono-dm" style={{ fontSize: '11px', letterSpacing: '0.15em', color: 'var(--text-dim)', marginBottom: '8px' }}>
                Writing files to GitHub…
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Maestro is creating execution artifacts, branches, and pull requests from the approved builder manifests.
              </span>
            </div>
          )}

          {stage === 'complete' && bouncerLoading && (
            <div className="flex flex-col items-center" style={{ padding: '16px 0 28px' }}>
              <Loader2 size={24} className="animate-spin" style={{ color: 'var(--gold)', marginBottom: '12px' }} />
              <span className="font-mono-dm" style={{ fontSize: '10px', letterSpacing: '0.12em', color: 'var(--gold)', marginBottom: '6px' }}>
                Bouncer running…
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                Reviewing the written files for security and approval risks.
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

              {(stage === 'complete' || stage === 'bouncer' || stage === 'done') && (
                <div style={{ marginTop: '16px' }}>
                  <BouncerCard
                    result={bouncerResult}
                    loading={bouncerLoading}
                    error={bouncerError}
                    elapsedMs={bouncerElapsedMs}
                    showActions={stage === 'bouncer'}
                    onRun={stage === 'complete' ? handleBouncer : undefined}
                    onDecision={handleConductorDecision}
                  />
                </div>
              )}
            </section>
          )}

          {/* ── Completeness Gate ─────────────────────────── */}
          {completenessResult && (stage === 'bouncer' || stage === 'done') && (
            <section style={{ marginBottom: '20px' }}>
              <div className="flex items-center gap-2" style={{ marginBottom: '10px' }}>
                <ClipboardCheck size={14} style={{
                  color: completenessResult.verdict === 'complete' ? 'var(--signal-ok, #4ade80)'
                    : completenessResult.verdict === 'scaffold_only' ? 'var(--gold)'
                    : 'var(--risk, #ef4444)',
                }} />
                <span className="font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-dim)' }}>
                  Completeness Gate
                </span>
                <span className="font-mono-dm" style={{
                  fontSize: '9px', marginLeft: '8px',
                  color: completenessResult.verdict === 'complete' ? 'var(--signal-ok, #4ade80)'
                    : completenessResult.verdict === 'scaffold_only' ? 'var(--gold)'
                    : 'var(--risk, #ef4444)',
                }}>
                  {completenessResult.verdict.replace(/_/g, ' ')}
                </span>
              </div>
              <p style={{ fontSize: '12px', lineHeight: 1.5, color: 'rgba(232,230,224,0.7)', marginBottom: '10px' }}>
                {completenessResult.summary}
              </p>
              {completenessResult.missing_critical.length > 0 && (
                <div style={{ padding: '8px 12px', borderRadius: '10px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.12)', marginBottom: '8px' }}>
                  <div className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--risk, #ef4444)', marginBottom: '4px', letterSpacing: '0.1em' }}>
                    MISSING CRITICAL
                  </div>
                  {completenessResult.missing_critical.map(f => (
                    <div key={f} style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '2px 0' }}>• {f}</div>
                  ))}
                </div>
              )}
              {completenessResult.import_issues.length > 0 && (
                <div style={{ padding: '8px 12px', borderRadius: '10px', background: 'rgba(201,168,76,0.06)', border: '1px solid rgba(201,168,76,0.12)' }}>
                  <div className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--gold)', marginBottom: '4px', letterSpacing: '0.1em' }}>
                    IMPORT ISSUES ({completenessResult.import_issues.length})
                  </div>
                  {completenessResult.import_issues.slice(0, 5).map((issue, i) => (
                    <div key={i} style={{ fontSize: '11px', color: 'var(--text-muted)', padding: '2px 0' }}>• {issue}</div>
                  ))}
                  {completenessResult.import_issues.length > 5 && (
                    <div style={{ fontSize: '10px', color: 'var(--text-dim)', padding: '2px 0' }}>
                      + {completenessResult.import_issues.length - 5} more
                    </div>
                  )}
                </div>
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
        </>
      )}
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

function LaneBar({
  lane,
  stage,
  writtenFiles,
  buildResponses,
  bouncerLoading,
}: {
  lane: LaneRow;
  stage: BuildStage;
  writtenFiles: string[];
  buildResponses: Response[];
  bouncerLoading: boolean;
}) {
  const badge = ROLE_BADGE[lane.role];
  const isBuilder = lane.role === 'builder';

  const laneFiles = isBuilder
    ? writtenFiles.filter(f => lane.lane_paths.some(p => f.startsWith(p.replace(/\*+$/, ''))))
    : [];
  const hasProgress = stage !== 'ready' && isBuilder;
  const isDone = stage === 'complete' || stage === 'bouncer' || stage === 'done';
  const isWaiting = stage === 'executing' && !isBuilder;
  const responseReady = buildResponses.some(response => laneMatchesResponse(lane, response));
  const progressWidth = isDone
    ? '100%'
    : stage === 'executing'
      ? (isBuilder ? '82%' : '45%')
      : stage === 'reviewing' || stage === 'ready'
        ? (responseReady ? '70%' : '24%')
        : stage === 'broadcasting'
          ? (responseReady ? '62%' : '18%')
          : '0%';
  const statusLabel = isDone && isBuilder
    ? `${laneFiles.length} files`
    : bouncerLoading
      ? (isBuilder ? 'Built' : 'Reviewing')
      : stage === 'executing' && isBuilder
        ? 'Writing…'
        : stage === 'reviewing' || stage === 'ready'
          ? (responseReady ? 'Review' : 'Missing')
          : stage === 'broadcasting'
            ? (responseReady ? 'Ready' : 'Waiting')
            : isWaiting
              ? 'Waiting'
              : stage === 'plan_review' || stage === 'preparing'
                ? 'Queued'
                : badge.label;

  return (
    <div className="flex items-center gap-3" style={{
      padding: '10px 14px', borderRadius: '10px',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid rgba(255,255,255,0.05)',
    }}>
      <span className="font-mono-dm" style={{ fontSize: '11px', color: 'var(--text)', minWidth: '140px' }}>
        {lane.agent_name}
      </span>

      <span className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', flex: 1 }}>
        {isBuilder ? lane.lane_paths.join(', ') : '(reads all)'}
      </span>

      {hasProgress && (
        <div style={{ width: '80px', height: '4px', borderRadius: '2px', background: 'rgba(255,255,255,0.06)', overflow: 'hidden' }}>
          <div style={{
            width: progressWidth,
            height: '100%', borderRadius: '2px',
            background: isDone ? 'var(--ok)' : badge.color,
            transition: 'width 0.5s ease',
          }} />
        </div>
      )}

      <span className="font-mono-dm" style={{
        fontSize: '9px', letterSpacing: '0.1em',
        color: isDone && isBuilder ? 'var(--ok)'
          : stage === 'executing' || bouncerLoading ? badge.color
          : 'var(--text-dim)',
        minWidth: '60px', textAlign: 'right',
      }}>
        {statusLabel}
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
























