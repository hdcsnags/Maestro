import { useCallback, useState } from 'react';
import { invokeEdgeFunction } from '../lib/functions';
import { supabase } from '../lib/supabase';
import { useMaestro } from '../context/MaestroContext';
import type { BouncerResult, Session } from '../types';

export function useBouncerReview({
  session,
  writtenFiles,
  buildFiles,
  onApproved,
  onAborted,
}: {
  session: Session | null;
  writtenFiles: string[];
  buildFiles: Array<{ path: string; content: string; operation: string }>;
  onApproved?: () => void;
  onAborted?: () => void;
}) {
  const { dispatch } = useMaestro();
  const [bouncerLoading, setBouncerLoading] = useState(false);
  const [bouncerResult, setBouncerResult] = useState<BouncerResult | null>(null);
  const [bouncerError, setBouncerError] = useState('');
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);

  const runBouncer = useCallback(async () => {
    if (!session) return false;
    const startedAt = Date.now();
    let succeeded = false;
    setBouncerLoading(true);
    setBouncerError('');
    setBouncerResult(null);
    setElapsedMs(null);

    await supabase
      .from('sessions')
      .update({ current_phase: 'bouncer' } as never)
      .eq('id', session.id);
    dispatch({ type: 'UPDATE_ACTIVE_SESSION', payload: { current_phase: 'bouncer' } });

    try {
      const data = await invokeEdgeFunction<BouncerResult & { error?: string }>('bouncer', {
        session_id: session.id,
        trigger: 'end_of_build',
        files: writtenFiles,
        build_files: buildFiles.length > 0 ? buildFiles : undefined,
      });

      if (data.error === 'ANTHROPIC_KEY_MISSING') {
        throw new Error('Add an Anthropic API key in the Vault to run bouncer review.');
      }

      setBouncerResult(data as BouncerResult);
      setElapsedMs(Date.now() - startedAt);
      succeeded = true;
    } catch (error) {
      setBouncerError(error instanceof Error ? error.message : String(error));
    } finally {
      setBouncerLoading(false);
    }
    return succeeded;
  }, [session, writtenFiles, buildFiles, dispatch]);

  const handleConductorDecision = useCallback(async (decision: 'acknowledge' | 'pause' | 'approve_continue' | 'abort') => {
    if (!session || !bouncerResult) return;

    const { data: events } = await supabase
      .from('bouncer_events')
      .select('id')
      .eq('session_id', session.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (events?.[0]) {
      const eventId = (events[0] as { id: string }).id;
      await supabase
        .from('bouncer_events')
        .update({ conductor_decision: decision } as never)
        .eq('id', eventId);
    }

    if (decision === 'pause') {
      dispatch({ type: 'SHOW_TOAST', payload: 'Build paused — fix critical findings first' });
      return;
    }

    if (decision === 'abort') {
      await supabase
        .from('sessions')
        .update({ current_phase: 'pre_build' } as never)
        .eq('id', session.id);
      dispatch({ type: 'UPDATE_ACTIVE_SESSION', payload: { current_phase: 'pre_build' } });
      dispatch({ type: 'SHOW_TOAST', payload: 'Build aborted — returning to Pre-Build' });
      onAborted?.();
      return;
    }

    await supabase
      .from('sessions')
      .update({ current_phase: 'complete' } as never)
      .eq('id', session.id);
    dispatch({ type: 'UPDATE_ACTIVE_SESSION', payload: { current_phase: 'complete' } });
    dispatch({ type: 'SHOW_TOAST', payload: 'Build approved — session complete ✓' });
    onApproved?.();
  }, [session, bouncerResult, dispatch, onApproved, onAborted]);

  return {
    bouncerLoading,
    bouncerResult,
    bouncerError,
    elapsedMs,
    runBouncer,
    handleConductorDecision,
  };
}
