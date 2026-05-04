import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { useMaestro } from '../context/MaestroContext';
import { modelToProviderKey, registerRerouteHandler, updateHealth, type ProviderHealthMap } from '../lib/providerHealth';
import type { FailureClass, ProviderHealthRecord, RerouteDecision } from '../types';

export function useProviderHealth() {
  const { user } = useAuth();
  const { dispatch } = useMaestro();
  const healthRef = useRef<ProviderHealthMap>(new Map());
  const dirtyRef = useRef(false);
  const writeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [healthSnapshot, setHealthSnapshot] = useState<ProviderHealthRecord[]>([]);

  // Reroute waiters keyed by build_task.id
  const rerouteWaitersRef = useRef(new Map<string, {
    resolve: (decision: RerouteDecision) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }>());

  // Load provider health from DB on mount
  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('provider_health')
      .select('*')
      .eq('user_id', user.id)
      .then(({ data }: { data: ProviderHealthRecord[] | null }) => {
        if (data && data.length > 0) {
          const map = new Map<string, ProviderHealthRecord>();
          for (const row of data) {
            map.set(row.provider_id, row);
          }
          healthRef.current = map;
          const snapshot = Array.from(map.values());
          setHealthSnapshot(snapshot);
          dispatch({ type: 'SET_PROVIDER_HEALTH', payload: snapshot });
        }
      });
  }, [user, dispatch]);

  // Register reroute handler so RerouteApprovalCard can resolve waiters
  useEffect(() => {
    registerRerouteHandler((buildTaskId, decision) => {
      const waiter = rerouteWaitersRef.current.get(buildTaskId);
      if (waiter) {
        clearTimeout(waiter.timeoutId);
        rerouteWaitersRef.current.delete(buildTaskId);
        waiter.resolve(decision);
      }
    });
    return () => {
      // Clear handler and reject all pending waiters on unmount
      registerRerouteHandler(null);
      for (const [, waiter] of rerouteWaitersRef.current) {
        clearTimeout(waiter.timeoutId);
        waiter.resolve('skip');
      }
      rerouteWaitersRef.current.clear();
    };
  }, []);

  const refreshDispatch = useCallback(() => {
    const snapshot = Array.from(healthRef.current.values());
    setHealthSnapshot(snapshot);
    dispatch({ type: 'SET_PROVIDER_HEALTH', payload: snapshot });
  }, [dispatch]);

  const scheduleWriteback = useCallback(() => {
    if (writeTimerRef.current) return;
    writeTimerRef.current = setTimeout(() => {
      writeTimerRef.current = null;
      if (!dirtyRef.current || !user) return;
      dirtyRef.current = false;
      for (const row of healthRef.current.values()) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase as any)
          .from('provider_health')
          .upsert(row as unknown as Record<string, unknown>, { onConflict: 'user_id,provider_id' })
          .then(({ error }: { error: { message: string } | null }) => {
            if (error) console.warn('[useProviderHealth] write-back error', error);
          });
      }
    }, 5000);
  }, [user]);

  const observeSuccess = useCallback((modelId: string) => {
    if (!user) return;
    const provider = modelToProviderKey(modelId);
    const existing = healthRef.current.get(provider) ?? {
      user_id: user.id,
      provider_id: provider,
      state: 'unknown' as const,
      recent_failure_count: 0,
      recent_success_count: 0,
    };
    const updated = updateHealth(existing, 'success');
    healthRef.current.set(provider, updated);
    dirtyRef.current = true;
    scheduleWriteback();
    refreshDispatch();
  }, [user, scheduleWriteback, refreshDispatch]);

  const observeFailure = useCallback((modelId: string, failureClass: FailureClass, rateLimitSeconds?: number) => {
    if (!user) return;
    const provider = modelToProviderKey(modelId);
    const existing = healthRef.current.get(provider) ?? {
      user_id: user.id,
      provider_id: provider,
      state: 'unknown' as const,
      recent_failure_count: 0,
      recent_success_count: 0,
    };
    const updated = updateHealth(existing, 'failure', failureClass, rateLimitSeconds);
    healthRef.current.set(provider, updated);
    dirtyRef.current = true;
    scheduleWriteback();
    refreshDispatch();
  }, [user, scheduleWriteback, refreshDispatch]);

  const awaitRerouteDecision = useCallback((buildTaskId: string): Promise<RerouteDecision> => {
    return new Promise<RerouteDecision>((resolve) => {
      // 5-minute timeout → auto-use emergency fallback
      const timeoutId = setTimeout(() => {
        rerouteWaitersRef.current.delete(buildTaskId);
        resolve('emergency');
      }, 300_000);
      rerouteWaitersRef.current.set(buildTaskId, { resolve, timeoutId });
    });
  }, []);

  const abortAllWaiters = useCallback(() => {
    for (const [, waiter] of rerouteWaitersRef.current) {
      clearTimeout(waiter.timeoutId);
      waiter.resolve('skip');
    }
    rerouteWaitersRef.current.clear();
  }, []);

  return {
    providerHealthRef: healthRef,
    healthSnapshot,
    observeSuccess,
    observeFailure,
    awaitRerouteDecision,
    abortAllWaiters,
  };
}
