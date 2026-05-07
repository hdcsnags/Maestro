import { useRef, useEffect } from 'react';
import { X, CheckCircle, XCircle, Loader2, Clock } from 'lucide-react';
import { useMaestro } from '../../context/MaestroContext';

const STATUS_ICON: Record<string, React.ReactNode> = {
  queued: <Clock size={12} color="var(--ink-3)" />,
  running: <Loader2 size={12} color="var(--warn)" className="animate-spin" />,
  succeeded: <CheckCircle size={12} color="var(--ok)" />,
  failed: <XCircle size={12} color="var(--risk)" />,
};

export default function BuildLogDrawer() {
  const { state, dispatch } = useMaestro();
  const isOpen = state.activeDrawer === 'build-log';
  const { runs, isRunning } = state.sessionBuildState;
  const streamingOutput = state.jobStreamingOutput;
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [isOpen, streamingOutput]);

  function close() {
    dispatch({ type: 'OPEN_DRAWER', payload: null });
  }

  return (
    <div
      className={`drawer-panel drawer-right${isOpen ? ' open' : ''}`}
      style={{ width: 420, zIndex: 40 }}
      role="dialog"
      aria-label="Build log"
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '16px 20px',
        borderBottom: '1px solid var(--edge-1)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--ink-2)' }}>
            Build Log
          </span>
          {isRunning && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.1em',
              color: 'var(--warn)', background: 'rgba(201,160,96,0.1)',
              border: '1px solid rgba(201,160,96,0.2)', borderRadius: 4, padding: '2px 6px',
            }}>
              <Loader2 size={8} className="animate-spin" />
              RUNNING
            </span>
          )}
        </div>
        <button
          onClick={close}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', padding: 4 }}
          aria-label="Close build log"
        >
          <X size={14} />
        </button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
        {runs.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '40px 20px',
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.1em',
          }}>
            No build runs yet. Start a local build to see progress here.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {runs.map(run => {
              const lines: string[] = run.jobId ? (streamingOutput[run.jobId] ?? []) : [];
              const statusIcon = STATUS_ICON[run.status] ?? STATUS_ICON.queued;

              return (
                <div
                  key={run.key}
                  style={{
                    background: 'var(--surf-0)',
                    border: '1px solid var(--edge-1)',
                    borderRadius: 8,
                    overflow: 'hidden',
                  }}
                >
                  {/* Run header */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '10px 14px',
                    borderBottom: lines.length > 0 ? '1px solid var(--edge-1)' : 'none',
                  }}>
                    {statusIcon}
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-1)', letterSpacing: '0.06em', flex: 1 }}>
                      {run.builderName}
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.08em' }}>
                      {run.adapter}
                    </span>
                    {run.filesWritten > 0 && (
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ok)', letterSpacing: '0.06em' }}>
                        {run.filesWritten} file{run.filesWritten === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>

                  {/* Scope */}
                  {run.scopePaths.length > 0 && (
                    <div style={{ padding: '4px 14px 6px', borderBottom: lines.length > 0 ? '1px solid var(--edge-1)' : 'none' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.06em' }}>
                        scope: {run.scopePaths.join(', ')}
                      </span>
                    </div>
                  )}

                  {/* Error text */}
                  {run.errorText && (
                    <div style={{ padding: '8px 14px', background: 'rgba(224,90,90,0.07)', borderTop: '1px solid var(--edge-1)' }}>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--risk)', letterSpacing: '0.06em', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                        {run.errorText}
                      </span>
                    </div>
                  )}

                  {/* Manifest (succeeded) */}
                  {run.status === 'succeeded' && run.manifest.length > 0 && (
                    <div style={{ padding: '8px 14px', maxHeight: 140, overflowY: 'auto' }}>
                      {run.manifest.map((entry, idx) => (
                        <div key={idx} style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-2)', letterSpacing: '0.04em', lineHeight: 1.6 }}>
                          <span style={{ color: entry.operation === 'delete' ? 'var(--risk)' : 'var(--ok)', marginRight: 6 }}>
                            {entry.operation === 'delete' ? '×' : '~'}
                          </span>
                          {entry.path}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Streaming output */}
                  {lines.length > 0 && (
                    <div style={{
                      padding: '8px 14px', maxHeight: 160, overflowY: 'auto',
                      borderTop: '1px solid var(--edge-1)',
                      background: 'rgba(0,0,0,0.2)',
                    }}>
                      {lines.map((line, idx) => (
                        <div key={idx} style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.04em', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                          {line}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <div ref={logEndRef} />
      </div>
    </div>
  );
}
