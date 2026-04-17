import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Adapter, AdapterResult } from "./types.js";

const execFileAsync = promisify(execFile);

/**
 * Claude Code adapter — runs prompts through the `claude` CLI.
 * Requires Claude Code to be installed and authenticated locally.
 */
export class ClaudeCodeAdapter implements Adapter {
  name = "claude_code";

  async check(): Promise<boolean> {
    try {
      await execFileAsync("claude", ["--version"], { timeout: 5000 });
      return true;
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

    try {
      const { stdout, stderr } = await execFileAsync(
        "claude",
        [
          "--print",
          "--output-format", "text",
          prompt,
        ],
        {
          cwd: workDir,
          timeout: timeoutMs,
          maxBuffer: 10 * 1024 * 1024, // 10MB
        }
      );

      return {
        success: true,
        output: stdout,
        ...(stderr ? { error: stderr } : {}),
      };
    } catch (err: unknown) {
      const error = err as { code?: string; killed?: boolean; stdout?: string; stderr?: string; message?: string };

      if (error.killed || error.code === "ETIMEDOUT") {
        return {
          success: false,
          output: error.stdout ?? "",
          error: `Timed out after ${timeoutMs / 1000}s`,
        };
      }

      return {
        success: false,
        output: error.stdout ?? "",
        error: error.stderr ?? error.message ?? "Unknown error",
      };
    }
  }
}
