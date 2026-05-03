// Layer 1: Client-side trust HINTS for UX only.
// These are NEVER used for security decisions — the server is authoritative.
// Use these only to pre-populate UI state and skip unnecessary cloud round-trips.
import type { ExecutionCommandTrust } from '../types';

export const EXECUTION_INTENT_PROMPT = `You are Maestro's execution parser. The user wants to execute a command or action.
Analyze their message and return a JSON object with:
- "action": short name (e.g., "create_repo", "shell_command", "install_deps", "git_push")
- "command": the actual shell command to run (if applicable)
- "params": key-value pairs of extracted parameters (e.g., {"repo_name": "nexshield", "visibility": "public"})
- "adapter": one of "approved_shell" (for shell/git/npm commands), "github_api" (for repo creation, PR ops), "claude_code" (for code generation tasks)
- "description": one-line human-readable description of what this will do

Return ONLY valid JSON. No markdown fences, no explanation.`;

export const TRUSTED_COMMANDS: { pattern: RegExp; description: string }[] = [
  { pattern: /^git\s+status/, description: 'Check repo status' },
  { pattern: /^git\s+log/, description: 'View commit history' },
  { pattern: /^git\s+diff/, description: 'View changes' },
  { pattern: /^git\s+branch/, description: 'List branches' },
  { pattern: /^ls\b/, description: 'List directory' },
  { pattern: /^dir\b/, description: 'List directory (Windows)' },
  { pattern: /^cat\b/, description: 'View file contents' },
  { pattern: /^type\b/, description: 'View file contents (Windows)' },
  { pattern: /^npm\s+list/, description: 'List packages' },
  { pattern: /^npm\s+outdated/, description: 'Check outdated packages' },
  { pattern: /^node\s+--version/, description: 'Node version' },
  { pattern: /^gh\s+repo\s+view/, description: 'View repo info' },
  { pattern: /^gh\s+issue\s+list/, description: 'List issues' },
  { pattern: /^gh\s+pr\s+list/, description: 'List pull requests' },
];

export function classifyCommandTrust(command: string): ExecutionCommandTrust {
  const trimmed = command.trim();
  return TRUSTED_COMMANDS.some((t) => t.pattern.test(trimmed))
    ? 'trusted'
    : 'approval_required';
}
