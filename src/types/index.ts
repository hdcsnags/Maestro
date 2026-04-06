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

export interface ApprovalRequest {
  id: string;
  execution_run_id: string;
  user_id: string;
  action_type: string;
  description: string;
  status: ApprovalStatus;
  decided_at: string | null;
  created_at: string;
}

export const PROVIDER_COLORS: Record<string, string> = {
  anthropic: '#e07b5a',
  openai: '#5ab88e',
  google: '#5a8fe0',
  openrouter: '#8a8ae0',
};

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
}

export const AGENT_DEFAULTS: AgentDefault[] = [
  // Anthropic — 3 slots
  { name: 'Claude Haiku 4.5', display_name: 'Claude Haiku 4.5', role: 'Fast analysis · Triage', provider: 'anthropic', model: 'claude-haiku-4-5', color: '#e07b5a', is_active: true, slot_index: 0, provider_group: 'anthropic' },
  { name: 'Claude Sonnet 4.6', display_name: 'Claude Sonnet 4.6', role: 'Build lead · Code generation', provider: 'anthropic', model: 'claude-sonnet-4-6', color: '#e07b5a', is_active: false, slot_index: 1, provider_group: 'anthropic' },
  { name: 'Claude Opus 4.6', display_name: 'Claude Opus 4.6', role: 'Deep reasoning · Architecture', provider: 'anthropic', model: 'claude-opus-4-6', color: '#e07b5a', is_active: false, slot_index: 2, provider_group: 'anthropic' },

  // OpenAI — 3 slots
  { name: 'GPT-4o mini', display_name: 'GPT-4o mini', role: 'Fast drafting · Summarization', provider: 'openai', model: 'gpt-4o-mini', color: '#5ab88e', is_active: true, slot_index: 0, provider_group: 'openai' },
  { name: 'GPT-4o', display_name: 'GPT-4o', role: 'PM · Policy · Scope enforcement', provider: 'openai', model: 'gpt-4o', color: '#5ab88e', is_active: false, slot_index: 1, provider_group: 'openai' },
  { name: 'o1', display_name: 'o1', role: 'Reasoning · Complex analysis', provider: 'openai', model: 'o1', color: '#5ab88e', is_active: false, slot_index: 2, provider_group: 'openai' },

  // Gemini — 3 slots
  { name: 'Gemini Flash 2.0', display_name: 'Gemini Flash 2.0', role: 'Speed · Design · Spatial UI', provider: 'google', model: 'gemini-2.0-flash', color: '#5a8fe0', is_active: true, slot_index: 0, provider_group: 'google' },
  { name: 'Gemini 1.5 Pro', display_name: 'Gemini 1.5 Pro', role: 'Research · Long context', provider: 'google', model: 'gemini-1.5-pro', color: '#5a8fe0', is_active: false, slot_index: 1, provider_group: 'google' },
  { name: 'Gemini Ultra', display_name: 'Gemini Ultra', role: 'Advanced reasoning · Multimodal', provider: 'google', model: 'gemini-ultra', color: '#5a8fe0', is_active: false, slot_index: 2, provider_group: 'google' },

  // OpenRouter — 3 slots
  { name: 'Qwen 3 235B', display_name: 'Qwen 3 235B', role: 'Free tier · General purpose', provider: 'openrouter', model: 'qwen/qwen3-235b-a22b:free', color: '#8a8ae0', is_active: true, slot_index: 0, provider_group: 'openrouter' },
  { name: 'Co-Lead', display_name: 'Co-Lead', role: 'Premium co-lead via OpenRouter', provider: 'openrouter', model: '', color: '#8a8ae0', is_active: false, slot_index: 1, provider_group: 'openrouter' },
  { name: 'Reserved', display_name: 'Reserved', role: 'Reserved for future use', provider: 'openrouter', model: '', color: '#8a8ae0', is_active: false, slot_index: 2, provider_group: 'openrouter' },
];

export const OPENROUTER_FREE_MODELS: OpenRouterModel[] = [
  { id: 'qwen/qwen3-235b-a22b:free', label: 'Qwen 3 235B', tier: 'free' },
  { id: 'qwen/qwen3.6-plus:free', label: 'Qwen 3.6 Plus', tier: 'free' },
  { id: 'openai/gpt-oss-120b:free', label: 'GPT-OSS 120B', tier: 'free' },
  { id: 'meta-llama/llama-4-maverick:free', label: 'Llama 4 Maverick', tier: 'free' },
  { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3 (free)', tier: 'free' },
  { id: 'nvidia/nemotron-3-super:free', label: 'Nemotron 3 Super', tier: 'free' },
];

export const CO_LEAD_MODELS: OpenRouterModel[] = [
  { id: 'anthropic/claude-opus-4-6', label: 'Claude Opus 4.6', tier: 'paid' },
  { id: 'openai/gpt-4o', label: 'GPT-4o', tier: 'paid' },
  { id: 'openai/o1', label: 'o1', tier: 'paid' },
  { id: 'google/gemini-ultra', label: 'Gemini Ultra', tier: 'paid' },
  { id: 'mistralai/mistral-large', label: 'Mistral Large', tier: 'paid' },
];

export interface OpenRouterModel {
  id: string;
  label: string;
  tier: 'free' | 'paid';
}

export const OPENROUTER_MODELS: OpenRouterModel[] = [
  { id: 'anthropic/claude-sonnet-4', label: 'Claude Sonnet 4', tier: 'paid' },
  { id: 'anthropic/claude-sonnet-4-6', label: 'Claude Sonnet 4.6', tier: 'paid' },
  { id: 'anthropic/claude-opus-4-6', label: 'Claude Opus 4.6', tier: 'paid' },
  { id: 'anthropic/claude-haiku-3-5', label: 'Claude Haiku 3.5', tier: 'paid' },
  { id: 'openai/gpt-4o', label: 'GPT-4o', tier: 'paid' },
  { id: 'openai/o1', label: 'o1', tier: 'paid' },
  { id: 'google/gemini-2.0-flash-001', label: 'Gemini 2.0 Flash', tier: 'paid' },
  { id: 'google/gemini-1.5-pro', label: 'Gemini 1.5 Pro', tier: 'paid' },
  { id: 'deepseek/deepseek-chat-v3-0324', label: 'DeepSeek V3', tier: 'paid' },
  { id: 'z-ai/glm-5v-turbo', label: 'Z.AI GLM-5V Turbo', tier: 'paid' },
  { id: 'qwen/qwen3.6-plus:free', label: 'Qwen 3.6 Plus', tier: 'free' },
  { id: 'openai/gpt-oss-120b:free', label: 'GPT-OSS 120B', tier: 'free' },
  { id: 'meta-llama/llama-4-maverick:free', label: 'Llama 4 Maverick', tier: 'free' },
  { id: 'deepseek/deepseek-chat-v3-0324:free', label: 'DeepSeek V3 (free)', tier: 'free' },
  { id: 'nvidia/nemotron-3-super:free', label: 'Nemotron 3 Super', tier: 'free' },
  { id: 'qwen/qwen3-235b-a22b:free', label: 'Qwen 3 235B', tier: 'free' },
];

export const PROVIDER_REGISTRY = [
  { id: 'anthropic', name: 'Anthropic', models: ['claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-6'] },
  { id: 'openai', name: 'OpenAI', models: ['gpt-4o-mini', 'gpt-4o', 'o1'] },
  { id: 'google', name: 'Google Gemini', models: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-ultra'] },
  { id: 'openrouter', name: 'OpenRouter', models: OPENROUTER_MODELS.map(m => m.id) },
];
