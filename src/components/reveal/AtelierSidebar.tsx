import React from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { useThreads } from '../../hooks/useThreads';
import { useWorkspace } from '../../hooks/useWorkspace';
import { Thread } from '../../types';
import { Plus, Radio, Zap, MessageSquare, Mic } from 'lucide-react';

interface Props {
  open: boolean;
  onThreadClick: (thread: Thread) => void;
}

export function AtelierSidebar({ open, onThreadClick }: Props) {
  const { state, dispatch } = useMaestro();
  const { createThread } = useThreads();

  const handleNewThread = async () => {
    if (!state.activeSession) {
      dispatch({ type: 'SHOW_TOAST', payload: 'Create a new session from the topbar first' });
      return;
    }
    // Default to a new concierge thread
    const thread = await createThread(state.activeSession.id, 'concierge', { title: 'New chat' });
    if (thread) {
      onThreadClick(thread);
    }
  };

  const groupThreads = (type: Thread['type']) => {
    return state.threads.filter(t => t.type === type).sort(
      (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
    );
  };

  const groups = [
    { label: 'Concierge', type: 'concierge', items: groupThreads('concierge'), icon: <Mic size={11} /> },
    { label: 'Broadcasts', type: 'broadcast', items: groupThreads('broadcast'), icon: <Radio size={11} /> },
    { label: 'Direct', type: 'direct', items: groupThreads('direct'), icon: <MessageSquare size={11} /> },
    { label: 'Execution', type: 'execution', items: groupThreads('execution'), icon: <Zap size={11} /> },
  ] as const;

  return (
    <aside style={{
      borderRight: '1px solid var(--edge-1)',
      padding: open ? '14px 8px' : '14px 0',
      overflowX: 'hidden',
      overflowY: 'auto',
      position: 'relative',
      zIndex: 4,
      background: 'rgba(8,9,11,0.4)',
      width: open ? 240 : 0,
      transition: 'width 280ms var(--spring), padding 280ms var(--spring)',
      flexShrink: 0,
    }} className="custom-scrollbar">
      <div style={{ width: 224, opacity: open ? 1 : 0, transition: 'opacity 200ms', pointerEvents: open ? 'auto' : 'none' }}>
        
        {/* New thread button */}
        <button 
          onClick={handleNewThread}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 8,
            padding: '8px 10px', marginBottom: 16,
            borderRadius: 8, border: '1px dashed var(--edge-2)',
            color: 'var(--ink-2)', fontSize: 12,
            background: 'transparent', cursor: 'pointer',
            transition: 'all 0.2s ease', outline: 'none'
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLElement).style.background = 'var(--surf-1)';
            (e.currentTarget as HTMLElement).style.color = 'var(--ink-1)';
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--edge-3)';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLElement).style.background = 'transparent';
            (e.currentTarget as HTMLElement).style.color = 'var(--ink-2)';
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--edge-2)';
          }}
        >
          <Plus size={14} />
          New thread
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.1em' }}>
            {navigator.platform.includes('Mac') ? '⌘N' : 'Ctrl+N'}
          </span>
        </button>

        {groups.map(group => {
          if (group.items.length === 0 && group.type !== 'concierge') return null;
          
          return (
            <div key={group.label} style={{ marginBottom: 18 }}>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 9,
                color: 'var(--ink-3)', letterSpacing: '0.18em', textTransform: 'uppercase',
                padding: '4px 10px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <span className="flex items-center gap-1.5">{group.icon} {group.label}</span>
                <span>{group.items.length.toString().padStart(2, '0')}</span>
              </div>
              
              {group.items.length === 0 ? (
                <div style={{
                  padding: '4px 12px', fontSize: 11, color: 'var(--ink-4)',
                  fontStyle: 'italic',
                }}>—</div>
              ) : group.items.map(t => {
                const isActive = state.activeThread?.id === t.id;
                const agent = t.agent_id ? state.agents.find(a => a.id === t.agent_id) : null;
                const title = t.title || agent?.display_name || agent?.name || 'Untitled';
                
                // Format relative time (e.g. 2m, 1h)
                const diffMs = Date.now() - new Date(t.updated_at).getTime();
                const diffMins = Math.floor(diffMs / 60000);
                const diffHrs = Math.floor(diffMins / 60);
                const diffDays = Math.floor(diffHrs / 24);
                const timeStr = diffDays > 0 ? `${diffDays}d` : diffHrs > 0 ? `${diffHrs}h` : diffMins > 0 ? `${diffMins}m` : 'now';

                return (
                  <div 
                    key={t.id} 
                    onClick={() => onThreadClick(t)}
                    style={{
                      padding: '8px 10px',
                      borderRadius: 6,
                      fontSize: 12,
                      color: isActive ? 'var(--ink-0)' : 'var(--ink-2)',
                      background: isActive ? 'var(--ember-soft)' : 'transparent',
                      borderLeft: isActive ? '2px solid var(--ember)' : '2px solid transparent',
                      marginBottom: 2,
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 8,
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background = 'var(--surf-1)';
                        (e.currentTarget as HTMLElement).style.color = 'var(--ink-1)';
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLElement).style.background = 'transparent';
                        (e.currentTarget as HTMLElement).style.color = 'var(--ink-2)';
                      }
                    }}
                  >
                    {t.type === 'direct' && agent ? (
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        background: agent.color || 'var(--ink-3)',
                      }} />
                    ) : (
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                        background: isActive ? 'var(--ember)' : 'var(--ink-3)',
                        opacity: isActive ? 1 : 0.5
                      }} />
                    )}
                    
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {title}
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)' }}>
                      {timeStr}
                    </span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
