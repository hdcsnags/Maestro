import { useState } from 'react';
import type { ThreadMessage } from '../../../types';
import { GitBranch, Loader2, ScanSearch } from 'lucide-react';
import PlanCardFrame from './PlanCardFrame';
import RepoSection from '../RepoSection';
import { usePreBuildPlan } from '../../../hooks/usePreBuildPlan';

export default function RepoCard({ message }: { message: ThreadMessage }) {
  const {
    activeRepoConnection,
    projectType,
    scanResult,
    scanRepository,
    openAdvancedView,
  } = usePreBuildPlan(message.thread_id);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');

  const handleScan = async () => {
    setScanning(true);
    setError('');
    try {
      await scanRepository();
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  return (
    <PlanCardFrame
      title="Repository"
      status={activeRepoConnection ? `${activeRepoConnection.owner}/${activeRepoConnection.repo}` : 'Connect GitHub'}
      description="Connect or create the repo this build should target. Existing apps can scan it in-thread once it is attached."
      onOpenAdvancedView={openAdvancedView}
    >
      <RepoSection />
      {projectType === 'existing' && (
        <div className="mt-4 rounded-xl border border-white/[0.08] bg-black/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm text-white/65">
              {scanResult
                ? 'Repository scan complete. Re-run it if the repo context changed.'
                : 'Scan the repo so Concierge can summarize stack, risks, and safe zones before architecting the build.'}
            </div>
            <button
              onClick={() => void handleScan()}
              disabled={!activeRepoConnection || scanning}
              className="reveal-pill"
              style={{ height: '34px', fontSize: '11px', padding: '0 14px', opacity: !activeRepoConnection || scanning ? 0.6 : 1 }}
            >
              {scanning ? <Loader2 size={12} className="animate-spin" /> : <ScanSearch size={12} />}
              {scanResult ? 'Re-scan repo' : 'Scan repo'}
            </button>
          </div>
          {scanResult && (
            <div className="mt-3 grid gap-2 text-xs text-white/60 md:grid-cols-3">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <div className="font-mono-dm text-[10px] uppercase tracking-[0.14em] text-white/35">Stack</div>
                <div className="mt-2">{scanResult.stack.join(', ') || 'No stack detected yet.'}</div>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <div className="font-mono-dm text-[10px] uppercase tracking-[0.14em] text-white/35">Risk files</div>
                <div className="mt-2">{scanResult.risk_files.slice(0, 3).join(', ') || 'No hotspots flagged.'}</div>
              </div>
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2">
                <div className="font-mono-dm text-[10px] uppercase tracking-[0.14em] text-white/35">Architecture notes</div>
                <div className="mt-2">{scanResult.architecture_notes || 'No notes yet.'}</div>
              </div>
            </div>
          )}
          {error && (
            <div className="mt-3 rounded-xl border border-signal-risk/20 bg-signal-risk/8 px-3 py-2 text-sm text-signal-risk/85">
              {error}
            </div>
          )}
        </div>
      )}
      {!activeRepoConnection && (
        <div className="mt-3 flex items-center gap-2 text-sm text-white/55">
          <GitBranch size={13} />
          Connect GitHub here, then keep moving through the rest of the plan cards.
        </div>
      )}
    </PlanCardFrame>
  );
}
