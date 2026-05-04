/* global React, Orb, VOICES, SAMPLE_PROMPT, SAMPLE_RESPONSES, SAMPLE_THREADS */

/* ═══════════════════════════════════════════════════════════════════
   DIRECTION 3 — SCORE
   Editorial / experimental. The session is a musical score.
   Empty stage = a blank staff awaiting the first measure.
   Populated = horizontal staff with agent rows; the focused voice
   expands as a reader. Carousel = scrubbing through measures.
   ═══════════════════════════════════════════════════════════════════ */

function ScoreShell({ children }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#06070a',
      color: 'var(--ink-0)',
      fontSize: 13,
      position: 'relative',
      overflow: 'hidden',
      display: 'grid',
      gridTemplateRows: '46px 1fr auto',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        background:
          'linear-gradient(90deg, rgba(217,119,87,0.04), transparent 30%, transparent 70%, rgba(217,119,87,0.04)),' +
          'linear-gradient(180deg, #06070a 0%, #08090c 50%, #050608 100%)',
        zIndex: 0,
      }} />
      <div className="void-grain" style={{ zIndex: 1 }} />
      {children}
    </div>
  );
}

function ScoreTopbar({ phase, setPhase }) {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '0 22px',
      borderBottom: '1px solid var(--edge-1)',
      background: 'rgba(6,7,10,0.7)',
      backdropFilter: 'blur(20px)',
      position: 'relative', zIndex: 5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Orb size="sm" />
        <span style={{ fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 400, letterSpacing: '-0.01em', fontStyle: 'italic' }}>
          Maestro
        </span>
      </div>

      <span style={{
        marginLeft: 4, fontFamily: 'var(--mono)', fontSize: 9,
        color: 'var(--ink-3)', letterSpacing: '0.22em', textTransform: 'uppercase',
      }}>
        op. 14 · tidewatch
      </span>

      <div style={{ flex: 1 }} />

      {/* Tempo / movement counter */}
      <span style={{
        fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-2)',
        letterSpacing: '0.16em', textTransform: 'uppercase',
        display: 'inline-flex', alignItems: 'center', gap: 8,
      }}>
        <span style={{ color: 'var(--ember)' }}>♪</span>
        movement III
        <span style={{ color: 'var(--ink-3)' }}>·</span>
        andante
      </span>

      <div style={{
        display: 'flex', gap: 2, padding: 2,
        border: '1px solid var(--edge-1)', borderRadius: 999,
        background: 'var(--surf-0)', fontSize: 10,
        fontFamily: 'var(--mono)', letterSpacing: '0.08em', textTransform: 'uppercase',
      }}>
        {['empty', 'reading'].map(p => (
          <button key={p} onClick={() => setPhase(p)} style={{
            padding: '4px 10px', borderRadius: 999,
            background: phase === p ? 'var(--surf-2)' : 'transparent',
            color: phase === p ? 'var(--ink-0)' : 'var(--ink-3)',
          }}>{p}</button>
        ))}
      </div>

      <div style={{
        width: 26, height: 26, borderRadius: '50%',
        background: 'linear-gradient(135deg, var(--ember-soft), var(--surf-2))',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--serif)', fontSize: 12, color: 'var(--ember)', fontStyle: 'italic',
        border: '1px solid var(--ember-hairline)',
      }}>M</div>
    </header>
  );
}

