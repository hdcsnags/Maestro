import { exec } from "child_process";
import type { Adapter, AdapterResult } from "./types.js";
import { analyzeShellCommand } from "../lib/kernel/shell-analyzer.js";
import { getIncidentService } from "../executor.js";

const TRUSTED_COMMANDS = new Set([
  "git", "npm", "ls", "pwd", "cd", "mkdir", "rm", "cp", "mv", "cat",
  "grep", "find", "whoami", "hostname", "ipconfig", "ifconfig", "ping", "nmap"
]);

/**
 * Approved Shell adapter — runs shell commands in a controlled subprocess.
 * Hardened with the ThamosClaw Kernel for deep command analysis.
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

    // 1. Analyze command via Kernel
    const analysis = analyzeShellCommand(command);
    if (!analysis.ok) {
      getIncidentService()?.report({
        severity: "high",
        category: "kernel_violation",
        title: "Kernel Violation (approved_shell)",
        message: analysis.reason ?? "Command failed kernel analysis",
        metadata: { command },
      });
      return { success: false, output: "", error: `Kernel Violation: ${analysis.reason}` };
    }

    // 2. Security: Validate every segment against allowlist
    for (const segment of analysis.segments) {
      const binary = segment.argv[0]?.toLowerCase();
      if (!binary || !TRUSTED_COMMANDS.has(binary)) {
        getIncidentService()?.report({
          severity: "critical",
          category: "security_violation",
          title: "Blocked Binary (approved_shell)",
          message: `Binary '${binary}' is not on the workstation allowlist.`,
          metadata: { command, binary },
        });
        return {
          success: false,
          output: "",
          error: `Security Violation: Binary '${binary}' is not on the workstation allowlist.`,
        };
      }
    }

    console.log(`  🐚 approved_shell: validated & running "${command}" in ${workDir}`);

    return new Promise((resolve) => {
      const child = exec(command, {
        cwd: workDir,
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024,
        env: { ...process.env },
      }, (error, stdout, stderr) => {
        if (error) {
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

      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, timeoutMs + 5000);
    });
  }
}
