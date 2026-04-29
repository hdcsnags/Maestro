import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Loader2, CheckCircle, XCircle, Play, X, ChevronDown,
  Server, Files, Clock, GitBranch, AlertCircle,
} from 'lucide-react';
import { selectOnlineExecutor } from '../../lib/sessionBuild';
import { useMaestro } from '../../context/MaestroContext';
import { useBuildExecution } from '../../hooks/useBuildExecution';
import type { ClawBuildSessionState } from '../../types';

// ─── Types ────────────────────────────────────────────────────
type SessionPhase = 'idle' | 'running' | 'succeeded' | 'failed';

interface ManifestEntry {
  path: string;
  content: string;
  operation: string;
}

// ─── Constants ────────────────────────────────────────────────
const ADAPTERS = [
  { value: 'claude_code', label: 'Claude Code' },
  { value: 'codex_cli', label: 'OpenAI Codex' },
  { value: 'copilot_cli', label: 'GitHub Copilot' },
];

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ─── Component ────────────────────────────────────────────────
export default function ClawBuildSessionCard({ session }: { session: ClawBuildSessionState }) {
  const { state, dispatch } = useMaestro();
  const buildExec = useBuildExecution();

  const [adapter, setAdapter] = useState(session.defaultAdapter ?? 'claude_code');
  const [scope, setScope] = useState(session.suggestedScope || 'src/**');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [pushState, setPushState] = useState<'idle' | 'pushing' | 'done' | 'failed'>('idle');
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushPrUrls, setPushPrUrls] = useState<string[]>([]);
  const [pushWrittenFiles, setPushWrittenFiles] = useState<string[]>([]);
  const [pushSkippedFiles, setPushSkippedFiles] = useState<Array<{ path: string; reason: string }>>([]);
  const [pushBackupBranch, setPushBackupBranch] = useState('');

  const startTimeRef = useRef<number | null>(null);
  const phase = buildExec.sessionProgress.status as SessionPhase;
  const filesWritten = buildExec.sessionProgress.filesWritten;
  const manifest = buildExec.sessionProgress.manifest as ManifestEntry[];
  const errorText = buildExec.sessionProgress.errorText;
  const sessionRuns = buildExec.sessionRuns;

  // Check if an online executor supports the selected adapter
  const findOnlineExecutor = useCallback(() => {
      return selectOnlineExecutor(state.executors, adapter);
    }, [state.executors, adapter]);

  const executorOnline = useMemo(() => findOnlineExecutor() !== null, [findOnlineExecutor]);

  useEffect(() => {
    setAdapter(session.defaultAdapter ?? 'claude_code');
    setScope(session.suggestedScope || 'src/**');
    setPushState('idle');
    setPushError(null);
    setPushPrUrls([]);
    setPushWrittenFiles([]);
    setPushSkippedFiles([]);
    setPushBackupBranch('');
  }, [session.defaultAdapter, session.suggestedScope, session.threadId]);

  useEffect(() => {
    if (!buildExec.sessionProgress.jobId || session.activeJobId === buildExec.sessionProgress.jobId) return;
    dispatch({
      type: 'SET_CLAW_BUILD_SESSION',
      payload: { ...session, activeJobId: buildExec.sessionProgress.jobId },
    });
  }, [buildExec.sessionProgress.jobId, dispatch, session]);

  // Elapsed-time counter while running
  useEffect(() => {
    if (phase !== 'running') return;
    if (startTimeRef.current === null) {
      startTimeRef.current = Date.now();
    }
    const interval = setInterval(() => {
      if (startTimeRef.current !== null) {
        setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (phase === 'idle') {
      startTimeRef.current = null;
      setElapsedSeconds(0);
    }
  }, [phase]);

  // Submit a new build_session job to the executor API
  const handleStart = useCallback(async () => {
    const executor = findOnlineExecutor();
    if (!executor) {
      return;
    }

    setElapsedSeconds(0);
    startTimeRef.current = Date.now();
    setPushState('idle');
    setPushError(null);
    setPushPrUrls([]);
    setPushWrittenFiles([]);
    setPushSkippedFiles([]);
    setPushBackupBranch('');
    await buildExec.executeSession(adapter, scope);
  }, [adapter, scope, findOnlineExecutor, buildExec]);

  const handleAbort = useCallback(async () => {
    await buildExec.abortSessionBuild();
  }, [buildExec]);

  const handleDismiss = useCallback(() => {
    if (!buildExec.isSessionRunning) {
      buildExec.resetSessionBuildState();
    }
    dispatch({ type: 'SET_CLAW_BUILD_SESSION', payload: null });
  }, [buildExec, dispatch]);

  const handleOpenBuildWorkspace = useCallback(() => {
    dispatch({ type: 'SET_BUILD_DRAWER_EXPANDED', payload: true });
  }, [dispatch]);

  const handlePushToGithub = useCallback(async () => {
    setPushState('pushing');
    setPushError(null);

    try {
      const result = await buildExec.pushSessionBuildToGithub(adapter);
      setPushPrUrls(result.prUrls);
      setPushWrittenFiles(result.writtenFiles);
      setPushSkippedFiles(result.skippedFiles);
      setPushBackupBranch(result.backupBranch);
      setPushState('done');
    } catch (error) {
      setPushError(error instanceof Error ? error.message : String(error));
      setPushState('failed');
    }
  }, [adapter, buildExec]);

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
              {phase === 'running' && `Running · ${formatElapsed(elapsedSeconds)}${sessionRuns.length > 1 ? ` · ${sessionRuns.length} builders` : ''}`}
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

          {sessionRuns.length > 0 && (
            <div className="space-y-1.5">
              {sessionRuns.map((run) => (
                <div key={run.key} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider">
                    <span className="text-white/60">{run.builderName}</span>
                    <span className={run.status === 'succeeded' ? 'text-signal-ok/80' : run.status === 'failed' ? 'text-signal-risk/80' : 'text-white/40'}>
                      {run.status}
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-white/45 font-mono">
                    {run.adapter} · {run.scopePaths.join(' · ')}
                  </div>
                </div>
              ))}
            </div>
          )}

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

          {sessionRuns.length > 1 && (
            <div className="space-y-1.5">
              {sessionRuns.map((run) => (
                <div key={run.key} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[10px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-white/65">{run.builderName}</span>
                    <span className={run.status === 'succeeded' ? 'text-signal-ok/80' : 'text-signal-risk/80'}>
                      {run.filesWritten} file{run.filesWritten === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(pushState !== 'idle' || pushError || pushPrUrls.length > 0) && (
            <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
              <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider">
                <span className="text-white/55">GitHub Push</span>
                <span className={
                  pushState === 'done'
                    ? 'text-signal-ok/80'
                    : pushState === 'failed'
                      ? 'text-signal-risk/80'
                      : pushState === 'pushing'
                        ? 'text-gold/80'
                        : 'text-white/35'
                }>
                  {pushState === 'done' && 'Complete'}
                  {pushState === 'failed' && 'Failed'}
                  {pushState === 'pushing' && 'Pushing'}
                  {pushState === 'idle' && 'Ready'}
                </span>
              </div>

              {pushState === 'pushing' && (
                <div className="flex items-center gap-2 text-[11px] text-gold/80">
                  <Loader2 size={12} className="animate-spin" />
                  <span>Creating branch and PR from the session manifest…</span>
                </div>
              )}

              {pushError && (
                <div className="flex items-start gap-2 text-[11px] text-signal-risk/80">
                  <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                  <span>{pushError}</span>
                </div>
              )}

              {pushState === 'done' && (
                <div className="space-y-2 text-[11px] text-white/60">
                  <div>
                    {pushWrittenFiles.length} committed file{pushWrittenFiles.length === 1 ? '' : 's'}
                    {pushSkippedFiles.length > 0 ? ` · ${pushSkippedFiles.length} skipped` : ''}
                  </div>
                  {pushBackupBranch && (
                    <div className="text-white/45">
                      Backup branch: <code className="font-mono text-white/60">{pushBackupBranch}</code>
                    </div>
                  )}
                  {pushPrUrls.length > 0 && (
                    <div className="space-y-1">
                      {pushPrUrls.map((url, index) => (
                        <a
                          key={`${url}-${index}`}
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-signal-ok/80 hover:text-signal-ok text-[11px] underline underline-offset-2 break-all"
                        >
                          Open PR {pushPrUrls.length > 1 ? index + 1 : ''}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={handlePushToGithub}
              disabled={pushState === 'pushing' || !state.activeRepoConnection?.id}
              className="flex-1 flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-signal-ok/80 hover:bg-signal-ok
                         text-white text-xs font-medium transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {pushState === 'pushing'
                ? <Loader2 size={12} className="animate-spin" />
                : <GitBranch size={12} />}
              {state.activeRepoConnection?.id ? (pushState === 'done' ? 'Push Again' : 'Push to GitHub') : 'Connect GitHub Repo'}
            </button>
            <button
              onClick={handleOpenBuildWorkspace}
              className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.10]
                         text-white/65 text-xs font-medium transition-all"
            >
              Workspace
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
