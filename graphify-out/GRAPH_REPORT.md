# Graph Report - Maestro  (2026-09-05)

## Corpus Check
- 285 files · ~227,594 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1627 nodes · 3272 edges · 86 communities (83 shown, 3 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 8 edges (avg confidence: 0.57)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `52e31743`
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
- [[_COMMUNITY_manifest.json|manifest.json]]
- [[_COMMUNITY_manifest.json|manifest.json]]
- [[_COMMUNITY_manifest.json|manifest.json]]
- [[_COMMUNITY_eliana-forsaken-cry-canonical-reader-model.ts|eliana-forsaken-cry-canonical-reader-model.ts]]
- [[_COMMUNITY_session-log.ts|session-log.ts]]
- [[_COMMUNITY_Project References|Project References]]
- [[_COMMUNITY_eliana-ux-council-study.ts|eliana-ux-council-study.ts]]
- [[_COMMUNITY_agy-cli.ts|agy-cli.ts]]
- [[_COMMUNITY_eliana-forsaken-cry-swarm-check.ts|eliana-forsaken-cry-swarm-check.ts]]
- [[_COMMUNITY_eliana-forsaken-cry-canonical-calibration.ts|eliana-forsaken-cry-canonical-calibration.ts]]
- [[_COMMUNITY_eliana-forsaken-cry-review.ts|eliana-forsaken-cry-review.ts]]
- [[_COMMUNITY_eliana-votd-pastor-scholar-review.ts|eliana-votd-pastor-scholar-review.ts]]
- [[_COMMUNITY_writeManifest|writeManifest]]
- [[_COMMUNITY_KimiCliAdapter|KimiCliAdapter]]
- [[_COMMUNITY_eliana-aliyah-brainstorm.ts|eliana-aliyah-brainstorm.ts]]
- [[_COMMUNITY_Adapter|Adapter]]
- [[_COMMUNITY_eliana-readonly-review.ts|eliana-readonly-review.ts]]
- [[_COMMUNITY_path-guard.ts|path-guard.ts]]
- [[_COMMUNITY_gemini-cli.ts|gemini-cli.ts]]
- [[_COMMUNITY_index.ts|index.ts]]
- [[_COMMUNITY_eliana-sol-editorial-decision.ts|eliana-sol-editorial-decision.ts]]
- [[_COMMUNITY_eliana-adjudicate-kimi.ts|eliana-adjudicate-kimi.ts]]
- [[_COMMUNITY_index.ts|index.ts]]
- [[_COMMUNITY_LineSplitter|LineSplitter]]

## God Nodes (most connected - your core abstractions)
1. `useMaestro()` - 99 edges
2. `useAuth()` - 34 edges
3. `MaestroState` - 31 edges
4. `supabase` - 29 edges
5. `CodexCliAdapter` - 26 edges
6. `sha256()` - 25 edges
7. `ThreadMessage` - 24 edges
8. `writeManifest()` - 23 edges
9. `requireAuthenticatedRequest()` - 22 edges
10. `ClaudeCodeAdapter` - 21 edges

## Surprising Connections (you probably didn't know these)
- `main()` --calls--> `extractDeliberationSignature()`  [INFERRED]
  packages/maestroclaw/scripts/eliana-forsaken-cry-review.ts → packages/maestroclaw/scripts/lib/eliana-personas.ts
- `main()` --calls--> `extractPersonaPreamble()`  [INFERRED]
  packages/maestroclaw/scripts/eliana-forsaken-cry-review.ts → packages/maestroclaw/scripts/lib/eliana-personas.ts
- `BoardroomStage()` --calls--> `useMaestro()`  [EXTRACTED]
  src/components/reveal/BoardroomStage.tsx → src/context/MaestroContext.tsx
- `BuildReport` --calls--> `useMaestro()`  [EXTRACTED]
  src/components/reveal/BuildReport.tsx → src/context/MaestroContext.tsx
- `Props` --references--> `Response`  [EXTRACTED]
  src/components/reveal/FolioCard.tsx → src/types/index.ts

## Import Cycles
- 1-file cycle: `packages/maestroclaw/src/config.ts -> packages/maestroclaw/src/config.ts`
- 3-file cycle: `packages/maestroclaw/src/adapters/index.ts -> packages/maestroclaw/src/adapters/pty-shell.ts -> packages/maestroclaw/src/executor.ts -> packages/maestroclaw/src/adapters/index.ts`
- 3-file cycle: `packages/maestroclaw/src/adapters/approved-shell.ts -> packages/maestroclaw/src/executor.ts -> packages/maestroclaw/src/adapters/index.ts -> packages/maestroclaw/src/adapters/approved-shell.ts`

## Communities (86 total, 3 thin omitted)

### Community 0 - "Shell Command Execution"
Cohesion: 0.13
Nodes (12): ApprovedShellAdapter, runAndCollect(), PtyShellAdapter, getIncidentService(), analyzeShellCommand(), DISALLOWED_TOKENS, isShellCommentStart(), ShellCommandAnalysis (+4 more)

### Community 1 - "Build Session Logging"
Cohesion: 0.05
Nodes (54): AgentDispatchResult, buildPushbacks(), callAnthropic(), callOpenAI(), DeliberateRequest, DeliberationPushback, dispatchDeliberation(), makeError() (+46 more)

### Community 2 - "Agent & Lane Types"
Cohesion: 0.29
Nodes (6): ComposerVariant, INTENT_CONFIG, IntentConfig, Props, routingKeys, SessionMode

### Community 3 - "Iteration Lock Management"
Cohesion: 0.14
Nodes (27): ArtifactManifestEntry, assessOutputQuality(), buildFixPassPrompt(), buildRetryPrompt(), buildSessionPrompt(), collectDeletedFiles(), collectWrittenFiles(), createCheckpoint() (+19 more)

### Community 4 - "Build Plan Generation"
Cohesion: 0.05
Nodes (42): AgentDefault, AgentRole, AgentSkill, ApprovalStatus, ArchitectLane, ArchitectLaneSlice, ArchitectPlan, BouncerFinding (+34 more)

### Community 5 - "Completeness & Framework Detection"
Cohesion: 0.05
Nodes (36): Props, FolioCard(), getFolioDisplayContent(), Props, tryExtractFromJson(), unescape(), AgentInvokeResult, BACKEND_DIRS (+28 more)

### Community 6 - "Supabase Backend Integration"
Cohesion: 0.09
Nodes (30): AtelierSidebar(), BuildLogDrawer(), STATUS_ICON, BuildWorkspace(), ClawMode(), CommandItem, CommandPalette(), CommandResultCard() (+22 more)

### Community 7 - "Agent Skills & Artifacts"
Cohesion: 0.07
Nodes (46): AdvisorStrip(), Props, FolioItem, Contradiction, PATTERNS, VerificationState, Action, DrawerTarget (+38 more)

### Community 8 - "Orchestration & Deliberation"
Cohesion: 0.17
Nodes (22): getAdapter(), matchesAnyScope(), buildQueryPrompt(), callAgent(), completeLoopWithRecord(), getCurrentSha(), ITERATION_ADAPTER_FALLBACK_CHAIN, KNOWN_ADAPTERS (+14 more)

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
Cohesion: 0.12
Nodes (16): ArchitectCard(), BackendCard(), BuilderRosterCard(), HEALTH_DOT, LaneCard(), ROLE_OPTIONS, PlanCardRenderer(), ProjectTypeCard() (+8 more)

### Community 13 - "Thread & Directory Utilities"
Cohesion: 0.05
Nodes (38): acquireLocks(), api(), applyLoopControl(), claimJob(), claimLoop(), completeJob(), completeLoop(), ExecutorCapabilities (+30 more)

### Community 14 - "Global State Management"
Cohesion: 0.12
Nodes (22): AgentPatch, applyManifest(), createBackupBranch(), createBranch(), createPR(), deleteFile(), ensureDefaultBranchSha(), ExecuteRequest (+14 more)

### Community 15 - "Token & Executor Management"
Cohesion: 0.08
Nodes (23): BuildProgress, DecomposeResult, deriveSessionProgress(), ExecutorJobEventRow, ExecutorJobSnapshot, GitHubReadFileResult, isLiteralScopedFile(), JobOutputState (+15 more)

### Community 16 - "Git & File Operations"
Cohesion: 0.09
Nodes (16): BroadcastProgressState, BUILD_BROADCAST_MESSAGES, BuildStage, getBroadcastProgressState(), hasExecutableManifest(), hasWriteManifest(), laneMatchesResponse(), LaneRow (+8 more)

### Community 17 - "API Auth & Rate Limiting"
Cohesion: 0.18
Nodes (16): ReadRequest, DEFAULT_RATE_LIMIT_POLICY, enforceRateLimit(), getAuthToken(), isRateLimitCheckResult(), jsonResponse(), RATE_LIMIT_POLICIES, RateLimitCheckResult (+8 more)

### Community 18 - "Cost Estimation & Display"
Cohesion: 0.16
Nodes (14): bytesToHex(), candidateTokenHashes(), errorResponse(), EXECUTOR_API_BODY_LIMITS, ExecutorRecord, getExecutorTokenSecrets(), hashLegacyToken(), hashToken() (+6 more)

### Community 19 - "Build Execution Tracking"
Cohesion: 0.24
Nodes (9): ConciergeEventCard(), DecisionMetadata, DESIGN_MODE_LABELS, isDecisionMetadata(), isTriageMetadata(), NEXT_PHASE_LABELS, TriageMetadata, DesignMode (+1 more)

### Community 20 - "Security Finding Triage"
Cohesion: 0.08
Nodes (23): bin, maestroclaw, dependencies, cross-spawn, dotenv, @lydell/node-pty, @supabase/supabase-js, description (+15 more)

### Community 21 - "CLI Package Configuration"
Cohesion: 0.12
Nodes (14): SEVERITY_META, BuildRunwayCard(), createEmptyPushState(), formatAdapterLabel(), formatBackendLabel(), NormalizedBuilderAgent, NormalizedBuildPlan, PushResultState (+6 more)

### Community 22 - "Build Submission & Execution"
Cohesion: 0.17
Nodes (7): Props, KICKABLE_STATUSES, RUNNING_STATUSES, TONE_CLASSES, SystemEventCard(), Thread, ThreadMessage

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
Nodes (17): resolveTaskBackend(), applyArtifactPayloadToBuffer(), ArtifactFileChunkBuffer, ArtifactManifestBuffer, cancelBuildSessionJob(), createArtifactManifestBuffer(), fetchExecutorJobArtifactManifest(), getArtifactManifestFromBuffer() (+9 more)

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
Cohesion: 0.07
Nodes (26): gitDiff(), log(), main(), OUT_DIR, log(), main(), OUT_DIR, log() (+18 more)

### Community 34 - "Node TypeScript Config"
Cohesion: 0.12
Nodes (15): compilerOptions, allowImportingTsExtensions, isolatedModules, lib, module, moduleDetection, moduleResolution, noEmit (+7 more)

### Community 35 - "Builder Lane Selection"
Cohesion: 0.10
Nodes (14): OUT_DIR, OUT_DIR, PRIOR_OUTPUT_PATH, log(), main(), OUT, OUT_RAW, PAYLOAD (+6 more)

### Community 36 - "Workspace UI Components"
Cohesion: 0.17
Nodes (12): cleanForRetry(), ApplyDiffFailure, ApplyDiffInput, ApplyDiffResult, ApplyDiffSuccess, applyDiffWithCheckpoint(), commitStep(), execGit() (+4 more)

### Community 37 - "Advisor Strip UI"
Cohesion: 0.11
Nodes (25): App(), AppInner(), ExecutorSection(), byteCount(), formatBytes(), formatDate(), MemoryPanel(), RepoSection() (+17 more)

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
Cohesion: 0.22
Nodes (11): classifyFailure(), modelToProviderKey(), ProviderHealthMap, registerRerouteHandler(), RerouteDecision, RerouteHandlerFn, selectModel(), updateHealth() (+3 more)

### Community 42 - "Diff Application & Git"
Cohesion: 0.19
Nodes (19): main(), OUT_DIR, main(), AUDIENCE_CONTEXT, buildPrompt(), diffStatusLines(), FLAGGED_CARDS, gitDiffStat() (+11 more)

### Community 43 - "Health & Audit Panel"
Cohesion: 0.27
Nodes (7): callHaiku(), SummarizeOutputLocal, buildStrictSummarizePrompt(), buildSummarizePrompt(), parseSummarizeOutput(), SummarizeInput, SummarizeOutput

### Community 44 - "Pre-Build Intake Panel"
Cohesion: 0.12
Nodes (15): CATEGORY_LABEL, FilterSeverity, SecurityPanel(), SEVERITY_COLOR, SEVERITY_DOT, CHIP_TONE, getExecutionModeLabel(), MODE_OPTIONS (+7 more)

### Community 45 - "Repository Summarization"
Cohesion: 0.26
Nodes (9): Intent, Route, TriageRequest, TriageResult, jsonErrorResponse(), readBodyText(), readJsonBody(), ReadJsonBodyOptions (+1 more)

### Community 46 - "Concierge Event Display"
Cohesion: 0.27
Nodes (8): decodeBase64Utf8(), getKeyFile(), getTree(), ghApi(), IntakeRequest, IntakeSummary, KEY_FILES, TreeNode

### Community 47 - "GitHub Intake & Tree"
Cohesion: 0.32
Nodes (3): Batch, FlushFn, StreamThrottle

### Community 48 - "Iteration Approval UI"
Cohesion: 0.16
Nodes (15): CostRollupCard(), RollupMeta, RerouteApprovalCard(), BuildCostRollup, CostEstimate, DEFAULT_PAID, estimateBroadcastCost(), formatUsd() (+7 more)

### Community 49 - "Repository Memory Panel"
Cohesion: 0.17
Nodes (7): HealthPanel(), PROVIDER_DISPLAY, STATE_COLOR, STATE_LABEL, TrustDrawer(), TrustTab, ProviderHealthState

### Community 50 - "Decision Record Tracking"
Cohesion: 0.24
Nodes (5): Props, ExecutionModal(), unionScopePaths(), ApprovalFileEntry, ApprovalRequest

### Community 51 - "Boardroom Stage UI"
Cohesion: 0.14
Nodes (14): JOB_STATUS_COLORS, STATUS_COLORS, GHRepo, GitHubAuthStatus, GitHubAuthUrlResponse, GitHubCreateRepoResponse, GitHubExchangeResponse, GitHubReposResponse (+6 more)

### Community 52 - "cost.ts"
Cohesion: 0.18
Nodes (11): buildCliArguments(), CliInvocation, resolveCliInvocation(), resolveNodeEntryFromCmdShim(), resolvePowerShellScript(), CopilotCliAdapter, KIMI_ENV_OVERRIDES, buildChildEnv() (+3 more)

### Community 54 - "MemoryPanel.tsx"
Cohesion: 0.11
Nodes (18): content, description, files, known_gaps, notes, prompt, file, sha256 (+10 more)

### Community 55 - "providerFallbacks.ts"
Cohesion: 0.11
Nodes (18): content, description, files, known_gaps, notes, prompt, file, sha256 (+10 more)

### Community 56 - "BuildReport.tsx"
Cohesion: 0.33
Nodes (3): BouncerFinding, BuildReport, SEV_STYLE

### Community 57 - "manifest.json"
Cohesion: 0.11
Nodes (18): content, description, files, known_gaps, notes, prompt, file, sha256 (+10 more)

### Community 58 - "manifest.json"
Cohesion: 0.11
Nodes (18): content, description, files, known_gaps, notes, prompt, file, sha256 (+10 more)

### Community 59 - "manifest.json"
Cohesion: 0.11
Nodes (18): content, description, files, known_gaps, notes, prompt, file, sha256 (+10 more)

### Community 60 - "eliana-forsaken-cry-canonical-reader-model.ts"
Cohesion: 0.20
Nodes (17): diffStatusLines(), gitDiffStat(), gitStatusPorcelain(), KNOWN_MAESTROCLAW_INSTRUMENTATION_FILES, log(), main(), diffStatusLines(), gitDiffStat() (+9 more)

### Community 61 - "session-log.ts"
Cohesion: 0.16
Nodes (13): AGENT_01_SESSION_INSTRUCTIONS, appendSessionLogEvent(), BuildSessionLog, extractBalancedObject(), extractBuildSessionLog(), mergeBuildSessionLogs(), normalizeBuildSessionLog(), readSessionLog() (+5 more)

### Community 68 - "eliana-ux-council-study.ts"
Cohesion: 0.18
Nodes (15): BLIND_REMOVE, buildPrompt(), extractFindings(), git(), HASHED_FILES, INSTRUMENTATION, log(), makeClone() (+7 more)

### Community 69 - "agy-cli.ts"
Cohesion: 0.19
Nodes (9): log(), main(), OUT_DIR, REPO, AgyCliAdapter, AgyJsonResult, meetsMinVersion(), MIN_VERSION (+1 more)

### Community 70 - "eliana-forsaken-cry-swarm-check.ts"
Cohesion: 0.24
Nodes (13): AdapterRunResult, buildFablePrompt(), buildSolPrompt(), diffStatusLines(), gitDiffStat(), gitStatusPorcelain(), KNOWN_MAESTROCLAW_INSTRUMENTATION_FILES, log() (+5 more)

### Community 71 - "eliana-forsaken-cry-canonical-calibration.ts"
Cohesion: 0.31
Nodes (11): diffStatusLines(), gitDiffStat(), gitStatusPorcelain(), KNOWN_MAESTROCLAW_INSTRUMENTATION_FILES, log(), main(), RUN_DIR, buildTaskModePrompt() (+3 more)

### Community 72 - "eliana-forsaken-cry-review.ts"
Cohesion: 0.27
Nodes (12): AdapterRunResult, buildIndependentReviewPrompt(), buildPersonaPrompt(), diffStatusLines(), gitDiffStat(), gitStatusPorcelain(), KNOWN_MAESTROCLAW_INSTRUMENTATION_FILES, log() (+4 more)

### Community 73 - "eliana-votd-pastor-scholar-review.ts"
Cohesion: 0.27
Nodes (12): buildPrompt(), diffStatusLines(), gitDiffStat(), gitStatusPorcelain(), KNOWN_INSTRUMENTATION_FILES, log(), main(), OUT_DIR (+4 more)

### Community 74 - "writeManifest"
Cohesion: 0.27
Nodes (8): manifest, manifest, manifestPath, manifest, EnvelopeManifest, renderManifestMarkdown(), SourceRepoInfo, writeManifest()

### Community 75 - "KimiCliAdapter"
Cohesion: 0.20
Nodes (4): OUT, STAGED, PROMPT, KimiCliAdapter

### Community 76 - "eliana-aliyah-brainstorm.ts"
Cohesion: 0.31
Nodes (8): log(), main(), buildPersonaBrainstormPrompt(), log(), main(), PERSONAS_FILE, runAndSave(), ALIYAH_STUDY_BIBLE_BRIEF

### Community 77 - "Adapter"
Cohesion: 0.25
Nodes (4): ShellStubAdapter, Adapter, AdapterResult, OnLineFn

### Community 78 - "eliana-readonly-review.ts"
Cohesion: 0.38
Nodes (9): buildReviewPrompt(), diffStatusLines(), gitDiffStat(), gitStatusPorcelain(), KNOWN_MAESTROCLAW_INSTRUMENTATION_FILES, log(), main(), runAdapterReview() (+1 more)

### Community 79 - "path-guard.ts"
Cohesion: 0.42
Nodes (5): isPathEscaping(), PathEscapeError, resolveContained(), resolveContainedRealpath(), tryResolveContainedRealpath()

### Community 80 - "gemini-cli.ts"
Cohesion: 0.39
Nodes (3): GeminiCliAdapter, isRateLimited(), RATE_LIMIT_SIGNALS

### Community 81 - "index.ts"
Cohesion: 0.29
Nodes (3): SENSITIVE_PATH_PATTERNS, hasUnsafeSyntax(), TRUSTED_SHELL_COMMANDS

### Community 82 - "eliana-sol-editorial-decision.ts"
Cohesion: 0.38
Nodes (6): extractReviewOutput(), log(), main(), OUT_DECISION_LOG, REVISED_OUT_PATH, TARGET_PATH

### Community 83 - "eliana-adjudicate-kimi.ts"
Cohesion: 0.40
Nodes (5): log(), main(), OUT, OUT_RAW, PAYLOAD

### Community 84 - "index.ts"
Cohesion: 0.53
Nodes (4): checkAdapters(), registry, setIncidentService(), main()

## Knowledge Gaps
- **573 isolated node(s):** `run_id`, `timestamp_utc`, `task_description`, `read_only`, `path` (+568 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useMaestro()` connect `Supabase Backend Integration` to `Agent & Lane Types`, `Completeness & Framework Detection`, `Agent Skills & Artifacts`, `LLM Dispatch & Deliberation`, `Token & Executor Management`, `Git & File Operations`, `Build Execution Tracking`, `CLI Package Configuration`, `Build Submission & Execution`, `Iteration Loop UI`, `Security Incident Panel`, `Plan Preview Cards`, `Advisor Strip UI`, `Status & Report Cards`, `Orb Status Visualization`, `providerHealth.ts`, `Pre-Build Intake Panel`, `Repository Memory Panel`, `Decision Record Tracking`, `Boardroom Stage UI`, `BuildReport.tsx`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `CodexCliAdapter` connect `Synthesis & Response Rendering` to `eliana-ux-council-study.ts`, `agy-cli.ts`, `eliana-forsaken-cry-swarm-check.ts`, `eliana-forsaken-cry-canonical-calibration.ts`, `eliana-forsaken-cry-review.ts`, `eliana-votd-pastor-scholar-review.ts`, `Diff Application & Git`, `KimiCliAdapter`, `eliana-readonly-review.ts`, `eliana-sol-editorial-decision.ts`, `cost.ts`, `index.ts`, `eliana-forsaken-cry-canonical-reader-model.ts`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **Why does `ClaudeCodeAdapter` connect `Builder Lane Selection` to `eliana-ux-council-study.ts`, `eliana-forsaken-cry-swarm-check.ts`, `eliana-forsaken-cry-canonical-calibration.ts`, `eliana-forsaken-cry-review.ts`, `eliana-votd-pastor-scholar-review.ts`, `Diff Application & Git`, `eliana-aliyah-brainstorm.ts`, `eliana-readonly-review.ts`, `index.ts`, `eliana-forsaken-cry-canonical-reader-model.ts`?**
  _High betweenness centrality (0.006) - this node is a cross-community bridge._
- **What connects `run_id`, `timestamp_utc`, `task_description` to the rest of the system?**
  _573 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Shell Command Execution` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._
- **Should `Build Session Logging` be split into smaller, more focused modules?**
  _Cohesion score 0.05314685314685315 - nodes in this community are weakly interconnected._
- **Should `Iteration Lock Management` be split into smaller, more focused modules?**
  _Cohesion score 0.13793103448275862 - nodes in this community are weakly interconnected._