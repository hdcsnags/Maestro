#!/usr/bin/env node

import "dotenv/config";
import { loadConfig } from "./config.js";
import { heartbeat, pollForJob, claimJob } from "./api.js";
import { checkAdapters } from "./adapters/index.js";
import { executeJob } from "./executor.js";

async function main() {
  console.log("🐾 MaestroClaw v0.1.0 — Local Execution Node");
  console.log("─".repeat(50));

  // Load config
  const config = loadConfig();
  console.log(`📡 Supabase: ${config.supabaseUrl}`);
  console.log(`⏱  Poll interval: ${config.pollIntervalMs}ms`);

  // Check adapters
  const adapters = await checkAdapters();
  console.log("🔌 Adapters:");
  for (const [name, ok] of Object.entries(adapters)) {
    console.log(`   ${ok ? "✅" : "❌"} ${name}`);
  }

  // Initial heartbeat
  await heartbeat(config);
  console.log("💓 Heartbeat sent — executor is online");
  console.log("─".repeat(50));
  console.log("👀 Polling for jobs...\n");

  // Poll loop
  let running = true;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 10;

  process.on("SIGINT", () => {
    console.log("\n🛑 Shutting down gracefully...");
    running = false;
  });

  process.on("SIGTERM", () => {
    console.log("\n🛑 Received SIGTERM, shutting down...");
    running = false;
  });

  while (running) {
    try {
      const job = await pollForJob(config);

      if (job) {
        console.log(`📋 Job found: ${job.id.slice(0, 8)} [${job.adapter}] "${job.prompt.slice(0, 60)}..."`);

        // Claim the job
        const claimed = await claimJob(config, job.id);
        console.log(`  🔒 Claimed job ${claimed.id.slice(0, 8)}`);

        // Execute
        await executeJob(config, claimed);
        console.log();
      }

      consecutiveErrors = 0;
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

    // Wait before next poll
    if (running) {
      await new Promise((r) => setTimeout(r, config.pollIntervalMs));
    }
  }

  console.log("👋 MaestroClaw stopped.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
