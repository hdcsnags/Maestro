// Single source of truth for the shell allowlist. Previously approved-shell.ts
// and pty-shell.ts each defined their own TRUSTED_COMMANDS set and had
// already drifted (pty-shell.ts additionally trusted top/htop/vim/nano).
// See docs/audits/MAESTROCLAW-ATTACK-PLAN.md §2 item 8.
//
// top/htop/vim/nano are deliberately NOT included here (pty-shell.ts used to
// trust them). Both the Fable and Sol source audits independently confirmed
// there is no input path anywhere in the Adapter interface or the PTY
// wrapper — nothing ever calls ptyProcess.write() — so these commands stream
// a screen and then simply hang until the job timeout. Trusting them was
// pure liability with zero working functionality behind it.
//
// This allowlist is honest about what it is: argv[0]-only checking. It does
// NOT validate subcommands or arguments, so "npm run <script>", "git config
// alias.x=!...", "find -exec", and similar remain reachable through allowed
// binaries. Per the architectural decision in
// docs/audits/MAESTROCLAW-ATTACK-PLAN.md §1, MaestroClaw is deliberately NOT
// investing in argument-level policy here — that is the "build a better
// security kernel" trap the full audit warns against. The real safety
// boundary for these two shell adapters is workspace ephemerality, the
// approval gate for anything not in this set, and (eventually) outer OS
// sandboxing — not this list.
export const TRUSTED_SHELL_COMMANDS = new Set([
  "git", "npm", "ls", "pwd", "cd", "mkdir", "rm", "cp", "mv", "cat",
  "grep", "find", "whoami", "hostname", "ipconfig", "ifconfig", "ping", "nmap",
]);
