import { mkdirSync, rmSync, renameSync, existsSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import type { ClawConfig } from "./config.js";
import type { ExecutorJob } from "./api.js";
import { reportEvent, completeJob } from "./api.js";
import { getAdapter } from "./adapters/index.js";

/**
 * Runs a single executor job: set up workspace → run adapter → report result.
 */
export async function executeJob(
  config: ClawConfig,
  job: ExecutorJob
): Promise<void> {
  const jobDir = join(config.workspaceDir, job.id);
  let workDir = jobDir;
  let jobSucceeded = false;

  try {
    // Report running
    await reportEvent(config, job.id, "status_change", { status: "running" });

    // Set up workspace
    mkdirSync(jobDir, { recursive: true });

    // Clone repo if specified
    if (job.repo_url) {
      console.log(`  📦 Cloning ${job.repo_url}...`);
      const cloneArgs = ["clone", "--depth", "1"];
      if (job.branch) {
        cloneArgs.push("--branch", job.branch);
      }
      cloneArgs.push(job.repo_url, "repo");

      execFileSync("git", cloneArgs, {
        cwd: jobDir,
        timeout: 60_000,
        stdio: "pipe",
      });
      workDir = join(jobDir, "repo");
    }

    // Get the adapter
    const adapter = getAdapter(job.adapter);

    // Check adapter availability
    const available = await adapter.check();
    if (!available) {
      throw new Error(
        `Adapter "${job.adapter}" is not available on this machine`
      );
    }

    // Run the adapter
    console.log(`  ▶ Running adapter "${job.adapter}" for job ${job.id.slice(0, 8)}...`);
    const result = await adapter.run(
      job.prompt,
      workDir,
      job.timeout_seconds * 1000
    );

    // Report stdout/stderr events
    if (result.output) {
      await reportEvent(config, job.id, "stdout", {
        text: result.output.slice(0, 50_000), // cap at 50KB
      });
    }
    if (result.error) {
      await reportEvent(config, job.id, "stderr", {
        text: result.error.slice(0, 10_000),
      });
    }

    // Build artifact manifest from adapter output.
    // CLI adapters (--print mode) return text, not structured artifacts.
    // If the job specifies allowed_paths, synthesize an artifact from the output.
    let artifacts = result.artifacts ?? {};

    if (Object.keys(artifacts).length === 0 && result.success && result.output) {
      const targetPath = job.allowed_paths?.[0];
      if (targetPath) {
        const extracted = extractFileContent(result.output);
        if (extracted.length > 0) {
          artifacts = { [targetPath]: extracted };
          console.log(`  📄 Synthesized artifact for ${targetPath} (${extracted.length} chars)`);
        }
      }
    }

    // Report artifacts
    if (Object.keys(artifacts).length > 0) {
      // Write artifacts to the per-job workspace
      for (const [filePath, content] of Object.entries(artifacts)) {
        const fullPath = join(jobDir, filePath);
        mkdirSync(dirname(fullPath), { recursive: true });
        writeFileSync(fullPath, content, "utf-8");
        console.log(`  💾 Wrote ${filePath} to workspace`);
      }

      // Also write to session-scoped build folder so all project files
      // from the same build end up in one directory
      if (job.session_id) {
        const buildDir = join(config.workspaceDir, "builds", job.session_id.slice(0, 8));
        for (const [filePath, content] of Object.entries(artifacts)) {
          const fullPath = join(buildDir, filePath);
          mkdirSync(dirname(fullPath), { recursive: true });
          writeFileSync(fullPath, content, "utf-8");
        }
        console.log(`  📂 Project files → builds/${job.session_id.slice(0, 8)}/`);
      }

      // Convert {path: content} to array format Maestro web expects
      const manifestArray = Object.entries(artifacts).map(([path, content]) => ({
        path,
        content,
        operation: "create",
      }));
      await reportEvent(config, job.id, "artifact", {
        manifest: manifestArray,
      });

      // Complete with artifact manifest in array format
      await completeJob(config, job.id, result.success, {
        result_summary: result.output.slice(0, 10_000),
        error_text: result.error,
        artifact_manifest: manifestArray,
      });
    } else {
      await completeJob(config, job.id, result.success, {
        result_summary: result.output.slice(0, 10_000),
        error_text: result.error,
      });
    }

    jobSucceeded = result.success;
    console.log(
      result.success
        ? `  ✅ Job ${job.id.slice(0, 8)} succeeded`
        : `  ⚠️ Job ${job.id.slice(0, 8)} finished with errors`
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ Job ${job.id.slice(0, 8)} failed:`, message);

    try {
      await reportEvent(config, job.id, "error", { message });
      await completeJob(config, job.id, false, { error_text: message });
    } catch (reportErr) {
      console.error("  Failed to report error:", reportErr);
    }
  } finally {
    // Preserve workspace on success if configured, otherwise clean up
    if (existsSync(jobDir)) {
      if (jobSucceeded && config.keepSucceededWorkspaces) {
        try {
          const label = job.repo_name ?? "job";
          const namedDir = join(config.workspaceDir, `${label}-${job.id.slice(0, 8)}`);
          renameSync(jobDir, namedDir);
          console.log(`  📁 Workspace preserved: ${namedDir}`);
        } catch {
          console.warn(`  ⚠ Could not rename workspace ${jobDir}`);
        }
      } else {
        try {
          rmSync(jobDir, { recursive: true, force: true });
        } catch {
          console.warn(`  ⚠ Could not clean up ${jobDir}`);
        }
      }
    }
  }
}

/**
 * Extracts file content from CLI adapter text output.
 * Claude --print mode wraps code in markdown fences. This strips them
 * and returns the inner content. Falls back to raw output if no fences found.
 */
function extractFileContent(output: string): string {
  // Strategy 1: Find the largest fenced code block
  const fencePattern = /```[\w]*\n([\s\S]*?)```/g;
  let bestBlock = "";
  let match: RegExpExecArray | null;

  while ((match = fencePattern.exec(output)) !== null) {
    const block = match[1].trim();
    if (block.length > bestBlock.length) {
      bestBlock = block;
    }
  }

  if (bestBlock.length > 50) return bestBlock;

  // Strategy 2: If output looks like raw code (no markdown prose),
  // use it directly — Claude sometimes outputs bare code with --print
  const lines = output.trim().split("\n");
  const codeIndicators = lines.filter(l =>
    /^(import |export |const |let |var |function |class |<|\/\/|\/\*|\{|\}|#|@|<!DOCTYPE)/.test(l.trim())
  ).length;

  if (codeIndicators > lines.length * 0.3) {
    return output.trim();
  }

  // Strategy 3: Nothing usable
  return "";
}
