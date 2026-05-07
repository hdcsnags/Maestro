import { useMemo } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { Eye, Wifi, WifiOff, Database } from 'lucide-react';
import type { OrbState } from '../../lib/orbState';
import { deriveOrbStatusText } from '../../lib/orbState';
import type { ComposerIntent } from '../../types';

interface EmptyStageProps {
  orbState: OrbState;
}

const ORB_CONFIG: Record<OrbState, { glowColor: string; animationDuration: string; animation: string }> = {
  idle: { glowColor: '#c9a84c', animationDuration: '3.2s', animation: 'maestro-orb-idle' },
  broadcasting: { glowColor: '#e0c25a', animationDuration: '1.3s', animation: 'maestro-orb-broadcast' },
  streaming: { glowColor: '#e0c25a', animationDuration: '1.1s', animation: 'maestro-orb-stream' },
  conflict: { glowColor: '#e05a5a', animationDuration: '0.8s', animation: 'maestro-orb-conflict' },
  building: { glowColor: '#5ab88e', animationDuration: '1.6s', animation: 'maestro-orb-building' },
  concierge: { glowColor: '#d4c9a8', animationDuration: '2.4s', animation: 'maestro-orb-concierge' },
  done: { glowColor: '#4ebb7f', animationDuration: '4s', animation: 'maestro-orb-done' },
};

// Agent provider colors, matching CSS vars --claude / --gpt / --gemini / --openrouter
const ORBIT_AGENTS = [
  { label: 'Claude', color: '#c97a5a' },
  { label: 'GPT', color: '#6ea88a' },
  { label: 'Gemini', color: '#6e8fc4' },
  { label: 'Council', color: '#8a8ae0' },
];

interface QuickChip {
  label: string;
  draft: string;
  intent: ComposerIntent;
}

const QUICK_CHIPS: QuickChip[] = [
  { label: 'Plan a project', draft: 'Help me plan a new project from the ground up. Let\'s start with goals and architecture.', intent: 'chat' },
  { label: 'Compare approaches', draft: 'Compare the tradeoffs between different architectural approaches for my use case.', intent: 'broadcast' },
  { label: 'Spec a feature', draft: 'Help me write a detailed spec for a new feature, including acceptance criteria.', intent: 'chat' },
  { label: 'Build this', draft: 'I\'m ready to build. Set up the build flow for this project.', intent: 'build' },
  { label: 'Security review', draft: 'Review my codebase and architecture for security vulnerabilities and risks.', intent: 'broadcast' },
];

