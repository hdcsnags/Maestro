import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { requireAuthenticatedRequest } from "../_shared/auth.ts";
import { readJsonBody } from "../_shared/body.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getDecryptedSecret } from "../_shared/secrets.ts";
interface AgentSkillPayload {
  name: string;
  instruction: string;
}

type OrchestrationMode = "analysis" | "build" | "artifact" | "build_task";
const ORCHESTRATE_MAX_BODY_BYTES = 1_048_576;

interface OrchestrationRequest {
  prompt: string;
  provider: string;
  model: string;
  agentName: string;
  agentRole: string;
  agentSkills?: AgentSkillPayload[];
  scopedPaths?: string[];
  context_files?: ContextFile[];
  repo_connection_id?: string;
  session_id?: string;
  mode?: OrchestrationMode;
}

interface ContextFile {
  path: string;
  content?: string; // pre-resolved or fetched at runtime
}

interface ArtifactResult {
  filename: string;
  content_type: string;
  content: string;
  raw_content?: string;
  normalized?: boolean;
  extraction_method?: string;
}

interface SignalMap {
  synthesis_fit?: string;
  risk?: string;
  confidence?: string;
}

interface FileManifestEntry {
  path: string;
  content: string | null;
  operation: "upsert" | "delete";
  content_hash?: string;
}

interface OrchestrateResult {
  title: string;
  content: string;
  signals: SignalMap;
  artifacts?: ArtifactResult[];
  file_manifest?: FileManifestEntry[];
  artifact_protocol?: string;
  complete?: boolean;
  continuation_prompt?: string;
  manifest_errors?: Array<{ path: string; reason: string }>;
  // build_task mode fields — preserved so frontend can extract single-file result
  path?: string;
  operation?: string;
}

const PROVIDER_MAP: Record<string, string> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  openrouter: "openrouter",
};

interface ModelCapabilities {
  buildOutputTokens: number;
  defaultOutputTokens: number;
  jsonMode: boolean;
}

const DEFAULT_CAPABILITIES: ModelCapabilities = {
  buildOutputTokens: 12000,
  defaultOutputTokens: 16384,
  jsonMode: false,
};

function capabilitiesFor(provider: string, model: string): ModelCapabilities {
  if (provider === "openai") {
    if (model === "gpt-5.4") return { buildOutputTokens: 24000, defaultOutputTokens: 16384, jsonMode: true };
    if (model.startsWith("gpt-5.4-mini")) return { buildOutputTokens: 16000, defaultOutputTokens: 16384, jsonMode: true };
    return { buildOutputTokens: 12000, defaultOutputTokens: 16384, jsonMode: true };
  }
  if (provider === "anthropic") {
    if (model.includes("sonnet") || model.includes("opus")) return { buildOutputTokens: 16000, defaultOutputTokens: 16384, jsonMode: false };
    return { buildOutputTokens: 8192, defaultOutputTokens: 16384, jsonMode: false };
  }
  if (provider === "google") {
    return { buildOutputTokens: 16000, defaultOutputTokens: 16384, jsonMode: true };
  }
  if (provider === "openrouter") {
    if (model.includes("gpt-5.4") || model.includes("claude-sonnet")) {
      return { buildOutputTokens: 16000, defaultOutputTokens: 16384, jsonMode: false };
    }
    return { buildOutputTokens: 8192, defaultOutputTokens: 16384, jsonMode: false };
  }
  return DEFAULT_CAPABILITIES;
}

