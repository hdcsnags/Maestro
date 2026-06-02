// Ephemeral coordinator for a single execution run.
// Scoped to the lifetime of one loop/job — not persisted.
// Tracks which tasks are ready, running, done, or failed.

import {
  buildPlan,
  getReadyEntries,
  markEntryDone,
  markEntryFailed,
  markEntryRunning,
  type ConductorPlan,
  type PlanEntry,
  type RawTask,
} from './plan.js';
import { reconcileManifests, type ManifestEntry } from './reconcile.js';

export interface ConductorRunOptions {
  maxConcurrency?: number;
}

export interface ConductorRun {
  readonly planId: string;
  getReadyEntries(): PlanEntry[];
  markRunning(taskId: string): void;
  markDone(taskId: string): void;
  markFailed(taskId: string): void;
  canAcceptMore(): boolean;
  activeCount(): number;
  /** Advisory pre-flight reconcile — dedups by conductor_approved > priority > lane_name. */
  reconcile(entries: ManifestEntry[]): ManifestEntry[];
  /** Fingerprint of non-terminal entries. Stable across waves = deadlock signal. */
  fingerprint(): string;
}

export function createConductorRun(
  tasks: RawTask[],
  options: ConductorRunOptions = {},
): ConductorRun {
  let plan: ConductorPlan = buildPlan(tasks);
  let active = 0;
  const maxConcurrency = options.maxConcurrency ?? 3;

  return {
    get planId() { return plan.id; },

    getReadyEntries() {
      return getReadyEntries(plan);
    },

    markRunning(taskId: string) {
      plan = markEntryRunning(plan, taskId);
      active++;
    },

    markDone(taskId: string) {
      plan = markEntryDone(plan, taskId);
      active = Math.max(0, active - 1);
    },

    markFailed(taskId: string) {
      plan = markEntryFailed(plan, taskId);
      active = Math.max(0, active - 1);
    },

    canAcceptMore() {
      return active < maxConcurrency;
    },

    activeCount() {
      return active;
    },

    reconcile(entries: ManifestEntry[]) {
      return reconcileManifests(entries).resolved;
    },

    fingerprint() {
      return plan.entries
        .filter(e => e.status !== 'done' && e.status !== 'failed')
        .map(e => `${e.task_id}:${e.status}:${e.lane_name}`)
        .sort()
        .join('|');
    },
  };
}
