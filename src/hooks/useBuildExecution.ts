import { useCallback, useEffect, useRef, useState } from 'react';
import { invokeEdgeFunction } from '../lib/functions';
import { supabase } from '../lib/supabase';
import {
  applyArtifactPayloadToBuffer,
  cancelBuildSessionJob,
  createArtifactManifestBuffer,
  fetchExecutorJobArtifactManifest,
  getArtifactManifestFromBuffer,
  mergeSessionManifest,
  normalizeSessionManifest,
  selectOnlineExecutor,
  seedArtifactManifestBuffer,
  submitBuildSessionJob,
} from '../lib/sessionBuild';
import { useMaestro } from '../context/MaestroContext';
import { useAuth } from '../context/AuthContext';
import {
  BuildTask,
  BuildTaskStatus,
  Agent,
  Executor,
  ExecutorJob,
  SessionBuildManifestEntry,
  SessionBuildProgress,
  SessionRunProgress,
} from '../types';

// ── Types ──────────────────────────────────────────────────────────────────

interface TaskResult {
  path?: string;
  content?: string;
  operation?: string;
}

interface OrchestrateTaskResult {
  title?: string;
  content?: string;
  text?: string;
  path?: string;
  operation?: string;
  file_manifest?: Array<{ path: string; content: string; operation?: string }>;
  usage?: { total_tokens?: number };
}

export interface BuildProgress {
  total: number;
  completed: number;
  failed: number;
  skipped: number;
  dispatched: number;
  queued: number;
}

interface SessionGithubExecuteResult {
  status?: string;
  written_files?: string[];
  prs?: string[];
  errors?: string[];
  branches?: Array<{ branch?: string; pr_url?: string }>;
  backup_branch?: string;
  skipped_files?: Array<{ path: string; reason: string }>;
  collisions?: unknown[];
  handoffs_requested?: Array<{ from_agent: string; path: string }>;
}

interface SessionBuildSpec {
  builderName: string;
  adapter: string;
  scopePaths: string[];
  instruction?: string;
}

interface ExecutorJobSnapshot {
  id: string;
  status: string;
  artifact_manifest: unknown;
  error_text: string | null;
  result_summary: string | null;
}

interface ExecutorJobEventRow {
  job_id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
}

interface JobOutputState {
  stdout: string;
  stderr: string;
}

interface DecomposeResult {
  phase?: string;
  total_tasks?: number;
  total_files?: number;
  builder_summary?: string;
  used_llm_slices?: boolean;
  tasks?: Array<{
    task_id: string;
    file_path: string;
    lane_owner: string;
    lane_owner_name: string;
    fallback_owner: string | null;
    dependencies: string[];
    priority: number;
    status: string;
  }>;
  locked_builder_ids?: string[];
  error?: string;
  message?: string;
}

function mapJobStatusToRunStatus(status: string): SessionRunProgress['status'] {
  if (status === 'running' || status === 'claimed') return 'running';
  if (status === 'succeeded') return 'succeeded';
  if (status === 'failed' || status === 'cancelled' || status === 'expired') return 'failed';
  return 'queued';
}

function isTerminalJobStatus(status: string): boolean {
  return status === 'succeeded' || status === 'failed' || status === 'cancelled' || status === 'expired';
}

function appendJobOutput(existing: string, incoming: string): string {
  const next = [existing, incoming.trim()].filter(Boolean).join('\n\n').trim();
  if (next.length <= 6000) return next;
  return next.slice(next.length - 6000);
}