async function fetchFileContent(
  userId: string,
  repoConnectionId: string,
  filePath: string,
): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  const { data: repoConn } = await adminClient
    .from("repo_connections")
    .select("*")
    .eq("id", repoConnectionId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!repoConn) return null;

  const ghToken = await getDecryptedSecret(adminClient, userId, "github");
  if (!ghToken) return null;
  const owner = repoConn.owner;
  const repo = repoConn.repo;
  const branch = repoConn.default_branch || "main";

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(filePath)}?ref=${branch}`,
      {
        headers: {
          Authorization: `Bearer ${ghToken}`,
          "User-Agent": "Maestro",
          Accept: "application/vnd.github+json",
        },
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Task 4 size guard: skip files >50KB. Caller will fall back to listing
    // the path as a hint. Avoids stuffing package-lock.json into the prompt.
    const MAX_BYTES = 50 * 1024;
    if (typeof data.size === "number" && data.size > MAX_BYTES) {
      return null;
    }
    if (data.encoding === "base64" && data.content) {
      const decoded = atob(data.content.replace(/\n/g, ""));
      if (decoded.length > MAX_BYTES) return null;
      return decoded;
    }
    return data.content ?? null;
  } catch {
    return null;
  }
}

function buildSystemPrompt(
  agentName: string,
  agentRole: string,
  skills?: AgentSkillPayload[],
  scopedPaths?: string[],
  codebaseContext?: string,
  mode: OrchestrationMode = "analysis",
  verbosityTier?: string,
): string {
  let prompt = "";

  if (codebaseContext) {
    prompt += `Current codebase context:\n${codebaseContext}\n\n`;
  }

  prompt += `You are ${agentName}, an AI specialist in a multi-agent orchestration council called Maestro. Your designated role is: ${agentRole}.\n\n`;

  if (mode === "build") {
    prompt += `You are in BUILD mode. Output concrete file changes as a Maestro build artifact. Maestro will validate and write file_manifest entries directly to the user's repository at the exact paths you specify.

Return your response as JSON with this EXACT structure:
{
  "artifact_protocol": "maestro.build.v2",
  "title": "short title under 12 words",
  "content": "1-2 paragraphs of rationale only — NO code in this field",
  "signals": {
    "files_modified": "comma-separated list of file paths",
    "lines_added": <integer>,
    "lines_removed": <integer>
  },
  "artifacts": [],
  "file_manifest": [
    { "path": "src/components/Foo.tsx", "content": "<COMPLETE new file content as a string>", "operation": "upsert", "content_hash": "optional sha256 if you can compute it" },
    { "path": "src/old/Dead.tsx", "content": null, "operation": "delete", "content_hash": null }
  ],
  "complete": true,
  "continuation_prompt": ""
}

NON-NEGOTIABLE RULES:
- file_manifest must contain every file you are creating, modifying, or deleting
- For "upsert" entries, content MUST be the COMPLETE new file content. Not a diff. Not a snippet. Not "// ... existing code ...". The full file, top to bottom, as it should exist after your change.
- NEVER use placeholders like "// ... rest of file", "// existing imports", "// unchanged", "...", or "// previous code". These will be REJECTED and the entry will be skipped.
- If the full change set is too large, include only complete files, set "complete": false, and put a concise continuation_prompt describing exactly which remaining files still need to be generated.
- For "delete" entries, content must be null.
- path must be the exact repo-relative path (no leading slash)
- Never put code in the "content" rationale field — code goes in file_manifest entries only
- file_manifest may be empty [] if no file changes are needed
- Prefer a few complete high-value files over many incomplete files`;
  } else if (mode === "build_task") {
    // Build v2 single-file task mode — lighter prompt, no ARCHITECT.md injection needed
    // The prompt_slice from build_tasks already contains per-file instructions
    prompt += `You are in BUILD TASK mode — generating exactly ONE file.

Return your response as JSON with this EXACT structure:
{
  "path": "<exact repo-relative file path>",
  "content": "<COMPLETE file content, every line, top to bottom>",
  "operation": "create"
}

RULES:
- Output ONLY the JSON above. No markdown fences, no explanation, no extra text.
- "content" MUST be the COMPLETE file — not a diff, not a snippet.
- NEVER use "// ... existing code ...", "// placeholder", "// rest of file", or similar.
- If you cannot generate the file, set content to an empty string.
- "path" must match exactly the file_path in the task.`;
  } else if (mode === "artifact") {
    prompt += `You are in ARTIFACT mode. Produce a single downloadable file that fulfills the request.

