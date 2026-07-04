const axios = require("axios");

const name = "localai";
const defaultBaseUrl = "http://localhost:8080/v1";
const defaultModel = "model";

function detect(baseUrl, model) {
  const b = (baseUrl || "").toLowerCase();
  return b.includes("localhost") || b.includes("127.0.0.1") || b.includes("localai");
}

async function chat(provider, messages, options = {}) {
  const { baseUrl = defaultBaseUrl, apiKey, model = defaultModel } = provider;
  const body = {
    model,
    messages,
    ...(options.maxTokens > 0 ? { max_tokens: options.maxTokens } : {}),
  };
  const resp = await axios.post(`${baseUrl.replace(/\/$/, "")}/chat/completions`, body, {
    headers: { ...(apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}), "Content-Type": "application/json" },
    timeout: 60000,
  });
  return resp.data.choices?.[0]?.message?.content || "";
}

module.exports = { name, detect, chat, defaultBaseUrl, defaultModel };
