// PRO-02: Iteration Loop Init
// User-facing edge function. Creates a new iteration_loops row.
// Validates inputs, blocks sensitive paths and unsafe verification commands.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireAuthenticatedRequest } from "../_shared/auth.ts";
import { readJsonBody } from "../_shared/body.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { hasUnsafeSyntax } from "../_shared/trusted-commands.ts";

const SENSITIVE_PATH_PATTERNS = [
  /\.env/,
  /secrets\//,
  /credentials/,
  /\/auth\.(ts|js)$/,
  /private.*key/i,
];

function hasSensitivePath(paths: string[]): boolean {
  return paths.some(p => SENSITIVE_PATH_PATTERNS.some(pat => pat.test(p)));
}

function isValidUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const auth = await requireAuthenticatedRequest(req, corsHeaders, "iteration-init");
  if (auth instanceof Response) return auth;

  const { userClient, userId } = auth;

  try {
    const bodyResult = await readJsonBody<{
      session_id?: string;
      thread_id?: string;
      goal?: string;
      scope_paths?: unknown;
      verification_command?: string;
      verification_adapter?: string;
      max_steps?: number;
      total_timeout_seconds?: number;
      auto_apply?: boolean;
      agent_id?: string;
      executor_id?: string;
    }>(req, corsHeaders, {
      maxBytes: 65_536,
      label: "iteration-init body",
    });
    if (bodyResult instanceof Response) return bodyResult;
    const body = bodyResult;

    // 1. Validate goal
    const goal = typeof body.goal === "string" ? body.goal.trim() : "";
    if (!goal) {
      return new Response(JSON.stringify({ error: "goal is required and must be a non-empty string" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Validate scope_paths
    if (!Array.isArray(body.scope_paths) || body.scope_paths.length === 0) {
      return new Response(JSON.stringify({ error: "scope_paths must be a non-empty array of strings" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const scopePaths = (body.scope_paths as unknown[])
      .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
      .map(p => p.trim());
    if (scopePaths.length === 0) {
      return new Response(JSON.stringify({ error: "scope_paths must contain at least one valid path string" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Validate session_id and ownership
    const sessionId = typeof body.session_id === "string" ? body.session_id.trim() : "";
    if (!sessionId || !isValidUuid(sessionId)) {
      return new Response(JSON.stringify({ error: "session_id must be a valid UUID" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: session, error: sessionErr } = await userClient
      .from("sessions")
      .select("id")
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionErr || !session) {
      return new Response(JSON.stringify({ error: "session not found or access denied" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Validate verification_command if provided
    const verificationCommand = typeof body.verification_command === "string" && body.verification_command.trim().length > 0
      ? body.verification_command.trim()
      : null;
    if (verificationCommand && hasUnsafeSyntax(verificationCommand)) {
      return new Response(JSON.stringify({ error: "verification_command contains unsafe shell syntax; use a simple command without metacharacters" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Block sensitive scope paths
    if (hasSensitivePath(scopePaths)) {
      return new Response(JSON.stringify({ error: "scope_paths contains sensitive files; remove auth/secrets/env paths and retry" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Clamp numeric params
    const rawMaxSteps = typeof body.max_steps === "number" ? body.max_steps : 10;
    const maxSteps = Math.max(1, Math.min(20, Math.round(rawMaxSteps)));
    const rawTimeout = typeof body.total_timeout_seconds === "number" ? body.total_timeout_seconds : 300;
    const totalTimeoutSeconds = Math.max(60, Math.min(1800, Math.round(rawTimeout)));
    const autoApply = body.auto_apply === true;
    const verificationAdapter = typeof body.verification_adapter === "string" && body.verification_adapter.trim().length > 0
      ? body.verification_adapter.trim()
      : "approved_shell";
    const threadId = typeof body.thread_id === "string" && isValidUuid(body.thread_id) ? body.thread_id : null;
    const agentId = typeof body.agent_id === "string" && isValidUuid(body.agent_id) ? body.agent_id : null;
    const executorId = typeof body.executor_id === "string" && isValidUuid(body.executor_id) ? body.executor_id : null;

    const { data: loop, error: insertErr } = await userClient
      .from("iteration_loops")
      .insert({
        session_id: sessionId,
        user_id: userId,
        thread_id: threadId,
        goal,
        scope_paths: scopePaths,
        verification_command: verificationCommand,
        verification_adapter: verificationAdapter,
        max_steps: maxSteps,
        total_timeout_seconds: totalTimeoutSeconds,
        auto_apply: autoApply,
        agent_id: agentId,
        executor_id: executorId,
        status: "pending",
      })
      .select("id")
      .single();

    if (insertErr || !loop) {
      const requestId = crypto.randomUUID();
      console.error(`[iteration-init:${requestId}] insert error`, insertErr);
      return new Response(JSON.stringify({ error: "Internal server error", request_id: requestId }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ loop_id: loop.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const requestId = crypto.randomUUID();
    console.error(`[iteration-init:${requestId}] unhandled error`, e);
    return new Response(JSON.stringify({ error: "Internal server error", request_id: requestId }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
