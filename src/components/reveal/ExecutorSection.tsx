import { useState, useCallback, useEffect } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { useAuth } from '../../context/AuthContext';
import { invokeEdgeFunction } from '../../lib/functions';
import { supabase } from '../../lib/supabase';
import { isSharedExecutor, markSharedExecutors } from '../../lib/sessionBuild';
import {
  DEFAULT_EXECUTOR_SHARE_JOB_TYPES,
  EXECUTOR_SHARE_JOB_TYPES,
  type Executor,
  type ExecutorGrant,
  type ExecutorGrantsResponse,
  type ExecutorJob,
} from '../../types';
import { Plus, RefreshCw, Copy, Check, Cpu, Loader2, Trash2, Share2, Users } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  online: '#4ade80',
  busy: '#facc15',
  offline: '#6b7280',
  error: '#ef4444',
};

const JOB_STATUS_COLORS: Record<string, string> = {
  queued: '#6b7280',
  approved: '#60a5fa',
  claimed: '#a78bfa',
  running: '#facc15',
  succeeded: '#4ade80',
  failed: '#ef4444',
  cancelled: '#6b7280',
  expired: '#6b7280',
};

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'never';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function ExecutorSection() {
  const { state, dispatch } = useMaestro();
  const { user } = useAuth();

  const [registering, setRegistering] = useState(false);
  const [newName, setNewName] = useState('');
  const [showRegister, setShowRegister] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [showSubmit, setShowSubmit] = useState(false);
  const [jobPrompt, setJobPrompt] = useState('');
  const [jobAdapter, setJobAdapter] = useState('claude_code');
  const [submitting, setSubmitting] = useState(false);
  const [rotatingExecutorId, setRotatingExecutorId] = useState<string | null>(null);
  const [tokenMessage, setTokenMessage] = useState('Save this token — it\'s shown only once');

  // Sharing (executor_grants): grants this user has GIVEN, keyed by executor below.
  const [givenGrants, setGivenGrants] = useState<ExecutorGrant[]>([]);
  const [shareExecutorId, setShareExecutorId] = useState<string | null>(null);
  const [shareEmail, setShareEmail] = useState('');
  const [shareJobTypes, setShareJobTypes] = useState<string[]>([...DEFAULT_EXECUTOR_SHARE_JOB_TYPES]);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState('');
  const [shareNotice, setShareNotice] = useState('');
  const [revokingGrantId, setRevokingGrantId] = useState<string | null>(null);

  const executors = state.executors;
  const jobs = state.executorJobs;

  // Grants are served by executor-api; a missing/undeployed action must not break the panel.
  const loadGrants = useCallback(async () => {
    if (!user) return;
    try {
      const data = await invokeEdgeFunction<ExecutorGrantsResponse>('executor-api?action=grants');
      setGivenGrants(Array.isArray(data?.given) ? data.given.filter((grant) => !grant.revoked_at) : []);
    } catch {
      setGivenGrants([]);
    }
  }, [user]);

  useEffect(() => { void loadGrants(); }, [loadGrants]);

  const refresh = useCallback(async () => {
    if (!user) return;
    setRefreshing(true);
    try {
      // No owner filter on executors: RLS returns owned rows plus those shared via executor_grants.
      const [{ data: exData }, { data: jobData }] = await Promise.all([
        supabase.from('executors').select('*').order('created_at', { ascending: false }),
        supabase.from('executor_jobs').select('*').eq('requested_by', user.id).order('created_at', { ascending: false }).limit(20),
      ]);
      dispatch({ type: 'SET_EXECUTORS', payload: markSharedExecutors((exData ?? []) as Executor[], user.id) });
      dispatch({ type: 'SET_EXECUTOR_JOBS', payload: (jobData ?? []) as ExecutorJob[] });
      await loadGrants();
    } finally {
      setRefreshing(false);
    }
  }, [user, dispatch, loadGrants]);

  const openShare = (executorId: string) => {
    setShareExecutorId((current) => (current === executorId ? null : executorId));
    setShareEmail('');
    setShareJobTypes([...DEFAULT_EXECUTOR_SHARE_JOB_TYPES]);
    setShareError('');
    setShareNotice('');
  };

  const toggleShareJobType = (jobType: string) => {
    setShareJobTypes((current) => (
      current.includes(jobType) ? current.filter((entry) => entry !== jobType) : [...current, jobType]
    ));
  };

  const handleShare = async (executor: Executor) => {
    const email = shareEmail.trim();
    if (!email || shareJobTypes.length === 0) return;
    setSharing(true);
    setShareError('');
    setShareNotice('');
    try {
      await invokeEdgeFunction<{ grant: ExecutorGrant }>(
        'executor-api?action=share',
        { executor_id: executor.id, email, job_types: shareJobTypes, label: email },
      );
      setShareNotice(`Shared ${executor.name} with ${email}.`);
      setShareEmail('');
      await loadGrants();
    } catch (err) {
      // The 404 "No Maestro account with that email yet…" message is shown verbatim.
      setShareError(err instanceof Error ? err.message : 'Share failed');
    } finally {
      setSharing(false);
    }
  };

  const handleRevoke = async (grant: ExecutorGrant) => {
    setRevokingGrantId(grant.id);
    setShareError('');
    try {
      await invokeEdgeFunction('executor-api?action=unshare', {
        executor_id: grant.executor_id,
        grantee_user_id: grant.grantee_user_id,
      });
      setGivenGrants((current) => current.filter((entry) => entry.id !== grant.id));
    } catch (err) {
      setShareError(err instanceof Error ? err.message : 'Revoke failed');
    } finally {
      setRevokingGrantId(null);
    }
  };

  const handleRegister = async () => {
    if (!newName.trim()) return;
    setRegistering(true);
    setError('');
    setNewToken(null);
    setCopied(false);
    setTokenMessage('Save this token — it\'s shown only once');
    try {
      const data = await invokeEdgeFunction<{ executor: Executor; token: string }>(
        'executor-api?action=register',
        { name: newName.trim() }
      );
      dispatch({ type: 'ADD_EXECUTOR', payload: data.executor });
      setNewToken(data.token);
      setNewName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    } finally {
      setRegistering(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!user) return;
    await supabase.from('executors').delete().eq('id', id).eq('owner_user_id', user.id);
    dispatch({ type: 'SET_EXECUTORS', payload: executors.filter(e => e.id !== id) });
  };

  const handleRotate = async (executor: Executor) => {
    setRotatingExecutorId(executor.id);
    setError('');
    setNewToken(null);
    setCopied(false);
    try {
      const data = await invokeEdgeFunction<{ executor: Executor; token: string }>(
        'executor-api?action=rotate',
        { executor_id: executor.id },
      );
      dispatch({
        type: 'SET_EXECUTORS',
        payload: executors.map((entry) => (entry.id === executor.id ? data.executor : entry)),
      });
      setTokenMessage(`Token rotated for ${executor.name}. Restart that executor with this new token.`);
      setNewToken(data.token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Token rotation failed');
    } finally {
      setRotatingExecutorId(null);
    }
  };

  const handleSubmitJob = async () => {
    if (!jobPrompt.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const data = await invokeEdgeFunction<{ job: ExecutorJob }>(
        'executor-api?action=submit',
        { prompt: jobPrompt.trim(), adapter: jobAdapter }
      );
      dispatch({ type: 'SET_EXECUTOR_JOBS', payload: [data.job, ...jobs] });
      setJobPrompt('');
      setShowSubmit(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed');
    } finally {
      setSubmitting(false);
    }
  };

  const copyToken = () => {
    if (!newToken) return;
    navigator.clipboard.writeText(newToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ marginBottom: '16px' }}>
      <div className="flex items-center justify-between mb-3">
        <div className="reveal-label" style={{ marginBottom: 0 }}>
          <Cpu size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: '-2px' }} />
          Local Executors
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={refresh}
            className="reveal-pill"
            style={{ padding: '4px 8px', fontSize: '11px' }}
            disabled={refreshing}
          >
            <RefreshCw size={12} className={refreshing ? 'animate-spin' : ''} />
          </button>
          <button
            onClick={() => { setShowRegister(!showRegister); setNewToken(null); setError(''); setShowSubmit(false); }}
            className="reveal-pill primary"
            style={{ padding: '4px 10px', fontSize: '11px' }}
          >
            <Plus size={12} style={{ marginRight: '4px' }} />
            Register
          </button>
          {executors.length > 0 && (
            <button
              onClick={() => { setShowSubmit(!showSubmit); setShowRegister(false); setError(''); }}
              className="reveal-pill"
              style={{ padding: '4px 10px', fontSize: '11px', background: 'rgba(212,175,55,0.15)', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.3)' }}
            >
              Submit Job
            </button>
          )}
        </div>
      </div>

      {newToken && (
        <div
          className="rounded-lg p-3 mb-3"
          style={{ background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.25)' }}
        >
          <div style={{ fontSize: '12px', color: 'var(--gold)', fontWeight: 600, marginBottom: '6px' }}>
            {tokenMessage}
          </div>
          <div className="flex items-center gap-2">
            <code
              style={{
                flex: 1,
                fontSize: '11px',
                background: 'rgba(0,0,0,0.3)',
                padding: '6px 8px',
                borderRadius: '6px',
                color: 'rgba(255,255,255,0.8)',
                wordBreak: 'break-all',
                userSelect: 'all',
              }}
            >
              {newToken}
            </code>
            <button onClick={copyToken} className="reveal-pill" style={{ padding: '4px 8px' }}>
              {copied ? <Check size={14} style={{ color: '#4ade80' }} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      )}

      {/* Registration form */}
      {showRegister && (
        <div
          className="rounded-xl p-3 mb-3"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
        >
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>
            Register a new local executor (your laptop, dev server, etc.)
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Executor name (e.g. my-laptop)"
              onKeyDown={e => e.key === 'Enter' && handleRegister()}
              style={{
                flex: 1,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '6px 10px',
                color: 'white',
                fontSize: '13px',
                outline: 'none',
              }}
            />
            <button
              onClick={handleRegister}
              disabled={registering || !newName.trim()}
              className="reveal-pill primary"
              style={{ padding: '6px 14px', fontSize: '12px' }}
            >
              {registering ? <Loader2 size={14} className="animate-spin" /> : 'Create'}
            </button>
          </div>

          {error && (
            <div style={{ color: 'var(--risk)', fontSize: '12px', marginTop: '6px' }}>{error}</div>
          )}

        </div>
      )}

      {/* Submit job form */}
      {showSubmit && (
        <div
          className="rounded-xl p-3 mb-3"
          style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.15)' }}
        >
          <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>
            Submit a job to your local executor
          </div>
          <textarea
            value={jobPrompt}
            onChange={e => setJobPrompt(e.target.value)}
            placeholder="Enter a prompt (e.g. Create an index.html with a landing page...)"
            rows={3}
            style={{
              width: '100%',
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '8px',
              padding: '8px 10px',
              color: 'white',
              fontSize: '13px',
              outline: 'none',
              resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />
          <div className="flex items-center justify-between mt-2">
            <select
              value={jobAdapter}
              onChange={e => setJobAdapter(e.target.value)}
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '4px 8px',
                color: 'white',
                fontSize: '12px',
                outline: 'none',
              }}
            >
              <option value="claude_code">Claude Code</option>
              <option value="copilot_cli">Copilot CLI</option>
              <option value="codex_cli">Codex CLI</option>
              <option value="gemini_cli">Gemini CLI</option>
              <option value="kimi_cli">Kimi CLI</option>
              <option value="agy_cli">Antigravity (agy)</option>
              <option value="shell_stub">Shell Stub (test)</option>
            </select>
            <button
              onClick={handleSubmitJob}
              disabled={submitting || !jobPrompt.trim()}
              className="reveal-pill primary"
              style={{ padding: '6px 14px', fontSize: '12px' }}
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : 'Send to Executor'}
            </button>
          </div>
          {error && (
            <div style={{ color: 'var(--risk)', fontSize: '12px', marginTop: '6px' }}>{error}</div>
          )}
        </div>
      )}

      {/* Executor list */}
      {executors.length === 0 ? (
        <div
          className="rounded-xl p-4 text-center"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.35)', fontSize: '13px' }}
        >
          No executors registered. Click Register to add one.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {executors.map(ex => {
            const shared = isSharedExecutor(ex, user?.id);
            const exGrants = givenGrants.filter((grant) => grant.executor_id === ex.id);
            const shareOpen = shareExecutorId === ex.id;
            return (
              <div
                key={ex.id}
                className="rounded-xl p-3"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: STATUS_COLORS[ex.status] ?? '#6b7280',
                        boxShadow: ex.status === 'online' ? '0 0 6px rgba(74,222,128,0.5)' : 'none',
                      }}
                    />
                    <div>
                      <div className="flex items-center gap-2" style={{ fontSize: '13px', color: 'white', fontWeight: 500 }}>
                        {ex.name}
                        {shared && (
                          <span
                            className="reveal-chip"
                            title="This MaestroClaw belongs to another Maestro account and is shared with you."
                            style={{ fontSize: '10px', padding: '1px 6px', background: 'rgba(212,175,55,0.12)', color: 'var(--gold)', border: '1px solid rgba(212,175,55,0.3)' }}
                          >
                            <Users size={10} style={{ marginRight: '3px' }} />
                            Shared by owner
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
                        {ex.status} · seen {timeAgo(ex.last_seen_at)}
                      </div>
                    </div>
                  </div>
                  {/* Token / rotate / delete / share are owner-only; a grantee just sees the badge. */}
                  {!shared && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openShare(ex.id)}
                        className="reveal-pill"
                        style={{ padding: '4px 6px', opacity: shareOpen ? 1 : 0.75, color: shareOpen ? 'var(--gold)' : undefined }}
                        title="Share with another Maestro account"
                      >
                        <Share2 size={12} />
                      </button>
                      <button
                        onClick={() => handleRotate(ex)}
                        className="reveal-pill"
                        style={{ padding: '4px 6px', opacity: 0.75 }}
                        title="Rotate token"
                        disabled={rotatingExecutorId === ex.id}
                      >
                        <RefreshCw size={12} className={rotatingExecutorId === ex.id ? 'animate-spin' : ''} />
                      </button>
                      <button
                        onClick={() => handleDelete(ex.id)}
                        className="reveal-pill"
                        style={{ padding: '4px 6px', opacity: 0.5 }}
                        title="Remove executor"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Share with… (owner only) */}
                {!shared && shareOpen && (
                  <div
                    className="rounded-lg p-3 mt-3"
                    style={{ background: 'rgba(212,175,55,0.04)', border: '1px solid rgba(212,175,55,0.15)' }}
                  >
                    <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)', marginBottom: '8px' }}>
                      Share with… another Maestro account. Their jobs run on this executor with your signed-in CLI subscriptions.
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="email"
                        value={shareEmail}
                        onChange={e => setShareEmail(e.target.value)}
                        placeholder="partner@example.com"
                        onKeyDown={e => e.key === 'Enter' && handleShare(ex)}
                        style={{
                          flex: 1,
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '8px',
                          padding: '6px 10px',
                          color: 'white',
                          fontSize: '13px',
                          outline: 'none',
                        }}
                      />
                      <button
                        onClick={() => handleShare(ex)}
                        disabled={sharing || !shareEmail.trim() || shareJobTypes.length === 0}
                        className="reveal-pill primary"
                        style={{ padding: '6px 14px', fontSize: '12px' }}
                      >
                        {sharing ? <Loader2 size={14} className="animate-spin" /> : 'Share'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-2">
                      {EXECUTOR_SHARE_JOB_TYPES.map((jobType) => (
                        <label
                          key={jobType}
                          className="flex items-center gap-1"
                          style={{ fontSize: '11px', color: 'rgba(255,255,255,0.65)', cursor: 'pointer' }}
                        >
                          <input
                            type="checkbox"
                            checked={shareJobTypes.includes(jobType)}
                            onChange={() => toggleShareJobType(jobType)}
                          />
                          {jobType}
                        </label>
                      ))}
                    </div>
                    {shareError && (
                      <div style={{ color: 'var(--risk)', fontSize: '12px', marginTop: '6px' }}>{shareError}</div>
                    )}
                    {shareNotice && (
                      <div style={{ color: '#4ade80', fontSize: '12px', marginTop: '6px' }}>{shareNotice}</div>
                    )}
                  </div>
                )}

                {/* Current grants on this executor (owner only) */}
                {!shared && exGrants.length > 0 && (
                  <div className="flex flex-col gap-1 mt-2">
                    {exGrants.map((grant) => (
                      <div
                        key={grant.id}
                        className="rounded-lg px-3 py-2 flex items-center justify-between"
                        style={{ background: 'rgba(255,255,255,0.02)', fontSize: '12px' }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                            {grant.label || grant.grantee_user_id.slice(0, 8)}
                          </span>
                          <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', marginLeft: '8px' }}>
                            {grant.job_types.join(', ')}
                          </span>
                        </div>
                        <button
                          onClick={() => handleRevoke(grant)}
                          className="reveal-pill"
                          style={{ padding: '2px 8px', fontSize: '11px', opacity: 0.75, flexShrink: 0, marginLeft: '8px' }}
                          title="Revoke access"
                          disabled={revokingGrantId === grant.id}
                        >
                          {revokingGrantId === grant.id ? <Loader2 size={12} className="animate-spin" /> : 'Revoke'}
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Recent jobs */}
      {jobs.length > 0 && (
        <div style={{ marginTop: '12px' }}>
          <div className="reveal-label mb-2" style={{ fontSize: '11px' }}>Recent Jobs</div>
          <div className="flex flex-col gap-1">
            {jobs.slice(0, 8).map(job => (
              <div
                key={job.id}
                className="rounded-lg px-3 py-2 flex items-center justify-between"
                style={{ background: 'rgba(255,255,255,0.02)', fontSize: '12px' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}>
                    {job.prompt.slice(0, 50)}{job.prompt.length > 50 ? '…' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-2" style={{ flexShrink: 0, marginLeft: '8px' }}>
                  <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)' }}>
                    {job.adapter}
                  </span>
                  <span
                    className="reveal-chip"
                    style={{
                      fontSize: '10px',
                      padding: '1px 6px',
                      background: `${JOB_STATUS_COLORS[job.status] ?? '#6b7280'}22`,
                      color: JOB_STATUS_COLORS[job.status] ?? '#6b7280',
                      border: `1px solid ${JOB_STATUS_COLORS[job.status] ?? '#6b7280'}44`,
                    }}
                  >
                    {job.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
