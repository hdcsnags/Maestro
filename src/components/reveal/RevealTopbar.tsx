import React from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { useAuth } from '../../context/AuthContext';
import { LogOut, Eye, EyeOff, Sparkles, Zap } from 'lucide-react';
import SessionSwitcher from './SessionSwitcher';
import { Orb } from './Orb';

export default function RevealTopbar() {
  const { state, dispatch } = useMaestro();
  const { signOut } = useAuth();
  
  const connectedKeys = state.apiKeys ? Object.values(state.apiKeys).filter(Boolean).length : 0;
  const activeLocalExecutors = state.executors?.filter(e => e.status === 'online').length ?? 0;
  const executorLabel = activeLocalExecutors > 0 ? `${activeLocalExecutors} online` : 'offline';
  const activeDrawer = state.activeDrawer;

  const cycleExecutionMode = () => {
    const modes = ['analyze', 'pr_flow', 'elevated'] as const;
    const currentIndex = modes.indexOf(state.executionMode as any);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    dispatch({ type: 'SET_EXECUTION_MODE', payload: nextMode });
  };

  const getExecutionModeLabel = (mode: string) => {
    if (mode === 'analyze') return 'Analyze';
    if (mode === 'pr_flow') return 'PR Flow';
    if (mode === 'elevated') return 'Elevated';
    return mode;
  };

  const getExecutionModeColor = (mode: string) => {
    if (mode === 'elevated') return 'var(--risk)';
    if (mode === 'analyze') return 'var(--ink-2)';
    return 'var(--ember)';
  };

  return (
    <header style={{
      position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30,
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 20px',
      borderBottom: '1px solid var(--edge-1)',
      background: 'rgba(8,9,11,0.72)',
      backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Orb size="sm" />
        <span style={{ fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 400, letterSpacing: '-0.01em', color: 'var(--ink-0)' }}>
          Maestro
        </span>
      </div>

      <div style={{ width: 1, height: 18, background: 'var(--edge-1)', margin: '0 4px' }} />

      <div className="flex items-center gap-3">
        <SessionSwitcher />
      </div>

      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '4px 4px 4px 12px', borderRadius: 999,
        border: '1px solid rgba(217,119,87,0.18)', background: 'rgba(217,119,87,0.08)',
        fontSize: 11, color: 'var(--ink-1)',
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ok)' }} />
        Concierge: <strong style={{ color: 'var(--ink-0)', fontWeight: 500, marginLeft: 2 }}>Haiku 4.5</strong>
        <span style={{ color: 'var(--ink-3)' }}>·</span>
        <span style={{ color: 'var(--ink-2)' }}>{connectedKeys} keys · local {executorLabel}</span>
        <button
          onClick={cycleExecutionMode}
          title="Cycle execution mode"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '2px 8px', borderRadius: 999,
            border: '1px solid var(--edge-1)', background: 'var(--surf-0)',
            cursor: 'pointer', color: getExecutionModeColor(state.executionMode),
            fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
            marginLeft: 4, transition: 'all 0.2s ease', outline: 'none'
          }}
        >
          <Zap size={9} />
          {getExecutionModeLabel(state.executionMode)}
        </button>
      </div>

      <div style={{ flex: 1 }} />

      {/* Drawer hotkey caps */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => dispatch({ type: 'OPEN_DRAWER', payload: activeDrawer === 'orchestra' ? null : 'orchestra' })}
          style={{
            width: 30, height: 28, borderRadius: 6, cursor: 'pointer',
            border: activeDrawer === 'orchestra' ? '1px solid var(--ember-hairline)' : '1px solid var(--edge-1)',
            background: activeDrawer === 'orchestra' ? 'var(--ember-soft)' : 'var(--surf-0)',
            color: activeDrawer === 'orchestra' ? 'var(--ember)' : 'var(--ink-2)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s ease'
          }}
          title="Roster (⌘O)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18V5l12-2v13"/></svg>
        </button>
        <button
          onClick={() => dispatch({ type: 'OPEN_DRAWER', payload: activeDrawer === 'trust' ? null : 'trust' })}
          style={{
            width: 30, height: 28, borderRadius: 6, cursor: 'pointer',
            border: activeDrawer === 'trust' ? '1px solid var(--ember-hairline)' : '1px solid var(--edge-1)',
            background: activeDrawer === 'trust' ? 'var(--ember-soft)' : 'var(--surf-0)',
            color: activeDrawer === 'trust' ? 'var(--ember)' : 'var(--ink-2)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s ease'
          }}
          title="Trust (⌘J)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </button>
        <button
          onClick={() => dispatch({ type: 'OPEN_DRAWER', payload: activeDrawer === 'vault' ? null : 'vault' })}
          style={{
            width: 30, height: 28, borderRadius: 6, cursor: 'pointer',
            border: activeDrawer === 'vault' ? '1px solid var(--ember-hairline)' : '1px solid var(--edge-1)',
            background: activeDrawer === 'vault' ? 'var(--ember-soft)' : 'var(--surf-0)',
            color: activeDrawer === 'vault' ? 'var(--ember)' : 'var(--ink-2)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s ease'
          }}
          title="Vault (⌘K)">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="16" r="1"/><path d="M5 11V7a7 7 0 0 1 14 0v4"/><rect x="3" y="11" width="18" height="11" rx="2"/></svg>
        </button>
        
        <div style={{ width: '1px', height: '14px', background: 'var(--edge-1)', margin: '0 2px' }} />
        
        <button
          onClick={() => dispatch({ type: 'SET_CAROUSEL_VISIBLE', payload: !state.carouselVisible })}
          title={state.carouselVisible ? 'Hide carousel' : 'Show carousel'}
          style={{
            width: 30, height: 28, borderRadius: 6, cursor: 'pointer',
            border: state.carouselVisible ? '1px solid var(--ember-hairline)' : '1px solid var(--edge-1)',
            background: state.carouselVisible ? 'var(--ember-soft)' : 'var(--surf-0)',
            color: state.carouselVisible ? 'var(--ember)' : 'var(--ink-2)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s ease'
          }}
        >
          {state.carouselVisible ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>

        <button
          onClick={() => dispatch({ type: 'SET_CONCIERGE_VISIBLE', payload: !state.conciergeVisible })}
          title="Concierge"
          style={{
            width: 30, height: 28, borderRadius: 6, cursor: 'pointer',
            border: state.conciergeVisible ? '1px solid var(--ember-hairline)' : '1px solid var(--edge-1)',
            background: state.conciergeVisible ? 'var(--ember-soft)' : 'var(--surf-0)',
            color: state.conciergeVisible ? 'var(--ember)' : 'var(--ink-2)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.2s ease'
          }}
        >
          <Sparkles size={12} />
        </button>

        <div style={{
          marginLeft: 8,
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '3px 4px 3px 12px', borderRadius: 999,
          border: '1px solid var(--edge-1)', background: 'var(--surf-0)',
          fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-2)',
          letterSpacing: '0.14em', textTransform: 'uppercase',
        }}>
          Conductor
          <span style={{
            width: 22, height: 22, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--ember-soft), var(--surf-2))',
            border: '1px solid var(--ember-hairline)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--serif)', fontSize: 11, color: 'var(--ember)',
            letterSpacing: 0, cursor: 'pointer'
          }} title="Sign out" onClick={signOut}>
            M
          </span>
        </div>
      </div>
    </header>
  );
}
