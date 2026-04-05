import { useState } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { Copy, Check, X } from 'lucide-react';

export default function PatchModal() {
  const { state, dispatch } = useMaestro();
  const [copied, setCopied] = useState(false);

  if (!state.patchModalOpen) return null;

  const latestRound = state.rounds.length > 0 ? state.rounds[state.rounds.length - 1] : null;
  const synthesis = latestRound ? state.syntheses.find(s => s.round_id === latestRound.id) : null;
  const sessionTitle = state.activeSession?.title ?? 'Untitled';
  const roundNum = latestRound?.round_number ?? 0;
  const mode = state.executionMode;
  const timestamp = new Date().toISOString();

  const patchContent = synthesis
    ? `# Maestro Patch Stub
# Session: ${sessionTitle}
# Round: ${String(roundNum).padStart(2, '0')}
# Mode: ${mode}
# Generated: ${timestamp}
# ---
#
# This patch was synthesized from ${state.responses.filter(r => r.round_id === latestRound?.id).length} agent responses.
# Review carefully before applying.

---

${synthesis.content}

---

# End of patch stub
# To apply: use "Prepare execution" in the Synthesis drawer to push this to GitHub as a branch and PR.`
    : '# No synthesis available for the current round.';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(patchContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    dispatch({ type: 'SET_PATCH_MODAL', payload: false });
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(2,3,5,0.7)',
          zIndex: 70,
          transition: 'opacity 0.3s ease',
        }}
        onClick={handleClose}
      />
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(720px, calc(100vw - 40px))',
          maxHeight: '80vh',
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
          gap: '16px',
          animation: 'fade-in 0.3s ease',
        }}
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="reveal-label" style={{ marginBottom: '4px' }}>Patch Stub</div>
            <h3
              className="font-syne"
              style={{ margin: 0, fontSize: '22px', fontWeight: 400, letterSpacing: '-0.03em', color: 'var(--text)' }}
            >
              Generated output
            </h3>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="reveal-pill"
              onClick={handleCopy}
              style={{
                height: '34px',
                fontSize: '12px',
                color: copied ? 'var(--ok)' : undefined,
                borderColor: copied ? 'rgba(78,187,127,0.3)' : undefined,
              }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button className="keycap" onClick={handleClose}>
              <X size={12} />
            </button>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            overflow: 'auto',
            padding: '18px',
            borderRadius: '22px',
            background: 'rgba(0,0,0,0.26)',
            border: '1px solid rgba(255,255,255,0.06)',
            color: 'rgba(241,243,247,0.86)',
            font: '13px/1.7 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
            whiteSpace: 'pre-wrap',
            maxHeight: '56vh',
          }}
        >
          {patchContent}
        </div>

        <div className="flex items-center gap-3">
          <div className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            {mode.toUpperCase()} MODE
          </div>
          <div style={{ width: '1px', height: '12px', background: 'rgba(255,255,255,0.08)' }} />
          <div className="font-mono-dm" style={{ fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.08em' }}>
            ROUND {String(roundNum).padStart(2, '0')}
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
