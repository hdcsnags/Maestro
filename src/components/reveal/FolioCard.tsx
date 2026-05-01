import { Response as MaestroResponse, FileManifestEntry } from '../../types';
import { useMaestro } from '../../context/MaestroContext';
import { supabase } from '../../lib/supabase';
import { useState, useEffect, useMemo } from 'react';
import { Flag, Star, ChevronDown, ChevronUp, Pin, FileCode, Download } from 'lucide-react';
import ArtifactDownload from './ArtifactDownload';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  response: MaestroResponse;
  onPinToThread?: () => Promise<void> | void;
  onCompare?: () => void;
  onAskFollowUp?: () => Promise<void> | void;
  onExtractDecision?: () => Promise<void> | void;
  onSynthesizeSelection?: () => Promise<void> | void;
  compareLabel?: string;
  compareActive?: boolean;
  compareDisabled?: boolean;
}

const unescape = (s: string) =>
  s.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\"/g, '"').replace(/\\\\/g, '\\');

// If parseResult failed upstream and raw JSON leaked into content, extract just the prose.
export function getFolioDisplayContent(raw: string): string {
  const trimmed = raw.trim();

  // Try to extract content from any JSON structure first (fenced or raw)
  const extracted = tryExtractFromJson(trimmed);
  if (extracted) return unescape(extracted);

  // Strip code fences entirely even if JSON inside is unparseable
  if (trimmed.includes('```')) {
    const withoutFences = trimmed
      .replace(/```(?:json|JSON|javascript|typescript|ts|js)?\s*/g, '')
      .replace(/```/g, '')
      .trim();
    if (withoutFences) {
      const innerExtracted = tryExtractFromJson(withoutFences);
      if (innerExtracted) return unescape(innerExtracted);
      return unescape(withoutFences);
    }
  }

  return unescape(trimmed);
}

function tryExtractFromJson(text: string): string | null {
  // Try full text as JSON
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed.content === 'string') return parsed.content;
    if (typeof parsed.response === 'string') return parsed.response;
  } catch { /* not valid JSON */ }

  // Try to find a JSON object substring
  const braceStart = text.indexOf('{');
  if (braceStart >= 0) {
    const sub = text.slice(braceStart);
    const braceEnd = sub.lastIndexOf('}');
    if (braceEnd > 0) {
      try {
        const parsed = JSON.parse(sub.slice(0, braceEnd + 1));
        if (typeof parsed.content === 'string') return parsed.content;
        if (typeof parsed.response === 'string') return parsed.response;
      } catch { /* fall through */ }
    }
  }

  // Regex fallback: extract "content": "..." or "title": "..." values
  const contentMatch = text.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  if (contentMatch) return contentMatch[1];

  return null;
}

