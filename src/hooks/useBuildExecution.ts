import { useCallback, useRef, useState } from 'react';
import { invokeEdgeFunction } from '../lib/functions';
import { supabase } from '../lib/supabase';
import { useMaestro } from '../context/MaestroContext';
import { useAuth } from '../context/AuthContext';
import { BuildTask, BuildTaskStatus, Agent } from '../types';

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
  const { user, session } = useAuth();

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
  }, [resolveAgent, updateTaskStatus, state.activeSession?.id]);

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
  const _unusedUser = user;
  void _unusedDispatch;
  void _unusedUser;

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
