import { useEffect } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { X, ArrowRight, RotateCcw, Pencil } from 'lucide-react';

/**
 * ConciergePanel — centered overlay showing synthesis decision.
 *
 * SHELL ONLY — uses static placeholder content until CLI signals B3,
 * at which point we wire conciergeDecision from MaestroContext.
 *
 * Layout: alignment summary, tension points, recommended direction,
 * and three action buttons: Proceed / Round 2 / Override.
 */
export default function ConciergePanel() {
  const { dispatch } = useMaestro();

  // Dismiss on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dispatch({ type: 'SET_CONCIERGE_VISIBLE', payload: false });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [dispatch]);

  // Static placeholder content — replaced with real data after B3
  const alignmentSummary =
    'The council broadly agrees on the proposed architecture. ' +
    'All agents recommend a modular approach with clear separation of concerns.';
  const tensionPoints = [
    'State management strategy: Redux vs. Context + useReducer',
    'Whether to implement server-side rendering in the initial phase',
    'Database schema normalization level — some agents prefer denormalized for speed',
  ];
  const recommendedDirection =
    'Proceed with React Context + useReducer for state management, ' +
    'client-side rendering first with SSR as a Phase 2 enhancement, ' +
    'and a moderately normalized schema with strategic denormalization for read-heavy paths.';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(8,8,6,0.75)', backdropFilter: 'blur(8px)' }}
      onClick={() => dispatch({ type: 'SET_CONCIERGE_VISIBLE', payload: false })}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '620px',
          margin: '0 24px',
          borderRadius: '24px',
          border: '1px solid rgba(201,168,76,0.18)',
          background: 'linear-gradient(180deg, rgba(18,17,14,0.98), rgba(12,11,9,0.98))',
          boxShadow: '0 0 80px rgba(201,168,76,0.08), 0 24px 48px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between"
          style={{
            padding: '20px 28px',
            borderBottom: '1px solid rgba(255,255,255,0.045)',
          }}
        >
          <div className="flex items-center gap-3">
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: 'var(--gold)',
                boxShadow: '0 0 12px rgba(201,168,76,0.5)',
              }}
            />
            <span
              className="font-mono-dm"
              style={{
                fontSize: '11px',
                letterSpacing: '0.2em',
                textTransform: 'uppercase' as const,
                color: 'var(--gold)',
              }}
            >
              Concierge
            </span>
          </div>
          <button
            className="keycap"
            style={{ width: '28px', height: '28px' }}
            onClick={() => dispatch({ type: 'SET_CONCIERGE_VISIBLE', payload: false })}
            title="Close (Esc)"
          >
            <X size={12} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '28px' }}>
          {/* Alignment summary */}
          <section style={{ marginBottom: '28px' }}>
            <div
              className="font-mono-dm"
              style={{
                fontSize: '9px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase' as const,
                color: 'var(--text-dim)',
                marginBottom: '10px',
              }}
            >
              Where the council agrees
            </div>
            <p
              style={{
                fontSize: '15px',
                lineHeight: 1.7,
                color: 'rgba(232,230,224,0.88)',
                fontWeight: 300,
                margin: 0,
              }}
            >
              {alignmentSummary}
            </p>
          </section>

          {/* Tension points */}
          <section style={{ marginBottom: '28px' }}>
            <div
              className="font-mono-dm"
              style={{
                fontSize: '9px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase' as const,
                color: 'var(--text-dim)',
                marginBottom: '10px',
              }}
            >
              Points of tension
            </div>
            <ul
              style={{
                margin: 0,
                padding: '0 0 0 18px',
                listStyle: 'disc',
              }}
            >
              {tensionPoints.map((point, i) => (
                <li
                  key={i}
                  style={{
                    fontSize: '14px',
                    lineHeight: 1.65,
                    color: 'rgba(232,230,224,0.78)',
                    fontWeight: 300,
                    marginBottom: '6px',
                  }}
                >
                  {point}
                </li>
              ))}
            </ul>
          </section>

          {/* Recommended direction */}
          <section style={{ marginBottom: '28px' }}>
            <div
              className="font-mono-dm"
              style={{
                fontSize: '9px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase' as const,
                color: 'var(--text-dim)',
                marginBottom: '10px',
              }}
            >
              Recommended direction
            </div>
            <p
              style={{
                fontSize: '15px',
                lineHeight: 1.7,
                color: 'rgba(232,230,224,0.88)',
                fontWeight: 300,
                margin: 0,
              }}
            >
              {recommendedDirection}
            </p>
          </section>
        </div>

        {/* Action bar */}
        <div
          className="flex items-center gap-3"
          style={{
            padding: '16px 28px 24px',
            borderTop: '1px solid rgba(255,255,255,0.045)',
          }}
        >
          <button
            className="reveal-pill"
            style={{
              height: '38px',
              fontSize: '12px',
              padding: '0 20px',
              background: 'var(--gold)',
              color: 'var(--void)',
              borderColor: 'transparent',
              fontWeight: 500,
            }}
            onClick={() => {
              dispatch({ type: 'SET_CONCIERGE_VISIBLE', payload: false });
            }}
          >
            <ArrowRight size={14} />
            Proceed
          </button>
          <button
            className="reveal-pill"
            style={{ height: '38px', fontSize: '12px', padding: '0 16px' }}
            onClick={() => {
              dispatch({ type: 'SET_CONCIERGE_VISIBLE', payload: false });
            }}
          >
            <RotateCcw size={12} />
            Round 2
          </button>
          <button
            className="reveal-pill"
            style={{ height: '38px', fontSize: '12px', padding: '0 16px' }}
            onClick={() => {
              dispatch({ type: 'SET_CONCIERGE_VISIBLE', payload: false });
            }}
          >
            <Pencil size={12} />
            Override
          </button>
        </div>
      </div>
    </div>
  );
}
