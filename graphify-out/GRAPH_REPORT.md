# Graph Report - Maestro  (2026-07-07)

## Corpus Check
- 237 files · ~182,370 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1274 nodes · 2732 edges · 63 communities (59 shown, 4 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `27c1960d`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Shell Command Execution|Shell Command Execution]]
- [[_COMMUNITY_Build Session Logging|Build Session Logging]]
- [[_COMMUNITY_Agent & Lane Types|Agent & Lane Types]]
- [[_COMMUNITY_Iteration Lock Management|Iteration Lock Management]]
- [[_COMMUNITY_Build Plan Generation|Build Plan Generation]]
- [[_COMMUNITY_Completeness & Framework Detection|Completeness & Framework Detection]]
- [[_COMMUNITY_Supabase Backend Integration|Supabase Backend Integration]]
- [[_COMMUNITY_Agent Skills & Artifacts|Agent Skills & Artifacts]]
- [[_COMMUNITY_Orchestration & Deliberation|Orchestration & Deliberation]]
- [[_COMMUNITY_Package Dependencies|Package Dependencies]]
- [[_COMMUNITY_Incident Tracking Service|Incident Tracking Service]]
- [[_COMMUNITY_Conductor Task Execution|Conductor Task Execution]]
- [[_COMMUNITY_LLM Dispatch & Deliberation|LLM Dispatch & Deliberation]]
- [[_COMMUNITY_Thread & Directory Utilities|Thread & Directory Utilities]]
- [[_COMMUNITY_Global State Management|Global State Management]]
- [[_COMMUNITY_Token & Executor Management|Token & Executor Management]]
- [[_COMMUNITY_Git & File Operations|Git & File Operations]]
- [[_COMMUNITY_API Auth & Rate Limiting|API Auth & Rate Limiting]]
- [[_COMMUNITY_Cost Estimation & Display|Cost Estimation & Display]]
- [[_COMMUNITY_Build Execution Tracking|Build Execution Tracking]]
- [[_COMMUNITY_Security Finding Triage|Security Finding Triage]]
- [[_COMMUNITY_CLI Package Configuration|CLI Package Configuration]]
- [[_COMMUNITY_Build Submission & Execution|Build Submission & Execution]]
- [[_COMMUNITY_Iteration Loop UI|Iteration Loop UI]]
- [[_COMMUNITY_Security Incident Panel|Security Incident Panel]]
- [[_COMMUNITY_Design Mode & Artifacts|Design Mode & Artifacts]]
- [[_COMMUNITY_Provider Health & Routing|Provider Health & Routing]]
- [[_COMMUNITY_App TypeScript Config|App TypeScript Config]]
- [[_COMMUNITY_Agent Orchestration Types|Agent Orchestration Types]]
- [[_COMMUNITY_Plan Preview Cards|Plan Preview Cards]]
- [[_COMMUNITY_Design Phase Management|Design Phase Management]]
- [[_COMMUNITY_Root TypeScript Config|Root TypeScript Config]]
- [[_COMMUNITY_SystemEventCard.tsx|SystemEventCard.tsx]]
- [[_COMMUNITY_Synthesis & Response Rendering|Synthesis & Response Rendering]]
- [[_COMMUNITY_Node TypeScript Config|Node TypeScript Config]]
- [[_COMMUNITY_Builder Lane Selection|Builder Lane Selection]]
- [[_COMMUNITY_Workspace UI Components|Workspace UI Components]]
- [[_COMMUNITY_Advisor Strip UI|Advisor Strip UI]]
- [[_COMMUNITY_Status & Report Cards|Status & Report Cards]]
- [[_COMMUNITY_Orb Status Visualization|Orb Status Visualization]]
- [[_COMMUNITY_Agent Lane Assignment|Agent Lane Assignment]]
- [[_COMMUNITY_providerHealth.ts|providerHealth.ts]]
- [[_COMMUNITY_Diff Application & Git|Diff Application & Git]]
- [[_COMMUNITY_Health & Audit Panel|Health & Audit Panel]]
- [[_COMMUNITY_Pre-Build Intake Panel|Pre-Build Intake Panel]]
- [[_COMMUNITY_Repository Summarization|Repository Summarization]]
- [[_COMMUNITY_Concierge Event Display|Concierge Event Display]]
- [[_COMMUNITY_GitHub Intake & Tree|GitHub Intake & Tree]]
- [[_COMMUNITY_Iteration Approval UI|Iteration Approval UI]]
- [[_COMMUNITY_Repository Memory Panel|Repository Memory Panel]]
- [[_COMMUNITY_Decision Record Tracking|Decision Record Tracking]]
- [[_COMMUNITY_Boardroom Stage UI|Boardroom Stage UI]]
- [[_COMMUNITY_cost.ts|cost.ts]]
- [[_COMMUNITY_Cost Estimation|Cost Estimation]]
- [[_COMMUNITY_MemoryPanel.tsx|MemoryPanel.tsx]]
- [[_COMMUNITY_providerFallbacks.ts|providerFallbacks.ts]]
- [[_COMMUNITY_BuildReport.tsx|BuildReport.tsx]]
- [[_COMMUNITY_Project References|Project References]]

