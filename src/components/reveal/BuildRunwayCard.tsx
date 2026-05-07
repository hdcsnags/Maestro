import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  AlertCircle, CheckCircle2, Cloud, ExternalLink, FileCode, Files,
  GitBranch, Hammer, LayoutPanelTop, Loader2, Monitor, Play, RefreshCw,
  Server, X, Zap,
} from 'lucide-react';
import { invokeEdgeFunction } from '../../lib/functions';
import { selectOnlineExecutor } from '../../lib/sessionBuild';
import { useMaestro } from '../../context/MaestroContext';
import { useBouncerReview } from '../../hooks/useBouncerReview';
import { useBuildExecution } from '../../hooks/useBuildExecution';
import { useThreads } from '../../hooks/useThreads';
import type { BuildPlan, BuildTask, ClawBuildSessionState } from '../../types';
import BouncerCard from './BouncerCard';

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

type RunwayStepKey = 'plan' | 'scope' | 'execute' | 'review' | 'push';

interface PushResultState {
  pushState: 'idle' | 'pushing' | 'done' | 'failed';
  pushError: string | null;
  pushPrUrls: string[];
  pushWrittenFiles: string[];
  pushSkippedFiles: Array<{ path: string; reason: string }>;
  pushBackupBranch: string;
  pushCollisionCount: number;
  pushHandoffs: Array<{ from_agent: string; path: string }>;
}

const RUNWAY_STEPS: Array<{ key: RunwayStepKey; label: string }> = [
  { key: 'plan', label: 'Plan' },
  { key: 'scope', label: 'Scope' },
  { key: 'execute', label: 'Execute' },
  { key: 'review', label: 'Review' },
  { key: 'push', label: 'Push' },
];

