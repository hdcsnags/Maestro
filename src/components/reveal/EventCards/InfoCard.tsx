import type { ThreadMessage } from '../../../types';

const TONE_CLASSES: Record<string, string> = {
  build: 'border-signal-ok/20 bg-signal-ok/8 text-signal-ok/90',
  execute: 'border-gold/20 bg-gold/8 text-gold/90',
  approval: 'border-signal-ok/20 bg-signal-ok/8 text-white/80',
  pr: 'border-purple-400/20 bg-purple-500/8 text-purple-200',
  error: 'border-signal-risk/20 bg-signal-risk/8 text-signal-risk/90',
  info: 'border-white/[0.08] bg-white/[0.03] text-white/75',
};

export default function InfoCard({ message }: { message: ThreadMessage }) {
  const event = message.metadata.system_event;
  const tone = event?.tone ?? 'info';

  return (
    <div className={`mx-1 my-0.5 rounded-xl border px-4 py-3 ${TONE_CLASSES[tone] ?? TONE_CLASSES.info}`}>
      <div className="font-mono-dm text-[10px] uppercase tracking-[0.14em] text-white/40">
        {event?.title ?? 'System update'}
      </div>
      {event?.body && (
        <div className="mt-2 whitespace-pre-wrap text-sm leading-7">
          {event.body}
        </div>
      )}
      {event?.command && (
        <code className="mt-3 block overflow-x-auto rounded-lg bg-black/20 px-3 py-2 text-xs text-white/70">
          {event.command}
        </code>
      )}
    </div>
  );
}
