import { spawn } from "node:child_process";
import type { Adapter, AdapterResult, OnLineFn } from "./types.js";
import { buildCliArguments, resolveCliInvocation } from "./command.js";
import { LineSplitter } from "../lib/line-splitter.js";
import { AGENT_01_SESSION_INSTRUCTIONS, appendSessionLogEvent } from "../lib/session-log.js";
import { buildChildEnv } from "../lib/child-env.js";

// Google Antigravity CLI ("agy"). Probed directly against a real installed copy
// (1.1.13) before writing this file, per the attack plan's "probe-first" instruction
// — several things below are NOT what either narrow audit assumed, and are load-bearing:
//
// 1. There is no --cwd flag. `agy --help` does not list one. Confirmed empirically:
//    agy operates relative to the process's actual spawn `cwd`, but ONLY for files it's
//    been explicitly granted access to via --add-dir — without --add-dir, tool calls
//    that touch the filesystem get silently auto-denied in headless mode (see point 2),
//    and even once permissions are bypassed, agy's own "home" is its config directory
//    (`~/.gemini/antigravity-cli`, confirmed by asking a live session to report its own
//    cwd), NOT the shell's cwd. `--add-dir <workDir>` is therefore not optional the way
//    it might look from the flag's description ("add a directory to the workspace") —
//    it is the ONLY thing that makes this adapter's ephemeral-workspace containment
//    model apply to agy at all. Omitting it does not fail loudly; it just means agy's
//    file operations happen somewhere else entirely.
//
// 2. Headless mode has real per-tool permission gating, and it fails closed, not open.
//    Without --dangerously-skip-permissions, a tool call that needs approval (e.g. a
//    shell command) is auto-denied with no prompt (headless mode can't prompt), and
//    agy returns an empty response with a warning on stderr — not an error exit code.
//    A naive adapter checking only the exit code would report these as silent
//    successes with empty output. --dangerously-skip-permissions is required for this
//    adapter to do anything at all in an unattended worker, matching every other
//    AI adapter's current posture (see MAESTROCLAW-ATTACK-PLAN.md §1's "delegate to
//    native sandbox going forward" — agy's sandbox is the one exception; see point 3).
//
// 3. --sandbox exists but FAILS on this Windows machine, it does not degrade gracefully.
//    Confirmed empirically: `agy ... --dangerously-skip-permissions --sandbox --add-dir .`
//    returned `{"status":"ERROR","error":"... CORTEX_STEP_TYPE_RUN_COMMAND: granting
//    access to C:\\: Access is denied."}` — a hard failure, not reduced capability. This
//    is the same pattern both audits found for Codex's sandbox on Windows (no OS-level
//    primitive backs it here). --sandbox is therefore NOT passed by default; it's gated
//    behind CLAW_AGY_SANDBOX=1 for whoever eventually verifies it on a platform where it
//    actually works, with this comment as the record of why it isn't the default.
//
// 4. --effort errors outright for Claude-family model tags routed through agy (confirmed
//    directly against this installed copy earlier the same night this adapter was
//    written: "invalid model selection: --effort is not supported for model
//    'claude-sonnet-4-6'"). It works for Gemini/GPT-tag models. This adapter omits
//    --effort automatically for any model string starting with "claude".
//
// 5. --output-format json returns real structured output — {conversation_id, status,
//    response, duration_seconds, usage} — which is more robust than the plain-stdout
//    scraping every other adapter in this package still does. Used here instead of the
//    text format for exactly that reason.

const PRIMARY_MODEL = process.env.CLAW_AGY_MODEL ?? "";
const EFFORT = process.env.CLAW_AGY_EFFORT ?? "";
const SANDBOX_OPT_IN = process.env.CLAW_AGY_SANDBOX === "1";

// Sol's citation-backed research: structured print output landed in agy 1.1.8; a fix
// ensuring --sandbox propagated into headless -p mode landed in 1.1.1. Gate on the
// higher of the two so an older, undertested install fails check() cleanly instead of
// silently misbehaving.
const MIN_VERSION = [1, 1, 8] as const;

