/* global React, Orb, VOICES, SAMPLE_PROMPT, SAMPLE_RESPONSES, SAMPLE_THREADS */

/* ═══════════════════════════════════════════════════════════════════
   ATELIER — the merged direction
   • Atrium topbar (Maestro brand · session pill · status · M avatar)
   • Collapsible thread sidebar w/ drawer hotkeys
   • Boardroom centerpiece (semicircle table) for empty stage
   • Boardroom-style left rail + reader for populated state
   • Atrium-style horizontal voice carousel at bottom of reader
   • Vertical routing rail composer with serif input
   • Right-side drawers (Roster, Trust, Vault) preserved
   ═══════════════════════════════════════════════════════════════════ */

function AtelierTopbar({ phase, setPhase, sidebarOpen, setSidebarOpen, openDrawer, setOpenDrawer }) {
  return (
    <header style={{
      gridColumn: '1 / -1',
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '0 16px',
      borderBottom: '1px solid var(--edge-1)',
      background: 'rgba(8,9,11,0.72)',
      backdropFilter: 'blur(20px)',
      position: 'relative', zIndex: 10,
    }}>
      {/* Sidebar toggle */}
      <button onClick={() => setSidebarOpen(s => !s)} style={{
        width: 28, height: 28, borderRadius: 6,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: 'var(--ink-2)', border: '1px solid transparent',
      }} title="Toggle sidebar (⌘\\)">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="16" rx="2"/><line x1="9" y1="4" x2="9" y2="20"/>
        </svg>
      </button>

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
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
      </button>

      <button style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '4px 10px', borderRadius: 999,
        border: '1px solid rgba(217,119,87,0.18)', background: 'rgba(217,119,87,0.08)',
        fontSize: 11, color: 'var(--ink-1)',
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--ok)' }} />
        Concierge: <strong style={{ color: 'var(--ink-0)', fontWeight: 500 }}>Haiku 4.5</strong>
        <span style={{ color: 'var(--ink-3)' }}>·</span>
        <span style={{ color: 'var(--ink-2)' }}>4 keys · clawclaude</span>
      </button>

      <div style={{ flex: 1 }} />

      {/* Phase toggle (mockup helper) */}
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

      {/* Drawer hotkey caps */}
      {[
        { id: 'roster', label: 'Roster', key: '⌘O', icon: <path d="M9 18V5l12-2v13"/> },
        { id: 'trust',  label: 'Trust',  key: '⌘J', icon: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/> },
        { id: 'vault',  label: 'Vault',  key: '⌘K', icon: <><circle cx="12" cy="16" r="1"/><path d="M5 11V7a7 7 0 0 1 14 0v4"/><rect x="3" y="11" width="18" height="11" rx="2"/></> },
      ].map(d => (
        <button key={d.id}
          onClick={() => setOpenDrawer(openDrawer === d.id ? null : d.id)}
          style={{
            width: 30, height: 28, borderRadius: 6,
            border: openDrawer === d.id ? '1px solid var(--ember-hairline)' : '1px solid var(--edge-1)',
            background: openDrawer === d.id ? 'var(--ember-soft)' : 'var(--surf-0)',
            color: openDrawer === d.id ? 'var(--ember)' : 'var(--ink-2)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          }}
          title={`${d.label} (${d.key})`}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">{d.icon}</svg>
        </button>
      ))}

      <div style={{
        marginLeft: 4,
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '3px 4px 3px 12px', borderRadius: 999,
        border: '1px solid var(--edge-1)', background: 'var(--surf-0)',
        fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-2)',
        letterSpacing: '0.14em', textTransform: 'uppercase',
      }}>
        Conductor
        <span style={{
          width: 22, height: 22, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--ember-soft), var(--surf-2))',
          border: '1px solid var(--ember-hairline)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--serif)', fontSize: 11, color: 'var(--ember)',
          letterSpacing: 0,
        }}>M</span>
      </div>
    </header>
  );
}

