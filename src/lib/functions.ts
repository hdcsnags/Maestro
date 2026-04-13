import { supabase } from './supabase';

type EdgeFunctionBody =
  | Record<string, unknown>
  | string
  | Blob
  | ArrayBuffer
  | FormData
  | File
  | ReadableStream<Uint8Array>;

export class EdgeFunctionError extends Error {
  details: unknown;
  status: number | null;

  constructor(message: string, status: number | null, details: unknown) {
    super(message);
    this.name = 'EdgeFunctionError';
    this.status = status;
    this.details = details;
  }
}

export async function invokeEdgeFunction<TResponse>(
  functionName: string,
  body?: EdgeFunctionBody,
): Promise<TResponse> {
  const { data, error } = await supabase.functions.invoke<TResponse>(functionName, {
    body,
  });

  if (!error) {
    return data as TResponse;
  }

  const response = (error as { context?: Response }).context;
  if (response) {
    let details: unknown = null;
    try {
      details = await response.clone().json();
    } catch {
      try {
        details = await response.clone().text();
      } catch {
        details = null;
      }
    }

    const message = typeof details === 'object' && details && 'message' in details
      ? String((details as { message?: unknown }).message)
      : typeof details === 'object' && details && 'error' in details
        ? String((details as { error?: unknown }).error)
        : error.message;

    throw new EdgeFunctionError(message, response.status, details);
  }

  throw new EdgeFunctionError(error.message, null, null);
}
