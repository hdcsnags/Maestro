import { useState, useEffect, useCallback } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { useAuth } from '../../context/AuthContext';
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

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const activeRepo = state.activeRepoConnection;

  const getAuthToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? '';
  }, []);

  useEffect(() => {
    (async () => {
      setChecking(true);
      try {
        const token = await getAuthToken();
        const res = await fetch(`${supabaseUrl}/functions/v1/github-auth?action=check_status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        setGhConnected(data.connected);
        if (data.hint) setGhUser(data.hint.replace('github:', ''));
      } catch { /* ignore */ }
      setChecking(false);
    })();
  }, [supabaseUrl, getAuthToken]);

  const handleConnect = async () => {
    setConnecting(true);
    setError('');
    try {
      const token = await getAuthToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/github-auth?action=get_auth_url`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (!data.auth_url) {
        setError('GitHub App not configured');
        setConnecting(false);
        return;
      }

      const width = 600;
      const height = 700;
      const left = window.screenX + (window.innerWidth - width) / 2;
      const top = window.screenY + (window.innerHeight - height) / 2;
      const popup = window.open(data.auth_url, 'github-auth', `width=${width},height=${height},left=${left},top=${top}`);

      const interval = setInterval(async () => {
        try {
          if (!popup || popup.closed) {
            clearInterval(interval);
            const statusRes = await fetch(`${supabaseUrl}/functions/v1/github-auth?action=check_status`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            const statusData = await statusRes.json();
            setGhConnected(statusData.connected);
            if (statusData.hint) setGhUser(statusData.hint.replace('github:', ''));
            setConnecting(false);
            return;
          }

          const currentUrl = popup.location?.href;
          if (currentUrl && currentUrl.includes('code=')) {
            const urlParams = new URL(currentUrl).searchParams;
            const code = urlParams.get('code');
            popup.close();
            clearInterval(interval);

            if (code) {
              const exchangeRes = await fetch(`${supabaseUrl}/functions/v1/github-auth?action=exchange_code`, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({ code }),
              });
              const exchangeData = await exchangeRes.json();
              if (exchangeData.success) {
                setGhConnected(true);
                setGhUser(exchangeData.github_user);
                if (exchangeData.connection) {
                  dispatch({ type: 'UPSERT_PROVIDER_CONNECTION', payload: exchangeData.connection });
                }
              } else {
                setError(exchangeData.error || 'Failed to connect');
              }
            }
            setConnecting(false);
          }
        } catch {
          /* cross-origin, keep polling */
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
      const token = await getAuthToken();
      const res = await fetch(`${supabaseUrl}/functions/v1/github-repos`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setRepos(data.repos || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load repos');
    }
    setLoadingRepos(false);
  };

  const handleSaveRepo = async () => {
    if (!user || !state.workspace || !selectedRepo) return;
    setSaving(true);
    setError('');

    const repo = repos.find(r => r.full_name === selectedRepo);
    if (!repo) { setSaving(false); return; }

    try {
      const { data: raw } = await supabase
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

      const conn = raw as RepoConnection | null;
      if (conn) {
        dispatch({ type: 'UPSERT_REPO_CONNECTION', payload: conn });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
    setSaving(false);
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
          {repos.length === 0 ? (
            <button
              className="reveal-pill"
              style={{ height: '30px', fontSize: '11px' }}
              onClick={handleLoadRepos}
              disabled={loadingRepos}
            >
              {loadingRepos ? <Loader2 size={10} className="animate-spin" /> : null}
              {loadingRepos ? 'Loading...' : 'Select repository'}
            </button>
          ) : (
            <>
              <select
                value={selectedRepo}
                onChange={e => setSelectedRepo(e.target.value)}
                style={{
                  height: '34px',
                  padding: '0 10px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.03)',
                  color: 'var(--text)',
                  fontSize: '12px',
                  outline: 'none',
                  width: '100%',
                }}
              >
                <option value="">Select a repo...</option>
                {repos.map(r => (
                  <option key={r.full_name} value={r.full_name}>
                    {r.full_name} ({r.default_branch})
                  </option>
                ))}
              </select>
              <button
                className="reveal-pill primary"
                style={{ height: '30px', fontSize: '11px', alignSelf: 'flex-start' }}
                onClick={handleSaveRepo}
                disabled={saving || !selectedRepo}
              >
                {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
                Connect repo
              </button>
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
