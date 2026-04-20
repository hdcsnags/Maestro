import { createClient } from "npm:@supabase/supabase-js@2.57.4";

type SecretsClient = ReturnType<typeof createClient>;

interface StoredSecretRow {
  id: string;
  encrypted_key: string;
  key_hint: string | null;
}

interface UpsertSecretParams {
  userId: string;
  provider: string;
  secret: string;
  keyHint?: string;
}

interface DecryptedSecretRecord {
  id: string;
  key_hint: string | null;
  secret: string;
}

const SECRET_PREFIX = "enc:v1:";
const encoder = new TextEncoder();
const decoder = new TextDecoder();
let cachedSecretsKey: Promise<CryptoKey> | null = null;

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function isEncryptedSecret(value: string): boolean {
  return value.startsWith(SECRET_PREFIX);
}

function buildAdditionalData(userId: string, provider: string): Uint8Array {
  return encoder.encode(`${userId}:${provider}`);
}

async function getSecretsKey(): Promise<CryptoKey> {
  if (!cachedSecretsKey) {
    cachedSecretsKey = (async () => {
      const rawKey =
        Deno.env.get("MAESTRO_SECRETS_KEY") ??
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

      if (!rawKey) {
        throw new Error("Missing MAESTRO_SECRETS_KEY or SUPABASE_SERVICE_ROLE_KEY");
      }

      const digest = await crypto.subtle.digest("SHA-256", encoder.encode(rawKey));
      return crypto.subtle.importKey(
        "raw",
        digest,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"],
      );
    })();
  }

  return cachedSecretsKey;
}

async function encryptSecretValue(
  secret: string,
  userId: string,
  provider: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getSecretsKey();
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: buildAdditionalData(userId, provider),
    },
    key,
    encoder.encode(secret),
  );

  return `${SECRET_PREFIX}${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`;
}

async function decryptSecretValue(
  encryptedValue: string,
  userId: string,
  provider: string,
): Promise<string> {
  if (!isEncryptedSecret(encryptedValue)) {
    return encryptedValue;
  }

  const parts = encryptedValue.split(":");
  if (parts.length !== 4 || parts[0] !== "enc" || parts[1] !== "v1") {
    throw new Error("Invalid encrypted secret format");
  }

  const iv = fromBase64(parts[2]);
  const ciphertext = fromBase64(parts[3]);
  const key = await getSecretsKey();
  const plaintext = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv,
      additionalData: buildAdditionalData(userId, provider),
    },
    key,
    ciphertext,
  );

  return decoder.decode(plaintext);
}

async function getStoredSecret(
  adminClient: SecretsClient,
  userId: string,
  provider: string,
): Promise<StoredSecretRow | null> {
  const { data, error } = await adminClient
    .from("encrypted_secrets")
    .select("id, encrypted_key, key_hint")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as StoredSecretRow | null) ?? null;
}

export async function getDecryptedSecretRecord(
  adminClient: SecretsClient,
  userId: string,
  provider: string,
): Promise<DecryptedSecretRecord | null> {
  const row = await getStoredSecret(adminClient, userId, provider);
  if (!row) {
    return null;
  }

  if (!isEncryptedSecret(row.encrypted_key)) {
    const encryptedKey = await encryptSecretValue(row.encrypted_key, userId, provider);
    const { error } = await adminClient
      .from("encrypted_secrets")
      .update({
        encrypted_key: encryptedKey,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id);

    if (error) {
      throw error;
    }

    return {
      id: row.id,
      key_hint: row.key_hint,
      secret: row.encrypted_key,
    };
  }

  return {
    id: row.id,
    key_hint: row.key_hint,
    secret: await decryptSecretValue(row.encrypted_key, userId, provider),
  };
}

export async function getDecryptedSecret(
  adminClient: SecretsClient,
  userId: string,
  provider: string,
): Promise<string | null> {
  const record = await getDecryptedSecretRecord(adminClient, userId, provider);
  return record?.secret ?? null;
}

export async function upsertEncryptedSecret(
  adminClient: SecretsClient,
  params: UpsertSecretParams,
): Promise<void> {
  const encryptedKey = await encryptSecretValue(
    params.secret,
    params.userId,
    params.provider,
  );
  const existing = await getStoredSecret(
    adminClient,
    params.userId,
    params.provider,
  );

  if (existing) {
    const updatePayload: {
      encrypted_key: string;
      updated_at: string;
      key_hint?: string;
    } = {
      encrypted_key: encryptedKey,
      updated_at: new Date().toISOString(),
    };
    if (params.keyHint !== undefined) {
      updatePayload.key_hint = params.keyHint;
    }

    const { error } = await adminClient
      .from("encrypted_secrets")
      .update(updatePayload)
      .eq("id", existing.id);

    if (error) {
      throw error;
    }

    return;
  }

  const { error } = await adminClient.from("encrypted_secrets").insert({
    user_id: params.userId,
    provider: params.provider,
    encrypted_key: encryptedKey,
    key_hint: params.keyHint ?? "",
  });

  if (error) {
    throw error;
  }
}
