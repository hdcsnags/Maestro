import { useState } from 'react';
import { AlertTriangle, Copy, Check, RotateCcw } from 'lucide-react';
import type { ThreadMessage } from '../../../types';
import { useMaestro } from '../../../context/MaestroContext';
import { useThreads } from '../../../hooks/useThreads';

export default function ErrorRetryCard({ message }: { message: ThreadMessage }) {
  const [copied, setCopied] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const { state } = useMaestro();
  const { sendToConcierge } = useThreads();
  const event = message.metadata.system_event;
  const title = event?.title ?? 'Error';
  const body = event?.body;

  const lastUserMessage = [...state.threadMessages]
    .filter(m => m.thread_id === message.thread_id && m.role === 'user')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .pop();

  const handleCopy = async () => {
    const text = [title, body].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard access denied */ }
  };

  const handleRetry = async () => {
    if (!lastUserMessage || retrying || state.isConciergeSending) return;
    setRetrying(true);
    try {
      await sendToConcierge(message.thread_id, lastUserMessage.content);
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="mx-1 my-0.5 rounded-xl border border-signal-risk/30 bg-signal-risk/8 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 font-mono-dm text-[10px] uppercase tracking-[0.14em] text-signal-risk/90">
          <AlertTriangle size={11} className="flex-shrink-0" />
          {title}
        </div>
        <div className="flex items-center gap-2">
          {lastUserMessage && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={retrying || state.isConciergeSending}
              title="Retry last message"
              className="flex-shrink-0 text-ink-3 transition-colors hover:text-signal-warn/80 disabled:opacity-40"
            >
              <RotateCcw size={12} className={retrying ? 'animate-spin' : ''} />
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            title="Copy error details"
            className="flex-shrink-0 text-ink-3 transition-colors hover:text-ink-1"
          >
            {copied ? <Check size={12} className="text-signal-ok" /> : <Copy size={12} />}
          </button>
        </div>
      </div>
      {body && (
        <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-2">
          {body}
        </div>
      )}
    </div>
  );
}
