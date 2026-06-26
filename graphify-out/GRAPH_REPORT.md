# Graph Report - .  (2026-06-26)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 1235 nodes · 2668 edges · 68 communities (62 shown, 6 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `37568936`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]

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
- `BoardroomStage()` --calls--> `useMaestro()`  [EXTRACTED]
  src/components/reveal/BoardroomStage.tsx → src/context/MaestroContext.tsx
- `BuildLogDrawer()` --calls--> `useMaestro()`  [EXTRACTED]
  src/components/reveal/BuildLogDrawer.tsx → src/context/MaestroContext.tsx
- `BuildReport` --calls--> `useMaestro()`  [EXTRACTED]
  src/components/reveal/BuildReport.tsx → src/context/MaestroContext.tsx
- `HealthPanel()` --calls--> `useMaestro()`  [EXTRACTED]
  src/components/reveal/HealthPanel.tsx → src/context/MaestroContext.tsx
- `OrchestraDrawer()` --calls--> `useMaestro()`  [EXTRACTED]
  src/components/reveal/OrchestraDrawer.tsx → src/context/MaestroContext.tsx

## Import Cycles
- 3-file cycle: `packages/maestroclaw/src/adapters/index.ts -> packages/maestroclaw/src/adapters/pty-shell.ts -> packages/maestroclaw/src/executor.ts -> packages/maestroclaw/src/adapters/index.ts`
- 3-file cycle: `packages/maestroclaw/src/adapters/approved-shell.ts -> packages/maestroclaw/src/executor.ts -> packages/maestroclaw/src/adapters/index.ts -> packages/maestroclaw/src/adapters/approved-shell.ts`

