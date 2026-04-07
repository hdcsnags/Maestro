import { useState, useMemo } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { PROVIDER_COLORS, Agent } from '../../types';
import { supabase } from '../../lib/supabase';
import {
  estimateBroadcastCost,
  formatCostRange,
  isFreeModel,
} from '../../lib/cost';
import {
  ChevronDown,
  ChevronUp,
  FolderTree,
  KeyRound,
  Lock,
  Plus,
  Settings2,
  X,
} from 'lucide-react';

/* ── Tier system ─────────────────────────────────────────────── */

type TierName = 'free' | 'premium' | 'power';

interface TierSlot {
  provider_group: string;
  slot_index: number;
}

interface TierDef {
  label: string;
  sublabel: string;
  slots: TierSlot[];
  budgetNotice?: string;
}

const TIER_ACCENT: Record<TierName, string> = {
  free: '#4ebb7f',
  premium: '#c9a84c',
  power: '#e07b5a',
};

const TIER_DEFINITIONS: Record<TierName, TierDef> = {
  free: {
    label: 'FREE',
    sublabel: 'Zero cost — open-weight models',
    slots: [
      { provider_group: 'openrouter_a', slot_index: 0 },
      { provider_group: 'openrouter_a', slot_index: 1 },
      { provider_group: 'openrouter_a', slot_index: 2 },
      { provider_group: 'google', slot_index: 0 },
    ],
  },
  premium: {
    label: 'PREMIUM',
    sublabel: 'Balanced cost — flagship models',
    slots: [
      { provider_group: 'anthropic', slot_index: 1 },
      { provider_group: 'openai', slot_index: 0 },
      { provider_group: 'google', slot_index: 0 },
      { provider_group: 'openrouter_a', slot_index: 0 },
    ],
  },
  power: {
    label: 'POWER',
    sublabel: 'Maximum capability — all flagships',
    slots: [
      { provider_group: 'anthropic', slot_index: 1 },
      { provider_group: 'anthropic', slot_index: 2 },
      { provider_group: 'openai', slot_index: 2 },
      { provider_group: 'google', slot_index: 1 },
      { provider_group: 'openrouter_a', slot_index: 0 },
    ],
    budgetNotice: 'Budget approval required',
  },
};

const TIER_ORDER: TierName[] = ['free', 'premium', 'power'];

/* ── Helpers ─────────────────────────────────────────────────── */

function slotKey(pg: string, si: number) {
  return `${pg}:${si}`;
}

function detectTier(agents: Agent[]): TierName | 'custom' {
  const activeSet = new Set(
    agents.filter(a => a.is_active).map(a => slotKey(a.provider_group, a.slot_index)),
  );
  for (const tier of TIER_ORDER) {
    const tierSet = new Set(
      TIER_DEFINITIONS[tier].slots.map(s => slotKey(s.provider_group, s.slot_index)),
    );
    if (tierSet.size === activeSet.size && [...tierSet].every(k => activeSet.has(k))) {
      return tier;
    }
  }
  return 'custom';
}

function resolveSlotAgents(agents: Agent[], slots: TierSlot[]): Agent[] {
  return slots
    .map(s => agents.find(a => a.provider_group === s.provider_group && a.slot_index === s.slot_index))
    .filter((a): a is Agent => !!a);
}

function tierCostLabel(agents: Agent[], slots: TierSlot[]): string {
  const models = resolveSlotAgents(agents, slots).map(a => a.model);
  if (models.length === 0) return '';
  if (models.every(isFreeModel)) return '~$0.00 per round';
  const est = estimateBroadcastCost(models, 500);
  return `${formatCostRange(est)} per round estimated`;
}

function tierModelSummary(agents: Agent[], slots: TierSlot[]): string {
  return resolveSlotAgents(agents, slots)
    .map(a => a.display_name || a.name)
    .join(' · ');
}

/* ── Advanced view — provider groups ─────────────────────────── */

