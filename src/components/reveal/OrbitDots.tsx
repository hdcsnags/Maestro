import { useMaestro } from '../../context/MaestroContext';

interface FolioItem {
  color: string;
  agentName?: string;
  response?: { agent_name: string; model: string; provider: string };
}

interface Props {
  items: FolioItem[];
}

function getDisplayLabel(item: FolioItem): string {
  if (item.response) {
    return item.response.agent_name;
  }
  return item.agentName ?? '';
}

export default function OrbitDots({ items }: Props) {
  const { state, dispatch } = useMaestro();

  if (items.length === 0) return null;

  return (
    <div
      className="absolute left-1/2 z-[26] flex gap-2.5 items-center"
      style={{ top: '24px', transform: 'translateX(-50%)' }}
    >
      {items.map((item, i) => {
        const isActive = i === state.folioIndex;
        const label = getDisplayLabel(item);

        return (
          <button
            key={i}
            className={`orbit-dot ${isActive ? 'active' : ''}`}
            aria-label={`Go to ${label || `folio ${i + 1}`}`}
            title={label}
            onClick={() => dispatch({ type: 'SET_FOLIO_INDEX', payload: i })}
            style={{
              background: isActive ? item.color : undefined,
              boxShadow: isActive ? `0 0 16px ${item.color}` : undefined,
              position: 'relative',
            }}
          >
            {isActive && label && (
              <span
                className="font-mono-dm"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  whiteSpace: 'nowrap',
                  fontSize: '9px',
                  letterSpacing: '0.1em',
                  color: item.color,
                  textTransform: 'uppercase',
                  pointerEvents: 'none',
                }}
              >
                {label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
