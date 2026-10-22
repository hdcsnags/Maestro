import { useCallback, useMemo, useState } from 'react';
import { Check, ClipboardList, Copy, Radio } from 'lucide-react';
import { useMaestro } from '../../../context/MaestroContext';
import { useThreads } from '../../../hooks/useThreads';
import type { ThreadMessage, DiscoveryIntakeRecord } from '../../../types';
import {
  buildDiscoveryScopingBrief,
  countDiscoveryProgress,
  discoveryRecordToMarkdown,
  formatDiscoveryAnswer,
  getPublicDiscoveryParts,
} from '../../../lib/discoverySchema';

export default function DiscoveryRecordCard({ message }: { message: ThreadMessage }) {
  const { state, dispatch } = useMaestro();
  const { brainstormFromChat } = useThreads();
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const intake: DiscoveryIntakeRecord = useMemo(() => {
    const raw = message.metadata.intake;
    return raw && typeof raw === 'object' ? raw : {};
  }, [message.metadata.intake]);
  const done = message.metadata.done === true;
  const progress = useMemo(() => countDiscoveryProgress(intake), [intake]);
  const pct = progress.total > 0 ? Math.round((progress.answered / progress.total) * 100) : 0;
  const showAnswers = done || expanded;

  const copyMarkdown = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(discoveryRecordToMarkdown(intake));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      dispatch({ type: 'SHOW_TOAST', payload: 'Could not copy — clipboard is unavailable in this browser.' });
    }
  }, [intake, dispatch]);

  const scopeWithCouncil = useCallback(() => {
    if (state.isBrainstorming || state.isBroadcasting) {
      dispatch({ type: 'SHOW_TOAST', payload: 'The council is still working on the previous request.' });
      return;
    }
    void brainstormFromChat(buildDiscoveryScopingBrief(intake));
  }, [state.isBrainstorming, state.isBroadcasting, brainstormFromChat, intake, dispatch]);

  return (
    <div className="mx-1 my-1 rounded-xl border border-white/[0.1] bg-white/[0.03] px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-white/80 uppercase tracking-wider">
          <ClipboardList size={13} />
          Discovery record{done ? ' · complete' : ''}
        </span>
        <span className="text-[11px] text-white/50">
          {progress.answered} / {progress.total} answered
        </span>
      </div>

      <div className="mt-2 h-1 w-full rounded-full bg-white/[0.06]" aria-hidden="true">
        <div className="h-1 rounded-full" style={{ width: `${pct}%`, background: 'var(--gold)' }} />
      </div>

      {!done && (
        <p className="mt-2 text-[12px] text-white/50 m-0">
          Keep answering, or type <code className="text-white/70">/done</code> to finish.
        </p>
      )}

      {showAnswers && (
        <div className="mt-3 flex flex-col gap-3">
          {getPublicDiscoveryParts().map((part) => {
            const answered = part.q.filter((question) => formatDiscoveryAnswer(intake[question.id]) !== null);
            return (
              <div key={part.id}>
                <div className="font-mono-dm text-[10px] uppercase tracking-[0.14em]" style={{ color: 'var(--gold)' }}>
                  {part.title}
                  <span className="text-white/35 normal-case tracking-normal"> · {answered.length}/{part.q.length}</span>
                </div>
                {answered.length === 0 ? (
                  <div className="mt-1 text-[12px] text-white/35 italic">No answers yet</div>
                ) : (
                  <dl className="mt-1 m-0 flex flex-col gap-1.5">
                    {answered.map((question) => (
                      <div key={question.id}>
                        <dt className="text-[12px] text-white/55">{question.client ?? question.q}</dt>
                        <dd className="m-0 text-sm text-white/85 leading-relaxed whitespace-pre-wrap">
                          {formatDiscoveryAnswer(intake[question.id])}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {!done && (
          <button
            type="button"
            className="reveal-pill"
            style={{ height: '30px', fontSize: '11px' }}
            onClick={() => setExpanded((value) => !value)}
          >
            {expanded ? 'Hide answers so far' : 'Show answers so far'}
          </button>
        )}
        <button
          type="button"
          className="reveal-pill"
          style={{ height: '30px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          onClick={() => { void copyMarkdown(); }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? 'Copied' : 'Copy as Markdown'}
        </button>
        <button
          type="button"
          className={`reveal-pill ${done ? 'primary' : ''}`}
          style={{ height: '30px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          onClick={scopeWithCouncil}
          disabled={state.isBrainstorming || state.isBroadcasting || progress.answered === 0}
          title={progress.answered === 0 ? 'Answer at least one question first' : 'Send the record to the council as a scoping brief'}
        >
          <Radio size={12} />
          Scope this with the council
        </button>
      </div>
    </div>
  );
}
