# MaestroClaw source audit — Sol

*Read-only assessment, 2026-08-17, `gpt-5.6-sol` via raw CLI invocation with live web research, against a bundled dump of `packages/maestroclaw` source + docs. Scoped narrowly to the MaestroClaw package itself — see `MAESTRO-2026-FULL-AUDIT.md` for the full-project strategic audit and `MAESTROCLAW-ASSESSMENT-fable.md` for Fable's parallel pass on the same package.*

---

# MaestroClaw technical audit

I treated the pasted bundle as authoritative and did not access or modify the Maestro repository. Because the bundle has no line numbers, code references below use `file → symbol` plus short exact excerpts.

## Executive conclusion

The polling, adapter registry, API boundary, streaming, artifact chunking, and basic CLI wrappers are serviceable. Most individual CLI-currency problems are small patches.

The security story is not "enterprise-grade" and is not accurately described by `THAMOSCLAW_KERNEL.md`. Three pieces need genuine redesign rather than tuning:

1. `shell-analyzer.ts` and the binary-only allowlist are not a safe command authorization boundary.
2. `pty-shell.ts` is not an interactive PTY service; the `Adapter.run()` interface cannot represent one.
3. Filesystem scope is mostly post-execution bookkeeping, not containment. There are also concrete path-escape read/delete bugs in executor code.

The whole worker does not need a rewrite. The honest recommendation is to retain the queue/API/adapter orchestration, but replace the execution-security broker, PTY abstraction, and scope-enforcement layer.

The most serious findings:

- **Critical:** `cleanForRetry()` can delete outside the workspace because it applies `resolve(workDir, targetPath)` to remotely supplied `allowed_paths[0]` without a containment check.
- **Critical:** iteration peer queries can read outside the workspace through `agent_query.files`, again without containment validation.
- **Critical:** all four AI adapters bypass the claimed kernel allowlist, and three normally run agent-generated tools without an enabled OS sandbox.
- **Critical:** the approved-shell analyzer can be bypassed on Windows because it parses `#` as a comment but executes through `cmd.exe`, where `#` is not a comment.
- **High:** allowlisting only the first binary still allows arbitrary execution through `npm`, `find -exec`, Git aliases/hooks/config, interpreters, and similar arguments.
- **High:** `runSessionWithModel()` starts interactive Claude Code without `--print` despite having no PTY.
- **High:** `pty-shell.ts` exposes no input, resize, or persistent session API, so `vim`, `top`, and `htop` simply wait until timeout.
- **High:** `allowed_paths` does not prevent an agent from writing elsewhere; session-mode enforcement happens after the CLI exits and does not detect deleted files.
- **High:** every child receives the worker's full `process.env`, including credentials available to MaestroClaw.

---

# 1. Adapter currency

## `claude-code.ts`

### Task mode: mostly current

The task invocation `["--print", "--output-format", "text", "--model", model]` is presently valid — Claude Code still documents `claude -p` as the programmatic query-and-exit mode.

Issues: default `claude-sonnet-4-6` is likely resolvable but is no longer current-generation, and the constant/JSDoc disagree (`claude-sonnet-4-6` vs. documented `claude-sonnet-4-5`). The manual rate-limit fallback is now superseded by Claude's native `--fallback-model` chain, and it only examines stdout — Claude commonly reports operational failures on stderr, so some rate limits won't trigger fallback. `shell: true` is unnecessary technical debt; Claude and Gemini should use the same executable-resolution strategy as Codex and Copilot.

### Session mode: incorrect for a headless worker

`runSessionWithModel()` invokes `["--dangerously-skip-permissions", "--model", model]` with no `--print`. Bare `claude` starts the interactive terminal UI. Because MaestroClaw supplies pipes rather than a TTY, this can hang or behave differently by Claude version. `--dangerously-skip-permissions` is not a sandbox and does not scope Claude to `workDir` — it's equivalent to `--permission-mode bypassPermissions`, and Anthropic advises using it only inside a separate isolated environment.

## `codex-cli.ts`

The strongest current adapter, with one clearly obsolete flag. `--ephemeral` only prevents persistence of Codex rollout/session files — it is not a sandbox, but it is a real, current flag. The stale flag is **`--full-auto`**, which is now a deprecated compatibility flag; Codex prints a warning when it's used. For a headless worker, the explicit replacement should be `--sandbox workspace-write --ask-for-approval never`. Codex now has a native Windows sandbox with `elevated`/`unelevated` implementations — MaestroClaw should preflight which is active rather than assuming `--full-auto` supplies sufficient safety. No `CLAW_CODEX_MODEL` override exists; model choice is silently inherited from the user's Codex configuration.

