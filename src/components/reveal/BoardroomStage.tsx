import React from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { Orb } from './Orb';

export function BoardroomStage() {
  const { state } = useMaestro();
  const agents = (state.agents || []).filter(a => a.is_active && a.agent_role !== 'executor' && a.provider_group !== 'maestroclaw');

  // Map agents to positions around a semi-circle
  const seats = agents.map((agent, i) => {
    const total = agents.length || 1; // prevent divide by zero
    const angle = total === 1 ? -90 : -160 + (i * (140 / (total - 1)));
    const rad = (angle * Math.PI) / 180;
    const radius = 220;
    
    // Assign a color based on role or fallback
    const color = agent.role === 'Critic' ? 'var(--kimi)' : 
                  agent.role === 'Builder' ? 'var(--gpt)' : 
                  agent.role === 'Researcher' ? 'var(--gemini)' : 
                  agent.provider_group === 'maestroclaw' ? 'var(--qwen)' : 'var(--claude)';

    return { 
      ...agent, 
      x: Math.cos(rad) * radius, 
      y: Math.sin(rad) * radius * 0.55,
      color,
      initial: agent.name.charAt(0).toUpperCase()
    };
  });

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
        {agents.length} advisors are seated. Open the floor.
      </p>

      {/* ────────── Boardroom table (empty state) ────────── */}
      <div style={{ position: 'relative', width: 560, height: 360, margin: '0 auto' }}>
        {/* Table Surface */}
        <div style={{
          position: 'absolute', left: '50%', top: '60%',
          width: 540, height: 200, transform: 'translate(-50%, -50%)',
          borderRadius: '50%',
          background: 'radial-gradient(ellipse at center, rgba(255,255,255,0.025), transparent 70%)',
          border: '1px solid var(--edge-0)',
          boxShadow: 'inset 0 0 60px rgba(0,0,0,0.5)',
        }} />

        {/* Concierge Seat (Head of table) */}
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

        {/* Agent Seats */}
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

        {/* Conductor Seat (User) */}
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
    </div>
  );
}