function AtelierSidebar({ open }) {
  return (
    <aside style={{
      borderRight: '1px solid var(--edge-1)',
      padding: '14px 8px',
      overflow: 'auto',
      position: 'relative', zIndex: 4,
      background: 'rgba(8,9,11,0.4)',
      width: open ? 240 : 0,
      transition: 'width 280ms var(--spring)',
      flexShrink: 0,
    }}>
      <div style={{ width: 224, opacity: open ? 1 : 0, transition: 'opacity 200ms' }}>
        {/* New thread button */}
        <button style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px', marginBottom: 12,
          borderRadius: 8, border: '1px dashed var(--edge-2)',
          color: 'var(--ink-2)', fontSize: 12,
          background: 'transparent',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          New thread
          <span style={{ flex: 1 }} />
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)' }}>⌘N</span>
        </button>

        {[
          { label: 'Concierge', items: SAMPLE_THREADS.filter(t => t.kind === 'concierge') },
          { label: 'Broadcasts', items: SAMPLE_THREADS.filter(t => t.kind === 'broadcast') },
          { label: 'Direct', items: SAMPLE_THREADS.filter(t => t.kind === 'direct') },
          { label: 'Execution', items: SAMPLE_THREADS.filter(t => t.kind === 'execution') },
        ].map(group => (
          <div key={group.label} style={{ marginBottom: 14 }}>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 9,
              color: 'var(--ink-3)', letterSpacing: '0.18em', textTransform: 'uppercase',
              padding: '4px 10px 6px', display: 'flex', justifyContent: 'space-between',
            }}>
              <span>{group.label}</span>
              <span>{group.items.length.toString().padStart(2, '0')}</span>
            </div>
            {group.items.length === 0 ? (
              <div style={{
                padding: '4px 12px', fontSize: 11, color: 'var(--ink-4)',
                fontStyle: 'italic',
              }}>—</div>
            ) : group.items.map(t => (
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
      </div>
    </aside>
  );
}

/* ────────── Boardroom table (empty state) ────────── */
function AtelierTable() {
  const seats = VOICES.map((v, i) => {
    const total = VOICES.length;
    const angle = -160 + (i * (140 / (total - 1)));
    const rad = angle * Math.PI / 180;
    const radius = 220;
    return { ...v, x: Math.cos(rad) * radius, y: Math.sin(rad) * radius * 0.55 };
  });

  return (
    <div style={{ position: 'relative', width: 560, height: 360, margin: '0 auto' }}>
      <div style={{
        position: 'absolute', left: '50%', top: '60%',
        width: 540, height: 200, transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.025), transparent 70%)',
        border: '1px solid var(--edge-0)',
        boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5)',
      }} />

      <div style={{
        position: 'absolute', left: '50%', top: '15%',
        transform: 'translate(-50%, -50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
      }}>
        <Orb size="lg" />
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)',
          letterSpacing: '0.22em', textTransform: 'uppercase',
        }}>Concierge</span>
      </div>

      {seats.map((seat) => (
        <div key={seat.id} style={{
          position: 'absolute',
          left: `calc(50% + ${seat.x}px)`,
          top: `calc(60% + ${seat.y}px)`,
          transform: 'translate(-50%, -50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        }}>
          <span style={{
            width: 52, height: 52, borderRadius: '50%',
            background: `radial-gradient(circle at 35% 30%, ${seat.color}cc, ${seat.color}33)`,
            border: `1px solid ${seat.color}55`,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--serif)', fontSize: 22, color: 'var(--ink-0)',
          }}>{seat.initial}</span>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--ink-2)' }}>{seat.name}</div>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 8.5,
              color: 'var(--ink-3)', letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>{seat.role}</div>
          </div>
        </div>
      ))}

      <div style={{
        position: 'absolute', left: '50%', top: 'calc(60% + 130px)',
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

function AtelierEmptyStage() {
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
        the boardroom · 21:42
      </div>
      <h1 style={{
        fontFamily: 'var(--serif)', fontWeight: 300,
        fontSize: 32, lineHeight: 1.2, letterSpacing: '-0.02em',
        margin: '0 0 4px', textAlign: 'center', maxWidth: 620,
        color: 'var(--ink-0)',
      }}>
        Good evening, Michael.
      </h1>
      <p style={{
        fontFamily: 'var(--serif)', fontStyle: 'italic',
        fontSize: 17, fontWeight: 300, color: 'var(--ink-2)',
        margin: '0 0 28px', textAlign: 'center',
      }}>
        Four advisors are seated. Open the floor.
      </p>

      <AtelierTable />
    </div>
  );
}

/* ────────── Advisor Strip — persistent compressed-arc table ──────────
   Lives at top of main area in `live` and `reading` phases.
   Each seat shows live state via a ring. Click to call forward.
   Center holds the synthesis seat (Conductor's orb).
   ──────────────────────────────────────────────────────────────────── */
function SeatRing({ state, color }) {
  // ring around portrait — pulse / fill / solid / dim
  const base = {
    position: 'absolute', inset: -3,
    borderRadius: '50%', pointerEvents: 'none',
  };
  if (state === 'thinking') return (
    <span style={{ ...base, border: `1.5px dashed ${color}88`, animation: 'spin 4s linear infinite' }} />
  );
  if (state === 'streaming') return (
    <span style={{ ...base, border: `1.5px solid ${color}`, boxShadow: `0 0 12px ${color}aa`, animation: 'pulse 1.4s ease-in-out infinite' }} />
  );
  if (state === 'ready') return (
    <span style={{ ...base, border: `1.5px solid ${color}cc`, boxShadow: `0 0 8px ${color}66` }} />
  );
  return <span style={{ ...base, border: `1px solid ${color}33` }} />; // spoken/dim
}

function AdvisorStrip({ forwardId, onCall, onSynthesize, synthesisActive }) {
  // Seats laid out on a gentle arc (table viewed from above, compressed)
  const total = VOICES.length;
  const arcWidth = 520;
  const arcHeight = 18; // very subtle curve
  const seats = VOICES.map((v, i) => {
    const t = total === 1 ? 0.5 : i / (total - 1);
    const x = (t - 0.5) * arcWidth;
    const y = -Math.sin(t * Math.PI) * arcHeight; // upward arc
    return { ...v, x, y, idx: i };
  });

  return (
    <div style={{
      position: 'relative',
      height: 96,
      borderBottom: '1px solid var(--edge-1)',
      background: 'linear-gradient(180deg, rgba(11,12,15,0.6), rgba(8,9,11,0.3))',
      backdropFilter: 'blur(20px)',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      {/* faint table surface line */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <path
          d={`M ${'50% - 280px'.replace('50%', '50%')} 70 Q 50% 56, calc(50% + 280px) 70`}
          stroke="var(--edge-0)" strokeWidth="1" fill="none"
        />
      </svg>
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 22,
        height: 1,
        background: 'linear-gradient(90deg, transparent, var(--edge-1) 20%, var(--edge-1) 80%, transparent)',
      }} />

      {/* round indicator left */}
      <div style={{
        position: 'absolute', left: 20, top: 14,
        fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)',
        letterSpacing: '0.22em', textTransform: 'uppercase',
      }}>
        Round 03 · The floor
      </div>

      {/* hotkey hint right */}
      <div style={{
        position: 'absolute', right: 20, top: 14,
        fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)',
        letterSpacing: '0.16em',
      }}>
        1–4 call · 0 synth · esc table
      </div>

      {/* center: synthesis seat */}
      <button onClick={onSynthesize} style={{
        position: 'absolute', left: '50%', top: '52%',
        transform: 'translate(-50%, -50%)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        padding: 0, background: 'transparent',
      }} title="Synthesize the room (0)">
        <span style={{
          position: 'relative',
          width: 40, height: 40, borderRadius: '50%',
          background: synthesisActive
            ? 'radial-gradient(circle at 35% 30%, rgba(255,235,180,0.95), var(--ember) 45%, rgba(80,50,10,0.4) 80%)'
            : 'radial-gradient(circle at 35% 30%, rgba(255,235,180,0.7), var(--ember) 50%, rgba(40,30,10,0.5) 90%)',
          boxShadow: synthesisActive
            ? '0 0 24px var(--ember-glow), inset 0 0 10px rgba(255,235,180,0.4)'
            : '0 0 12px var(--ember-glow)',
          border: synthesisActive ? '1px solid var(--ember)' : '1px solid var(--ember-hairline)',
          transition: 'all 240ms var(--spring)',
        }} />
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 8, color: synthesisActive ? 'var(--ember)' : 'var(--ink-3)',
          letterSpacing: '0.22em', textTransform: 'uppercase',
        }}>Synth</span>
      </button>

      {/* seats */}
      {seats.map(seat => {
        const isForward = forwardId === seat.id;
        const liveState = SAMPLE_SEAT_STATES[seat.id] || 'spoken';
        const portraitDim = isForward ? 0 : 36; // hide when forward (it's flown to hero)

        // distribute seats around the synthesis center, skipping center slot
        const offsetX = seat.idx < total / 2
          ? seat.x - 60
          : seat.x + 60;

        return (
          <button
            key={seat.id}
            onClick={() => onCall(seat.id)}
            disabled={isForward}
            style={{
              position: 'absolute',
              left: `calc(50% + ${offsetX}px)`,
              top: `calc(52% + ${seat.y}px)`,
              transform: 'translate(-50%, -50%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: 0, background: 'transparent',
              opacity: isForward ? 0 : (liveState === 'spoken' ? 0.55 : 1),
              transition: 'opacity 240ms var(--ease)',
              cursor: isForward ? 'default' : 'pointer',
            }}
            title={`${seat.name} — call forward (${seat.idx + 1})`}
          >
            <span style={{
              position: 'relative',
              width: portraitDim, height: portraitDim,
              borderRadius: '50%',
              background: `radial-gradient(circle at 35% 30%, ${seat.color}cc, ${seat.color}33)`,
              border: `1px solid ${seat.color}55`,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--serif)', fontSize: 15, color: 'var(--ink-0)',
              transition: 'all 240ms var(--spring)',
            }}>
              <SeatRing state={liveState} color={seat.color} />
              {seat.initial}
            </span>
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--ink-3)',
              letterSpacing: '0.18em', textTransform: 'uppercase',
            }}>
              {seat.idx + 1} · {seat.name}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ────────── Hero zone — forward advisor portrait + identity ────────── */
