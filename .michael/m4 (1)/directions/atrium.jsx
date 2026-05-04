/* global React, Orb, VOICES, SAMPLE_PROMPT, SAMPLE_RESPONSES, SAMPLE_THREADS */

/* ═══════════════════════════════════════════════════════════════════
   DIRECTION 1 — ATRIUM
   The refined original. Single column. Empty stage = orb + composer.
   Populated = vertical reader with a horizontal carousel of voices.
   ═══════════════════════════════════════════════════════════════════ */

const atriumStyles = {
  shell: {
    width: '100%', height: '100%',
    display: 'grid',
    gridTemplateColumns: '220px 1fr',
    gridTemplateRows: '46px 1fr',
    background: 'var(--void-0)',
    color: 'var(--ink-0)',
    fontSize: 13,
    position: 'relative',
    overflow: 'hidden',
  },
};

function AtriumTopbar({ phase, setPhase }) {
  return (
    <header style={{
      gridColumn: '1 / -1',
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '0 18px',
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
      </div>

      <div style={{ width: 1, height: 18, background: 'var(--edge-1)' }} />

      <button style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '4px 10px', borderRadius: 999,
        border: '1px solid var(--edge-1)', background: 'var(--surf-0)',
        fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-1)',
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ember)', boxShadow: '0 0 6px var(--ember-glow)' }} />
        tidewatch
        <span style={{ color: 'var(--ink-3)' }}>·</span>
        <span style={{ color: 'var(--ember)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase' }}>ask</span>
      </button>

      <div style={{ flex: 1 }} />

      {/* Phase toggle so user can preview both states */}
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

      <span style={{
        fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)',
        display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ok)' }} />
        4 voices · clawclaude
      </span>

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

function AtriumSidebar() {
  return (
    <aside style={{
      borderRight: '1px solid var(--edge-1)',
      padding: '14px 8px',
      overflow: 'auto',
      position: 'relative', zIndex: 4,
      background: 'rgba(8,9,11,0.4)',
    }}>
      {[
        { label: 'Concierge', count: 1, items: SAMPLE_THREADS.filter(t => t.kind === 'concierge') },
        { label: 'Broadcasts', count: 2, items: SAMPLE_THREADS.filter(t => t.kind === 'broadcast') },
        { label: 'Direct', count: 1, items: SAMPLE_THREADS.filter(t => t.kind === 'direct') },
        { label: 'Execution', count: 1, items: SAMPLE_THREADS.filter(t => t.kind === 'execution') },
      ].map(group => (
        <div key={group.label} style={{ marginBottom: 14 }}>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 9,
            color: 'var(--ink-3)', letterSpacing: '0.18em', textTransform: 'uppercase',
            padding: '4px 10px 6px', display: 'flex', justifyContent: 'space-between',
          }}>
            <span>{group.label}</span>
            <span>{group.count.toString().padStart(2, '0')}</span>
          </div>
          {group.items.map(t => (
            <div key={t.id} style={{
              padding: '6px 10px',
              borderRadius: 6,
              fontSize: 12,
              color: t.active ? 'var(--ink-0)' : 'var(--ink-2)',
              background: t.active ? 'var(--ember-soft)' : 'transparent',
              borderLeft: t.active ? '2px solid var(--ember)' : '2px solid transparent',
              marginBottom: 1,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{
                width: 4, height: 4, borderRadius: '50%',
                background: t.active ? 'var(--ember)' : 'var(--ink-3)',
              }} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.title}
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)' }}>
                {t.updated}
              </span>
            </div>
          ))}
        </div>
      ))}
    </aside>
  );
}

function AtriumEmptyStage() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px 32px', position: 'relative', zIndex: 2,
    }}>
      <Orb size="xl" />

      <div style={{
        marginTop: 28,
        fontFamily: 'var(--mono)', fontSize: 10,
        color: 'var(--ink-3)', letterSpacing: '0.22em', textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--ember)' }} />
        council standing by
      </div>

      <h1 style={{
        fontFamily: 'var(--serif)', fontWeight: 300,
        fontSize: 38, lineHeight: 1.15, letterSpacing: '-0.02em',
        margin: '20px 0 6px', textAlign: 'center', maxWidth: 620,
        color: 'var(--ink-0)',
      }}>
        Good evening, Michael.
      </h1>
      <p style={{
        fontFamily: 'var(--serif)', fontStyle: 'italic',
        fontSize: 18, fontWeight: 300, color: 'var(--ink-2)',
        margin: 0, textAlign: 'center', maxWidth: 540,
        letterSpacing: '-0.01em',
      }}>
        What are we building tonight?
      </p>
    </div>
  );
}