## `gemini-cli.ts`

`--yolo` is deprecated; current spelling is `--approval-mode=yolo`. No `--sandbox` is passed. No trust policy is supplied — if folder trust is enabled, headless Gemini can exit with `FatalUntrustedWorkspaceError` on an untrusted cloned workspace (though blindly adding `--skip-trust` is also dangerous — it enables repo-local hooks/skills/MCP definitions). `gemini-2.5-pro`/`flash` are now a stale default strategy; current CLI recommends model routing through `auto`, with Gemini 3-family choices available. Gemini has a policy engine capable of deny/allow/ask rules that MaestroClaw currently discards by selecting YOLO without a restrictive policy.

## `copilot-cli.ts`

Flags are current (`--allow-all-tools`, `--no-ask-user`, `--add-dir`, `--output-format text`, `--silent` are all documented). `--allow-all-tools` is not the same as `--allow-all` — path/URL verification remain enabled, but `--add-dir .` path-extraction is explicitly described by GitHub as heuristic, not guaranteed. Copilot's local sandbox requires experimental mode and a Windows Insider build, so this adapter runs with the host user's actual permissions in practice.

## `approved-shell.ts`

`spawn(command, { cwd, shell: true, env: {...process.env} })` — the entire string is reinterpreted by the platform shell after Maestro's approximate parsing. On Windows, `shell:true` means `cmd.exe`, but the analyzer assumes mixed PowerShell/Unix grammar. Killing the shell process does not reliably kill descendants. The allowlist (`git`, `npm`, `rm`, `find`, `nmap`, ...) is not a meaningful capability boundary — `npm run <script>`, `find -exec`, Git aliases/hooks, and `git clean`/`reset` are all reachable through allowed binaries alone.

## `pty-shell.ts`

The node-pty API calls are correct, but this is not an interactive terminal adapter — no way to send input, resize, preserve a session beyond one promise, or terminate a named session. Allowing `top`/`htop`/`vim`/`nano` does not make them usable; they open, receive no keystrokes, and time out. This is an interface mismatch, not a missing flag. The ANSI filter is also incomplete and misses OSC sequences.

## `command.ts`

The design goal (avoid `shell:true` for npm-installed CLIs on Windows) is solid, but `resolveNodeEntryFromCmdShim()` recognizes one exact cmd-shim structure via regex; npm's shim output has changed historically, so this shouldn't be the only parser. Claude and Gemini don't use this resolver at all, leaving Windows behavior inconsistent across adapters.

---

# 2. The sandbox question

## MaestroClaw's own safety model

Per-job working directory, optional shallow clone, human approval, `allowed_paths`, temporary cleanup, shell allowlist, outbound-only control-plane connection — useful operational controls, but none is an OS sandbox. The README overstates two of these:

**"Ephemeral workspaces: deleted after"** — `config.ts` defaults `KEEP_SUCCEEDED_WORKSPACES ?? "true"`, and `executor.ts` renames successful workspaces instead of deleting them. Successful workspaces are persistent by default.

**"Scoped paths: jobs can restrict which files the adapter may touch"** — they do not. For session jobs, the CLI acts first; only after it exits does Maestro compare directory snapshots and reject detected out-of-scope results. That misses deleted files, edits outside `workDir`, symlink-mediated writes, and process/network/credential side effects entirely.

## Concrete MaestroClaw path vulnerabilities

1. **`executor.ts → cleanForRetry()`**: `resolve(workDir, targetPath)` then `unlinkSync(fullPath)`, where `targetPath` comes from `job.allowed_paths[0]`. A value like `../../sensitive-file` causes an out-of-workspace deletion on retry.
2. **`iteration/runner.ts → buildQueryPrompt()`**: `join(workDir, relPath)` then `readFileSync`, where `relPath` comes from model-generated `agent_query.files`. A prompt-injected model can request `../../...` and cause MaestroClaw *itself* — not the CLI — to read that file and send its contents to a peer adapter.
3. **`iteration/runner.ts → readFilesInScope()`**: literal `scope_paths` are not checked to remain below `resolvedWorkDir`, enabling a similar arbitrary read.
4. **`resolveSafeArtifactPath()`** performs lexical containment only — it does not resolve existing symlink parents, so a path lexically under the workspace can still lead outside through a repo-controlled symlink.
5. Every adapter and shell receives `env: {...process.env}` — unnecessarily exposing Supabase credentials, executor tokens, and unrelated API keys to prompt-injected tool calls.

