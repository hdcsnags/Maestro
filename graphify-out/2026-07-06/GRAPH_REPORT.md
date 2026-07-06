# Graph Report - Maestro  (2026-07-06)

## Corpus Check
- 217 files · ~172,521 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1274 nodes · 2617 edges · 67 communities (62 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `754a96ea`
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
- [[_COMMUNITY_RepoSection.tsx|RepoSection.tsx]]
- [[_COMMUNITY_BuildReport.tsx|BuildReport.tsx]]
- [[_COMMUNITY_OrbitDots.tsx|OrbitDots.tsx]]
- [[_COMMUNITY_conductor.test.ts|conductor.test.ts]]
- [[_COMMUNITY_StreamingFolio.tsx|StreamingFolio.tsx]]
- [[_COMMUNITY_providerFallbacks.ts|providerFallbacks.ts]]
- [[_COMMUNITY_Project References|Project References]]

## God Nodes (most connected - your core abstractions)
1. `useMaestro()` - 93 edges
2. `MaestroState` - 31 edges
3. `useAuth()` - 30 edges
4. `supabase` - 27 edges
5. `AdapterResult` - 26 edges
6. `ThreadMessage` - 24 edges
7. `executeSessionJob()` - 22 edges
8. `requireAuthenticatedRequest()` - 21 edges
9. `executeJob()` - 20 edges
10. `runStep()` - 20 edges

## Surprising Connections (you probably didn't know these)
- `BoardroomStage()` --calls--> `useMaestro()`  [EXTRACTED]
  src/components/reveal/BoardroomStage.tsx → src/context/MaestroContext.tsx
- `BuildReport` --calls--> `useMaestro()`  [EXTRACTED]
  src/components/reveal/BuildReport.tsx → src/context/MaestroContext.tsx
- `HealthPanel()` --calls--> `useMaestro()`  [EXTRACTED]
  src/components/reveal/HealthPanel.tsx → src/context/MaestroContext.tsx
- `OrbitDots()` --calls--> `useMaestro()`  [EXTRACTED]
  src/components/reveal/OrbitDots.tsx → src/context/MaestroContext.tsx
- `OrchestraDrawer()` --calls--> `useMaestro()`  [EXTRACTED]
  src/components/reveal/OrchestraDrawer.tsx → src/context/MaestroContext.tsx

## Import Cycles
- 1-file cycle: `packages/maestroclaw/src/config.ts -> packages/maestroclaw/src/config.ts`
- 3-file cycle: `packages/maestroclaw/src/adapters/index.ts -> packages/maestroclaw/src/adapters/pty-shell.ts -> packages/maestroclaw/src/executor.ts -> packages/maestroclaw/src/adapters/index.ts`
- 3-file cycle: `packages/maestroclaw/src/adapters/approved-shell.ts -> packages/maestroclaw/src/executor.ts -> packages/maestroclaw/src/adapters/index.ts -> packages/maestroclaw/src/adapters/approved-shell.ts`

## Communities (67 total, 5 thin omitted)

### Community 0 - "Shell Command Execution"
Cohesion: 0.07
Nodes (33): ApprovedShellAdapter, TRUSTED_COMMANDS, ClaudeCodeAdapter, isRateLimited(), RATE_LIMIT_SIGNALS, CodexCliAdapter, buildCliArguments(), CliInvocation (+25 more)

### Community 1 - "Build Session Logging"
Cohesion: 0.05
Nodes (54): AgentDispatchResult, buildPushbacks(), callAnthropic(), callOpenAI(), DeliberateRequest, DeliberationPushback, dispatchDeliberation(), makeError() (+46 more)

### Community 2 - "Agent & Lane Types"
Cohesion: 0.10
Nodes (30): AtelierSidebar(), Props, BuildLogDrawer(), STATUS_ICON, ClawMode(), CommandItem, CommandPalette(), CommandResultCard() (+22 more)

### Community 3 - "Iteration Lock Management"
Cohesion: 0.09
Nodes (41): ExecutorJob, ArtifactManifestEntry, assessOutputQuality(), buildFixPassPrompt(), buildRetryPrompt(), buildSessionPrompt(), cleanForRetry(), collectWrittenFiles() (+33 more)

### Community 4 - "Build Plan Generation"
Cohesion: 0.04
Nodes (48): AgentDefault, AgentRole, AgentSkill, ApprovalFileEntry, ApprovalStatus, ArchitectLane, ArchitectLaneSlice, ArchitectPlan (+40 more)

### Community 5 - "Completeness & Framework Detection"
Cohesion: 0.06
Nodes (30): Props, AgentInvokeResult, BACKEND_DIRS, compareResponseSummary(), ConciergeRuntimeChoice, createResponseExcerpt(), describeLocalCommand(), extractJsonObject() (+22 more)

### Community 6 - "Supabase Backend Integration"
Cohesion: 0.14
Nodes (15): AdvisorStrip(), Props, FolioCard(), getFolioDisplayContent(), Props, tryExtractFromJson(), unescape(), FolioCarousel() (+7 more)

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
Cohesion: 0.09
Nodes (28): ConductorRun, ConductorRunOptions, createConductorRun(), buildPlan(), ConductorPlan, getReadyEntries(), markEntryDone(), markEntryFailed() (+20 more)

### Community 11 - "Conductor Task Execution"
Cohesion: 0.08
Nodes (18): buildDeterministicBuildPlan(), BuildLaneSummary, BuildPlanPayload, classifyIntent(), ConciergeRequest, ConciergeResult, DesignMode, FileEntry (+10 more)

### Community 12 - "LLM Dispatch & Deliberation"
Cohesion: 0.13
Nodes (18): ArchitectCard(), BackendCard(), BuilderRosterCard(), HEALTH_DOT, LaneCard(), ROLE_OPTIONS, PlanCardRenderer(), ProjectTypeCard() (+10 more)

### Community 13 - "Thread & Directory Utilities"
Cohesion: 0.13
Nodes (25): checkAdapters(), acquireLocks(), api(), claimJob(), claimLoop(), completeJob(), completeLoop(), ExecutorCapabilities (+17 more)

### Community 14 - "Global State Management"
Cohesion: 0.12
Nodes (22): AgentPatch, applyManifest(), createBackupBranch(), createBranch(), createPR(), deleteFile(), ensureDefaultBranchSha(), ExecuteRequest (+14 more)

### Community 15 - "Token & Executor Management"
Cohesion: 0.12
Nodes (13): BuildProgress, DecomposeResult, ExecutorJobEventRow, ExecutorJobSnapshot, GitHubReadFileResult, isLiteralScopedFile(), JobOutputState, listLiteralScopeFiles() (+5 more)

### Community 16 - "Git & File Operations"
Cohesion: 0.09
Nodes (17): BroadcastProgressState, BUILD_BROADCAST_MESSAGES, BuildStage, BuildWorkspace(), getBroadcastProgressState(), hasExecutableManifest(), hasWriteManifest(), laneMatchesResponse() (+9 more)

### Community 17 - "API Auth & Rate Limiting"
Cohesion: 0.13
Nodes (20): Intent, Route, TriageRequest, TriageResult, ReadRequest, DEFAULT_RATE_LIMIT_POLICY, enforceRateLimit(), getAuthToken() (+12 more)

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
Cohesion: 0.15
Nodes (11): BuildRunwayCard(), createEmptyPushState(), formatAdapterLabel(), formatBackendLabel(), NormalizedBuilderAgent, NormalizedBuildPlan, PushResultState, RUNWAY_STEPS (+3 more)

### Community 23 - "Iteration Loop UI"
Cohesion: 0.15
Nodes (15): BoardroomStage(), EmptyStage(), EmptyStageProps, ORB_CONFIG, ORBIT_AGENTS, QUICK_CHIPS, QuickChip, Orb() (+7 more)

### Community 24 - "Security Incident Panel"
Cohesion: 0.10
Nodes (18): OrchestraDrawer(), PERSONA_COLORS, PROVIDER_GROUPS, resolveSlotAgents(), STABILITY_DOT, TIER_ACCENT, TIER_DEFINITIONS, TIER_ORDER (+10 more)

### Community 25 - "Design Mode & Artifacts"
Cohesion: 0.17
Nodes (18): callModel(), decodeEscapedHtml(), DESIGN_MODE_LANES, DesignArtifact, DESIGNER_LANES, DesignerLane, DesignerRole, DesignMode (+10 more)

### Community 26 - "Provider Health & Routing"
Cohesion: 0.18
Nodes (15): applyArtifactPayloadToBuffer(), ArtifactFileChunkBuffer, ArtifactManifestBuffer, createArtifactManifestBuffer(), fetchExecutorJobArtifactManifest(), getArtifactManifestFromBuffer(), normalizeSessionManifest(), pollBuildSessionJob() (+7 more)

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
Cohesion: 0.33
Nodes (6): SENSITIVE_PATH_PATTERNS, jsonErrorResponse(), readBodyText(), readJsonBody(), ReadJsonBodyOptions, readOptionalJsonBody()

### Community 31 - "Root TypeScript Config"
Cohesion: 0.18
Nodes (15): AuthenticatedRequestContext, ClassicSynthesizeRequest, DeliberationPushback, DeliberationResponseRow, DeliberationSynthesizeRequest, getDeliberationSynthesisSystemPrompt(), jsonResponse(), parseSynthesisJson() (+7 more)

### Community 32 - "SystemEventCard.tsx"
Cohesion: 0.16
Nodes (7): CostRollupCard(), RollupMeta, TONE_CLASSES, RerouteApprovalCard(), SystemEventCard(), formatUsd(), resolveReroute()

### Community 33 - "Synthesis & Response Rendering"
Cohesion: 0.16
Nodes (13): compareCandidates(), compareStrings(), ManifestCandidate, ManifestCollision, mapTaskPriority(), PRIORITY_RANK, ReadyTask, ReadyTaskStatus (+5 more)

### Community 34 - "Node TypeScript Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection, moduleResolution, noEmit (+7 more)

### Community 35 - "Builder Lane Selection"
Cohesion: 0.18
Nodes (8): ArchitectLane, ArchitectLaneSlice, ArchitectPlan, ArchitectPlanSharedContext, BuildTaskPromptSlice, FileTreeNode, LaneApiExport, LaneApiImport

### Community 36 - "Workspace UI Components"
Cohesion: 0.24
Nodes (11): ApplyDiffFailure, ApplyDiffInput, ApplyDiffResult, ApplyDiffSuccess, applyDiffWithCheckpoint(), commitStep(), execGit(), globMatch() (+3 more)

### Community 37 - "Advisor Strip UI"
Cohesion: 0.16
Nodes (15): App(), AppInner(), ExecutorSection(), JOB_STATUS_COLORS, STATUS_COLORS, RevealTopbar(), SupabaseSection(), VaultDrawer() (+7 more)

### Community 38 - "Status & Report Cards"
Cohesion: 0.23
Nodes (11): IterationApprovalPanel(), Props, Props, STATUS_COLORS, IterationStepRow(), Props, STATE_ICONS, CreateLoopParams (+3 more)

### Community 39 - "Orb Status Visualization"
Cohesion: 0.18
Nodes (9): BuildAgentCandidate, BUILDER_COUNT_OPTIONS, COMPLEXITY_COLOR, normBuilderValue(), PreBuildPanel(), ProjectType, SCAFFOLD_MESSAGES, scoreBuildCandidate() (+1 more)

### Community 40 - "Agent Lane Assignment"
Cohesion: 0.20
Nodes (10): AgentRow, ArchitectRequest, assignAgentToLane(), FreshLane, isBuilderEligible(), norm(), scoreAgentForLane(), SuggestedLane (+2 more)

### Community 41 - "providerHealth.ts"
Cohesion: 0.21
Nodes (10): useProviderHealth(), modelToProviderKey(), ProviderHealthMap, registerRerouteHandler(), RerouteDecision, RerouteHandlerFn, selectModel(), updateHealth() (+2 more)

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
Cohesion: 0.20
Nodes (7): BouncerRequest, BouncerResult, BuildFile, Finding, Severity, Trigger, VALID_SEV

### Community 46 - "Concierge Event Display"
Cohesion: 0.27
Nodes (8): decodeBase64Utf8(), getKeyFile(), getTree(), ghApi(), IntakeRequest, IntakeSummary, KEY_FILES, TreeNode

### Community 47 - "GitHub Intake & Tree"
Cohesion: 0.32
Nodes (3): Batch, FlushFn, StreamThrottle

### Community 48 - "Iteration Approval UI"
Cohesion: 0.19
Nodes (12): ALTERNATES, checkBuildCompleteness(), checkImports(), CompletenessCheck, CompletenessResult, detectFramework(), extractImports(), Framework (+4 more)

### Community 49 - "Repository Memory Panel"
Cohesion: 0.17
Nodes (7): HealthPanel(), PROVIDER_DISPLAY, STATE_COLOR, STATE_LABEL, TrustDrawer(), TrustTab, ProviderHealthState

### Community 50 - "Decision Record Tracking"
Cohesion: 0.27
Nodes (4): Props, ExecutionModal(), unionScopePaths(), ApprovalRequest

### Community 51 - "Boardroom Stage UI"
Cohesion: 0.17
Nodes (9): SEVERITY_META, useBouncerReview(), Database, Json, EdgeFunctionBody, EdgeFunctionError, invokeEdgeFunction(), supabase (+1 more)

### Community 52 - "cost.ts"
Cohesion: 0.24
Nodes (9): BuildCostRollup, CostEstimate, DEFAULT_PAID, estimateBroadcastCost(), getModelPricing(), isFreeModel(), MODEL_PRICING_MAP, ModelPrice (+1 more)

### Community 54 - "MemoryPanel.tsx"
Cohesion: 0.36
Nodes (7): byteCount(), formatBytes(), formatDate(), MemoryPanel(), SummarizeOptions, SUPABASE_URL, useRepoMemory()

### Community 55 - "RepoSection.tsx"
Cohesion: 0.25
Nodes (7): GHRepo, GitHubAuthStatus, GitHubAuthUrlResponse, GitHubCreateRepoResponse, GitHubExchangeResponse, GitHubReposResponse, RepoSection()

### Community 56 - "BuildReport.tsx"
Cohesion: 0.33
Nodes (3): BouncerFinding, BuildReport, SEV_STYLE

### Community 57 - "OrbitDots.tsx"
Cohesion: 0.40
Nodes (3): FolioItem, OrbitDots(), Props

## Knowledge Gaps
- **424 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+419 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useMaestro()` connect `Agent & Lane Types` to `Completeness & Framework Detection`, `Supabase Backend Integration`, `Agent Skills & Artifacts`, `LLM Dispatch & Deliberation`, `Build Execution Tracking`, `Iteration Loop UI`, `Security Incident Panel`, `Plan Preview Cards`, `Advisor Strip UI`, `Status & Report Cards`, `Orb Status Visualization`, `providerHealth.ts`, `Pre-Build Intake Panel`, `Repository Memory Panel`, `Decision Record Tracking`, `Boardroom Stage UI`, `MemoryPanel.tsx`, `RepoSection.tsx`, `BuildReport.tsx`, `OrbitDots.tsx`?**
  _High betweenness centrality (0.028) - this node is a cross-community bridge._
- **Why does `usePreBuildPlan()` connect `LLM Dispatch & Deliberation` to `Agent & Lane Types`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **Why does `StreamThrottle` connect `GitHub Intake & Tree` to `Iteration Lock Management`?**
  _High betweenness centrality (0.005) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _424 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Shell Command Execution` be split into smaller, more focused modules?**
  _Cohesion score 0.06869446343130553 - nodes in this community are weakly interconnected._
- **Should `Build Session Logging` be split into smaller, more focused modules?**
  _Cohesion score 0.05314685314685315 - nodes in this community are weakly interconnected._
- **Should `Agent & Lane Types` be split into smaller, more focused modules?**
  _Cohesion score 0.09634551495016612 - nodes in this community are weakly interconnected._