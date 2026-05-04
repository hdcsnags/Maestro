import { useMemo, useRef, useState, useEffect } from 'react';
import { AlertTriangle, Bot, ChevronDown, KeyRound, Laptop, Zap } from 'lucide-react';
import { useMaestro } from '../../context/MaestroContext';
import { CONCIERGE_MODELS, type ExecutionMode } from '../../types';
import { useUnackIncidents } from '../../hooks/useUnackIncidents';

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

function isExecutorFresh(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  return Date.now() - new Date(lastSeenAt).getTime() < 60_000;
}

function getExecutionModeLabel(mode: ExecutionMode): string {
  return MODE_OPTIONS.find((option) => option.id === mode)?.label ?? mode;
}

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
  const executorLabel = useMemo(() => {
    const activeExecutor = onlineExecutors[0];
    if (!activeExecutor) return 'Local executor offline';

    const adapters = Array.isArray(activeExecutor.capabilities?.adapters)
      ? activeExecutor.capabilities.adapters.filter((value): value is string => typeof value === 'string')
      : [];
    const preferredAdapter = adapters[0] ?? null;
    const matchingAgent = preferredAdapter
      ? state.agents.find((agent) => agent.provider_group === 'maestroclaw' && agent.model === preferredAdapter)
      : null;

    const baseLabel = matchingAgent?.display_name || matchingAgent?.name || activeExecutor.name;
    return `${baseLabel} online`;
  }, [onlineExecutors, state.agents]);

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
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-left ${CHIP_TONE[kind]}`}
        >
          <Bot size={12} className={pulse ? 'animate-pulse' : undefined} />
          <span className="max-w-[min(48vw,34rem)] truncate text-[11px] font-medium tracking-wide">
            {`${label}: ${currentModelLabel} · ${executorLabel} · ${connectedKeyLabel}`}
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
            <DetailCell icon={<Bot size={13} />} label="Concierge model" value={currentModelLabel} />
            <DetailCell icon={<Laptop size={13} />} label="Executor" value={executorLabel} />
            <DetailCell icon={<KeyRound size={13} />} label="Connected keys" value={connectedKeyLabel} />
            <DetailCell icon={<Zap size={13} />} label="Current mode" value={getExecutionModeLabel(state.executionMode)} />
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
                  style={state.executionMode === option.id
                    ? { color: 'var(--text)', borderColor: 'rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)', cursor: 'pointer' }
                    : { cursor: 'pointer' }}
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
