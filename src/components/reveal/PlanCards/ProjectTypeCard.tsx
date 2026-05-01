import type { ThreadMessage } from '../../../types';
import { FileCode2, GitBranch } from 'lucide-react';
import PlanCardFrame from './PlanCardFrame';
import { usePreBuildPlan } from '../../../hooks/usePreBuildPlan';

export default function ProjectTypeCard({ message }: { message: ThreadMessage }) {
  const {
    projectType,
    lanesLocked,
    setProjectType,
    openAdvancedView,
  } = usePreBuildPlan(message.thread_id);

  return (
    <PlanCardFrame
      title="Project type"
      status={projectType === 'existing' ? 'Existing app' : 'New app'}
      description="Tell Concierge whether this build starts from an existing repo or a greenfield app."
      onOpenAdvancedView={openAdvancedView}
    >
      <div className="grid grid-cols-2 gap-3">
        {([
          { key: 'new', label: 'New app', icon: FileCode2 },
          { key: 'existing', label: 'Existing app', icon: GitBranch },
        ] as const).map((option) => {
          const active = projectType === option.key;
          const Icon = option.icon;
          return (
            <button
              key={option.key}
              onClick={() => void setProjectType(option.key)}
              disabled={lanesLocked}
              className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-3 text-sm transition-colors ${active
                ? 'border-gold/30 bg-gold/10 text-gold'
                : 'border-white/[0.08] bg-black/10 text-white/70 hover:border-white/[0.14]'} ${lanesLocked ? 'opacity-60' : ''}`}
            >
              <Icon size={14} />
              {option.label}
            </button>
          );
        })}
      </div>
      {projectType === 'existing' && (
        <div className="mt-3 rounded-xl border border-signal-ok/20 bg-signal-ok/8 px-3 py-2 text-sm text-signal-ok/85">
          Existing-app mode unlocks repo scan and scaffold inference before the build starts.
        </div>
      )}
    </PlanCardFrame>
  );
}