## God Nodes (most connected - your core abstractions)
1. `useMaestro()` - 99 edges
2. `useAuth()` - 34 edges
3. `MaestroState` - 31 edges
4. `supabase` - 29 edges
5. `AdapterResult` - 26 edges
6. `ThreadMessage` - 24 edges
7. `requireAuthenticatedRequest()` - 23 edges
8. `executeSessionJob()` - 22 edges
9. `useThreads()` - 21 edges
10. `buildCorsHeaders()` - 21 edges

## Surprising Connections (you probably didn't know these)
- `BuildReport` --calls--> `useMaestro()`  [EXTRACTED]
  src/components/reveal/BuildReport.tsx → src/context/MaestroContext.tsx
- `HealthPanel()` --calls--> `useMaestro()`  [EXTRACTED]
  src/components/reveal/HealthPanel.tsx → src/context/MaestroContext.tsx
- `OrbitDots()` --calls--> `useMaestro()`  [EXTRACTED]
  src/components/reveal/OrbitDots.tsx → src/context/MaestroContext.tsx
- `OrchestraDrawer()` --calls--> `useMaestro()`  [EXTRACTED]
  src/components/reveal/OrchestraDrawer.tsx → src/context/MaestroContext.tsx
- `LaneCard()` --calls--> `usePreBuildPlan()`  [EXTRACTED]
  src/components/reveal/PlanCards/LaneCard.tsx → src/hooks/usePreBuildPlan.ts

## Import Cycles
- 1-file cycle: `packages/maestroclaw/src/config.ts -> packages/maestroclaw/src/config.ts`
- 3-file cycle: `packages/maestroclaw/src/adapters/index.ts -> packages/maestroclaw/src/adapters/pty-shell.ts -> packages/maestroclaw/src/executor.ts -> packages/maestroclaw/src/adapters/index.ts`
- 3-file cycle: `packages/maestroclaw/src/adapters/approved-shell.ts -> packages/maestroclaw/src/executor.ts -> packages/maestroclaw/src/adapters/index.ts -> packages/maestroclaw/src/adapters/approved-shell.ts`

## Communities (63 total, 4 thin omitted)

### Community 0 - "Shell Command Execution"
Cohesion: 0.07
Nodes (33): ApprovedShellAdapter, TRUSTED_COMMANDS, ClaudeCodeAdapter, isRateLimited(), RATE_LIMIT_SIGNALS, CodexCliAdapter, buildCliArguments(), CliInvocation (+25 more)

### Community 1 - "Build Session Logging"
Cohesion: 0.05
Nodes (54): AgentDispatchResult, buildPushbacks(), callAnthropic(), callOpenAI(), DeliberateRequest, DeliberationPushback, dispatchDeliberation(), makeError() (+46 more)

