const axios = require("axios");

const name = "openai";
const defaultBaseUrl = "https://api.openai.com/v1";
const defaultModel = "gpt-4o";

function detect(baseUrl, model) {
  const b = (baseUrl || "").toLowerCase();
  const m = (model || "").toLowerCase();
  if (b.includes("openai.com") || b.includes(".openai.")) return true;
  // Not a match for any known non-OpenAI provider
  const nonOpenAI = ["googleapis", "anthropic", "groq", "cohere", "pollinations", "perplexity", "nvidia", "cloudflare", "localhost", "127.0.0.1"];
  for (const x of nonOpenAI) {
    if (b.includes(x) || m.includes(x)) return false;
  }
  return true; // fallback: assume OpenAI-compatible
}

async function chat(provider, messages, options = {}) {
  const { baseUrl, apiKey, model } = provider;
  const { maxTokens, temperature = 0.7, stream } = options;
  const body = {
    model: model || "gpt-4o",
    messages,
    temperature,
    ...(maxTokens > 0 ? { max_tokens: maxTokens } : {}),
  };
  if (stream) body.stream = true;

  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;
  const resp = await axios.post(url, body, {
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    timeout: 60000,
    responseType: stream ? "stream" : "json",
  });

  if (stream) return resp.data;
  return resp.data.choices?.[0]?.message?.content || "";
}

async function* chatStream(provider, messages, options = {}) {
  const res = await chat(provider, messages, { ...options, stream: true });
  let buffer = "";
  for await (const chunk of res) {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const m = line.match(/^data:\s*(.+)$/);
      if (!m) continue;
      if (m[1] === "[DONE]") return;
      try {
        const d = JSON.parse(m[1]);
        const content = d.choices?.[0]?.delta?.content || "";
        if (content) yield content;
      } catch {}
    }
  }
}

async function vision(provider, imageUrl, prompt, systemPrompt) {
  const { baseUrl, apiKey, model } = provider;
  const body = {
    model: model || "gpt-4o",
    messages: [
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      },
    ],
    max_tokens: 1024,
  };
  const resp = await axios.post(`${baseUrl.replace(/\/$/, "")}/chat/completions`, body, {
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    timeout: 180000,
  });
  return resp.data.choices?.[0]?.message?.content || "";
}

module.exports = { name, detect, chat, chatStream, vision, defaultBaseUrl, defaultModel };
