import { useCallback, useMemo } from 'react';
import { ArrowRight, Download, Hammer, Pencil, RotateCcw, Sparkles } from 'lucide-react';
import { useMaestro } from '../../context/MaestroContext';
import { useOrchestration } from '../../hooks/useOrchestration';
import { supabase } from '../../lib/supabase';
import type { ConciergeDecision, DesignMode, SessionPhase, ThreadMessage, TriageResult } from '../../types';

const DESIGN_MODE_LABELS: Record<DesignMode, string> = {
  lite: '1 designer',
  standard: '2 designers',
  exploration: '4 designers',
};

const NEXT_PHASE_LABELS: Record<string, string> = {
  design: 'Design Phase',
  pre_build: 'Pre-Build',
  build: 'Build',
  analysis: 'Another Round',
};

type DecisionMetadata = ThreadMessage['metadata'] & {
  kind: 'concierge_decision';
  decision: ConciergeDecision;
  round_id?: string;
  round_number?: number;
  prompt?: string;
};

type TriageMetadata = ThreadMessage['metadata'] & {
  kind: 'concierge_triage';
  triage: TriageResult;
  prompt?: string;
};

function isDecisionMetadata(metadata: ThreadMessage['metadata']): metadata is DecisionMetadata {
  return metadata.kind === 'concierge_decision' && typeof metadata.decision === 'object' && metadata.decision !== null;
}

function isTriageMetadata(metadata: ThreadMessage['metadata']): metadata is TriageMetadata {
  return metadata.kind === 'concierge_triage' && typeof metadata.triage === 'object' && metadata.triage !== null;
}