### Community 2 - "Agent & Lane Types"
Cohesion: 0.13
Nodes (17): AtelierSidebar(), Props, ClawMode(), CommandResultCard(), KICKABLE_STATUSES, RUNNING_STATUSES, ErrorRetryCard(), ExecutionApprovalCard() (+9 more)

### Community 3 - "Iteration Lock Management"
Cohesion: 0.09
Nodes (41): ExecutorJob, ArtifactManifestEntry, assessOutputQuality(), buildFixPassPrompt(), buildRetryPrompt(), buildSessionPrompt(), cleanForRetry(), collectWrittenFiles() (+33 more)

### Community 4 - "Build Plan Generation"
Cohesion: 0.05
Nodes (42): AgentDefault, AgentRole, AgentSkill, ApprovalStatus, ArchitectLane, ArchitectLaneSlice, ArchitectPlan, BouncerFinding (+34 more)

### Community 5 - "Completeness & Framework Detection"
Cohesion: 0.06
Nodes (30): Props, AgentInvokeResult, BACKEND_DIRS, compareResponseSummary(), ConciergeRuntimeChoice, createResponseExcerpt(), describeLocalCommand(), extractJsonObject() (+22 more)

### Community 6 - "Supabase Backend Integration"
Cohesion: 0.11
Nodes (18): AdvisorStrip(), Props, FolioCard(), getFolioDisplayContent(), Props, tryExtractFromJson(), unescape(), FolioCarousel() (+10 more)

### Community 7 - "Agent Skills & Artifacts"
Cohesion: 0.12
Nodes (31): Action, DrawerTarget, initial, MaestroContext, MaestroProvider(), MaestroState, reducer(), ViewMode (+23 more)

### Community 8 - "Orchestration & Deliberation"
Cohesion: 0.11
Nodes (35): getAdapter(), applyLoopControl(), pollLoopControls(), matchesAnyScope(), acquireIterationLocks(), releaseIterationLocks(), AgentQuerySignal, detectAgentStuck() (+27 more)

### Community 9 - "Package Dependencies"
Cohesion: 0.06
Nodes (34): dependencies, lucide-react, react, react-dom, react-markdown, remark-gfm, @supabase/supabase-js, devDependencies (+26 more)

### Community 10 - "Incident Tracking Service"
Cohesion: 0.20
Nodes (7): BouncerRequest, BouncerResult, BuildFile, Finding, Severity, Trigger, VALID_SEV

### Community 11 - "Conductor Task Execution"
Cohesion: 0.06
Nodes (28): buildDeterministicBuildPlan(), BuildLaneSummary, BuildPlanPayload, classifyIntent(), ConciergeRequest, ConciergeResult, DesignMode, FileEntry (+20 more)

### Community 12 - "LLM Dispatch & Deliberation"
Cohesion: 0.24
Nodes (9): ArchitectCard(), BackendCard(), BuilderRosterCard(), HEALTH_DOT, PlanCardRenderer(), ProjectTypeCard(), RepoCard(), SpecLockCard() (+1 more)

### Community 13 - "Thread & Directory Utilities"
Cohesion: 0.13
Nodes (25): checkAdapters(), acquireLocks(), api(), claimJob(), claimLoop(), completeJob(), completeLoop(), ExecutorCapabilities (+17 more)

### Community 14 - "Global State Management"
Cohesion: 0.12
Nodes (22): AgentPatch, applyManifest(), createBackupBranch(), createBranch(), createPR(), deleteFile(), ensureDefaultBranchSha(), ExecuteRequest (+14 more)

### Community 15 - "Token & Executor Management"
Cohesion: 0.10
Nodes (19): BuildProgress, DecomposeResult, deriveSessionProgress(), ExecutorJobEventRow, ExecutorJobSnapshot, GitHubReadFileResult, isLiteralScopedFile(), JobOutputState (+11 more)

