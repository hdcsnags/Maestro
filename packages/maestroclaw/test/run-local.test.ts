// E2E for the headless conductor with an injected fake adapter that actually
// writes files — exercises wave scheduling, lane isolation, scope enforcement,
// cross-lane reconcile, fail-fast dependent blocking, and write-back. This is
// the runtime test the dispatch path never had.

import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Adapter, AdapterResult } from '../src/adapters/types.js';
import { runPlan } from '../src/local/run-local.js';
import type { BuildPlanFile } from '../src/local/plan-file.js';

interface FakeSpec {
  files?: Record<string, string>;  // rel path -> content to write in the lane dir
  fail?: boolean;
}

function fakeAdapterFactory(specs: Record<string, FakeSpec>, ran: string[]) {
  return (_name: string): Adapter => ({
    name: 'fake',
    async check() { return true; },
    async run(prompt: string, workDir: string): Promise<AdapterResult> {
      // Lane name is embedded in the prompt header the runner builds.
      const lane = /## Your lane: (.+)/.exec(prompt)?.[1]?.trim() ?? 'unknown';
      ran.push(lane);
      const spec = specs[lane] ?? {};
      if (spec.fail) return { success: false, output: '', error: `${lane} exploded` };
      for (const [rel, content] of Object.entries(spec.files ?? {})) {
        const target = path.join(workDir, rel);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, content, 'utf8');
      }
      return { success: true, output: 'ok' };
    },
  });
}

async function makeWorkspace(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'maestro-run-'));
  await fs.writeFile(path.join(dir, 'seed.txt'), 'preexisting', 'utf8');
  return dir;
}

function plan(lanes: BuildPlanFile['lanes']): BuildPlanFile {
  return { project: 'e2e', lanes };
}

const lane = (
  name: string,
  extra: Partial<BuildPlanFile['lanes'][number]> = {},
): BuildPlanFile['lanes'][number] => ({
  name, adapter: 'fake', prompt: `do ${name}`,
  scope_paths: [], deps: [], priority: 'P1', timeout_minutes: 1,
  ...extra,
});

test('three lanes: dep ordering, parallel wave, write-back to workspace', async () => {
  const ws = await makeWorkspace();
  const ran: string[] = [];
  const report = await runPlan(
    plan([
      lane('schema', { files: undefined }),
      lane('api', { deps: ['schema'] }),
      lane('ui', { deps: ['schema'] }),
    ]),
    {
      workspace: ws,
      log: () => {},
      adapterFactory: fakeAdapterFactory({
        schema: { files: { 'db/schema.sql': 'create table x;' } },
        api: { files: { 'api/index.ts': 'api' } },
        ui: { files: { 'src/App.tsx': 'ui' } },
      }, ran),
    },
  );

  assert.equal(report.success, true);
  assert.equal(ran[0], 'schema');                          // wave 1 alone
  assert.deepEqual([...ran.slice(1)].sort(), ['api', 'ui']); // wave 2 together
  assert.deepEqual([...report.files_written].sort(), ['api/index.ts', 'db/schema.sql', 'src/App.tsx']);
  assert.equal(await fs.readFile(path.join(ws, 'db/schema.sql'), 'utf8'), 'create table x;');
  assert.equal(await fs.readFile(path.join(ws, 'seed.txt'), 'utf8'), 'preexisting'); // untouched
});

test('deliberate collision: priority tier wins, collision reported', async () => {
  const ws = await makeWorkspace();
  const report = await runPlan(
    plan([
      lane('core', { priority: 'P0' }),
      lane('cleanup', { priority: 'P2' }),
    ]),
    {
      workspace: ws,
      log: () => {},
      adapterFactory: fakeAdapterFactory({
        core: { files: { 'shared.ts': 'core version' } },
        cleanup: { files: { 'shared.ts': 'cleanup version' } },
      }, []),
    },
  );

  assert.equal(report.collisions.length, 1);
  assert.equal(report.collisions[0].winner_lane, 'core');
  assert.deepEqual(report.collisions[0].overridden_lanes, ['cleanup']);
  assert.equal(await fs.readFile(path.join(ws, 'shared.ts'), 'utf8'), 'core version');
});

test('out-of-scope writes are dropped and reported, in-scope kept', async () => {
  const ws = await makeWorkspace();
  const report = await runPlan(
    plan([lane('scoped', { scope_paths: ['src/'] })]),
    {
      workspace: ws,
      log: () => {},
      adapterFactory: fakeAdapterFactory({
        scoped: { files: { 'src/ok.ts': 'in', 'secrets/.env': 'out' } },
      }, []),
    },
  );

  assert.deepEqual(report.files_written, ['src/ok.ts']);
  assert.deepEqual(report.lanes[0].skipped_out_of_scope, ['secrets/.env']);
  await assert.rejects(fs.access(path.join(ws, 'secrets/.env')));
});

test('failed lane blocks its dependents; report is not success', async () => {
  const ws = await makeWorkspace();
  const ran: string[] = [];
  const report = await runPlan(
    plan([
      lane('base', {}),
      lane('dependent', { deps: ['base'] }),
      lane('grand', { deps: ['dependent'] }),
      lane('independent', {}),
    ]),
    {
      workspace: ws,
      log: () => {},
      adapterFactory: fakeAdapterFactory({
        base: { fail: true },
        independent: { files: { 'free.ts': 'free' } },
      }, ran),
    },
  );

  assert.equal(report.success, false);
  assert.ok(!ran.includes('dependent') && !ran.includes('grand'));
  const byLane = new Map(report.lanes.map((l) => [l.lane, l.status]));
  assert.equal(byLane.get('base'), 'failed');
  assert.equal(byLane.get('dependent'), 'blocked');
  assert.equal(byLane.get('grand'), 'blocked');
  assert.equal(byLane.get('independent'), 'done');
  assert.deepEqual(report.files_written, ['free.ts']); // independent work still lands
});

test('lane isolation: parallel lanes cannot see each other in-progress writes', async () => {
  const ws = await makeWorkspace();
  let bSawAFile = false;
  const factory = (_name: string): Adapter => ({
    name: 'fake',
    async check() { return true; },
    async run(prompt: string, workDir: string): Promise<AdapterResult> {
      const laneName = /## Your lane: (.+)/.exec(prompt)?.[1]?.trim();
      if (laneName === 'a') {
        await fs.writeFile(path.join(workDir, 'a.ts'), 'a', 'utf8');
        await new Promise((r) => setTimeout(r, 150)); // stay alive while b checks
      } else {
        await new Promise((r) => setTimeout(r, 75));  // let a write first
        bSawAFile = await fs.access(path.join(workDir, 'a.ts')).then(() => true, () => false);
        await fs.writeFile(path.join(workDir, 'b.ts'), 'b', 'utf8');
      }
      return { success: true, output: 'ok' };
    },
  });

  const report = await runPlan(
    plan([lane('a'), lane('b')]),
    { workspace: ws, log: () => {}, adapterFactory: factory },
  );

  assert.equal(bSawAFile, false); // isolated copies, not a shared tree
  assert.deepEqual([...report.files_written].sort(), ['a.ts', 'b.ts']);
});
