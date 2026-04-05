import { useState } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { useAuth } from '../../context/AuthContext';
import { PROVIDER_REGISTRY, AgentSkill } from '../../types';
import { supabase } from '../../lib/supabase';
import { Plus, X, FolderTree, Zap, Loader2, KeyRound } from 'lucide-react';

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
    const newActive = !agent.is_active;
    await supabase
      .from('agents')
      .update({ is_active: newActive } as never)
      .eq('id', agentId);
    dispatch({ type: 'UPDATE_AGENT', payload: { id: agentId, is_active: newActive } });
  };

  const hasKey = (providerId: string) =>
    state.providerConnections.some(c => c.provider === providerId && c.is_connected);

  const connectedCount = state.providerConnections.filter(c => c.is_connected).length;
  const activeCount = state.agents.filter(a => a.is_active).length;

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
        The orchestra remains offstage until you ask for it. Roles, models, skills,
        and scoped paths live here -- not on the planning canvas.
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

      <div className="flex flex-col gap-3">
        {state.agents.map(agent => {
          const providerInfo = PROVIDER_REGISTRY.find(p => p.id === agent.provider);
          const isExpanded = expandedAgent === agent.id;
          const skills = state.agentSkills.filter(s => s.agent_id === agent.id);
          const scopedPaths = agent.scoped_paths || [];
          const providerHasKey = hasKey(agent.provider);

          return (
            <div
              key={agent.id}
              className="reveal-card"
              style={{ opacity: agent.is_active ? 1 : 0.55, transition: 'opacity 0.2s ease' }}
            >
              <div
                className="flex items-center justify-between gap-3 mb-2"
                style={{ cursor: 'pointer' }}
                onClick={() => setExpandedAgent(isExpanded ? null : agent.id)}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: agent.is_active ? agent.color : 'var(--text-dim)',
                      boxShadow: agent.is_active ? `0 0 12px ${agent.color}55` : 'none',
                      flexShrink: 0,
                      transition: 'all 0.2s ease',
                    }}
                  />
                  <strong style={{ color: 'var(--text)', fontWeight: 500, fontSize: '14px' }}>
                    {agent.name}
                  </strong>
                </div>
                <div className="flex items-center gap-2">
                  {skills.length > 0 && (
                    <span className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--text-dim)' }}>
                      {skills.filter(s => s.is_active).length} skill{skills.filter(s => s.is_active).length !== 1 ? 's' : ''}
                    </span>
                  )}
                  <button
                    className={`reveal-chip ${agent.is_active ? 'accent' : ''}`}
                    style={{ cursor: 'pointer', border: 'none' }}
                    onClick={e => { e.stopPropagation(); handleToggleAgent(agent.id); }}
                    title={agent.is_active ? 'Click to deactivate' : 'Click to activate'}
                  >
                    {agent.is_active ? 'Active' : 'Inactive'}
                  </button>
                </div>
              </div>
              <div style={{ color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5, marginBottom: '8px' }}>
                {agent.role}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="reveal-chip" style={{ fontSize: '10px', height: '24px', padding: '0 8px' }}>
                  {providerInfo?.name ?? agent.provider}
                </span>
                <span className="reveal-chip" style={{ fontSize: '10px', height: '24px', padding: '0 8px' }}>
                  {agent.model}
                </span>
                <span
                  className="reveal-chip"
                  style={{
                    fontSize: '9px',
                    height: '22px',
                    padding: '0 7px',
                    gap: '4px',
                    color: providerHasKey ? 'var(--ok)' : 'var(--risk)',
                    borderColor: providerHasKey ? 'rgba(78,187,127,0.2)' : 'rgba(224,90,90,0.2)',
                    background: providerHasKey ? 'rgba(78,187,127,0.05)' : 'rgba(224,90,90,0.05)',
                  }}
                >
                  <KeyRound size={9} />
                  {providerHasKey ? 'Key set' : 'No key'}
                </span>
              </div>

              {isExpanded && (
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
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
