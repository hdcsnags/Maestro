/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useReducer, ReactNode } from 'react';
import {
  Workspace, Agent, AgentSkill, Session, Round, Response, Synthesis,
  AuditEvent, ExecutionMode, ProviderConnection, RepoConnection,
  ExecutionRun, ExecutionStrategy, OrchestrationMode, ConciergeDecision,
  TriageResult, BuildPlan,
} from '../types';

export type ViewMode = 'stacked' | 'carousel';
export type DrawerTarget = 'orchestra' | 'trust' | 'synthesis' | 'vault' | 'pre-build' | null;

export interface MaestroState {
  workspace: Workspace | null;
  initError: string | null;
  agents: Agent[];
  agentSkills: AgentSkill[];
  activeSession: Session | null;
  sessions: Session[];
  rounds: Round[];
  responses: Response[];
  syntheses: Synthesis[];
  auditEvents: AuditEvent[];
  providerConnections: ProviderConnection[];
  repoConnections: RepoConnection[];
  activeRepoConnection: RepoConnection | null;
  executionRuns: ExecutionRun[];
  executionMode: ExecutionMode;
  executionStrategy: ExecutionStrategy;
  orchestrationMode: OrchestrationMode;
  broadcastingAgents: string[];
  isBroadcasting: boolean;
  isSynthesizing: boolean;
  conciergeDecision: ConciergeDecision | null;
  conciergeVisible: boolean;
  triageResult: TriageResult | null;
  isTriaging: boolean;
  buildPlan: BuildPlan | null;
  carouselVisible: boolean;
  autoShowCarousel: boolean;
  toastMessage: string | null;
  viewMode: ViewMode;
  activeDrawer: DrawerTarget;
  shortcutOverlayOpen: boolean;
  folioIndex: number;
  selectedRoundIndex: number; // -1 = auto-follow latest round
  patchModalOpen: boolean;
  executionModalOpen: boolean;
  focusMode: boolean;
}

type Action =
  | { type: 'SET_WORKSPACE'; payload: Workspace | null }
  | { type: 'SET_AGENTS'; payload: Agent[] }
  | { type: 'SET_AGENT_SKILLS'; payload: AgentSkill[] }
  | { type: 'ADD_AGENT_SKILL'; payload: AgentSkill }
  | { type: 'REMOVE_AGENT_SKILL'; payload: string }
  | { type: 'UPDATE_AGENT_SKILL'; payload: Partial<AgentSkill> & { id: string } }
  | { type: 'UPDATE_AGENT'; payload: Partial<Agent> & { id: string } }
  | { type: 'SET_ACTIVE_SESSION'; payload: Session | null }
  | { type: 'UPDATE_ACTIVE_SESSION'; payload: Partial<Session> }
  | { type: 'SET_SESSIONS'; payload: Session[] }
  | { type: 'SET_ROUNDS'; payload: Round[] }
  | { type: 'ADD_ROUND'; payload: Round }
  | { type: 'SET_RESPONSES'; payload: Response[] }
  | { type: 'ADD_RESPONSE'; payload: Response }
  | { type: 'UPDATE_RESPONSE'; payload: Partial<Response> & { id: string } }
  | { type: 'SET_SYNTHESES'; payload: Synthesis[] }
  | { type: 'ADD_SYNTHESIS'; payload: Synthesis }
  | { type: 'SET_AUDIT_EVENTS'; payload: AuditEvent[] }
  | { type: 'ADD_AUDIT_EVENT'; payload: AuditEvent }
  | { type: 'SET_EXECUTION_MODE'; payload: ExecutionMode }
  | { type: 'SET_EXECUTION_STRATEGY'; payload: ExecutionStrategy }
  | { type: 'SET_ORCHESTRATION_MODE'; payload: OrchestrationMode }
  | { type: 'SET_PROVIDER_CONNECTIONS'; payload: ProviderConnection[] }
  | { type: 'UPSERT_PROVIDER_CONNECTION'; payload: ProviderConnection }
  | { type: 'SET_REPO_CONNECTIONS'; payload: RepoConnection[] }
  | { type: 'SET_ACTIVE_REPO_CONNECTION'; payload: RepoConnection | null }
  | { type: 'UPSERT_REPO_CONNECTION'; payload: RepoConnection }
  | { type: 'SET_EXECUTION_RUNS'; payload: ExecutionRun[] }
  | { type: 'ADD_EXECUTION_RUN'; payload: ExecutionRun }
  | { type: 'UPDATE_EXECUTION_RUN'; payload: Partial<ExecutionRun> & { id: string } }
  | { type: 'SET_BROADCASTING_AGENTS'; payload: string[] }
  | { type: 'SET_IS_BROADCASTING'; payload: boolean }
  | { type: 'SET_IS_SYNTHESIZING'; payload: boolean }
  | { type: 'SET_CONCIERGE_VISIBLE'; payload: boolean }
  | { type: 'SET_CONCIERGE_DECISION'; payload: ConciergeDecision | null }
  | { type: 'SET_TRIAGE_RESULT'; payload: TriageResult | null }
  | { type: 'SET_IS_TRIAGING'; payload: boolean }
  | { type: 'SET_BUILD_PLAN'; payload: BuildPlan | null }
  | { type: 'SET_CAROUSEL_VISIBLE'; payload: boolean }
  | { type: 'SET_AUTO_SHOW_CAROUSEL'; payload: boolean }
  | { type: 'SHOW_TOAST'; payload: string }
  | { type: 'CLEAR_TOAST' }
  | { type: 'CLEAR_STAGE' }
  | { type: 'SET_VIEW_MODE'; payload: ViewMode }
  | { type: 'OPEN_DRAWER'; payload: DrawerTarget }
  | { type: 'CLOSE_TRANSIENT' }
  | { type: 'TOGGLE_SHORTCUTS' }
  | { type: 'SET_FOLIO_INDEX'; payload: number }
  | { type: 'SET_SELECTED_ROUND'; payload: number }
  | { type: 'SET_PATCH_MODAL'; payload: boolean }
  | { type: 'SET_EXECUTION_MODAL'; payload: boolean }
  | { type: 'TOGGLE_FOCUS_MODE' }
  | { type: 'SET_INIT_ERROR'; payload: string | null };

