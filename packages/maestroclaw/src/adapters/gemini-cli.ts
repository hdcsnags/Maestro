import { spawn } from "node:child_process";
import type { Adapter, AdapterResult, OnLineFn } from "./types.js";
import { buildCliArguments, resolveCliInvocation } from "./command.js";
import { LineSplitter } from "../lib/line-splitter.js";
import { AGENT_01_SESSION_INSTRUCTIONS, appendSessionLogEvent } from "../lib/session-log.js";
import { buildChildEnv } from "../lib/child-env.js";

// Model to use for generation. Override via CLAW_GEMINI_MODEL in .env.
// gemini-2.5-pro/flash predate the Gemini 3 family — kept as the conservative
// default rather than silently switching everyone's model out from under
// them; set CLAW_GEMINI_MODEL explicitly to move to a newer model family.
const PRIMARY_MODEL = process.env.CLAW_GEMINI_MODEL ?? "gemini-2.5-pro";

// Fallback model on rate-limit. Gemini Flash is significantly cheaper.
const FALLBACK_MODEL = process.env.CLAW_GEMINI_FALLBACK_MODEL ?? "gemini-2.5-flash";

// Opt-in native sandbox. Off by default to preserve existing behavior for
// anyone already relying on unsandboxed --yolo; per the architectural
// decision in docs/audits/MAESTROCLAW-ATTACK-PLAN.md §1, delegating FS/
// network isolation to each CLI's own sandbox (rather than MaestroClaw
// reimplementing one) is the intended direction, so set CLAW_GEMINI_SANDBOX=1
// to opt in now.
const USE_SANDBOX = (process.env.CLAW_GEMINI_SANDBOX ?? "").toLowerCase() === "1"
  || (process.env.CLAW_GEMINI_SANDBOX ?? "").toLowerCase() === "true";

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
      const invocation = await resolveCliInvocation("gemini");
      if (!invocation) return false;

      return await new Promise<boolean>((resolve) => {
        const proc = spawn(invocation.command, buildCliArguments(invocation, ["--version"]), {
          shell: false,
          timeout: 5000,
          env: buildChildEnv(),
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

  // Session mode: Gemini's yolo approval mode already grants full file write access.
  // runSession() delegates to run() — the session prompt drives the different behaviour.
  async runSession(
    prompt: string,
    workDir: string,
    timeoutMs: number,
  ): Promise<AdapterResult> {
    const sessionPrompt = `${prompt}\n${AGENT_01_SESSION_INSTRUCTIONS}`;
    const result = await this.runWithModel(sessionPrompt, workDir, timeoutMs, PRIMARY_MODEL, undefined, "session");

    if (!result.success && isRateLimited((result.output ?? "") + (result.error ?? "")) && FALLBACK_MODEL) {
      console.log(`  ⚡ Rate limit on ${PRIMARY_MODEL} (session) — retrying with fallback ${FALLBACK_MODEL}`);
      return this.runWithModel(sessionPrompt, workDir, timeoutMs, FALLBACK_MODEL, undefined, "session");
    }

    return result;
  }

  private async runWithModel(
    prompt: string,
    workDir: string,
    timeoutMs: number,
    model: string,
    onLine?: OnLineFn,
    mode: "task" | "session" = "task",
  ): Promise<AdapterResult> {
    console.log(`  🤖 gemini_cli: running in ${workDir} (model: ${model})`);

    // --yolo is Gemini's deprecated spelling; current CLI is
    // --approval-mode=yolo. See docs/audits/MAESTROCLAW-ATTACK-PLAN.md §1 —
    // this is one of the corrections weighted from Sol's citation-backed
    // research over the original (Fable) assumption that --yolo was current.
    const geminiArgs = ["--model", model, "--approval-mode=yolo"];
    if (USE_SANDBOX) geminiArgs.push("--sandbox");

    appendSessionLogEvent(workDir, {
      type: "tool_use",
      adapter: this.name,
      mode,
      content: `Starting gemini_cli ${mode} run with model ${model}`,
      metadata: { command: `gemini ${geminiArgs.join(" ")}`, model, sandbox: USE_SANDBOX },
    });

    const invocation = await resolveCliInvocation("gemini");
    if (!invocation) {
      appendSessionLogEvent(workDir, {
        type: "error",
        adapter: this.name,
        mode,
        success: false,
        content: "Gemini CLI is not available on this machine",
      });
      return { success: false, output: "", error: "Gemini CLI is not available on this machine" };
    }

    return new Promise((resolve) => {
      let stdout = "";
      let stderr = "";
      const stdoutSplitter = onLine ? new LineSplitter() : null;
      const stderrSplitter = onLine ? new LineSplitter() : null;

      // Gemini CLI detects a non-TTY stdin and processes it as the prompt.
      // Pipe via stdin to avoid Windows command-line arg length limits.
      // Resolved via resolveCliInvocation + shell:false — same pattern as
      // codex-cli.ts/copilot-cli.ts. Previously this was the one AI adapter
      // still using spawn("gemini", …, { shell: true }); Windows
      // shell-resolution is the historically fragile path, and Gemini was
      // the outlier still on it.
      const proc = spawn(
        invocation.command,
        buildCliArguments(invocation, geminiArgs),
        {
          cwd: workDir,
          timeout: timeoutMs,
          shell: false,
          env: buildChildEnv(),
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
        appendSessionLogEvent(workDir, {
          type: success ? "complete" : "error",
          adapter: this.name,
          mode,
          success,
          content: signal
            ? `gemini_cli ${mode} terminated with signal ${signal}`
            : `gemini_cli ${mode} exited with code ${code ?? "unknown"}`,
          metadata: { code, signal, model, stderr: stderr.slice(0, 1000) },
        });

        resolve({
          success,
          output: stdout.trimEnd(),
          ...(error ? { error } : {}),
        });
      });

      proc.on("error", (err) => {
        appendSessionLogEvent(workDir, {
          type: "error",
          adapter: this.name,
          mode,
          success: false,
          content: `gemini_cli ${mode} failed to start: ${err.message}`,
          metadata: { model },
        });
        resolve({
          success: false,
          output: stdout.trimEnd(),
          error: err.message,
        });
      });
    });
  }
}
