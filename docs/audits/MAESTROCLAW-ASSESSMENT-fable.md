# MaestroClaw source audit — Fable

*Read-only assessment, 2026-08-17, `claude-fable-5` via raw CLI invocation, against a bundled dump of `packages/maestroclaw` source + docs. Scoped narrowly to the MaestroClaw package itself — see `MAESTRO-2026-FULL-AUDIT.md` for the full-project strategic audit and `MAESTROCLAW-ASSESSMENT-sol.md` for Sol's parallel pass on the same package.*

---

# MaestroClaw / ThamosClaw Source Audit

Read the full bundle. Below is the assessment, organized by the five brief questions. Bottom line up front: the AI-execution adapters are genuinely close to "finishing the tuning" — mostly flag/model-ID drift and some now-redundant hand-rolled logic. But two of the three ThamosClaw "kernel" pillars are oversold relative to the code, and one of them (interactive PTY) is not a tuning gap at all — it's unbuilt at the interface level.

---

## 1. Adapter currency

### `claude-code.ts` — mostly current, two real problems

- **Model ID is likely invalid and self-contradictory.** `PRIMARY_MODEL = process.env.CLAW_CLAUDE_MODEL ?? "claude-sonnet-4-6"`, but the doc comment two lines below says *"Hard default: claude-sonnet-4-5"* and the header comment says the same. `claude-sonnet-4-6` is not a model ID I recognize as valid. Switch the default to an alias (`sonnet`) so it survives model refreshes, or a real snapshot ID.
- **Session mode omits `--print`, which is the actual bug.** `runSessionWithModel` spawns `claude ["--dangerously-skip-permissions", "--model", model]` and pipes the prompt to stdin. Without `--print`/`-p`, `claude` launches the interactive TUI, which expects a TTY. Feeding it a closed pipe is fragile-to-broken — this is exactly the kind of thing that "worked on an older CLI build" and silently regressed. The task-mode path (`--print --output-format text --model`) is correct; the session path should be `claude -p --dangerously-skip-permissions --model <m>`.
- **`--dangerously-skip-permissions` still valid but is now the blunt instrument.** Current Claude Code prefers `--permission-mode` and `--allowedTools`.
- **Manual rate-limit fallback now duplicates a native feature.** `RATE_LIMIT_SIGNALS` string-scraping + `FALLBACK_MODEL` retry re-implements what Claude Code now does with `--fallback-model`. Consider deleting the hand-rolled path.

### `codex-cli.ts` — one suspect flag, and no model selection

- **`--ephemeral` is the flag I'd challenge first.** Every other flag in the invocation maps to a current `codex exec` option; I don't recognize `--ephemeral` as current. If it was ever real it's the most likely thing to have been removed. *(Note: Sol's parallel pass, backed by citations, found this is actually still valid but does something narrower than assumed — see her file. The flag Sol identifies as actually deprecated is `--full-auto`.)*
- **`--full-auto` is still valid but is now the alias, not the primitive.** Current Codex expresses execution safety as `--sandbox <read-only|workspace-write|danger-full-access>` combined with `--ask-for-approval <never|...>`.
- **No `--model`.** Unlike claude/gemini, the codex adapter never selects a model — the "Sol" persona rides whatever the Codex default is.
- **This is the most robust adapter mechanically:** `resolveCliInvocation` + `shell: false` + `--output-last-message` file (rather than scraping stdout) is the right pattern. The other adapters should look like this one.

### `gemini-cli.ts` — works, but stale defaults and inconsistent spawn

- **`--yolo` is valid** but Sol's pass found the current spelling is `--approval-mode=yolo`.
- **Model defaults are probably a generation behind.** `gemini-2.5-pro` → `gemini-2.5-flash`; Gemini 3 (`gemini-3-pro`) is now the flagship.
- **Manual pro→flash fallback duplicates native behavior.**
- **Windows inconsistency:** this adapter uses `spawn("gemini", …, { shell: true })` while codex and copilot use `resolveCliInvocation` + `shell:false`. On Windows the shell-resolution path is the one that historically breaks; align gemini with the codex/copilot pattern.
- **No sandbox flag.** With `--yolo` and no sandbox this runs fully unsandboxed.

### `copilot-cli.ts` — verify the flag surface, prompt-indirection is good

- The prompt-file indirection (`buildWrapperPrompt` + temp `.md`) is a sound arg-length/escaping workaround.
- Several flags need verification against the current standalone `copilot` CLI: `--no-ask-user`, `--silent`, `--output-format text` are the ones most likely renamed or dropped. If `--no-ask-user` no longer exists, Copilot may block waiting for confirmation and hit the timeout with no output — a mysterious hang rather than an error.

### `command.ts` — brittle npm-shim parser

`resolveNodeEntryFromCmdShim` matches one specific npm cmd-shim generation via regex. Modern installs increasingly come via pnpm/volta/fnm/winget/standalone binaries whose shims don't match at all. The PowerShell `Get-Command` fallback saves most cases, but the fast path silently mismatches on current npm.

### `pty-shell.ts`

`@lydell/node-pty` is the right modern choice; no staleness there. The functional problem is in §3.

---

## 2. The sandbox question

**MaestroClaw's own execution-safety design is: disable each CLI's native sandbox, then substitute workspace isolation.** Every AI adapter runs its CLI in maximum-autonomy mode. The safety boundary is meant to be MaestroClaw's ephemeral per-job workspace plus scope enforcement plus the artifact path-escape guard. Arriving at "give the agent full autonomy but jail it in a disposable workspace" independently is legitimate — it's the same conclusion the industry reached — so this design is *conceptually* still solid.

**A. A bug/behavior specific to an underlying CLI this code should defend against but doesn't:**