### Community 16 - "Git & File Operations"
Cohesion: 0.09
Nodes (16): BroadcastProgressState, BUILD_BROADCAST_MESSAGES, BuildStage, getBroadcastProgressState(), hasExecutableManifest(), hasWriteManifest(), laneMatchesResponse(), LaneRow (+8 more)

### Community 17 - "API Auth & Rate Limiting"
Cohesion: 0.18
Nodes (16): ReadRequest, DEFAULT_RATE_LIMIT_POLICY, enforceRateLimit(), getAuthToken(), isRateLimitCheckResult(), jsonResponse(), RATE_LIMIT_POLICIES, RateLimitCheckResult (+8 more)

### Community 18 - "Cost Estimation & Display"
Cohesion: 0.14
Nodes (18): bytesToHex(), candidateTokenHashes(), errorResponse(), EXECUTOR_API_BODY_LIMITS, ExecutorRecord, getApprovalPolicy(), getExecutorTokenSecrets(), hashLegacyToken() (+10 more)

### Community 19 - "Build Execution Tracking"
Cohesion: 0.09
Nodes (23): ConciergeEventCard(), DecisionMetadata, DESIGN_MODE_LABELS, isDecisionMetadata(), isTriageMetadata(), NEXT_PHASE_LABELS, TriageMetadata, HeroContext() (+15 more)

### Community 20 - "Security Finding Triage"
Cohesion: 0.09
Nodes (21): bin, maestroclaw, dependencies, dotenv, @lydell/node-pty, @supabase/supabase-js, description, devDependencies (+13 more)

### Community 21 - "CLI Package Configuration"
Cohesion: 0.12
Nodes (16): BuildRunwayCard(), createEmptyPushState(), formatAdapterLabel(), formatBackendLabel(), NormalizedBuilderAgent, NormalizedBuildPlan, PushResultState, resolveTaskBackend() (+8 more)

### Community 22 - "Build Submission & Execution"
Cohesion: 0.20
Nodes (7): CostRollupCard(), RollupMeta, TONE_CLASSES, RerouteApprovalCard(), SystemEventCard(), formatUsd(), ThreadMessage

### Community 23 - "Iteration Loop UI"
Cohesion: 0.22
Nodes (10): EmptyStage(), EmptyStageProps, ORB_CONFIG, ORBIT_AGENTS, QUICK_CHIPS, QuickChip, deriveOrbStatusText(), OrbState (+2 more)

### Community 24 - "Security Incident Panel"
Cohesion: 0.10
Nodes (18): OrchestraDrawer(), PERSONA_COLORS, PROVIDER_GROUPS, resolveSlotAgents(), STABILITY_DOT, TIER_ACCENT, TIER_DEFINITIONS, TIER_ORDER (+10 more)

### Community 25 - "Design Mode & Artifacts"
Cohesion: 0.17
Nodes (18): callModel(), decodeEscapedHtml(), DESIGN_MODE_LANES, DesignArtifact, DESIGNER_LANES, DesignerLane, DesignerRole, DesignMode (+10 more)

### Community 26 - "Provider Health & Routing"
Cohesion: 0.23
Nodes (14): applyArtifactPayloadToBuffer(), ArtifactFileChunkBuffer, ArtifactManifestBuffer, cancelBuildSessionJob(), createArtifactManifestBuffer(), fetchExecutorJobArtifactManifest(), getArtifactManifestFromBuffer(), normalizeSessionManifest() (+6 more)

### Community 27 - "App TypeScript Config"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+9 more)

### Community 28 - "Agent Orchestration Types"
Cohesion: 0.12
Nodes (16): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir (+8 more)

### Community 29 - "Plan Preview Cards"
Cohesion: 0.20
Nodes (14): ArtifactStatus, decodeEscapedHtml(), DesignArtifact, DesignPhase(), extractHtml(), extractJsonStringField(), MODE_LABELS, parseJson() (+6 more)

