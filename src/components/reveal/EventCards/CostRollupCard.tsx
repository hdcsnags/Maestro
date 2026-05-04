import type { ThreadMessage } from '../../../types';
import { formatUsd } from '../../../lib/cost';

interface RollupMeta {
  totalEstimate?: number;
  filesWritten?: number;
  filesFailed?: number;
  filesSkipped?: number;
}

export default function CostRollupCard({ message }: { message: ThreadMessage }) {
  const meta = (message.metadata.cost_rollup ?? {}) as RollupMeta;
  const { totalEstimate = 0, filesWritten = 0, filesFailed = 0, filesSkipped = 0 } = meta;
  const total = filesWritten + filesFailed + filesSkipped;

  return (
    <div className="mx-1 my-1 rounded-xl border border-gold/20 bg-gold/5 px-4 py-3">
      <div className="flex items-center justify-between gap-4 mb-2">
        <span className="text-xs font-semibold text-gold/80 uppercase tracking-wider">Build complete</span>
        <span className="text-sm font-mono text-gold/90">~{formatUsd(totalEstimate)}</span>
      </div>
      <div className="flex gap-4 text-[11px] text-white/50">
        <span>{filesWritten}/{total} files written</span>
        {filesFailed > 0 && <span className="text-signal-risk/70">{filesFailed} failed</span>}
        {filesSkipped > 0 && <span className="text-white/30">{filesSkipped} skipped</span>}
        <span className="text-white/25 ml-auto text-[10px] italic">cost is an estimate based on prompt length</span>
      </div>
    </div>
  );
}
