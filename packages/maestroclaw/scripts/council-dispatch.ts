#!/usr/bin/env -S npx tsx
/**
 * Compatibility shim (2026-10-21). The generic council dispatch of 2026-09-10 now lives in
 * src/council/ and runs as `maestroclaw council run …`. This file keeps the env-driven
 * invocation the Elay and Eliana skills use working unchanged:
 *
 *   SOURCE=… PROMPT_FILE=… SEATS=sol NO_GIT=1 MODE=audit npx tsx scripts/council-dispatch.ts
 *
 * Differences from the old script: seats on different models run in ONE process
 * (astra and sol no longer need separate invocations), CLAW_*_MODEL env vars are only
 * fallbacks for seats whose catalog entry has no model, outputs gain manifest.json,
 * matrix.md and a usage ledger, and the scratch root is configurable (COUNCIL_SCRATCH,
 * default ~/.maestroclaw/council/scratch) instead of hard-coded.
 */
import { councilMain } from "../src/council/cli.js";

councilMain(["run", ...process.argv.slice(2)]).catch((e) => {
  console.error("[council] FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
