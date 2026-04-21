import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import type { Adapter, AdapterResult } from "./types.js";
import { buildCliArguments, resolveCliInvocation } from "./command.js";

export class CodexCliAdapter implements Adapter {
  name = "codex_cli";

  async check(): Promise<boolean> {
    try {
      const invocation = await resolveCliInvocation("codex");
      if (!invocation) return false;

      return await new Promise<boolean>((resolve) => {
        const proc = spawn(invocation.command, buildCliArguments(invocation, ["--version"]), {
          shell: false,
          timeout: 5000,
          env: { ...process.env },
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
  ): Promise<AdapterResult> {
    console.log(`  🤖 codex_cli: running in ${workDir}`);

    const outputFilePath = join(workDir, `.maestroclaw-codex-last-message-${Date.now()}.txt`);
    const invocation = await resolveCliInvocation("codex");
    if (!invocation) {
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

      const proc = spawn(
        invocation.command,
        buildCliArguments(invocation, [
          "exec",
          "-",
          "--cd",
          workDir,
          "--skip-git-repo-check",
          "--ephemeral",
          "--full-auto",
          "--color",
          "never",
          "--output-last-message",
          outputFilePath,
        ]),
        {
          cwd: workDir,
          timeout: timeoutMs,
          shell: false,
          env: { ...process.env },
        },
      );

      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      proc.stdin.write(prompt);
      proc.stdin.end();

      proc.on("close", (code, signal) => {
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

        finish({
          success,
          output: finalOutput,
          ...(error ? { error } : {}),
        });
      });

      proc.on("error", (err) => {
        finish({
          success: false,
          output: stdout.trimEnd(),
          error: err.message,
        });
      });
    });
  }
}
