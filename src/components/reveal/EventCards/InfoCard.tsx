import { useCallback } from 'react';
import { ArrowRight } from 'lucide-react';
import type { ThreadMessage } from '../../../types';
import { useMaestro } from '../../../context/MaestroContext';
import { useThreads } from '../../../hooks/useThreads';

const TONE_CLASSES: Record<string, string> = {
  build: 'border-signal-ok/20 bg-signal-ok/8 text-signal-ok/90',
  execute: 'border-gold/20 bg-gold/8 text-gold/90',
  approval: 'border-signal-ok/20 bg-signal-ok/8 text-ink-1',
  pr: 'border-agent-kimi/20 bg-agent-kimi/10 text-agent-kimi',
  error: 'border-signal-risk/20 bg-signal-risk/8 text-signal-risk/90',
  info: 'border-edge-1 bg-surf-1 text-ink-1',
};

export default function InfoCard({ message }: { message: ThreadMessage }) {
  const { state, dispatch } = useMaestro();
  const { loadThreads, loadThreadMessages } = useThreads();
  const event = message.metadata.system_event;
  const tone = event?.tone ?? 'info';
  const link = message.metadata.thread_link;

  // Open the linked thread in the chat column (same path as a sidebar click).
  const openLinkedThread = useCallback(async () => {
    if (!link) return;
    let thread = state.threads.find((t) => t.id === link.thread_id) ?? null;
    if (!thread && state.activeSession) {
      const threads = await loadThreads(state.activeSession.id);
      thread = threads.find((t) => t.id === link.thread_id) ?? null;
    }
    if (!thread) {
      dispatch({ type: 'SHOW_TOAST', payload: 'That thread is no longer available.' });
      return;
    }
    dispatch({ type: 'SET_ACTIVE_THREAD', payload: thread });
    dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: null });
    dispatch({ type: 'SET_CLAW_VIEW', payload: 'concierge' });
    await loadThreadMessages(thread.id);
  }, [link, state.threads, state.activeSession, loadThreads, loadThreadMessages, dispatch]);

  return (
    <div className={`mx-1 my-0.5 rounded-xl border px-4 py-3 ${TONE_CLASSES[tone] ?? TONE_CLASSES.info}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="font-mono-dm text-[10px] uppercase tracking-[0.14em] text-ink-2">
          {event?.title ?? 'System update'}
        </div>
        {link && (
          <button
            type="button"
            onClick={() => void openLinkedThread()}
            className="inline-flex flex-shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-ink-2 transition-colors hover:bg-white/[0.06] hover:text-ink-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-dim"
            title="Open the linked thread"
          >
            {link.label ?? 'open'}
            <ArrowRight size={11} />
          </button>
        )}
      </div>
      {event?.body && (
        <div className="mt-2 whitespace-pre-wrap text-sm leading-7">
          {event.body}
        </div>
      )}
      {event?.command && (
        <code className="mt-3 block overflow-x-auto rounded-lg bg-void-2 px-3 py-2 text-xs text-ink-1">
          {event.command}
        </code>
      )}
    </div>
  );
}
