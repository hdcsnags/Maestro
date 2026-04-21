interface ReadJsonBodyOptions {
  maxBytes: number;
  label?: string;
  allowEmpty?: boolean;
}

function jsonErrorResponse(
  corsHeaders: Record<string, string>,
  error: string,
  status: number,
  extra?: Record<string, unknown>,
) {
  return new Response(JSON.stringify({ error, ...(extra ?? {}) }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function readBodyText(
  req: Request,
  corsHeaders: Record<string, string>,
  options: ReadJsonBodyOptions,
): Promise<string | Response> {
  const label = options.label ?? "Request body";
  const contentLength = req.headers.get("content-length");
  if (contentLength) {
    const parsedLength = Number(contentLength);
    if (Number.isFinite(parsedLength) && parsedLength > options.maxBytes) {
      return jsonErrorResponse(
        corsHeaders,
        `${label} exceeds ${options.maxBytes} bytes`,
        413,
        { max_bytes: options.maxBytes },
      );
    }
  }

  if (!req.body) {
    return options.allowEmpty
      ? ""
      : jsonErrorResponse(corsHeaders, `${label} is required`, 400);
  }

  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let raw = "";
  let receivedBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = value ?? new Uint8Array();
      receivedBytes += chunk.byteLength;
      if (receivedBytes > options.maxBytes) {
        await reader.cancel();
        return jsonErrorResponse(
          corsHeaders,
          `${label} exceeds ${options.maxBytes} bytes`,
          413,
          { max_bytes: options.maxBytes },
        );
      }

      raw += decoder.decode(chunk, { stream: true });
    }

    raw += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  if (!raw.trim()) {
    return options.allowEmpty
      ? ""
      : jsonErrorResponse(corsHeaders, `${label} is required`, 400);
  }

  return raw;
}

export async function readJsonBody<T>(
  req: Request,
  corsHeaders: Record<string, string>,
  options: Omit<ReadJsonBodyOptions, "allowEmpty">,
): Promise<T | Response> {
  const raw = await readBodyText(req, corsHeaders, options);
  if (raw instanceof Response) return raw;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return jsonErrorResponse(corsHeaders, `${options.label ?? "Request body"} must be valid JSON`, 400);
  }
}

export async function readOptionalJsonBody<T extends Record<string, unknown>>(
  req: Request,
  corsHeaders: Record<string, string>,
  options: Omit<ReadJsonBodyOptions, "allowEmpty">,
): Promise<T | Response> {
  const raw = await readBodyText(req, corsHeaders, { ...options, allowEmpty: true });
  if (raw instanceof Response) return raw;
  if (!raw.trim()) return {} as T;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return jsonErrorResponse(corsHeaders, `${options.label ?? "Request body"} must be valid JSON`, 400);
  }
}
