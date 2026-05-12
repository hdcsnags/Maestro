# SANDBOX-01 — Claw Sandbox Sequence Spec

**Status:** Ready for review (Phase 1 implementable now; Phases 2-3 staged for future)
**Authored:** 2026-05-04 by Opus 4.7
**Implementing agent:** Opus 4.7 (architecture) + Sonnet 4.6 (implementation)
**Parent plan:** Promoted from "Remaining Non-Audited Risks" to a real spec. The user explicitly said: *"later on I can sandbox the claw's environment more, maybe even spin up a docker container for it to live in."*
**Dependencies:** SEC-01 (✅ kernel pipeline analysis — closes injection vector). SEC-02 (✅ HMAC trust model). SEC-04 (✅ incident reporting — sandbox violations report as incidents).

---

## Why This Exists

Today, MaestroClaw runs as the user. Full PATH access. Full home-directory access. Full network. The kernel allowlist (SEC-01) blocks unknown binaries from being invoked, but ANY binary on the allowlist runs with the user's full permission set. A clever prompt that gets `git status` past the kernel still gets `git status` running with read access to your `.ssh/`, your `.aws/`, your environment variables, your network. The kernel is a binary gate, not a permission gate.

This is acceptable when the user is the only operator and the kernel is well-tuned. It becomes inadequate when:
- The user wants to share their executor with team members.
- The Conductor wants to run untrusted-user code (CTF challenges, training-lab projects).
- A future malicious prompt finds a creative path past the kernel allowlist.
- Maestro evolves to host shared executor pools.

**Defense in depth means: even if the kernel is bypassed, the blast radius is bounded.** Today, blast radius = entire user account. We can do better.

---

## The Three-Phase Sequence

Each phase ships independently. Each provides meaningful security before the next layers on. No "all or nothing."

### Phase 1 — Process-Level Isolation (v1, ships now)
- Per-job temp workspace under the executor's controlled directory
- Restricted PATH (only allowlisted binary directories)
- Process resource limits (CPU/memory/file-descriptors via OS facilities)
- Workspace-rooted CWD (already partly there; harden it)
- Environment variable scrubbing (drop user secrets from child env)
- Spawned subprocess runs as a less-privileged effective user where the OS allows

**Cost to ship:** ~3-5 days. **Hardware requirements:** none. **Compatibility impact:** minor — strips some env vars users may have implicitly relied on.

### Phase 2 — Container-Per-Job (v1.5, future)
- Each job runs in an ephemeral Docker container
- Container has only the necessary tools (git, node, claude_code CLI, etc.)
- Network restricted (default: localhost-only, opt-in for outbound)
- Volume mount: only the per-job workspace (bound-mounted)
- Container destroyed after job completes
- Capability advertising (MULTIEXEC-01) declares `docker_available: true`

**Cost to ship:** ~2-3 weeks. **Hardware requirements:** Docker on the executor host. **Compatibility impact:** higher — slower job startup (~1-3s container spin), needs base image curation.

### Phase 3 — Persistent Dev Container (v2, far future)
- User-bound dev container that persists across jobs in a session
- File system state preserves between iteration steps
- Network rules per-user (firewall config)
- Could be local Docker, remote (Maestro hosts), or a remote dev-pod (Codespaces-like)
- Multi-user shared executors become viable (each user gets their own container)

**Cost to ship:** ~6-8 weeks plus infrastructure decisions. **Hardware requirements:** Docker + persistent volumes. **Compatibility impact:** rebuilds entire job model.

This spec defines Phase 1 in detail and sketches Phase 2/3 enough to make Phase 1 forward-compatible.

---

