import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { requireAuthenticatedRequest, respondInternalError } from "../_shared/auth.ts";

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
    const auth = await requireAuthenticatedRequest(req, corsHeaders, "audit-log");
    if (auth instanceof Response) {
      return auth;
    }

    const { adminClient, userId } = auth;
    const body = await req.json();

    const eventType =
      typeof body.event_type === "string" ? body.event_type.trim() : "";
    const actor = typeof body.actor === "string" ? body.actor.trim() : "";

    if (!eventType || !actor) {
      return new Response(
        JSON.stringify({ error: "event_type and actor are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data, error } = await adminClient
      .from("audit_events")
      .insert({
        user_id: userId,
        session_id:
          typeof body.session_id === "string" && body.session_id.trim().length > 0
            ? body.session_id
            : null,
        event_type: eventType,
        actor,
        provider:
          typeof body.provider === "string" ? body.provider : "",
        model:
          typeof body.model === "string" ? body.model : "",
        execution_mode:
          typeof body.execution_mode === "string" ? body.execution_mode : "",
        requires_approval: body.requires_approval === true,
        succeeded: body.succeeded !== false,
      })
      .select()
      .maybeSingle();

    if (error || !data) {
      throw error ?? new Error("Failed to insert audit event");
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return respondInternalError("audit-log", corsHeaders, error);
  }
});
