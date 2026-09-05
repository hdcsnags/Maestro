import pty from "@lydell/node-pty";
import type { Adapter, AdapterResult, OnLineFn } from "./types.js";
import { analyzeShellCommand } from "../lib/kernel/shell-analyzer.js";
import { TRUSTED_SHELL_COMMANDS } from "../lib/kernel/trusted-commands.js";
import { getIncidentService } from "../executor.js";
import { LineSplitter } from "../lib/line-splitter.js";
import { buildChildEnv } from "../lib/child-env.js";

// Strip ANSI escape sequences before passing PTY output to onLine (display only).
// eslint-disable-next-line no-control-regex -- intentional ESC control char match
const ANSI_RE = /\x1B\[[0-9;]*[mGKHFJSTsulhir?]/g;
function stripAnsi(s: string): string { return s.replace(ANSI_RE, ''); }

/**
 * PTY Shell adapter — runs one non-interactive shell command through a
 * pseudo-terminal so output is captured the way a real terminal would
 * render it (color codes, progress output, etc.), stripped of ANSI escapes
 * before being surfaced via onLine.
 *
 * This is NOT an interactive terminal session, despite earlier documentation
 * claiming "high-fidelity interactive terminal sessions." Nothing in this
 * adapter or the shared Adapter.run() interface ever calls
 * ptyProcess.write() — there is no input channel at all. A command like
 * `vim` or `htop` will render its opening screen and then simply run until
 * `timeoutMs` and get killed; it never receives a keystroke. Both the Fable
 * and Sol source audits independently confirmed this is an interface-level
 * gap, not a missing flag — building real interactivity means adding a
 * bidirectional stream to the Adapter contract, which the architectural
 * decision in docs/audits/MAESTROCLAW-ATTACK-PLAN.md §1 explicitly declines
 * to do: native harnesses (Claude Code, Codex, Gemini, Copilot) now ship
 * their own sessions/resume, which is where "watch an agent work
 * interactively" should live going forward. This adapter's job is narrower:
 * one-shot commands with terminal-shaped output, same allowlist and
 * validation as approved_shell.
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
        title: "Kernel Violation (pty_shell)",
        message: analysis.reason ?? "Command failed kernel analysis",
        metadata: { command },
      });
      return { success: false, output: "", error: `Kernel Violation: ${analysis.reason}` };
    }

    // 2. Security Check
    for (const segment of analysis.segments) {
      const binary = segment.argv[0]?.toLowerCase();
      if (!binary || !TRUSTED_SHELL_COMMANDS.has(binary)) {
        getIncidentService()?.report({
          severity: "critical",
          category: "security_violation",
          title: "Blocked Binary (pty_shell)",
          message: `Binary '${binary}' is not on the workstation allowlist.`,
          metadata: { command, binary },
        });
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
      const splitter = onLine ? new LineSplitter() : null;
      const shell = process.platform === 'win32' ? 'powershell.exe' : 'bash';
      const args = process.platform === 'win32' ? ['-NoProfile', '-Command', command] : ['-c', command];

      const ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-color',
        cols: 120,
        rows: 30,
        cwd: workDir,
        env: buildChildEnv(),
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
        if (onLine && splitter) {
          splitter.push(stripAnsi(data), (line) => onLine("stdout", line));
        }
      });

      ptyProcess.onExit(({ exitCode, signal }) => {
        clearTimeout(timer);
        if (onLine && splitter) splitter.drain((line) => onLine("stdout", line));
        resolve({
          success: exitCode === 0,
          output: output.trim() || "(no output)",
          error: exitCode !== 0 ? `Exit Code: ${exitCode}${signal ? `, Signal: ${signal}` : ''}` : undefined
        });
      });
    });
  }
}