## Phase 1 — Process-Level Isolation

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ MaestroClaw boot:                                            │
│   - Compute trusted PATH (intersection of system PATH         │
│     and allowlist) → restrictedPath                          │
│   - Detect available trusted binaries → publish in caps       │
│   - Determine workspace root: <claw_root>/workspaces/         │
│                                                                │
│ Per job claim:                                                │
│   - Create per-job workspace dir: <root>/<job_id>/            │
│   - Build restricted env (drop secrets, set restrictedPath)   │
│   - Set CWD = job workspace                                   │
│   - Apply OS resource limits (rlimit)                         │
│   - Spawn adapter with the restricted env + CWD               │
│   - On adapter exit: cleanup workspace (configurable preserve)│
└─────────────────────────────────────────────────────────────┘
```

### File-Level Changes

#### New: `packages/maestroclaw/src/sandbox/profile.ts`

```ts
import { randomBytes } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';

export interface SandboxProfile {
  job_id: string;
  workspace_dir: string;          // absolute path, isolated per-job
  restricted_path: string;        // PATH env var value
  allowed_env: Record<string, string>;  // scrubbed env to pass to child process
  resource_limits: ResourceLimits;
}

export interface ResourceLimits {
  max_cpu_seconds?: number;       // RLIMIT_CPU equivalent
  max_memory_mb?: number;         // RLIMIT_AS equivalent
  max_open_files?: number;        // RLIMIT_NOFILE
  max_process_count?: number;     // RLIMIT_NPROC (where supported)
  max_file_size_mb?: number;      // RLIMIT_FSIZE
}

const DEFAULT_LIMITS: ResourceLimits = {
  max_cpu_seconds: 600,           // 10 min
  max_memory_mb: 2048,            // 2 GB
  max_open_files: 256,
  max_process_count: 64,
  max_file_size_mb: 100,          // single-file write cap
};

// Env vars that must NEVER be passed to a child job (potential secret leakage)
const ENV_DENYLIST = [
  'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SESSION_TOKEN',
  'GITHUB_TOKEN', 'GH_TOKEN',
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_API_KEY',
  'OPENROUTER_API_KEY', 'KIMI_API_KEY',
  'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ACCESS_TOKEN',
  'NPM_TOKEN', 'YARN_NPM_TOKEN', 'PYPI_TOKEN',
  'STRIPE_SECRET_KEY', 'TWILIO_AUTH_TOKEN',
  // ... any *_TOKEN, *_SECRET, *_KEY pattern via regex below
];

const ENV_DENY_REGEX = /(_TOKEN|_SECRET|_KEY|_PASSWORD|_PRIVATE)$/i;

// Env vars that ARE necessary (allowlist a small set rather than denylist all)
const ENV_ALLOWLIST = [
  'PATH',           // overridden with restricted_path
  'HOME',           // many tools need this; we override to job workspace
  'USER',           // tools may read this for naming/logging
  'LANG', 'LC_ALL', // locale
  'TZ',             // timezone
  'TERM',           // terminal type (relevant for PTY)
  // Tool-specific (extend as needed):
  'NODE_OPTIONS', 'NPM_CONFIG_PREFIX',
];

export interface ProfileOptions {
  job_id: string;
  workspace_root: string;          // <claw_root>/workspaces
  trusted_binaries: string[];      // from kernel allowlist
  preserve_workspace: boolean;     // for debugging; default false on success, true on failure
  resource_limits?: Partial<ResourceLimits>;
}

export function createSandboxProfile(opts: ProfileOptions): SandboxProfile {
  // Per-job dir with random suffix to avoid collisions across job restarts
  const dirName = `${opts.job_id}-${randomBytes(4).toString('hex')}`;
  const workspaceDir = join(opts.workspace_root, dirName);
  mkdirSync(workspaceDir, { recursive: true, mode: 0o755 });

  // Build restricted PATH from binary directories that contain only trusted binaries
  const restrictedPath = computeRestrictedPath(opts.trusted_binaries);

  // Build scrubbed env
  const allowedEnv: Record<string, string> = {
    PATH: restrictedPath,
    HOME: workspaceDir,           // sandbox HOME to job workspace
    USER: process.env.USER ?? 'maestroclaw',
    LANG: process.env.LANG ?? 'en_US.UTF-8',
    TZ: process.env.TZ ?? 'UTC',
    TERM: 'xterm-256color',
  };
  for (const key of ENV_ALLOWLIST) {
    if (key === 'PATH' || key === 'HOME' || key === 'USER') continue; // already set
    if (process.env[key]) allowedEnv[key] = process.env[key]!;
  }

  return {
    job_id: opts.job_id,
    workspace_dir: workspaceDir,
    restricted_path: restrictedPath,
    allowed_env: allowedEnv,
    resource_limits: { ...DEFAULT_LIMITS, ...(opts.resource_limits ?? {}) },
  };
}

