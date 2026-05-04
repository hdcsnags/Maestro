// Provider health state machine.
// Pure functions — no React, no Supabase, no side effects.
// The module-level reroute-handler registry is the only stateful piece;
// it bridges the dispatch loop (useBuildExecution) to the approval card UI.

import { getModelPricing } from './cost';
import type { ProviderHealthRecord, ProviderHealthState, FallbackChain, FailureClass } from '../types';

export type ProviderHealthMap = Map<string, ProviderHealthRecord>;

// The maximum cost delta (USD) that triggers the reroute approval gate.
export const REROUTE_COST_THRESHOLD = 1.0;

// ── Model → provider mapping ───────────────────────────────────────────────

export function modelToProviderKey(modelId: string): string {
  if (modelId.startsWith('claude-')) return 'anthropic';
  if (modelId.startsWith('gpt-') || modelId.startsWith('o1') || modelId.startsWith('o3')) return 'openai';
  if (modelId.startsWith('gemini-')) return 'google';
  return 'openrouter'; // slash-namespaced OpenRouter models + unknown
}

// ── State machine helpers ──────────────────────────────────────────────────

export function healthRank(state: ProviderHealthState): number {
  switch (state) {
    case 'healthy':      return 0;
    case 'unknown':      return 1;
    case 'degraded':     return 2;
    case 'rate_limited': return 3;
    case 'down':         return 4;
    default:             return 1;
  }
}

export function classifyFailure(errMsg: string): FailureClass {
  const lower = errMsg.toLowerCase();
  if (lower.includes('429') || lower.includes('rate limit') || lower.includes('rate_limit')) return 'rate_limited';
  if (lower.includes('504') || lower.includes('timeout') || lower.includes('timed out'))      return 'timeout';
  if (lower.includes('401') || lower.includes('403') || lower.includes('unauthorized'))        return 'auth_error';
  if (lower.includes('500') || lower.includes('502') || lower.includes('503'))                 return 'server_error';
  return 'unknown';
}

export function updateHealth(
  existing: ProviderHealthRecord,
  event: 'success' | 'failure',
  failureClass?: FailureClass,
  rateLimitSeconds?: number,
): ProviderHealthRecord {
  const now = new Date().toISOString();
  const rec: ProviderHealthRecord = { ...existing, updated_at: now };

  if (event === 'success') {
    rec.last_success_at = now;
    rec.recent_success_count = (rec.recent_success_count ?? 0) + 1;
    rec.recent_failure_count = 0;
    if (rec.state === 'down') {
      rec.state = 'degraded';
    } else if ((rec.recent_success_count ?? 0) >= 3) {
      rec.state = 'healthy';
      rec.rate_limit_until = null;
    }
  } else {
    rec.last_failure_at = now;
    rec.recent_failure_count = (rec.recent_failure_count ?? 0) + 1;
    rec.recent_success_count = 0;
    rec.last_failure_reason = failureClass ?? 'unknown';

    if (failureClass === 'rate_limited') {
      rec.state = 'rate_limited';
      if (rateLimitSeconds) {
        rec.rate_limit_until = new Date(Date.now() + rateLimitSeconds * 1000).toISOString();
      }
    } else if ((rec.recent_failure_count ?? 0) >= 3) {
      rec.state = 'down';
    } else if ((rec.recent_failure_count ?? 0) >= 2) {
      rec.state = 'degraded';
    }
  }
  return rec;
}

// Select the best available model from a chain.
// Returns null only if the emergency fallback is also excluded.
export function selectModel(
  chain: FallbackChain,
  health: ProviderHealthMap,
  connectedProviders: Set<string>,
  excludeModels: Set<string> = new Set(),
): string | null {
  const candidates = [chain.primary, ...chain.fallbacks];

  for (const model of candidates) {
    if (excludeModels.has(model)) continue;
    const provider = modelToProviderKey(model);
    const isFree = model.endsWith(':free');
    if (!isFree && !connectedProviders.has(provider)) continue;

    const rec = health.get(provider);
    const state = rec?.state ?? 'unknown';
    if (state === 'down') continue;
    if (state === 'rate_limited') {
      const until = rec?.rate_limit_until;
      if (until && new Date(until) > new Date()) continue;
    }
    return model;
  }

  // Emergency fallback is always attempted last
  if (!excludeModels.has(chain.emergency)) return chain.emergency;
  return null;
}

// Compute cost delta (USD) when switching from one model to another.
// Uses prompt_slice chars as input proxy; output estimated at 800 tokens per file.
export function computeCostDelta(
  fromModel: string,
  toModel: string,
  promptChars: number,
): number {
  const inputTokens = Math.ceil(promptChars / 4);
  const outputTokens = 800;
  const from = getModelPricing(fromModel);
  const to   = getModelPricing(toModel);
  const fromCost = (inputTokens * from.inputPer1M + outputTokens * from.outputPer1M) / 1_000_000;
  const toCost   = (inputTokens * to.inputPer1M   + outputTokens * to.outputPer1M)   / 1_000_000;
  return toCost - fromCost;
}

// ── Reroute waiter registry ────────────────────────────────────────────────
// Bridges the async dispatch loop (useBuildExecution) to the approval card UI.
// Only one build runs at a time — module-level singleton is intentional.

export type RerouteDecision = 'approved' | 'emergency' | 'skip';
type RerouteHandlerFn = (buildTaskId: string, decision: RerouteDecision) => void;

let _rerouteHandler: RerouteHandlerFn | null = null;

export function registerRerouteHandler(fn: RerouteHandlerFn | null): void {
  _rerouteHandler = fn;
}

export function resolveReroute(buildTaskId: string, decision: RerouteDecision): void {
  _rerouteHandler?.(buildTaskId, decision);
}