- **Codex's sandbox is a no-op on Windows.** Codex's `workspace-write` sandbox is enforced via Landlock/seccomp (Linux) and Seatbelt (macOS). On Windows there is no OS sandbox — `--full-auto` on Windows gives you the *approval* behavior but **no filesystem confinement**. The code shows no awareness of this platform split.
- **The classic Codex "sandboxed file-write failing" class.** In `workspace-write`, writes above the workspace root fail with "operation not permitted." In MaestroClaw's flow that surfaces as *codex exits 0-ish but no files land* — a confusing symptom whose true cause is the sandbox writable-root, not the model. **This is very likely the "sandbox-related problem I meant to fix" Michael remembers.**

**B. MaestroClaw's own design gap (different problem, different fix):**

- **Isolation is post-hoc for file artifacts, and nonexistent for side effects.** Scope enforcement runs *after* the agent finishes — it can undo file writes but cannot undo network calls, out-of-workspace deletes, or `npm install` lifecycle scripts run while the CLI's native sandbox is disabled.
- **`config.workDir` escape hatch bypasses ephemerality entirely.** The iteration runner uses a real, non-ephemeral directory when `config.workDir` is set — the "ephemeral workspace" safety story doesn't apply at all in that mode.

Net: the *design* is defensible and parallel to where the industry landed. The *staleness* is (1) no Windows awareness that the CLI sandboxes it disables were never protecting Windows anyway, and (2) no handling of Codex's writable-root / nested-sandbox failure mode.

---

## 3. Security kernel maturity

### Pillar I — Shell Analyzer: thinner than claimed, but functionally reasonable

`shell-analyzer.ts` is real and better than a naive split. It's quote-aware, escape-aware, correctly handles two-char separators before single, rejects background execution, strips comments, and blocks redirects/subshells/backticks/newlines. That's a defensible prompt-injection posture — but the manifesto claims "full recursive analysis," and the implementation is **not recursive** — it's a flat segmenter that *bans* the constructs that would require recursion. Call it "sound denylist," not "high-fidelity recursive parser."

### Pillar III — Allowlist: the central overclaim

The manifesto says the kernel rejects agent-generated commands not on the allowlist. **This is enforced in exactly two adapters** — `ApprovedShellAdapter` and `PtyShellAdapter`. **None of the AI adapters call the kernel at all.** The claim's own headline scenario is precisely the case not covered.

Further weaknesses: the allowlist contains commands that are themselves arbitrary-code-execution primitives (`npm`, `git`, `rm`), and only `argv[0]` is ever checked, never arguments. Two divergent copies of the registry exist (`approved-shell.ts` and `pty-shell.ts` already disagree) with no single source of truth.

### Pillar II — Interactive PTY: unbuilt, not merely thin

The manifesto claims native interactive terminal sessions driving `vim`/`htop`/`top`. **There is no input path** — nothing ever calls `ptyProcess.write()`, and the `Adapter.run` interface has no input channel at all. `vim`/`htop`/`top` would stream a screen and then hit the timeout and get killed. This is an interface-level miss: real interactivity requires adding a bidirectional stream to the `Adapter` contract and a control channel from Thamos6. That's a design change, not a patch.

### `incident-service.ts` — exactly as claimed, no more

A thin, correct fire-and-forget POST that swallows errors. Matches the "Remote-to-Home Bridge" description honestly. The manifesto's flourishes ("local detection of malware") are aspirational — nothing here detects anything; incidents fire only from the two shell adapters' allowlist rejections.

**Overall kernel verdict:** analyzer solid-but-mislabeled; incident bridge honest-but-minimal; allowlist real but not enforced where the manifesto's own headline scenario lives, and containing entries that void it; PTY interactivity essentially unimplemented. The manifesto is a spec written ahead of the code, and it's now partly stale against itself.

---

## 4. Missing adapters — scoping, not building

### Kimi CLI adapter (`kimi_cli`)

Clone `codex-cli.ts` for the Windows-safe spawn pattern. **The known quirk — the one already paid for tonight:** Kimi is Python, so on Windows the console defaults to a non-UTF-8 code page and any Hebrew/Greek output crashes or corrupts. Every existing adapter does `env: { ...process.env }` and none set encoding. The Kimi adapter must spawn with `PYTHONIOENCODING: "utf-8"` (plus `PYTHONUTF8: "1"` as belt-and-suspenders) — this is the single most important line in the whole adapter.

### Agy / Google Antigravity CLI adapter (`agy_cli`)

Honesty caveat: Antigravity's standalone CLI surface is less settled than gemini/codex — treat this as a probe list. Probe `agy --help`/`--version` for the real binary name, non-interactive prompt flag, approval-bypass equivalent, working-directory flag, and model selection before coding.

---

## 5. Bottom line — is it "just tuning"?

**Split the answer — the codebase is two different maturity tiers wearing one name.**

**The AI-execution core is genuinely "finishing the tuning."** The polling/claiming loop, the job executor, the conductor/reconcile logic, and the iteration runner are coherent, defensively written, and Windows-aware in ways that show real operational scar tissue. The staleness here is small and targeted — patches, not rewrites.

**The ThamosClaw kernel is not just tuning** — but the honest recommendation is a rewrite of *one specific piece*, not the whole thing:

- **Interactive PTY needs a real rework** (or, per Sol's fuller project audit, deprecation in favor of native harness sessions — worth weighing against this file's "rebuild" framing).
- **The allowlist-as-security-boundary claim needs redesign, not tuning** — argument-level policy is required to make it mean anything; until then, the real safety boundary is the ephemeral workspace, and the docs should say so plainly.
- **The manifesto itself should be re-marked** as a proposal, not a description.

So: tune the executor and adapters; rework or deprecate the interactive-PTY component; redesign (don't tune) the allowlist's security claim; correct the manifesto to match reality.