function deriveSessionProgress(runs: SessionRunProgress[]): SessionBuildProgress {
  if (runs.length === 0) {
    return {
      status: 'idle',
      filesWritten: 0,
      jobId: null,
      manifest: [],
      errorText: null,
    };
  }

  const manifest = mergeSessionManifest(runs.flatMap((run) => run.manifest));
  const anyRunning = runs.some((run) => run.status === 'queued' || run.status === 'running');
  const anyFailed = runs.some((run) => run.status === 'failed');

  return {
    status: anyRunning ? 'running' : anyFailed ? 'failed' : 'succeeded',
    filesWritten: manifest.length,
    jobId: runs.length === 1 ? runs[0]?.jobId ?? null : null,
    manifest,
    errorText: anyFailed
      ? runs
          .filter((run) => run.status === 'failed' && run.errorText)
          .map((run) => `${run.builderName}: ${run.errorText}`)
          .join(' | ') || 'Session build failed.'
      : null,
  };
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useBuildExecution() {
  const { state, dispatch } = useMaestro();
  const { session, user } = useAuth();

  const [tasks, setTasks] = useState<BuildTask[]>([]);
  const tasksRef = useRef<BuildTask[]>([]); // synchronous truth — avoids stale-closure bugs
  const [progress, setProgress] = useState<BuildProgress>({
    total: 0, completed: 0, failed: 0, skipped: 0, dispatched: 0, queued: 0,
  });
  const [isRunning, setIsRunning] = useState(false);
  const isRunningRef = useRef(false); // synchronous guard against double-execution
  const [isDecomposing, setIsDecomposing] = useState(false);
  const abortRef = useRef(false);
  const [adapterOverride, setAdapterOverride] = useState<string | null>(null);
  const adapterOverrideRef = useRef<string | null>(null); // ref for sync access in closures
  const sessionProgress = state.sessionBuildState.progress;
  const isSessionRunning = state.sessionBuildState.isRunning;
  const sessionRuns = state.sessionBuildState.runs;
  const [jobOutputs, setJobOutputs] = useState<Record<string, JobOutputState>>({});
  const sessionRunsRef = useRef(sessionRuns);
  const sessionProgressRef = useRef(sessionProgress);
  const jobOutputsRef = useRef<Record<string, JobOutputState>>({});
  const jobArtifactBuffersRef = useRef<Record<string, ReturnType<typeof createArtifactManifestBuffer>>>({});
  const jobWaitersRef = useRef(new Map<string, {
    resolve: (snapshot: ExecutorJobSnapshot) => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }>());

  useEffect(() => {
    sessionRunsRef.current = sessionRuns;
  }, [sessionRuns]);

  useEffect(() => {
    sessionProgressRef.current = sessionProgress;
  }, [sessionProgress]);

  useEffect(() => {
    jobOutputsRef.current = jobOutputs;
  }, [jobOutputs]);

  const setSessionProgress = useCallback((payload: SessionBuildProgress) => {
    sessionProgressRef.current = payload;
    dispatch({ type: 'SET_SESSION_BUILD_PROGRESS', payload });
  }, [dispatch]);

  const setSessionRuns = useCallback((payload: SessionRunProgress[]) => {
    sessionRunsRef.current = payload;
    dispatch({ type: 'SET_SESSION_BUILD_RUNS', payload });
  }, [dispatch]);

  const setIsSessionRunning = useCallback((payload: boolean) => {
    dispatch({ type: 'SET_IS_SESSION_BUILD_RUNNING', payload });
  }, [dispatch]);

  const ensureSession = useCallback(async () => {
    if (session?.access_token) return session;
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) {
      throw new Error('Session expired. Sign in again.');
    }
    return data.session;
  }, [session]);

  const loadTasks = useCallback(async (sessionId: string): Promise<BuildTask[]> => {
    const { data: taskRows } = await supabase
      .from('build_tasks')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    const loaded = (taskRows ?? []) as unknown as BuildTask[];
    tasksRef.current = loaded;
    setTasks(loaded);
    setProgress({
      total: loaded.length,
      completed: loaded.filter(task => task.status === 'completed').length,
      failed: loaded.filter(task => task.status === 'failed').length,
      skipped: loaded.filter(task => task.status === 'skipped').length,
      dispatched: loaded.filter(task => task.status === 'dispatched').length,
      queued: loaded.filter(task => task.status === 'queued' || task.status === 'rerouted').length,
    });
    return loaded;
  }, []);

  const getArtifactBuffer = useCallback((jobId: string) => {
    const existing = jobArtifactBuffersRef.current[jobId];
    if (existing) return existing;

    const next = createArtifactManifestBuffer();
    jobArtifactBuffersRef.current = {
      ...jobArtifactBuffersRef.current,
      [jobId]: next,
    };
    return next;
  }, []);

  const updateTrackedSessionManifest = useCallback((
    jobId: string,
    manifest: SessionBuildManifestEntry[],
    snapshot?: Pick<ExecutorJobSnapshot, 'status' | 'error_text' | 'result_summary'>,
  ) => {
    const trackedRuns = sessionRunsRef.current.filter((run) => run.jobId === jobId);
    if (trackedRuns.length === 0) return;

    const nextRuns = sessionRunsRef.current.map((run) => {
      if (run.jobId !== jobId) return run;
      return {
        ...run,
        status: snapshot ? mapJobStatusToRunStatus(snapshot.status) : run.status,
        filesWritten: manifest.length,
        manifest,
        errorText: snapshot
          ? (snapshot.status === 'failed' || snapshot.status === 'cancelled' || snapshot.status === 'expired'
              ? snapshot.error_text ?? snapshot.result_summary ?? 'Session build failed.'
              : null)
          : run.errorText,
      };
    });

    setSessionRuns(nextRuns);
    setSessionProgress(deriveSessionProgress(nextRuns));
  }, [setSessionProgress, setSessionRuns]);

  const fetchExecutorJobSnapshot = useCallback(async (jobId: string): Promise<ExecutorJobSnapshot | null> => {
    const { data: jobRaw } = await supabase
      .from('executor_jobs')
      .select('id, status, artifact_manifest, error_text, result_summary')
      .eq('id', jobId)
      .maybeSingle();

    if (!jobRaw) return null;
    const snapshot = jobRaw as ExecutorJobSnapshot;
    const buffer = getArtifactBuffer(snapshot.id);
    let manifest = normalizeSessionManifest(snapshot.artifact_manifest);

    if (manifest.length > 0) {
      manifest = seedArtifactManifestBuffer(buffer, manifest);
    } else {
      manifest = getArtifactManifestFromBuffer(buffer);
      if (manifest.length === 0 && isTerminalJobStatus(snapshot.status)) {
        manifest = await fetchExecutorJobArtifactManifest(snapshot.id);
        if (manifest.length > 0) {
          manifest = seedArtifactManifestBuffer(buffer, manifest);
        }
      }
    }

    return {
      ...snapshot,
      artifact_manifest: manifest,
    };
  }, [getArtifactBuffer]);

  const upsertJobOutput = useCallback((jobId: string, stream: 'stdout' | 'stderr', text: string) => {
    if (!text.trim()) return;

    const current = jobOutputsRef.current[jobId] ?? { stdout: '', stderr: '' };
    const next = {
      ...current,
      [stream]: appendJobOutput(current[stream], text),
    };

    jobOutputsRef.current = {
      ...jobOutputsRef.current,
      [jobId]: next,
    };
    setJobOutputs(jobOutputsRef.current);
  }, []);

  const resolveJobWaiter = useCallback((snapshot: ExecutorJobSnapshot) => {
    const waiter = jobWaitersRef.current.get(snapshot.id);
    if (!waiter) return;
    clearTimeout(waiter.timeoutId);
    jobWaitersRef.current.delete(snapshot.id);
    waiter.resolve(snapshot);
  }, []);

  const waitForExecutorJob = useCallback(async (
    jobId: string,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<ExecutorJobSnapshot> => {
    const initial = await fetchExecutorJobSnapshot(jobId);
    if (initial && isTerminalJobStatus(initial.status)) {
      return initial;
    }

    return await new Promise<ExecutorJobSnapshot>((resolve, reject) => {
      const timeoutId = setTimeout(async () => {
        jobWaitersRef.current.delete(jobId);

        try {
          const latest = await fetchExecutorJobSnapshot(jobId);
          if (latest && isTerminalJobStatus(latest.status)) {
            resolve(latest);
            return;
          }
          reject(new Error(timeoutMessage));
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      }, timeoutMs);

      jobWaitersRef.current.set(jobId, { resolve, reject, timeoutId });
    });
  }, [fetchExecutorJobSnapshot]);

  const handleExecutorJobSnapshot = useCallback(async (snapshot: ExecutorJobSnapshot) => {
    const buffer = getArtifactBuffer(snapshot.id);
    let manifest = normalizeSessionManifest(snapshot.artifact_manifest);

    if (manifest.length > 0) {
      manifest = seedArtifactManifestBuffer(buffer, manifest);
    } else {
      manifest = getArtifactManifestFromBuffer(buffer);
      if (manifest.length === 0 && isTerminalJobStatus(snapshot.status)) {
        manifest = await fetchExecutorJobArtifactManifest(snapshot.id);
        if (manifest.length > 0) {
          manifest = seedArtifactManifestBuffer(buffer, manifest);
        }
      }
    }

    const hydratedSnapshot: ExecutorJobSnapshot = {
      ...snapshot,
      artifact_manifest: manifest,
    };

    updateTrackedSessionManifest(snapshot.id, manifest, snapshot);

    if (isTerminalJobStatus(snapshot.status)) {
      resolveJobWaiter(hydratedSnapshot);
    }
  }, [getArtifactBuffer, resolveJobWaiter, updateTrackedSessionManifest]);

  const handleExecutorJobEvent = useCallback((event: ExecutorJobEventRow) => {
    const trackedJobIds = new Set<string>([
      ...tasksRef.current
        .map((task) => task.executor_job_id)
        .filter((jobId): jobId is string => typeof jobId === 'string' && jobId.length > 0),
      ...sessionRunsRef.current
        .map((run) => run.jobId)
        .filter((jobId): jobId is string => typeof jobId === 'string' && jobId.length > 0),
    ]);

    if (!trackedJobIds.has(event.job_id)) return;

    if (event.event_type === 'artifact') {
      const manifest = applyArtifactPayloadToBuffer(getArtifactBuffer(event.job_id), event.payload);
      updateTrackedSessionManifest(event.job_id, manifest);
      return;
    }

    const text = typeof event.payload?.text === 'string'
      ? event.payload.text
      : typeof event.payload?.message === 'string'
        ? event.payload.message
        : '';

    if (event.event_type === 'stdout' && text) {
      upsertJobOutput(event.job_id, 'stdout', text);
    } else if (event.event_type === 'stderr' && text) {
      upsertJobOutput(event.job_id, 'stderr', text);
    }
  }, [getArtifactBuffer, updateTrackedSessionManifest, upsertJobOutput]);

  useEffect(() => {
    const sessionId = state.activeSession?.id;
    if (!sessionId) {
      tasksRef.current = [];
      setTasks([]);
      setProgress({ total: 0, completed: 0, failed: 0, skipped: 0, dispatched: 0, queued: 0 });
      jobOutputsRef.current = {};
      jobArtifactBuffersRef.current = {};
      setJobOutputs({});
      return;
    }

    jobOutputsRef.current = {};
    jobArtifactBuffersRef.current = {};
    setJobOutputs({});
    void loadTasks(sessionId);

    let channel = supabase
      .channel(`build-progress-${sessionId}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'build_tasks', filter: `session_id=eq.${sessionId}` },
        () => { void loadTasks(sessionId); },
      );

    if (user?.id) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'executor_jobs', filter: `requested_by=eq.${user.id}` },
        (payload) => {
          const next = payload.new as Partial<ExecutorJobSnapshot> | null;
          if (!next?.id || typeof next.status !== 'string') return;
          void handleExecutorJobSnapshot({
            id: next.id,
            status: next.status,
            artifact_manifest: next.artifact_manifest ?? null,
            error_text: typeof next.error_text === 'string' ? next.error_text : null,
            result_summary: typeof next.result_summary === 'string' ? next.result_summary : null,
          });
        },
      ).on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'executor_job_events' },
        (payload) => {
          const next = payload.new as Partial<ExecutorJobEventRow> | null;
          if (!next?.job_id || typeof next.event_type !== 'string') return;
          handleExecutorJobEvent({
            job_id: next.job_id,
            event_type: next.event_type,
            payload: typeof next.payload === 'object' && next.payload !== null
              ? next.payload as Record<string, unknown>
              : null,
          });
        },
      );
    }

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [state.activeSession?.id, user?.id, loadTasks, handleExecutorJobSnapshot, handleExecutorJobEvent]);

  // ── Step 1: Decompose — call concierge to create build_tasks ─────────

  const decompose = useCallback(async (sessionId: string): Promise<DecomposeResult> => {
    setIsDecomposing(true);
    try {
      await ensureSession();
      const result = await invokeEdgeFunction<DecomposeResult>('concierge', {
        session_id: sessionId,
        phase: 'decompose_tasks',
        responses: [],
      });

      if (result.error) {
        throw new Error(result.message ?? result.error);
      }

      await loadTasks(sessionId);
      return result;
    } finally {
      setIsDecomposing(false);
    }
  }, [ensureSession, loadTasks]);

  // ── Step 2: Dispatch loop — one orchestrate call per task ─────────────

  const resolveAgent = useCallback((agentId: string): Agent | undefined => {
    return state.agents.find(a => a.id === agentId);
  }, [state.agents]);

  const updateTaskStatus = useCallback(async (
    taskId: string,
    status: BuildTaskStatus,
    extras: Partial<BuildTask> = {},
  ) => {
    const updates: Record<string, unknown> = { status, ...extras };
    if (status === 'completed') updates.completed_at = new Date().toISOString();

    await supabase
      .from('build_tasks')
      .update(updates as never)
      .eq('id', taskId);

    const updated = tasksRef.current.map(t =>
      t.id === taskId ? { ...t, status, ...extras } as BuildTask : t
    );
    tasksRef.current = updated;
    setTasks(updated);
  }, []);

  // ── Local execution helpers (V3 routing) ───────────────────────────

  const resolveLocalAdapter = useCallback((task: BuildTask): string => {
    // adapterOverrideRef is synchronous (no stale-closure lag vs useState)
    if (adapterOverrideRef.current) return adapterOverrideRef.current;
    const agent = resolveAgent(task.lane_owner ?? '');
    return agent?.provider_group === 'maestroclaw'
      ? agent.model
      : 'claude_code';
  }, [resolveAgent]);

  const refreshExecutors = useCallback(async (): Promise<Executor[]> => {
    const authSession = await ensureSession();
    const { data } = await supabase
      .from('executors')
      .select('*')
      .eq('owner_user_id', authSession.user.id)
      .order('created_at', { ascending: false });
    const executors = (data ?? []) as Executor[];
    dispatch({ type: 'SET_EXECUTORS', payload: executors });
    return executors;
  }, [ensureSession, dispatch]);

  const findOnlineExecutor = useCallback((adapter?: string): Executor | null => {
    return selectOnlineExecutor(state.executors, adapter);
  }, [state.executors]);

  const resolveBackend = useCallback((task: BuildTask): 'edge' | 'local' => {
    const adapter = resolveLocalAdapter(task);
    // Claw agents always route locally — they ARE local CLI tools
    const agent = resolveAgent(task.lane_owner ?? '');
    if (agent?.provider_group === 'maestroclaw') return 'local';

    const backend = task.execution_backend
      ?? state.activeSession?.execution_backend
      ?? 'edge';
    if (backend === 'local') return 'local';
    if (backend === 'auto') return findOnlineExecutor(adapter) ? 'local' : 'edge';
    return 'edge';
  }, [state.activeSession?.execution_backend, findOnlineExecutor, resolveAgent, resolveLocalAdapter]);

  const pollExecutorJob = useCallback(async (
    jobId: string,
    task: BuildTask,
  ): Promise<boolean> => {
    const TIMEOUT_MS = 600_000; // 10 minutes
    const job = await waitForExecutorJob(
      jobId,
      TIMEOUT_MS,
      'Executor job timed out after 10 minutes',
    );

    if (abortRef.current) return false;

    if (job.status === 'succeeded') {
      const artifacts = normalizeSessionManifest(job.artifact_manifest);

      if (artifacts.length === 0) {
        await updateTaskStatus(task.id, 'failed', {
          failure_reason: 'Executor produced no artifacts',
          executor_job_id: jobId,
        } as Partial<BuildTask>);
        return false;
      }

      const entry = artifacts[0];
      await updateTaskStatus(task.id, 'completed', {
        result_content: entry.content,
        result_operation: (entry.operation ?? 'create') as BuildTask['result_operation'],
        result_builder: task.lane_owner,
        executor_job_id: jobId,
      } as Partial<BuildTask>);
      return true;
    }

    await updateTaskStatus(task.id, 'failed', {
      failure_reason: job.error_text || 'Executor job failed',
      provider_error: job.result_summary,
      executor_job_id: jobId,
    } as Partial<BuildTask>);
    return false;
  }, [updateTaskStatus, waitForExecutorJob]);

  const dispatchTaskLocal = useCallback(async (
    task: BuildTask,
  ): Promise<boolean> => {
    // Find repo context from the active session
    const repoConn = state.activeRepoConnection;
    const sessionId = state.activeSession?.id;
    const cloneUrl = repoConn ? `https://github.com/${repoConn.owner}/${repoConn.repo}.git` : null;

    // Derive adapter from the assigned agent's model field (Claw agents
    // use model as the adapter name, e.g. 'claude_code', 'copilot_cli').
    // Falls back to 'claude_code' for non-Claw agents routed locally.
    const adapter = resolveLocalAdapter(task);
    let matchingExecutor = findOnlineExecutor(adapter);

    if (!matchingExecutor) {
      const refreshedExecutors = await refreshExecutors();
      matchingExecutor = selectOnlineExecutor(refreshedExecutors, adapter);
    }

    if (!matchingExecutor) {
      await updateTaskStatus(task.id, 'failed', {
        failure_reason: `No online executor advertises adapter "${adapter}"`,
      } as Partial<BuildTask>);
      return false;
    }

    let job: ExecutorJob | null = null;
    try {
      const result = await invokeEdgeFunction<{ job: ExecutorJob }>('executor-api?action=submit', {
        session_id: sessionId,
        job_type: 'build_task',
        adapter,
        prompt: task.prompt_slice,
        repo_url: cloneUrl,
        repo_name: repoConn?.repo ?? null,
        branch: repoConn?.default_branch ?? null,
        allowed_paths: [task.file_path],
        timeout_seconds: 600,
        build_task_id: task.id,
      });
      job = result.job;
    } catch (err) {
      await updateTaskStatus(task.id, 'failed', {
        failure_reason: `Failed to create executor job: ${err instanceof Error ? err.message : 'unknown'}`,
      } as Partial<BuildTask>);
      return false;
    }

    if (!job) {
      await updateTaskStatus(task.id, 'failed', {
        failure_reason: 'Executor job was not created',
      } as Partial<BuildTask>);
      return false;
    }

    if (job.approval_required || job.status !== 'approved') {
      await updateTaskStatus(task.id, 'failed', {
        failure_reason: 'Build task unexpectedly requires manual approval',
      } as Partial<BuildTask>);
      return false;
    }

    await updateTaskStatus(task.id, 'dispatched', {
      executor_job_id: job.id,
    } as Partial<BuildTask>);

    return await pollExecutorJob(job.id, task);
  }, [state.activeRepoConnection, state.activeSession?.id, updateTaskStatus, pollExecutorJob, resolveLocalAdapter, findOnlineExecutor, refreshExecutors]);

  // ── Session Build (Phase 4) ─────────────────────────────────────────────

  const updateSessionRun = useCallback((key: string, updates: Partial<SessionRunProgress>) => {
    const nextRuns = sessionRunsRef.current.map((run) =>
      run.key === key ? { ...run, ...updates } : run,
    );
    sessionRunsRef.current = nextRuns;
    dispatch({ type: 'SET_SESSION_BUILD_RUNS', payload: nextRuns });
  }, [dispatch]);

  const executeSessionPlan = useCallback(async (specs: SessionBuildSpec[]) => {
    if (state.sessionBuildState.isRunning) return;
    setIsSessionRunning(true);

    const normalizedSpecs = specs
      .map((spec, index) => ({
        ...spec,
        key: `${spec.adapter}-${index}-${spec.builderName}`,
        scopePaths: spec.scopePaths.length > 0 ? spec.scopePaths : ['**'],
      }));

    setSessionRuns(normalizedSpecs.map(spec => ({
      key: spec.key,
      builderName: spec.builderName,
      adapter: spec.adapter,
      scopePaths: spec.scopePaths,
      status: 'queued',
      filesWritten: 0,
      jobId: null,
      manifest: [],
      errorText: null,
    })));
    setSessionProgress({ status: 'running', filesWritten: 0, jobId: null, manifest: [], errorText: null });

    try {
      if (normalizedSpecs.length === 0) {
        setSessionProgress({
          status: 'failed',
          filesWritten: 0,
          jobId: null,
          manifest: [],
          errorText: 'No local session builders were resolved from the build plan.',
        });
        return;
      }

      const basePrompt = state.buildPlan?.build_prompt ?? state.activeSession?.title ?? 'Build this project';
      const architectMd = state.activeSession?.architect_md;
      const results = await Promise.all(normalizedSpecs.map(async (spec) => {
        const scopeLabel = spec.scopePaths.length === 1
          ? spec.scopePaths[0]
          : `${spec.scopePaths[0]} +${spec.scopePaths.length - 1} more`;
        const prompt = [
          basePrompt,
          '',
          `ASSIGNED BUILDER: ${spec.builderName}`,
          spec.instruction?.trim() ? `BUILDER INSTRUCTION: ${spec.instruction.trim()}` : '',
          'ASSIGNED SCOPE PATHS:',
          ...spec.scopePaths.map(path => `- ${path}`),
          '',
          'Build the full implementation for your assigned scope. Respect ARCHITECT.md and do not modify files outside your assigned paths.',
        ].filter(Boolean).join('\n');

        updateSessionRun(spec.key, { status: 'running', errorText: null });

        const jobId = await submitBuildSessionJob({
          executors: state.executors,
          sessionId: state.activeSession?.id,
          repoConnection: state.activeRepoConnection,
          refreshExecutors,
          adapter: spec.adapter,
          prompt,
          scope: scopeLabel,
          allowedPaths: spec.scopePaths,
          architectMd,
          contextBundle: {
            scope_paths: spec.scopePaths,
            builder_name: spec.builderName,
            builder_instruction: spec.instruction ?? null,
          },
        });

        if (!jobId) {
          const errorText = `No online executor advertises adapter "${spec.adapter}"`;
          updateSessionRun(spec.key, { status: 'failed', errorText });
          return {
            success: false,
            jobId: null,
            builderName: spec.builderName,
            manifest: [] as Array<{ path: string; content: string; operation: string }>,
            errorText,
          };
        }

        updateSessionRun(spec.key, { jobId });
        try {
          const job = await waitForExecutorJob(
            jobId,
            40 * 60 * 1_000,
            'Session job timed out after 40 minutes',
          );
          const manifest = normalizeSessionManifest(job.artifact_manifest);
          const success = job.status === 'succeeded';
          updateSessionRun(spec.key, {
            status: success ? 'succeeded' : 'failed',
            filesWritten: manifest.length,
            jobId,
            manifest,
            errorText: success ? null : job.error_text ?? job.result_summary ?? 'Session job failed',
          });

          return {
            success,
            jobId,
            builderName: spec.builderName,
            manifest,
            errorText: success ? null : job.error_text ?? job.result_summary ?? 'Session job failed',
          };
        } catch (error) {
          const errorText = error instanceof Error ? error.message : 'Session job failed';
          updateSessionRun(spec.key, {
            status: 'failed',
            filesWritten: 0,
            jobId,
            manifest: [],
            errorText,
          });

          return {
            success: false,
            jobId,
            builderName: spec.builderName,
            manifest: [] as SessionBuildManifestEntry[],
            errorText,
          };
        }
      }));

      const mergedManifest = mergeSessionManifest(results.flatMap(result => result.manifest));
      const failures = results.filter(result => !result.success);
      setSessionProgress({
        status: failures.length === 0 ? 'succeeded' : 'failed',
        filesWritten: mergedManifest.length,
        jobId: results.length === 1 ? results[0]?.jobId ?? null : null,
        manifest: mergedManifest,
        errorText: failures.length > 0
          ? failures.map(result => `${result.builderName}: ${result.errorText ?? 'session failed'}`).join(' | ')
          : null,
      });
    } finally {
      setIsSessionRunning(false);
    }
  }, [
    state.buildPlan,
    state.activeSession,
    state.activeRepoConnection,
    state.executors,
    state.sessionBuildState.isRunning,
    refreshExecutors,
    waitForExecutorJob,
    setIsSessionRunning,
    setSessionProgress,
    setSessionRuns,
    updateSessionRun,
  ]);

  /**
   * Launches a single build_session job for the given adapter and scope.
   * Kept for manual fallback/session config flows.
   */
  const executeSession = useCallback(async (adapter: string, scope = '**') => {
    await executeSessionPlan([{
      builderName: adapter,
      adapter,
      scopePaths: [scope],
    }]);
  }, [executeSessionPlan]);

  const abortSessionBuild = useCallback(async () => {
    const jobIds = Array.from(new Set(
      sessionRunsRef.current
        .map((run) => run.jobId)
        .filter((jobId): jobId is string => typeof jobId === 'string' && jobId.length > 0),
    ));

    await Promise.all(jobIds.map((jobId) => cancelBuildSessionJob(jobId)));

    const nextRuns: SessionRunProgress[] = sessionRunsRef.current.map((run) => (
      run.status === 'running' || run.status === 'queued'
        ? { ...run, status: 'failed' as const, errorText: 'Aborted by user' }
        : run
    ));
    setSessionRuns(nextRuns);
    setSessionProgress({
      ...deriveSessionProgress(nextRuns),
      status: 'failed',
      errorText: 'Aborted by user',
    });
    setIsSessionRunning(false);
  }, [setIsSessionRunning, setSessionProgress, setSessionRuns]);

  const resetSessionBuildState = useCallback(() => {
    sessionRunsRef.current = [];
    sessionProgressRef.current = {
      status: 'idle',
      filesWritten: 0,
      jobId: null,
      manifest: [],
      errorText: null,
    };
    jobOutputsRef.current = {};
    jobArtifactBuffersRef.current = {};
    setJobOutputs({});
    dispatch({ type: 'RESET_SESSION_BUILD_STATE' });
  }, [dispatch]);

  /** Returns the manifest from the last succeeded session build (for GitHub push). */
  const collectSessionManifest = useCallback(() => {
    const sourceManifest = sessionRuns.length > 0
      ? mergeSessionManifest(sessionRuns.flatMap(run => run.manifest))
      : sessionProgress.manifest;

    return sourceManifest.map(f => ({
      path: f.path,
      content: f.content,
      operation: (f.operation ?? 'create') as 'upsert' | 'create' | 'delete',
      content_hash: null,
    }));
  }, [sessionProgress.manifest, sessionRuns]);

  const getJobOutput = useCallback((jobId: string | null | undefined): JobOutputState | null => {
    if (!jobId) return null;
    return jobOutputs[jobId] ?? null;
  }, [jobOutputs]);

  const pushSessionBuildToGithub = useCallback(async (fallbackAdapter?: string) => {
    if (!state.activeSession || !user) {
      throw new Error('No active session is available for GitHub push.');
    }
    if (!state.activeRepoConnection?.id) {
      throw new Error('No active GitHub repo is connected.');
    }

    const manifest = collectSessionManifest();
    if (manifest.length === 0) {
      throw new Error('Session produced no files. Cannot push to GitHub.');
    }

    const { data: runData, error: runErr } = await supabase
      .from('execution_runs')
      .insert({
        session_id: state.activeSession.id,
        user_id: user.id,
        strategy: 'synthesized' as const,
        status: 'running',
      } as never)
      .select()
      .maybeSingle();

    if (runErr || !runData) {
      throw new Error(runErr?.message ?? 'Failed to create execution run');
    }

    const adapterLabel = sessionRuns.length > 0
      ? Array.from(new Set(sessionRuns.map((run) => run.adapter))).join(', ')
      : (fallbackAdapter ?? 'session');
    const commitMessage = `Session build: ${manifest.length} files for ${state.activeSession.title ?? 'session'}`;
    const patches = [{
      agent_name: `Session Build (${adapterLabel})`,
      agent_id: 'build-session',
      content: `${manifest.length} files from session build`,
      scoped_paths: [] as string[],
      commit_message: commitMessage,
      conductor_approved: true,
      file_manifest: manifest.map((entry) => ({
        path: entry.path,
        content: entry.content,
        operation: entry.operation === 'delete' ? 'delete' as const : 'upsert' as const,
        content_hash: null,
      })),
    }];

    const execResult = await invokeEdgeFunction<SessionGithubExecuteResult>('github-execute', {
      session_id: state.activeSession.id,
      execution_run_id: (runData as { id: string }).id,
      repo_connection_id: state.activeRepoConnection.id,
      patches,
      mode: 'synthesized',
      conductor_approved: true,
    });

    const status = (execResult.errors?.length ?? 0) > 0 ? 'partial' : 'completed';
    await supabase
      .from('execution_runs')
      .update({ status, result: execResult as never } as never)
      .eq('id', (runData as { id: string }).id);

    dispatch({
      type: 'ADD_EXECUTION_RUN',
      payload: { ...(runData as Record<string, unknown>), status, result: execResult } as never,
    });

    return {
      status,
      writtenFiles: execResult.written_files ?? [],
      skippedFiles: execResult.skipped_files ?? [],
      prUrls: execResult.prs ?? [],
      collisionCount: (execResult.collisions ?? []).length,
      handoffs: (execResult.handoffs_requested ?? []) as Array<{ from_agent: string; path: string }>,
      backupBranch: execResult.backup_branch ?? '',
    };
  }, [state.activeSession, state.activeRepoConnection, user, collectSessionManifest, sessionRuns, dispatch]);

  const parseTaskResult = (raw: OrchestrateTaskResult, taskFilePath: string): TaskResult | null => {
    // Strategy 1: Direct path/content fields (build_task mode with server-side fix)
    if (raw.path && typeof raw.content === 'string' && raw.content.length > 0) {
      return { path: raw.path, content: raw.content, operation: raw.operation ?? 'create' };
    }

    // Strategy 2: file_manifest[0] (if orchestrate wrapped it in a manifest)
    if (raw.file_manifest && raw.file_manifest.length > 0) {
      const entry = raw.file_manifest[0];
      if (entry.path && typeof entry.content === 'string' && entry.content.length > 0) {
        return { path: entry.path, content: entry.content, operation: entry.operation ?? 'create' };
      }
    }

    // Strategy 3: Parse JSON from text content (handles code fences + leading text)
    const text = raw.content ?? raw.text ?? '';
    if (text) {
      // Strip markdown code fences if present
      const stripped = text
        .replace(/^```(?:json|JSON)?\s*\n?/m, '')
        .replace(/\n?```\s*$/m, '')
        .trim();

      const jsonMatch = stripped.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.path && typeof parsed.content === 'string') {
            return { path: parsed.path, content: parsed.content, operation: parsed.operation ?? 'create' };
          }
        } catch {
          // not valid JSON
        }
      }

      // Strategy 4: Content is the raw file itself (path lost in parseResult).
      // Use task.file_path as path. Only accept if content looks non-empty and
      // doesn't look like a model refusal/explanation.
      if (text.length > 5 && !text.startsWith('I cannot') && !text.startsWith('I\'m unable')) {
        return { path: taskFilePath, content: text, operation: 'create' };
      }
    }

    return null;
  };

  const dispatchTask = useCallback(async (task: BuildTask): Promise<boolean> => {
    const agent = resolveAgent(task.lane_owner ?? '');
    if (!agent) {
      await updateTaskStatus(task.id, 'failed', {
        failure_reason: 'Builder agent not found in workspace',
      } as Partial<BuildTask>);
      return false;
    }

    await updateTaskStatus(task.id, 'dispatched');

    // ── V3: Route based on execution backend ─────────────────────────
    const backend = resolveBackend(task);

    if (backend === 'local') {
      try {
        return await dispatchTaskLocal(task);
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        // Fall back to edge on local failure if we haven't retried yet
        if ((task.retry_count ?? 0) < 1) {
          console.warn(`[Build v3] Local dispatch failed, falling back to edge: ${errMsg}`);
          await updateTaskStatus(task.id, 'queued', {
            retry_count: (task.retry_count ?? 0) + 1,
            execution_backend: 'edge',
            failure_reason: `Local execution failed, retrying via edge: ${errMsg.slice(0, 200)}`,
          } as Partial<BuildTask>);
          return false;
        }
        await updateTaskStatus(task.id, 'failed', {
          failure_reason: errMsg.slice(0, 500),
        } as Partial<BuildTask>);
        return false;
      }
    }

    // ── Edge execution (unchanged v2 path) ───────────────────────────
    try {
      const result = await invokeEdgeFunction<OrchestrateTaskResult>('orchestrate', {
        prompt: task.prompt_slice,
        provider: agent.provider,
        model: agent.model,
        agentName: agent.name,
        agentRole: agent.role,
        mode: 'build_task',
        session_id: state.activeSession?.id,
      });

      const parsed = parseTaskResult(result, task.file_path);
      if (!parsed || !parsed.content) {
        // Retry with fallback agent if available
        if (task.fallback_owner && (task.retry_count ?? 0) < (task.max_retries ?? 2)) {
          await updateTaskStatus(task.id, 'rerouted', {
            retry_count: (task.retry_count ?? 0) + 1,
            rerouted_from: task.lane_owner,
            lane_owner: task.fallback_owner,
            failure_reason: 'Primary builder returned empty/unparseable result — raw: ' + JSON.stringify(result).slice(0, 300),
          } as Partial<BuildTask>);
          // Re-queue for next pass
          return false;
        }

        await updateTaskStatus(task.id, 'failed', {
          failure_reason: 'Builder returned empty or unparseable result',
          provider_error: JSON.stringify(result).slice(0, 500),
        } as Partial<BuildTask>);
        return false;
      }

      await updateTaskStatus(task.id, 'completed', {
        result_content: parsed.content,
        result_operation: parsed.operation as BuildTask['result_operation'],
        result_builder: agent.id,
      } as Partial<BuildTask>);

      return true;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const isRetryable = errMsg.includes('504') || errMsg.includes('timeout') || errMsg.includes('rate');

      if (isRetryable && (task.retry_count ?? 0) < (task.max_retries ?? 2)) {
        await updateTaskStatus(task.id, 'queued', {
          retry_count: (task.retry_count ?? 0) + 1,
          failure_reason: `Retry ${(task.retry_count ?? 0) + 1}: ${errMsg.slice(0, 200)}`,
        } as Partial<BuildTask>);
        return false;
      }

      // Try fallback before giving up
      if (task.fallback_owner && task.lane_owner !== task.fallback_owner) {
        await updateTaskStatus(task.id, 'rerouted', {
          rerouted_from: task.lane_owner,
          lane_owner: task.fallback_owner,
          failure_reason: errMsg.slice(0, 200),
        } as Partial<BuildTask>);
        return false;
      }

      await updateTaskStatus(task.id, 'failed', {
        failure_reason: errMsg.slice(0, 500),
        provider_error: errMsg.slice(0, 500),
      } as Partial<BuildTask>);
      return false;
    }
  }, [resolveAgent, updateTaskStatus, state.activeSession?.id, resolveBackend, dispatchTaskLocal]);

  // ── Main execution loop ──────────────────────────────────────────────

  const execute = useCallback(async () => {
    if (isRunningRef.current) return;
    isRunningRef.current = true;
    setIsRunning(true);
    abortRef.current = false;

    try {
      // Read from ref (synchronous truth — avoids stale-closure bug)
      let currentTasks = [...tasksRef.current];

      // Safety: if ref is empty (stale closure edge case), re-fetch from DB
      if (currentTasks.length === 0 && state.activeSession?.id) {
        const { data: fallback } = await supabase
          .from('build_tasks')
          .select('*')
          .eq('session_id', state.activeSession.id)
          .order('created_at', { ascending: true });
        if (fallback && fallback.length > 0) {
          currentTasks = fallback as unknown as BuildTask[];
          tasksRef.current = currentTasks;
          setTasks(currentTasks);
        }
      }

      if (currentTasks.length === 0) {
        console.warn('[Build v2] execute() called with 0 tasks — nothing to dispatch');
        return;
      }

      console.log(`[Build v2] Dispatch starting: ${currentTasks.length} tasks, ${currentTasks.filter(t => t.status === 'queued').length} queued`);

      const recountProgress = () => {
        currentTasks = [...tasksRef.current]; // always re-read from ref
        const p: BuildProgress = {
          total: currentTasks.length,
          completed: currentTasks.filter(t => t.status === 'completed').length,
          failed: currentTasks.filter(t => t.status === 'failed').length,
          skipped: currentTasks.filter(t => t.status === 'skipped').length,
          dispatched: currentTasks.filter(t => t.status === 'dispatched').length,
          queued: currentTasks.filter(t => t.status === 'queued' || t.status === 'rerouted').length,
        };
        setProgress(p);
        return p;
      };

      // Guard against reroute cycles: if the number of resolved tasks (completed +
      // failed + skipped) doesn't grow after a full wave, we're in a deadlock/cycle.
      // Allow up to 3 consecutive no-progress waves before aborting.
      let noProgressWaves = 0;
      while (noProgressWaves < 3) {
        // Find tasks ready to dispatch
        const ready = currentTasks.filter(t => {
          if (t.status !== 'queued' && t.status !== 'rerouted') return false;
          // Check dependencies
          if (t.dependencies && t.dependencies.length > 0) {
            const depsComplete = t.dependencies.every(depId =>
              currentTasks.find(d => d.task_id === depId)?.status === 'completed'
            );
            if (!depsComplete) {
              // Check if deps are failed/skipped — unblock if so
              const depsResolved = t.dependencies.every(depId => {
                const dep = currentTasks.find(d => d.task_id === depId);
                return dep && (dep.status === 'completed' || dep.status === 'failed' || dep.status === 'skipped');
              });
              if (!depsResolved) return false;
            }
          }
          return true;
        });

        if (ready.length === 0) break;
        if (abortRef.current) break;

        // Snapshot resolved count before this wave to detect progress
        const resolvedBefore = currentTasks.filter(
          t => t.status === 'completed' || t.status === 'failed' || t.status === 'skipped'
        ).length;

        // Build one batch of tasks to dispatch concurrently.
        //
        // Local/executor tasks: dispatch ALL ready tasks at once. The executor's
        // maxConcurrentJobs cap is the real throttle — the web side just submits and polls.
        // Submitting everything immediately lets both executors drain the queue in parallel
        // without waiting for wave-by-wave roundtrips.
        //
        // Edge tasks: cap to one per lane owner to respect cloud provider rate limits.
        const batch: BuildTask[] = [];
        const seenEdgeOwners = new Set<string>();

        for (const task of ready) {
          if (abortRef.current) break;
          const isLocal = resolveBackend(task) === 'local';
          if (isLocal) {
            batch.push(task);
          } else {
            const ownerId = task.lane_owner ?? '';
            if (!seenEdgeOwners.has(ownerId)) {
              batch.push(task);
              seenEdgeOwners.add(ownerId);
            }
          }
        }

        await Promise.all(batch.map(task => dispatchTask(task)));
        recountProgress();

        // Check progress: if resolved count didn't increase, count toward deadlock guard
        const resolvedAfter = currentTasks.filter(
          t => t.status === 'completed' || t.status === 'failed' || t.status === 'skipped'
        ).length;
        if (resolvedAfter <= resolvedBefore) {
          noProgressWaves++;
        } else {
          noProgressWaves = 0;
        }
      }

      recountProgress();
    } finally {
      isRunningRef.current = false;
      setIsRunning(false);
    }
  }, [dispatchTask, resolveBackend, state.activeSession?.id]);

  // ── Manual actions ───────────────────────────────────────────────────

  const abort = useCallback(() => {
    abortRef.current = true;
  }, []);

  const skipTask = useCallback(async (taskId: string, reason: string) => {
    await updateTaskStatus(taskId, 'skipped', {
      skip_reason: reason,
    } as Partial<BuildTask>);
    setProgress(prev => ({
      ...prev,
      skipped: prev.skipped + 1,
      queued: Math.max(0, prev.queued - 1),
    }));
  }, [updateTaskStatus]);

  const retryTask = useCallback(async (taskId: string) => {
    await updateTaskStatus(taskId, 'queued', {
      retry_count: 0,
      failure_reason: null,
      provider_error: null,
    } as Partial<BuildTask>);
    setProgress(prev => ({
      ...prev,
      failed: Math.max(0, prev.failed - 1),
      queued: prev.queued + 1,
    }));
  }, [updateTaskStatus]);

  // Swap the active adapter for all remaining failed tasks, reset them to queued,
  // and return the number of tasks re-queued. Caller should then call execute().
  const swapAdapter = useCallback(async (newAdapter: string): Promise<number> => {
    adapterOverrideRef.current = newAdapter;
    setAdapterOverride(newAdapter);

    const failedIds = tasksRef.current
      .filter(t => t.status === 'failed')
      .map(t => t.id);

    if (failedIds.length === 0) return 0;

    await supabase
      .from('build_tasks')
      .update({ status: 'queued', failure_reason: null, provider_error: null } as never)
      .in('id', failedIds);

    const updated = tasksRef.current.map(t =>
      t.status === 'failed'
        ? { ...t, status: 'queued' as BuildTaskStatus, failure_reason: null, provider_error: null }
        : t
    );
    tasksRef.current = updated;
    setTasks(updated);
    setProgress(prev => ({
      ...prev,
      failed: 0,
      queued: prev.queued + failedIds.length,
    }));

    return failedIds.length;
  }, []);

  // ── Collect completed tasks into file_manifest format ────────────────

  const collectManifest = useCallback(() => {
    return tasksRef.current
      .filter(t => t.status === 'completed' && t.result_content)
      .map(t => ({
        path: t.file_path,
        content: t.result_content!,
        operation: (t.result_operation ?? 'create') as 'upsert' | 'create' | 'delete',
        content_hash: null,
      }));
  }, []);

  const pushTaskBuildToGithub = useCallback(async () => {
    if (!state.activeSession || !user) {
      throw new Error('No active session is available for GitHub push.');
    }
    if (!state.activeRepoConnection?.id) {
      throw new Error('No active GitHub repo is connected.');
    }

    const manifest = collectManifest();
    if (manifest.length === 0) {
      throw new Error('No completed tasks to execute. Build more files first.');
    }

    const { data: runData, error: runErr } = await supabase
      .from('execution_runs')
      .insert({
        session_id: state.activeSession.id,
        user_id: user.id,
        strategy: 'synthesized' as const,
        status: 'running',
      } as never)
      .select()
      .maybeSingle();

    if (runErr || !runData) {
      throw new Error(runErr?.message ?? 'Failed to create execution run');
    }

    const patches = [{
      agent_name: 'Build v2 (task queue)',
      agent_id: 'build-v2',
      content: `${manifest.length} files from task-queued build`,
      scoped_paths: [] as string[],
      commit_message: `Build v2: ${manifest.length} files for ${state.activeSession.title ?? 'session'}`,
      conductor_approved: true,
      file_manifest: manifest.map((entry) => ({
        path: entry.path,
        content: entry.content,
        operation: entry.operation === 'delete' ? 'delete' as const : 'upsert' as const,
        content_hash: null,
      })),
    }];

    const execResult = await invokeEdgeFunction<SessionGithubExecuteResult>('github-execute', {
      session_id: state.activeSession.id,
      execution_run_id: (runData as { id: string }).id,
      repo_connection_id: state.activeRepoConnection.id,
      patches,
      mode: 'synthesized',
      conductor_approved: true,
    });

    const status = (execResult.errors?.length ?? 0) > 0 ? 'partial' : 'completed';
    await supabase
      .from('execution_runs')
      .update({ status, result: execResult as never } as never)
      .eq('id', (runData as { id: string }).id);

    dispatch({
      type: 'ADD_EXECUTION_RUN',
      payload: { ...(runData as Record<string, unknown>), status, result: execResult } as never,
    });

    return {
      status,
      writtenFiles: execResult.written_files ?? [],
      skippedFiles: execResult.skipped_files ?? [],
      prUrls: execResult.prs ?? [],
      collisionCount: (execResult.collisions ?? []).length,
      handoffs: (execResult.handoffs_requested ?? []) as Array<{ from_agent: string; path: string }>,
      backupBranch: execResult.backup_branch ?? '',
    };
  }, [state.activeSession, state.activeRepoConnection, user, collectManifest, dispatch]);

  const _unusedDispatch = dispatch;
  void _unusedDispatch;

  return {
    tasks,
    progress,
    isRunning,
    isDecomposing,
    adapterOverride,
    sessionProgress,
    sessionRuns,
    isSessionRunning,
    loadTasks,
    decompose,
    execute,
    executeSession,
    executeSessionPlan,
    abortSessionBuild,
    resetSessionBuildState,
    collectSessionManifest,
    getJobOutput,
    pushSessionBuildToGithub,
    pushTaskBuildToGithub,
    abort,
    skipTask,
    retryTask,
    swapAdapter,
    collectManifest,
  };
}
