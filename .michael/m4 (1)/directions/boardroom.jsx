/* global React, Orb, VOICES, SAMPLE_PROMPT, SAMPLE_RESPONSES, SAMPLE_THREADS */

/* ═══════════════════════════════════════════════════════════════════
   DIRECTION 2 — BOARDROOM
   The metaphor literalized. Empty stage = seats around a table, orb
   at the head. Populated = the speaking voice rises to a podium; the
   others remain seated as carousel cards on the rim.
   ═══════════════════════════════════════════════════════════════════ */

function BoardroomShell({ children }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: 'var(--void-0)',
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
          'radial-gradient(ellipse 70% 50% at 50% 100%, rgba(217,119,87,0.08), transparent 60%),' +
          'radial-gradient(ellipse 100% 80% at 50% 50%, rgba(217,119,87,0.02), transparent 70%),' +
          'linear-gradient(180deg, var(--void-0) 0%, #060708 100%)',
        zIndex: 0,
      }} />
      <div className="void-grain" style={{ zIndex: 1 }} />
      {children}
    </div>
  );
}

function BoardroomTopbar({ phase, setPhase }) {
  return (
    <header style={{
      display: 'flex', alignItems: 'center', gap: 16,
      padding: '0 22px',
      borderBottom: '1px solid var(--edge-1)',
      background: 'rgba(8,9,11,0.7)',
      backdropFilter: 'blur(20px)',
      position: 'relative', zIndex: 5,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Orb size="sm" />
        <span style={{ fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 400, letterSpacing: '-0.01em' }}>
          Maestro
        </span>
        <span style={{
          marginLeft: 6, padding: '2px 7px', borderRadius: 3,
          fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)',
          letterSpacing: '0.18em', textTransform: 'uppercase',
          border: '1px solid var(--edge-1)',
        }}>boardroom</span>
      </div>

      <div style={{ flex: 1 }} />

      <span style={{
        fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)',
        letterSpacing: '0.18em', textTransform: 'uppercase',
      }}>
        Session · Tidewatch
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
        fontFamily: 'var(--serif)', fontSize: 12, color: 'var(--ember)',
        border: '1px solid var(--ember-hairline)',
      }}>M</div>
    </header>
  );
}

/* The table — semicircle of agent seats around the orb */
function BoardroomTable({ activeIdx, onSelect, mode }) {
  // mode: 'idle' | 'speaking'
  const seats = VOICES.map((v, i) => {
    // arrange in a semicircle, conductor (user) at front
    const total = VOICES.length;
    const angle = -160 + (i * (140 / (total - 1))); // -160° to -20°
    const rad = angle * Math.PI / 180;
    const radius = 220;
    const x = Math.cos(rad) * radius;
    const y = Math.sin(rad) * radius * 0.55; // squash for perspective
    return { ...v, x, y, angle };
  });

  return (
    <div style={{
      position: 'relative',
      width: 560, height: 360,
      margin: '0 auto',
    }}>
      {/* Table surface — elliptical, faint */}
      <div style={{
        position: 'absolute',
        left: '50%', top: '60%',
        width: 540, height: 200,
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.025), transparent 70%)',
        border: '1px solid var(--edge-0)',
        boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5)',
      }} />

      {/* Orb at the head */}
      <div style={{
        position: 'absolute',
        left: '50%', top: '15%',
        transform: 'translate(-50%, -50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      }}>
        <Orb size="lg" />
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)',
          letterSpacing: '0.22em', textTransform: 'uppercase',
        }}>Concierge</span>
      </div>

      {/* Seats */}
      {seats.map((seat, i) => {
        const isActive = activeIdx === i;
        return (
          <button
            key={seat.id}
            onClick={() => onSelect && onSelect(i)}
            style={{
              position: 'absolute',
              left: `calc(50% + ${seat.x}px)`,
              top: `calc(60% + ${seat.y}px)`,
              transform: `translate(-50%, -50%) ${isActive && mode === 'speaking' ? 'translateY(-8px) scale(1.05)' : 'scale(1)'}`,
              transition: 'transform 400ms var(--spring)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
              cursor: 'pointer',
            }}
          >
            <span style={{
              width: 52, height: 52, borderRadius: '50%',
              background: `radial-gradient(circle at 35% 30%, ${seat.color}cc, ${seat.color}33)`,
              border: isActive ? `2px solid ${seat.color}` : `1px solid ${seat.color}55`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--ink-0)',
              boxShadow: isActive ? `0 0 28px ${seat.color}66` : 'none',
              transition: 'all 300ms var(--spring)',
            }}>{seat.initial}</span>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: 11, color: isActive ? 'var(--ink-0)' : 'var(--ink-2)',
                fontWeight: isActive ? 500 : 400,
              }}>{seat.name}</div>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 8.5,
                color: 'var(--ink-3)', letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}>{seat.role}</div>
            </div>
          </button>
        );
      })}

      {/* Conductor seat (you) at the front */}
      <div style={{
        position: 'absolute',
        left: '50%', top: 'calc(60% + 130px)',
        transform: 'translate(-50%, -50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      }}>
        <span style={{
          width: 44, height: 44, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--ember-soft), var(--surf-3))',
          border: '1px solid var(--ember-hairline)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--ember)',
        }}>M</span>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)',
          letterSpacing: '0.22em', textTransform: 'uppercase',
        }}>Conductor</span>
      </div>
    </div>
  );
}

