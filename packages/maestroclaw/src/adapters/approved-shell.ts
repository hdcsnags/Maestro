import { exec } from "child_process";
import type { Adapter, AdapterResult } from "./types.js";

/**
 * Approved Shell adapter — runs shell commands in a controlled subprocess.
 * Used for trusted and user-approved commands (git, npm, ls, etc.).
 * 
 * Security: The frontend classifies commands as trusted/approval-required
 * before they reach this adapter. This adapter just executes what it's given.
 */
export class ApprovedShellAdapter implements Adapter {
  name = "approved_shell";

  async check(): Promise<boolean> {
    return true;
  }

  async run(
    prompt: string,
    workDir: string,
    timeoutMs: number,
  ): Promise<AdapterResult> {
    const command = prompt.trim();
    if (!command) {
      return { success: false, output: "", error: "Empty command" };
    }

    console.log(`  🐚 approved_shell: running "${command}" in ${workDir}`);

    return new Promise((resolve) => {
      const child = exec(command, {
        cwd: workDir,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024, // 1MB output buffer
        env: { ...process.env },
      }, (error, stdout, stderr) => {
        if (error) {
          // Timeout or signal kill
          if (error.killed) {
            resolve({
              success: false,
              output: stdout || "",
              error: `Command timed out after ${timeoutMs}ms`,
            });
            return;
          }

          resolve({
            success: false,
            output: stdout || "",
            error: stderr || error.message,
          });
          return;
        }

        const combined = [stdout, stderr].filter(Boolean).join("\n").trim();
        resolve({
          success: true,
          output: combined || "(no output)",
        });
      });

      // Safety: force kill if still running past timeout + buffer
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, timeoutMs + 5000);
    });
  }
}
