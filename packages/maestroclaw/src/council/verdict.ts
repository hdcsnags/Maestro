// Verdict contract: every seat ends its reply with a BEGIN VERDICT / END VERDICT block
// holding JSON. This module appends the contract to briefs that lack one, extracts
// and classifies the block, and builds the "re-ask" prompt used when a seat's reply
// was cut off before END VERDICT (the Gemini 4 Argon truncation of 2026-10-18).
//
// The schema carries Power 3: a grounding attestation and per-claim status. Seats
// that omit the attestation are recorded as `attestation: missing`, which is itself
// a grade (see MAESTRO_STATE 2026-09-06: silence about skipping verification was the
// worst failure mode in the table).

import type { SeatVerdict, VerdictStatus } from "./types.js";

export const BEGIN = "BEGIN VERDICT";
export const END = "END VERDICT";

export const VERDICT_CONTRACT = `
---
## Output contract (mandatory)

Begin your reply with one line stating the model you are running as. Then your analysis.
End your reply with this block, and nothing after it:

${BEGIN}
{
  "seat": "<the model you are running as>",
  "attestation": {
    "ran_verifier": <true if you executed code, tests, scripts or a verifier to check claims; false if you only read>,
    "tools_used": ["<shell|read|grep|test|verify.py|none>"],
    "files_read": <integer>,
    "corpus_access": "<granted|denied|not_applicable>"
  },
  "items": [
    {
      "id": "<Q1, Q2 … matching the numbered questions in the brief; or a short slug for a finding>",
      "stance": "<agree|disagree|partial|unverifiable>",
      "summary": "<one sentence>",
      "claims": [
        { "text": "<a specific factual claim you rely on>", "status": "<verified|unverified|inferred|disputed>", "evidence": "<path:line, command run, or 'none'>" }
      ]
    }
  ],
  "verdict": "<the overall verdict word the brief asked for, if any>",
  "open_questions": ["<things you could not settle>"]
}
${END}

Rules: valid JSON only inside the block (no comments, no trailing commas, no code fences). Mark a claim "verified" only if you checked it yourself in this run. If you could not access files or tools, say so in attestation and mark claims "unverified". Keep per-item summaries short so the block is never cut off.
`.trim();

export function hasContract(prompt: string): boolean {
  return prompt.includes(BEGIN) && prompt.includes(END);
}

export function withContract(prompt: string): string {
  return hasContract(prompt) ? prompt : `${prompt.trimEnd()}\n\n${VERDICT_CONTRACT}\n`;
}

export interface Extracted {
  status: VerdictStatus;
  json?: SeatVerdict;
  raw?: string;
  error?: string;
}

/** Find the LAST verdict block (a seat may quote the contract back before answering). */
export function extractVerdict(output: string): Extracted {
  const b = output.lastIndexOf(BEGIN);
  if (b < 0) return { status: "missing" };
  const e = output.indexOf(END, b + BEGIN.length);
  if (e < 0) return { status: "truncated", raw: output.slice(b + BEGIN.length).trim() };
  let sec = output.slice(b + BEGIN.length, e).trim();
  sec = sec.replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
  try {
    const json = JSON.parse(sec) as SeatVerdict;
    if (!json || typeof json !== "object" || Array.isArray(json)) return { status: "unparseable", raw: sec, error: "verdict is not a JSON object" };
    return { status: "parsed", json, raw: sec };
  } catch (err) {
    // One repair pass: trailing commas and smart quotes are the common offenders.
    const repaired = sec.replace(/,\s*([}\]])/g, "$1").replace(/[“”]/g, '"');
    try {
      const json = JSON.parse(repaired) as SeatVerdict;
      return { status: "parsed", json, raw: repaired };
    } catch {
      return { status: "unparseable", raw: sec, error: err instanceof Error ? err.message : String(err) };
    }
  }
}

/** Prompt for a stateless re-ask: the seat gets its own cut-off reply and must emit only the block. */
export function reaskPrompt(originalPrompt: string, truncatedOutput: string): string {
  const tail = truncatedOutput.length > 20_000 ? truncatedOutput.slice(-20_000) : truncatedOutput;
  return [
    "Your previous reply to the brief below was cut off before the END VERDICT line, so the verdict block could not be read.",
    "Do NOT redo the analysis. Reply with ONLY the BEGIN VERDICT … END VERDICT block for the analysis you already wrote, keeping each summary to one sentence so the block is short.",
    "",
    "=== YOUR EARLIER REPLY (cut off) ===",
    tail,
    "=== END OF EARLIER REPLY ===",
    "",
    "=== THE BRIEF (for reference) ===",
    originalPrompt,
  ].join("\n");
}

export function describeAttestation(v: SeatVerdict | undefined): string {
  if (!v) return "missing";
  const a = v.attestation;
  if (!a) return "missing";
  const parts = [`ran_verifier=${a.ran_verifier === true ? "yes" : a.ran_verifier === false ? "no" : "?"}`];
  if (Array.isArray(a.tools_used) && a.tools_used.length) parts.push(`tools=${a.tools_used.join("/")}`);
  if (typeof a.files_read === "number") parts.push(`files=${a.files_read}`);
  if (a.corpus_access) parts.push(`corpus=${a.corpus_access}`);
  return parts.join(" ");
}
