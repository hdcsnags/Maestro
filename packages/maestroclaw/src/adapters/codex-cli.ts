import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { Adapter, AdapterResult, OnLineFn } from "./types.js";
import { buildCliArguments, resolveCliInvocation } from "./command.js";
import { LineSplitter } from "../lib/line-splitter.js";
import { AGENT_01_SESSION_INSTRUCTIONS, appendSessionLogEvent } from "../lib/session-log.js";
import { buildChildEnv } from "../lib/child-env.js";

// Model to use for generation. Override via CLAW_CODEX_MODEL in .env.
// Unlike every other adapter, Codex previously had no model override at all —
// it silently inherited whatever model the user's local `codex` config
// defaulted to. Empty string means "don't pass --model, let Codex decide"
// (preserves the old default behavior for anyone relying on it).
const PRIMARY_MODEL = process.env.CLAW_CODEX_MODEL ?? "";

// Codex's own native sandbox mode. Deliberately NOT a plain env var like
// PRIMARY_MODEL above: sandbox mode is a per-job decision (some jobs want to
// generate code — workspace-write; some jobs want a verifiable read-only
// review — read-only), not a worker-wide one. A module-level env var would
// mean every codex_cli job in the whole process shares one sandbox mode,
// which is wrong the moment a worker handles both job shapes. Instead it's a
// constructor option — adapters/index.ts's registry keeps constructing
// CodexCliAdapter with no args (preserving the existing "workspace-write"
// default for every current caller unchanged); a caller that needs a
// different mode for a specific job instantiates the adapter directly with
// an explicit option, e.g. `new CodexCliAdapter({ sandbox: "read-only" })`.
//
// "read-only" is enforced by Codex's own OS-level sandbox (Landlock/seccomp
// on Linux, Seatbelt on macOS, the native Windows sandbox) — not merely "the
// prompt asked it not to write anything." This is the concrete mechanism
// behind MaestroClaw's first read-only review job (the Eliana proof
// workload) — see docs/audits/MAESTROCLAW-ATTACK-PLAN.md.
export type CodexSandboxMode = "read-only" | "workspace-write" | "danger-full-access";
export interface CodexCliAdapterOptions {
  sandbox?: CodexSandboxMode;
}

export class CodexCliAdapter implements Adapter {
  name = "codex_cli";
  private readonly sandbox: CodexSandboxMode;

  constructor(options: CodexCliAdapterOptions = {}) {
    this.sandbox = options.sandbox ?? "workspace-write";
  }

  async check(): Promise<boolean> {
    try {
      const invocation = await resolveCliInvocation("codex");
      if (!invocation) return false;

      return await new Promise<boolean>((resolve) => {
        const proc = spawn(invocation.command, buildCliArguments(invocation, ["--version"]), {
          shell: false,
          timeout: 5000,
          env: buildChildEnv(),
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

  // Session mode: Codex's non-interactive sandbox+approval combo already
  // writes files directly. runSession() delegates to run() — the session
  // prompt drives scope.
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
    console.log(`  🤖 codex_cli: running in ${workDir}`);
    appendSessionLogEvent(workDir, {
      type: "tool_use",
      adapter: this.name,
      mode,
      content: `Starting codex_cli ${mode} run`,
      metadata: { command: "codex exec", sandbox: this.sandbox, model: PRIMARY_MODEL || "(codex default)" },
    });

    const outputFilePath = join(workDir, `.maestroclaw-codex-last-message-${Date.now()}.txt`);
    const invocation = await resolveCliInvocation("codex");
    if (!invocation) {
      appendSessionLogEvent(workDir, {
        type: "error",
        adapter: this.name,
        mode,
        success: false,
        content: "Codex CLI is not available on this machine",
      });
      return {
        success: false,
        output: "",
        error: "Codex CLI is not available on this machine",
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
          rmSync(outputFilePath, { force: true });
        } catch {
          // Best-effort cleanup only.
        }
        resolve(result);
      };

      // --full-auto is Codex's deprecated compatibility alias (current Codex
      // prints a warning when it's used) for the combination spelled out
      // explicitly below. --ephemeral is unrelated to sandboxing — it only
      // suppresses rollout/session-file persistence — and stays regardless.
      //
      // CORRECTION (found empirically 2026-08-17, see
      // docs/audits/MAESTROCLAW-ATTACK-PLAN.md §7): the original Sprint 1 fix
      // added "--ask-for-approval never" here based on Sol's citation-backed
      // research, and it was WRONG for the actual installed CLI (0.147.0) —
      // `-a/--ask-for-approval` is a flag on the ROOT `codex` command, not on
      // the `exec` subcommand, so placing it after "exec" is a hard parse
      // error ("unexpected argument '--ask-for-approval' found"), confirmed
      // by directly running `codex exec --sandbox workspace-write
      // --ask-for-approval never` against the real installed binary. This
      // silently broke every real codex_cli task/session invocation from the
      // moment that fix shipped until this correction — nothing in the
      // Sprint 4 test suite exercised the real `codex` binary, so it went
      // unnoticed until the Eliana read-only proof workload actually ran it.
      // The fix is simpler than the original addition: drop the flag
      // entirely. `codex exec` is non-interactive by construction and
      // defaults to "approval: never" on its own (confirmed via its own
      // startup banner) — there's nothing to configure here for exec mode;
      // --sandbox alone governs what the run is allowed to do.
      // See docs/audits/MAESTROCLAW-ATTACK-PLAN.md §1 / §4 Sprint 1 / §7 for
      // the full history of this flag (Sol's --full-auto → --sandbox
      // correction was right; this repeats the same "verify empirically,
      // don't trust even a good citation blindly" lesson one level deeper).
      const codexArgs = [
        "exec",
        "-",
        "--cd",
        workDir,
        "--skip-git-repo-check",
        "--ephemeral",
        "--sandbox",
        this.sandbox,
        "--color",
        "never",
        "--output-last-message",
        outputFilePath,
      ];
      if (PRIMARY_MODEL) {
        codexArgs.push("--model", PRIMARY_MODEL);
      }

      const proc = spawn(
        invocation.command,
        buildCliArguments(invocation, codexArgs),
        {
          cwd: workDir,
          timeout: timeoutMs,
          shell: false,
          env: buildChildEnv(),
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

      proc.stdin.write(prompt);
      proc.stdin.end();

      proc.on("close", (code, signal) => {
        if (onLine) {
          stdoutSplitter?.drain((line) => onLine("stdout", line));
          stderrSplitter?.drain((line) => onLine("stderr", line));
        }
        const finalOutput = existsSync(outputFilePath)
          ? readFileSync(outputFilePath, "utf-8").trimEnd()
          : stdout.trimEnd();
        const success = code === 0;
        const error = success
          ? undefined
          : stderr.trim() || (
          signal
            ? `codex terminated with signal ${signal}`
            : code === 0
              ? undefined
              : `codex exited with code ${code ?? "unknown"}`
        );
        appendSessionLogEvent(workDir, {
          type: success ? "complete" : "error",
          adapter: this.name,
          mode,
          success,
          content: signal
            ? `codex_cli ${mode} terminated with signal ${signal}`
            : `codex_cli ${mode} exited with code ${code ?? "unknown"}`,
          metadata: { code, signal, stderr: stderr.slice(0, 1000) },
        });

        finish({
          success,
          output: finalOutput,
          ...(error ? { error } : {}),
        });
      });

      proc.on("error", (err) => {
        appendSessionLogEvent(workDir, {
          type: "error",
          adapter: this.name,
          mode,
          success: false,
          content: `codex_cli ${mode} failed to start: ${err.message}`,
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
