import { useState } from 'react';
import { AlertTriangle, Copy, Check } from 'lucide-react';
import type { ThreadMessage } from '../../../types';

export default function ErrorRetryCard({ message }: { message: ThreadMessage }) {
  const [copied, setCopied] = useState(false);
  const event = message.metadata.system_event;
  const title = event?.title ?? 'Error';
  const body = event?.body;

  const handleCopy = async () => {
    const text = [title, body].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard access denied */ }
  };

  return (
    <div className="mx-1 my-0.5 rounded-xl border border-signal-risk/30 bg-signal-risk/8 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 font-mono-dm text-[10px] uppercase tracking-[0.14em] text-signal-risk/90">
          <AlertTriangle size={11} className="flex-shrink-0" />
          {title}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          title="Copy error details"
          className="flex-shrink-0 text-ink-3 transition-colors hover:text-ink-1"
        >
          {copied ? <Check size={12} className="text-signal-ok" /> : <Copy size={12} />}
        </button>
      </div>
      {body && (
        <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-2">
          {body}
        </div>
      )}
    </div>
  );
}
