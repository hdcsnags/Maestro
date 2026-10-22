import { useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { invokeEdgeFunction } from '../lib/functions';
import { useMaestro } from '../context/MaestroContext';
import { useAuth } from '../context/AuthContext';
import { useOrchestration } from './useOrchestration';
import { useDeliberation } from './useDeliberation';
import type { Thread, ThreadMessage, ThreadType, ExecutionIntent, Executor, ExecutorJob, FileManifestEntry, ProviderConnection, ThreadPlanCardKind, Response as MaestroResponse, BrainstormSeat, DiscoveryIntakeRecord, Session, ConversationBackend } from '../types';
import { classifyCommandTrust, EXECUTION_INTENT_PROMPT } from '../lib/trustHints';
import { CONCIERGE_MODELS } from '../types';
import { selectOnlineExecutor } from '../lib/sessionBuild';
import { buildDiscoveryPrompt, countDiscoveryProgress, parseDiscoveryReply } from '../lib/discoverySchema';
import {
  CONCIERGE_LOCAL_SYSTEM_PROMPT,
  buildDiscoveryLocalSystemPrompt,
  flattenConciergePrompt,
  isExecutorOnlineFor,
  resolveEffectiveBackend,
  resolveSeatAdapter,
  stripVerdictBlock,
} from '../lib/clawConversation';
import { describeJobFailure, readJobText, submitClawJob, watchClawJob } from '../lib/clawJobs';

// Options shared by the concierge and discovery turns (Conversation-through-Claw).
export interface ConversationTurnOptions {
  // Force one backend for this turn ("Retry in the cloud" on a failed local turn).
  backendOverride?: ConversationBackend;
  // The user message is already in the thread (retry) — do not insert it again.
  skipUserMessage?: boolean;
}

interface LocalTurnRequest {
  threadId: string;
  sessionId: string;
  prompt: string;
  retryText: string;
  retryKind: 'concierge' | 'discovery';
  // Turn the raw worker text into what the bubble should finally show.
  finalizeContent?: (raw: string) => string;
}

type LocalTurnResult =
  | { ok: true; text: string; message: ThreadMessage | null }
  | { ok: false; error: string; message: ThreadMessage | null };

const LOCAL_TURN_PERSIST_MS = 1_500;

const DISCOVERY_OPENING_MESSAGE = [
  'This is a guided intake. I will ask two or three questions at a time, in plain language, and write down what you say in your own words.',
  'Skip anything you do not know yet. Type /done at any point to stop and get the record.',
  'When the record is ready you can copy it as Markdown or send it to the council to scope.',
].join('\n\n');

const DISCOVERY_AGENT_ROLE = 'Discovery intake interviewer — asks two or three plain-language questions at a time and records answers in the person\'s own words';

// Matches DecisionRecord in packages/maestroclaw/src/lib/decision-record.ts
interface StoredDecisionRecord {
  ts: string;
  loop_id: string;
  outcome: string;
  task: string;
  problem_type: string;
  what_worked: string;
  what_failed: string;
  agent_used: string;
  files_touched: string[];
}

interface OrchestrateResult {
  content?: string;
  text?: string;
  file_manifest?: FileManifestEntry[];
  title?: string;
  signals?: Record<string, string | undefined>;
  usage?: { total_tokens?: number };
}

interface ConciergeRuntimeChoice {
  model: string;
  provider: string;
}

const THREAD_OUTPUT_REDACTION_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  { pattern: /\bgh(?:p|o|u|s|r)_[A-Za-z0-9_]{20,}\b/g, replacement: '[REDACTED_GITHUB_TOKEN]' },
  { pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g, replacement: '[REDACTED_API_KEY]' },
  { pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, replacement: '[REDACTED_SLACK_TOKEN]' },
  { pattern: /\b(?:AKIA|ASIA|AGPA|AIDA|AROA|AIPA|ANPA)[A-Z0-9]{16}\b/g, replacement: '[REDACTED_AWS_ACCESS_KEY]' },
];

function redactThreadOutput(content: string): { content: string; redactionCount: number } {
  let nextContent = content;
  let redactionCount = 0;

  for (const { pattern, replacement } of THREAD_OUTPUT_REDACTION_RULES) {
    nextContent = nextContent.replace(pattern, () => {
      redactionCount += 1;
      return replacement;
    });
  }

  return { content: nextContent, redactionCount };
}

function inferProviderFromModel(model: string): string {
  const registered = CONCIERGE_MODELS.find(entry => entry.id === model);
  if (registered) return registered.provider;
  if (model.startsWith('gpt-')) return 'openai';
  if (model.startsWith('gemini-')) return 'google';
  return 'anthropic';
}

function connectionSupportsModel(connection: ProviderConnection | undefined, model: string): boolean {
  if (!connection?.is_connected) return false;
  if (!Array.isArray(connection.models) || connection.models.length === 0) return true;
  return connection.models.includes(model);
}

function extractJsonObject(raw: string): string | null {
  const cleaned = raw.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();
  if (!cleaned) return null;
  if ((cleaned.startsWith('{') && cleaned.endsWith('}')) || (cleaned.startsWith('[') && cleaned.endsWith(']'))) {
    return cleaned;
  }
  const match = cleaned.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  return match?.[0] ?? null;
}

function parseStructuredJson<T>(raw: string, label: string): T {
  const jsonText = extractJsonObject(raw);
  if (!jsonText) {
    const message = raw.trim().replace(/\s+/g, ' ');
    throw new Error(message || `${label} returned an empty response.`);
  }

  try {
    return JSON.parse(jsonText) as T;
  } catch {
    throw new Error(`${label} returned malformed JSON.`);
  }
}

function summarizeBuildRequest(userMessage: string): string {
  const normalized = userMessage.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'the requested build';
  return normalized.length > 96 ? `${normalized.slice(0, 93).trimEnd()}...` : normalized;
}

const LOCAL_EXECUTION_COMMAND_PREFIXES = [
  'npm', 'npx', 'pnpm', 'yarn', 'git', 'gh', 'node', 'python', 'python3', 'pip', 'pip3',
  'ls', 'dir', 'cat', 'type', 'pwd', 'echo',
];

// Commands that require a real PTY (interactive, raw-mode, or TUI tools).
// When detected, the job is routed to the pty_shell adapter.
const PTY_COMMANDS = new Set([
  'top', 'htop', 'btop', 'atop',
  'vim', 'vi', 'nvim', 'nano', 'emacs', 'pico',
  'less', 'more', 'most',
  'watch',
  'ssh', 'scp', 'sftp', 'telnet', 'ftp',
  'mysql', 'psql', 'sqlite3', 'mongo',
  'python', 'python3', 'node', 'irb', 'iex',
  'bash', 'zsh', 'sh', 'fish',
  'tmux', 'screen',
]);

function requiresPty(command: string): boolean {
  const firstToken = command.trim().split(/\s+/, 1)[0]?.toLowerCase() ?? '';
  return PTY_COMMANDS.has(firstToken);
}

function looksLikeDirectCommand(candidate: string): boolean {
  const trimmed = candidate.trim();
  if (!trimmed) return false;
  const firstToken = trimmed.split(/\s+/, 1)[0]?.toLowerCase() ?? '';
  return LOCAL_EXECUTION_COMMAND_PREFIXES.includes(firstToken);
}

function describeLocalCommand(command: string): string {
  const trimmed = command.trim();
  const lower = trimmed.toLowerCase();
  if (lower.startsWith('npm install') || lower.startsWith('pnpm install') || lower.startsWith('yarn install')) {
    return 'Install project dependencies';
  }
  if (lower.startsWith('npm run ') || lower.startsWith('pnpm ') || lower.startsWith('yarn ')) {
    return 'Run a project script';
  }
  if (lower.startsWith('git status')) return 'Check repo status';
  if (lower.startsWith('git diff')) return 'View changes';
  if (lower.startsWith('git log')) return 'View commit history';
  if (lower.startsWith('gh pr list')) return 'List pull requests';
  if (lower.startsWith('gh issue list')) return 'List issues';
  if (lower.startsWith('ls') || lower.startsWith('dir')) return 'List directory contents';
  if (lower.startsWith('cat') || lower.startsWith('type')) return 'View file contents';
  return `Run \`${trimmed.split(/\s+/, 2).join(' ')}\``;
}

