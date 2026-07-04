const axios = require("axios");

const name = "cloudflare";
const defaultBaseUrl = "https://api.cloudflare.com/client/v4/accounts/YOUR_ID/ai/v1";
const defaultModel = "@cf/meta/llama-3-8b-instruct";

function detect(baseUrl, model) {
  const b = (baseUrl || "").toLowerCase();
  const m = (model || "").toLowerCase();
  return b.includes("cloudflare") || m.includes("@cf/");
}

async function chat(provider, messages, options = {}) {
  const { baseUrl = defaultBaseUrl, apiKey, model = defaultModel } = provider;
  const body = {
    model,
    messages,
    ...(options.maxTokens > 0 ? { max_tokens: options.maxTokens } : {}),
  };
  const resp = await axios.post(`${baseUrl.replace(/\/$/, "")}/chat/completions`, body, {
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    timeout: 60000,
  });
  return resp.data.choices?.[0]?.message?.content || "";
}

module.exports = { name, detect, chat, defaultBaseUrl, defaultModel };