function parseVersion(raw: string): [number, number, number] | null {
  const match = raw.trim().match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function meetsMinVersion(version: [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    if (version[i] > MIN_VERSION[i]) return true;
    if (version[i] < MIN_VERSION[i]) return false;
  }
  return true; // exactly equal
}

interface AgyJsonResult {
  conversation_id?: string;
  status?: string;
  response?: string;
  error?: string;
  duration_seconds?: number;
}

export class AgyCliAdapter implements Adapter {
  name = "agy_cli";

  async check(): Promise<boolean> {
    try {
      const invocation = await resolveCliInvocation("agy");
      if (!invocation) return false;

      const versionOutput = await new Promise<string | null>((resolve) => {
        let stdout = "";
        const proc = spawn(invocation.command, buildCliArguments(invocation, ["--version"]), {
          shell: false,
          timeout: 5000,
          env: buildChildEnv(),
        });
        proc.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
        proc.on("close", (code) => resolve(code === 0 ? stdout : null));
        proc.on("error", () => resolve(null));
      });

      if (!versionOutput) return false;
      const version = parseVersion(versionOutput);
      if (!version) return false;
      if (!meetsMinVersion(version)) {
        console.warn(
          `  ⚠️  agy_cli: installed version ${versionOutput.trim()} is older than the ` +
          `required ${MIN_VERSION.join(".")} (structured print output / headless --sandbox ` +
          `propagation) — treating as unavailable rather than risking silent misbehavior.`,
        );
        return false;
      }
      return true;
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

  // Session mode: --dangerously-skip-permissions + --add-dir already grants full
  // write access scoped to workDir. runSession() delegates to run() — the session
  // prompt drives scope, matching every other adapter's pattern in this package.
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
    console.log(`  🤖 agy_cli: running in ${workDir}`);
    appendSessionLogEvent(workDir, {
      type: "tool_use",
      adapter: this.name,
      mode,
      content: `Starting agy_cli ${mode} run`,
      metadata: {
        command: "agy --print",
        model: PRIMARY_MODEL || "(agy default)",
        sandbox: SANDBOX_OPT_IN,
      },
    });

    const invocation = await resolveCliInvocation("agy");
    if (!invocation) {
      appendSessionLogEvent(workDir, {
        type: "error",
        adapter: this.name,
        mode,
        success: false,
        content: "agy (Antigravity) CLI is not available on this machine",
      });
      return {
        success: false,
        output: "",
        error: "agy (Antigravity) CLI is not available on this machine",
      };
    }

    const agyArgs = [
      "--print",
      prompt,
      "--output-format",
      "json",
      "--dangerously-skip-permissions",
      "--add-dir",
      workDir,
    ];
    if (PRIMARY_MODEL) {
      agyArgs.push("--model", PRIMARY_MODEL);
    }
    // See file-header note 4: --effort hard-errors for Claude-family model tags via agy.
    if (EFFORT && !PRIMARY_MODEL.toLowerCase().startsWith("claude")) {
      agyArgs.push("--effort", EFFORT);
    }
    // See file-header note 3: opt-in only, confirmed broken on Windows as of this writing.
    if (SANDBOX_OPT_IN) {
      agyArgs.push("--sandbox");
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
        resolve(result);
      };

      const proc = spawn(
        invocation.command,
        buildCliArguments(invocation, agyArgs),
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

      proc.on("close", (code, signal) => {
        if (onLine) {
          stdoutSplitter?.drain((line) => onLine("stdout", line));
          stderrSplitter?.drain((line) => onLine("stderr", line));
        }

        // Parse the structured JSON result rather than treating raw stdout as the
        // answer — see file-header note 5. Falls back to raw stdout only if parsing
        // fails outright (e.g. a crash before agy ever emits its JSON envelope).
        let parsed: AgyJsonResult | null = null;
        try {
          parsed = JSON.parse(stdout.trim()) as AgyJsonResult;
        } catch {
          parsed = null;
        }

        const processExitedCleanly = code === 0 && !signal;
        const agyReportedSuccess = parsed?.status === "SUCCESS";
        const success = processExitedCleanly && (parsed ? agyReportedSuccess : true);

        const output = parsed?.response ?? stdout.trimEnd();
        const error = success
          ? undefined
          : parsed?.error
            || stderr.trim()
            || (signal
              ? `agy terminated with signal ${signal}`
              : `agy exited with code ${code ?? "unknown"}`);

        appendSessionLogEvent(workDir, {
          type: success ? "complete" : "error",
          adapter: this.name,
          mode,
          success,
          content: signal
            ? `agy_cli ${mode} terminated with signal ${signal}`
            : `agy_cli ${mode} exited with code ${code ?? "unknown"}${parsed?.status ? ` (agy status: ${parsed.status})` : ""}`,
          metadata: { code, signal, stderr: stderr.slice(0, 1000), agy_status: parsed?.status },
        });

        finish({
          success,
          output,
          ...(error ? { error } : {}),
        });
      });

      proc.on("error", (err) => {
        appendSessionLogEvent(workDir, {
          type: "error",
          adapter: this.name,
          mode,
          success: false,
          content: `agy_cli ${mode} failed to start: ${err.message}`,
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
