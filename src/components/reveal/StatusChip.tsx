import { useMemo, useRef, useState, useEffect } from 'react';
import { AlertTriangle, Bot, ChevronDown, Cloud, KeyRound, Laptop, Zap } from 'lucide-react';
import { useMaestro } from '../../context/MaestroContext';
import { CONCIERGE_MODELS, type ConversationBackend, type ExecutionMode } from '../../types';
import { useUnackIncidents } from '../../hooks/useUnackIncidents';
import { LOCAL_CONVERSATION_MODELS, resolveEffectiveBackend } from '../../lib/clawConversation';

type StatusKind = 'default' | 'build' | 'execute';

interface StatusChipProps {
  kind: StatusKind;
  label: string;
  description?: string;
  detailStatus?: string | null;
  pulse?: boolean;
  repoName?: string | null;
}

const CHIP_TONE: Record<StatusKind, string> = {
  default: 'border-gold/20 bg-gold/10 text-gold/95',
  build: 'border-signal-ok/25 bg-signal-ok/10 text-signal-ok/95',
  execute: 'border-signal-warn/25 bg-signal-warn/10 text-signal-warn/95',
};

const MODE_OPTIONS: Array<{ id: ExecutionMode; label: string; summary: string }> = [
  { id: 'analyze', label: 'Analyze', summary: 'Inspect and plan without approving writes.' },
  { id: 'pr_flow', label: 'PR Flow', summary: 'Write through branches and pull requests.' },
  { id: 'elevated', label: 'Elevated', summary: 'Allow the highest-trust execution path.' },
];

const BACKEND_OPTIONS: Array<{ id: ConversationBackend; label: string; summary: string }> = [
  { id: 'claw', label: 'Claw', summary: 'Concierge, council seats and synthesis run on your local MaestroClaw worker through its CLI subscriptions. No API keys spent. Falls back to the cloud while the worker is offline.' },
  { id: 'cloud', label: 'Cloud', summary: 'Turns go through the Supabase edge functions with your connected provider keys.' },
];

function isExecutorFresh(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 60_000;
}

function getExecutionModeLabel(mode: ExecutionMode): string {
  return MODE_OPTIONS.find((option) => option.id === mode)?.label ?? mode;
}

// "claude_code" → "claude", "codex_cli" → "codex", "approved_shell" → "shell".
function compactAdapterName(adapter: string): string {
  if (adapter === 'claude_code') return 'claude';
  if (adapter === 'approved_shell') return 'shell';
  if (adapter === 'pty_shell') return 'pty';
  if (adapter === 'shell_stub') return 'stub';
  if (adapter === 'github_api') return 'github';
  return adapter.replace(/_cli$/, '');
}

const SELECTED_CHIP_STYLE = { color: 'var(--text)', borderColor: 'rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)', cursor: 'pointer' } as const;

