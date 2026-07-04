const axios = require("axios");

const name = "gemini";
const defaultBaseUrl = "https://generativelanguage.googleapis.com/v1beta/openai";
const defaultModel = "gemini-2.0-flash";

function detect(baseUrl, model) {
  const b = (baseUrl || "").toLowerCase();
  const m = (model || "").toLowerCase();
  return b.includes("googleapis") || b.includes("generativelanguage") || m.startsWith("gemini");
}

async function chat(provider, messages, options = {}) {
  const { baseUrl, apiKey, model } = provider;
  const url = baseUrl.includes("openai")
    ? `${baseUrl.replace(/\/$/, "")}/chat/completions`
    : `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.0-flash"}:generateContent`;

  if (url.includes("generateContent")) {
    const contents = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : m.role,
      parts: [{ text: m.content }],
    }));
    const body = { contents, ...(options.maxTokens > 0 ? { generationConfig: { maxOutputTokens: options.maxTokens } } : {}) };
    const resp = await axios.post(`${url}?key=${apiKey}`, body, { timeout: 60000, headers: { "Content-Type": "application/json" } });
    return resp.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  const body = {
    model: model || "gemini-2.0-flash",
    messages,
    ...(options.maxTokens > 0 ? { max_tokens: options.maxTokens } : {}),
  };
  const resp = await axios.post(url, body, {
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    timeout: 60000,
  });
  return resp.data.choices?.[0]?.message?.content || "";
}

async function vision(provider, imageUrl, prompt, systemPrompt) {
  const { baseUrl, apiKey, model } = provider;
  const useNative = !baseUrl.includes("openai");

  if (useNative) {
    const isBase64 = imageUrl.startsWith("data:");
    const parts = [{ text: prompt }];
    if (isBase64) {
      const m = imageUrl.match(/^data:image\/(\w+);base64,(.+)$/);
      if (m) parts.push({ inlineData: { mimeType: `image/${m[1]}`, data: m[2] } });
    } else {
      parts.push({ fileData: { fileUri: imageUrl, mimeType: "image/jpeg" } });
    }

    const body = {
      contents: [{
        role: "user",
        parts: [
          ...(systemPrompt ? [{ text: systemPrompt }] : []),
          ...parts,
        ],
      }],
    };
    const resp = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.0-flash"}:generateContent?key=${apiKey}`,
      body,
      { timeout: 180000, headers: { "Content-Type": "application/json" } }
    );
    return resp.data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  }

  const openai = require("./openai");
  return openai.vision(provider, imageUrl, prompt, systemPrompt);
}

async function imageGen(provider, prompt, width, height) {
  const { apiKey, model } = provider;
  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
  };
  try {
    const resp = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-2.0-flash"}:generateContent?key=${apiKey}`,
      body,
      { timeout: 120000, headers: { "Content-Type": "application/json" } }
    );
    const parts = resp.data.candidates?.[0]?.content?.parts || [];
    for (const p of parts) {
      if (p.inlineData && p.inlineData.data) {
        return `data:${p.inlineData.mimeType || "image/png"};base64,${p.inlineData.data}`;
      }
    }
  } catch {}
  return "";
}

module.exports = { name, detect, chat, vision, imageGen, defaultBaseUrl, defaultModel };
