import { describe, it, expect } from 'vitest';
import { isSharedExecutor, markSharedExecutors, selectOnlineExecutor } from './sessionBuild';
import type { Executor } from '../types';

const OWNER = 'owner-1';
const PARTNER = 'partner-2';

function executor(overrides: Partial<Executor> = {}): Executor {
  const now = new Date().toISOString();
  return {
    id: 'ex-1',
    owner_user_id: OWNER,
    name: 'owner-laptop',
    kind: 'maestroclaw',
    status: 'online',
    last_seen_at: now,
    capabilities: { adapters: ['claude_code'] },
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}

describe('shared executors (executor_grants)', () => {
  it('markSharedExecutors flags rows owned by someone else', () => {
    const [mine, theirs] = markSharedExecutors([executor(), executor({ id: 'ex-2' })], PARTNER);
    expect(mine.shared).toBe(true);
    expect(theirs.shared).toBe(true);
    const [own] = markSharedExecutors([executor()], OWNER);
    expect(own.shared).toBe(false);
  });

  it('isSharedExecutor prefers the stamped flag, else compares owner to the user', () => {
    expect(isSharedExecutor(executor({ shared: true }), OWNER)).toBe(true);
    expect(isSharedExecutor(executor(), OWNER)).toBe(false);
    expect(isSharedExecutor(executor(), PARTNER)).toBe(true);
    expect(isSharedExecutor(executor(), null)).toBe(false);
  });

  it('selectOnlineExecutor treats a shared executor like any other online worker', () => {
    const [shared] = markSharedExecutors([executor()], PARTNER);
    expect(selectOnlineExecutor([shared], 'claude_code')?.id).toBe('ex-1');
    expect(selectOnlineExecutor([shared], 'codex_cli')).toBeNull();
  });
});