function AdvisorHero({ voice, response }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 22,
      padding: '28px 0 22px',
      borderBottom: `1px solid ${voice.color}22`,
      marginBottom: 28,
    }}>
      <div style={{ position: 'relative' }}>
        <span style={{
          position: 'absolute', inset: -16, borderRadius: '50%',
          background: `radial-gradient(circle, ${voice.color}33, transparent 70%)`,
          filter: 'blur(12px)',
        }} />
        <span style={{
          position: 'relative',
          width: 72, height: 72, borderRadius: '50%',
          background: `radial-gradient(circle at 35% 30%, ${voice.color}dd, ${voice.color}44)`,
          border: `1px solid ${voice.color}88`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--serif)', fontSize: 30, color: 'var(--ink-0)',
          boxShadow: `0 0 32px ${voice.color}55, inset 0 0 16px ${voice.color}22`,
        }}>{voice.initial}</span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)',
          letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 4,
        }}>now speaking · {(response.confidence * 100).toFixed(0)}% confidence</div>
        <div style={{
          fontFamily: 'var(--serif)', fontSize: 26, fontWeight: 300,
          letterSpacing: '-0.015em', color: 'var(--ink-0)', marginBottom: 2,
        }}>
          {voice.name}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-2)', fontFamily: 'var(--serif)', fontStyle: 'italic' }}>
          {voice.role} · {voice.model}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-2)',
        }}>{response.tokens.toLocaleString()} tok · {response.runtime}s</span>
        <button style={{
          padding: '4px 10px', borderRadius: 6,
          border: '1px solid var(--edge-1)', background: 'var(--surf-0)',
          fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-2)',
          letterSpacing: '0.14em', textTransform: 'uppercase',
        }}>Pin to canvas</button>
      </div>
    </div>
  );
}

