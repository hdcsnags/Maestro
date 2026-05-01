import type { ReactNode } from 'react';
import { LayoutPanelTop } from 'lucide-react';

export default function PlanCardFrame({
  title,
  status,
  description,
  onOpenAdvancedView,
  children,
}: {
  title: string;
  status?: string;
  description?: string;
  onOpenAdvancedView?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="mx-1 my-0.5 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-4 text-white/80">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-mono-dm text-[10px] uppercase tracking-[0.16em] text-white/40">
            {title}
          </div>
          {description && (
            <div className="mt-2 text-sm leading-7 text-white/65">
              {description}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {status && (
            <div className="rounded-full border border-white/[0.08] bg-black/10 px-2.5 py-1 text-[10px] uppercase tracking-[0.14em] text-white/50">
              {status}
            </div>
          )}
          {onOpenAdvancedView && (
            <button
              onClick={onOpenAdvancedView}
              className="reveal-pill"
              style={{ height: '32px', fontSize: '11px', padding: '0 12px' }}
            >
              <LayoutPanelTop size={12} />
              Open advanced view
            </button>
          )}
        </div>
      </div>
      <div className="mt-4">
        {children}
      </div>
    </div>
  );
}
