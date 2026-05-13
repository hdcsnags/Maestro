import { spawn } from "node:child_process";
import type { Adapter, AdapterResult, OnLineFn } from "./types.js";
import { LineSplitter } from "../lib/line-splitter.js";
import { AGENT_01_SESSION_INSTRUCTIONS, appendSessionLogEvent } from "../lib/session-log.js";

// Model to use for generation. Override via CLAW_CLAUDE_MODEL in .env.
// Defaults to Sonnet to avoid burning Opus quota on bulk builds.
const PRIMARY_MODEL = process.env.CLAW_CLAUDE_MODEL ?? "claude-sonnet-4-6";

// Optional fallback model. When set, a rate-limited primary run automatically
// retries with this model instead of failing the whole job.
const FALLBACK_MODEL = process.env.CLAW_CLAUDE_FALLBACK_MODEL ?? "";

// Substrings in stdout that indicate the CLI hit a usage/rate limit.
const RATE_LIMIT_SIGNALS = [
  "you've hit your limit",
  "rate limit",
  "quota exceeded",
  "too many requests",
  "usage limit",
];

function isRateLimited(output: string): boolean {
  const lower = output.toLowerCase();
  return RATE_LIMIT_SIGNALS.some((s) => lower.includes(s));
}

/**
 * Claude Code adapter — runs prompts through the `claude` CLI.
 * Requires Claude Code to be installed and authenticated locally.
 *
 * Model selection (in priority order):
 *   1. CLAW_CLAUDE_MODEL env var (e.g. "claude-sonnet-4-5")
 *   2. Falls back to CLAW_CLAUDE_FALLBACK_MODEL on rate-limit failures
 *   3. Hard default: claude-sonnet-4-5
 */
export class ClaudeCodeAdapter implements Adapter {
  name = "claude_code";

  async check(): Promise<boolean> {
    try {
      const result = await new Promise<boolean>((resolve) => {
        const proc = spawn("claude", ["--version"], { shell: true, timeout: 5000 });
        proc.on("close", (code) => resolve(code === 0));
        proc.on("error", () => resolve(false));
      });
      return result;
    } catch {
      return false;
    }
  }

  async run(
    prompt: string,
    workDir: string,
    timeoutMs: number,
    onLine?: OnLineFn,
  ): Promise<AdapterResult> {
    const result = await this.runWithModel(prompt, workDir, timeoutMs, PRIMARY_MODEL, onLine);

    if (!result.success && isRateLimited(result.output ?? "") && FALLBACK_MODEL) {
      console.log(`  ⚡ Rate limit on ${PRIMARY_MODEL} — retrying with fallback ${FALLBACK_MODEL}`);
      return this.runWithModel(prompt, workDir, timeoutMs, FALLBACK_MODEL, onLine);
    }

    return result;
  }

  async runSession(
    prompt: string,
    workDir: string,
    timeoutMs: number
  ): Promise<AdapterResult> {
    const sessionPrompt = `${prompt}\n${AGENT_01_SESSION_INSTRUCTIONS}`;
    // Session mode: --dangerously-skip-permissions lets Claude write files without prompts.
    // --output-format is omitted — we collect files via dir-diff, not by parsing stdout.
    const result = await this.runSessionWithModel(sessionPrompt, workDir, timeoutMs, PRIMARY_MODEL);

    if (!result.success && isRateLimited(result.output ?? "") && FALLBACK_MODEL) {
      console.log(`  ⚡ Rate limit on ${PRIMARY_MODEL} (session) — retrying with fallback ${FALLBACK_MODEL}`);
      return this.runSessionWithModel(sessionPrompt, workDir, timeoutMs, FALLBACK_MODEL);
    }

    return result;
  }

