// Client-built synthesis prompt for `concierge_turn` jobs (P4, 2026-10-22).
//
// Ports the deliberation-aware template of supabase/functions/synthesize/index.ts
// (consensus / trade_offs / acknowledged_weaknesses / unresolved_tensions /
// recommendation); a round without deliberation gets the same shape with a note.
// The parse is tolerant: fenced or bare JSON, or the whole text as `recommendation` and
// `content` when the local model ignored the format.

export interface SynthesisPrimaryRow {
  id: string;
  agent_name: string;
  content: string;
}

export interface SynthesisPushbackRow {
  target_voice: string;
  summary: string;
  kind: 'objection' | 'agreement' | 'self_critique';
}

export interface SynthesisDeliberationRow {
  agent_name: string;
  deliberation_pushbacks: SynthesisPushbackRow[] | null;
}

export interface LocalSynthesisOutput {
  content: string;
  consensus?: string;
  trade_offs?: unknown[];
  acknowledged_weaknesses?: unknown[];
  unresolved_tensions?: string[];
  recommendation?: string;
}

const DELIBERATION_SYSTEM_PROMPT = `You are synthesizing multiple expert voices on a question, AFTER they had the opportunity to push back on each other in a structured deliberation round.

Your synthesis MUST do all of the following:

1. Identify points where agents AGREED post-deliberation. These are the strongest signals — what did everyone, after pushback, still believe?

2. Identify points where agents DISAGREED post-deliberation. Do NOT blend these into a compromise. Surface each disagreement as: "Agent X argued for A; Agent Y argued for B; the disagreement was about [specific axis]."

3. Identify ACKNOWLEDGED WEAKNESSES — points where an agent admitted in self-critique that their own position had a real flaw. These are high-confidence concerns regardless of what is otherwise synthesized.

4. End with unresolved_tensions — a list of disagreements that were raised but not resolved. The user needs to make these calls themselves.

OUTPUT FORMAT (strict JSON, no markdown fences):
{
  "consensus": "1-2 paragraphs: what survived deliberation",
  "trade_offs": [
    { "axis": "what's at stake", "side_a": { "agent": "name", "position": "..." }, "side_b": { "agent": "name", "position": "..." } }
  ],
  "acknowledged_weaknesses": [
    { "agent": "name", "weakness": "what they admitted" }
  ],
  "unresolved_tensions": [
    "1-sentence statement of a decision the user must make"
  ],
  "recommendation": "1-2 paragraphs: your best synthesis-of-record, with caveats. Prose, not bullets.",
  "content": "Plain-prose version of consensus + recommendation for the legacy UI surface that doesn't render structured fields."
}

CRITICAL: Do NOT manufacture consensus. If agents genuinely disagreed and the disagreement was not resolved by deliberation, that goes in unresolved_tensions. The user explicitly chose to run a deliberation round to surface tension; do not erase it. Do not run commands or inspect files; everything you need is in the USER section.`;

// The brainstorm card and SynthesisDrawer read the structured fields, so even a round
// without deliberation asks for the JSON shape — with an empty trade_offs list when no
// pushbacks exist — rather than bare prose.
const STRUCTURED_NO_DELIBERATION_NOTE = `This round had NO deliberation step: treat the responses as Round 1 only. Still return the JSON object described above. Use "trade_offs" for disagreements you can see between the responses themselves, and leave "acknowledged_weaknesses" empty unless a response criticises its own position.`;

export function renderSynthesisUserMessage(
  prompt: string,
  primaries: SynthesisPrimaryRow[],
  deliberations: SynthesisDeliberationRow[],
): string {
  const r1 = primaries.map((p) => `### ${p.agent_name}\n${p.content}`).join('\n\n');

  const r2Lines: string[] = [];
  for (const d of deliberations) {
    const pushbacks = d.deliberation_pushbacks ?? [];
    if (pushbacks.length === 0) continue;
    r2Lines.push(`### ${d.agent_name}`);
    for (const p of pushbacks) {
      const stanceLabel = p.kind === 'objection' ? 'Objection' : p.kind === 'agreement' ? 'Agreement' : 'Self-critique';
      r2Lines.push(`- **${stanceLabel}** ${p.target_voice !== 'self' ? `(toward Voice ${p.target_voice})` : ''}: ${p.summary}`);
    }
    r2Lines.push('');
  }
  const r2 = r2Lines.join('\n');

  return `ORIGINAL QUESTION:
${prompt}

ROUND 1 — INDEPENDENT RESPONSES:

${r1}

ROUND 2 — DELIBERATION (each voice's structured pushbacks):

${r2 || '(No deliberation pushbacks recorded — treat as Round 1 only.)'}

Synthesize per the output format. Preserve tension; do not manufacture consensus.`;
}

export interface LocalSynthesisPromptInput {
  prompt: string;
  primaries: SynthesisPrimaryRow[];
  deliberations: SynthesisDeliberationRow[];
  deliberated: boolean;
  // Extra text the cloud path appends (direct-thread conversations).
  extraContext?: string;
}

export function buildLocalSynthesisPrompt(input: LocalSynthesisPromptInput): { prompt: string } {
  const hasPushbacks = input.deliberations.some((d) => (d.deliberation_pushbacks ?? []).length > 0);
  const system = input.deliberated && hasPushbacks
    ? DELIBERATION_SYSTEM_PROMPT
    : `${DELIBERATION_SYSTEM_PROMPT}\n\n${STRUCTURED_NO_DELIBERATION_NOTE}`;
  const user = renderSynthesisUserMessage(input.prompt, input.primaries, input.deliberations)
    + (input.extraContext && input.extraContext.trim() ? `\n\n${input.extraContext.trim()}` : '');
  return { prompt: `SYSTEM:\n${system}\n\nUSER:\n${user}` };
}

function stringField(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/** Tolerant parse of a local synthesis reply. Never throws. */
export function parseLocalSynthesis(rawText: string): LocalSynthesisOutput {
  const trimmed = rawText.trim();
  const candidates: string[] = [trimmed];
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) candidates.push(fenceMatch[1].trim());
  const braceStart = trimmed.indexOf('{');
  const braceEnd = trimmed.lastIndexOf('}');
  if (braceStart >= 0 && braceEnd > braceStart) candidates.push(trimmed.slice(braceStart, braceEnd + 1));

  for (const candidate of candidates) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue;
    const obj = parsed as Record<string, unknown>;
    const consensus = stringField(obj, 'consensus');
    const recommendation = stringField(obj, 'recommendation');
    const content = stringField(obj, 'content') ?? [consensus, recommendation].filter(Boolean).join('\n\n');
    if (!content && !consensus && !recommendation) continue;
    return {
      content: content || trimmed,
      ...(consensus ? { consensus } : {}),
      ...(Array.isArray(obj.trade_offs) ? { trade_offs: obj.trade_offs } : {}),
      ...(Array.isArray(obj.acknowledged_weaknesses) ? { acknowledged_weaknesses: obj.acknowledged_weaknesses } : {}),
      ...(Array.isArray(obj.unresolved_tensions)
        ? { unresolved_tensions: obj.unresolved_tensions.filter((t): t is string => typeof t === 'string') }
        : {}),
      ...(recommendation ? { recommendation } : {}),
    };
  }

  // Not JSON: the whole text is the recommendation and the legacy content.
  return { content: trimmed, recommendation: trimmed };
}
