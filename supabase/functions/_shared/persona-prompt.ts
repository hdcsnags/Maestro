// SOM-04: Persona voice preamble renderer + agent_query extractor.
//
// Shared by orchestrate/index.ts (injection) and deliberate/index.ts + prompt.ts
// (deliberation signature injection).
//
// IMPORTANT: persona injection and agent_query signals are ANALYSIS MODE ONLY.
// Build/build_task/artifact modes have strict JSON output schemas; injecting a
// persona block or emitting an agent_query field would corrupt manifest parsing.

export interface PersonaRecord {
  id: string;
  slug: string;
  name: string;
  one_liner: string | null;
  voice_preamble: string;
  strengths: string[] | null;
  weaknesses: string[] | null;
  routing_rules: Record<string, string> | null;
  anti_patterns: string[] | null;
  deliberation_signature: string | null;
  preferred_arguments: string[] | null;
}

export interface AgentQuerySignal {
  to: string;
  reason: string;
  question: string;
  files: string[];
  blocking: boolean;
}

/**
 * Render the persona voice block for injection into a system prompt.
 *
 * Output order (matches PERSONAS.md §3.1):
 *   1. voice_preamble  — the load-bearing prior-set
 *   2. anti_patterns   — explicit "do NOT do" tail clause
 *
 * The routing_rules are already embedded in each persona's voice_preamble text
 * ("emit an agent_query to the Builder"), so they are not re-rendered here.
 * The agent_query schema hint is injected separately in the analysis-mode
 * section of buildSystemPrompt().
 *
 * Keep output under ~250 tokens — this block sits before the role description
 * and length compounds when many agents are dispatched.
 */
export function renderPersonaBlock(persona: PersonaRecord): string {
  let block = persona.voice_preamble.trim();

  if (persona.anti_patterns?.length) {
    block += `\n\nWhat you do NOT do:\n${persona.anti_patterns.map((p) => `- ${p}`).join("\n")}`;
  }

  return block;
}

/**
 * Extract and validate an agent_query signal from a parsed JSON response.
 *
 * Returns null if no valid agent_query is present.
 * Hard limit: first agent_query wins (max one per response per PERSONAS.md §1).
 */
export function extractAgentQuery(parsed: Record<string, unknown>): AgentQuerySignal | null {
  const aq = parsed.agent_query;
  if (!aq || typeof aq !== "object" || Array.isArray(aq)) return null;

  const obj = aq as Record<string, unknown>;
  if (
    typeof obj.to !== "string" ||
    typeof obj.question !== "string" ||
    typeof obj.reason !== "string"
  ) {
    return null;
  }

  if (obj.reason.length > 200) return null; // sanity guard

  return {
    to: obj.to,
    reason: obj.reason,
    question: obj.question,
    files: Array.isArray(obj.files)
      ? (obj.files as unknown[]).filter((f): f is string => typeof f === "string")
      : [],
    blocking: obj.blocking !== false,
  };
}
