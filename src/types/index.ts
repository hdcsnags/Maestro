export type ExecutionMode = 'analyze' | 'pr_flow' | 'elevated';
export type SessionStatus = 'active' | 'archived';
export type RoundStatus = 'pending' | 'broadcasting' | 'complete';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ExecutionStrategy = 'per_agent' | 'synthesized';
export type OrchestrationMode = 'analysis' | 'build' | 'artifact' | 'build_task';
export type ExecutionRunStatus = 'pending' | 'approved' | 'running' | 'complete' | 'failed';
export type SessionMode = 'ask' | 'build';
export type AgentRole = 'council' | 'executor';
export type ThreadType = 'concierge' | 'broadcast' | 'direct' | 'execution';
export type ThreadStatus = 'active' | 'completed' | 'pinned' | 'archived';
export type ThreadMessageRole = 'user' | 'agent' | 'concierge' | 'system';
export type ContextWeight = 'primary' | 'supporting' | 'background';
export type ClawView = 'concierge' | 'carousel' | 'focus';

export interface Workspace {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  description: string;
  created_at: string;
}

export interface ProviderConnection {
  id: string;
  user_id: string;
  provider: string;
  display_name: string;
  is_connected: boolean;
  models: string[];
}

export interface AgentSkill {
  id: string;
  agent_id: string;
  user_id: string;
  name: string;
  instruction: string;
  scoped_paths: string[];
  is_active: boolean;
  created_at: string;
}

export interface Agent {
  id: string;
  workspace_id: string;
  name: string;
  display_name: string;
  role: string;
  provider: string;
  model: string;
  color: string;
  is_active: boolean;
  sort_order: number;
  slot_index: number;
  provider_group: string;
  scoped_paths?: string[];
  skills?: AgentSkill[];
  agent_role?: AgentRole;
}

