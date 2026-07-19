const axios = require("axios");

const name = "xfyun";
const displayName = "讯飞星火";
const defaultBaseUrl = "https://spark-api-open.xf-yun.com/v1";
const defaultModel = "lite";

function detect(baseUrl, model) {
  const b = (baseUrl || "").toLowerCase();
  return b.includes("xfyun") || b.includes("spark-api") || b.includes("讯飞");
}

async function chat(provider, messages, options = {}) {
  const { baseUrl, apiKey, model } = provider;
  const { maxTokens, temperature = 0.7, stream } = options;
  const body = {
    model: model || "lite",
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

module.exports = { name, displayName, detect, chat, chatStream, defaultBaseUrl, defaultModel };
