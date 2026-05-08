// PRO-02: Iteration loop driver.
// Runs the read → propose → apply → verify cycle, handling abort signals,
// concurrent control polling, and stale-diff detection.

import { execFileSync, spawn } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, readdirSync, rmSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join, relative } from "node:path";
import type { ClawConfig } from "../config.js";
import {
  reportStep, completeLoop,
  pollLoopControls, applyLoopControl,
  type IterationLoopRecord, type IterationStepReport, type IterationControlRecord
} from "../api.js";
import { getAdapter, type AdapterResult } from "../adapters/index.js";
import {
  getIterationSystemPrompt, renderIterationUserMessage,
  parseIterationStepOutput, hashDiff, detectAgentStuck,
  type FileSnapshot, type PriorStepSummary
} from "./prompt.js";
import {
  applyDiffWithCheckpoint, rollbackStep, commitStep, matchesAnyScope
} from "./apply-diff.js";
import { acquireIterationLocks, releaseIterationLocks } from "./locks.js";

const CONTROL_POLL_INTERVAL_MS = 2_000;
const MAX_STDOUT_BYTES = 8 * 1024;
const MAX_CONTENT_BYTES = 32 * 1024;

interface LoopState {
  loop: IterationLoopRecord;
  workDir: string;
  priorSteps: PriorStepSummary[];
  diffHashes: string[];
  autoApply: boolean;
  aborted: boolean;
  paused: boolean;
  timeoutAt: number;
}

export async function runIterationLoop(config: ClawConfig, loop: IterationLoopRecord): Promise<void> {
  const repoFullName = loop.session_id;
  let workDir = "";
  let ownedWorkspace = false;

  try {
    // 1. Acquire locks FIRST — don't touch disk until we own the right to run
    try {
      await acquireIterationLocks(config, loop.id, loop.scope_paths, repoFullName);
    } catch (lockErr) {
      await completeLoop(config, loop.id, "failed", `lock_acquisition_failed: ${lockErr instanceof Error ? lockErr.message : String(lockErr)}`);
      return;
    }

    // 2. Set up workspace (after locks succeed)
    try {
      if (config.workDir) {
        workDir = resolve(config.workDir);
      } else {
        workDir = setupLoopWorkspace(config, loop.id);
        ownedWorkspace = true;
      }
      console.log(`  🔧 [loop] workspace: ${workDir}`);
    } catch (wsErr) {
      await completeLoop(config, loop.id, "failed", `workspace_setup_failed: ${wsErr instanceof Error ? wsErr.message : String(wsErr)}`);
      return;
    }

    const state: LoopState = {
      loop,
      workDir,
      priorSteps: [],
      diffHashes: [],
      autoApply: loop.auto_apply,
      aborted: false,
      paused: false,
      timeoutAt: Date.now() + loop.total_timeout_seconds * 1000,
    };

    // Record starting commit (best-effort; setupLoopWorkspace creates an empty one)
    let startingSha = "";
    try {
      startingSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: workDir, encoding: "utf8" }).trim();
    } catch { /* not a git repo or no commits yet */ }
    void startingSha;

    const timeoutAt = state.timeoutAt;

    for (let stepNum = 1; stepNum <= loop.max_steps; stepNum++) {
      if (state.aborted) break;

      // Busy-wait with control check when paused
      while (state.paused && !state.aborted) {
        await sleep(2000);
        await processControls(config, state);
      }
      if (state.aborted) break;

      if (Date.now() > timeoutAt) {
        await completeLoop(config, loop.id, "failed", "timeout");
        await releaseIterationLocks(config, loop.id);
        return;
      }

      const stepResult = await runStep(config, state, stepNum);
      if (stepResult === "succeeded") {
        await completeLoop(config, loop.id, "succeeded", undefined, getCurrentSha(workDir));
        await releaseIterationLocks(config, loop.id);
        return;
      }
      if (stepResult === "give_up") {
        await completeLoop(config, loop.id, "unrecoverable", "agent_gave_up");
        await releaseIterationLocks(config, loop.id);
        return;
      }
      if (stepResult === "aborted") {
        break;
      }

      // Check for repeating diff pattern (agent is stuck)
      const latestHash = state.diffHashes[state.diffHashes.length - 1];
      if (latestHash !== undefined && detectAgentStuck(state.diffHashes.slice(0, -1), latestHash)) {
        await completeLoop(config, loop.id, "failed", "agent_stuck");
        await releaseIterationLocks(config, loop.id);
        return;
      }
    }

    if (state.aborted) {
      await completeLoop(config, loop.id, "aborted", "user_aborted");
    } else {
      await completeLoop(config, loop.id, "failed", "max_steps_exceeded");
    }
  } finally {
    await releaseIterationLocks(config, loop.id).catch(() => {});
    if (ownedWorkspace && workDir) {
      const loopDir = resolve(join(config.workspaceDir, loop.id));
      if (existsSync(loopDir)) {
        if (config.keepSucceededWorkspaces) {
          try {
            const namedDir = join(config.workspaceDir, `loop-${loop.id.slice(0, 8)}`);
            renameSync(loopDir, namedDir);
            console.log(`  📁 [loop] Workspace preserved: loop-${loop.id.slice(0, 8)}`);
          } catch {
            console.warn(`  ⚠ Could not rename loop workspace ${loopDir}`);
          }
        } else {
          try { rmSync(loopDir, { recursive: true, force: true }); } catch { /* best-effort */ }
        }
      }
    }
  }
}