### Community 30 - "Design Phase Management"
Cohesion: 0.19
Nodes (12): ALTERNATES, checkBuildCompleteness(), checkImports(), CompletenessCheck, CompletenessResult, detectFramework(), extractImports(), Framework (+4 more)

### Community 31 - "Root TypeScript Config"
Cohesion: 0.18
Nodes (15): AuthenticatedRequestContext, ClassicSynthesizeRequest, DeliberationPushback, DeliberationResponseRow, DeliberationSynthesizeRequest, getDeliberationSynthesisSystemPrompt(), jsonResponse(), parseSynthesisJson() (+7 more)

### Community 32 - "SystemEventCard.tsx"
Cohesion: 0.06
Nodes (42): ConductorRun, ConductorRunOptions, createConductorRun(), buildPlan(), ConductorPlan, getReadyEntries(), markEntryDone(), markEntryFailed() (+34 more)

### Community 33 - "Synthesis & Response Rendering"
Cohesion: 0.16
Nodes (7): LaneCard(), ROLE_OPTIONS, BuildAgentCandidate, BUILDER_COUNT_OPTIONS, normBuilderValue(), scoreBuildCandidate(), SuggestedLane

### Community 34 - "Node TypeScript Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection, moduleResolution, noEmit (+7 more)

### Community 36 - "Workspace UI Components"
Cohesion: 0.24
Nodes (11): ApplyDiffFailure, ApplyDiffInput, ApplyDiffResult, ApplyDiffSuccess, applyDiffWithCheckpoint(), commitStep(), execGit(), globMatch() (+3 more)

### Community 37 - "Advisor Strip UI"
Cohesion: 0.10
Nodes (30): App(), AppInner(), BoardroomStage(), BuildLogDrawer(), STATUS_ICON, BuildWorkspace(), ExecutorSection(), Orb() (+22 more)

### Community 38 - "Status & Report Cards"
Cohesion: 0.17
Nodes (15): CommandItem, CommandPalette(), IterationApprovalPanel(), Props, IterationCard(), Props, STATUS_COLORS, IterationStepRow() (+7 more)

### Community 39 - "Orb Status Visualization"
Cohesion: 0.18
Nodes (9): BuildAgentCandidate, BUILDER_COUNT_OPTIONS, COMPLEXITY_COLOR, normBuilderValue(), PreBuildPanel(), ProjectType, SCAFFOLD_MESSAGES, scoreBuildCandidate() (+1 more)

### Community 40 - "Agent Lane Assignment"
Cohesion: 0.20
Nodes (10): AgentRow, ArchitectRequest, assignAgentToLane(), FreshLane, isBuilderEligible(), norm(), scoreAgentForLane(), SuggestedLane (+2 more)

### Community 41 - "providerHealth.ts"
Cohesion: 0.21
Nodes (11): classifyFailure(), modelToProviderKey(), ProviderHealthMap, registerRerouteHandler(), RerouteDecision, RerouteHandlerFn, resolveReroute(), selectModel() (+3 more)

### Community 42 - "Diff Application & Git"
Cohesion: 0.24
Nodes (9): IterationLoopRecord, PriorStepSummary, completeLoopWithRecord(), LoopState, buildDecisionRecord(), DecisionRecord, detectProblemType(), PROBLEM_TYPE_PATTERNS (+1 more)

### Community 43 - "Health & Audit Panel"
Cohesion: 0.27
Nodes (7): callHaiku(), SummarizeOutputLocal, buildStrictSummarizePrompt(), buildSummarizePrompt(), parseSummarizeOutput(), SummarizeInput, SummarizeOutput

### Community 44 - "Pre-Build Intake Panel"
Cohesion: 0.13
Nodes (14): CATEGORY_LABEL, FilterSeverity, SecurityPanel(), SEVERITY_COLOR, SEVERITY_DOT, CHIP_TONE, getExecutionModeLabel(), MODE_OPTIONS (+6 more)

