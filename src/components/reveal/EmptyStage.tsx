import { useMaestro } from '../../context/MaestroContext';
import { Eye } from 'lucide-react';

/**
 * Empty stage — the Maestro orb. Shown as the resting state OR when
 * the carousel toggle is off (even if responses exist).
 *
 * Four animation modes driven by context state:
 *   idle         — slow 3s pulse (default)
 *   broadcasting — faster 1.5s pulse, intensified glow
 *   synthesizing — breathing expand/contract + expanding ring
 *   concierge    — steady glow, no animation
 */

type OrbMode = 'idle' | 'broadcasting' | 'synthesizing' | 'concierge';

function getOrbMode(isBroadcasting: boolean, isSynthesizing: boolean, conciergeVisible: boolean): OrbMode {
  if (conciergeVisible) return 'concierge';
  if (isSynthesizing) return 'synthesizing';
  if (isBroadcasting) return 'broadcasting';
  return 'idle';
}

const ORB_ANIMATION: Record<OrbMode, string> = {
  idle: 'maestro-orb-idle 3s ease-in-out infinite',
  broadcasting: 'maestro-orb-broadcast 1.5s ease-in-out infinite',
  synthesizing: 'maestro-orb-synthesize 2.5s ease-in-out infinite',
  concierge: 'none',
};

const ORB_GLOW: Record<OrbMode, string> = {
  idle: '0 0 60px 10px rgba(201,168,76,0.35), 0 0 140px 30px rgba(201,168,76,0.18), inset 0 0 40px rgba(255,224,150,0.25)',
  broadcasting: '0 0 80px 16px rgba(201,168,76,0.50), 0 0 180px 40px rgba(201,168,76,0.28), inset 0 0 50px rgba(255,224,150,0.35)',
  synthesizing: '0 0 70px 14px rgba(201,168,76,0.42), 0 0 160px 35px rgba(201,168,76,0.22), inset 0 0 45px rgba(255,224,150,0.30)',
  concierge: '0 0 50px 8px rgba(201,168,76,0.30), 0 0 120px 25px rgba(201,168,76,0.15), inset 0 0 35px rgba(255,224,150,0.20)',
};

const STATUS_TEXT: Record<OrbMode, string> = {
  idle: '',
  broadcasting: 'Broadcasting…',
  synthesizing: 'Synthesizing…',
  concierge: 'Concierge ready',
};

export default function EmptyStage() {
  const { state, dispatch } = useMaestro();
  const activeCount = state.agents.filter(a => a.is_active).length;
  const mode = getOrbMode(state.isBroadcasting, state.isSynthesizing, state.conciergeVisible);

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
          {/* Expanding ring (synthesis only) */}
          {mode === 'synthesizing' && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: '1px solid rgba(201,168,76,0.35)',
                animation: 'maestro-orb-ring 3s ease-out infinite',
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
              boxShadow: ORB_GLOW[mode],
              animation: ORB_ANIMATION[mode],
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
          {STATUS_TEXT[mode] || `${activeCount} ${activeCount === 1 ? 'voice' : 'voices'} standing by`}
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

        @keyframes maestro-orb-synthesize {
          0%, 100% {
            transform: scale(1);
            filter: brightness(1);
          }
          50% {
            transform: scale(1.08);
            filter: brightness(1.14);
          }
        }

        @keyframes maestro-orb-ring {
          0% {
            transform: scale(1);
            opacity: 0.6;
          }
          100% {
            transform: scale(2.5);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
