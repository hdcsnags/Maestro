import { useState, useEffect, useRef, useMemo } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { useIterationLoop } from '../../hooks/useIterationLoop';
import { Search } from 'lucide-react';
import type { ComposerIntent, VerbosityTier } from '../../types';

interface CommandItem {
  id: string;
  label: string;
  group: string;
  action: () => void;
  icon?: string;
  shortcut?: string;
}

export default function CommandPalette() {
  const { state, dispatch } = useMaestro();
  const { sendControl } = useIterationLoop();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const open = state.commandPaletteOpen;

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const closePalette = () => {
    dispatch({ type: 'SET_COMMAND_PALETTE', payload: false });
  };

  const commands = useMemo(() => {
    const items: CommandItem[] = [];

    // Drawers
    items.push({ id: 'd-orch', label: 'Open Orchestra Drawer', group: 'Drawers', icon: 'O', action: () => dispatch({ type: 'OPEN_DRAWER', payload: 'orchestra' }) });
    items.push({ id: 'd-trust', label: 'Open Trust Rail', group: 'Drawers', icon: 'J', action: () => dispatch({ type: 'OPEN_DRAWER', payload: 'trust' }) });
    items.push({ id: 'd-synth', label: 'Open Synthesis Drawer', group: 'Drawers', icon: 'E', action: () => dispatch({ type: 'OPEN_DRAWER', payload: 'synthesis' }) });
    items.push({ id: 'd-vault', label: 'Open Provider Vault', group: 'Drawers', icon: 'K', action: () => dispatch({ type: 'OPEN_DRAWER', payload: 'vault' }) });
    items.push({ id: 'd-pre', label: 'Open Pre-build Panel', group: 'Drawers', icon: 'B', action: () => dispatch({ type: 'OPEN_DRAWER', payload: 'pre-build' }) });

    // Composer Intents
    const intents: { id: ComposerIntent; label: string }[] = [
      { id: 'chat', label: 'Chat' },
      { id: 'broadcast', label: 'Broadcast' },
      { id: 'execute', label: 'Execute' },
      { id: 'build', label: 'Build' },
      { id: 'iterate', label: 'Iterate' }
    ];
    intents.forEach(i => {
      items.push({
        id: `intent-${i.id}`,
        label: `Set Intent: ${i.label}`,
        group: 'Composer',
        action: () => dispatch({ type: 'SET_COMPOSER_INTENT', payload: i.id })
      });
    });

    // Verbosity
    const verbosities: { id: VerbosityTier; label: string }[] = [
      { id: 'brief', label: 'Brief' },
      { id: 'standard', label: 'Standard' },
      { id: 'detailed', label: 'Detailed' }
    ];
    verbosities.forEach(v => {
      items.push({
        id: `verb-${v.id}`,
        label: `Set Verbosity: ${v.label}`,
        group: 'Verbosity',
        action: () => dispatch({ type: 'SET_VERBOSITY_TIER', payload: v.id })
      });
    });

    // Sessions
    state.sessions.forEach(s => {
      if (s.id !== state.activeSession?.id) {
        items.push({
          id: `sess-${s.id}`,
          label: `Switch Session: ${s.title || 'Untitled'}`,
          group: 'Sessions',
          action: () => dispatch({ type: 'SET_ACTIVE_SESSION', payload: s })
        });
      }
    });

    // Agent Toggles (broadcastingAgents)
    state.agents.forEach(a => {
      const isBroadcasting = state.broadcastingAgents.includes(a.id);
      items.push({
        id: `agent-${a.id}`,
        label: `${isBroadcasting ? 'Disable' : 'Enable'} Agent: ${a.name}`,
        group: 'Agents',
        action: () => {
          const next = isBroadcasting
            ? state.broadcastingAgents.filter(id => id !== a.id)
            : [...state.broadcastingAgents, a.id];
          dispatch({ type: 'SET_BROADCASTING_AGENTS', payload: next });
        }
      });
    });

    // Iteration Loops
    state.iterationLoops.forEach(l => {
      const isActive = ['running', 'awaiting_approval', 'paused'].includes(l.status);
      if (isActive) {
        items.push({
          id: `loop-pause-${l.id}`,
          label: `${l.status === 'paused' ? 'Resume' : 'Pause'} Loop: ${l.goal}`,
          group: 'Iteration Loops',
          action: () => void sendControl(l.id, l.status === 'paused' ? 'resume' : 'pause')
        });
        items.push({
          id: `loop-stop-keep-${l.id}`,
          label: `Stop & Keep Changes: ${l.goal}`,
          group: 'Iteration Loops',
          action: () => void sendControl(l.id, 'abort', { rollback: false })
        });
        items.push({
          id: `loop-stop-roll-${l.id}`,
          label: `Stop & Rollback: ${l.goal}`,
          group: 'Iteration Loops',
          action: () => void sendControl(l.id, 'abort', { rollback: true })
        });
      }
    });

    return items;
  }, [state.agents, state.broadcastingAgents, state.sessions, state.activeSession, state.iterationLoops, dispatch, sendControl]);

  const filteredCommands = useMemo(() => {
    if (!query) return commands;
    const q = query.toLowerCase();
    return commands.filter(c => 
      c.label.toLowerCase().includes(q) || c.group.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(s => Math.min(s + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(s => Math.max(s - 1, 0));
      } else if (e.key === 'Enter' && filteredCommands.length > 0) {
        e.preventDefault();
        filteredCommands[selectedIndex].action();
        closePalette();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, filteredCommands, selectedIndex, closePalette]);

  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (selectedEl) {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={closePalette} />
      <div 
        className="relative w-full max-w-xl bg-[var(--surf-1)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: '60vh' }}
      >
        <div className="flex items-center gap-3 p-4 border-b border-[var(--border)] bg-[var(--surf-2)]">
          <Search size={18} className="text-[var(--text-muted)]" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent outline-none text-[var(--text)] font-sans placeholder:text-[var(--text-muted)]"
            placeholder="Type a command or search..."
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <div ref={listRef} className="overflow-y-auto flex-1 p-2">
          {filteredCommands.length === 0 ? (
            <div className="p-8 text-center text-[var(--text-muted)] text-sm">
              No results found.
            </div>
          ) : (
            filteredCommands.map((cmd, i) => (
              <div
                key={cmd.id}
                className={`flex flex-col px-4 py-3 rounded-lg cursor-pointer transition-colors ${
                  i === selectedIndex ? 'bg-[var(--surf-3)]' : 'hover:bg-[var(--surf-2)]'
                }`}
                onClick={() => {
                  cmd.action();
                  closePalette();
                }}
                onMouseMove={() => setSelectedIndex(i)}
              >
                <div className="text-xs font-mono tracking-widest uppercase text-[var(--text-muted)] mb-1 opacity-70">
                  {cmd.group}
                </div>
                <div className="text-[var(--text)] text-sm font-medium flex items-center justify-between">
                  {cmd.label}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}