### Community 45 - "Repository Summarization"
Cohesion: 0.18
Nodes (10): Intent, Route, TriageRequest, TriageResult, SENSITIVE_PATH_PATTERNS, jsonErrorResponse(), readBodyText(), readJsonBody() (+2 more)

### Community 46 - "Concierge Event Display"
Cohesion: 0.27
Nodes (8): decodeBase64Utf8(), getKeyFile(), getTree(), ghApi(), IntakeRequest, IntakeSummary, KEY_FILES, TreeNode

### Community 47 - "GitHub Intake & Tree"
Cohesion: 0.32
Nodes (3): Batch, FlushFn, StreamThrottle

### Community 48 - "Iteration Approval UI"
Cohesion: 0.24
Nodes (10): BuildCostRollup, CostEstimate, DEFAULT_PAID, estimateBroadcastCost(), getModelPricing(), isFreeModel(), MODEL_PRICING_MAP, ModelPrice (+2 more)

### Community 49 - "Repository Memory Panel"
Cohesion: 0.17
Nodes (7): HealthPanel(), PROVIDER_DISPLAY, STATE_COLOR, STATE_LABEL, TrustDrawer(), TrustTab, ProviderHealthState

### Community 50 - "Decision Record Tracking"
Cohesion: 0.24
Nodes (5): Props, ExecutionModal(), unionScopePaths(), ApprovalFileEntry, ApprovalRequest

### Community 51 - "Boardroom Stage UI"
Cohesion: 0.13
Nodes (16): JOB_STATUS_COLORS, STATUS_COLORS, GHRepo, GitHubAuthStatus, GitHubAuthUrlResponse, GitHubCreateRepoResponse, GitHubExchangeResponse, GitHubReposResponse (+8 more)

### Community 54 - "MemoryPanel.tsx"
Cohesion: 0.36
Nodes (7): byteCount(), formatBytes(), formatDate(), MemoryPanel(), SummarizeOptions, SUPABASE_URL, useRepoMemory()

### Community 55 - "providerFallbacks.ts"
Cohesion: 0.50
Nodes (3): buildFallbackChain(), CANONICAL_FALLBACKS, FallbackChain

### Community 56 - "BuildReport.tsx"
Cohesion: 0.33
Nodes (3): BouncerFinding, BuildReport, SEV_STYLE

## Knowledge Gaps
- **416 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+411 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **4 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useMaestro()` connect `Advisor Strip UI` to `Agent & Lane Types`, `Completeness & Framework Detection`, `Supabase Backend Integration`, `Agent Skills & Artifacts`, `LLM Dispatch & Deliberation`, `Token & Executor Management`, `Git & File Operations`, `Build Execution Tracking`, `CLI Package Configuration`, `Iteration Loop UI`, `Security Incident Panel`, `Plan Preview Cards`, `Synthesis & Response Rendering`, `Status & Report Cards`, `Orb Status Visualization`, `providerHealth.ts`, `Pre-Build Intake Panel`, `Repository Memory Panel`, `Decision Record Tracking`, `Boardroom Stage UI`, `MemoryPanel.tsx`, `BuildReport.tsx`?**
  _High betweenness centrality (0.069) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _416 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Shell Command Execution` be split into smaller, more focused modules?**
  _Cohesion score 0.06869446343130553 - nodes in this community are weakly interconnected._
- **Should `Build Session Logging` be split into smaller, more focused modules?**
  _Cohesion score 0.05314685314685315 - nodes in this community are weakly interconnected._
- **Should `Agent & Lane Types` be split into smaller, more focused modules?**
  _Cohesion score 0.12681159420289856 - nodes in this community are weakly interconnected._
- **Should `Iteration Lock Management` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `Build Plan Generation` be split into smaller, more focused modules?**
  _Cohesion score 0.046511627906976744 - nodes in this community are weakly interconnected._