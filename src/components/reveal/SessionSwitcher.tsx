import { useState, useRef, useEffect } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { useWorkspace } from '../../hooks/useWorkspace';
import { Session } from '../../types';
import { Plus, ChevronDown, Check, Pencil, Trash2 } from 'lucide-react';

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

  return (
    <div ref={panelRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2"
        style={{
          height: '32px',
          padding: '0 12px',
          borderRadius: '999px',
          border: '1px solid rgba(255,255,255,0.07)',
          background: open ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontSize: '12px',
          fontFamily: "'DM Mono', monospace",
          letterSpacing: '0.06em',
          transition: 'all 0.2s ease',
          whiteSpace: 'nowrap',
          maxWidth: '200px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {state.activeSession?.title ?? 'No session'}
        </span>
        <ChevronDown
          size={12}
          style={{
            flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
          }}
        />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            width: '280px',
            maxHeight: '320px',
            borderRadius: '20px',
            padding: '8px',
            background: 'linear-gradient(180deg, rgba(16,18,24,0.96), rgba(10,12,17,0.96))',
            backdropFilter: 'blur(34px) saturate(120%)',
            WebkitBackdropFilter: 'blur(34px) saturate(120%)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
            zIndex: 100,
            overflowY: 'auto',
            animation: 'fade-in 0.2s ease',
          }}
        >
          <button
            onClick={handleNew}
            className="flex items-center gap-2 w-full"
            style={{
              padding: '10px 12px',
              borderRadius: '14px',
              border: 'none',
              background: 'rgba(201,168,76,0.06)',
              color: 'var(--gold)',
              cursor: 'pointer',
              fontSize: '13px',
              marginBottom: '4px',
              transition: 'background 0.15s ease',
            }}
          >
            <Plus size={14} />
            New session
          </button>

          {activeSessions.length === 0 && (
            <div style={{ padding: '12px', color: 'var(--text-dim)', fontSize: '12px', textAlign: 'center' }}>
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
                  padding: '8px 12px',
                  borderRadius: '14px',
                  background: isActive ? 'rgba(255,255,255,0.04)' : 'transparent',
                  cursor: isEditing ? 'default' : 'pointer',
                  transition: 'background 0.15s ease',
                }}
                onClick={() => !isEditing && handleSwitch(session)}
                onMouseEnter={e => {
                  if (!isEditing) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                }}
                onMouseLeave={e => {
                  if (!isActive && !isEditing) (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                {isActive && !isEditing && (
                  <Check size={12} style={{ color: 'var(--gold)', flexShrink: 0 }} />
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
                      flex: 1,
                      height: '28px',
                      padding: '0 8px',
                      borderRadius: '8px',
                      border: '1px solid rgba(201,168,76,0.3)',
                      background: 'rgba(255,255,255,0.03)',
                      color: 'var(--text)',
                      fontSize: '13px',
                      outline: 'none',
                    }}
                  />
                ) : (
                  <>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: '13px',
                          fontWeight: isActive ? 500 : 400,
                          color: isActive ? 'var(--text)' : 'var(--text-muted)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {session.title}
                      </div>
                      <div className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--text-dim)', marginTop: '2px' }}>
                        {new Date(session.created_at).toLocaleDateString()} -- {session.execution_mode}
                      </div>
                    </div>
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        handleStartRename(session);
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-dim)',
                        cursor: 'pointer',
                        padding: '4px',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        flexShrink: 0,
                        transition: 'color 0.15s ease',
                      }}
                      onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = 'var(--text)')}
                      onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--text-dim)')}
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
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-dim)',
                          cursor: 'pointer',
                          padding: '4px',
                          borderRadius: '6px',
                          display: 'flex',
                          alignItems: 'center',
                          flexShrink: 0,
                          transition: 'color 0.15s ease',
                        }}
                        onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#e07b5a')}
                        onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'var(--text-dim)')}
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
