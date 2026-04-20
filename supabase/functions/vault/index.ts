import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireAuthenticatedRequest, respondInternalError } from "../_shared/auth.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { upsertEncryptedSecret } from "../_shared/secrets.ts";

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const auth = await requireAuthenticatedRequest(req, corsHeaders, "vault");
    if (auth instanceof Response) {
      return auth;
    }

    const { adminClient, userClient: supabase, userId } = auth;

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (req.method === "GET" && action === "list") {
      const { data: connections } = await supabase
        .from("provider_connections")
        .select("*")
        .eq("user_id", userId);

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

      await upsertEncryptedSecret(adminClient, {
        userId,
        provider,
        secret: api_key,
        keyHint,
      });

      const { data: existingConn } = await supabase
        .from("provider_connections")
        .select("id")
        .eq("user_id", userId)
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
            user_id: userId,
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

      await adminClient
        .from("encrypted_secrets")
        .delete()
        .eq("user_id", userId)
        .eq("provider", provider);

      await supabase
        .from("provider_connections")
        .update({ is_connected: false, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("provider", provider);

      const { data: updatedConn } = await supabase
        .from("provider_connections")
        .select("*")
        .eq("user_id", userId)
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
    return respondInternalError("vault", corsHeaders, err);
  }
});