When responding:
1. Lead with a title naming the artifact (under 12 words)
2. Write 1-2 sentences describing what the artifact is in the "content" field
3. Put the full file content in the "artifacts" array as a single entry

Return your response as JSON with this structure:
{
  "title": "Your artifact title",
  "content": "Brief description of the artifact",
  "signals": {
    "artifact_type": "markdown or html",
    "confidence": "High/Medium/Low — one line reasoning"
  },
  "artifacts": [
    {
      "filename": "output.md",
      "content_type": "text/markdown",
      "content": "the full file contents here"
    }
  ]
}

The artifacts array MUST contain exactly one entry. Use either text/markdown (.md) or text/html (.html).`;
  } else {
    // analysis (default)
    prompt += `When responding:
1. Lead with a bold, memorable title (one sentence, no colon, under 12 words)
2. Give your expert perspective on the prompt from your specific role
3. Be direct, insightful, and opinionated — not generic
4. Keep the response focused: 2-4 paragraphs max

Return your response as JSON with this structure:
{
  "title": "Your response title here",
  "content": "Your full response content here",
  "signals": {
    "synthesis_fit": "one line about how this fits into the bigger picture",
    "risk": "one line about the primary risk or concern",
    "confidence": "High/Medium/Low — one line reasoning"
  },
  "artifacts": []
}

If the user's prompt asks you to generate a file (HTML wireframe, markdown plan, code file, etc.), include it in the "artifacts" array. Each artifact should have:
- "filename": the file name with extension (e.g., "wireframe.html", "plan.md")
- "content_type": MIME type (e.g., "text/html", "text/markdown", "text/plain")
- "content": the full file content as a string

