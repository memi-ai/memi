const axios = require("axios");

const name = "anthropic";
const defaultBaseUrl = "https://api.anthropic.com/v1";
const defaultModel = "claude-sonnet-4-20250514";

function detect(baseUrl, model) {
  const b = (baseUrl || "").toLowerCase();
  const m = (model || "").toLowerCase();
  return b.includes("anthropic") || m.startsWith("claude");
}

async function chat(provider, messages, options = {}) {
  const { baseUrl, apiKey, model } = provider;
  const url = `${baseUrl.replace(/\/$/, "")}/messages`;
  const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n");
  const msgs = messages.filter((m) => m.role !== "system");

  const body = {
    model: model || "claude-sonnet-4-20250514",
    max_tokens: options.maxTokens > 0 ? options.maxTokens : 4096,
    messages: msgs.map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
    ...(system ? { system } : {}),
  };

  const resp = await axios.post(url, body, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    timeout: 60000,
  });
  return resp.data.content?.[0]?.text || "";
}

async function vision(provider, imageUrl, prompt, systemPrompt) {
  const { baseUrl, apiKey, model } = provider;
  const url = `${baseUrl.replace(/\/$/, "")}/messages`;
  const isBase64 = imageUrl.startsWith("data:");
  const source = isBase64
    ? (() => {
        const m = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
        return m ? { type: "base64", media_type: `image/${m[1]}`, data: m[2] } : null;
      })()
    : { type: "url", url: imageUrl };

  const body = {
    model: model || "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [{
      role: "user",
      content: [
        ...(systemPrompt ? [{ type: "text", text: systemPrompt }] : []),
        { type: "text", text: prompt },
        { type: "image", source },
      ],
    }],
  };

  const resp = await axios.post(url, body, {
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    timeout: 180000,
  });
  return resp.data.content?.[0]?.text || "";
}

module.exports = { name, detect, chat, vision, defaultBaseUrl, defaultModel };