export default function ConciergeEventCard({ message }: { message: ThreadMessage }) {
  const { state, dispatch } = useMaestro();
  const { broadcast } = useOrchestration();

  const decisionMeta = isDecisionMetadata(message.metadata) ? message.metadata : null;
  const triageMeta = isTriageMetadata(message.metadata) ? message.metadata : null;
  const decision = decisionMeta?.decision ?? null;
  const triage = triageMeta?.triage ?? null;

  const roundCount = useMemo(
    () => state.rounds.filter(round => round.session_id === state.activeSession?.id).length,
    [state.rounds, state.activeSession?.id],
  );

  const handleAdvancePhase = useCallback(async (phase: SessionPhase, toastMsg: string) => {
    if (!state.activeSession) return;
    await supabase
      .from('sessions')
      .update({ current_phase: phase } as never)
      .eq('id', state.activeSession.id);
    dispatch({ type: 'UPDATE_ACTIVE_SESSION', payload: { current_phase: phase } });
    dispatch({ type: 'SHOW_TOAST', payload: toastMsg });
  }, [state.activeSession, dispatch]);

  const handleProceed = useCallback(async () => {
    if (!decision) return;

    if (state.activeSession?.mode === 'ask') {
      dispatch({ type: 'SHOW_TOAST', payload: 'Ready for next round' });
      return;
    }

    const next = decision.recommended_next_phase;

    if (next === 'design') {
      const modeLabel = decision.design_mode ? DESIGN_MODE_LABELS[decision.design_mode] : null;
      await handleAdvancePhase('design', modeLabel ? `Starting Design (${modeLabel})` : 'Moving to Design phase');
      return;
    }
    if (next === 'pre_build') {
      await handleAdvancePhase('pre_build', 'Moving to Pre-Build');
      return;
    }
    if (next === 'build') {
      await handleAdvancePhase('build', 'Starting Build');
      return;
    }
    if (next === 'analysis') {
      dispatch({ type: 'SHOW_TOAST', payload: 'Ready for next round' });
      return;
    }

    await handleAdvancePhase('design', 'Moving to Design phase');
  }, [decision, state.activeSession?.mode, dispatch, handleAdvancePhase]);

  const handleRound2 = useCallback(() => {
    const prompt = decisionMeta?.prompt;
    if (!prompt || !state.activeSession) return;
    const activeAgentIds = state.agents.filter(agent => agent.is_active).map(agent => agent.id);
    void broadcast(prompt, activeAgentIds, state.activeSession, { skipTriage: true });
  }, [decisionMeta?.prompt, state.activeSession, state.agents, broadcast]);

  const handleOverride = useCallback(() => {
    dispatch({ type: 'SET_CONCIERGE_DECISION', payload: null });
    dispatch({ type: 'SHOW_TOAST', payload: 'Concierge recommendation cleared' });
  }, [dispatch]);

  const handleConvertToBuild = useCallback(async () => {
    if (!state.activeSession) return;
    await supabase
      .from('sessions')
      .update({ mode: 'build' } as never)
      .eq('id', state.activeSession.id);
    dispatch({ type: 'UPDATE_ACTIVE_SESSION', payload: { mode: 'build' } });
    dispatch({ type: 'SHOW_TOAST', payload: 'Session converted to Build — full phased flow unlocked' });
  }, [state.activeSession, dispatch]);

  const handleDownload = useCallback(() => {
    if (!decision) return;
    const roundLabel = decisionMeta?.round_number ?? 1;
    const sessionName = state.activeSession?.title ?? 'session';
    const md = [
      `# Concierge Report — ${sessionName} Round ${roundLabel}`,
      '',
      '## Where the Council Agrees',
      decision.alignment_summary || '_No alignment summary._',
      '',
      '## Points of Tension',
      ...(decision.tension_points.length > 0
        ? decision.tension_points.map(point => `- ${point}`)
        : ['_No tension points identified._']),
      '',
      '## Recommended Direction',
      decision.recommended_direction || '_No recommendation._',
      '',
      '---',
      `_Generated by Maestro Concierge${decision.model_used ? ` via ${decision.model_used}` : ''}_`,
    ].join('\n');

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `concierge-report-r${roundLabel}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [decision, decisionMeta?.round_number, state.activeSession?.title]);

  const handleAskCouncilAnyway = useCallback(() => {
    const prompt = triageMeta?.prompt || triage?.prompt;
    dispatch({ type: 'SET_TRIAGE_RESULT', payload: null });
    if (!prompt || !state.activeSession) return;
    const activeAgentIds = state.agents.filter(agent => agent.is_active).map(agent => agent.id);
    void broadcast(prompt, activeAgentIds, state.activeSession, { skipTriage: true });
  }, [triageMeta?.prompt, triage?.prompt, state.activeSession, state.agents, dispatch, broadcast]);

  const handleAcknowledge = useCallback(() => {
    dispatch({ type: 'SET_TRIAGE_RESULT', payload: null });
    dispatch({ type: 'SHOW_TOAST', payload: 'Quick answer saved to the concierge thread' });
  }, [dispatch]);

  if (triage) {
    return (
      <div className="max-w-3xl rounded-2xl border border-gold/15 bg-gold/[0.06] px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <div className="font-mono-dm text-[10px] uppercase tracking-[0.2em] text-gold/85">Concierge quick answer</div>
            <div className="mt-1 text-xs text-white/50">Confidence: {Math.round(triage.confidence * 100)}%</div>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-gold/15 bg-gold/10 text-gold/80">
            <Sparkles size={16} />
          </div>
        </div>

        <div className="rounded-xl border border-gold/10 bg-black/10 px-4 py-3 text-sm leading-7 text-white/80">
          {triage.direct_answer || triage.reasoning || message.content}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            onClick={handleAskCouncilAnyway}
            className="reveal-pill"
            style={{ height: '36px', fontSize: '12px', padding: '0 16px' }}
          >
            <RotateCcw size={12} />
            Ask the council anyway
          </button>
          <button
            onClick={handleAcknowledge}
            className="reveal-pill"
            style={{ height: '36px', fontSize: '12px', padding: '0 16px', background: 'rgba(201,168,76,0.12)', borderColor: 'rgba(201,168,76,0.25)' }}
          >
            Got it
          </button>
        </div>
      </div>
    );
  }

  if (!decision) return null;

  const nextPhaseLabel = decision.recommended_next_phase
    ? NEXT_PHASE_LABELS[decision.recommended_next_phase] ?? decision.recommended_next_phase
    : null;
  const designModeLabel = decision.design_mode ? DESIGN_MODE_LABELS[decision.design_mode] : null;
  const isSimpleAsk = decision.intent === 'simple_ask';
  const isAskMode = state.activeSession?.mode === 'ask';
  const showConvertToBuild = isAskMode && roundCount >= 2;

  return (
    <div className="max-w-4xl rounded-2xl border border-gold/20 bg-[linear-gradient(180deg,rgba(214,178,74,0.08),rgba(12,11,9,0.92))]">
      <div className="flex items-start justify-between gap-4 border-b border-white/[0.05] px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="font-mono-dm text-[10px] uppercase tracking-[0.22em] text-gold/85">Concierge decision</div>
            {decision.phase && (
              <span className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 font-mono-dm text-[9px] uppercase tracking-[0.12em] text-white/45">
                {decision.phase.replace(/_/g, ' ')}
              </span>
            )}
          </div>
          {nextPhaseLabel && !isSimpleAsk && (
            <div className="mt-2 text-xs text-gold/70">
              Recommended: {nextPhaseLabel}
              {decision.recommended_next_phase === 'design' && designModeLabel ? ` (${designModeLabel})` : ''}
            </div>
          )}
        </div>
        {decision.model_used && (
          <div className="font-mono-dm text-[10px] tracking-[0.12em] text-white/40">
            via {decision.model_used}
          </div>
        )}
      </div>

      <div className="space-y-5 px-5 py-5">
        {isSimpleAsk ? (
          <div className="text-sm leading-7 text-white/80">
            {decision.recommended_direction || decision.alignment_summary || message.content}
          </div>
        ) : (
          <>
            {decision.alignment_summary && (
              <section>
                <div className="mb-2 font-mono-dm text-[9px] uppercase tracking-[0.18em] text-white/40">Where the council agrees</div>
                <p className="m-0 text-sm leading-7 text-white/80">{decision.alignment_summary}</p>
              </section>
            )}

            {decision.tension_points.length > 0 && (
              <section>
                <div className="mb-2 font-mono-dm text-[9px] uppercase tracking-[0.18em] text-white/40">Points of tension</div>
                <ul className="m-0 list-disc space-y-1 pl-5 text-sm leading-7 text-white/70">
                  {decision.tension_points.map((point, index) => (
                    <li key={`${message.id}-tension-${index}`}>{point}</li>
                  ))}
                </ul>
              </section>
            )}

            {(decision.recommended_direction || message.content) && (
              <section>
                <div className="mb-2 font-mono-dm text-[9px] uppercase tracking-[0.18em] text-white/40">Recommended direction</div>
                <p className="m-0 text-sm leading-7 text-white/80">{decision.recommended_direction || message.content}</p>
              </section>
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-white/[0.05] px-5 py-4">
        {!isSimpleAsk && (
          <>
            <button
              onClick={handleProceed}
              className="reveal-pill"
              style={{ height: '36px', fontSize: '12px', padding: '0 16px', background: 'var(--gold)', color: 'var(--void)', borderColor: 'transparent', fontWeight: 500 }}
            >
              <ArrowRight size={12} />
              {nextPhaseLabel ? `→ ${nextPhaseLabel}` : 'Proceed'}
            </button>
            <button
              onClick={handleRound2}
              className="reveal-pill"
              style={{ height: '36px', fontSize: '12px', padding: '0 16px' }}
              disabled={!decisionMeta?.prompt}
            >
              <RotateCcw size={12} />
              Round 2
            </button>
            <button
              onClick={handleOverride}
              className="reveal-pill"
              style={{ height: '36px', fontSize: '12px', padding: '0 16px' }}
            >
              <Pencil size={12} />
              Override
            </button>
            <button
              onClick={handleDownload}
              className="reveal-pill"
              style={{ height: '36px', fontSize: '12px', padding: '0 16px' }}
            >
              <Download size={12} />
              Report
            </button>
            {showConvertToBuild && (
              <button
                onClick={handleConvertToBuild}
                className="reveal-pill"
                style={{ height: '36px', fontSize: '12px', padding: '0 16px', background: 'rgba(90,184,142,0.12)', borderColor: 'rgba(90,184,142,0.25)', color: '#5ab88e', fontWeight: 500 }}
              >
                <Hammer size={12} />
                Convert to Build
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
