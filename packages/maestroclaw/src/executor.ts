import { mkdirSync, rmSync, renameSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
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
      const branch = job.branch ? `--branch ${job.branch}` : "";
      execSync(`git clone --depth 1 ${branch} ${job.repo_url} repo`, {
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

    // Report artifacts
    if (result.artifacts) {
      await reportEvent(config, job.id, "artifact", {
        manifest: result.artifacts,
      });
    }

    // Complete the job
    await completeJob(config, job.id, result.success, {
      result_summary: result.output.slice(0, 10_000),
      error_text: result.error,
      artifact_manifest: result.artifacts,
    });

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
