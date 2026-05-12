import { useMemo } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { deriveOrbState, type OrbState } from '../../lib/orbState';

interface OrbProps {
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
}

const ORB_STYLES: Record<OrbState, { gradient: string; glowRgb: string; animation: string; duration: string }> = {
  idle:         { gradient: 'radial-gradient(circle at 35% 30%, rgba(255,224,150,0.95) 0%, rgba(201,168,76,0.85) 28%, rgba(140,108,40,0.55) 62%, rgba(60,42,12,0.15) 88%, transparent 100%)',  glowRgb: '201,168,76',  animation: 'orb-idle',  duration: '3s' },
  broadcasting: { gradient: 'radial-gradient(circle at 35% 30%, rgba(255,232,140,0.95) 0%, rgba(224,194,90,0.85) 28%, rgba(155,128,42,0.55) 62%, rgba(65,50,14,0.15) 88%, transparent 100%)', glowRgb: '224,194,90',  animation: 'orb-pulse', duration: '1.2s' },
  streaming:    { gradient: 'radial-gradient(circle at 35% 30%, rgba(255,232,140,0.95) 0%, rgba(224,194,90,0.85) 28%, rgba(155,128,42,0.55) 62%, rgba(65,50,14,0.15) 88%, transparent 100%)', glowRgb: '224,194,90',  animation: 'orb-pulse', duration: '1.1s' },
  deliberating: { gradient: 'radial-gradient(circle at 35% 30%, rgba(255,195,90,0.95) 0%, rgba(200,130,45,0.85) 28%, rgba(140,80,20,0.55) 62%, rgba(60,30,8,0.15) 88%, transparent 100%)',   glowRgb: '200,130,45',  animation: 'orb-pulse', duration: '1.8s' },
  synthesizing: { gradient: 'radial-gradient(circle at 35% 30%, rgba(150,235,190,0.95) 0%, rgba(80,185,130,0.85) 28%, rgba(38,130,80,0.55) 62%, rgba(12,60,35,0.15) 88%, transparent 100%)', glowRgb: '80,185,130',  animation: 'orb-pulse', duration: '2.4s' },
  conflict:     { gradient: 'radial-gradient(circle at 35% 30%, rgba(255,150,140,0.95) 0%, rgba(224,90,90,0.85) 28%, rgba(165,50,50,0.55) 62%, rgba(70,15,15,0.15) 88%, transparent 100%)',  glowRgb: '224,90,90',   animation: 'orb-pulse', duration: '0.8s' },
  iterating:    { gradient: 'radial-gradient(circle at 35% 30%, rgba(200,160,255,0.95) 0%, rgba(138,90,212,0.85) 28%, rgba(88,44,155,0.55) 62%, rgba(35,12,70,0.15) 88%, transparent 100%)', glowRgb: '138,90,212',  animation: 'orb-pulse', duration: '1.6s' },
  building:     { gradient: 'radial-gradient(circle at 35% 30%, rgba(150,235,190,0.95) 0%, rgba(80,185,130,0.85) 28%, rgba(38,130,80,0.55) 62%, rgba(12,60,35,0.15) 88%, transparent 100%)', glowRgb: '90,184,142',  animation: 'orb-pulse', duration: '1.6s' },
  concierge:    { gradient: 'radial-gradient(circle at 35% 30%, rgba(240,235,210,0.95) 0%, rgba(212,201,168,0.85) 28%, rgba(155,145,110,0.55) 62%, rgba(60,55,40,0.15) 88%, transparent 100%)', glowRgb: '212,201,168', animation: 'orb-idle',  duration: '2.4s' },
  error:        { gradient: 'radial-gradient(circle at 35% 30%, rgba(230,120,110,0.95) 0%, rgba(185,60,60,0.85) 28%, rgba(130,28,28,0.55) 62%, rgba(55,10,10,0.15) 88%, transparent 100%)',  glowRgb: '185,60,60',   animation: 'orb-pulse', duration: '4s' },
  done:         { gradient: 'radial-gradient(circle at 35% 30%, rgba(140,245,180,0.95) 0%, rgba(70,195,120,0.85) 28%, rgba(34,140,75,0.55) 62%, rgba(10,60,30,0.15) 88%, transparent 100%)', glowRgb: '70,195,120',  animation: 'orb-idle',  duration: '4s' },
};

export function Orb({ size = 'md', pulse }: OrbProps) {
  const { state } = useMaestro();
  
  const latestRound = (state.rounds?.length ?? 0) > 0 ? state.rounds[state.rounds.length - 1] : null;
  const currentRoundResponses = useMemo(
    () => (latestRound ? (state.responses || []).filter(r => r.round_id === latestRound.id) : []),
    [latestRound, state.responses]
  );
  const activeAgentCount = (state.agents || []).filter(a => a.is_active).length;

  const orbState = deriveOrbState(state, currentRoundResponses, activeAgentCount);
  const orbStyle = ORB_STYLES[orbState];
  
  const dim = size === 'sm' ? 24 : size === 'lg' ? 180 : 80;
  const glow = size === 'sm' ? 12 : size === 'lg' ? 60 : 30;
  const spread = size === 'sm' ? 20 : size === 'lg' ? 140 : 70;

  const animation = pulse || orbState !== 'idle' ? orbStyle.animation : 'orb-idle';
  const duration = orbStyle.duration;

  return (
    <div style={{ position: 'relative', width: dim, height: dim }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: orbStyle.gradient,
          boxShadow: `0 0 ${glow}px rgba(${orbStyle.glowRgb},0.35), 0 0 ${spread}px rgba(${orbStyle.glowRgb},0.18), inset 0 0 ${Math.round(glow/2)}px rgba(${orbStyle.glowRgb},0.22)`,
          animation: `${animation} ${duration} ease-in-out infinite`,
          transition: 'background 0.8s ease, box-shadow 0.6s ease',
        }}
      />
      
      <style>{`
        @keyframes orb-idle {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.02); filter: brightness(1.05); }
        }
        @keyframes orb-pulse {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.05); filter: brightness(1.2); }
        }
      `}</style>
    </div>
  );
}
