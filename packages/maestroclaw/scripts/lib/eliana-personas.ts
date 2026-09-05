// Shared persona-extraction helper for the Eliana proof-workload runs.
// Extracts voice_preamble / deliberation_signature text directly out of
// .michael/opus/PERSONAS_THEOLOGY.md rather than hand-copying it as a string
// literal — "voices are prior sets, not roleplay" (file §0) requires the
// preamble used verbatim, and a hand-typed copy is exactly the kind of thing
// that can silently drift (a hyphen for an em-dash, "State" for "States")
// without anyone noticing. Factored out here after being built inline for
// the Forsaken Cry round's New Believer/Pastor run, reused as-is for the
// Christian Canonical Reader addendum run.

export function extractPersonaPreamble(personasFileText: string, sectionHeading: string): string {
  const sectionStart = personasFileText.indexOf(sectionHeading);
  if (sectionStart === -1) throw new Error(`Section "${sectionHeading}" not found in PERSONAS_THEOLOGY.md`);
  const preambleMarker = "**voice_preamble:**";
  const preambleStart = personasFileText.indexOf(preambleMarker, sectionStart);
  if (preambleStart === -1) throw new Error(`"${preambleMarker}" not found after "${sectionHeading}"`);
  const strengthsMarker = "**strengths:**";
  const preambleEnd = personasFileText.indexOf(strengthsMarker, preambleStart);
  if (preambleEnd === -1) throw new Error(`"${strengthsMarker}" not found after preamble for "${sectionHeading}"`);
  const block = personasFileText.slice(preambleStart + preambleMarker.length, preambleEnd);
  // Each paragraph line is a markdown blockquote ("> ..."); strip the prefix
  // and rejoin, preserving the blank lines between paragraphs.
  return block
    .split("\n")
    .map((line) => line.replace(/^>\s?/, ""))
    .join("\n")
    .trim();
}

export function extractDeliberationSignature(personasFileText: string, sectionHeading: string): string {
  const sectionStart = personasFileText.indexOf(sectionHeading);
  if (sectionStart === -1) throw new Error(`Section "${sectionHeading}" not found in PERSONAS_THEOLOGY.md`);
  const marker = "**deliberation_signature";
  const markerStart = personasFileText.indexOf(marker, sectionStart);
  if (markerStart === -1) throw new Error(`"${marker}" not found after "${sectionHeading}"`);
  const lineEnd = personasFileText.indexOf("\n", markerStart);
  const line = personasFileText.slice(markerStart, lineEnd === -1 ? undefined : lineEnd);
  // Line shape: "**deliberation_signature...:** <instruction text>"
  const colonIdx = line.indexOf(":**");
  return (colonIdx >= 0 ? line.slice(colonIdx + 3) : line).trim();
}

/**
 * Extracts a §6a-style task-mode block: the task instruction blockquote
 * that follows "**Task: `<taskName>`**", up to the next "**Task:" or the
 * next "Required ending format" marker (whichever comes first) — mirrors
 * extractPersonaPreamble's blockquote-stripping approach.
 */
export function extractTaskInstruction(personasFileText: string, taskMarker: string): string {
  const markerStart = personasFileText.indexOf(taskMarker);
  if (markerStart === -1) throw new Error(`Task marker "${taskMarker}" not found in PERSONAS_THEOLOGY.md`);
  // First blockquote line after the marker starts the instruction.
  const firstQuoteIdx = personasFileText.indexOf("\n>", markerStart);
  if (firstQuoteIdx === -1) throw new Error(`No blockquote found after task marker "${taskMarker}"`);
  // End at the first blank-then-non-quote line (i.e. the blockquote's own end).
  const afterQuoteStart = personasFileText.indexOf("\n\n", firstQuoteIdx);
  if (afterQuoteStart === -1) throw new Error(`Could not find end of blockquote after task marker "${taskMarker}"`);
  const block = personasFileText.slice(firstQuoteIdx, afterQuoteStart);
  return block
    .split("\n")
    .map((line) => line.replace(/^>\s?/, ""))
    .join("\n")
    .trim();
}

/**
 * Extracts a required-ending-format code block that appears after the given
 * marker text (e.g. "Required ending format for this task specifically"),
 * inside the next ``` fence.
 */
export function extractRequiredEndingFormat(personasFileText: string, afterMarker: string): string {
  const markerStart = personasFileText.indexOf(afterMarker);
  if (markerStart === -1) throw new Error(`Marker "${afterMarker}" not found in PERSONAS_THEOLOGY.md`);
  const fenceStart = personasFileText.indexOf("```", markerStart);
  if (fenceStart === -1) throw new Error(`No code fence found after marker "${afterMarker}"`);
  const contentStart = personasFileText.indexOf("\n", fenceStart) + 1;
  const fenceEnd = personasFileText.indexOf("```", contentStart);
  if (fenceEnd === -1) throw new Error(`Unterminated code fence after marker "${afterMarker}"`);
  return personasFileText.slice(contentStart, fenceEnd).trim();
}

/**
 * Builds a prompt for a §6a-style task mode that OVERRIDES the persona's
 * default deliberation_signature with its own explicit task instruction and
 * required ending format (e.g. christian_canonical_reader's
 * canonical_calibration task) — distinct from buildPersonaPrompt's generic
 * "report your reaction, close with the deliberation signature" shape,
 * which only applies to a persona's default/unmodified task.
 */
export function buildTaskModePrompt(
  voicePreamble: string,
  taskInstruction: string,
  requiredEndingFormat: string,
  contentText: string,
  contentLabel: string,
): string {
  return [
    voicePreamble,
    "",
    "---",
    "",
    taskInstruction,
    "",
    `Read the following ${contentLabel} in full, carrying the priors described above.`,
    "Be specific — quote or closely paraphrase the actual text, not generic praise or criticism.",
    "",
    "Required ending format for this response (use exactly this structure, verbatim headers):",
    "",
    "```",
    requiredEndingFormat,
    "```",
    "",
    `=== ${contentLabel.toUpperCase()} ===`,
    "",
    contentText,
  ].join("\n");
}

export function buildPersonaPrompt(voicePreamble: string, deliberationSignatureInstruction: string, contentText: string, contentLabel: string): string {
  return [
    voicePreamble,
    "",
    "---",
    "",
    `Read the following ${contentLabel} in full, in the voice described above — carrying its priors, not`,
    "performing a role. Report your genuine reaction as that reader: what struck you, what concerned you, what you'd",
    "actually remember or repeat to someone else afterward. Be specific — quote or closely paraphrase the actual text",
    "you're reacting to, not generic praise or criticism.",
    "",
    `Close with this specific required element: ${deliberationSignatureInstruction}`,
    "",
    "Output as complete, well-formatted markdown.",
    "",
    `=== ${contentLabel.toUpperCase()} ===`,
    "",
    contentText,
  ].join("\n");
}