async function runStep(
  config: ClawConfig,
  state: LoopState,
  stepNum: number
): Promise<"succeeded" | "failed" | "give_up" | "aborted"> {
  const { loop, workDir } = state;

  // ── reading_files ────────────────────────────────────────────
  await reportStep(config, loop.id, { step_number: stepNum, state: "reading_files" });
  await processControls(config, state);
  if (state.aborted) return "aborted";

  const filesInScope = readFilesInScope(workDir, loop.scope_paths);
  await reportStep(config, loop.id, {
    step_number: stepNum,
    state: "reading_files",
    files_read: filesInScope.map(f => ({ path: f.path, sha256: f.sha256 })),
  });

  // ── proposing_diff ────────────────────────────────────────────
  await reportStep(config, loop.id, { step_number: stepNum, state: "proposing_diff" });
  await processControls(config, state);
  if (state.aborted) return "aborted";

  const userMessage = renderIterationUserMessage({
    goal: loop.goal,
    scope_paths: loop.scope_paths,
    verification_command: loop.verification_command ?? undefined,
    step_number: stepNum,
    files_in_scope: filesInScope,
    prior_steps: state.priorSteps,
    max_steps: loop.max_steps,
  });

  const systemPrompt = getIterationSystemPrompt();
  let agentOutput: string;
  try {
    agentOutput = await callAgent(config, loop, systemPrompt, userMessage, workDir, state);
  } catch (err) {
    await reportStep(config, loop.id, {
      step_number: stepNum,
      state: "failed",
      terminal_reason: `agent_call_failed: ${err instanceof Error ? err.message : String(err)}`,
    });
    state.priorSteps.push({ step_number: stepNum, diff_summary: "(agent call failed)", apply_result: "failed", verification_result: "skipped" });
    return "failed";
  }

  const parsed = parseIterationStepOutput(agentOutput);
  if (!parsed) {
    await reportStep(config, loop.id, {
      step_number: stepNum,
      state: "failed",
      terminal_reason: "agent_output_unparseable",
    });
    state.priorSteps.push({ step_number: stepNum, diff_summary: "(unparseable output)", apply_result: "failed", verification_result: "skipped" });
    return "failed";
  }

  if (parsed.give_up) {
    await reportStep(config, loop.id, {
      step_number: stepNum,
      state: "failed",
      terminal_reason: `agent_gave_up: ${parsed.give_up_rationale ?? "no rationale"}`,
    });
    return "give_up";
  }

  const diffHash = hashDiff(parsed.diff);
  state.diffHashes.push(diffHash);

  const diffFiles = parsed.diff ? parseDiffFiles(parsed.diff) : [];

  const approvalRequired = !state.autoApply;
  const stepStateAfterPropose: IterationStepReport = {
    step_number: stepNum,
    state: approvalRequired ? "awaiting_approval" : "proposing_diff",
    proposed_diff: parsed.diff,
    proposed_diff_hash: diffHash,
    proposed_diff_files: diffFiles,
    proposal_rationale: parsed.rationale,
    approval_required: approvalRequired,
  };
  await reportStep(config, loop.id, stepStateAfterPropose);

  // ── awaiting_approval (if required) ──────────────────────────
  if (approvalRequired) {
    await reportStep(config, loop.id, { step_number: stepNum, state: "awaiting_approval" });
    const approvalResult = await waitForApproval(config, state, stepNum);
    if (approvalResult === "rejected") {
      await reportStep(config, loop.id, { step_number: stepNum, state: "failed", terminal_reason: "user_rejected_diff" });
      state.priorSteps.push({ step_number: stepNum, diff_summary: parsed.rationale.slice(0, 60), apply_result: "rejected", verification_result: "skipped" });
      return "failed";
    }
    if (approvalResult === "aborted") return "aborted";
  }

  // ── applying ─────────────────────────────────────────────────
  await reportStep(config, loop.id, { step_number: stepNum, state: "applying" });
  await processControls(config, state);
  if (state.aborted) return "aborted";

  const applyResult = applyDiffWithCheckpoint({ workDir, diff: parsed.diff, scope_paths: loop.scope_paths });
  if (!applyResult.ok) {
    await reportStep(config, loop.id, {
      step_number: stepNum,
      state: "failed",
      apply_succeeded: false,
      apply_error: applyResult.details ?? applyResult.reason,
      terminal_reason: applyResult.reason,
    });
    state.priorSteps.push({ step_number: stepNum, diff_summary: parsed.rationale.slice(0, 60), apply_result: "failed", apply_error: applyResult.details, verification_result: "skipped" });
    return "failed";
  }

  await reportStep(config, loop.id, {
    step_number: stepNum,
    state: "verifying",
    apply_succeeded: true,
    pre_apply_commit_sha: applyResult.pre_apply_sha,
    verification_started_at: new Date().toISOString(),
  });

  // ── verifying (with concurrent abort watching) ────────────────
  const verifyResult = await runVerificationWithAbortWatch(
    config, state, loop.verification_command ?? null, workDir
  );

  if (state.aborted) {
    rollbackStep(workDir, applyResult.pre_apply_sha);
    return "aborted";
  }

  const now = new Date().toISOString();
  if (verifyResult.ok) {
    const commitResult = commitStep(workDir, `iteration-loop/${loop.id}/step/${stepNum}: ${parsed.rationale.slice(0, 72)}`);
    void commitResult; // ending SHA may be passed to completeLoop in a future improvement

    await reportStep(config, loop.id, {
      step_number: stepNum,
      state: "succeeded",
      verification_completed_at: now,
      verification_exit_code: verifyResult.exit_code,
      verification_stdout: verifyResult.stdout.slice(0, MAX_STDOUT_BYTES),
      verification_stderr: verifyResult.stderr.slice(0, MAX_STDOUT_BYTES),
      verification_succeeded: true,
    });

    state.priorSteps.push({
      step_number: stepNum,
      diff_summary: parsed.rationale.slice(0, 60),
      apply_result: "succeeded",
      verification_result: "passed",
    });
    return "succeeded";
  } else {
    rollbackStep(workDir, applyResult.pre_apply_sha);
    await reportStep(config, loop.id, {
      step_number: stepNum,
      state: "failed",
      verification_completed_at: now,
      verification_exit_code: verifyResult.exit_code,
      verification_stdout: verifyResult.stdout.slice(0, MAX_STDOUT_BYTES),
      verification_stderr: verifyResult.stderr.slice(0, MAX_STDOUT_BYTES),
      verification_succeeded: false,
      rolled_back: true,
    });

    state.priorSteps.push({
      step_number: stepNum,
      diff_summary: parsed.rationale.slice(0, 60),
      apply_result: "succeeded",
      verification_result: "failed",
      verification_stderr_tail: verifyResult.stderr.split("\n").slice(-30).join("\n"),
    });
    return "failed";
  }
}

