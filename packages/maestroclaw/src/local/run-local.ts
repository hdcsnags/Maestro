// Headless conductor: `maestroclaw run BUILDPLAN.md`
//
// Runs a multi-lane build entirely locally — no Supabase, no web UI, no
// executor registration. The web dispatcher's brain, minus the browser:
//
//   parse plan -> dep-ordered waves (conductor/plan) -> each ready lane runs
//   its adapter in an isolated seeded copy -> writes collected by content
//   diff -> scope-filtered -> cross-lane collisions resolved by
//   conductor/reconcile (the review-hardened deterministic ranking) ->
//   winners written back to the workspace -> report to stdout + report.json.
//
// Design notes (LOCAL_FIRST_SPEC L3):
// - Lane isolation is copy-based, not git-worktree-based, so it works on
//   non-repos and greenfield dirs. Worktree seeding is a later --seed mode.
// - A failed lane fails its dependents (marked failed, never dispatched) —
//   fail-fast is the right default for a hand-authored plan.
// - Reconcile inputs carry lane priority + name; the final tie-break is the
//   reconciler's stable input-index (lanes are appended in completion order).

import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { getAdapter, type Adapter } from '../adapters/index.js';
import {
  buildPlan, getReadyEntries, markEntryRunning, markEntryDone, markEntryFailed,
  type ConductorPlan,
} from '../conductor/plan.js';
import { reconcileManifests, type ManifestEntry } from '../conductor/reconcile.js';
import { parsePlanFile, isInScope, type BuildPlanFile, type PlanLane } from './plan-file.js';
import { seedCopy, snapshot, collectWrites, type WrittenFile } from './fs-snapshot.js';

export interface RunOptions {
  workspace: string;
  maxConcurrent?: number;
  dryRun?: boolean;
  adapterOverride?: string;             // force every lane onto one adapter (smoke tests)
  adapterFactory?: (name: string) => Adapter;  // DI seam for tests
  log?: (line: string) => void;
}

export interface LaneOutcome {
  lane: string;
  adapter: string;
  status: 'done' | 'failed' | 'blocked';
  written: number;
  skipped_out_of_scope: string[];
  error?: string;
  duration_ms: number;
}

export interface RunReport {
  project: string;
  workspace: string;
  started_at: string;
  finished_at: string;
  lanes: LaneOutcome[];
  files_written: string[];
  collisions: Array<{ path: string; winner_lane: string; overridden_lanes: string[] }>;
  success: boolean;
}

interface LaneResult {
  lane: PlanLane;
  writes: WrittenFile[];
  outcome: LaneOutcome;
}

function buildLanePrompt(plan: BuildPlanFile, lane: PlanLane): string {
  const scopeText = lane.scope_paths.length > 0
    ? `You may ONLY create or modify files under: ${lane.scope_paths.join(', ')}. ` +
      `Files written outside this scope will be discarded.`
    : `You may create or modify files anywhere inside the working directory.`;
  return [
    `# Project: ${plan.project}`,
    plan.shared_context ? `\n## Shared context\n${plan.shared_context}` : '',
    `\n## Your lane: ${lane.name}`,
    scopeText,
    `\n## Task\n${lane.prompt}`,
    `\nWork directly in the current working directory. Write complete files — no placeholders or "existing code" stubs.`,
  ].filter(Boolean).join('\n');
}

