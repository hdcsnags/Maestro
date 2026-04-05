import { useState } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { useAuth } from '../../context/AuthContext';
import { PROVIDER_REGISTRY, ProviderConnection, PROVIDER_COLORS } from '../../types';
import { supabase } from '../../lib/supabase';
import { Eye, EyeOff, Check, Loader2, Trash2, Database } from 'lucide-react';
import RepoSection from './RepoSection';

export default function VaultDrawer() {
  const { state, dispatch } = useMaestro();
  const { user } = useAuth();
  const isOpen = state.activeDrawer === 'vault';

  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState('');

  const getConnection = (providerId: string): ProviderConnection | undefined => {
    return state.providerConnections.find(c => c.provider === providerId);
  };

  const handleSaveKey = async (providerId: string) => {
    if (!user || !keyInput.trim()) return;
    setSaving(true);
    setError('');

    const registry = PROVIDER_REGISTRY.find(p => p.id === providerId);
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch(`${supabaseUrl}/functions/v1/vault?action=save_key`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider: providerId,
          display_name: registry?.name ?? providerId,
          api_key: keyInput.trim(),
          models: registry?.models ?? [],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save key');

      if (data.connection) {
        dispatch({ type: 'UPSERT_PROVIDER_CONNECTION', payload: data.connection as ProviderConnection });
      }

      setEditingProvider(null);
      setKeyInput('');
      setShowKey(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save key');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveKey = async (providerId: string) => {
    if (!user) return;
    setRemoving(providerId);
    setError('');

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      const res = await fetch(`${supabaseUrl}/functions/v1/vault?action=remove_key`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ provider: providerId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove key');

      if (data.connection) {
        dispatch({ type: 'UPSERT_PROVIDER_CONNECTION', payload: data.connection as ProviderConnection });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove key');
    } finally {
      setRemoving(null);
    }
  };

  const connectedCount = state.providerConnections.filter(p => p.is_connected).length;

  return (
    <aside className={`drawer-panel drawer-right ${isOpen ? 'open' : ''}`}>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <div className="reveal-label" style={{ marginBottom: '6px' }}>Provider Vault</div>
          <h3
            className="font-syne"
            style={{ margin: 0, fontSize: '24px', fontWeight: 400, letterSpacing: '-0.03em', color: 'var(--text)' }}
          >
            Connect your keys
          </h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="reveal-chip accent">{connectedCount} connected</span>
          <button className="keycap" onClick={() => dispatch({ type: 'CLOSE_TRANSIENT' })}>Esc</button>
        </div>
      </div>

      <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, fontSize: '14px', marginBottom: '20px' }}>
        API keys are stored encrypted and only decrypted during active provider calls.
        Keys never leave the server environment.
      </p>

      {error && (
        <div
          className="rounded-xl p-3 mb-4"
          style={{ background: 'rgba(224,90,90,0.06)', border: '1px solid rgba(224,90,90,0.2)', color: 'var(--risk)', fontSize: '13px' }}
        >
          {error}
        </div>
      )}

      <RepoSection />

      <SupabaseSection />

      <div className="reveal-label mb-3" style={{ marginTop: '8px' }}>AI Providers</div>

      <div className="flex flex-col gap-3">
        {PROVIDER_REGISTRY.map(provider => {
          const conn = getConnection(provider.id);
          const isConnected = conn?.is_connected ?? false;
          const isEditing = editingProvider === provider.id;
          const isRemoving = removing === provider.id;
          const color = PROVIDER_COLORS[provider.id] ?? 'var(--text-muted)';

          return (
            <div key={provider.id} className="reveal-card">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2.5">
                  <div
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: color,
                      boxShadow: isConnected ? `0 0 12px ${color}55` : 'none',
                      flexShrink: 0,
                    }}
                  />
                  <strong style={{ color: 'var(--text)', fontWeight: 500, fontSize: '14px' }}>
                    {provider.name}
                  </strong>
                </div>
                <div className="flex items-center gap-2">
                  {isConnected && (
                    <span
                      className="reveal-chip"
                      style={{ color: 'var(--ok)', borderColor: 'rgba(78,187,127,0.25)', background: 'rgba(78,187,127,0.06)', fontSize: '10px', height: '24px', padding: '0 8px' }}
                    >
                      <Check size={10} /> Connected
                    </span>
                  )}
                  {!isConnected && !isEditing && (
                    <span className="reveal-chip" style={{ fontSize: '10px', height: '24px', padding: '0 8px' }}>
                      Not configured
                    </span>
                  )}
                </div>
              </div>

              <div className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '10px' }}>
                {provider.models.join(' / ')}
              </div>

              {isEditing ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div style={{ position: 'relative', flex: 1 }}>
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={keyInput}
                        onChange={e => setKeyInput(e.target.value)}
                        placeholder={`Paste ${provider.name} API key...`}
                        autoFocus
                        style={{
                          width: '100%',
                          height: '38px',
                          padding: '0 36px 0 12px',
                          borderRadius: '12px',
                          border: '1px solid rgba(255,255,255,0.08)',
                          background: 'rgba(255,255,255,0.03)',
                          color: 'var(--text)',
                          fontSize: '13px',
                          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                          outline: 'none',
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveKey(provider.id);
                          if (e.key === 'Escape') { setEditingProvider(null); setKeyInput(''); }
                        }}
                      />
                      <button
                        onClick={() => setShowKey(!showKey)}
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-dim)',
                          cursor: 'pointer',
                          padding: '4px',
                        }}
                      >
                        {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      className="reveal-pill primary"
                      style={{ height: '32px', fontSize: '12px' }}
                      onClick={() => handleSaveKey(provider.id)}
                      disabled={saving || !keyInput.trim()}
                    >
                      {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                      {saving ? 'Saving...' : 'Save key'}
                    </button>
                    <button
                      className="reveal-pill"
                      style={{ height: '32px', fontSize: '12px' }}
                      onClick={() => { setEditingProvider(null); setKeyInput(''); setShowKey(false); setError(''); }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    className="reveal-pill"
                    style={{ height: '32px', fontSize: '12px' }}
                    onClick={() => { setEditingProvider(provider.id); setKeyInput(''); setError(''); }}
                  >
                    {isConnected ? 'Update key' : 'Add key'}
                  </button>
                  {isConnected && (
                    <button
                      className="reveal-pill"
                      style={{ height: '32px', fontSize: '12px', color: 'var(--risk)', borderColor: 'rgba(224,90,90,0.2)' }}
                      onClick={() => handleRemoveKey(provider.id)}
                      disabled={isRemoving}
                    >
                      {isRemoving ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}

function SupabaseSection() {
  const { user } = useAuth();

  const [projectUrl, setProjectUrl] = useState('');
  const [serviceRoleKey, setServiceRoleKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connected, setConnected] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  // Check if Supabase project credentials are already stored
  useState(() => {
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) { setChecking(false); return; }

        // Check if supabase_project_url secret exists
        const res = await fetch(`${supabaseUrl}/functions/v1/vault?action=list`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        const connections = data.connections ?? [];
        const hasSupabaseUrl = connections.some((c: ProviderConnection) => c.provider === 'supabase_project_url' && c.is_connected);
        const hasServiceKey = connections.some((c: ProviderConnection) => c.provider === 'supabase_service_role_key' && c.is_connected);
        setConnected(hasSupabaseUrl && hasServiceKey);
      } catch { /* ignore */ }
      setChecking(false);
    })();
  });

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError('');

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;

      // Save project URL
      if (projectUrl.trim()) {
        const res1 = await fetch(`${supabaseUrl}/functions/v1/vault?action=save_key`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'supabase_project_url',
            display_name: 'Supabase Project URL',
            api_key: projectUrl.trim(),
            models: [],
          }),
        });
        if (!res1.ok) throw new Error('Failed to save project URL');
      }

      // Save service role key
      if (serviceRoleKey.trim()) {
        const res2 = await fetch(`${supabaseUrl}/functions/v1/vault?action=save_key`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            provider: 'supabase_service_role_key',
            display_name: 'Supabase Service Role Key',
            api_key: serviceRoleKey.trim(),
            models: [],
          }),
        });
        if (!res2.ok) throw new Error('Failed to save service role key');
      }

      setConnected(true);
      setProjectUrl('');
      setServiceRoleKey('');
      setShowKey(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    }
    setSaving(false);
  };

  return (
    <div className="reveal-card" style={{ marginBottom: '16px' }}>
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-2.5">
          <Database size={14} style={{ color: 'var(--text)' }} />
          <strong style={{ color: 'var(--text)', fontWeight: 500, fontSize: '14px' }}>
            Supabase
          </strong>
        </div>
        {checking ? (
          <Loader2 size={12} className="animate-spin" style={{ color: 'var(--text-dim)' }} />
        ) : connected ? (
          <span
            className="reveal-chip"
            style={{ color: 'var(--ok)', borderColor: 'rgba(78,187,127,0.25)', background: 'rgba(78,187,127,0.06)', fontSize: '10px', height: '24px', padding: '0 8px' }}
          >
            <Check size={10} /> Connected
          </span>
        ) : (
          <span className="reveal-chip" style={{ fontSize: '10px', height: '24px', padding: '0 8px' }}>
            Not configured
          </span>
        )}
      </div>

      <div className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', marginBottom: '10px' }}>
        Project credentials for agent-scoped writes
      </div>

      {error && (
        <div style={{ color: 'var(--risk)', fontSize: '12px', marginBottom: '8px' }}>{error}</div>
      )}

      {!connected && (
        <div className="flex flex-col gap-2">
          <input
            type="text"
            value={projectUrl}
            onChange={e => setProjectUrl(e.target.value)}
            placeholder="Project URL (https://xxx.supabase.co)"
            style={{
              height: '34px',
              padding: '0 12px',
              borderRadius: '12px',
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
              color: 'var(--text)',
              fontSize: '12px',
              outline: 'none',
              width: '100%',
            }}
          />
          <div style={{ position: 'relative' }}>
            <input
              type={showKey ? 'text' : 'password'}
              value={serviceRoleKey}
              onChange={e => setServiceRoleKey(e.target.value)}
              placeholder="Service Role Key"
              style={{
                width: '100%',
                height: '34px',
                padding: '0 36px 0 12px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.08)',
                background: 'rgba(255,255,255,0.03)',
                color: 'var(--text)',
                fontSize: '12px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                outline: 'none',
              }}
            />
            <button
              onClick={() => setShowKey(!showKey)}
              style={{
                position: 'absolute',
                right: '8px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-dim)',
                cursor: 'pointer',
                padding: '4px',
              }}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          <button
            className="reveal-pill primary"
            style={{ height: '30px', fontSize: '11px', alignSelf: 'flex-start' }}
            onClick={handleSave}
            disabled={saving || (!projectUrl.trim() && !serviceRoleKey.trim())}
          >
            {saving ? <Loader2 size={10} className="animate-spin" /> : <Check size={10} />}
            {saving ? 'Saving...' : 'Save credentials'}
          </button>
        </div>
      )}

      {connected && (
        <button
          className="reveal-pill"
          style={{ height: '28px', fontSize: '11px' }}
          onClick={() => setConnected(false)}
        >
          Update credentials
        </button>
      )}
    </div>
  );
}