Only include artifacts when file generation is clearly requested or would be genuinely useful. The artifacts array can be empty.`;
  }

  if (skills && skills.length > 0) {
    prompt += `\n\nYou have the following specialized skills active for this session:`;
    for (const skill of skills) {
      prompt += `\n\n[Skill: ${skill.name}]\n${skill.instruction}`;
    }
  }

  if (scopedPaths && scopedPaths.length > 0) {
    prompt += `\n\nYour scope is limited to the following file paths in the repository: ${scopedPaths.join(', ')}. Focus your analysis and recommendations within these paths.`;
  }

  if (verbosityTier === "brief") {
    prompt += `\n\nVerbosity: Brief. Respond in ≤100 words. Keep your reasoning sparse and do not include a preamble.`;
  } else if (verbosityTier === "detailed") {
    prompt += `\n\nVerbosity: Detailed. Expand fully. Include comprehensive reasoning, tradeoffs, and code examples where appropriate.`;
  }

  return prompt;
}

const TRUNCATION_PATTERNS = [
  /\/\/\s*\.{2,}\s*(existing|rest|previous|unchanged|other|same|original|prior|above|below|remaining|implementation)/i,
  /\/\*\s*\.{2,}\s*(existing|rest|previous|unchanged|other|same|original|prior|above|below|remaining|implementation)/i,
  /#\s*\.{2,}\s*(existing|rest|previous|unchanged|other|same|original|prior|above|below|remaining|implementation)/i,
  /<!--\s*\.{2,}\s*(existing|rest|previous|unchanged|other|same|original|prior|above|below|remaining|implementation)/i,
  /\/\/\s*(keep|preserve)\s+(existing|original|previous)/i,
  /\b(TODO|stub|placeholder)\b.*\b(implement|fill|replace)\b/i,
];

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractJsonCandidate(rawText: string): string | null {
  const text = rawText.trim();

  // Strategy 1: Direct JSON.parse on full text (handles clean JSON responses)
  const direct = tryParseJson(text);
  if (direct && typeof direct === "object") return text;

  // Strategy 2: Strip outermost code fences with GREEDY inner match
  // The greedy (.*) + $ anchor ensures we match the LAST closing fence
  const fenceMatch = text.match(/^```(?:json|JSON|text)?\s*\n?([\s\S]+)\n?\s*```\s*$/);
  if (fenceMatch) {
    const inner = fenceMatch[1].trim();
    const parsed = tryParseJson(inner);
    if (parsed && typeof parsed === "object") return inner;
  }

  // Strategy 3: Find first { and last }, try JSON.parse
  // This handles preamble/postamble text around the JSON
  const body = fenceMatch ? fenceMatch[1].trim() : text;
  const firstBrace = body.indexOf("{");
  const lastBrace = body.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = body.slice(firstBrace, lastBrace + 1);
    const parsed = tryParseJson(candidate);
    if (parsed && typeof parsed === "object") return candidate;
  }

  // Strategy 4: String-aware brace extraction (handles cases where
  // JSON.parse fails due to trailing commas or minor formatting issues)
  if (firstBrace === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = firstBrace; i < body.length; i += 1) {
    const ch = body[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && inString) {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return body.slice(firstBrace, i + 1);
    }
  }

  return null;
}

function coerceString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeArtifactContent(raw: string, contentType: string): { content: string; method: string; changed: boolean } {
  if (!raw || typeof raw !== "string") return { content: raw, method: "passthrough", changed: false };

  let decoded = raw;
  let method = "passthrough";

  // Strip code fences wrapping the content
  const fenced = decoded.trim().match(/^```(?:html|markdown|md|json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) {
    decoded = fenced[1];
    method = "fence_strip";
  }

  // If content looks like a JSON string (double-encoded), unwrap it
  if (decoded.trim().startsWith('"') && decoded.trim().endsWith('"')) {
    try {
      const unwrapped = JSON.parse(decoded);
      if (typeof unwrapped === "string") {
        decoded = unwrapped;
        method = "json_string_unwrap";
      }
    } catch { /* not valid JSON string */ }
  }

  // Unescape common escape sequences (up to 3 passes for double/triple encoding)
  for (let i = 0; i < 3; i++) {
    const next = decoded
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, "\\");
    if (next === decoded) break;
    decoded = next;
    if (method === "passthrough") method = "unescape";
  }

  // For HTML content, try to extract the HTML document if wrapped in other content
  if (contentType.includes("html")) {
    const htmlStart = decoded.search(/<!doctype html|<html[\s>]/i);
    if (htmlStart > 0) {
      const htmlEnd = decoded.toLowerCase().lastIndexOf("</html>");
      decoded = htmlEnd === -1 ? decoded.slice(htmlStart) : decoded.slice(htmlStart, htmlEnd + 7);
      method = "html_extract";
    }
  }

  return { content: decoded, method, changed: decoded !== raw };
}

function normalizeArtifacts(raw: unknown[]): ArtifactResult[] {
  return raw.map((a) => {
    if (!a || typeof a !== "object") return null;
    const art = a as Record<string, unknown>;
    const filename = coerceString(art.filename);
    const content_type = coerceString(art.content_type, "text/plain");
    const rawContent = coerceString(art.content);
    if (!filename || !rawContent) return null;

    const norm = normalizeArtifactContent(rawContent, content_type);
    return {
      filename,
      content_type,
      content: norm.content,
      raw_content: norm.changed ? rawContent : undefined,
      normalized: norm.changed,
      extraction_method: norm.method !== "passthrough" ? norm.method : undefined,
    };
  }).filter(Boolean) as ArtifactResult[];
}

function looksTruncated(content: string): boolean {
  return TRUNCATION_PATTERNS.some((p) => p.test(content));
}

function normalizeManifestEntry(entry: unknown): FileManifestEntry | null {
  if (!entry || typeof entry !== "object") return null;
  const e = entry as Record<string, unknown>;
  const path = coerceString(e.path).replace(/\\/g, "/").replace(/^\.\/+/, "").trim();
  if (!path) return null;

  const operation = e.operation === "delete" ? "delete" : "upsert";
  const content = operation === "delete"
    ? null
    : typeof e.content === "string"
      ? e.content
      : null;

  return {
    path,
    content,
    operation,
    content_hash: typeof e.content_hash === "string" ? e.content_hash : undefined,
  };
}

