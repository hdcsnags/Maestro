import { useMaestro } from '../../context/MaestroContext';

export default function EmptyStage() {
  const { state } = useMaestro();
  const activeCount = state.agents.filter(a => a.is_active).length;

  return (
    <div
      className="absolute flex items-center justify-center z-10"
      style={{ inset: '180px 0 140px' }}
    >
      <div className="text-center" style={{ maxWidth: '480px' }}>
        <div
          className="mx-auto mb-5"
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '16px',
            border: '1px solid rgba(201,168,76,0.25)',
            background: 'var(--gold-dim)',
            display: 'grid',
            placeItems: 'center',
          }}
        >
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '4px',
              background: 'var(--gold)',
              boxShadow: '0 0 16px rgba(201,168,76,0.3)',
            }}
          />
        </div>
        <h2
          className="font-syne mb-3"
          style={{
            fontSize: '28px',
            fontWeight: 400,
            letterSpacing: '-0.04em',
            color: 'var(--text)',
            margin: '0 0 12px',
          }}
        >
          The council awaits
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '15px', lineHeight: 1.6, margin: 0 }}>
          {activeCount} agents standing by. Use the composer below to broadcast
          your first prompt, or press <strong style={{ color: 'var(--text-dim)' }}>O</strong> to
          configure the orchestra.
        </p>
      </div>
    </div>
  );
}
