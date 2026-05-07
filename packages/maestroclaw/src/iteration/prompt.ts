// PRO-02 — Iteration loop per-step prompt template.
//
// Each step of an iteration loop (read → propose → apply → verify) builds a
// prompt from current loop state. The agent must:
//   - Stay inside scope_paths.
//   - Propose ONE focused diff (not a large rewrite).
//   - Provide rationale + expected_outcome + confidence + give_up signal.
//   - NOT retry the same diff if it failed before — propose a DIFFERENT approach.
//
// The output is JSON for clean parsing into iteration_steps.proposed_diff and
// metadata. See PRO-02_ITERATION_LOOP_SPEC.md §"The Agent Prompt — Per-Step
// Template" for the full design.

import { createHash } from "node:crypto";

export interface FileSnapshot {
  path: string;
  sha256: string;
  // Truncated content for the prompt body. Files larger than ~32KB are
  // truncated with a marker so the agent knows it's seeing partial content.
  content_for_prompt: string;
  truncated: boolean;
  full_size_bytes: number;
}

export interface PriorStepSummary {
  step_number: number;
  diff_summary: string;        // 1-line summary of what was proposed
  apply_result: "succeeded" | "failed" | "rejected";
  apply_error?: string;
  verification_result: "passed" | "failed" | "skipped";
  verification_stderr_tail?: string;  // last 30 lines of stderr if failed
}

export interface IterationStepPromptInputs {
  goal: string;
  scope_paths: string[];
  verification_command?: string;
  step_number: number;          // 1-indexed
  files_in_scope: FileSnapshot[];
  prior_steps: PriorStepSummary[];
  max_steps: number;
}

export interface IterationStepOutput {
  rationale: string;
  diff: string;                 // unified diff format
  expected_outcome: string;
  confidence: "high" | "medium" | "low";
  give_up: boolean;
  give_up_rationale?: string;
}

const SYSTEM_PROMPT = `You are an iteration agent in a build loop. The user is watching. Each step you propose a focused, applicable diff that moves toward the goal.

Your discipline:
- Propose ONE diff per step. Not a large rewrite.
- Stay STRICTLY inside scope_paths. Touching anything outside is a hard failure.
- If your previous diff did not work, propose a DIFFERENT approach — not the same diff with a small variation. The system tracks repeats and will give up on you if you cycle.
- The diff MUST apply cleanly against the file contents shown to you. The sha256 hashes are provided so you know the base. If the loop runner detects your diff is against a stale base, the step gets re-proposed.
- Output STRICTLY as JSON. No prose outside the object. No markdown fences.
- Set "give_up": true ONLY if you have genuinely tried 2-3 different approaches and cannot make progress, OR if the goal requires information you don't have (e.g., test asserts X but the spec is unclear). Always include give_up_rationale when give_up is true.
- "confidence" is your honest assessment of whether this diff will pass verification. low = you're guessing; medium = the change is reasonable but verification might surprise you; high = you've identified the exact issue and the fix is clear.`;

export function getIterationSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

export function renderIterationUserMessage(inputs: IterationStepPromptInputs): string {
  const fileSection = inputs.files_in_scope
    .map(f => {
      const language = inferLanguage(f.path);
      const truncatedNote = f.truncated
        ? `\n[file truncated — full size ${f.full_size_bytes} bytes; this is the head]`
        : "";
      return `── ${f.path} (sha256: ${f.sha256.slice(0, 12)}...) ──${truncatedNote}\n\`\`\`${language}\n${f.content_for_prompt}\n\`\`\``;
    })
    .join("\n\n");

  const priorStepsSection = inputs.prior_steps.length === 0
    ? "(this is step 1 — no prior steps)"
    : inputs.prior_steps.map(s => {
      const verifyDetail = s.verification_result === "failed" && s.verification_stderr_tail
        ? `\n  Verification stderr (last lines):\n${indent(s.verification_stderr_tail, "    ")}`
        : "";
      return `Step ${s.step_number}:
  Diff: ${s.diff_summary}
  Apply: ${s.apply_result}${s.apply_error ? ` (${s.apply_error})` : ""}
  Verify: ${s.verification_result}${verifyDetail}`;
    }).join("\n\n");

  const verificationLine = inputs.verification_command
    ? `\n\nVERIFICATION COMMAND (runs after each successful apply):\n\`${inputs.verification_command}\``
    : "\n\nNo verification command configured — your diff is trusted on apply.";

  return `GOAL:
${inputs.goal}

SCOPE (you may ONLY modify these paths):
${inputs.scope_paths.map(p => `- ${p}`).join("\n")}

CURRENT FILE CONTENTS (in scope):

${fileSection}${verificationLine}

PRIOR STEPS (chronological, so you remember what failed and why):

${priorStepsSection}

THIS IS STEP ${inputs.step_number} of max ${inputs.max_steps}.

Output JSON:
{
  "rationale": "1-3 sentences explaining WHAT you're changing and WHY",
  "diff": "<unified diff format, applicable with 'git apply'>",
  "expected_outcome": "what verification result you expect after this diff (e.g., 'test passes', 'lint clean', 'build succeeds')",
  "confidence": "high" | "medium" | "low",
  "give_up": false,
  "give_up_rationale": "(only present if give_up is true)"
}`;
}

