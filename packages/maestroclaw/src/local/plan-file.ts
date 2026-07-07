// BUILDPLAN.md — the contract between smart planning and dumb execution.
//
// A build plan is a markdown file containing exactly ONE fenced ```json block
// with the machine-readable plan. Everything outside the fence is free-form
// human/agent prose (rationale, links, notes) and is deliberately ignored by
// the runner — the fence is the contract, the prose is the commentary.
//
// Plan JSON shape:
// {
//   "project": "short name",
//   "shared_context": "optional text prepended to every lane prompt",
//   "lanes": [
//     {
//       "name": "frontend",             // unique; used for deps + reconcile ranking
//       "adapter": "claude_code",       // any registered adapter id
//       "prompt": "what this lane builds",
//       "scope_paths": ["src/"],        // writes outside these are dropped + reported
//       "deps": ["schema"],             // lane names that must finish first
//       "priority": "P1",               // P0|P1|P2 — reconcile rank on collisions
//       "timeout_minutes": 20
//     }
//   ]
// }
//
// v1 semantics (deliberate):
// - LANES are the unit of work, not per-file tasks. A lane is one agent
//   session with a scope — the headless mirror of a Pre-Build builder lane.
// - scope_paths are PREFIX matches on normalized relative paths (plus exact
//   file matches). Glob support is a later upgrade; keep plans prefix-shaped.
// - deps reference lane names; unknown deps are rejected at validation time
//   (unlike the web dispatcher, which tolerates them — a hand-written file
//   should fail loudly on a typo, a DB row should not deadlock a build).
// - Dependency cycles are rejected at validation time for the same reason.

export type LanePriority = 'P0' | 'P1' | 'P2';

export interface PlanLane {
  name: string;
  adapter: string;
  prompt: string;
  scope_paths: string[];
  deps: string[];
  priority: LanePriority;
  timeout_minutes: number;
}

export interface BuildPlanFile {
  project: string;
  shared_context?: string;
  lanes: PlanLane[];
}

export class PlanParseError extends Error {}

const PRIORITIES = new Set<string>(['P0', 'P1', 'P2']);
const DEFAULT_TIMEOUT_MINUTES = 20;

export function extractPlanJson(markdown: string): string {
  const fences = [...markdown.matchAll(/```json\s*\n([\s\S]*?)```/g)];
  if (fences.length === 0) {
    throw new PlanParseError('BUILDPLAN has no ```json fence — the plan block is required.');
  }
  if (fences.length > 1) {
    throw new PlanParseError(
      `BUILDPLAN has ${fences.length} \`\`\`json fences — exactly one plan block is allowed.`,
    );
  }
  return fences[0][1];
}

export function parsePlanFile(markdown: string): BuildPlanFile {
  let raw: unknown;
  try {
    raw = JSON.parse(extractPlanJson(markdown));
  } catch (err) {
    if (err instanceof PlanParseError) throw err;
    throw new PlanParseError(`Plan JSON does not parse: ${(err as Error).message}`);
  }
  return validatePlan(raw);
}

export function validatePlan(raw: unknown): BuildPlanFile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PlanParseError('Plan must be a JSON object.');
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.project !== 'string' || obj.project.trim() === '') {
    throw new PlanParseError('Plan needs a non-empty "project" string.');
  }
  if (obj.shared_context !== undefined && typeof obj.shared_context !== 'string') {
    throw new PlanParseError('"shared_context" must be a string when present.');
  }
  if (!Array.isArray(obj.lanes) || obj.lanes.length === 0) {
    throw new PlanParseError('Plan needs a non-empty "lanes" array.');
  }

  const lanes: PlanLane[] = obj.lanes.map((l, i) => parseLane(l, i));

  const names = new Set<string>();
  for (const lane of lanes) {
    if (names.has(lane.name)) {
      throw new PlanParseError(`Duplicate lane name "${lane.name}".`);
    }
    names.add(lane.name);
  }
  for (const lane of lanes) {
    for (const dep of lane.deps) {
      if (!names.has(dep)) {
        throw new PlanParseError(
          `Lane "${lane.name}" depends on unknown lane "${dep}" — fix the typo or add the lane.`,
        );
      }
      if (dep === lane.name) {
        throw new PlanParseError(`Lane "${lane.name}" depends on itself.`);
      }
    }
  }
  assertAcyclic(lanes);

  return {
    project: obj.project.trim(),
    shared_context: typeof obj.shared_context === 'string' ? obj.shared_context : undefined,
    lanes,
  };
}

