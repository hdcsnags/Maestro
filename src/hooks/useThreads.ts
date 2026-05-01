import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { invokeEdgeFunction } from '../lib/functions';
import { useMaestro } from '../context/MaestroContext';
import { useAuth } from '../context/AuthContext';
import type { Thread, ThreadMessage, ThreadType, ExecutionIntent, ExecutorJob, FileManifestEntry, ProviderConnection, ThreadPlanCardKind, Response as MaestroResponse } from '../types';
import { classifyCommandTrust, EXECUTION_INTENT_PROMPT, CONCIERGE_MODELS } from '../types';

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
    return {
      action: 'shell_command',
      command: quotedCommand,
      params: {},
      adapter: 'approved_shell',
      trust: classifyCommandTrust(quotedCommand),
      description: describeLocalCommand(quotedCommand),
    };
  }

  if (looksLikeDirectCommand(trimmed)) {
    return {
      action: 'shell_command',
      command: trimmed,
      params: {},
      adapter: 'approved_shell',
      trust: classifyCommandTrust(trimmed),
      description: describeLocalCommand(trimmed),
    };
  }

  const runMatch = trimmed.match(/^(?:please\s+)?(?:run|execute|try)\s+(.+)$/i);
  const runCommand = runMatch?.[1]?.trim();
  if (runCommand && looksLikeDirectCommand(runCommand)) {
    return {
      action: 'shell_command',
      command: runCommand,
      params: {},
      adapter: 'approved_shell',
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

export function useThreads() {
  const { state, dispatch } = useMaestro();
  const { user, session: authSession } = useAuth();

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

  // Build conversation history for the orchestrate call
  const buildConversationContext = useCallback((threadId: string): string => {
    const messages = state.threadMessages
      .filter(m => m.thread_id === threadId)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    if (messages.length === 0) return '';

    return messages.map(m => {
      const label = m.role === 'user' ? 'User' : 'Concierge';
      return `${label}: ${m.content}`;
    }).join('\n\n');
  }, [state.threadMessages]);

  // Send a message to the concierge and get a response
  const sendToConcierge = useCallback(async (
    threadId: string,
    userMessage: string,
  ): Promise<ThreadMessage | null> => {
    if (!user || !state.activeSession) return null;

    dispatch({ type: 'SET_IS_CONCIERGE_SENDING', payload: true });

    try {
      await ensureAuth();

      // 1. Save user message
      const userMsg = await addMessage(threadId, 'user', userMessage);
      if (!userMsg) throw new Error('Failed to save user message');

      // 2. Build conversation context from thread history
      const conversationHistory = buildConversationContext(threadId);

      // 3. Build the prompt with conversation context
      const prompt = conversationHistory
        ? `${conversationHistory}\n\nUser: ${userMessage}`
        : userMessage;

      // 4. Determine which model/provider to use based on conciergeModel
      const { model, provider } = resolveConciergeRuntime(state.conciergeModel);

      // 5. Call orchestrate edge function directly (single agent, no round overhead)
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

      // 6. Save concierge response as thread message
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
  }, [user, state.activeSession, state.conciergeModel, ensureAuth, addMessage, addSystemEvent, buildConversationContext, dispatch, resolveConciergeRuntime]);

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
      for (const candidate of getConciergeCandidates('claude-haiku-4-5')) {
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

  // Submit an execution job to the executor-api edge function
  const submitExecutionJob = useCallback(async (
    intent: ExecutionIntent,
    threadId: string,
  ): Promise<ExecutorJob | null> => {
    if (!user || !state.activeSession) return null;

    try {
      const prompt = intent.command || `${intent.action}: ${JSON.stringify(intent.params)}`;

      const result = await callExecutorApi<{ job: ExecutorJob }>('submit', {
        prompt,
        adapter: intent.adapter,
        job_type: intent.action,
        session_id: state.activeSession.id,
        timeout_seconds: 120,
      });

      if (result.job) {
        dispatch({ type: 'ADD_EXECUTOR_JOB', payload: result.job });

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

      return result.job;
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

  // Poll a job's status and post updates to the thread
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

  // Full execute flow: parse → approve/auto → submit → poll
  const executeFromChat = useCallback(async (
    threadId: string,
    userMessage: string,
  ): Promise<void> => {
    if (!user || !state.activeSession) return;

    // Pre-flight: check that at least one executor is online before burning an LLM call
    const hasOnlineExecutor = state.executors.some(ex => {
      if (ex.status !== 'online') return false;
      if (!ex.last_seen_at) return false;
      return Date.now() - new Date(ex.last_seen_at).getTime() < 60_000;
    });
    if (!hasOnlineExecutor) {
      await addSystemEvent(threadId, {
        kind: 'error_retry',
        system_event: {
          tone: 'error',
          title: 'No executor online',
          body: 'Start MaestroClaw on your local machine, then try again. Check the Vault → Executors panel for status.',
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
      const job = await submitExecutionJob(intent, threadId);
      if (!job) return;

      // If it needs approval, stop here — UI will show approve button
      if (job.approval_required && job.status === 'queued') {
        // Store the pending job info so the UI can render an approval card
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
  }, [user, state.activeSession, state.executors, state.providerConnections, addMessage, addSystemEvent, parseExecutionIntent, submitExecutionJob, pollJobStatus, dispatch]);

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
    pollJobStatus,
    executeFromChat,
    buildFromChat,
    activateBuildRunway,
    focusDirectThread,
    pinResponse,
    compareResponses,
    extractDecision,
    askFollowUp,
  };
}
