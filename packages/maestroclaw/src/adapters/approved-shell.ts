import { spawn } from "child_process";
import type { Adapter, AdapterResult, OnLineFn } from "./types.js";
import { analyzeShellCommand } from "../lib/kernel/shell-analyzer.js";
import { getIncidentService } from "../executor.js";
import { LineSplitter } from "../lib/line-splitter.js";

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
    onLine?: OnLineFn,
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
      const child = spawn(command, {
        cwd: workDir,
        shell: true,
        env: { ...process.env },
      });

      let stdout = "";
      let stderr = "";
      const stdoutSplitter = new LineSplitter();
      const stderrSplitter = new LineSplitter();

      const timer = setTimeout(() => {
        if (!child.killed) child.kill("SIGKILL");
      }, timeoutMs + 5000);

      child.stdout?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stdout += chunk;
        if (onLine) stdoutSplitter.push(chunk, (line) => onLine("stdout", line));
      });

      child.stderr?.on("data", (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        if (onLine) stderrSplitter.push(chunk, (line) => onLine("stderr", line));
      });

      child.on("close", (code, signal) => {
        clearTimeout(timer);
        if (onLine) {
          stdoutSplitter.drain((line) => onLine("stdout", line));
          stderrSplitter.drain((line) => onLine("stderr", line));
        }

        if (signal === "SIGKILL" || (code === null && signal)) {
          resolve({ success: false, output: stdout || "", error: `Command timed out after ${timeoutMs}ms` });
          return;
        }
        if (code !== 0) {
          resolve({ success: false, output: stdout || "", error: stderr || `Exit code ${code}` });
          return;
        }

        const combined = [stdout, stderr].filter(Boolean).join("\n").trim();
        resolve({ success: true, output: combined || "(no output)" });
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({ success: false, output: stdout || "", error: err.message });
      });
    });
  }
}
