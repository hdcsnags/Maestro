// Builds the environment passed to every child process MaestroClaw spawns
// (AI adapters and shell adapters). See docs/audits/MAESTROCLAW-ATTACK-PLAN.md
// §2 item 7.
//
// Deliberately a deny-list, not an allow-list: adapters need whatever ambient
// PATH/HOME/APPDATA/etc. the CLI tools need to resolve their own config and
// auth, and that set is impossible to enumerate exhaustively across four-plus
// independently-versioned CLIs. What IS enumerable is which variables are
// MaestroClaw's own secrets — those must never reach a spawned process (and,
// transitively, never reach a shell command or tool call that process's agent
// decides to run). Those are stripped unconditionally.
//
// A full allow-list is real future work gated on per-adapter capability
// negotiation (see the full audit's execution-identity/capability-attestation
// recommendation) — not something to guess at ad hoc here.

const SECRET_ENV_PATTERNS: RegExp[] = [
  /^SUPABASE_/i,
  /^EXECUTOR_TOKEN$/i,
  /^MAESTRO_/i,
  /^APPROVAL_TOKEN/i,
  /_TOKEN$/i,
  /_SECRET$/i,
  /_API_KEY$/i,
  /^SERVICE_ROLE/i,
];

// CLAW_* config vars that are plain (non-secret) adapter configuration, not
// credentials — never strip these even though they share the MAESTRO_/CLAW_
// namespace conceptually. Kept as an explicit list so a future secret named
// CLAW_*_TOKEN still gets caught by the _TOKEN$ pattern above.
const CLAW_CONFIG_ALLOWLIST = new Set([
  "CLAW_CLAUDE_MODEL",
  "CLAW_CLAUDE_FALLBACK_MODEL",
  "CLAW_GEMINI_MODEL",
  "CLAW_GEMINI_FALLBACK_MODEL",
  "CLAW_GEMINI_SANDBOX",
  "CLAW_CODEX_MODEL",
  "CLAW_KIMI_MODEL",
  "CLAW_ITERATION_ADAPTER",
]);

function isSecretEnvKey(key: string): boolean {
  if (CLAW_CONFIG_ALLOWLIST.has(key)) return false;
  return SECRET_ENV_PATTERNS.some((re) => re.test(key));
}

/**
 * Returns a copy of process.env with MaestroClaw's own secrets stripped.
 * Pass `extra` to layer on adapter-specific variables (e.g. PYTHONIOENCODING
 * for the Kimi adapter) — these are applied after scrubbing and always win.
 */
export function buildChildEnv(extra?: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (isSecretEnvKey(key)) continue;
    out[key] = value;
  }
  return extra ? { ...out, ...extra } : out;
}