function tryParseLocalExecutionIntent(userMessage: string): ExecutionIntent | null {
  const trimmed = userMessage.trim();
  if (!trimmed) return null;

  const fencedMatch = trimmed.match(/`([^`]+)`/);
  const quotedCommand = fencedMatch?.[1]?.trim();
  if (quotedCommand && looksLikeDirectCommand(quotedCommand)) {
    const pty = requiresPty(quotedCommand);
    return {
      action: 'shell_command',
      command: quotedCommand,
      params: {},
      adapter: pty ? 'pty_shell' : 'approved_shell',
      trust: classifyCommandTrust(quotedCommand),
      description: describeLocalCommand(quotedCommand),
    };
  }

  if (looksLikeDirectCommand(trimmed)) {
    const pty = requiresPty(trimmed);
    return {
      action: 'shell_command',
      command: trimmed,
      params: {},
      adapter: pty ? 'pty_shell' : 'approved_shell',
      trust: classifyCommandTrust(trimmed),
      description: describeLocalCommand(trimmed),
    };
  }

  const runMatch = trimmed.match(/^(?:please\s+)?(?:run|execute|try)\s+(.+)$/i);
  const runCommand = runMatch?.[1]?.trim();
  if (runCommand && looksLikeDirectCommand(runCommand)) {
    const pty = requiresPty(runCommand);
    return {
      action: 'shell_command',
      command: runCommand,
      params: {},
      adapter: pty ? 'pty_shell' : 'approved_shell',
      trust: classifyCommandTrust(runCommand),
      description: describeLocalCommand(runCommand),
    };
  }

  const listFilesMatch = trimmed.match(/^(?:please\s+)?list\s+files(?:\s+in)?\s+(.+)$/i);
  if (listFilesMatch?.[1]) {
    const path = listFilesMatch[1].trim().replace(/^["'`](.*)["'`]$/, '$1');
    const command = `ls ${path}`;
    return {
      action: 'shell_command',
      command,
      params: { path },
      adapter: 'approved_shell',
      trust: classifyCommandTrust(command),
      description: `List files in ${path}`,
    };
  }

  const showFileMatch = trimmed.match(/^(?:please\s+)?(?:show|open|read)\s+file\s+(.+)$/i);
  if (showFileMatch?.[1]) {
    const path = showFileMatch[1].trim().replace(/^["'`](.*)["'`]$/, '$1');
    const command = `cat ${path}`;
    return {
      action: 'shell_command',
      command,
      params: { path },
      adapter: 'approved_shell',
      trust: classifyCommandTrust(command),
      description: `View ${path}`,
    };
  }

  return null;
}

// ── Phase 5: Scope intelligence helpers ────────────────────────────────────

const IGNORE_DIRS = new Set([
  'node_modules', 'dist', 'build', 'coverage', 'out', '.git',
  'public', 'static', 'assets', '__tests__', 'test', 'tests',
]);

const FRONTEND_DIRS = ['src', 'app', 'frontend', 'web', 'client', 'ui', 'pages', 'components'];
const BACKEND_DIRS = ['server', 'api', 'backend', 'functions', 'services', 'lambda', 'workers'];

/** Extract top-level dirs from ASCII tree lines (├──, └──, etc.) only — avoids false positives from import paths. */
function extractTreeDirs(architectMd: string): string[] {
  const found = new Set<string>();
  const treePattern = /[├└]\s*(?:──\s*)?([a-z][a-z0-9_-]{0,30})(?:\/|$)/gm;
  let m: RegExpExecArray | null;
  while ((m = treePattern.exec(architectMd)) !== null) {
    const dir = m[1].toLowerCase();
    if (!IGNORE_DIRS.has(dir)) found.add(dir);
  }
  return Array.from(found);
}

/**
 * Suggest a primary build scope from ARCHITECT.md.
 * Returns `{ primary, secondary }` globs — purely advisory, not runtime-enforced.
 */
function suggestSessionScope(architectMd: string | null | undefined): {
  primary: string;
  secondary: string | null;
} {
  if (!architectMd?.trim()) return { primary: '**', secondary: null };
  const dirs = extractTreeDirs(architectMd);
  const primaryDir = FRONTEND_DIRS.find((d) => dirs.includes(d));
  const secondaryDir = BACKEND_DIRS.find((d) => dirs.includes(d));
  return {
    primary: primaryDir ? `${primaryDir}/**` : '**',
    secondary: secondaryDir ? `${secondaryDir}/**` : null,
  };
}

function createResponseExcerpt(response: MaestroResponse): string {
  const source = response.title?.trim() || response.content.trim();
  const normalized = source.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'No summary available.';
  return normalized.length > 220 ? `${normalized.slice(0, 217).trimEnd()}...` : normalized;
}

function compareResponseSummary(primary: MaestroResponse, secondary: MaestroResponse): string {
  const primarySignals = Object.entries(primary.signals ?? {})
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}: ${value}`)
    .slice(0, 3);
  const secondarySignals = Object.entries(secondary.signals ?? {})
    .filter(([, value]) => Boolean(value))
    .map(([key, value]) => `${key}: ${value}`)
    .slice(0, 3);
  const primaryFiles = (primary.file_manifest ?? []).map((entry) => entry.path);
  const secondaryFiles = (secondary.file_manifest ?? []).map((entry) => entry.path);
  const overlappingFiles = primaryFiles.filter((path) => secondaryFiles.includes(path)).slice(0, 5);

  return [
    `${primary.agent_name} emphasizes: ${createResponseExcerpt(primary)}`,
    primarySignals.length > 0 ? `Signals: ${primarySignals.join(' · ')}` : null,
    '',
    `${secondary.agent_name} emphasizes: ${createResponseExcerpt(secondary)}`,
    secondarySignals.length > 0 ? `Signals: ${secondarySignals.join(' · ')}` : null,
    '',
    overlappingFiles.length > 0 ? `Shared file scope: ${overlappingFiles.join(', ')}` : 'Shared file scope: none called out explicitly.',
  ].filter((value): value is string => typeof value === 'string').join('\n');
}

const PLAN_CARD_ORDER: ThreadPlanCardKind[] = [
  'project_type',
  'repo',
  'builder_roster',
  'backend',
  'architect',
  'lane',
  'spec_lock',
];

const PLAN_CARD_TITLES: Record<ThreadPlanCardKind, string> = {
  project_type: 'Project type',
  repo: 'Repository',
  builder_roster: 'Builder roster',
  backend: 'Execution backend',
  architect: 'Architect plan',
  lane: 'Lane assignment',
  spec_lock: 'Lock and start build',
};

// Bound on the fresh executors re-read a routing decision makes when state looks empty/stale.
const EXECUTOR_REFRESH_TIMEOUT_MS = 12_000;

export function useThreads() {
  const { state, dispatch } = useMaestro();
  const { user, session: authSession } = useAuth();
  const { broadcast, synthesize } = useOrchestration();
  const { triggerDeliberation } = useDeliberation();
  // Brainstorm awaits a broadcast, then deliberates and synthesizes. Those two
  // callbacks read state.responses / state.isDeliberating from their closures,
  // so always call the latest instance (same pattern as synthesizeRef in
  // useOrchestration) rather than the one captured when brainstorm started.
  const synthesizeRef = useRef(synthesize);
  synthesizeRef.current = synthesize;
  const triggerDeliberationRef = useRef(triggerDeliberation);
  triggerDeliberationRef.current = triggerDeliberation;

  const ensureAuth = useCallback(async () => {
    if (authSession?.access_token) return authSession;
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) {
      throw new Error('Session expired. Sign in again.');
    }
    return data.session;
  }, [authSession]);

  const getBuildSetupStatus = useCallback(() => {
    const activeRepo = state.activeRepoConnection
      ?? state.repoConnections?.find((repo) => repo.is_active)
      ?? null;
    const buildSpec = ((state.activeSession?.build_spec ?? {}) as Record<string, unknown>);
    const lockedBuilderIds = Array.isArray(buildSpec.primary_builder_agent_ids)
      ? buildSpec.primary_builder_agent_ids.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
    const builderNames = lockedBuilderIds.map((id) => {
      const agent = state.agents.find((candidate) => candidate.id === id);
      return agent?.display_name || agent?.name || id;
    });
    const executionBackend = state.activeSession?.execution_backend ?? 'edge';

    const missing: string[] = [];
    if (!activeRepo && executionBackend === 'edge') missing.push('an active GitHub repo connection');
    if (!state.activeSession?.architect_md?.trim()) missing.push('an ARCHITECT.md scaffold');
    if (state.activeSession?.build_spec_locked !== true) missing.push('a locked Pre-Build builder roster');
    if (lockedBuilderIds.length === 0) missing.push('at least one selected builder');

    return {
      activeRepo,
      buildSpec,
      lockedBuilderIds,
      builderNames,
      executionBackend,
      ready: missing.length === 0,
      missing,
    };
  }, [state.activeRepoConnection, state.repoConnections, state.activeSession, state.agents]);

  const executorSupportsAdapter = useCallback((adapter: string) => {
    return state.executors.some((ex) => {
      if (ex.status !== 'online') return false;
      if (!ex.last_seen_at) return false;
      if (Date.now() - new Date(ex.last_seen_at).getTime() >= 60_000) return false;
      const adapters = (ex.capabilities as Record<string, unknown>).adapters;
      return Array.isArray(adapters) && (adapters as string[]).includes(adapter);
    });
  }, [state.executors]);

  const resolveLocalBuildRouting = useCallback((
    lockedBuilderIds: string[],
    executionBackend: 'local' | 'auto' | 'edge',
  ) => {
    const lockedBuilders = lockedBuilderIds
      .map((id) => state.agents.find((candidate) => candidate.id === id))
      .filter((agent): agent is NonNullable<typeof agent> => Boolean(agent));

    const clawBuilders = lockedBuilders.filter((agent) => agent.provider_group === 'maestroclaw');
    const onlineClawBuilders = clawBuilders.filter((agent) => executorSupportsAdapter(agent.model));

    if (executionBackend === 'local') {
      return {
        threadNative: true,
        builderNames: clawBuilders.length > 0
          ? clawBuilders.map((agent) => agent.display_name || agent.name)
          : lockedBuilders.map((agent) => agent.display_name || agent.name),
        defaultAdapter: clawBuilders[0]?.model ?? onlineClawBuilders[0]?.model ?? 'claude_code',
      };
    }

    if (executionBackend === 'auto' && onlineClawBuilders.length > 0) {
      return {
        threadNative: true,
        builderNames: onlineClawBuilders.map((agent) => agent.display_name || agent.name),
        defaultAdapter: onlineClawBuilders[0]?.model ?? 'claude_code',
      };
    }

    return {
      threadNative: false,
      builderNames: lockedBuilders.map((agent) => agent.display_name || agent.name),
      defaultAdapter: null,
    };
  }, [state.agents, executorSupportsAdapter]);

  const updateSessionBuildState = useCallback(async (
    phase: 'pre_build' | 'build',
    buildSpec: Record<string, unknown>,
  ) => {
    if (!state.activeSession) return;

    const payload = {
      current_phase: phase,
      build_spec: buildSpec,
    };

    await supabase
      .from('sessions')
      .update(payload as never)
      .eq('id', state.activeSession.id);

    dispatch({ type: 'UPDATE_ACTIVE_SESSION', payload });
  }, [state.activeSession, dispatch]);

  const getConciergeCandidates = useCallback((preferredModel = state.conciergeModel): ConciergeRuntimeChoice[] => {
    const connectedByProvider = new Map(
      state.providerConnections
        .filter(connection => connection.is_connected)
        .map(connection => [connection.provider, connection]),
    );
    const candidates: ConciergeRuntimeChoice[] = [];
    const seen = new Set<string>();

    const addCandidate = (model: string, provider: string) => {
      if (seen.has(model)) return;
      seen.add(model);
      candidates.push({ model, provider });
    };

    addCandidate(preferredModel, inferProviderFromModel(preferredModel));

    for (const option of CONCIERGE_MODELS) {
      const connection = connectedByProvider.get(option.provider);
      if (!connectionSupportsModel(connection, option.id)) continue;
      addCandidate(option.id, option.provider);
    }

    return candidates;
  }, [state.conciergeModel, state.providerConnections]);

  const resolveConciergeRuntime = useCallback((preferredModel = state.conciergeModel): ConciergeRuntimeChoice => {
    const candidates = getConciergeCandidates(preferredModel);
    const connectedCandidate = candidates.find(candidate => {
      const connection = state.providerConnections.find(entry => entry.provider === candidate.provider && entry.is_connected);
      return connectionSupportsModel(connection, candidate.model);
    });

    if (connectedCandidate) {
      return connectedCandidate;
    }

    return candidates[0] ?? {
      model: preferredModel,
      provider: inferProviderFromModel(preferredModel),
    };
  }, [state.conciergeModel, state.providerConnections, getConciergeCandidates]);

  // Call executor-api edge function with query params
  const callExecutorApi = useCallback(async <T>(
    action: string,
    body?: Record<string, unknown>,
    method: 'GET' | 'POST' = 'POST',
  ): Promise<T> => {
    const auth = await ensureAuth();
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const url = `${supabaseUrl}/functions/v1/executor-api?action=${action}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${auth.access_token}`,
        'Content-Type': 'application/json',
      },
      ...(method === 'POST' && body ? { body: JSON.stringify(body) } : {}),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`executor-api/${action} failed (${res.status}): ${text}`);
    }
    return res.json();
  }, [ensureAuth]);

  // Load all threads for the active session
  const loadThreads = useCallback(async (sessionId: string) => {
    const { data } = await supabase
      .from('threads')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    if (data) {
      dispatch({ type: 'SET_THREADS', payload: data as Thread[] });
    }
    return (data ?? []) as Thread[];
  }, [dispatch]);

  // Load messages for a specific thread
  const loadThreadMessages = useCallback(async (threadId: string) => {
    const { data } = await supabase
      .from('thread_messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });
    if (data) {
      dispatch({ type: 'SET_THREAD_MESSAGES', payload: data as ThreadMessage[] });
    }
    return (data ?? []) as ThreadMessage[];
  }, [dispatch]);

  // Create a new thread
  const createThread = useCallback(async (
    sessionId: string,
    type: ThreadType,
    options: { agentId?: string; title?: string; parentThreadId?: string } = {},
  ): Promise<Thread | null> => {
    const { data, error } = await supabase
      .from('threads')
      .insert({
        session_id: sessionId,
        type,
        agent_id: options.agentId ?? null,
        title: options.title ?? null,
        parent_thread_id: options.parentThreadId ?? null,
        status: 'active',
        include_in_synthesis: true,
        metadata: {},
      } as never)
      .select()
      .maybeSingle();

    if (error || !data) return null;
    const thread = data as Thread;
    dispatch({ type: 'ADD_THREAD', payload: thread });
    return thread;
  }, [dispatch]);

  // Get or create the concierge thread for the active session
  const ensureConciergeThread = useCallback(async (sessionId: string): Promise<Thread | null> => {
    // Check if one already exists in state
    const existing = state.threads.find(
      t => t.session_id === sessionId && t.type === 'concierge' && t.status === 'active'
    );
    if (existing) return existing;

    // Check DB
    const { data } = await supabase
      .from('threads')
      .select('*')
      .eq('session_id', sessionId)
      .eq('type', 'concierge')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      const thread = data as Thread;
      dispatch({ type: 'ADD_THREAD', payload: thread });
      // Also load its messages
      await loadThreadMessages(thread.id);
      return thread;
    }

    // Create new concierge thread
    return await createThread(sessionId, 'concierge', { title: 'Concierge' });
  }, [state.threads, dispatch, loadThreadMessages, createThread]);

  // Add a message to a thread (local + DB)
  const addMessage = useCallback(async (
    threadId: string,
    role: ThreadMessage['role'],
    content: string,
    agentId?: string,
    metadata?: ThreadMessage['metadata'],
  ): Promise<ThreadMessage | null> => {
    if (!user) return null;

    const persisted =
      role === 'user'
        ? { content, metadata: metadata ?? {} as ThreadMessage['metadata'] }
        : (() => {
            const redacted = redactThreadOutput(content);
            return {
              content: redacted.content,
              metadata: {
                ...(metadata ?? {}),
                ...(redacted.redactionCount > 0
                  ? { redacted: true, redaction_count: redacted.redactionCount }
                  : {}),
              },
            };
          })();

    const { data, error } = await supabase
      .from('thread_messages')
      .insert({
        thread_id: threadId,
        role,
        agent_id: agentId ?? null,
        content: persisted.content,
        context_weight: 'primary',
        metadata: persisted.metadata,
      } as never)
      .select()
      .maybeSingle();

    if (error || !data) return null;
    const msg = data as ThreadMessage;
    dispatch({ type: 'ADD_THREAD_MESSAGE', payload: msg });
    return msg;
  }, [user, dispatch]);

  const addSystemEvent = useCallback(async (
    threadId: string,
    metadata: ThreadMessage['metadata'],
  ) => {
    const event = metadata.system_event;
    const content = [
      event?.title,
      event?.body,
      event?.command ? `Command: ${event.command}` : null,
    ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0).join('\n\n');
    return addMessage(threadId, 'system', content || 'System update', undefined, metadata);
  }, [addMessage]);

  const ensurePlanCard = useCallback(async (
    threadId: string,
    card: ThreadPlanCardKind,
  ) => {
    const exists = state.threadMessages.some((message) =>
      message.thread_id === threadId
      && message.role === 'system'
      && message.metadata.kind === 'plan_card'
      && message.metadata.plan_card?.card === card,
    );
    if (exists) return null;
    return addMessage(threadId, 'system', PLAN_CARD_TITLES[card], undefined, {
      kind: 'plan_card',
      plan_card: { card },
    });
  }, [state.threadMessages, addMessage]);

  const ensurePreBuildPlanCards = useCallback(async (threadId: string) => {
    for (const card of PLAN_CARD_ORDER) {
      await ensurePlanCard(threadId, card);
    }
  }, [ensurePlanCard]);

  const postConciergeInfoCard = useCallback(async (
    title: string,
    body: string,
  ) => {
    if (!state.activeSession) return null;
    const conciergeThread = await ensureConciergeThread(state.activeSession.id);
    if (!conciergeThread) return null;

    return addSystemEvent(conciergeThread.id, {
      kind: 'info',
      system_event: {
        tone: 'info',
        title,
        body,
      },
    });
  }, [state.activeSession, ensureConciergeThread, addSystemEvent]);

  const pinResponse = useCallback(async (response: MaestroResponse) => {
    const nextPinned = true;
    if (!response.is_pinned) {
      await supabase
        .from('responses')
        .update({ is_pinned: nextPinned } as never)
        .eq('id', response.id);
      dispatch({ type: 'UPDATE_RESPONSE', payload: { id: response.id, is_pinned: nextPinned } });
    }

    await postConciergeInfoCard(
      'Pinned reference',
      `${response.agent_name} was pinned from round ${response.round_id.slice(0, 8)}.\n\n${createResponseExcerpt(response)}`,
    );
    dispatch({ type: 'SHOW_TOAST', payload: `${response.agent_name} pinned to thread context` });
  }, [dispatch, postConciergeInfoCard]);

  const compareResponses = useCallback(async (primary: MaestroResponse, secondary: MaestroResponse) => {
    await postConciergeInfoCard(
      'Comparison recorded',
      compareResponseSummary(primary, secondary),
    );
    dispatch({ type: 'SHOW_TOAST', payload: 'Comparison saved to the concierge thread' });
  }, [dispatch, postConciergeInfoCard]);

  const extractDecision = useCallback(async (response: MaestroResponse) => {
    await postConciergeInfoCard(
      'Decision recorded',
      `Recorded from ${response.agent_name}.\n\n${createResponseExcerpt(response)}`,
    );
    dispatch({ type: 'SHOW_TOAST', payload: 'Decision recorded in concierge thread' });
  }, [dispatch, postConciergeInfoCard]);

  const focusDirectThread = useCallback(async (
    agentId: string,
    options: { title?: string; seedContent?: string } = {},
  ) => {
    if (!state.activeSession) return null;

    let directThread: Thread | null = state.threads.find(
      thread => thread.type === 'direct' && thread.agent_id === agentId && thread.status === 'active',
    ) ?? null;
    const isNewThread = !directThread;

    if (!directThread) {
      directThread = await createThread(state.activeSession.id, 'direct', {
        agentId,
        title: options.title,
      });
    }

    if (!directThread) return null;

    if (isNewThread && options.seedContent) {
      await addMessage(
        directThread.id,
        'concierge',
        options.seedContent,
      );
    }

    dispatch({ type: 'SET_ACTIVE_THREAD', payload: directThread });
    dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: agentId });
    dispatch({ type: 'SET_CLAW_VIEW', payload: 'focus' });
    dispatch({ type: 'SET_COMPOSER_INTENT', payload: 'chat' });
    await loadThreadMessages(directThread.id);
    return directThread;
  }, [state.activeSession, state.threads, createThread, addMessage, dispatch, loadThreadMessages]);

  const askFollowUp = useCallback(async (response: MaestroResponse) => {
    if (!response.agent_id) return null;

    return focusDirectThread(response.agent_id, {
      title: response.agent_name,
      seedContent: `Context from round ${response.round_id.slice(0, 8)} — ${response.agent_name}\n\n${response.content}`,
    });
  }, [focusDirectThread]);

  // Build conversation history for the orchestrate call. System cards (info, errors,
  // plan cards) and unfinished/failed local turns are not part of the conversation.
  const buildConversationContext = useCallback((
    threadId: string,
    options: { dropTrailingUserMessage?: string } = {},
  ): string => {
    const messages = state.threadMessages
      .filter(m => m.thread_id === threadId)
      .filter(m => !(m.role === 'system' && typeof m.metadata?.kind === 'string'))
      .filter(m => !(m.metadata?.kind === 'local_turn' && (m.metadata.streaming === true || typeof m.metadata.error === 'string')))
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (options.dropTrailingUserMessage) {
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i].role === 'user') {
          if (messages[i].content === options.dropTrailingUserMessage) messages.splice(i, 1);
          break;
        }
      }
    }

    if (messages.length === 0) return '';

    return messages.map(m => {
      const label = m.role === 'user' ? 'User' : 'Concierge';
      return `${label}: ${m.content}`;
    }).join('\n\n');
  }, [state.threadMessages]);

  // ── Conversation through Claw ──────────────────────────────────
  // One concierge/discovery turn as a `concierge_turn` job on the local worker: a
  // placeholder bubble appears at once, stdout lines stream into it (persisted at most
  // every ~1.5 s), and the finished text replaces it. Failures stay in the bubble with
  // a "Retry in the cloud" action (LocalTurnCard).
  const runLocalTurn = useCallback(async (req: LocalTurnRequest): Promise<LocalTurnResult> => {
    const adapter = state.conciergeAdapter;
    const model = state.conciergeLocalModel;
    const baseMeta: ThreadMessage['metadata'] = { kind: 'local_turn', adapter, local_model: model };
    const failureMeta = (error: string): ThreadMessage['metadata'] => ({
      ...baseMeta,
      streaming: false,
      error,
      retry_text: req.retryText,
      retry_kind: req.retryKind,
    });

    let job: ExecutorJob;
    try {
      job = await submitClawJob({
        prompt: req.prompt,
        adapter,
        jobType: 'concierge_turn',
        timeoutSeconds: 900,
        sessionId: req.sessionId,
        contextBundle: { kind: 'concierge_turn', model, agent_name: 'Concierge', thread_id: req.threadId },
      });
    } catch (err) {
      const error = err instanceof Error ? err.message : 'Unknown error';
      const message = await addMessage(req.threadId, 'concierge', `Local turn could not start: ${error}`, undefined, failureMeta(error));
      return { ok: false, error, message };
    }
    dispatch({ type: 'ADD_EXECUTOR_JOB', payload: job });

    const placeholder = await addMessage(req.threadId, 'concierge', '', undefined, { ...baseMeta, job_id: job.id, streaming: true });
    const placeholderId = placeholder?.id ?? null;

    const persist = async (content: string, metadata: ThreadMessage['metadata']) => {
      if (!placeholderId) return;
      await supabase
        .from('thread_messages')
        .update({ content, metadata } as never)
        .eq('id', placeholderId);
    };

    let buffer = '';
    let lastPersist = Date.now();
    let persistTimer: number | null = null;
    const flushStream = () => {
      persistTimer = null;
      lastPersist = Date.now();
      void persist(buffer, { ...baseMeta, job_id: job.id, streaming: true });
    };

    let final: ExecutorJob;
    try {
      final = await watchClawJob(job, {
        onLines: (lines, stream) => {
          if (stream !== 'stdout') return;
          buffer = buffer ? `${buffer}\n${lines.join('\n')}` : lines.join('\n');
          if (placeholderId) {
            dispatch({ type: 'UPDATE_THREAD_MESSAGE', payload: { id: placeholderId, content: buffer } });
          }
          const elapsed = Date.now() - lastPersist;
          if (elapsed >= LOCAL_TURN_PERSIST_MS) flushStream();
          else if (persistTimer === null) persistTimer = window.setTimeout(flushStream, LOCAL_TURN_PERSIST_MS - elapsed);
        },
        onStatus: (snapshot) => dispatch({ type: 'UPDATE_EXECUTOR_JOB', payload: snapshot }),
      });
    } catch (err) {
      if (persistTimer !== null) window.clearTimeout(persistTimer);
      const error = err instanceof Error ? err.message : 'Unknown error';
      const content = `Local turn failed: ${error}`;
      await persist(content, failureMeta(error));
      if (placeholderId) dispatch({ type: 'UPDATE_THREAD_MESSAGE', payload: { id: placeholderId, content, metadata: failureMeta(error) } });
      return { ok: false, error, message: placeholder };
    }
    if (persistTimer !== null) window.clearTimeout(persistTimer);
    dispatch({ type: 'UPDATE_EXECUTOR_JOB', payload: final });

    const rawText = final.status === 'succeeded' ? stripVerdictBlock(readJobText(final)) : '';
    if (final.status === 'succeeded' && rawText.trim().length > 0) {
      const shown = req.finalizeContent ? req.finalizeContent(rawText) : rawText;
      const redacted = redactThreadOutput(shown);
      const metadata: ThreadMessage['metadata'] = {
        ...baseMeta,
        job_id: job.id,
        streaming: false,
        ...(redacted.redactionCount > 0 ? { redacted: true, redaction_count: redacted.redactionCount } : {}),
      };
      await persist(redacted.content, metadata);
      if (placeholderId) dispatch({ type: 'UPDATE_THREAD_MESSAGE', payload: { id: placeholderId, content: redacted.content, metadata } });
      return { ok: true, text: rawText, message: placeholder };
    }

    const error = final.status === 'succeeded' ? 'The local worker returned no text.' : describeJobFailure(final);
    const content = `Local turn ${final.status === 'succeeded' ? 'returned nothing' : final.status}: ${error}`;
    await persist(content, failureMeta(error));
    if (placeholderId) dispatch({ type: 'UPDATE_THREAD_MESSAGE', payload: { id: placeholderId, content, metadata: failureMeta(error) } });
    return { ok: false, error, message: placeholder };
  }, [state.conciergeAdapter, state.conciergeLocalModel, addMessage, dispatch]);

  // Re-read the executors table (bounded by a 12 s abort) and push it into state.
  // Returns null when the list could not be confirmed (timeout / error / signed out).
  const fetchExecutorsFresh = useCallback(async (): Promise<Executor[] | null> => {
    if (!user) return null;
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), EXECUTOR_REFRESH_TIMEOUT_MS);
    try {
      const { data, error } = await supabase
        .from('executors')
        .select('*')
        .eq('owner_user_id', user.id)
        .order('created_at', { ascending: false })
        .abortSignal(controller.signal);
      if (error || !data) return null;
      const executors = data as Executor[];
      dispatch({ type: 'SET_EXECUTORS', payload: executors });
      return executors;
    } catch {
      return null;
    } finally {
      window.clearTimeout(timer);
    }
  }, [user, dispatch]);

  // The executor list a routing decision should trust. `state.executors` is empty or
  // stale right after sign-in (the hosted REST API has answered in 4-7 s), so when it
  // shows nobody online for `adapter`, re-read the table before concluding "offline".
  // `confirmed` is false only when that re-read itself failed.
  const confirmOnlineExecutors = useCallback(async (
    adapter?: string,
  ): Promise<{ executors: Executor[]; confirmed: boolean }> => {
    if (selectOnlineExecutor(state.executors, adapter)) {
      return { executors: state.executors, confirmed: true };
    }
    const fresh = await fetchExecutorsFresh();
    if (!fresh) return { executors: state.executors, confirmed: false };
    return { executors: fresh, confirmed: true };
  }, [state.executors, fetchExecutorsFresh]);

  // Which backend this turn runs on, posting a one-line card when the claw is offline.
  const resolveTurnBackend = useCallback(async (
    threadId: string,
    override: ConversationBackend | undefined,
  ): Promise<ConversationBackend> => {
    const chosen = override ?? state.conversationBackend;
    if (chosen !== 'claw') return 'cloud';
    const { executors, confirmed } = await confirmOnlineExecutors(state.conciergeAdapter);
    const { backend, clawOffline } = resolveEffectiveBackend(chosen, executors, state.conciergeAdapter);
    if (clawOffline) {
      await addSystemEvent(threadId, {
        kind: 'info',
        system_event: {
          tone: 'info',
          title: confirmed
            ? 'Local executor offline — answering in the cloud'
            : 'Executor list could not be confirmed — answering in the cloud',
          body: confirmed
            ? `No online MaestroClaw executor advertises ${state.conciergeAdapter}. This turn uses ${state.conciergeModel} through the cloud. Start the worker to route turns locally again.`
            : `Maestro could not read the executor list within ${EXECUTOR_REFRESH_TIMEOUT_MS / 1000}s, so it cannot tell whether a MaestroClaw worker advertising ${state.conciergeAdapter} is online. This turn uses ${state.conciergeModel} through the cloud; the next turn checks again.`,
        },
      });
    }
    return backend;
  }, [state.conversationBackend, state.conciergeAdapter, state.conciergeModel, confirmOnlineExecutors, addSystemEvent]);

  // Send a message to the concierge and get a response
  const sendToConcierge = useCallback(async (
    threadId: string,
    userMessage: string,
    options: ConversationTurnOptions = {},
  ): Promise<ThreadMessage | null> => {
    if (!user || !state.activeSession) return null;

    dispatch({ type: 'SET_IS_CONCIERGE_SENDING', payload: true });

    try {
      await ensureAuth();

      // 1. Save user message (unless this is a retry of a message already in the thread)
      if (!options.skipUserMessage) {
        const userMsg = await addMessage(threadId, 'user', userMessage);
        if (!userMsg) throw new Error('Failed to save user message');
      }

      // 2. Build conversation context from thread history
      const conversationHistory = buildConversationContext(threadId, {
        dropTrailingUserMessage: options.skipUserMessage ? userMessage : undefined,
      });

      // 3. Load recent decision records for this session (MEM-02)
      let decisionMemory = '';
      try {
        const { data: loops } = await supabase
          .from('iteration_loops')
          .select('decision_record, completed_at')
          .eq('session_id', state.activeSession.id)
          .not('decision_record', 'is', null)
          .order('completed_at', { ascending: false })
          .limit(5);
        if (loops && loops.length > 0) {
          const records = loops.map(l => l.decision_record as unknown as StoredDecisionRecord);
          const lines = records.map(r => {
            const date = r.ts?.slice(0, 10) ?? '?';
            const files = r.files_touched?.length > 0
              ? ` Files: ${r.files_touched.slice(0, 3).join(', ')}${r.files_touched.length > 3 ? ` +${r.files_touched.length - 3}` : ''}.`
              : '';
            return `- ${date} [${r.outcome}/${r.problem_type}]: ${(r.task ?? '').slice(0, 80)}. Worked: ${(r.what_worked ?? '').slice(0, 60)}.${files}`;
          });
          decisionMemory = `## Recent Build Memory\n${lines.join('\n')}\n\n`;
        }
      } catch {
        // best-effort: don't let memory load failure block the concierge
      }

      // 4. Conversation-through-Claw: run the turn on the local worker when it is online.
      const backend = await resolveTurnBackend(threadId, options.backendOverride);
      if (backend === 'claw') {
        const localPrompt = flattenConciergePrompt({
          system: CONCIERGE_LOCAL_SYSTEM_PROMPT,
          conversation: `${decisionMemory}${conversationHistory}`,
          user: userMessage,
        });
        const result = await runLocalTurn({
          threadId,
          sessionId: state.activeSession.id,
          prompt: localPrompt,
          retryText: userMessage,
          retryKind: 'concierge',
        });
        return result.message;
      }

      // 4b. Build the prompt with decision memory prefix + conversation context
      const prompt = decisionMemory + (conversationHistory
        ? `${conversationHistory}\n\nUser: ${userMessage}`
        : userMessage);

      // 5. Determine which model/provider to use based on conciergeModel
      const { model, provider } = resolveConciergeRuntime(state.conciergeModel);

      // 6. Call orchestrate edge function directly (single agent, no round overhead)
      const result = await invokeEdgeFunction<OrchestrateResult>('orchestrate', {
        prompt,
        provider,
        model,
        agentName: 'Concierge',
        agentRole: 'Concierge — conversational partner for Maestro Claw Mode',
        mode: 'analysis',
        session_id: state.activeSession.id,
      });

      const responseContent = result.content ?? result.text ?? '';

      // 7. Save concierge response as thread message
      const conciergeMsg = await addMessage(threadId, 'concierge', responseContent);

      return conciergeMsg;
    } catch (err) {
      // On error, save a system message so the user sees what happened
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await addSystemEvent(threadId, {
        kind: 'error_retry',
        system_event: {
          tone: 'error',
          title: 'Concierge request failed',
          body: errorMessage,
        },
      });
      return null;
    } finally {
      dispatch({ type: 'SET_IS_CONCIERGE_SENDING', payload: false });
    }
  }, [user, state.activeSession, state.conciergeModel, ensureAuth, addMessage, addSystemEvent, buildConversationContext, dispatch, resolveConciergeRuntime, resolveTurnBackend, runLocalTurn]);

  // Send a message to a specific agent in a direct thread
  const sendToAgent = useCallback(async (
    threadId: string,
    agentId: string,
    userMessage: string,
  ): Promise<ThreadMessage | null> => {
    if (!user || !state.activeSession) return null;

    dispatch({ type: 'SET_IS_CONCIERGE_SENDING', payload: true });

    try {
      await ensureAuth();

      // Save user message
      const userMsg = await addMessage(threadId, 'user', userMessage);
      if (!userMsg) throw new Error('Failed to save user message');

      // Find the agent to determine provider/model
      const agent = state.agents.find(a => a.id === agentId);
      if (!agent) throw new Error('Agent not found');

      // Build conversation context from this thread
      const conversationHistory = buildConversationContext(threadId);
      const prompt = conversationHistory
        ? `${conversationHistory}\n\nUser: ${userMessage}`
        : userMessage;

      // Determine provider from agent
      let provider = agent.provider;
      if (provider === 'openrouter_a' || provider === 'openrouter_b') provider = 'openrouter';

      const result = await invokeEdgeFunction<OrchestrateResult>('orchestrate', {
        prompt,
        provider,
        model: agent.model,
        agentName: agent.display_name || agent.name,
        agentRole: agent.role,
        mode: 'analysis',
        session_id: state.activeSession.id,
      });

      const responseContent = result.content ?? result.text ?? '';
      const agentMsg = await addMessage(threadId, 'agent', responseContent, agentId);
      return agentMsg;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await addSystemEvent(threadId, {
        kind: 'error_retry',
        system_event: {
          tone: 'error',
          title: 'Agent request failed',
          body: errorMessage,
        },
      });
      return null;
    } finally {
      dispatch({ type: 'SET_IS_CONCIERGE_SENDING', payload: false });
    }
  }, [user, state.activeSession, state.agents, ensureAuth, addMessage, addSystemEvent, buildConversationContext, dispatch]);

  // Parse user message into an execution intent via Concierge
  const parseExecutionIntent = useCallback(async (
    userMessage: string,
  ): Promise<ExecutionIntent | null> => {
    let lastError: Error | null = null;

    try {
      await ensureAuth();
      for (const candidate of getConciergeCandidates('claude-sonnet-4-6')) {
        try {
          const result = await invokeEdgeFunction<OrchestrateResult>('orchestrate', {
            prompt: userMessage,
            provider: candidate.provider,
            model: candidate.model,
            agentName: 'ExecutionParser',
            agentRole: EXECUTION_INTENT_PROMPT,
            mode: 'analysis',
            session_id: state.activeSession?.id,
          });

          const raw = result.content ?? result.text ?? '';
          const parsed = parseStructuredJson<ExecutionIntent>(raw, 'Execution parser');

          if (parsed.command) {
            parsed.trust = classifyCommandTrust(parsed.command);
          } else if (!parsed.trust) {
            parsed.trust = 'approval_required';
          }

          return parsed;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    if (lastError) {
      console.error('Failed to parse execution intent:', lastError);
    } else {
      console.error('Failed to parse execution intent: no candidate models were available');
    }

    if (state.providerConnections.some(connection => connection.is_connected)) {
      return null;
    }

    console.error('No connected concierge provider is available for execution parsing.');
    return null;
  }, [state.activeSession, state.providerConnections, ensureAuth, getConciergeCandidates]);

  // Submit an execution job to the executor-api edge function.
  // Returns the created job, a pending-approval signal (HMAC token flow), or null on error.
  const submitExecutionJob = useCallback(async (
    intent: ExecutionIntent,
    threadId: string,
    approvalToken?: string,
  ): Promise<ExecutorJob | { pendingApproval: true; approvalToken: string } | null> => {
    if (!user || !state.activeSession) return null;

    try {
      const prompt = intent.command || `${intent.action}: ${JSON.stringify(intent.params)}`;

      type SubmitResponse =
        | { job: ExecutorJob }
        | { pending_approval: true; approval_token: string };

      const result = await callExecutorApi<SubmitResponse>('submit', {
        prompt,
        adapter: intent.adapter,
        job_type: intent.action,
        session_id: state.activeSession.id,
        timeout_seconds: 120,
        ...(approvalToken ? { approval_token: approvalToken } : {}),
      });

      // Server returned a pending-approval signal (HMAC token flow, no DB job yet).
      if ('pending_approval' in result && result.pending_approval) {
        await addSystemEvent(threadId, {
          kind: 'execution_approval',
          intent,
          system_event: {
            tone: 'approval',
            title: 'Approval required',
            body: intent.description,
            command: intent.command || intent.action,
            adapter: intent.adapter,
            trust: intent.trust,
          },
        });
        return { pendingApproval: true, approvalToken: result.approval_token };
      }

      if ('job' in result && result.job) {
        dispatch({ type: 'ADD_EXECUTOR_JOB', payload: result.job });

        // Subscribe to live streaming output for this job.
        // The subscription auto-terminates when a 'completed' event arrives.
        const jobId = result.job.id;
        const channel = supabase
          .channel(`job-stream-${jobId}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'executor_job_events', filter: `job_id=eq.${jobId}` },
            (payload) => {
              const rec = payload.new as { event_type: string; payload: Record<string, unknown> };
              if (rec.event_type === 'completed') {
                dispatch({ type: 'STREAMING_CLEAR', payload: jobId });
                supabase.removeChannel(channel);
                return;
              }
              if (rec.event_type !== 'stdout' && rec.event_type !== 'stderr') return;
              const body: Record<string, unknown> = rec.payload ?? {};
              const lines: string[] = Array.isArray(body.lines)
                ? (body.lines as string[])
                : typeof body.text === 'string'
                  ? body.text.split('\n').filter(Boolean)
                  : [];
              if (lines.length > 0) {
                dispatch({ type: 'STREAMING_APPEND', payload: { jobId, lines } });
              }
            },
          )
          .subscribe();
        // Backfill events that arrived before our subscription (subscribe-then-backfill pattern)
        supabase
          .from('executor_job_events')
          .select('event_type, payload, created_at')
          .eq('job_id', jobId)
          .in('event_type', ['stdout', 'stderr'])
          .order('created_at', { ascending: true })
          .returns<{ event_type: string; payload: Record<string, unknown> | null; created_at: string }[]>()
          .then(({ data }) => {
            if (!data || data.length === 0) return;
            const backfillLines: string[] = [];
            for (const row of data) {
              const body = (row.payload ?? {}) as Record<string, unknown>;
              if (Array.isArray(body.lines)) {
                backfillLines.push(...(body.lines as string[]));
              } else if (typeof body.text === 'string') {
                backfillLines.push(...body.text.split('\n').filter(Boolean));
              }
            }
            if (backfillLines.length > 0) {
              dispatch({ type: 'STREAMING_APPEND', payload: { jobId, lines: backfillLines } });
            }
          });

        const requiresApproval = result.job.approval_required && result.job.status === 'queued';
        await addSystemEvent(threadId, requiresApproval
          ? {
              kind: 'execution_approval',
              job_id: result.job.id,
              intent,
              system_event: {
                tone: 'approval',
                title: 'Approval required',
                body: intent.description,
                command: intent.command || intent.action,
                adapter: intent.adapter,
                trust: intent.trust,
              },
            }
          : {
              kind: 'execution_status',
              job_id: result.job.id,
              intent,
              system_event: {
                tone: 'execute',
                title: 'Executing',
                body: intent.description,
                command: intent.command || intent.action,
                adapter: intent.adapter,
                trust: intent.trust,
              },
            });
      }

      return 'job' in result ? result.job : null;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await addSystemEvent(threadId, {
        kind: 'error_retry',
        system_event: {
          tone: 'error',
          title: 'Failed to submit job',
          body: errorMessage,
        },
      });
      return null;
    }
  }, [user, state.activeSession, callExecutorApi, addSystemEvent, dispatch]);

  // Approve a queued execution job
  const approveExecutionJob = useCallback(async (
    jobId: string,
    threadId: string,
  ): Promise<boolean> => {
    try {
      const result = await callExecutorApi<{ job: ExecutorJob }>('approve', {
        job_id: jobId,
      });

      if (result.job) {
        dispatch({ type: 'UPDATE_EXECUTOR_JOB', payload: result.job });
        await addSystemEvent(threadId, {
          kind: 'execution_status',
          job_id: jobId,
          system_event: {
            tone: 'approval',
            title: 'Approved',
            body: 'Job sent to the executor.',
          },
        });
        return true;
      }
      return false;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await addSystemEvent(threadId, {
        kind: 'error_retry',
        job_id: jobId,
        system_event: {
          tone: 'error',
          title: 'Approval failed',
          body: errorMessage,
        },
      });
      return false;
    }
  }, [callExecutorApi, addSystemEvent, dispatch]);

  // Approve a pending-approval command using a HMAC token (SEC-02 token path).
  // Resubmits the original intent with the approval_token; server validates and creates the job approved.
  const approveWithToken = useCallback(async (
    approvalToken: string,
    intent: ExecutionIntent,
    threadId: string,
  ): Promise<ExecutorJob | null> => {
    try {
      const submitResult = await submitExecutionJob(intent, threadId, approvalToken);
      if (!submitResult) return null;

      if ('pendingApproval' in submitResult) {
        // Should not happen: server should never return pending_approval for a token resubmit.
        await addSystemEvent(threadId, {
          kind: 'error_retry',
          system_event: {
            tone: 'error',
            title: 'Approval error',
            body: 'Unexpected pending_approval response. Please retry the command.',
          },
        });
        return null;
      }

      dispatch({ type: 'SET_PENDING_EXECUTION', payload: null });
      return submitResult as ExecutorJob;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      const isExpired = errorMessage.includes('403') &&
        (errorMessage.includes('expired') || errorMessage.includes('mismatch'));

      dispatch({ type: 'SET_PENDING_EXECUTION', payload: null });
      await addSystemEvent(threadId, {
        kind: 'error_retry',
        system_event: {
          tone: 'error',
          title: isExpired ? 'Approval expired' : 'Approval failed',
          body: isExpired
            ? 'The approval window has passed. Please resubmit the command.'
            : errorMessage,
        },
      });
      return null;
    }
  }, [submitExecutionJob, addSystemEvent, dispatch]);
  const pollJobStatus = useCallback(async (
    jobId: string,
    threadId: string,
  ): Promise<ExecutorJob | null> => {
    const { data, error } = await supabase
      .from('executor_jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    if (error || !data) return null;
    const job = data as ExecutorJob;

    dispatch({ type: 'UPDATE_EXECUTOR_JOB', payload: job });

    if (job.status === 'succeeded') {
      dispatch({ type: 'STREAMING_CLEAR', payload: jobId });
      const summary = job.result_summary || 'Completed successfully.';
      await addSystemEvent(threadId, {
        kind: 'execution_status',
        job_id: jobId,
        system_event: {
          tone: 'execute',
          title: 'Execution complete',
          body: summary,
        },
      });
    } else if (job.status === 'failed') {
      dispatch({ type: 'STREAMING_CLEAR', payload: jobId });
      const errText = job.error_text || 'Unknown failure.';
      await addSystemEvent(threadId, {
        kind: 'error_retry',
        job_id: jobId,
        system_event: {
          tone: 'error',
          title: 'Execution failed',
          body: errText,
        },
      });
    }

    return job;
  }, [addSystemEvent, dispatch]);

  const kickJob = useCallback(async (jobId: string, threadId: string): Promise<void> => {
    try {
      await callExecutorApi('kick_job', { job_id: jobId });
      dispatch({ type: 'UPDATE_EXECUTOR_JOB', payload: { id: jobId, status: 'approved' } as ExecutorJob });
      await addSystemEvent(threadId, {
        kind: 'execution_status',
        job_id: jobId,
        system_event: { tone: 'execute', title: 'Job kicked', body: 'Reset to approved — executor will pick it up on next poll.' },
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await addSystemEvent(threadId, {
        kind: 'error_retry',
        job_id: jobId,
        system_event: { tone: 'error', title: 'Kick failed', body: errorMessage },
      });
    }
  }, [callExecutorApi, addSystemEvent, dispatch]);

  // Full execute flow: parse → approve/auto → submit → poll
  const executeFromChat = useCallback(async (
    threadId: string,
    userMessage: string,
  ): Promise<void> => {
    if (!user || !state.activeSession) return;

    // Pre-flight: check that at least one executor is online before burning an LLM call.
    // State can be stale right after sign-in, so re-read the table before refusing.
    const preflight = await confirmOnlineExecutors();
    let executors = preflight.executors;
    if (!selectOnlineExecutor(executors)) {
      await addSystemEvent(threadId, {
        kind: 'error_retry',
        system_event: {
          tone: 'error',
          title: preflight.confirmed ? 'No executor online' : 'Executor list could not be confirmed',
          body: preflight.confirmed
            ? 'Start MaestroClaw on your local machine, then try again. Check the Vault → Executors panel for status.'
            : `Maestro could not read the executor list within ${EXECUTOR_REFRESH_TIMEOUT_MS / 1000}s. Check your connection and the Vault → Executors panel, then try again.`,
        },
      });
      return;
    }

    dispatch({ type: 'SET_IS_CONCIERGE_SENDING', payload: true });

    try {
      // Save user's execution request
      await addMessage(threadId, 'user', `⚡ ${userMessage}`);

      const localIntent = tryParseLocalExecutionIntent(userMessage);
      const hasConciergeProvider = state.providerConnections.some(c => c.is_connected);

      let intent: ExecutionIntent | null = localIntent;
      if (localIntent) {
        await addSystemEvent(threadId, {
          kind: 'info',
          system_event: {
            tone: 'info',
            title: 'Parsed locally',
            body: 'Skipping the cloud intent parser for this command.',
          },
        });
      } else {
        if (!hasConciergeProvider) {
          await addSystemEvent(threadId, {
            kind: 'error_retry',
            system_event: {
              tone: 'error',
              title: 'No AI provider connected',
              body: 'Add an API key in Vault to allow Maestro to parse complex execution requests, or enter a direct command like `npm run build`.',
            },
          });
          return;
        }

        await addSystemEvent(threadId, {
          kind: 'info',
          system_event: {
            tone: 'info',
            title: 'Parsing execution intent',
          },
        });
        intent = await parseExecutionIntent(userMessage);
      }

      if (!intent) {
        await addSystemEvent(threadId, {
          kind: 'error_retry',
          system_event: {
            tone: 'error',
            title: 'Could not parse execution intent',
            body: 'Make sure your Anthropic or OpenAI key is connected in Vault. Try rephrasing the command more specifically (for example, "run npm install" or "list files in src/").',
          },
        });
        return;
      }

      // An executor being online is not enough: it must advertise the adapter
      // this intent needs, or the job would sit in the queue unclaimed.
      if (!selectOnlineExecutor(executors, intent.adapter)) {
        executors = (await confirmOnlineExecutors(intent.adapter)).executors;
      }
      if (!selectOnlineExecutor(executors, intent.adapter)) {
        const advertised = Array.from(new Set(
          executors
            .filter((ex) => selectOnlineExecutor([ex]))
            .flatMap((ex) => Array.isArray(ex.capabilities?.adapters) ? ex.capabilities.adapters : [])
            .filter((value): value is string => typeof value === 'string'),
        ));
        await addSystemEvent(threadId, {
          kind: 'info',
          system_event: {
            tone: 'info',
            title: `No online executor supports "${intent.adapter}"`,
            body: advertised.length > 0
              ? `The online executor advertises: ${advertised.join(', ')}. Start MaestroClaw with the ${intent.adapter} adapter enabled, or rephrase the request for one of the advertised adapters.`
              : `The online executor advertises no adapters. Check the MaestroClaw worker configuration and restart it.`,
            adapter: intent.adapter,
          },
        });
        return;
      }

      // Show what we parsed
      await addSystemEvent(threadId, {
        kind: 'execution_intent',
        intent,
        system_event: {
          tone: 'execute',
          title: intent.description,
          body: `Action: ${intent.action}\nAdapter: ${intent.adapter}\nTrust: ${intent.trust}`,
          command: intent.command,
          adapter: intent.adapter,
          trust: intent.trust,
        },
      });

      // Submit the job
      const submitResult = await submitExecutionJob(intent, threadId);
      if (!submitResult) return;

      // HMAC token flow: server issued a pending-approval token, no DB job yet.
      if ('pendingApproval' in submitResult && submitResult.pendingApproval) {
        dispatch({
          type: 'SET_PENDING_EXECUTION',
          payload: { approvalToken: submitResult.approvalToken, intent, threadId },
        });
        return;
      }

      const job = submitResult as ExecutorJob;

      // Legacy queued-job flow: server created a queued job (APPROVAL_TOKEN_SECRET not set).
      if (job.approval_required && job.status === 'queued') {
        dispatch({ type: 'SET_PENDING_EXECUTION', payload: { jobId: job.id, intent, threadId } });
        return;
      }

      // Trusted command — poll for completion
      let attempts = 0;
      const maxAttempts = 30;
      const pollInterval = 2000;

      const poll = async () => {
        while (attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, pollInterval));
          attempts++;
          const updated = await pollJobStatus(job.id, threadId);
          if (updated && (updated.status === 'succeeded' || updated.status === 'failed')) {
            return;
          }
        }
        await addSystemEvent(threadId, {
          kind: 'error_retry',
          job_id: job.id,
          system_event: {
            tone: 'error',
            title: 'Execution timed out',
            body: 'Check executor status and retry the command.',
          },
        });
      };

      await poll();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await addSystemEvent(threadId, {
        kind: 'error_retry',
        system_event: {
          tone: 'error',
          title: 'Execution error',
          body: errorMessage,
        },
      });
    } finally {
      dispatch({ type: 'SET_IS_CONCIERGE_SENDING', payload: false });
    }
  }, [user, state.activeSession, state.providerConnections, confirmOnlineExecutors, addMessage, addSystemEvent, parseExecutionIntent, submitExecutionJob, pollJobStatus, dispatch]);

  const activateBuildRunway = useCallback(async (
    threadId: string,
    userMessage: string,
    buildSpecOverride?: Record<string, unknown>,
  ) => {
    if (!state.activeSession) return;

    const buildSetup = getBuildSetupStatus();
    if (!buildSetup.ready) {
      throw new Error('Finish Pre-Build before starting the runway.');
    }

    const nextBuildSpec = buildSpecOverride ?? {
      ...buildSetup.buildSpec,
      requested_build_prompt: userMessage,
    };

    await updateSessionBuildState('build', nextBuildSpec);
    dispatch({ type: 'CLOSE_TRANSIENT' });
    dispatch({ type: 'SET_BUILD_PLAN', payload: null });

    const scopes = suggestSessionScope(state.activeSession?.architect_md);
    const localRouting = resolveLocalBuildRouting(
      buildSetup.lockedBuilderIds,
      buildSetup.executionBackend,
    );
    const builderNames = buildSetup.builderNames.length > 0
      ? buildSetup.builderNames
      : localRouting.builderNames;
    const builderLabel = builderNames.length > 0
      ? builderNames.join(', ')
      : `${buildSetup.lockedBuilderIds.length} builder${buildSetup.lockedBuilderIds.length !== 1 ? 's' : ''} locked`;
    const backendLabel = buildSetup.executionBackend === 'auto'
      ? 'Auto / hybrid routing'
      : buildSetup.executionBackend === 'local'
        ? 'Local session build'
        : 'Edge task build';

    dispatch({ type: 'RESET_SESSION_BUILD_STATE' });
    dispatch({ type: 'SET_CLAW_BUILD_SESSION', payload: {
      threadId,
      builderNames,
      suggestedScope: scopes.primary,
      executionBackend: buildSetup.executionBackend,
      activeJobId: null,
      defaultAdapter: localRouting.defaultAdapter,
    }});

    await addSystemEvent(threadId, {
      kind: 'build_status',
      system_event: {
        tone: 'build',
        title: 'Build runway ready',
        body: `Locked builders: ${builderLabel}\nBackend: ${backendLabel}\nSaved request: ${summarizeBuildRequest(userMessage)}\n\nReview the in-thread runway card to start the build, watch progress, and push to GitHub without leaving this thread.`,
      },
    });
  }, [state.activeSession, getBuildSetupStatus, updateSessionBuildState, dispatch, resolveLocalBuildRouting, addSystemEvent]);

  const buildFromChat = useCallback(async (
    threadId: string,
    userMessage: string,
  ): Promise<void> => {
    if (!user || !state.activeSession) return;

    // Guard: if build is already running, redirect appropriately.
    if (state.activeSession.current_phase === 'build' || state.activeSession.current_phase === 'bouncer') {
      await addMessage(threadId, 'user', userMessage);
      const buildSetup = getBuildSetupStatus();
      const scopes = suggestSessionScope(state.activeSession?.architect_md);
      const localRouting = resolveLocalBuildRouting(
        buildSetup.lockedBuilderIds,
        buildSetup.executionBackend,
      );
      const builderNames = buildSetup.builderNames.length > 0
        ? buildSetup.builderNames
        : localRouting.builderNames;
      if (!state.clawBuildSession) {
        dispatch({ type: 'SET_CLAW_BUILD_SESSION', payload: {
          threadId,
          builderNames,
          suggestedScope: scopes.primary,
          executionBackend: buildSetup.executionBackend,
          activeJobId: null,
          defaultAdapter: localRouting.defaultAdapter,
        }});
      }
      await addMessage(
        threadId,
        'system',
        'Build runway is already active.',
        undefined,
        {
          kind: 'build_status',
          system_event: {
            tone: 'build',
            title: 'Build runway already active',
            body: 'Use the in-thread runway card to monitor progress, review outputs, or open the advanced workspace view.',
          },
        },
      );
      return;
    }

    dispatch({ type: 'SET_IS_CONCIERGE_SENDING', payload: true });

    try {
      await addMessage(threadId, 'user', `🏗️ ${userMessage}`);
      await addSystemEvent(threadId, {
        kind: 'info',
        system_event: {
          tone: 'build',
          title: 'Checking build setup',
        },
      });

      const buildSetup = getBuildSetupStatus();
      const nextBuildSpec = {
        ...buildSetup.buildSpec,
        requested_build_prompt: userMessage,
      };

      if (!buildSetup.ready) {
        await updateSessionBuildState('pre_build', nextBuildSpec);
        const missingList = buildSetup.missing.map((item) => `- ${item}`).join('\n');
        await addSystemEvent(threadId, {
          kind: 'build_status',
          system_event: {
            tone: 'build',
            title: 'Pre-Build plan ready',
            body: `Before Maestro can start the real build flow, Pre-Build still needs:\n${missingList}\n\nUse the plan cards below to configure the build in-thread. The drawer is still available from any card as an advanced view.`,
          },
        });
        await ensurePreBuildPlanCards(threadId);
        return;
      }

      const requestedPrompt = typeof nextBuildSpec.requested_build_prompt === 'string'
        ? nextBuildSpec.requested_build_prompt
        : userMessage;
      await activateBuildRunway(threadId, requestedPrompt, nextBuildSpec);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await addSystemEvent(threadId, {
        kind: 'error_retry',
        system_event: {
          tone: 'error',
          title: 'Build handoff failed',
          body: errorMessage,
        },
      });
    } finally {
      dispatch({ type: 'SET_IS_CONCIERGE_SENDING', payload: false });
    }
  }, [user, state.activeSession, state.clawBuildSession, addMessage, addSystemEvent, getBuildSetupStatus, updateSessionBuildState, dispatch, ensurePreBuildPlanCards, activateBuildRunway, resolveLocalBuildRouting]);

  // ─── Brainstorm intent ──────────────────────────────────────────
  // Council answers in analysis mode (no auto-synthesis), debates when at least
  // three seats answered, then one deliberation-aware synthesis is posted to the
  // concierge thread as a plain-language summary card.
  const brainstormFromChat = useCallback(async (prompt: string, sessionOverride?: Session | null): Promise<void> => {
    const text = prompt.trim();
    const session = sessionOverride ?? state.activeSession;
    if (!user || !session || !text) return;
    if (state.isBroadcasting || state.isBrainstorming) {
      dispatch({ type: 'SHOW_TOAST', payload: 'Please wait — the council is still working.' });
      return;
    }

    const conciergeThread = await ensureConciergeThread(session.id);
    if (!conciergeThread) return;
    dispatch({ type: 'SET_ACTIVE_THREAD', payload: conciergeThread });
    dispatch({ type: 'SET_CLAW_VIEW', payload: 'concierge' });
    dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: null });

    // Local (MaestroClaw) agents join the council when the conversation backend is the
    // claw and an online executor advertises their adapter; cloud agents always do.
    // Same refreshed check as resolveTurnBackend: do not drop local seats on a stale list.
    const councilExecutors = state.conversationBackend === 'claw'
      ? (await confirmOnlineExecutors(state.conciergeAdapter)).executors
      : state.executors;
    const clawCouncil = resolveEffectiveBackend(state.conversationBackend, councilExecutors, state.conciergeAdapter).backend === 'claw';
    const seats = state.agents.filter((agent) => {
      if (!agent.is_active || agent.agent_role === 'executor') return false;
      if (agent.provider_group !== 'maestroclaw') return true;
      const adapter = resolveSeatAdapter(agent);
      return clawCouncil && !!adapter && isExecutorOnlineFor(councilExecutors, adapter);
    });
    if (seats.length === 0) {
      await addSystemEvent(conciergeThread.id, {
        kind: 'info',
        system_event: {
          tone: 'info',
          title: 'No council seats active',
          body: 'Turn on at least one council agent in the Orchestra drawer, then try Brainstorm again.',
        },
      });
      return;
    }

    await addMessage(conciergeThread.id, 'user', `Brainstorm: ${text}`);
    const broadcastThread = await createThread(session.id, 'broadcast', { title: text.slice(0, 60) });
    if (broadcastThread) {
      await addMessage(broadcastThread.id, 'user', text);
    }

    dispatch({ type: 'SET_IS_BRAINSTORMING', payload: true });
    dispatch({ type: 'SET_IS_CONCIERGE_SENDING', payload: true });
    try {
      await addSystemEvent(conciergeThread.id, {
        kind: 'info',
        system_event: {
          tone: 'info',
          title: 'Brainstorm started',
          body: `${seats.length} seat${seats.length === 1 ? '' : 's'} answering${seats.length >= 3 ? ', then debating,' : ''} then one plain-language summary. This usually takes a minute or two.`,
        },
      });

      dispatch({ type: 'SET_FOLIO_INDEX', payload: 0 });
      // modeOverride is required: broadcast() forces build mode while the session
      // phase is pre_build / build / bouncer, and a brainstorm is always analysis.
      const roundId = await broadcast(text, seats.map((agent) => agent.id), session, {
        skipTriage: true,
        skipSynthesis: true,
        modeOverride: 'analysis',
      });
      if (!roundId) {
        throw new Error('The council broadcast did not start. Check that at least one provider key is connected in the Vault.');
      }

      const { data: rawRows } = await supabase
        .from('responses')
        .select('agent_name, model, provider, kind')
        .eq('round_id', roundId);
      const rows = (rawRows ?? []) as Array<{ agent_name: string; model: string; provider: string; kind?: string | null }>;
      const primaries = rows.filter((row) => (row.kind ?? 'primary') === 'primary');
      const seatsAnswered: BrainstormSeat[] = primaries.map((row) => ({
        name: row.agent_name,
        model: row.model,
        provider: row.provider,
      }));

      // Deliberation still runs through the cloud `deliberate` function, which cannot
      // call a local seat. With local seats in the round (or the claw backend chosen),
      // skip it and say so on the card rather than burning keys on a partial debate.
      let deliberated = false;
      let deliberationNote: string | undefined;
      const hasLocalSeats = seats.some((seat) => seat.provider_group === 'maestroclaw');
      if (primaries.length >= 3) {
        if (clawCouncil || hasLocalSeats) {
          deliberationNote = hasLocalSeats
            ? 'Deliberation skipped: local Claw seats cannot debate through the cloud yet.'
            : 'Deliberation skipped: the conversation backend is the Claw.';
        } else {
          deliberated = await triggerDeliberationRef.current(roundId);
        }
      }

      const result = await synthesizeRef.current(roundId);
      const meta = result?.synthesis?.metadata ?? {};
      const consensus = meta.consensus ?? result?.content ?? '';
      if (!consensus) {
        throw new Error('Synthesis returned nothing to summarize.');
      }

      const tradeOffs = meta.trade_offs ?? [];
      const tensions = meta.unresolved_tensions ?? [];
      const recommendation = meta.recommendation ?? '';
      const plainText = [
        'Brainstorm summary',
        '',
        `What they agreed on: ${consensus}`,
        tradeOffs.length > 0
          ? `Where they disagreed: ${tradeOffs.map((trade) => `${trade.axis} (${trade.side_a.agent} vs ${trade.side_b.agent})`).join('; ')}`
          : null,
        tensions.length > 0 ? `Still to decide: ${tensions.join('; ')}` : null,
        recommendation ? `Recommendation: ${recommendation}` : null,
      ].filter((line): line is string => typeof line === 'string').join('\n');

      await addMessage(conciergeThread.id, 'system', plainText, undefined, {
        kind: 'brainstorm_summary',
        round_id: roundId,
        consensus,
        trade_offs: tradeOffs,
        unresolved_tensions: tensions,
        recommendation,
        ...(meta.acknowledged_weaknesses && meta.acknowledged_weaknesses.length > 0
          ? { acknowledged_weaknesses: meta.acknowledged_weaknesses }
          : {}),
        seats: seatsAnswered,
        deliberated,
        ...(deliberationNote ? { deliberation_note: deliberationNote } : {}),
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await addSystemEvent(conciergeThread.id, {
        kind: 'error_retry',
        system_event: {
          tone: 'error',
          title: 'Brainstorm failed',
          body: errorMessage,
        },
      });
    } finally {
      dispatch({ type: 'SET_IS_CONCIERGE_SENDING', payload: false });
      dispatch({ type: 'SET_IS_BRAINSTORMING', payload: false });
    }
  }, [user, state.activeSession, state.isBroadcasting, state.isBrainstorming, state.agents, state.conversationBackend, state.executors, state.conciergeAdapter, confirmOnlineExecutors, ensureConciergeThread, addMessage, addSystemEvent, createThread, broadcast, dispatch]);

  // ─── Discovery intent ───────────────────────────────────────────
  // One 'discovery' thread per session. The intake record lives in the latest
  // system message of kind 'discovery_record'; each turn replaces it (delete +
  // insert) so there is exactly one record card and it stays at the bottom.
  const replaceDiscoveryRecord = useCallback(async (
    threadId: string,
    previousMessageId: string | null,
    intake: DiscoveryIntakeRecord,
    done: boolean,
  ): Promise<ThreadMessage | null> => {
    if (previousMessageId) {
      await supabase.from('thread_messages').delete().eq('id', previousMessageId);
      dispatch({ type: 'REMOVE_THREAD_MESSAGE', payload: previousMessageId });
    }
    const progress = countDiscoveryProgress(intake);
    return addMessage(
      threadId,
      'system',
      `Discovery record · ${progress.answered}/${progress.total} answered${done ? ' · complete' : ''}`,
      undefined,
      { kind: 'discovery_record', intake, updated_at: new Date().toISOString(), done },
    );
  }, [addMessage, dispatch]);

  const discoveryFromChat = useCallback(async (
    userText: string,
    sessionOverride?: Session | null,
    options: ConversationTurnOptions = {},
  ): Promise<void> => {
    const text = userText.trim();
    const session = sessionOverride ?? state.activeSession;
    if (!user || !session || !text) return;
    if (state.isConciergeSending) {
      dispatch({ type: 'SHOW_TOAST', payload: 'Please wait — a request is still in progress.' });
      return;
    }

    // 1. Find (state, then DB) or create the session's discovery thread.
    let thread = state.threads.find(
      (candidate) => candidate.session_id === session.id && candidate.type === 'discovery' && candidate.status === 'active',
    ) ?? null;
    let isNew = false;
    if (!thread) {
      const { data } = await supabase
        .from('threads')
        .select('*')
        .eq('session_id', session.id)
        .eq('type', 'discovery')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        thread = data as Thread;
        dispatch({ type: 'ADD_THREAD', payload: thread });
      }
    }
    if (!thread) {
      thread = await createThread(session.id, 'discovery', { title: 'Discovery intake' });
      isNew = true;
    }
    if (!thread) return;

    const existingMessages = isNew ? [] : await loadThreadMessages(thread.id);
    dispatch({ type: 'SET_ACTIVE_THREAD', payload: thread });
    dispatch({ type: 'SET_CLAW_VIEW', payload: 'concierge' });
    dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: null });

    const recordMessage = [...existingMessages]
      .reverse()
      .find((message) => message.role === 'system' && message.metadata.kind === 'discovery_record') ?? null;
    const intake: DiscoveryIntakeRecord = recordMessage?.metadata.intake ?? {};

    dispatch({ type: 'SET_IS_CONCIERGE_SENDING', payload: true });
    try {
      if (isNew) {
        await addSystemEvent(thread.id, {
          kind: 'info',
          system_event: { tone: 'info', title: 'Discovery intake', body: DISCOVERY_OPENING_MESSAGE },
        });
      }
      if (!options.skipUserMessage) {
        await addMessage(thread.id, 'user', text);
      }

      // 2. /done ends the intake without another model call.
      if (/^\/done\b/i.test(text)) {
        await replaceDiscoveryRecord(thread.id, recordMessage?.id ?? null, intake, true);
        await addMessage(thread.id, 'concierge', 'Here is the record so far. Copy it as Markdown, or send it to the council to scope.');
        return;
      }

      // 3. Ask the concierge model for the next 2–3 questions + captured answers.
      await ensureAuth();
      const transcriptMessages = existingMessages
        .filter((message) => message.role === 'user' || message.role === 'concierge')
        .filter((message) => !(message.metadata?.kind === 'local_turn' && (message.metadata.streaming === true || typeof message.metadata.error === 'string')));
      if (options.skipUserMessage) {
        // Retry: the message being retried is already the last user turn in the thread.
        for (let i = transcriptMessages.length - 1; i >= 0; i -= 1) {
          if (transcriptMessages[i].role === 'user') {
            if (transcriptMessages[i].content === text) transcriptMessages.splice(i, 1);
            break;
          }
        }
      }
      const transcript = transcriptMessages
        .slice(-12)
        .map((message) => `${message.role === 'user' ? 'Person' : 'Concierge'}: ${message.content}`)
        .join('\n\n');
      const discoveryBody = buildDiscoveryPrompt({ answers: intake, transcript, userText: text });

      let rawReply = '';
      const backend = await resolveTurnBackend(thread.id, options.backendOverride);
      if (backend === 'claw') {
        const local = await runLocalTurn({
          threadId: thread.id,
          sessionId: session.id,
          prompt: flattenConciergePrompt({ system: buildDiscoveryLocalSystemPrompt(DISCOVERY_AGENT_ROLE), user: discoveryBody }),
          retryText: text,
          retryKind: 'discovery',
          finalizeContent: (raw) => parseDiscoveryReply(raw).message || 'Noted. Type /done whenever you want the record.',
        });
        if (!local.ok) return;
        rawReply = local.text;
      } else {
        const { model, provider } = resolveConciergeRuntime(state.conciergeModel);
        const result = await invokeEdgeFunction<OrchestrateResult>('orchestrate', {
          prompt: discoveryBody,
          provider,
          model,
          agentName: 'Concierge',
          agentRole: DISCOVERY_AGENT_ROLE,
          mode: 'analysis',
          session_id: session.id,
        });
        rawReply = result.content ?? result.text ?? '';
      }

      const parsed = parseDiscoveryReply(rawReply);
      const merged: DiscoveryIntakeRecord = { ...intake, ...parsed.answers };
      const progress = countDiscoveryProgress(merged);
      const done = parsed.done || (progress.total > 0 && progress.answered >= progress.total);

      if (backend !== 'claw') {
        await addMessage(thread.id, 'concierge', parsed.message || 'Noted. Type /done whenever you want the record.');
      }
      await replaceDiscoveryRecord(thread.id, recordMessage?.id ?? null, merged, done);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await addSystemEvent(thread.id, {
        kind: 'error_retry',
        system_event: {
          tone: 'error',
          title: 'Discovery turn failed',
          body: errorMessage,
        },
      });
    } finally {
      dispatch({ type: 'SET_IS_CONCIERGE_SENDING', payload: false });
    }
  }, [user, state.activeSession, state.isConciergeSending, state.threads, state.conciergeModel, createThread, loadThreadMessages, addSystemEvent, addMessage, replaceDiscoveryRecord, ensureAuth, resolveConciergeRuntime, resolveTurnBackend, runLocalTurn, dispatch]);

  return {
    loadThreads,
    loadThreadMessages,
    createThread,
    ensureConciergeThread,
    addMessage,
    sendToConcierge,
    sendToAgent,
    buildConversationContext,
    parseExecutionIntent,
    submitExecutionJob,
    approveExecutionJob,
    approveWithToken,
    pollJobStatus,
    executeFromChat,
    buildFromChat,
    brainstormFromChat,
    discoveryFromChat,
    activateBuildRunway,
    focusDirectThread,
    pinResponse,
    compareResponses,
    extractDecision,
    askFollowUp,
    kickJob,
  };
}
