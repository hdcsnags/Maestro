import { ExternalLink, GitBranch } from 'lucide-react';
import type { ThreadMessage } from '../../../types';

export default function PrOpenedCard({ message }: { message: ThreadMessage }) {
  const event = message.metadata.system_event;
  const prUrls = event?.pr_urls ?? [];
  const writtenFiles = event?.written_files ?? [];
  const skippedFiles = event?.skipped_files ?? [];

  return (
    <div className="mx-1 my-0.5 rounded-xl border border-gold/20 bg-gold/[0.06] px-4 py-3 text-ink-1">
      <div className="flex items-center gap-2 font-mono-dm text-[10px] uppercase tracking-[0.14em] text-ink-2">
        <GitBranch size={12} className="text-gold" />
        {event?.title ?? 'Pull request ready'}
      </div>
      {event?.body && (
        <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-ink-1">
          {event.body}
        </div>
      )}
      {event?.backup_branch && (
        <div className="mt-3 text-xs text-ink-2">
          Backup branch: <code className="font-mono text-ink-1">{event.backup_branch}</code>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink-2">
        <span>{writtenFiles.length} written</span>
        <span>{skippedFiles.length} skipped</span>
      </div>
      {prUrls.length > 0 && (
        <div className="mt-3 space-y-2">
          {prUrls.map((url, index) => (
            <a
              key={`${url}-${index}`}
              href={url}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-sm text-ink-1 hover:text-ink-0"
            >
              <ExternalLink size={13} />
              Open PR {prUrls.length > 1 ? index + 1 : ''}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
