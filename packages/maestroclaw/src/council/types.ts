// Council Runtime — shared types. See MAESTRO_POWERS_PROPOSAL_MYTHOS-5.1.md Power 1.
//
// A "run" is a directory: prompt.md, manifest.json, <seat>.md, <seat>-verdict.json,
// optional <seat>.patch, matrix.md, CHECKPOINT.md. The manifest is rewritten after
// every seat state change so `council resume` can pick up a crashed or windowed run.

export type SeatAdapter = "codex_cli" | "agy_cli" | "kimi_cli" | "claude_code";

export interface SeatSpec {
  /** Short label used for file names and the matrix column: astra, sol, gemini, opus, kimi, sonnet… */
  label: string;
  adapter: SeatAdapter;
  /** Model passed to the CLI. Undefined = the CLI's own default. */
  model?: string;
  /** claude_code only: alternate CLAUDE_CONFIG_DIR for a second profile. */
  configDir?: string;
  /** Optional persona slug to prepend (Power 2 dissent seat, Power 8 reader swarm). */
  persona?: string;
}

export type CouncilMode = "audit" | "code";

export type SeatStatus = "queued" | "running" | "done" | "failed" | "window" | "empty" | "timeout";

export type VerdictStatus = "parsed" | "truncated" | "unparseable" | "missing";

export interface SandboxAttestation {
  /** What containment the adapter asked for. */
  mode: "read-only" | "workspace-write" | "none" | "unknown";
  /** The literal flag or mechanism. */
  flag: string;
  /** True only when the CLI itself confirmed the mode (e.g. the Codex banner). */
  verified: boolean;
}

export interface SeatAttestation {
  ran_verifier?: boolean;
  tools_used?: string[];
  files_read?: number;
  corpus_access?: "granted" | "denied" | "not_applicable" | string;
  [k: string]: unknown;
}

export interface SeatRecord {
  label: string;
  adapter: SeatAdapter;
  model: string;
  resolved_model?: string;
  status: SeatStatus;
  started_at?: string;
  finished_at?: string;
  elapsed_s?: number;
  success?: boolean;
  chars?: number;
  read_only?: string;
  sandbox?: SandboxAttestation;
  verdict?: VerdictStatus;
  attestation?: SeatAttestation;
  error?: string;
  output_file?: string;
  patch_file?: string;
  copy_dir?: string;
  reasks?: number;
}

export interface RunManifest {
  schema: "maestro.council.run/1";
  run_id: string;
  project: string;
  label: string;
  mode: CouncilMode;
  source: string;
  branch?: string;
  no_git: boolean;
  prompt_file: string;
  prompt_sha256: string;
  timeout_ms: number;
  created_at: string;
  updated_at: string;
  seats: SeatRecord[];
  checkpoints: string[];
}

export interface CouncilRunOptions {
  source: string;
  promptFile: string;
  seats: SeatSpec[];
  mode: CouncilMode;
  noGit: boolean;
  branch?: string;
  project: string;
  label: string;
  runId: string;
  outDir: string;
  scratchRoot: string;
  timeoutMs: number;
  /** Append the verdict/attestation contract to the prompt when it does not already carry one. */
  contract: boolean;
  /** Re-ask a seat for the verdict block alone when its block was truncated. */
  reaskTruncated: boolean;
  /** Only run seats whose status is not done (resume). */
  resume: boolean;
  /** Extra text prepended to the prompt per seat (persona/dissent). */
  seatPreamble?: (seat: SeatSpec) => string;
}

export interface UsageEntry {
  ts: string;
  run_id: string;
  project: string;
  seat: string;
  adapter: SeatAdapter;
  model: string;
  elapsed_s: number;
  chars: number;
  exit_class: SeatStatus;
  started_by: string;
}

/** The verdict JSON every seat is asked to emit between BEGIN VERDICT / END VERDICT. */
export interface SeatVerdict {
  seat?: string;
  attestation?: SeatAttestation;
  items?: VerdictItem[];
  verdict?: string;
  open_questions?: string[];
  [k: string]: unknown;
}

export interface VerdictClaim {
  text: string;
  status: "verified" | "unverified" | "inferred" | "disputed" | string;
  evidence?: string;
}

export interface VerdictItem {
  id: string;
  stance: "agree" | "disagree" | "partial" | "unverifiable" | string;
  summary?: string;
  severity?: string;
  claims?: VerdictClaim[];
  [k: string]: unknown;
}
