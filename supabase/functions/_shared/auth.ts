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

function jsonResponse(body: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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
  const userClient = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: normalizedAuthHeader } },
  });
  const adminClient = createClient(supabaseUrl, serviceRoleKey);

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
