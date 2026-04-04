import { useState, FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    if (mode === 'login') {
      const { error } = await signIn(email, password);
      if (error) setError(error.message);
    } else {
      const { error } = await signUp(email, password);
      if (error) setError(error.message);
      else setSuccess('Account created. You can now sign in.');
    }
    setLoading(false);
  };

  return (
    <div className="relative z-10 flex items-center justify-center min-h-screen">
      <div className="w-full max-w-sm px-6">
        <div className="text-center mb-10">
          <div className="inline-block mb-4">
            <div
              className="w-12 h-12 rounded-2xl mx-auto mb-3"
              style={{
                background: 'linear-gradient(135deg, rgba(201,168,76,0.3), rgba(201,168,76,0.08))',
                border: '1px solid rgba(201,168,76,0.25)',
                boxShadow: '0 0 40px rgba(201,168,76,0.08)',
              }}
            />
          </div>
          <p
            className="text-xs tracking-widest uppercase mb-2"
            style={{ fontFamily: 'DM Mono', color: 'var(--gold)', letterSpacing: '0.28em' }}
          >
            Orchestration Console
          </p>
          <h1
            className="text-4xl font-bold tracking-tight"
            style={{ fontFamily: 'Syne', color: 'var(--text)' }}
          >
            Maestro
          </h1>
          <p className="text-sm mt-2" style={{ color: 'var(--text-muted)' }}>
            You conduct. They build. Zero trust underneath.
          </p>
        </div>

        <div
          className="rounded-2xl p-6"
          style={{
            background: 'rgba(255,255,255,0.035)',
            border: '1px solid var(--border)',
          }}
        >
          <div
            className="flex gap-1 p-1 rounded-xl mb-6"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            {(['login', 'signup'] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(''); setSuccess(''); }}
                className="flex-1 py-2 rounded-lg text-xs font-medium transition-all duration-200"
                style={{
                  fontFamily: 'DM Mono',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  background: mode === m ? 'rgba(255,255,255,0.08)' : 'transparent',
                  border: mode === m ? '1px solid var(--border-lit)' : '1px solid transparent',
                  color: mode === m ? 'var(--text)' : 'var(--text-muted)',
                }}
              >
                {m === 'login' ? 'Sign in' : 'Create account'}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label
                className="block text-xs mb-2"
                style={{ fontFamily: 'DM Mono', color: 'var(--text-dim)', letterSpacing: '0.14em', textTransform: 'uppercase' }}
              >
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--border-lit)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                className="block text-xs mb-2"
                style={{ fontFamily: 'DM Mono', color: 'var(--text-dim)', letterSpacing: '0.14em', textTransform: 'uppercase' }}
              >
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all duration-200"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
                onFocus={e => (e.target.style.borderColor = 'var(--border-lit)')}
                onBlur={e => (e.target.style.borderColor = 'var(--border)')}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--risk)', background: 'rgba(224,90,90,0.08)', border: '1px solid rgba(224,90,90,0.2)' }}>
                {error}
              </p>
            )}
            {success && (
              <p className="text-xs px-3 py-2 rounded-lg" style={{ color: 'var(--ok)', background: 'rgba(78,187,127,0.08)', border: '1px solid rgba(78,187,127,0.2)' }}>
                {success}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-sm font-semibold mt-1 transition-all duration-200"
              style={{
                fontFamily: 'DM Mono',
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                background: loading ? 'rgba(255,255,255,0.06)' : 'var(--text)',
                color: loading ? 'var(--text-muted)' : 'var(--void)',
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign in' : 'Create account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
