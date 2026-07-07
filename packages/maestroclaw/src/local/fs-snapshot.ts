// Workspace isolation + written-file collection for headless lane runs.
//
// Each lane runs in its own seeded COPY of the workspace so parallel lanes
// can't read each other's uncommitted writes (and a misbehaving lane can't
// damage the real tree). What a lane "wrote" is computed by content diff:
// snapshot the seed, snapshot after the adapter exits, collect new/changed
// files. The runner then scope-filters and reconciles before anything touches
// the real workspace.

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import * as path from 'node:path';

// Never seeded into lane copies and never collected as lane output.
const EXCLUDED_DIRS = new Set([
  '.git', 'node_modules', 'dist', 'build', '.next', '.venv', '__pycache__',
  'graphify-out', '.maestro-runs',
]);

export interface WrittenFile {
  path: string;     // normalized relative path (forward slashes)
  content: string;
}

function isExcluded(relPath: string): boolean {
  return relPath.split('/').some((seg) => EXCLUDED_DIRS.has(seg));
}

async function walkFiles(root: string, dir = root): Promise<string[]> {
  const out: string[] = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs).replace(/\\/g, '/');
    if (isExcluded(rel)) continue;
    if (entry.isDirectory()) {
      out.push(...(await walkFiles(root, abs)));
    } else if (entry.isFile()) {
      out.push(rel);
    }
  }
  return out;
}

/** rel path -> sha1 of content. */
export async function snapshot(root: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const rel of await walkFiles(root)) {
    const buf = await fs.readFile(path.join(root, rel));
    map.set(rel, createHash('sha1').update(buf).digest('hex'));
  }
  return map;
}

/** Copy workspace into a lane dir, skipping excluded dirs. */
export async function seedCopy(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  for (const rel of await walkFiles(src)) {
    const target = path.join(dest, rel);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(path.join(src, rel), target);
  }
}

/** Files that are new or changed vs the before-snapshot. */
export async function collectWrites(
  laneDir: string,
  before: Map<string, string>,
): Promise<WrittenFile[]> {
  const after = await snapshot(laneDir);
  const writes: WrittenFile[] = [];
  for (const [rel, hash] of after) {
    if (before.get(rel) === hash) continue;
    writes.push({
      path: rel,
      content: await fs.readFile(path.join(laneDir, rel), 'utf8'),
    });
  }
  return writes;
}