async function waitForApproval(
  config: ClawConfig,
  state: LoopState,
  _stepNum: number
): Promise<"approved" | "rejected" | "aborted"> {
  const timeout = Date.now() + 10 * 60 * 1000; // 10 min wait for human
  while (Date.now() < timeout) {
    await processControls(config, state);
    if (state.aborted) return "aborted";
    const controls = await pollLoopControls(config, state.loop.id);
    for (const ctrl of controls) {
      if (ctrl.control_type === "approve_diff" && ctrl.step_id === null) {
        await applyLoopControl(config, ctrl.id, state.loop.id);
        if ((ctrl.payload as Record<string, unknown>).enable_auto_apply === true) {
          state.autoApply = true;
        }
        return "approved";
      }
      if (ctrl.control_type === "reject_diff") {
        await applyLoopControl(config, ctrl.id, state.loop.id);
        return "rejected";
      }
    }
    await sleep(CONTROL_POLL_INTERVAL_MS);
  }
  return "rejected"; // timeout = implicit reject
}

async function runVerificationWithAbortWatch(
  config: ClawConfig,
  state: LoopState,
  verificationCommand: string | null,
  workDir: string
): Promise<{ ok: boolean; exit_code: number; stdout: string; stderr: string }> {
  if (!verificationCommand) {
    return { ok: true, exit_code: 0, stdout: "", stderr: "" };
  }

  return new Promise(resolvePromise => {
    const parts = verificationCommand.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    let stdout = "";
    let stderr = "";
    let done = false;

    const child = spawn(cmd, args, {
      cwd: workDir,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });

    child.stdout?.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

    child.on("close", (code: number | null) => {
      if (done) return;
      done = true;
      resolvePromise({ ok: code === 0, exit_code: code ?? -1, stdout, stderr });
    });

    child.on("error", (err: Error) => {
      if (done) return;
      done = true;
      resolvePromise({ ok: false, exit_code: -1, stdout, stderr: err.message });
    });

    // Concurrent control polling: abort check every 2s while verifying
    const controlInterval = setInterval(() => {
      processControls(config, state).then(() => {
        if (state.aborted && !done) {
          done = true;
          clearInterval(controlInterval);
          child.kill("SIGTERM");
          setTimeout(() => { child.kill("SIGKILL"); }, 3000);
          resolvePromise({ ok: false, exit_code: -1, stdout, stderr: stderr + "\n[aborted by user]" });
        }
      }).catch(() => {});
    }, CONTROL_POLL_INTERVAL_MS);

    child.on("close", () => {
      clearInterval(controlInterval);
    });
  });
}