async function runLane(
  plan: BuildPlanFile,
  lane: PlanLane,
  opts: Required<Pick<RunOptions, 'workspace' | 'log'>> & RunOptions,
  runDir: string,
): Promise<LaneResult> {
  const started = Date.now();
  const adapterName = opts.adapterOverride ?? lane.adapter;
  const factory = opts.adapterFactory ?? getAdapter;
  const laneDir = path.join(runDir, 'lanes', lane.name.replace(/[^\w.-]+/g, '_'));

  try {
    const adapter = factory(adapterName);
    await seedCopy(opts.workspace, laneDir);
    const before = await snapshot(laneDir);

    opts.log(`▶ [${lane.name}] ${adapterName} starting (timeout ${lane.timeout_minutes}m)`);
    const prompt = buildLanePrompt(plan, lane);
    const timeoutMs = lane.timeout_minutes * 60_000;
    const result = adapter.runSession
      ? await adapter.runSession(prompt, laneDir, timeoutMs)
      : await adapter.run(prompt, laneDir, timeoutMs);

    if (!result.success) {
      throw new Error(result.error || 'adapter reported failure');
    }

    const allWrites = await collectWrites(laneDir, before);
    const inScope = allWrites.filter((w) => isInScope(w.path, lane.scope_paths));
    const skipped = allWrites.filter((w) => !isInScope(w.path, lane.scope_paths)).map((w) => w.path);
    if (skipped.length > 0) {
      opts.log(`⚠ [${lane.name}] dropped ${skipped.length} out-of-scope write(s): ${skipped.join(', ')}`);
    }
    opts.log(`✔ [${lane.name}] done — ${inScope.length} file(s) in scope`);

    return {
      lane,
      writes: inScope,
      outcome: {
        lane: lane.name, adapter: adapterName, status: 'done',
        written: inScope.length, skipped_out_of_scope: skipped,
        duration_ms: Date.now() - started,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    opts.log(`✖ [${lane.name}] failed: ${message}`);
    return {
      lane,
      writes: [],
      outcome: {
        lane: lane.name, adapter: adapterName, status: 'failed',
        written: 0, skipped_out_of_scope: [], error: message,
        duration_ms: Date.now() - started,
      },
    };
  }
}

// Dependents of failed lanes can never run — mark them failed-as-blocked so
// the wave loop terminates instead of stalling on a frontier that will never
// unblock (conductor/plan only unblocks on 'done').
function failBlockedEntries(
  plan: ConductorPlan,
  onBlocked: (taskId: string) => void,
): ConductorPlan {
  let next = plan;
  let changed = true;
  while (changed) {
    changed = false;
    const failed = new Set(next.entries.filter((e) => e.status === 'failed').map((e) => e.task_id));
    for (const entry of next.entries) {
      if (entry.status === 'pending' && entry.deps.some((d) => failed.has(d))) {
        next = markEntryFailed(next, entry.task_id);
        onBlocked(entry.task_id);
        changed = true;
      }
    }
  }
  return next;
}

export async function runPlan(planFile: BuildPlanFile, options: RunOptions): Promise<RunReport> {
  const log = options.log ?? ((line: string) => console.log(line));
  const opts = { ...options, log, workspace: path.resolve(options.workspace) };
  const maxConcurrent = options.maxConcurrent ?? 3;
  const startedAt = new Date().toISOString();

  const runDir = path.join(
    opts.workspace, '.maestro-runs',
    startedAt.replace(/[:.]/g, '-'),
  );

  let conductor = buildPlan(planFile.lanes.map((lane) => ({
    task_id: lane.name,
    file_path: lane.scope_paths[0] ?? '',
    deps: lane.deps,
    lane_name: lane.name,
    priority: lane.priority,
  })));

  if (opts.dryRun) {
    let waveNo = 1;
    let dry = conductor;
    while (true) {
      const ready = getReadyEntries(dry);
      if (ready.length === 0) break;
      log(`Wave ${waveNo}: ${ready.map((e) => e.task_id).join(', ')}`);
      for (const e of ready) dry = markEntryDone(dry, e.task_id);
      waveNo++;
    }
    return {
      project: planFile.project, workspace: opts.workspace,
      started_at: startedAt, finished_at: new Date().toISOString(),
      lanes: [], files_written: [], collisions: [], success: true,
    };
  }

  await fs.mkdir(runDir, { recursive: true });
  const laneByName = new Map(planFile.lanes.map((l) => [l.name, l]));
  const results: LaneResult[] = [];
  const blocked: LaneOutcome[] = [];

  while (true) {
    const ready = getReadyEntries(conductor).slice(0, maxConcurrent);
    if (ready.length === 0) break;

    for (const entry of ready) conductor = markEntryRunning(conductor, entry.task_id);
    log(`── wave: ${ready.map((e) => e.task_id).join(' · ')} ──`);

    const waveResults = await Promise.all(
      ready.map((entry) => runLane(planFile, laneByName.get(entry.task_id)!, opts, runDir)),
    );
    for (const result of waveResults) {
      results.push(result);
      conductor = result.outcome.status === 'done'
        ? markEntryDone(conductor, result.lane.name)
        : markEntryFailed(conductor, result.lane.name);
    }
    conductor = failBlockedEntries(conductor, (taskId) => {
      log(`⊘ [${taskId}] blocked — a dependency failed`);
      blocked.push({
        lane: taskId, adapter: laneByName.get(taskId)?.adapter ?? '', status: 'blocked',
        written: 0, skipped_out_of_scope: [], error: 'dependency failed', duration_ms: 0,
      });
    });
  }

  // Cross-lane reconcile: same deterministic ranking the web dispatcher uses.
  const manifest: ManifestEntry[] = results.flatMap((r) =>
    r.writes.map((w) => ({
      path: w.path,
      content: w.content,
      operation: 'create' as const,
      lane_name: r.lane.name,
      priority: r.lane.priority,
    })),
  );
  const { resolved, collisions } = reconcileManifests(manifest);
  for (const c of collisions) {
    log(
      `⚔ collision on ${c.path}: kept lane "${c.winner.lane_name}", ` +
      `overrode ${c.overridden.map((o) => `"${o.lane_name}"`).join(', ')}`,
    );
  }

  for (const entry of resolved) {
    const target = path.join(opts.workspace, entry.path);
    // Reconciled paths are lane-relative; refuse anything that escapes the root.
    if (!path.resolve(target).startsWith(opts.workspace + path.sep)
      && path.resolve(target) !== opts.workspace) {
      log(`⚠ refused write outside workspace: ${entry.path}`);
      continue;
    }
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, entry.content ?? '', 'utf8');
  }

  const lanes = [...results.map((r) => r.outcome), ...blocked];
  const success = lanes.every((l) => l.status === 'done');
  const report: RunReport = {
    project: planFile.project,
    workspace: opts.workspace,
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    lanes,
    files_written: resolved.map((e) => e.path),
    collisions: collisions.map((c) => ({
      path: c.path,
      winner_lane: c.winner.lane_name,
      overridden_lanes: c.overridden.map((o) => o.lane_name),
    })),
    success,
  };
  await fs.writeFile(path.join(runDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');

  log('─'.repeat(50));
  log(`${success ? '✅' : '❌'} ${report.files_written.length} file(s) written, ` +
    `${collisions.length} collision(s) reconciled, ` +
    `${lanes.filter((l) => l.status !== 'done').length} lane(s) not done`);
  log(`📄 report: ${path.join(runDir, 'report.json')}`);
  return report;
}

export async function runLocalCli(argv: string[]): Promise<number> {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const flag = (name: string): string | undefined => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const planPath = positional[0];
  if (!planPath) {
    console.error('Usage: maestroclaw run <BUILDPLAN.md> [--workspace <dir>] [--max-concurrent N] [--adapter-override <adapter>] [--dry-run]');
    return 2;
  }

  let markdown: string;
  try {
    markdown = await fs.readFile(planPath, 'utf8');
  } catch {
    console.error(`Cannot read plan file: ${planPath}`);
    return 2;
  }

  let plan: BuildPlanFile;
  try {
    plan = parsePlanFile(markdown);
  } catch (err) {
    console.error(`Invalid BUILDPLAN: ${(err as Error).message}`);
    return 2;
  }

  const report = await runPlan(plan, {
    workspace: flag('workspace') ?? path.dirname(path.resolve(planPath)),
    maxConcurrent: flag('max-concurrent') ? Number(flag('max-concurrent')) : undefined,
    adapterOverride: flag('adapter-override'),
    dryRun: argv.includes('--dry-run'),
  });
  return report.success ? 0 : 1;
}
