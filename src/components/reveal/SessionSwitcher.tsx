import { useState, useRef, useEffect } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { useWorkspace } from '../../hooks/useWorkspace';
import { Session } from '../../types';
import { Plus, Check, Pencil, Trash2 } from 'lucide-react';

export default function SessionSwitcher() {
  const { state } = useMaestro();
  const { createSession, switchSession, renameSession, deleteSession } = useWorkspace();

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (editingId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingId]);

  const handleNew = async () => {
    if (!state.workspace) return;
    await createSession(state.workspace.id);
    setOpen(false);
  };

  const handleSwitch = async (session: Session) => {
    if (session.id === state.activeSession?.id) return;
    await switchSession(session);
    setOpen(false);
  };

  const handleStartRename = (session: Session) => {
    setEditingId(session.id);
    setEditValue(session.title);
  };

  const handleCommitRename = async () => {
    if (!editingId || !editValue.trim()) {
      setEditingId(null);
      return;
    }
    await renameSession(editingId, editValue.trim());
    setEditingId(null);
  };

  const activeSessions = state.sessions.filter(s => s.status === 'active');

  const handleDelete = async (session: Session) => {
    if (activeSessions.length <= 1) return;
    const ok = window.confirm(
      `Delete "${session.title}"?\n\nThis permanently removes all rounds, responses, and syntheses in this session. This cannot be undone.`
    );
    if (!ok) return;
    await deleteSession(session.id);
  };

  const currentMode = state.activeSession?.mode ?? 'ask';
  const displayTitle = state.activeSession?.title ?? 'No session';

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '4px 10px', borderRadius: 999,
          border: '1px solid var(--edge-1)', background: 'var(--surf-0)',
          fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-1)',
          cursor: 'pointer', transition: 'all 0.2s ease', outline: 'none'
        }}
      >
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ember)', boxShadow: '0 0 6px var(--ember-glow)' }} />
        <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {displayTitle}
        </span>
        <span style={{ color: 'var(--ink-3)' }}>·</span>
        <span style={{ color: 'var(--ember)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          {currentMode}
        </span>
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)',
            width: 280, maxHeight: 320, borderRadius: 20, padding: 8,
            background: 'var(--void-1)', border: '1px solid var(--edge-1)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)', zIndex: 100, overflowY: 'auto',
          }}
        >
          <button
            onClick={handleNew}
            className="flex items-center gap-2 w-full"
            style={{
              padding: '10px 12px', borderRadius: 14, border: 'none',
              background: 'var(--ember-soft)', color: 'var(--ember)',
              cursor: 'pointer', fontSize: 13, marginBottom: 4, transition: 'background 0.15s ease', outline: 'none'
            }}
          >
            <Plus size={14} />
            New session
          </button>

          {activeSessions.length === 0 && (
            <div style={{ padding: '12px', color: 'var(--ink-3)', fontSize: '12px', textAlign: 'center' }}>
              No sessions yet
            </div>
          )}

          {activeSessions.map(session => {
            const isActive = session.id === state.activeSession?.id;
            const isEditing = editingId === session.id;

            return (
              <div
                key={session.id}
                className="flex items-center gap-2"
                style={{
                  padding: '8px 12px', borderRadius: 14,
                  background: isActive ? 'var(--surf-1)' : 'transparent',
                  cursor: isEditing ? 'default' : 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onClick={() => !isEditing && handleSwitch(session)}
                onMouseEnter={e => {
                  if (!isEditing) (e.currentTarget as HTMLElement).style.background = 'var(--surf-1)';
                }}
                onMouseLeave={e => {
                  if (!isActive && !isEditing) (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                {isActive && !isEditing && (
                  <Check size={12} style={{ color: 'var(--ember)', flexShrink: 0 }} />
                )}

                {isEditing ? (
                  <input
                    ref={inputRef}
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCommitRename();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    onBlur={handleCommitRename}
                    style={{
                      flex: 1, height: 28, padding: '0 8px', borderRadius: 8,
                      border: '1px solid var(--ember-hairline)', background: 'var(--surf-0)',
                      color: 'var(--ink-0)', fontSize: 13, outline: 'none',
                    }}
                  />
                ) : (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13, fontWeight: isActive ? 500 : 400,
                          color: isActive ? 'var(--ink-0)' : 'var(--ink-2)',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}
                      >
                        {session.title}
                      </div>
                      <div className="font-mono-dm" style={{ fontSize: 9, color: 'var(--ink-3)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span>{new Date(session.created_at).toLocaleDateString()} — {session.mode ?? 'build'}</span>
                        {isActive && state.rounds.length > 0 && (
                          <span style={{ color: 'var(--ember-hairline)' }}>{state.rounds.length}R</span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleStartRename(session);
                      }}
                      style={{
                        background: 'none', border: 'none', color: 'var(--ink-3)',
                        cursor: 'pointer', padding: 4, borderRadius: 6,
                        display: 'flex', alignItems: 'center', flexShrink: 0,
                        transition: 'color 0.15s ease', outline: 'none'
                      }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--ink-1)')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--ink-3)')}
                    >
                      <Pencil size={11} />
                    </button>
                    {activeSessions.length > 1 && (
                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleDelete(session);
                        }}
                        title="Delete session"
                        style={{
                          background: 'none', border: 'none', color: 'var(--ink-3)',
                          cursor: 'pointer', padding: 4, borderRadius: 6,
                          display: 'flex', alignItems: 'center', flexShrink: 0,
                          transition: 'color 0.15s ease', outline: 'none'
                        }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--risk)')}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--ink-3)')}
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
