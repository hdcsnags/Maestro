import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePlanFile, isInScope, PlanParseError } from '../src/local/plan-file.js';

function md(planJson: object): string {
  return `# My plan\n\nprose is ignored\n\n\`\`\`json\n${JSON.stringify(planJson, null, 2)}\n\`\`\`\n\nmore prose\n`;
}

const validLane = { name: 'a', adapter: 'shell_stub', prompt: 'build it' };

test('parses a valid plan and applies defaults', () => {
  const plan = parsePlanFile(md({ project: 'demo', lanes: [validLane] }));
  assert.equal(plan.project, 'demo');
  assert.equal(plan.lanes[0].priority, 'P1');
  assert.equal(plan.lanes[0].timeout_minutes, 20);
  assert.deepEqual(plan.lanes[0].scope_paths, []);
});

test('rejects a file with no json fence', () => {
  assert.throws(() => parsePlanFile('# just prose'), PlanParseError);
});

test('rejects a file with two json fences', () => {
  const two = md({ project: 'x', lanes: [validLane] }) + '\n```json\n{}\n```\n';
  assert.throws(() => parsePlanFile(two), /exactly one/);
});

test('rejects unknown dep with the lane named in the error', () => {
  assert.throws(
    () => parsePlanFile(md({ project: 'x', lanes: [{ ...validLane, deps: ['ghost'] }] })),
    /unknown lane "ghost"/,
  );
});

test('rejects duplicate lane names and self-deps', () => {
  assert.throws(
    () => parsePlanFile(md({ project: 'x', lanes: [validLane, validLane] })),
    /Duplicate lane/,
  );
  assert.throws(
    () => parsePlanFile(md({ project: 'x', lanes: [{ ...validLane, deps: ['a'] }] })),
    /depends on itself/,
  );
});

test('rejects dependency cycles, naming the stuck lanes', () => {
  assert.throws(
    () => parsePlanFile(md({
      project: 'x',
      lanes: [
        { name: 'a', adapter: 's', prompt: 'p', deps: ['b'] },
        { name: 'b', adapter: 's', prompt: 'p', deps: ['a'] },
      ],
    })),
    /cycle.*a.*b|cycle.*b.*a/s,
  );
});

test('scope_paths normalize separators and leading ./', () => {
  const plan = parsePlanFile(md({
    project: 'x',
    lanes: [{ ...validLane, scope_paths: ['.\\src\\ui', './lib/'] }],
  }));
  assert.deepEqual(plan.lanes[0].scope_paths, ['src/ui', 'lib/']);
});

test('isInScope: prefix and exact match, empty scope allows all', () => {
  assert.equal(isInScope('src/ui/App.tsx', ['src/ui']), true);
  assert.equal(isInScope('src/ui.tsx', ['src/ui']), false);   // not a child of src/ui/
  assert.equal(isInScope('README.md', ['README.md']), true);
  assert.equal(isInScope('src\\ui\\x.ts', ['src/ui']), true); // windows separators
  assert.equal(isInScope('anything.ts', []), true);
});
