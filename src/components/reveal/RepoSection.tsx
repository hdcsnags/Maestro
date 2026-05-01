import { useState, useEffect } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { useAuth } from '../../context/AuthContext';
import { invokeEdgeFunction } from '../../lib/functions';
import { RepoConnection } from '../../types';
import { supabase } from '../../lib/supabase';
import { Github, Check, Loader2, ExternalLink, X, Plus } from 'lucide-react';

interface GHRepo {
  full_name: string;
  owner: string;
  name: string;
  default_branch: string;
  private: boolean;
  description: string;
}

interface GitHubAuthStatus {
  connected?: boolean;
  hint?: string | null;
}

interface GitHubAuthUrlResponse {
  auth_url?: string;
}

interface GitHubExchangeResponse {
  success?: boolean;
  github_user?: string;
  connection?: unknown;
  error?: string;
}

interface GitHubReposResponse {
  repos?: GHRepo[];
}

interface GitHubCreateRepoResponse {
  repo?: GHRepo;
}

export default function RepoSection() {
  const { state, dispatch } = useMaestro();
  const { user } = useAuth();

  const [ghConnected, setGhConnected] = useState(false);
  const [ghUser, setGhUser] = useState('');
  const [checking, setChecking] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [repos, setRepos] = useState<GHRepo[]>([]);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [selectedRepo, setSelectedRepo] = useState('');
  const [saving, setSaving] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [error, setError] = useState('');
  const [repoSearch, setRepoSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(true);
  const [creatingRepo, setCreatingRepo] = useState(false);

  const sessionBoundRepo = state.activeSession?.github_repo?.trim() ?? '';
  const activeRepo = sessionBoundRepo
    ? state.repoConnections.find(connection => `${connection.owner}/${connection.repo}` === sessionBoundRepo) ?? null
    : state.activeRepoConnection;

  useEffect(() => {
    (async () => {
      setChecking(true);
      try {
        const data = await invokeEdgeFunction<GitHubAuthStatus>('github-auth?action=check_status');
        setGhConnected(!!data.connected);
        if (data.hint) setGhUser(data.hint.replace('github:', ''));
      } catch {
        // Ignore boot-time auth probe errors.
      }
      setChecking(false);
    })();
  }, []);

  const syncActiveSessionRepo = async (repoFullName: string) => {
    if (!state.activeSession) return;

    await supabase
      .from('sessions')
      .update({ github_repo: repoFullName } as never)
      .eq('id', state.activeSession.id);

    dispatch({ type: 'UPDATE_ACTIVE_SESSION', payload: { github_repo: repoFullName } });
    dispatch({
      type: 'SET_SESSIONS',
      payload: state.sessions.map(session =>
        session.id === state.activeSession?.id ? { ...session, github_repo: repoFullName } : session,
      ),
    });
  };

  const persistActiveRepoConnection = async (repo: Pick<GHRepo, 'owner' | 'name' | 'default_branch'>) => {
    if (!user || !state.workspace) return null;

    await supabase
      .from('repo_connections')
      .update({ is_active: false } as never)
      .eq('workspace_id', state.workspace.id)
      .eq('user_id', user.id);

    const existing = state.repoConnections.find(connection =>
      connection.owner === repo.owner && connection.repo === repo.name,
    );

    let conn: RepoConnection | null = null;

    if (existing) {
      const { data: rawUpdated, error: updateError } = await supabase
        .from('repo_connections')
        .update({
          default_branch: repo.default_branch,
          is_active: true,
        } as never)
        .eq('id', existing.id)
        .select()
        .maybeSingle();

      if (updateError) throw new Error(updateError.message);
      conn = rawUpdated as RepoConnection | null;
    } else {
      const { data: rawCreated, error: insertError } = await supabase
        .from('repo_connections')
        .insert({
          workspace_id: state.workspace.id,
          user_id: user.id,
          provider: 'github',
          owner: repo.owner,
          repo: repo.name,
          default_branch: repo.default_branch,
          scoped_paths: [],
          is_active: true,
        } as never)
        .select()
        .maybeSingle();

      if (insertError) throw new Error(insertError.message);
      conn = rawCreated as RepoConnection | null;
    }

    if (!conn) return null;

    const nextConnections = [
      ...state.repoConnections
        .filter(connection => connection.id !== conn.id)
        .map(connection => ({ ...connection, is_active: false })),
      conn,
    ];

    dispatch({ type: 'SET_REPO_CONNECTIONS', payload: nextConnections });
    dispatch({ type: 'SET_ACTIVE_REPO_CONNECTION', payload: conn });
    await syncActiveSessionRepo(`${conn.owner}/${conn.repo}`);
    return conn;
  };

  const handleConnect = async () => {
    setConnecting(true);
    setError('');
    try {
      const data = await invokeEdgeFunction<GitHubAuthUrlResponse>('github-auth?action=get_auth_url');

      if (!data.auth_url) {
        setError('GitHub App not configured');
        setConnecting(false);
        return;
      }

      const width = 600;
      const height = 700;
      const left = window.screenX + (window.innerWidth - width) / 2;
      const top = window.screenY + (window.innerHeight - height) / 2;
      const popup = window.open(
        data.auth_url,
        'github-auth',
        `width=${width},height=${height},left=${left},top=${top}`,
      );

      const interval = setInterval(async () => {
        try {
          if (!popup || popup.closed) {
            clearInterval(interval);
            const statusData = await invokeEdgeFunction<GitHubAuthStatus>('github-auth?action=check_status');
            setGhConnected(!!statusData.connected);
            if (statusData.hint) setGhUser(statusData.hint.replace('github:', ''));
            setConnecting(false);
            return;
          }

          const currentUrl = popup.location?.href;
          if (currentUrl && currentUrl.includes('code=')) {
            const urlParams = new URL(currentUrl).searchParams;
            const code = urlParams.get('code');
            const returnedState = urlParams.get('state');
            popup.close();
            clearInterval(interval);

            if (code && returnedState) {
              const exchangeData = await invokeEdgeFunction<GitHubExchangeResponse>(
                'github-auth?action=exchange_code',
                { code, state: returnedState },
              );

              if (exchangeData.success) {
                setGhConnected(true);
                setGhUser(exchangeData.github_user ?? '');
                if (exchangeData.connection) {
                  dispatch({ type: 'UPSERT_PROVIDER_CONNECTION', payload: exchangeData.connection as (typeof state.providerConnections)[number] });
                }
              } else {
                setError(exchangeData.error || 'Failed to connect');
              }
            } else {
              setError('GitHub OAuth callback was missing state');
            }
            setConnecting(false);
          }
        } catch {
          // Cross-origin during OAuth popup travel is expected; keep polling.
        }
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed');
      setConnecting(false);
    }
  };

  const handleLoadRepos = async () => {
    setLoadingRepos(true);
    setError('');
    try {
      const data = await invokeEdgeFunction<GitHubReposResponse>('github-repos');
      setRepos(data.repos || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repos');
    }
    setLoadingRepos(false);
  };

  const handleSaveRepo = async () => {
    if (!user || !state.workspace || !state.activeSession || !selectedRepo) return;
    setSaving(true);
    setError('');

    const repo = repos.find(r => r.full_name === selectedRepo);
    if (!repo) {
      setSaving(false);
      return;
    }

    try {
      await persistActiveRepoConnection(repo);
      setSelectedRepo('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
    setSaving(false);
  };

  const handleCreateRepo = async () => {
    if (!user || !state.workspace || !state.activeSession || !newRepoName.trim()) return;
    setCreatingRepo(true);
    setError('');
    try {
      const data = await invokeEdgeFunction<GitHubCreateRepoResponse>('github-create-repo', {
        name: newRepoName.trim(),
        private: newRepoPrivate,
      });

      if (!data.repo) {
        setError('Failed to create repo');
        setCreatingRepo(false);
        return;
      }

      await persistActiveRepoConnection(data.repo);
      setNewRepoName('');
      setShowCreate(false);
      setSelectedRepo('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create repo');
    }
    setCreatingRepo(false);
  };

  const handleAddRepoPath = async (path: string) => {
    if (!activeRepo || !path.trim()) return;
    const paths = [...(activeRepo.scoped_paths || []), path.trim()];
    await supabase
      .from('repo_connections')
      .update({ scoped_paths: paths } as never)
      .eq('id', activeRepo.id);
    dispatch({ type: 'UPSERT_REPO_CONNECTION', payload: { ...activeRepo, scoped_paths: paths } });
    setNewPath('');
  };

  const handleRemoveRepoPath = async (path: string) => {
    if (!activeRepo) return;
    const paths = (activeRepo.scoped_paths || []).filter(p => p !== path);
    await supabase
      .from('repo_connections')
      .update({ scoped_paths: paths } as never)
      .eq('id', activeRepo.id);
    dispatch({ type: 'UPSERT_REPO_CONNECTION', payload: { ...activeRepo, scoped_paths: paths } });
  };

  return (
    <div className="reveal-card" style={{ marginBottom: '16px' }}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2.5">
          <Github size={14} style={{ color: 'var(--text)' }} />
          <strong style={{ color: 'var(--text)', fontWeight: 500, fontSize: '14px' }}>
            GitHub
          </strong>
        </div>
        {checking ? (
          <Loader2 size={12} className="animate-spin" style={{ color: 'var(--text-dim)' }} />
        ) : ghConnected ? (
          <span
            className="reveal-chip"
            style={{ color: 'var(--ok)', borderColor: 'rgba(78,187,127,0.25)', background: 'rgba(78,187,127,0.06)', fontSize: '10px', height: '24px', padding: '0 8px' }}
          >
            <Check size={10} /> {ghUser}
          </span>
        ) : null}
      </div>

      {error && (
        <div style={{ color: 'var(--risk)', fontSize: '12px', marginBottom: '8px' }}>{error}</div>
      )}

      {!ghConnected && !checking && (
        <div>
          <div className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '8px' }}>
            Fine-grained permissions: contents, pull requests, metadata
          </div>
          <button
            className="reveal-pill"
            style={{ height: '32px', fontSize: '12px' }}
            onClick={handleConnect}
            disabled={connecting}
          >
            {connecting ? <Loader2 size={12} className="animate-spin" /> : <Github size={12} />}
            {connecting ? 'Connecting...' : 'Connect GitHub'}
          </button>
        </div>
      )}

      {ghConnected && !activeRepo && (
        <div className="flex flex-col gap-2 mt-2">
          {repos.length === 0 && !showCreate ? (
            <div className="flex items-center gap-2">
              <button
                className="reveal-pill"
                style={{ height: '30px', fontSize: '11px' }}
                onClick={handleLoadRepos}
                disabled={loadingRepos}
              >
                {loadingRepos ? <Loader2 size={10} className="animate-spin" /> : null}
                {loadingRepos ? 'Loading...' : 'Select repository'}
              </button>
              <button
                className="reveal-pill"
                style={{ height: '30px', fontSize: '11px' }}
                onClick={() => setShowCreate(true)}
              >
                <Plus size={10} />
                Create new repo
              </button>
            </div>
          ) : showCreate ? (
            <div
              style={{
                padding: '12px',
                borderRadius: '12px',
                background: 'rgba(201,168,76,0.05)',
                border: '1px solid rgba(201,168,76,0.15)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div className="font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.12em', textTransform: 'uppercase' as const, color: 'var(--text-dim)' }}>
                New GitHub repository
              </div>
              <input
                type="text"
                value={newRepoName}
                onChange={e => setNewRepoName(e.target.value)}
                placeholder="my-new-project"
                onKeyDown={e => { if (e.key === 'Enter') handleCreateRepo(); }}
                autoFocus
                style={{
                  height: '32px',
                  padding: '0 10px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)',
                  color: 'var(--text)',
                  fontSize: '12px',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                  outline: 'none',
                  width: '100%',
                }}
              />
              <label className="flex items-center gap-2" style={{ fontSize: '11px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={newRepoPrivate}
                  onChange={e => setNewRepoPrivate(e.target.checked)}
                  style={{ accentColor: 'var(--gold)' }}
                />
                Private repository
              </label>
              <div className="flex items-center gap-2">
                <button
                  className="reveal-pill primary"
                  style={{ height: '28px', fontSize: '11px' }}
                  onClick={handleCreateRepo}
                  disabled={creatingRepo || !newRepoName.trim()}
                >
                  {creatingRepo ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
                  {creatingRepo ? 'Creating...' : 'Create & connect'}
                </button>
                <button
                  className="reveal-pill"
                  style={{ height: '28px', fontSize: '11px' }}
                  onClick={() => { setShowCreate(false); setNewRepoName(''); setError(''); }}
                  disabled={creatingRepo}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              <input
                type="text"
                value={repoSearch}
                onChange={e => setRepoSearch(e.target.value)}
                placeholder={`Search ${repos.length} repos...`}
                style={{
                  height: '30px',
                  padding: '0 10px',
                  borderRadius: '10px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)',
                  color: 'var(--text)',
                  fontSize: '11px',
                  outline: 'none',
                  width: '100%',
                }}
              />
              <div
                style={{
                  maxHeight: '240px',
                  overflowY: 'auto',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.06)',
                  background: 'rgba(255,255,255,0.02)',
                  padding: '4px',
                }}
              >
                {repos
                  .filter(r => !repoSearch || r.full_name.toLowerCase().includes(repoSearch.toLowerCase()))
                  .map(r => {
                    const isSelected = selectedRepo === r.full_name;
                    return (
                      <button
                        key={r.full_name}
                        onClick={() => setSelectedRepo(r.full_name)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          width: '100%',
                          padding: '8px 10px',
                          borderRadius: '8px',
                          border: 'none',
                          background: isSelected ? 'rgba(201,168,76,0.12)' : 'transparent',
                          color: isSelected ? 'var(--gold)' : 'var(--text)',
                          fontSize: '11px',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          cursor: 'pointer',
                          textAlign: 'left',
                          transition: 'background 0.12s ease',
                        }}
                        onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'; }}
                        onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.full_name}
                        </span>
                        <span className="font-mono-dm" style={{ fontSize: '9px', color: 'var(--text-dim)', flexShrink: 0, marginLeft: '8px' }}>
                          {r.default_branch}
                        </span>
                      </button>
                    );
                  })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="reveal-pill primary"
                  style={{ height: '30px', fontSize: '11px' }}
                  onClick={handleSaveRepo}
                  disabled={saving || !selectedRepo}
                >
                  {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                  Connect repo
                </button>
                {state.activeSession?.mode === 'build' && (
                  <button
                    className="reveal-pill"
                    style={{ height: '30px', fontSize: '11px' }}
                    onClick={() => setShowCreate(true)}
                  >
                    <Plus size={10} />
                    Create new repo
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {activeRepo && (
        <div className="mt-2">
          <div className="flex items-center gap-2 mb-2">
            <a
              href={`https://github.com/${activeRepo.owner}/${activeRepo.repo}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono-dm"
              style={{ fontSize: '11px', color: 'var(--text)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              {activeRepo.owner}/{activeRepo.repo}
              <ExternalLink size={9} style={{ color: 'var(--text-dim)' }} />
            </a>
            <span className="reveal-chip" style={{ fontSize: '9px', height: '20px', padding: '0 6px' }}>
              {activeRepo.default_branch}
            </span>
          </div>

          {(activeRepo.scoped_paths || []).length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {activeRepo.scoped_paths.map(p => (
                <span key={p} className="reveal-chip" style={{ fontSize: '9px', height: '20px', padding: '0 6px', gap: '3px' }}>
                  {p}
                  <button
                    onClick={() => handleRemoveRepoPath(p)}
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
              value={newPath}
              onChange={e => setNewPath(e.target.value)}
              placeholder="Add scoped path..."
              onKeyDown={e => { if (e.key === 'Enter') handleAddRepoPath(newPath); }}
              style={{
                flex: 1,
                height: '26px',
                padding: '0 8px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.06)',
                background: 'rgba(255,255,255,0.025)',
                color: 'var(--text)',
                fontSize: '10px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                outline: 'none',
              }}
            />
            <button
              className="keycap"
              style={{ width: '26px', height: '26px' }}
              onClick={() => handleAddRepoPath(newPath)}
              disabled={!newPath.trim()}
            >
              <Plus size={9} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}