async function processControls(config: ClawConfig, state: LoopState): Promise<void> {
  try {
    const controls = await pollLoopControls(config, state.loop.id);
    for (const ctrl of controls) {
      if (ctrl.control_type === "abort") {
        state.aborted = true;
        await applyLoopControl(config, ctrl.id, state.loop.id);
      } else if (ctrl.control_type === "pause") {
        state.paused = true;
        await applyLoopControl(config, ctrl.id, state.loop.id);
      } else if (ctrl.control_type === "resume") {
        state.paused = false;
        await applyLoopControl(config, ctrl.id, state.loop.id);
      } else if (ctrl.control_type === "edit_goal") {
        const newGoal = (ctrl.payload as Record<string, unknown>).new_goal;
        if (typeof newGoal === "string" && newGoal.trim().length > 0) {
          state.loop = { ...state.loop, goal: newGoal.trim() };
        }
        await applyLoopControl(config, ctrl.id, state.loop.id);
      }
    }
  } catch {
    // Control poll failure is non-fatal; the loop continues
  }
}

// ── Workspace setup ──────────────────────────────────────────────────────────

function setupLoopWorkspace(config: ClawConfig, loopId: string): string {
  const workDir = resolve(join(config.workspaceDir, loopId, "repo"));
  mkdirSync(workDir, { recursive: true });

  const gitDir = join(workDir, ".git");
  if (!existsSync(gitDir)) {
    execFileSync("git", ["init", "--initial-branch=main"], { cwd: workDir, stdio: "pipe" });
    execFileSync("git", ["config", "user.email", "claw@maestro.local"], { cwd: workDir, stdio: "pipe" });
    execFileSync("git", ["config", "user.name", "MaestroClaw"], { cwd: workDir, stdio: "pipe" });
    // Initial empty commit so git rev-parse HEAD succeeds and rollbacks work from step 1
    execFileSync("git", ["commit", "--allow-empty", "-m", "claw:init"], { cwd: workDir, stdio: "pipe" });
  }
  return workDir;
}

// ── File reading ──────────────────────────────────────────────────────────────

