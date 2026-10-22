import { describe, it, expect } from 'vitest';
import {
  DISCOVERY_SCHEMA,
  buildDiscoveryPrompt,
  buildDiscoveryScopingBrief,
  countDiscoveryProgress,
  discoveryRecordToMarkdown,
  getPublicDiscoveryQuestions,
  parseDiscoveryReply,
} from './discoverySchema';

describe('discovery schema', () => {
  it('keeps the skill schema ids and excludes the private part from public questions', () => {
    expect(DISCOVERY_SCHEMA.schema).toBe('maestro.discovery-intake/1');
    const ids = getPublicDiscoveryQuestions().map((q) => q.id);
    expect(ids).toContain('s1_oneliner');
    expect(ids).toContain('s11_next');
    expect(ids.some((id) => id.startsWith('p_'))).toBe(false);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('counts progress over non-private questions only', () => {
    const { answered, total } = countDiscoveryProgress({ s1_story: 'it began', p_read: 'private', s4_platforms: ['iPhone (App Store)'] });
    expect(total).toBe(getPublicDiscoveryQuestions().length);
    expect(answered).toBe(2);
  });
});

describe('parseDiscoveryReply', () => {
  it('splits the message from the trailing fenced json block and normalizes answers', () => {
    const raw = [
      'Thanks! Two quick ones next: where will it run, and who uses it?',
      '```json',
      '{ "answers": { "s1_oneliner": "Uber for lawn care", "s4_platforms": ["iPhone (App Store)", ""], "bogus_id": "x" }, "next": ["s4_platforms", "s2_types"], "done": false }',
      '```',
    ].join('\n');
    const parsed = parseDiscoveryReply(raw);
    expect(parsed.message).toBe('Thanks! Two quick ones next: where will it run, and who uses it?');
    expect(parsed.answers).toEqual({ s1_oneliner: 'Uber for lawn care', s4_platforms: ['iPhone (App Store)'] });
    expect(parsed.next).toEqual(['s4_platforms', 's2_types']);
    expect(parsed.done).toBe(false);
  });

  it('tolerates a missing block and a malformed block', () => {
    expect(parseDiscoveryReply('Just chatting, no block.')).toEqual({ message: 'Just chatting, no block.', answers: {}, next: [], done: false });
    const malformed = parseDiscoveryReply('Hi\n```json\n{ not json\n```');
    expect(malformed.answers).toEqual({});
    expect(malformed.message).toBe('Hi');
  });

  it('unwraps the orchestrate { title, content } envelope when it leaks through', () => {
    const inner = 'Great.\n```json\n{ "answers": { "s2_scale": "Under 100" }, "next": [], "done": true }\n```';
    const parsed = parseDiscoveryReply(JSON.stringify({ title: 'x', content: inner }));
    expect(parsed.answers).toEqual({ s2_scale: 'Under 100' });
    expect(parsed.done).toBe(true);
  });
});

describe('discovery exports', () => {
  it('renders the markdown record in the agreed format', () => {
    const md = discoveryRecordToMarkdown({ s1_oneliner: 'Uber for lawn care', s4_platforms: ['iPhone (App Store)', 'Android (Google Play)'] });
    expect(md.startsWith('# Discovery: Uber for lawn care\n')).toBe(true);
    expect(md).toContain('## The story');
    expect(md).toContain('**If you described the app in one sentence to a friend, what would you say?**\n\nUber for lawn care');
    expect(md).toContain('iPhone (App Store), Android (Google Play)');
    expect(md).toContain('_(no answer)_');
    expect(md).toContain('## Not yet answered');
    expect(md).not.toContain('Private notes');
    expect(discoveryRecordToMarkdown({})).toContain('# Discovery: Untitled');
  });

  it('builds a scoping brief with the six numbered questions', () => {
    const brief = buildDiscoveryScopingBrief({ s1_oneliner: 'x' });
    for (const n of [1, 2, 3, 4, 5, 6]) expect(brief).toContain(`Q${n}.`);
    expect(brief).toContain('CAD');
    expect(brief).toContain('# Discovery: x');
  });

  it('puts the schema, answers and rules into the turn prompt', () => {
    const prompt = buildDiscoveryPrompt({ answers: { s1_story: 'began at a cafe' }, transcript: '', userText: 'hello' });
    expect(prompt).toContain('id: s1_story');
    expect(prompt).toContain('"s1_story": "began at a cafe"');
    expect(prompt).toContain('Never more than 3');
    expect(prompt).not.toContain('id: p_read');
    expect(prompt.trim().endsWith('hello')).toBe(true);
  });
});
