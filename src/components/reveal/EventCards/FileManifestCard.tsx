import type { ThreadMessage } from '../../../types';

export default function FileManifestCard({ message }: { message: ThreadMessage }) {
  const event = message.metadata.system_event;
  const writtenFiles = event?.written_files ?? [];
  const skippedFiles = event?.skipped_files ?? [];

  return (
    <div className="mx-1 my-0.5 rounded-xl border border-signal-ok/20 bg-signal-ok/8 px-4 py-3 text-ink-1">
      <div className="font-mono-dm text-[10px] uppercase tracking-[0.14em] text-ink-2">
        {event?.title ?? 'Build output ready'}
      </div>
      {event?.body && (
        <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-1">
          {event.body}
        </div>
      )}
      {(writtenFiles.length > 0 || skippedFiles.length > 0) && (
        <div className="mt-3 space-y-2 text-xs">
          {writtenFiles.slice(0, 8).map((path) => (
            <div key={path} className="font-mono text-signal-ok/90">{path}</div>
          ))}
          {skippedFiles.slice(0, 4).map((entry) => (
            <div key={`${entry.path}-${entry.reason}`} className="font-mono text-gold/80">
              {entry.path} — {entry.reason}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
