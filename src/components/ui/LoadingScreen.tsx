export default function LoadingScreen() {
  return (
    <div className="relative z-10 flex items-center justify-center h-screen">
      <div className="flex flex-col items-center gap-4">
        <div
          className="w-10 h-10 rounded-2xl"
          style={{
            background: 'linear-gradient(135deg, rgba(201,168,76,0.3), rgba(201,168,76,0.08))',
            border: '1px solid rgba(201,168,76,0.25)',
            animation: 'pulse-glow 1.8s ease-in-out infinite',
          }}
        />
        <p
          style={{
            fontFamily: 'DM Mono',
            fontSize: '10px',
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            color: 'var(--text-dim)',
          }}
        >
          Initializing workspace
        </p>
        <style>{`
          @keyframes pulse-glow {
            0%, 100% { opacity: 0.6; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.05); box-shadow: 0 0 30px rgba(201,168,76,0.2); }
          }
        `}</style>
      </div>
    </div>
  );
}
