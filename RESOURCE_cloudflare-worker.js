// Copy this code into your Cloudflare Worker script

export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };

    // Handle CORS preflight requests
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const apiKey = env.OPENAI_API_KEY; // Store this in Worker Secrets, never in GitHub Pages files.
    const apiUrl = "https://api.openai.com/v1/responses";
    const userInput = await request.json();

    // Use a web-search-capable model so routine advice can include current information.
    const requestBody = {
      model: "gpt-4o-search-preview",
      input: userInput.messages,
      tools: [{ type: "web_search_preview" }],
      temperature: userInput.temperature ?? 0.7,
      max_output_tokens: 600,
    };

    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: corsHeaders,
      });
    }

    const outputText = data.output_text || "";
    const citations = [];

    // Pull citation links from web search annotations if available.
    if (Array.isArray(data.output)) {
      for (const outputItem of data.output) {
        if (!Array.isArray(outputItem.content)) {
          continue;
        }

        for (const contentItem of outputItem.content) {
          if (!Array.isArray(contentItem.annotations)) {
            continue;
          }

          for (const annotation of contentItem.annotations) {
            const url = annotation?.url;

            if (!url) {
              continue;
            }

            citations.push({
              title: annotation?.title || "Source",
              url,
            });
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        reply: outputText,
        citations,
      }),
      { headers: corsHeaders },
    );
  },
};
