import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Loader2, CheckCircle, XCircle, Play, X, ChevronDown,
  Server, Files, Clock, GitBranch, AlertCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { invokeEdgeFunction } from '../../lib/functions';
import { useMaestro } from '../../context/MaestroContext';
import type { ClawBuildSessionState, ExecutorJob } from '../../types';

// ─── Types ────────────────────────────────────────────────────
type SessionPhase = 'idle' | 'running' | 'succeeded' | 'failed';

interface ManifestEntry {
  path: string;
  content: string;
  operation: string;
}

interface JobRow {
  status: string;
  error_text: string | null;
  artifact_manifest: ManifestEntry[] | null;
}

// ─── Constants ────────────────────────────────────────────────
const ADAPTERS = [
  { value: 'claude_code', label: 'Claude Code' },
  { value: 'codex_cli', label: 'OpenAI Codex' },
  { value: 'copilot_cli', label: 'GitHub Copilot' },
];

const STALE_MS = 60_000;
const POLL_MS = 5_000;
const TIMEOUT_MS = 40 * 60 * 1_000;

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ─── Component ────────────────────────────────────────────────
export default function ClawBuildSessionCard({ session }: { session: ClawBuildSessionState }) {
  const { state, dispatch } = useMaestro();

  const [adapter, setAdapter] = useState('claude_code');
  const [scope, setScope] = useState(session.suggestedScope || 'src/**');
  const [phase, setPhase] = useState<SessionPhase>('idle');
  const [filesWritten, setFilesWritten] = useState(0);
  const [manifest, setManifest] = useState<ManifestEntry[]>([]);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const abortRef = useRef(false);
  const startTimeRef = useRef<number | null>(null);

  // Check if an online executor supports the selected adapter
  const findOnlineExecutor = useCallback(() => {
    return state.executors.find(ex => {
      if (ex.status !== 'online') return false;
      if (!ex.last_seen_at) return false;
      if (Date.now() - new Date(ex.last_seen_at).getTime() >= STALE_MS) return false;
      const adapters = (ex.capabilities as Record<string, unknown>).adapters;
      if (!Array.isArray(adapters)) return false;
      return (adapters as string[]).includes(adapter);
    }) ?? null;
  }, [state.executors, adapter]);

  const executorOnline = useMemo(() => findOnlineExecutor() !== null, [findOnlineExecutor]);

  // Poll a job until it reaches a terminal status
  const pollJob = useCallback(async (jobId: string) => {
    const start = Date.now();

    while (Date.now() - start < TIMEOUT_MS && !abortRef.current) {
      await new Promise<void>(r => setTimeout(r, POLL_MS));
      if (abortRef.current) break;

      const { data: jobRaw } = await supabase
        .from('executor_jobs')
        .select('status, error_text, artifact_manifest')
        .eq('id', jobId)
        .maybeSingle();

      const job = jobRaw as JobRow | null;
      if (!job) {
        setPhase('failed');
        setErrorText('Job not found in database');
        return;
      }

      if (Array.isArray(job.artifact_manifest)) {
        setFilesWritten(job.artifact_manifest.length);
        setManifest(job.artifact_manifest as ManifestEntry[]);
      }

      if (job.status === 'succeeded') {
        setPhase('succeeded');
        return;
      }
      if (['failed', 'cancelled', 'expired'].includes(job.status)) {
        setPhase('failed');
        setErrorText(job.error_text ?? 'Session job failed');
        return;
      }
    }

    if (!abortRef.current) {
      setPhase('failed');
      setErrorText('Session timed out after 40 minutes');
    }
  }, []); // only uses refs + stable setState — no reactive deps needed

  // Re-attach to an already-running job if this card remounts mid-session
  useEffect(() => {
    if (session.activeJobId && phase === 'idle') {
      setPhase('running');
      startTimeRef.current = Date.now();
      abortRef.current = false;
      void pollJob(session.activeJobId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only on mount

  // Elapsed-time counter while running
  useEffect(() => {
    if (phase !== 'running') return;
    const interval = setInterval(() => {
      if (startTimeRef.current !== null) {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  // Submit a new build_session job to the executor API
  const handleStart = useCallback(async () => {
    const executor = findOnlineExecutor();
    if (!executor) {
      setErrorText(`No online executor with adapter "${adapter}" found. Check the Vault.`);
      return;
    }

    setPhase('running');
    setElapsedSeconds(0);
    startTimeRef.current = Date.now();
    abortRef.current = false;
    setErrorText(null);
    setFilesWritten(0);
    setManifest([]);

    const repoConn = state.activeRepoConnection;
    const cloneUrl = repoConn
      ? `https://github.com/${repoConn.owner}/${repoConn.repo}.git`
      : null;
    const buildSpec = state.activeSession?.build_spec as Record<string, string> | undefined;
    const prompt =
      state.buildPlan?.build_prompt ??
      buildSpec?.requested_build_prompt ??
      state.activeSession?.title ??
      'Build this project';

    try {
      const result = await invokeEdgeFunction<{ job: ExecutorJob }>('executor-api?action=submit', {
        session_id: state.activeSession?.id,
        job_type: 'build_session',
        adapter,
        prompt,
        repo_url: cloneUrl,
        repo_name: repoConn?.repo ?? null,
        branch: repoConn?.default_branch ?? null,
        allowed_paths: [scope],
        timeout_seconds: 1800,
        context_bundle: {
          scope,
          ...(state.activeSession?.architect_md
            ? { architect_content: state.activeSession.architect_md }
            : {}),
        },
      });

      const jobId = result.job?.id;
      if (!jobId) throw new Error('No job ID returned from executor API');

      // Persist jobId in context so we can re-attach if this card remounts
      dispatch({ type: 'SET_CLAW_BUILD_SESSION', payload: { ...session, activeJobId: jobId } });

      await pollJob(jobId);
    } catch (err) {
      setPhase('failed');
      setErrorText(err instanceof Error ? err.message : 'Failed to submit session job');
    }
  }, [
    adapter, scope, findOnlineExecutor, session,
    state.activeSession, state.activeRepoConnection, state.buildPlan,
    dispatch, pollJob,
  ]);

  const handleAbort = useCallback(async () => {
    abortRef.current = true;

    // Cancel the remote job if we have an ID
    if (session.activeJobId) {
      try {
        await supabase
          .from('executor_jobs')
          .update({ status: 'cancelled' } as never)
          .eq('id', session.activeJobId)
          .eq('status', 'running');
      } catch {
        // best-effort — local abort still fires
      }
    }

    setPhase('failed');
    setErrorText('Aborted by user');
  }, [session.activeJobId]);

  const handleDismiss = useCallback(() => {
    abortRef.current = true;
    dispatch({ type: 'SET_CLAW_BUILD_SESSION', payload: null });
  }, [dispatch]);

  const handleOpenBuildWorkspace = useCallback(() => {
    dispatch({ type: 'SET_BUILD_DRAWER_EXPANDED', payload: true });
  }, [dispatch]);

  // ─── Render ───────────────────────────────────────────────────
  return (
    <div className="mx-3 mb-3 rounded-xl border border-signal-ok/25 bg-signal-ok/5 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-signal-ok/15">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-signal-ok/15 flex items-center justify-center flex-shrink-0">
            {phase === 'running' ? (
              <Loader2 size={14} className="text-signal-ok/90 animate-spin" />
            ) : phase === 'succeeded' ? (
              <CheckCircle size={14} className="text-signal-ok/90" />
            ) : phase === 'failed' ? (
              <XCircle size={14} className="text-signal-risk/90" />
            ) : (
              <Server size={14} className="text-signal-ok/70" />
            )}
          </div>
          <div>
            <div className="text-[11px] font-medium text-signal-ok/90 uppercase tracking-wider">
              Build Session
            </div>
            <div className="text-[10px] text-white/50">
              {phase === 'idle' && 'Ready to start'}
              {phase === 'running' && `Running · ${formatElapsed(elapsedSeconds)}`}
              {phase === 'succeeded' && `Complete · ${filesWritten} file${filesWritten !== 1 ? 's' : ''}`}
              {phase === 'failed' && 'Failed'}
            </div>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="w-6 h-6 rounded-md flex items-center justify-center text-white/40 hover:text-white/70 hover:bg-white/[0.08] transition-all"
          aria-label="Dismiss build session card"
        >
          <X size={12} />
        </button>
      </div>

      {/* Config — shown when idle or failed */}
      {(phase === 'idle' || phase === 'failed') && (
        <div className="px-4 py-3 space-y-3">
          {/* Adapter selector */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-white/50 uppercase tracking-wider w-16 flex-shrink-0">Adapter</span>
            <div className="relative flex-1">
              <select
                value={adapter}
                onChange={e => setAdapter(e.target.value)}
                className="w-full appearance-none bg-white/[0.04] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/80 focus:outline-none focus:ring-1 focus:ring-signal-ok/40 pr-7"
              >
                {ADAPTERS.map(a => (
                  <option key={a.value} value={a.value} className="bg-void text-white">
                    {a.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
            </div>
          </div>

          {/* Scope */}
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-white/50 uppercase tracking-wider w-16 flex-shrink-0">Scope</span>
            <input
              type="text"
              value={scope}
              onChange={e => setScope(e.target.value)}
              placeholder="src/**"
              className="flex-1 bg-white/[0.04] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/80 focus:outline-none focus:ring-1 focus:ring-signal-ok/40 font-mono"
            />
          </div>

          {/* Builders */}
          {session.builderNames.length > 0 && (
            <div className="flex items-start gap-3">
              <span className="text-[10px] text-white/50 uppercase tracking-wider w-16 flex-shrink-0 mt-0.5">Builders</span>
              <span className="text-xs text-white/60">{session.builderNames.join(', ')}</span>
            </div>
          )}

          {/* Executor status dot */}
          <div className="flex items-center gap-1.5 text-[10px]">
            <div className={`w-1.5 h-1.5 rounded-full ${executorOnline ? 'bg-signal-ok' : 'bg-signal-risk'}`} />
            <span className={executorOnline ? 'text-signal-ok/80' : 'text-signal-risk/80'}>
              {executorOnline
                ? `${ADAPTERS.find(a => a.value === adapter)?.label ?? adapter} executor online`
                : `No "${adapter}" executor online`}
            </span>
          </div>

          {/* Error message */}
          {errorText && (
            <div className="flex items-start gap-2 text-xs text-signal-risk/80 bg-signal-risk/5 border border-signal-risk/20 rounded-lg px-3 py-2">
              <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
              <span>{errorText}</span>
            </div>
          )}

          {/* Start button */}
          <button
            onClick={handleStart}
            disabled={!executorOnline}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-signal-ok/80 hover:bg-signal-ok
                       text-white text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Play size={13} fill="currentColor" />
            Start Build Session
          </button>
        </div>
      )}

      {/* Progress — shown while running */}
      {phase === 'running' && (
        <div className="px-4 py-3 space-y-3">
          <div className="flex items-center gap-4 text-xs text-white/60">
            <div className="flex items-center gap-1.5">
              <Clock size={11} className="text-white/40" />
              <span>{formatElapsed(elapsedSeconds)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Files size={11} className="text-white/40" />
              <span>{filesWritten} files</span>
            </div>
            <div className="flex items-center gap-1.5">
              <GitBranch size={11} className="text-white/40" />
              <span>{ADAPTERS.find(a => a.value === adapter)?.label ?? adapter}</span>
            </div>
          </div>

          <div className="h-0.5 bg-white/[0.06] rounded-full overflow-hidden">
            <div className="h-full bg-signal-ok/50 animate-pulse rounded-full w-full" />
          </div>

          <div className="text-[10px] text-white/40">
            Scope: <code className="text-white/60 font-mono">{scope}</code>
          </div>

          <button
            onClick={handleAbort}
            className="flex items-center gap-1.5 text-[11px] text-signal-risk/60 hover:text-signal-risk/90 transition-colors"
          >
            <XCircle size={11} />
            Abort session
          </button>
        </div>
      )}

      {/* Success — shown after completion */}
      {phase === 'succeeded' && (
        <div className="px-4 py-3 space-y-3">
          <div className="flex items-center gap-2 text-xs text-signal-ok/80">
            <CheckCircle size={13} className="flex-shrink-0" />
            <span>
              {filesWritten} file{filesWritten !== 1 ? 's' : ''} generated
              {elapsedSeconds > 0 ? ` in ${formatElapsed(elapsedSeconds)}` : ''}
            </span>
          </div>

          {manifest.length > 0 && (
            <div className="space-y-0.5 max-h-28 overflow-y-auto">
              {manifest.slice(0, 8).map((entry, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px] font-mono">
                  <span className={entry.operation === 'delete' ? 'text-signal-risk/60' : 'text-signal-ok/60'}>
                    {entry.operation === 'delete' ? '[×]' : '[~]'}
                  </span>
                  <span className="text-white/50 truncate">{entry.path}</span>
                </div>
              ))}
              {manifest.length > 8 && (
                <div className="text-[10px] text-white/35 pl-5">+{manifest.length - 8} more</div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenBuildWorkspace}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.10]
                         text-white/70 text-xs font-medium transition-all"
            >
              <GitBranch size={12} />
              Push via Build Workspace
            </button>
            <button
              onClick={handleDismiss}
              className="px-3 py-1.5 rounded-lg text-white/40 hover:text-white/60 hover:bg-white/[0.06] text-xs transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