const initial: MaestroState = {
  workspace: null,
  initError: null,
  agents: [],
  agentSkills: [],
  activeSession: null,
  sessions: [],
  rounds: [],
  responses: [],
  syntheses: [],
  auditEvents: [],
  providerConnections: [],
  repoConnections: [],
  activeRepoConnection: null,
  executionRuns: [],
  executionMode: 'pr_flow',
  executionStrategy: 'synthesized',
  orchestrationMode: 'analysis',
  broadcastingAgents: [],
  isBroadcasting: false,
  isSynthesizing: false,
  conciergeDecision: null,
  conciergeVisible: false,
  triageResult: null,
  isTriaging: false,
  buildPlan: null,
  carouselVisible: false,
  autoShowCarousel: false,
  toastMessage: null,
  viewMode: 'carousel',
  activeDrawer: null,
  shortcutOverlayOpen: false,
  folioIndex: 0,
  selectedRoundIndex: -1,
  patchModalOpen: false,
  executionModalOpen: false,
  focusMode: false,
};

function reducer(state: MaestroState, action: Action): MaestroState {
  switch (action.type) {
    case 'SET_WORKSPACE': return { ...state, workspace: action.payload };
    case 'SET_AGENTS': return { ...state, agents: action.payload };
    case 'SET_AGENT_SKILLS': return { ...state, agentSkills: action.payload };
    case 'ADD_AGENT_SKILL': return { ...state, agentSkills: [...state.agentSkills, action.payload] };
    case 'REMOVE_AGENT_SKILL': return { ...state, agentSkills: state.agentSkills.filter(s => s.id !== action.payload) };
    case 'UPDATE_AGENT_SKILL':
      return {
        ...state,
        agentSkills: state.agentSkills.map(s =>
          s.id === action.payload.id ? { ...s, ...action.payload } : s
        ),
      };
    case 'UPDATE_AGENT':
      return {
        ...state,
        agents: state.agents.map(a =>
          a.id === action.payload.id ? { ...a, ...action.payload } : a
        ),
      };
    case 'SET_ACTIVE_SESSION': {
      // Hard isolation: when the active session changes, drop all rounds /
      // responses / syntheses / concierge state from the previous session.
      // The new session's data will be reloaded fresh by the loader. This
      // prevents any cross-session context bleed in tiered context, synthesis,
      // or concierge calls.
      const prevId = state.activeSession?.id ?? null;
      const nextId = action.payload?.id ?? null;
      if (prevId === nextId) {
        return { ...state, activeSession: action.payload };
      }
      return {
        ...state,
        activeSession: action.payload,
        rounds: [],
        responses: [],
        syntheses: [],
        conciergeDecision: null,
        conciergeVisible: false,
        broadcastingAgents: [],
        folioIndex: 0,
        selectedRoundIndex: -1,
        triageResult: null,
        isTriaging: false,
        buildPlan: null,
      };
    }
    case 'UPDATE_ACTIVE_SESSION':
      return state.activeSession
        ? { ...state, activeSession: { ...state.activeSession, ...action.payload } }
        : state;
    case 'SET_SESSIONS': return { ...state, sessions: action.payload };
    case 'SET_ROUNDS': return { ...state, rounds: action.payload };
    case 'ADD_ROUND': return { ...state, rounds: [...state.rounds, action.payload], selectedRoundIndex: -1, folioIndex: 0 };
    case 'SET_RESPONSES': return { ...state, responses: action.payload };
    case 'ADD_RESPONSE': return { ...state, responses: [...state.responses, action.payload] };
    case 'UPDATE_RESPONSE':
      return {
        ...state,
        responses: state.responses.map(r =>
          r.id === action.payload.id ? { ...r, ...action.payload } : r
        ),
      };
    case 'SET_SYNTHESES': return { ...state, syntheses: action.payload };
    case 'ADD_SYNTHESIS': return { ...state, syntheses: [...state.syntheses, action.payload] };
    case 'SET_AUDIT_EVENTS': return { ...state, auditEvents: action.payload };
    case 'ADD_AUDIT_EVENT': return { ...state, auditEvents: [action.payload, ...state.auditEvents] };
    case 'SET_EXECUTION_MODE': return { ...state, executionMode: action.payload };
    case 'SET_EXECUTION_STRATEGY': return { ...state, executionStrategy: action.payload };
    case 'SET_ORCHESTRATION_MODE': return { ...state, orchestrationMode: action.payload };
    case 'SET_PROVIDER_CONNECTIONS': return { ...state, providerConnections: action.payload };
    case 'UPSERT_PROVIDER_CONNECTION': {
      const exists = state.providerConnections.find(p => p.id === action.payload.id);
      return {
        ...state,
        providerConnections: exists
          ? state.providerConnections.map(p => p.id === action.payload.id ? action.payload : p)
          : [...state.providerConnections, action.payload],
      };
    }
    case 'SET_REPO_CONNECTIONS': return { ...state, repoConnections: action.payload };
    case 'SET_ACTIVE_REPO_CONNECTION': return { ...state, activeRepoConnection: action.payload };
    case 'UPSERT_REPO_CONNECTION': {
      const exists = state.repoConnections.find(r => r.id === action.payload.id);
      return {
        ...state,
        repoConnections: exists
          ? state.repoConnections.map(r => r.id === action.payload.id ? action.payload : r)
          : [...state.repoConnections, action.payload],
        activeRepoConnection: action.payload,
      };
    }
    case 'SET_EXECUTION_RUNS': return { ...state, executionRuns: action.payload };
    case 'ADD_EXECUTION_RUN': return { ...state, executionRuns: [...state.executionRuns, action.payload] };
    case 'UPDATE_EXECUTION_RUN':
      return {
        ...state,
        executionRuns: state.executionRuns.map(r =>
          r.id === action.payload.id ? { ...r, ...action.payload } : r
        ),
      };
    case 'SET_BROADCASTING_AGENTS': return { ...state, broadcastingAgents: action.payload };
    case 'SET_IS_BROADCASTING': return { ...state, isBroadcasting: action.payload };
    case 'SET_IS_SYNTHESIZING': return { ...state, isSynthesizing: action.payload };
    case 'SET_CONCIERGE_VISIBLE': return { ...state, conciergeVisible: action.payload };
    case 'SET_CONCIERGE_DECISION': return { ...state, conciergeDecision: action.payload, conciergeVisible: action.payload !== null };
    case 'SET_TRIAGE_RESULT': return { ...state, triageResult: action.payload, conciergeVisible: action.payload !== null };
    case 'SET_IS_TRIAGING': return { ...state, isTriaging: action.payload };
    case 'SET_BUILD_PLAN': return { ...state, buildPlan: action.payload };
    case 'SET_CAROUSEL_VISIBLE': return { ...state, carouselVisible: action.payload };
    case 'SET_AUTO_SHOW_CAROUSEL': return { ...state, autoShowCarousel: action.payload };
    case 'SHOW_TOAST': return { ...state, toastMessage: action.payload };
    case 'CLEAR_TOAST': return { ...state, toastMessage: null };
    case 'CLEAR_STAGE': return { ...state, folioIndex: 0, selectedRoundIndex: -1, triageResult: null, isTriaging: false, buildPlan: null };
    case 'SET_VIEW_MODE': return { ...state, viewMode: action.payload };
    case 'OPEN_DRAWER': {
      const isSame = state.activeDrawer === action.payload;
      return { ...state, activeDrawer: isSame ? null : action.payload, shortcutOverlayOpen: false };
    }
    case 'CLOSE_TRANSIENT': return { ...state, activeDrawer: null, shortcutOverlayOpen: false };
    case 'TOGGLE_SHORTCUTS': return { ...state, shortcutOverlayOpen: !state.shortcutOverlayOpen, activeDrawer: null };
    case 'SET_FOLIO_INDEX': return { ...state, folioIndex: action.payload };
    case 'SET_SELECTED_ROUND': return { ...state, selectedRoundIndex: action.payload, folioIndex: 0 };
    case 'SET_PATCH_MODAL': return { ...state, patchModalOpen: action.payload };
    case 'SET_EXECUTION_MODAL': return { ...state, executionModalOpen: action.payload };
    case 'TOGGLE_FOCUS_MODE': return { ...state, focusMode: !state.focusMode };
    case 'SET_INIT_ERROR': return { ...state, initError: action.payload };
    default: return state;
  }
}

const MaestroContext = createContext<{
  state: MaestroState;
  dispatch: React.Dispatch<Action>;
} | null>(null);

export function MaestroProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  return (
    <MaestroContext.Provider value={{ state, dispatch }}>
      {children}
    </MaestroContext.Provider>
  );
}

export function useMaestro() {
  const ctx = useContext(MaestroContext);
  if (!ctx) throw new Error('useMaestro must be used within MaestroProvider');
  return ctx;
}