These are MaestroClaw bugs, independent of whether Codex/Claude/Gemini/Copilot has a sandbox bug of its own.

## Underlying CLI behavior

**Codex** is closest to the desired model — current `workspace-write` mode enforces a real filesystem boundary and constrains network access, but MaestroClaw uses the deprecated `--full-auto` instead of requiring the current sandbox explicitly and validating Windows sandbox availability. A known current Windows failure class (sandbox setup/policy failure from logon rights, ACLs, UAC, enterprise policy) should surface as an adapter-health failure, not be silently treated as an ordinary model error.

**Claude Code** now has real Bash subprocess sandboxing (workspace write boundaries, network controls), but the adapter doesn't enable it, native Windows remains unsupported in Anthropic's current sandbox matrix, and the sandbox can fall back unsandboxed unless `failIfUnavailable` is set. A Windows Maestro worker must use external containment for autonomous Claude sessions.

**Gemini CLI** now has `--sandbox`, folder trust, a policy engine, and structured headless output — the adapter uses only the broadest old approval flag.

**Copilot CLI** offers an OS-level local sandbox, but it's experimental, off by default, with a Windows Insider requirement.

**OpenClaw comparison:** current OpenClaw is materially beyond this manifesto — it distinguishes host approvals from sandbox policy, supports Docker/SSH/OpenShell sandbox backends, and treats approvals as accidental-execution protection rather than a filesystem boundary. `shell-analyzer.ts` should not be described as a current "high-fidelity OpenClaw parser."

---

# 3. Security-kernel maturity

## `shell-analyzer.ts`: thinner than the manifesto

Splits top-level `&&`/`||`/`;`/`|`, quote-aware at that one level — more than a trivial split. But it is not recursive and does not prevent hidden subcommands. Inside quotes, disallowed tokens aren't checked, so `git status "$(unapproved-command)"` is accepted as one safe `git` segment while the shell executes the nested substitution. Only `argv[0]` is ever checked — no argument policy exists, so `npm exec`, `npm run`, `find -exec`, and Git aliases/hooks bypass the intended boundary without needing hidden shell syntax.

**Windows parser/executor mismatch:** `ApprovedShellAdapter` runs via `cmd.exe` (`shell:true`), but the analyzer treats `#` as a shell comment. `cmd.exe` does not. `git status # & disallowed-command` stops analysis at `#` while `cmd.exe` continues and runs the second command after `&`. That alone makes the approved-shell boundary unsafe on Windows.

This component should be replaced with either direct executable-plus-argv jobs with no shell, or a mature shell-specific parser plus canonical executable resolution, argument policy, and an OS sandbox.

## Allowlist enforcement coverage

The manifesto's claim that the kernel rejects agent-generated commands not on the allowlist is false. `analyzeShellCommand()` is called only from `ApprovedShellAdapter` and `PtyShellAdapter` — never from any AI adapter, never from `iteration/runner.ts → runVerificationWithAbortWatch()` (which will execute any binary named by a remotely configured verification command), never from Git clone/checkpoint/apply commands. The peer-query comment "Run it in a sandboxed temp dir" is also inaccurate — the code merely changes cwd to a temp dir; Claude/Copilot/Gemini can still reach outside it when their own sandbox is disabled.

`approved-shell.ts` and `pty-shell.ts` each define a *separate* `TRUSTED_COMMANDS` set that already differ (PTY adds `top`/`htop`/`vim`/`nano`). The manifesto tells maintainers to update the registry in `pty-shell.ts` alone, which wouldn't update `approved-shell.ts`. No kernel-level single source of truth exists.

## `incident-service.ts`: functional but thin

Genuinely POSTs incidents, authenticates with the executor token, swallows reporting errors appropriately. But: adapter calls don't `await` the report, there's no queue/retry/persistence/dedup, shell adapters don't know the current `job_id`, AI adapter safety failures don't report incidents at all, and incident metadata can include the entire command — potentially leaking secrets. A useful best-effort notifier, not yet an incident subsystem.

