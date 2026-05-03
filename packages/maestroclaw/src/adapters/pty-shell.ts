import pty from "@lydell/node-pty";
import type { Adapter, AdapterResult } from "./types.js";
import { analyzeShellCommand } from "../lib/kernel/shell-analyzer.js";

const TRUSTED_COMMANDS = new Set([
  "git", "npm", "ls", "pwd", "cd", "mkdir", "rm", "cp", "mv", "cat", 
  "grep", "find", "whoami", "hostname", "ipconfig", "ifconfig", "ping", "nmap",
  "top", "htop", "vim", "nano"
]);

/**
 * PTY Shell adapter — provides high-fidelity interactive terminal sessions.
 * Harvested from OpenClaw for use in the ThamosClaw Workstation.
 */
export class PtyShellAdapter implements Adapter {
  name = "pty_shell";

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
      return { success: false, output: "", error: `Kernel Violation: ${analysis.reason}` };
    }

    // 2. Security Check
    for (const segment of analysis.segments) {
      const binary = segment.argv[0]?.toLowerCase();
      if (!binary || !TRUSTED_COMMANDS.has(binary)) {
        return { 
          success: false, 
          output: "", 
          error: `Security Violation: Binary '${binary}' is not on the workstation allowlist.` 
        };
      }
    }

    console.log(`  🐚 pty_shell: running "${command}" in ${workDir}`);

    return new Promise((resolve) => {
      let output = "";
      const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
      const args = process.platform === 'win32' ? ['-NoProfile', '-Command', command] : ['-c', command];

      const ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-color',
        cols: 120,
        rows: 30,
        cwd: workDir,
        env: process.env as any
      });

      const timer = setTimeout(() => {
        ptyProcess.kill();
        resolve({
          success: false,
          output: output,
          error: `PTY session timed out after ${timeoutMs}ms`
        });
      }, timeoutMs);

      ptyProcess.onData((data) => {
        output += data;
      });

      ptyProcess.onExit(({ exitCode, signal }) => {
        clearTimeout(timer);
        resolve({
          success: exitCode === 0,
          output: output.trim() || "(no output)",
          error: exitCode !== 0 ? `Exit Code: ${exitCode}${signal ? `, Signal: ${signal}` : ''}` : undefined
        });
      });
    });
  }
}
