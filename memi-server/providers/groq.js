const axios = require("axios");

const name = "groq";
const defaultBaseUrl = "https://api.groq.com/openai/v1";
const defaultModel = "llama-3.3-70b-versatile";

function detect(baseUrl, model) {
  const b = (baseUrl || "").toLowerCase();
  const m = (model || "").toLowerCase();
  return b.includes("groq") || m.includes("groq");
}

async function chat(provider, messages, options = {}) {
  const { baseUrl, apiKey, model } = provider;
  const body = {
    model: model || "llama-3.3-70b-versatile",
    messages,
    temperature: options.temperature ?? 0.7,
    ...(options.maxTokens > 0 ? { max_tokens: options.maxTokens } : {}),
  };

  const resp = await axios.post(`${baseUrl.replace(/\/$/, "")}/chat/completions`, body, {
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    timeout: 60000,
  });
  return resp.data.choices?.[0]?.message?.content || "";
}

async function vision(provider, imageUrl, prompt, systemPrompt) {
  const { baseUrl, apiKey, model } = provider;
  const body = {
    model: model || "llama-3.2-11b-vision-preview",
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

module.exports = { name, detect, chat, vision, defaultBaseUrl, defaultModel };
