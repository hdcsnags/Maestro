import { useMaestro } from '../../context/MaestroContext';

interface FolioItem {
  color: string;
}

interface Props {
  items: FolioItem[];
}

export default function OrbitDots({ items }: Props) {
  const { state, dispatch } = useMaestro();

  if (items.length === 0) return null;

  return (
    <div
      className="absolute left-1/2 z-[26] flex gap-2.5"
      style={{ top: '24px', transform: 'translateX(-50%)' }}
    >
      {items.map((item, i) => {
        const isActive = i === state.folioIndex;
        return (
          <button
            key={i}
            className={`orbit-dot ${isActive ? 'active' : ''}`}
            aria-label={`Go to folio ${i + 1}`}
            onClick={() => dispatch({ type: 'SET_FOLIO_INDEX', payload: i })}
            style={{
              background: isActive ? item.color : undefined,
              boxShadow: isActive ? `0 0 16px ${item.color}` : undefined,
            }}
          />
        );
      })}
    </div>
  );
}
