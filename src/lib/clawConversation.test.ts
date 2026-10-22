import { describe, it, expect } from 'vitest';
import {
  extractEventLines,
  flattenConciergePrompt,
  resolveEffectiveBackend,
  resolveLocalSeatModel,
  resolveSeatAdapter,
  stripVerdictBlock,
} from './clawConversation';
import { buildLocalSeatPrompt } from './localSeatPrompt';
import { isExecutorOnline } from './sessionBuild';
import { buildLocalSynthesisPrompt, parseLocalSynthesis } from './localSynthesisPrompt';
import type { Executor } from '../types';

function executor(adapters: string[], ageMs = 0, status: Executor['status'] = 'online'): Executor {
  return {
    id: 'ex-1',
    owner_user_id: 'u',
    name: 'laptop',
    kind: 'maestroclaw',
    status,
    last_seen_at: new Date(Date.now() - ageMs).toISOString(),
    capabilities: { adapters },
    created_at: '',
    updated_at: '',
  };
}

describe('flattenConciergePrompt', () => {
  it('emits SYSTEM / CONVERSATION / USER sections and omits an empty conversation', () => {
    const withHistory = flattenConciergePrompt({ system: 'sys', conversation: 'User: hi\n\nConcierge: hello', user: 'next' });
    expect(withHistory).toBe('SYSTEM:\nsys\n\nCONVERSATION:\nUser: hi\n\nConcierge: hello\n\nUSER:\nnext');
    const noHistory = flattenConciergePrompt({ system: 'sys', conversation: '   ', user: 'q' });
    expect(noHistory).toBe('SYSTEM:\nsys\n\nUSER:\nq');
  });
});

describe('stripVerdictBlock', () => {
  it('removes a trailing verdict block and keeps the prose', () => {
    const text = 'Answer body.\n\nBEGIN VERDICT\n{"status":"ok"}\nEND VERDICT\n';
    expect(stripVerdictBlock(text)).toBe('Answer body.');
    expect(stripVerdictBlock('plain')).toBe('plain');
  });
});

describe('extractEventLines', () => {
  it('reads lines[] and splits text payloads', () => {
    expect(extractEventLines({ lines: ['a', 'b'], seq: 1 })).toEqual(['a', 'b']);
    expect(extractEventLines({ text: 'x\ny' })).toEqual(['x', 'y']);
    expect(extractEventLines(null)).toEqual([]);
  });
});

describe('resolveEffectiveBackend', () => {
  it('keeps claw when an online executor advertises the adapter, else downgrades to cloud', () => {
    expect(resolveEffectiveBackend('claw', [executor(['claude_code'])], 'claude_code')).toEqual({ backend: 'claw', clawOffline: false });
    expect(resolveEffectiveBackend('claw', [executor(['codex_cli'])], 'claude_code')).toEqual({ backend: 'cloud', clawOffline: true });
    expect(resolveEffectiveBackend('claw', [executor(['claude_code'], 120_000)], 'claude_code')).toEqual({ backend: 'cloud', clawOffline: true });
    expect(resolveEffectiveBackend('cloud', [executor(['claude_code'])], 'claude_code')).toEqual({ backend: 'cloud', clawOffline: false });
  });

  it('treats a heartbeat up to 120 s old as online (the REST API has answered in 4-7 s)', () => {
    expect(resolveEffectiveBackend('claw', [executor(['claude_code'], 90_000)], 'claude_code')).toEqual({ backend: 'claw', clawOffline: false });
    expect(isExecutorOnline({ ...executor(['claude_code'], 0, 'offline') })).toBe(false);
    // No last_seen_at: fall back to updated_at.
    const viaUpdatedAt = { ...executor(['claude_code']), last_seen_at: null, updated_at: new Date(Date.now() - 30_000).toISOString() };
    expect(isExecutorOnline(viaUpdatedAt)).toBe(true);
  });
});

describe('seat adapter + model defaults', () => {
  it('maps maestroclaw agents to adapters and per-adapter default models', () => {
    expect(resolveSeatAdapter({ name: 'ClawAgy', model: 'agy_cli', provider_group: 'maestroclaw' })).toBe('agy_cli');
    expect(resolveSeatAdapter({ name: 'ClawKimi', model: '', provider_group: 'maestroclaw' })).toBe('kimi_cli');
    expect(resolveSeatAdapter({ name: 'GPT', model: 'gpt-5.4', provider_group: 'openai' })).toBeNull();
    expect(resolveLocalSeatModel({ name: 'ClawClaude', model: 'claude_code', provider_group: 'maestroclaw' })).toBe('sonnet');
    expect(resolveLocalSeatModel({ name: 'ClawCodex', model: 'codex_cli', provider_group: 'maestroclaw' })).toBeUndefined();
    expect(resolveLocalSeatModel({ name: 'ClawClaude', model: 'claude_code', provider_group: 'maestroclaw', local_model: 'opus' })).toBe('opus');
  });
});

describe('buildLocalSeatPrompt', () => {
  it('carries persona, role, context and the request, and stays out of build mode', () => {
    const prompt = buildLocalSeatPrompt({
      agentName: 'ClawClaude',
      agentRole: 'Local build · Claude Code CLI',
      prompt: 'Should we ship?',
      tieredContext: '[Latest Synthesis — Round 1]:\nyes',
      persona: { voice_preamble: 'You are the Skeptic.', anti_patterns: ['hedging'] },
      verbosityTier: 'brief',
    });
    expect(prompt.startsWith('SYSTEM:\nYou are the Skeptic.\n\nWhat you do NOT do:\n- hedging')).toBe(true);
    expect(prompt).toContain('You are ClawClaude, an AI specialist in a multi-agent orchestration council called Maestro.');
    expect(prompt).toContain('CONTEXT:\nPrior session context (for reference only):\n\n[Latest Synthesis — Round 1]:\nyes');
    expect(prompt.endsWith('USER:\nCurrent request:\nShould we ship?')).toBe(true);
    expect(prompt).toContain('Verbosity: Brief.');
    expect(prompt).not.toContain('file_manifest');
  });
});

describe('local synthesis', () => {
  it('renders primaries and pushbacks into the deliberation-aware template', () => {
    const { prompt } = buildLocalSynthesisPrompt({
      prompt: 'Q?',
      primaries: [{ id: '1', agent_name: 'A', content: 'alpha' }, { id: '2', agent_name: 'B', content: 'beta' }],
      deliberations: [{ agent_name: 'A', deliberation_pushbacks: [{ target_voice: 'B', summary: 'nope', kind: 'objection' }] }],
      deliberated: true,
    });
    expect(prompt).toContain('ORIGINAL QUESTION:\nQ?');
    expect(prompt).toContain('### A\nalpha');
    expect(prompt).toContain('- **Objection** (toward Voice B): nope');
    expect(prompt).not.toContain('This round had NO deliberation step');
  });

  it('parses fenced JSON and falls back to the whole text as the recommendation', () => {
    const parsed = parseLocalSynthesis('```json\n{"consensus":"c","recommendation":"r","trade_offs":[],"unresolved_tensions":["t"]}\n```');
    expect(parsed.consensus).toBe('c');
    expect(parsed.recommendation).toBe('r');
    expect(parsed.unresolved_tensions).toEqual(['t']);
    expect(parsed.content).toBe('c\n\nr');
    const prose = parseLocalSynthesis('Just prose here.');
    expect(prose).toEqual({ content: 'Just prose here.', recommendation: 'Just prose here.' });
  });
});
