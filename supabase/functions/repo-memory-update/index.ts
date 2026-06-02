import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { requireAuthenticatedRequest } from "../_shared/auth.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getDecryptedSecret } from "../_shared/secrets.ts";
import {
  buildSummarizePrompt,
  buildStrictSummarizePrompt,
  parseSummarizeOutput,
} from "../_shared/repo-memory-prompt.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function byteCount(str: string): number {
  return new TextEncoder().encode(str).length;
}

/** Trim "Recent Sessions" to at most `maxEntries` H3 blocks. */
function truncateRecentSessions(content: string, maxEntries: number): string {
  const lines = content.split("\n");
  const headerLine = lines.findIndex(
    (l) => l.trim().toLowerCase().startsWith("## recent sessions"),
  );
  if (headerLine === -1) return content;

  const nextSection = lines.findIndex(
    (l, i) => i > headerLine && l.startsWith("## "),
  );
  const sectionEnd = nextSection === -1 ? lines.length : nextSection;

  const sessionLines = lines.slice(headerLine + 1, sectionEnd);
  const entries: string[][] = [];
  let current: string[] = [];
  for (const line of sessionLines) {
    if (line.startsWith("- ") && current.length > 0) {
      entries.push(current);
      current = [line];
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) entries.push(current);

  const kept = entries.slice(-maxEntries).flat();
  return [
    ...lines.slice(0, headerLine + 1),
    ...kept,
    ...lines.slice(sectionEnd),
  ].join("\n");
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const auth = await requireAuthenticatedRequest(req, corsHeaders, "repo-memory-update");
    if (auth instanceof Response) return auth;
    const { adminClient, userId } = auth;

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // ── GET: fetch memory for a repo ──────────────────────────────────────────
    if (req.method === "GET" && action === "get") {
      const repoFullName = url.searchParams.get("repo_full_name")?.toLowerCase().trim();
      if (!repoFullName) {
        return new Response(
          JSON.stringify({ error: "repo_full_name is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { data, error } = await adminClient
        .from("repo_memory")
        .select("*")
        .eq("user_id", userId)
        .eq("repo_full_name", repoFullName)
        .maybeSingle();
      if (error) {
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ memory: data ?? null }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── POST: summarize, update_direct, forget ─────────────────────────────────
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = (await req.json()) as Record<string, unknown>;

    // ── forget: delete memory for a repo ──────────────────────────────────────
    if (action === "forget") {
      const repoFullName = (body.repo_full_name as string | undefined)?.toLowerCase().trim();
      if (!repoFullName) {
        return new Response(
          JSON.stringify({ error: "repo_full_name is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      await adminClient
        .from("repo_memory")
        .delete()
        .eq("user_id", userId)
        .eq("repo_full_name", repoFullName);
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── update_direct: write content directly (manual edit, no LLM) ───────────
    if (action === "update_direct") {
      const repoFullName = (body.repo_full_name as string | undefined)?.toLowerCase().trim();
      const content = (body.content as string | undefined) ?? "";
      const kind = (body.kind as string | undefined) ?? undefined;
      const relations = body.relations !== undefined ? body.relations : undefined;
      if (!repoFullName) {
        return new Response(
          JSON.stringify({ error: "repo_full_name is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const bytes = byteCount(content);
      const now = new Date().toISOString();
      const upsertPayload: Record<string, unknown> = {
        user_id: userId,
        repo_full_name: repoFullName,
        content,
        byte_count: bytes,
        updated_at: now,
      };
      if (kind !== undefined) upsertPayload.kind = kind;
      if (relations !== undefined) upsertPayload.relations = relations;
      await adminClient
        .from("repo_memory")
        .upsert(upsertPayload, { onConflict: "user_id,repo_full_name" });
      return new Response(JSON.stringify({ ok: true, byte_count: bytes }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── graph_update: set kind and/or relations without touching content ───────
    if (action === "graph_update") {
      const repoFullName = (body.repo_full_name as string | undefined)?.toLowerCase().trim();
      if (!repoFullName) {
        return new Response(
          JSON.stringify({ error: "repo_full_name is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.kind !== undefined) updatePayload.kind = body.kind;
      if (body.relations !== undefined) updatePayload.relations = body.relations;
      if (Object.keys(updatePayload).length === 1) {
        return new Response(
          JSON.stringify({ error: "At least one of kind or relations must be provided" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const { error: updateError } = await adminClient
        .from("repo_memory")
        .update(updatePayload)
        .eq("user_id", userId)
        .eq("repo_full_name", repoFullName);
      if (updateError) {
        return new Response(
          JSON.stringify({ error: updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── summarize: LLM-powered update ─────────────────────────────────────────
    if (action === "summarize") {
      const sessionId = body.session_id as string | undefined;
      let repoFullName = (body.repo_full_name as string | undefined)?.toLowerCase().trim();
      const sessionGoal = (body.session_goal as string | undefined) ?? "";
      const buildStatus = (body.build_status as string | undefined) ?? "";
      const keyDecisions = (body.key_decisions as string | undefined) ?? "";
      const userPreferences = (body.user_preferences as string | undefined) ?? "";

      // If session_id is provided, resolve repo_full_name from the session
      if (sessionId && !repoFullName) {
        const { data: sess } = await adminClient
          .from("sessions")
          .select("github_repo")
          .eq("id", sessionId)
          .maybeSingle();
        const rawRepo = (sess as { github_repo?: string } | null)?.github_repo?.trim();
        if (rawRepo) repoFullName = rawRepo.toLowerCase();
      }

      if (!repoFullName) {
        return new Response(
          JSON.stringify({ error: "repo_full_name or session_id with a bound repo is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Load Anthropic key (needed for Haiku summarization)
      const apiKey = await getDecryptedSecret(adminClient, userId, "anthropic");
      if (!apiKey) {
        return new Response(
          JSON.stringify({ error: "ANTHROPIC_KEY_MISSING", message: "Summarization requires an Anthropic API key." }),
          { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Load existing memory
      const { data: existing } = await adminClient
        .from("repo_memory")
        .select("content")
        .eq("user_id", userId)
        .eq("repo_full_name", repoFullName)
        .maybeSingle();
      const existingContent = (existing as { content?: string } | null)?.content ?? "";

      const summarizeInput = {
        repo_full_name: repoFullName,
        existing_content: existingContent,
        session_goal: sessionGoal,
        build_status: buildStatus,
        key_decisions: keyDecisions,
        user_preferences: userPreferences,
      };

      async function callHaiku(prompt: string): Promise<SummarizeOutputLocal | null> {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey!,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5",
            max_tokens: 2048,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.ok) return null;
        const data = await res.json();
        const rawText: string = (data as { content?: Array<{ text?: string }> })?.content?.[0]?.text ?? "";
        return parseSummarizeOutput(rawText) as SummarizeOutputLocal | null;
      }

      type SummarizeOutputLocal = Awaited<ReturnType<typeof parseSummarizeOutput>>;

      // Attempt 1: normal summarize
      let result = await callHaiku(buildSummarizePrompt(summarizeInput));
      let content = result?.content ?? "";
      let bytes = byteCount(content);

      // Attempt 2: strict compress if over cap
      if (bytes > 8192 && result) {
        result = await callHaiku(buildStrictSummarizePrompt(summarizeInput));
        content = result?.content ?? "";
        bytes = byteCount(content);
      }

      // Attempt 3: truncate Recent Sessions to 3 entries if still over cap
      if (bytes > 8192) {
        content = truncateRecentSessions(content, 3);
        bytes = byteCount(content);
      }

      if (!content) {
        // Log failure and return error — don't corrupt existing memory
        const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
        await serviceClient.from("audit_events").insert({
          user_id: userId,
          event_type: "repo_memory_update_failed",
          actor: "repo-memory-update",
          succeeded: false,
          metadata: { repo_full_name: repoFullName, reason: "haiku_parse_failed" },
        } as never);
        return new Response(
          JSON.stringify({ error: "Failed to parse summarize response from Haiku" }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const now = new Date().toISOString();
      await adminClient
        .from("repo_memory")
        .upsert({
          user_id: userId,
          repo_full_name: repoFullName,
          content,
          metadata: result?.metadata ?? {},
          byte_count: bytes,
          last_session_id: sessionId ?? null,
          last_summarized_at: now,
          updated_at: now,
        }, { onConflict: "user_id,repo_full_name" });

      return new Response(
        JSON.stringify({ ok: true, byte_count: bytes, summary_notes: result?.summary_notes ?? "" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: "Unknown action. Valid actions: get, summarize, update_direct, graph_update, forget" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[repo-memory-update]", err);
    return new Response(
      JSON.stringify({ error: "Internal server error", detail: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