function validateManifestEntry(entry: FileManifestEntry): { ok: true } | { ok: false; reason: string } {
  if (entry.path.startsWith("/") || entry.path.includes("..")) {
    return { ok: false, reason: "invalid path (absolute or traversal)" };
  }
  if (entry.path.split("/").pop()?.toLowerCase() === "architect.md") {
    return { ok: false, reason: "ARCHITECT.md is generated by Maestro and cannot be written by build agents" };
  }
  if (entry.operation === "delete") {
    return entry.content === null ? { ok: true } : { ok: false, reason: "delete entry has non-null content" };
  }
  if (typeof entry.content !== "string" || entry.content.length === 0) {
    return { ok: false, reason: "upsert entry has empty/non-string content" };
  }
  if (entry.content.length > 750_000) {
    return { ok: false, reason: "file content exceeds 750KB safety limit" };
  }
  if (looksTruncated(entry.content)) {
    return { ok: false, reason: "content contains truncation/placeholder marker" };
  }
  return { ok: true };
}

function parseDelimitedManifest(rawText: string): FileManifestEntry[] {
  const entries: FileManifestEntry[] = [];
  const filePattern = /FILE\s+path=([^\s]+)\s+action=(upsert|delete)\s*\n---CONTENT---\n([\s\S]*?)\n---END_FILE---/g;
  let match: RegExpExecArray | null;
  while ((match = filePattern.exec(rawText)) !== null) {
    entries.push({
      path: match[1].replace(/\\/g, "/").replace(/^\.\/+/, ""),
      operation: match[2] === "delete" ? "delete" : "upsert",
      content: match[2] === "delete" ? null : match[3],
    });
  }
  return entries;
}

function normalizeManifest(rawManifest: unknown, rawText: string): {
  file_manifest: FileManifestEntry[];
  manifest_errors: Array<{ path: string; reason: string }>;
} {
  const candidates = Array.isArray(rawManifest)
    ? rawManifest.map(normalizeManifestEntry).filter((e): e is FileManifestEntry => e !== null)
    : parseDelimitedManifest(rawText);

  const file_manifest: FileManifestEntry[] = [];
  const manifest_errors: Array<{ path: string; reason: string }> = [];
  for (const entry of candidates) {
    const validation = validateManifestEntry(entry);
    if (validation.ok) {
      file_manifest.push(entry);
    } else {
      manifest_errors.push({ path: entry.path || "<unknown>", reason: validation.reason });
    }
  }
  return { file_manifest, manifest_errors };
}

function looksLikeBrokenTitle(title: string | undefined): boolean {
  if (!title) return false;
  const t = title.trim();
  return t === "{" || t === "[" || t.startsWith("```") || t.startsWith("``");
}

function buildResultFromParsed(
  p: Record<string, unknown>,
  rawText: string,
  agentName: string,
): OrchestrateResult {
  const { file_manifest, manifest_errors } = normalizeManifest(p.file_manifest, rawText);
  return {
    artifact_protocol: coerceString(p.artifact_protocol),
    title: coerceString(p.title, `${agentName}'s Analysis`),
    content: coerceString(p.content, rawText),
    signals: (p.signals && typeof p.signals === "object" ? p.signals : {}) as SignalMap,
    artifacts: Array.isArray(p.artifacts) ? normalizeArtifacts(p.artifacts) : [],
    file_manifest,
    complete: typeof p.complete === "boolean" ? p.complete : true,
    continuation_prompt: coerceString(p.continuation_prompt),
    manifest_errors,
    path: typeof p.path === "string" ? p.path : undefined,
    operation: typeof p.operation === "string" ? p.operation : undefined,
  };
}

