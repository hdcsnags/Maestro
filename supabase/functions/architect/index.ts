import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { logPermissionFailure, requireAuthenticatedRequest } from "../_shared/auth.ts";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ArchitectRequest {
  session_id: string;
}

const SYSTEM_PROMPT = `You are Maestro's Architect agent. Generate an
ARCHITECT.md for this project using the provided synthesis, intake summary,
and build spec.

Required sections (use exactly these markdown headings):
# [Project Name] — Architecture Guide
## Stack
## File Structure
## Agent Lane Assignments
## Security Constraints
## Known Risks
## Build Spec Summary
## Do Not Touch

The "Agent Lane Assignments" section MUST be a markdown pipe table with
exactly these columns and header row, in this order:

| Agent | Lane Paths | Role |
|-------|-----------|------|
| Claude Sonnet 4.6 | src/components/**, src/pages/** | builder |
| GPT-5.4 (Reasoning) | src/api/**, src/lib/** | builder |
| GPT-5.4 (PM) | (cross-cutting) | reviewer |

- Use the actual file paths from the File Structure section above, not
  placeholders. Each lane path must be a real glob into this scaffold.
- Use ONLY exact agent display names from the Active Agent Roster supplied
  in the user message. Do not invent generic names like "Frontend Builder",
  "API Builder", or "Reviewer" unless those exact names appear in the roster.
- Builder lanes must not overlap. Reviewer / read_only / security_audit
  lanes may span across builder paths.
- Role column must be exactly one of: builder, reviewer, read_only, security_audit.

Return the markdown only — no preamble, no code fences around the whole
document.`;

interface SuggestedLane {
  agent_name: string;
  lane_paths: string[];
  role: "builder" | "reviewer" | "read_only" | "security_audit";
}

interface AgentRow {
  id: string;
  name: string;
  display_name: string;
  role: string;
  provider_group: string;
  slot_index: number;
  is_active: boolean;
}

const VALID_LANE_ROLES = new Set(["builder", "reviewer", "read_only", "security_audit"]);