  private runWithModel(
    prompt: string,
    workDir: string,
    timeoutMs: number,
    model: string,
    onLine?: OnLineFn,
  ): Promise<AdapterResult> {
    console.log(`  🤖 claude_code: running in ${workDir} (model: ${model})`);
    appendSessionLogEvent(workDir, {
      type: "tool_use",
      adapter: this.name,
      mode: "task",
      content: `Starting claude_code task run with model ${model}`,
      metadata: { command: "claude --print", model },
    });

    return new Promise((resolve) => {
      const proc = spawn(
        "claude",
        ["--print", "--output-format", "text", "--model", model],
        {
          cwd: workDir,
          shell: true,
          env: { ...process.env },
        }
      );

      let stdout = "";
      let stderr = "";
      let timedOut = false;
      const stdoutSplitter = onLine ? new LineSplitter() : null;
      const stderrSplitter = onLine ? new LineSplitter() : null;

      // Manual timeout — spawn's built-in timeout with shell:true doesn't kill
      // the claude subprocess on Windows (kills cmd.exe but leaves claude.exe orphaned).
      const killTimer = setTimeout(() => {
        timedOut = true;
        try { proc.kill(); } catch { /* best effort */ }
        // Windows: kill the whole process tree so claude.exe doesn't linger
        if (process.platform === "win32" && proc.pid) {
          try {
            spawn("taskkill", ["/F", "/T", "/PID", String(proc.pid)], { shell: false }).unref();
          } catch { /* best effort */ }
        }
      }, timeoutMs);

      proc.stdout.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        if (onLine && stdoutSplitter) stdoutSplitter.push(chunk, (line) => onLine("stdout", line));
      });
      proc.stderr.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        if (onLine && stderrSplitter) stderrSplitter.push(chunk, (line) => onLine("stderr", line));
      });

      proc.stdin.write(prompt);
      proc.stdin.end();

      proc.on("close", (code) => {
        clearTimeout(killTimer);
        if (onLine) {
          stdoutSplitter?.drain((line) => onLine("stdout", line));
          stderrSplitter?.drain((line) => onLine("stderr", line));
        }
        appendSessionLogEvent(workDir, {
          type: code === 0 && !timedOut ? "complete" : "error",
          adapter: this.name,
          mode: "task",
          success: code === 0 && !timedOut,
          content: timedOut
            ? `claude_code task timed out after ${timeoutMs}ms`
            : `claude_code task exited with code ${code ?? "unknown"}`,
          metadata: { code, model, stderr: stderr.slice(0, 1000) },
        });
        resolve({
          success: code === 0 && !timedOut,
          output: stdout,
          ...(stderr ? { error: stderr } : {}),
        });
      });

      proc.on("error", (err) => {
        clearTimeout(killTimer);
        appendSessionLogEvent(workDir, {
          type: "error",
          adapter: this.name,
          mode: "task",
          success: false,
          content: `claude_code task failed to start: ${err.message}`,
          metadata: { model },
        });
        resolve({
          success: false,
          output: stdout,
          error: err.message,
        });
      });
    });
  }

  private runSessionWithModel(
    prompt: string,
    workDir: string,
    timeoutMs: number,
    model: string,
  ): Promise<AdapterResult> {
    console.log(`  🤖 claude_code [session]: running in ${workDir} (model: ${model})`);
    appendSessionLogEvent(workDir, {
      type: "tool_use",
      adapter: this.name,
      mode: "session",
      content: `Starting claude_code session run with model ${model}`,
      metadata: { command: "claude --dangerously-skip-permissions", model },
    });

    return new Promise((resolve) => {
      const proc = spawn(
        "claude",
        ["--dangerously-skip-permissions", "--model", model],
        {
          cwd: workDir,
          shell: true,
          env: { ...process.env },
        }
      );

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const killTimer = setTimeout(() => {
        timedOut = true;
        try { proc.kill(); } catch { /* best effort */ }
        if (process.platform === "win32" && proc.pid) {
          try {
            spawn("taskkill", ["/F", "/T", "/PID", String(proc.pid)], { shell: false }).unref();
          } catch { /* best effort */ }
        }
      }, timeoutMs);

      proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
      proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

      proc.stdin.write(prompt);
      proc.stdin.end();

      proc.on("close", (code) => {
        clearTimeout(killTimer);
        appendSessionLogEvent(workDir, {
          type: code === 0 && !timedOut ? "complete" : "error",
          adapter: this.name,
          mode: "session",
          success: code === 0 && !timedOut,
          content: timedOut
            ? `claude_code session timed out after ${timeoutMs}ms`
            : `claude_code session exited with code ${code ?? "unknown"}`,
          metadata: { code, model, stderr: stderr.slice(0, 1000) },
        });
        resolve({
          success: code === 0 && !timedOut,
          output: stdout,
          ...(stderr ? { error: stderr } : {}),
        });
      });

      proc.on("error", (err) => {
        clearTimeout(killTimer);
        appendSessionLogEvent(workDir, {
          type: "error",
          adapter: this.name,
          mode: "session",
          success: false,
          content: `claude_code session failed to start: ${err.message}`,
          metadata: { model },
        });
        resolve({
          success: false,
          output: stdout,
          error: err.message,
        });
      });
    });
  }
}
