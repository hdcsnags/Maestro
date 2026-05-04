import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { Adapter, AdapterResult, OnLineFn } from "./types.js";
import { buildCliArguments, resolveCliInvocation } from "./command.js";
import { LineSplitter } from "../lib/line-splitter.js";

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
    return this.executeWithTools(prompt, workDir, timeoutMs);
  }

  private async executeWithTools(
    prompt: string,
    workDir: string,
    timeoutMs: number,
    onLine?: OnLineFn,
  ): Promise<AdapterResult> {
    console.log(`  🤖 copilot_cli: running in ${workDir}`);

    const promptFileName = `.maestroclaw-copilot-prompt-${Date.now()}.md`;
    const promptFilePath = join(workDir, promptFileName);
    writeFileSync(promptFilePath, prompt, "utf-8");
    const invocation = await resolveCliInvocation("copilot");
    if (!invocation) {
      try {
        rmSync(promptFilePath, { force: true });
      } catch {
        // Best-effort cleanup only.
      }
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

        finish({
          success,
          output: stdout.trimEnd(),
          ...(error ? { error } : {}),
        });
      });

      proc.on("error", (err) => {
        finish({
          success: false,
          output: stdout.trimEnd(),
          error: err.message,
        });
      });
    });
  }
}