const PROVIDER_GROUPS: { id: string; label: string; keyProvider: string }[] = [
  { id: 'anthropic', label: 'Anthropic', keyProvider: 'anthropic' },
  { id: 'openai', label: 'OpenAI', keyProvider: 'openai' },
  { id: 'google', label: 'Google Gemini', keyProvider: 'google' },
  { id: 'openrouter_a', label: 'OpenRouter — Free', keyProvider: 'openrouter' },
  { id: 'openrouter_b', label: 'OpenRouter — Premium', keyProvider: 'openrouter' },
];

/* ── Component ───────────────────────────────────────────────── */

export default function OrchestraDrawer() {
  const { state, dispatch } = useMaestro();
  const isOpen = state.activeDrawer === 'orchestra';

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [scopeEditorAgent, setScopeEditorAgent] = useState<string | null>(null);
  const [newScopePath, setNewScopePath] = useState('');

  const currentTier = useMemo(() => detectTier(state.agents), [state.agents]);

  /* ── Tier selection ── */

  const handleSelectTier = async (tier: TierName) => {
    const def = TIER_DEFINITIONS[tier];
    const tierSlotKeys = new Set(def.slots.map(s => slotKey(s.provider_group, s.slot_index)));
    for (const agent of state.agents) {
      const key = slotKey(agent.provider_group, agent.slot_index);
      const shouldBeActive = tierSlotKeys.has(key);
      if (agent.is_active !== shouldBeActive) {
        supabase.from('agents').update({ is_active: shouldBeActive } as never).eq('id', agent.id);
        dispatch({ type: 'UPDATE_AGENT', payload: { id: agent.id, is_active: shouldBeActive } });
      }
    }
  };

  /* ── Individual agent toggle (Advanced view) ── */

  const handleToggleAgent = async (agent: Agent, providerHasKey: boolean) => {
    if (!providerHasKey) return;
    const newActive = !agent.is_active;
    await supabase.from('agents').update({ is_active: newActive } as never).eq('id', agent.id);
    dispatch({ type: 'UPDATE_AGENT', payload: { id: agent.id, is_active: newActive } });
  };

  /* ── Scoped paths ── */

  const handleAddScopePath = async (agentId: string) => {
    if (!newScopePath.trim()) return;
    const agent = state.agents.find(a => a.id === agentId);
    if (!agent) return;
    const paths = [...(agent.scoped_paths || []), newScopePath.trim()];
    await supabase.from('agents').update({ scoped_paths: paths } as never).eq('id', agentId);
    dispatch({ type: 'UPDATE_AGENT', payload: { id: agentId, scoped_paths: paths } });
    setNewScopePath('');
  };

  const handleRemoveScopePath = async (agentId: string, path: string) => {
    const agent = state.agents.find(a => a.id === agentId);
    if (!agent) return;
    const paths = (agent.scoped_paths || []).filter(p => p !== path);
    await supabase.from('agents').update({ scoped_paths: paths } as never).eq('id', agentId);
    dispatch({ type: 'UPDATE_AGENT', payload: { id: agentId, scoped_paths: paths } });
  };

  /* ── Derived state ── */

  const hasKey = (providerId: string) =>
    state.providerConnections.some(c => c.provider === providerId && c.is_connected);

  const activeCount = state.agents.filter(a => a.is_active).length;

  const agentsByGroup: Record<string, Agent[]> = {};
  for (const agent of state.agents) {
    const group = agent.provider_group || agent.provider;
    if (!agentsByGroup[group]) agentsByGroup[group] = [];
    agentsByGroup[group].push(agent);
  }
  for (const group of Object.keys(agentsByGroup)) {
    agentsByGroup[group].sort((a, b) => (a.slot_index ?? 0) - (b.slot_index ?? 0));
  }

  /* ── Render: tier card ── */

  const renderTierCard = (tier: TierName) => {
    const def = TIER_DEFINITIONS[tier];
    const accent = TIER_ACCENT[tier];
    const isSelected = currentTier === tier;
    const models = tierModelSummary(state.agents, def.slots);
    const cost = tierCostLabel(state.agents, def.slots);

    return (
      <button
        key={tier}
        onClick={() => handleSelectTier(tier)}
        style={{
          width: '100%',
          padding: '18px 22px',
          borderRadius: '16px',
          border: `1px solid ${isSelected ? accent : 'rgba(255,255,255,0.06)'}`,
          background: isSelected
            ? `linear-gradient(180deg, ${accent}14, ${accent}08)`
            : 'rgba(255,255,255,0.02)',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'all 0.2s ease',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span
            className="font-mono-dm"
            style={{
              fontSize: '12px',
              letterSpacing: '0.2em',
              fontWeight: 600,
              color: isSelected ? accent : 'var(--text-muted)',
            }}
          >
            {def.label}
          </span>
          {isSelected && (
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: accent,
                boxShadow: `0 0 12px ${accent}`,
              }}
            />
          )}
        </div>
        <div
          style={{
            fontSize: '12px',
            lineHeight: 1.5,
            color: 'var(--text-muted)',
            marginBottom: '6px',
          }}
        >
          {models || def.sublabel}
        </div>
        <div
          className="font-mono-dm"
          style={{
            fontSize: '10px',
            letterSpacing: '0.08em',
            color: isSelected ? accent : 'var(--text-dim)',
          }}
        >
          {cost}
        </div>
        {def.budgetNotice && (
          <div
            className="font-mono-dm"
            style={{
              fontSize: '9px',
              marginTop: '6px',
              color: 'var(--warn)',
              letterSpacing: '0.06em',
            }}
          >
            {def.budgetNotice}
          </div>
        )}
      </button>
    );
  };

  /* ── Render: slot button (Advanced view) ── */

  const renderSlotButton = (agent: Agent, providerHasKey: boolean, isFreeRow: boolean) => {
    const isLocked = !providerHasKey;
    const isOn = agent.is_active && !isLocked;
    const isFree = isFreeRow || agent.slot_index === 0;
    const scopedPaths = agent.scoped_paths || [];

    return (
      <button
        key={agent.id}
        onClick={() => handleToggleAgent(agent, providerHasKey)}
        disabled={isLocked}
        title={isLocked ? 'Add a key in the Vault to use this voice' : agent.name}
        style={{
          flex: 1,
          minWidth: 0,
          minHeight: '64px',
          padding: '10px 12px',
          borderRadius: '14px',
          border: `1px solid ${isOn ? `${agent.color}55` : 'rgba(255,255,255,0.06)'}`,
          background: isOn
            ? `linear-gradient(180deg, ${agent.color}18, ${agent.color}08)`
            : isLocked
              ? 'rgba(255,255,255,0.015)'
              : 'rgba(255,255,255,0.025)',
          color: isLocked ? 'var(--text-dim)' : 'var(--text)',
          cursor: isLocked ? 'not-allowed' : 'pointer',
          opacity: isLocked ? 0.55 : 1,
          transition: 'all 0.18s ease',
          textAlign: 'left',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '6px',
          position: 'relative',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
          <div
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: isOn ? agent.color : 'var(--text-dim)',
              boxShadow: isOn ? `0 0 8px ${agent.color}88` : 'none',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: '12px',
              fontWeight: 500,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            {agent.display_name || agent.name}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span
              className="font-mono-dm"
              style={{
                fontSize: '8px',
                letterSpacing: '0.08em',
                textTransform: 'uppercase' as const,
                color: isFree ? 'var(--ok)' : 'var(--text-dim)',
                padding: '2px 5px',
                borderRadius: '4px',
                background: isFree ? 'rgba(78,187,127,0.08)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isFree ? 'rgba(78,187,127,0.18)' : 'rgba(255,255,255,0.06)'}`,
              }}
            >
              {isFree ? 'Free' : 'Paid'}
            </span>
            {scopedPaths.length > 0 && (
              <span
                className="font-mono-dm"
                title={scopedPaths.join(', ')}
                style={{ fontSize: '8px', color: 'var(--gemini)' }}
              >
                {scopedPaths.length} scope{scopedPaths.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>

          {isLocked ? (
            <Lock size={10} style={{ color: 'var(--text-dim)' }} />
          ) : (
            <span
              role="button"
              tabIndex={0}
              onClick={e => {
                e.stopPropagation();
                setScopeEditorAgent(scopeEditorAgent === agent.id ? null : agent.id);
              }}
              title="Edit scoped paths"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '18px',
                height: '18px',
                borderRadius: '6px',
                color: scopeEditorAgent === agent.id ? 'var(--gold)' : 'var(--text-dim)',
                background: scopeEditorAgent === agent.id ? 'rgba(201,168,76,0.1)' : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              <Settings2 size={11} />
            </span>
          )}
        </div>
      </button>
    );
  };

  /* ── Render: scope editor (Advanced view) ── */

  const renderScopeEditor = (agent: Agent) => {
    const scopedPaths = agent.scoped_paths || [];
    return (
      <div
        style={{
          marginTop: '8px',
          padding: '12px',
          borderRadius: '12px',
          background: 'rgba(201,168,76,0.04)',
          border: '1px solid rgba(201,168,76,0.12)',
        }}
      >
        <div className="flex items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-1.5">
            <FolderTree size={11} style={{ color: 'var(--gemini)' }} />
            <span
              className="font-mono-dm"
              style={{
                fontSize: '9px',
                letterSpacing: '0.12em',
                textTransform: 'uppercase' as const,
                color: 'var(--text-dim)',
              }}
            >
              {agent.display_name || agent.name} — Scoped Paths
            </span>
          </div>
          <button
            className="keycap"
            style={{ width: '20px', height: '20px', minWidth: '20px' }}
            onClick={() => setScopeEditorAgent(null)}
          >
            <X size={9} />
          </button>
        </div>

        {scopedPaths.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-2">
            {scopedPaths.map(path => (
              <span
                key={path}
                className="reveal-chip"
                style={{ fontSize: '9px', height: '22px', padding: '0 6px', gap: '4px' }}
              >
                {path}
                <button
                  onClick={() => handleRemoveScopePath(agent.id, path)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    padding: 0,
                    display: 'flex',
                  }}
                >
                  <X size={8} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5">
          <input
            type="text"
            value={newScopePath}
            onChange={e => setNewScopePath(e.target.value)}
            placeholder="src/components/**"
            onKeyDown={e => {
              if (e.key === 'Enter') handleAddScopePath(agent.id);
            }}
            style={{
              flex: 1,
              height: '28px',
              padding: '0 8px',
              borderRadius: '8px',
              border: '1px solid rgba(255,255,255,0.06)',
              background: 'rgba(255,255,255,0.025)',
              color: 'var(--text)',
              fontSize: '11px',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              outline: 'none',
            }}
          />
          <button
            className="keycap"
            style={{ width: '28px', height: '28px' }}
            onClick={() => handleAddScopePath(agent.id)}
            disabled={!newScopePath.trim()}
          >
            <Plus size={10} />
          </button>
        </div>
      </div>
    );
  };

  /* ── Main render ── */

  return (
    <aside className={`drawer-panel drawer-left ${isOpen ? 'open' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <div className="reveal-label" style={{ marginBottom: '6px' }}>Orchestra</div>
          <h3
            className="font-syne"
            style={{
              margin: 0,
              fontSize: '24px',
              fontWeight: 400,
              letterSpacing: '-0.03em',
              color: 'var(--text)',
            }}
          >
            Select your tier
          </h3>
        </div>
        <button className="keycap" onClick={() => dispatch({ type: 'CLOSE_TRANSIENT' })}>
          Esc
        </button>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-3 mb-5">
        <span
          className="reveal-chip accent"
          style={{ fontSize: '10px', height: '24px', padding: '0 8px' }}
        >
          {activeCount} active
        </span>
        {currentTier !== 'custom' ? (
          <span
            className="reveal-chip"
            style={{
              fontSize: '10px',
              height: '24px',
              padding: '0 8px',
              color: TIER_ACCENT[currentTier],
              borderColor: `${TIER_ACCENT[currentTier]}40`,
              background: `${TIER_ACCENT[currentTier]}0a`,
            }}
          >
            {TIER_DEFINITIONS[currentTier].label}
          </span>
        ) : (
          <span
            className="reveal-chip"
            style={{
              fontSize: '10px',
              height: '24px',
              padding: '0 8px',
              color: 'var(--text-muted)',
              borderColor: 'rgba(255,255,255,0.15)',
              background: 'rgba(255,255,255,0.04)',
            }}
          >
            Custom
          </span>
        )}
        <button
          className="reveal-pill"
          style={{ height: '24px', fontSize: '10px', marginLeft: 'auto' }}
          onClick={() => {
            dispatch({ type: 'CLOSE_TRANSIENT' });
            setTimeout(() => dispatch({ type: 'OPEN_DRAWER', payload: 'vault' }), 150);
          }}
        >
          <KeyRound size={10} />
          Manage keys
        </button>
      </div>

      {/* Tier cards */}
      <div className="flex flex-col gap-3 mb-6">
        {TIER_ORDER.map(renderTierCard)}
      </div>

      {/* Advanced override section */}
      <div>
        <button
          onClick={() => setAdvancedOpen(!advancedOpen)}
          className="flex items-center gap-2 w-full"
          style={{
            padding: '10px 0',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--text-dim)',
          }}
        >
          <span
            className="font-mono-dm"
            style={{
              fontSize: '10px',
              letterSpacing: '0.15em',
              textTransform: 'uppercase' as const,
            }}
          >
            Advanced
          </span>
          {advancedOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        </button>

        {advancedOpen && (
          <div style={{ paddingTop: '8px' }}>
            {/* Override warning banner */}
            <div
              className="font-mono-dm"
              style={{
                fontSize: '10px',
                padding: '10px 14px',
                marginBottom: '16px',
                borderRadius: '10px',
                background: 'rgba(201,168,76,0.06)',
                border: '1px solid rgba(201,168,76,0.15)',
                color: 'var(--gold)',
                letterSpacing: '0.04em',
              }}
            >
              Manual changes override your tier selection.
            </div>

            {/* 5×3 provider grid */}
            <div className="flex flex-col gap-4">
              {PROVIDER_GROUPS.map(group => {
                const agents = agentsByGroup[group.id] ?? [];
                if (agents.length === 0) return null;

                const providerHasKey = hasKey(group.keyProvider);
                const color = PROVIDER_COLORS[group.keyProvider] ?? 'var(--text-muted)';
                const activeInGroup = agents.filter(a => a.is_active).length;
                const isFreeRow = group.id === 'openrouter_a';
                const editingAgent = agents.find(a => a.id === scopeEditorAgent) ?? null;

                return (
                  <div key={group.id}>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: color,
                            boxShadow: providerHasKey ? `0 0 10px ${color}55` : 'none',
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)' }}>
                          {group.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span
                          className="font-mono-dm"
                          style={{ fontSize: '9px', color: 'var(--text-dim)' }}
                        >
                          {activeInGroup}/3
                        </span>
                        <span
                          className="reveal-chip"
                          style={{
                            fontSize: '8px',
                            height: '18px',
                            padding: '0 5px',
                            gap: '3px',
                            color: providerHasKey ? 'var(--ok)' : 'var(--risk)',
                            borderColor: providerHasKey
                              ? 'rgba(78,187,127,0.2)'
                              : 'rgba(224,90,90,0.2)',
                            background: providerHasKey
                              ? 'rgba(78,187,127,0.05)'
                              : 'rgba(224,90,90,0.05)',
                          }}
                        >
                          <KeyRound size={8} />
                          {providerHasKey ? 'Key set' : 'No key'}
                        </span>
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', alignItems: 'stretch' }}>
                      {agents.map(agent => renderSlotButton(agent, providerHasKey, isFreeRow))}
                    </div>

                    {editingAgent && renderScopeEditor(editingAgent)}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