function parseLane(raw: unknown, index: number): PlanLane {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PlanParseError(`Lane #${index} must be an object.`);
  }
  const l = raw as Record<string, unknown>;
  const where = typeof l.name === 'string' && l.name ? `"${l.name}"` : `#${index}`;

  if (typeof l.name !== 'string' || l.name.trim() === '') {
    throw new PlanParseError(`Lane #${index} needs a non-empty "name".`);
  }
  if (typeof l.adapter !== 'string' || l.adapter.trim() === '') {
    throw new PlanParseError(`Lane ${where} needs an "adapter" id.`);
  }
  if (typeof l.prompt !== 'string' || l.prompt.trim() === '') {
    throw new PlanParseError(`Lane ${where} needs a non-empty "prompt".`);
  }
  if (l.priority !== undefined && !PRIORITIES.has(l.priority as string)) {
    throw new PlanParseError(`Lane ${where}: priority must be P0, P1 or P2.`);
  }
  const scopeRaw = l.scope_paths ?? [];
  if (!Array.isArray(scopeRaw) || scopeRaw.some((s) => typeof s !== 'string')) {
    throw new PlanParseError(`Lane ${where}: "scope_paths" must be an array of strings.`);
  }
  const depsRaw = l.deps ?? [];
  if (!Array.isArray(depsRaw) || depsRaw.some((d) => typeof d !== 'string')) {
    throw new PlanParseError(`Lane ${where}: "deps" must be an array of lane names.`);
  }
  const timeout = l.timeout_minutes ?? DEFAULT_TIMEOUT_MINUTES;
  if (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout <= 0) {
    throw new PlanParseError(`Lane ${where}: "timeout_minutes" must be a positive number.`);
  }

  return {
    name: l.name.trim(),
    adapter: l.adapter.trim(),
    prompt: l.prompt,
    scope_paths: (scopeRaw as string[]).map(normalizeScopePath).filter((s) => s !== ''),
    deps: (depsRaw as string[]).map((d) => d.trim()),
    priority: (l.priority as LanePriority) ?? 'P1',
    timeout_minutes: timeout,
  };
}

// Kahn's algorithm; reports the lanes stuck in a cycle by name.
function assertAcyclic(lanes: PlanLane[]): void {
  const indegree = new Map<string, number>(lanes.map((l) => [l.name, l.deps.length]));
  const dependents = new Map<string, string[]>();
  for (const lane of lanes) {
    for (const dep of lane.deps) {
      dependents.set(dep, [...(dependents.get(dep) ?? []), lane.name]);
    }
  }
  const queue = lanes.filter((l) => l.deps.length === 0).map((l) => l.name);
  let visited = 0;
  while (queue.length > 0) {
    const name = queue.shift()!;
    visited++;
    for (const next of dependents.get(name) ?? []) {
      const d = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, d);
      if (d === 0) queue.push(next);
    }
  }
  if (visited !== lanes.length) {
    const stuck = [...indegree.entries()].filter(([, d]) => d > 0).map(([n]) => n);
    throw new PlanParseError(`Dependency cycle between lanes: ${stuck.join(', ')}.`);
  }
}

export function normalizeScopePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '').trim();
}

// Prefix/exact scope check on a normalized relative path. Empty scope = lane
// may write anywhere in the workspace (still inside it — the runner never
// writes outside the workspace root).
export function isInScope(relPath: string, scopePaths: string[]): boolean {
  if (scopePaths.length === 0) return true;
  const norm = normalizeScopePath(relPath);
  return scopePaths.some((scope) => {
    if (norm === scope) return true;
    const dir = scope.endsWith('/') ? scope : `${scope}/`;
    return norm.startsWith(dir);
  });
}
