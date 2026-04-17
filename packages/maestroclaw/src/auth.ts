import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { ClawConfig } from "./config.js";

let client: SupabaseClient | null = null;
let accessToken: string | null = null;

export async function authenticate(
  config: ClawConfig
): Promise<{ client: SupabaseClient; accessToken: string }> {
  const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey);

  const { data, error } = await supabase.auth.signInWithPassword({
    email: config.email,
    password: config.password,
  });

  if (error || !data.session) {
    console.error("❌ Auth failed:", error?.message ?? "No session returned");
    process.exit(1);
  }

  client = supabase;
  accessToken = data.session.access_token;

  console.log(`✅ Authenticated as ${config.email}`);
  return { client: supabase, accessToken: data.session.access_token };
}

export function getClient(): SupabaseClient {
  if (!client) throw new Error("Not authenticated — call authenticate() first");
  return client;
}

export function getAccessToken(): string {
  if (!accessToken)
    throw new Error("Not authenticated — call authenticate() first");
  return accessToken;
}