/* ────────── Reader — replaces the old AtelierReader ────────── */
function AtelierLiveReader({ forwardId, setForwardId, synthesis, setSynthesis }) {
  const forwardIdx = VOICES.findIndex(v => v.id === forwardId);
  const response = forwardIdx >= 0 ? SAMPLE_RESPONSES[forwardIdx] : null;
  const voice = response?.voice;

  // keyboard shortcuts
  React.useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= VOICES.length) {
        setForwardId(VOICES[n - 1].id);
        setSynthesis(false);
      } else if (e.key === '0') {
        setSynthesis(true);
      } else if (e.key === 'ArrowLeft' && forwardIdx > 0) {
        setForwardId(VOICES[forwardIdx - 1].id);
      } else if (e.key === 'ArrowRight' && forwardIdx < VOICES.length - 1) {
        setForwardId(VOICES[forwardIdx + 1].id);
      } else if (e.key === 'Escape') {
        setForwardId(null);
        setSynthesis(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [forwardIdx, setForwardId, setSynthesis]);

  // tint the reader with the forward voice's color
  const tint = synthesis ? 'var(--ember)' : (voice?.color || 'transparent');

  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      overflow: 'hidden', position: 'relative', zIndex: 2,
    }}>
      <AdvisorStrip
        forwardId={synthesis ? null : forwardId}
        onCall={(id) => { setForwardId(id); setSynthesis(false); }}
        onSynthesize={() => setSynthesis(true)}
        synthesisActive={synthesis}
      />

      <div style={{
        flex: 1, overflow: 'auto', position: 'relative',
        // subtle voice tint — 3% scrim at top
        background: tint && tint !== 'transparent'
          ? `linear-gradient(180deg, ${tint}08 0%, transparent 280px)`
          : 'transparent',
        transition: 'background 320ms var(--ease)',
      }}>
        <div style={{ maxWidth: '68ch', margin: '0 auto', padding: '0 56px 40px' }}>
          {/* Conductor's question — always pinned */}
          <div style={{ paddingTop: 28 }}>
            <div style={{
              fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)',
              letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 6,
            }}>conductor asks</div>
            <p style={{
              fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 300,
              lineHeight: 1.45, letterSpacing: '-0.015em',
              margin: '0 0 8px', color: 'var(--ink-1)',
            }}>{SAMPLE_PROMPT}</p>
          </div>

          {synthesis ? (
            <SynthesisView />
          ) : voice ? (
            <>
              <AdvisorHero voice={voice} response={response} />

              <p style={{
                fontFamily: 'var(--serif)', fontStyle: 'italic',
                fontSize: 22, fontWeight: 300, lineHeight: 1.4, letterSpacing: '-0.01em',
                color: 'var(--ink-0)', margin: '0 0 28px',
                paddingLeft: 18, borderLeft: `2px solid ${voice.color}`,
              }}>"{response.tldr}"</p>

              {response.body.map((block, i) => {
                if (block.kind === 'p') return <p key={i} style={{ fontSize: 14.5, lineHeight: 1.75, color: 'var(--ink-1)', margin: '0 0 18px', textWrap: 'pretty' }}>{block.text}</p>;
                if (block.kind === 'h') return <h3 key={i} style={{ fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 400, color: 'var(--ink-0)', margin: '28px 0 14px', letterSpacing: '-0.01em' }}>{block.text}</h3>;
                if (block.kind === 'code') return <pre key={i} style={{ margin: '0 0 22px', padding: '14px 18px', background: 'var(--void-2)', border: '1px solid var(--edge-0)', borderRadius: 6, fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.6, color: 'var(--ink-1)', overflow: 'auto' }}>{block.text}</pre>;
                return null;
              })}

              {/* footer nav: prev / next advisor */}
              <div style={{
                marginTop: 36, paddingTop: 22,
                borderTop: '1px solid var(--edge-0)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)',
                letterSpacing: '0.1em',
              }}>
                <button
                  onClick={() => forwardIdx > 0 && setForwardId(VOICES[forwardIdx - 1].id)}
                  disabled={forwardIdx <= 0}
                  style={{
                    color: forwardIdx > 0 ? 'var(--ink-2)' : 'var(--ink-4)',
                    background: 'transparent',
                  }}>
                  ← {forwardIdx > 0 ? VOICES[forwardIdx - 1].name : '—'}
                </button>
                <button onClick={() => setSynthesis(true)} style={{
                  fontFamily: 'var(--mono)', fontSize: 10,
                  color: 'var(--ember)', letterSpacing: '0.18em', textTransform: 'uppercase',
                  border: '1px solid var(--ember-hairline)',
                  background: 'var(--ember-soft)',
                  padding: '6px 14px', borderRadius: 999,
                }}>✦ Synthesize the room</button>
                <button
                  onClick={() => forwardIdx < VOICES.length - 1 && setForwardId(VOICES[forwardIdx + 1].id)}
                  disabled={forwardIdx >= VOICES.length - 1}
                  style={{
                    color: forwardIdx < VOICES.length - 1 ? 'var(--ink-2)' : 'var(--ink-4)',
                    background: 'transparent',
                  }}>
                  {forwardIdx < VOICES.length - 1 ? VOICES[forwardIdx + 1].name : '—'} →
                </button>
              </div>
            </>
          ) : (
            <div style={{ padding: '48px 0', textAlign: 'center' }}>
              <p style={{
                fontFamily: 'var(--serif)', fontStyle: 'italic',
                fontSize: 18, fontWeight: 300, color: 'var(--ink-2)',
                margin: 0,
              }}>The floor is open. Call an advisor forward.</p>
              <p style={{
                fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)',
                letterSpacing: '0.16em', marginTop: 10,
              }}>press 1–4, or click a seat above</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ────────── Synthesis view — merged answer with attribution chips ────────── */
function SynthesisView() {
  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 16,
        padding: '24px 0 22px',
        borderBottom: '1px solid var(--ember-hairline)',
        marginBottom: 26,
      }}>
        <div style={{ position: 'relative' }}>
          <span style={{
            position: 'absolute', inset: -14, borderRadius: '50%',
            background: 'radial-gradient(circle, var(--ember-glow), transparent 70%)',
            filter: 'blur(10px)',
          }} />
          <Orb size="lg" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ember)',
            letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 4,
          }}>synthesis · concierge</div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 300, color: 'var(--ink-0)', letterSpacing: '-0.01em' }}>
            The room, woven
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-2)', fontFamily: 'var(--serif)', fontStyle: 'italic' }}>
            Haiku 4.5 merged 4 voices · 11.2k tokens
          </div>
        </div>
      </div>

      <p style={{
        fontFamily: 'var(--serif)', fontStyle: 'italic',
        fontSize: 22, fontWeight: 300, lineHeight: 1.4, letterSpacing: '-0.01em',
        color: 'var(--ink-0)', margin: '0 0 28px',
        paddingLeft: 18, borderLeft: '2px solid var(--ember)',
      }}>"The room agrees: lead with synthesis, but expose the disagreement. The unit is the tension, not the bullet list."</p>

      <p style={{ fontSize: 14.5, lineHeight: 1.75, color: 'var(--ink-1)', margin: '0 0 18px', textWrap: 'pretty' }}>
        Three voices converge on a layered approach: a synthesized response on top
        <Cite voice={VOICES[2]} />, with the four originals available for archeology
        <Cite voice={VOICES[0]} />. The dissent <Cite voice={VOICES[3]} /> argues this still
        flattens conflict — and the build voice <Cite voice={VOICES[1]} /> wants a 4-up grid
        instead of any reader at all.
      </p>

      <h3 style={{ fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 400, color: 'var(--ink-0)', margin: '28px 0 14px', letterSpacing: '-0.01em' }}>
        Where they disagree
      </h3>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 22,
      }}>
        {[
          { a: VOICES[0], b: VOICES[1], topic: 'Layout primitive', aStance: 'Long-form reader', bStance: 'Card grid' },
          { a: VOICES[2], b: VOICES[3], topic: 'What is the page about?', aStance: 'The merged answer', bStance: 'The conflict map' },
        ].map((c, i) => (
          <div key={i} style={{
            padding: 14, borderRadius: 8,
            border: '1px solid var(--edge-1)', background: 'var(--surf-0)',
          }}>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 8 }}>
              {c.topic}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, ${c.a.color}, ${c.a.color}55)`, border: `1px solid ${c.a.color}55`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--serif)', fontSize: 9, color: 'var(--ink-0)', flexShrink: 0 }}>{c.a.initial}</span>
                <span style={{ fontSize: 12.5, color: 'var(--ink-1)', fontFamily: 'var(--serif)', fontStyle: 'italic' }}>{c.aStance}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 18, height: 18, borderRadius: '50%', background: `radial-gradient(circle at 35% 30%, ${c.b.color}, ${c.b.color}55)`, border: `1px solid ${c.b.color}55`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--serif)', fontSize: 9, color: 'var(--ink-0)', flexShrink: 0 }}>{c.b.initial}</span>
                <span style={{ fontSize: 12.5, color: 'var(--ink-1)', fontFamily: 'var(--serif)', fontStyle: 'italic' }}>{c.bStance}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Cite({ voice }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      width: 18, height: 18, borderRadius: '50%',
      background: `radial-gradient(circle at 35% 30%, ${voice.color}, ${voice.color}55)`,
      border: `1px solid ${voice.color}88`,
      fontFamily: 'var(--serif)', fontSize: 10, color: 'var(--ink-0)',
      justifyContent: 'center',
      verticalAlign: 'middle',
      margin: '0 2px',
      cursor: 'pointer',
    }} title={`${voice.name}'s response`}>{voice.initial}</span>
  );
}

