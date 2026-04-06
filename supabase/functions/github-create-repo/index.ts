import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

/**
 * github-create-repo
 *
 * Creates a new repository on the user's GitHub account using their stored
 * PAT, then immediately seeds it with a single README so the default
 * branch exists and can be cloned/PR'd against. Returns the parsed repo
 * shape the client uses elsewhere (full_name, owner, name, default_branch).
 *
 * Body: { name: string, description?: string, private?: boolean }
 *
 * Auth: same pattern as github-repos. Verifies the caller via
 * supabase.auth.getUser(token), then loads their PAT from
 * encrypted_secrets where provider='github'.
 *
 * Deploy:  npx supabase functions deploy github-create-repo --no-verify-jwt
 */

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

    const body = await req.json().catch(() => ({}));
    const repoName = (body.name ?? "").trim();
    const description = (body.description ?? "Created by Maestro").toString();
    const isPrivate = body.private !== false; // default true

    if (!repoName || !/^[a-zA-Z0-9._-]+$/.test(repoName)) {
      return new Response(
        JSON.stringify({ error: "Invalid repo name. Use letters, numbers, dots, dashes, underscores." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    // 1. Create the repo. auto_init seeds an initial commit so the default
    //    branch exists immediately — without it, the repo is empty and
    //    PR/branch operations 404 on first use.
    const createRes = await fetch("https://api.github.com/user/repos", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ghToken}`,
        "User-Agent": "Maestro",
        Accept: "application/vnd.github+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: repoName,
        description,
        private: isPrivate,
        auto_init: true,
      }),
    });

    if (!createRes.ok) {
      const errData = await createRes.json().catch(() => ({}));
      return new Response(
        JSON.stringify({ error: errData.message || "Failed to create repo on GitHub" }),
        { status: createRes.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const created = await createRes.json();
    const repo = {
      full_name: created.full_name,
      owner: created.owner?.login ?? "",
      name: created.name,
      default_branch: created.default_branch ?? "main",
      private: created.private,
      description: created.description ?? "",
    };

    return new Response(JSON.stringify({ repo }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
