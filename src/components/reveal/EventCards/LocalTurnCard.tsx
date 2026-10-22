import { useMemo, useState } from 'react';
import { AlertTriangle, Bot, Cloud, Laptop } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ThreadMessage } from '../../../types';
import { useMaestro } from '../../../context/MaestroContext';
import { useThreads } from '../../../hooks/useThreads';

// A concierge / discovery turn that ran (or is running) on the local MaestroClaw
// worker: streams while `metadata.streaming` is set, shows the failure with a
// "Retry in the cloud" action when `metadata.error` is set, and otherwise renders
// like a normal concierge bubble with a small "Claw · model" label.
export default function LocalTurnCard({ message, accentColor }: { message: ThreadMessage; accentColor: string }) {
  const { state } = useMaestro();
  const { sendToConcierge, discoveryFromChat } = useThreads();
  const [retrying, setRetrying] = useState(false);
  const remarkPlugins = useMemo(() => [remarkGfm], []);

  const meta = message.metadata;
  const streaming = meta.streaming === true;
  const error = typeof meta.error === 'string' ? meta.error : null;
  const retryText = typeof meta.retry_text === 'string' ? meta.retry_text : null;
  const adapter = typeof meta.adapter === 'string' ? meta.adapter : 'claude_code';
  const localModel = typeof meta.local_model === 'string' ? meta.local_model : '';
  const label = `Claw · ${adapter.replace(/_cli$/, '').replace('claude_code', 'claude')}${localModel ? ` · ${localModel}` : ''}`;

  const retryInCloud = async () => {
    if (!retryText || retrying || state.isConciergeSending) return;
    setRetrying(true);
    try {
      if (meta.retry_kind === 'discovery') {
        await discoveryFromChat(retryText, null, { backendOverride: 'cloud', skipUserMessage: true });
      } else {
        await sendToConcierge(message.thread_id, retryText, { backendOverride: 'cloud', skipUserMessage: true });
      }
    } finally {
      setRetrying(false);
    }
  };

  if (error) {
    return (
      <div className="mx-1 my-0.5 rounded-xl border border-signal-risk/30 bg-signal-risk/8 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 font-mono-dm text-[10px] uppercase tracking-[0.14em] text-signal-risk/90">
            <AlertTriangle size={11} className="flex-shrink-0" />
            Local turn failed · {label}
          </div>
          {retryText && (
            <button
              type="button"
              onClick={() => void retryInCloud()}
              disabled={retrying || state.isConciergeSending}
              className="reveal-chip"
              title={`Re-run this message through the cloud (${state.conciergeModel})`}
              style={{ cursor: retrying || state.isConciergeSending ? 'default' : 'pointer' }}
            >
              <Cloud size={11} />
              {retrying ? 'Retrying…' : 'Retry in the cloud'}
            </button>
          )}
        </div>
        <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-2">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
           style={{ backgroundColor: `${accentColor}15` }}>
        <Bot size={14} style={{ color: `${accentColor}90` }} />
      </div>
      <div className="flex-1 max-w-[80%]">
        <div className="flex items-center gap-2 text-[10px] text-white/60 mb-1">
          <Laptop size={10} />
          <span>{label}</span>
          {streaming && (
            <span className="animate-pulse" style={{ color: 'var(--gold)' }}>streaming…</span>
          )}
        </div>
        <div className="py-2.5 px-4 rounded-2xl rounded-bl-sm bg-white/[0.04] border border-white/[0.06]
                        text-sm text-white/80 leading-relaxed claw-prose">
          {message.content.trim().length > 0 ? (
            <ReactMarkdown remarkPlugins={remarkPlugins}>{message.content}</ReactMarkdown>
          ) : (
            <span className="text-white/40">{streaming ? 'Waiting for the local worker…' : 'No text returned.'}</span>
          )}
        </div>
      </div>
    </div>
  );
}
