import { useState } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { ExecutionRun, ExecutionStrategy } from '../../types';
import { X, GitBranch, GitMerge, Loader2, ExternalLink, AlertTriangle, Check } from 'lucide-react';

export default function ExecutionModal() {
  const { state, dispatch } = useMaestro();
  const { user } = useAuth();

  const [executing, setExecuting] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [error, setError] = useState('');
  const [completedRun, setCompletedRun] = useState<ExecutionRun | null>(null);
  const [conductorOverride, setConductorOverride] = useState(false);

  if (!state.executionModalOpen) return null;

  const strategy = state.executionStrategy;
  const latestRound = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1] : null;
  const latestResponses = latestRound ? state.responses.filter(r => r.round_id === latestRound.id) : [];
  const latestSynthesis = latestRound ? state.syntheses.find(s => s.round_id === latestRound.id) : null;
  const activeRepo = state.activeRepoConnection;
  const needsConfirm = state.executionMode === 'elevated';

  const unscopedAgents = latestResponses.filter(r => {
    const agent = state.agents.find(a => a.id === r.agent_id);
    return !agent?.scoped_paths || agent.scoped_paths.length === 0;
  });

  const canExecute = activeRepo && latestResponses.length > 0 && (!needsConfirm || confirmText === 'EXECUTE');

  const handleClose = () => {
    dispatch({ type: 'SET_EXECUTION_MODAL', payload: false });
    setError('');
    setConfirmText('');
    setCompletedRun(null);
  };

  const handleExecute = async () => {
    if (!user || !activeRepo || !state.activeSession) return;
    setExecuting(true);
    setError('');

    try {
      const { data: rawRun } = await supabase
        .from('execution_runs')
        .insert({
          session_id: state.activeSession.id,
          user_id: user.id,
          synthesis_id: latestSynthesis?.id ?? null,
          repo_connection_id: activeRepo.id,
          execution_mode: state.executionMode,
          status: 'approved',
          strategy,
          patch_content: latestSynthesis?.content ?? latestResponses.map(r => r.content).join('\n\n---\n\n'),
          requires_approval: state.executionMode !== 'analyze',
        } as never)
        .select()
        .maybeSingle();

      const run = rawRun as ExecutionRun | null;
      if (!run) throw new Error('Failed to create execution run');

      dispatch({ type: 'ADD_EXECUTION_RUN', payload: run });

      const patches = latestResponses.map(r => ({
        agent_name: r.agent_name,
        agent_id: r.agent_id ?? '',
        content: r.content,
        scoped_paths: state.agents.find(a => a.id === r.agent_id)?.scoped_paths ?? [],
        commit_message: r.title || `${r.agent_name} contribution`,
        conductor_approved: conductorOverride,
      }));

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const res = await fetch(`${supabaseUrl}/functions/v1/github-execute`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          mode: strategy,
          repo_connection_id: activeRepo.id,
          execution_run_id: run.id,
          patches,
          conductor_approved: conductorOverride,
          synthesis_content: latestSynthesis?.content,
          commit_message: `[Maestro] Round ${latestRound?.round_number ?? 0} — ${strategy === 'per_agent' ? 'Society of Mind' : 'Synthesized'}`,
        }),
      });

      const result = await res.json();

      if (!res.ok) throw new Error(result.error || 'Execution failed');

      const updatedRun = { ...run, status: 'complete' as const, result: result.result, pr_url: result.result?.prs?.[0] ?? '' };
      dispatch({ type: 'UPDATE_EXECUTION_RUN', payload: { id: run.id, ...updatedRun } });
      setCompletedRun(updatedRun);

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Execution failed');
    }
    setExecuting(false);
  };

  const prUrls = completedRun?.result?.prs as string[] | undefined;

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, background: 'rgba(2,3,5,0.7)', zIndex: 70, transition: 'opacity 0.3s ease' }}
        onClick={handleClose}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(780px, calc(100vw - 40px))',
          maxHeight: '85vh',
          zIndex: 71,
          borderRadius: '30px',
          padding: '28px',
          background: 'linear-gradient(180deg, rgba(16,18,24,0.96), rgba(10,12,17,0.96))',
          backdropFilter: 'blur(34px) saturate(120%)',
          WebkitBackdropFilter: 'blur(34px) saturate(120%)',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 30px 90px rgba(0,0,0,0.46)',
          color: 'var(--text)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
          animation: 'fade-in 0.3s ease',
          overflow: 'auto',
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="reveal-label" style={{ marginBottom: '4px' }}>Execution</div>
            <h3
              className="font-syne"
              style={{ margin: 0, fontSize: '22px', fontWeight: 400, letterSpacing: '-0.03em', color: 'var(--text)' }}
            >
              {completedRun ? 'Execution complete' : 'Prepare and approve'}
            </h3>
          </div>
          <button className="keycap" onClick={handleClose}>
            <X size={12} />
          </button>
        </div>

        {!completedRun && (
          <>
            <div className="flex gap-2">
              <StrategyButton
                active={strategy === 'per_agent'}
                icon={<GitBranch size={13} />}
                label="Per-Agent Branches"
                desc="Each agent gets its own branch and PR"
                onClick={() => dispatch({ type: 'SET_EXECUTION_STRATEGY', payload: 'per_agent' })}
              />
              <StrategyButton
                active={strategy === 'synthesized'}
                icon={<GitMerge size={13} />}
                label="Synthesized PR"
                desc="One combined branch and PR from synthesis"
                onClick={() => dispatch({ type: 'SET_EXECUTION_STRATEGY', payload: 'synthesized' })}
              />
            </div>

            {!activeRepo && (
              <div
                className="rounded-xl p-3"
                style={{ background: 'rgba(224,169,74,0.06)', border: '1px solid rgba(224,169,74,0.18)' }}
              >
                <div className="flex items-center gap-2" style={{ color: 'var(--warn)', fontSize: '13px' }}>
                  <AlertTriangle size={13} />
                  No repository connected. Open the Vault (V) and connect GitHub first.
                </div>
              </div>
            )}

            {activeRepo && (
              <div
                className="rounded-xl p-3"
                style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
              >
                <div className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' as const, marginBottom: '6px' }}>
                  Target
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text)' }}>
                  {activeRepo.owner}/{activeRepo.repo} ({activeRepo.default_branch})
                </div>
              </div>
            )}

            {strategy === 'per_agent' && (
              <div className="flex flex-col gap-2">
                <div className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>
                  Agent branches ({latestResponses.length})
                </div>
                {latestResponses.map(r => {
                  const agent = state.agents.find(a => a.id === r.agent_id);
                  return (
                    <div
                      key={r.id}
                      className="flex items-center gap-3"
                      style={{
                        padding: '10px 14px',
                        borderRadius: '14px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                      }}
                    >
                      <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: r.agent_color, boxShadow: `0 0 8px ${r.agent_color}55`, flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 500 }}>{r.agent_name}</div>
                        <div className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.title || 'Untitled'}
                        </div>
                      </div>
                      {agent?.scoped_paths && agent.scoped_paths.length > 0 && (
                        <span className="reveal-chip" style={{ fontSize: '9px', height: '20px', padding: '0 6px' }}>
                          {agent.scoped_paths.length} path{agent.scoped_paths.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {unscopedAgents.length > 0 && (
              <div
                className="rounded-xl p-3"
                style={{ background: 'rgba(224,169,74,0.06)', border: '1px solid rgba(224,169,74,0.18)' }}
              >
                <div className="flex items-center gap-2 mb-2" style={{ color: 'var(--warn)', fontSize: '13px' }}>
                  <AlertTriangle size={13} />
                  {unscopedAgents.length} agent{unscopedAgents.length !== 1 ? 's' : ''} ha{unscopedAgents.length !== 1 ? 've' : 's'} no scoped paths — writes will be blocked without conductor approval
                </div>
                <div className="flex flex-col gap-1 mb-3" style={{ paddingLeft: '21px' }}>
                  {unscopedAgents.map(r => (
                    <div key={r.id} className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--warn)', letterSpacing: '0.08em' }}>
                      {r.agent_name}
                    </div>
                  ))}
                </div>
                <label className="flex items-center gap-2 cursor-pointer" style={{ paddingLeft: '21px' }}>
                  <input
                    type="checkbox"
                    checked={conductorOverride}
                    onChange={e => setConductorOverride(e.target.checked)}
                    style={{ accentColor: 'var(--gold)', width: '14px', height: '14px' }}
                  />
                  <span className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>
                    Conductor override — allow all agents to write
                  </span>
                </label>
              </div>
            )}

            {strategy === 'synthesized' && latestSynthesis && (
              <div
                className="reveal-codeblock"
                style={{ maxHeight: '200px', overflow: 'auto', fontSize: '12px' }}
              >
                {latestSynthesis.content}
              </div>
            )}

            {error && (
              <div
                className="rounded-xl p-3"
                style={{ background: 'rgba(224,90,90,0.06)', border: '1px solid rgba(224,90,90,0.2)', color: 'var(--risk)', fontSize: '13px' }}
              >
                {error}
              </div>
            )}

            {needsConfirm && (
              <div className="flex flex-col gap-2">
                <div className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--risk)', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>
                  Elevated mode -- Type EXECUTE to confirm
                </div>
                <input
                  type="text"
                  value={confirmText}
                  onChange={e => setConfirmText(e.target.value)}
                  placeholder="EXECUTE"
                  style={{
                    height: '36px',
                    padding: '0 12px',
                    borderRadius: '12px',
                    border: '1px solid rgba(224,90,90,0.2)',
                    background: 'rgba(224,90,90,0.04)',
                    color: 'var(--text)',
                    fontSize: '14px',
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                    letterSpacing: '0.1em',
                    outline: 'none',
                    width: '200px',
                  }}
                />
              </div>
            )}

            <div className="flex items-center gap-3">
              <button
                className="reveal-pill primary"
                style={{ height: '40px', fontSize: '13px', opacity: canExecute ? 1 : 0.4, pointerEvents: canExecute ? 'auto' : 'none' }}
                onClick={handleExecute}
                disabled={executing || !canExecute}
              >
                {executing ? <Loader2 size={14} className="animate-spin" /> : <GitBranch size={14} />}
                {executing ? 'Executing...' : 'Approve and Execute'}
              </button>
              <button className="reveal-pill" style={{ height: '40px', fontSize: '13px' }} onClick={handleClose}>
                Cancel
              </button>
            </div>
          </>
        )}

        {completedRun && prUrls && prUrls.length > 0 && (
          <div className="flex flex-col gap-3">
            <div
              className="rounded-xl p-4"
              style={{ background: 'rgba(78,187,127,0.06)', border: '1px solid rgba(78,187,127,0.2)' }}
            >
              <div className="flex items-center gap-2 mb-3">
                <Check size={14} style={{ color: 'var(--ok)' }} />
                <span style={{ color: 'var(--ok)', fontWeight: 500, fontSize: '14px' }}>
                  {prUrls.length} pull request{prUrls.length !== 1 ? 's' : ''} created
                </span>
              </div>
              <div className="flex flex-col gap-2">
                {prUrls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2"
                    style={{
                      padding: '8px 12px',
                      borderRadius: '10px',
                      background: 'rgba(78,187,127,0.06)',
                      border: '1px solid rgba(78,187,127,0.12)',
                      color: 'var(--ok)',
                      fontSize: '12px',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                      textDecoration: 'none',
                      transition: 'background 0.2s ease',
                    }}
                  >
                    <ExternalLink size={11} />
                    {url}
                  </a>
                ))}
              </div>
            </div>
            <button className="reveal-pill" style={{ height: '36px', fontSize: '12px', alignSelf: 'flex-start' }} onClick={handleClose}>
              Close
            </button>
          </div>
        )}

        <div className="flex items-center gap-3">
          <div className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            {state.executionMode.toUpperCase()} MODE
          </div>
          <div style={{ width: '1px', height: '12px', background: 'rgba(255,255,255,0.08)' }} />
          <div className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            {strategy === 'per_agent' ? 'SOCIETY OF MIND' : 'SYNTHESIZED'}
          </div>
          <div style={{ flex: 1 }} />
          <div className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            ESC to close
          </div>
        </div>
      </div>
    </>
  );
}

function StrategyButton({ active, icon, label, desc, onClick }: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 16px',
        borderRadius: '18px',
        border: active ? '1px solid rgba(201,168,76,0.3)' : '1px solid rgba(255,255,255,0.05)',
        background: active ? 'rgba(201,168,76,0.06)' : 'rgba(255,255,255,0.02)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.2s ease',
        color: active ? 'var(--text)' : 'var(--text-muted)',
      }}
    >
      <div style={{ color: active ? 'var(--gold)' : 'var(--text-dim)' }}>{icon}</div>
      <div>
        <div style={{ fontSize: '13px', fontWeight: 500 }}>{label}</div>
        <div className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '2px' }}>{desc}</div>
      </div>
    </button>
  );
}
