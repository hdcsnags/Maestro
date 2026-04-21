import { useCallback, useRef, useState } from 'react';
import { invokeEdgeFunction } from '../lib/functions';
import { supabase } from '../lib/supabase';
import { useMaestro } from '../context/MaestroContext';
import { useAuth } from '../context/AuthContext';
import { BuildTask, BuildTaskStatus, Agent, Executor, ExecutorJob } from '../types';

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

// ── Hook ───────────────────────────────────────────────────────────────────

export function useBuildExecution() {
  const { state, dispatch } = useMaestro();
  const { session } = useAuth();

  const [tasks, setTasks] = useState<BuildTask[]>([]);
  const tasksRef = useRef<BuildTask[]>([]); // synchronous truth — avoids stale-closure bugs
  const [progress, setProgress] = useState<BuildProgress>({
    total: 0, completed: 0, failed: 0, skipped: 0, dispatched: 0, queued: 0,
  });
  const [isRunning, setIsRunning] = useState(false);
  const isRunningRef = useRef(false); // synchronous guard against double-execution
  const [isDecomposing, setIsDecomposing] = useState(false);
  const abortRef = useRef(false);

  const ensureSession = useCallback(async () => {
    if (session?.access_token) return session;
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) {
      throw new Error('Session expired. Sign in again.');
    }
    return data.session;
  }, [session]);

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

      // Load tasks from DB
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
        completed: 0,
        failed: 0,
        skipped: 0,
        dispatched: 0,
        queued: loaded.length,
      });

      return result;
    } finally {
      setIsDecomposing(false);
    }
  }, [ensureSession]);

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

  const executorSupportsAdapter = useCallback((executor: Executor, adapter: string): boolean => {
    const rawAdapters = executor.capabilities?.adapters;
    if (!Array.isArray(rawAdapters)) return false;
    return rawAdapters.some((value): value is string => typeof value === 'string' && value === adapter);
  }, []);

  const resolveLocalAdapter = useCallback((task: BuildTask): string => {
    const agent = resolveAgent(task.lane_owner ?? '');
    return agent?.provider_group === 'maestroclaw'
      ? agent.model
      : 'claude_code';
  }, [resolveAgent]);

  const findOnlineExecutor = useCallback((adapter?: string): Executor | null => {
    const STALE_MS = 60_000; // 60s — if heartbeat older than this, treat as offline
    return state.executors.find(e => {
      if (e.status !== 'online') return false;
      if (!e.last_seen_at) return false;
      if (Date.now() - new Date(e.last_seen_at).getTime() >= STALE_MS) return false;
      if (adapter && !executorSupportsAdapter(e, adapter)) return false;
      return true;
    }) ?? null;
  }, [state.executors, executorSupportsAdapter]);

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
    const POLL_MS = 2_000;
    const TIMEOUT_MS = 600_000; // 10 minutes
    const start = Date.now();

    while (Date.now() - start < TIMEOUT_MS) {
      if (abortRef.current) return false;

      const { data: job } = await supabase
        .from('executor_jobs')
        .select('status, artifact_manifest, error_text, result_summary')
        .eq('id', jobId)
        .single();

      if (!job) return false;

      if (job.status === 'succeeded') {
        const artifacts = (job.artifact_manifest ?? []) as Array<{
          path: string; content: string; operation?: string;
        }>;

        if (artifacts.length === 0) {
          await updateTaskStatus(task.id, 'failed', {
            failure_reason: 'Executor produced no artifacts',
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

      if (job.status === 'failed') {
        await updateTaskStatus(task.id, 'failed', {
          failure_reason: job.error_text || 'Executor job failed',
          provider_error: job.result_summary,
          executor_job_id: jobId,
        } as Partial<BuildTask>);
        return false;
      }

      // Still running — wait and poll again
      await new Promise(r => setTimeout(r, POLL_MS));
    }

    // Timed out waiting for executor
    await updateTaskStatus(task.id, 'failed', {
      failure_reason: 'Executor job timed out after 10 minutes',
      executor_job_id: jobId,
    } as Partial<BuildTask>);
    return false;
  }, [updateTaskStatus]);

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
    const matchingExecutor = findOnlineExecutor(adapter);

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
        branch: repoConn?.default_branch ?? 'main',
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

    // Update task with executor_job_id
    await supabase
      .from('build_tasks')
      .update({ executor_job_id: job.id } as never)
      .eq('id', task.id);

    // Poll for job completion
    return await pollExecutorJob(job.id, task);
  }, [state.activeRepoConnection, state.activeSession?.id, updateTaskStatus, pollExecutorJob, resolveLocalAdapter, findOnlineExecutor]);

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

      let maxPasses = 5; // prevent infinite loops on reroute cycles
      while (maxPasses > 0) {
        maxPasses--;

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

        // Dispatch up to 2 in parallel (one per builder) to avoid overwhelming
        const batches: BuildTask[][] = [];
        const seenOwners = new Set<string>();
        const batch: BuildTask[] = [];

        for (const task of ready) {
          if (abortRef.current) break;
          const ownerId = task.lane_owner ?? '';
          if (!seenOwners.has(ownerId) && batch.length < 2) {
            batch.push(task);
            seenOwners.add(ownerId);
          }
        }
        if (batch.length > 0) batches.push(batch);

        // Dispatch remaining one at a time
        const remaining = ready.filter(t => !batch.includes(t));
        for (const task of remaining) {
          batches.push([task]);
        }

        for (const b of batches) {
          if (abortRef.current) break;

          await Promise.all(b.map(async (task) => {
            await dispatchTask(task);
          }));

          // Refresh from ref (synchronous — no React batching delay)
          recountProgress();
        }
      }

      recountProgress();
    } finally {
      isRunningRef.current = false;
      setIsRunning(false);
    }
  }, [dispatchTask, state.activeSession?.id]);

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

  const _unusedDispatch = dispatch;
  void _unusedDispatch;

  return {
    tasks,
    progress,
    isRunning,
    isDecomposing,
    decompose,
    execute,
    abort,
    skipTask,
    retryTask,
    collectManifest,
  };
}