function ScoreEmptyStage() {
  return (
    <main style={{
      flex: 1,
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden', position: 'relative', zIndex: 2,
    }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 56px' }}>
        {/* Title block */}
        <div style={{ marginBottom: 36, paddingLeft: 8 }}>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 9,
            color: 'var(--ink-3)', letterSpacing: '0.32em', textTransform: 'uppercase',
            marginBottom: 10,
          }}>
            opening rest
          </div>
          <h1 style={{
            fontFamily: 'var(--serif)', fontWeight: 200,
            fontSize: 52, lineHeight: 1.05, letterSpacing: '-0.025em',
            margin: 0, color: 'var(--ink-0)',
          }}>
            The score is <em style={{ fontStyle: 'italic', color: 'var(--ember)', fontWeight: 300 }}>blank</em>.
          </h1>
          <p style={{
            fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 300,
            fontStyle: 'italic', color: 'var(--ink-2)',
            margin: '14px 0 0', maxWidth: 640, lineHeight: 1.5,
          }}>
            Compose a question and the four instruments will play in sequence.
            You'll read each in turn, with the others held in reserve.
          </p>
        </div>

        {/* Empty staff — 4 horizontal lines, one per instrument */}
        <div style={{ position: 'relative', padding: '24px 0' }}>
          {VOICES.map((v, i) => (
            <div key={v.id} style={{
              display: 'grid',
              gridTemplateColumns: '120px 1fr 80px',
              alignItems: 'center', gap: 16,
              padding: '14px 0',
              borderBottom: i < VOICES.length - 1 ? '1px solid var(--edge-0)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{
                  width: 10, height: 10, borderRadius: '50%',
                  background: v.color, opacity: 0.7,
                  boxShadow: `0 0 8px ${v.color}66`,
                }} />
                <div>
                  <div style={{
                    fontFamily: 'var(--serif)', fontSize: 14, fontStyle: 'italic',
                    color: 'var(--ink-1)', letterSpacing: '-0.005em',
                  }}>{v.name}</div>
                  <div style={{
                    fontFamily: 'var(--mono)', fontSize: 9,
                    color: 'var(--ink-3)', letterSpacing: '0.14em', textTransform: 'uppercase',
                  }}>{v.role}</div>
                </div>
              </div>

              {/* The empty staff line */}
              <div style={{
                position: 'relative', height: 22,
                display: 'flex', alignItems: 'center',
              }}>
                <div style={{
                  width: '100%', height: 1,
                  background: `linear-gradient(90deg, ${v.color}33, var(--edge-1) 30%, var(--edge-1) 70%, ${v.color}33)`,
                }} />
                {/* a few faint rest marks */}
                {[0.15, 0.42, 0.7, 0.92].map((p, j) => (
                  <span key={j} style={{
                    position: 'absolute', left: `${p * 100}%`,
                    transform: 'translate(-50%, -50%)', top: '50%',
                    fontFamily: 'var(--serif)', fontSize: 14, fontStyle: 'italic',
                    color: 'var(--ink-4)', opacity: 0.5,
                  }}>𝄽</span>
                ))}
              </div>

              <div style={{
                fontFamily: 'var(--mono)', fontSize: 9,
                color: 'var(--ink-3)', letterSpacing: '0.12em',
                textAlign: 'right',
              }}>
                {v.model}
              </div>
            </div>
          ))}
        </div>

        {/* Conductor line */}
        <div style={{
          marginTop: 24,
          display: 'flex', alignItems: 'center', gap: 12,
          fontFamily: 'var(--mono)', fontSize: 10,
          color: 'var(--ink-3)', letterSpacing: '0.18em', textTransform: 'uppercase',
        }}>
          <Orb size="xs" />
          <span>conductor: <span style={{ color: 'var(--ink-1)' }}>michael</span></span>
          <span style={{ opacity: 0.4 }}>—</span>
          <span>raise the baton</span>
        </div>
      </div>
    </main>
  );
}

