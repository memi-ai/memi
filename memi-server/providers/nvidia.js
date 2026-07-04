const axios = require("axios");

const name = "nvidia";
const defaultBaseUrl = "https://integrate.api.nvidia.com/v1";
const defaultModel = "meta/llama-3.1-70b-instruct";

function detect(baseUrl, model) {
  const b = (baseUrl || "").toLowerCase();
  const m = (model || "").toLowerCase();
  return b.includes("nvidia") || m.includes("nvidia");
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