function BoardroomEmptyStage() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '20px 32px', position: 'relative', zIndex: 2,
      overflow: 'auto',
    }}>
      <div style={{
        fontFamily: 'var(--mono)', fontSize: 9,
        color: 'var(--ink-3)', letterSpacing: '0.28em', textTransform: 'uppercase',
        marginBottom: 6,
      }}>
        the boardroom · 2026.05.01 · 21:42
      </div>
      <h1 style={{
        fontFamily: 'var(--serif)', fontWeight: 300,
        fontSize: 32, lineHeight: 1.2, letterSpacing: '-0.02em',
        margin: '0 0 28px', textAlign: 'center', maxWidth: 620,
        color: 'var(--ink-0)',
      }}>
        Four advisors are seated. <em style={{ color: 'var(--ink-2)' }}>Open the floor.</em>
      </h1>

      <BoardroomTable activeIdx={null} mode="idle" />

      <div style={{
        fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)',
        letterSpacing: '0.16em', textTransform: 'uppercase',
        marginTop: 8,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span>4 voices ready</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>clawclaude on standby</span>
        <span style={{ opacity: 0.4 }}>·</span>
        <span>tidewatch · 0 rounds</span>
      </div>
    </div>
  );
}

function BoardroomReader() {
  const [active, setActive] = React.useState(0);
  const response = SAMPLE_RESPONSES[active];

  return (
    <div style={{
      flex: 1, display: 'grid',
      gridTemplateColumns: '320px 1fr',
      overflow: 'hidden', position: 'relative', zIndex: 2,
    }}>
      {/* Left rail — mini boardroom showing who's speaking */}
      <div style={{
        borderRight: '1px solid var(--edge-1)',
        padding: '20px 16px',
        display: 'flex', flexDirection: 'column',
        background: 'rgba(8,9,11,0.4)',
        overflow: 'auto',
      }}>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 9,
          color: 'var(--ink-3)', letterSpacing: '0.22em', textTransform: 'uppercase',
          marginBottom: 14, padding: '0 6px',
        }}>
          The floor · round 03
        </div>

        <div style={{ position: 'relative', padding: '0 6px' }}>
          {VOICES.map((v, i) => {
            const isActive = i === active;
            const r = SAMPLE_RESPONSES[i];
            return (
              <button key={v.id} onClick={() => setActive(i)} style={{
                width: '100%',
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: '12px 12px',
                marginBottom: 4,
                borderRadius: 8,
                border: '1px solid transparent',
                borderColor: isActive ? `${v.color}55` : 'transparent',
                background: isActive ? `linear-gradient(180deg, ${v.color}15, transparent)` : 'transparent',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 200ms var(--spring)',
                position: 'relative',
              }}>
                {isActive && (
                  <span style={{
                    position: 'absolute', left: -6, top: 14, bottom: 14,
                    width: 2, background: v.color,
                    boxShadow: `0 0 8px ${v.color}88`,
                  }} />
                )}
                <span style={{
                  width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                  background: `radial-gradient(circle at 35% 30%, ${v.color}cc, ${v.color}33)`,
                  border: `1px solid ${v.color}55`,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: 'var(--serif)', fontSize: 13, color: 'var(--ink-0)',
                }}>{v.initial}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3,
                  }}>
                    <span style={{ fontSize: 12.5, fontWeight: isActive ? 500 : 400, color: 'var(--ink-0)' }}>
                      {v.name}
                    </span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)' }}>
                      {(r.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div style={{
                    fontSize: 11, lineHeight: 1.45, color: 'var(--ink-2)',
                    display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>{r.tldr}</div>
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        <button style={{
          margin: '12px 6px 0',
          padding: '10px 14px',
          border: '1px solid var(--ember-hairline)',
          background: 'var(--ember-soft)',
          borderRadius: 8,
          fontFamily: 'var(--mono)', fontSize: 10,
          color: 'var(--ember)', letterSpacing: '0.14em', textTransform: 'uppercase',
          textAlign: 'left',
        }}>
          ✦ Synthesize the room
        </button>
      </div>

      {/* Reader — the speaker has the floor */}
      <div style={{ overflow: 'auto', padding: '0 56px' }}>
        <div style={{ maxWidth: '64ch', margin: '0 auto', padding: '28px 0 80px' }}>
          {/* Prompt */}
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 9,
            color: 'var(--ink-3)', letterSpacing: '0.2em', textTransform: 'uppercase',
            marginBottom: 6,
          }}>conductor asks</div>
          <p style={{
            fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 300,
            lineHeight: 1.4, letterSpacing: '-0.015em',
            margin: '0 0 32px', color: 'var(--ink-1)',
            paddingBottom: 24, borderBottom: '1px solid var(--edge-0)',
          }}>{SAMPLE_PROMPT}</p>

          {/* Speaker badge */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22,
          }}>
            <span style={{
              width: 44, height: 44, borderRadius: '50%',
              background: `radial-gradient(circle at 35% 30%, ${response.voice.color}cc, ${response.voice.color}33)`,
              border: `1px solid ${response.voice.color}55`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--serif)', fontSize: 18, color: 'var(--ink-0)',
              boxShadow: `0 0 20px ${response.voice.color}55`,
            }}>{response.voice.initial}</span>
            <div>
              <div style={{
                fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)',
                letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 2,
              }}>now speaking</div>
              <div style={{ fontSize: 16, color: 'var(--ink-0)', fontFamily: 'var(--serif)' }}>
                {response.voice.name}, <em style={{ color: 'var(--ink-2)' }}>{response.voice.role}</em>
              </div>
            </div>
          </div>

          {/* Pull-quote tldr */}
          <p style={{
            fontFamily: 'var(--serif)', fontStyle: 'italic',
            fontSize: 22, fontWeight: 300, lineHeight: 1.4, letterSpacing: '-0.01em',
            color: 'var(--ink-0)',
            margin: '0 0 32px',
            paddingLeft: 18,
            borderLeft: `2px solid ${response.voice.color}`,
          }}>
            "{response.tldr}"
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
                fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 400,
                color: 'var(--ink-0)', margin: '32px 0 14px',
                letterSpacing: '-0.01em',
              }}>{block.text}</h3>
            );
            if (block.kind === 'code') return (
              <pre key={i} style={{
                margin: '0 0 22px',
                padding: '14px 18px',
                background: 'var(--void-2)',
                border: '1px solid var(--edge-0)',
                borderRadius: 6,
                fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.6,
                color: 'var(--ink-1)',
                overflow: 'auto',
              }}>{block.text}</pre>
            );
            return null;
          })}

          {/* Footer chips — pass the floor */}
          <div style={{
            marginTop: 36, paddingTop: 20,
            borderTop: '1px solid var(--edge-0)',
            display: 'flex', alignItems: 'center', gap: 10,
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)',
            letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>
            <span>pass the floor →</span>
            {VOICES.filter((_, i) => i !== active).map((v, i) => (
              <button key={v.id} onClick={() => setActive(VOICES.indexOf(v))} style={{
                padding: '4px 10px', borderRadius: 999,
                border: `1px solid ${v.color}33`,
                background: 'transparent',
                color: v.color, fontFamily: 'var(--mono)', fontSize: 10,
                letterSpacing: '0.12em',
              }}>{v.name}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function BoardroomComposer({ phase }) {
  const [intent, setIntent] = React.useState(phase === 'reading' ? 'council' : 'council');
  const [text, setText] = React.useState('');

  return (
    <div style={{
      padding: '12px 32px 16px',
      borderTop: '1px solid var(--edge-1)',
      background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.4))',
      position: 'relative', zIndex: 3,
    }}>
      <div style={{
        maxWidth: 820, margin: '0 auto',
        display: 'flex', alignItems: 'flex-end', gap: 12,
      }}>
        {/* Routing pills, vertical mini-toggle */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 2,
          padding: 3, borderRadius: 10,
          border: '1px solid var(--edge-1)',
          background: 'var(--surf-0)',
        }}>
          {[
            { k: 'direct', label: 'D' },
            { k: 'council', label: 'C' },
            { k: 'execute', label: 'E' },
            { k: 'build', label: 'B' },
          ].map(o => (
            <button key={o.k} onClick={() => setIntent(o.k)} style={{
              width: 28, height: 24, borderRadius: 6,
              fontFamily: 'var(--mono)', fontSize: 11,
              background: intent === o.k ? 'var(--ember-soft)' : 'transparent',
              color: intent === o.k ? 'var(--ember)' : 'var(--ink-3)',
              border: intent === o.k ? '1px solid var(--ember-hairline)' : '1px solid transparent',
            }} title={o.k}>{o.label}</button>
          ))}
        </div>

        <div style={{
          flex: 1,
          border: '1px solid var(--edge-1)',
          borderRadius: 14,
          background: 'rgba(14,16,20,0.7)',
          backdropFilter: 'blur(20px)',
          padding: '10px 14px',
        }}>
          <textarea
            value={text} onChange={e => setText(e.target.value)}
            placeholder={phase === 'empty' ? 'Open the floor with a question…' : 'Reply to the room…'}
            rows={2}
            style={{
              width: '100%', resize: 'none',
              background: 'transparent', border: 'none', outline: 'none',
              fontFamily: 'var(--serif)', fontSize: 16, fontWeight: 300,
              color: 'var(--ink-0)', lineHeight: 1.5,
              padding: '2px 0',
            }}
          />
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginTop: 6,
            paddingTop: 8, borderTop: '1px solid var(--edge-0)',
          }}>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.1em' }}>
              {intent.toUpperCase()} · {intent === 'council' ? '4 voices' : intent === 'build' ? 'clawclaude' : 'haiku 4.5'}
            </span>
            <div style={{ flex: 1 }} />
            <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.1em' }}>⌘ ↵</span>
            <button style={{
              padding: '6px 18px', borderRadius: 999,
              background: 'var(--ember)', color: 'var(--void-0)',
              fontSize: 12, fontWeight: 500,
              boxShadow: '0 0 18px var(--ember-glow)',
            }}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Boardroom() {
  const [phase, setPhase] = React.useState('empty');
  return (
    <BoardroomShell>
      <BoardroomTopbar phase={phase} setPhase={setPhase} />
      <main style={{
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', position: 'relative', zIndex: 2,
      }}>
        {phase === 'empty' ? <BoardroomEmptyStage /> : <BoardroomReader />}
      </main>
      <BoardroomComposer phase={phase} />
    </BoardroomShell>
  );
}

window.Boardroom = Boardroom;
