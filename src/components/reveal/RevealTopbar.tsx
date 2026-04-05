import { useMaestro } from '../../context/MaestroContext';
import { useAuth } from '../../context/AuthContext';
import { LogOut } from 'lucide-react';
import SessionSwitcher from './SessionSwitcher';

export default function RevealTopbar() {
  const { state, dispatch } = useMaestro();
  const { signOut } = useAuth();

  const activeAgentCount = state.agents.filter(a => a.is_active).length;
  const currentRound = state.rounds.length;

  return (
    <header
      className="absolute top-0 left-0 right-0 z-30 flex items-center justify-between"
      style={{ padding: '20px 28px' }}
    >
      <div className="flex items-center gap-3">
        <BrandMark />
        <span
          className="font-mono-dm"
          style={{
            fontSize: '11px',
            letterSpacing: '0.22em',
            textTransform: 'uppercase' as const,
            color: 'var(--text-dim)',
          }}
        >
          Maestro
        </span>
      </div>

      <div className="flex items-center gap-3">
        <SessionSwitcher />
        <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.08)' }} className="hidden sm:block" />
        <span className="font-mono-dm hidden sm:block" style={{ fontSize: '11px', letterSpacing: '0.14em', color: 'var(--text-dim)', textTransform: 'uppercase' as const }}>
          {currentRound > 0 ? `R${String(currentRound).padStart(2, '0')}` : ''}
        </span>
        <span className="font-mono-dm hidden sm:block" style={{ fontSize: '11px', letterSpacing: '0.14em', color: 'var(--text-dim)', textTransform: 'uppercase' as const }}>
          {activeAgentCount} active
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button className="keycap" onClick={() => dispatch({ type: 'OPEN_DRAWER', payload: 'orchestra' })} title="Orchestra (Ctrl+O)">O</button>
        <button className="keycap" onClick={() => dispatch({ type: 'OPEN_DRAWER', payload: 'trust' })} title="Trust (Ctrl+J)">T</button>
        <button className="keycap" onClick={() => dispatch({ type: 'OPEN_DRAWER', payload: 'synthesis' })} title="Synthesis (Ctrl+E)">S</button>
        <button className="keycap" onClick={() => dispatch({ type: 'OPEN_DRAWER', payload: 'vault' })} title="Vault (Ctrl+K)">V</button>
        <button className="keycap" onClick={() => dispatch({ type: 'TOGGLE_SHORTCUTS' })} title="Shortcuts (Ctrl+/)">?</button>
        <button
          className="keycap"
          onClick={signOut}
          title="Sign out"
          style={{ marginLeft: '4px' }}
        >
          <LogOut size={12} />
        </button>
      </div>
    </header>
  );
}

function BrandMark() {
  return (
    <div
      style={{
        width: '24px',
        height: '24px',
        borderRadius: '50%',
        border: '1px solid rgba(255,255,255,0.08)',
        position: 'relative',
        boxShadow: 'inset 0 0 28px rgba(255,255,255,0.04), 0 0 18px rgba(201,168,90,0.08)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: '6px',
          borderRadius: '50%',
          border: '1px solid rgba(201,168,76,0.35)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: '10px',
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.18)',
        }}
      />
    </div>
  );
}
