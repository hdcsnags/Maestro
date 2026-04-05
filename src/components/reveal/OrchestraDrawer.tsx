import { useState } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { useAuth } from '../../context/AuthContext';
import { PROVIDER_REGISTRY, AgentSkill, OPENROUTER_FREE_MODELS, CO_LEAD_MODELS, PROVIDER_COLORS, Agent } from '../../types';
import { supabase } from '../../lib/supabase';
import { Plus, X, FolderTree, Zap, Loader2, KeyRound, ChevronDown, Lock } from 'lucide-react';

const PROVIDER_GROUP_ORDER = ['anthropic', 'openai', 'google', 'openrouter'];

export default function OrchestraDrawer() {
  const { state, dispatch } = useMaestro();
  const { user } = useAuth();
  const isOpen = state.activeDrawer === 'orchestra';

  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillInstruction, setNewSkillInstruction] = useState('');
  const [newScopePath, setNewScopePath] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAddSkill = async (agentId: string) => {
    if (!user || !newSkillName.trim() || !newSkillInstruction.trim()) return;
    setSaving(true);

    const { data: raw } = await supabase
      .from('agent_skills')
      .insert({
        agent_id: agentId,
        user_id: user.id,
        name: newSkillName.trim(),
        instruction: newSkillInstruction.trim(),
        scoped_paths: [],
        is_active: true,
      } as never)
      .select()
      .maybeSingle();

    const skill = raw as AgentSkill | null;
    if (skill) {
      dispatch({ type: 'ADD_AGENT_SKILL', payload: skill });
    }

    setNewSkillName('');
    setNewSkillInstruction('');
    setSaving(false);
  };

  const handleRemoveSkill = async (skillId: string) => {
    await supabase.from('agent_skills').delete().eq('id', skillId);
    dispatch({ type: 'REMOVE_AGENT_SKILL', payload: skillId });
  };

  const handleToggleSkill = async (skill: AgentSkill) => {
    const newActive = !skill.is_active;
    await supabase
      .from('agent_skills')
      .update({ is_active: newActive } as never)
      .eq('id', skill.id);
    dispatch({ type: 'UPDATE_AGENT_SKILL', payload: { id: skill.id, is_active: newActive } });
  };

  const handleAddScopePath = async (agentId: string) => {
    if (!newScopePath.trim()) return;
    const agent = state.agents.find(a => a.id === agentId);
    if (!agent) return;

    const paths = [...(agent.scoped_paths || []), newScopePath.trim()];
    await supabase
      .from('agents')
      .update({ scoped_paths: paths } as never)
      .eq('id', agentId);
    dispatch({ type: 'UPDATE_AGENT', payload: { id: agentId, scoped_paths: paths } });
    setNewScopePath('');
  };

  const handleRemoveScopePath = async (agentId: string, path: string) => {
    const agent = state.agents.find(a => a.id === agentId);
    if (!agent) return;

    const paths = (agent.scoped_paths || []).filter(p => p !== path);
    await supabase
      .from('agents')
      .update({ scoped_paths: paths } as never)
      .eq('id', agentId);
    dispatch({ type: 'UPDATE_AGENT', payload: { id: agentId, scoped_paths: paths } });
  };

  const handleToggleAgent = async (agentId: string) => {
    const agent = state.agents.find(a => a.id === agentId);
    if (!agent) return;
    // Reserved slots (slot_index 2 on openrouter) cannot be toggled
    if (agent.provider_group === 'openrouter' && agent.slot_index === 2) return;
    const newActive = !agent.is_active;
    await supabase
      .from('agents')
      .update({ is_active: newActive } as never)
      .eq('id', agentId);
    dispatch({ type: 'UPDATE_AGENT', payload: { id: agentId, is_active: newActive } });
  };

  const handleModelChange = async (agentId: string, model: string) => {
    const modelInfo = [...OPENROUTER_FREE_MODELS, ...CO_LEAD_MODELS].find(m => m.id === model);
    const displayName = modelInfo?.label ?? model;
    await supabase
      .from('agents')
      .update({ model, display_name: displayName } as never)
      .eq('id', agentId);
    dispatch({ type: 'UPDATE_AGENT', payload: { id: agentId, model, display_name: displayName } });
  };

  const hasKey = (providerId: string) =>
    state.providerConnections.some(c => c.provider === providerId && c.is_connected);

  const connectedCount = state.providerConnections.filter(c => c.is_connected).length;
  const activeCount = state.agents.filter(a => a.is_active).length;

  // Group agents by provider_group
  const agentsByGroup: Record<string, Agent[]> = {};
  for (const agent of state.agents) {
    const group = agent.provider_group || agent.provider;
    if (!agentsByGroup[group]) agentsByGroup[group] = [];
    agentsByGroup[group].push(agent);
  }

  // Sort each group by slot_index
  for (const group of Object.keys(agentsByGroup)) {
    agentsByGroup[group].sort((a, b) => (a.slot_index ?? 0) - (b.slot_index ?? 0));
  }

  const renderExpandedSection = (agent: Agent) => {
    const skills = state.agentSkills.filter(s => s.agent_id === agent.id);
    const scopedPaths = agent.scoped_paths || [];

    return (
      <div className="mt-3 flex flex-col gap-3" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Zap size={11} style={{ color: 'var(--gold)' }} />
            <span className="font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--text-dim)' }}>
              Skills
            </span>
          </div>

          {skills.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-2">
              {skills.map(skill => (
                <div
                  key={skill.id}
                  className="flex items-center gap-2"
                  style={{
                    padding: '6px 10px',
                    borderRadius: '10px',
                    background: skill.is_active ? 'rgba(201,168,76,0.06)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${skill.is_active ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.04)'}`,
                  }}
                >
                  <button
                    onClick={() => handleToggleSkill(skill)}
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: skill.is_active ? 'var(--gold)' : 'var(--text-dim)',
                      boxShadow: skill.is_active ? '0 0 6px var(--gold)' : 'none',
                      border: 'none',
                      cursor: 'pointer',
                      flexShrink: 0,
                      padding: 0,
                    }}
                    title={skill.is_active ? 'Disable skill' : 'Enable skill'}
                  />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12px', color: skill.is_active ? 'var(--text)' : 'var(--text-dim)', fontWeight: 500 }}>
                      {skill.name}
                    </div>
                    <div className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {skill.instruction}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveSkill(skill.id)}
                    className="keycap"
                    style={{ width: '20px', height: '20px', minWidth: '20px' }}
                  >
                    <X size={9} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <input
              type="text"
              value={newSkillName}
              onChange={e => setNewSkillName(e.target.value)}
              placeholder="Skill name..."
              style={{
                height: '30px',
                padding: '0 10px',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.025)',
                color: 'var(--text)',
                fontSize: '12px',
                outline: 'none',
                width: '100%',
              }}
            />
            <textarea
              value={newSkillInstruction}
              onChange={e => setNewSkillInstruction(e.target.value)}
              placeholder="Instruction (system prompt fragment)..."
              rows={2}
              style={{
                padding: '8px 10px',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.025)',
                color: 'var(--text)',
                fontSize: '12px',
                outline: 'none',
                width: '100%',
                resize: 'vertical',
                fontFamily: 'inherit',
              }}
            />
            <button
              className="reveal-pill"
              style={{ height: '28px', fontSize: '11px', alignSelf: 'flex-start' }}
              onClick={() => handleAddSkill(agent.id)}
              disabled={saving || !newSkillName.trim() || !newSkillInstruction.trim()}
            >
              {saving ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
              Add skill
            </button>
          </div>
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <FolderTree size={11} style={{ color: 'var(--gemini)' }} />
            <span className="font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--text-dim)' }}>
              Scoped Paths
            </span>
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
                    style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0, display: 'flex' }}
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
      </div>
    );
  };

  const renderSlot = (agent: Agent, providerHasKey: boolean) => {
    const isExpanded = expandedAgent === agent.id;
    const skills = state.agentSkills.filter(s => s.agent_id === agent.id);
    const isReserved = agent.provider_group === 'openrouter' && agent.slot_index === 2;
    const isCoLead = agent.provider_group === 'openrouter' && agent.slot_index === 1;
    const isFreeSlot = agent.slot_index === 0;
    const isLocked = !providerHasKey;

    return (
      <div
        key={agent.id}
        style={{
          padding: '10px 12px',
          borderRadius: '14px',
          background: isLocked ? 'rgba(255,255,255,0.01)' : agent.is_active ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.015)',
          border: `1px solid ${agent.is_active && !isLocked ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`,
          opacity: isReserved ? 0.4 : isLocked ? 0.6 : agent.is_active ? 1 : 0.65,
          transition: 'all 0.2s ease',
        }}
      >
        <div
          className="flex items-center justify-between gap-2"
          style={{ cursor: isReserved ? 'default' : 'pointer' }}
          onClick={() => !isReserved && setExpandedAgent(isExpanded ? null : agent.id)}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: agent.is_active && !isLocked ? agent.color : 'var(--text-dim)',
                boxShadow: agent.is_active && !isLocked ? `0 0 8px ${agent.color}55` : 'none',
                flexShrink: 0,
              }}
            />
            <div style={{ minWidth: 0 }}>
              <div className="flex items-center gap-1.5">
                <span style={{ fontSize: '13px', fontWeight: 500, color: isLocked ? 'var(--text-dim)' : 'var(--text)' }}>
                  {agent.display_name || agent.name}
                </span>
                {isCoLead && (
                  <span className="font-mono-dm" style={{ fontSize: '8px', color: '#8a8ae0', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                    Co-Lead
                  </span>
                )}
              </div>
              <div className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {isReserved ? 'Reserved for future use' : agent.model || 'Select model'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {isFreeSlot && !isLocked && (
              <span className="reveal-chip" style={{ fontSize: '8px', height: '18px', padding: '0 5px', color: 'var(--ok)', borderColor: 'rgba(78,187,127,0.2)', background: 'rgba(78,187,127,0.05)' }}>
                Free
              </span>
            )}
            {!isFreeSlot && !isReserved && !isLocked && (
              <span className="reveal-chip" style={{ fontSize: '8px', height: '18px', padding: '0 5px' }}>
                Paid
              </span>
            )}
            {skills.length > 0 && (
              <span className="font-mono-dm" style={{ fontSize: '8px', color: 'var(--text-dim)' }}>
                {skills.filter(s => s.is_active).length} skill{skills.filter(s => s.is_active).length !== 1 ? 's' : ''}
              </span>
            )}
            {isLocked ? (
              <button
                className="reveal-pill"
                style={{ height: '22px', fontSize: '9px', gap: '3px' }}
                onClick={e => {
                  e.stopPropagation();
                  dispatch({ type: 'CLOSE_TRANSIENT' });
                  setTimeout(() => dispatch({ type: 'OPEN_DRAWER', payload: 'vault' }), 150);
                }}
              >
                <Lock size={8} />
                Add key in Vault
              </button>
            ) : isReserved ? (
              <span className="reveal-chip" style={{ fontSize: '8px', height: '18px', padding: '0 5px' }}>
                Locked
              </span>
            ) : (
              <button
                className={`reveal-chip ${agent.is_active ? 'accent' : ''}`}
                style={{ cursor: 'pointer', border: 'none', fontSize: '9px', height: '20px', padding: '0 6px' }}
                onClick={e => { e.stopPropagation(); handleToggleAgent(agent.id); }}
                title={agent.is_active ? 'Remove from broadcast' : 'Add to broadcast'}
              >
                {agent.is_active ? 'On' : 'Off'}
              </button>
            )}
          </div>
        </div>

        {/* OpenRouter slot 0: free model dropdown */}
        {agent.provider_group === 'openrouter' && agent.slot_index === 0 && !isLocked && isExpanded && (
          <div style={{ position: 'relative', marginTop: '8px' }}>
            <select
              value={agent.model}
              onChange={e => handleModelChange(agent.id, e.target.value)}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%',
                height: '32px',
                padding: '0 28px 0 10px',
                borderRadius: '10px',
                border: '1px solid rgba(138,138,224,0.15)',
                background: 'rgba(138,138,224,0.04)',
                color: 'var(--text)',
                fontSize: '11px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                WebkitAppearance: 'none',
              }}
            >
              {OPENROUTER_FREE_MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <ChevronDown
              size={11}
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }}
            />
          </div>
        )}

        {/* OpenRouter slot 1: Co-Lead premium dropdown */}
        {isCoLead && !isLocked && isExpanded && (
          <div style={{ position: 'relative', marginTop: '8px' }}>
            <select
              value={agent.model}
              onChange={e => handleModelChange(agent.id, e.target.value)}
              onClick={e => e.stopPropagation()}
              style={{
                width: '100%',
                height: '32px',
                padding: '0 28px 0 10px',
                borderRadius: '10px',
                border: '1px solid rgba(138,138,224,0.15)',
                background: 'rgba(138,138,224,0.04)',
                color: 'var(--text)',
                fontSize: '11px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                outline: 'none',
                cursor: 'pointer',
                appearance: 'none',
                WebkitAppearance: 'none',
              }}
            >
              <option value="">Select a premium model...</option>
              {CO_LEAD_MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <ChevronDown
              size={11}
              style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }}
            />
          </div>
        )}

        {isExpanded && !isReserved && !isLocked && renderExpandedSection(agent)}
      </div>
    );
  };

  return (
    <aside className={`drawer-panel drawer-left ${isOpen ? 'open' : ''}`}>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <div className="reveal-label" style={{ marginBottom: '6px' }}>Orchestra</div>
          <h3
            className="font-syne"
            style={{ margin: 0, fontSize: '24px', fontWeight: 400, letterSpacing: '-0.03em', color: 'var(--text)' }}
          >
            Select the voices
          </h3>
        </div>
        <button
          className="keycap"
          onClick={() => dispatch({ type: 'CLOSE_TRANSIENT' })}
        >
          Esc
        </button>
      </div>

      <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, fontSize: '14px', marginBottom: '16px' }}>
        Four providers, three model slots each. Slot 1 is the free tier default.
        Toggle slots on to add voices to the broadcast.
      </p>

      <div className="flex items-center gap-3 mb-5">
        <span className="reveal-chip accent" style={{ fontSize: '10px', height: '24px', padding: '0 8px' }}>
          {activeCount} active
        </span>
        <span
          className="reveal-chip"
          style={{
            fontSize: '10px',
            height: '24px',
            padding: '0 8px',
            color: connectedCount > 0 ? 'var(--ok)' : 'var(--risk)',
            borderColor: connectedCount > 0 ? 'rgba(78,187,127,0.25)' : 'rgba(224,90,90,0.25)',
            background: connectedCount > 0 ? 'rgba(78,187,127,0.06)' : 'rgba(224,90,90,0.06)',
          }}
        >
          {connectedCount} key{connectedCount !== 1 ? 's' : ''} connected
        </span>
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

      <div className="flex flex-col gap-5">
        {PROVIDER_GROUP_ORDER.map(groupId => {
          const providerInfo = PROVIDER_REGISTRY.find(p => p.id === groupId);
          const agents = agentsByGroup[groupId] ?? [];
          if (agents.length === 0) return null;

          const providerHasKey = hasKey(groupId);
          const color = PROVIDER_COLORS[groupId] ?? 'var(--text-muted)';
          const activeInGroup = agents.filter(a => a.is_active).length;

          return (
            <div key={groupId}>
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
                  <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text)' }}>
                    {providerInfo?.name ?? groupId}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--text-dim)' }}>
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
                      borderColor: providerHasKey ? 'rgba(78,187,127,0.2)' : 'rgba(224,90,90,0.2)',
                      background: providerHasKey ? 'rgba(78,187,127,0.05)' : 'rgba(224,90,90,0.05)',
                    }}
                  >
                    <KeyRound size={8} />
                    {providerHasKey ? 'Key set' : 'No key'}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                {agents.map(agent => renderSlot(agent, providerHasKey))}
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
