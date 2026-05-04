import type { ThreadMessage } from '../../../types';

const TONE_CLASSES: Record<string, string> = {
  build: 'border-signal-ok/20 bg-signal-ok/8 text-signal-ok/90',
  execute: 'border-gold/20 bg-gold/8 text-gold/90',
  approval: 'border-signal-ok/20 bg-signal-ok/8 text-ink-1',
  pr: 'border-agent-kimi/20 bg-agent-kimi/10 text-agent-kimi',
  error: 'border-signal-risk/20 bg-signal-risk/8 text-signal-risk/90',
  info: 'border-edge-1 bg-surf-1 text-ink-1',
};

export default function InfoCard({ message }: { message: ThreadMessage }) {
  const event = message.metadata.system_event;
  const tone = event?.tone ?? 'info';

  return (
    <div className={`mx-1 my-0.5 rounded-xl border px-4 py-3 ${TONE_CLASSES[tone] ?? TONE_CLASSES.info}`}>
      <div className="font-mono-dm text-[10px] uppercase tracking-[0.14em] text-ink-2">
        {event?.title ?? 'System update'}
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
