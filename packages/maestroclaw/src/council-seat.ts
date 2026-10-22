// `council_seat` executor jobs (2026-10-22): the web council can seat a LOCAL CLI model.
// The job carries the full seat prompt; the worker runs the adapter once in task mode
// (no Ralph loop, no artifact extraction), extracts the verdict block if the brief asked
// for one, and completes the job with the whole response in artifact_manifest. The
// executor-api `complete` action then writes a `responses` row for the round named in
// `context_bundle.round_id`, so the carousel, deliberation and synthesis see the local
// seat exactly like a cloud one. Pairs with Power 1's Council Runtime (same verdict
// contract) and closes the "local vs remote" gap for the web.

import { mkdirSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import type { ClawConfig } from "./config.js";
import type { ExecutorJob } from "./api.js";
import { reportEvent, completeJob } from "./api.js";
import { getAdapter } from "./adapters/index.js";
import { makeAdapter } from "./council/seats.js";
import type { SeatAdapter } from "./council/types.js";
import { extractVerdict } from "./council/verdict.js";
import { StreamThrottle } from "./lib/stream-throttle.js";

const MAX_CONTENT_CHARS = 120_000;

export async function executeCouncilSeatJob(config: ClawConfig, job: ExecutorJob): Promise<void> {
  const jobDir = resolve(join(config.workspaceDir, job.id));
  let workDir = jobDir;
  let succeeded = false;
  const bundle = (job.context_bundle ?? {}) as Record<string, unknown>;
  const throttle = new StreamThrottle(async (type, lines, seq) => {
    await reportEvent(config, job.id, type === "stdout" ? "stdout" : "stderr", { lines, seq, streaming: true });
  });
  try {
    await reportEvent(config, job.id, "status_change", { status: "running" });
    mkdirSync(jobDir, { recursive: true });
    if (job.repo_url) {
      const args = ["clone", "--depth", "1", ...(job.branch ? ["--branch", job.branch] : []), job.repo_url, "repo"];
      execFileSync("git", args, { cwd: jobDir, timeout: 60_000, stdio: "pipe" });
      workDir = join(jobDir, "repo");
    }
    // Per-seat model (context_bundle.model) via the Council Runtime's seat factory, so a web council
    // can seat e.g. codex:gpt-6-astra and agy:claude-opus-5-5-high in the same round. Codex seats run
    // read-only; everything else uses its task path. Unknown adapters fall back to the registry.
    const seatAdapters = new Set(["codex_cli", "agy_cli", "kimi_cli", "claude_code"]);
    const adapter = seatAdapters.has(job.adapter)
      ? makeAdapter({ label: job.id.slice(0, 8), adapter: job.adapter as SeatAdapter, model: typeof bundle.model === "string" && bundle.model ? bundle.model : undefined }, "audit")
      : getAdapter(job.adapter);
    if (!(await adapter.check())) throw new Error(`Adapter "${job.adapter}" is not available on this machine`);

    const timeoutMs = Math.max(30_000, job.timeout_seconds * 1000 - 8_000);
    console.log(`  🪑 council_seat ${job.id.slice(0, 8)} [${job.adapter}] round=${String(bundle.round_id ?? "-").slice(0, 8)} agent=${String(bundle.agent_name ?? "-")}`);
    const res = await adapter.run(job.prompt, workDir, timeoutMs, (type, line) => throttle.emit(type, line));
    await throttle.drain();

    const content = res.output.trim().slice(0, MAX_CONTENT_CHARS);
    const verdict = extractVerdict(res.output);
    succeeded = res.success && content.length > 0;
    const manifest = {
      kind: "council_seat",
      adapter: job.adapter,
      model: typeof bundle.model === "string" ? bundle.model : null,
      round_id: typeof bundle.round_id === "string" ? bundle.round_id : null,
      agent_id: typeof bundle.agent_id === "string" ? bundle.agent_id : null,
      agent_name: typeof bundle.agent_name === "string" ? bundle.agent_name : null,
      content,
      verdict_status: verdict.status,
      verdict: verdict.status === "parsed" ? verdict.json : null,
      chars: content.length,
    };
    await completeJob(config, job.id, succeeded, {
      result_summary: content.slice(0, 6_000),
      ...(succeeded ? {} : { error_text: res.error ?? (content.length === 0 ? "seat returned no text" : "adapter reported failure") }),
      artifact_manifest: manifest,
    });
    console.log(`  ${succeeded ? "✅" : "❌"} council_seat ${job.id.slice(0, 8)} ${content.length} chars, verdict=${verdict.status}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ❌ council_seat ${job.id.slice(0, 8)} failed:`, message);
    try { await throttle.drain(); await reportEvent(config, job.id, "error", { message }); await completeJob(config, job.id, false, { error_text: message }); } catch { /* best effort */ }
  } finally {
    if (existsSync(jobDir) && !(succeeded && config.keepSucceededWorkspaces)) {
      try { rmSync(jobDir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
  }
}
