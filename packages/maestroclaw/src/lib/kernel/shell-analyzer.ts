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
const WINDOWS_UNSUPPORTED_TOKENS = new Set([
  "&",
  "|",
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

function isShellCommentStart(source: string, index: number): boolean {
  if (source[index] !== "#") return false;
  if (index === 0) return true;
  const prev = source[index - 1];
  return Boolean(prev && /\s/.test(prev));
}

/**
 * Splits a command string into pipeline segments while respecting quotes and escapes.
 */
function splitShellPipeline(command: string): { ok: boolean; reason?: string; segments: string[] } {
  const segments: string[] = [];
  let buf = "";
  let inSingle = false;
  let inDouble = false;
  let escaped = false;
  let emptySegment = false;

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
    if (isShellCommentStart(command, i)) break;

    if (ch === "|") {
      emptySegment = true;
      pushPart();
      continue;
    }

    if (DISALLOWED_TOKENS.has(ch)) {
      return { ok: false, reason: `unsupported shell token: ${ch}`, segments: [] };
    }

    buf += ch;
    emptySegment = false;
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
 */
export function analyzeShellCommand(command: string, platform: string = process.platform): ShellCommandAnalysis {
  const isWindows = platform === "win32";
  const trimmed = command.trim();
  
  if (!trimmed) {
    return { ok: false, reason: "empty command", segments: [] };
  }

  const pipeline = splitShellPipeline(trimmed);
  if (!pipeline.ok) {
    return { ok: false, reason: pipeline.reason, segments: [] };
  }

  const segments: ShellCommandSegment[] = pipeline.segments.map(raw => ({
    raw,
    argv: splitArgs(raw)
  }));

  if (segments.length === 0) {
    return { ok: false, reason: "empty command", segments: [] };
  }

  return { ok: true, segments };
}
