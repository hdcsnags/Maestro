// PRO-02: Iteration lock helpers.
// Acquires and releases file-path locks for an iteration loop via the executor API.

import type { ClawConfig } from "../config.js";
import { acquireLocks as apiAcquireLocks, releaseLocks as apiReleaseLocks } from "../api.js";

export async function acquireIterationLocks(
  config: ClawConfig,
  loopId: string,
  scopePaths: string[],
  repoFullName: string
): Promise<void> {
  // Filter out glob patterns — locks are per-literal-path for exact conflict detection.
  // Glob scopes lock their expanded paths at verify time, not at loop claim.
  const literalPaths = scopePaths.filter(p => !p.includes('*') && !p.includes('?'));
  if (literalPaths.length === 0) return; // glob-only scopes don't pre-lock
  await apiAcquireLocks(config, loopId, literalPaths, repoFullName);
}

export async function releaseIterationLocks(
  config: ClawConfig,
  loopId: string
): Promise<void> {
  await apiReleaseLocks(config, loopId);
}
