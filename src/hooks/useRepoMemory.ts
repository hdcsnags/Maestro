import { useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useMaestro } from '../context/MaestroContext';
import { useAuth } from '../context/AuthContext';
import { RepoMemoryRecord } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

export interface SummarizeOptions {
  sessionId?: string;
  sessionGoal?: string;
  buildStatus?: string;
  keyDecisions?: string;
  userPreferences?: string;
}

export function useRepoMemory() {
  const { state, dispatch } = useMaestro();
  const { user } = useAuth();
  const subscriptionRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const repoFullName = state.activeSession?.github_repo?.trim().toLowerCase() || null;

  // Load memory whenever the active session's repo changes
  const loadMemory = useCallback(async (repo: string) => {
    if (!user) return;
    const { data, error } = await supabase
      .from('repo_memory')
      .select('*')
      .eq('user_id', user.id)
      .eq('repo_full_name', repo)
      .maybeSingle();
    if (!error) {
      dispatch({ type: 'SET_REPO_MEMORY', payload: (data as RepoMemoryRecord | null) ?? null });
    }
  }, [user, dispatch]);

  useEffect(() => {
    // Unsubscribe from previous repo's channel
    if (subscriptionRef.current) {
      subscriptionRef.current.unsubscribe();
      subscriptionRef.current = null;
    }

    if (!repoFullName || !user) {
      dispatch({ type: 'SET_REPO_MEMORY', payload: null });
      return;
    }

    // Initial load
    loadMemory(repoFullName);

    // Realtime subscription for live updates (e.g., when summarize writes from another tab)
    const channel = supabase
      .channel(`repo_memory:${user.id}:${repoFullName}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'repo_memory',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            dispatch({ type: 'SET_REPO_MEMORY', payload: null });
          } else if (payload.new) {
            const rec = payload.new as RepoMemoryRecord;
            if (rec.repo_full_name === repoFullName) {
              dispatch({ type: 'SET_REPO_MEMORY', payload: rec });
            }
          }
        },
      )
      .subscribe();

    subscriptionRef.current = channel;

    return () => {
      channel.unsubscribe();
      subscriptionRef.current = null;
    };
  }, [repoFullName, user, loadMemory, dispatch]);

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const callEdgeFn = useCallback(async (action: string, method: 'GET' | 'POST', body?: unknown): Promise<unknown> => {
    const token = await getAccessToken();
    const url = `${SUPABASE_URL}/functions/v1/repo-memory-update?action=${action}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return res.json();
  }, [getAccessToken]);

  /** Trigger LLM summarization of the current session into repo memory. */
  const triggerSummarize = useCallback(async (opts: SummarizeOptions = {}): Promise<boolean> => {
    if (!repoFullName) return false;
    try {
      const result = await callEdgeFn('summarize', 'POST', {
        repo_full_name: repoFullName,
        session_id: opts.sessionId ?? state.activeSession?.id,
        session_goal: opts.sessionGoal ?? state.activeSession?.title ?? '',
        build_status: opts.buildStatus ?? '',
        key_decisions: opts.keyDecisions ?? '',
        user_preferences: opts.userPreferences ?? '',
      }) as { ok?: boolean; error?: string };
      if (result.ok) {
        // Realtime subscription will update state; reload as fallback
        await loadMemory(repoFullName);
        return true;
      }
      console.warn('[useRepoMemory] summarize failed:', result.error);
      return false;
    } catch (err) {
      console.error('[useRepoMemory] triggerSummarize error:', err);
      return false;
    }
  }, [repoFullName, callEdgeFn, loadMemory, state.activeSession]);

  /** Directly write memory content (manual edit — bypasses LLM). */
  const saveDirectEdit = useCallback(async (content: string): Promise<boolean> => {
    if (!repoFullName) return false;
    try {
      const result = await callEdgeFn('update_direct', 'POST', {
        repo_full_name: repoFullName,
        content,
      }) as { ok?: boolean; error?: string };
      if (result.ok) {
        await loadMemory(repoFullName);
        return true;
      }
      console.warn('[useRepoMemory] update_direct failed:', result.error);
      return false;
    } catch {
      return false;
    }
  }, [repoFullName, callEdgeFn, loadMemory]);

  /** Delete repo memory permanently. */
  const forget = useCallback(async (): Promise<boolean> => {
    if (!repoFullName) return false;
    try {
      const result = await callEdgeFn('forget', 'POST', {
        repo_full_name: repoFullName,
      }) as { ok?: boolean; error?: string };
      if (result.ok) {
        dispatch({ type: 'SET_REPO_MEMORY', payload: null });
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, [repoFullName, callEdgeFn, dispatch]);

  return {
    memory: state.repoMemory,
    repoFullName,
    loadMemory,
    triggerSummarize,
    saveDirectEdit,
    forget,
  };
}
