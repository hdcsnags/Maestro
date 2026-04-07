export type ExecutionMode = 'analyze' | 'pr_flow' | 'elevated';
export type SessionStatus = 'active' | 'archived';
export type RoundStatus = 'pending' | 'broadcasting' | 'complete';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ExecutionStrategy = 'per_agent' | 'synthesized';
export type OrchestrationMode = 'analysis' | 'build' | 'artifact';
export type ExecutionRunStatus = 'pending' | 'approved' | 'running' | 'complete' | 'failed';

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
}

export interface Session {
  id: string;
  workspace_id: string;
  title: string;
  execution_mode: ExecutionMode;
  status: SessionStatus;
  github_repo?: string;
  supabase_project_url?: string;
  created_at: string;
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
}

export interface FileManifestEntry {
  path: string;
  content: string | null; // null = delete
  operation: 'upsert' | 'delete';
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
  is_flagged: boolean;
  is_lead: boolean;
  is_pinned?: boolean;
  tokens_used: number;
  created_at: string;
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
  'qwen/qwen3.6-plus:free': 'openai/gpt-oss-20b:free',
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
  { name: 'GPT-5.4',      display_name: 'GPT-5.4',      role: 'PM · Policy · Scope enforcement',   provider: 'openai', model: 'gpt-5.4',      color: '#5ab88e', is_active: false, slot_index: 1, provider_group: 'openai', stability_tier: 'stable' },
  { name: 'GPT-5.4',      display_name: 'GPT-5.4',      role: 'Reasoning · Complex analysis',      provider: 'openai', model: 'gpt-5.4',      color: '#5ab88e', is_active: false, slot_index: 2, provider_group: 'openai', stability_tier: 'stable' },

  // ─── Google Gemini ──────────────────────────────────────────────
  { name: 'Gemini 2.5 Flash', display_name: 'Gemini 2.5 Flash', role: 'Speed · Design · Spatial UI', provider: 'google', model: 'gemini-2.5-flash', color: '#5a8fe0', is_active: true,  slot_index: 0, provider_group: 'google', stability_tier: 'stable' },
  { name: 'Gemini 2.5 Pro',   display_name: 'Gemini 2.5 Pro',   role: 'Research · Long context',     provider: 'google', model: 'gemini-2.5-pro',   color: '#5a8fe0', is_active: false, slot_index: 1, provider_group: 'google', stability_tier: 'expiring', deprecation_date: '2026-06-17', replacement_model_id: 'gemini-3.1-pro-preview' },
  { name: 'Gemini 2.5 Flash', display_name: 'Gemini 2.5 Flash', role: 'Long context · Flash',        provider: 'google', model: 'gemini-2.5-flash', color: '#5a8fe0', is_active: false, slot_index: 2, provider_group: 'google', stability_tier: 'stable' },

  // ─── OpenRouter A — Free row ────────────────────────────────────
  { name: 'Qwen 3.6 Plus',      display_name: 'Qwen 3.6 Plus',      role: 'Free · General purpose flagship', provider: 'openrouter', model: 'qwen/qwen3.6-plus:free',           color: '#8a8ae0', is_active: true,  slot_index: 0, provider_group: 'openrouter_a', stability_tier: 'stable' },
  { name: 'DeepSeek V3 (free)', display_name: 'DeepSeek V3 (free)', role: 'Free · Coding heavyweight',       provider: 'openrouter', model: 'deepseek/deepseek-chat-v3-0324:free', color: '#8a8ae0', is_active: false, slot_index: 1, provider_group: 'openrouter_a', stability_tier: 'stable' },
  { name: 'Llama 4 Maverick',   display_name: 'Llama 4 Maverick',   role: 'Meta frontier',                   provider: 'openrouter', model: 'meta-llama/llama-4-maverick',       color: '#8a8ae0', is_active: false, slot_index: 2, provider_group: 'openrouter_a', stability_tier: 'stable' },

  // ─── OpenRouter B — Premium row (all OFF by default) ────────────
  { name: 'Sonnet 4.6 (OR)', display_name: 'Sonnet 4.6 (OR)', role: 'Premium · Build lead',              provider: 'openrouter', model: 'anthropic/claude-sonnet-4-6',     color: '#8a8ae0', is_active: false, slot_index: 0, provider_group: 'openrouter_b', stability_tier: 'stable' },
  { name: 'GPT-5.4 (OR)',    display_name: 'GPT-5.4 (OR)',    role: 'Premium · Policy · PM',             provider: 'openrouter', model: 'openai/gpt-5.4',                  color: '#8a8ae0', is_active: false, slot_index: 1, provider_group: 'openrouter_b', stability_tier: 'stable' },
  // Kimi K2 — Moonshot rotates slugs (e.g. moonshotai/kimi-k2-0905). If
  // broadcasts to this slot 404, update to whatever OpenRouter currently lists.
  { name: 'Kimi K2',         display_name: 'Kimi K2',         role: 'Premium · Long context · Reasoning', provider: 'openrouter', model: 'moonshotai/kimi-k2',              color: '#8a8ae0', is_active: false, slot_index: 2, provider_group: 'openrouter_b', stability_tier: 'stable' },
];

export const OPENROUTER_FREE_MODELS: OpenRouterModel[] = [
  { id: 'qwen/qwen3.6-plus:free', label: 'Qwen 3.6 Plus', tier: 'free' },
  { id: 'openai/gpt-oss-120b:free', label: 'GPT-OSS 120B', tier: 'free' },
  { id: 'meta-llama/llama-4-maverick', label: 'Llama 4 Maverick', tier: 'paid' },
  { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3 (free)', tier: 'free' },
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
  { id: 'deepseek/deepseek-chat-v3-0324', label: 'DeepSeek V3', tier: 'paid' },
  { id: 'meta-llama/llama-4-maverick', label: 'Llama 4 Maverick', tier: 'paid' },
  { id: 'qwen/qwen3.6-plus:free', label: 'Qwen 3.6 Plus', tier: 'free' },
  { id: 'openai/gpt-oss-120b:free', label: 'GPT-OSS 120B', tier: 'free' },
  { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3 (free)', tier: 'free' },
  { id: 'nvidia/nemotron-3-super-120b-a12b:free', label: 'Nemotron 3 Super', tier: 'free' },
];

export const PROVIDER_REGISTRY = [
  { id: 'anthropic', name: 'Anthropic', models: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-6'] },
  { id: 'openai', name: 'OpenAI', models: ['gpt-5.4-mini', 'gpt-5.4'] },
  { id: 'google', name: 'Google Gemini', models: ['gemini-2.5-flash', 'gemini-2.5-pro'] },
  { id: 'openrouter', name: 'OpenRouter', models: OPENROUTER_MODELS.map(m => m.id) },
];
