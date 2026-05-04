export interface AdapterResult {
  success: boolean;
  output: string;
  error?: string;
  artifacts?: Record<string, string>;
}

/**
 * Called as each line of stdout/stderr becomes available.
 * Invoked by adapters that support streaming; safe to be undefined
 * (non-streaming adapters simply omit it).
 */
export type OnLineFn = (type: 'stdout' | 'stderr', line: string) => void;

export interface Adapter {
  name: string;
  check(): Promise<boolean>;
  /**
   * @param onLine Optional streaming callback — called per line as output arrives.
   *               Adapters MUST still accumulate and return the full output in
   *               AdapterResult.output so quality checks and content extraction work.
   */
  run(prompt: string, workDir: string, timeoutMs: number, onLine?: OnLineFn): Promise<AdapterResult>;
  /**
   * Session mode: full-project prompt, adapter writes files directly to workDir
   * using native tool access. The executor collects written files via dir-diff
   * after the process exits — stdout is not parsed as file content.
   *
   * Optional — falls back to run() if not implemented.
   */
  runSession?(prompt: string, workDir: string, timeoutMs: number): Promise<AdapterResult>;
}

