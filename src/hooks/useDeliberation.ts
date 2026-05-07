import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useMaestro } from '../context/MaestroContext';
import { Response as MaestroResponse } from '../types';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface DeliberateResult {
  status: string;
  completed_at?: string;
  error?: string;
}

export function useDeliberation() {
  const { state, dispatch } = useMaestro();

  const triggerDeliberation = useCallback(async (roundId: string): Promise<boolean> => {
    if (state.isDeliberating) return false;
    dispatch({ type: 'SET_IS_DELIBERATING', payload: true });

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        console.error('[useDeliberation] no auth token');
        dispatch({ type: 'SHOW_TOAST', payload: 'Deliberation failed: not authenticated' });
        return false;
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/deliberate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ round_id: roundId }),
      });

      const result = await res.json() as DeliberateResult;

      if (!res.ok || result.error) {
        const msg = result.error ?? `HTTP ${res.status}`;
        console.error('[useDeliberation] error:', msg);
        dispatch({ type: 'SHOW_TOAST', payload: `Deliberation failed: ${msg}` });
        return false;
      }

      // Load new deliberation response rows and add to state (deduped)
      const { data: deliberationRows, error: fetchErr } = await supabase
        .from('responses')
        .select('*')
        .eq('round_id', roundId)
        .eq('kind', 'deliberation');

      if (!fetchErr && deliberationRows) {
        for (const row of deliberationRows as MaestroResponse[]) {
          dispatch({ type: 'ADD_RESPONSE', payload: row });
        }
      }

      // Mark round as deliberated
      const completedAt = result.completed_at ?? new Date().toISOString();
      dispatch({
        type: 'UPDATE_ROUND',
        payload: { id: roundId, deliberation_enabled: true, deliberation_completed_at: completedAt },
      });

      dispatch({ type: 'SHOW_TOAST', payload: 'Deliberation complete — pushbacks loaded' });
      return true;
    } catch (err) {
      console.error('[useDeliberation] unexpected error:', err);
      dispatch({ type: 'SHOW_TOAST', payload: 'Deliberation failed: unexpected error' });
      return false;
    } finally {
      dispatch({ type: 'SET_IS_DELIBERATING', payload: false });
    }
  }, [state.isDeliberating, dispatch]);

  return { triggerDeliberation };
}
