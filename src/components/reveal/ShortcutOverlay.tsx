import { useMaestro } from '../../context/MaestroContext';

const MOD = navigator.platform.includes('Mac') ? '\u2318' : 'Ctrl';

const SHORTCUTS = [
  { key: `${MOD} O`, desc: 'Open orchestra drawer' },
  { key: `${MOD} J`, desc: 'Open trust rail' },
  { key: `${MOD} E`, desc: 'Open synthesis drawer' },
  { key: `${MOD} K`, desc: 'Open provider vault' },
  { key: '\u2190 / \u2192', desc: 'Move across the council' },
  { key: `${MOD} .`, desc: 'Toggle focus mode' },
  { key: 'Esc', desc: 'Dismiss drawers and overlays' },
  { key: `${MOD} /`, desc: 'Toggle shortcut legend' },
];

export default function ShortcutOverlay() {
  const { state, dispatch } = useMaestro();

  return (
    <div className={`shortcut-overlay ${state.shortcutOverlayOpen ? 'open' : ''}`}>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <div className="reveal-label" style={{ marginBottom: '6px' }}>Shortcuts</div>
          <h3
            className="font-syne"
            style={{ margin: 0, fontSize: '24px', fontWeight: 400, letterSpacing: '-0.03em', color: 'var(--text)' }}
          >
            Hidden chords, not hidden ideas
          </h3>
        </div>
        <button className="keycap" onClick={() => dispatch({ type: 'CLOSE_TRANSIENT' })}>Esc</button>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: window.innerWidth > 720 ? 'repeat(2, 1fr)' : '1fr' }}>
        {SHORTCUTS.map(s => (
          <div
            key={s.key}
            className="reveal-card flex items-center justify-between gap-3"
          >
            <strong style={{ color: 'var(--text)', fontWeight: 500, fontFamily: 'DM Mono, monospace', fontSize: '14px' }}>
              {s.key}
            </strong>
            <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>{s.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
