import { useState } from 'react';
import type { ThreadMessage } from '../../../types';
import { Check, Loader2 } from 'lucide-react';
import PlanCardFrame from './PlanCardFrame';
import { usePreBuildPlan } from '../../../hooks/usePreBuildPlan';

export default function SpecLockCard({ message }: { message: ThreadMessage }) {
  const {
    activeRepoConnection,
    architectMd,
    projectType,
    selectedBuilderIds,
    suggestedLanes,
    lanesLocked,
    canLock,
    requestedBuildPrompt,
    lockSpec,
    startBuild,
    openAdvancedView,
  } = usePreBuildPlan(message.thread_id);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const checklist = [
    { label: 'Build request captured', ready: Boolean(requestedBuildPrompt) },
    { label: 'Repo connected or greenfield build chosen', ready: projectType === 'new' || Boolean(activeRepoConnection) },
    { label: 'Builder roster selected', ready: selectedBuilderIds.length > 0 },
    { label: 'ARCHITECT.md generated', ready: Boolean(architectMd) },
    { label: 'Lane plan prepared', ready: suggestedLanes.length > 0 },
  ];

  const handlePrimary = async () => {
    setLoading(true);
    setError('');
    try {
      if (!lanesLocked) {
        await lockSpec();
      }
      await startBuild();
    } catch (lockError) {
      setError(lockError instanceof Error ? lockError.message : 'Could not start build');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PlanCardFrame
      title="Lock and start build"
      status={lanesLocked ? 'Spec locked' : 'Final review'}
      description="The final card persists build lanes, locks the spec, and hands the session straight into the runway."
      onOpenAdvancedView={openAdvancedView}
    >
      <div className="space-y-2">
        {checklist.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-sm">
            <div className={`flex h-5 w-5 items-center justify-center rounded-full ${item.ready ? 'bg-signal-ok/15 text-signal-ok/90' : 'bg-surf-2 text-ink-3'}`}>
              <Check size={12} />
            </div>
            <span className={item.ready ? 'text-ink-1' : 'text-ink-3'}>{item.label}</span>
          </div>
        ))}
      </div>
      {error && (
        <div className="mt-3 rounded-xl border border-signal-risk/20 bg-signal-risk/8 px-3 py-2 text-sm text-signal-risk/85">
          {error}
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void handlePrimary()}
          disabled={loading || (!lanesLocked && !canLock)}
          className="reveal-pill"
          style={{ height: '38px', fontSize: '12px', padding: '0 16px', background: 'var(--gold)', color: 'var(--void)', borderColor: 'transparent', opacity: loading || (!lanesLocked && !canLock) ? 0.6 : 1 }}
        >
          {loading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
          {lanesLocked ? 'Start build runway' : 'Lock and start build'}
        </button>
      </div>
    </PlanCardFrame>
  );
}
