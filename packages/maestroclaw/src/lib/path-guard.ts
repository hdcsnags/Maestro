// Canonical path-containment checks used everywhere MaestroClaw touches a
// path that ultimately came from a remote job record or from model/agent
// output (allowed_paths[0], agent_query.files, scope_paths, artifact paths).
//
// Two concrete bugs this closes (see docs/audits/MAESTROCLAW-ATTACK-PLAN.md §2):
//   - executor.ts cleanForRetry() resolved(workDir, job.allowed_paths[0]) with
//     no containment check, then unlinkSync'd it — a job record with
//     allowed_paths: ["../../something"] could delete outside the workspace.
//   - iteration/runner.ts buildQueryPrompt() joined(workDir, agent_query.files[n])
//     with no containment check, then readFileSync'd it — a prompt-injected
//     model could make MaestroClaw itself read arbitrary host files and hand
//     the contents to a peer adapter.
//
// Lexical containment (resolve + prefix check) stops "../" and absolute-path
// escapes. It does NOT stop a symlink *inside* the workspace whose target
// points outside — for that, resolveContainedRealpath resolves the realpath
// of the deepest existing ancestor and re-checks containment after
// resolution.

import { resolve, sep, dirname } from "node:path";
import { realpathSync, existsSync } from "node:fs";

export class PathEscapeError extends Error {
  constructor(
    public readonly root: string,
    public readonly requested: string,
  ) {
    super(`Path escapes workspace root: "${requested}" (root: ${root})`);
    this.name = "PathEscapeError";
  }
}

/**
 * Resolve `relPath` against `rootDir` and throw PathEscapeError if the
 * resulting absolute path is not `rootDir` itself or strictly inside it.
 *
 * Lexical only — does not follow symlinks. Use `resolveContainedRealpath`
 * whenever the path will be read, written, or deleted and a symlink-mediated
 * escape would matter (i.e. almost always — prefer that one by default).
 */
export function resolveContained(rootDir: string, relPath: string): string {
  const resolvedRoot = resolve(rootDir);
  const resolvedPath = resolve(rootDir, relPath);

  if (resolvedPath !== resolvedRoot && !resolvedPath.startsWith(resolvedRoot + sep)) {
    throw new PathEscapeError(resolvedRoot, relPath);
  }

  return resolvedPath;
}

/**
 * Like resolveContained, but also resolves symlinks on the existing portion
 * of the path (walking up to the nearest existing ancestor) and re-validates
 * containment against the *resolved* root. Catches the case where a
 * repo-controlled symlink inside the workspace points outside it.
 *
 * Safe to call on paths that don't exist yet (e.g. before a write) — it
 * walks up to the nearest existing ancestor for the realpath check and
 * trusts the lexical result for the non-existent tail.
 */
export function resolveContainedRealpath(rootDir: string, relPath: string): string {
  const lexical = resolveContained(rootDir, relPath);

  let resolvedRootReal: string;
  try {
    resolvedRootReal = realpathSync(resolve(rootDir));
  } catch {
    // Root doesn't exist yet — nothing to resolve against; lexical check stands.
    return lexical;
  }

  let probe = lexical;
  while (!existsSync(probe)) {
    const parent = dirname(probe);
    if (parent === probe) break; // reached filesystem root without finding an existing ancestor
    probe = parent;
  }

  let probeReal: string;
  try {
    probeReal = realpathSync(probe);
  } catch {
    return lexical;
  }

  if (probeReal !== resolvedRootReal && !probeReal.startsWith(resolvedRootReal + sep)) {
    throw new PathEscapeError(resolvedRootReal, relPath);
  }

  return lexical;
}

/**
 * Non-throwing variant for call sites that want to skip-and-continue (e.g.
 * silently drop one bad entry from a list of agent-supplied file paths)
 * rather than aborting the whole operation.
 */
export function tryResolveContainedRealpath(rootDir: string, relPath: string): string | null {
  try {
    return resolveContainedRealpath(rootDir, relPath);
  } catch (err) {
    if (err instanceof PathEscapeError) return null;
    throw err;
  }
}

/**
 * True if a diff-touched or manifest path (as a raw string, before any join
 * against a root) tries to escape via ".." segments or an absolute/
 * drive-letter root. Used where a path is checked against a glob *scope*
 * before it's ever resolved against a directory — a scope of "**" must still
 * never be interpreted as "anywhere the OS can resolve to."
 */
export function isPathEscaping(rawPath: string): boolean {
  const normalized = rawPath.replace(/\\/g, "/");
  if (normalized.startsWith("/")) return true; // POSIX absolute
  if (/^[A-Za-z]:/.test(normalized)) return true; // Windows drive-letter absolute
  if (normalized.startsWith("//") || normalized.startsWith("\\\\")) return true; // UNC
  const segments = normalized.split("/");
  return segments.some((segment) => segment === "..");
}
