import React, { useMemo } from 'react';
import { useMaestro } from '../../context/MaestroContext';
import { deriveOrbState } from '../../lib/orbState';

interface OrbProps {
  size?: 'sm' | 'md' | 'lg';
  pulse?: boolean;
}

export function Orb({ size = 'md', pulse }: OrbProps) {
  const { state } = useMaestro();
  
  // In the real app, we derive state from Maestro context
  const orbState = deriveOrbState(state);
  
  const dim = size === 'sm' ? 24 : size === 'lg' ? 180 : 80;
  const glow = size === 'sm' ? 12 : size === 'lg' ? 60 : 30;
  const spread = size === 'sm' ? 20 : size === 'lg' ? 140 : 70;

  // Animation selection based on derived state or manual pulse
  const animation = pulse || orbState !== 'idle' ? 'maestro-orb-pulse' : 'maestro-orb-idle';
  const duration = orbState === 'broadcasting' ? '1.2s' : '3s';

  return (
    <div style={{ position: 'relative', width: dim, height: dim }}>
      {/* Glow layers */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '50%',
          background: 'radial-gradient(circle at 35% 30%, rgba(255,224,150,0.95) 0%, rgba(201,168,76,0.85) 28%, rgba(140,108,40,0.55) 62%, rgba(60,42,12,0.15) 88%, transparent 100%)',
          boxShadow: `0 0 ${glow}px rgba(201,168,76,0.35), 0 0 ${spread}px rgba(201,168,76,0.18), inset 0 0 ${glow/2}px rgba(255,224,150,0.25)`,
          animation: `${animation} ${duration} ease-in-out infinite`,
          transition: 'all 0.6s var(--spring)',
        }}
      />
      
      {/* Keyframe styles embedded in component for portability */}
      <style>{`
        @keyframes maestro-orb-idle {
          0%, 100% { transform: scale(1); filter: brightness(1); }
          50% { transform: scale(1.02); filter: brightness(1.05); }
        }
        @keyframes maestro-orb-pulse {
          0%, 100% { transform: scale(1); filter: brightness(1); box-shadow: 0 0 ${glow}px rgba(201,168,76,0.35); }
          50% { transform: scale(1.05); filter: brightness(1.2); box-shadow: 0 0 ${glow * 1.5}px rgba(201,168,76,0.5); }
        }
      `}</style>
    </div>
  );
}
