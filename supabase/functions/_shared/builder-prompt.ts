// builder-prompt.ts — DIFF-03 lane-scoped prompt rendering
// Types are inlined (no src/ imports allowed in Deno edge runtime).

export interface FileTreeNode {
  path: string;
  kind: "file" | "dir";
  description?: string;
}

export interface LaneApiExport {
  symbol: string;
  kind: "function" | "class" | "interface" | "type" | "constant" | "enum";
  signature: string;
  source_file: string;
  description: string;
}

export interface LaneApiImport {
  symbol: string;
  from_lane: string;
  reason: string;
}

export interface ArchitectLaneSlice {
  file_subtree: FileTreeNode[];
  risk_notes: string[];
  description: string;
  design_notes?: string;
}

export interface ArchitectLane {
  agent_id: string;
  agent_name: string;
  role: string;
  lane_paths: string[];
  slice: ArchitectLaneSlice;
  exports: LaneApiExport[];
  imports: LaneApiImport[];
}

export interface ArchitectPlanSharedContext {
  project_summary: string;
  build_intent: string;
  security_constraints: string[];
  do_not_touch: string[];
  manifest_rules: string;
}

export interface ArchitectPlan {
  schema_version: 1;
  shared_context: ArchitectPlanSharedContext;
  lanes: ArchitectLane[];
}

export interface BuildTaskPromptSlice {
  shared_context: ArchitectPlanSharedContext;
  lane_slice: ArchitectLaneSlice;
  cross_lane_exports: LaneApiExport[];
  target_file: string;
  task_instruction: string;
}

/** Returns exports from other lanes that this lane imports. */
export function getCrossLaneExports(plan: ArchitectPlan, lane: ArchitectLane): LaneApiExport[] {
  const importedSymbols = new Set((lane.imports ?? []).map((i) => i.symbol));
  if (importedSymbols.size === 0) return [];

  const result: LaneApiExport[] = [];
  for (const other of plan.lanes) {
    if (other.agent_id === lane.agent_id) continue;
    for (const exp of other.exports ?? []) {
      if (importedSymbols.has(exp.symbol)) {
        result.push(exp);
      }
    }
  }
  return result;
}

/**
 * Renders a structured BuildTaskPromptSlice into the plain-text prompt that
 * is stored in build_tasks.prompt_slice and sent to both edge and Claw executors.
 *
 * The output is self-contained: it includes project context, lane scope,
 * cross-lane API contracts, task instruction, and output format rules.
 * Token budget: ~3–5 k tokens vs the current ~15 k monolithic prompt.
 */
export function renderBuilderSystemPrompt(slice: BuildTaskPromptSlice): string {
  const { shared_context, lane_slice, cross_lane_exports, target_file, task_instruction } = slice;
  const parts: string[] = [];

  parts.push(`PROJECT: ${shared_context.project_summary}`);
  parts.push(`\nBUILD INTENT: ${shared_context.build_intent}`);

  if (shared_context.security_constraints.length > 0) {
    parts.push(`\nGLOBAL CONSTRAINTS (apply to every builder):\n` +
      shared_context.security_constraints.map((c) => `- ${c}`).join("\n"));
  }

  if (shared_context.do_not_touch.length > 0) {
    parts.push(`\nDO NOT MODIFY:\n` +
      shared_context.do_not_touch.map((p) => `- ${p}`).join("\n"));
  }

  parts.push(`\nYOUR LANE: ${lane_slice.description}`);

  const laneFiles = (lane_slice.file_subtree ?? []).filter((n) => n.kind === "file");
  if (laneFiles.length > 0) {
    parts.push(`\nFILES IN YOUR LANE:\n` +
      laneFiles.map((n) => `  ${n.path}${n.description ? " — " + n.description : ""}`).join("\n"));
  }

  if (lane_slice.risk_notes.length > 0) {
    parts.push(`\nLANE-SPECIFIC RISKS:\n` +
      lane_slice.risk_notes.map((r) => `- ${r}`).join("\n"));
  }

  if (lane_slice.design_notes) {
    parts.push(`\nDESIGN NOTES:\n${lane_slice.design_notes}`);
  }

  if (cross_lane_exports.length > 0) {
    parts.push(`\nCROSS-LANE API YOU CAN USE (provided by other builders):\n` +
      cross_lane_exports.map((e) =>
        `- ${e.symbol} (${e.kind}, from ${e.source_file})\n  Signature: ${e.signature}\n  ${e.description}`
      ).join("\n"));
  }

  parts.push(`\nYOUR CURRENT TASK:\nFile to write: ${target_file}\n${task_instruction}`);

  parts.push(`\nOUTPUT FORMAT:\n${shared_context.manifest_rules}`);

  parts.push(
    `\nCRITICAL:\n` +
    `- Write ONLY the file listed under "YOUR CURRENT TASK".\n` +
    `- COMPLETE file content only — no "// ... existing code ..." placeholders.\n` +
    (cross_lane_exports.length > 0
      ? `- Use ONLY the cross-lane API listed above when calling other builders' code.\n`
      : ""),
  );

  return parts.join("\n");
}
