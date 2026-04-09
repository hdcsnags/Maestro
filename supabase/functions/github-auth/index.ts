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
    const url = new URL(req.url);
    const action = url.searchParams.get("action");

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

    if (action === "get_auth_url") {
      const clientId = Deno.env.get("GITHUB_CLIENT_ID");
      if (!clientId) {
        return new Response(JSON.stringify({ error: "GitHub App not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const state = crypto.randomUUID();
      const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=repo&state=${state}`;

      return new Response(JSON.stringify({ auth_url: authUrl, state }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "exchange_code") {
      const body = await req.json();
      const { code } = body;

      if (!code) {
        return new Response(JSON.stringify({ error: "Missing code parameter" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const clientId = Deno.env.get("GITHUB_CLIENT_ID");
      const clientSecret = Deno.env.get("GITHUB_CLIENT_SECRET");

      if (!clientId || !clientSecret) {
        return new Response(JSON.stringify({ error: "GitHub App not configured" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        return new Response(JSON.stringify({ error: tokenData.error_description || tokenData.error }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const accessToken = tokenData.access_token;

      // Validate the granted scopes — GitHub returns the actual granted
      // scopes in the X-OAuth-Scopes response header. Fail loud if 'repo'
      // is missing so the user knows private repos won't appear.
      const ghUserRes = await fetch("https://api.github.com/user", {
        headers: { Authorization: `Bearer ${accessToken}`, "User-Agent": "Maestro" },
      });
      const grantedScopes = (ghUserRes.headers.get("x-oauth-scopes") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (!grantedScopes.includes("repo")) {
        return new Response(
          JSON.stringify({
            error: "INSUFFICIENT_SCOPE",
            message: `GitHub returned scopes [${grantedScopes.join(", ") || "none"}] but Maestro requires "repo" for private repository access. Re-authorize and approve the full repo permission.`,
            granted_scopes: grantedScopes,
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const ghUser = await ghUserRes.json();

      const { data: existing } = await supabase
        .from("encrypted_secrets")
        .select("id")
        .eq("user_id", user.id)
        .eq("provider", "github")
        .maybeSingle();

      if (existing) {
        await supabase
          .from("encrypted_secrets")
          .update({
            encrypted_key: accessToken,
            key_hint: `github:${ghUser.login}`,
          })
          .eq("id", existing.id);
      } else {
        await supabase
          .from("encrypted_secrets")
          .insert({
            user_id: user.id,
            provider: "github",
            encrypted_key: accessToken,
            key_hint: `github:${ghUser.login}`,
          });
      }

      const { data: existingConn } = await supabase
        .from("provider_connections")
        .select("id")
        .eq("user_id", user.id)
        .eq("provider", "github")
        .maybeSingle();

      let connection;
      if (existingConn) {
        const { data } = await supabase
          .from("provider_connections")
          .update({
            display_name: `GitHub (${ghUser.login})`,
            is_connected: true,
            models: [],
          })
          .eq("id", existingConn.id)
          .select()
          .maybeSingle();
        connection = data;
      } else {
        const { data } = await supabase
          .from("provider_connections")
          .insert({
            user_id: user.id,
            provider: "github",
            display_name: `GitHub (${ghUser.login})`,
            is_connected: true,
            models: [],
          })
          .select()
          .maybeSingle();
        connection = data;
      }

      return new Response(JSON.stringify({
        success: true,
        github_user: ghUser.login,
        connection,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "check_status") {
      const { data: secret } = await supabase
        .from("encrypted_secrets")
        .select("id, encrypted_key, key_hint")
        .eq("user_id", user.id)
        .eq("provider", "github")
        .maybeSingle();

      if (!secret) {
        return new Response(JSON.stringify({ connected: false, hint: null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Live-validate the token against GitHub. A row in encrypted_secrets is
      // not proof the token still works — it can be revoked, expired, or
      // rotated server-side. We also check that the granted scopes still
      // include 'repo' — older tokens issued under a weaker scope should be
      // treated as disconnected so the user is forced to re-authorize.
      let live = false;
      let hasRepoScope = false;
      try {
        const probe = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${secret.encrypted_key}`,
            "User-Agent": "Maestro",
            Accept: "application/vnd.github+json",
          },
        });
        live = probe.ok;
        const scopes = (probe.headers.get("x-oauth-scopes") ?? "")
          .split(",")
          .map((s) => s.trim());
        hasRepoScope = scopes.includes("repo");
      } catch { live = false; }

      if (!live || !hasRepoScope) {
        await supabase
          .from("provider_connections")
          .update({ is_connected: false })
          .eq("user_id", user.id)
          .eq("provider", "github");
        return new Response(JSON.stringify({
          connected: false,
          hint: secret.key_hint ?? null,
          reason: !live ? "token_invalid" : "insufficient_scope",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      return new Response(JSON.stringify({
        connected: true,
        hint: secret.key_hint ?? null,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "disconnect") {
      // Manual recovery / clean reconnect path. Drops the stored token and
      // flips the connection row so the UI returns to the Connect state.
      await supabase
        .from("encrypted_secrets")
        .delete()
        .eq("user_id", user.id)
        .eq("provider", "github");
      await supabase
        .from("provider_connections")
        .update({ is_connected: false })
        .eq("user_id", user.id)
        .eq("provider", "github");
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
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
