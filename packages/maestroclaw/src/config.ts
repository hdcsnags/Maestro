import "dotenv/config";

export interface ClawConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  executorToken: string;
  pollIntervalMs: number;
  workspaceDir: string;
  keepSucceededWorkspaces: boolean;
  /** Max retry attempts per job before marking failed (default: 3). */
  maxRetries: number;
  /** Create a git checkpoint commit after each successful file write (default: true). */
  enableCheckpoints: boolean;
  /** How many jobs to run in parallel (default: 3). Set to 1 for sequential (legacy) behaviour. */
  maxConcurrentJobs: number;
  /**
   * How many iteration loops to run in parallel (default: 2). Previously
   * iteration loops weren't capped at all — runningLoopIds tracked them but
   * nothing ever checked its size, so maxConcurrentJobs only bounded ordinary
   * jobs while loops (each of which drives its own repeated agent
   * invocations, a heavier unit of work than one job) could stack up
   * unbounded alongside them. Kept as its own knob rather than folded into
   * maxConcurrentJobs since the two aren't equivalent units of resource use.
   */
  maxConcurrentLoops: number;
  /** Base directory for iteration loops; defaults to process.cwd() */
  workDir?: string;
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
    executorToken: required("EXECUTOR_TOKEN"),
    pollIntervalMs: parseInt(process.env.POLL_INTERVAL_MS ?? "5000", 10),
    workspaceDir:
      process.env.WORKSPACE_DIR ??
      `${process.env.HOME ?? process.env.USERPROFILE}/.maestroclaw/workspaces`,
    keepSucceededWorkspaces:
      (process.env.KEEP_SUCCEEDED_WORKSPACES ?? "true").toLowerCase() === "true",
    maxRetries: parseInt(process.env.MAX_RETRIES ?? "3", 10),
    enableCheckpoints:
      (process.env.ENABLE_CHECKPOINTS ?? "true").toLowerCase() === "true",
    maxConcurrentJobs: parseInt(process.env.MAX_CONCURRENT_JOBS ?? "3", 10),
    maxConcurrentLoops: parseInt(process.env.MAX_CONCURRENT_LOOPS ?? "2", 10),
    workDir: process.env.WORK_DIR,
  };
}
