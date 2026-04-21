import { useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { invokeEdgeFunction } from '../lib/functions';
import { useMaestro } from '../context/MaestroContext';
import { useAuth } from '../context/AuthContext';
import type { Thread, ThreadMessage, ThreadType, ExecutionIntent, ExecutorJob, ChatBuildPlan, ChatBuildFile, FileManifestEntry, ExecutionRun, ProviderConnection } from '../types';
import { classifyCommandTrust, EXECUTION_INTENT_PROMPT, BUILD_PLAN_PROMPT, CONCIERGE_MODELS } from '../types';

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

const BUILD_PLAN_REPAIR_PROMPT = `You are Maestro's build-plan recovery assistant.
Your job is to turn a broad or under-specified build request into a conservative FIRST executable build slice.

Return JSON only:
{
  "description": "Brief description of what will be built now, including any key assumptions",
  "files": [
    { "path": "src/example.tsx", "action": "create", "description": "What this file accomplishes in the first slice" }
  ],
  "commit_message": "feat: descriptive commit message"
}

Rules:
- Never ask follow-up questions
- Choose a first slice that is reviewable and executable now
- Prefer 3-8 files, maximum 10
- If codebase context is available, fit the existing stack and paths
- If codebase context is missing, assume a conventional modern web-app structure
- Focus on app shell, primary interaction, and clearly requested backend entrypoints
- Return ONLY valid JSON`;

const BUILD_PLAN_CONTEXT_FILES = [
  'package.json',
  'src/main.tsx',
  'src/App.tsx',
  'README.md',
  'tsconfig.json',
  'vite.config.ts',
  'server/index.ts',
];

const BUILD_PLAN_CLARIFICATION_PATTERNS = [
  /don't have a target yet/i,
  /need specifics/i,
  /need to know/i,
  /what are we building/i,
  /what's the repository context/i,
  /what tech stack/i,
  /what's the desired outcome/i,
  /give me even a one-sentence description/i,
  /before i can produce/i,
];

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

function looksLikeClarificationResponse(raw: string): boolean {
  const text = raw.trim();
  if (!text) return false;
  return BUILD_PLAN_CLARIFICATION_PATTERNS.some((pattern) => pattern.test(text));
}

function maybeExtractPlannerMessage(candidate: unknown): string | null {
  if (!candidate || typeof candidate !== 'object') return null;
  const parsed = candidate as Record<string, unknown>;
  return typeof parsed.content === 'string' && !Array.isArray(parsed.files)
    ? parsed.content.trim()
    : null;
}

function summarizeBuildRequest(userMessage: string): string {
  const normalized = userMessage.replace(/\s+/g, ' ').trim();
  if (!normalized) return 'the requested build';
  return normalized.length > 96 ? `${normalized.slice(0, 93).trimEnd()}...` : normalized;
}

function pushUniqueBuildFile(files: ChatBuildFile[], next: ChatBuildFile) {
  if (files.some((file) => file.path === next.path)) return;
  files.push(next);
}

function buildConservativeFallbackPlan(userMessage: string): ChatBuildPlan {
  const lower = userMessage.toLowerCase();
  const files: ChatBuildFile[] = [];
  const wantsBackend = /\b(api|backend|server|auth|database|sql|service|admin|dashboard)\b/.test(lower);
  const wantsLanding = /\b(site|website|homepage|landing|portal|public|school|district)\b/.test(lower);
  const wantsDashboard = /\b(dashboard|admin|portal|console)\b/.test(lower);
  const wantsModeToggle = /\b(toggle|tutorial mode|live mode|mode switch|mode toggle|side by side)\b/.test(lower);

  pushUniqueBuildFile(files, {
    path: 'src/App.tsx',
    action: 'update',
    description: 'Refocus the app shell around the requested experience and wire the first reviewable slice into the main entry surface.',
  });

  if (wantsLanding || files.length === 1) {
    pushUniqueBuildFile(files, {
      path: 'src/features/build/LandingExperience.tsx',
      action: 'create',
      description: 'Create the primary landing experience for the first build slice, including the public-facing narrative and core entry points.',
    });
  }

  if (wantsModeToggle) {
    pushUniqueBuildFile(files, {
      path: 'src/components/ExperienceModeToggle.tsx',
      action: 'create',
      description: 'Add the top-level mode switch that lets users move between the two requested learning or usage modes.',
    });
  }

  if (wantsDashboard) {
    pushUniqueBuildFile(files, {
      path: 'src/features/build/DashboardSurface.tsx',
      action: 'create',
      description: 'Add the first dashboard surface that demonstrates the requested internal or administrative experience.',
    });
  }

  if (wantsBackend) {
    pushUniqueBuildFile(files, {
      path: 'server/index.ts',
      action: 'create',
      description: 'Stand up the backend entrypoint for the first slice so the requested server-side behaviors have a concrete integration surface.',
    });
    pushUniqueBuildFile(files, {
      path: 'server/routes/experience.ts',
      action: 'create',
      description: 'Define the initial backend route layer that supports the first slice of the requested experience.',
    });
  }

  pushUniqueBuildFile(files, {
    path: 'README.md',
    action: 'update',
    description: 'Document the first-slice assumptions, scope, and how to run or review the generated build.',
  });

  return {
    description: `Assumption-based starter build plan for ${summarizeBuildRequest(userMessage)}. This first pass focuses on a reviewable foundation slice because the planner returned clarification prose instead of structured JSON.`,
    files: files.slice(0, 8),
    commit_message: 'feat: scaffold first build slice',
  };
}

function normalizeChatBuildPlan(candidate: unknown): ChatBuildPlan {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error('Build planner returned an invalid plan.');
  }

  const plan = candidate as Partial<ChatBuildPlan> & { files?: unknown[] };
  const files = Array.isArray(plan.files)
    ? plan.files.flatMap((file): ChatBuildFile[] => {
        if (!file || typeof file !== 'object') return [];
        const candidateFile = file as Partial<ChatBuildFile>;
        const path = typeof candidateFile.path === 'string' ? candidateFile.path.trim() : '';
        const description = typeof candidateFile.description === 'string' ? candidateFile.description.trim() : '';
        const action = candidateFile.action;
        if (!path || !description || (action !== 'create' && action !== 'update' && action !== 'delete')) {
          return [];
        }
        return [{ path, description, action }];
      })
    : [];

  if (files.length === 0) {
    throw new Error('Build planner returned no actionable files.');
  }

  const description = typeof plan.description === 'string' && plan.description.trim().length > 0
    ? plan.description.trim()
    : `Build plan covering ${files.length} file${files.length === 1 ? '' : 's'}.`;
  const commit_message = typeof plan.commit_message === 'string' && plan.commit_message.trim().length > 0
    ? plan.commit_message.trim()
    : 'feat: apply claw build plan';
  const branch_name = typeof plan.branch_name === 'string' && plan.branch_name.trim().length > 0
    ? plan.branch_name.trim()
    : undefined;

  return {
    description,
    files,
    commit_message,
    ...(branch_name ? { branch_name } : {}),
  };
}

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
  ): Promise<ThreadMessage | null> => {
    if (!user) return null;

    const persisted =
      role === 'user'
        ? { content, metadata: {} as Record<string, unknown> }
        : (() => {
            const redacted = redactThreadOutput(content);
            return {
              content: redacted.content,
              metadata: redacted.redactionCount > 0
                ? { redacted: true, redaction_count: redacted.redactionCount }
                : {},
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
      await addMessage(threadId, 'system', `Error: ${errorMessage}`);
      return null;
    } finally {
      dispatch({ type: 'SET_IS_CONCIERGE_SENDING', payload: false });
    }
  }, [user, state.activeSession, state.conciergeModel, ensureAuth, addMessage, buildConversationContext, dispatch, resolveConciergeRuntime]);

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
      await addMessage(threadId, 'system', `Error: ${errorMessage}`);
      return null;
    } finally {
      dispatch({ type: 'SET_IS_CONCIERGE_SENDING', payload: false });
    }
  }, [user, state.activeSession, state.agents, ensureAuth, addMessage, buildConversationContext, dispatch]);

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

        const statusIcon = requiresApproval ? '⏳' : '⚡';
        const statusText = requiresApproval
          ? `${statusIcon} Awaiting approval: **${intent.description}**\n\nCommand: \`${intent.command || intent.action}\``
          : `${statusIcon} Executing: ${intent.description}`;
        await addMessage(threadId, 'system', statusText);
      }

      return result.job;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await addMessage(threadId, 'system', `❌ Failed to submit job: ${errorMessage}`);
      return null;
    }
  }, [user, state.activeSession, callExecutorApi, addMessage, dispatch]);

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
        await addMessage(threadId, 'system', '✅ Approved — job sent to executor.');
        return true;
      }
      return false;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await addMessage(threadId, 'system', `❌ Approval failed: ${errorMessage}`);
      return false;
    }
  }, [callExecutorApi, addMessage, dispatch]);

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
      await addMessage(threadId, 'system', `✅ **Done**: ${summary}`);
    } else if (job.status === 'failed') {
      const errText = job.error_text || 'Unknown failure.';
      await addMessage(threadId, 'system', `❌ **Failed**: ${errText}`);
    }

    return job;
  }, [addMessage, dispatch]);

  // Full execute flow: parse → approve/auto → submit → poll
  const executeFromChat = useCallback(async (
    threadId: string,
    userMessage: string,
  ): Promise<void> => {
    if (!user || !state.activeSession) return;

    dispatch({ type: 'SET_IS_CONCIERGE_SENDING', payload: true });

    try {
      // Save user's execution request
      await addMessage(threadId, 'user', `⚡ ${userMessage}`);

      // Parse intent
      await addMessage(threadId, 'system', '🔍 Parsing execution intent...');
      const intent = await parseExecutionIntent(userMessage);

      if (!intent) {
        await addMessage(threadId, 'system', '❌ Could not parse execution intent. Try rephrasing.');
        return;
      }

      // Show what we parsed
      await addMessage(threadId, 'system',
        `📋 **${intent.description}**\nAction: \`${intent.action}\`${intent.command ? `\nCommand: \`${intent.command}\`` : ''}\nAdapter: ${intent.adapter}\nTrust: ${intent.trust}`
      );

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
        await addMessage(threadId, 'system', '⏰ Execution timed out. Check executor status.');
      };

      await poll();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await addMessage(threadId, 'system', `❌ Execution error: ${errorMessage}`);
    } finally {
      dispatch({ type: 'SET_IS_CONCIERGE_SENDING', payload: false });
    }
  }, [user, state.activeSession, addMessage, parseExecutionIntent, submitExecutionJob, pollJobStatus, dispatch]);

  // ─── Build from Chat (Phase 3) ──────────────────────────────

  // Generate a build plan from user's description
  const generateBuildPlan = useCallback(async (
    threadId: string,
    userMessage: string,
  ): Promise<ChatBuildPlan | null> => {
    let lastError: Error | null = null;

    try {
      await ensureAuth();
      const conversationHistory = buildConversationContext(threadId);
      const planningPrompt = conversationHistory
        ? `${conversationHistory}\n\nCurrent build request: ${userMessage}`
        : userMessage;
      const activeRepoConnection = state.activeRepoConnection
        ?? state.repoConnections?.find((repo) => repo.is_active)
        ?? null;
      const plannerContextFiles = activeRepoConnection
        ? BUILD_PLAN_CONTEXT_FILES.map((path) => ({ path }))
        : undefined;

      const invokeBuildPlanner = async (
        candidate: ConciergeRuntimeChoice,
        prompt: string,
        agentRole: string,
        agentName: string,
      ): Promise<string> => {
        const result = await invokeEdgeFunction<OrchestrateResult>('orchestrate', {
          prompt,
          provider: candidate.provider,
          model: candidate.model,
          agentName,
          agentRole,
          mode: 'analysis',
          session_id: state.activeSession?.id,
          repo_connection_id: activeRepoConnection?.id,
          context_files: plannerContextFiles,
        });

        return result.content ?? result.text ?? '';
      };

      for (const candidate of getConciergeCandidates()) {
        try {
          const raw = await invokeBuildPlanner(candidate, planningPrompt, BUILD_PLAN_PROMPT, 'BuildPlanner');

          try {
            const parsed = parseStructuredJson<unknown>(raw, 'Build planner');
            return normalizeChatBuildPlan(parsed);
          } catch (parseOrNormalizeError) {
            const plannerMessage = raw;
            const shouldRepair = looksLikeClarificationResponse(plannerMessage);
            const parsedCandidate = (() => {
              try {
                return parseStructuredJson<unknown>(raw, 'Build planner');
              } catch {
                return null;
              }
            })();
            const extractedMessage = maybeExtractPlannerMessage(parsedCandidate);
            const shouldFallback = shouldRepair || (extractedMessage ? looksLikeClarificationResponse(extractedMessage) : false);

            if (!shouldFallback) {
              throw parseOrNormalizeError;
            }

            try {
              const repairPrompt = `Original build request:\n${planningPrompt}\n\nThe previous planner response was not usable JSON:\n${raw}\n\nReturn the conservative first executable build slice as valid JSON now.`;
              const repairedRaw = await invokeBuildPlanner(candidate, repairPrompt, BUILD_PLAN_REPAIR_PROMPT, 'BuildPlannerRepair');
              const repaired = parseStructuredJson<unknown>(repairedRaw, 'Build planner recovery');
              return normalizeChatBuildPlan(repaired);
            } catch {
              await addMessage(
                threadId,
                'system',
                '⚠️ Build planner asked for clarification instead of returning JSON, so Maestro generated a conservative first-pass plan. Review the file list before approving.',
              );
              return buildConservativeFallbackPlan(userMessage);
            }
          }
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
        }
      }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
    }

    console.error('Failed to generate build plan:', lastError);
    await addMessage(
      threadId,
      'system',
      `❌ Could not generate build plan.${lastError?.message ? ` ${lastError.message}` : ''}`,
    );
    return null;
  }, [state.activeSession, state.activeRepoConnection, state.repoConnections, ensureAuth, addMessage, buildConversationContext, getConciergeCandidates]);

  // Execute the build: call orchestrate in build mode for each file, then commit via github-execute
  const executeBuildPlan = useCallback(async (
    threadId: string,
    plan: ChatBuildPlan,
  ): Promise<void> => {
    if (!user || !state.activeSession) return;

    dispatch({ type: 'SET_CHAT_BUILD_PHASE', payload: 'building' });

    const activeRepo = state.repoConnections?.find((r: { is_active: boolean }) => r.is_active);
    if (!activeRepo) {
      await addMessage(threadId, 'system', '❌ No active repo connection. Connect a repo in the Vault first.');
      dispatch({ type: 'SET_CHAT_BUILD_PHASE', payload: 'failed' });
      return;
    }

    const buildRuntime = resolveConciergeRuntime(state.conciergeModel || 'claude-sonnet-4-6');

    const allManifestEntries: FileManifestEntry[] = [];
    const buildFiles = plan.files.filter((f: ChatBuildFile) => f.action !== 'delete');
    const deleteFiles = plan.files.filter((f: ChatBuildFile) => f.action === 'delete');

    // Build each file via orchestrate in build mode
    for (const file of buildFiles) {
      await addMessage(threadId, 'system', `🔨 Building \`${file.path}\` — ${file.description}...`);

      try {
        await ensureAuth();
        const buildPrompt = `Build the file "${file.path}": ${file.description}\n\nContext from the overall plan: ${plan.description}`;

        const result = await invokeEdgeFunction<OrchestrateResult>('orchestrate', {
          prompt: buildPrompt,
          provider: buildRuntime.provider,
          model: buildRuntime.model,
          agentName: 'Builder',
          agentRole: 'You are a code builder. Write complete, production-ready files.',
          mode: 'build',
          session_id: state.activeSession.id,
          scopedPaths: [file.path],
        });

        if (result.file_manifest && result.file_manifest.length > 0) {
          allManifestEntries.push(...result.file_manifest);
          const lineCount = result.file_manifest.reduce((sum, e) =>
            sum + (e.content ? e.content.split('\n').length : 0), 0);
          await addMessage(threadId, 'system', `✅ \`${file.path}\` — ${lineCount} lines`);
        } else {
          await addMessage(threadId, 'system', `⚠️ \`${file.path}\` — no file manifest returned, skipping`);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        await addMessage(threadId, 'system', `❌ \`${file.path}\` failed: ${errorMessage}`);
      }
    }

    // Add delete entries
    for (const file of deleteFiles) {
      allManifestEntries.push({ path: file.path, content: null, operation: 'delete' });
      await addMessage(threadId, 'system', `🗑️ Marked for deletion: \`${file.path}\``);
    }

    if (allManifestEntries.length === 0) {
      await addMessage(threadId, 'system', '❌ No files were built successfully. Aborting.');
      dispatch({ type: 'SET_CHAT_BUILD_PHASE', payload: 'failed' });
      return;
    }

    // Commit via github-execute
    dispatch({ type: 'SET_CHAT_BUILD_PHASE', payload: 'committing' });
    await addMessage(threadId, 'system', `📦 Committing ${allManifestEntries.length} file(s) to GitHub...`);

    try {
      // Create execution run
      const { data: run, error: runErr } = await supabase
        .from('execution_runs')
        .insert({
          session_id: state.activeSession.id,
          user_id: user.id,
          repo_connection_id: activeRepo.id,
          execution_mode: 'build',
          status: 'approved',
          strategy: 'synthesized',
          branch_name: plan.branch_name || `maestro/build/${Date.now()}`,
          requires_approval: false,
        } as never)
        .select()
        .maybeSingle();

      if (runErr || !run) {
        throw new Error(runErr?.message || 'Failed to create execution run');
      }

      const execRun = run as unknown as ExecutionRun;

      // Call github-execute
      const result = await invokeEdgeFunction<{
        result?: { prs?: Array<{ html_url: string }>; written_files?: string[]; errors?: string[] };
        error?: string;
      }>('github-execute', {
        mode: 'synthesized',
        repo_connection_id: activeRepo.id,
        execution_run_id: execRun.id,
        session_id: state.activeSession.id,
        patches: [{
          agent_name: 'ChatBuilder',
          agent_id: 'chat-build',
          content: plan.description,
          scoped_paths: plan.files.map((f: ChatBuildFile) => f.path),
          commit_message: plan.commit_message,
          conductor_approved: true,
          file_manifest: allManifestEntries,
        }],
        conductor_approved: true,
        commit_message: plan.commit_message,
      });

      if (result.error) {
        throw new Error(result.error);
      }

      const prUrls = result.result?.prs?.map(p => p.html_url) ?? [];
      const writtenCount = result.result?.written_files?.length ?? allManifestEntries.length;
      const errors = result.result?.errors ?? [];

      let summary = `✅ **Build complete!** ${writtenCount} file(s) written.`;
      if (prUrls.length > 0) {
        summary += `\n\n🔗 PR: ${prUrls.join('\n')}`;
      }
      if (errors.length > 0) {
        summary += `\n\n⚠️ Warnings: ${errors.join(', ')}`;
      }

      await addMessage(threadId, 'system', summary);
      dispatch({ type: 'SET_CHAT_BUILD_PHASE', payload: 'done' });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await addMessage(threadId, 'system', `❌ Commit failed: ${errorMessage}`);
      dispatch({ type: 'SET_CHAT_BUILD_PHASE', payload: 'failed' });
    }
  }, [user, state.activeSession, state.conciergeModel, state.repoConnections, ensureAuth, addMessage, dispatch, resolveConciergeRuntime]);

  // Full build-from-chat flow: plan → review → build → commit
  const buildFromChat = useCallback(async (
    threadId: string,
    userMessage: string,
  ): Promise<void> => {
    if (!user || !state.activeSession) return;

    dispatch({ type: 'SET_IS_CONCIERGE_SENDING', payload: true });
    dispatch({ type: 'SET_CHAT_BUILD_PHASE', payload: 'planning' });

    try {
      await addMessage(threadId, 'user', `🏗️ ${userMessage}`);
      await addMessage(threadId, 'system', '📋 Generating build plan...');

      const plan = await generateBuildPlan(threadId, userMessage);
      if (!plan) {
        dispatch({ type: 'SET_CHAT_BUILD_PHASE', payload: 'failed' });
        return;
      }

      // Store plan and show for review
      dispatch({ type: 'SET_CHAT_BUILD_PLAN', payload: plan });
      dispatch({ type: 'SET_CHAT_BUILD_PHASE', payload: 'reviewing' });

      // Format plan as a readable message
      const fileList = plan.files.map((f: ChatBuildFile) => {
        const icon = f.action === 'create' ? '📄' : f.action === 'update' ? '📝' : '🗑️';
        return `  ${icon} \`${f.path}\` — ${f.description}`;
      }).join('\n');

      await addMessage(threadId, 'system',
        `📋 **Build Plan**\n\n${plan.description}\n\n**Files (${plan.files.length}):**\n${fileList}\n\n**Commit:** ${plan.commit_message}\n\n👆 Click **Approve Build** to proceed or **Cancel** to abort.`
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      await addMessage(threadId, 'system', `❌ Build planning error: ${errorMessage}`);
      dispatch({ type: 'SET_CHAT_BUILD_PHASE', payload: 'failed' });
    } finally {
      dispatch({ type: 'SET_IS_CONCIERGE_SENDING', payload: false });
    }
  }, [user, state.activeSession, addMessage, generateBuildPlan, dispatch]);

  // Approve and execute a pending build plan
  const approveBuildPlan = useCallback(async (
    threadId: string,
  ): Promise<void> => {
    const plan = state.chatBuildPlan;
    if (!plan) return;

    dispatch({ type: 'SET_IS_CONCIERGE_SENDING', payload: true });

    try {
      await addMessage(threadId, 'system', '🚀 Build approved — starting execution...');
      await executeBuildPlan(threadId, plan);
    } finally {
      dispatch({ type: 'SET_CHAT_BUILD_PLAN', payload: null });
      dispatch({ type: 'SET_IS_CONCIERGE_SENDING', payload: false });
    }
  }, [state.chatBuildPlan, addMessage, executeBuildPlan, dispatch]);

  // Cancel a pending build plan
  const cancelBuildPlan = useCallback(async (
    threadId: string,
  ): Promise<void> => {
    dispatch({ type: 'SET_CHAT_BUILD_PLAN', payload: null });
    dispatch({ type: 'SET_CHAT_BUILD_PHASE', payload: 'idle' });
    await addMessage(threadId, 'system', '🚫 Build cancelled.');
  }, [addMessage, dispatch]);

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
    approveBuildPlan,
    cancelBuildPlan,
  };
}
