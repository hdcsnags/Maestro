import { useCallback, useMemo, useState } from 'react';
import { Copy, Radio, Check } from 'lucide-react';
import { useMaestro } from '../../../context/MaestroContext';
import type { ThreadMessage } from '../../../types';

function SectionLabel({ children, color }: { children: string; color?: string }) {
  return (
    <div
      className="font-mono-dm text-[10px] uppercase tracking-[0.14em]"
      style={{ color: color ?? 'var(--text-dim)', marginBottom: '6px' }}
    >
      {children}
    </div>
  );
}

export default function BrainstormSummaryCard({ message }: { message: ThreadMessage }) {
  const { dispatch } = useMaestro();
  const [copied, setCopied] = useState(false);
  const meta = message.metadata;

  const consensus = typeof meta.consensus === 'string' ? meta.consensus : '';
  const recommendation = typeof meta.recommendation === 'string' ? meta.recommendation : '';
  const deliberated = meta.deliberated === true;
  const tradeOffs = useMemo(() => (Array.isArray(meta.trade_offs) ? meta.trade_offs : []), [meta.trade_offs]);
  const tensions = useMemo(() => (Array.isArray(meta.unresolved_tensions) ? meta.unresolved_tensions : []), [meta.unresolved_tensions]);
  const weaknesses = useMemo(() => (Array.isArray(meta.acknowledged_weaknesses) ? meta.acknowledged_weaknesses : []), [meta.acknowledged_weaknesses]);
  const seats = useMemo(() => (Array.isArray(meta.seats) ? meta.seats : []), [meta.seats]);

  const openCarousel = useCallback(() => {
    dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: null });
    dispatch({ type: 'SET_FOLIO_INDEX', payload: 0 });
    dispatch({ type: 'SET_CLAW_VIEW', payload: 'carousel' });
  }, [dispatch]);

  const copySummary = useCallback(async () => {
    const lines: string[] = ['# Brainstorm summary', ''];
    lines.push('## What they agreed on', '', consensus || '_(nothing recorded)_', '');
    lines.push('## Where they disagreed (and about what)', '');
    if (tradeOffs.length === 0) {
      lines.push(deliberated ? '_(no trade-offs recorded)_' : '_(the council did not debate this one — fewer than three seats answered)_');
    } else {
      for (const trade of tradeOffs) {
        lines.push(`- **${trade.axis}** — ${trade.side_a.agent}: ${trade.side_a.position} / ${trade.side_b.agent}: ${trade.side_b.position}`);
      }
    }
    lines.push('', '## What you still have to decide', '');
    if (tensions.length === 0) lines.push('_(nothing left open)_');
    for (const tension of tensions) lines.push(`- ${tension}`);
    lines.push('', '## Recommendation', '', recommendation || '_(none given)_', '');
    if (weaknesses.length > 0) {
      lines.push('## Acknowledged weaknesses', '');
      for (const aw of weaknesses) lines.push(`- ${aw.agent}: ${aw.weakness}`);
      lines.push('');
    }
    if (seats.length > 0) {
      lines.push(`_Seats: ${seats.map((seat) => `${seat.name} (${seat.model})`).join(', ')}${deliberated ? ' · debated' : ''}_`);
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      dispatch({ type: 'SHOW_TOAST', payload: 'Could not copy — clipboard is unavailable in this browser.' });
    }
  }, [consensus, tradeOffs, tensions, recommendation, weaknesses, seats, deliberated, dispatch]);

  return (
    <div className="mx-1 my-1 rounded-xl border border-gold/20 bg-gold/5 px-4 py-3">
      <div className="flex items-center justify-between gap-3 mb-3">
        <span className="text-xs font-semibold text-gold/80 uppercase tracking-wider">Brainstorm summary</span>
        <span className="text-[10px] text-white/40">
          {seats.length} seat{seats.length === 1 ? '' : 's'}{deliberated ? ' · debated' : ' · no debate (fewer than 3 answered)'}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <div>
          <SectionLabel color="var(--ok)">What they agreed on</SectionLabel>
          <p className="text-sm leading-relaxed text-white/80 m-0 whitespace-pre-wrap">{consensus || 'Nothing recorded.'}</p>
        </div>

        <div>
          <SectionLabel color="var(--warn)">Where they disagreed (and about what)</SectionLabel>
          {tradeOffs.length === 0 ? (
            <p className="text-sm text-white/55 m-0">
              {deliberated ? 'No trade-offs were recorded.' : 'The council did not debate this one — fewer than three seats answered.'}
            </p>
          ) : (
            <ul className="m-0 pl-4 flex flex-col gap-1.5">
              {tradeOffs.map((trade, index) => (
                <li key={index} className="text-sm text-white/75 leading-relaxed">
                  <span className="text-white/90 font-medium">{trade.axis}:</span>{' '}
                  <span className="text-white/85">{trade.side_a.agent}</span> says {trade.side_a.position}
                  {' '}<span className="text-white/40">vs</span>{' '}
                  <span className="text-white/85">{trade.side_b.agent}</span> says {trade.side_b.position}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <SectionLabel color="var(--risk)">What you still have to decide</SectionLabel>
          {tensions.length === 0 ? (
            <p className="text-sm text-white/55 m-0">Nothing left open.</p>
          ) : (
            <ul className="m-0 pl-4 flex flex-col gap-1">
              {tensions.map((tension, index) => (
                <li key={index} className="text-sm text-white/75 leading-relaxed">{tension}</li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <SectionLabel color="var(--gold)">Recommendation</SectionLabel>
          <p className="text-sm leading-relaxed text-white/80 m-0 whitespace-pre-wrap">{recommendation || 'None given.'}</p>
        </div>

        {weaknesses.length > 0 && (
          <div>
            <SectionLabel>Acknowledged weaknesses</SectionLabel>
            <ul className="m-0 pl-4 flex flex-col gap-1">
              {weaknesses.map((aw, index) => (
                <li key={index} className="text-sm text-white/65 leading-relaxed">
                  <span className="text-white/85">{aw.agent}:</span> {aw.weakness}
                </li>
              ))}
            </ul>
          </div>
        )}

        {seats.length > 0 && (
          <div className="text-[11px] text-white/40">
            Seats: {seats.map((seat) => `${seat.name} (${seat.model})`).join(', ')}
          </div>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="reveal-pill primary"
          style={{ height: '30px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          onClick={openCarousel}
        >
          <Radio size={12} />
          See the full discussion
        </button>
        <button
          type="button"
          className="reveal-pill"
          style={{ height: '30px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          onClick={() => { void copySummary(); }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy summary'}
        </button>
      </div>
    </div>
  );
}
