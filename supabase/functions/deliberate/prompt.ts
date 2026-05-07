// The deliberation prompt template + builders.
//
// Each agent in the council receives this prompt during the deliberation round.
// It asks three structured questions: strongest objection, where they agree,
// and the strongest objection to their own position. Output is JSON for clean
// parsing into pushbacks.
//
// Voice "—" sigils in the redacted content come from `redact.ts` and are
// intentional. Tell the agent up front so it doesn't try to "fix" them.

import type { RedactedView } from "./redact.ts";

export interface DeliberationPromptInputs {
  original_user_prompt: string;
  view: RedactedView;
}

export interface DeliberationOutput {
  objection?: {
    target_voice: string;       // "A" | "B" | "C" | etc.
    point: string;
    rationale: string;
  };
  agreement?: {
    target_voice: string;
    point: string;
    why_i_missed_it: string;
  };
  self_critique?: {
    weakness: string;
    rationale: string;
  };
  // Some agents return looser shapes; we tolerate via flexible parsing.
  raw_text?: string;
}

const SYSTEM_PROMPT = `You are a council member being asked to deliberate on a question. The council just delivered Round 1 — independent responses from each member. Now you'll see your own Round 1 response with full attribution, plus the other voices' responses without attribution (labeled "Voice A", "Voice B", etc.) to keep your reasoning focused on ideas, not sources.

You will answer THREE structured questions. Be specific. Reference voices by their letter. A vague answer wastes the round. Disagreement is welcomed; do not soften your objections to be polite. Your job is to be useful to the human reviewing this council, not to be diplomatic.

Output strictly as JSON. No prose outside the JSON object. No markdown fences. Some character substitutions like "—" in the redacted content are intentional placeholders; do not flag them.`;

/**
 * Build the per-agent user-message body for a deliberation call.
 */
export function renderDeliberationUserMessage(inputs: DeliberationPromptInputs): string {
  const { original_user_prompt, view } = inputs;

  const otherVoices = view.others.map(o => {
    return `─── VOICE ${o.voice_label} ───\n${o.redacted_content}\n`;
  }).join("\n");

  return `ORIGINAL PROMPT THE COUNCIL ANSWERED:
${original_user_prompt}

YOUR ROUND 1 RESPONSE:
${view.own.content}

OTHER VOICES (anonymized):

${otherVoices}

──────────────────────────────────────────────

Now answer THREE questions.

QUESTION 1 — STRONGEST OBJECTION YOU'D RAISE
Pick a voice (A/B/C/...) other than yourself and identify the most important critique you would raise against their position. Be specific about the claim being objected to. Do NOT critique your own response. If you find multiple critiques, pick the one most likely to change a decision-maker's mind.

QUESTION 2 — WHERE YOU GENUINELY AGREE
Identify ONE point where another voice (A/B/C/...) said something you wish YOU had said in Round 1. Only flag it if you think the point is correct AND your own response missed it. This is not flattery — only mark genuine omissions.

QUESTION 3 — STRONGEST OBJECTION TO YOUR OWN POSITION
Read your Round 1 response again. What is the strongest objection a careful critic would raise against it? You must identify a real weakness. Saying "no significant weakness" is not acceptable — every position has weaknesses.

OUTPUT FORMAT (strict JSON, no markdown, no commentary):
{
  "objection": {
    "target_voice": "A",
    "point": "the specific claim being objected to",
    "rationale": "why this point is wrong or weak"
  },
  "agreement": {
    "target_voice": "B",
    "point": "the specific point being acknowledged",
    "why_i_missed_it": "why my Round 1 response did not include this"
  },
  "self_critique": {
    "weakness": "the strongest objection to my own Round 1 response",
    "rationale": "why this is a real weakness, not a hypothetical one"
  }
}`;
}

export function getDeliberationSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

/**
 * Parse a model's deliberation response into the structured output type.
 *
 * Tolerates several known failure modes:
 * - Markdown code fences around the JSON
 * - Leading/trailing prose outside the JSON object
 * - Missing fields (returns undefined for those rather than throwing)
 * - Voice labels with "Voice " prefix (e.g., "Voice A" instead of "A")
 *
 * If the response is genuinely unparseable as JSON, we return raw_text so the
 * orchestrator can still record the agent's attempt as a stored deliberation
 * row with metadata.parse_failed: true.
 */
export function parseDeliberationOutput(rawText: string): DeliberationOutput {
  const trimmed = rawText.trim();

  // Strategy 1: try direct JSON parse.
  try {
    const direct = JSON.parse(trimmed);
    return normalizeOutput(direct, trimmed);
  } catch {
    // fall through
  }

  // Strategy 2: strip ```json fences if present.
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) {
    try {
      const fenceParsed = JSON.parse(fenceMatch[1].trim());
      return normalizeOutput(fenceParsed, trimmed);
    } catch {
      // fall through
    }
  }

  // Strategy 3: extract first balanced { ... } block.
  const braceStart = trimmed.indexOf("{");
  const braceEnd = trimmed.lastIndexOf("}");
  if (braceStart >= 0 && braceEnd > braceStart) {
    try {
      const candidate = trimmed.slice(braceStart, braceEnd + 1);
      const sliced = JSON.parse(candidate);
      return normalizeOutput(sliced, trimmed);
    } catch {
      // fall through
    }
  }

  // All parsing failed — return raw text only. Orchestrator decides what to
  // do with it (likely: store with metadata.parse_failed: true).
  return { raw_text: trimmed };
}

function normalizeOutput(parsed: unknown, originalText: string): DeliberationOutput {
  if (typeof parsed !== "object" || parsed === null) {
    return { raw_text: originalText };
  }

  const obj = parsed as Record<string, unknown>;
  const output: DeliberationOutput = {};

  if (isObject(obj.objection)) {
    output.objection = {
      target_voice: normalizeVoiceLabel(obj.objection.target_voice),
      point: stringOr(obj.objection.point, ""),
      rationale: stringOr(obj.objection.rationale, ""),
    };
  }
  if (isObject(obj.agreement)) {
    output.agreement = {
      target_voice: normalizeVoiceLabel(obj.agreement.target_voice),
      point: stringOr(obj.agreement.point, ""),
      why_i_missed_it: stringOr(obj.agreement.why_i_missed_it, ""),
    };
  }
  if (isObject(obj.self_critique)) {
    output.self_critique = {
      weakness: stringOr(obj.self_critique.weakness, ""),
      rationale: stringOr(obj.self_critique.rationale, ""),
    };
  }

  // If nothing parsed cleanly, surface raw_text so caller can act on it.
  if (!output.objection && !output.agreement && !output.self_critique) {
    output.raw_text = originalText;
  }

  return output;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeVoiceLabel(value: unknown): string {
  if (typeof value !== "string") return "";
  // Accept "A", "Voice A", "voice a" — normalize to single uppercase letter.
  return value.trim().toUpperCase().replace(/^VOICE\s+/i, "").trim();
}
