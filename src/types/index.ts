export type ExecutionMode = 'analyze' | 'pr_flow' | 'elevated';
export type SessionStatus = 'active' | 'archived';
export type RoundStatus = 'pending' | 'broadcasting' | 'complete';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type ExecutionStrategy = 'per_agent' | 'synthesized';
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
  role: string;
  provider: string;
  model: string;
  color: string;
  is_active: boolean;
  sort_order: number;
  scoped_paths?: string[];
  skills?: AgentSkill[];
}

export interface Session {
  id: string;
  workspace_id: string;
  title: string;
  execution_mode: ExecutionMode;
  status: SessionStatus;
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

export const AGENT_DEFAULTS: Array<{ name: string; role: string; provider: string; model: string; color: string }> = [
  { name: 'Claude', role: 'Build lead · Offensive security', provider: 'anthropic', model: 'claude-sonnet-4-5', color: '#e07b5a' },
  { name: 'GPT', role: 'PM · Policy · Scope enforcement', provider: 'openai', model: 'gpt-4o', color: '#5ab88e' },
  { name: 'Gemini', role: 'Design lead · Spatial UI · Motion', provider: 'google', model: 'gemini-1.5-pro', color: '#5a8fe0' },
  { name: 'Kimi K2', role: 'External research · Web · Docs', provider: 'moonshot', model: 'moonshot-v1-128k', color: '#b45ae0' },
  { name: 'Qwen', role: 'Internal context · Repo · Session history', provider: 'qwen', model: 'qwen-plus', color: '#e0c25a' },
  { name: 'Router A', role: 'OpenRouter slot 1', provider: 'openrouter', model: 'anthropic/claude-sonnet-4', color: '#8a8ae0' },
  { name: 'Router B', role: 'OpenRouter slot 2', provider: 'openrouter', model: 'qwen/qwen3.6-plus:free', color: '#8a8ae0' },
  { name: 'Router C', role: 'OpenRouter slot 3', provider: 'openrouter', model: 'openai/gpt-oss-120b:free', color: '#8a8ae0' },
  { name: 'Router D', role: 'OpenRouter slot 4', provider: 'openrouter', model: 'google/gemini-2.0-flash-001', color: '#8a8ae0' },
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