/* ────────── Reader (boardroom rail + atrium carousel) ────────── */
function AtelierReader() {
  const [active, setActive] = React.useState(0);
  const response = SAMPLE_RESPONSES[active];

  return (
    <div style={{
      flex: 1, display: 'grid',
      gridTemplateColumns: '300px 1fr',
      gridTemplateRows: '1fr auto',
      overflow: 'hidden', position: 'relative', zIndex: 2,
    }}>
      {/* Left rail — speakers */}
      <div style={{
        gridRow: '1 / -1',
        borderRight: '1px solid var(--edge-1)',
        padding: '20px 14px',
        background: 'rgba(8,9,11,0.4)',
        overflow: 'auto',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          fontFamily: 'var(--mono)', fontSize: 9,
          color: 'var(--ink-3)', letterSpacing: '0.22em', textTransform: 'uppercase',
          marginBottom: 14, padding: '0 6px',
        }}>The floor · round 03</div>

        {VOICES.map((v, i) => {
          const isActive = i === active;
          const r = SAMPLE_RESPONSES[i];
          return (
            <button key={v.id} onClick={() => setActive(i)} style={{
              width: '100%',
              display: 'flex', alignItems: 'flex-start', gap: 12,
              padding: '12px',
              marginBottom: 4,
              borderRadius: 8,
              border: isActive ? `1px solid ${v.color}55` : '1px solid transparent',
              background: isActive ? `linear-gradient(180deg, ${v.color}15, transparent)` : 'transparent',
              textAlign: 'left',
              cursor: 'pointer',
              position: 'relative',
              transition: 'all 200ms var(--spring)',
            }}>
              {isActive && (
                <span style={{
                  position: 'absolute', left: -6, top: 14, bottom: 14,
                  width: 2, background: v.color, boxShadow: `0 0 8px ${v.color}88`,
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 12.5, fontWeight: isActive ? 500 : 400, color: 'var(--ink-0)' }}>{v.name}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)' }}>{(r.confidence * 100).toFixed(0)}%</span>
                </div>
                <div style={{
                  fontSize: 11, lineHeight: 1.45, color: 'var(--ink-2)',
                  display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                }}>{r.tldr}</div>
              </div>
            </button>
          );
        })}

        <div style={{ flex: 1 }} />
        <button style={{
          margin: '12px 6px 0', padding: '10px 14px',
          border: '1px solid var(--ember-hairline)',
          background: 'var(--ember-soft)',
          borderRadius: 8,
          fontFamily: 'var(--mono)', fontSize: 10,
          color: 'var(--ember)', letterSpacing: '0.14em', textTransform: 'uppercase',
          textAlign: 'left',
        }}>✦ Synthesize the room</button>
      </div>

      {/* Reader column */}
      <div style={{ overflow: 'auto', padding: '0 56px' }}>
        <div style={{ maxWidth: '64ch', margin: '0 auto', padding: '24px 0 40px' }}>
          <div style={{
            fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)',
            letterSpacing: '0.2em', textTransform: 'uppercase', marginBottom: 6,
          }}>conductor asks</div>
          <p style={{
            fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 300,
            lineHeight: 1.4, letterSpacing: '-0.015em',
            margin: '0 0 28px', color: 'var(--ink-1)',
            paddingBottom: 22, borderBottom: '1px solid var(--edge-0)',
          }}>{SAMPLE_PROMPT}</p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 22 }}>
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

          <p style={{
            fontFamily: 'var(--serif)', fontStyle: 'italic',
            fontSize: 22, fontWeight: 300, lineHeight: 1.4, letterSpacing: '-0.01em',
            color: 'var(--ink-0)', margin: '0 0 28px',
            paddingLeft: 18, borderLeft: `2px solid ${response.voice.color}`,
          }}>"{response.tldr}"</p>

          {response.body.map((block, i) => {
            if (block.kind === 'p') return <p key={i} style={{ fontSize: 14.5, lineHeight: 1.75, color: 'var(--ink-1)', margin: '0 0 18px', textWrap: 'pretty' }}>{block.text}</p>;
            if (block.kind === 'h') return <h3 key={i} style={{ fontFamily: 'var(--serif)', fontSize: 19, fontWeight: 400, color: 'var(--ink-0)', margin: '28px 0 14px', letterSpacing: '-0.01em' }}>{block.text}</h3>;
            if (block.kind === 'code') return <pre key={i} style={{ margin: '0 0 22px', padding: '14px 18px', background: 'var(--void-2)', border: '1px solid var(--edge-0)', borderRadius: 6, fontFamily: 'var(--mono)', fontSize: 12, lineHeight: 1.6, color: 'var(--ink-1)', overflow: 'auto' }}>{block.text}</pre>;
            return null;
          })}
        </div>
      </div>

      {/* Bottom voice carousel — atrium-style, spans the reader column only */}
      <div style={{
        gridColumn: '2 / 3',
        borderTop: '1px solid var(--edge-1)',
        padding: '12px 32px',
        background: 'rgba(8,9,11,0.6)',
        backdropFilter: 'blur(12px)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.2em', textTransform: 'uppercase' }}>
            voices · {active + 1} of {SAMPLE_RESPONSES.length}
          </span>
          <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)', letterSpacing: '0.12em' }}>
            ← → navigate · S synthesize
          </span>
        </div>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 }}>
          {SAMPLE_RESPONSES.map((r, i) => (
            <button key={r.voice.id} onClick={() => setActive(i)} style={{
              flexShrink: 0, width: 220, padding: '10px 12px',
              border: i === active ? `1px solid ${r.voice.color}88` : '1px solid var(--edge-1)',
              background: i === active ? `linear-gradient(180deg, ${r.voice.color}18, transparent)` : 'var(--surf-0)',
              borderRadius: 8, textAlign: 'left', cursor: 'pointer',
              transition: 'all 200ms var(--spring)',
              opacity: i === active ? 1 : 0.7,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
                <span style={{ width: 14, height: 14, borderRadius: '50%',
                  background: `radial-gradient(circle at 35% 30%, ${r.voice.color}, ${r.voice.color}55)`,
                  border: `1px solid ${r.voice.color}55`,
                }} />
                <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--ink-0)' }}>{r.voice.name}</span>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)' }}>{(r.confidence * 100).toFixed(0)}%</span>
              </div>
              <div style={{
                fontSize: 11, lineHeight: 1.4, color: 'var(--ink-2)',
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

/* ────────── Composer (Boardroom vertical rail) ────────── */
function AtelierComposer({ phase }) {
  const [intent, setIntent] = React.useState('council');
  const [text, setText] = React.useState('');

  const intents = [
    { k: 'direct',  label: 'D', name: 'Direct',  hint: 'Concierge only · 1 voice' },
    { k: 'council', label: 'C', name: 'Council', hint: '4 voices, side-by-side' },
    { k: 'execute', label: 'E', name: 'Execute', hint: 'Run a build session' },
    { k: 'build',   label: 'B', name: 'Build',   hint: 'ClawClaude · local executor' },
  ];
  const current = intents.find(i => i.k === intent);

  return (
    <div style={{
      padding: '12px 32px 16px',
      borderTop: '1px solid var(--edge-1)',
      background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.4))',
      position: 'relative', zIndex: 3,
    }}>
      <div style={{
        maxWidth: 860, margin: '0 auto',
        display: 'flex', alignItems: 'flex-end', gap: 10,
      }}>
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 2,
          padding: 3, borderRadius: 10,
          border: '1px solid var(--edge-1)', background: 'var(--surf-0)',
        }}>
          {intents.map(o => (
            <button key={o.k} onClick={() => setIntent(o.k)} style={{
              width: 30, height: 26, borderRadius: 6,
              fontFamily: 'var(--mono)', fontSize: 11,
              background: intent === o.k ? 'var(--ember-soft)' : 'transparent',
              color: intent === o.k ? 'var(--ember)' : 'var(--ink-3)',
              border: intent === o.k ? '1px solid var(--ember-hairline)' : '1px solid transparent',
            }} title={`${o.name} — ${o.hint}`}>{o.label}</button>
          ))}
        </div>

        <div style={{
          flex: 1,
          border: '1px solid var(--edge-1)', borderRadius: 14,
          background: 'rgba(14,16,20,0.7)', backdropFilter: 'blur(20px)',
          padding: '10px 14px',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6,
            fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)',
            letterSpacing: '0.1em',
          }}>
            <span style={{ color: 'var(--ember)', textTransform: 'uppercase', letterSpacing: '0.18em' }}>
              {current.name}
            </span>
            <span style={{ opacity: 0.5 }}>—</span>
            <span>{current.hint}</span>
          </div>
          <textarea
            value={text} onChange={e => setText(e.target.value)}
            placeholder={phase === 'empty' ? 'Open the floor with a question…' : 'Reply, refine, or pivot…'}
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
            <button style={{
              padding: '4px 10px', borderRadius: 6,
              border: '1px solid var(--edge-1)', background: 'var(--surf-0)',
              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-2)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>Haiku 4.5 ▾</button>
            <button style={{
              padding: '4px 10px', borderRadius: 6,
              border: '1px solid var(--edge-1)', background: 'var(--surf-0)',
              fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-2)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>Roster · 4</button>
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

/* ────────── Right-side Drawer ────────── */
function AtelierDrawer({ openDrawer, setOpenDrawer }) {
  const drawers = {
    roster: {
      title: 'Roster',
      sub: 'Cloud agents and local executors',
      body: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {VOICES.map(v => (
            <div key={v.id} style={{
              padding: 12, borderRadius: 8,
              border: '1px solid var(--edge-1)', background: 'var(--surf-0)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{
                width: 32, height: 32, borderRadius: '50%',
                background: `radial-gradient(circle at 35% 30%, ${v.color}cc, ${v.color}33)`,
                border: `1px solid ${v.color}55`,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--serif)', fontSize: 14, color: 'var(--ink-0)',
              }}>{v.initial}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: 'var(--ink-0)' }}>{v.name}</div>
                <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink-3)', letterSpacing: '0.08em' }}>
                  {v.model} · {v.role}
                </div>
              </div>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--ok)' }} />
            </div>
          ))}
        </div>
      ),
    },
    trust: {
      title: 'Trust',
      sub: 'Bouncer, audit, and approval gates',
      body: <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.7 }}>
        <div>Bouncer · <span style={{ color: 'var(--ok)' }}>active</span></div>
        <div>Audit log · 142 events · 24h</div>
        <div>Approval policy · auto-PR for ≤ 3 files</div>
      </div>,
    },
    vault: {
      title: 'Vault',
      sub: 'BYOK provider connections',
      body: <div style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)', lineHeight: 1.7 }}>
        <div>anthropic · <span style={{ color: 'var(--ok)' }}>connected</span></div>
        <div>openai · <span style={{ color: 'var(--ok)' }}>connected</span></div>
        <div>google · <span style={{ color: 'var(--ok)' }}>connected</span></div>
        <div>openrouter · <span style={{ color: 'var(--ok)' }}>connected</span></div>
      </div>,
    },
  };

  const d = openDrawer ? drawers[openDrawer] : null;

  return (
    <>
      {openDrawer && (
        <div onClick={() => setOpenDrawer(null)} style={{
          position: 'absolute', inset: 0, zIndex: 50,
          background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
          animation: 'fadeIn 180ms var(--ease)',
        }} />
      )}
      <aside style={{
        position: 'absolute', top: 0, right: 0, bottom: 0, zIndex: 60,
        width: 380,
        background: 'rgba(11,12,15,0.96)', backdropFilter: 'blur(24px)',
        borderLeft: '1px solid var(--edge-2)',
        transform: openDrawer ? 'translateX(0)' : 'translateX(calc(100% + 4px))',
        transition: 'transform 320ms var(--spring)',
        display: 'flex', flexDirection: 'column',
        boxShadow: openDrawer ? '-24px 0 60px rgba(0,0,0,0.5)' : 'none',
      }}>
        {d && (
          <>
            <div style={{
              padding: '18px 22px',
              borderBottom: '1px solid var(--edge-1)',
              display: 'flex', alignItems: 'flex-start', gap: 12,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)',
                  letterSpacing: '0.22em', textTransform: 'uppercase', marginBottom: 4,
                }}>drawer</div>
                <div style={{ fontFamily: 'var(--serif)', fontSize: 22, fontWeight: 300, color: 'var(--ink-0)', letterSpacing: '-0.01em' }}>
                  {d.title}
                </div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 2, fontFamily: 'var(--serif)', fontStyle: 'italic' }}>
                  {d.sub}
                </div>
              </div>
              <button onClick={() => setOpenDrawer(null)} style={{
                width: 26, height: 26, borderRadius: 6,
                color: 'var(--ink-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                border: '1px solid var(--edge-1)', background: 'var(--surf-0)',
              }} title="Close (Esc)">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '18px 22px' }}>
              {d.body}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function Atelier() {
  const [phase, setPhase] = React.useState('empty');
  const [sidebarOpen, setSidebarOpen] = React.useState(true);
  const [openDrawer, setOpenDrawer] = React.useState(null);

  return (
    <div style={{
      width: '100%', height: '100%',
      display: 'grid',
      gridTemplateColumns: 'auto 1fr',
      gridTemplateRows: '46px 1fr auto',
      background: 'var(--void-0)',
      color: 'var(--ink-0)',
      fontSize: 13,
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div className="void-bg" style={{ zIndex: 0 }} />
      <div className="void-grain" style={{ zIndex: 1 }} />
      <div className="void-vignette" style={{ zIndex: 1 }} />

      <AtelierTopbar
        phase={phase} setPhase={setPhase}
        sidebarOpen={sidebarOpen} setSidebarOpen={setSidebarOpen}
        openDrawer={openDrawer} setOpenDrawer={setOpenDrawer}
      />
      <AtelierSidebar open={sidebarOpen} />

      <main style={{
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden', position: 'relative', zIndex: 2,
      }}>
        {phase === 'empty' ? <AtelierEmptyStage /> : <AtelierReader />}
      </main>

      <div style={{ gridColumn: '2 / 3' }}>
        <AtelierComposer phase={phase} />
      </div>

      <AtelierDrawer openDrawer={openDrawer} setOpenDrawer={setOpenDrawer} />
    </div>
  );
}

window.Atelier = Atelier;