/* ────────── carousel reader (the core insight) ────────── */
function AtriumReader() {
  const [active, setActive] = React.useState(0);
  const response = SAMPLE_RESPONSES[active];
  const bodyRef = React.useRef(null);

  React.useEffect(() => { if (bodyRef.current) bodyRef.current.scrollTop = 0; }, [active]);

  return (
    <div style={{
      flex: 1, display: 'grid',
      gridTemplateColumns: '1fr',
      gridTemplateRows: 'auto 1fr auto',
      overflow: 'hidden', position: 'relative', zIndex: 2,
    }}>
      {/* Round header */}
      <div style={{
        padding: '20px 56px 18px',
        borderBottom: '1px solid var(--edge-0)',
      }}>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 9,
          color: 'var(--ink-3)', letterSpacing: '0.2em', textTransform: 'uppercase',
          marginBottom: 8,
        }}>
          round 03 · broadcast · 4 voices · 38s
        </div>
        <p style={{
          fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 300,
          lineHeight: 1.35, letterSpacing: '-0.015em',
          margin: 0, color: 'var(--ink-0)', maxWidth: '64ch',
        }}>
          {SAMPLE_PROMPT}
        </p>
      </div>

      {/* Reader body — single voice in focus */}
      <div ref={bodyRef} style={{ overflow: 'auto', padding: '0 56px' }}>
        <div style={{ maxWidth: '68ch', margin: '0 auto', padding: '32px 0 80px' }}>
          {/* Voice byline */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
            <span style={{
              width: 36, height: 36, borderRadius: '50%',
              background: `radial-gradient(circle at 35% 30%, ${response.voice.color}cc, ${response.voice.color}33)`,
              border: `1px solid ${response.voice.color}55`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--serif)', fontSize: 16, color: 'var(--ink-0)',
            }}>{response.voice.initial}</span>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--ink-0)' }}>
                {response.voice.name}
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.06em' }}>
                {response.voice.model.toUpperCase()} · {response.voice.role.toUpperCase()}
              </span>
            </div>
            <div style={{ flex: 1 }} />
            <div style={{ display: 'flex', gap: 14, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>
              <span>conf <strong style={{ color: 'var(--ink-1)', fontWeight: 500 }}>{(response.confidence * 100).toFixed(0)}%</strong></span>
              <span>{response.runtime}s</span>
              <span>{response.tokens.toLocaleString()} tok</span>
            </div>
          </div>

          {/* TL;DR */}
          <blockquote style={{
            margin: '0 0 28px',
            padding: '14px 18px',
            borderLeft: `2px solid ${response.voice.color}`,
            background: 'var(--surf-0)',
            fontFamily: 'var(--serif)', fontStyle: 'italic',
            fontSize: 16, lineHeight: 1.5, color: 'var(--ink-1)',
            letterSpacing: '-0.005em',
          }}>
            {response.tldr}
          </blockquote>

          {/* Body */}
          {response.body.map((block, i) => {
            if (block.kind === 'p') return (
              <p key={i} style={{
                fontSize: 14.5, lineHeight: 1.7, color: 'var(--ink-1)',
                margin: '0 0 18px', textWrap: 'pretty',
              }}>{block.text}</p>
            );
            if (block.kind === 'h') return (
              <h3 key={i} style={{
                fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 400,
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
        </div>
      </div>

      {/* Voice carousel — at bottom, cards are siblings */}
      <div style={{
        borderTop: '1px solid var(--edge-1)',
        padding: '12px 32px',
        background: 'rgba(8,9,11,0.6)',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 8,
        }}>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 9,
            color: 'var(--ink-3)', letterSpacing: '0.2em', textTransform: 'uppercase',
          }}>
            voices · {active + 1} of {SAMPLE_RESPONSES.length}
          </span>
          <span style={{
            fontFamily: 'var(--mono)', fontSize: 9,
            color: 'var(--ink-3)', letterSpacing: '0.12em',
          }}>
            ← → to navigate · S to synthesize
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
          {SAMPLE_RESPONSES.map((r, i) => (
            <button key={r.voice.id} onClick={() => setActive(i)} style={{
              flexShrink: 0,
              width: 240,
              padding: '12px 14px',
              border: i === active ? `1px solid ${r.voice.color}88` : '1px solid var(--edge-1)',
              background: i === active ? `linear-gradient(180deg, ${r.voice.color}18, transparent)` : 'var(--surf-0)',
              borderRadius: 8,
              textAlign: 'left',
              cursor: 'pointer',
              transition: 'all 200ms var(--spring)',
              opacity: i === active ? 1 : 0.7,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ width: 16, height: 16, borderRadius: '50%',
                  background: `radial-gradient(circle at 35% 30%, ${r.voice.color}, ${r.voice.color}55)`,
                  border: `1px solid ${r.voice.color}55`,
                }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-0)' }}>{r.voice.name}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)' }}>
                  {(r.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <div style={{
                fontSize: 11.5, lineHeight: 1.4, color: 'var(--ink-2)',
                display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                overflow: 'hidden', textWrap: 'pretty',
              }}>{r.tldr}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function AtriumComposer({ phase }) {
  const [intent, setIntent] = React.useState('council');
  const [text, setText] = React.useState(phase === 'reading' ? '' : '');

  return (
    <div style={{
      padding: '14px 32px 18px',
      borderTop: '1px solid var(--edge-1)',
      background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.4))',
      position: 'relative', zIndex: 3,
    }}>
      <div style={{
        maxWidth: 760, margin: '0 auto',
        border: '1px solid var(--edge-1)',
        borderRadius: 14,
        background: 'rgba(14,16,20,0.7)',
        backdropFilter: 'blur(20px)',
        padding: 12,
      }}>
        {/* Routing strip — minimal pill row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
          {['direct', 'council', 'execute', 'build'].map(k => (
            <button key={k} onClick={() => setIntent(k)} style={{
              padding: '4px 11px', borderRadius: 999,
              fontSize: 11, fontFamily: 'var(--mono)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              border: intent === k ? '1px solid var(--ember-hairline)' : '1px solid transparent',
              background: intent === k ? 'var(--ember-soft)' : 'transparent',
              color: intent === k ? 'var(--ember)' : 'var(--ink-3)',
            }}>{k}</button>
          ))}
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)' }}>
            {intent === 'council' ? '4 voices ready' : intent === 'build' ? 'clawclaude · build' : `${intent} mode`}
          </span>
        </div>

        <textarea
          value={text} onChange={e => setText(e.target.value)}
          placeholder={phase === 'empty' ? 'Begin a thought…' : 'Reply, refine, or pivot…'}
          rows={2}
          style={{
            width: '100%', resize: 'none',
            background: 'transparent', border: 'none', outline: 'none',
            fontFamily: 'var(--serif)', fontSize: 17, fontWeight: 300,
            color: 'var(--ink-0)', lineHeight: 1.5,
            padding: '4px 4px 8px',
          }}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <button style={{
            padding: '5px 11px', borderRadius: 6,
            border: '1px solid var(--edge-1)', background: 'var(--surf-0)',
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-2)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>haiku 4.5 ▾</button>
          <button style={{
            padding: '5px 11px', borderRadius: 6,
            border: '1px solid var(--edge-1)', background: 'var(--surf-0)',
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-2)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>roster · 4</button>
          <div style={{ flex: 1 }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.1em' }}>
            ⌘ ↵
          </span>
          <button style={{
            padding: '6px 16px', borderRadius: 999,
            background: 'var(--ember)', color: 'var(--void-0)',
            fontSize: 12, fontWeight: 500,
            boxShadow: '0 0 18px var(--ember-glow)',
          }}>Send</button>
        </div>
      </div>
    </div>
  );
}

function Atrium({ phase: phaseProp = 'empty' }) {
  const [phase, setPhase] = React.useState(phaseProp);
  return (
    <div style={atriumStyles.shell}>
      <div className="void-bg" style={{ zIndex: 0 }} />
      <div className="void-grain" style={{ zIndex: 1 }} />
      <div className="void-vignette" style={{ zIndex: 1 }} />

      <AtriumTopbar phase={phase} setPhase={setPhase} />
      <AtriumSidebar />

      <main style={{
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', position: 'relative', zIndex: 2,
      }}>
        {phase === 'empty' ? <AtriumEmptyStage /> : <AtriumReader />}
        <AtriumComposer phase={phase} />
      </main>
    </div>
  );
}

window.Atrium = Atrium;
