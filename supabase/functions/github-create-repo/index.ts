import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { logPermissionFailure, requireAuthenticatedRequest } from "../_shared/auth.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const auth = await requireAuthenticatedRequest(req, corsHeaders, "github-create-repo");
    if (auth instanceof Response) {
      return auth;
    }

    const { adminClient: supabase, userId } = auth;

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







