import { useMaestro } from '../../context/MaestroContext';
import { useAuth } from '../../context/AuthContext';
import SessionSwitcher from './SessionSwitcher';
import { Orb } from './Orb';
import StatusChip from './StatusChip';

export default function RevealTopbar() {
  const { state, dispatch } = useMaestro();
  const { signOut } = useAuth();
  const activeDrawer = state.activeDrawer;
  const activeRepo = state.activeRepoConnection ?? state.repoConnections.find(connection => connection.is_active) ?? null;
  const repoName = activeRepo?.repo ?? null;
  const isExecutionSurface = state.activeThread?.type === 'execution' || !!state.pendingExecution;
  const isBuildSurface = !!state.clawBuildSession || state.activeSession?.current_phase === 'build' || state.activeSession?.current_phase === 'bouncer';
  const statusKind = isExecutionSurface ? 'execute' : isBuildSurface ? 'build' : 'default';
  const statusLabel = isExecutionSurface
    ? 'Execution'
    : isBuildSurface
      ? 'Build'
      : state.activeThread?.type === 'broadcast'
        ? 'Council'
        : 'Concierge';
  const detailStatus = state.pendingExecution
    ? 'Awaiting approval'
    : state.isBroadcasting
      ? 'Broadcasting'
      : state.isConciergeSending
        ? 'Thinking'
        : state.activeSession?.current_phase ?? null;
  const statusDescription = isExecutionSurface
    ? 'Command parsing, approvals, and run updates stay in the active execution thread.'
    : isBuildSurface
      ? 'Claw build state is active; progress and review events should stay visible in-thread.'
      : 'Concierge is the coordination surface for chat, council broadcasts, execution, and build routing.';
  const statusPulse = state.isBroadcasting || state.isConciergeSending || !!state.pendingExecution;

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

      <StatusChip
        kind={statusKind}
        label={statusLabel}
        description={statusDescription}
        detailStatus={detailStatus}
        pulse={statusPulse}
        repoName={repoName}
      />

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