function parseResult(rawText: string, agentName: string): OrchestrateResult {
  try {
    const jsonCandidate = extractJsonCandidate(rawText);
    const parsed = jsonCandidate ? tryParseJson(jsonCandidate) : null;
    if (parsed && typeof parsed === "object") {
      const p = parsed as Record<string, unknown>;

      // Rescue: if title looks broken, the "content" field may itself be
      // the real JSON (double-wrapped by the model)
      if (looksLikeBrokenTitle(p.title as string | undefined)) {
        const innerCandidate = extractJsonCandidate(
          typeof p.content === "string" ? p.content : ""
        );
        const innerParsed = innerCandidate ? tryParseJson(innerCandidate) : null;
        if (
          innerParsed &&
          typeof innerParsed === "object" &&
          !looksLikeBrokenTitle((innerParsed as Record<string, unknown>).title as string | undefined)
        ) {
          return buildResultFromParsed(
            innerParsed as Record<string, unknown>,
            rawText,
            agentName,
          );
        }
      }

      return buildResultFromParsed(p, rawText, agentName);
    }
  } catch { /* fall through */ }

  const { file_manifest, manifest_errors } = normalizeManifest(null, rawText);
  if (file_manifest.length > 0 || manifest_errors.length > 0) {
    return {
      artifact_protocol: "maestro.build.delimited",
      title: `${agentName}'s Build Artifact`,
      content: "Recovered a build artifact from delimiter-framed output. Review recovered files before execution.",
      signals: {
        risk: manifest_errors.length > 0 ? "Some manifest entries failed validation" : "Recovered from non-JSON output",
        confidence: file_manifest.length > 0 ? "Medium" : "Low",
      },
      artifacts: [],
      file_manifest,
      complete: !/complete=false|END_ARTIFACT\s+complete=false/i.test(rawText),
      continuation_prompt: "",
      manifest_errors,
    };
  }

  // Fallback: well-formed text but no parseable JSON. Never return empty
  // signals — frontend treats {} as "No structured signals returned".
  const firstLine = rawText.split('\n').find((l) => l.trim()) || `${agentName}'s Response`;
  return {
    title: firstLine.slice(0, 120),
    content: rawText,
    signals: {
      risk: 'Unstructured response — review manually',
      confidence: 'Unknown',
      synthesis_fit: 'Manual review required',
    },
    artifacts: [],
    file_manifest: [],
  };
}

