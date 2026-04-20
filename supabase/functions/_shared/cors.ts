import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const DEFAULT_ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

function getAllowedOrigins(): Set<string> {
  const configured = (Deno.env.get("MAESTRO_ALLOWED_ORIGINS") ??
    Deno.env.get("ALLOWED_ORIGINS") ??
    "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configured]);
}

export function buildCorsHeaders(
  req: Request,
  allowedHeaders = "Content-Type, Authorization, X-Client-Info, Apikey",
): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": allowedHeaders,
    Vary: "Origin",
  };

  const origin = req.headers.get("Origin");
  if (origin && getAllowedOrigins().has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }

  return headers;
}
