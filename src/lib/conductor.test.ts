// Web-side Conductor tests — C-06 review finding F7.
//
// The task-001/task-004 review councils flagged that the KEEP-IN-SYNC ranking
// contract between this module and packages/maestroclaw/src/conductor/reconcile.ts
// was guarded by tests on only ONE side. This suite closes that: it tests the
// web reconciler and ready-selection directly, AND runs a shared ranking fixture
// through BOTH reconcilers (maestroclaw's is imported directly — it is
// dependency-free) asserting they pick the same winner under every input
// permutation wherever the shared tiers (approved → priority → lane_name)
// decide. The final tie-break KEY differs by documented design (web: tie_break /
// task_id; claw: input index), so parity is asserted only up to the shared tiers.

import { describe, expect, test } from 'vitest';
import {
  mapTaskPriority,
  reconcileManifest,
  selectReadyTasks,
  type ManifestCandidate,
  type TaskPriority,
} from './conductor';
import {
  reconcileManifests as clawReconcile,
  type ManifestEntry as ClawManifestEntry,
} from '../../packages/maestroclaw/src/conductor/reconcile';

// ── fixtures ─────────────────────────────────────────────────────────────────

interface CandidateSpec {
  path?: string;
  lane: string;
  priority?: TaskPriority;
  approved?: boolean;
  tie?: string;
}

function webCandidate(spec: CandidateSpec): ManifestCandidate {
  return {
    path: spec.path ?? 'src/App.tsx',
    lane_name: spec.lane,
    priority: spec.priority,
    conductor_approved: spec.approved,
    tie_break: spec.tie,
  };
}

function clawEntry(spec: CandidateSpec): ClawManifestEntry {
  return {
    path: spec.path ?? 'src/App.tsx',
    operation: 'create',
    lane_name: spec.lane,
    priority: spec.priority,
    conductor_approved: spec.approved,
  };
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, i) =>
    permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
  );
}

// ── reconcileManifest: ranking tiers ─────────────────────────────────────────

describe('reconcileManifest ranking', () => {
  test('conductor_approved beats higher priority', () => {
    const { resolved } = reconcileManifest([
      webCandidate({ lane: 'beta', priority: 'P0' }),
      webCandidate({ lane: 'alpha', priority: 'P2', approved: true }),
    ]);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].lane_name).toBe('alpha');
  });

  test('P0 beats P1; missing priority defaults to P1', () => {
    const { resolved } = reconcileManifest([
      webCandidate({ lane: 'zeta' }), // implicit P1
      webCandidate({ lane: 'beta', priority: 'P0' }),
      webCandidate({ lane: 'alpha', priority: 'P2' }),
    ]);
    expect(resolved[0].lane_name).toBe('beta');
  });

  test('lane tie-break is code-unit order, not locale collation', () => {
    // Under code-unit order 'Z' (0x5A) < 'a' (0x61), so "Zeta" wins. Most
    // locales would put "alpha" first — this fails if anyone regresses the
    // comparator to locale-dependent collation.
    const { resolved } = reconcileManifest([
      webCandidate({ lane: 'alpha' }),
      webCandidate({ lane: 'Zeta' }),
    ]);
    expect(resolved[0].lane_name).toBe('Zeta');
  });

  test('lanes sharing a leading character resolve on the full name (old first-code-point bug)', () => {
    const { resolved } = reconcileManifest([
      webCandidate({ lane: 'frontend-b' }),
      webCandidate({ lane: 'frontend-a' }),
    ]);
    expect(resolved[0].lane_name).toBe('frontend-a');
  });

  test('non-ASCII lane names order deterministically (old numeric-band overflow)', () => {
    const { resolved } = reconcileManifest([
      webCandidate({ lane: 'Ω-lane' }), // U+03A9 (0x3A9)
      webCandidate({ lane: 'z-lane' }), // 'z' = 0x7A < 0x3A9
    ]);
    expect(resolved[0].lane_name).toBe('z-lane');
  });

  test('tie_break is the stable final key: same winner regardless of input order', () => {
    const first = webCandidate({ lane: 'same', tie: 'task-1' });
    const second = webCandidate({ lane: 'same', tie: 'task-2' });
    expect(reconcileManifest([first, second]).resolved[0].tie_break).toBe('task-1');
    expect(reconcileManifest([second, first]).resolved[0].tie_break).toBe('task-1');
  });

  test('collision report carries winner and every overridden entry', () => {
    const { resolved, collisions } = reconcileManifest([
      webCandidate({ lane: 'b', tie: 't1' }),
      webCandidate({ lane: 'a', tie: 't2' }),
      webCandidate({ lane: 'c', tie: 't3' }),
      webCandidate({ path: 'src/other.ts', lane: 'solo' }),
    ]);
    expect(resolved).toHaveLength(2);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].path).toBe('src/App.tsx');
    expect(collisions[0].winner.lane_name).toBe('a');
    expect(collisions[0].overridden.map((o) => o.lane_name).sort()).toEqual(['b', 'c']);
  });

  test('non-colliding entries pass through in input order', () => {
    const entries = ['one.ts', 'two.ts', 'three.ts'].map((path) =>
      webCandidate({ path, lane: 'solo' }),
    );
    const { resolved, collisions } = reconcileManifest(entries);
    expect(collisions).toHaveLength(0);
    expect(resolved.map((e) => e.path)).toEqual(['one.ts', 'two.ts', 'three.ts']);
  });
});

// ── cross-module parity: web reconcile vs maestroclaw reconcile ──────────────

