// Server-authoritative trusted shell command allowlist.
// These commands execute without HMAC approval for approved_shell and pty_shell adapters.

export const TRUSTED_SHELL_COMMANDS: RegExp[] = [
  /^git\s+status$/,
  /^git\s+status\s+--short$/,
  /^git\s+status\s+-sb$/,
  /^git\s+branch$/,
  /^git\s+branch\s+--show-current$/,
  /^git\s+diff$/,
  /^git\s+diff\s+--stat$/,
  /^git\s+log\s+--oneline$/,
  /^git\s+log\s+--oneline\s+-\d+$/,
  /^npm\s+list$/,
  /^npm\s+outdated$/,
  /^node\s+--version$/,
  /^gh\s+repo\s+view$/,
  /^gh\s+issue\s+list$/,
  /^gh\s+pr\s+list$/,
];

export const UNSAFE_SHELL_PATTERN = /[;&|><`$%()]/;

export function hasUnsafeSyntax(command: string): boolean {
  return /[\r\n]/.test(command) || UNSAFE_SHELL_PATTERN.test(command);
}

export function isTrustedShellCommand(command: string): boolean {
  return TRUSTED_SHELL_COMMANDS.some((pattern) => pattern.test(command));
}
