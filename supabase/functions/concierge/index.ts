import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { logPermissionFailure, requireAuthenticatedRequest } from "../_shared/auth.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

type Phase = "post_round1" | "post_round2" | "design" | "pre_build" | "post_build" | "pre_build_complete";
type Intent = "simple_ask" | "product_build" | "ui_heavy" | "existing_repo_change" | "new_project";
type DesignMode = "none" | "lite" | "standard" | "exploration";
type NextPhase = "analysis" | "design" | "pre_build" | "build";

interface ConciergeRequest {
  session_id: string;
  phase: Phase;
  responses: Array<{
    agent_name: string;
    content: string;
    signals?: Record<string, string | undefined>;
  }>;
  synthesis?: string | null;
}

interface IntentClassification {
  intent: Intent;
  design_mode: DesignMode;
  recommended_next_phase: NextPhase;
  reasoning: string;
}

interface ConciergeResult {
  alignment_summary: string;
  tension_points: string[];
  recommended_direction: string;
  intent: Intent | null;
  design_mode: DesignMode | null;
  recommended_next_phase: NextPhase | null;
  intent_reasoning: string | null;
  applied_phase: NextPhase | null;
  model_used: string;
}

const SYSTEM_PROMPT = `You are Concierge, the synthesis and guidance agent for Maestro.
Synthesize the council's responses into a clear, actionable summary.

1. Identify where agents agree (alignment)
2. Identify where agents disagree or contradict (tension)
3. Provide a clear recommended direction

Return JSON only:
{
  "alignment_summary": "2-3 sentences on consensus",
  "tension_points": ["disagreement 1", "disagreement 2"],
  "recommended_direction": "clear actionable recommendation"
}`;

function pickModel(req: ConciergeRequest): string {
  if (req.phase === "pre_build") return "claude-sonnet-4-6";
  const totalTokens = req.responses.reduce(
    (sum, r) => sum + Math.ceil((r.content?.length ?? 0) / 4),
    0,
  );
  if (totalTokens > 8000) return "claude-sonnet-4-6";
  return "claude-haiku-4-5";
}

