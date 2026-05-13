import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type SessionLogType =
  | "tool_use"
  | "file_write"
  | "file_read"
  | "test_run"
  | "error"
  | "complete"
  | "give_up";

export interface SessionLogEntry {
  type: SessionLogType;
  ts: string;
  content: string;
  adapter?: string;
  mode?: "task" | "session" | "iteration" | "verification";
  step_number?: number;
  path?: string;
  paths?: string[];
  success?: boolean;
  metadata?: Record<string, unknown>;
}

export interface BuildSessionLog {
  built: string[];
  decisions: string[];
  didnt_work: string[];
  next_steps: string[];
}

export const SESSION_LOG_FILE = "session.log";

export const AGENT_01_SESSION_INSTRUCTIONS = [
  "",
  "AGENT-01 WORKFLOW DISCIPLINE:",
  "- Before editing, inspect/list the lane files, read the 3 most relevant files, and summarize what you learned.",
  "- Do not claim work is done unless you directly verified it or can name why it was not verified.",
  "- End your final response with a compact JSON object named session_log:",
  '  {"session_log":{"built":[],"decisions":[],"didnt_work":[],"next_steps":[]}}',
  "- Put file paths in built[], durable choices in decisions[], failed attempts in didnt_work[], and concrete follow-ups in next_steps[].",
].join("\n");

export function sessionLogPath(workDir: string): string {
  return join(workDir, SESSION_LOG_FILE);
}

export function appendSessionLogEvent(
  workDir: string,
  event: Omit<SessionLogEntry, "ts"> & { ts?: string },
): void {
  const entry: SessionLogEntry = {
    ...event,
    ts: event.ts ?? new Date().toISOString(),
  };

  try {
    const path = sessionLogPath(workDir);
    mkdirSync(dirname(path), { recursive: true });
    appendFileSync(path, `${JSON.stringify(entry)}\n`, "utf-8");
  } catch {
    // Session logging is diagnostic only. Never fail an executor job because
    // the local log could not be written.
  }
}

export function readSessionLog(workDir: string, maxEntries = 200): SessionLogEntry[] {
  const path = sessionLogPath(workDir);
  if (!existsSync(path)) return [];

  try {
    return readFileSync(path, "utf-8")
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-maxEntries)
      .flatMap((line) => {
        try {
          const entry = JSON.parse(line) as SessionLogEntry;
          return isSessionLogEntry(entry) ? [entry] : [];
        } catch {
          return []; // skip malformed lines, not the entire log
        }
      });
  } catch {
    return [];
  }
}

export function summarizeSessionLog(entries: SessionLogEntry[], maxRecent = 8): string {
  if (entries.length === 0) return "No structured session_log events recorded.";

  const counts = entries.reduce<Record<SessionLogType, number>>((acc, entry) => {
    acc[entry.type] = (acc[entry.type] ?? 0) + 1;
    return acc;
  }, {
    tool_use: 0,
    file_write: 0,
    file_read: 0,
    test_run: 0,
    error: 0,
    complete: 0,
    give_up: 0,
  });

  const countSummary = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => `${type}:${count}`)
    .join(", ");

  const recent = entries
    .slice(-maxRecent)
    .map((entry) => {
      const label = entry.path ?? (entry.paths && entry.paths.length > 0 ? entry.paths.slice(0, 3).join(", ") : "");
      return `- ${entry.type}${label ? ` (${label})` : ""}: ${entry.content}`;
    })
    .join("\n");

  return `Counts: ${countSummary}\nRecent:\n${recent}`;
}

export function extractBuildSessionLog(text: string | undefined): BuildSessionLog | null {
  if (!text) return null;

  // Use lastIndexOf — AGENT_01_SESSION_INSTRUCTIONS echoes the "session_log" key in
  // the prompt text; using first-match would hijack the parse on that echo.
  const keyIndex = text.lastIndexOf("\"session_log\"");
  if (keyIndex < 0) return null;

  const objectStart = text.indexOf("{", keyIndex + "\"session_log\"".length);
  if (objectStart < 0) return null;

  const objectText = extractBalancedObject(text, objectStart);
  if (!objectText) return null;

  try {
    return normalizeBuildSessionLog(JSON.parse(objectText));
  } catch {
    return null;
  }
}

export function mergeBuildSessionLogs(
  logs: Array<BuildSessionLog | null | undefined>,
): BuildSessionLog | null {
  const valid = logs.filter((log): log is BuildSessionLog => Boolean(log));
  if (valid.length === 0) return null;

  return {
    built: uniqueFlat(valid.map((log) => log.built)),
    decisions: uniqueFlat(valid.map((log) => log.decisions)),
    didnt_work: uniqueFlat(valid.map((log) => log.didnt_work)),
    next_steps: uniqueFlat(valid.map((log) => log.next_steps)),
  };
}

export function appendBuildSessionLogSummary(
  summary: string,
  sessionLog: BuildSessionLog | null,
  eventSummary: string,
): string {
  const sections = [summary];

  if (sessionLog) {
    sections.push([
      "session_log:",
      JSON.stringify({ session_log: sessionLog }, null, 2),
    ].join("\n"));
  }

  sections.push(["local_session_log:", eventSummary].join("\n"));
  return sections.join("\n\n").slice(0, 10_000);
}

function isSessionLogEntry(value: SessionLogEntry): boolean {
  return Boolean(value)
    && typeof value.type === "string"
    && typeof value.ts === "string"
    && typeof value.content === "string";
}

function normalizeBuildSessionLog(value: unknown): BuildSessionLog | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;

  return {
    built: stringArray(raw.built),
    decisions: stringArray(raw.decisions),
    didnt_work: stringArray(raw.didnt_work),
    next_steps: stringArray(raw.next_steps),
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").slice(0, 20)
    : [];
}

function uniqueFlat(values: string[][]): string[] {
  return [...new Set(values.flat().map((value) => value.trim()).filter(Boolean))].slice(0, 30);
}

function extractBalancedObject(text: string, objectStart: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = objectStart; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(objectStart, index + 1);
    }
  }

  return null;
}
