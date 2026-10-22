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

/**
 * Schema check (2026-10-21 council, Q4: the parser accepted `{}`, `{"items":"bad"}` and `[1,]`).
 * A verdict is an object whose `items` is an array of objects with string `id` and `stance`,
 * whose `attestation` (if present) is an object, and whose values are not the contract's
 * own `<placeholders>`.
 */
export function validateVerdict(v: unknown): string | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return "verdict is not a JSON object";
  const o = v as Record<string, unknown>;
  if (!Array.isArray(o.items)) return "items must be an array";
  if (o.items.length === 0) return "items is empty";
  for (const [i, it] of (o.items as unknown[]).entries()) {
    if (!it || typeof it !== "object" || Array.isArray(it)) return `items[${i}] is not an object`;
    const r = it as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id.trim()) return `items[${i}].id missing`;
    if (typeof r.stance !== "string" || !r.stance.trim()) return `items[${i}].stance missing`;
    if (/^<.*>$/.test(r.id.trim()) || /^<.*>$/.test(r.stance.trim())) return `items[${i}] still holds a template placeholder`;
    if (r.claims !== undefined) {
      if (!Array.isArray(r.claims)) return `items[${i}].claims must be an array`;
      for (const c of r.claims as unknown[]) if (!c || typeof c !== "object" || typeof (c as Record<string, unknown>).text !== "string") return `items[${i}].claims entry malformed`;
    }
  }
  if (o.attestation !== undefined && (!o.attestation || typeof o.attestation !== "object" || Array.isArray(o.attestation))) return "attestation must be an object";
  if (typeof o.seat === "string" && /^<.*>$/.test(o.seat.trim())) return "seat still holds the template placeholder";
  return null;
}

/** Canonical item id: trimmed, uppercase for Q-numbered ids (`q1` and `Q1 ` are one row). */
export function canonicalItemId(id: string): string {
  const t = id.trim();
  return /^q\d+/i.test(t) ? t.toUpperCase() : t;
}

function tryParse(sec: string): { json?: SeatVerdict; error?: string } {
  const clean = sec.trim().replace(/^```[a-zA-Z]*\s*/, "").replace(/```\s*$/, "").trim();
  const attempts = [clean, clean.replace(/,\s*([}\]])/g, "$1").replace(/[“”]/g, '"')];
  let lastErr = "";
  for (const a of attempts) {
    try {
      const json = JSON.parse(a) as unknown;
      const bad = validateVerdict(json);
      if (bad) { lastErr = bad; continue; }
      const v = json as SeatVerdict;
      for (const it of v.items ?? []) it.id = canonicalItemId(it.id);
      return { json: v };
    } catch (err) { lastErr = err instanceof Error ? err.message : String(err); }
  }
  return { error: lastErr };
}

/**
 * Find the verdict block. Blocks are scanned from the LAST backwards (a seat may quote the
 * contract first), and the first one that parses AND validates wins — a trailing quoted
 * template no longer overrides the real block. For each BEGIN, every following END is tried,
 * so an END-delimiter string inside the JSON does not break parsing.
 */
export function extractVerdict(output: string): Extracted {
  const begins: number[] = [];
  for (let i = output.indexOf(BEGIN); i >= 0; i = output.indexOf(BEGIN, i + BEGIN.length)) begins.push(i);
  if (!begins.length) return { status: "missing" };
  let firstError: Extracted | null = null;
  for (const b of [...begins].reverse()) {
    const start = b + BEGIN.length;
    const ends: number[] = [];
    for (let e = output.indexOf(END, start); e >= 0; e = output.indexOf(END, e + END.length)) ends.push(e);
    if (!ends.length) { if (!firstError) firstError = { status: "truncated", raw: output.slice(start).trim() }; continue; }
    for (const e of ends) {
      const sec = output.slice(start, e);
      const r = tryParse(sec);
      if (r.json) return { status: "parsed", json: r.json, raw: sec.trim() };
      if (!firstError) firstError = { status: "unparseable", raw: sec.trim(), error: r.error };
    }
  }
  return firstError ?? { status: "missing" };
}

/** Prompt for a stateless re-ask when the block was missing or unparseable (not truncated). */
export function reaskMissingPrompt(originalPrompt: string, output: string, reason: string): string {
  const tail = output.length > 20_000 ? output.slice(-20_000) : output;
  return [
    `Your previous reply to the brief below did not end with a valid BEGIN VERDICT … END VERDICT block (${reason}).`,
    "Do NOT redo the analysis. Reply with ONLY the block, as valid JSON per the output contract in the brief: an object with seat, attestation, items (array of {id, stance, summary, claims}), verdict, open_questions. Keep summaries to one sentence.",
    "",
    "=== YOUR EARLIER REPLY ===",
    tail,
    "=== END OF EARLIER REPLY ===",
    "",
    "=== THE BRIEF (for reference) ===",
    originalPrompt,
  ].join("\n");
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