## Communities (68 total, 6 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.07
Nodes (33): ApprovedShellAdapter, TRUSTED_COMMANDS, ClaudeCodeAdapter, isRateLimited(), RATE_LIMIT_SIGNALS, CodexCliAdapter, buildCliArguments(), CliInvocation (+25 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (41): appendBuildSessionLogSummary(), BuildSessionLog, extractBalancedObject(), extractBuildSessionLog(), mergeBuildSessionLogs(), normalizeBuildSessionLog(), readSessionLog(), SessionLogEntry (+33 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (43): AgentDefault, AgentRole, AgentSkill, ApprovalStatus, ArchitectLane, ArchitectLaneSlice, ArchitectPlan, BouncerFinding (+35 more)

### Community 3 - "Community 3"
Cohesion: 0.10
Nodes (38): getAdapter(), matchesAnyScope(), acquireIterationLocks(), releaseIterationLocks(), AgentQuerySignal, detectAgentStuck(), extractAgentQuery(), FileSnapshot (+30 more)

### Community 4 - "Community 4"
Cohesion: 0.06
Nodes (28): buildDeterministicBuildPlan(), BuildLaneSummary, BuildPlanPayload, classifyIntent(), ConciergeRequest, ConciergeResult, DesignMode, FileEntry (+20 more)

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (27): ALTERNATES, checkBuildCompleteness(), checkImports(), CompletenessCheck, CompletenessResult, detectFramework(), extractImports(), Framework (+19 more)

### Community 6 - "Community 6"
Cohesion: 0.10
Nodes (23): AuthContext, AuthContextValue, Database, Json, EdgeFunctionBody, invokeEdgeFunction(), supabase, ExecutionModal() (+15 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (29): AgentSkillPayload, ArtifactResult, buildResultFromParsed(), buildSystemPrompt(), coerceString(), ContextFile, DEFAULT_CAPABILITIES, extractJsonCandidate() (+21 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (23): useMaestro(), CommandResultCard(), ErrorRetryCard(), ExecutionApprovalCard(), DeliberateResult, SUPABASE_URL, useDeliberation(), useOrchestration() (+15 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (32): dependencies, lucide-react, react, react-dom, react-markdown, remark-gfm, @supabase/supabase-js, devDependencies (+24 more)

### Community 10 - "Community 10"
Cohesion: 0.14
Nodes (24): checkAdapters(), IncidentCategory, IncidentPayload, IncidentService, IncidentSeverity, acquireLocks(), api(), claimJob() (+16 more)

### Community 11 - "Community 11"
Cohesion: 0.14
Nodes (25): ConductorRun, ConductorRunOptions, createConductorRun(), buildPlan(), ConductorPlan, getReadyEntries(), markEntryDone(), markEntryFailed() (+17 more)

### Community 12 - "Community 12"
Cohesion: 0.12
Nodes (25): AgentDispatchResult, buildPushbacks(), callAnthropic(), callOpenAI(), DeliberateRequest, DeliberationPushback, dispatchDeliberation(), makeError() (+17 more)

### Community 13 - "Community 13"
Cohesion: 0.08
Nodes (25): BACKEND_DIRS, compareResponseSummary(), ConciergeRuntimeChoice, createResponseExcerpt(), describeLocalCommand(), extractJsonObject(), extractTreeDirs(), FRONTEND_DIRS (+17 more)

### Community 14 - "Community 14"
Cohesion: 0.13
Nodes (27): Action, DrawerTarget, initial, MaestroContext, MaestroState, reducer(), ViewMode, SessionDispatchOptions (+19 more)

### Community 15 - "Community 15"
Cohesion: 0.11
Nodes (19): bytesToHex(), candidateTokenHashes(), errorResponse(), EXECUTOR_API_BODY_LIMITS, ExecutorRecord, getApprovalPolicy(), getExecutorTokenSecrets(), hashLegacyToken() (+11 more)

### Community 16 - "Community 16"
Cohesion: 0.12
Nodes (22): AgentPatch, applyManifest(), createBackupBranch(), createBranch(), createPR(), deleteFile(), ensureDefaultBranchSha(), ExecuteRequest (+14 more)

### Community 17 - "Community 17"
Cohesion: 0.18
Nodes (16): ReadRequest, DEFAULT_RATE_LIMIT_POLICY, enforceRateLimit(), getAuthToken(), isRateLimitCheckResult(), jsonResponse(), RATE_LIMIT_POLICIES, RateLimitCheckResult (+8 more)

### Community 18 - "Community 18"
Cohesion: 0.10
Nodes (20): estimateBroadcastCost(), formatCostRange(), isFreeModel(), OrchestraDrawer(), PERSONA_COLORS, PROVIDER_GROUPS, resolveSlotAgents(), STABILITY_DOT (+12 more)

### Community 19 - "Community 19"
Cohesion: 0.09
Nodes (17): BuildProgress, DecomposeResult, deriveSessionProgress(), ExecutorJobEventRow, ExecutorJobSnapshot, GitHubReadFileResult, isLiteralScopedFile(), JobOutputState (+9 more)

### Community 20 - "Community 20"
Cohesion: 0.12
Nodes (16): BouncerRequest, BouncerResult, BuildFile, Finding, Severity, Trigger, VALID_SEV, Intent (+8 more)

### Community 21 - "Community 21"
Cohesion: 0.09
Nodes (21): bin, maestroclaw, dependencies, dotenv, @lydell/node-pty, @supabase/supabase-js, description, devDependencies (+13 more)

### Community 22 - "Community 22"
Cohesion: 0.12
Nodes (16): useBouncerReview(), selectOnlineExecutor(), submitBuildSessionJob(), BuildRunwayCard(), createEmptyPushState(), formatAdapterLabel(), formatBackendLabel(), NormalizedBuilderAgent (+8 more)

### Community 23 - "Community 23"
Cohesion: 0.15
Nodes (14): CreateLoopParams, useIterationLoop(), AdvisorStrip(), Props, CommandItem, CommandPalette(), IterationCard(), STATUS_COLORS (+6 more)

### Community 24 - "Community 24"
Cohesion: 0.12
Nodes (15): useUnackIncidents(), CATEGORY_LABEL, FilterSeverity, SecurityPanel(), SEVERITY_COLOR, SEVERITY_DOT, CHIP_TONE, getExecutionModeLabel() (+7 more)

### Community 25 - "Community 25"
Cohesion: 0.17
Nodes (18): callModel(), decodeEscapedHtml(), DESIGN_MODE_LANES, DesignArtifact, DESIGNER_LANES, DesignerLane, DesignerRole, DesignMode (+10 more)

### Community 26 - "Community 26"
Cohesion: 0.17
Nodes (14): getModelPricing(), classifyFailure(), computeCostDelta(), modelToProviderKey(), ProviderHealthMap, registerRerouteHandler(), RerouteDecision, RerouteHandlerFn (+6 more)

### Community 27 - "Community 27"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, isolatedModules, jsx, lib, module, moduleDetection, moduleResolution (+9 more)

### Community 28 - "Community 28"
Cohesion: 0.13
Nodes (14): AgentCallMode, AgentInvokeResult, BroadcastMode, BroadcastOptions, ConciergeInvokeResult, SynthesizeInvokeResult, TriageInvokeResult, OrchestrateResult (+6 more)

### Community 29 - "Community 29"
Cohesion: 0.28
Nodes (9): usePreBuildPlan(), ArchitectCard(), BackendCard(), BuilderRosterCard(), PlanCardRenderer(), ProjectTypeCard(), RepoCard(), SpecLockCard() (+1 more)

### Community 30 - "Community 30"
Cohesion: 0.20
Nodes (14): ROLE_META, ArtifactStatus, decodeEscapedHtml(), DesignArtifact, DesignPhase(), extractHtml(), extractJsonStringField(), MODE_LABELS (+6 more)

### Community 31 - "Community 31"
Cohesion: 0.12
Nodes (16): compilerOptions, declaration, declarationMap, esModuleInterop, forceConsistentCasingInFileNames, module, moduleResolution, outDir (+8 more)

### Community 32 - "Community 32"
Cohesion: 0.23
Nodes (14): applyArtifactPayloadToBuffer(), ArtifactFileChunkBuffer, ArtifactManifestBuffer, cancelBuildSessionJob(), createArtifactManifestBuffer(), fetchExecutorJobArtifactManifest(), getArtifactManifestFromBuffer(), normalizeSessionManifest() (+6 more)

### Community 33 - "Community 33"
Cohesion: 0.18
Nodes (15): AuthenticatedRequestContext, ClassicSynthesizeRequest, DeliberationPushback, DeliberationResponseRow, DeliberationSynthesizeRequest, getDeliberationSynthesisSystemPrompt(), jsonResponse(), parseSynthesisJson() (+7 more)

### Community 34 - "Community 34"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection, moduleResolution, noEmit (+7 more)

### Community 35 - "Community 35"
Cohesion: 0.16
Nodes (7): BuildAgentCandidate, BUILDER_COUNT_OPTIONS, normBuilderValue(), scoreBuildCandidate(), LaneCard(), ROLE_OPTIONS, SuggestedLane

### Community 36 - "Community 36"
Cohesion: 0.16
Nodes (7): BuildLogDrawer(), STATUS_ICON, BouncerFinding, BuildReport, SEV_STYLE, LoadingScreen(), Toast()

### Community 37 - "Community 37"
Cohesion: 0.21
Nodes (10): Props, FolioCard(), getFolioDisplayContent(), Props, tryExtractFromJson(), unescape(), FolioItem, Agent (+2 more)

### Community 38 - "Community 38"
Cohesion: 0.21
Nodes (6): CostRollupCard(), RollupMeta, RerouteApprovalCard(), SystemEventCard(), formatUsd(), resolveReroute()

### Community 39 - "Community 39"
Cohesion: 0.22
Nodes (10): deriveOrbStatusText(), OrbState, TERMINAL_LOOP_STATUSES, EmptyStage(), EmptyStageProps, ORB_CONFIG, ORBIT_AGENTS, QUICK_CHIPS (+2 more)

### Community 40 - "Community 40"
Cohesion: 0.18
Nodes (8): AgentRow, ArchitectRequest, FreshLane, norm(), scoreAgentForLane(), SuggestedLane, VALID_LANE_ROLES, logPermissionFailure()

### Community 41 - "Community 41"
Cohesion: 0.26
Nodes (9): AuthProvider(), useAuth(), MaestroProvider(), useBuildExecution(), useProviderHealth(), AuthPage(), BuildWorkspace(), App() (+1 more)

### Community 42 - "Community 42"
Cohesion: 0.24
Nodes (11): ApplyDiffFailure, ApplyDiffInput, ApplyDiffResult, ApplyDiffSuccess, applyDiffWithCheckpoint(), commitStep(), execGit(), globMatch() (+3 more)

### Community 43 - "Community 43"
Cohesion: 0.17
Nodes (7): HealthPanel(), PROVIDER_DISPLAY, STATE_COLOR, STATE_LABEL, TrustDrawer(), TrustTab, AuditEvent

### Community 44 - "Community 44"
Cohesion: 0.18
Nodes (9): BuildAgentCandidate, BUILDER_COUNT_OPTIONS, COMPLEXITY_COLOR, normBuilderValue(), PreBuildPanel(), ProjectType, SCAFFOLD_MESSAGES, scoreBuildCandidate() (+1 more)

### Community 45 - "Community 45"
Cohesion: 0.27
Nodes (7): callHaiku(), SummarizeOutputLocal, buildStrictSummarizePrompt(), buildSummarizePrompt(), parseSummarizeOutput(), SummarizeInput, SummarizeOutput

### Community 46 - "Community 46"
Cohesion: 0.22
Nodes (10): ConciergeEventCard(), DecisionMetadata, DESIGN_MODE_LABELS, isDecisionMetadata(), isTriageMetadata(), NEXT_PHASE_LABELS, TriageMetadata, DesignMode (+2 more)

### Community 47 - "Community 47"
Cohesion: 0.27
Nodes (8): decodeBase64Utf8(), getKeyFile(), getTree(), ghApi(), IntakeRequest, IntakeSummary, KEY_FILES, TreeNode

### Community 48 - "Community 48"
Cohesion: 0.27
Nodes (8): IterationApprovalPanel(), Props, Props, IterationStepRow(), Props, STATE_ICONS, IterationLoop, IterationStep

### Community 49 - "Community 49"
Cohesion: 0.36
Nodes (7): SummarizeOptions, SUPABASE_URL, useRepoMemory(), byteCount(), formatBytes(), formatDate(), MemoryPanel()

### Community 50 - "Community 50"
Cohesion: 0.28
Nodes (7): PriorStepSummary, LoopState, buildDecisionRecord(), DecisionRecord, detectProblemType(), PROBLEM_TYPE_PATTERNS, IterationLoopRecord

### Community 51 - "Community 51"
Cohesion: 0.31
Nodes (6): deriveOrbState(), BoardroomStage(), Orb(), ORB_STYLES, OrbProps, RevealTopbar()

### Community 52 - "Community 52"
Cohesion: 0.32
Nodes (3): Batch, FlushFn, StreamThrottle

### Community 53 - "Community 53"
Cohesion: 0.29
Nodes (6): BuildCostRollup, CostEstimate, DEFAULT_PAID, MODEL_PRICING_MAP, ModelPrice, sumBuildCost()

### Community 55 - "Community 55"
Cohesion: 0.33
Nodes (3): KICKABLE_STATUSES, RUNNING_STATUSES, TONE_CLASSES

### Community 57 - "Community 57"
Cohesion: 0.40
Nodes (3): Contradiction, PATTERNS, VerificationState

### Community 58 - "Community 58"
Cohesion: 0.50
Nodes (3): buildFallbackChain(), CANONICAL_FALLBACKS, FallbackChain

## Knowledge Gaps
- **407 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+402 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **6 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useMaestro()` connect `Community 8` to `Community 5`, `Community 6`, `Community 13`, `Community 14`, `Community 18`, `Community 19`, `Community 22`, `Community 23`, `Community 24`, `Community 26`, `Community 28`, `Community 29`, `Community 30`, `Community 35`, `Community 36`, `Community 37`, `Community 39`, `Community 41`, `Community 43`, `Community 44`, `Community 46`, `Community 49`, `Community 51`, `Community 55`, `Community 57`?**
  _High betweenness centrality (0.032) - this node is a cross-community bridge._
- **Why does `requireAuthenticatedRequest()` connect `Community 17` to `Community 33`, `Community 4`, `Community 7`, `Community 40`, `Community 12`, `Community 45`, `Community 15`, `Community 16`, `Community 47`, `Community 20`, `Community 25`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **Why does `buildCorsHeaders()` connect `Community 17` to `Community 33`, `Community 4`, `Community 7`, `Community 40`, `Community 12`, `Community 45`, `Community 15`, `Community 16`, `Community 47`, `Community 20`, `Community 25`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _407 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.07330618289522399 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.09090909090909091 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.045454545454545456 - nodes in this community are weakly interconnected._