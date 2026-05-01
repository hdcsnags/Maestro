import { ExternalLink, GitBranch } from 'lucide-react';
import type { ThreadMessage } from '../../../types';

export default function PrOpenedCard({ message }: { message: ThreadMessage }) {
  const event = message.metadata.system_event;
  const prUrls = event?.pr_urls ?? [];
  const writtenFiles = event?.written_files ?? [];
  const skippedFiles = event?.skipped_files ?? [];

  return (
    <div className="mx-1 my-0.5 rounded-xl border border-purple-400/20 bg-purple-500/8 px-4 py-3 text-white/80">
      <div className="flex items-center gap-2 font-mono-dm text-[10px] uppercase tracking-[0.14em] text-white/40">
        <GitBranch size={12} className="text-purple-200" />
        {event?.title ?? 'Pull request ready'}
      </div>
      {event?.body && (
        <div className="mt-2 whitespace-pre-wrap text-sm leading-7 text-white/70">
          {event.body}
        </div>
      )}
      {event?.backup_branch && (
        <div className="mt-3 text-xs text-white/55">
          Backup branch: <code className="font-mono text-white/75">{event.backup_branch}</code>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/55">
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
              className="flex items-center gap-2 text-sm text-purple-100 hover:text-white"
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
