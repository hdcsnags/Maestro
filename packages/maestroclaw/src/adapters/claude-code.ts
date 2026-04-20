import { spawn } from "node:child_process";
import type { Adapter, AdapterResult } from "./types.js";

/**
 * Claude Code adapter — runs prompts through the `claude` CLI.
 * Requires Claude Code to be installed and authenticated locally.
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
    console.log(`  🤖 claude_code: running in ${workDir}`);

    return new Promise((resolve) => {
      const proc = spawn(
        "claude",
        ["--print", "--output-format", "text"],
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

      // Pipe the prompt via stdin to avoid CLI argument length limits
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
