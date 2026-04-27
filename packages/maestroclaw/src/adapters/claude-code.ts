import { spawn } from "node:child_process";
import type { Adapter, AdapterResult } from "./types.js";

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
    timeoutMs: number
  ): Promise<AdapterResult> {
    const result = await this.runWithModel(prompt, workDir, timeoutMs, PRIMARY_MODEL);

    if (!result.success && isRateLimited(result.output ?? "") && FALLBACK_MODEL) {
      console.log(`  ⚡ Rate limit on ${PRIMARY_MODEL} — retrying with fallback ${FALLBACK_MODEL}`);
      return this.runWithModel(prompt, workDir, timeoutMs, FALLBACK_MODEL);
    }

    return result;
  }

  async runSession(
    prompt: string,
    workDir: string,
    timeoutMs: number
  ): Promise<AdapterResult> {
    // Session mode: --dangerously-skip-permissions lets Claude write files without prompts.
    // --output-format is omitted — we collect files via dir-diff, not by parsing stdout.
    const result = await this.runSessionWithModel(prompt, workDir, timeoutMs, PRIMARY_MODEL);

    if (!result.success && isRateLimited(result.output ?? "") && FALLBACK_MODEL) {
      console.log(`  ⚡ Rate limit on ${PRIMARY_MODEL} (session) — retrying with fallback ${FALLBACK_MODEL}`);
      return this.runSessionWithModel(prompt, workDir, timeoutMs, FALLBACK_MODEL);
    }

    return result;
  }

  private runWithModel(
    prompt: string,
    workDir: string,
    timeoutMs: number,
    model: string,
  ): Promise<AdapterResult> {
    console.log(`  🤖 claude_code: running in ${workDir} (model: ${model})`);

    return new Promise((resolve) => {
      const proc = spawn(
        "claude",
        ["--print", "--output-format", "text", "--model", model],
        {
          cwd: workDir,
          timeout: timeoutMs,
          shell: true,
          env: { ...process.env },
        }
      );

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
      proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

      proc.stdin.write(prompt);
      proc.stdin.end();

      proc.on("close", (code) => {
        resolve({
          success: code === 0,
          output: stdout,
          ...(stderr ? { error: stderr } : {}),
        });
      });

      proc.on("error", (err) => {
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

    return new Promise((resolve) => {
      // --dangerously-skip-permissions: Claude writes files without asking for approval.
      // --output-format omitted: executor collects files via dir-diff, not stdout parsing.
      const proc = spawn(
        "claude",
        ["--print", "--dangerously-skip-permissions", "--model", model],
        {
          cwd: workDir,
          timeout: timeoutMs,
          shell: true,
          env: { ...process.env },
        }
      );

      let stdout = "";
      let stderr = "";

      proc.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
      proc.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

      proc.stdin.write(prompt);
      proc.stdin.end();

      proc.on("close", (code) => {
        resolve({
          success: code === 0,
          output: stdout,
          ...(stderr ? { error: stderr } : {}),
        });
      });

      proc.on("error", (err) => {
        resolve({
          success: false,
          output: stdout,
          error: err.message,
        });
      });
    });
  }
}