function buildUserMessage(req: ConciergeRequest): string {
  const lines: string[] = [];
  lines.push(`Phase: ${req.phase}`);
  if (req.synthesis) {
    lines.push("\n--- Existing Synthesis ---");
    lines.push(req.synthesis);
  }
  lines.push("\n--- Council Responses ---");
  for (const r of req.responses) {
    lines.push(`\n[${r.agent_name}]`);
    if (r.signals) {
      const sig = Object.entries(r.signals)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}: ${v}`)
        .join(" · ");
      if (sig) lines.push(`Signals: ${sig}`);
    }
    lines.push(r.content);
  }
  return lines.join("\n");
}

interface BuildLaneSummary {
  agent_id: string | null;
  agent_name: string;
  lane_paths: string[];
  role: string;
}

interface BuildPlanPayload {
  build_prompt: string;
  build_summary: string;
  builder_agents: Array<{
    agent_id: string;
    agent_name: string;
    scoped_paths: string[];
    instruction: string;
  }>;
}

function buildDeterministicBuildPlan(
  projectTitle: string,
  _architectMd: string,
  builders: BuildLaneSummary[],
): BuildPlanPayload {
  // NOTE: Do NOT embed architectMd in build_prompt. The orchestrate edge function
  // already injects the full ARCHITECT.MD into the system prompt for build-mode
  // requests (orchestrate/index.ts). Embedding it again in the user message doubles
  // the context, producing prompts that exceed provider token budgets and 504.
  return {
    build_prompt: `BUILD MODE — Building ${projectTitle}.\n\nReturn JSON only. Include COMPLETE file contents in every file_manifest entry — no "// ... existing code ..." or similar placeholders. Work ONLY within your assigned lane paths.\n\nIf you cannot finish all assigned files in one response, set "complete": false and write a "continuation_prompt" describing exactly which files still need to be generated.`,
    build_summary: `Building ${projectTitle} with ${builders.length} builder agent${builders.length === 1 ? "" : "s"}. Each builder is scoped to lane-specific paths and must return complete file contents in file_manifest entries for conductor review before execution.`,
    builder_agents: builders.map((builder) => ({
      agent_id: builder.agent_id ?? "",
      agent_name: builder.agent_name,
      scoped_paths: builder.lane_paths,
      instruction: `Build only the files in: ${builder.lane_paths.join(", ") || "your assigned lane paths"}`,
    })),
  };
}

const CLASSIFY_SYSTEM_PROMPT = `You classify a user's request into a routing intent so Maestro can pick the right next phase.

Return JSON only:
{
  "intent": "simple_ask | product_build | ui_heavy | existing_repo_change | new_project",
  "design_mode": "none | lite | standard | exploration",
  "recommended_next_phase": "analysis | design | pre_build | build",
  "reasoning": "1-2 sentences explaining the routing decision"
}

Rules:
- simple_ask: a direct question or single-agent task → next_phase 'analysis', design_mode 'none'
- ui_heavy: visual / UX / branding work → next_phase 'design', design_mode defaults 'standard'
- product_build: real product/app build, no major UI exploration needed → next_phase 'pre_build', design_mode 'none'
- existing_repo_change: modifying an existing codebase → next_phase 'pre_build', design_mode 'none'
- new_project: greenfield repo creation → next_phase 'pre_build', design_mode 'none'

Design mode tiers:
- lite (1 designer): simple UI tweaks, internal tools, low-risk layouts
- standard (2 designers): most app/site builds — DEFAULT for ui_heavy
- exploration (4 designers): high-importance visual projects, branding, consumer UX, or explicit conductor request`;

const VALID_INTENTS: Intent[] = ["simple_ask", "product_build", "ui_heavy", "existing_repo_change", "new_project"];
const VALID_MODES: DesignMode[] = ["none", "lite", "standard", "exploration"];
const VALID_PHASES: NextPhase[] = ["analysis", "design", "pre_build", "build"];

function parseClassification(raw: string): IntentClassification | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fenced ? fenced[1].trim() : raw;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const p = JSON.parse(match[0]);
    const intent = VALID_INTENTS.includes(p.intent) ? p.intent : null;
    const design_mode = VALID_MODES.includes(p.design_mode) ? p.design_mode : null;
    const next_phase = VALID_PHASES.includes(p.recommended_next_phase) ? p.recommended_next_phase : null;
    if (!intent || !design_mode || !next_phase) return null;
    return {
      intent,
      design_mode,
      recommended_next_phase: next_phase,
      reasoning: String(p.reasoning ?? ""),
    };
  } catch {
    return null;
  }
}

async function classifyIntent(
  apiKey: string,
  model: string,
  userMessage: string,
): Promise<IntentClassification | null> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      system: CLASSIFY_SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const text: string = data?.content?.[0]?.text ?? "";
  return parseClassification(text);
}

function parseConcierge(raw: string): Pick<ConciergeResult, "alignment_summary" | "tension_points" | "recommended_direction"> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fenced ? fenced[1].trim() : raw;
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      return {
        alignment_summary: String(parsed.alignment_summary ?? ""),
        tension_points: Array.isArray(parsed.tension_points)
          ? parsed.tension_points.map(String)
          : [],
        recommended_direction: String(parsed.recommended_direction ?? ""),
      };
    } catch { /* fall through */ }
  }
  return {
    alignment_summary: raw.slice(0, 500),
    tension_points: [],
    recommended_direction: "Manual review required — concierge could not parse structured response.",
  };
}

async function getUserApiKey(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  provider: string,
): Promise<string | null> {
  const { data } = await adminClient
    .from("encrypted_secrets")
    .select("encrypted_key")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  return (data?.encrypted_key as string | undefined) ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const auth = await requireAuthenticatedRequest(req, corsHeaders, "concierge");
    if (auth instanceof Response) {
      return auth;
    }

    const { adminClient, userId } = auth;

    const body: ConciergeRequest = await req.json();
    // pre_build_complete doesn't need responses — it reads architect_md + build_lanes directly
    if (!body.session_id || !body.phase || (body.phase !== "pre_build_complete" && !Array.isArray(body.responses))) {
      return new Response(
        JSON.stringify({ error: "Invalid request: session_id, phase, and responses required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = await getUserApiKey(adminClient, userId, "anthropic");
    if (!apiKey && body.phase !== "pre_build_complete") {
      // Fail loud — no silent provider fallback. User must add an Anthropic key.
      return new Response(
        JSON.stringify({
          error: "ANTHROPIC_KEY_MISSING",
          message: "Concierge requires an Anthropic API key. Add one in the Provider Vault to enable synthesis guidance.",
        }),
        { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Sprint C · C2 — Concierge-triggered build planning.
    // When phase is pre_build_complete, read architect_md + build_lanes and
    // generate a scoped build prompt. Short-circuits the normal synthesis flow.
    if (body.phase === "pre_build_complete") {
      const { data: sessionData } = await adminClient
        .from("sessions")
        .select("architect_md, title")
        .eq("id", body.session_id)
        .maybeSingle();

      const architectMd = (sessionData as { architect_md?: string } | null)?.architect_md ?? "";
      const projectTitle = (sessionData as { title?: string } | null)?.title ?? "Untitled";

      const { data: laneData } = await adminClient
        .from("build_lanes")
        .select("agent_id, agent_name, lane_paths, role")
        .eq("session_id", body.session_id);

      const lanes = (laneData ?? []) as BuildLaneSummary[];
      const builders = lanes.filter((l) => l.role === "builder");

      if (builders.length === 0 || !architectMd) {
        return new Response(
          JSON.stringify({
            error: "BUILD_NOT_READY",
            message: builders.length === 0
              ? "No builder lanes assigned. Generate Architect.md first."
              : "No Architect.md found. Generate the scaffold first.",
          }),
          { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const fallbackPlan = buildDeterministicBuildPlan(projectTitle, architectMd, builders);
      const buildModel = "claude-sonnet-4-6";
      let buildPlan: BuildPlanPayload = fallbackPlan;
      let modelUsed = "deterministic-fallback";
      let warning: string | undefined;

      if (!apiKey) {
        warning = "Concierge used a deterministic build plan because no Anthropic key was available.";
      } else {
        const buildPlanPrompt = `You are Maestro's Concierge preparing a build plan for builder agents.

IMPORTANT: Builder agents already receive the full ARCHITECT.MD in their system context — do NOT embed, quote, or summarise it in the build_prompt field. The build_prompt will be sent as the user message to each builder agent alongside their system-injected architecture.

The build_prompt must be concise (under 100 words) and cover ONLY:
- What mode they are in (BUILD MODE — building <project>)
- Output format requirements (JSON only, complete file contents in file_manifest, no placeholders)
- The continuation protocol (set complete:false + continuation_prompt if they cannot finish all files)

Also produce a brief build_summary (2-3 sentences) for the conductor to review before approving.
And a one-sentence per-agent instruction scoped to each agent's specific lane paths.

Return JSON only:
{
  "build_prompt": "Concise build instructions — under 100 words. No ARCHITECT.MD content.",
  "build_summary": "2-3 sentence summary of what will be built, for conductor approval.",
  "builder_agents": [
    { "agent_id": "...", "agent_name": "...", "scoped_paths": ["..."], "instruction": "1 sentence specific to this agent's lane files" }
  ]
}`;

        const builderList = builders
          .map((b) => `- ${b.agent_name} (${b.role}): ${b.lane_paths.join(", ")}`)
          .join("\n");

        const buildUserMsg = `Project: ${projectTitle}

--- ARCHITECT.MD ---
${architectMd}

--- BUILDER LANES ---
${builderList}

Generate the build plan.`;

        try {
          const buildRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: buildModel,
              max_tokens: 2048,
              system: buildPlanPrompt,
              messages: [{ role: "user", content: buildUserMsg }],
            }),
          });

          if (!buildRes.ok) {
            const errText = await buildRes.text();
            console.warn("[concierge] build plan fallback after Anthropic error", {
              status: buildRes.status,
              body: errText.slice(0, 300),
              session_id: body.session_id,
            });
            warning = `Concierge fell back to a deterministic build plan after Anthropic returned ${buildRes.status}.`;
          } else {
            const buildData = await buildRes.json();
            const buildRaw: string = buildData?.content?.[0]?.text ?? "";
            const fenced = buildRaw.match(/```(?:json)?\s*([\s\S]*?)```/);
            const jsonText = fenced ? fenced[1].trim() : buildRaw;
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);

            try {
              const parsed = JSON.parse(jsonMatch?.[0] ?? "{}") as Partial<BuildPlanPayload>;
              buildPlan = {
                build_prompt: typeof parsed.build_prompt === "string" && parsed.build_prompt.trim().length > 0
                  ? parsed.build_prompt
                  : fallbackPlan.build_prompt,
                build_summary: typeof parsed.build_summary === "string" && parsed.build_summary.trim().length > 0
                  ? parsed.build_summary
                  : fallbackPlan.build_summary,
                builder_agents: fallbackPlan.builder_agents.map((builder) => {
                  const planned = Array.isArray(parsed.builder_agents)
                    ? parsed.builder_agents.find((candidate) =>
                      candidate?.agent_name === builder.agent_name
                      || candidate?.agent_name?.toLowerCase().includes(builder.agent_name.toLowerCase()))
                    : null;
                  return {
                    agent_id: builder.agent_id,
                    agent_name: builder.agent_name,
                    scoped_paths: builder.scoped_paths,
                    instruction: typeof planned?.instruction === "string" && planned.instruction.trim().length > 0
                      ? planned.instruction
                      : builder.instruction,
                  };
                }),
              };
              modelUsed = buildModel;
              if (!buildPlan.build_prompt.trim()) {
                buildPlan.build_prompt = fallbackPlan.build_prompt;
              }
            } catch (parseError) {
              console.warn("[concierge] build plan fallback after parse error", { session_id: body.session_id, error: String(parseError) });
              warning = "Concierge fell back to a deterministic build plan after returning malformed JSON.";
            }
          }
        } catch (fetchError) {
          console.warn("[concierge] build plan fallback after fetch failure", { session_id: body.session_id, error: String(fetchError) });
          warning = "Concierge fell back to a deterministic build plan after a build-planning request failed.";
        }
      }

      return new Response(
        JSON.stringify({
          phase: "pre_build_complete",
          build_prompt: buildPlan.build_prompt,
          build_summary: buildPlan.build_summary,
          builder_agents: buildPlan.builder_agents,
          model_used: modelUsed,
          ...(warning ? { warning } : {}),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const model = pickModel(body);
    const userMessage = buildUserMessage(body);

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      return new Response(
        JSON.stringify({
          error: "ANTHROPIC_REQUEST_FAILED",
          message: `Anthropic API returned ${anthropicResponse.status}: ${errText.slice(0, 500)}`,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const anthropicData = await anthropicResponse.json();
    const rawText: string = anthropicData?.content?.[0]?.text ?? "";
    const parsed = parseConcierge(rawText);

    // Second pass — intent classification (non-fatal if it fails)
    const classification = await classifyIntent(apiKey, model, userMessage);

    // Sprint B · B5.3 — when recommended next phase is build and no lanes
    // exist yet, ask the model for a suggested lane assignment and stash
    // it in sessions.build_spec.suggested_lanes for the frontend to apply.
    if (classification?.recommended_next_phase === "build") {
      const { data: existingLanes } = await adminClient
        .from("build_lanes")
        .select("id")
        .eq("session_id", body.session_id)
        .limit(1);
      if (!existingLanes || existingLanes.length === 0) {
        try {
          const laneRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model,
              max_tokens: 1024,
              system: `You suggest non-overlapping build lane assignments for a council of agents.
Return JSON only:
{
  "suggested_lanes": [
    { "agent_name": "...", "lane_paths": ["src/..."], "role": "builder" }
  ]
}
Roles: builder | reviewer | read_only | security_audit. Lane paths must not overlap across builders.`,
              messages: [{ role: "user", content: userMessage }],
            }),
          });
          if (laneRes.ok) {
            const laneData = await laneRes.json();
            const laneText: string = laneData?.content?.[0]?.text ?? "";
            const fenced = laneText.match(/```(?:json)?\s*([\s\S]*?)```/);
            const t = fenced ? fenced[1].trim() : laneText;
            const m = t.match(/\{[\s\S]*\}/);
            if (m) {
              const parsedLanes = JSON.parse(m[0]);
              if (Array.isArray(parsedLanes.suggested_lanes)) {
                const { data: sessRow } = await adminClient
                  .from("sessions")
                  .select("build_spec")
                  .eq("id", body.session_id)
                  .maybeSingle();
                const currentSpec = (sessRow?.build_spec as Record<string, unknown> | null) ?? {};
                await adminClient
                  .from("sessions")
                  .update({
                    build_spec: { ...currentSpec, suggested_lanes: parsedLanes.suggested_lanes },
                  })
                  .eq("id", body.session_id);
              }
            }
          }
        } catch { /* non-fatal */ }
      }
    }

    // Look up session to decide whether to auto-apply phase transition
    let appliedPhase: NextPhase | null = null;
    if (classification) {
      const { data: sessionRow } = await adminClient
        .from("sessions")
        .select("build_spec_locked, conductor_choice")
        .eq("id", body.session_id)
        .maybeSingle();
      const locked = (sessionRow as { build_spec_locked?: boolean } | null)?.build_spec_locked === true;
      const conductorChoice = (sessionRow as { conductor_choice?: string | null } | null)?.conductor_choice ?? null;
      if (!locked && !conductorChoice) {
        const { error: phaseErr } = await adminClient
          .from("sessions")
          .update({ current_phase: classification.recommended_next_phase })
          .eq("id", body.session_id);
        if (!phaseErr) appliedPhase = classification.recommended_next_phase;
      }
    }

    const result: ConciergeResult = {
      ...parsed,
      intent: classification?.intent ?? null,
      design_mode: classification?.design_mode ?? null,
      recommended_next_phase: classification?.recommended_next_phase ?? null,
      intent_reasoning: classification?.reasoning ?? null,
      applied_phase: appliedPhase,
      model_used: model,
    };

    // Persist via admin client — RLS check is satisfied by the request being
    // authenticated above; admin client bypasses RLS for the insert.
    const { error: insertError } = await adminClient
      .from("concierge_decisions")
      .insert({
        session_id: body.session_id,
        phase: body.phase,
        alignment_summary: result.alignment_summary,
        tension_points: result.tension_points,
        recommended_direction: result.recommended_direction,
        intent: result.intent,
        design_mode: result.design_mode,
        recommended_next_phase: result.recommended_next_phase,
        intent_reasoning: result.intent_reasoning,
        model_used: result.model_used,
      });

    if (insertError) {
      return new Response(
        JSON.stringify({
          error: "PERSIST_FAILED",
          message: insertError.message,
          ...result,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return new Response(
      JSON.stringify({ error: "INTERNAL_ERROR", message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});






