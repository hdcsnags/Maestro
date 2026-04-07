import { useEffect } from 'react';
import { useMaestro } from '../../context/MaestroContext';

export default function Toast() {
  const { state, dispatch } = useMaestro();
  const msg = state.toastMessage;

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => dispatch({ type: 'CLEAR_TOAST' }), 3000);
    return () => clearTimeout(t);
  }, [msg, dispatch]);

  if (!msg) return null;

  return (
    <div
      className="fixed z-[60] font-mono-dm"
      style={{
        bottom: '100px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '10px 20px',
        borderRadius: '14px',
        background: 'rgba(18,17,14,0.95)',
        border: '1px solid rgba(201,168,76,0.25)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        color: 'var(--gold)',
        fontSize: '12px',
        letterSpacing: '0.06em',
        whiteSpace: 'nowrap',
        animation: 'toast-in 0.25s ease-out',
      }}
    >
      {msg}
      <style>{`
        @keyframes toast-in {
          from { opacity: 0; transform: translateX(-50%) translateY(8px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
}
