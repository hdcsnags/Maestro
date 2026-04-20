import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { logPermissionFailure, requireAuthenticatedRequest } from "../_shared/auth.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
interface ReadRequest {
  action: "get_tree" | "get_file";
  repo_connection_id: string;
  path?: string;        // for get_file
  ref?: string;         // branch/sha, defaults to repo default_branch
  recursive?: boolean;  // for get_tree, default true
}

async function ghApi(path: string, token: string) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "Maestro",
      Accept: "application/vnd.github+json",
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `GitHub API ${res.status}`);
  return data;
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const auth = await requireAuthenticatedRequest(req, corsHeaders, "github-read");
    if (auth instanceof Response) {
      return auth;
    }

    const { adminClient: supabase, userId } = auth;

    const body: ReadRequest = await req.json();
    const { action, repo_connection_id, path, ref, recursive } = body;

    const { data: repoConn } = await supabase
      .from("repo_connections")
      .select("*")
      .eq("id", repo_connection_id)
      .eq("user_id", userId)
      .maybeSingle();

    if (!repoConn) {
      return new Response(JSON.stringify({ error: "Repo connection not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: secret } = await supabase
      .from("encrypted_secrets")
      .select("encrypted_key")
      .eq("user_id", userId)
      .eq("provider", "github")
      .maybeSingle();

    if (!secret) {
      return new Response(JSON.stringify({ error: "GitHub not connected" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ghToken = secret.encrypted_key;
    const owner = repoConn.owner;
    const repo = repoConn.repo;
    const branch = ref || repoConn.default_branch || "main";

    if (action === "get_tree") {
      const recurse = recursive !== false ? "&recursive=1" : "";
      const data = await ghApi(
        `/repos/${owner}/${repo}/git/trees/${branch}?${recurse}`,
        ghToken
      );

      const tree = (data.tree || []).map((entry: Record<string, unknown>) => ({
        path: entry.path,
        type: entry.type,
        size: entry.size ?? null,
        sha: entry.sha,
      }));

      return new Response(JSON.stringify({ tree, truncated: data.truncated ?? false }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "get_file") {
      if (!path) {
        return new Response(JSON.stringify({ error: "path is required for get_file" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const data = await ghApi(
        `/repos/${owner}/${repo}/contents/${encodeURIComponent(path)}?ref=${branch}`,
        ghToken
      );

      let content = "";
      if (data.encoding === "base64" && data.content) {
        content = atob(data.content.replace(/\n/g, ""));
      } else {
        content = data.content ?? "";
      }

      return new Response(JSON.stringify({
        path: data.path,
        name: data.name,
        size: data.size,
        sha: data.sha,
        content,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else {
      return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});







