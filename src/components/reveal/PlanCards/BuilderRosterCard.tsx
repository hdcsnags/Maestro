import type { ThreadMessage, ProviderHealthState } from '../../../types';
import PlanCardFrame from './PlanCardFrame';
import { usePreBuildPlan } from '../../../hooks/usePreBuildPlan';
import { useMaestro } from '../../../context/MaestroContext';
import { modelToProviderKey } from '../../../lib/providerHealth';

const HEALTH_DOT: Record<ProviderHealthState, string> = {
  healthy:      'bg-signal-ok',
  degraded:     'bg-signal-warn',
  down:         'bg-signal-risk',
  rate_limited: 'bg-gold',
  unknown:      'bg-ink-3/40',
};

export default function BuilderRosterCard({ message }: { message: ThreadMessage }) {
  const { state } = useMaestro();
  const {
    rankedBuilderAgents,
    selectedBuilderIds,
    builderCount,
    lanesLocked,
    setBuilderCount,
    setBuilderAt,
    getBuilderAvailability,
    openAdvancedView,
  } = usePreBuildPlan(message.thread_id);

  return (
    <PlanCardFrame
      title="Builder roster"
      status={`${selectedBuilderIds.length} selected`}
      description="Lock which builders Concierge can assign to the plan. Cloud builders show API-key status; Claw builders show live executor availability."
      onOpenAdvancedView={openAdvancedView}
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {[1, 2, 3, 4, 5].map((count) => {
          const disabled = rankedBuilderAgents.length === 0 || count > rankedBuilderAgents.length;
          const active = builderCount === count;
          return (
            <button
              key={count}
              onClick={() => void setBuilderCount(count)}
              disabled={disabled || lanesLocked}
              className={`min-w-10 rounded-full border px-3 py-1.5 text-xs ${active
                ? 'border-gold/30 bg-gold/10 text-gold'
                : 'border-edge-1 bg-void-1 text-ink-2'} ${(disabled || lanesLocked) ? 'opacity-40' : ''}`}
            >
              {count}
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {selectedBuilderIds.map((agentId, index) => (
          <div key={`${index}-${agentId}`} className="rounded-xl border border-edge-1 bg-void-1 px-3 py-3">
            <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-ink-3">Builder {index + 1}</div>
            <select
              value={agentId}
              onChange={(event) => void setBuilderAt(index, event.target.value)}
              disabled={lanesLocked}
              className="w-full rounded-xl border border-edge-1 bg-surf-1 px-3 py-2 text-sm text-ink-1 outline-none"
            >
              {rankedBuilderAgents
                .filter((agent) => agent.id === agentId || !selectedBuilderIds.some((selectedId, selectedIndex) => selectedIndex !== index && selectedId === agent.id))
                .map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.display_name}
                  </option>
                ))}
            </select>
            {(() => {
              const agent = rankedBuilderAgents.find((candidate) => candidate.id === agentId);
              if (!agent) return null;
              const availability = getBuilderAvailability(agent);
              return (
                <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    {(() => {
                      const provKey = modelToProviderKey(agent.model ?? '');
                      const healthState = (state.providerHealth.find((h) => h.provider_id === provKey)?.state ?? 'unknown') as ProviderHealthState;
                      return <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${HEALTH_DOT[healthState]}`} title={healthState} />;
                    })()}
                    <span className="text-ink-3">{agent.provider_group === 'maestroclaw' ? agent.model : agent.provider}</span>
                  </div>
                  <span className={availability.tone === 'ok' ? 'text-signal-ok/85' : 'text-gold/85'}>
                    {availability.label}
                  </span>
                </div>
              );
            })()}
          </div>
        ))}
        {rankedBuilderAgents.length === 0 && (
          <div className="rounded-xl border border-signal-risk/20 bg-signal-risk/8 px-3 py-3 text-sm text-signal-risk/85">
            No build-capable agents are ready yet. Connect a provider key or bring a MaestroClaw executor online.
          </div>
        )}
      </div>
    </PlanCardFrame>
  );
}