// Extract the Agent Lane Assignments table from the generated ARCHITECT.md.
// Tolerates surrounding whitespace, hyphenated separator rows, and stops at
// the next ## heading. Returns [] when the table can't be found or parsed —
// the build_spec update is then a no-op rather than poisoning state.
function parseLaneAssignments(md: string): SuggestedLane[] {
  const sectionMatch = md.match(/##\s*Agent Lane Assignments\s*\n([\s\S]*?)(?=\n##\s|$)/i);
  if (!sectionMatch) return [];
  const section = sectionMatch[1];

  const lines = section.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("|"));
  if (lines.length < 2) return [];

  // Drop the header row and the separator row (---|---|---).
  const rows = lines.filter((l) => !/^\|\s*-+/.test(l)).slice(1);

  const out: SuggestedLane[] = [];
  for (const row of rows) {
    const cells = row.split("|").map((c) => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cells.length < 3) continue;
    const [agent, pathsCell, roleCell] = cells;
    const role = roleCell.toLowerCase();
    if (!VALID_LANE_ROLES.has(role)) continue;
    const lane_paths = pathsCell
      .split(",")
      .map((p) => p.trim().replace(/^`|`$/g, ""))
      .filter((p) => p && p !== "(cross-cutting)");
    out.push({
      agent_name: agent.replace(/\*+/g, "").trim(),
      lane_paths,
      role: role as SuggestedLane["role"],
    });
  }
  return out;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function scoreAgentForLane(agent: AgentRow, lane: SuggestedLane): number {
  const label = norm(lane.agent_name);
  const role = norm(agent.role);
  const name = norm(`${agent.display_name} ${agent.name}`);
  const paths = norm(lane.lane_paths.join(" "));

  let score = 0;
  if (name === label) score += 100;
  if (name.includes(label) || label.includes(name)) score += 80;
  if (role.includes(label) || label.includes(role)) score += 30;

  if (lane.role === "builder") {
    if (role.includes("build") || role.includes("build lead") || role.includes("code") || role.includes("generation")) score += 50;
    if (name.includes("builder")) score += 22;
    if (name.includes("sonnet")) score += 35;
    if (name.includes("gpt 5 4") || name.includes("gpt 5")) score += 25;
    if (norm(agent.provider_group).includes("anthropic")) score += 12;
    if (norm(agent.provider_group).includes("openai")) score += 10;
    if (role.includes("triage") || role.includes("summarization") || role.includes("general purpose")) score -= 18;
    if (role.includes("free") || name.includes("gpt oss") || name.includes("gemma")) score -= 24;
    if (norm(agent.provider_group).includes("openrouter a")) score -= 10;
    if (paths.includes("component") || paths.includes("page") || paths.includes("style") || paths.includes("ui")) {
      if (role.includes("ui") || role.includes("design") || role.includes("spatial") || role.includes("frontend")) score += 22;
    }
    if (paths.includes("api") || paths.includes("lib") || paths.includes("hook") || paths.includes("server") || paths.includes("function")) {
      if (role.includes("reasoning") || role.includes("architecture") || role.includes("build")) score += 18;
    }
  }

  if (lane.role === "reviewer" || lane.role === "security_audit") {
    if (role.includes("review") || role.includes("policy") || role.includes("scope") || role.includes("reasoning")) score += 25;
  }

  // Prefer default active slots as stable fallbacks when the label is generic.
  if (agent.is_active) score += 8;
  score += Math.max(0, 5 - agent.slot_index);
  return score;
}

function assignAgentToLane(
  lane: SuggestedLane,
  agents: AgentRow[],
  usedAgentIds: Set<string>,
  lockedBuilderIds: Set<string>,
): AgentRow | null {
  let candidates = lane.role === "builder" && lockedBuilderIds.size > 0
    ? agents.filter((agent) => lockedBuilderIds.has(agent.id))
    : agents;

  // Locked builder IDs don't match any agents in the workspace (stale IDs or unapplied
  // migration). Fall back to the full pool rather than returning null — a null agent_id
  // produces LANES_NOT_ASSIGNED on every build attempt.
  if (candidates.length === 0 && lockedBuilderIds.size > 0 && lane.role === "builder") {
    candidates = agents;
  }

  if (candidates.length === 0) return null;

  const exact = candidates.find(
    (agent) => norm(agent.display_name) === norm(lane.agent_name) || norm(agent.name) === norm(lane.agent_name),
  );
  if (exact && !usedAgentIds.has(exact.id)) return exact;

  const fuzzy = candidates
    .filter((agent) => !usedAgentIds.has(agent.id))
    .map((agent) => ({ agent, score: scoreAgentForLane(agent, lane) }))
    .sort((a, b) => b.score - a.score)[0];

  if (fuzzy && fuzzy.score > 0) return fuzzy.agent;

  // Last resort: for builder lanes never assign a free/weak model — they reliably 504 or
  // return stubs. Only use them if there is literally no other option.
  const unused = candidates.filter((a) => !usedAgentIds.has(a.id));
  if (lane.role === "builder") {
    const capable = unused.filter((a) => {
      const n = norm(`${a.display_name} ${a.name}`);
      return !n.includes("gpt oss") && !n.includes("gemma") && !n.includes("gemma 4");
    });
    if (capable.length > 0) return capable[0];
  }
  return unused[0] ?? candidates[0] ?? null;
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const auth = await requireAuthenticatedRequest(req, corsHeaders, "architect");
    if (auth instanceof Response) {
      return auth;
    }

    const { adminClient: supabase, userId } = auth;

    const body: ArchitectRequest = await req.json();
    if (!body.session_id) {
      return new Response(
        JSON.stringify({ error: "session_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Verify session ownership via workspace
    const { data: sessionRow } = await supabase
      .from("sessions")
      .select("id, title, build_spec, workspace_id")
      .eq("id", body.session_id)
      .maybeSingle();
    if (!sessionRow) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: ws } = await supabase
      .from("workspaces")
      .select("user_id")
      .eq("id", sessionRow.workspace_id)
      .maybeSingle();
    if (!ws || ws.user_id !== userId) {
      logPermissionFailure("architect", "workspace ownership mismatch", { session_id: body.session_id, user_id: userId, workspace_user_id: ws?.user_id ?? null });
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: anthropicSecret } = await supabase
      .from("encrypted_secrets")
      .select("encrypted_key")
      .eq("user_id", userId)
      .eq("provider", "anthropic")
      .maybeSingle();
    if (!anthropicSecret) {
      return new Response(
        JSON.stringify({
          error: "ANTHROPIC_KEY_MISSING",
          message: "Architect generation requires an Anthropic API key. Add one in the Provider Vault.",
        }),
        { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: decisions } = await supabase
      .from("concierge_decisions")
      .select("phase, alignment_summary, tension_points, recommended_direction, created_at")
      .eq("session_id", body.session_id)
      .order("created_at", { ascending: true });

    const buildSpec = (sessionRow.build_spec as Record<string, unknown> | null) ?? {};
    const intakeSummary = buildSpec.intake_summary ?? null;
    const lockedBuilderIds = new Set(
      Array.isArray(buildSpec.primary_builder_agent_ids)
        ? buildSpec.primary_builder_agent_ids.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
        : [],
    );
    const decisionsText = (decisions ?? [])
      .map((d) => {
        const tension = Array.isArray(d.tension_points) ? d.tension_points.join("; ") : "";
        return `[${d.phase}]\nAlignment: ${d.alignment_summary ?? ""}\nTensions: ${tension}\nDirection: ${d.recommended_direction ?? ""}`;
      })
      .join("\n\n");

    const { data: activeAgentRows } = await supabase
      .from("agents")
      .select("id, name, display_name, role, provider_group, slot_index, is_active")
      .eq("workspace_id", sessionRow.workspace_id)
      .order("provider_group", { ascending: true })
      .order("slot_index", { ascending: true });

    const activeAgents = ((activeAgentRows ?? []) as AgentRow[]).filter((agent) => agent.is_active);
    const activeOrAllAgents = activeAgents;
    const lockedBuilderRoster = lockedBuilderIds.size > 0
      ? activeOrAllAgents.filter((agent) => lockedBuilderIds.has(agent.id))
      : [];
    const generalRoster = lockedBuilderRoster.length > 0
      ? [
          ...lockedBuilderRoster,
          ...activeOrAllAgents.filter((agent) => !lockedBuilderIds.has(agent.id)),
        ]
      : activeOrAllAgents;
    const agentRosterText = generalRoster
      .map((agent) => `- ${agent.display_name} | role: ${agent.role} | provider_group: ${agent.provider_group}`)
      .join("\n");
    const lockedBuilderText = lockedBuilderRoster
      .map((agent) => `- ${agent.display_name} | role: ${agent.role} | provider_group: ${agent.provider_group}`)
      .join("\n");

    const userMessage = `Project: ${sessionRow.title ?? "Untitled session"}

--- Active Agent Roster ---
Use exact display names from this list in the Agent Lane Assignments table.
${agentRosterText || "(no active agents found)"}

--- Locked Builder Roster ---
Builder lanes MUST use only these agents when this section is populated.
${lockedBuilderText || "(none locked; architect may choose from the active roster)"}

--- Intake Summary ---
${intakeSummary ? JSON.stringify(intakeSummary, null, 2) : "(no intake scan run yet)"}

--- Build Spec ---
${JSON.stringify(buildSpec, null, 2)}

--- Concierge Decisions ---
${decisionsText || "(no concierge decisions yet)"}`;
    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": anthropicSecret.encrypted_key as string,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!anthropicResponse.ok) {
      const errText = await anthropicResponse.text();
      return new Response(
        JSON.stringify({
          error: "ANTHROPIC_REQUEST_FAILED",
          message: `Anthropic API ${anthropicResponse.status}: ${errText.slice(0, 500)}`,
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const anthropicData = await anthropicResponse.json();
    const architectMd: string = anthropicData?.content?.[0]?.text ?? "";
    if (!architectMd) {
      return new Response(
        JSON.stringify({ error: "EMPTY_RESPONSE", message: "Anthropic returned empty content" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Sprint B follow-up — extract suggested lanes from the generated
    // Architect.md and merge them into sessions.build_spec so PreBuildPanel
    // shows real scaffold paths instead of hardcoded src/components/**.
    const suggestedLanes = parseLaneAssignments(architectMd);
    const updatedBuildSpec: Record<string, unknown> = {
      ...buildSpec,
      ...(suggestedLanes.length > 0 ? { suggested_lanes: suggestedLanes } : {}),
    };

    // Sprint C · C1 — Auto-populate build_lanes table and lock build spec.
    // Match parsed agent names to real agents in the workspace so we get
    // proper agent_id references instead of display-name-only rows.
    let lanesAssigned = false;
    if (suggestedLanes.length > 0) {
      const agentList = generalRoster;
      const usedAgentIds = new Set<string>();

      const laneRows = suggestedLanes
        .map((lane) => {
          const match = assignAgentToLane(lane, agentList, usedAgentIds, lockedBuilderIds);
          if (match) usedAgentIds.add(match.id);
          return {
            session_id: body.session_id,
            agent_id: match?.id ?? null,
            agent_name: match?.display_name ?? lane.agent_name,
            lane_paths: lane.lane_paths,
            role: lane.role,
          };
        });

      // Clear old lanes, insert new ones
      await supabase
        .from("build_lanes")
        .delete()
        .eq("session_id", body.session_id);

      const { error: laneErr } = await supabase
        .from("build_lanes")
        .insert(laneRows as never[]);

      if (!laneErr) {
        lanesAssigned = true;
        // Auto-lock build spec so conductor can go straight to build
        updatedBuildSpec.build_spec_locked = true;
      }
    }

    const { error: updateError } = await supabase
      .from("sessions")
      .update({
        architect_md: architectMd,
        build_spec: updatedBuildSpec,
        ...(lanesAssigned ? { build_spec_locked: true } : {}),
      } as never)
      .eq("id", body.session_id);
    if (updateError) {
      return new Response(
        JSON.stringify({
          error: "PERSIST_FAILED",
          message: updateError.message,
          architect_md: architectMd,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        architect_md: architectMd,
        suggested_lanes: suggestedLanes,
        lanes_assigned: lanesAssigned,
        build_spec_locked: lanesAssigned,
      }),
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













