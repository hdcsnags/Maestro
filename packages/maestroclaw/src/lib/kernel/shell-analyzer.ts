/**
 * ThamosClaw Shell Kernel - Harvested from OpenClaw
 *
 * Provides robust shell command parsing and analysis to ensure safe execution
 * across both Windows and Posix environments.
 */

export interface ShellCommandSegment {
  raw: string;
  argv: string[];
}

export interface ShellCommandAnalysis {
  ok: boolean;
  reason?: string;
  segments: ShellCommandSegment[];
}

const DISALLOWED_TOKENS = new Set([">", "<", "`", "\n", "\r", "(", ")"]);

// On Windows, additionally block cmd.exe/PowerShell metacharacters.
// Note: & is handled separately as always-disallowed (background jobs).
// &&, ||, ;, | are handled as segment separators before individual char checks.
const WINDOWS_UNSUPPORTED_TOKENS = new Set([
  "<",
  ">",
  "^",
  "(",
  ")",
  "%",
  "!",
  "`",
  "\n",
  "\r",
]);

// `#` is a comment-start in POSIX shells (bash/sh) but has NO special
// meaning in cmd.exe — which is exactly what approved-shell.ts/pty-shell.ts
// execute through on Windows (`shell: true`). Treating "#" as a comment on
// every platform meant the analyzer silently discarded everything after it
// — including disallowed tokens — while cmd.exe went on to execute the rest
// of the line for real. Concretely: analyzeShellCommand("git status # &
// calc") on Windows used to parse as a single safe "git status" segment
// (everything from "#" onward dropped), while cmd.exe actually ran
// `git status` followed by `& calc`. Gating this behind !isWindows makes the
// analyzer's view of the string match what the real interpreter does: on
// Windows "#" is just a literal character, so the trailing " & calc" is
// still visible to the parser and gets rejected as a background job.
// See docs/audits/MAESTROCLAW-ATTACK-PLAN.md §2 item 6 / §3 item 3.
function isShellCommentStart(source: string, index: number, isWindows: boolean): boolean {
  if (isWindows) return false;
  if (source[index] !== "#") return false;
  if (index === 0) return true;
  const prev = source[index - 1];
  return Boolean(prev && /\s/.test(prev));
}

/**
 * Splits a command string into pipeline segments while respecting quotes and escapes.
 *
 * Recognized segment separators: |, &&, || everywhere; ; on POSIX only (cmd.exe
 * doesn't support ";" as a separator — see the isWindows branch below).
 * Single & (background job) is always rejected.
 * Quote-aware: separators inside single/double quotes or escaped do NOT split.
 * Backslashes are preserved in raw segments so splitArgs() can handle escape semantics.
 */
function splitShellPipeline(
  command: string,
  isWindows: boolean,
): { ok: boolean; reason?: string; segments: string[] } {
  const segments: string[] = [];
  let buf = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  const pushPart = () => {
    const trimmed = buf.trim();
    if (trimmed) segments.push(trimmed);
    buf = "";
  };

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    const next = command[i + 1];

    if (escaped) {
      buf += ch;
      escaped = false;
      continue;
    }
    if (!inSingle && !inDouble && ch === "\\") {
      escaped = true;
      buf += ch;
      continue;
    }
    if (inSingle) {
      if (ch === "'") inSingle = false;
      buf += ch;
      continue;
    }
    if (inDouble) {
      if (ch === '"') inDouble = false;
      buf += ch;
      continue;
    }
    if (ch === "'") {
      inSingle = true;
      buf += ch;
      continue;
    }
    if (ch === '"') {
      inDouble = true;
      buf += ch;
      continue;
    }
    if (isShellCommentStart(command, i, isWindows)) break;

    // Two-char segment separators (must be checked before single-char)
    if (ch === "&" && next === "&") {
      pushPart();
      i++;
      continue;
    }
    if (ch === "|" && next === "|") {
      pushPart();
      i++;
      continue;
    }

    // "|" is a real pipe operator in cmd.exe (confirmed empirically) — safe
    // as a segment separator on every platform.
    if (ch === "|") {
      pushPart();
      continue;
    }

    // ";" is NOT a command separator in cmd.exe at all — confirmed
    // empirically: `git status; git status` run through cmd.exe (via
    // shell:true) is passed through as ONE literal command line, so git
    // receives "status;" as its first argument and errors immediately,
    // never running the second segment. The analyzer previously treated ";"
    // as a universally-safe separator (same class of bug as the "#" fix
    // above: the parser's model of the string didn't match what the real
    // interpreter does with it) — here the failure mode happens to be
    // "silently broken" rather than "silently unsafe" (cmd.exe never
    // re-dispatches on ";", so there's no way for a second program to
    // execute), but a security-relevant "kernel validated 2 safe segments"
    // claim that doesn't match reality is still worth rejecting outright
    // rather than leaving as a confusing runtime failure. "&&" is the
    // Windows-supported equivalent and is unaffected by this change.
    // See docs/audits/MAESTROCLAW-ATTACK-PLAN.md §7 for the fuller writeup.
    if (ch === ";") {
      if (isWindows) {
        return {
          ok: false,
          reason: "unsupported shell token: ; (not a command separator in cmd.exe — use && instead)",
          segments: [],
        };
      }
      pushPart();
      continue;
    }

    // Single & (background job) is always disallowed
    if (ch === "&") {
      return {
        ok: false,
        reason: "unsupported shell token: & (background jobs are not allowed)",
        segments: [],
      };
    }

    // Platform-specific disallowed tokens
    const disallowed = isWindows ? WINDOWS_UNSUPPORTED_TOKENS : DISALLOWED_TOKENS;
    if (disallowed.has(ch)) {
      return { ok: false, reason: `unsupported shell token: ${ch}`, segments: [] };
    }

    buf += ch;
  }

  if (escaped || inSingle || inDouble) {
    return { ok: false, reason: "unterminated shell quote/escape", segments: [] };
  }

  pushPart();
  return { ok: true, segments };
}

/**
 * Simple arg splitter for posix-style commands.
 */
function splitArgs(command: string): string[] {
  const args: string[] = [];
  let buf = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (escaped) {
      buf += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === "'") {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"') {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && /\s/.test(ch)) {
      if (buf) {
        args.push(buf);
        buf = "";
      }
      continue;
    }
    buf += ch;
  }
  if (buf) args.push(buf);
  return args;
}

/**
 * Main entry point for command analysis.
 * Returns structured segments for each command in a pipeline.
 * The caller is responsible for allowlist-checking each segment's argv[0].
 */
export function analyzeShellCommand(
  command: string,
  platform: string = process.platform,
): ShellCommandAnalysis {
  const isWindows = platform === "win32";
  const trimmed = command.trim();

  if (!trimmed) {
    return { ok: false, reason: "empty command", segments: [] };
  }

  const pipeline = splitShellPipeline(trimmed, isWindows);
  if (!pipeline.ok) {
    return { ok: false, reason: pipeline.reason, segments: [] };
  }

  const segments: ShellCommandSegment[] = pipeline.segments.map((raw) => ({
    raw,
    argv: splitArgs(raw),
  }));

  if (segments.length === 0) {
    return { ok: false, reason: "empty command", segments: [] };
  }

  return { ok: true, segments };
}