---

# 4. Additional executor and job-lifecycle findings

Adjacent to the security audit but materially affect the result:

- `executeJob()` can accept a failed adapter invocation if it produced *any* output — partial-but-source-looking output from a nonzero run may be accepted as success.
- `executeSessionJob()` records `pass1.success` but never uses it — files written before an adapter crash can still become a "successful" session result.
- Session scope detection does not capture deletions.
- `walkDir()` follows symlinked directories, creating possible escape/cycle risk.
- The README claims stale running jobs are renewed, but only executor heartbeats with capabilities appear in this bundle — no client-side lease-renewal call for specific active job IDs is visible.
- Iteration loops don't count against `activeJobs`, so `maxConcurrentJobs` limits ordinary jobs but not jobs-plus-loops combined.
- `git clone` accepts `job.repo_url` as an option-position argument with no URL-scheme validation or option terminator.

---

# 5. Missing adapters

## Kimi Code CLI

Use the `kimi` executable, probe with `kimi --version`. Current Kimi supports `-p/--prompt`, `--print`, `--quiet` (= `--print --output-format text --final-message-only`), `--output-format text|stream-json`, `-m/--model`, `--session`/`--resume`/`--continue`. Recommended shape: `kimi --print --final-message-only --output-format text`, prompt via stdin. **Do not mechanically add `--yolo`** — Kimi's print mode already supplies unattended behavior, and recent releases separate "approve tools while present" from "fully unattended"; version-probe this. `PYTHONIOENCODING=utf-8` is mandatory in the spawn environment for this project's Windows use case, or Hebrew/Greek output corrupts or fails. Pass a scrubbed environment, not `process.env`.

## Google Antigravity / `agy`

A real official CLI now exists — deserves its own adapter, not another Gemini variant. Probe `agy --version`; current one-shot invocation is `agy -p "<prompt>" --cwd "<workDir>"`, with `--model`, `--effort`, `--output-format`, `--sandbox`, `--dangerously-skip-permissions` all supported in recent releases. Structured print output landed in CLI 1.1.8; a fix ensuring `--sandbox` propagated into headless `-p` mode landed in 1.1.1 — require a tested minimum version, preferably 1.1.8+.

---

# 6. Bottom line and recommended scope

## What is tuning

Replace Codex `--full-auto`; add explicit model overrides to Codex/Copilot; replace Gemini `--yolo` with `--approval-mode=yolo`; add structured-output parsing; add Gemini folder-trust handling; add `--print` to Claude session execution; use Claude's native `--fallback-model`; use one Windows-safe executable resolver everywhere; centralize process-tree termination, output limits, environment scrubbing; add Kimi and Antigravity adapters.

## What is not tuning

**Rewrite the shell authorization component.** Don't incrementally add characters to `DISALLOWED_TOKENS`. Replace with a centralized execution broker that defaults to direct executable-plus-argv execution, validates arguments/subcommands (not just `argv[0]`), treats interpreters/package managers as code-execution capabilities, uses separate parsers per shell only where a shell is unavoidable, enforces an OS sandbox, strips credentials from the environment, and fails closed if containment is unavailable.

**Rewrite the PTY component and interface.** Keep node-pty if stable, but replace `PtyShellAdapter.run()` with a stateful terminal-session service — the present adapter cannot be patched into a real browser-controlled terminal without changing its API.

**Replace post-hoc scope checks with real containment.** Use sandbox writable roots as the primary boundary; keep directory-diff/artifact inspection as auditing only, made deletion- and rename-aware. Fix all lexical path handling immediately with containment and realpath/symlink checks in `cleanForRetry`, `buildQueryPrompt`, `readFilesInScope`, artifact writes, and session build copying.

## Final verdict

Michael's "it works, but it is old" description is accurate for the adapters and orchestration. It is **not** accurate for the kernel manifesto — calling the remaining work "finishing the tuning" understates the security work. The truthful scope: retain the worker and most adapters; apply targeted CLI-current patches; rewrite the shell-security boundary; rewrite the PTY abstraction; replace post-hoc path scoping with runtime containment.

Until those three redesigns are complete, `approved_shell`, `pty_shell`, Claude session mode, Gemini YOLO mode, and Copilot `--allow-all-tools` should not be treated as safe for jobs containing untrusted prompts or untrusted repository content.