describe('ranking parity with maestroclaw reconcile.ts (shared tiers)', () => {
  // Each case is decided by the shared tiers (approved → priority → lane_name),
  // never by the divergent final tie-break, so both modules MUST agree on the
  // winner for every permutation of input order.
  const cases: Array<{ name: string; specs: CandidateSpec[]; winnerLane: string }> = [
    {
      name: 'approved beats P0',
      specs: [
        { lane: 'late-approved', priority: 'P2', approved: true },
        { lane: 'urgent', priority: 'P0' },
      ],
      winnerLane: 'late-approved',
    },
    {
      name: 'priority tier decides across three lanes',
      specs: [
        { lane: 'cleanup', priority: 'P2' },
        { lane: 'core', priority: 'P0' },
        { lane: 'features' }, // implicit P1
      ],
      winnerLane: 'core',
    },
    {
      name: 'lane code-unit order decides on equal rank',
      specs: [{ lane: 'alpha' }, { lane: 'Zeta' }, { lane: 'beta' }],
      winnerLane: 'Zeta',
    },
    {
      name: 'shared-prefix lanes decide on full name',
      specs: [{ lane: 'lane-b' }, { lane: 'lane-a' }],
      winnerLane: 'lane-a',
    },
    {
      name: 'non-ASCII lanes decide identically',
      specs: [{ lane: 'Ω-lane' }, { lane: 'z-lane' }],
      winnerLane: 'z-lane',
    },
  ];

  for (const { name, specs, winnerLane } of cases) {
    test(name, () => {
      for (const order of permutations(specs)) {
        const web = reconcileManifest(order.map(webCandidate));
        const claw = clawReconcile(order.map(clawEntry));
        expect(web.resolved).toHaveLength(1);
        expect(claw.resolved).toHaveLength(1);
        expect(web.resolved[0].lane_name).toBe(winnerLane);
        expect(claw.resolved[0].lane_name).toBe(winnerLane);
      }
    });
  }
});

// ── selectReadyTasks: dependency gating ──────────────────────────────────────

describe('selectReadyTasks', () => {
  const task = (
    id: string,
    status: string,
    deps?: string[],
  ): { task_id: string; status: string; dependencies?: string[] } => ({
    task_id: id,
    status,
    dependencies: deps,
  });

  test('only queued and rerouted tasks are candidates', () => {
    const ready = selectReadyTasks([
      task('a', 'queued'),
      task('b', 'rerouted'),
      task('c', 'dispatched'),
      task('d', 'completed'),
      task('e', 'failed'),
    ]);
    expect(ready.map((t) => t.task_id)).toEqual(['a', 'b']);
  });

  test('non-terminal dependency blocks; terminal states unblock', () => {
    for (const depStatus of ['queued', 'dispatched', 'waiting']) {
      // (a queued dep is itself ready — the point is the DEPENDENT stays blocked)
      expect(selectReadyTasks([task('dep', depStatus), task('x', 'queued', ['dep'])])
        .map((t) => t.task_id)).not.toContain('x');
    }
    // Deliberate divergence from maestroclaw's plan (done-only): failed/skipped
    // deps unblock dependents so one dead task cannot freeze the frontier.
    for (const depStatus of ['completed', 'failed', 'skipped']) {
      expect(selectReadyTasks([task('dep', depStatus), task('x', 'queued', ['dep'])])
        .map((t) => t.task_id)).toEqual(['x']);
    }
  });

  test('unknown dependency id is treated as resolved, not a deadlock', () => {
    const ready = selectReadyTasks([task('x', 'queued', ['ghost'])]);
    expect(ready.map((t) => t.task_id)).toEqual(['x']);
  });

  test('duplicate task_id: dependency is judged against the FIRST occurrence', () => {
    // First row completed → dependent unblocks even though a later duplicate is queued…
    expect(selectReadyTasks([
      task('dup', 'completed'),
      task('dup', 'queued'),
      task('x', 'queued', ['dup']),
    ]).map((t) => t.task_id)).toEqual(['dup', 'x']);
    // …and first row queued → dependent stays blocked even though a later
    // duplicate completed. (`new Map(tasks.map(...))` would flip this — F6.)
    expect(selectReadyTasks([
      task('dup', 'queued'),
      task('dup', 'completed'),
      task('x', 'queued', ['dup']),
    ]).map((t) => t.task_id)).toEqual(['dup']);
  });

  test('no dependencies means ready', () => {
    expect(selectReadyTasks([task('x', 'queued', [])]).map((t) => t.task_id)).toEqual(['x']);
    expect(selectReadyTasks([task('y', 'queued')]).map((t) => t.task_id)).toEqual(['y']);
  });
});

// ── mapTaskPriority: decompose priority → reconcile tier ─────────────────────

describe('mapTaskPriority', () => {
  test('null and undefined yield undefined (pre-migration rows)', () => {
    expect(mapTaskPriority(null)).toBeUndefined();
    expect(mapTaskPriority(undefined)).toBeUndefined();
  });

  test('buckets: <=1 → P0, <=3 → P1, else P2', () => {
    expect(mapTaskPriority(0)).toBe('P0');
    expect(mapTaskPriority(1)).toBe('P0');
    expect(mapTaskPriority(2)).toBe('P1');
    expect(mapTaskPriority(3)).toBe('P1');
    expect(mapTaskPriority(4)).toBe('P2');
    expect(mapTaskPriority(99)).toBe('P2');
  });
});
