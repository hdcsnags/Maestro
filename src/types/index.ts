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
  moonshot: '#b45ae0',
  qwen: '#e0c25a',
  openrouter: '#8a8ae0',
};

export const AGENT_DEFAULTS: Array<{ name: string; role: string; provider: string; model: string; color: string }> = [
  { name: 'Claude', role: 'Build lead · Offensive security', provider: 'anthropic', model: 'claude-sonnet-4-5', color: '#e07b5a' },
  { name: 'GPT', role: 'PM · Policy · Scope enforcement', provider: 'openai', model: 'gpt-4o', color: '#5ab88e' },
  { name: 'Gemini', role: 'Design lead · Spatial UI · Motion', provider: 'google', model: 'gemini-1.5-pro', color: '#5a8fe0' },
  { name: 'Kimi K2', role: 'External research · Web · Docs', provider: 'moonshot', model: 'moonshot-v1-128k', color: '#b45ae0' },
  { name: 'Qwen', role: 'Internal context · Repo · Session history', provider: 'qwen', model: 'qwen-plus', color: '#e0c25a' },
];

export const PROVIDER_REGISTRY = [
  { id: 'anthropic', name: 'Anthropic', models: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-3-5'] },
  { id: 'openai', name: 'OpenAI', models: ['gpt-4o', 'o1', 'gpt-4o-mini'] },
  { id: 'google', name: 'Google Gemini', models: ['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-2.0-flash'] },
  { id: 'moonshot', name: 'Kimi / Moonshot', models: ['moonshot-v1-128k', 'moonshot-v1-32k'] },
  { id: 'qwen', name: 'Qwen', models: ['qwen-plus', 'qwen-max', 'qwen-turbo'] },
  { id: 'openrouter', name: 'OpenRouter', models: ['auto'] },
];
