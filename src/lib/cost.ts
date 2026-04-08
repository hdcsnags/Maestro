// Local model pricing map — NEVER call an external API for pricing.
// Numbers are USD per 1M tokens (input / output), sourced from official
// provider docs. Used for "trust feature" broadcast estimates, not billing.
// Update manually when provider pricing drifts.

export interface ModelPrice {
  inputPer1M: number;
  outputPer1M: number;
  context: number;
}

export const MODEL_PRICING_MAP: Record<string, ModelPrice> = {
  // ─── OpenAI (direct) — GPT-5.4 family ───────────────────────────
  'gpt-5.4':      { inputPer1M: 2.50, outputPer1M: 15.00, context: 1050000 },
  'gpt-5.4-mini': { inputPer1M: 0.75, outputPer1M: 4.50,  context: 400000  },
  'gpt-5.4-nano': { inputPer1M: 0.20, outputPer1M: 1.25,  context: 400000  },

  // ─── Google Gemini (direct) ─────────────────────────────────────
  // EXPIRING Jun 17 2026 — replacement: gemini-3.1-pro-preview
  'gemini-2.5-pro':                { inputPer1M: 1.25, outputPer1M: 10.00, context: 1048576 },
  'gemini-2.5-flash':              { inputPer1M: 0.30, outputPer1M: 2.50,  context: 1048576 },
  'gemini-3.1-pro-preview':        { inputPer1M: 2.00, outputPer1M: 12.00, context: 1048576 },
  'gemini-3.1-flash-lite-preview': { inputPer1M: 0.25, outputPer1M: 1.50,  context: 1048576 },

  // ─── Anthropic (direct) ─────────────────────────────────────────
  'claude-opus-4-6':   { inputPer1M: 5.00, outputPer1M: 25.00, context: 1000000 },
  'claude-sonnet-4-6': { inputPer1M: 3.00, outputPer1M: 15.00, context: 1000000 },
  'claude-haiku-4-5':  { inputPer1M: 1.00, outputPer1M: 5.00,  context: 200000  },

  // ─── OpenRouter ─────────────────────────────────────────────────
  'x-ai/grok-4.20':              { inputPer1M: 2.00,  outputPer1M: 6.00, context: 2000000 },
  'openai/gpt-oss-120b':         { inputPer1M: 0.039, outputPer1M: 0.19, context: 131072  },
  'openai/gpt-oss-20b:free':     { inputPer1M: 0,     outputPer1M: 0,    context: 131072  },
  'google/gemma-4-31b-it:free':  { inputPer1M: 0,     outputPer1M: 0,    context: 131072  },
};

// Fallback for any unmapped paid model
const DEFAULT_PAID: ModelPrice = { inputPer1M: 2, outputPer1M: 8, context: 128000 };

export function isFreeModel(model: string): boolean {
  return model.endsWith(':free');
}

export function getModelPricing(model: string): ModelPrice {
  if (isFreeModel(model)) return { inputPer1M: 0, outputPer1M: 0, context: MODEL_PRICING_MAP[model]?.context ?? 131072 };
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
