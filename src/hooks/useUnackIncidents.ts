import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import type { ExecutorIncident } from '../types';

/**
 * Subscribes to executor_incidents via Realtime and returns the count of
 * unacknowledged critical incidents in the last 24 hours.
 * Also exposes the full recent incident list for SecurityPanel.
 */
export function useUnackIncidents() {
  const { user } = useAuth();
  const userId = user?.id;
  const [incidents, setIncidents] = useState<ExecutorIncident[]>([]);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!userId) {
      setIncidents([]);
      return;
    }

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Initial load
    supabase
      .from('executor_incidents')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setIncidents(data as ExecutorIncident[]);
      });

    // Realtime subscription
    const channel = supabase
      .channel(`incidents:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'executor_incidents',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setIncidents((prev) => [payload.new as ExecutorIncident, ...prev].slice(0, 50));
          } else if (payload.eventType === 'UPDATE') {
            setIncidents((prev) =>
              prev.map((inc) => inc.id === payload.new.id ? (payload.new as ExecutorIncident) : inc),
            );
          }
        },
      )
      .subscribe();

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [userId]);

  const unackCritical = incidents.filter(
    (inc) => inc.severity === 'critical' && !inc.acknowledged_at,
  ).length;

  return { incidents, unackCritical };
}
