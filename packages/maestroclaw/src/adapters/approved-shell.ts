import { spawn, type ChildProcess } from "child_process";
import crossSpawn from "cross-spawn";
import type { Adapter, AdapterResult, OnLineFn } from "./types.js";
import { analyzeShellCommand } from "../lib/kernel/shell-analyzer.js";
import { TRUSTED_SHELL_COMMANDS } from "../lib/kernel/trusted-commands.js";
import { getIncidentService } from "../executor.js";
import { LineSplitter } from "../lib/line-splitter.js";
import { buildChildEnv } from "../lib/child-env.js";

/**
 * Approved Shell adapter — runs shell commands in a controlled subprocess.
 * Hardened with the ThamosClaw Kernel for deep command analysis.
 *
 * Execution strategy (see docs/audits/MAESTROCLAW-ATTACK-PLAN.md §2 item 9 /
 * §6 for the full history of this decision):
 *
 * - Single-segment commands (no |, &&, ||, ; — the common case: "git status",
 *   "npm test", "ls -la") execute via direct argv against the ALREADY-PARSED
 *   analysis.segments[0].argv, using `cross-spawn` with shell:false. This
 *   closes the entire "parser validated string X, but the real shell
 *   executed string X differently" bug class at its root for this case,
 *   because there is no second parse — the kernel's own tokenization is what
 *   gets executed, not a re-interpretation of the raw string by cmd.exe/bash.
 *   `cross-spawn` (not a hand-rolled cmd.exe wrapper) specifically because a
 *   naive `spawn(binary, args, {shell:false})` throws EINVAL on Windows for
 *   any resolved `.cmd`/`.bat` shim (confirmed empirically against this
 *   package's own `npm` on a real Windows box — modern Node refuses to spawn
 *   .cmd/.bat directly without a shell, post CVE-2024-27980) — cross-spawn is
 *   the standard, widely-audited fix for exactly this problem; hand-rolling
 *   the cmd.exe /c escaping ourselves would risk reintroducing the same class
 *   of Windows argument-injection bug that CVE was about.
 * - Multi-segment pipelines (anything with |, &&, ||, ;) still go through a
 *   real shell (shell:true against the original raw command string) — a full
 *   from-scratch Node-side pipeline re-implementation (proper && / || short-
 *   circuiting, real | piping between child processes) is real, substantial,
 *   security-relevant work that deserves its own dedicated pass and test
 *   suite, not something to improvise alongside this fix. This is an
 *   explicitly acknowledged residual gap, not a silent one.
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
      if (!binary || !TRUSTED_SHELL_COMMANDS.has(binary)) {
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

    const useDirectArgv = analysis.segments.length === 1 && analysis.segments[0].argv.length > 0;

    if (useDirectArgv) {
      const [binary, ...args] = analysis.segments[0].argv;
      console.log(`  🐚 approved_shell: validated & running "${command}" in ${workDir} (direct argv, no shell)`);
      const child = crossSpawn(binary, args, { cwd: workDir, env: buildChildEnv() });
      return runAndCollect(child, command, timeoutMs, onLine);
    }

    console.log(`  🐚 approved_shell: validated & running "${command}" in ${workDir} (multi-segment pipeline, shell:true — see class doc comment)`);
    const child = spawn(command, {
      cwd: workDir,
      shell: true,
      env: buildChildEnv(),
    });
    return runAndCollect(child, command, timeoutMs, onLine);
  }
}

/**
 * Shared stdout/stderr/timeout/exit wiring for both execution strategies
 * above — the only difference between them is how `child` was spawned.
 */
function runAndCollect(
  child: ChildProcess,
  command: string,
  timeoutMs: number,
  onLine?: OnLineFn,
): Promise<AdapterResult> {
  return new Promise((resolve) => {
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
      resolve({
        success: false,
        output: stdout || "",
        error: `${err.message} (command: ${command})`,
      });
    });
  });
}
