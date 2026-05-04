import { useMaestro } from '../../context/MaestroContext';
import type { ProviderHealthState } from '../../types';

const STATE_COLOR: Record<ProviderHealthState, string> = {
  healthy:      'bg-signal-ok',
  degraded:     'bg-signal-warn',
  down:         'bg-signal-risk',
  rate_limited: 'bg-gold',
  unknown:      'bg-ink-3/40',
};

const STATE_LABEL: Record<ProviderHealthState, string> = {
  healthy:      'Healthy',
  degraded:     'Degraded',
  down:         'Down',
  rate_limited: 'Rate limited',
  unknown:      'Unknown',
};

const PROVIDER_DISPLAY: Record<string, string> = {
  anthropic:  'Anthropic',
  openai:     'OpenAI',
  google:     'Google',
  openrouter: 'OpenRouter',
  moonshot:   'Moonshot',
  qwen:       'Qwen',
};

export default function HealthPanel() {
  const { state } = useMaestro();
  const { providerHealth, workspace } = state;

  if (!workspace) {
    return (
      <div className="flex flex-col gap-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-10 rounded-xl animate-pulse bg-void-2" />
        ))}
      </div>
    );
  }

  if (providerHealth.length === 0) {
    return (
      <div className="text-sm text-ink-3">
        No health data yet. Health is tracked automatically during builds.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {providerHealth.map((rec) => {
        const healthState = (rec.state ?? 'unknown') as ProviderHealthState;
        const dotClass = STATE_COLOR[healthState] ?? STATE_COLOR.unknown;
        const label = STATE_LABEL[healthState] ?? 'Unknown';
        const displayName = PROVIDER_DISPLAY[rec.provider_id] ?? rec.provider_id;

        return (
          <div
            key={rec.provider_id}
            className="flex items-center justify-between gap-3 rounded-xl border border-edge-1 bg-void-1 px-3 py-2.5"
          >
            <div className="flex items-center gap-2.5">
              <span className={`h-2 w-2 rounded-full shrink-0 ${dotClass}`} />
              <span className="text-sm text-ink-1">{displayName}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-ink-3">
              {rec.recent_failure_count > 0 && (
                <span className="text-signal-warn/80">{rec.recent_failure_count} fail{rec.recent_failure_count !== 1 ? 's' : ''}</span>
              )}
              <span>{label}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
