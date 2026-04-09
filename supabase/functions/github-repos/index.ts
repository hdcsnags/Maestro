import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

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

    const { data: secret } = await supabase
      .from("encrypted_secrets")
      .select("encrypted_key")
      .eq("user_id", user.id)
      .eq("provider", "github")
      .maybeSingle();

    if (!secret) {
      return new Response(JSON.stringify({ error: "GitHub not connected", repos: [] }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ghToken = secret.encrypted_key;

    const allRawRepos: Record<string, unknown>[] = [];
    let page = 1;
    const maxPages = 10; // safety cap: 1000 repos max

    while (page <= maxPages) {
      const ghResponse = await fetch(
        `https://api.github.com/user/repos?per_page=100&page=${page}&sort=updated&direction=desc&visibility=all&affiliation=owner,collaborator,organization_member`,
        {
          headers: {
            Authorization: `Bearer ${ghToken}`,
            "User-Agent": "Maestro",
            Accept: "application/vnd.github+json",
          },
        }
      );

      if (!ghResponse.ok) {
        const errData = await ghResponse.json();
        // If GitHub rejects the stored token, the row in encrypted_secrets is
        // dead. Flip the connection row so the UI surfaces a Reconnect button
        // instead of leaving the Vault green and the user stuck.
        if (ghResponse.status === 401) {
          await supabase
            .from("provider_connections")
            .update({ is_connected: false })
            .eq("user_id", user.id)
            .eq("provider", "github");
        }
        return new Response(JSON.stringify({
          error: errData.message || "GitHub API error",
          code: ghResponse.status === 401 ? "GITHUB_TOKEN_INVALID" : undefined,
          repos: [],
        }), {
          status: ghResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const pageRepos = await ghResponse.json();
      allRawRepos.push(...pageRepos);

      // Stop if this page returned fewer than 100 (last page)
      if (pageRepos.length < 100) break;
      page++;
    }

    const repos = allRawRepos.map((r) => ({
      full_name: r.full_name,
      owner: (r.owner as Record<string, unknown>)?.login ?? "",
      name: r.name,
      default_branch: r.default_branch ?? "main",
      private: r.private,
      description: r.description ?? "",
      updated_at: r.updated_at,
    }));

    return new Response(JSON.stringify({ repos }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message, repos: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