// ─── Claw Mode: Thread primitives ───────────────────────────────
export interface Thread {
  id: string;
  session_id: string;
  type: ThreadType;
  agent_id?: string | null;
  status: ThreadStatus;
  include_in_synthesis: boolean;
  parent_thread_id?: string | null;
  title?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ThreadMessage {
  id: string;
  thread_id: string;
  role: ThreadMessageRole;
  agent_id?: string | null;
  content: string;
  context_weight: ContextWeight;
  metadata: Record<string, unknown>;
  created_at: string;
}

// All models available as concierge (union of direct + OpenRouter)
export const CONCIERGE_MODELS: { id: string; label: string; provider: string }[] = [
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', provider: 'anthropic' },
  { id: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'claude-opus-4-6', label: 'Claude Opus 4.6', provider: 'anthropic' },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 Mini', provider: 'openai' },
  { id: 'gpt-5.4', label: 'GPT-5.4', provider: 'openai' },
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', provider: 'google' },
  { id: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro', provider: 'google' },
];

export interface Session {
  id: string;
  workspace_id: string;
  title: string;
  execution_mode: ExecutionMode;
  status: SessionStatus;
  mode: SessionMode;
  github_repo?: string;
  supabase_project_url?: string;
  created_at: string;
  current_phase?: SessionPhase;
  build_spec?: Record<string, unknown>;
  build_spec_locked?: boolean;
  project_type?: 'new' | 'existing';
  architect_md?: string;
  execution_backend?: 'edge' | 'local' | 'auto';
}

export interface Round {
  id: string;
  session_id: string;
  round_number: number;
  prompt: string;
  target_agents: string[];
  status: RoundStatus;
  created_at: string;
}

export interface ResponseSignals {
  synthesis_fit?: string;
  risk?: string;
  confidence?: string;
  [key: string]: string | undefined;
}

export interface ResponseArtifact {
  filename: string;
  content_type: string;
  content: string;
  raw_content?: string;
  normalized?: boolean;
  extraction_method?: string;
}

export interface FileManifestEntry {
  path: string;
  content: string | null; // null = delete
  operation: 'upsert' | 'delete';
  content_hash?: string;
}

export interface Response {
  id: string;
  round_id: string;
  agent_id: string | null;
  agent_name: string;
  agent_role: string;
  agent_color: string;
  provider: string;
  model: string;
  content: string;
  title: string;
  signals: ResponseSignals;
  artifacts: ResponseArtifact[];
  file_manifest?: FileManifestEntry[];
  artifact_protocol?: string;
  complete?: boolean;
  continuation_prompt?: string;
  manifest_errors?: Array<{ path: string; reason: string }>;
  is_flagged: boolean;
  is_lead: boolean;
  is_pinned?: boolean;
  tokens_used: number;
  created_at: string;
}

export type SessionPhase = 'analysis' | 'design' | 'pre_build' | 'build' | 'bouncer' | 'complete';
export type ConciergePhase = 'post_round1' | 'post_round2' | 'design' | 'pre_build' | 'post_build';
export type ConciergeIntent = 'simple_ask' | 'analysis' | 'design' | 'pre_build' | 'build';
export type DesignMode = 'lite' | 'standard' | 'exploration';
export type BuildLaneRole = 'builder' | 'reviewer' | 'read_only' | 'security_audit';
export type BuildTaskStatus = 'queued' | 'dispatched' | 'waiting' | 'completed' | 'failed' | 'rerouted' | 'skipped';

export interface BuildTask {
  id: string;
  session_id: string;
  build_round_id?: string | null;
  task_id: string;
  file_path: string;
  lane_owner: string | null;
  fallback_owner: string | null;
  dependencies: string[];
  status: BuildTaskStatus;
  retry_count: number;
  max_retries: number;
  prompt_slice: string;

  // Failure / reroute metadata
  skip_reason?: string | null;
  failure_reason?: string | null;
  provider_error?: string | null;
  rerouted_from?: string | null;

  // Result (populated on completion)
  result_content?: string | null;
  result_operation?: 'create' | 'update' | 'delete' | null;
  result_builder?: string | null;
  completed_at?: string | null;

  // V3 routing
  execution_backend?: 'edge' | 'local' | 'auto';
  executor_job_id?: string | null;

  created_at?: string;
  updated_at?: string;
}

export interface BuildLane {
  id?: string;
  session_id: string;
  agent_id: string;
  agent_name: string;
  lane_paths: string[];
  role: BuildLaneRole;
  allowed_handoffs?: string[];
  created_at?: string;
}

export interface SuggestedLane {
  agent_name: string;
  lane_paths: string[];
  role: BuildLaneRole;
}

export interface IntakeSummary {
  stack: string[];
  architecture_notes: string;
  risk_files: string[];
  safe_zones: string[];
  estimated_complexity: 'low' | 'medium' | 'high';
}

export interface ConciergeDecision {
  id?: string;
  session_id: string;
  phase: ConciergePhase;
  alignment_summary: string;
  tension_points: string[];
  recommended_direction: string;
  conductor_choice?: string | null;
  model_used?: string | null;
  created_at?: string;
  // B1 — intent classification
  intent?: ConciergeIntent;
  design_mode?: DesignMode;
  recommended_next_phase?: 'design' | 'pre_build' | 'build' | 'analysis';
  intent_reasoning?: string;
  applied_phase?: SessionPhase;
}

export interface TriageResult {
  route: 'simple_ask' | 'orchestra';
  intent: 'simple_ask' | 'analysis' | 'design' | 'pre_build' | 'build';
  confidence: number;
  reasoning: string;
  direct_answer?: string;
  prompt?: string;
}

export interface BuildPlan {
  build_prompt: string;
  build_summary: string;
  builder_agents: Array<{
    agent_id: string;
    agent_name: string;
    scoped_paths: string[];
    instruction: string;
  }>;
  model_used?: string;
}

export interface Synthesis {
  id: string;
  round_id: string;
  content: string;
  lead_agent_id: string | null;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  session_id: string | null;
  event_type: string;
  actor: string;
  provider: string;
  model: string;
  execution_mode: string;
  requires_approval: boolean;
  succeeded: boolean;
  created_at: string;
}

export interface RepoConnection {
  id: string;
  workspace_id: string;
  user_id: string;
  provider: string;
  owner: string;
  repo: string;
  default_branch: string;
  scoped_paths: string[];
  is_active: boolean;
  created_at: string;
}

export interface Executor {
  id: string;
  owner_user_id: string;
  name: string;
  kind: string;
  status: 'offline' | 'online' | 'busy' | 'error';
  last_seen_at: string | null;
  capabilities: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ExecutorJob {
  id: string;
  session_id: string | null;
  executor_id: string | null;
  requested_by: string;
  job_type: string;
  adapter: string;
  prompt: string;
  repo_url: string | null;
  repo_name: string | null;
  branch: string | null;
  allowed_paths: string[];
  timeout_seconds: number;
  approval_required: boolean;
  status: 'queued' | 'approved' | 'claimed' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'expired';
  result_summary: string | null;
  error_text: string | null;
  artifact_manifest: unknown;
  build_task_id: string | null;
  context_bundle: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  claimed_at: string | null;
  lease_expires_at: string | null;
  started_at: string | null;
  completed_at: string | null;
}

// ─── Claw Build Session State (in-thread card) ──────────────
export interface ClawBuildSessionState {
  threadId: string;
  builderNames: string[];
  suggestedScope: string;
  executionBackend: 'local' | 'auto' | 'edge';
  activeJobId: string | null;
  defaultAdapter?: string | null;
}

export interface SessionBuildManifestEntry {
  path: string;
  content: string;
  operation: string;
}

export interface SessionBuildProgress {
  status: 'idle' | 'running' | 'succeeded' | 'failed';
  filesWritten: number;
  jobId: string | null;
  manifest: SessionBuildManifestEntry[];
  errorText: string | null;
}

export interface SessionRunProgress {
  key: string;
  builderName: string;
  adapter: string;
  scopePaths: string[];
  status: 'queued' | 'running' | 'succeeded' | 'failed';
  filesWritten: number;
  jobId: string | null;
  manifest: SessionBuildManifestEntry[];
  errorText: string | null;
}

export interface SessionBuildState {
  progress: SessionBuildProgress;
  runs: SessionRunProgress[];
  isRunning: boolean;
}

export function createEmptySessionBuildState(): SessionBuildState {
  return {
    progress: {
      status: 'idle',
      filesWritten: 0,
      jobId: null,
      manifest: [],
      errorText: null,
    },
    runs: [],
    isRunning: false,
  };
}

export interface ExecutionRun {
  id: string;
  session_id: string;
  user_id: string;
  synthesis_id: string | null;
  repo_connection_id: string | null;
  execution_mode: string;
  status: ExecutionRunStatus;
  strategy: ExecutionStrategy;
  branch_name: string;
  pr_url: string;
  patch_content: string;
  result: Record<string, unknown>;
  requires_approval: boolean;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApprovalFileEntry {
  path: string;
  lines_added?: number;
  lines_removed?: number;
}

export interface ApprovalRequest {
  id: string;
  execution_run_id: string;
  user_id: string;
  action_type: string;
  description: string;
  status: ApprovalStatus;
  decided_at: string | null;
  created_at: string;
  // P11 scope binding
  expires_at?: string | null;
  repo_connection_id?: string | null;
  branch_name?: string;
  scope_paths?: string[];
  agent_name?: string;
  files_affected?: ApprovalFileEntry[];
  lines_added?: number;
  lines_removed?: number;
}

export const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#e07b5a',
  openai: '#5ab88e',
  google: '#5a8fe0',
  openrouter: '#8a8ae0',
  maestroclaw: '#c9a84c',
};

export type StabilityTier = 'stable' | 'preview' | 'expiring' | 'deprecated';

export interface AgentDefault {
  name: string;
  display_name: string;
  role: string;
  provider: string;
  model: string;
  color: string;
  is_active: boolean;
  slot_index: number;
  provider_group: string;
  stability_tier: StabilityTier;
  deprecation_date?: string;
  replacement_model_id?: string;
}

// Free-tier fallback chain — when one free model 404s or rate-limits,
// orchestrate falls forward through this map.
export const FREE_TIER_FALLBACKS: Record<string, string> = {
  'openai/gpt-oss-20b:free': 'google/gemma-4-31b-it:free',
};

// Canonical 5×3 lineup. Must stay in sync with the reseed migration
// (20260406150000_reseed_agents_5x3.sql). Default-on policy: only the four
// free-or-near-free slot-0 entries are is_active=true. All premium slots —
// including OpenRouter B slot 0 — are OFF by default. A brand-new user can
// sign up, broadcast, and pay $0 by default.
export const AGENT_DEFAULTS: AgentDefault[] = [
  // ─── Anthropic ──────────────────────────────────────────────────
  { name: 'Claude Haiku 4.5',  display_name: 'Claude Haiku 4.5',  role: 'Fast analysis · Triage',          provider: 'anthropic', model: 'claude-haiku-4-5',  color: '#e07b5a', is_active: true,  slot_index: 0, provider_group: 'anthropic', stability_tier: 'stable' },
  { name: 'Claude Sonnet 4.6', display_name: 'Claude Sonnet 4.6', role: 'Build lead · Code generation',    provider: 'anthropic', model: 'claude-sonnet-4-6', color: '#e07b5a', is_active: false, slot_index: 1, provider_group: 'anthropic', stability_tier: 'stable' },
  { name: 'Claude Opus 4.6',   display_name: 'Claude Opus 4.6',   role: 'Deep reasoning · Architecture',   provider: 'anthropic', model: 'claude-opus-4-6',   color: '#e07b5a', is_active: false, slot_index: 2, provider_group: 'anthropic', stability_tier: 'stable' },

  // ─── OpenAI ─────────────────────────────────────────────────────
  { name: 'GPT-5.4 Mini', display_name: 'GPT-5.4 Mini', role: 'Fast drafting · Summarization',     provider: 'openai', model: 'gpt-5.4-mini', color: '#5ab88e', is_active: true,  slot_index: 0, provider_group: 'openai', stability_tier: 'stable' },
  { name: 'GPT-5.4 Builder',      display_name: 'GPT-5.4 Builder',      role: 'Build lead · Code generation',     provider: 'openai', model: 'gpt-5.4', color: '#5ab88e', is_active: false, slot_index: 1, provider_group: 'openai', stability_tier: 'stable' },
  { name: 'GPT-5.4 (Reasoning)',  display_name: 'GPT-5.4 (Reasoning)',  role: 'Reasoning · Complex analysis',    provider: 'openai', model: 'gpt-5.4', color: '#5ab88e', is_active: false, slot_index: 2, provider_group: 'openai', stability_tier: 'stable' },

  // ─── Google Gemini ──────────────────────────────────────────────
  { name: 'Gemini 2.5 Flash', display_name: 'Gemini 2.5 Flash', role: 'Speed · Design · Spatial UI', provider: 'google', model: 'gemini-2.5-flash', color: '#5a8fe0', is_active: true,  slot_index: 0, provider_group: 'google', stability_tier: 'stable' },
  { name: 'Gemini 2.5 Pro',   display_name: 'Gemini 2.5 Pro',   role: 'Research · Long context',     provider: 'google', model: 'gemini-2.5-pro',   color: '#5a8fe0', is_active: false, slot_index: 1, provider_group: 'google', stability_tier: 'expiring', deprecation_date: '2026-06-17', replacement_model_id: 'gemini-3.1-pro-preview' },
  { name: 'Gemini 2.5 Flash', display_name: 'Gemini 2.5 Flash', role: 'Long context · Flash',        provider: 'google', model: 'gemini-2.5-flash', color: '#5a8fe0', is_active: false, slot_index: 2, provider_group: 'google', stability_tier: 'stable' },

  // ─── OpenRouter A — Free row ────────────────────────────────────
  { name: 'GPT-OSS 20B (free)', display_name: 'GPT-OSS 20B (free)', role: 'Free · General purpose default',  provider: 'openrouter', model: 'openai/gpt-oss-20b:free',          color: '#8a8ae0', is_active: true,  slot_index: 0, provider_group: 'openrouter_a', stability_tier: 'stable' },
  { name: 'Gemma 4 31B (free)', display_name: 'Gemma 4 31B (free)', role: 'Free · Fallback general purpose', provider: 'openrouter', model: 'google/gemma-4-31b-it:free',       color: '#8a8ae0', is_active: false, slot_index: 1, provider_group: 'openrouter_a', stability_tier: 'stable' },
  { name: 'Llama 4 Maverick',   display_name: 'Llama 4 Maverick',   role: 'Meta frontier',                   provider: 'openrouter', model: 'meta-llama/llama-4-maverick',       color: '#8a8ae0', is_active: false, slot_index: 2, provider_group: 'openrouter_a', stability_tier: 'stable' },

  // ─── OpenRouter B — Premium row (all OFF by default) ────────────
  { name: 'Sonnet 4.6 (OR)', display_name: 'Sonnet 4.6 (OR)', role: 'Premium · Build lead',              provider: 'openrouter', model: 'anthropic/claude-sonnet-4-6',     color: '#8a8ae0', is_active: false, slot_index: 0, provider_group: 'openrouter_b', stability_tier: 'stable' },
  { name: 'GPT-5.4 Builder (OR)', display_name: 'GPT-5.4 Builder (OR)', role: 'Premium · Build lead',     provider: 'openrouter', model: 'openai/gpt-5.4',                  color: '#8a8ae0', is_active: false, slot_index: 1, provider_group: 'openrouter_b', stability_tier: 'stable' },
  // Kimi K2 — Moonshot rotates slugs (e.g. moonshotai/kimi-k2-0905). If
  // broadcasts to this slot 404, update to whatever OpenRouter currently lists.
  { name: 'Kimi K2',         display_name: 'Kimi K2',         role: 'Premium · Long context · Reasoning', provider: 'openrouter', model: 'moonshotai/kimi-k2',              color: '#8a8ae0', is_active: false, slot_index: 2, provider_group: 'openrouter_b', stability_tier: 'stable' },

  // ─── MaestroClaw — Local CLI execution (no API cost) ─────────────
  // These agents route through MaestroClaw to local CLI tools. They
  // only work when an executor is online. The `model` field doubles
  // as the MaestroClaw adapter name for local dispatch routing.
  { name: 'ClawClaude',  display_name: '🖥️ ClawClaude',  role: 'Local build · Claude Code CLI',   provider: 'maestroclaw', model: 'claude_code',  color: '#c9a84c', is_active: false, slot_index: 0, provider_group: 'maestroclaw', stability_tier: 'stable' },
  { name: 'ClawCopilot', display_name: '🖥️ ClawCopilot', role: 'Local build · Copilot CLI',       provider: 'maestroclaw', model: 'copilot_cli',  color: '#c9a84c', is_active: false, slot_index: 1, provider_group: 'maestroclaw', stability_tier: 'stable' },
  { name: 'ClawCodex',   display_name: '🖥️ ClawCodex',   role: 'Local build · OpenAI Codex CLI',  provider: 'maestroclaw', model: 'codex_cli',    color: '#c9a84c', is_active: false, slot_index: 2, provider_group: 'maestroclaw', stability_tier: 'stable' },
  { name: 'ClawGemini',  display_name: '🖥️ ClawGemini',  role: 'Local build · Google Gemini CLI', provider: 'maestroclaw', model: 'gemini_cli',   color: '#c9a84c', is_active: false, slot_index: 3, provider_group: 'maestroclaw', stability_tier: 'stable' },
];

export const OPENROUTER_FREE_MODELS: OpenRouterModel[] = [
  { id: 'openai/gpt-oss-20b:free', label: 'GPT-OSS 20B (free)', tier: 'free' },
  { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B (free)', tier: 'free' },
  { id: 'openai/gpt-oss-120b:free', label: 'GPT-OSS 120B', tier: 'free' },
  { id: 'meta-llama/llama-4-maverick', label: 'Llama 4 Maverick', tier: 'paid' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'Nemotron 3 Super', tier: 'free' },
];

export const CO_LEAD_MODELS: OpenRouterModel[] = [
  { id: 'anthropic/claude-opus-4-6', label: 'Claude Opus 4.6', tier: 'paid' },
  { id: 'openai/gpt-5.4', label: 'GPT-5.4', tier: 'paid' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'paid' },
  { id: 'x-ai/grok-4.20', label: 'Grok 4.20', tier: 'paid' },
  { id: 'mistralai/mistral-large', label: 'Mistral Large', tier: 'paid' },
];

export interface OpenRouterModel {
  id: string;
  label: string;
  tier: 'free' | 'paid';
}

export const OPENROUTER_MODELS: OpenRouterModel[] = [
  { id: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6', tier: 'paid' },
  { id: 'anthropic/claude-opus-4-6', label: 'Claude Opus 4.6', tier: 'paid' },
  { id: 'anthropic/claude-haiku-4-5', label: 'Claude Haiku 4.5', tier: 'paid' },
  { id: 'openai/gpt-5.4', label: 'GPT-5.4', tier: 'paid' },
  { id: 'openai/gpt-5.4-mini', label: 'GPT-5.4 mini', tier: 'paid' },
  { id: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro', tier: 'paid' },
  { id: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash', tier: 'paid' },
  { id: 'google/gemini-3.1-flash-lite-preview-20260303', label: 'Gemini 3.1 Flash Lite (preview)', tier: 'paid' },
  { id: 'x-ai/grok-4.20', label: 'Grok 4.20', tier: 'paid' },
  { id: 'meta-llama/llama-4-maverick', label: 'Llama 4 Maverick', tier: 'paid' },
  { id: 'openai/gpt-oss-20b:free', label: 'GPT-OSS 20B (free)', tier: 'free' },
  { id: 'openai/gpt-oss-120b:free', label: 'GPT-OSS 120B', tier: 'free' },
  { id: 'google/gemma-4-31b-it:free', label: 'Gemma 4 31B (free)', tier: 'free' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'Nemotron 3 Super', tier: 'free' },
];

// ─── Sprint B · B2 — Designer lanes ──────────────────────────────
export type DesignerRole =
  | 'visual_spatial'
  | 'structure_ux'
  | 'product_practical'
  | 'wildcard_fusion';

export interface DesignerLane {
  role: DesignerRole;
  display_name: string;
  description: string;
  preferred_model: string;
  fallback_model: string;
}

export const DESIGNER_LANES: DesignerLane[] = [
  {
    role: 'visual_spatial',
    display_name: 'Visual Lead',
    description: 'Layout, visual hierarchy, mockup feel',
    preferred_model: 'gpt-5.4',
    fallback_model: 'gpt-5.4-mini',
  },
  {
    role: 'structure_ux',
    display_name: 'Structure Lead',
    description: 'App shell, flow, information architecture',
    preferred_model: 'claude-sonnet-4-6',
    fallback_model: 'claude-haiku-4-5',
  },
  {
    role: 'product_practical',
    display_name: 'Product Lead',
    description: 'Realistic UX, PM thinking, constraints',
    preferred_model: 'gpt-5.4-mini',
    fallback_model: 'openai/gpt-oss-20b:free',
  },
  {
    role: 'wildcard_fusion',
    display_name: 'Wildcard',
    description: 'Blending, bold options, style exploration',
    preferred_model: 'x-ai/grok-4.20',
    fallback_model: 'google/gemma-4-31b-it:free',
  },
];

export const DESIGN_MODE_LANES: Record<'lite' | 'standard' | 'exploration', DesignerRole[]> = {
  lite: ['visual_spatial'],
  standard: ['visual_spatial', 'structure_ux'],
  exploration: ['visual_spatial', 'structure_ux', 'product_practical', 'wildcard_fusion'],
};

export const PROVIDER_REGISTRY = [
  { id: 'anthropic', name: 'Anthropic', models: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-6'] },
  { id: 'openai', name: 'OpenAI', models: ['gpt-5.4-mini', 'gpt-5.4'] },
  { id: 'google', name: 'Google Gemini', models: ['gemini-2.5-flash', 'gemini-2.5-pro'] },
  { id: 'openrouter', name: 'OpenRouter', models: OPENROUTER_MODELS.map(m => m.id) },
  { id: 'maestroclaw', name: 'MaestroClaw (Local)', models: ['claude_code', 'copilot_cli', 'codex_cli', 'gemini_cli'] },
];

// ─── Execution in Chat (Phase 2) ──────────────────────────────

export type ExecutionCommandTrust = 'trusted' | 'approval_required';

export interface ExecutionIntent {
  action: string;
  command?: string;
  params: Record<string, string>;
  adapter: 'approved_shell' | 'claude_code' | 'github_api';
  trust: ExecutionCommandTrust;
  description: string;
}

export const TRUSTED_COMMANDS: { pattern: RegExp; description: string }[] = [
  { pattern: /^git\s+status/, description: 'Check repo status' },
  { pattern: /^git\s+log/, description: 'View commit history' },
  { pattern: /^git\s+diff/, description: 'View changes' },
  { pattern: /^git\s+branch/, description: 'List branches' },
  { pattern: /^ls\b/, description: 'List directory' },
  { pattern: /^dir\b/, description: 'List directory (Windows)' },
  { pattern: /^cat\b/, description: 'View file contents' },
  { pattern: /^type\b/, description: 'View file contents (Windows)' },
  { pattern: /^npm\s+list/, description: 'List packages' },
  { pattern: /^npm\s+outdated/, description: 'Check outdated packages' },
  { pattern: /^node\s+--version/, description: 'Node version' },
  { pattern: /^gh\s+repo\s+view/, description: 'View repo info' },
  { pattern: /^gh\s+issue\s+list/, description: 'List issues' },
  { pattern: /^gh\s+pr\s+list/, description: 'List pull requests' },
];

export function classifyCommandTrust(command: string): ExecutionCommandTrust {
  const trimmed = command.trim();
  return TRUSTED_COMMANDS.some(t => t.pattern.test(trimmed)) ? 'trusted' : 'approval_required';
}

export const EXECUTION_INTENT_PROMPT = `You are Maestro's execution parser. The user wants to execute a command or action.
Analyze their message and return a JSON object with:
- "action": short name (e.g., "create_repo", "shell_command", "install_deps", "git_push")
- "command": the actual shell command to run (if applicable)
- "params": key-value pairs of extracted parameters (e.g., {"repo_name": "nexshield", "visibility": "public"})
- "adapter": one of "approved_shell" (for shell/git/npm commands), "github_api" (for repo creation, PR ops), "claude_code" (for code generation tasks)
- "description": one-line human-readable description of what this will do

Return ONLY valid JSON. No markdown fences, no explanation.`;

