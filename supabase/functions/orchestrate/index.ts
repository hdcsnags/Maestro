import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AgentSkillPayload {
  name: string;
  instruction: string;
}

interface OrchestrationRequest {
  prompt: string;
  provider: string;
  model: string;
  agentName: string;
  agentRole: string;
  agentSkills?: AgentSkillPayload[];
  scopedPaths?: string[];
}

interface ArtifactResult {
  filename: string;
  content_type: string;
  content: string;
}

interface SignalMap {
  synthesis_fit?: string;
  risk?: string;
  confidence?: string;
}

interface OrchestrateResult {
  title: string;
  content: string;
  signals: SignalMap;
  artifacts?: ArtifactResult[];
}

const PROVIDER_MAP: Record<string, string> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  moonshot: "moonshot",
  qwen: "qwen",
  openrouter: "openrouter",
};

function buildSystemPrompt(agentName: string, agentRole: string, skills?: AgentSkillPayload[], scopedPaths?: string[]): string {
  let prompt = `You are ${agentName}, an AI specialist in a multi-agent orchestration council called Maestro. Your designated role is: ${agentRole}.

When responding:
1. Lead with a bold, memorable title (one sentence, no colon, under 12 words)
2. Give your expert perspective on the prompt from your specific role
3. Be direct, insightful, and opinionated — not generic
4. Keep the response focused: 2-4 paragraphs max

Return your response as JSON with this structure:
{
  "title": "Your response title here",
  "content": "Your full response content here",
  "signals": {
    "synthesis_fit": "one line about how this fits into the bigger picture",
    "risk": "one line about the primary risk or concern",
    "confidence": "High/Medium/Low — one line reasoning"
  },
  "artifacts": []
}

If the user's prompt asks you to generate a file (HTML wireframe, markdown plan, code file, etc.), include it in the "artifacts" array. Each artifact should have:
- "filename": the file name with extension (e.g., "wireframe.html", "plan.md")
- "content_type": MIME type (e.g., "text/html", "text/markdown", "text/plain")
- "content": the full file content as a string

Only include artifacts when file generation is clearly requested or would be genuinely useful. The artifacts array can be empty.`;

  if (skills && skills.length > 0) {
    prompt += `\n\nYou have the following specialized skills active for this session:`;
    for (const skill of skills) {
      prompt += `\n\n[Skill: ${skill.name}]\n${skill.instruction}`;
    }
  }

  if (scopedPaths && scopedPaths.length > 0) {
    prompt += `\n\nYour scope is limited to the following file paths in the repository: ${scopedPaths.join(', ')}. Focus your analysis and recommendations within these paths.`;
  }

  return prompt;
}

function parseResult(rawText: string, agentName: string): OrchestrateResult {
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        title: parsed.title || `${agentName}'s Analysis`,
        content: parsed.content || rawText,
        signals: parsed.signals || {},
        artifacts: Array.isArray(parsed.artifacts) ? parsed.artifacts : [],
      };
    }
  } catch { /* fall through */ }
  return { title: `${agentName}'s Analysis`, content: rawText, signals: {}, artifacts: [] };
}

async function getUserApiKey(userId: string, provider: string): Promise<string | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const adminClient = createClient(supabaseUrl, serviceKey);

  const { data } = await adminClient
    .from("encrypted_secrets")
    .select("encrypted_key")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();

  return data?.encrypted_key ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header", title: "Error", content: "No authorization header", signals: {}, artifacts: [] }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized", title: "Error", content: "Unauthorized", signals: {}, artifacts: [] }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const body: OrchestrationRequest = await req.json();
    const { prompt, provider, model, agentName, agentRole, agentSkills, scopedPaths } = body;

    const systemPrompt = buildSystemPrompt(agentName, agentRole, agentSkills, scopedPaths);

    const lookupProvider = PROVIDER_MAP[provider] ?? provider;
    const apiKey = await getUserApiKey(user.id, lookupProvider);

    if (!apiKey) {
      return new Response(
        JSON.stringify({
          title: `${agentName} — No API Key`,
          content: `No API key found for ${provider}. Please add your ${provider} API key in the Provider Vault.`,
          signals: { risk: "No API key configured", confidence: "N/A" },
          artifacts: [],
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let result: OrchestrateResult = { title: '', content: '', signals: {}, artifacts: [] };

    if (provider === 'anthropic') {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: model || 'claude-sonnet-4-5',
          max_tokens: 4096,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Anthropic API error');

      const rawText = data.content?.[0]?.text ?? '';
      result = parseResult(rawText, agentName);

    } else if (provider === 'openai') {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model || 'gpt-4o',
          max_tokens: 4096,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'OpenAI API error');

      const rawText = data.choices?.[0]?.message?.content ?? '';
      result = parseResult(rawText, agentName);

    } else if (provider === 'google') {
      const geminiModel = model || 'gemini-1.5-flash';
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 4096 },
          }),
        }
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Gemini API error');

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      result = parseResult(rawText, agentName);

    } else if (provider === 'openrouter') {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://maestro.thamos.ca',
          'X-Title': 'Maestro Orchestration',
        },
        body: JSON.stringify({
          model: model || 'auto',
          max_tokens: 4096,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'OpenRouter API error');

      const rawText = data.choices?.[0]?.message?.content ?? '';
      result = parseResult(rawText, agentName);

    } else {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://maestro.thamos.ca',
          'X-Title': 'Maestro Orchestration',
        },
        body: JSON.stringify({
          model: model || 'auto',
          max_tokens: 4096,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || `${provider} API error`);

      const rawText = data.choices?.[0]?.message?.content ?? '';
      result = parseResult(rawText, agentName);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message, title: 'Error', content: message, signals: {}, artifacts: [] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
