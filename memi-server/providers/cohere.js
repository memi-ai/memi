const axios = require("axios");

const name = "cohere";
const defaultBaseUrl = "https://api.cohere.ai/v1";
const defaultModel = "command-r-plus";

function detect(baseUrl, model) {
  const b = (baseUrl || "").toLowerCase();
  const m = (model || "").toLowerCase();
  return b.includes("cohere") || m.startsWith("command");
}

async function chat(provider, messages, options = {}) {
  const { baseUrl, apiKey, model } = provider;
  const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
  const chatHistory = messages.slice(0, messages.indexOf(lastUserMsg)).map((m) => ({
    role: m.role === "assistant" ? "CHATBOT" : "USER",
    message: m.content,
  }));

  const body = {
    model: model || "command-r-plus",
    message: lastUserMsg?.content || "",
    ...(chatHistory.length > 0 ? { chat_history: chatHistory } : {}),
    ...(options.maxTokens > 0 ? { max_tokens: options.maxTokens } : {}),
    temperature: options.temperature ?? 0.7,
  };

  const resp = await axios.post("https://api.cohere.ai/v1/chat", body, {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    timeout: 60000,
  });
  return resp.data.text || "";
}

module.exports = { name, detect, chat, defaultBaseUrl, defaultModel };
