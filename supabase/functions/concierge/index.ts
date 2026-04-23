import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";
import { requireAuthenticatedRequest } from "../_shared/auth.ts";
import { readJsonBody } from "../_shared/body.ts";
import { buildCorsHeaders } from "../_shared/cors.ts";
import { getDecryptedSecret } from "../_shared/secrets.ts";
type Phase = "post_round1" | "post_round2" | "design" | "pre_build" | "post_build" | "pre_build_complete" | "build_chat" | "decompose_tasks";
type Intent = "simple_ask" | "product_build" | "ui_heavy" | "existing_repo_change" | "new_project";
type DesignMode = "none" | "lite" | "standard" | "exploration";
type NextPhase = "analysis" | "design" | "pre_build" | "build";
const CONCIERGE_MAX_BODY_BYTES = 1_048_576;

interface ConciergeRequest {
  session_id: string;
  phase: Phase;
  user_message?: string; // only for build_chat phase
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

function getRequestedBuildPrompt(buildSpec: Record<string, unknown>): string {
  const value = buildSpec.requested_build_prompt;
  if (typeof value !== "string") return "";
  return value.trim();
}

function truncateRequestedBuildPrompt(prompt: string, limit = 220): string {
  if (!prompt) return "";
  return prompt.length <= limit ? prompt : `${prompt.slice(0, limit - 1).trimEnd()}…`;
}

function buildDeterministicBuildPlan(
  projectTitle: string,
  _architectMd: string,
  builders: BuildLaneSummary[],
  requestedBuildPrompt = "",
): BuildPlanPayload {
  // NOTE: Do NOT embed architectMd in build_prompt. The orchestrate edge function
  // already injects the full ARCHITECT.MD into the system prompt for build-mode
  // requests (orchestrate/index.ts). Embedding it again in the user message doubles
  // the context, producing prompts that exceed provider token budgets and 504.
  const conciseRequestedBuildPrompt = truncateRequestedBuildPrompt(requestedBuildPrompt, 180);
  const focusLine = conciseRequestedBuildPrompt
    ? ` Prioritize this requested focus: ${conciseRequestedBuildPrompt}`
    : "";
  return {
    build_prompt: `BUILD MODE — Building ${projectTitle}.${focusLine}\n\nReturn JSON only. Include COMPLETE file contents in every file_manifest entry — no "// ... existing code ..." or similar placeholders. Work ONLY within your assigned lane paths.\n\nIf you cannot finish all assigned files in one response, set "complete": false and write a "continuation_prompt" describing exactly which files still need to be generated.`,
    build_summary: `Building ${projectTitle} with ${builders.length} builder agent${builders.length === 1 ? "" : "s"}. Each builder is scoped to lane-specific paths and must return complete file contents in file_manifest entries for conductor review before execution.${conciseRequestedBuildPrompt ? ` Requested focus: ${conciseRequestedBuildPrompt}` : ""}`,
    builder_agents: builders.map((builder) => ({
      agent_id: builder.agent_id ?? "",
      agent_name: builder.agent_name,
      scoped_paths: builder.lane_paths,
      instruction: `Build only the files in: ${builder.lane_paths.join(", ") || "your assigned lane paths"}${conciseRequestedBuildPrompt ? `. Prioritize this request within your lane: ${conciseRequestedBuildPrompt}` : ""}`,
    })),
  };
}

// Maximum files to send per build broadcast. Agents asked to generate more than
// this in a single call will reliably 504. The continuation mechanism handles
// the remaining files in follow-up rounds.
const MAX_FILES_PER_CHUNK = 12;

/**
 * Parse a file tree from an ARCHITECT.md code block.
 * Handles the standard ├──/└── format written by the architect edge function.
 */
function parseFilesFromArchitectMd(md: string): string[] {
  const files: string[] = [];
  const codeBlockRegex = /```[^\n]*\n([\s\S]*?)```/g;
  let blockMatch;

  while ((blockMatch = codeBlockRegex.exec(md)) !== null) {
    const lines = blockMatch[1].split("\n");
    if (!lines.some((l) => l.includes("├──") || l.includes("└──"))) continue;

    const dirStack: string[] = [];

    for (const line of lines) {
      const branchIdx = line.search(/[├└]/);
      if (branchIdx === -1) continue;

      // Each 4-char indent group (│   or    ) = 1 depth level
      const depth = Math.floor(branchIdx / 4);
      const afterBranch = line.slice(branchIdx).match(/^[├└]──\s+(.+)/);
      if (!afterBranch) continue;

      // Strip inline comments (e.g. "# comment") after two or more spaces
      const name = afterBranch[1].split(/\s{2,}#/)[0].trim();

      // Truncate stack to current depth (moving up the tree)
      dirStack.length = depth;

      if (name.endsWith("/")) {
        dirStack.push(name.slice(0, -1));
      } else {
        files.push([...dirStack, name].join("/"));
      }
    }

    if (files.length > 0) break; // use the first tree found
  }

  return files;
}

/**
 * Return files from `allFiles` whose paths match any of the lane glob patterns.
 * Supports `**`, `dir/**`, `dir/*`, exact paths, and basic `*` globs.
 */
function matchFilesToLane(allFiles: string[], laneGlobs: string[]): string[] {
  if (!laneGlobs.length) return allFiles;
  return allFiles.filter((file) =>
    laneGlobs.some((glob) => {
      const g = glob.trim();
      if (g === "**" || g === "*") return true;
      if (g.endsWith("/**")) return file.startsWith(g.slice(0, -3) + "/");
      if (g.endsWith("/*")) {
        const prefix = g.slice(0, -2);
        const rest = file.slice(prefix.length + 1);
        return file.startsWith(prefix + "/") && !rest.includes("/");
      }
      if (g.includes("*")) {
        const pattern = "^" + g.replace(/\./g, "\\.").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*") + "$";
        try { return new RegExp(pattern).test(file); } catch { return false; }
      }
      return file === g || file.startsWith(g + "/");
    })
  );
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
  return getDecryptedSecret(adminClient, userId, provider);
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const auth = await requireAuthenticatedRequest(req, corsHeaders, "concierge");
    if (auth instanceof Response) {
      return auth;
    }

    const { adminClient, userId } = auth;

    const bodyResult = await readJsonBody<ConciergeRequest>(req, corsHeaders, {
      maxBytes: CONCIERGE_MAX_BODY_BYTES,
      label: "Concierge request body",
    });
    if (bodyResult instanceof Response) {
      return bodyResult;
    }
    const body = bodyResult;
    // pre_build_complete, build_chat, and decompose_tasks don't need responses — they read state directly
    if (!body.session_id || !body.phase || (body.phase !== "pre_build_complete" && body.phase !== "build_chat" && body.phase !== "decompose_tasks" && !Array.isArray(body.responses))) {
      return new Response(
        JSON.stringify({ error: "Invalid request: session_id, phase, and responses required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const apiKey = await getUserApiKey(adminClient, userId, "anthropic");
    if (!apiKey && body.phase !== "pre_build_complete" && body.phase !== "build_chat" && body.phase !== "decompose_tasks") {
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
        .select("architect_md, title, build_spec")
        .eq("id", body.session_id)
        .maybeSingle();

      const architectMd = (sessionData as { architect_md?: string } | null)?.architect_md ?? "";
      const projectTitle = (sessionData as { title?: string } | null)?.title ?? "Untitled";
      const buildSpec = (sessionData as { build_spec?: Record<string, unknown> } | null)?.build_spec ?? {};
      const requestedBuildPrompt = getRequestedBuildPrompt(buildSpec);

      const { data: laneData } = await adminClient
        .from("build_lanes")
        .select("agent_id, agent_name, lane_paths, role")
        .eq("session_id", body.session_id);

      const lanes = (laneData ?? []) as BuildLaneSummary[];
      const builders = lanes.filter((l) => l.role === "builder");

      // Fallback: if architect LLM assigned wrong roles to locked builder agents,
      // treat all non-read_only lanes as builders rather than failing with 412.
      const effectiveBuilders = builders.length > 0
        ? builders
        : lanes.filter((l) => l.role !== "read_only");

      if (effectiveBuilders.length === 0 || !architectMd) {
        return new Response(
          JSON.stringify({
            error: "BUILD_NOT_READY",
            message: effectiveBuilders.length === 0
              ? "No builder lanes assigned. Generate Architect.md first."
              : "No Architect.md found. Generate the scaffold first.",
          }),
          { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const fallbackPlan = buildDeterministicBuildPlan(projectTitle, architectMd, effectiveBuilders, requestedBuildPrompt);
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
If a requested build focus is provided, incorporate it into the build_prompt, build_summary, and per-agent instructions without asking follow-up questions.

Return JSON only:
{
  "build_prompt": "Concise build instructions — under 100 words. No ARCHITECT.MD content.",
  "build_summary": "2-3 sentence summary of what will be built, for conductor approval.",
  "builder_agents": [
    { "agent_id": "...", "agent_name": "...", "scoped_paths": ["..."], "instruction": "1 sentence specific to this agent's lane files" }
  ]
}`;

        const builderList = effectiveBuilders
          .map((b) => `- ${b.agent_name} (${b.role}): ${b.lane_paths.join(", ")}`)
          .join("\n");

        const buildUserMsg = `Project: ${projectTitle}

${requestedBuildPrompt ? `--- REQUESTED BUILD FOCUS ---
${requestedBuildPrompt}

` : ""}--- ARCHITECT.MD ---
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

      // ── File chunking ─────────────────────────────────────────────────────
      // Parse the file tree from ARCHITECT.md. If any builder's lane has more
      // than MAX_FILES_PER_CHUNK files, restrict their instruction to the first
      // chunk only. The continuation protocol (complete:false + continuation_prompt)
      // handles remaining files in follow-up rounds.
      const allFiles = parseFilesFromArchitectMd(architectMd);
      if (allFiles.length > 0) {
        buildPlan = {
          ...buildPlan,
          builder_agents: buildPlan.builder_agents.map((agent) => {
            const laneFiles = matchFilesToLane(allFiles, agent.scoped_paths);
            if (laneFiles.length <= MAX_FILES_PER_CHUNK) return agent;

            const chunk1 = laneFiles.slice(0, MAX_FILES_PER_CHUNK);
            const remaining = laneFiles.slice(MAX_FILES_PER_CHUNK);
            const remainingSample = remaining.slice(0, 5).join(", ") + (remaining.length > 5 ? `, …and ${remaining.length - 5} more` : "");

            console.log("[concierge] chunking lane", {
              agent: agent.agent_name,
              total: laneFiles.length,
              chunk1: chunk1.length,
              remaining: remaining.length,
            });

            return {
              ...agent,
              instruction: `Build ONLY these ${chunk1.length} files in this first batch (${laneFiles.length} total in your lane):\n${chunk1.map((f) => `- ${f}`).join("\n")}\n\nWhen all ${chunk1.length} are written, set complete:false and include in continuation_prompt: "Remaining ${remaining.length} files: ${remainingSample}"`,
            };
          }),
        };
        if (!warning && allFiles.length > 0) {
          const chunked = buildPlan.builder_agents.filter((a) => a.instruction.startsWith("Build ONLY these"));
          if (chunked.length > 0) {
            warning = `Lane chunking applied to ${chunked.length} builder(s) — each receives the first ${MAX_FILES_PER_CHUNK} files. Remaining files will be built via continuation.`;
          }
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

    // ── Build chat ─────────────────────────────────────────────────────────
    // Lightweight Haiku-powered status chat during an active build broadcast.
    // No responses array needed — context is read from DB.
    if (body.phase === "build_chat") {
      const chatMessage = body.user_message?.trim() || "What is happening?";

      // Read build context: latest round + response counts
      const { data: laneData } = await adminClient
        .from("build_lanes")
        .select("agent_name, role")
        .eq("session_id", body.session_id);

      const { data: roundData } = await adminClient
        .from("rounds")
        .select("id, status, target_agents")
        .eq("session_id", body.session_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let responsesReceived = 0;
      let responsesExpected = 0;
      if (roundData) {
        responsesExpected = (roundData.target_agents as string[] | null)?.length ?? 0;
        const { count } = await adminClient
          .from("responses")
          .select("id", { count: "exact", head: true })
          .eq("round_id", roundData.id);
        responsesReceived = count ?? 0;
      }

      const builders = (laneData ?? []).filter((l) => l.role !== "read_only");
      const buildContext = `${responsesReceived}/${responsesExpected} builder responses received so far. Active builders: ${builders.map((b) => b.agent_name).join(", ") || "none"}.`;

      // Graceful no-key fallback
      if (!apiKey) {
        return new Response(
          JSON.stringify({ reply: `Build is underway. ${buildContext} No API key available for status update.`, build_status: { responses_received: responsesReceived, responses_expected: responsesExpected } }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const chatRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 256,
          system: `You are Maestro's Concierge. The user is waiting for a build broadcast to complete. Be brief (under 80 words), direct, and helpful. Current build status: ${buildContext}. If asked what's happening, describe the status naturally. If asked a product or code question, answer concisely. Do not start every sentence with "I".`,
          messages: [{ role: "user", content: chatMessage }],
        }),
      });

      let reply = `Build is underway — ${buildContext}`;
      if (chatRes.ok) {
        const chatData = await chatRes.json();
        reply = chatData?.content?.[0]?.text ?? reply;
      }

      return new Response(
        JSON.stringify({ reply, build_status: { responses_received: responsesReceived, responses_expected: responsesExpected } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── Decompose tasks — Build v2 task queue generation ─────────────────
    // Parses ARCHITECT.md file tree + build_lanes → writes one build_tasks
    // row per file. Uses Sonnet for prompt slice generation when possible,
    // falls back to deterministic slices otherwise.
    if (body.phase === "decompose_tasks") {
      const { data: sessionData } = await adminClient
        .from("sessions")
        .select("architect_md, title, build_spec")
        .eq("id", body.session_id)
        .maybeSingle();

      const architectMd = (sessionData as { architect_md?: string } | null)?.architect_md ?? "";
      const projectTitle = (sessionData as { title?: string } | null)?.title ?? "Untitled";
      const buildSpec = (sessionData as { build_spec?: Record<string, unknown> } | null)?.build_spec ?? {};
      const requestedBuildPrompt = getRequestedBuildPrompt(buildSpec);

      const { data: laneData } = await adminClient
        .from("build_lanes")
        .select("id, agent_id, agent_name, lane_paths, role")
        .eq("session_id", body.session_id);

      const lanes = (laneData ?? []) as Array<BuildLaneSummary & { id: string }>;
      const builders = lanes.filter((l) => l.role === "builder");
      const effectiveBuilders = builders.length > 0
        ? builders
        : lanes.filter((l) => l.role !== "read_only");

      if (effectiveBuilders.length === 0 || !architectMd) {
        return new Response(
          JSON.stringify({
            error: "BUILD_NOT_READY",
            message: effectiveBuilders.length === 0
              ? "No builder lanes assigned."
              : "No Architect.md found.",
          }),
          { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Parse file tree from ARCHITECT.md
      const allFiles = parseFilesFromArchitectMd(architectMd);
      if (allFiles.length === 0) {
        return new Response(
          JSON.stringify({
            error: "NO_FILES_FOUND",
            message: "Could not parse a file tree from ARCHITECT.md. Ensure it contains a code block with ├──/└── tree format.",
          }),
          { status: 412, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Clear any existing tasks for this session
      await adminClient
        .from("build_tasks")
        .delete()
        .eq("session_id", body.session_id);

      // Assign files to builders based on lane globs
      interface TaskPlan {
        task_id: string;
        file_path: string;
        lane_owner: string;
        lane_owner_name: string;
        fallback_owner: string | null;
        dependencies: string[];
        prompt_slice: string;
        priority: number; // lower = build first
      }

      // Determine fallback for each builder (a builder from a different provider)
      function pickFallback(owner: typeof effectiveBuilders[0]): string | null {
        const other = effectiveBuilders.find((b) =>
          b.agent_id !== owner.agent_id && b.agent_name !== owner.agent_name
        );
        return other?.agent_id ?? null;
      }

      // Priority heuristic: config/types first, then lib, then routes/components, then entry points
      function filePriority(fp: string): number {
        const lower = fp.toLowerCase();
        if (lower.includes("config") || lower.includes("types") || lower.includes(".env")) return 0;
        if (lower.includes("/lib/") || lower.includes("/utils/") || lower.includes("/helpers/")) return 1;
        if (lower.includes("/middleware/") || lower.includes("/models/") || lower.includes("/db/")) return 2;
        if (lower.includes("/api/") || lower.includes("/routes/") || lower.includes("/services/")) return 3;
        if (lower.includes("/components/") || lower.includes("/pages/") || lower.includes("/views/")) return 4;
        if (lower.includes("index.") || lower.includes("app.") || lower.includes("main.") || lower.includes("server.")) return 5;
        if (lower.includes("test") || lower.includes("spec") || lower.includes("seed")) return 6;
        if (lower.includes("readme") || lower.includes("docker") || lower.includes("makefile")) return 7;
        return 4; // default middle priority
      }

      const tasks: TaskPlan[] = [];
      let taskCounter = 0;

      // Track which files are assigned to avoid duplicates
      const assignedFiles = new Set<string>();

      // Separate builders with explicit lane paths from catch-all builders (empty paths).
      // Sort both groups by agent_id for deterministic round-robin order across runs.
      const scopedBuilders = effectiveBuilders
        .filter((b) => b.lane_paths.length > 0)
        .sort((a, b) => (a.agent_id ?? "").localeCompare(b.agent_id ?? ""));
      const catchAllBuilders = effectiveBuilders
        .filter((b) => b.lane_paths.length === 0)
        .sort((a, b) => (a.agent_id ?? "").localeCompare(b.agent_id ?? ""));

      // Pass 1: assign files to builders with explicit lane paths
      for (const builder of scopedBuilders) {
        const laneFiles = matchFilesToLane(allFiles, builder.lane_paths);
        const fallback = pickFallback(builder);

        for (const filePath of laneFiles) {
          if (assignedFiles.has(filePath)) continue;
          assignedFiles.add(filePath);

          taskCounter++;
          const taskId = `task-${String(taskCounter).padStart(3, "0")}`;
          const priority = filePriority(filePath);

          tasks.push({
            task_id: taskId,
            file_path: filePath,
            lane_owner: builder.agent_id ?? "",
            lane_owner_name: builder.agent_name,
            fallback_owner: fallback,
            dependencies: [],
            prompt_slice: "",
            priority,
          });
        }
      }

      // Pass 2: distribute remaining (unassigned) files round-robin across catch-all builders.
      // Catch-all builders are those with empty lane_paths — they accept whatever isn't
      // claimed by scoped builders. If no catch-all builders exist, remaining files are
      // left unassigned here and handled below.
      let rrIndex = 0;
      if (catchAllBuilders.length > 0) {
        for (const filePath of allFiles) {
          if (assignedFiles.has(filePath)) continue;
          assignedFiles.add(filePath);

          const builder = catchAllBuilders[rrIndex % catchAllBuilders.length];
          rrIndex++;
          taskCounter++;
          const taskId = `task-${String(taskCounter).padStart(3, "0")}`;

          tasks.push({
            task_id: taskId,
            file_path: filePath,
            lane_owner: builder.agent_id ?? "",
            lane_owner_name: builder.agent_name,
            fallback_owner: pickFallback(builder),
            dependencies: [],
            prompt_slice: "",
            priority: filePriority(filePath),
          });
        }
      }

      // Pass 3: catch truly unassigned files (no catch-all builders, files outside all scoped lanes).
      // Assign round-robin across scoped builders as a last resort.
      {
        let fallbackRr = 0;
        for (const filePath of allFiles) {
          if (assignedFiles.has(filePath)) continue;
          assignedFiles.add(filePath);

          const owner = scopedBuilders[fallbackRr % scopedBuilders.length] ?? effectiveBuilders[0];
          fallbackRr++;
          taskCounter++;
          const taskId = `task-${String(taskCounter).padStart(3, "0")}`;

          tasks.push({
            task_id: taskId,
            file_path: filePath,
            lane_owner: owner.agent_id ?? "",
            lane_owner_name: owner.agent_name,
            fallback_owner: pickFallback(owner),
            dependencies: [],
            prompt_slice: "",
            priority: filePriority(filePath),
          });
        }
      }

      // Sort by priority
      tasks.sort((a, b) => a.priority - b.priority);

      // Simple dependency heuristic: config/types tasks come before everything else
      const configTaskIds = tasks.filter((t) => t.priority === 0).map((t) => t.task_id);
      for (const task of tasks) {
        if (task.priority > 0 && configTaskIds.length > 0) {
          task.dependencies = configTaskIds;
        }
      }

      // Generate prompt slices
      // Try LLM-powered slices if API key available, fall back to deterministic
      let usedLlmSlices = false;

      if (apiKey && tasks.length <= 60) {
        // Ask Sonnet to generate per-file instructions
        const fileList = tasks.map((t) => `- ${t.file_path} (builder: ${t.lane_owner_name})`).join("\n");
        const slicePrompt = `You are decomposing a build plan into per-file build instructions.

Project: ${projectTitle}

${requestedBuildPrompt ? `Requested build focus:
${requestedBuildPrompt}

` : ""}ARCHITECT.MD (reference):
${architectMd.slice(0, 6000)}

Files to generate (${tasks.length} total):
${fileList}

For EACH file, write a 1-3 sentence build instruction that tells the builder:
1. What this file does in the project
2. Key implementation details (imports, exports, patterns)
3. Any dependencies on other files in the list

Return JSON only:
{
  "slices": {
    "<file_path>": "<instruction text>",
    ...
  }
}`;

        try {
          const sliceRes = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: "claude-sonnet-4-6",
              max_tokens: 4096,
              messages: [{ role: "user", content: slicePrompt }],
            }),
          });

          if (sliceRes.ok) {
            const sliceData = await sliceRes.json();
            const sliceRaw: string = sliceData?.content?.[0]?.text ?? "";
            const fenced = sliceRaw.match(/```(?:json)?\s*([\s\S]*?)```/);
            const jsonText = fenced ? fenced[1].trim() : sliceRaw;
            const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              const parsed = JSON.parse(jsonMatch[0]);
              if (parsed.slices && typeof parsed.slices === "object") {
                for (const task of tasks) {
                  const slice = parsed.slices[task.file_path];
                  if (typeof slice === "string" && slice.trim().length > 10) {
                    task.prompt_slice = slice.trim();
                  }
                }
                usedLlmSlices = true;
              }
            }
          }
        } catch (e) {
          console.warn("[concierge] LLM prompt slice generation failed, using deterministic", String(e));
        }
      }

      // Fill in deterministic slices for any tasks that don't have one
      for (const task of tasks) {
        if (task.prompt_slice) continue;
        const ext = task.file_path.split(".").pop()?.toLowerCase() ?? "";
        const dirHint = task.file_path.includes("/") ? task.file_path.split("/").slice(0, -1).join("/") : "root";
        task.prompt_slice = `Build file: ${task.file_path}\nThis file is part of the "${dirHint}" module in project "${projectTitle}". Write the COMPLETE file content — no placeholders, no truncation. File type: .${ext}. Follow the project architecture from ARCHITECT.md.${requestedBuildPrompt ? ` Prioritize this requested focus when it applies to this file: ${truncateRequestedBuildPrompt(requestedBuildPrompt, 180)}` : ""}`;
      }

      // Build the per-task system prompt wrapper
      const taskPromptPrefix = `BUILD TASK MODE — building "${projectTitle}".
You are generating EXACTLY ONE file. Return JSON only:
{
  "path": "<exact file path>",
  "content": "<COMPLETE file content — every line, no placeholders>",
  "operation": "create"
}

RULES:
- Output ONLY the JSON object above. No explanation, no markdown, no extra text.
- "content" must be the COMPLETE file, top to bottom.
- NEVER use "// ... existing code ...", "// placeholder", or similar.
- If the file is empty or you cannot generate it, return { "path": "...", "content": "", "operation": "create" } with an empty string.`;

      // Write tasks to build_tasks table
      const taskRows = tasks.map((t) => ({
        session_id: body.session_id,
        task_id: t.task_id,
        file_path: t.file_path,
        lane_owner: t.lane_owner || null,
        fallback_owner: t.fallback_owner,
        dependencies: t.dependencies,
        status: "queued" as const,
        retry_count: 0,
        max_retries: 2,
        prompt_slice: `${taskPromptPrefix}\n\nFILE TO BUILD: ${t.file_path}\n\n${t.prompt_slice}`,
      }));

      const { error: insertError } = await adminClient
        .from("build_tasks")
        .insert(taskRows);

      if (insertError) {
        return new Response(
          JSON.stringify({
            error: "TASK_INSERT_FAILED",
            message: insertError.message,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      // Build summary for the UI
      const builderSummary = effectiveBuilders.map((b) => {
        const count = tasks.filter((t) => t.lane_owner === b.agent_id).length;
        return `${b.agent_name}: ${count} files`;
      }).join(", ");

      const lockedBuilderIds = (buildSpec as { locked_builder_ids?: string[] }).locked_builder_ids ?? [];

      return new Response(
        JSON.stringify({
          phase: "decompose_tasks",
          total_tasks: tasks.length,
          total_files: allFiles.length,
          builder_summary: builderSummary,
          used_llm_slices: usedLlmSlices,
          tasks: tasks.map((t) => ({
            task_id: t.task_id,
            file_path: t.file_path,
            lane_owner: t.lane_owner,
            lane_owner_name: t.lane_owner_name,
            fallback_owner: t.fallback_owner,
            dependencies: t.dependencies,
            priority: t.priority,
            status: "queued",
          })),
          locked_builder_ids: lockedBuilderIds,
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








