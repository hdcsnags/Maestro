import type { Adapter, AdapterResult } from "./types.js";

/**
 * Shell stub adapter — echoes the prompt back as output.
 * Used for smoke-testing the full pipeline without real AI calls.
 */
export class ShellStubAdapter implements Adapter {
  name = "shell_stub";

  async check(): Promise<boolean> {
    return true; // always available
  }

  async run(
    prompt: string,
    workDir: string,
    _timeoutMs: number
  ): Promise<AdapterResult> {
    console.log(`  🔧 shell_stub: echoing prompt (workDir: ${workDir})`);

    // Simulate a brief delay
    await new Promise((r) => setTimeout(r, 500));

    return {
      success: true,
      output: `[shell_stub] Received prompt (${prompt.length} chars):\n${prompt.slice(0, 500)}${prompt.length > 500 ? "..." : ""}`,
    };
  }
}
