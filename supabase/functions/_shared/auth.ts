import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

export interface AuthenticatedRequestContext {
  adminClient: ReturnType<typeof createClient>;
  authHeader: string;
  claims: Record<string, unknown>;
  token: string;
  userClient: ReturnType<typeof createClient>;
  userId: string;
}

interface RateLimitPolicy {
  maxRequests: number;
  windowSeconds: number;
}

interface RateLimitCheckResult {
  allowed: boolean;
  remaining: number;
  retry_after_seconds: number;
}

const DEFAULT_RATE_LIMIT_POLICY: RateLimitPolicy = {
  maxRequests: 60,
  windowSeconds: 60,
};

// Keep AI-costly paths tighter while allowing normal UI bursts.
const RATE_LIMIT_POLICIES: Record<string, RateLimitPolicy> = {
  "audit-log": { maxRequests: 300, windowSeconds: 60 },
  architect: { maxRequests: 8, windowSeconds: 300 },
  bouncer: { maxRequests: 30, windowSeconds: 60 },
  concierge: { maxRequests: 30, windowSeconds: 60 },
  "concierge-triage": { maxRequests: 30, windowSeconds: 60 },
  deliberate: { maxRequests: 10, windowSeconds: 300 },
  design: { maxRequests: 8, windowSeconds: 300 },
  "executor-api": { maxRequests: 120, windowSeconds: 60 },
  "github-auth": { maxRequests: 20, windowSeconds: 300 },
  "github-create-repo": { maxRequests: 6, windowSeconds: 300 },
  "github-execute": { maxRequests: 20, windowSeconds: 300 },
  "github-read": { maxRequests: 120, windowSeconds: 60 },
  "github-repos": { maxRequests: 60, windowSeconds: 60 },
  intake: { maxRequests: 6, windowSeconds: 300 },
  "iteration-init": { maxRequests: 30, windowSeconds: 300 },
  orchestrate: { maxRequests: 30, windowSeconds: 60 },
  synthesize: { maxRequests: 20, windowSeconds: 60 },
  vault: { maxRequests: 20, windowSeconds: 300 },
};

function jsonResponse(body: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isRateLimitCheckResult(value: unknown): value is RateLimitCheckResult {
  return typeof value === "object"
    && value !== null
    && "allowed" in value
    && "remaining" in value
    && "retry_after_seconds" in value;
}

function resolveRateLimitPolicy(functionName: string): RateLimitPolicy {
  return RATE_LIMIT_POLICIES[functionName] ?? DEFAULT_RATE_LIMIT_POLICY;
}

async function enforceRateLimit(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  functionName: string,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const policy = resolveRateLimitPolicy(functionName);
  const { data, error } = await adminClient.rpc("consume_edge_rate_limit", {
    p_function_name: functionName,
    p_max_requests: policy.maxRequests,
    p_user_id: userId,
    p_window_seconds: policy.windowSeconds,
  });

  if (error) {
    const requestId = crypto.randomUUID();
    console.error(`[auth:${functionName}:${requestId}] rate limit check failed`, error);
    return jsonResponse(
      { error: "Internal server error", request_id: requestId },
      500,
      corsHeaders,
    );
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!isRateLimitCheckResult(result)) {
    const requestId = crypto.randomUUID();
    console.error(`[auth:${functionName}:${requestId}] invalid rate limit result`, data);
    return jsonResponse(
      { error: "Internal server error", request_id: requestId },
      500,
      corsHeaders,
    );
  }

  if (result.allowed) {
    return null;
  }

  return new Response(
    JSON.stringify({
      error: "RATE_LIMIT_EXCEEDED",
      message: `Too many ${functionName} requests. Retry in ${result.retry_after_seconds} seconds.`,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(result.retry_after_seconds),
      },
    },
  );
}

function getAuthToken(authHeader: string | null): { token: string } | { error: string } {
  if (!authHeader) {
    return { error: "Missing Authorization header" };
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return { error: "Authorization header must be Bearer <token>" };
  }

  return { token };
}

export async function requireAuthenticatedRequest(
  req: Request,
  corsHeaders: Record<string, string>,
  functionName: string,
): Promise<AuthenticatedRequestContext | Response> {
  const authHeader = req.headers.get("Authorization");
  const parsed = getAuthToken(authHeader);
  if ("error" in parsed) {
    console.warn(`[auth:${functionName}] missing Authorization header`, { method: req.method, url: req.url });
    return jsonResponse(
      { error: "AUTH_HEADER_MISSING", message: parsed.error },
      401,
      corsHeaders,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const publishableKey = Deno.env.get("SB_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authClient = createClient(supabaseUrl, publishableKey);
  const { data, error } = await authClient.auth.getClaims(parsed.token);
  const userId = typeof data?.claims?.sub === "string" ? data.claims.sub : "";

  if (error || !userId) {
    console.warn(`[auth:${functionName}] invalid token`, {
      error: error?.message ?? null,
      hasClaims: !!data?.claims,
    });
    return jsonResponse(
      { error: "INVALID_TOKEN", message: "Invalid or expired access token." },
      401,
      corsHeaders,
    );
  }

  const normalizedAuthHeader = `Bearer ${parsed.token}`;
  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const rateLimitResponse = await enforceRateLimit(
    adminClient,
    userId,
    functionName,
    corsHeaders,
  );
  if (rateLimitResponse) {
    return rateLimitResponse;
  }
  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: normalizedAuthHeader } },
  });

  return {
    adminClient,
    authHeader: normalizedAuthHeader,
    claims: (data?.claims ?? {}) as Record<string, unknown>,
    token: parsed.token,
    userClient,
    userId,
  };
}

export function logPermissionFailure(
  functionName: string,
  reason: string,
  details: Record<string, unknown> = {},
) {
  console.warn(`[auth:${functionName}] downstream permission failure`, {
    reason,
    ...details,
  });
}

export function respondJson(
  corsHeaders: Record<string, string>,
  body: unknown,
  status = 200,
): Response {
  return jsonResponse(body, status, corsHeaders);
}

export function respondInternalError(
  functionName: string,
  corsHeaders: Record<string, string>,
  error: unknown,
): Response {
  const requestId = crypto.randomUUID();
  console.error(`[${functionName}:${requestId}] internal error`, error);
  return jsonResponse(
    { error: "Internal server error", request_id: requestId },
    500,
    corsHeaders,
  );
}
