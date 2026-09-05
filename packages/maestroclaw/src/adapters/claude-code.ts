import { spawn } from "node:child_process";
import type { Adapter, AdapterResult, OnLineFn } from "./types.js";
import { LineSplitter } from "../lib/line-splitter.js";
import { AGENT_01_SESSION_INSTRUCTIONS, appendSessionLogEvent } from "../lib/session-log.js";
import { buildChildEnv } from "../lib/child-env.js";

// Model to use for generation. Override via CLAW_CLAUDE_MODEL in .env.
// Defaults to the "sonnet" alias rather than a pinned snapshot ID
// (previously "claude-sonnet-4-6", which was both unverifiable and
// self-contradicted the doc comment two lines below it claiming
// "claude-sonnet-4-5") — an alias survives model refreshes without another
// stale-adapter audit next quarter, at the cost of not pinning an exact
// snapshot. Set CLAW_CLAUDE_MODEL to a specific snapshot ID if pinning
// matters more than staying current for a given deployment.
const PRIMARY_MODEL = process.env.CLAW_CLAUDE_MODEL ?? "sonnet";

// Optional fallback model. Passed to Claude Code's own --fallback-model flag
// (native automatic fallback on overload/rate-limit) rather than the manual
// stdout-scraping retry this adapter used to do — the manual path only
// checked stdout, so it missed rate limits Claude reports on stderr, and it
// re-implemented a feature the CLI now provides natively. See
// docs/audits/MAESTROCLAW-ATTACK-PLAN.md §4 Sprint 1.
const FALLBACK_MODEL = process.env.CLAW_CLAUDE_FALLBACK_MODEL ?? "";

/**
 * Claude Code adapter — runs prompts through the `claude` CLI.
 * Requires Claude Code to be installed and authenticated locally.
 *
 * Model selection (in priority order):
 *   1. CLAW_CLAUDE_MODEL env var (e.g. "claude-sonnet-4-5" or an alias like "sonnet")
 *   2. Native --fallback-model (CLAW_CLAUDE_FALLBACK_MODEL) on overload/rate-limit
 *   3. Hard default: "sonnet" alias
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
    // Rate-limit/overload fallback is now handled natively by Claude Code's
    // own --fallback-model flag (passed inside runWithModel), not by a
    // second manual invocation here.
    return this.runWithModel(prompt, workDir, timeoutMs, PRIMARY_MODEL, onLine);
  }

  async runSession(
    prompt: string,
    workDir: string,
    timeoutMs: number
  ): Promise<AdapterResult> {
    const sessionPrompt = `${prompt}\n${AGENT_01_SESSION_INSTRUCTIONS}`;
    // Session mode: --dangerously-skip-permissions lets Claude write files without prompts.
    // --output-format is omitted — we collect files via dir-diff, not by parsing stdout.
    return this.runSessionWithModel(sessionPrompt, workDir, timeoutMs, PRIMARY_MODEL);
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

    const args = ["--print", "--output-format", "text", "--model", model];
    if (FALLBACK_MODEL) args.push("--fallback-model", FALLBACK_MODEL);

    return new Promise((resolve) => {
      const proc = spawn(
        "claude",
        args,
        {
          cwd: workDir,
          shell: true,
          env: buildChildEnv(),
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
    // BUG FIX (both source audits flagged this independently): this used to
    // spawn bare `claude --dangerously-skip-permissions --model <m>` with NO
    // --print — that launches Claude Code's interactive TUI, which expects a
    // TTY. Feeding it a closed stdin pipe instead is fragile-to-broken
    // depending on CLI version. -p/--print forces non-interactive
    // single-turn mode: it still reads the prompt from stdin, still executes
    // tool calls (file writes, since --dangerously-skip-permissions is set)
    // in workDir, and exits after the final response instead of waiting on
    // a terminal. --output-format stays omitted — session mode collects
    // files via dir-diff, not by parsing stdout.
    appendSessionLogEvent(workDir, {
      type: "tool_use",
      adapter: this.name,
      mode: "session",
      content: `Starting claude_code session run with model ${model}`,
      metadata: { command: "claude --print --dangerously-skip-permissions", model },
    });

    const args = ["--print", "--dangerously-skip-permissions", "--model", model];
    if (FALLBACK_MODEL) args.push("--fallback-model", FALLBACK_MODEL);

    return new Promise((resolve) => {
      const proc = spawn(
        "claude",
        args,
        {
          cwd: workDir,
          shell: true,
          env: buildChildEnv(),
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
