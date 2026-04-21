import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { type LucideIcon, Send, ChevronDown, X, Loader2, Bot, User, AlertCircle, Radio, RefreshCw, ArrowLeft, MessageSquare, Zap, Check, XCircle, Hammer, PanelLeftOpen, PanelLeftClose, GitBranch, Mic, LayoutGrid, FilePlus2, FilePenLine, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useMaestro } from '../../context/MaestroContext';
import { useThreads } from '../../hooks/useThreads';
import { useOrchestration } from '../../hooks/useOrchestration';
import { useWorkspace } from '../../hooks/useWorkspace';
import { CONCIERGE_MODELS, type ThreadMessage, type ClawView, type Thread, type ChatBuildPhase } from '../../types';
import FolioCarousel from './FolioCarousel';

type ComposerIntent = 'chat' | 'broadcast' | 'execute' | 'build';

interface IntentConfig {
  label: string;
  Icon: LucideIcon;
  actionIcon: LucideIcon;
  color: string;
  bg: string;
  border: string;
  buttonText: string;
}

const INTENT_CONFIG: Record<ComposerIntent, IntentConfig> = {
  chat: {
    label: 'Chat',
    Icon: MessageSquare,
    actionIcon: Send,
    color: 'text-white/80',
    bg: 'bg-gold/80',
    border: 'border-gold/30',
    buttonText: 'text-void',
  },
  broadcast: {
    label: 'Broadcast',
    Icon: Radio,
    actionIcon: Radio,
    color: 'text-white/70',
    bg: 'bg-white/10',
    border: 'border-white/15',
    buttonText: 'text-white/80',
  },
  execute: {
    label: 'Execute',
    Icon: Zap,
    actionIcon: Zap,
    color: 'text-signal-warn/90',
    bg: 'bg-signal-warn/15',
    border: 'border-signal-warn/25',
    buttonText: 'text-signal-warn/95',
  },
  build: {
    label: 'Build',
    Icon: Hammer,
    actionIcon: Hammer,
    color: 'text-signal-ok/90',
    bg: 'bg-signal-ok/15',
    border: 'border-signal-ok/25',
    buttonText: 'text-signal-ok/95',
  },
};

const THREAD_GROUPS = [
  { type: 'concierge', Icon: Mic, label: 'Concierge' },
  { type: 'broadcast', Icon: Radio, label: 'Broadcasts' },
  { type: 'direct', Icon: MessageSquare, label: 'Direct' },
  { type: 'execution', Icon: Zap, label: 'Execution' },
] as const;

const iconButtonClass = 'p-1.5 rounded-lg hover:bg-white/5 text-white/55 hover:text-white/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50';
const focusRingClass = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50';
const headerButtonClass = 'flex items-center gap-1.5 rounded-lg p-1.5 sm:px-2.5 sm:py-1.5 hover:bg-white/5 text-white/55 hover:text-white/80 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50';
const menuKeys = Object.keys(INTENT_CONFIG) as ComposerIntent[];

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
}

function getBuildFileIcon(action: 'create' | 'update' | 'delete'): LucideIcon {
  if (action === 'create') return FilePlus2;
  if (action === 'update') return FilePenLine;
  return Trash2;
}

function getBuildPhaseLabel(phase: ChatBuildPhase): string {
  switch (phase) {
    case 'planning':
      return 'Build Planning';
    case 'reviewing':
      return 'Build Review';
    case 'building':
      return 'Building Files';
    case 'committing':
      return 'Committing Build';
    case 'done':
      return 'Build Complete';
    case 'failed':
      return 'Build Failed';
    default:
      return 'Build';
  }
}

