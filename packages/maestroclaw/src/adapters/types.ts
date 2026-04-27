export interface AdapterResult {
  success: boolean;
  output: string;
  error?: string;
  artifacts?: Record<string, string>;
}

export interface Adapter {
  name: string;
  check(): Promise<boolean>;
  run(prompt: string, workDir: string, timeoutMs: number): Promise<AdapterResult>;
  /**
   * Session mode: full-project prompt, adapter writes files directly to workDir
   * using native tool access. The executor collects written files via dir-diff
   * after the process exits — stdout is not parsed as file content.
   *
   * Optional — falls back to run() if not implemented.
   */
  runSession?(prompt: string, workDir: string, timeoutMs: number): Promise<AdapterResult>;
}