export function teardownProfile(profile: SandboxProfile, jobSucceeded: boolean, preserveOnFailure: boolean) {
  // Keep workspace on failure if configured (for debugging)
  if (!jobSucceeded && preserveOnFailure) return;
  try {
    rmSync(profile.workspace_dir, { recursive: true, force: true });
  } catch (err) {
    // Don't fail the job because of cleanup failure; log and move on
    console.warn(`[sandbox] failed to clean ${profile.workspace_dir}:`, err);
  }
}

function computeRestrictedPath(trustedBinaries: string[]): string {
  // For each trusted binary, find its location via `which` (or per-platform equivalent),
  // collect unique directories, return as PATH-style string.
  // Implementation: spawnSync(which, ...) for each binary, dedupe dirs.
  // Result on Windows: "C:\Program Files\Git\bin;C:\Program Files\nodejs;..."
  // Result on Linux/Mac: "/usr/bin:/usr/local/bin"
  const dirs = new Set<string>();
  for (const bin of trustedBinaries) {
    const dir = locateBinary(bin);
    if (dir) dirs.add(dir);
  }
  const separator = process.platform === 'win32' ? ';' : ':';
  return [...dirs].join(separator);
}

function locateBinary(binary: string): string | null {
  // Implementation detail — use `where` on Windows, `which` elsewhere.
  // Return the directory containing the binary, or null if not found.
  // ...
}
```

#### Modified: `packages/maestroclaw/src/adapters/types.ts`

The adapter `run()` signature gains an optional sandbox profile parameter:

```ts
export interface AdapterRunContext {
  workspace_dir: string;
  restricted_env: Record<string, string>;
  resource_limits: ResourceLimits;
  job_id: string;
}

export interface Adapter {
  name: string;
  check(): Promise<boolean>;
  run(prompt: string, ctx: AdapterRunContext, timeoutMs: number): Promise<AdapterResult>;
}
```

This is a breaking change to the adapter signature. Migrate each adapter to accept the new context.

#### Modified: each adapter (`approved-shell.ts`, `pty-shell.ts`, `claude-code.ts`, etc.)

Each adapter that spawns a subprocess uses `ctx.restricted_env` and `ctx.workspace_dir`:

```ts
// approved-shell.ts (post-refactor)
async run(prompt: string, ctx: AdapterRunContext, timeoutMs: number): Promise<AdapterResult> {
  const command = prompt.trim();
  if (!command) return { success: false, output: "", error: "Empty command" };

  // Kernel analysis (existing)
  const analysis = analyzeShellCommand(command);
  if (!analysis.ok) { /* report incident, return failure */ }
  for (const segment of analysis.segments) { /* binary check; report incident */ }

  // Spawn with sandbox env + workspace
  return new Promise((resolve) => {
    const child = exec(command, {
      cwd: ctx.workspace_dir,                  // CWD = job workspace
      timeout: timeoutMs,
      maxBuffer: 1024 * 1024,
      env: ctx.restricted_env,                  // scrubbed env, NOT process.env
    }, (error, stdout, stderr) => { /* ... */ });

    // Apply OS resource limits where available
    applyResourceLimits(child, ctx.resource_limits);
  });
}
```

#### New: `packages/maestroclaw/src/sandbox/limits.ts`

OS-specific resource limit application:

```ts
import { ChildProcess } from 'node:child_process';
import type { ResourceLimits } from './profile.js';