export default function StatusChip({
  kind,
  label,
  description,
  detailStatus,
  pulse = false,
  repoName,
}: StatusChipProps) {
  const { state, dispatch } = useMaestro();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { unackCritical } = useUnackIncidents();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const currentModelLabel = useMemo(() => {
    const found = CONCIERGE_MODELS.find((model) => model.id === state.conciergeModel);
    return found?.label ?? state.conciergeModel;
  }, [state.conciergeModel]);
  const connectedKeyCount = state.providerConnections.filter((connection) => connection.is_connected).length;
  const connectedKeyLabel = `${connectedKeyCount} ${connectedKeyCount === 1 ? 'key' : 'keys'} connected`;
  const onlineExecutors = useMemo(
    () => state.executors.filter((executor) => executor.status === 'online' && isExecutorFresh(executor.last_seen_at)),
    [state.executors],
  );
  // Every adapter the online executor advertises (compact names), so the chip
  // says what can actually run locally instead of naming only adapters[0].
  const { executorLabel, executorTooltip, advertisedAdapters } = useMemo(() => {
    const activeExecutor = onlineExecutors[0];
    if (!activeExecutor) {
      return { executorLabel: 'Local executor offline', executorTooltip: 'No MaestroClaw executor has checked in within the last minute.', advertisedAdapters: [] as string[] };
    }

    const adapters = Array.isArray(activeExecutor.capabilities?.adapters)
      ? activeExecutor.capabilities.adapters.filter((value): value is string => typeof value === 'string')
      : [];
    if (adapters.length === 0) {
      return { executorLabel: `${activeExecutor.name} online (no adapters)`, executorTooltip: `${activeExecutor.name} is online but advertises no adapters.`, advertisedAdapters: [] as string[] };
    }

    const compact = adapters.map((adapter) => compactAdapterName(adapter));
    return {
      executorLabel: `Local: ${compact.join(', ')}`,
      executorTooltip: `${activeExecutor.name} · adapters: ${adapters.join(', ')}`,
      advertisedAdapters: adapters,
    };
  }, [onlineExecutors]);

  // Conversation backend (Claw/Cloud) — the chosen backend downgrades to the cloud
  // while no online executor advertises the concierge adapter.
  const effective = useMemo(
    () => resolveEffectiveBackend(state.conversationBackend, state.executors, state.conciergeAdapter),
    [state.conversationBackend, state.executors, state.conciergeAdapter],
  );
  const backendLabel = effective.backend === 'claw'
    ? `Claw · ${state.conciergeLocalModel}`
    : `Cloud · ${currentModelLabel}`;
  const backendTooltip = effective.clawOffline
    ? `Claw selected, but no online executor advertises ${state.conciergeAdapter} — turns run in the cloud until the worker is back.`
    : effective.backend === 'claw'
      ? `Conversation runs on the local worker: ${state.conciergeAdapter} · ${state.conciergeLocalModel}`
      : `Conversation runs in the cloud with ${currentModelLabel}`;
  const localAdapterOptions = useMemo(() => {
    const known = ['claude_code', 'codex_cli', 'agy_cli', 'kimi_cli', 'copilot_cli', 'gemini_cli'];
    const merged = Array.from(new Set([state.conciergeAdapter, ...known.filter((adapter) => advertisedAdapters.includes(adapter))]));
    return merged;
  }, [advertisedAdapters, state.conciergeAdapter]);

  const cycleExecutionMode = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const currentIndex = MODE_OPTIONS.findIndex((option) => option.id === state.executionMode);
    const nextMode = MODE_OPTIONS[(currentIndex + 1) % MODE_OPTIONS.length];
    dispatch({ type: 'SET_EXECUTION_MODE', payload: nextMode.id });
  };

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-2">
        {unackCritical > 0 && (
          <button
            type="button"
            title={`${unackCritical} unacknowledged critical incident${unackCritical !== 1 ? 's' : ''} — click to review`}
            onClick={() => dispatch({ type: 'OPEN_DRAWER', payload: 'trust' })}
            className="flex items-center gap-1 rounded-full border border-red-500/40 bg-red-500/15 px-2 py-1 animate-pulse"
            style={{ cursor: 'pointer' }}
          >
            <AlertTriangle size={11} style={{ color: 'var(--risk)' }} />
            <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--risk)' }}>{unackCritical}</span>
          </button>
        )}
        {state.repoMemory && (
          <button
            type="button"
            title={`Project memory loaded (${state.repoMemory.byte_count} B) — click to view`}
            onClick={() => dispatch({ type: 'OPEN_DRAWER', payload: 'trust' })}
            className="flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.06] px-2 py-1"
            style={{ cursor: 'pointer', fontSize: '11px', color: 'var(--gold)' }}
          >
            📝
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-left ${CHIP_TONE[kind]}`}
          title={`${backendTooltip}\n${executorTooltip}`}
        >
          {effective.backend === 'claw' ? <Laptop size={12} className={pulse ? 'animate-pulse' : undefined} /> : <Cloud size={12} className={pulse ? 'animate-pulse' : undefined} />}
          <span className="max-w-[min(48vw,34rem)] truncate text-[11px] font-medium tracking-wide">
            {`${label}: ${backendLabel} · ${executorLabel} · ${connectedKeyLabel}`}
          </span>
          <ChevronDown size={12} className={open ? 'rotate-180 transition-transform' : 'transition-transform'} />
        </button>

        <button
          type="button"
          onClick={cycleExecutionMode}
          className="reveal-chip"
          title="Cycle execution mode"
          style={{
            cursor: 'pointer',
            color: state.executionMode === 'elevated' ? 'var(--risk)' : state.executionMode === 'analyze' ? 'var(--text-dim)' : 'var(--gold)',
          }}
        >
          <Zap size={11} />
          {getExecutionModeLabel(state.executionMode)}
        </button>
      </div>

      {open && (
        <div
          className="absolute left-0 top-full z-30 mt-2 w-[min(32rem,calc(100vw-3rem))] rounded-2xl border border-white/10 bg-[#0c1017]/96 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <DetailCell icon={effective.backend === 'claw' ? <Laptop size={13} /> : <Cloud size={13} />} label="Conversation" value={backendLabel} />
            <DetailCell icon={<Bot size={13} />} label="Cloud concierge model" value={currentModelLabel} />
            <DetailCell icon={<Laptop size={13} />} label="Executor" value={executorTooltip} />
            <DetailCell icon={<KeyRound size={13} />} label="Connected keys" value={connectedKeyLabel} />
          </div>

          <div className="mt-4">
            <div className="font-mono-dm text-[10px] uppercase tracking-[0.14em] text-white/45">
              Conversation backend
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {BACKEND_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="reveal-chip"
                  onClick={() => dispatch({ type: 'SET_CONVERSATION_BACKEND', payload: option.id })}
                  style={state.conversationBackend === option.id ? SELECTED_CHIP_STYLE : { cursor: 'pointer' }}
                >
                  {option.id === 'claw' ? <Laptop size={11} /> : <Cloud size={11} />}
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-5 text-white/55">
              {BACKEND_OPTIONS.find((option) => option.id === state.conversationBackend)?.summary}
              {effective.clawOffline ? ' Currently offline — turns are answered in the cloud.' : ''}
            </p>
            {state.conversationBackend === 'claw' && (
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="font-mono-dm text-[10px] uppercase tracking-[0.14em] text-white/45">Local model</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {LOCAL_CONVERSATION_MODELS.map((model) => (
                      <button
                        key={model.id}
                        type="button"
                        className="reveal-chip"
                        onClick={() => dispatch({ type: 'SET_CONCIERGE_LOCAL_MODEL', payload: model.id })}
                        style={state.conciergeLocalModel === model.id ? SELECTED_CHIP_STYLE : { cursor: 'pointer' }}
                      >
                        {model.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="font-mono-dm text-[10px] uppercase tracking-[0.14em] text-white/45">Local adapter</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {localAdapterOptions.map((adapter) => (
                      <button
                        key={adapter}
                        type="button"
                        className="reveal-chip"
                        title={advertisedAdapters.includes(adapter) ? `${adapter} is advertised by the online executor` : `${adapter} is not advertised by an online executor`}
                        onClick={() => dispatch({ type: 'SET_CONCIERGE_ADAPTER', payload: adapter })}
                        style={state.conciergeAdapter === adapter ? SELECTED_CHIP_STYLE : { cursor: 'pointer' }}
                      >
                        {compactAdapterName(adapter)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {(detailStatus || description || repoName) && (
            <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.03] p-3">
              <div className="font-mono-dm text-[10px] uppercase tracking-[0.14em] text-white/45">
                Current surface
              </div>
              <div className="mt-2 text-sm text-white/80">
                {label}
                {detailStatus ? ` · ${detailStatus}` : ''}
              </div>
              {repoName && (
                <div className="mt-1 text-xs text-white/55">
                  Repo: {repoName}
                </div>
              )}
              {description && (
                <p className="mt-2 text-sm leading-6 text-white/65">
                  {description}
                </p>
              )}
            </div>
          )}

          <div className="mt-4">
            <div className="font-mono-dm text-[10px] uppercase tracking-[0.14em] text-white/45">
              Execution mode
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {MODE_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="reveal-chip"
                  onClick={() => dispatch({ type: 'SET_EXECUTION_MODE', payload: option.id })}
                  style={state.executionMode === option.id ? SELECTED_CHIP_STYLE : { cursor: 'pointer' }}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-5 text-white/55">
              {MODE_OPTIONS.find((option) => option.id === state.executionMode)?.summary}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailCell({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
      <div className="flex items-center gap-2 text-white/45">
        {icon}
        <span className="font-mono-dm text-[10px] uppercase tracking-[0.14em]">
          {label}
        </span>
      </div>
      <div className="mt-2 text-sm text-white/80">
        {value}
      </div>
    </div>
  );
}
