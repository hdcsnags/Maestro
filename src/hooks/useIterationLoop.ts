import { useCallback, useEffect, useRef } from 'react';
import { useMaestro } from '../context/MaestroContext';
import { supabase } from '../lib/supabase';
import type { IterationLoop, IterationStep, IterationControlType } from '../types';

interface CreateLoopParams {
  sessionId: string;
  threadId?: string;
  goal: string;
  scopePaths: string[];
  verificationCommand?: string;
  verificationAdapter?: string;
  maxSteps?: number;
  totalTimeoutSeconds?: number;
  autoApply?: boolean;
  agentId?: string;
  executorId?: string;
}

export function useIterationLoop() {
  const { state, dispatch } = useMaestro();
  const subscriptionsRef = useRef<Set<string>>(new Set());

  const subscribeToLoop = useCallback((loopId: string) => {
    if (subscriptionsRef.current.has(loopId)) return;
    subscriptionsRef.current.add(loopId);

    supabase
      .channel(`iteration-loop-${loopId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'iteration_loops',
        filter: `id=eq.${loopId}`,
      }, (payload) => {
        if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
          dispatch({ type: 'UPDATE_ITERATION_LOOP', payload: payload.new as Partial<IterationLoop> & { id: string } });
        }
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'iteration_steps',
        filter: `loop_id=eq.${loopId}`,
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          dispatch({ type: 'ADD_ITERATION_STEP', payload: { ...payload.new, loop_id: loopId } as IterationStep });
        } else if (payload.eventType === 'UPDATE') {
          dispatch({ type: 'UPDATE_ITERATION_STEP', payload: { ...payload.new, loop_id: loopId } as Partial<IterationStep> & { id: string; loop_id: string } });
        }
      })
      .subscribe();
  }, [dispatch]);

  const createLoop = useCallback(async (params: CreateLoopParams): Promise<string> => {
    const session = await supabase.auth.getSession();
    const accessToken = session.data.session?.access_token;
    if (!accessToken) throw new Error('Not authenticated');

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const res = await fetch(`${supabaseUrl}/functions/v1/iteration-init`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        session_id: params.sessionId,
        thread_id: params.threadId,
        goal: params.goal,
        scope_paths: params.scopePaths,
        verification_command: params.verificationCommand,
        verification_adapter: params.verificationAdapter,
        max_steps: params.maxSteps,
        total_timeout_seconds: params.totalTimeoutSeconds,
        auto_apply: params.autoApply ?? false,
        agent_id: params.agentId,
        executor_id: params.executorId,
      }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: 'Unknown error' })) as { error?: string };
      throw new Error(body.error ?? `iteration-init failed: ${res.status}`);
    }

    const data = await res.json() as { loop_id: string };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: loop } = await (supabase as any)
      .from('iteration_loops')
      .select('*')
      .eq('id', data.loop_id)
      .maybeSingle() as { data: IterationLoop | null };

    if (loop) {
      dispatch({ type: 'ADD_ITERATION_LOOP', payload: loop });
      subscribeToLoop(data.loop_id);
    }

    return data.loop_id;
  }, [dispatch, subscribeToLoop]);

  const sendControl = useCallback(async (
    loopId: string,
    controlType: IterationControlType,
    payload?: Record<string, unknown>,
    stepId?: string
  ): Promise<void> => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('iteration_controls')
      .insert({
        loop_id: loopId,
        control_type: controlType,
        payload: payload ?? {},
        step_id: stepId ?? null,
      });
    if (error) throw new Error((error as { message: string }).message);
  }, []);

  // Load active loops for current session on mount/session change
  useEffect(() => {
    const sessionId = state.activeSession?.id;
    if (!sessionId) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('iteration_loops')
      .select('*')
      .eq('session_id', sessionId)
      .not('status', 'in', '("succeeded","failed","aborted","unrecoverable")')
      .order('created_at', { ascending: false })
      .then(({ data }: { data: IterationLoop[] | null }) => {
        if (data && data.length > 0) {
          dispatch({ type: 'SET_ITERATION_LOOPS', payload: data });
          for (const loop of data) {
            subscribeToLoop(loop.id);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (supabase as any)
              .from('iteration_steps')
              .select('*')
              .eq('loop_id', loop.id)
              .order('step_number', { ascending: true })
              .then(({ data: steps }: { data: IterationStep[] | null }) => {
                if (steps) {
                  dispatch({ type: 'SET_ITERATION_STEPS', payload: { loopId: loop.id, steps } });
                }
              });
          }
        }
      });
  }, [state.activeSession?.id, dispatch, subscribeToLoop]);

  const getLoopsForThread = useCallback((threadId: string | null): IterationLoop[] => {
    if (!threadId) return [];
    return state.iterationLoops.filter(l => l.thread_id === threadId);
  }, [state.iterationLoops]);

  const getStepsForLoop = useCallback((loopId: string): IterationStep[] => {
    return state.iterationSteps[loopId] ?? [];
  }, [state.iterationSteps]);

  return { createLoop, sendControl, subscribeToLoop, getLoopsForThread, getStepsForLoop };
}
