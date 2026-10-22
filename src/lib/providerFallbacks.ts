// Canonical fallback chains for each build model.
// When a provider is degraded/down, dispatchTask picks the next eligible model
// from the chain before giving up or requesting user cost-approval.
//
// NOTE: keep in sync with supabase/functions/_shared/providerFallbacks.ts.

import type { FallbackChain } from '../types';

export const CANONICAL_FALLBACKS: Record<string, FallbackChain> = {
  // Anthropic
  // No Haiku anywhere in the chains (owner directive 2026-10-22).
  'claude-opus-4-6':   { primary: 'claude-opus-4-6',   fallbacks: ['gpt-5.4', 'gemini-2.5-pro'],           emergency: 'claude-sonnet-4-6' },
  'claude-sonnet-4-6': { primary: 'claude-sonnet-4-6', fallbacks: ['gpt-5.4', 'gemini-2.5-flash'],          emergency: 'gpt-5.4-mini' },

  // OpenAI
  'gpt-5.4':           { primary: 'gpt-5.4',           fallbacks: ['claude-sonnet-4-6', 'gemini-2.5-pro'],  emergency: 'gpt-5.4-mini' },
  'gpt-5.4-mini':      { primary: 'gpt-5.4-mini',      fallbacks: ['claude-sonnet-4-6', 'gemini-2.5-flash'], emergency: 'openai/gpt-oss-20b:free' },

  // Google
  'gemini-2.5-pro':    { primary: 'gemini-2.5-pro',    fallbacks: ['claude-sonnet-4-6', 'gpt-5.4'],         emergency: 'gemini-2.5-flash' },
  'gemini-2.5-flash':  { primary: 'gemini-2.5-flash',  fallbacks: ['claude-sonnet-4-6', 'gpt-5.4-mini'],     emergency: 'openai/gpt-oss-20b:free' },

  // OpenRouter
  'openai/gpt-oss-120b':     { primary: 'openai/gpt-oss-120b',     fallbacks: ['claude-sonnet-4-6', 'gpt-5.4-mini'], emergency: 'openai/gpt-oss-20b:free' },
  'openai/gpt-oss-20b:free': { primary: 'openai/gpt-oss-20b:free', fallbacks: [],                                   emergency: 'openai/gpt-oss-20b:free' },
  'x-ai/grok-4.20':          { primary: 'x-ai/grok-4.20',          fallbacks: ['claude-sonnet-4-6', 'gpt-5.4'],     emergency: 'openai/gpt-oss-20b:free' },
};

export function buildFallbackChain(primaryModel: string): FallbackChain {
  return CANONICAL_FALLBACKS[primaryModel] ?? {
    primary: primaryModel,
    fallbacks: ['claude-sonnet-4-6', 'gpt-5.4-mini'],
    emergency: 'openai/gpt-oss-20b:free',
  };
}
