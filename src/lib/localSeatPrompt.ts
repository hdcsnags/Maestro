// Client-built council seat prompt for `council_seat` jobs (2026-10-22).
//
// Ports the analysis-mode essentials of supabase/functions/orchestrate/index.ts
// `buildSystemPrompt()` (persona preamble, role framing, title/perspective/signals
// guidance, verbosity tiers, scoped paths) plus the tiered session context the cloud path
// prepends in useOrchestration.callAgent. Build / build_task / artifact modes stay out on
// purpose: a local seat answers, it does not write files.
//
// Output is Markdown rather than the cloud JSON envelope: executor-api lands the seat's
// text verbatim as `responses.content`, and FolioCard renders Markdown.

import type { VerbosityTier } from '../types';

export interface LocalSeatPersona {
  voice_preamble?: string | null;
  anti_patterns?: string[] | null;
}

export interface LocalSeatPromptInput {
  agentName: string;
  agentRole: string;
  prompt: string;
  tieredContext?: string;
  persona?: LocalSeatPersona | null;
  scopedPaths?: string[];
  skills?: Array<{ name: string; instruction: string }>;
  verbosityTier?: VerbosityTier;
}

export function renderPersonaPreamble(persona: LocalSeatPersona | null | undefined): string {
  if (!persona?.voice_preamble || !persona.voice_preamble.trim()) return '';
  let block = persona.voice_preamble.trim();
  if (persona.anti_patterns && persona.anti_patterns.length > 0) {
    block += `\n\nWhat you do NOT do:\n${persona.anti_patterns.map((p) => `- ${p}`).join('\n')}`;
  }
  return block;
}

export function buildLocalSeatSystemPrompt(input: LocalSeatPromptInput): string {
  const parts: string[] = [];

  const persona = renderPersonaPreamble(input.persona);
  if (persona) parts.push(persona);

  parts.push(`You are ${input.agentName}, an AI specialist in a multi-agent orchestration council called Maestro. Your designated role is: ${input.agentRole}.`);

  parts.push([
    'When responding:',
    '1. Lead with a bold, memorable title on its own line (one sentence, no colon, under 12 words)',
    '2. Give your expert perspective on the prompt from your specific role',
    '3. Be direct, insightful, and opinionated — not generic',
    '4. Keep the response focused: 2-4 paragraphs max',
    '5. Finish with a short "Signals" section of exactly three lines:',
    '   - synthesis_fit: one line about how this fits into the bigger picture',
    '   - risk: one line about the primary risk or concern',
    '   - confidence: High/Medium/Low — one line reasoning',
    '',
    'Write plain Markdown. Do not wrap the reply in JSON or a single code fence. This is a council answer, not a task: do not run commands, edit files or explore the filesystem unless the prompt explicitly asks you to inspect something.',
  ].join('\n'));

  if (input.skills && input.skills.length > 0) {
    parts.push(
      'You have the following specialized skills active for this session:\n\n'
      + input.skills.map((skill) => `[Skill: ${skill.name}]\n${skill.instruction}`).join('\n\n'),
    );
  }

  if (input.scopedPaths && input.scopedPaths.length > 0) {
    parts.push(`Your scope is limited to the following file paths in the repository: ${input.scopedPaths.join(', ')}. Focus your analysis and recommendations within these paths.`);
  }

  if (input.verbosityTier === 'brief') {
    parts.push('Verbosity: Brief. Respond in ≤100 words. Keep your reasoning sparse and do not include a preamble.');
  } else if (input.verbosityTier === 'detailed') {
    parts.push('Verbosity: Detailed. Expand fully. Include comprehensive reasoning, tradeoffs, and code examples where appropriate.');
  }

  return parts.join('\n\n');
}

/** The one-shot text a `council_seat` job runs: system framing, prior context, request. */
export function buildLocalSeatPrompt(input: LocalSeatPromptInput): string {
  const system = buildLocalSeatSystemPrompt(input);
  const context = input.tieredContext && input.tieredContext.trim().length > 0
    ? `Prior session context (for reference only):\n\n${input.tieredContext.trim()}`
    : '';
  return [
    `SYSTEM:\n${system}`,
    context ? `CONTEXT:\n${context}` : '',
    `USER:\nCurrent request:\n${input.prompt.trim()}`,
  ].filter(Boolean).join('\n\n');
}