export default function FolioCard({
  response,
  onPinToThread,
  onCompare,
  onAskFollowUp,
  onExtractDecision,
  onSynthesizeSelection,
  compareLabel = 'Compare',
  compareActive = false,
  compareDisabled = false,
}: Props) {
  const { dispatch } = useMaestro();
  const [flagging, setFlagging] = useState(false);
  const [signalsExpanded, setSignalsExpanded] = useState(false);
  const [manifestExpanded, setManifestExpanded] = useState(false);
  const [busyAction, setBusyAction] = useState<'pin' | 'followup' | 'decision' | 'synthesize' | null>(null);

  useEffect(() => {
    setSignalsExpanded(false);
    setManifestExpanded(false);
  }, [response.id]);

  const handleFlag = async () => {
    setFlagging(true);
    const newFlagged = !response.is_flagged;
    await supabase
      .from('responses')
      .update({ is_flagged: newFlagged } as never)
      .eq('id', response.id);
    dispatch({ type: 'UPDATE_RESPONSE', payload: { id: response.id, is_flagged: newFlagged } });
    setFlagging(false);
  };

  const handleLead = async () => {
    const newLead = !response.is_lead;
    await supabase
      .from('responses')
      .update({ is_lead: newLead } as never)
      .eq('id', response.id);
    dispatch({ type: 'UPDATE_RESPONSE', payload: { id: response.id, is_lead: newLead } });
  };

  const handlePin = async () => {
    const newPinned = !response.is_pinned;
    await supabase
      .from('responses')
      .update({ is_pinned: newPinned } as never)
      .eq('id', response.id);
    dispatch({ type: 'UPDATE_RESPONSE', payload: { id: response.id, is_pinned: newPinned } });
  };

  const handleDownload = () => {
    const agentLabel = response.agent_name || response.agent_role || 'agent';
    const header = `# ${response.title || 'Response'}\n**Agent:** ${agentLabel}\n**Model:** ${response.model}\n**Date:** ${new Date(response.created_at).toLocaleString()}\n\n---\n\n`;
    const body = displayContent;
    const manifestSection = fileManifest.length > 0
      ? `\n\n---\n\n## Files\n\n${fileManifest.map(f => `- \`${f.path}\` (${f.operation})`).join('\n')}`
      : '';
    const blob = new Blob([header + body + manifestSection], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${agentLabel.replace(/\s+/g, '-').toLowerCase()}-response.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const signals = response.signals || {};
  const signalEntries = Object.entries(signals).filter(([, v]) => v).slice(0, 3);
  const fileManifest: FileManifestEntry[] = response.file_manifest || [];
  const artifacts = response.artifacts || [];
  const displayContent = getFolioDisplayContent(response.content);
  const remarkPlugins = useMemo(() => [remarkGfm], []);

  const runThreadAction = async (
    action: 'pin' | 'followup' | 'decision' | 'synthesize',
    handler?: () => Promise<void> | void,
  ) => {
    if (!handler) return;
    setBusyAction(action);
    try {
      await handler();
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="h-full flex flex-col" style={{ position: 'relative', zIndex: 2 }}>

      {/* Header */}
      <div
        className="flex items-center justify-between flex-shrink-0"
        style={{ padding: '22px 28px 16px', borderBottom: '1px solid rgba(255,255,255,0.045)' }}
       >
         <div className="flex items-center gap-3 min-w-0">
          <div
            className="flex-shrink-0"
            style={{ width: '9px', height: '9px', borderRadius: '50%', background: response.agent_color, boxShadow: `0 0 18px ${response.agent_color}` }}
          />
          <div className="min-w-0">
            <div style={{ fontSize: '13px', fontWeight: 500, letterSpacing: '-0.01em', color: 'var(--text)', whiteSpace: 'nowrap' }}>
              {response.agent_role || 'Agent'}
            </div>
            <div className="font-mono-dm" style={{ fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: response.agent_color, whiteSpace: 'nowrap' }}>
              {response.agent_name}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={handleFlag} disabled={flagging} className="reveal-chip"
            style={response.is_flagged ? { color: 'var(--gold)', borderColor: 'rgba(201,168,76,0.3)', background: 'rgba(201,168,76,0.08)', cursor: 'pointer' } : { cursor: 'pointer' }}>
            <Flag size={11} />{response.is_flagged ? 'Flagged' : 'Flag'}
          </button>
          <button onClick={handleLead} className="reveal-chip"
            style={response.is_lead ? { color: 'var(--text)', borderColor: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.06)', cursor: 'pointer' } : { cursor: 'pointer' }}>
            <Star size={11} />{response.is_lead ? 'Lead' : 'Set lead'}
          </button>
          <button onClick={handlePin} className="reveal-chip"
            title={response.is_pinned ? 'Unpin from session context' : 'Pin to session context'}
            style={response.is_pinned ? { color: '#8aa8e0', borderColor: 'rgba(138,168,224,0.3)', background: 'rgba(138,168,224,0.08)', cursor: 'pointer' } : { cursor: 'pointer' }}>
            <Pin size={11} />{response.is_pinned ? 'Pinned' : 'Pin'}
          </button>
          <button onClick={handleDownload} className="reveal-chip" title="Download response as markdown"
            style={{ cursor: 'pointer' }}>
            <Download size={11} />Export
          </button>
          </div>
        </div>

        {(onPinToThread || onCompare || onAskFollowUp || onExtractDecision || onSynthesizeSelection) && (
          <div
            className="flex items-center gap-2 flex-wrap flex-shrink-0"
            style={{ padding: '12px 28px 0' }}
          >
            {onPinToThread && (
              <button
                type="button"
                className="reveal-chip"
                disabled={busyAction !== null}
                onClick={() => void runThreadAction('pin', onPinToThread)}
                style={{ cursor: busyAction !== null ? 'default' : 'pointer' }}
              >
                Pin to thread
              </button>
            )}
            {onCompare && (
              <button
                type="button"
                className="reveal-chip"
                disabled={compareDisabled}
                onClick={onCompare}
                style={compareActive
                  ? { color: 'var(--text)', borderColor: 'rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)', cursor: 'pointer' }
                  : { cursor: compareDisabled ? 'default' : 'pointer' }}
              >
                {compareLabel}
              </button>
            )}
            {onAskFollowUp && (
              <button
                type="button"
                className="reveal-chip"
                disabled={busyAction !== null}
                onClick={() => void runThreadAction('followup', onAskFollowUp)}
                style={{ cursor: busyAction !== null ? 'default' : 'pointer' }}
              >
                Ask follow-up
              </button>
            )}
            {onExtractDecision && (
              <button
                type="button"
                className="reveal-chip"
                disabled={busyAction !== null}
                onClick={() => void runThreadAction('decision', onExtractDecision)}
                style={{ cursor: busyAction !== null ? 'default' : 'pointer' }}
              >
                Extract decision
              </button>
            )}
            {onSynthesizeSelection && (
              <button
                type="button"
                className="reveal-chip"
                disabled={busyAction !== null}
                onClick={() => void runThreadAction('synthesize', onSynthesizeSelection)}
                style={{ cursor: busyAction !== null ? 'default' : 'pointer' }}
              >
                Synthesize from selection
              </button>
            )}
          </div>
        )}

      {/* Scrollable body — full width always */}
      <div className="flex-1 overflow-y-auto" style={{ padding: '28px 28px 24px' }}>

        {response.title && (
          <h2 className="font-syne" style={{ margin: '0 0 16px', fontSize: 'clamp(22px, 2.4vw, 36px)', lineHeight: 1.06, fontWeight: 400, letterSpacing: '-0.04em', color: 'var(--text)' }}>
            {response.title}
          </h2>
        )}

        <div className="folio-prose" style={{ fontSize: '15px', lineHeight: 1.72, color: 'rgba(232,230,224,0.88)', fontWeight: 300 }}>
          <ReactMarkdown remarkPlugins={remarkPlugins}>{displayContent}</ReactMarkdown>
        </div>

        {/* F1.2 — Files to write panel, collapsed by default */}
        {fileManifest.length > 0 && (
          <div style={{ marginTop: '24px', borderTop: '1px solid rgba(255,255,255,0.045)', paddingTop: '16px' }}>
            <button
              onClick={() => setManifestExpanded(p => !p)}
              className="flex items-center gap-2 w-full"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-dim)' }}
            >
              <FileCode size={12} />
              <span className="font-mono-dm" style={{ fontSize: '10px', letterSpacing: '0.18em', textTransform: 'uppercase' as const }}>
                Files to write · {fileManifest.length}
              </span>
              {manifestExpanded ? <ChevronUp size={10} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={10} style={{ marginLeft: 'auto' }} />}
            </button>
            {manifestExpanded && (
              <div className="flex flex-col gap-1.5" style={{ marginTop: '10px' }}>
                {fileManifest.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2 font-mono-dm"
                    style={{ fontSize: '11px', letterSpacing: '0.04em', padding: '6px 10px', borderRadius: '10px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <span style={{ color: entry.operation === 'delete' ? 'var(--risk)' : 'var(--ok)', flexShrink: 0, fontWeight: 600 }}>
                      {entry.operation === 'delete' ? '[×]' : '[~]'}
                    </span>
                    <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 }}>
                      {entry.path}
                    </span>
                    <span style={{ color: 'var(--text-dim)', flexShrink: 0 }}>{entry.operation}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <ArtifactDownload artifacts={artifacts} agentColor={response.agent_color} />

        {/* F1.1 — Signals below body, collapsed by default. F1.5 — hidden when empty */}
        {signalEntries.length > 0 && (
          <div style={{ marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.045)', paddingTop: '14px' }}>
            <button
              onClick={() => setSignalsExpanded(p => !p)}
              className="flex items-center gap-2 w-full"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-dim)' }}
            >
              <div className="flex items-center gap-1.5">
                {signalEntries.map(([key, val]) => {
                  const lc = String(val ?? '').toLowerCase();
                  const isPositive = lc.includes('high') || lc.includes('ok') || lc.includes('safe') || lc.includes('strong');
                  const isWarning = lc.includes('warn') || lc.includes('risk') || lc.includes('caution') || lc.includes('medium');
                  const dotColor = isPositive ? 'var(--ok)' : isWarning ? 'var(--warn)' : 'var(--text-muted)';
                  return <div key={key} style={{ width: '5px', height: '5px', borderRadius: '50%', background: dotColor, boxShadow: `0 0 4px ${dotColor}` }} />;
                })}
              </div>
              <span className="font-mono-dm" style={{ fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase' as const }}>
                Signals
              </span>
              {signalsExpanded ? <ChevronUp size={10} style={{ marginLeft: 'auto' }} /> : <ChevronDown size={10} style={{ marginLeft: 'auto' }} />}
            </button>
            {signalsExpanded && (
              <div className="flex gap-3 flex-wrap" style={{ marginTop: '12px' }}>
                {signalEntries.map(([key, val]) => (
                  <SignalCell key={key} label={key} value={String(val ?? '')} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center gap-3 pt-6" style={{ color: 'var(--text-dim)', marginTop: 'auto' }}>
          <div style={{ height: '1px', width: '72px', background: 'linear-gradient(90deg, rgba(255,255,255,0.22), transparent)' }} />
          <span className="font-mono-dm" style={{ fontSize: '10px', letterSpacing: '0.14em', textTransform: 'uppercase' as const, opacity: 0.6 }}>
            {response.model}
          </span>
        </div>
      </div>
    </div>
  );
}

function SignalCell({ label, value }: { label: string; value: string }) {
  const lc = value.toLowerCase();
  const isPositive = lc.includes('high') || lc.includes('ok') || lc.includes('safe') || lc.includes('strong');
  const isWarning = lc.includes('warn') || lc.includes('risk') || lc.includes('caution') || lc.includes('medium');
  const color = isPositive ? 'var(--ok)' : isWarning ? 'var(--warn)' : 'var(--text)';
  return (
    <div style={{ flex: 1, minWidth: '100px', padding: '12px 14px', borderRadius: '18px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.045)' }}>
      <div className="font-mono-dm" style={{ fontSize: '9px', letterSpacing: '0.15em', textTransform: 'uppercase' as const, color: 'var(--text-dim)', marginBottom: '4px' }}>
        {label.replace(/_/g, ' ')}
      </div>
      <div style={{ fontSize: '13px', color, fontWeight: 500 }}>{value}</div>
    </div>
  );
}
