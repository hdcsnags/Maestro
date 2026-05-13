import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { Adapter, AdapterResult, OnLineFn } from "./types.js";
import { buildCliArguments, resolveCliInvocation } from "./command.js";
import { LineSplitter } from "../lib/line-splitter.js";
import { AGENT_01_SESSION_INSTRUCTIONS, appendSessionLogEvent } from "../lib/session-log.js";

function buildWrapperPrompt(promptFileName: string): string {
  return `Read the file named ${promptFileName} in the current workspace and follow its instructions exactly. Use the current workspace as your repository context if needed. Return only your final answer. Do not add commentary about reading the prompt file.`;
}

export class CopilotCliAdapter implements Adapter {
  name = "copilot_cli";

  async check(): Promise<boolean> {
    try {
      const invocation = await resolveCliInvocation("copilot");
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

  // Session mode: Copilot already writes files via --allow-all-tools --no-ask-user.
  // runSession() delegates to the same execution path — the session prompt is what
  // instructs Copilot to write a whole scope rather than return JSON for one file.
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
    console.log(`  🤖 copilot_cli: running in ${workDir}`);
    appendSessionLogEvent(workDir, {
      type: "tool_use",
      adapter: this.name,
      mode,
      content: `Starting copilot_cli ${mode} run`,
      metadata: { command: "copilot -p", prompt_file: true },
    });

    const promptFileName = `.maestroclaw-copilot-prompt-${Date.now()}.md`;
    const promptFilePath = join(workDir, promptFileName);
    writeFileSync(promptFilePath, prompt, "utf-8");
    appendSessionLogEvent(workDir, {
      type: "file_write",
      adapter: this.name,
      mode,
      path: promptFileName,
      content: "Wrote temporary Copilot prompt file",
    });
    const invocation = await resolveCliInvocation("copilot");
    if (!invocation) {
      try {
        rmSync(promptFilePath, { force: true });
      } catch {
        // Best-effort cleanup only.
      }
      appendSessionLogEvent(workDir, {
        type: "error",
        adapter: this.name,
        mode,
        success: false,
        content: "GitHub Copilot CLI is not available on this machine",
      });
      return {
        success: false,
        output: "",
        error: "GitHub Copilot CLI is not available on this machine",
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
          rmSync(promptFilePath, { force: true });
        } catch {
          // Best-effort cleanup only.
        }
        resolve(result);
      };

      const proc = spawn(
        invocation.command,
        buildCliArguments(invocation, [
          "-p",
          buildWrapperPrompt(promptFileName),
          "--allow-all-tools",
          "--no-ask-user",
          "--add-dir",
          ".", // cwd is already workDir; using "." avoids Windows path-doubling when workDir was relative
          "--output-format",
          "text",
          "--silent",
          "--no-color",
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
            ? `copilot terminated with signal ${signal}`
            : code === 0
              ? undefined
              : `copilot exited with code ${code ?? "unknown"}`
        );
        appendSessionLogEvent(workDir, {
          type: success ? "complete" : "error",
          adapter: this.name,
          mode,
          success,
          content: signal
            ? `copilot_cli ${mode} terminated with signal ${signal}`
            : `copilot_cli ${mode} exited with code ${code ?? "unknown"}`,
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
          content: `copilot_cli ${mode} failed to start: ${err.message}`,
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
