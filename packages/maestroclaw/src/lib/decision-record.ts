// MEM-02: Decision record — structured outcome saved at the end of every
// iteration loop. Written locally to decision_record.json in the workspace
// and forwarded to executor-api (complete_loop) for DB storage in
// iteration_loops.decision_record so the concierge can reference recent history.

import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { IterationLoopRecord } from "../api.js";
import type { PriorStepSummary } from "../iteration/prompt.js";

export const DECISION_RECORD_FILE = "decision_record.json";

export interface DecisionRecord {
  ts: string;
  loop_id: string;
  outcome: string;
  task: string;
  problem_type: string;
  what_worked: string;
  what_failed: string;
  agent_used: string;
  files_touched: string[];
}

const PROBLEM_TYPE_PATTERNS: [RegExp, string][] = [
  [/\b(auth|login|jwt|oauth|session|token|password|credential|permission|role)\b/i, "auth"],
  [/\b(database|schema|migration|sql|postgres|supabase|table|column|index|query)\b/i, "database"],
  [/\b(ui|component|css|style|layout|modal|drawer|button|form|page|render|react)\b/i, "ui"],
  [/\b(api|endpoint|route|fetch|http|rest|graphql|webhook|socket)\b/i, "api"],
  [/\b(test|spec|coverage|jest|vitest|playwright|unit|integration)\b/i, "testing"],
  [/\b(config|deploy|ci|cd|env|docker|pipeline|build|release|workflow)\b/i, "config"],
  [/\b(type|interface|typescript|lint|refactor|rename|cleanup|abstract)\b/i, "refactor"],
];

export function detectProblemType(goal: string): string {
  for (const [pattern, label] of PROBLEM_TYPE_PATTERNS) {
    if (pattern.test(goal)) return label;
  }
  return "general";
}

export function buildDecisionRecord(
  loop: IterationLoopRecord,
  priorSteps: PriorStepSummary[],
  outcome: string,
  agentUsed: string,
  filesTouched: string[],
): DecisionRecord {
  const succeeded = priorSteps.filter(
    s => s.apply_result === "succeeded" && s.verification_result === "passed",
  );
  const failed = priorSteps.filter(
    s => s.apply_result === "failed" || s.verification_result === "failed" || s.apply_result === "rejected",
  );

  const what_worked =
    succeeded.length > 0
      ? succeeded.map(s => s.diff_summary).join("; ")
      : "No steps succeeded";

  const what_failed =
    failed.length > 0
      ? failed
          .map(s => s.diff_summary + (s.apply_error ? `: ${s.apply_error.slice(0, 80)}` : ""))
          .join("; ")
      : outcome === "succeeded"
        ? "None"
        : "No individual steps failed (see termination reason)";

  return {
    ts: new Date().toISOString(),
    loop_id: loop.id,
    outcome,
    task: loop.goal.slice(0, 200),
    problem_type: detectProblemType(loop.goal),
    what_worked,
    what_failed,
    agent_used: agentUsed,
    files_touched: filesTouched,
  };
}

export function saveDecisionRecord(workDir: string, record: DecisionRecord): void {
  writeFileSync(
    join(workDir, DECISION_RECORD_FILE),
    JSON.stringify(record, null, 2),
    "utf8",
  );
}

export function loadDecisionRecord(workDir: string): DecisionRecord | null {
  const path = join(workDir, DECISION_RECORD_FILE);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8")) as DecisionRecord;
  } catch {
    return null;
  }
}