function hexToRgb(hex: string): string {
  const normalized = hex.replace('#', '');
  const value = normalized.length === 3
    ? normalized.split('').map((c) => c + c).join('')
    : normalized;
  const int = Number.parseInt(value, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `${r},${g},${b}`;
}

export default function EmptyStage({ orbState }: EmptyStageProps) {
  const { state, dispatch } = useMaestro();
  const activeCount = state.agents.filter(a => a.is_active).length;
  const orbConfig = ORB_CONFIG[orbState];
  const glowRgb = useMemo(() => hexToRgb(orbConfig.glowColor), [orbConfig.glowColor]);
  const statusText = deriveOrbStatusText(state, orbState);
  const isIdle = orbState === 'idle';

  const latestRound = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1] : null;
  const responseCount = latestRound
    ? state.responses.filter(r => r.round_id === latestRound.id).length
    : 0;
  const hasResponses = responseCount > 0 && !state.carouselVisible;

  // Ready-row: derive from state, no API calls
  const connectedProviders = state.providerConnections.length;
  const onlineExecutors = useMemo(() => {
    const cutoff = Date.now() - 90_000;
    return state.executors.filter(e =>
      e.status !== 'offline' && e.last_seen_at && new Date(e.last_seen_at).getTime() > cutoff
    ).length;
  }, [state.executors]);
  const hasRepo = state.repoConnections.some(r => r.is_active);

  function handleChip(chip: QuickChip) {
    dispatch({ type: 'SET_COMPOSER_DRAFT', payload: chip.draft });
    dispatch({ type: 'SET_COMPOSER_INTENT', payload: chip.intent });
  }

  return (
    <div
      className="absolute flex items-center justify-center z-10"
      style={{ inset: '180px 0 140px', animation: 'empty-stage-enter 0.5s ease both' }}
    >
      <div className="text-center" style={{ pointerEvents: 'none' }}>
        {/* Orb container — holds orbital ring + orb */}
        <div className="mx-auto" style={{ position: 'relative', width: '180px', height: '180px' }}>

          {/* Orbital agent ring — idle state only */}
          {isIdle && (
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: -40,
                borderRadius: '50%',
                animation: 'orbit-rotate 60s linear infinite',
                pointerEvents: 'none',
              }}
            >
              {ORBIT_AGENTS.map((agent, i) => (
                <div
                  key={agent.label}
                  title={agent.label}
                  style={{
                    position: 'absolute',
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: agent.color,
                    boxShadow: `0 0 6px 2px ${agent.color}55`,
                    // Cardinal positions: top, right, bottom, left
                    ...(i === 0 && { top: -4, left: 'calc(50% - 4px)' }),
                    ...(i === 1 && { top: 'calc(50% - 4px)', right: -4 }),
                    ...(i === 2 && { bottom: -4, left: 'calc(50% - 4px)' }),
                    ...(i === 3 && { top: 'calc(50% - 4px)', left: -4 }),
                    animation: `orbit-dot-pulse 2.4s ease-in-out infinite`,
                    animationDelay: `${i * 0.6}s`,
                  }}
                />
              ))}
            </div>
          )}

          {/* Secondary halo for streaming cadence */}
          {orbState === 'streaming' && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: `1px solid rgba(${glowRgb}, 0.28)`,
                animation: 'maestro-orb-stream-secondary 1.8s ease-in-out infinite',
                animationDelay: '0.35s',
              }}
            />
          )}

          {/* Orb */}
          <div
            style={{
              width: '180px',
              height: '180px',
              borderRadius: '50%',
              background:
                'radial-gradient(circle at 35% 30%, rgba(255,224,150,0.95) 0%, rgba(201,168,76,0.85) 28%, rgba(140,108,40,0.55) 62%, rgba(60,42,12,0.15) 88%, transparent 100%)',
              boxShadow: `0 0 60px 10px rgba(${glowRgb}, 0.35), 0 0 140px 30px rgba(${glowRgb}, 0.18), inset 0 0 40px rgba(255,224,150,0.25)`,
              animation: `${orbConfig.animation} ${orbConfig.animationDuration} ease-in-out infinite`,
              transition: 'box-shadow 0.6s ease',
            }}
          />
        </div>

        {/* Status line */}
        <div
          className="font-mono-dm"
          style={{
            marginTop: '32px',
            color: 'var(--text-dim)',
            fontSize: '11px',
            letterSpacing: '0.24em',
            textTransform: 'uppercase' as const,
            opacity: 0.85,
          }}
        >
          {statusText || `${activeCount} ${activeCount === 1 ? 'voice' : 'voices'} standing by`}
        </div>

        {/* Responses ready indicator (carousel hidden but responses exist) */}
        {hasResponses && (
          <button
            onClick={() => dispatch({ type: 'SET_CAROUSEL_VISIBLE', payload: true })}
            className="font-mono-dm"
            style={{
              marginTop: '16px',
              color: 'var(--gold)',
              fontSize: '11px',
              letterSpacing: '0.12em',
              background: 'rgba(201,168,76,0.06)',
              border: '1px solid rgba(201,168,76,0.18)',
              borderRadius: '20px',
              padding: '6px 16px',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              pointerEvents: 'auto',
              transition: 'all 0.2s ease',
            }}
          >
            <Eye size={12} />
            {responseCount} {responseCount === 1 ? 'response' : 'responses'} ready — watch council →
          </button>
        )}

        {/* Greeting + chips + ready-row — idle state only */}
        {isIdle && (
          <div style={{ pointerEvents: 'auto', marginTop: 36 }}>
            <p style={{
              fontFamily: 'var(--serif)',
              fontSize: 13,
              color: 'var(--ink-2)',
              opacity: 0.7,
              marginBottom: 20,
              lineHeight: 1.5,
            }}>
              Welcome back. Ask the council, or describe what you want to build.
            </p>

            {/* Quick-start chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 24 }}>
              {QUICK_CHIPS.map(chip => (
                <button
                  key={chip.label}
                  onClick={() => handleChip(chip)}
                  style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 10,
                    letterSpacing: '0.08em',
                    color: 'var(--ink-2)',
                    background: 'var(--surf-0)',
                    border: '1px solid var(--edge-1)',
                    borderRadius: 20,
                    padding: '5px 12px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    opacity: 0.75,
                  }}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLButtonElement).style.opacity = '1';
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(201,168,76,0.35)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--gold)';
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLButtonElement).style.opacity = '0.75';
                    (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--edge-1)';
                    (e.currentTarget as HTMLButtonElement).style.color = 'var(--ink-2)';
                  }}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Ready-row */}
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 12,
              padding: '6px 16px',
              borderRadius: 8,
              border: '1px dashed var(--edge-1)',
              opacity: 0.55,
            }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--ink-2)' }}>
                {connectedProviders > 0
                  ? <Wifi size={9} color="var(--ok)" />
                  : <WifiOff size={9} color="var(--risk)" />}
                {connectedProviders > 0 ? `${connectedProviders} key${connectedProviders === 1 ? '' : 's'}` : 'No keys'}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--ink-2)' }}>
                {onlineExecutors > 0
                  ? <Wifi size={9} color="var(--ok)" />
                  : <WifiOff size={9} color="var(--ink-3)" />}
                {onlineExecutors > 0 ? `${onlineExecutors} claw${onlineExecutors === 1 ? '' : 's'} online` : 'No claw'}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--ink-2)' }}>
                <Database size={9} color={hasRepo ? 'var(--ok)' : 'var(--ink-3)'} />
                {hasRepo ? 'Repo connected' : 'No repo'}
              </span>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes empty-stage-enter {
          from { opacity: 0; transform: scale(0.97); }
          to { opacity: 1; transform: scale(1); }
        }

        @keyframes orbit-rotate {
          from { transform: rotate(0turn); }
          to { transform: rotate(1turn); }
        }

        @keyframes orbit-dot-pulse {
          0%, 100% { opacity: 0.45; }
          50% { opacity: 0.85; }
        }

        @media (prefers-reduced-motion: reduce) {
          .orbit-ring { animation-duration: 300s !important; }
        }

        @keyframes maestro-orb-idle {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.03); filter: brightness(1.08); }
        }

        @keyframes maestro-orb-broadcast {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.06); filter: brightness(1.18); }
        }

        @keyframes maestro-orb-stream {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.05); filter: brightness(1.16); }
        }

        @keyframes maestro-orb-stream-secondary {
          0%, 100% { transform: scale(1); opacity: 0.25; }
          50% { transform: scale(1.08); opacity: 0.6; }
        }

        @keyframes maestro-orb-conflict {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          20% { transform: scale(1.06); filter: brightness(1.18); }
          40% { transform: scale(0.99); filter: brightness(0.96); }
          60% { transform: scale(1.05); filter: brightness(1.14); }
          80% { transform: scale(1); filter: brightness(1); }
        }

        @keyframes maestro-orb-building {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.045); filter: brightness(1.12); }
        }

        @keyframes maestro-orb-concierge {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.025); filter: brightness(1.06); }
        }

        @keyframes maestro-orb-done {
          0% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.035); filter: brightness(1.08); }
          100% { transform: scale(1); filter: brightness(1); }
        }
      `}</style>
    </div>
  );
}
