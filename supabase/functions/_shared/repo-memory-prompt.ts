/**
 * DIFF-02: Repo memory summarization prompt + JSON parser.
 * Called by repo-memory-update/index.ts.
 */

export interface SummarizeInput {
  repo_full_name: string;
  existing_content: string;
  session_goal: string;
  build_status: string;
  key_decisions: string;
  user_preferences: string;
}

export interface SummarizeOutput {
  content: string;
  metadata: {
    project_type?: string;
    primary_language?: string;
    frameworks?: string[];
    package_manager?: string;
    test_runner?: string;
    preferred_patterns?: string[];
    do_not_touch?: string[];
  };
  summary_notes: string;
}

export function buildSummarizePrompt(input: SummarizeInput): string {
  return `You are updating a long-running project memory file. The user works on this
project across many sessions. The memory must stay coherent and useful as
new sessions add information.

REPO: ${input.repo_full_name}

CURRENT MEMORY (existing content, may be empty):
${input.existing_content || "(no prior memory)"}

NEW SESSION CONTEXT (just completed):
- Session goal: ${input.session_goal || "(not provided)"}
- Build outcome: ${input.build_status || "(not provided)"}
- Key concierge decisions: ${input.key_decisions || "(none noted)"}
- User explicit preferences voiced: ${input.user_preferences || "(none noted)"}

YOUR JOB:
Produce updated memory content. Preserve historical decisions. Add what's new.
Compress when needed. Stay under 8000 bytes total.

GUIDELINES:
1. Keep the section structure: Summary, Stack, Architecture Decisions, Sensitive Files, Patterns Conductor Prefers, Recent Sessions, Known Pitfalls.
2. "Architecture Decisions" is a chronological log — APPEND new decisions, do not rewrite old ones.
3. "Recent Sessions" — keep last 5 entries; drop the oldest if adding the 6th.
4. "Patterns Conductor Prefers" — only add if observed THIS session OR if a prior session pattern was reinforced.
5. Compress aggressively in "Summary" and "Architecture Decisions" sections to stay under cap.
6. Do NOT invent details that weren't in the input. Speculation is worse than absence.
7. Do NOT include user-identifying info (real names, emails) — keep it project-focused.

Output JSON:
{
  "content": "<full updated markdown, all sections>",
  "metadata": {
    "project_type": "...",
    "primary_language": "...",
    "frameworks": ["..."],
    "package_manager": "...",
    "test_runner": "...",
    "preferred_patterns": ["..."],
    "do_not_touch": ["..."]
  },
  "summary_notes": "<1 sentence: what was added/changed in this update>"
}`;
}

export function buildStrictSummarizePrompt(input: SummarizeInput): string {
  return buildSummarizePrompt(input) +
    "\n\nIMPORTANT: The output is approaching the size cap. Compress AGGRESSIVELY. Keep only the most important 3 recent sessions. Merge related architecture decisions. Be terse.";
}

/** Parse Haiku's response — handles fenced and raw JSON. */
export function parseSummarizeOutput(raw: string): SummarizeOutput | null {
  const attempts: string[] = [];

  // Strip fenced code block
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) attempts.push(fenced[1].trim());

  // Try raw JSON extraction
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (jsonMatch) attempts.push(jsonMatch[0]);

  attempts.push(raw.trim());

  for (const attempt of attempts) {
    try {
      const parsed = JSON.parse(attempt) as unknown;
      if (
        parsed !== null &&
        typeof parsed === "object" &&
        "content" in parsed &&
        typeof (parsed as Record<string, unknown>).content === "string"
      ) {
        return parsed as SummarizeOutput;
      }
    } catch {
      // try next
    }
  }
  return null;
}
