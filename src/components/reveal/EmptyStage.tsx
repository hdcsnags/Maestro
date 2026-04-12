import { useMemo } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { Eye } from 'lucide-react';
import type { OrbState } from '../../lib/orbState';

/**
 * Empty stage — the Maestro orb. Shown as the resting state OR when
 * the carousel toggle is off (even if responses exist).
 *
 * Orb state is derived upstream from Maestro state and rendered here.
 */
interface EmptyStageProps {
  orbState: OrbState;
}

const ORB_STATUS: Record<OrbState, string> = {
  idle: 'Council standing by',
  broadcasting: 'Dispatching to council',
  streaming: 'Voices arriving',
  conflict: 'Tension detected',
  building: 'Writing to repository',
  concierge: 'Concierge engaged',
  done: 'Round complete',
};

const ORB_CONFIG: Record<OrbState, { glowColor: string; animationDuration: string; animation: string }> = {
  idle: { glowColor: '#c9a84c', animationDuration: '3.2s', animation: 'maestro-orb-idle' },
  broadcasting: { glowColor: '#e0c25a', animationDuration: '1.3s', animation: 'maestro-orb-broadcast' },
  streaming: { glowColor: '#e0c25a', animationDuration: '1.1s', animation: 'maestro-orb-stream' },
  conflict: { glowColor: '#e05a5a', animationDuration: '0.8s', animation: 'maestro-orb-conflict' },
  building: { glowColor: '#5ab88e', animationDuration: '1.6s', animation: 'maestro-orb-building' },
  concierge: { glowColor: '#d4c9a8', animationDuration: '2.4s', animation: 'maestro-orb-concierge' },
  done: { glowColor: '#4ebb7f', animationDuration: '4s', animation: 'maestro-orb-done' },
};

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
  const statusText = ORB_STATUS[orbState];

  const latestRound = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1] : null;
  const responseCount = latestRound
    ? state.responses.filter(r => r.round_id === latestRound.id).length
    : 0;
  const hasResponses = responseCount > 0 && !state.carouselVisible;

  return (
    <div
      className="absolute flex items-center justify-center z-10"
      style={{ inset: '180px 0 140px' }}
    >
      <div className="text-center" style={{ pointerEvents: 'none' }}>
        {/* Orb container — holds ring + orb */}
        <div className="mx-auto" style={{ position: 'relative', width: '180px', height: '180px' }}>
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
      </div>

      <style>{`
        @keyframes maestro-orb-idle {
          0%, 100% {
            transform: scale(1);
            filter: brightness(1);
          }
          50% {
            transform: scale(1.03);
            filter: brightness(1.08);
          }
        }

        @keyframes maestro-orb-broadcast {
          0%, 100% {
            transform: scale(1);
            filter: brightness(1);
          }
          50% {
            transform: scale(1.06);
            filter: brightness(1.18);
          }
        }

        @keyframes maestro-orb-stream {
          0%, 100% {
            transform: scale(1);
            filter: brightness(1);
          }
          50% {
            transform: scale(1.05);
            filter: brightness(1.16);
          }
        }

        @keyframes maestro-orb-stream-secondary {
          0%, 100% {
            transform: scale(1);
            opacity: 0.25;
          }
          50% {
            transform: scale(1.08);
            opacity: 0.6;
          }
        }

        @keyframes maestro-orb-conflict {
          0%, 100% {
            transform: scale(1);
            filter: brightness(1);
          }
          20% {
            transform: scale(1.06);
            filter: brightness(1.18);
          }
          40% {
            transform: scale(0.99);
            filter: brightness(0.96);
          }
          60% {
            transform: scale(1.05);
            filter: brightness(1.14);
          }
          80% {
            transform: scale(1);
            filter: brightness(1);
          }
        }

        @keyframes maestro-orb-building {
          0%, 100% {
            transform: scale(1);
            filter: brightness(1);
          }
          50% {
            transform: scale(1.045);
            filter: brightness(1.12);
          }
        }

        @keyframes maestro-orb-concierge {
          0%, 100% {
            transform: scale(1);
            filter: brightness(1);
          }
          50% {
            transform: scale(1.025);
            filter: brightness(1.06);
          }
        }

        @keyframes maestro-orb-done {
          0% {
            transform: scale(1);
            filter: brightness(1);
          }
          50% {
            transform: scale(1.035);
            filter: brightness(1.08);
          }
          100% {
            transform: scale(1);
            filter: brightness(1);
          }
        }
      `}</style>
    </div>
  );
}