function safeText(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function safeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function norm(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function formatBackendLabel(backend: ClawBuildSessionState['executionBackend'] | undefined): string {
  if (backend === 'local') return 'Local session build';
  if (backend === 'auto') return 'Auto / hybrid routing';
  return 'Edge task build';
}

function formatAdapterLabel(adapter: string): string {
  if (adapter === 'claude_code') return 'Claude Code';
  if (adapter === 'codex_cli') return 'OpenAI Codex';
  if (adapter === 'copilot_cli') return 'GitHub Copilot';
  return adapter;
}

function resolveTaskBackend(task: BuildTask, agents: ReturnType<typeof useMaestro>['state']['agents'], executors: ReturnType<typeof useMaestro>['state']['executors'], sessionBackend: ClawBuildSessionState['executionBackend'] | undefined): 'local' | 'edge' {
  const agent = agents.find(candidate => candidate.id === task.lane_owner);
  if (agent?.provider_group === 'maestroclaw') return 'local';

  const backend = task.execution_backend ?? sessionBackend ?? 'edge';
  if (backend === 'local') return 'local';
  if (backend === 'edge') return 'edge';

  const adapter = agent?.provider_group === 'maestroclaw' ? agent.model : 'claude_code';
  return selectOnlineExecutor(executors, adapter) ? 'local' : 'edge';
}

function createEmptyPushState(): PushResultState {
  return {
    pushState: 'idle',
    pushError: null,
    pushPrUrls: [],
    pushWrittenFiles: [],
    pushSkippedFiles: [],
    pushBackupBranch: '',
    pushCollisionCount: 0,
    pushHandoffs: [],
  };
}

export default function BuildRunwayCard({ session }: { session: ClawBuildSessionState }) {
  const { state, dispatch } = useMaestro();
  const buildExec = useBuildExecution();
  const { addMessage } = useThreads();
  const [scopeOverride, setScopeOverride] = useState(session.suggestedScope || '**');
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState('');
  const [retryNonce, setRetryNonce] = useState(0);
  const [pushResult, setPushResult] = useState<PushResultState>(createEmptyPushState());
  const planFetchTokenRef = useRef(0);

  const currentSession = state.activeSession;
  const normalizedBuildPlan = useMemo<NormalizedBuildPlan | null>(() => {
    if (!state.buildPlan) return null;
    return {
      build_prompt: safeText(state.buildPlan.build_prompt),
      build_summary: safeText(state.buildPlan.build_summary, 'Concierge prepared a build plan.'),
      builder_agents: Array.isArray(state.buildPlan.builder_agents)
        ? state.buildPlan.builder_agents.map((builder) => ({
          agent_id: safeText(builder.agent_id),
          agent_name: safeText(builder.agent_name, 'Builder'),
          scoped_paths: safeStringArray(builder.scoped_paths),
          instruction: safeText(builder.instruction, 'Build the assigned scope.'),
        }))
        : [],
    };
  }, [state.buildPlan]);

  const resolvePlannedBuilder = useCallback((builder: NormalizedBuilderAgent) => {
    if (builder.agent_id) {
      const exact = state.agents.find(agent => agent.id === builder.agent_id);
      if (exact) return exact;
    }

    const label = norm(builder.agent_name);
    if (!label) return null;

    return state.agents.find((agent) => {
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
  }, [state.agents]);

  const plannedBuilders = useMemo(() => {
    return (normalizedBuildPlan?.builder_agents ?? []).map((builder) => {
      const resolved = resolvePlannedBuilder(builder);
      return {
        ...builder,
        resolvedId: resolved?.id ?? null,
        displayName: resolved?.display_name || resolved?.name || builder.agent_name,
        model: resolved?.model ?? null,
        providerGroup: resolved?.provider_group ?? null,
      };
    });
  }, [normalizedBuildPlan, resolvePlannedBuilder]);

  const localSessionSpecs = useMemo(() => {
    return plannedBuilders.reduce<Array<{
      builderName: string;
      adapter: string;
      scopePaths: string[];
      instruction?: string;
    }>>((acc, builder) => {
      if (builder.providerGroup !== 'maestroclaw' || !builder.model) return acc;
      acc.push({
        builderName: builder.displayName,
        adapter: builder.model,
        scopePaths: builder.scoped_paths.length > 0 ? builder.scoped_paths : ['**'],
        instruction: builder.instruction,
      });
      return acc;
    }, []);
  }, [plannedBuilders]);

  const usesSessionBuild = currentSession?.execution_backend === 'local' && localSessionSpecs.length > 0;
  const taskManifest = buildExec.collectManifest();
  const sessionManifest = buildExec.collectSessionManifest();
  const taskResultsAvailable = buildExec.tasks.length > 0;
  const reviewReady = usesSessionBuild
    ? (buildExec.sessionProgress.status === 'succeeded' || buildExec.sessionProgress.status === 'failed') && !buildExec.isSessionRunning
    : taskResultsAvailable && !buildExec.isRunning && !buildExec.isDecomposing;

  const currentStep: RunwayStepKey = planLoading || !normalizedBuildPlan
    ? 'plan'
    : pushResult.pushState === 'pushing' || pushResult.pushState === 'done' || pushResult.pushState === 'failed'
      ? 'push'
      : buildExec.isDecomposing || buildExec.isRunning || buildExec.isSessionRunning || buildExec.tasks.some(task => task.status === 'dispatched')
        ? 'execute'
        : reviewReady
          ? 'review'
          : 'scope';

  const activeStepIndex = RUNWAY_STEPS.findIndex(step => step.key === currentStep);
  const canPush = usesSessionBuild ? sessionManifest.length > 0 : taskManifest.length > 0;
  const failedTaskIds = buildExec.tasks.filter(task => task.status === 'failed').map(task => task.id);
  const bouncerBuildFiles = useMemo(() => {
    const manifest = usesSessionBuild ? sessionManifest : taskManifest;
    return manifest
      .filter((entry) => entry.content && entry.operation !== 'delete')
      .map((entry) => ({ path: entry.path, content: entry.content!, operation: entry.operation }));
  }, [usesSessionBuild, sessionManifest, taskManifest]);
  const {
    bouncerLoading,
    bouncerResult,
    bouncerError,
    elapsedMs: bouncerElapsedMs,
    runBouncer,
    handleConductorDecision,
  } = useBouncerReview({
    session: currentSession,
    writtenFiles: pushResult.pushWrittenFiles,
    buildFiles: bouncerBuildFiles,
  });

  const taskCountsByBackend = useMemo(() => {
    return buildExec.tasks.reduce((acc, task) => {
      const backend = resolveTaskBackend(task, state.agents, state.executors, currentSession?.execution_backend);
      acc[backend].total += 1;
      if (task.status === 'completed') acc[backend].completed += 1;
      return acc;
    }, {
      local: { total: 0, completed: 0 },
      edge: { total: 0, completed: 0 },
    });
  }, [buildExec.tasks, state.agents, state.executors, currentSession?.execution_backend]);

  useEffect(() => {
    setScopeOverride(session.suggestedScope || '**');
    setPushResult(createEmptyPushState());
    setPlanError('');
    setRetryNonce(0);
  }, [session.threadId, session.suggestedScope]);

  useEffect(() => {
    if (!currentSession || normalizedBuildPlan) return;
    let cancelled = false;
    const token = ++planFetchTokenRef.current;
    setPlanLoading(true);
    setPlanError('');

    void invokeEdgeFunction<BuildPlan>('concierge', {
      session_id: currentSession.id,
      phase: 'pre_build_complete',
    }).then((plan) => {
      if (cancelled) return;
      dispatch({ type: 'SET_BUILD_PLAN', payload: plan });
    }).catch((error) => {
      if (cancelled) return;
      setPlanError(error instanceof Error ? error.message : 'Concierge could not prepare a build plan.');
    }).finally(() => {
      // Only clear loading if this is still the latest request.
      // Using a token ref instead of `cancelled` prevents a newer in-flight
      // request from having its spinner cleared by an older resolving fetch.
      // When `normalizedBuildPlan` becomes truthy (e.g. BuildWorkspace won the
      // race), cleanup sets cancelled=true but no new effect starts (early-return
      // guard), so token still matches and loading clears correctly.
      if (planFetchTokenRef.current === token) setPlanLoading(false);
    });

    return () => { cancelled = true; };
  }, [currentSession?.id, normalizedBuildPlan, retryNonce, dispatch]);

  useEffect(() => {
    if (!currentSession || usesSessionBuild || buildExec.tasks.length > 0) return;
    void buildExec.loadTasks(currentSession.id);
  }, [currentSession, usesSessionBuild, buildExec]);

  useEffect(() => {
    if (!currentSession) return;
    const latestRun = state.executionRuns
      .filter(run => run.session_id === currentSession.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

    if (!latestRun?.result) return;
    const result = latestRun.result as Record<string, unknown>;
    const prs = Array.isArray(result.prs) ? result.prs.filter((entry): entry is string => typeof entry === 'string') : [];
    const writtenFiles = Array.isArray(result.written_files) ? result.written_files.filter((entry): entry is string => typeof entry === 'string') : [];
    const skippedFiles = Array.isArray(result.skipped_files)
      ? result.skipped_files.filter((entry): entry is { path: string; reason: string } => typeof entry === 'object' && entry !== null && typeof (entry as { path?: unknown }).path === 'string' && typeof (entry as { reason?: unknown }).reason === 'string')
      : [];
    const handoffs = Array.isArray(result.handoffs_requested)
      ? result.handoffs_requested.filter((entry): entry is { from_agent: string; path: string } => typeof entry === 'object' && entry !== null && typeof (entry as { from_agent?: unknown }).from_agent === 'string' && typeof (entry as { path?: unknown }).path === 'string')
      : [];

    if (prs.length === 0 && writtenFiles.length === 0 && skippedFiles.length === 0) return;
    setPushResult({
      pushState: latestRun.status === 'failed' ? 'failed' : 'done',
      pushError: latestRun.status === 'failed' ? safeText(result.error, null as unknown as string) : null,
      pushPrUrls: prs,
      pushWrittenFiles: writtenFiles,
      pushSkippedFiles: skippedFiles,
      pushBackupBranch: safeText(result.backup_branch),
      pushCollisionCount: Array.isArray(result.collisions) ? result.collisions.length : 0,
      pushHandoffs: handoffs,
    });
  }, [currentSession, state.executionRuns]);

  const handleOpenAdvancedView = useCallback(() => {
    dispatch({ type: 'SET_BUILD_DRAWER_EXPANDED', payload: true });
  }, [dispatch]);

  const handleDismiss = useCallback(() => {
    if (buildExec.isRunning || buildExec.isSessionRunning || pushResult.pushState === 'pushing') return;
    dispatch({ type: 'SET_CLAW_BUILD_SESSION', payload: null });
  }, [buildExec.isRunning, buildExec.isSessionRunning, pushResult.pushState, dispatch]);

  const handleStartBuild = useCallback(async () => {
    if (!currentSession || !normalizedBuildPlan) return;
    setPlanError('');
    setPushResult(createEmptyPushState());

    if (usesSessionBuild) {
      buildExec.resetSessionBuildState();
      const scopedSpecs = scopeOverride.trim().length > 0
        ? localSessionSpecs.map((spec) => ({ ...spec, scopePaths: [scopeOverride.trim()] }))
        : localSessionSpecs;
      await buildExec.executeSessionPlan(scopedSpecs);
      return;
    }

    await buildExec.decompose(currentSession.id);
    await buildExec.execute();
  }, [currentSession, normalizedBuildPlan, usesSessionBuild, buildExec, scopeOverride, localSessionSpecs]);

  const handleRetryFailed = useCallback(async () => {
    if (failedTaskIds.length === 0) return;
    await Promise.all(failedTaskIds.map((taskId) => buildExec.retryTask(taskId)));
    await buildExec.execute();
  }, [failedTaskIds, buildExec]);

  const handlePush = useCallback(async () => {
    setPushResult(createEmptyPushState());
    setPushResult(prev => ({ ...prev, pushState: 'pushing' }));

    try {
      const result = usesSessionBuild
        ? await buildExec.pushSessionBuildToGithub()
        : await buildExec.pushTaskBuildToGithub();

      setPushResult({
        pushState: 'done',
        pushError: null,
        pushPrUrls: result.prUrls,
        pushWrittenFiles: result.writtenFiles,
        pushSkippedFiles: result.skippedFiles,
        pushBackupBranch: result.backupBranch,
        pushCollisionCount: result.collisionCount,
        pushHandoffs: result.handoffs,
      });
      await addMessage(session.threadId, 'system', 'Pull request ready.', undefined, {
        kind: 'pr_opened',
        system_event: {
          tone: 'pr',
          title: 'Pull request ready',
          body: `${result.writtenFiles.length} files written${result.skippedFiles.length > 0 ? ` · ${result.skippedFiles.length} skipped` : ''}`,
          pr_urls: result.prUrls,
          written_files: result.writtenFiles,
          skipped_files: result.skippedFiles,
          backup_branch: result.backupBranch,
        },
      });
    } catch (error) {
      setPushResult(prev => ({
        ...prev,
        pushState: 'failed',
        pushError: error instanceof Error ? error.message : String(error),
      }));
    }
  }, [usesSessionBuild, buildExec, addMessage, session.threadId]);

  return (
    <div className="mx-3 mb-3 overflow-hidden rounded-2xl border border-signal-ok/25 bg-signal-ok/[0.04]">
      <div className="border-b border-signal-ok/15 px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-signal-ok/15 text-signal-ok/90">
              {buildExec.isRunning || buildExec.isDecomposing || buildExec.isSessionRunning || pushResult.pushState === 'pushing'
                ? <Loader2 size={16} className="animate-spin" />
                : <Hammer size={16} />}
            </div>
            <div>
              <div className="font-mono-dm text-[11px] uppercase tracking-[0.18em] text-signal-ok/90">
                Build Runway
              </div>
              <div className="mt-1 text-xs text-white/55">
                {formatBackendLabel(currentSession?.execution_backend)}
                {normalizedBuildPlan?.builder_agents.length ? ` · ${normalizedBuildPlan.builder_agents.length} builders planned` : ''}
              </div>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 transition-colors hover:bg-white/[0.06] hover:text-white/70"
            aria-label="Dismiss build runway card"
          >
            <X size={12} />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-5 gap-2">
          {RUNWAY_STEPS.map((step, index) => {
            const isActive = index === activeStepIndex;
            const isComplete = index < activeStepIndex;
            return (
              <div
                key={step.key}
                className={`rounded-xl border px-3 py-2 ${isActive
                  ? 'border-signal-ok/30 bg-signal-ok/12'
                  : isComplete
                    ? 'border-white/10 bg-white/[0.05]'
                    : 'border-white/[0.06] bg-white/[0.02]'}`}
              >
                <div className="font-mono-dm text-[9px] uppercase tracking-[0.16em] text-white/40">{step.label}</div>
                <div className={`mt-1 text-[11px] ${isActive ? 'text-signal-ok/90' : isComplete ? 'text-white/75' : 'text-white/45'}`}>
                  {isActive ? 'Active' : isComplete ? 'Ready' : 'Queued'}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-5 px-4 py-4">
        <section className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <div className="mb-2 font-mono-dm text-[10px] uppercase tracking-[0.16em] text-white/40">Plan</div>
          {planLoading && (
            <div className="flex items-center gap-2 text-sm text-white/60">
              <Loader2 size={14} className="animate-spin" />
              Concierge is preparing the build plan…
            </div>
          )}
          {!planLoading && normalizedBuildPlan && (
            <div className="space-y-3">
              <p className="text-sm leading-7 text-white/80">
                {normalizedBuildPlan.build_summary || safeText(currentSession?.build_spec?.requested_build_prompt, 'Build plan ready.')}
              </p>
              <div className="rounded-xl border border-white/[0.06] bg-black/10 px-3 py-2 text-xs leading-6 text-white/55">
                {normalizedBuildPlan.build_prompt || safeText(currentSession?.build_spec?.requested_build_prompt, 'No build prompt recorded yet.')}
              </div>
            </div>
          )}
          {planError && (
            <div className="mt-3 space-y-2">
              <div className="flex items-start gap-2 rounded-xl border border-signal-risk/20 bg-signal-risk/8 px-3 py-2 text-sm text-signal-risk/85">
                <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                <span>{planError}</span>
              </div>
              <button
                onClick={() => setRetryNonce(n => n + 1)}
                className="reveal-pill"
                style={{ height: '30px', fontSize: '11px', padding: '0 12px' }}
              >
                Retry plan
              </button>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="font-mono-dm text-[10px] uppercase tracking-[0.16em] text-white/40">Scope</div>
              <div className="mt-1 text-xs text-white/55">
                {usesSessionBuild ? 'Local session scopes can be narrowed before execution.' : 'Task execution will follow the locked builder lanes and backend routing.'}
              </div>
            </div>
            <button
              onClick={handleOpenAdvancedView}
              className="reveal-pill"
              style={{ height: '34px', fontSize: '11px', padding: '0 14px' }}
            >
              <LayoutPanelTop size={12} />
              Open advanced view
            </button>
          </div>

          {usesSessionBuild && (
            <label className="mb-3 block">
              <span className="mb-1 block font-mono-dm text-[10px] uppercase tracking-[0.14em] text-white/35">Scope override</span>
              <input
                type="text"
                value={scopeOverride}
                onChange={(event) => setScopeOverride(event.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-black/10 px-3 py-2 font-mono text-xs text-white/75 outline-none transition-colors focus:border-signal-ok/35"
                placeholder="src/**"
              />
            </label>
          )}

          <div className="space-y-2">
            {plannedBuilders.map((builder, index) => (
              <RunwayLaneBar
                key={`${builder.resolvedId ?? builder.agent_name}-${index}`}
                name={builder.displayName}
                model={builder.model}
                paths={builder.scoped_paths}
                mode={usesSessionBuild ? 'session' : 'task'}
                sessionRuns={buildExec.sessionRuns}
                tasks={buildExec.tasks}
                resolvedId={builder.resolvedId}
              />
            ))}
            {plannedBuilders.length === 0 && (
              <div className="rounded-xl border border-dashed border-white/[0.08] px-3 py-3 text-sm text-white/45">
                Builder lanes will appear here once Concierge finishes the plan.
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={handleStartBuild}
              disabled={planLoading || !normalizedBuildPlan}
              className="reveal-pill"
              style={{
                height: '38px',
                fontSize: '12px',
                padding: '0 16px',
                background: 'var(--gold)',
                color: 'var(--void)',
                borderColor: 'transparent',
                fontWeight: 600,
                opacity: planLoading || !normalizedBuildPlan ? 0.5 : 1,
              }}
            >
              <Play size={12} />
              {usesSessionBuild ? 'Start runway build' : 'Start task build'}
            </button>
            {!usesSessionBuild && failedTaskIds.length > 0 && (
              <button
                onClick={handleRetryFailed}
                className="reveal-pill"
                style={{ height: '38px', fontSize: '12px', padding: '0 16px' }}
              >
                <RefreshCw size={12} />
                Retry failed tasks
              </button>
            )}
          </div>
        </section>

        <section className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <div className="mb-2 font-mono-dm text-[10px] uppercase tracking-[0.16em] text-white/40">Execute</div>
          {usesSessionBuild ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-4 text-sm text-white/65">
                <span className="flex items-center gap-1.5"><Server size={13} /> {buildExec.sessionRuns.length || localSessionSpecs.length} session lane{(buildExec.sessionRuns.length || localSessionSpecs.length) === 1 ? '' : 's'}</span>
                <span className="flex items-center gap-1.5"><Files size={13} /> {buildExec.sessionProgress.filesWritten} files written</span>
                <span className="flex items-center gap-1.5"><Zap size={13} /> {buildExec.sessionProgress.status}</span>
              </div>
              {buildExec.sessionRuns.length > 0 && (
                <div className="space-y-2">
                  {buildExec.sessionRuns.map((run) => (
                    <div key={run.key} className="rounded-xl border border-white/[0.08] bg-black/10 px-3 py-3">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="text-white/75">{run.builderName}</span>
                        <span className={run.status === 'succeeded' ? 'text-signal-ok/85' : run.status === 'failed' ? 'text-signal-risk/85' : 'text-white/45'}>
                          {run.status}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-white/45">
                        {formatAdapterLabel(run.adapter)} · {run.scopePaths.join(', ')}
                      </div>
                      {run.errorText && (
                        <div className="mt-2 text-xs text-signal-risk/80">{run.errorText}</div>
                      )}
                      {buildExec.getJobOutput(run.jobId)?.stdout && (
                        <pre className="mt-2 overflow-x-auto rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-[11px] leading-5 text-white/65 whitespace-pre-wrap">
                          {buildExec.getJobOutput(run.jobId)?.stdout}
                        </pre>
                      )}
                      {buildExec.getJobOutput(run.jobId)?.stderr && (
                        <pre className="mt-2 overflow-x-auto rounded-lg border border-signal-risk/20 bg-signal-risk/8 px-3 py-2 text-[11px] leading-5 text-signal-risk/80 whitespace-pre-wrap">
                          {buildExec.getJobOutput(run.jobId)?.stderr}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-4 text-sm text-white/65">
                <span className="flex items-center gap-1.5">
                  <FileCode size={13} />
                  {buildExec.progress.completed}/{buildExec.progress.total || 0} tasks complete
                </span>
                <span className="flex items-center gap-1.5">
                  <Cloud size={13} />
                  {taskCountsByBackend.edge.completed}/{taskCountsByBackend.edge.total} edge
                </span>
                <span className="flex items-center gap-1.5">
                  <Monitor size={13} />
                  {taskCountsByBackend.local.completed}/{taskCountsByBackend.local.total} local
                </span>
              </div>

              <div className="space-y-2">
                {buildExec.tasks.slice(0, 10).map((task) => {
                  const backend = resolveTaskBackend(task, state.agents, state.executors, currentSession?.execution_backend);
                  return (
                    <div key={task.id} className="rounded-xl border border-white/[0.08] bg-black/10 px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-sm text-white/75">
                          {backend === 'edge' ? <Cloud size={13} className="text-gold/80" /> : <Monitor size={13} className="text-signal-ok/85" />}
                          <span className="font-mono">{task.file_path}</span>
                        </div>
                        <span className={task.status === 'completed' ? 'text-signal-ok/85' : task.status === 'failed' ? 'text-signal-risk/85' : 'text-white/45'}>
                          {task.status}
                        </span>
                      </div>
                      {task.failure_reason && (
                        <div className="mt-2 text-xs text-signal-risk/80">{task.failure_reason}</div>
                      )}
                      {buildExec.getJobOutput(task.executor_job_id)?.stdout && backend === 'local' && (
                        <pre className="mt-2 overflow-x-auto rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2 text-[11px] leading-5 text-white/65 whitespace-pre-wrap">
                          {buildExec.getJobOutput(task.executor_job_id)?.stdout}
                        </pre>
                      )}
                      {buildExec.getJobOutput(task.executor_job_id)?.stderr && (
                        <pre className="mt-2 overflow-x-auto rounded-lg border border-signal-risk/20 bg-signal-risk/8 px-3 py-2 text-[11px] leading-5 text-signal-risk/80 whitespace-pre-wrap">
                          {buildExec.getJobOutput(task.executor_job_id)?.stderr}
                        </pre>
                      )}
                    </div>
                  );
                })}
                {buildExec.tasks.length > 10 && (
                  <div className="text-xs text-white/45">+{buildExec.tasks.length - 10} more tasks in the advanced view</div>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <div className="mb-2 font-mono-dm text-[10px] uppercase tracking-[0.16em] text-white/40">Review</div>
          {usesSessionBuild ? (
            <div className="space-y-2">
              <div className="text-sm text-white/75">
                {sessionManifest.length} manifest file{sessionManifest.length === 1 ? '' : 's'} ready for push.
              </div>
              {buildExec.sessionProgress.errorText && (
                <div className="rounded-xl border border-signal-risk/20 bg-signal-risk/8 px-3 py-2 text-sm text-signal-risk/85">
                  {buildExec.sessionProgress.errorText}
                </div>
              )}
              <ManifestPreview entries={sessionManifest.map((entry) => ({
                path: entry.path,
                operation: entry.operation,
              }))} />
            </div>
          ) : (
            <div className="space-y-2">
              <div className="text-sm text-white/75">
                {taskManifest.length} task manifest file{taskManifest.length === 1 ? '' : 's'} ready for push.
                {buildExec.progress.failed > 0 ? ` ${buildExec.progress.failed} failed task${buildExec.progress.failed === 1 ? '' : 's'} still need attention.` : ''}
              </div>
              <ManifestPreview entries={taskManifest.map((entry) => ({
                path: entry.path,
                operation: entry.operation,
              }))} />
            </div>
          )}
        </section>

        <section className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-4">
          <div className="mb-2 font-mono-dm text-[10px] uppercase tracking-[0.16em] text-white/40">Push</div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handlePush}
              disabled={!canPush || pushResult.pushState === 'pushing'}
              className="reveal-pill"
              style={{
                height: '38px',
                fontSize: '12px',
                padding: '0 16px',
                background: !canPush ? 'rgba(255,255,255,0.06)' : 'rgba(90,184,142,0.16)',
                borderColor: !canPush ? 'rgba(255,255,255,0.08)' : 'rgba(90,184,142,0.3)',
                color: !canPush ? 'var(--text-dim)' : '#5ab88e',
                fontWeight: 600,
                opacity: pushResult.pushState === 'pushing' ? 0.75 : 1,
              }}
            >
              {pushResult.pushState === 'pushing' ? <Loader2 size={12} className="animate-spin" /> : <GitBranch size={12} />}
              {state.activeRepoConnection?.id ? 'Push to GitHub' : 'Connect GitHub repo'}
            </button>
          </div>

          {pushResult.pushError && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-signal-risk/20 bg-signal-risk/8 px-3 py-2 text-sm text-signal-risk/85">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{pushResult.pushError}</span>
            </div>
          )}

          {(pushResult.pushState === 'done' || pushResult.pushPrUrls.length > 0) && (
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <RunwayStat label="Written" value={pushResult.pushWrittenFiles.length} />
                <RunwayStat label="Skipped" value={pushResult.pushSkippedFiles.length} />
                <RunwayStat label="Collisions" value={pushResult.pushCollisionCount} />
                <RunwayStat label="Handoffs" value={pushResult.pushHandoffs.length} />
              </div>

              {pushResult.pushBackupBranch && (
                <div className="text-xs text-white/45">
                  Backup branch: <code className="font-mono text-white/65">{pushResult.pushBackupBranch}</code>
                </div>
              )}

              {pushResult.pushPrUrls.length > 0 && (
                <div className="space-y-2">
                  {pushResult.pushPrUrls.map((url, index) => (
                    <a
                      key={`${url}-${index}`}
                      href={url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-2 text-sm text-signal-ok/85 hover:text-signal-ok"
                    >
                      <ExternalLink size={13} />
                      <span>Open PR {pushResult.pushPrUrls.length > 1 ? index + 1 : ''}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {(pushResult.pushState === 'done' || currentSession?.current_phase === 'bouncer' || currentSession?.current_phase === 'complete') && (
          <BouncerCard
            result={bouncerResult}
            loading={bouncerLoading}
            error={bouncerError}
            elapsedMs={bouncerElapsedMs}
            showActions={currentSession?.current_phase === 'bouncer'}
            onRun={pushResult.pushState === 'done' ? () => void runBouncer() : undefined}
            onDecision={handleConductorDecision}
          />
        )}
      </div>
    </div>
  );
}

function RunwayLaneBar({
  name,
  model,
  paths,
  mode,
  sessionRuns,
  tasks,
  resolvedId,
}: {
  name: string;
  model: string | null;
  paths: string[];
  mode: 'session' | 'task';
  sessionRuns: ReturnType<typeof useBuildExecution>['sessionRuns'];
  tasks: ReturnType<typeof useBuildExecution>['tasks'];
  resolvedId: string | null;
}) {
  const run = mode === 'session'
    ? sessionRuns.find((candidate) => candidate.builderName === name || candidate.adapter === model)
    : null;
  const laneTasks = mode === 'task'
    ? tasks.filter((task) => (resolvedId && task.lane_owner === resolvedId) || norm(task.result_builder ?? '') === norm(name))
    : [];
  const completedTasks = laneTasks.filter((task) => task.status === 'completed').length;
  const failedTasks = laneTasks.filter((task) => task.status === 'failed').length;

  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/10 px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-white/75">{name}</div>
          <div className="mt-1 text-xs text-white/45">
            {model ? `${formatAdapterLabel(model)} · ` : ''}{paths.length > 0 ? paths.join(', ') : '**'}
          </div>
        </div>
        {mode === 'session' ? (
          <span className={run?.status === 'succeeded' ? 'text-signal-ok/85 text-xs' : run?.status === 'failed' ? 'text-signal-risk/85 text-xs' : 'text-white/45 text-xs'}>
            {run?.status ?? 'planned'}
          </span>
        ) : (
          <span className={failedTasks > 0 ? 'text-signal-risk/85 text-xs' : completedTasks > 0 ? 'text-signal-ok/85 text-xs' : 'text-white/45 text-xs'}>
            {laneTasks.length > 0 ? `${completedTasks}/${laneTasks.length} tasks` : 'planned'}
          </span>
        )}
      </div>
    </div>
  );
}

function ManifestPreview({ entries }: { entries: Array<{ path: string; operation: string }> }) {
  if (entries.length === 0) {
    return <div className="text-sm text-white/45">No manifest entries yet.</div>;
  }

  return (
    <div className="space-y-1">
      {entries.slice(0, 8).map((entry, index) => (
        <div key={`${entry.path}-${index}`} className="flex items-center gap-2 text-xs text-white/55">
          {entry.operation === 'delete' ? <AlertCircle size={12} className="text-signal-risk/75" /> : <CheckCircle2 size={12} className="text-signal-ok/75" />}
          <span className="font-mono">{entry.path}</span>
        </div>
      ))}
      {entries.length > 8 && (
        <div className="text-xs text-white/45">+{entries.length - 8} more</div>
      )}
    </div>
  );
}

function RunwayStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/10 px-3 py-3">
      <div className="font-mono-dm text-lg text-white/80">{value}</div>
      <div className="font-mono-dm text-[9px] uppercase tracking-[0.14em] text-white/40">{label}</div>
    </div>
  );
}
