import "dotenv/config";

export interface ClawConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  email: string;
  password: string;
  executorToken: string;
  pollIntervalMs: number;
  workspaceDir: string;
}

function required(key: string): string {
  const val = process.env[key];
  if (!val) {
    console.error(`❌ Missing required env var: ${key}`);
    console.error(`   Copy .env.example to .env and fill in all values.`);
    process.exit(1);
  }
  return val;
}

export function loadConfig(): ClawConfig {
  return {
    supabaseUrl: required("SUPABASE_URL"),
    supabaseAnonKey: required("SUPABASE_ANON_KEY"),
    email: required("MAESTRO_EMAIL"),
    password: required("MAESTRO_PASSWORD"),
    executorToken: required("EXECUTOR_TOKEN"),
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS ?? "5000", 10),
    workspaceDir:
      process.env.WORKSPACE_DIR ??
      `${process.env.HOME ?? process.env.USERPROFILE}/.maestroclaw/workspaces`,
  };
}
