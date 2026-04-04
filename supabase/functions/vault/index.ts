import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (req.method === "GET" && action === "list") {
      const { data: connections } = await supabase
        .from("provider_connections")
        .select("*")
        .eq("user_id", user.id);

      return new Response(JSON.stringify({ connections: connections ?? [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (req.method === "POST" && action === "save_key") {
      const body = await req.json();
      const { provider, display_name, api_key, models } = body;

      if (!provider || !api_key) {
        return new Response(
          JSON.stringify({ error: "provider and api_key are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const keyHint =
        api_key.substring(0, 4) + "..." + api_key.substring(api_key.length - 4);

      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient = createClient(supabaseUrl, serviceKey);

      const { data: existingSecret } = await adminClient
        .from("encrypted_secrets")
        .select("id")
        .eq("user_id", user.id)
        .eq("provider", provider)
        .maybeSingle();

      if (existingSecret) {
        await adminClient
          .from("encrypted_secrets")
          .update({
            encrypted_key: api_key,
            key_hint: keyHint,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingSecret.id);
      } else {
        await adminClient.from("encrypted_secrets").insert({
          user_id: user.id,
          provider,
          encrypted_key: api_key,
          key_hint: keyHint,
        });
      }

      const { data: existingConn } = await supabase
        .from("provider_connections")
        .select("id")
        .eq("user_id", user.id)
        .eq("provider", provider)
        .maybeSingle();

      let connection;
      if (existingConn) {
        const { data } = await supabase
          .from("provider_connections")
          .update({
            is_connected: true,
            display_name: display_name || provider,
            models: models || [],
            updated_at: new Date().toISOString(),
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
            provider,
            display_name: display_name || provider,
            is_connected: true,
            models: models || [],
          })
          .select()
          .maybeSingle();
        connection = data;
      }

      return new Response(
        JSON.stringify({ success: true, connection, key_hint: keyHint }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (req.method === "POST" && action === "remove_key") {
      const body = await req.json();
      const { provider } = body;

      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient = createClient(supabaseUrl, serviceKey);

      await adminClient
        .from("encrypted_secrets")
        .delete()
        .eq("user_id", user.id)
        .eq("provider", provider);

      await supabase
        .from("provider_connections")
        .update({ is_connected: false, updated_at: new Date().toISOString() })
        .eq("user_id", user.id)
        .eq("provider", provider);

      const { data: updatedConn } = await supabase
        .from("provider_connections")
        .select("*")
        .eq("user_id", user.id)
        .eq("provider", provider)
        .maybeSingle();

      return new Response(
        JSON.stringify({ success: true, connection: updatedConn }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
