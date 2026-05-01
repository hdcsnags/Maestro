import { useEffect, useState } from 'react';
import type { BuildLaneRole, SuggestedLane, ThreadMessage } from '../../../types';
import { Plus, Trash2 } from 'lucide-react';
import PlanCardFrame from './PlanCardFrame';
import { usePreBuildPlan } from '../../../hooks/usePreBuildPlan';

const ROLE_OPTIONS: Array<{ value: BuildLaneRole; label: string }> = [
  { value: 'builder', label: 'Builder' },
  { value: 'reviewer', label: 'Reviewer' },
  { value: 'read_only', label: 'Read only' },
  { value: 'security_audit', label: 'Security audit' },
];

function LaneRow({
  lane,
  index,
  disabled,
  agentOptions,
  issue,
  onUpdate,
  onRemove,
}: {
  lane: SuggestedLane;
  index: number;
  disabled: boolean;
  agentOptions: Array<{ id: string; label: string }>;
  issue?: string;
  onUpdate: (index: number, patch: Partial<SuggestedLane>) => Promise<void>;
  onRemove: (index: number) => Promise<void>;
}) {
  const [pathDraft, setPathDraft] = useState(lane.lane_paths.join(', '));

  useEffect(() => {
    setPathDraft(lane.lane_paths.join(', '));
  }, [lane.lane_paths]);

  return (
    <div className="rounded-xl border border-white/[0.06] bg-black/10 px-3 py-3">
      <div className="grid gap-3 md:grid-cols-[1.2fr,1fr,auto]">
        <select
          value={lane.agent_id ?? ''}
          onChange={(event) => {
            const agent = agentOptions.find((option) => option.id === event.target.value);
            void onUpdate(index, { agent_id: event.target.value, agent_name: agent?.label ?? lane.agent_name });
          }}
          disabled={disabled}
          className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white/80 outline-none"
        >
          {agentOptions.map((option) => (
            <option key={option.id} value={option.id}>{option.label}</option>
          ))}
        </select>
        <select
          value={lane.role}
          onChange={(event) => void onUpdate(index, { role: event.target.value as BuildLaneRole })}
          disabled={disabled}
          className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-sm text-white/80 outline-none"
        >
          {ROLE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <button
          onClick={() => void onRemove(index)}
          disabled={disabled}
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-white/50 hover:text-white/75"
          aria-label="Remove lane"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <input
        type="text"
        value={pathDraft}
        onChange={(event) => setPathDraft(event.target.value)}
        onBlur={() => void onUpdate(index, { lane_paths: pathDraft.split(',').map((path) => path.trim()).filter(Boolean) })}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void onUpdate(index, { lane_paths: pathDraft.split(',').map((path) => path.trim()).filter(Boolean) });
          }
        }}
        disabled={disabled}
        className="mt-3 w-full rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 font-mono text-xs text-white/75 outline-none"
        placeholder="src/**, app/**"
      />
      {issue && (
        <div className="mt-2 text-xs text-signal-risk/80">{issue}</div>
      )}
    </div>
  );
}

export default function LaneCard({ message }: { message: ThreadMessage }) {
  const {
    suggestedLanes,
    selectedBuilderAgents,
    activeAgents,
    laneIssues,
    lanesLocked,
    addLane,
    removeLane,
    seedDefaultLanes,
    updateLaneAt,
    openAdvancedView,
  } = usePreBuildPlan(message.thread_id);

  return (
    <PlanCardFrame
      title="Lane assignment"
      status={lanesLocked ? 'Locked' : `${suggestedLanes.length} lanes`}
      description="Review or edit the scoped handoff lanes Concierge inferred from ARCHITECT.md before you lock the spec."
      onOpenAdvancedView={openAdvancedView}
    >
      {suggestedLanes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/[0.08] px-3 py-4 text-sm text-white/55">
          No lanes yet. Generate ARCHITECT.md first, or seed a basic builder split now.
          <div className="mt-3">
            <button
              onClick={() => void seedDefaultLanes()}
              className="reveal-pill"
              style={{ height: '34px', fontSize: '11px', padding: '0 14px' }}
            >
              Seed default lanes
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {suggestedLanes.map((lane, index) => (
            <LaneRow
              key={`${lane.agent_name}-${index}`}
              lane={lane}
              index={index}
              disabled={lanesLocked}
              issue={laneIssues.overlaps.get(index) ?? (laneIssues.invalidBuilderLaneIndexes.has(index) ? 'Builder lanes must use a selected builder.' : undefined)}
              agentOptions={(lane.role === 'builder' ? selectedBuilderAgents : activeAgents).map((agent) => ({
                id: agent.id,
                label: agent.display_name || agent.name,
              }))}
              onUpdate={updateLaneAt}
              onRemove={removeLane}
            />
          ))}
        </div>
      )}
      <div className="mt-4">
        <button
          onClick={() => void addLane()}
          disabled={lanesLocked}
          className="reveal-pill"
          style={{ height: '34px', fontSize: '11px', padding: '0 14px', opacity: lanesLocked ? 0.6 : 1 }}
        >
          <Plus size={12} />
          Add lane
        </button>
      </div>
    </PlanCardFrame>
  );
}
