interface Props {
  agentName: string;
  agentRole: string;
  agentColor: string;
  agentProvider?: string;
  agentModel?: string;
}

export default function StreamingFolio({ agentName, agentRole, agentColor }: Props) {
  return (
    <div className="h-full flex flex-col items-center justify-center" style={{ position: 'relative', zIndex: 2 }}>
      <div
        className="flex-shrink-0"
        style={{
          width: '12px',
          height: '12px',
          borderRadius: '50%',
          background: agentColor,
          boxShadow: `0 0 24px ${agentColor}`,
          animation: 'pulse-dot 1.8s ease-in-out infinite',
          marginBottom: '20px',
        }}
      />
      <div
        className="font-mono-dm"
        style={{
          fontSize: '11px',
          letterSpacing: '0.18em',
          textTransform: 'uppercase' as const,
          color: agentColor,
          marginBottom: '6px',
        }}
      >
        {agentName}
      </div>
      <div
        className="font-mono-dm"
        style={{
          fontSize: '11px',
          letterSpacing: '0.14em',
          textTransform: 'uppercase' as const,
          color: 'var(--text-dim)',
          marginBottom: '24px',
        }}
      >
        {agentRole}
      </div>
      <div
        className="font-mono-dm"
        style={{
          fontSize: '11px',
          letterSpacing: '0.14em',
          color: 'var(--text-dim)',
          background: 'linear-gradient(90deg, var(--text-dim), var(--text-muted), var(--text-dim))',
          backgroundSize: '200% 100%',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          animation: 'shimmer 2s ease-in-out infinite',
        }}
      >
        Generating response...
      </div>
    </div>
  );
}
