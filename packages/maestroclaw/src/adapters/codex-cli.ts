import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { Adapter, AdapterResult, OnLineFn } from "./types.js";
import { buildCliArguments, resolveCliInvocation } from "./command.js";
import { LineSplitter } from "../lib/line-splitter.js";
import { AGENT_01_SESSION_INSTRUCTIONS, appendSessionLogEvent } from "../lib/session-log.js";

export class CodexCliAdapter implements Adapter {
  name = "codex_cli";

  async check(): Promise<boolean> {
    try {
      const invocation = await resolveCliInvocation("codex");
      if (!invocation) return false;

      return await new Promise<boolean>((resolve) => {
        const proc = spawn(invocation.command, buildCliArguments(invocation, ["--version"]), {
          shell: false,
          timeout: 5000,
          env: { ...process.env },
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

  // Session mode: Codex --full-auto already writes files directly.
  // runSession() delegates to run() — the session prompt drives scope.
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
    console.log(`  🤖 codex_cli: running in ${workDir}`);
    appendSessionLogEvent(workDir, {
      type: "tool_use",
      adapter: this.name,
      mode,
      content: `Starting codex_cli ${mode} run`,
      metadata: { command: "codex exec", full_auto: true },
    });

    const outputFilePath = join(workDir, `.maestroclaw-codex-last-message-${Date.now()}.txt`);
    const invocation = await resolveCliInvocation("codex");
    if (!invocation) {
      appendSessionLogEvent(workDir, {
        type: "error",
        adapter: this.name,
        mode,
        success: false,
        content: "Codex CLI is not available on this machine",
      });
      return {
        success: false,
        output: "",
        error: "Codex CLI is not available on this machine",
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
        try {
          rmSync(outputFilePath, { force: true });
        } catch {
          // Best-effort cleanup only.
        }
        resolve(result);
      };

      const proc = spawn(
        invocation.command,
        buildCliArguments(invocation, [
          "exec",
          "-",
          "--cd",
          workDir,
          "--skip-git-repo-check",
          "--ephemeral",
          "--full-auto",
          "--color",
          "never",
          "--output-last-message",
          outputFilePath,
        ]),
        {
          cwd: workDir,
          timeout: timeoutMs,
          shell: false,
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
        const finalOutput = existsSync(outputFilePath)
          ? readFileSync(outputFilePath, "utf-8").trimEnd()
          : stdout.trimEnd();
        const success = code === 0;
        const error = success
          ? undefined
          : stderr.trim() || (
          signal
            ? `codex terminated with signal ${signal}`
            : code === 0
              ? undefined
              : `codex exited with code ${code ?? "unknown"}`
        );
        appendSessionLogEvent(workDir, {
          type: success ? "complete" : "error",
          adapter: this.name,
          mode,
          success,
          content: signal
            ? `codex_cli ${mode} terminated with signal ${signal}`
            : `codex_cli ${mode} exited with code ${code ?? "unknown"}`,
          metadata: { code, signal, stderr: stderr.slice(0, 1000) },
        });

        finish({
          success,
          output: finalOutput,
          ...(error ? { error } : {}),
        });
      });

      proc.on("error", (err) => {
        appendSessionLogEvent(workDir, {
          type: "error",
          adapter: this.name,
          mode,
          success: false,
          content: `codex_cli ${mode} failed to start: ${err.message}`,
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