/**
 * Parse the agent's iteration step output. Tolerant of common failure modes:
 *   - Markdown fences around JSON
 *   - Leading/trailing prose
 *   - Missing optional fields
 *
 * Returns null if completely unparseable; the runner should treat null as a
 * step failure and try again with a "your output was not parseable" hint, or
 * give up after one retry.
 */
export function parseIterationStepOutput(rawText: string): IterationStepOutput | null {
  const trimmed = rawText.trim();

  const candidates: string[] = [trimmed];
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) candidates.push(fenceMatch[1].trim());
  const braceStart = trimmed.indexOf("{");
  const braceEnd = trimmed.lastIndexOf("}");
  if (braceStart >= 0 && braceEnd > braceStart) {
    candidates.push(trimmed.slice(braceStart, braceEnd + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const normalized = normalizeOutput(parsed);
      if (normalized) return normalized;
    } catch {
      // try next candidate
    }
  }
  return null;
}

function normalizeOutput(parsed: unknown): IterationStepOutput | null {
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  const rationale = typeof obj.rationale === "string" ? obj.rationale : "";
  const diff = typeof obj.diff === "string" ? obj.diff : "";
  const expectedOutcome = typeof obj.expected_outcome === "string" ? obj.expected_outcome : "";
  const confidenceRaw = typeof obj.confidence === "string" ? obj.confidence.toLowerCase() : "medium";
  const confidence: "high" | "medium" | "low" =
    confidenceRaw === "high" || confidenceRaw === "low" ? confidenceRaw : "medium";
  const giveUp = obj.give_up === true;
  const giveUpRationale = typeof obj.give_up_rationale === "string" ? obj.give_up_rationale : undefined;

  // Must have either a diff OR be giving up. Empty diff with give_up=false is
  // a model failure — return null so the runner can retry/give up cleanly.
  if (!diff && !giveUp) return null;

  return {
    rationale: rationale || "(no rationale provided)",
    diff,
    expected_outcome: expectedOutcome,
    confidence,
    give_up: giveUp,
    give_up_rationale: giveUpRationale,
  };
}

/**
 * Produce a stable hash of a proposed diff so the runner can detect when an
 * agent is repeating itself. Whitespace-normalized to ignore trivial reformats.
 */
export function hashDiff(diff: string): string {
  // Normalize: strip trailing whitespace per line, collapse internal blank
  // runs, lowercase nothing (case matters in code).
  const normalized = diff
    .split("\n")
    .map(line => line.replace(/\s+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return createHash("sha256").update(normalized).digest("hex");
}

/**
 * Given the last N proposed-diff hashes from prior_steps, return true if the
 * current proposal is materially repeating itself (last 3 hashes equal).
 */
export function detectAgentStuck(priorDiffHashes: string[], currentHash: string): boolean {
  if (priorDiffHashes.length < 2) return false;
  const lastTwo = priorDiffHashes.slice(-2);
  return lastTwo.every(h => h === currentHash);
}

// ──────────────────────────────────────────────────────────────────────

function inferLanguage(path: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "tsx",
    js: "javascript", jsx: "jsx",
    py: "python", rb: "ruby", go: "go", rs: "rust",
    java: "java", kt: "kotlin", swift: "swift",
    css: "css", scss: "scss", html: "html",
    json: "json", yml: "yaml", yaml: "yaml", toml: "toml",
    md: "markdown", sh: "bash",
    sql: "sql",
  };
  return map[ext] ?? "";
}

function indent(text: string, prefix: string): string {
  return text.split("\n").map(l => prefix + l).join("\n");
}
