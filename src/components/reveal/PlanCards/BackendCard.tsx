import type { ThreadMessage } from '../../../types';
import PlanCardFrame from './PlanCardFrame';
import { usePreBuildPlan } from '../../../hooks/usePreBuildPlan';

export default function BackendCard({ message }: { message: ThreadMessage }) {
  const {
    executionBackend,
    recommendedBackend,
    hasOnlineExecutor,
    selectedBuilderAgents,
    setExecutionBackend,
    openAdvancedView,
  } = usePreBuildPlan(message.thread_id);

  const selectedClawBuilder = selectedBuilderAgents.find((agent) => agent.provider_group === 'maestroclaw');

  return (
    <PlanCardFrame
      title="Execution backend"
      status={executionBackend}
      description="Concierge can route build work through edge tasks, local session builds, or auto/hybrid routing."
      onOpenAdvancedView={openAdvancedView}
    >
      {selectedClawBuilder && hasOnlineExecutor && (
        <div className="mb-4 rounded-xl border border-signal-ok/20 bg-signal-ok/8 px-3 py-3 text-sm text-white/75">
          I see you picked <span className="text-signal-ok/90">{selectedClawBuilder.display_name}</span> and the executor is online. Running locally is the fastest path here.
        </div>
      )}
      {selectedClawBuilder && !hasOnlineExecutor && (
        <div className="mb-4 rounded-xl border border-gold/20 bg-gold/8 px-3 py-3 text-sm text-white/75">
          A Claw builder is selected, but the executor is offline. Concierge will keep you on edge until it comes back.
        </div>
      )}
      <div className="grid gap-3 md:grid-cols-3">
        {([
          { key: 'local', label: 'Local', body: 'Run build_session jobs on MaestroClaw.' },
          { key: 'auto', label: 'Auto', body: 'Mix local and edge routing when possible.' },
          { key: 'edge', label: 'Edge', body: 'Keep the build on cloud task execution.' },
        ] as const).map((option) => {
          const active = executionBackend === option.key;
          const recommended = recommendedBackend === option.key;
          const disabled = option.key === 'local' && !hasOnlineExecutor;
          return (
            <button
              key={option.key}
              onClick={() => void setExecutionBackend(option.key)}
              disabled={disabled}
              className={`rounded-xl border px-3 py-3 text-left transition-colors ${active
                ? 'border-gold/30 bg-gold/10 text-white'
                : 'border-white/[0.08] bg-black/10 text-white/70 hover:border-white/[0.14]'} ${disabled ? 'opacity-40' : ''}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono-dm text-[11px] uppercase tracking-[0.14em]">{option.label}</span>
                {recommended && <span className="text-[10px] uppercase tracking-[0.12em] text-signal-ok/85">Recommended</span>}
              </div>
              <div className="mt-2 text-sm leading-6 text-white/60">{option.body}</div>
            </button>
          );
        })}
      </div>
    </PlanCardFrame>
  );
}
