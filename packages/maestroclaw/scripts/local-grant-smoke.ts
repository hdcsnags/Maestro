#!/usr/bin/env -S npx tsx
/**
 * Executor-grant smoke (2026-10-22), against a LOCAL stack with functions served:
 *   owner signs up, registers an executor, spawns the worker;
 *   grantee signs up; owner shares the executor to the grantee's email;
 *   grantee submits a council_seat job; the OWNER's worker must pick it up and complete it;
 *   grantee's status call must list the shared executor.
 * Env: API_URL, ANON_KEY; optional ADAPTER (default shell_stub — serves as a cheap seat: the
 * runner treats any adapter; use agy_cli/claude_code for a real model).
 */
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const API = (process.env.API_URL ?? "http://127.0.0.1:56321").replace(/\/$/, "");
const ANON = process.env.ANON_KEY ?? (() => { throw new Error("ANON_KEY required"); })();
const ADAPTER = process.env.ADAPTER ?? "claude_code";
const PW = "smoke-password-123!";
const log = (m: string) => console.log(`[grant-smoke] ${m}`);

async function gotrue(path: string, body: unknown) {
  const r = await fetch(`${API}/auth/v1/${path}`, { method: "POST", headers: { "Content-Type": "application/json", apikey: ANON }, body: JSON.stringify(body) });
  const d = (await r.json()) as Record<string, unknown>; if (!r.ok) throw new Error(`${path} ${r.status}: ${JSON.stringify(d).slice(0, 200)}`); return d;
}
async function fn(jwt: string, action: string, method: "GET" | "POST", body?: unknown) {
  const r = await fetch(`${API}/functions/v1/executor-api?action=${action}`, { method, headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${jwt}` }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const t = await r.text(); let d: Record<string, unknown>; try { d = JSON.parse(t); } catch { d = { raw: t }; }
  return { ok: r.ok, status: r.status, data: d };
}
async function user(label: string) {
  const email = `grant-${label}-${Date.now()}@example.test`;
  const s = await gotrue("signup", { email, password: PW });
  const jwt = String(s.access_token ?? (await gotrue("token?grant_type=password", { email, password: PW })).access_token);
  return { email, jwt, id: String((s.user as Record<string, unknown>)?.id ?? "") };
}

(async () => {
  const owner = await user("owner"); const grantee = await user("grantee");
  log(`owner ${owner.id.slice(0, 8)}  grantee ${grantee.id.slice(0, 8)}`);
  const reg = await fn(owner.jwt, "register", "POST", { name: "shared-claw", capabilities: { adapters: [ADAPTER, "shell_stub"] } });
  if (!reg.ok) throw new Error(`register: ${JSON.stringify(reg.data)}`);
  const executor = reg.data.executor as Record<string, unknown>; const token = String(reg.data.token);
  const worker = spawn(process.execPath, [join(process.cwd(), "dist", "index.js")], { env: { ...process.env, SUPABASE_URL: API, SUPABASE_ANON_KEY: ANON, EXECUTOR_TOKEN: token, POLL_INTERVAL_MS: "2000", WORKSPACE_DIR: mkdtempSync(join(tmpdir(), "grant-ws-")) }, stdio: ["ignore", "pipe", "pipe"] });
  worker.stdout?.on("data", (d: Buffer) => { const s = d.toString(); if (/council_seat|Shell job|Job found|Heartbeat/.test(s)) process.stdout.write(`  [worker] ${s}`); });
  await new Promise((r) => setTimeout(r, 6000));

  // Before sharing: grantee must NOT see the executor.
  const before = await fn(grantee.jwt, "status", "GET");
  log(`grantee sees ${((before.data.executors as unknown[]) ?? []).length} executor(s) before share (expect 0)`);

  const bad = await fn(owner.jwt, "share", "POST", { executor_id: executor.id, email: "nobody@example.test" });
  log(`share to unknown email → ${bad.status} ${String((bad.data as Record<string, unknown>).error ?? "")}`);
  const share = await fn(owner.jwt, "share", "POST", { executor_id: executor.id, email: grantee.email, job_types: ["council_seat", "concierge_turn"] });
  if (!share.ok) throw new Error(`share: ${JSON.stringify(share.data)}`);
  log(`shared ✓ grant ${String((share.data.grant as Record<string, unknown>)?.id ?? "").slice(0, 8)}`);
  const after = await fn(grantee.jwt, "status", "GET");
  const seen = (after.data.executors as Record<string, unknown>[]) ?? [];
  log(`grantee sees ${seen.length} executor(s) after share (expect 1): ${seen.map((e) => `${e.name}:${e.status}`).join(",")}`);
  const grants = await fn(owner.jwt, "grants", "GET");
  log(`owner grants given: ${((grants.data.given as unknown[]) ?? []).length}`);

  // Grantee submits a seat job; a disallowed job type must NOT be served.
  const denied = await fn(grantee.jwt, "submit", "POST", { prompt: "echo nope", adapter: "shell_stub", job_type: "code_task", timeout_seconds: 60, allowed_paths: ["**"] });
  const allowed = await fn(grantee.jwt, "submit", "POST", { prompt: "Reply with exactly: SHARED SEAT OK", adapter: ADAPTER, job_type: "council_seat", timeout_seconds: 300, allowed_paths: ["**"], context_bundle: { agent_name: "Grantee seat" } });
  if (!allowed.ok) throw new Error(`submit: ${JSON.stringify(allowed.data)}`);
  const jobId = String((allowed.data.job as Record<string, unknown>).id); const deniedId = String((denied.data.job as Record<string, unknown> | undefined)?.id ?? "");
  log(`grantee jobs: allowed ${jobId.slice(0, 8)} (council_seat), disallowed ${deniedId.slice(0, 8)} (code_task)`);

  const t0 = Date.now(); let outcome = "timeout";
  while (Date.now() - t0 < 240_000) {
    await new Promise((r) => setTimeout(r, 3000));
    const st = await fn(grantee.jwt, "status", "GET");
    const jobs = (st.data.jobs as Record<string, unknown>[]) ?? [];
    const j = jobs.find((x) => x.id === jobId); const dj = jobs.find((x) => x.id === deniedId);
    if (j && ["succeeded", "failed"].includes(String(j.status))) { outcome = `${j.status}: ${String(j.result_summary ?? "").slice(0, 120)} | disallowed job status=${dj?.status}`; break; }
  }
  log(`RESULT ${outcome}`);
  const revoke = await fn(owner.jwt, "unshare", "POST", { executor_id: executor.id, grantee_user_id: grantee.id });
  const gone = await fn(grantee.jwt, "status", "GET");
  log(`revoke → ${revoke.status}; grantee sees ${((gone.data.executors as unknown[]) ?? []).length} executor(s) after revoke (expect 0)`);
  worker.kill(); process.exit(outcome.startsWith("succeeded") ? 0 : 2);
})().catch((e) => { console.error("[grant-smoke] FAILED:", e instanceof Error ? e.message : e); process.exit(1); });
