import type { Adapter } from "./types.js";
import { ShellStubAdapter } from "./shell-stub.js";
import { ClaudeCodeAdapter } from "./claude-code.js";
import { CopilotCliAdapter } from "./copilot-cli.js";
import { CodexCliAdapter } from "./codex-cli.js";
import { GeminiCliAdapter } from "./gemini-cli.js";
import { ApprovedShellAdapter } from "./approved-shell.js";

export { ShellStubAdapter } from "./shell-stub.js";
export { ClaudeCodeAdapter } from "./claude-code.js";
export { CopilotCliAdapter } from "./copilot-cli.js";
export { CodexCliAdapter } from "./codex-cli.js";
export { GeminiCliAdapter } from "./gemini-cli.js";
export { ApprovedShellAdapter } from "./approved-shell.js";
export type { Adapter, AdapterResult } from "./types.js";

const registry: Record<string, () => Adapter> = {
  shell_stub: () => new ShellStubAdapter(),
  claude_code: () => new ClaudeCodeAdapter(),
  copilot_cli: () => new CopilotCliAdapter(),
  codex_cli: () => new CodexCliAdapter(),
  gemini_cli: () => new GeminiCliAdapter(),
  approved_shell: () => new ApprovedShellAdapter(),
};

export function getAdapter(name: string): Adapter {
  const factory = registry[name];
  if (!factory) {
    throw new Error(
      `Unknown adapter "${name}". Available: ${Object.keys(registry).join(", ")}`
    );
  }
  return factory();
}

export async function checkAdapters(): Promise<Record<string, boolean>> {
  const results: Record<string, boolean> = {};
  for (const [name, factory] of Object.entries(registry)) {
    const adapter = factory();
    results[name] = await adapter.check();
  }
  return results;
}