export default function ClawMode() {
  const { state, dispatch } = useMaestro();
  const { ensureConciergeThread, sendToConcierge, sendToAgent, createThread, loadThreads, loadThreadMessages, addMessage, executeFromChat, approveExecutionJob, pollJobStatus, buildFromChat, approveBuildPlan, cancelBuildPlan } = useThreads();
  const { broadcast, synthesize } = useOrchestration();
  const { createSession } = useWorkspace();
  const [input, setInput] = useState('');
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches,
  );
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window === 'undefined' || !window.matchMedia('(max-width: 767px)').matches,
  );
  const [composerIntent, setComposerIntent] = useState<ComposerIntent>('chat');
  const [intentMenuOpen, setIntentMenuOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const initRef = useRef(false);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const modelOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const intentButtonRef = useRef<HTMLButtonElement>(null);
  const intentRef = useRef<HTMLDivElement>(null);
  const intentOptionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const executionApprovalRef = useRef<HTMLDivElement>(null);
  const buildApprovalRef = useRef<HTMLDivElement>(null);

  const clawView = state.clawView as ClawView;
  const focusedAgent = useMemo(
    () => state.focusedAgentId ? state.agents.find(a => a.id === state.focusedAgentId) ?? null : null,
    [state.focusedAgentId, state.agents],
  );

  // Messages for the active thread (concierge or direct)
  const messages = useMemo(() => {
    if (!state.activeThread) return [];
    return state.threadMessages
      .filter(m => m.thread_id === state.activeThread!.id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  }, [state.activeThread, state.threadMessages]);

  // Current concierge model label
  const currentModelLabel = useMemo(() => {
    const found = CONCIERGE_MODELS.find(m => m.id === state.conciergeModel);
    return found?.label ?? state.conciergeModel;
  }, [state.conciergeModel]);

  // Council agents (exclude executors) for broadcast
  const councilAgents = useMemo(
    () => state.agents.filter(a => a.is_active && a.agent_role !== 'executor' && a.provider_group !== 'maestroclaw'),
    [state.agents],
  );

  // Latest round info for carousel view
  const latestRound = useMemo(
    () => (state.rounds.length > 0 ? state.rounds[state.rounds.length - 1] : null),
    [state.rounds],
  );
  const latestResponses = useMemo(
    () => (latestRound ? state.responses.filter(r => r.round_id === latestRound.id) : []),
    [latestRound, state.responses],
  );
  const hasRepo = useMemo(
    () => state.repoConnections?.some((connection: { is_active: boolean }) => connection.is_active) ?? false,
    [state.repoConnections],
  );

  // Close model picker on click outside
  useEffect(() => {
    if (!modelPickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setModelPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [modelPickerOpen]);

  useEffect(() => {
    if (!modelPickerOpen) return;
    const selectedIndex = Math.max(
      CONCIERGE_MODELS.findIndex((model) => model.id === state.conciergeModel),
      0,
    );
    requestAnimationFrame(() => {
      modelOptionRefs.current[selectedIndex]?.focus();
    });
  }, [modelPickerOpen, state.conciergeModel]);

  // Close intent menu on click outside
  useEffect(() => {
    if (!intentMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (intentRef.current && !intentRef.current.contains(e.target as Node)) {
        setIntentMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [intentMenuOpen]);

  useEffect(() => {
    if (!intentMenuOpen) return;
    const selectedIndex = menuKeys.findIndex((intent) => intent === composerIntent && (intent !== 'build' || hasRepo));
    const fallbackIndex = menuKeys.findIndex((intent) => intent !== 'build' || hasRepo);
    requestAnimationFrame(() => {
      intentOptionRefs.current[Math.max(selectedIndex, fallbackIndex, 0)]?.focus();
    });
  }, [intentMenuOpen, composerIntent, hasRepo]);

  // Below md, the thread sidebar behaves as an overlay instead of consuming the layout.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(max-width: 767px)');
    const applyLayoutMode = (mobile: boolean) => {
      setIsMobile(mobile);
      setSidebarOpen(!mobile);
    };

    applyLayoutMode(mediaQuery.matches);
    const handleChange = (event: MediaQueryListEvent) => applyLayoutMode(event.matches);
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  // Group threads by type for sidebar
  const threadGroups = useMemo(() => {
    const groups: Record<string, Thread[]> = {
      concierge: [],
      broadcast: [],
      direct: [],
      execution: [],
    };
    for (const t of state.threads) {
      if (t.status !== 'active') continue;
      const bucket = groups[t.type];
      if (bucket) bucket.push(t);
    }
    return groups;
  }, [state.threads]);

  // Active repo connection for context header
  const activeRepo = useMemo(
    () => state.repoConnections?.find((r: { is_active: boolean }) => r.is_active),
    [state.repoConnections],
  );
  const activeRepoName = useMemo(
    () => (activeRepo as { repo_full_name?: string } | undefined)?.repo_full_name?.split('/')[1] || null,
    [activeRepo],
  );
  const isExecutionThread = state.activeThread?.type === 'execution';
  const isExecutionPending = !!state.pendingExecution && state.pendingExecution.threadId === state.activeThread?.id;
  const isBuildFlowActive = state.chatBuildPhase !== 'idle';

  // Determine thread type label for context header
  const threadTypeLabel = useMemo(() => {
    if (!state.activeThread) return 'No Thread';
    switch (state.activeThread.type) {
      case 'concierge': return 'Concierge';
      case 'broadcast': return 'Broadcast';
      case 'direct': return 'Direct Chat';
      case 'execution': return 'Execution';
      default: return 'Thread';
    }
  }, [state.activeThread]);

  const surfaceState = useMemo(() => {
    if (isExecutionPending) {
      return {
        kind: 'execute' as const,
        Icon: Zap,
        badgeLabel: 'Execution Review',
        bannerTitle: 'Execution waiting for approval',
        description: 'Review the parsed command below before it is handed to MaestroClaw for local execution.',
        status: 'Awaiting approval',
      };
    }

    if (isExecutionThread) {
      return {
        kind: 'execute' as const,
        Icon: Zap,
        badgeLabel: 'Execution Thread',
        bannerTitle: 'Execution thread active',
        description: 'Command parsing, approvals, and run updates stay here so Concierge chat does not get buried in shell output.',
        status: 'Shell + GitHub actions',
      };
    }

    if (isBuildFlowActive) {
      const buildPhaseLabel = getBuildPhaseLabel(state.chatBuildPhase);
      const buildDescriptions: Record<ChatBuildPhase, string> = {
        idle: 'Build workflow is idle.',
        planning: 'Claw is turning your request into a repo-scoped build plan before any files are written.',
        reviewing: 'Review the proposed files and commit message before approving any repo changes.',
        building: 'Approved files are being generated now from the build plan.',
        committing: 'Generated files are being written to GitHub and assembled into a PR-ready change set.',
        done: 'Build finished. Review the summary in-thread and inspect the resulting PR or written files.',
        failed: 'Build hit an error. Review the latest system message in this thread and retry from chat when ready.',
      };

      return {
        kind: 'build' as const,
        Icon: Hammer,
        badgeLabel: buildPhaseLabel,
        bannerTitle: buildPhaseLabel,
        description: buildDescriptions[state.chatBuildPhase],
        status: activeRepoName || 'Active repo required',
      };
    }

    if (composerIntent === 'execute') {
      return {
        kind: 'execute' as const,
        Icon: Zap,
        badgeLabel: 'Execute Mode',
        bannerTitle: 'Execution mode armed',
        description: 'Commands run through MaestroClaw. Read-only tasks can auto-run; anything risky stops for approval first.',
        status: 'Local executor',
      };
    }

    if (composerIntent === 'build') {
      return {
        kind: 'build' as const,
        Icon: Hammer,
        badgeLabel: 'Build Mode',
        bannerTitle: 'Build mode armed',
        description: 'Build first creates a plan, then asks for approval before writing files to the connected GitHub repo.',
        status: activeRepoName || 'Repo connected',
      };
    }

    return {
      kind: 'default' as const,
      Icon: clawView === 'carousel' ? Radio : clawView === 'focus' ? MessageSquare : state.activeThread?.type === 'broadcast' ? Radio : state.activeThread?.type === 'direct' ? MessageSquare : Mic,
      badgeLabel: threadTypeLabel,
      bannerTitle: threadTypeLabel,
      description: '',
      status: null,
    };
  }, [
    activeRepoName,
    clawView,
    composerIntent,
    isBuildFlowActive,
    isExecutionPending,
    isExecutionThread,
    state.activeThread?.type,
    state.chatBuildPhase,
    threadTypeLabel,
  ]);

  const modeTheme = surfaceState.kind === 'execute'
    ? {
        badge: 'border-signal-warn/25 bg-signal-warn/10 text-signal-warn/95',
        banner: 'border-signal-warn/15 bg-signal-warn/10',
        bannerIcon: 'bg-signal-warn/15 text-signal-warn/95',
        bannerTitle: 'text-signal-warn/95',
        status: 'border-signal-warn/25 bg-signal-warn/10 text-signal-warn/95',
        input: 'bg-signal-warn/5 border-signal-warn/20 focus:border-signal-warn/35 focus:ring-signal-warn/40',
        helper: 'text-signal-warn/90',
        busyIcon: 'bg-signal-warn/15 text-signal-warn/95',
      }
    : surfaceState.kind === 'build'
      ? {
          badge: 'border-signal-ok/25 bg-signal-ok/10 text-signal-ok/95',
          banner: 'border-signal-ok/15 bg-signal-ok/10',
          bannerIcon: 'bg-signal-ok/15 text-signal-ok/95',
          bannerTitle: 'text-signal-ok/95',
          status: 'border-signal-ok/25 bg-signal-ok/10 text-signal-ok/95',
          input: 'bg-signal-ok/5 border-signal-ok/20 focus:border-signal-ok/35 focus:ring-signal-ok/40',
          helper: 'text-signal-ok/90',
          busyIcon: 'bg-signal-ok/15 text-signal-ok/95',
        }
      : {
          badge: 'border-gold/20 bg-gold/10 text-gold/95',
          banner: 'border-white/[0.06] bg-white/[0.02]',
          bannerIcon: 'bg-gold/10 text-gold/80',
          bannerTitle: 'text-white/80',
          status: 'border-white/10 bg-white/[0.04] text-white/75',
          input: 'bg-white/[0.04] border-white/[0.08] focus:border-gold/30 focus:ring-gold/50',
          helper: 'text-white/60',
          busyIcon: 'bg-gold/10 text-gold/60',
        };
  const shouldPulseHeader = state.isBroadcasting || state.isConciergeSending || isExecutionPending || state.chatBuildPhase === 'building' || state.chatBuildPhase === 'committing';

  // Initialize: load persisted threads + ensure concierge thread
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const init = async () => {
      let sessionId = state.activeSession?.id;
      if (!sessionId && state.workspace) {
        const session = await createSession(state.workspace.id, 'ask');
        if (!session) return;
        sessionId = session.id;
      }
      if (!sessionId) return;

      // Load all persisted threads for the sidebar
      await loadThreads(sessionId);

      const thread = await ensureConciergeThread(sessionId);
      if (thread) {
        dispatch({ type: 'SET_ACTIVE_THREAD', payload: thread });
        await loadThreadMessages(thread.id);
      }
    };
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Focus input on mount and view change
  useEffect(() => {
    inputRef.current?.focus();
  }, [clawView]);

  useEffect(() => {
    if (!state.pendingExecution || state.pendingExecution.threadId !== state.activeThread?.id) return;
    requestAnimationFrame(() => {
      executionApprovalRef.current?.focus();
    });
  }, [state.pendingExecution, state.activeThread?.id]);

  useEffect(() => {
    if (state.chatBuildPhase !== 'reviewing' || !state.chatBuildPlan) return;
    requestAnimationFrame(() => {
      buildApprovalRef.current?.focus();
    });
  }, [state.chatBuildPhase, state.chatBuildPlan]);

  // Auto-switch to carousel when broadcast finishes
  const wasBroadcasting = useRef(false);
  useEffect(() => {
    if (state.isBroadcasting) {
      wasBroadcasting.current = true;
      return;
    }

    if (wasBroadcasting.current && latestResponses.length > 0) {
      wasBroadcasting.current = false;
      if (clawView === 'concierge') {
        dispatch({ type: 'SET_CLAW_VIEW', payload: 'carousel' });
      }
    }
  }, [state.isBroadcasting, latestResponses.length, clawView, dispatch]);

  // ─── Handlers ───────────────────────────────────────────────

  const handleDialogKeyDownCapture = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      if (intentMenuOpen) {
        e.preventDefault();
        e.stopPropagation();
        setIntentMenuOpen(false);
        intentButtonRef.current?.focus();
        return;
      }
      if (modelPickerOpen) {
        e.preventDefault();
        e.stopPropagation();
        setModelPickerOpen(false);
        modelButtonRef.current?.focus();
        return;
      }
      if (isMobile && sidebarOpen) {
        e.preventDefault();
        e.stopPropagation();
        setSidebarOpen(false);
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      dispatch({ type: 'SET_CLAW_MODE_ACTIVE', payload: false });
      return;
    }

    if (e.key !== 'Tab' || !dialogRef.current) return;
    const focusable = getFocusableElements(dialogRef.current);
    if (focusable.length === 0) return;

    const activeElement = document.activeElement as HTMLElement | null;
    const currentIndex = activeElement ? focusable.indexOf(activeElement) : -1;
    const nextIndex = e.shiftKey
      ? (currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1)
      : (currentIndex === -1 || currentIndex === focusable.length - 1 ? 0 : currentIndex + 1);

    e.preventDefault();
    focusable[nextIndex]?.focus();
  }, [dispatch, intentMenuOpen, isMobile, modelPickerOpen, sidebarOpen]);

  const handleModelPickerButtonKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowDown', 'Enter', ' '].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    setModelPickerOpen(true);
  }, []);

  const handleModelOptionKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      modelOptionRefs.current[(index + 1) % CONCIERGE_MODELS.length]?.focus();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      modelOptionRefs.current[(index - 1 + CONCIERGE_MODELS.length) % CONCIERGE_MODELS.length]?.focus();
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      e.stopPropagation();
      modelOptionRefs.current[0]?.focus();
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      modelOptionRefs.current[CONCIERGE_MODELS.length - 1]?.focus();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setModelPickerOpen(false);
      modelButtonRef.current?.focus();
    }
  }, []);

  const handleIntentButtonKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowDown', 'Enter', ' '].includes(e.key)) return;
    e.preventDefault();
    e.stopPropagation();
    setIntentMenuOpen(true);
  }, []);

  const handleIntentOptionKeyDown = useCallback((e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const enabledIndices = menuKeys
      .map((intent, menuIndex) => ({ intent, menuIndex }))
      .filter(({ intent }) => intent !== 'build' || hasRepo)
      .map(({ menuIndex }) => menuIndex);
    const enabledPosition = Math.max(enabledIndices.indexOf(index), 0);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      intentOptionRefs.current[enabledIndices[(enabledPosition + 1) % enabledIndices.length]]?.focus();
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      intentOptionRefs.current[enabledIndices[(enabledPosition - 1 + enabledIndices.length) % enabledIndices.length]]?.focus();
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      e.stopPropagation();
      intentOptionRefs.current[enabledIndices[0]]?.focus();
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      e.stopPropagation();
      intentOptionRefs.current[enabledIndices[enabledIndices.length - 1]]?.focus();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIntentMenuOpen(false);
      intentButtonRef.current?.focus();
    }
  }, [hasRepo]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || state.isConciergeSending) return;
    setInput('');

    if (clawView === 'focus' && focusedAgent && state.activeThread?.type === 'direct') {
      // Direct chat with focused agent
      await sendToAgent(state.activeThread.id, focusedAgent.id, text);
    } else if (state.activeThread) {
      // Send to concierge
      await sendToConcierge(state.activeThread.id, text);
    }
  }, [input, state.isConciergeSending, state.activeThread, clawView, focusedAgent, sendToConcierge, sendToAgent]);

  const handleBroadcast = useCallback(async () => {
    const text = input.trim();
    if (!text || state.isBroadcasting || councilAgents.length === 0) return;
    setInput('');

    // Ensure session exists — pass created session directly (not stale state)
    let sessionForBroadcast = state.activeSession;
    if (!sessionForBroadcast && state.workspace) {
      const created = await createSession(state.workspace.id, 'ask');
      if (!created) return;
      sessionForBroadcast = created;
    }
    if (!sessionForBroadcast) return;

    // Log the broadcast intent in the concierge thread
    if (state.activeThread?.type === 'concierge') {
      await addMessage(state.activeThread.id, 'user', `Broadcasting: ${text}`);
    }

    // Create a broadcast thread and write the prompt as its first message
    const broadcastThread = await createThread(sessionForBroadcast.id, 'broadcast', { title: text.slice(0, 60) });
    if (broadcastThread) {
      await addMessage(broadcastThread.id, 'user', text);
    }

    // Dispatch to existing broadcast infrastructure
    const agentIds = councilAgents.map(a => a.id);
    await broadcast(text, agentIds, sessionForBroadcast, { skipTriage: true });
  }, [input, state.isBroadcasting, state.activeSession, state.workspace, state.activeThread, councilAgents, broadcast, createSession, createThread, addMessage]);

  const handleSynthesize = useCallback(async () => {
    if (state.isSynthesizing || !latestRound) return;

    const result = await synthesize(latestRound.id);

    // Get synthesis from the returned result, not from stale closure state
    const conciergeThread = state.threads.find(t => t.type === 'concierge' && t.status === 'active');
    if (conciergeThread && result?.content) {
      await addMessage(conciergeThread.id, 'concierge', `**Synthesis**\n\n${result.content}`);
      dispatch({ type: 'SET_ACTIVE_THREAD', payload: conciergeThread });
    }

    dispatch({ type: 'SET_CLAW_VIEW', payload: 'concierge' });
    dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: null });
  }, [state.isSynthesizing, latestRound, state.threads, synthesize, addMessage, dispatch]);

  const handleFocusAgent = useCallback(async (agentId: string) => {
    if (!state.activeSession) return;

    dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: agentId });

    // Find or create a direct thread for this agent
    let directThread: Thread | null | undefined = state.threads.find(
      t => t.type === 'direct' && t.agent_id === agentId && t.status === 'active'
    );

    const isNewThread = !directThread;

    if (!directThread) {
      const agent = state.agents.find(a => a.id === agentId);
      directThread = await createThread(state.activeSession.id, 'direct', {
        agentId,
        title: agent?.display_name || agent?.name || 'Agent',
      });
    }

    if (directThread) {
      dispatch({ type: 'SET_ACTIVE_THREAD', payload: directThread });

      if (isNewThread) {
        // Seed the new thread with the agent's broadcast response so context is preserved
        const agentResponse = latestResponses.find(r => r.agent_id === agentId);
        if (agentResponse?.content) {
          await addMessage(directThread.id, 'concierge', agentResponse.content);
        }
      }

      await loadThreadMessages(directThread.id);
    }

    dispatch({ type: 'SET_CLAW_VIEW', payload: 'focus' });
  }, [state.activeSession, state.threads, state.agents, latestResponses, createThread, loadThreadMessages, addMessage, dispatch]);

  const handleBackToCarousel = useCallback(() => {
    dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: null });
    // Restore concierge thread as active
    const conciergeThread = state.threads.find(t => t.type === 'concierge' && t.status === 'active');
    if (conciergeThread) {
      dispatch({ type: 'SET_ACTIVE_THREAD', payload: conciergeThread });
    }
    dispatch({ type: 'SET_CLAW_VIEW', payload: latestRound ? 'carousel' : 'concierge' });
  }, [state.threads, latestRound, dispatch]);

  const handleBackToConcierge = useCallback(() => {
    dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: null });
    const conciergeThread = state.threads.find(t => t.type === 'concierge' && t.status === 'active');
    if (conciergeThread) {
      dispatch({ type: 'SET_ACTIVE_THREAD', payload: conciergeThread });
    }
    dispatch({ type: 'SET_CLAW_VIEW', payload: 'concierge' });
  }, [state.threads, dispatch]);

  const handleClose = useCallback(() => {
    dispatch({ type: 'SET_CLAW_MODE_ACTIVE', payload: false });
  }, [dispatch]);

  const handleModelSelect = useCallback((modelId: string) => {
    dispatch({ type: 'SET_CONCIERGE_MODEL', payload: modelId });
    setModelPickerOpen(false);
  }, [dispatch]);

  const handleExecute = useCallback(async () => {
    const text = input.trim();
    if (!text || state.isConciergeSending) return;
    setInput('');

    // Ensure we have a concierge thread
    const threadId = state.activeThread?.id;
    if (!threadId) return;

    // Create an execution thread if we're in concierge view
    let execThreadId = threadId;
    if (state.activeThread?.type === 'concierge' && state.activeSession) {
      const execThread = await createThread(state.activeSession.id, 'execution', {
        title: `Execute: ${text.slice(0, 50)}`,
      });
      if (execThread) {
        execThreadId = execThread.id;
        dispatch({ type: 'SET_ACTIVE_THREAD', payload: execThread });
      }
    }

    await executeFromChat(execThreadId, text);
    await loadThreadMessages(execThreadId);
  }, [input, state.isConciergeSending, state.activeThread, state.activeSession, createThread, executeFromChat, loadThreadMessages, dispatch]);

  const handleApproveExecution = useCallback(async () => {
    const pending = state.pendingExecution;
    if (!pending) return;

    await approveExecutionJob(pending.jobId, pending.threadId);
    dispatch({ type: 'SET_PENDING_EXECUTION', payload: null });

    // Start polling for result
    let attempts = 0;
    const maxAttempts = 30;
    const pollInterval = 2000;
    while (attempts < maxAttempts) {
      await new Promise(r => setTimeout(r, pollInterval));
      attempts++;
      const updated = await pollJobStatus(pending.jobId, pending.threadId);
      if (updated && (updated.status === 'succeeded' || updated.status === 'failed')) break;
    }
    await loadThreadMessages(pending.threadId);
  }, [state.pendingExecution, approveExecutionJob, pollJobStatus, loadThreadMessages, dispatch]);

  const handleRejectExecution = useCallback(async () => {
    const pending = state.pendingExecution;
    if (!pending) return;
    await addMessage(pending.threadId, 'system', 'Execution rejected by user.');
    dispatch({ type: 'SET_PENDING_EXECUTION', payload: null });
    await loadThreadMessages(pending.threadId);
  }, [state.pendingExecution, addMessage, loadThreadMessages, dispatch]);

  const handleBuild = useCallback(async () => {
    const text = input.trim();
    if (!text || state.isConciergeSending) return;
    setInput('');

    const threadId = state.activeThread?.id;
    if (!threadId) return;

    await buildFromChat(threadId, text);
    await loadThreadMessages(threadId);
  }, [input, state.isConciergeSending, state.activeThread, buildFromChat, loadThreadMessages]);

  const handleApproveBuild = useCallback(async () => {
    const threadId = state.activeThread?.id;
    if (!threadId) return;
    await approveBuildPlan(threadId);
    await loadThreadMessages(threadId);
  }, [state.activeThread, approveBuildPlan, loadThreadMessages]);

  const handleCancelBuild = useCallback(async () => {
    const threadId = state.activeThread?.id;
    if (!threadId) return;
    await cancelBuildPlan(threadId);
    await loadThreadMessages(threadId);
  }, [state.activeThread, cancelBuildPlan, loadThreadMessages]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (composerIntent === 'chat') handleSend();
      else if (composerIntent === 'broadcast') handleBroadcast();
      else if (composerIntent === 'execute') handleExecute();
      else if (composerIntent === 'build') handleBuild();
    }
  }, [composerIntent, handleSend, handleBroadcast, handleExecute, handleBuild]);

  // Handle thread click in sidebar
  const handleThreadClick = useCallback(async (thread: Thread) => {
    dispatch({ type: 'SET_ACTIVE_THREAD', payload: thread });
    await loadThreadMessages(thread.id);
    if (isMobile) {
      setSidebarOpen(false);
    }
    if (thread.type === 'concierge') {
      dispatch({ type: 'SET_CLAW_VIEW', payload: 'concierge' });
      dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: null });
    } else if (thread.type === 'direct' && thread.agent_id) {
      dispatch({ type: 'SET_FOCUSED_AGENT_ID', payload: thread.agent_id });
      dispatch({ type: 'SET_CLAW_VIEW', payload: 'focus' });
    } else {
      dispatch({ type: 'SET_CLAW_VIEW', payload: 'concierge' });
    }
  }, [dispatch, isMobile, loadThreadMessages]);

  // ─── Placeholder text based on view + intent ──────────────
  const placeholder = clawView === 'focus' && focusedAgent
    ? `Chat with ${focusedAgent.display_name || focusedAgent.name}...`
    : composerIntent === 'broadcast' ? 'Broadcast to the orchestra...'
    : composerIntent === 'execute' ? 'Describe a command to execute...'
    : composerIntent === 'build' ? 'Describe what to build...'
    : 'Talk to Concierge...';

  const intentCfg = INTENT_CONFIG[composerIntent];
  const IntentIcon = intentCfg.Icon;
  const SubmitIcon = intentCfg.actionIcon;
  const SurfaceIcon = surfaceState.Icon;
  const backLabel = clawView === 'focus' ? 'Back to Orchestra' : 'Back to Concierge';
  const showModeBanner = clawView === 'concierge' && surfaceState.kind !== 'default';
  const emptyStateIconClass = surfaceState.kind === 'execute'
    ? 'bg-signal-warn/10 text-signal-warn/85'
    : surfaceState.kind === 'build'
      ? 'bg-signal-ok/10 text-signal-ok/85'
      : 'bg-gold/10 text-gold/60';
  const emptyStateTitle = isExecutionThread
    ? 'Execution thread ready'
    : surfaceState.kind === 'build'
      ? surfaceState.bannerTitle
      : 'Concierge is ready';
  const emptyStateDescription = isExecutionThread
    ? 'Describe a command or repo task. Claw will parse it, request approval when needed, and keep run updates here.'
    : surfaceState.kind === 'build'
      ? 'Describe the feature or refactor you want. Claw will plan the repo changes before asking to write anything.'
      : 'Chat, broadcast to the orchestra, execute commands, or build to a repo.';

  // ─── Render ───────────────────────────────────────────────
  return (
    <div
      ref={dialogRef}
      onKeyDownCapture={handleDialogKeyDownCapture}
      className="relative flex flex-col h-full w-full"
      style={{ isolation: 'isolate' }}
      role="dialog"
      aria-modal="true"
      aria-label="Claw Mode workspace"
    >

      {/* ─── Context Header ────────────────────────────────── */}
      <div className="relative z-20 flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/[0.06]">
        <div className="flex min-w-0 items-center gap-3">
          {/* Sidebar toggle */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={iconButtonClass}
            aria-label={sidebarOpen ? 'Collapse thread sidebar' : 'Expand thread sidebar'}
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {sidebarOpen ? <PanelLeftClose size={15} /> : <PanelLeftOpen size={15} />}
          </button>

          {/* Back button when in carousel/focus */}
          {clawView !== 'concierge' && (
            <button
              onClick={clawView === 'focus' ? handleBackToCarousel : handleBackToConcierge}
              className={headerButtonClass}
              aria-label={backLabel}
              title={backLabel}
            >
              <ArrowLeft size={14} />
              <span className="hidden sm:inline text-xs">{backLabel}</span>
            </button>
          )}

          {/* Thread / mode badge */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${modeTheme.badge}`}>
            <SurfaceIcon size={11} className={shouldPulseHeader ? 'animate-pulse' : undefined} />
            <span className="text-[11px] font-medium tracking-wide uppercase">
              {surfaceState.badgeLabel}
            </span>
          </div>

          {/* Context pills */}
          <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap" style={{ scrollbarWidth: 'none' }}>
            {clawView === 'focus' && focusedAgent && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] text-[11px] text-white/70">
                <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: focusedAgent.color }} />
                {focusedAgent.display_name || focusedAgent.name}
              </span>
            )}
            {clawView === 'carousel' && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] text-[11px] text-white/70">
                <Radio size={10} />
                {latestResponses.length} responses
              </span>
            )}
            {state.chatBuildPhase !== 'idle' && surfaceState.kind !== 'build' && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-signal-ok/15 text-[11px] text-signal-ok/90">
                <Hammer size={10} />
                {state.chatBuildPhase}
              </span>
            )}
            {hasRepo && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.04] text-[11px] text-white/65">
                <GitBranch size={10} />
                {(activeRepo as { repo_full_name?: string })?.repo_full_name?.split('/')[1] || 'repo'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Model picker */}
          <div ref={pickerRef} style={{ position: 'relative' }}>
            <button
              ref={modelButtonRef}
              onClick={() => setModelPickerOpen(!modelPickerOpen)}
              onKeyDown={handleModelPickerButtonKeyDown}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] 
                         text-[11px] text-white/65 hover:text-white/80 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
              aria-expanded={modelPickerOpen}
              aria-haspopup="listbox"
              aria-label="Select concierge model"
            >
              <Bot size={11} />
              {currentModelLabel}
              <ChevronDown size={11} className={`transition-transform ${modelPickerOpen ? 'rotate-180' : ''}`} />
            </button>

            {modelPickerOpen && (
              <div
                style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, width: 'min(224px, calc(100vw - 32px))', maxWidth: '90vw', zIndex: 9999 }}
                className="rounded-lg bg-void-2 border border-white/10 shadow-xl overflow-hidden"
                role="listbox"
                aria-label="Concierge model"
              >
                {CONCIERGE_MODELS.map((m, index) => (
                  <button
                    key={m.id}
                    ref={(element) => { modelOptionRefs.current[index] = element; }}
                    onClick={() => handleModelSelect(m.id)}
                    onKeyDown={(e) => handleModelOptionKeyDown(e, index)}
                    role="option"
                    aria-selected={m.id === state.conciergeModel}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold/50
                      ${m.id === state.conciergeModel
                        ? 'bg-gold/10 text-gold'
                        : 'text-white/60 hover:bg-white/5 hover:text-white/80'
                      }`}
                  >
                    <div className="font-medium">{m.label}</div>
                    <div className="text-xs opacity-50 mt-0.5">{m.provider}</div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Focus view: agent info badge */}
          {clawView === 'focus' && focusedAgent && (
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/[0.04] text-[11px] text-white/70">
              <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: focusedAgent.color }} />
              {focusedAgent.model}
            </div>
          )}

          <button
            onClick={handleClose}
            className={iconButtonClass}
            aria-label="Exit Claw Mode"
            title="Exit to legacy workspace"
          >
            <X size={15} />
          </button>
        </div>
      </div>

      {showModeBanner && (
        <div className={`relative z-10 border-b px-4 py-3 ${modeTheme.banner}`}>
          <div className="mx-auto max-w-4xl flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${modeTheme.bannerIcon}`}>
                <SurfaceIcon size={16} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-[11px] font-medium uppercase tracking-[0.22em] ${modeTheme.bannerTitle}`}>
                    {surfaceState.bannerTitle}
                  </span>
                  {surfaceState.status && (
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide ${modeTheme.status}`}>
                      {surfaceState.status}
                    </span>
                  )}
                </div>
                <p className="text-sm text-white/75 max-w-2xl">
                  {surfaceState.description}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Body: Sidebar + Content ───────────────────────── */}
      <div className="relative flex-1 flex overflow-hidden">

        {isMobile && sidebarOpen && (
          <button
            type="button"
            aria-label="Close thread sidebar"
            className="absolute inset-0 z-20 bg-black/45 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Thread Sidebar */}
        {sidebarOpen && (
          <div
            className={`${isMobile ? 'absolute inset-y-0 left-0 z-30 w-56 max-w-[80vw] shadow-2xl' : 'w-56 flex-shrink-0'} border-r border-white/[0.06] overflow-y-auto py-2 claw-sidebar`}
            style={{ background: 'rgba(0,0,0,0.15)' }}
            aria-label="Thread sidebar"
          >
            {/* Thread groups */}
            {THREAD_GROUPS.map(group => {
              const GroupIcon = group.Icon;
              const threads = threadGroups[group.type] || [];
              if (threads.length === 0 && group.type !== 'concierge') return null;
              return (
                <div key={group.type} className="mb-1">
                  <div className="px-3 py-1.5 text-[10px] text-white/55 uppercase tracking-widest font-medium flex items-center gap-1.5">
                    <GroupIcon size={11} />
                    {group.label}
                  </div>
                  {threads.length === 0 && (
                    <div className="px-3 py-1 text-[11px] text-white/50 italic">No threads yet</div>
                  )}
                  {threads.map(thread => {
                    const isActive = state.activeThread?.id === thread.id;
                    const agent = thread.agent_id ? state.agents.find(a => a.id === thread.agent_id) : null;
                    const threadLabel = thread.title || agent?.display_name || agent?.name || group.label;
                    const ThreadIcon = thread.type === 'execution'
                      ? Zap
                      : thread.type === 'broadcast'
                        ? Radio
                        : thread.type === 'direct'
                          ? MessageSquare
                          : Mic;
                    const activeClasses = thread.type === 'execution'
                      ? 'bg-signal-warn/10 text-signal-warn/95 border-l-2 border-signal-warn/50'
                      : 'bg-gold/10 text-gold/90 border-l-2 border-gold/40';
                    const inactiveClasses = thread.type === 'execution'
                      ? 'text-white/70 hover:bg-signal-warn/10 hover:text-signal-warn/90 border-l-2 border-transparent'
                      : 'text-white/70 hover:bg-white/[0.04] hover:text-white/85 border-l-2 border-transparent';
                    return (
                      <button
                        key={thread.id}
                        onClick={() => handleThreadClick(thread)}
                        className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors rounded-md mx-1 
                          ${isActive
                            ? activeClasses
                            : inactiveClasses
                          } ${focusRingClass}`}
                        style={{ width: 'calc(100% - 8px)' }}
                        aria-current={isActive ? 'true' : undefined}
                      >
                        <div className="truncate flex items-center gap-1.5">
                          {thread.type === 'direct' && agent ? (
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: agent.color }} />
                          ) : (
                            <ThreadIcon
                              size={12}
                              className={thread.type === 'execution' ? 'text-signal-warn/90 flex-shrink-0' : 'text-white/45 flex-shrink-0'}
                            />
                          )}
                          {threadLabel}
                          {thread.type === 'execution' && (
                            <span className="ml-auto text-[9px] uppercase tracking-[0.18em] text-signal-warn/80">
                              Run
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              );
            })}

            {/* Carousel shortcut */}
            {latestResponses.length > 0 && (
              <div className="mt-2 border-t border-white/[0.04] pt-2">
                <button
                  onClick={() => { dispatch({ type: 'SET_CLAW_VIEW', payload: 'carousel' }); }}
                  className={`w-full text-left px-3 py-1.5 text-[12px] transition-colors rounded-md mx-1 
                    ${clawView === 'carousel'
                      ? 'bg-white/[0.06] text-white/70'
                      : 'text-white/65 hover:bg-white/[0.04] hover:text-white/80'
                    } ${focusRingClass}`}
                  style={{ width: 'calc(100% - 8px)' }}
                >
                  <span className="flex items-center gap-1.5">
                    <LayoutGrid size={12} />
                    Carousel ({latestResponses.length})
                  </span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden flex flex-col">

          {/* Concierge View — Chat */}
          {clawView === 'concierge' && (
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 claw-view-enter">
              {messages.length === 0 && !state.isConciergeSending && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${emptyStateIconClass}`}>
                    <SurfaceIcon size={28} />
                  </div>
                  <h3 className={`text-lg font-medium mb-2 ${surfaceState.kind === 'default' ? 'text-white/70' : modeTheme.bannerTitle}`}>
                    {emptyStateTitle}
                  </h3>
                  <p className="text-sm text-white/60 max-w-md">
                    {emptyStateDescription}
                  </p>
                </div>
              )}

              {messages.map(msg => (
                <MessageBubble key={msg.id} message={msg} modelLabel={currentModelLabel} />
              ))}

              {state.isConciergeSending && (
                <div className="flex items-start gap-3">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${modeTheme.busyIcon}`}>
                    <SurfaceIcon size={14} />
                  </div>
                  <div className="flex items-center gap-2 py-3 text-white/60 text-sm">
                    <Loader2 size={14} className="animate-spin" />
                    {surfaceState.kind === 'execute'
                      ? 'Preparing execution...'
                      : surfaceState.kind === 'build'
                        ? 'Advancing build...'
                        : 'Thinking...'}
                  </div>
                </div>
              )}

              {/* Pending execution approval card */}
              {state.pendingExecution && state.pendingExecution.threadId === state.activeThread?.id && (
                <div
                  ref={executionApprovalRef}
                  tabIndex={-1}
                  role="alertdialog"
                  aria-modal="false"
                  aria-labelledby="claw-execution-approval-title"
                  aria-describedby="claw-execution-approval-body"
                  className="mx-auto max-w-md rounded-xl border border-signal-warn/30 bg-signal-warn/10 p-4 my-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
                >
                  <div id="claw-execution-approval-title" className="flex items-center gap-2 text-signal-warn text-sm font-medium mb-2">
                    <Zap size={14} />
                    Approval Required
                  </div>
                  <div id="claw-execution-approval-body" className="text-white/70 text-sm mb-1">
                    {state.pendingExecution.intent.description}
                  </div>
                  {state.pendingExecution.intent.command && (
                    <code className="block overflow-x-auto text-xs text-white/70 bg-black/30 rounded px-2 py-1 mb-3 font-mono">
                      {state.pendingExecution.intent.command}
                    </code>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleApproveExecution}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-signal-ok/80 hover:bg-signal-ok 
                                 text-white text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
                      aria-label="Approve execution"
                    >
                      <Check size={12} /> Approve
                    </button>
                    <button
                      onClick={handleRejectExecution}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-signal-risk/20 hover:bg-signal-risk/30 
                                 text-signal-risk text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
                      aria-label="Reject execution"
                    >
                      <XCircle size={12} /> Reject
                    </button>
                  </div>
                </div>
              )}

              {/* Pending build plan approval card */}
              {state.chatBuildPhase === 'reviewing' && state.chatBuildPlan && (
                <div
                  ref={buildApprovalRef}
                  tabIndex={-1}
                  role="alertdialog"
                  aria-modal="false"
                  aria-labelledby="claw-build-approval-title"
                  aria-describedby="claw-build-approval-body"
                  className="mx-auto max-w-md rounded-xl border border-signal-ok/30 bg-signal-ok/10 p-4 my-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
                >
                  <div id="claw-build-approval-title" className="flex items-center gap-2 text-signal-ok text-sm font-medium mb-2">
                    <Hammer size={14} />
                    Build Plan Ready
                  </div>
                  <div id="claw-build-approval-body" className="text-white/70 text-sm mb-2">
                    {state.chatBuildPlan.description}
                  </div>
                  <div className="space-y-1 mb-3">
                    {state.chatBuildPlan.files.map((f, i) => {
                      const FileActionIcon = getBuildFileIcon(f.action);
                      return (
                        <div key={i} className="text-xs text-white/70 font-mono flex items-center gap-1.5">
                          <FileActionIcon size={12} className="flex-shrink-0" />
                          <span className="truncate">
                            {f.path} — <span className="text-white/60">{f.description}</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <code className="block overflow-x-auto text-xs text-white/70 bg-black/30 rounded px-2 py-1 mb-3 font-mono">
                    {state.chatBuildPlan.commit_message}
                  </code>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleApproveBuild}
                      disabled={state.isConciergeSending}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-signal-ok/80 hover:bg-signal-ok 
                                 text-white text-xs transition-all disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
                    >
                      <Check size={12} /> Approve Build
                    </button>
                    <button
                      onClick={handleCancelBuild}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-signal-risk/20 hover:bg-signal-risk/30 
                                 text-signal-risk text-xs transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
                      aria-label="Cancel build plan"
                    >
                      <XCircle size={12} /> Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Build progress indicator */}
              {(state.chatBuildPhase === 'building' || state.chatBuildPhase === 'committing') && (
                <div className="mx-auto max-w-md rounded-xl border border-signal-ok/20 bg-signal-ok/10 p-3 my-3">
                  <div className="flex items-center gap-2 text-signal-ok/90 text-sm">
                    <Loader2 size={14} className="animate-spin" />
                    {state.chatBuildPhase === 'building' ? 'Building files...' : 'Committing to GitHub...'}
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Carousel View — Show FolioCarousel + agent click-to-focus */}
          {clawView === 'carousel' && (
            <div className="flex-1 overflow-hidden flex flex-col claw-view-enter">
              {state.isBroadcasting && (
                <div className="flex items-center gap-2 px-6 py-2 text-xs text-gold/60">
                  <Loader2 size={12} className="animate-spin" />
                  Broadcasting to {councilAgents.length} agents...
                </div>
              )}

              <div className="flex-1 overflow-hidden">
                <FolioCarousel />
              </div>

              {/* Agent quick-focus bar */}
              {latestResponses.length > 0 && (
                <div className="flex items-center gap-2 px-6 py-2 border-t border-white/[0.06] overflow-x-auto flex-shrink-0">
                  <MessageSquare size={12} className="text-white/60 flex-shrink-0" />
                  <span className="text-[10px] text-white/60 mr-1 flex-shrink-0">Direct chat:</span>
                  {latestResponses.map(r => (
                    <button
                      key={r.id}
                      onClick={() => r.agent_id && handleFocusAgent(r.agent_id)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] 
                                 text-[11px] text-white/70 hover:text-white/85 transition-all flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
                    >
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: r.agent_color }} />
                      {r.agent_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Focus View — Direct agent chat */}
          {clawView === 'focus' && (
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 claw-view-enter">
              {messages.length === 0 && !state.isConciergeSending && focusedAgent && (
                <div className="flex flex-col items-center justify-center h-full text-center">
                   <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                        style={{ backgroundColor: `${focusedAgent.color}15` }}>
                     <Bot size={28} style={{ color: `${focusedAgent.color}90` }} />
                   </div>
                   <h3 className="text-lg font-medium text-white/70 mb-2">
                     {focusedAgent.display_name || focusedAgent.name}
                   </h3>
                   <p className="text-sm text-white/60 max-w-md">
                     Direct conversation. This thread is preserved and included in synthesis.
                   </p>
                 </div>
              )}

              {messages.map(msg => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  modelLabel={focusedAgent?.display_name || focusedAgent?.name || 'Agent'}
                  agentColor={focusedAgent?.color}
                />
              ))}

              {state.isConciergeSending && focusedAgent && (
                <div className="flex items-start gap-3">
                   <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: `${focusedAgent.color}15` }}>
                     <Bot size={14} style={{ color: `${focusedAgent.color}90` }} />
                   </div>
                   <div className="flex items-center gap-2 py-3 text-white/60 text-sm">
                     <Loader2 size={14} className="animate-spin" />
                     Thinking...
                   </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* ─── Intent-First Composer ──────────────────────────── */}
      <div className="relative z-10 border-t border-white/[0.06] px-4 py-3">
        <div className="flex flex-wrap items-end gap-2 max-w-4xl mx-auto sm:flex-nowrap">
          {/* Intent selector */}
          <div ref={intentRef} style={{ position: 'relative' }} className="order-2 sm:order-none">
            <button
              ref={intentButtonRef}
              onClick={() => setIntentMenuOpen(!intentMenuOpen)}
              onKeyDown={handleIntentButtonKeyDown}
              className={`flex items-center gap-1.5 px-3 h-10 rounded-xl ${intentCfg.bg} border ${intentCfg.border}
                         ${intentCfg.color} transition-all text-xs font-medium flex-shrink-0 ${focusRingClass}`}
              aria-expanded={intentMenuOpen}
              aria-haspopup="menu"
              aria-label={`Composer intent: ${intentCfg.label}`}
            >
              <IntentIcon size={14} />
              <span className="hidden sm:inline">{intentCfg.label}</span>
              <ChevronDown size={11} className={`transition-transform ${intentMenuOpen ? 'rotate-180' : ''}`} />
            </button>

            {intentMenuOpen && (
              <div
                style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 4, width: 180, maxWidth: 'calc(100vw - 32px)', zIndex: 9999 }}
                className="rounded-lg bg-void-2 border border-white/10 shadow-xl overflow-hidden"
                role="menu"
                aria-label="Composer intents"
              >
                {menuKeys.map((intent, index) => {
                  const cfg = INTENT_CONFIG[intent];
                  const MenuIcon = cfg.Icon;
                  const disabled = intent === 'build' && !hasRepo;
                  return (
                    <button
                      key={intent}
                      ref={(element) => { intentOptionRefs.current[index] = element; }}
                      onClick={() => { if (!disabled) { setComposerIntent(intent); setIntentMenuOpen(false); } }}
                      onKeyDown={(e) => handleIntentOptionKeyDown(e, index)}
                      disabled={disabled}
                      role="menuitemradio"
                      aria-checked={composerIntent === intent}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2 ${focusRingClass}
                        ${composerIntent === intent ? 'bg-gold/10 text-gold' : 'text-white/60 hover:bg-white/5 hover:text-white/80'}
                        ${disabled ? 'opacity-30 cursor-not-allowed' : ''}`}
                    >
                      <MenuIcon size={14} />
                      <span>{cfg.label}</span>
                      {disabled && <span className="text-[10px] text-white/60 ml-auto">No repo</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Input */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={1}
            className={`order-1 basis-full sm:order-none sm:basis-auto sm:flex-1 resize-none rounded-xl border
                       px-4 py-3 text-sm text-white/90 placeholder:text-white/60
                       focus:outline-none focus:ring-2
                       transition-all min-h-[44px] max-h-[200px] ${modeTheme.input}`}
            style={{ height: 'auto', overflow: 'hidden' }}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 200) + 'px';
            }}
          />

          {/* Send button */}
          <button
            onClick={() => {
              if (composerIntent === 'chat') handleSend();
              else if (composerIntent === 'broadcast') handleBroadcast();
              else if (composerIntent === 'execute') handleExecute();
              else if (composerIntent === 'build') handleBuild();
            }}
            disabled={!input.trim() || state.isConciergeSending || state.isBroadcasting}
            className={`flex items-center justify-center w-10 h-10 rounded-xl ${intentCfg.bg}
                       ${intentCfg.buttonText} disabled:opacity-30 disabled:cursor-not-allowed
                       transition-all flex-shrink-0 hover:brightness-110 ${focusRingClass}`}
            aria-label={`${intentCfg.label} (Enter)`}
            title={`${intentCfg.label} (Enter)`}
          >
            <SubmitIcon size={15} />
          </button>

          {/* Synthesize — contextual, appears when responses exist */}
          {latestRound && latestResponses.length > 0 && (
            <button
              onClick={handleSynthesize}
              disabled={state.isSynthesizing}
              className="flex items-center gap-1.5 px-3 h-10 rounded-xl bg-white/[0.04] border border-white/[0.08]
                         hover:bg-white/[0.08] text-white/70 hover:text-white/85
                         disabled:opacity-30 disabled:cursor-not-allowed transition-all flex-shrink-0 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
              aria-label="Synthesize responses"
              title="Synthesize responses"
            >
              <RefreshCw size={13} className={state.isSynthesizing ? 'animate-spin' : ''} />
              <span className="hidden sm:inline">Synth</span>
            </button>
          )}
        </div>

        <div className="text-center mt-1.5">
          <span className={`text-[10px] ${modeTheme.helper}`}>
            {surfaceState.kind === 'execute'
              ? 'Execute opens a run thread · approvals gate risky commands · Shift+Enter for newline'
              : surfaceState.kind === 'build'
                ? 'Build plans first, writes after approval · active repo required · Shift+Enter for newline'
                : `Enter to ${intentCfg.label.toLowerCase()} · Shift+Enter for newline · Esc closes menus`}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Message Bubble Component ──────────────────────────────

function MessageBubble({ message, modelLabel, agentColor }: {
  message: ThreadMessage;
  modelLabel: string;
  agentColor?: string;
}) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const accentColor = agentColor || '#D6B24A';
  const remarkPlugins = useMemo(() => [remarkGfm], []);

  if (isSystem) {
    return (
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-full bg-signal-risk/15 flex items-center justify-center flex-shrink-0 mt-0.5">
          <AlertCircle size={14} className="text-signal-risk/90" />
        </div>
        <div className="py-2 px-3 rounded-lg bg-signal-risk/10 border border-signal-risk/20 text-sm text-signal-risk/90 max-w-[80%]">
          {message.content}
        </div>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex items-start gap-3 justify-end">
        <div className="py-2.5 px-4 rounded-2xl rounded-br-sm bg-gold/10 border border-gold/10 
                        text-sm text-white/80 max-w-[80%] whitespace-pre-wrap">
          {message.content}
        </div>
        <div className="w-7 h-7 rounded-full bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
          <User size={14} className="text-white/70" />
        </div>
      </div>
    );
  }

  // Agent / Concierge message — rendered with markdown
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
           style={{ backgroundColor: `${accentColor}15` }}>
        <Bot size={14} style={{ color: `${accentColor}90` }} />
      </div>
      <div className="flex-1 max-w-[80%]">
        <div className="text-[10px] text-white/60 mb-1">{modelLabel}</div>
        <div className="py-2.5 px-4 rounded-2xl rounded-bl-sm bg-white/[0.04] border border-white/[0.06] 
                        text-sm text-white/80 leading-relaxed claw-prose">
          <ReactMarkdown remarkPlugins={remarkPlugins}>{message.content}</ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
