import { useMaestro } from '../../context/MaestroContext';

/**
 * Empty stage = the "home" state. Shown whenever the active session has
 * zero rounds. HeroContext already renders "The council awaits your
 * direction." above the stage, so this component intentionally avoids
 * repeating that line. It's just the Maestro orb — a slowly breathing
 * gold sphere — plus a quiet voice count underneath.
 *
 * The orb is pure CSS: a radial gradient core with two layered box-shadows
 * for the glow halo, and a keyframe animation that gently scales and
 * brightens. No images, no canvas, no JS animation loop.
 */
export default function EmptyStage() {
  const { state } = useMaestro();
  const activeCount = state.agents.filter(a => a.is_active).length;

  return (
    <div
      className="absolute flex items-center justify-center z-10"
      style={{ inset: '180px 0 140px' }}
    >
      <div className="text-center" style={{ pointerEvents: 'none' }}>
        <div
          className="mx-auto"
          style={{
            width: '180px',
            height: '180px',
            borderRadius: '50%',
            background:
              'radial-gradient(circle at 35% 30%, rgba(255,224,150,0.95) 0%, rgba(201,168,76,0.85) 28%, rgba(140,108,40,0.55) 62%, rgba(60,42,12,0.15) 88%, transparent 100%)',
            boxShadow:
              '0 0 60px 10px rgba(201,168,76,0.35), 0 0 140px 30px rgba(201,168,76,0.18), inset 0 0 40px rgba(255,224,150,0.25)',
            animation: 'maestro-orb-breathe 6s ease-in-out infinite',
          }}
        />
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
          {activeCount} {activeCount === 1 ? 'voice' : 'voices'} standing by
        </div>
      </div>

      <style>{`
        @keyframes maestro-orb-breathe {
          0%, 100% {
            transform: scale(1);
            filter: brightness(1);
          }
          50% {
            transform: scale(1.04);
            filter: brightness(1.12);
          }
        }
      `}</style>
    </div>
  );
}
