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
}
