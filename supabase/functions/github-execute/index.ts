import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AgentPatch {
  agent_name: string;
  agent_id: string;
  content: string;
  scoped_paths: string[];
  commit_message: string;
}

interface ExecuteRequest {
  mode: "per_agent" | "synthesized";
  repo_connection_id: string;
  execution_run_id: string;
  patches: AgentPatch[];
  synthesis_content?: string;
  commit_message?: string;
}

async function ghApi(path: string, token: string, options: RequestInit = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "Maestro",
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `GitHub API ${res.status}`);
  return data;
}

async function createBranch(owner: string, repo: string, branchName: string, baseSha: string, token: string) {
  return ghApi(`/repos/${owner}/${repo}/git/refs`, token, {
    method: "POST",
    body: JSON.stringify({ ref: `refs/heads/${branchName}`, sha: baseSha }),
  });
}

async function createFileCommit(owner: string, repo: string, branch: string, path: string, content: string, message: string, token: string) {
  const encoded = btoa(unescape(encodeURIComponent(content)));

  let existingSha: string | undefined;
  try {
    const existing = await ghApi(`/repos/${owner}/${repo}/contents/${path}?ref=${branch}`, token);
    existingSha = existing.sha;
  } catch { /* file doesn't exist */ }

  const body: Record<string, unknown> = {
    message,
    content: encoded,
    branch,
  };
  if (existingSha) body.sha = existingSha;

  return ghApi(`/repos/${owner}/${repo}/contents/${path}`, token, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

async function createPR(owner: string, repo: string, head: string, base: string, title: string, body: string, token: string) {
  return ghApi(`/repos/${owner}/${repo}/pulls`, token, {
    method: "POST",
    body: JSON.stringify({ title, body, head, base }),
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: ExecuteRequest = await req.json();
    const { mode, repo_connection_id, execution_run_id, patches, synthesis_content, commit_message } = body;

    const { data: repoConn } = await supabase
      .from("repo_connections")
      .select("*")
      .eq("id", repo_connection_id)
      .eq("user_id", user.id)
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
      .eq("user_id", user.id)
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
    const defaultBranch = repoConn.default_branch || "main";

    await supabase
      .from("execution_runs")
      .update({ status: "running" })
      .eq("id", execution_run_id);

    const baseRef = await ghApi(`/repos/${owner}/${repo}/git/ref/heads/${defaultBranch}`, ghToken);
    const baseSha = baseRef.object.sha;

    const result: Record<string, unknown> = { branches: [], prs: [] };

    if (mode === "per_agent") {
      const branches: Array<{ agent: string; branch: string; pr_url: string }> = [];

      for (const patch of patches) {
        const slug = patch.agent_name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
        const branchName = `maestro/${slug}/run-${execution_run_id.slice(0, 8)}`;

        await createBranch(owner, repo, branchName, baseSha, ghToken);

        const filePath = `maestro-patches/${slug}-patch.md`;
        await createFileCommit(
          owner, repo, branchName, filePath, patch.content,
          patch.commit_message || `[Maestro] ${patch.agent_name} contribution`,
          ghToken
        );

        const pr = await createPR(
          owner, repo, branchName, defaultBranch,
          `[Maestro] ${patch.agent_name}: ${patch.commit_message || "Agent contribution"}`,
          `## ${patch.agent_name} -- Society of Mind\n\n${patch.content}\n\n---\n*Generated by Maestro orchestration*`,
          ghToken
        );

        branches.push({ agent: patch.agent_name, branch: branchName, pr_url: pr.html_url });
      }

      result.branches = branches;
      result.prs = branches.map(b => b.pr_url);

      await supabase
        .from("execution_runs")
        .update({
          status: "complete",
          result,
          branch_name: branches.map(b => b.branch).join(", "),
          pr_url: branches.map(b => b.pr_url).join(", "),
        })
        .eq("id", execution_run_id);

    } else {
      const branchName = `maestro/synthesis/run-${execution_run_id.slice(0, 8)}`;

      await createBranch(owner, repo, branchName, baseSha, ghToken);

      const content = synthesis_content || patches.map(p => p.content).join("\n\n---\n\n");
      const filePath = "maestro-patches/synthesis-patch.md";

      await createFileCommit(
        owner, repo, branchName, filePath, content,
        commit_message || "[Maestro] Synthesized patch",
        ghToken
      );

      const pr = await createPR(
        owner, repo, branchName, defaultBranch,
        commit_message || "[Maestro] Synthesized council output",
        `## Council Synthesis\n\n${content}\n\n---\n*Generated by Maestro orchestration*`,
        ghToken
      );

      result.branches = [{ branch: branchName, pr_url: pr.html_url }];
      result.prs = [pr.html_url];

      await supabase
        .from("execution_runs")
        .update({
          status: "complete",
          result,
          branch_name: branchName,
          pr_url: pr.html_url,
        })
        .eq("id", execution_run_id);
    }

    return new Response(JSON.stringify({ success: true, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    try {
      const body = await req.clone().json().catch(() => ({})) as Record<string, string>;
      if (body.execution_run_id) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        await supabase
          .from("execution_runs")
          .update({ status: "failed", result: { error: message } })
          .eq("id", body.execution_run_id);
      }
    } catch { /* best effort */ }

    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
