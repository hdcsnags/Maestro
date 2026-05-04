import React, { useMemo } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { Agent, Response as MaestroResponse } from '../../types';
import { RefreshCw } from 'lucide-react';

interface Props {
  focusedAgentId: string | null;
  onFocusAgent: (agentId: string) => void;
  onSynthesize: () => void;
  isSynthesizing: boolean;
  agents: Agent[];
  latestResponses: MaestroResponse[];
  roundNumber: number;
}

function SeatRing({ state, color }: { state: 'thinking' | 'streaming' | 'ready' | 'spoken', color: string }) {
  const base: React.CSSProperties = {
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
  return <span style={{ ...base, border: `1px solid ${color}33` }} />;
}

export function AdvisorStrip({
  focusedAgentId,
  onFocusAgent,
  onSynthesize,
  isSynthesizing,
  agents,
  latestResponses,
  roundNumber,
}: Props) {
  const { state: maestroState } = useMaestro();

  // Sort agents to match boardroom layout
  const sortedAgents = useMemo(() => [...agents].sort((a, b) => a.name.localeCompare(b.name)), [agents]);
  
  const total = sortedAgents.length;
  const arcWidth = 520;
  const arcHeight = 18;

  const seats = useMemo(() => sortedAgents.map((agent, i) => {
    const t = total === 1 ? 0.5 : i / (total - 1);
    const x = (t - 0.5) * arcWidth;
    const y = -Math.sin(t * Math.PI) * arcHeight;
    
    const color = agent.role === 'Critic' ? 'var(--kimi)' : 
                  agent.role === 'Builder' ? 'var(--gpt)' : 
                  agent.role === 'Researcher' ? 'var(--gemini)' : 
                  agent.provider_group === 'maestroclaw' ? 'var(--qwen)' : 'var(--claude)';
                  
    const initial = agent.name.charAt(0).toUpperCase();
    
    // Determine state
    let liveState: 'thinking' | 'streaming' | 'ready' | 'spoken' = 'spoken';
    const hasResponse = latestResponses.some(r => r.agent_id === agent.id);
    if (hasResponse) {
      liveState = 'ready';
    } else if (maestroState.isBroadcasting) {
      if (maestroState.broadcastingAgents.includes(agent.id)) {
        liveState = 'streaming';
      } else {
        liveState = 'thinking';
      }
    }

    return { ...agent, x, y, idx: i, color, initial, liveState };
  }), [sortedAgents, total, latestResponses, maestroState.isBroadcasting, maestroState.broadcastingAgents]);

  return (
    <div style={{
      position: 'relative',
      height: 96,
      borderTop: '1px solid var(--edge-1)',
      background: 'linear-gradient(180deg, rgba(11,12,15,0.6), rgba(8,9,11,0.3))',
      backdropFilter: 'blur(20px)',
      flexShrink: 0,
      overflow: 'hidden',
    }}>
      {/* faint table surface line */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        <path
          d={`M 10% 70 Q 50% 56, 90% 70`}
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
        {roundNumber > 0 ? `Round ${roundNumber.toString().padStart(2, '0')}` : 'The Boardroom'} · The floor
      </div>

      {/* hotkey hint right */}
      <div style={{
        position: 'absolute', right: 20, top: 14,
        fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink-3)',
        letterSpacing: '0.16em',
      }}>
        synth
      </div>

      {/* center: synthesis seat */}
      <button 
        onClick={onSynthesize} 
        disabled={isSynthesizing || latestResponses.length === 0}
        style={{
          position: 'absolute', left: '50%', top: '52%',
          transform: 'translate(-50%, -50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
          padding: 0, background: 'transparent', border: 'none',
          cursor: isSynthesizing || latestResponses.length === 0 ? 'default' : 'pointer',
          outline: 'none',
        }} 
        title="Synthesize the room"
      >
        <span style={{
          position: 'relative',
          width: 40, height: 40, borderRadius: '50%',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: isSynthesizing
            ? 'radial-gradient(circle at 35% 30%, rgba(255,235,180,0.95), var(--ember) 45%, rgba(80,50,10,0.4) 80%)'
            : 'radial-gradient(circle at 35% 30%, rgba(255,235,180,0.7), var(--ember) 50%, rgba(40,30,10,0.5) 90%)',
          boxShadow: isSynthesizing
            ? '0 0 24px var(--ember-glow), inset 0 0 10px rgba(255,235,180,0.4)'
            : '0 0 12px var(--ember-glow)',
          border: isSynthesizing ? '1px solid var(--ember)' : '1px solid var(--ember-hairline)',
          transition: 'all 240ms var(--spring)',
        }}>
          {isSynthesizing && <RefreshCw size={14} color="var(--void-0)" className="animate-spin" />}
        </span>
        <span style={{
          fontFamily: 'var(--mono)', fontSize: 8, color: isSynthesizing ? 'var(--ember)' : 'var(--ink-3)',
          letterSpacing: '0.22em', textTransform: 'uppercase',
        }}>Synth</span>
      </button>

      {/* seats */}
      {seats.map(seat => {
        const isForward = focusedAgentId === seat.id;
        const portraitDim = isForward ? 0 : 36; 

        const offsetX = seat.idx < total / 2
          ? seat.x - 60
          : seat.x + 60;

        return (
          <button
            key={seat.id}
            onClick={() => onFocusAgent(seat.id)}
            disabled={isForward}
            style={{
              position: 'absolute',
              left: `calc(50% + ${offsetX}px)`,
              top: `calc(52% + ${seat.y}px)`,
              transform: 'translate(-50%, -50%)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              padding: 0, background: 'transparent', border: 'none',
              opacity: isForward ? 0 : (seat.liveState === 'spoken' ? 0.55 : 1),
              transition: 'opacity 240ms var(--ease)',
              cursor: isForward ? 'default' : 'pointer',
              outline: 'none',
            }}
            title={`${seat.name} — direct chat`}
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
              <SeatRing state={seat.liveState} color={seat.color} />
              {seat.initial}
            </span>
            <span style={{
              fontFamily: 'var(--mono)', fontSize: 8, color: 'var(--ink-3)',
              letterSpacing: '0.18em', textTransform: 'uppercase',
              opacity: isForward ? 0 : 1, transition: 'opacity 240ms var(--ease)',
            }}>
              {seat.name}
            </span>
          </button>
        );
      })}
      
      <style>{`
        @keyframes spin { 100% { transform: rotate(360deg); } }
        @keyframes pulse { 50% { opacity: 0.5; transform: scale(0.95); } }
      `}</style>
    </div>
  );
}
