// HMAC approval tokens for Layer 2 server-authoritative trust (SEC-02).
// Token lifecycle: server generates on first submit → client stores in memory
// → client resubmits with token → server validates → creates approved job.
// Tokens are NEVER persisted to the database.

const TOKEN_TTL_MS = 5 * 60 * 1000; // 5 minutes

export interface ApprovalTokenPayload {
  user_id: string;
  command_hash: string; // sha256(command.trim()) — exact bytes, no case folding
  adapter: string;
  expires_at: number; // unix ms
}

export type TokenValidationResult =
  | { valid: true; payload: ApprovalTokenPayload }
  | { valid: false; reason: "mismatch" | "expired" | "malformed" };

function getTokenSecret(): string | null {
  const secret = Deno.env.get("APPROVAL_TOKEN_SECRET");
  if (!secret || secret.trim().length < 16) return null;
  return secret.trim();
}

async function sha256Hex(data: string): Promise<string> {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data),
  );
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function commandHash(command: string): Promise<string> {
  // Hash exact trimmed bytes — no lowercase to avoid cross-case collision on case-sensitive FSes.
  return sha256Hex(command.trim());
}

export function isApprovalTokenConfigured(): boolean {
  return getTokenSecret() !== null;
}

export async function generateApprovalToken(
  payload: ApprovalTokenPayload,
): Promise<string> {
  const secret = getTokenSecret();
  if (!secret) throw new Error("APPROVAL_TOKEN_SECRET not configured");

  const data = JSON.stringify(payload);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data),
  );
  const sigHex = Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `hmac:v1:${btoa(data)}:${sigHex}`;
}

export async function validateApprovalToken(
  token: string,
): Promise<TokenValidationResult> {
  if (!token.startsWith("hmac:v1:")) {
    return { valid: false, reason: "malformed" };
  }

  const rest = token.slice("hmac:v1:".length);
  const colonIdx = rest.lastIndexOf(":");
  if (colonIdx === -1) return { valid: false, reason: "malformed" };

  const encoded = rest.slice(0, colonIdx);
  const receivedSig = rest.slice(colonIdx + 1);

  let data: string;
  let payload: ApprovalTokenPayload;
  try {
    data = atob(encoded);
    payload = JSON.parse(data) as ApprovalTokenPayload;
  } catch {
    return { valid: false, reason: "malformed" };
  }

  const secret = getTokenSecret();
  if (!secret) return { valid: false, reason: "malformed" };

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  const sigBytes = new Uint8Array(
    (receivedSig.match(/.{2}/g) ?? []).map((b) => parseInt(b, 16)),
  );
  const isValid = await crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes,
    new TextEncoder().encode(data),
  );

  if (!isValid) return { valid: false, reason: "mismatch" };
  if (Date.now() > payload.expires_at) return { valid: false, reason: "expired" };

  return { valid: true, payload };
}

export function makeTokenPayload(
  user_id: string,
  command_hash: string,
  adapter: string,
): ApprovalTokenPayload {
  return {
    user_id,
    command_hash,
    adapter,
    expires_at: Date.now() + TOKEN_TTL_MS,
  };
}