function ScoreReader() {
  const [active, setActive] = React.useState(0);
  const response = SAMPLE_RESPONSES[active];

  return (
    <div style={{
      flex: 1, display: 'grid',
      gridTemplateColumns: '1fr',
      gridTemplateRows: 'auto auto 1fr',
      overflow: 'hidden', position: 'relative', zIndex: 2,
    }}>
      {/* Prompt header */}
      <div style={{ padding: '20px 56px 14px' }}>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 9,
          color: 'var(--ink-3)', letterSpacing: '0.28em', textTransform: 'uppercase',
          marginBottom: 6,
        }}>
          measure 03 · the question
        </div>
        <p style={{
          fontFamily: 'var(--serif)', fontSize: 21, fontWeight: 300, fontStyle: 'italic',
          lineHeight: 1.4, letterSpacing: '-0.015em',
          margin: 0, color: 'var(--ink-1)', maxWidth: '64ch',
        }}>{SAMPLE_PROMPT}</p>
      </div>

      {/* The staff — 4 rows, current one expanded */}
      <div style={{
        padding: '8px 56px 12px',
        borderTop: '1px solid var(--edge-0)',
        borderBottom: '1px solid var(--edge-0)',
        background: 'rgba(8,9,11,0.4)',
      }}>
        {VOICES.map((v, i) => {
          const r = SAMPLE_RESPONSES[i];
          const isActive = i === active;
          // Visualize "tempo" by tokens — bars
          const bars = Math.round((r.tokens / 4000) * 24);
          return (
            <button key={v.id} onClick={() => setActive(i)} style={{
              width: '100%',
              display: 'grid',
              gridTemplateColumns: '120px 1fr 110px',
              alignItems: 'center', gap: 14,
              padding: '6px 4px',
              border: 'none', background: 'transparent',
              cursor: 'pointer',
              opacity: isActive ? 1 : 0.55,
              transition: 'opacity 200ms',
              textAlign: 'left',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: v.color,
                  boxShadow: isActive ? `0 0 10px ${v.color}` : 'none',
                }} />
                <span style={{
                  fontFamily: 'var(--serif)', fontSize: 13, fontStyle: 'italic',
                  color: isActive ? 'var(--ink-0)' : 'var(--ink-2)',
                }}>{v.name}</span>
              </div>

              {/* Staff line with tokens-as-bars */}
              <div style={{
                position: 'relative', height: 16,
                display: 'flex', alignItems: 'center', gap: 2,
              }}>
                {Array.from({ length: 32 }).map((_, j) => (
                  <span key={j} style={{
                    flex: 1, height: j < bars ? 10 + (j % 3) * 2 : 1,
                    background: j < bars ? (isActive ? v.color : `${v.color}88`) : 'var(--edge-1)',
                    borderRadius: 1,
                    transition: 'all 300ms',
                  }} />
                ))}
              </div>

              <div style={{
                fontFamily: 'var(--mono)', fontSize: 9,
                color: 'var(--ink-3)', letterSpacing: '0.1em',
                textAlign: 'right',
              }}>
                {r.tokens.toLocaleString()} tok · {r.runtime}s
              </div>
            </button>
          );
        })}
      </div>

      {/* The reader for the active voice */}
      <div style={{ overflow: 'auto', padding: '0 56px' }}>
        <div style={{ maxWidth: '64ch', margin: '0 auto', padding: '28px 0 80px' }}>
          {/* Voice header */}
          <div style={{
            display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 18,
          }}>
            <h2 style={{
              fontFamily: 'var(--serif)', fontWeight: 300, fontStyle: 'italic',
              fontSize: 36, letterSpacing: '-0.02em',
              margin: 0, color: response.voice.color,
            }}>
              {response.voice.name}
            </h2>
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)',
              letterSpacing: '0.14em', textTransform: 'uppercase',
            }}>
              solo · {response.voice.model} · {(response.confidence * 100).toFixed(0)}% confidence
            </span>
          </div>

          {/* TL;DR as a refrain */}
          <p style={{
            fontFamily: 'var(--serif)', fontSize: 20, fontWeight: 300, fontStyle: 'italic',
            lineHeight: 1.45, color: 'var(--ink-0)',
            margin: '0 0 36px', letterSpacing: '-0.01em',
          }}>
            <span style={{ color: response.voice.color, marginRight: 8 }}>❝</span>
            {response.tldr}
            <span style={{ color: response.voice.color, marginLeft: 4 }}>❞</span>
          </p>

          {/* Body */}
          {response.body.map((block, i) => {
            if (block.kind === 'p') return (
              <p key={i} style={{
                fontSize: 14.5, lineHeight: 1.75, color: 'var(--ink-1)',
                margin: '0 0 18px', textWrap: 'pretty',
              }}>{block.text}</p>
            );
            if (block.kind === 'h') return (
              <h3 key={i} style={{
                fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 400, fontStyle: 'italic',
                color: 'var(--ink-0)', margin: '32px 0 14px',
                letterSpacing: '-0.01em',
              }}>{block.text}</h3>
            );
            if (block.kind === 'code') return (
              <pre key={i} style={{
                margin: '0 0 22px',
                padding: '14px 18px',
                background: '#04050a',
                border: '1px solid var(--edge-0)',
                borderLeft: `2px solid ${response.voice.color}`,
                borderRadius: 4,
                fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.6,
                color: 'var(--ink-1)',
                overflow: 'auto',
              }}>{block.text}</pre>
            );
            return null;
          })}

          {/* Navigation footer */}
          <div style={{
            marginTop: 40, paddingTop: 20,
            borderTop: '1px solid var(--edge-0)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)',
            letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>
            <button
              disabled={active === 0}
              onClick={() => setActive(a => Math.max(0, a - 1))}
              style={{ color: active === 0 ? 'var(--ink-4)' : 'var(--ink-1)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              ← prev voice
            </button>
            <span>voice {active + 1} of {SAMPLE_RESPONSES.length}</span>
            <button
              disabled={active === SAMPLE_RESPONSES.length - 1}
              onClick={() => setActive(a => Math.min(SAMPLE_RESPONSES.length - 1, a + 1))}
              style={{ color: active === SAMPLE_RESPONSES.length - 1 ? 'var(--ink-4)' : 'var(--ink-1)', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              next voice →
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ScoreComposer({ phase }) {
  const [intent, setIntent] = React.useState('council');
  const [text, setText] = React.useState('');

  return (
    <div style={{
      padding: '14px 56px 18px',
      borderTop: '1px solid var(--edge-1)',
      background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.5))',
      position: 'relative', zIndex: 3,
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8,
        fontFamily: 'var(--mono)', fontSize: 9,
        color: 'var(--ink-3)', letterSpacing: '0.22em', textTransform: 'uppercase',
      }}>
        <span style={{ color: 'var(--ember)' }}>♪</span>
        {' '}compose
        <span style={{ marginLeft: 12, opacity: 0.5 }}>—</span>
        <div style={{ display: 'flex', gap: 10, marginLeft: 12 }}>
          {['direct', 'council', 'execute', 'build'].map(k => (
            <button key={k} onClick={() => setIntent(k)} style={{
              fontFamily: 'var(--mono)', fontSize: 9,
              letterSpacing: '0.18em', textTransform: 'uppercase',
              color: intent === k ? 'var(--ember)' : 'var(--ink-3)',
              borderBottom: intent === k ? '1px solid var(--ember)' : '1px solid transparent',
              paddingBottom: 2,
            }}>{k}</button>
          ))}
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'flex-end', gap: 12,
        borderTop: '1px solid var(--edge-1)',
        paddingTop: 10,
      }}>
        <textarea
          value={text} onChange={e => setText(e.target.value)}
          placeholder={phase === 'empty' ? 'Begin the score…' : 'Add a coda…'}
          rows={2}
          style={{
            flex: 1,
            background: 'transparent', border: 'none', outline: 'none', resize: 'none',
            fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 200, fontStyle: 'italic',
            color: 'var(--ink-0)', lineHeight: 1.4,
            padding: '4px 0',
            letterSpacing: '-0.015em',
          }}
        />
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4,
        }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.14em' }}>
            ⌘ ↵ to play
          </span>
          <button style={{
            padding: '8px 22px', borderRadius: 4,
            background: 'var(--ember)', color: '#1a0e08',
            fontSize: 12, fontWeight: 500,
            fontFamily: 'var(--mono)', letterSpacing: '0.16em', textTransform: 'uppercase',
            boxShadow: '0 0 24px var(--ember-glow)',
          }}>Play ♪</button>
        </div>
      </div>
    </div>
  );
}

function Score() {
  const [phase, setPhase] = React.useState('empty');
  return (
    <ScoreShell>
      <ScoreTopbar phase={phase} setPhase={setPhase} />
      {phase === 'empty' ? <ScoreEmptyStage /> : <ScoreReader />}
      <ScoreComposer phase={phase} />
    </ScoreShell>
  );
}

window.Score = Score;
