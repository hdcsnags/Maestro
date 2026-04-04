import { useMaestro } from '../../context/MaestroContext';

export default function HeroContext() {
  const { state } = useMaestro();

  const currentRound = state.rounds.length;
  const latestRound = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1] : null;
  const activeAgentCount = state.agents.filter(a => a.is_active).length;

  const hasContent = latestRound !== null;

  return (
    <section
      className="absolute left-1/2 z-20 text-center pointer-events-none"
      style={{
        top: '78px',
        transform: 'translateX(-50%)',
        width: 'min(920px, calc(100vw - 80px))',
      }}
    >
      <div
        className="font-mono-dm"
        style={{
          color: 'rgba(201,168,76,0.88)',
          fontSize: '11px',
          letterSpacing: '0.24em',
          textTransform: 'uppercase' as const,
          marginBottom: '12px',
        }}
      >
        {hasContent ? `Round ${String(currentRound).padStart(2, '0')} -- ${activeAgentCount} voices` : 'Intentional by default'}
      </div>

      <h1
        className="font-syne"
        style={{
          margin: 0,
          fontSize: 'clamp(24px, 3.5vw, 48px)',
          fontWeight: 400,
          letterSpacing: '-0.04em',
          lineHeight: 1.0,
          color: 'var(--text)',
        }}
      >
        {hasContent ? latestRound.prompt : 'The council awaits your direction.'}
      </h1>

      {!hasContent && (
        <p
          style={{
            margin: '14px auto 0',
            maxWidth: '680px',
            fontSize: 'clamp(13px, 1.1vw, 17px)',
            color: 'var(--text-muted)',
            lineHeight: 1.6,
          }}
        >
          Broadcast a prompt to the orchestra. Each agent responds from its role.
          The strongest signals rise, contradictions surface, and synthesis follows.
        </p>
      )}
    </section>
  );
}