async function getUserApiKey(userId: string, provider: string): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  return getDecryptedSecret(adminClient, userId, provider);
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const auth = await requireAuthenticatedRequest(req, corsHeaders, "orchestrate");
    if (auth instanceof Response) {
      return auth;
    }

    const { userClient: supabase, userId } = auth;

    const bodyResult = await readJsonBody<OrchestrationRequest>(req, corsHeaders, {
      maxBytes: ORCHESTRATE_MAX_BODY_BYTES,
      label: "Orchestrate request body",
    });
    if (bodyResult instanceof Response) {
      return bodyResult;
    }
    const body = bodyResult;
    const { prompt, provider, model, agentName, agentRole, agentSkills, scopedPaths, context_files, repo_connection_id, session_id, mode, verbosityTier } = body;
    const orchestrationMode: OrchestrationMode = mode ?? "analysis";

    // Resolve context files if provided
    let codebaseContext = "";
    if (context_files && context_files.length > 0 && repo_connection_id && userId) {
      const resolved: string[] = [];
      for (const cf of context_files) {
        if (cf.content) {
          resolved.push(`[${cf.path}]:\n${cf.content}`);
        } else {
          const content = await fetchFileContent(userId, repo_connection_id, cf.path);
          if (content) {
            resolved.push(`[${cf.path}]:\n${content}`);
          }
        }
      }
      if (resolved.length > 0) {
        codebaseContext = resolved.join("\n\n");
      }
    }

    let systemPrompt = buildSystemPrompt(agentName, agentRole, agentSkills, scopedPaths, codebaseContext, orchestrationMode, verbosityTier);

    // Sprint A · B7.2 — inject ARCHITECT.md into build-mode system prompt.
    // Skip for build_task mode — prompt_slice already contains per-file context.
    if (orchestrationMode === "build" && session_id) {
      const { data: sessRow } = await supabase
        .from("sessions")
        .select("architect_md")
        .eq("id", session_id)
        .maybeSingle();
      const architectMd = (sessRow?.architect_md as string | null) ?? "";
      if (architectMd && architectMd.trim().length > 0) {
        systemPrompt += `\n\n---\nARCHITECT REFERENCE:\n${architectMd}\n---`;
      }
    }

    const lookupProvider = PROVIDER_MAP[provider] ?? provider;
    const apiKey = await getUserApiKey(userId, lookupProvider);

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          title: `${agentName} — No API Key`,
          content: `No API key found for ${provider}. Please add your ${provider} API key in the Provider Vault.`,
          signals: { risk: "No API key configured", confidence: "N/A" },
          artifacts: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: OrchestrateResult = { title: '', content: '', signals: {}, artifacts: [], file_manifest: [] };
    const effectiveModel = model || (
      provider === "anthropic" ? "claude-sonnet-4-6"
        : provider === "openai" ? "gpt-5.4-mini"
          : provider === "google" ? "gemini-2.5-flash"
            : "auto"
    );
    const capabilities = capabilitiesFor(provider, effectiveModel);
    const maxOutputTokens = orchestrationMode === "build"
      ? capabilities.buildOutputTokens
      : orchestrationMode === "build_task"
        ? Math.min(capabilities.buildOutputTokens, 8192) // single file needs less
        : capabilities.defaultOutputTokens;

    if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: effectiveModel,
          max_tokens: maxOutputTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Anthropic API error');

      const rawText = data.content?.[0]?.text ?? '';
      const truncated = data.stop_reason === 'max_tokens';
      result = parseResult(rawText, agentName);
      if (truncated) {
        result.signals = { ...result.signals, risk: 'Response was truncated (hit token limit) — artifacts may be incomplete' };
      }

    } else if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: effectiveModel,
          max_completion_tokens: maxOutputTokens,
          ...(capabilities.jsonMode ? { response_format: { type: 'json_object' } } : {}),
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'OpenAI API error');

      const rawText = data.choices?.[0]?.message?.content ?? '';
      const truncated = data.choices?.[0]?.finish_reason === 'length';
      result = parseResult(rawText, agentName);
      if (truncated) {
        result.signals = { ...result.signals, risk: 'Response was truncated (hit token limit) — artifacts may be incomplete' };
      }

    } else if (provider === 'google') {
      const geminiModel = effectiveModel;
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens },
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Gemini API error');

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const truncated = data.candidates?.[0]?.finishReason === 'MAX_TOKENS';
      result = parseResult(rawText, agentName);
      if (truncated) {
        result.signals = { ...result.signals, risk: 'Response was truncated (hit token limit) — artifacts may be incomplete' };
      }

    } else if (provider === 'openrouter') {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://maestro.thamos.ca',
          'X-Title': 'Maestro Orchestration',
        },
        body: JSON.stringify({
          model: effectiveModel,
          max_tokens: maxOutputTokens,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'OpenRouter API error');

      const rawText = data.choices?.[0]?.message?.content ?? '';
      const truncated = data.choices?.[0]?.finish_reason === 'length';
      result = parseResult(rawText, agentName);
      if (truncated) {
        result.signals = { ...result.signals, risk: 'Response was truncated (hit token limit) — artifacts may be incomplete' };
      }

    } else {
      return new Response(
        JSON.stringify({
          title: `${agentName} — Unsupported Provider`,
          content: `Provider "${provider}" is not supported. Supported providers: anthropic, openai, google, openrouter.`,
          signals: { risk: "Unsupported provider", confidence: "N/A" },
          artifacts: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message, title: 'Error', content: message, signals: {}, artifacts: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});








