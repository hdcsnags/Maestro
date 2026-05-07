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
  // Test/build commands for iteration loop verification
  /^npm\s+test(\s+\S+)*$/,
  /^npm\s+run\s+test(\s+\S+)*$/,
  /^npm\s+run\s+build$/,
  /^npm\s+run\s+typecheck$/,
  /^npx\s+vitest\s+(run\s+)?\S+$/,
  /^npx\s+jest\s+\S+$/,
  /^npx\s+mocha\s+\S+$/,
  /^tsc\s+--noEmit$/,
  /^go\s+test\s+\.\/\.\.\.$/,
  /^go\s+test\s+\S+$/,
  /^cargo\s+test(\s+\S+)*$/,
  /^pytest(\s+\S+)*$/,
];

export const UNSAFE_SHELL_PATTERN = /[;&|><`$%()]/;

export function hasUnsafeSyntax(command: string): boolean {
  return /[\r\n]/.test(command) || UNSAFE_SHELL_PATTERN.test(command);
}

export function isTrustedShellCommand(command: string): boolean {
  return TRUSTED_SHELL_COMMANDS.some((pattern) => pattern.test(command));
}
