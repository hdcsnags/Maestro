import { spawn } from "node:child_process";
import type { Adapter, AdapterResult, OnLineFn } from "./types.js";
import { LineSplitter } from "../lib/line-splitter.js";

// Model to use for generation. Override via CLAW_GEMINI_MODEL in .env.
const PRIMARY_MODEL = process.env.CLAW_GEMINI_MODEL ?? "gemini-2.5-pro";

// Fallback model on rate-limit. Gemini Flash is significantly cheaper.
const FALLBACK_MODEL = process.env.CLAW_GEMINI_FALLBACK_MODEL ?? "gemini-2.5-flash";

// Gemini-specific rate limit / quota signals in stdout/stderr.
const RATE_LIMIT_SIGNALS = [
  "resource exhausted",
  "quota exceeded",
  "rate limit",
  "too many requests",
  "you've hit your limit",
  "quotaexceeded",
];

function isRateLimited(output: string): boolean {
  const lower = output.toLowerCase();
  return RATE_LIMIT_SIGNALS.some((s) => lower.includes(s));
}

/**
 * Gemini CLI adapter — runs prompts through the `gemini` CLI.
 * Requires the Google Gemini CLI to be installed and authenticated locally.
 * Install: npm install -g @google/gemini-cli
 *
 * Model selection (in priority order):
 *   1. CLAW_GEMINI_MODEL env var
 *   2. Falls back to CLAW_GEMINI_FALLBACK_MODEL on rate-limit failures
 *   3. Hard default: gemini-2.5-pro → gemini-2.5-flash
 */
export class GeminiCliAdapter implements Adapter {
  name = "gemini_cli";

  async check(): Promise<boolean> {
    try {
      return await new Promise<boolean>((resolve) => {
        const proc = spawn("gemini", ["--version"], {
          shell: true,
          timeout: 5000,
        });
        proc.on("close", (code) => resolve(code === 0));
        proc.on("error", () => resolve(false));
      });
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

    if (!result.success && isRateLimited((result.output ?? "") + (result.error ?? "")) && FALLBACK_MODEL) {
      console.log(`  ⚡ Rate limit on ${PRIMARY_MODEL} — retrying with fallback ${FALLBACK_MODEL}`);
      return this.runWithModel(prompt, workDir, timeoutMs, FALLBACK_MODEL, onLine);
    }

    return result;
  }

  // Session mode: Gemini --yolo already grants full file write access.
  // runSession() delegates to run() — the session prompt drives the different behaviour.
  async runSession(
    prompt: string,
    workDir: string,
    timeoutMs: number,
  ): Promise<AdapterResult> {
    return this.run(prompt, workDir, timeoutMs);
  }

  private runWithModel(
    prompt: string,
    workDir: string,
    timeoutMs: number,
    model: string,
    onLine?: OnLineFn,
  ): Promise<AdapterResult> {
    console.log(`  🤖 gemini_cli: running in ${workDir} (model: ${model})`);

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      const stdoutSplitter = onLine ? new LineSplitter() : null;
      const stderrSplitter = onLine ? new LineSplitter() : null;

      // Gemini CLI detects a non-TTY stdin and processes it as the prompt.
      // Pipe via stdin to avoid Windows command-line arg length limits.
      const proc = spawn(
        "gemini",
        ["--model", model, "--yolo"],
        {
          cwd: workDir,
          timeout: timeoutMs,
          shell: true,
          env: { ...process.env },
        },
      );

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

      proc.on("close", (code, signal) => {
        if (onLine) {
          stdoutSplitter?.drain((line) => onLine("stdout", line));
          stderrSplitter?.drain((line) => onLine("stderr", line));
        }
        const success = code === 0;
        const error = success
          ? undefined
          : stderr.trim() || (
            signal
              ? `gemini terminated with signal ${signal}`
              : `gemini exited with code ${code ?? "unknown"}`
          );

        resolve({
          success,
          output: stdout.trimEnd(),
          ...(error ? { error } : {}),
        });
      });

      proc.on("error", (err) => {
        resolve({
          success: false,
          output: stdout.trimEnd(),
          error: err.message,
        });
      });
    });
  }
}
