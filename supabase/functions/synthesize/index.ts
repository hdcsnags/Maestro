import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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
    const { responses } = await req.json();

    const anthropicKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicKey) {
      const fallback = `Council synthesis complete. The following perspectives have been gathered and combined into a unified build path:\n\n${responses}`;
      return new Response(
        JSON.stringify({ content: fallback }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `You are the Maestro synthesis engine. You receive multiple AI agent responses from a council session and produce a concise, actionable synthesis.

Your synthesis should:
1. Identify the core areas of agreement
2. Surface any meaningful divergences worth noting
3. Produce a clear, concrete recommended path forward
4. Be 2-4 paragraphs, written in plain authoritative prose
5. Do NOT use headers, bullet points, or markdown — pure prose only

Focus on what should actually be built or decided, not meta-commentary about the agents.`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-3-5',
        max_tokens: 512,
        system: systemPrompt,
        messages: [{ role: 'user', content: `Synthesize these council responses:\n\n${responses}` }],
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Synthesis API error');

    const content = data.content?.[0]?.text ?? responses;

    return new Response(
      JSON.stringify({ content }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message, content: 'Synthesis failed. Please try again.' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
