// Conversation-through-Claw helpers (2026-10-22).
//
// The owner's directive: the site should not burn API keys for concierge turns when a
// MaestroClaw worker is online — send the turn to the claw and stream it back. These are
// the pure, testable pieces: prompt flattening, event-line extraction, verdict stripping,
// per-adapter default models and the localStorage persistence of the backend choice.

import type { Agent, ConversationBackend, Executor } from '../types';
import { selectOnlineExecutor } from './sessionBuild';

export const LOCAL_CONVERSATION_MODELS: Array<{ id: string; label: string }> = [
  { id: 'sonnet', label: 'sonnet' },
  { id: 'opus', label: 'opus' },
];

export const DEFAULT_CONCIERGE_ADAPTER = 'claude_code';
export const DEFAULT_CONCIERGE_LOCAL_MODEL = 'sonnet';

// Per-adapter default local model for council seats (context_bundle.model). `undefined`
// lets the adapter use its own default (codex).
export const DEFAULT_LOCAL_SEAT_MODELS: Record<string, string | undefined> = {
  claude_code: 'sonnet',
  agy_cli: 'gemini-4-argon-high',
  codex_cli: undefined,
  kimi_cli: 'kimi-code/k3',
  copilot_cli: undefined,
  gemini_cli: undefined,
};

// Maestro agent name → MaestroClaw adapter. `agent.model` already carries the adapter
// for maestroclaw agents; the name map is a fallback for renamed rows.
export const CLAW_AGENT_ADAPTERS: Record<string, string> = {
  ClawClaude: 'claude_code',
  ClawCodex: 'codex_cli',
  ClawAgy: 'agy_cli',
  ClawKimi: 'kimi_cli',
  ClawCopilot: 'copilot_cli',
  ClawGemini: 'gemini_cli',
};

export function resolveSeatAdapter(agent: Pick<Agent, 'name' | 'model' | 'provider_group'>): string | null {
  if (agent.provider_group !== 'maestroclaw') return null;
  if (typeof agent.model === 'string' && agent.model.trim().length > 0) return agent.model.trim();
  return CLAW_AGENT_ADAPTERS[agent.name] ?? null;
}

export function resolveLocalSeatModel(agent: Pick<Agent, 'name' | 'model' | 'provider_group' | 'local_model'>): string | undefined {
  if (typeof agent.local_model === 'string' && agent.local_model.trim().length > 0) return agent.local_model.trim();
  const adapter = resolveSeatAdapter(agent);
  return adapter ? DEFAULT_LOCAL_SEAT_MODELS[adapter] : undefined;
}

// ── Prompt flattening ─────────────────────────────────────────────────────────

export interface FlatConciergePromptParts {
  system: string;
  conversation?: string;
  user: string;
}

/** "SYSTEM:\n…\n\nCONVERSATION:\n…\n\nUSER:\n…" — the one-shot form a CLI adapter runs. */
export function flattenConciergePrompt(parts: FlatConciergePromptParts): string {
  const sections = [`SYSTEM:\n${parts.system.trim()}`];
  if (parts.conversation && parts.conversation.trim().length > 0) {
    sections.push(`CONVERSATION:\n${parts.conversation.trim()}`);
  }
  sections.push(`USER:\n${parts.user.trim()}`);
  return sections.join('\n\n');
}

// Port of orchestrate's analysis-mode essentials for the Concierge, minus the JSON
// wrapper: a CLI turn streams prose, and the thread renders markdown directly.
export const CONCIERGE_LOCAL_SYSTEM_PROMPT = [
  'You are Concierge, the conversational partner in Maestro — a multi-agent orchestration workspace. Your designated role is: Concierge — conversational partner for Maestro Claw Mode.',
  '',
  'You are answering ONE turn of an ongoing conversation. The CONVERSATION section (if present) is the thread so far; the USER section is the message to answer now.',
  '',
  'When responding:',
  '1. Answer directly and specifically; be insightful and opinionated, not generic.',
  '2. Keep it focused: a few short paragraphs, or a tight list when the person asked for options or steps.',
  '3. Use plain Markdown. No JSON wrapper, no code fences around the whole reply, no preamble about being an AI.',
  '4. Do not run commands, edit files or start long investigations unless the person explicitly asks for that. This is a conversation, not a build task.',
  '5. If something is genuinely ambiguous, ask one precise question instead of guessing.',
].join('\n');

export function buildDiscoveryLocalSystemPrompt(agentRole: string): string {
  return [
    `You are Concierge in Maestro. Your designated role is: ${agentRole}.`,
    '',
    'The USER section contains the full intake brief (schema, answers so far, transcript and the latest message). Follow its output format exactly.',
    'Do not run commands or edit files. Reply as plain text; the trailing fenced json block the brief asks for is the only structured part.',
  ].join('\n');
}

// ── Output handling ───────────────────────────────────────────────────────────

/** Strip a trailing `BEGIN VERDICT … END VERDICT` block the Council Runtime may append. */
export function stripVerdictBlock(text: string): string {
  const withoutBlock = text.replace(/\n?\s*BEGIN VERDICT[\s\S]*?END VERDICT\s*$/i, '');
  return withoutBlock.trimEnd();
}

/** Lines carried by an `executor_job_events` stdout/stderr row. */
export function extractEventLines(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const body = payload as Record<string, unknown>;
  if (Array.isArray(body.lines)) {
    return body.lines.filter((line): line is string => typeof line === 'string');
  }
  if (typeof body.text === 'string') {
    return body.text.split('\n');
  }
  return [];
}

// ── Backend resolution ────────────────────────────────────────────────────────

export function isExecutorOnlineFor(executors: Executor[], adapter: string): boolean {
  return selectOnlineExecutor(executors, adapter) !== null;
}

/**
 * The backend a turn actually runs on: the chosen backend, downgraded to 'cloud' when no
 * online executor advertises the concierge adapter.
 */
export function resolveEffectiveBackend(
  chosen: ConversationBackend,
  executors: Executor[],
  adapter: string,
): { backend: ConversationBackend; clawOffline: boolean } {
  if (chosen !== 'claw') return { backend: 'cloud', clawOffline: false };
  const online = isExecutorOnlineFor(executors, adapter);
  return online ? { backend: 'claw', clawOffline: false } : { backend: 'cloud', clawOffline: true };
}

// ── Persistence ───────────────────────────────────────────────────────────────

export interface StoredConversationPrefs {
  conversationBackend?: ConversationBackend;
  conciergeAdapter?: string;
  conciergeLocalModel?: string;
}

const PREFS_KEY = 'maestro.conversationPrefs.v1';

export function readStoredConversationPrefs(): StoredConversationPrefs {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return {};
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const prefs: StoredConversationPrefs = {};
    if (parsed.conversationBackend === 'claw' || parsed.conversationBackend === 'cloud') {
      prefs.conversationBackend = parsed.conversationBackend;
    }
    if (typeof parsed.conciergeAdapter === 'string' && parsed.conciergeAdapter.trim()) {
      prefs.conciergeAdapter = parsed.conciergeAdapter.trim();
    }
    if (typeof parsed.conciergeLocalModel === 'string' && parsed.conciergeLocalModel.trim()) {
      prefs.conciergeLocalModel = parsed.conciergeLocalModel.trim();
    }
    return prefs;
  } catch {
    return {};
  }
}

export function writeStoredConversationPrefs(update: StoredConversationPrefs): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    const next = { ...readStoredConversationPrefs(), ...update };
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    // localStorage can be unavailable (private mode, blocked storage) — the choice just
    // does not persist across reloads.
  }
}
