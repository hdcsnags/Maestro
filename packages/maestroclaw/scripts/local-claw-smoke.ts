#!/usr/bin/env -S npx tsx
/**
 * Local end-to-end Claw smoke (2026-10-22). Against a LOCAL Supabase stack with the edge
 * functions served (`supabase start`, then `supabase functions serve --env-file …`):
 *   1. sign up / sign in a throwaway user (GoTrue REST),
 *   2. register an executor through executor-api (user JWT) → raw token,
 *   3. print the env the worker needs (or spawn it with --spawn-worker),
 *   4. submit a job through executor-api (user JWT),
 *   5. poll executor-api?action=status until the job is terminal, print the result.
 *
 * Env: API_URL (e.g. http://127.0.0.1:56321), ANON_KEY, optional SMOKE_EMAIL/SMOKE_PASSWORD,
 *      ADAPTER (default shell_stub), JOB_PROMPT, TIMEOUT_MIN (default 6).
 * Nothing here touches the hosted project.
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const API = (process.env.API_URL ?? "http://127.0.0.1:56321").replace(/\/$/, "");
const ANON = process.env.ANON_KEY ?? (() => { throw new Error("ANON_KEY required"); })();
const EMAIL = process.env.SMOKE_EMAIL ?? `claw-smoke-${Date.now()}@example.test`;
const PASSWORD = process.env.SMOKE_PASSWORD ?? "smoke-password-123!";
const ADAPTER = process.env.ADAPTER ?? "shell_stub";
const PROMPT = process.env.JOB_PROMPT ?? "Write a file named hello.txt containing the single word HELLO and reply DONE.";
const TIMEOUT_MS = Number(process.env.TIMEOUT_MIN ?? 6) * 60_000;
const SPAWN = process.argv.includes("--spawn-worker");

const log = (m: string) => console.log(`[smoke] ${m}`);

async function gotrue(path: string, body: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}/auth/v1/${path}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: ANON }, body: JSON.stringify(body) });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(data).slice(0, 300)}`);
  return data;
}
async function fn(jwt: string, action: string, method: "GET" | "POST", body?: unknown): Promise<Record<string, unknown>> {
  const res = await fetch(`${API}/functions/v1/executor-api?action=${action}`, { method, headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${jwt}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const text = await res.text();
  let data: Record<string, unknown>;
  try { data = JSON.parse(text) as Record<string, unknown>; } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`executor-api ${action} ${res.status}: ${text.slice(0, 400)}`);
  return data;
}

async function main() {
  log(`API ${API}; user ${EMAIL}; adapter ${ADAPTER}`);
  let session: Record<string, unknown>;
  try { session = await gotrue("signup", { email: EMAIL, password: PASSWORD }); } catch (e) { log(`signup: ${String(e).slice(0, 120)} — trying sign-in`); session = {}; }
  if (!session.access_token) session = await gotrue("token?grant_type=password", { email: EMAIL, password: PASSWORD });
  const jwt = String(session.access_token);
  const userId = String((session.user as Record<string, unknown>)?.id ?? "?");
  log(`signed in as ${userId}`);

  const reg = await fn(jwt, "register", "POST", { name: `smoke-${Date.now()}`, capabilities: { adapters: [ADAPTER, "shell_stub", "claude_code"] } });
  const token = String(reg.token);
  const executor = reg.executor as Record<string, unknown>;
  log(`executor registered: ${executor.id}`);

  const workerEnv = { SUPABASE_URL: API, SUPABASE_ANON_KEY: ANON, EXECUTOR_TOKEN: token, POLL_INTERVAL_MS: "2000", WORKSPACE_DIR: mkdtempSync(join(tmpdir(), "claw-smoke-ws-")), KEEP_SUCCEEDED_WORKSPACES: "true" };
  let worker: ReturnType<typeof spawn> | null = null;
  if (SPAWN) {
    worker = spawn(process.execPath, [join(process.cwd(), "dist", "index.js")], { env: { ...process.env, ...workerEnv }, stdio: ["ignore", "pipe", "pipe"] });
    worker.stdout?.on("data", (d: Buffer) => process.stdout.write(`  [worker] ${d.toString()}`));
    worker.stderr?.on("data", (d: Buffer) => process.stdout.write(`  [worker!] ${d.toString()}`));
    await new Promise((r) => setTimeout(r, 6000));
  } else {
    log(`start the worker with:\n  SUPABASE_URL=${API} SUPABASE_ANON_KEY=… EXECUTOR_TOKEN=${token} node dist/index.js`);
  }

  const sub = await fn(jwt, "submit", "POST", { prompt: PROMPT, adapter: ADAPTER, job_type: "code_task", timeout_seconds: 300, allowed_paths: ["**"] });
  const job = sub.job as Record<string, unknown> | undefined;
  if (!job?.id) { log(`submit returned: ${JSON.stringify(sub).slice(0, 400)}`); throw new Error("no job id (approval required?)"); }
  log(`job submitted: ${job.id} status=${job.status}`);

  const t0 = Date.now();
  let last = "";
  while (Date.now() - t0 < TIMEOUT_MS) {
    await new Promise((r) => setTimeout(r, 3000));
    const st = await fn(jwt, "status", "GET");
    const jobs = (st.jobs as Record<string, unknown>[]) ?? [];
    const j = jobs.find((x) => x.id === job.id);
    const execs = (st.executors as Record<string, unknown>[]) ?? [];
    const ex = execs.find((x) => x.id === executor.id);
    const line = `job=${j?.status ?? "?"} executor=${ex?.status ?? "?"} adapters=${JSON.stringify((ex?.capabilities as Record<string, unknown>)?.adapters ?? [])}`;
    if (line !== last) { log(line); last = line; }
    if (j && ["succeeded", "failed", "cancelled", "timed_out"].includes(String(j.status))) {
      log(`RESULT: ${j.status}\n  summary: ${String(j.result_summary ?? "").slice(0, 600)}\n  artifacts: ${JSON.stringify(j.artifact_manifest ?? j.artifacts ?? null)?.slice(0, 400)}`);
      worker?.kill();
      process.exit(j.status === "succeeded" ? 0 : 2);
    }
  }
  worker?.kill();
  throw new Error("timed out waiting for the job");
}
main().catch((e) => { console.error(`[smoke] FAILED: ${e instanceof Error ? e.message : e}`); process.exit(1); });
