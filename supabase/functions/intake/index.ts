import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { logPermissionFailure, requireAuthenticatedRequest } from "../_shared/auth.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface IntakeRequest {
  session_id: string;
  repo_connection_id: string;
}

interface IntakeSummary {
  stack: string[];
  architecture_notes: string;
  risk_files: string[];
  safe_zones: string[];
  estimated_complexity: "low" | "medium" | "high";
}

const KEY_FILES = [
  "README.md",
  "package.json",
  "requirements.txt",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "ARCHITECT.md",
];

const MAX_FILE_BYTES = 50_000;

async function ghApi(path: string, token: string): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "Maestro",
      Accept: "application/vnd.github+json",
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error((data as { message?: string }).message || `GitHub API ${res.status}`);
  }
  return data;
}

function decodeBase64Utf8(b64: string): string {
  try {
    const binary = atob(b64.replace(/\n/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

async function getKeyFile(
  owner: string,
  repo: string,
  branch: string,
  path: string,
  token: string,
): Promise<string | null> {
  try {
    const data = await ghApi(
      `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`,
      token,
    ) as { content?: string; size?: number; encoding?: string };
    if (!data?.content) return null;
    if ((data.size ?? 0) > MAX_FILE_BYTES) return null;
    if (data.encoding !== "base64") return null;
    const text = decodeBase64Utf8(data.content);
    if (text.length > MAX_FILE_BYTES) return text.slice(0, MAX_FILE_BYTES);
    return text;
  } catch {
    return null;
  }
}

interface TreeNode { path: string; type: string }

async function getTree(
  owner: string,
  repo: string,
  branch: string,
  token: string,
): Promise<TreeNode[]> {
  const branchData = await ghApi(`/repos/${owner}/${repo}/branches/${branch}`, token) as {
    commit?: { commit?: { tree?: { sha?: string } } };
  };
  const treeSha = branchData?.commit?.commit?.tree?.sha;
  if (!treeSha) return [];
  const treeData = await ghApi(
    `/repos/${owner}/${repo}/git/trees/${treeSha}?recursive=1`,
    token,
  ) as { tree?: TreeNode[] };
  return Array.isArray(treeData?.tree) ? treeData.tree : [];
}

const SYSTEM_PROMPT = `You are Maestro's intake agent. Analyze the codebase
surface (tree + key files) and return JSON only:
{
  "stack": ["identified technologies"],
  "architecture_notes": "2-3 sentences on patterns",
  "risk_files": ["files that should not be modified without care"],
  "safe_zones": ["directories safe for new additions"],
  "estimated_complexity": "low | medium | high"
}`;

function parseIntake(raw: string): IntakeSummary {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fenced ? fenced[1].trim() : raw;
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const p = JSON.parse(match[0]);
      const complexity = p.estimated_complexity === "high" || p.estimated_complexity === "low"
        ? p.estimated_complexity
        : "medium";
      return {
        stack: Array.isArray(p.stack) ? p.stack.map(String) : [],
        architecture_notes: String(p.architecture_notes ?? ""),
        risk_files: Array.isArray(p.risk_files) ? p.risk_files.map(String) : [],
        safe_zones: Array.isArray(p.safe_zones) ? p.safe_zones.map(String) : [],
        estimated_complexity: complexity,
      };
    } catch { /* fall through */ }
  }
  return {
    stack: [],
    architecture_notes: raw.slice(0, 500),
    risk_files: [],
    safe_zones: [],
    estimated_complexity: "medium",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const auth = await requireAuthenticatedRequest(req, corsHeaders, "intake");
    if (auth instanceof Response) {
      return auth;
    }

    const { adminClient: supabase, userId } = auth;

    const body: IntakeRequest = await req.json();
    if (!body.session_id || !body.repo_connection_id) {
      return new Response(
        JSON.stringify({ error: "session_id and repo_connection_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: repoConn } = await supabase
      .from("repo_connections")
      .select("*")
      .eq("id", body.repo_connection_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!repoConn) {
      return new Response(JSON.stringify({ error: "Repo connection not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: ghSecret } = await supabase
      .from("encrypted_secrets")
      .select("encrypted_key")
      .eq("user_id", userId)
      .eq("provider", "github")
      .maybeSingle();
    if (!ghSecret) {
      return new Response(JSON.stringify({ error: "GitHub not connected" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: anthropicSecret } = await supabase
      .from("encrypted_secrets")
      .select("encrypted_key")
      .eq("user_id", userId)
      .eq("provider", "anthropic")
      .maybeSingle();
    if (!anthropicSecret) {
      return new Response(
        JSON.stringify({
          error: "ANTHROPIC_KEY_MISSING",
          message: "Intake scan requires an Anthropic API key. Add one in the Provider Vault.",
        }),
        { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const ghToken = ghSecret.encrypted_key as string;
    const anthropicKey = anthropicSecret.encrypted_key as string;
    const owner = repoConn.owner as string;
    const repo = repoConn.repo as string;
    const defaultBranch = (repoConn.default_branch as string) || "main";

    // 1. Tree
    let tree: TreeNode[] = [];
    try {
      tree = await getTree(owner, repo, defaultBranch, ghToken);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return new Response(
        JSON.stringify({ error: "TREE_FETCH_FAILED", message: msg }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Key files (best-effort, missing files are skipped)
    const keyFiles: Array<{ path: string; content: string }> = [];
    for (const path of KEY_FILES) {
      const content = await getKeyFile(owner, repo, defaultBranch, path, ghToken);
      if (content) keyFiles.push({ path, content });
    }

    // 3. Build the user message
    const treeSlice = tree.slice(0, 400).map(n => `${n.type === "tree" ? "[d] " : "    "}${n.path}`).join("\n");
    const keyFilesText = keyFiles
      .map(kf => `--- ${kf.path} ---\n${kf.content}`)
      .join("\n\n");
    const userMessage = `Repository: ${owner}/${repo} (default branch: ${defaultBranch})

File tree (truncated to 400 entries):
${treeSlice}

Key files:
${keyFilesText || "(none of README/package.json/requirements/pyproject/Cargo/go.mod/ARCHITECT.md found)"}`;

    // 4. Claude
    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      return new Response(
        JSON.stringify({
          error: "ANTHROPIC_REQUEST_FAILED",
          message: `Anthropic API ${anthropicResponse.status}: ${errText.slice(0, 500)}`,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const anthropicData = await anthropicResponse.json();
    const rawText: string = anthropicData?.content?.[0]?.text ?? "";
    const summary = parseIntake(rawText);

    // 5. Persist into sessions.build_spec — merge with existing
    const { data: sessRow } = await supabase
      .from("sessions")
      .select("build_spec")
      .eq("id", body.session_id)
      .maybeSingle();
    const existingSpec = (sessRow?.build_spec as Record<string, unknown> | null) ?? {};
    const newSpec = {
      ...existingSpec,
      intake_summary: summary,
      intake_completed_at: new Date().toISOString(),
    };
    const { error: updateError } = await supabase
      .from("sessions")
      .update({ build_spec: newSpec })
      .eq("id", body.session_id);
    if (updateError) {
      return new Response(
        JSON.stringify({
          error: "PERSIST_FAILED",
          message: updateError.message,
          intake_summary: summary,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ intake_summary: summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ error: "INTERNAL_ERROR", message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});