/** Recursively walks a directory, skipping hidden dirs and common build artifacts. */
function walkTree(dir: string, baseDir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "build") continue;
      const fullPath = join(dir, entry.name);
      const relPath = relative(baseDir, fullPath).replace(/\\/g, "/");
      if (entry.isDirectory()) {
        results.push(...walkTree(fullPath, baseDir));
      } else {
        results.push(relPath);
      }
    }
  } catch { /* skip unreadable dirs */ }
  return results;
}

function readFilesInScope(workDir: string, scopePaths: string[]): FileSnapshot[] {
  const result: FileSnapshot[] = [];
  const seen = new Set<string>();
  const resolvedWorkDir = resolve(workDir);

  // Collect candidate relative paths — literal paths directly, glob patterns via dir walk
  const candidates = new Set<string>();
  const hasGlob = scopePaths.some(p => p.includes("*") || p.includes("?"));

  for (const pattern of scopePaths) {
    if (!pattern.includes("*") && !pattern.includes("?")) {
      candidates.add(pattern);
    }
  }

  if (hasGlob) {
    for (const p of walkTree(resolvedWorkDir, resolvedWorkDir)) {
      if (matchesAnyScope(p, scopePaths)) candidates.add(p);
    }
  }

  for (const relPath of candidates) {
    if (seen.has(relPath)) continue;
    seen.add(relPath);
    const fullPath = resolve(resolvedWorkDir, relPath);
    if (!existsSync(fullPath)) continue;
    try {
      const rawContent = readFileSync(fullPath);
      const sha256 = createHash("sha256").update(rawContent).digest("hex");
      const content = rawContent.toString("utf8");
      const truncated = rawContent.byteLength > MAX_CONTENT_BYTES;
      result.push({
        path: relPath,
        sha256,
        content_for_prompt: truncated ? content.slice(0, MAX_CONTENT_BYTES) : content,
        truncated,
        full_size_bytes: rawContent.byteLength,
      });
    } catch { /* unreadable — skip */ }
  }

  return result;
}

// callAgent — runs the iteration adapter and returns its raw text output.
// Uses claude_code by default; override via CLAW_ITERATION_ADAPTER env var.
// Polls loop controls concurrently so abort/pause are detected even while the
// adapter is running. Mid-run kill isn't supported (adapter doesn't expose the
// child process handle), so an abort takes effect after this call returns.
async function callAgent(
  config: ClawConfig,
  _loop: IterationLoopRecord,
  systemPrompt: string,
  userMessage: string,
  workDir: string,
  state: LoopState
): Promise<string> {
  const adapterName = process.env.CLAW_ITERATION_ADAPTER ?? "claude_code";
  const adapter = getAdapter(adapterName);

  const combined =
    `SYSTEM INSTRUCTIONS:\n${systemPrompt}\n\nUSER TASK:\n${userMessage}`;

  // Remaining-budget aware per-step timeout.
  // Floor: 30 s (model needs time to respond); cap: 3 min; uses 80% of remaining.
  const remainingMs = Math.max(0, state.timeoutAt - Date.now());
  const perStepMs = Math.max(30_000, Math.min(180_000, Math.floor(remainingMs * 0.8)));

  // Poll loop controls concurrently while the adapter runs.
  let controlPollDone = false;
  const controlPoll = (async () => {
    while (!controlPollDone && !state.aborted) {
      await sleep(CONTROL_POLL_INTERVAL_MS);
      if (!controlPollDone) await processControls(config, state).catch(() => {});
    }
  })();

  let result: AdapterResult;
  try {
    result = await adapter.run(combined, workDir, perStepMs);
  } finally {
    controlPollDone = true;
    await controlPoll.catch(() => {});
  }

  // If abort was detected during the agent call, signal give_up so the loop
  // terminates cleanly via the standard path.
  if (state.aborted) {
    return JSON.stringify({
      rationale: "user_aborted_during_agent_call",
      diff: "",
      expected_outcome: "n/a",
      confidence: "low",
      give_up: true,
      give_up_rationale: "user_aborted",
    });
  }

  if (!result.success && !result.output?.trim()) {
    throw new Error(result.error ?? "agent returned no output");
  }
  return result.output ?? "";
}

function parseDiffFiles(diff: string): string[] {
  const paths = new Set<string>();
  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git ")) {
      const m = line.match(/^diff --git a\/(\S+) b\/(\S+)/);
      if (m) paths.add(m[2]);
    }
  }
  return [...paths];
}

function getCurrentSha(workDir: string): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: workDir, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}
