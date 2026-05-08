#!/usr/bin/env node

import "dotenv/config";
import { loadConfig } from "./config.js";
import { heartbeat, pollForJob, claimJob, pollForLoop, claimLoop, type ExecutorCapabilities } from "./api.js";
import { checkAdapters } from "./adapters/index.js";
import { executeJob, executeSessionJob } from "./executor.js";
import { setIncidentService } from "./executor.js";
import { IncidentService } from "./lib/kernel/incident-service.js";
import { runIterationLoop } from "./iteration/runner.js";

const HEARTBEAT_INTERVAL_MS = 15_000;

async function main() {
  console.log("🐾 MaestroClaw v0.1.0 — Local Execution Node");
  console.log("─".repeat(50));

  // Load config
  const config = loadConfig();
  console.log(`📡 Supabase: ${config.supabaseUrl}`);
  console.log(`⏱  Poll interval: ${config.pollIntervalMs}ms`);
  console.log(`⚡ Max concurrent jobs: ${config.maxConcurrentJobs}`);

  // Wire up the IncidentService so adapters can report kernel/security events.
  const incidents = new IncidentService(config);
  setIncidentService(incidents);

  // Check adapters
  const adapters = await checkAdapters();
  const supportedAdapters = Object.entries(adapters)
    .filter(([, ok]) => ok)
    .map(([name]) => name);
  const capabilities: ExecutorCapabilities = {
    adapters: supportedAdapters,
    platform: process.platform,
    node_version: process.version,
  };
  console.log("🔌 Adapters:");
  for (const [name, ok] of Object.entries(adapters)) {
    console.log(`   ${ok ? "✅" : "❌"} ${name}`);
  }

  // Initial heartbeat
  await heartbeat(config, capabilities);
  console.log("💓 Heartbeat sent — executor is online");
  console.log("─".repeat(50));
  console.log("👀 Polling for jobs...\n");

  // Poll loop
  let running = true;
  let activeJobs = 0;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 10;
  const runningJobIds = new Set<string>();
  const runningLoopIds = new Set<string>();

  process.on("SIGINT", () => {
    console.log("\n🛑 Shutting down gracefully...");
    running = false;
  });

  process.on("SIGTERM", () => {
    console.log("\n🛑 Received SIGTERM, shutting down...");
    running = false;
  });

  const heartbeatTimer = setInterval(() => {
    void heartbeat(config, capabilities).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`⚠️ Heartbeat failed: ${message}`);
    });
  }, HEARTBEAT_INTERVAL_MS);

  while (running) {
    try {
      // Only poll when under capacity — no blocking await when full
      if (activeJobs < config.maxConcurrentJobs) {
        const job = await pollForJob(config);

        if (job && !runningJobIds.has(job.id)) {
          console.log(`📋 Job found: ${job.id.slice(0, 8)} [${job.adapter}] "${job.prompt.slice(0, 60)}..."`);

          const claimed = await claimJob(config, job.id);
          activeJobs++;
          runningJobIds.add(claimed.id);
          console.log(`  🔒 Claimed: ${claimed.id.slice(0, 8)} [${activeJobs}/${config.maxConcurrentJobs} active]`);

          // Fire-and-forget — do not await; poll loop continues immediately
          const jobRunner = claimed.job_type === "build_session"
            ? executeSessionJob(config, claimed)
            : executeJob(config, claimed);

          void jobRunner
            .catch((err: unknown) => {
              const msg = err instanceof Error ? err.message : String(err);
              console.error(`  ⚠️ Job ${claimed.id.slice(0, 8)} error: ${msg}`);
            })
            .finally(() => {
              activeJobs--;
              runningJobIds.delete(claimed.id);
              console.log(`  🏁 Job ${claimed.id.slice(0, 8)} done [${activeJobs}/${config.maxConcurrentJobs} active]`);
            });
        }

        // Poll for iteration loops
        const pendingLoop = await pollForLoop(config).catch(() => null);
        if (pendingLoop && !runningLoopIds.has(pendingLoop.id)) {
          const claimedLoop = await claimLoop(config, pendingLoop.id).catch(() => null);
          if (claimedLoop) {
            runningLoopIds.add(claimedLoop.id);
            void runIterationLoop(config, claimedLoop)
              .finally(() => runningLoopIds.delete(claimedLoop.id));
          }
        }

        consecutiveErrors = 0;
      }
      // At capacity — skip poll, fall through to wait
    } catch (err: unknown) {
      consecutiveErrors++;
      const message = err instanceof Error ? err.message : String(err);
      console.error(`⚠️ Poll error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}): ${message}`);

      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error("❌ Too many consecutive errors, shutting down.");
        running = false;
        break;
      }
    }

    // Wait before next poll (or next capacity check if full)
    if (running) {
      await new Promise((r) => setTimeout(r, config.pollIntervalMs));
    }
  }

  clearInterval(heartbeatTimer);

  // Drain active jobs before exit (up to 30s)
  if (activeJobs > 0) {
    console.log(`⏳ Waiting for ${activeJobs} active job(s) to finish (max 30s)...`);
    const drainDeadline = Date.now() + 30_000;
    while (activeJobs > 0 && Date.now() < drainDeadline) {
      await new Promise((r) => setTimeout(r, 500));
    }
    if (activeJobs > 0) {
      console.log(`⚠️ Force-exiting with ${activeJobs} job(s) still running.`);
    }
  }

  console.log("👋 MaestroClaw stopped.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

