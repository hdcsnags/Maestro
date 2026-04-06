// Local model pricing map — NEVER call an external API for pricing.
// Numbers are approximate USD per 1M tokens (input / output), meant for
// "trust feature" broadcast estimates, not billing. Update manually when
// provider pricing drifts.

export interface ModelPrice {
  inputPer1M: number;
  outputPer1M: number;
}

export const MODEL_PRICING_MAP: Record<string, ModelPrice> = {
  // Anthropic (direct)
  'claude-opus-4-6': { inputPer1M: 15, outputPer1M: 75 },
  'claude-sonnet-4-6': { inputPer1M: 3, outputPer1M: 15 },
  'claude-sonnet-4-5': { inputPer1M: 3, outputPer1M: 15 },
  'claude-sonnet-4': { inputPer1M: 3, outputPer1M: 15 },
  'claude-haiku-4-5': { inputPer1M: 0.8, outputPer1M: 4 },
  'claude-haiku-3-5': { inputPer1M: 0.8, outputPer1M: 4 },

  // OpenAI (direct)
  'gpt-4o': { inputPer1M: 2.5, outputPer1M: 10 },
  'gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'o1': { inputPer1M: 15, outputPer1M: 60 },
  'o1-mini': { inputPer1M: 3, outputPer1M: 12 },

  // Google Gemini (direct)
  'gemini-2.0-flash': { inputPer1M: 0.1, outputPer1M: 0.4 },
  'gemini-2.0-flash-001': { inputPer1M: 0.1, outputPer1M: 0.4 },
  'gemini-1.5-flash': { inputPer1M: 0.075, outputPer1M: 0.3 },
  'gemini-1.5-pro': { inputPer1M: 1.25, outputPer1M: 5 },
  'gemini-ultra': { inputPer1M: 14, outputPer1M: 56 },

  // OpenRouter paid wrappers
  'anthropic/claude-opus-4-6': { inputPer1M: 15, outputPer1M: 75 },
  'anthropic/claude-sonnet-4-6': { inputPer1M: 3, outputPer1M: 15 },
  'anthropic/claude-sonnet-4': { inputPer1M: 3, outputPer1M: 15 },
  'anthropic/claude-haiku-3-5': { inputPer1M: 0.8, outputPer1M: 4 },
  'openai/gpt-4o': { inputPer1M: 2.5, outputPer1M: 10 },
  'openai/gpt-4o-mini': { inputPer1M: 0.15, outputPer1M: 0.6 },
  'openai/o1': { inputPer1M: 15, outputPer1M: 60 },
  'google/gemini-2.0-flash-001': { inputPer1M: 0.1, outputPer1M: 0.4 },
  'google/gemini-1.5-pro': { inputPer1M: 1.25, outputPer1M: 5 },
  'google/gemini-ultra': { inputPer1M: 14, outputPer1M: 56 },
  'mistralai/mistral-large': { inputPer1M: 2, outputPer1M: 6 },
  'deepseek/deepseek-chat-v3-0324': { inputPer1M: 0.27, outputPer1M: 1.1 },
  'z-ai/glm-5v-turbo': { inputPer1M: 0.5, outputPer1M: 2 },
};

// Fallback for any unmapped paid model
const DEFAULT_PAID: ModelPrice = { inputPer1M: 2, outputPer1M: 8 };

export function isFreeModel(model: string): boolean {
  return model.endsWith(':free');
}

export function getModelPricing(model: string): ModelPrice {
  if (isFreeModel(model)) return { inputPer1M: 0, outputPer1M: 0 };
  return MODEL_PRICING_MAP[model] ?? DEFAULT_PAID;
}

export interface CostEstimate {
  low: number;
  high: number;
  premiumCount: number;
  freeCount: number;
  total: number;
}

// Estimate broadcast cost as a range. Input tokens are derived from the
// prompt + context character count (~4 chars/token). Output tokens are
// assumed to span 500 (low) to 1500 (high) per agent — this is the source
// of the range, which reflects genuine uncertainty rather than precision
// we don't have.
export function estimateBroadcastCost(
  models: string[],
  promptChars: number,
  contextChars: number = 0,
): CostEstimate {
  const inputTokens = Math.ceil((promptChars + contextChars) / 4);
  const outputLow = 500;
  const outputHigh = 1500;

  let low = 0;
  let high = 0;
  let premiumCount = 0;
  let freeCount = 0;

  for (const m of models) {
    if (isFreeModel(m)) {
      freeCount++;
      continue;
    }
    premiumCount++;
    const p = getModelPricing(m);
    low += (inputTokens * p.inputPer1M) / 1_000_000
         + (outputLow * p.outputPer1M) / 1_000_000;
    high += (inputTokens * p.inputPer1M) / 1_000_000
          + (outputHigh * p.outputPer1M) / 1_000_000;
  }

  return { low, high, premiumCount, freeCount, total: models.length };
}

export function formatUsd(n: number): string {
  if (n === 0) return '$0.00';
  if (n < 0.01) return `$${n.toFixed(4)}`;
  if (n < 1) return `$${n.toFixed(3)}`;
  return `$${n.toFixed(2)}`;
}

export function formatCostRange(estimate: CostEstimate): string {
  const { low, high } = estimate;
  if (low === 0 && high === 0) return '$0.00';
  if (Math.abs(low - high) < 0.005) return `~${formatUsd(low)}`;
  return `~${formatUsd(low)}–${formatUsd(high)}`;
}

// P12 — Premium slot cap
export const PREMIUM_SLOT_CAP = 3;
