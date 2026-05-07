// Voice mapping + content redaction for the deliberation round.
//
// When the council deliberates, each agent receives the OTHER agents' Round 1
// responses without attribution — they're labeled "Voice A", "Voice B", "Voice C"
// in deterministic order. This reduces brand bias: agents critique ideas, not
// "Sonnet's idea" or "GPT's idea". Style still leaks (writing voice differs across
// models), but explicit attribution does not. Partial mitigation > no mitigation.
//
// After the deliberation responses arrive, we reverse-map "Voice A" references
// back to the real response_id so pushbacks store with concrete targets.

export interface PrimaryResponseRow {
  id: string;
  agent_id: string | null;
  agent_name: string;
  provider: string;
  model: string;
  content: string;
}

export interface VoiceMapEntry {
  voice_label: string;          // "A", "B", "C", "D"
  response_id: string;
  agent_id: string | null;
  agent_name: string;           // kept for our internal logging only — never sent to the LLM
}

export interface RedactedView {
  // What this agent sees as "their own R1 response" — kept fully attributed to themselves.
  own: PrimaryResponseRow;

  // What this agent sees as "other voices" — labeled, content redacted.
  others: Array<{
    voice_label: string;
    redacted_content: string;
  }>;

  // Internal map for resolving voice labels back to real ids when pushbacks arrive.
  voice_map: VoiceMapEntry[];
}

/**
 * Builds a per-agent redacted view of the round.
 *
 * Voice ordering is deterministic across the round (sorted by response.id, with
 * the focused agent excluded), so each agent in the round sees the same labels
 * for the same other-agent responses. This keeps cross-agent reasoning
 * consistent — Voice A is always the same "real" agent, no matter who is being
 * asked to deliberate.
 *
 * @param all - all primary responses for this round (4-letter labels max in v1: A-D).
 * @param focusedResponseId - the id of the response whose author is being prompted.
 */
export function buildRedactedView(
  all: PrimaryResponseRow[],
  focusedResponseId: string,
): RedactedView {
  const own = all.find(r => r.id === focusedResponseId);
  if (!own) {
    throw new Error(`buildRedactedView: focused response ${focusedResponseId} not found in round`);
  }

  // Deterministic ordering for stable voice labels.
  const others = all
    .filter(r => r.id !== focusedResponseId)
    .sort((a, b) => a.id.localeCompare(b.id));

  const voiceMap: VoiceMapEntry[] = others.map((row, index) => ({
    voice_label: indexToVoiceLabel(index),
    response_id: row.id,
    agent_id: row.agent_id,
    agent_name: row.agent_name,
  }));

  const redactedOthers = voiceMap.map((entry, index) => ({
    voice_label: entry.voice_label,
    redacted_content: redactContent(others[index].content, others[index]),
  }));

  return {
    own,
    others: redactedOthers,
    voice_map: voiceMap,
  };
}

/**
 * Convert a 0-indexed integer to a voice label.
 * 0 -> "A", 1 -> "B", 2 -> "C", 3 -> "D".
 *
 * Capped at 26 (single-letter labels). The deliberation round in v1 supports
 * up to 5 active council agents; if the user activates more, voice labels
 * roll into double letters. Cosmetic only — the voice_map handles arbitrary
 * counts.
 */
export function indexToVoiceLabel(index: number): string {
  if (index < 0) {
    throw new Error(`indexToVoiceLabel: negative index ${index}`);
  }
  if (index < 26) {
    return String.fromCharCode(65 + index);
  }
  // 26+ -> "AA", "AB", ... — double letters.
  const first = Math.floor(index / 26) - 1;
  const second = index % 26;
  return String.fromCharCode(65 + first) + String.fromCharCode(65 + second);
}

/**
 * Strip identifying metadata from a response's content body before showing
 * it to another agent.
 *
 * What we strip:
 * - Provider/model name strings ("Sonnet", "Claude", "GPT", "Gemini", etc.)
 *   when they appear as bare attribution like "As Claude, I think..."
 * - Agent self-identification phrases ("I am Sonnet 4.6", "Speaking as GPT",
 *   "From the Anthropic perspective") at the start of paragraphs.
 *
 * What we PRESERVE (intentional v1 limitation):
 * - Markdown formatting, code blocks, structure
 * - Writing style (verbosity, tone, characteristic phrases)
 * - Any reference to other agents inside the content body that AREN'T
 *   self-attribution. We do not try to be clever about contextual mentions —
 *   the brittle ones get caught, the rest leak.
 *
 * Rationale: full neutralization would require LLM rewriting (extra cost,
 * extra latency, extra failure mode). v1 accepts style leakage as documented;
 * v2 may add neutral-voice rewriting if real-world deliberations show the
 * leakage materially defeats redaction.
 */
function redactContent(content: string, row: PrimaryResponseRow): string {
  let working = content;

  // Build the redaction patterns from the actual agent metadata.
  const tokensToScrub = collectIdentityTokens(row);

  for (const token of tokensToScrub) {
    // Whole-word, case-insensitive. Replace with neutral placeholder.
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\b`, "gi");
    working = working.replace(regex, "—");
  }

  // Catch self-attribution opening phrases: "As Claude," / "Speaking as GPT," /
  // "I am Sonnet" / "From the Gemini perspective" — any sentence opening that
  // reveals identity.
  working = working.replace(
    /^(\s*)(as|speaking as|i am|from|writing as|representing)\s+[—\w][\w\s\-]{0,40}?(perspective|side|viewpoint|model|agent)?[,:.]/gim,
    "$1",
  );

  // Trim any leading whitespace introduced by removed openers.
  return working.replace(/^\s+/gm, "").trim();
}

function collectIdentityTokens(row: PrimaryResponseRow): string[] {
  const tokens = new Set<string>();

  // Agent name (e.g., "Claude Sonnet 4.6", "GPT-5.4 Mini")
  if (row.agent_name) {
    tokens.add(row.agent_name);
    // Also each whitespace-separated component, since the agent name will
    // typically contain provider + model words (e.g., "Sonnet").
    for (const part of row.agent_name.split(/[\s\-]+/)) {
      if (part.length >= 3) {
        tokens.add(part);
      }
    }
  }

  // Provider word (e.g., "anthropic", "openai", "google")
  if (row.provider) {
    tokens.add(row.provider);
  }

  // Model identifier — split on common separators
  if (row.model) {
    tokens.add(row.model);
    // Also model family words: "claude", "haiku", "opus", "gemini", "kimi"
    for (const part of row.model.split(/[\-/.]/)) {
      if (part.length >= 3) {
        tokens.add(part);
      }
    }
  }

  // Universal identity tokens that frequently appear in self-attribution
  // even when the agent's name doesn't — agents sometimes refer to their
  // family ("the Anthropic perspective") rather than their model name.
  for (const word of ["claude", "anthropic", "sonnet", "opus", "haiku",
                      "gpt", "openai", "gpt-5", "gpt-4",
                      "gemini", "google", "google deepmind",
                      "kimi", "moonshot", "moonshotai",
                      "llama", "meta", "mistral", "qwen", "grok"]) {
    tokens.add(word);
  }

  return [...tokens];
}

/**
 * Resolve a voice label (e.g., "A") back to the real response_id, given a
 * voice map. Returns null if the label is unknown — agents occasionally
 * hallucinate labels or reference voices that don't exist.
 */
export function resolveVoiceLabel(
  voiceMap: VoiceMapEntry[],
  label: string,
): VoiceMapEntry | null {
  const normalized = label.trim().toUpperCase().replace(/^VOICE\s+/i, "");
  return voiceMap.find(entry => entry.voice_label === normalized) ?? null;
}
