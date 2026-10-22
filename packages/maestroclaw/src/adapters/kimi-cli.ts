import { spawn } from "node:child_process";
import type { Adapter, AdapterResult, OnLineFn } from "./types.js";
import { buildCliArguments, resolveCliInvocation } from "./command.js";
import { LineSplitter } from "../lib/line-splitter.js";
import { AGENT_01_SESSION_INSTRUCTIONS, appendSessionLogEvent } from "../lib/session-log.js";
import { buildChildEnv } from "../lib/child-env.js";

// Model to use for generation. Override via CLAW_KIMI_MODEL in .env.
// Empty string means "don't pass -m, let Kimi decide" — same pattern as
// codex-cli.ts's PRIMARY_MODEL.
const PRIMARY_MODEL = process.env.CLAW_KIMI_MODEL ?? "";

// Kimi is a Python CLI (pip/pipx-installed, not an npm package) — on Windows the
// console defaults to a non-UTF-8 code page, and any Hebrew/Greek/CJK output in a
// prompt or response corrupts or crashes through the Python console layer without
// this. This is the one line in this whole adapter that actually matters — confirmed
// the hard way in a sibling project the same night this adapter was written.
// resolveCliInvocation()'s npm-cmd-shim fast path won't find a pip-installed binary
// (there is no `%APPDATA%\npm\kimi.cmd`), so on Windows this always falls through to
// the PowerShell `Get-Command` resolution path — that's expected, not a bug.
const KIMI_ENV_OVERRIDES = { PYTHONIOENCODING: "utf-8", PYTHONUTF8: "1" };

export interface KimiCliAdapterOptions {
  /** Per-instance model override. Falls back to CLAW_KIMI_MODEL. */
  model?: string;
}

export class KimiCliAdapter implements Adapter {
  name = "kimi_cli";
  private readonly model: string;

  constructor(options: KimiCliAdapterOptions = {}) {
    this.model = options.model ?? PRIMARY_MODEL;
  }

  async check(): Promise<boolean> {
    try {
      const invocation = await resolveCliInvocation("kimi");
      if (!invocation) return false;

      return await new Promise<boolean>((resolve) => {
        const proc = spawn(invocation.command, buildCliArguments(invocation, ["--version"]), {
          shell: false,
          timeout: 5000,
          env: buildChildEnv(KIMI_ENV_OVERRIDES),
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
    return this.executeWithTools(prompt, workDir, timeoutMs, onLine);
  }

  // Session mode: Kimi's print mode already writes files directly via its own
  // tool access when given a full-project prompt. runSession() delegates to
  // run() the same way codex-cli.ts does — the session prompt drives scope,
  // not a CLI flag.
  async runSession(
    prompt: string,
    workDir: string,
    timeoutMs: number,
  ): Promise<AdapterResult> {
    return this.executeWithTools(`${prompt}\n${AGENT_01_SESSION_INSTRUCTIONS}`, workDir, timeoutMs, undefined, "session");
  }

  private async executeWithTools(
    prompt: string,
    workDir: string,
    timeoutMs: number,
    onLine?: OnLineFn,
    mode: "task" | "session" = "task",
  ): Promise<AdapterResult> {
    console.log(`  🤖 kimi_cli: running in ${workDir}`);
    appendSessionLogEvent(workDir, {
      type: "tool_use",
      adapter: this.name,
      mode,
      content: `Starting kimi_cli ${mode} run`,
      metadata: { command: "kimi --print", model: this.model || "(kimi default)" },
    });

    const invocation = await resolveCliInvocation("kimi");
    if (!invocation) {
      appendSessionLogEvent(workDir, {
        type: "error",
        adapter: this.name,
        mode,
        success: false,
        content: "Kimi CLI is not available on this machine",
      });
      return {
        success: false,
        output: "",
        error: "Kimi CLI is not available on this machine",
      };
    }

    return await new Promise<AdapterResult>((resolve) => {
      let stdout = "";
      let stderr = "";
      let settled = false;
      const stdoutSplitter = onLine ? new LineSplitter() : null;
      const stderrSplitter = onLine ? new LineSplitter() : null;

      const finish = (result: AdapterResult) => {
        if (settled) return;
        settled = true;
        resolve(result);
      };

      // --print + --output-format text + --final-message-only is the documented,
      // spelled-out equivalent of Kimi's undocumented `--quiet` shorthand
      // (confirmed against a real Kimi install the same night this was written).
      // Spelled out explicitly rather than relying on an undocumented alias
      // surviving a future Kimi release.
      const kimiArgs = [
        "--print",
        "--output-format",
        "text",
        "--final-message-only",
      ];
      if (this.model) {
        kimiArgs.push("-m", this.model);
      }

      const proc = spawn(
        invocation.command,
        buildCliArguments(invocation, kimiArgs),
        {
          cwd: workDir,
          timeout: timeoutMs,
          shell: false,
          env: buildChildEnv(KIMI_ENV_OVERRIDES),
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
              ? `kimi terminated with signal ${signal}`
              : `kimi exited with code ${code ?? "unknown"}`
          );
        appendSessionLogEvent(workDir, {
          type: success ? "complete" : "error",
          adapter: this.name,
          mode,
          success,
          content: signal
            ? `kimi_cli ${mode} terminated with signal ${signal}`
            : `kimi_cli ${mode} exited with code ${code ?? "unknown"}`,
          metadata: { code, signal, stderr: stderr.slice(0, 1000) },
        });

        finish({
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
          content: `kimi_cli ${mode} failed to start: ${err.message}`,
        });
        finish({
          success: false,
          output: stdout.trimEnd(),
          error: err.message,
        });
      });
    });
  }
}