export function applyResourceLimits(child: ChildProcess, limits: ResourceLimits): void {
  // POSIX: setrlimit via process.resourceUsage / process.cpuUsage tracking + child_process options
  //   Node child_process options for `spawn` accept `windowsHide`, `detached`, etc., but NOT setrlimit directly.
  //   Use `prlimit` on Linux, `ulimit` wrapper script, or wrap with `nice` / `cpulimit` / external tooling.
  //
  // For v1: implement what's portable and easy:
  //   - Timeout: already used (timeoutMs in exec)
  //   - Output buffer cap: maxBuffer (already used)
  //   - File-size limit: monitor workspace dir size during run; kill if exceeded (post-hoc but cheap)
  //   - Memory limit: best-effort via container/cgroup (Phase 2); v1 logs warnings if exceeded
  //   - Open files: best-effort; rely on OS defaults
  //
  // Document limitations clearly. Phase 2 (Docker) gets full cgroup-based limits.

  if (limits.max_file_size_mb) {
    monitorWorkspaceSize(child, limits.max_file_size_mb);
  }
}

function monitorWorkspaceSize(child: ChildProcess, capMB: number) {
  // Periodic du equivalent on the workspace; kill child if exceeded.
  // Acceptable polling: every 5s.
}
```

#### Modified: `packages/maestroclaw/src/executor.ts`

The job execution flow gets sandbox profile creation and teardown:

```ts
// In executeJob() or the per-job wrapper:
async function executeJob(config, claimedJob) {
  const profile = createSandboxProfile({
    job_id: claimedJob.id,
    workspace_root: config.workspaceRoot,
    trusted_binaries: TRUSTED_BINARIES,
    preserve_workspace: config.keepSucceededWorkspaces,
  });

  let succeeded = false;
  try {
    const adapter = getAdapter(claimedJob.adapter);
    const ctx: AdapterRunContext = {
      workspace_dir: profile.workspace_dir,
      restricted_env: profile.allowed_env,
      resource_limits: profile.resource_limits,
      job_id: claimedJob.id,
    };
    const result = await adapter.run(claimedJob.prompt, ctx, claimedJob.timeout_seconds * 1000);
    // ... existing post-processing
    succeeded = result.success;
  } finally {
    teardownProfile(profile, succeeded, !succeeded /* preserve on failure */);
  }
}
```

### Capability Declaration

Update Claw heartbeat to advertise sandbox capabilities (MULTIEXEC-01-compatible):

```ts
const capabilities: ExecutorCapabilities = {
  // ... existing fields ...
  sandbox: {
    phase: 1,                                  // 1, 2, or 3
    process_isolation: true,                   // Phase 1 supported
    container_isolation: false,                // Phase 2 — supported once shipped
    persistent_container: false,               // Phase 3 — supported once shipped
    env_scrubbed: true,                        // env denylist active
    resource_limits: ['timeout', 'output_buffer', 'workspace_size'],
  },
};
```

When Phase 2 ships, executors with Docker advertise `container_isolation: true`. Jobs can require it via `required_capabilities.sandbox.container_isolation: true`.

---

## Reporting Sandbox Violations as Incidents

Phase 1 sandbox violations:
- Workspace size exceeded → kill job, report incident (severity: medium, category: scope_violation)
- Workspace path escape (already enforced by `resolveSafeArtifactPath`) → already reports
- Env var leak detected (job tried to access denied env) → not directly observable; rely on env scrubbing as prevention
- Resource limit hit → kill job, report incident (severity: low, category: system_error)

These integrate cleanly with SEC-04's IncidentService.

---

## Phase 1 Acceptance Criteria

1. **Per-job workspace.** Run two execute jobs in parallel. Each writes to its own dir under `<claw_root>/workspaces/<job_id>-<rand>/`. Neither sees the other's files.
2. **Env scrubbing.** Set `OPENAI_API_KEY=verysecret` in the Claw process env. Submit a job that runs `env` (assuming it's a temporarily-allowlisted binary for the test) — confirm the output does NOT contain `OPENAI_API_KEY`.
3. **Restricted PATH.** Job tries to invoke a known-installed-but-not-allowlisted binary (e.g., `curl` if it's not allowlisted). Should fail with "command not found" — even though `curl` is on the user's PATH.
4. **HOME redirect.** Job runs `echo $HOME` (or equivalent on Windows). Output is the per-job workspace path, not the user's home directory.
5. **Workspace cleanup on success.** Successful job → workspace dir removed after job completes.
6. **Workspace preserved on failure.** Failing job → workspace dir kept (configurable). Inspect contents for debugging.
7. **Workspace size limit.** Job writes a 200 MB file (above the 100 MB cap). Job is killed; incident logged with severity medium.
8. **Workspace path escape blocked.** Diff/file-write that targets `../../../etc/passwd` rejected by existing path resolution; incident logged.
9. **No regression on existing flows.** Run a normal `git status`, full Claude Code build session, PTY interactive command. All work as before.
10. **Capability advertising correct.** `executors.capabilities.sandbox.phase = 1` after the upgrade. Heartbeat shows sandbox object.

---

## Phase 1 Verification (Live Tests)

1. **Two-job parallel write:** submit two `mkdir test_dir && echo hello > test_dir/file.txt` jobs simultaneously. Inspect each job's workspace post-completion (in failure-preserve mode for testing). Each has its own `test_dir/file.txt`. No cross-contamination.
2. **Env leak test:** export `FAKE_SECRET_KEY=leakthis` in the Claw process. Submit `echo $FAKE_SECRET_KEY` (or temporarily allowlist `env` for the test). Output should NOT contain `leakthis`.
3. **Restricted PATH test:** submit a command that calls a not-allowlisted-but-installed binary. Should fail with "command not found".
4. **Workspace size test:** submit a build that generates 200+ MB of artifacts. Confirm kill + incident.
5. **HOME redirect test:** submit `pwd` and `echo $HOME` separately. `$HOME` should equal the workspace dir.
6. **Existing-flow regression:** run a full multi-file build via Claude Code adapter. Confirm artifacts written, GitHub commit succeeds, no behavior change.

---

## Phase 1 Decisions Made

### Q: Why allowlist env vars instead of just denylisting?
**A:** Allowlist is fail-closed. Denylist is fail-open — every new secret pattern someone invents needs to be added. With allowlist, we explicitly grant only the small set of env vars tools genuinely need. Trade-off: some user-set env vars won't pass through. Documented limitation; users add to allowlist if needed (config option).

### Q: Why redirect HOME to job workspace?
**A:** Many tools (npm, git, claude_code) read HOME for config files (`.npmrc`, `.gitconfig`, `.claude.json`). If HOME is the user's real home, those configs leak credentials and influence behavior unpredictably. Redirecting HOME means tools see a clean per-job home with no preset config. Side effect: tools that NEED user config (e.g., authenticated `gh` calls) won't work. Trade-off accepted; we can selectively whitelist config files into the workspace if needed.

### Q: Why `restricted_path` only allowlisted binary directories instead of full system PATH?
**A:** Defense in depth. Even though kernel allowlist (SEC-01) restricts which binaries can be invoked through the kernel-aware adapters, child processes spawned by those binaries can in turn invoke arbitrary other binaries on PATH. Restricted PATH narrows what those grandchildren can do. Real example: Claude Code might run `npm install`, which invokes `node-gyp`, which invokes `python`, which invokes... — each step sees a smaller PATH.

### Q: Why per-job workspace instead of per-session?
**A:** Two reasons:
- **Isolation between jobs:** parallel job execution shouldn't see each other's intermediate files.
- **Easy cleanup:** workspace destroyed = no garbage to track.

For per-session persistence (PRO-02 iteration loops), the loop itself manages a single workspace across its steps; this is implemented as a session-scoped workspace at the loop level, NOT job level.

### Q: Resource limits — why not enforce hard memory/CPU caps in Phase 1?
**A:** Honest answer: Node `child_process.spawn` doesn't directly support `setrlimit` calls; doing it portably across Linux/Mac/Windows is non-trivial. Workarounds (wrapper scripts, `nice`, `cpulimit`, `prlimit`) are platform-specific. Workspace size cap and timeout (already there) cover the bulk of resource exhaustion. Memory and CPU caps come "for free" in Phase 2 (Docker cgroups). Don't over-engineer Phase 1.

### Q: What about the Claw worker's own memory? Doesn't it grow with active jobs?
**A:** Yes; existing `max_concurrent_jobs` is the cap. Out of scope for sandbox sequence — that's an executor-config concern.

### Q: Phase 1 changes adapter signatures (breaking). Migration path?
**A:** All adapters in-tree; refactor in one PR. No external adapter SDK to consider. Internal breaking change is acceptable.

### Q: Workspace dir naming — why job_id + random suffix?
**A:** `job_id` alone could collide if a job is retried after the original workspace cleanup didn't quite finish. Random suffix prevents collision. `job_id` prefix makes ops/debugging easy ("which workspace belongs to job X").

### Q: Do tests run in the sandbox?
**A:** Yes for any test invocation through the build pipeline (build_task running `npm test`, iteration loop verification commands). The test invocation is just another adapter call; sandbox applies. If a test needs network access, that's a Phase 2 concern (current Phase 1 doesn't restrict network).

---

## Phase 2 Sketch (For Future Spec)

Once Phase 1 ships and stabilizes, Phase 2 would:

1. **Add Docker dependency detection** — `docker info` succeeds → `capabilities.sandbox.container_isolation: true`.
2. **Curate base images** — `maestroclaw/base:latest` with git, node, python (configurable), claude_code CLI, claude_haiku tools, copilot CLI (where licensed).
3. **Per-job container** — `docker run --rm -v /workspaces/<job_id>:/workspace --network=none <image> <adapter command>`.
4. **Network policy** — default `--network=none`. Jobs that need network (e.g., `npm install`) opt-in via `required_capabilities.network: 'restricted'` (allowlisted hosts only) or `'open'` (full network with logging).
5. **Resource caps via cgroup** — `docker run --memory=2G --cpus=2 ...` for hard caps.
6. **Image management** — pull on Claw boot; cache; warn on stale.

Phase 2 is its own ~600-line spec when ready. **Phase 1 must be forward-compatible**: AdapterRunContext shape works for both sandbox phases. Adding container support is a wrapper around the existing adapter call.

---

## Phase 3 Sketch (For Future Spec)

Eventually, persistent dev containers per-user-per-repo:

- User has a "dev pod" — a container that survives across sessions
- File-system state is preserved (tools installed, dependencies cached, repo cloned once)
- Network and firewall rules per-user
- Could be local Docker-Desktop-managed, remote (Maestro hosts), or remote dev environment integration (Codespaces, Coder, Devpod)

Phase 3 changes the job model: jobs become commands EXECUTED IN the user's dev pod, not commands that spawn a container. This is a much larger architectural shift; defer until Phase 1+2 are both stable.

---

## Open Questions (Phase 1)

1. **What if a tool legitimately needs `~/.gitconfig`?** Plan: at job start, copy a curated subset of user config files into the workspace HOME (`.gitconfig` for username/email but NOT credentials, etc.). Done as a "user_config_seed" option in claw config. Documented per-tool list. v1.1 enhancement; v1 ships without and surfaces the issue.
2. **Workspace size cap of 100MB — too small?** Builds can produce more than 100 MB easily (lock files, generated dist dirs). Bump to 500 MB default; user-configurable.
3. **What about Mac/Windows-specific env vars (`USERPROFILE`, `APPDATA`)?** Add to allowlist where they're necessary; redirect to workspace HOME equivalent where possible. Test cross-platform during impl.
4. **Path-resolution audit for non-adapter file writes.** Existing `resolveSafeArtifactPath` covers artifact writes. The shell adapter's commands can still write outside workspace if the user's command does so (e.g., `echo "x" > /tmp/foo`). Phase 1 doesn't fully enforce filesystem isolation outside workspace — only enforces CWD. Phase 2 (Docker) gets real filesystem isolation via volume mounts.

---

## Implementation Order (Phase 1)

1. **`sandbox/profile.ts`** — `createSandboxProfile`, `teardownProfile`, env scrubbing, restricted PATH computation. Unit tests for env filtering, PATH composition, denylist regex.
2. **`sandbox/limits.ts`** — workspace size monitor, basic limits structure. v1 ships only the workspace-size monitor + existing timeout.
3. **Adapter type signature change** — `AdapterRunContext` parameter. Compile must fail until all adapters migrate.
4. **Migrate each adapter** — `approved-shell.ts`, `pty-shell.ts`, `claude-code.ts`, `copilot-cli.ts`, `codex-cli.ts`, `gemini-cli.ts`, `shell-stub.ts`, `command.ts`. Each uses `ctx.restricted_env` and `ctx.workspace_dir` instead of `process.env` and `workDir` from the old signature.
5. **`executor.ts` integration** — create profile per claim, pass to adapter, teardown after.
6. **Capability advertising** — extend heartbeat with `sandbox` object.
7. **Incident reporting** — workspace-size violations report via SEC-04 IncidentService.
8. **Live verification per acceptance criteria** — six tests above.
9. **Update DEPLOY_RUNBOOK.md** with SANDBOX-01 deploy section and migration notes (existing jobs continue working; sandbox applies on next adapter call).

Suggested split:
- Sonnet: 1-7 (mostly mechanical refactor + new module).
- **Opus reviews step 1** — env denylist regex and allowlist completeness. Wrong here = secret leakage.
- **Opus reviews step 4** — at least one adapter migration as the template; rest follow the pattern.

---

## Phase 1 Cost / Compatibility Summary

- **Implementation cost:** ~3-5 days for Sonnet.
- **Runtime cost:** negligible. Workspace creation is filesystem mkdir; teardown is rmdir. Microseconds per job.
- **User-visible cost:** none for normal flows. Some env vars no longer pass through (allowlist) — documented, configurable.
- **Compatibility:** existing jobs work. Existing builds work. Existing iteration loops work. Some tools that relied on user `~/.gitconfig` may need setup help (see Open Question 1).

---

## What This Spec Does NOT Cover

- **Phase 2 (Docker per-job)** — sketched above; future spec.
- **Phase 3 (persistent dev containers)** — sketched above; future spec.
- **Network restrictions** — Phase 2 concern.
- **Cross-Phase capability advertising format details** — designed forward-compatible (`sandbox.phase: 1|2|3`); Phase 2 adds fields without breaking Phase 1.
- **User-configurable allowlist additions** — flagged as v1.1.
- **Multi-user / shared executor scenarios** — Phase 3 territory.

---

## Hand-off Notes

Phase 1 is shippable now. The key risk is **completeness of the env denylist** — a missed pattern (e.g., a new SaaS provider's `_API_TOKEN` style) leaks credentials. The regex `(_TOKEN|_SECRET|_KEY|_PASSWORD|_PRIVATE)$` catches most patterns but isn't exhaustive. Combine the regex with the explicit denylist for known providers, and use the ALLOWLIST (positive listing) approach as the primary mechanism — denylist is belt-and-suspenders.

If Sonnet implements solo, **stop after step 1 and request Opus review** of the env handling. Wrong env scrubbing = secret leakage = security incident. The rest is mechanical.

The adapter signature change (step 3) is breaking for the package's internal API but trivially mechanical to apply across all adapters in one PR. Don't try to ship adapter migrations separately; do them all together.

---

*End of SANDBOX-01 spec. Phase 1 implementable; Phases 2-3 referenced for forward compatibility.*
