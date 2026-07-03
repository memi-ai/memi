const axios = require("axios");
const http = require("http");
const https = require("https");
const { detectProvider: detectRegProvider, loadBuiltinProviders } = require("../providers/registry");

// ─── 厂商标识 ──────────────────────────────────────────────
const PROVIDER = {
  OPENAI: "openai",
  GEMINI: "gemini",
  ANTHROPIC: "anthropic",
  NVIDIA: "nvidia",
  POLLINATIONS: "pollinations",
};

// 加载 provider 插件
loadBuiltinProviders();

// ─── 厂商探测：先按 provider 注册表，再兜底 ──
function detectProvider(baseUrl, model) {
  const url = (baseUrl || "").toLowerCase();
  const mdl = (model || "").toLowerCase();

  const reg = detectRegProvider(baseUrl, model);
  if (reg) {
    if (reg.name === "gemini") return PROVIDER.GEMINI;
    if (reg.name === "anthropic") return PROVIDER.ANTHROPIC;
  }

  if (url.includes("nvidia.com") || url.includes("integrate.api.nvidia.com")) return PROVIDER.NVIDIA;
  if (url.includes("pollinations")) return PROVIDER.POLLINATIONS;

  // 模型名兜底
  if (mdl.startsWith("gemini")) return PROVIDER.GEMINI;
  if (mdl.startsWith("claude")) return PROVIDER.ANTHROPIC;

  return PROVIDER.OPENAI;
}

// 普通文本和视觉模型请求超时，兼容 CPU 上较慢的本地 Ollama
const REQUEST_TIMEOUT = 60000;
const IMAGE_GEN_TIMEOUT = 180000;
const VISION_TIMEOUT = 180000;
const IMAGE_DOWNLOAD_TIMEOUT = 60000;
const MAX_VISION_IMAGE_BYTES = 100 * 1024;
const IMAGE_DOWNLOAD_HEADERS_BASE = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  Referer: "https://pollinations.ai/",
};

function resolveDownloadHeaders(imageUrlOrHost) {
  // 只有 enterprise 端点才发 token；image.pollinations.ai 发 token 会被识别为认证请求而拒之
  const target = imageUrlOrHost ? String(imageUrlOrHost) : "";
  if (target.includes("enter.pollinations.ai")) {
    return { ...IMAGE_DOWNLOAD_HEADERS_BASE, "x-enter-token": "1" };
  }
  return IMAGE_DOWNLOAD_HEADERS_BASE;
}

let sharp = null;

try {
  sharp = require("sharp");
} catch (error) {
  // sharp 不可用时仍允许视觉审核继续，只是不做压缩
  console.warn("图片未压缩，可能导致 API 请求过大");
}

function buildUrl(baseUrl, path) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function getHeaders(apiKey, provider) {
  const headers = { "Content-Type": "application/json" };

  if (provider === PROVIDER.ANTHROPIC) {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else {
    // OpenAI 兼容 — 包括 NVIDIA NIM / Ollama 等
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  return headers;
}

function getErrorMessage(error, timeoutMessage) {
  if (error.code === "ECONNABORTED") {
    return timeoutMessage || "API 请求超时";
  }

  const status = error.response?.status;
  const message =
    error.response?.data?.error?.message ||
    error.response?.data?.message ||
    error.code ||
    error.message ||
    "未知错误";

  if (status === 401) {
    return "API Key 无效";
  }

  return `API 错误: ${status || "未知状态"} ${message}`;
}

function parseImageData(content) {
  if (typeof content !== "string") {
    return content;
  }

  const text = content.trim();

  try {
    const data = JSON.parse(text);
    return data.url || data.imageUrl || data.image_url || data.base64 || data.b64_json || data.image || data;
  } catch (error) {
    const dataUrlMatch = text.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/);
    const urlMatch = text.match(/https?:\/\/\S+/);

    return dataUrlMatch?.[0] || urlMatch?.[0] || text;
  }
}

const RETRYABLE_STATUSES = [429, 502, 503];

async function postJson(url, apiKey, body, options = {}) {
  const timeout = options.timeout || REQUEST_TIMEOUT;
  const timeoutMessage = options.timeoutMessage;
  const maxRetries = options.maxRetries ?? 3;
  const provider = options.provider || PROVIDER.OPENAI;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.post(url, body, {
        headers: getHeaders(apiKey, provider),
        timeout,
        proxy: false,
      });

      return response.data;
    } catch (error) {
      const status = error.response?.status;
      const isRetryable = RETRYABLE_STATUSES.includes(status);

      if (!isRetryable || attempt === maxRetries) {
        throw new Error(getErrorMessage(error, timeoutMessage));
      }

      // 指数退避：800ms, 1600ms, 3200ms...
      const delay = 800 * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // unreachable — last attempt always throws
  throw new Error("postJson: 意外退出重试循环");
}

async function compressVisionImage(buffer) {
  if (!sharp) {
    console.warn("图片未压缩，可能导致 API 请求过大");
    return buffer;
  }

  const attempts = [
    { size: 512, quality: 80 },
    { size: 512, quality: 70 },
    { size: 448, quality: 70 },
    { size: 384, quality: 65 },
    { size: 320, quality: 60 },
  ];

  for (const attempt of attempts) {
    // 将图片等比例压缩到指定尺寸以内，并输出为 JPEG
    const compressed = await sharp(buffer)
      .resize(attempt.size, attempt.size, { fit: "inside" })
      .jpeg({ quality: attempt.quality })
      .toBuffer();

    if (compressed.length <= MAX_VISION_IMAGE_BYTES) {
      return compressed;
    }
  }

  // 极端情况下继续返回最后一档压缩结果，尽量降低请求体大小
  return sharp(buffer)
    .resize(256, 256, { fit: "inside" })
    .jpeg({ quality: 55 })
    .toBuffer();
}

function isImageBuffer(buffer) {
  if (buffer.length < 4) return false;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return true;
  if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) return true;
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) return true;
  if (buffer[0] === 0x42 && buffer[1] === 0x4d) return true;
  return false;
}

function downloadImageWithNative(imageUrl) {
  return new Promise((resolve, reject) => {
    const client = imageUrl.startsWith("https://") ? https : http;
    const request = client.get(
      imageUrl,
      {
        headers: resolveDownloadHeaders(imageUrl),
        timeout: IMAGE_DOWNLOAD_TIMEOUT,
      },
      (response) => {
        const chunks = [];

        if (!response) {
          reject(new Error("图片服务器没有返回响应"));
          return;
        }

        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const buffer = Buffer.concat(chunks);

          if (response.statusCode !== 200) {
            const errorText = buffer.toString("utf8").slice(0, 200);
            reject(
              new Error(
                `图片服务器返回 Status Code ${response.statusCode}${
                  errorText ? `，内容：${errorText}` : ""
                }`
              )
            );
            return;
          }

          if (buffer.length === 0) {
            reject(new Error("图片服务器返回了空内容"));
            return;
          }

          if (!isImageBuffer(buffer)) {
            const textPreview = buffer.toString("utf8").slice(0, 200);
            reject(
              new Error(
                `响应内容不是有效图片格式，内容预览：${textPreview}`
              )
            );
            return;
          }

          resolve(buffer);
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error("API 请求超时"));
    });
    request.on("error", reject);
  });
}

async function downloadVisionImage(imageUrl) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      // 视觉审核前先下载图片，Pollinations 偶发 5xx 时短暂重试
      return await downloadImageWithNative(imageUrl);
    } catch (error) {
      lastError = error;

      if (!error.message.includes("Status Code 5") || attempt === 3) {
        throw error;
      }

      await new Promise((resolve) => {
        setTimeout(resolve, 800 * attempt);
      });
    }
  }

  throw lastError;
}

function buildPollinationsUrl(baseUrl, prompt, width, height, seed, extraParams = "&nologo=true") {
  return `${baseUrl}/prompt/${encodeURIComponent(
    prompt
  )}?width=${width}&height=${height}&seed=${seed}${extraParams}`;
}

function getPromptSeed(prompt) {
  let hash = 0;

  for (let index = 0; index < prompt.length; index += 1) {
    hash = (hash * 31 + prompt.charCodeAt(index)) >>> 0;
  }

  return hash || 42;
}

const POLLINATIONS_PUBLIC_HOST = "https://image.pollinations.ai";

const POLLINATIONS_URL_VARIANTS = [
  "&nologo=true",              // 标准格式
  "",                          // 无 nologo
  "&nologo=true&format=jpeg",  // 标准 + JPEG
  "&format=jpeg",              // 仅 JPEG
];

const POLLINATIONS_LONG_TIMEOUT = 180000; // 180s — Pollinations 生成慢时可能需长时间排队
const isLegacyEndpointError = (msg) => msg && typeof msg === "string" && msg.includes("legacy endpoint");

async function downloadPollinationsImage(baseUrl, prompt, width, height) {
  const seeds = [
    getPromptSeed(prompt),
    42,
    20240523,
    Math.floor(Math.random() * 1000000000),
  ];
  const hosts = [baseUrl, POLLINATIONS_PUBLIC_HOST];
  let lastError = "";
  let fallbackUrl = "";
  let hitLegacyError = false;

  for (const host of hosts) {
    for (const variant of POLLINATIONS_URL_VARIANTS) {
      const trySeeds = variant === "&nologo=true" ? seeds : [seeds[0]];
      for (const seed of trySeeds) {
        const imageUrl = buildPollinationsUrl(host, prompt, width, height, seed, variant);
        if (host === POLLINATIONS_PUBLIC_HOST && seed === seeds[0]) {
          fallbackUrl = imageUrl;
        }
        try {
          const response = await axios.get(imageUrl, {
            responseType: "arraybuffer",
            timeout: POLLINATIONS_LONG_TIMEOUT,
            headers: resolveDownloadHeaders(imageUrl),
            proxy: false,
            // 402 = queue full，允许响应而不是直接抛异常
            validateStatus: (status) => (status >= 200 && status < 300) || status === 402 || status === 500,
          });

          const buffer = Buffer.from(response.data);
          const ct = (response.headers["content-type"] || "").toLowerCase();
          const status = response.status;

          // 402 queue full → 等一会重试
          if (status === 402) {
            lastError = `队列满: ${buffer.toString("utf8").slice(0, 100)}`;
            await new Promise((r) => setTimeout(r, 3000));
            continue;
          }

          // JSON/文本响应 → Pollinations 返回了错误信息
          if (ct.includes("json") || ct.includes("text") || ct.includes("html")) {
            const text = buffer.toString("utf8").slice(0, 500);
            if (isLegacyEndpointError(text)) {
              hitLegacyError = true;
              lastError = "Pollinations 旧版端点已废弃";
            } else {
              lastError = text;
            }
            continue;
          }

          // 图片响应
          if (buffer.length > 0 && isImageBuffer(buffer)) {
            return `data:image/jpeg;base64,${buffer.toString("base64")}`;
          }
        } catch (error) {
          lastError = error.message;
        }
      }
    }
  }

  const truncated = lastError.length > 120 ? lastError.slice(0, 120) + "..." : lastError;
  console.error(`[Pollinations] All attempts failed (${truncated}), fallback: ${fallbackUrl.slice(0, 100)}...`);

  if (hitLegacyError) {
    throw new Error("Pollinations 已将旧版端点标记为废弃，生图可能失败。建议更换到其他 API2 提供商（如设置中更换 baseUrl）。");
  }
  return fallbackUrl || buildPollinationsUrl(POLLINATIONS_PUBLIC_HOST, prompt, width, height, seeds[0], "");
}

async function getVisionImageUrl(imageUrl) {
  if (typeof imageUrl === "string" && imageUrl.startsWith("data:image")) {
    return imageUrl;
  }

  if (
    typeof imageUrl === "string" &&
    (imageUrl.startsWith("http://") || imageUrl.startsWith("https://"))
  ) {
    try {
      // Ollama 和 NVIDIA NIM 的部分视觉模型不支持远程图片 URL，这里先下载并转成 base64
      const downloadedImage = await downloadVisionImage(imageUrl);
      const imageBuffer = await compressVisionImage(downloadedImage);
      const base64 = imageBuffer.toString("base64");

      return `data:image/jpeg;base64,${base64}`;
    } catch (error) {
      throw new Error(`图片下载失败：${getErrorMessage(error)}`);
    }
  }

  return imageUrl;
}

// ─── LLM 调用：厂商专用实现 ────────────────────────────

async function callLLMOpenAI(baseUrl, apiKey, model, messages, extra) {
  const { maxTokens, temperature } = extra || {};
  const body = {
    model,
    messages,
    temperature: temperature ?? 0.7,
  };
  if (maxTokens > 0) body.max_tokens = maxTokens;

  const data = await postJson(
    buildUrl(baseUrl, "/chat/completions"),
    apiKey,
    body,
    { provider: PROVIDER.OPENAI },
  );

  return data.choices?.[0]?.message?.content || "";
}

async function callLLMGemini(baseUrl, apiKey, model, messages, extra) {
  const { maxTokens, temperature } = extra || {};
  const endpoint = buildUrl(baseUrl, `/models/${model}:generateContent`);

  // Gemini role map: "assistant" → "model", "system" → "user"（Gemini 无 system role）
  const contents = [{ role: "user", parts: [] }];
  for (const msg of messages) {
    if (msg.role === "system") {
      // Gemini 不支持 system role，合并到第一条 user 内容前
      contents[0].parts.push({ text: `[System instruction]\n${msg.content}\n[/System instruction]\n` });
      continue;
    }
    const role = msg.role === "assistant" ? "model" : "user";
    // 如果是 system 之后的 user，追加到当前 user block
    if (role === "user" && contents[contents.length - 1].role === "user") {
      contents[contents.length - 1].parts.push({ text: msg.content });
      continue;
    }
    contents.push({ role, parts: [{ text: msg.content }] });
  }

  const body = { contents, generationConfig: { temperature: temperature ?? 0.7 } };
  if (maxTokens > 0) body.generationConfig.maxOutputTokens = maxTokens;

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["x-goog-api-key"] = apiKey;

  const response = await axios.post(endpoint, body, { headers, timeout: REQUEST_TIMEOUT, proxy: false });
  const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return text;
}

async function callLLMAnthropic(baseUrl, apiKey, model, messages, extra) {
  const { maxTokens, temperature } = extra || {};

  // Anthropic 消息格式：[{role, content}]，合并连续同角色消息
  const anthropicMessages = [];
  for (const m of messages) {
    if (m.role === "system") continue;
    const role = m.role === "assistant" ? "assistant" : "user";
    const last = anthropicMessages[anthropicMessages.length - 1];
    if (last && last.role === role) {
      last.content += "\n" + m.content;
    } else {
      anthropicMessages.push({ role, content: m.content || "" });
    }
  }

  // 提取 system prompt（Anthropic 使用顶层 system 参数）
  const systemMsg = messages.find((m) => m.role === "system");

  const body = {
    model,
    messages: anthropicMessages,
    max_tokens: maxTokens > 0 ? maxTokens : 1024,
    temperature: temperature ?? 0.7,
  };
  if (systemMsg) body.system = systemMsg.content;

  const headers = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };

  const response = await axios.post(buildUrl(baseUrl, "/messages"), body, {
    headers,
    timeout: REQUEST_TIMEOUT,
    proxy: false,
  });

  return response.data?.content?.[0]?.text || "";
}

async function callLLM(provider, messages, extra = {}) {
  const { baseUrl, apiKey, model } = provider;
  const reg = detectRegProvider(baseUrl, model);

  if (reg && reg.name !== "openai") {
    // 使用 provider 插件的原生实现（支持全部特有参数）
    return reg.chat({ baseUrl, apiKey, model }, messages, {
      maxTokens: extra.maxTokens || 0,
      temperature: extra.temperature,
    });
  }

  const detected = detectProvider(baseUrl, model);
  switch (detected) {
    case PROVIDER.GEMINI:
      return callLLMGemini(baseUrl, apiKey, model, messages, extra);
    case PROVIDER.ANTHROPIC:
      return callLLMAnthropic(baseUrl, apiKey, model, messages, extra);
    default:
      return callLLMOpenAI(baseUrl, apiKey, model, messages, extra);
  }
}

async function callImageGen(provider, prompt, width, height) {
  const { baseUrl, apiKey, model } = provider;
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const detected = detectProvider(baseUrl, model);

  // Gemini 原生生图
  if (detected === PROVIDER.GEMINI) {
    return callGeminiImage(normalizedBaseUrl, apiKey, model, prompt, width, height);
  }

  // Pollinations 专用流程
  if (detected === PROVIDER.POLLINATIONS) {
    return downloadPollinationsImage(normalizedBaseUrl, prompt, width, height);
  }

  // OpenAI DALL-E 风格 /images/generations
  const hasImageGenEndpoint =
    baseUrl.includes("images/generations") || detected === PROVIDER.OPENAI;

  if (hasImageGenEndpoint) {
    const url = baseUrl.includes("images/generations")
      ? baseUrl
      : buildUrl(baseUrl, "/images/generations");

    const data = await postJson(
      url,
      apiKey,
      {
        model,
        prompt,
        n: 1,
        size: `${width}x${height}`,
      },
      {
        timeout: IMAGE_GEN_TIMEOUT,
        timeoutMessage: "生图 API 请求超时（120秒），请检查网络或模型是否可用",
        provider: detected,
      }
    );

    return data.data?.[0]?.url || data.data?.[0]?.b64_json || "";
  }

  // Hugging Face Inference API
  if (normalizedBaseUrl.includes("huggingface")) {
    return callHuggingFaceImage(normalizedBaseUrl, apiKey, model, prompt, width, height);
  }

  // 通用兼容模式：让模型返回图片 URL 或 base64
  const data = await postJson(
    buildUrl(baseUrl, "/chat/completions"),
    apiKey,
    {
      model,
      messages: [
        {
          role: "user",
          content: `请根据以下提示生成图片，并只返回图片 URL 或 base64 数据：${prompt}。图片尺寸：${width}x${height}`,
        },
      ],
      temperature: 0.7,
    },
    {
      timeout: IMAGE_GEN_TIMEOUT,
      timeoutMessage: "生图 API 请求超时（120秒），请检查网络或模型是否可用",
      provider: detected,
    }
  );
  const content = data.choices?.[0]?.message?.content || "";

  return parseImageData(content);
}

/**
 * Hugging Face Inference API 生图。
 * POST {baseUrl}  body: { inputs: prompt }
 * 返回原始图片 bytes。
 */
async function callHuggingFaceImage(baseUrl, apiKey, model, prompt, width, height) {
  const endpoint = baseUrl.includes("models/") ? baseUrl : buildUrl(baseUrl, `/models/${model}`);
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;

  const body = {
    inputs: prompt + `, ${width}x${height}`,
    parameters: { width, height },
  };

  try {
    const response = await axios.post(endpoint, body, {
      headers,
      timeout: IMAGE_GEN_TIMEOUT,
      responseType: "arraybuffer",
      proxy: false,
    });

    const buffer = Buffer.from(response.data);
    const ct = (response.headers["content-type"] || "").toLowerCase();

    if (ct.startsWith("image/")) {
      return `data:${ct};base64,${buffer.toString("base64")}`;
    }

    // 部分 HF 模型返回 JSON 中的图片 URL
    const text = buffer.toString("utf8");
    const parsed = parseImageData(text);
    if (parsed && parsed !== text) return parsed;

    throw new Error(`HF 未返回图片：${text.slice(0, 200)}`);
  } catch (error) {
    if (error.message.startsWith("HF")) throw error;
    if (error.response?.data) {
      const msg = typeof error.response.data === "string"
        ? error.response.data.slice(0, 200)
        : JSON.stringify(error.response.data).slice(0, 200);
      throw new Error(`Hugging Face 生图失败: ${msg}`);
    }
    throw new Error(`Hugging Face 生图失败: ${getErrorMessage(error, "请求超时（180秒）")}`);
  }
}

/**
 * Google Gemini 原生生图。
 * API: POST {baseUrl}/models/{model}:generateContent
 * 返回 inlineData（base64 图片）或文本中的 URL。
 */
async function callGeminiImage(baseUrl, apiKey, model, prompt, width, height) {
  const endpoint = buildUrl(baseUrl, `/models/${model}:generateContent`);

  const headers = { "Content-Type": "application/json" };
  if (apiKey) {
    headers["x-goog-api-key"] = apiKey;
  }

  const body = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  };

  try {
    const response = await axios.post(endpoint, body, {
      headers,
      timeout: IMAGE_GEN_TIMEOUT,
      proxy: false,
    });

    const candidates = response.data?.candidates || [];

    // 优先取 inlineData（图片本体）
    for (const candidate of candidates) {
      const parts = candidate?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          const mime = part.inlineData.mimeType || "image/png";
          return `data:${mime};base64,${part.inlineData.data}`;
        }
      }
    }

    // 兜底：文本中提取图片 URL
    for (const candidate of candidates) {
      const parts = candidate?.content?.parts || [];
      for (const part of parts) {
        if (part.text) {
          const parsed = parseImageData(part.text);
          if (typeof parsed === "string" && (parsed.startsWith("data:") || parsed.startsWith("http"))) {
            return parsed;
          }
        }
      }
    }

    throw new Error("Gemini 未返回图片数据");
  } catch (error) {
    if (error.response) {
      const msg = error.response?.data?.error?.message || error.message;
      throw new Error(`Gemini 生图失败: ${msg}`);
    }
    throw new Error(`Gemini 生图失败: ${getErrorMessage(error, "请求超时")}`);
  }
}

// ─── Vision 调用：厂商专用实现 ──────────────────────────

async function callVisionOpenAI(baseUrl, apiKey, model, visionImageUrl, prompt, systemPrompt) {
  const messages = [
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: visionImageUrl } },
      ],
    },
  ];

  if (systemPrompt) {
    messages.unshift({ role: "system", content: systemPrompt });
  }

  const data = await postJson(
    buildUrl(baseUrl, "/chat/completions"),
    apiKey,
    { model, messages, temperature: 0.7 },
    {
      timeout: VISION_TIMEOUT,
      timeoutMessage: "审核 API 请求超时（180秒），请检查网络或模型是否可用",
      provider: PROVIDER.OPENAI,
    }
  );

  return data.choices?.[0]?.message?.content || "";
}

async function callVisionNVIDIA(baseUrl, apiKey, model, visionImageUrl, prompt, systemPrompt) {
  const reviewText = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;

  // NVIDIA NIM 使用单条 user 消息承载文字审核指令和 base64 图片
  const data = await postJson(
    buildUrl(baseUrl, "/chat/completions"),
    apiKey,
    {
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: reviewText },
            { type: "image_url", image_url: { url: visionImageUrl } },
          ],
        },
      ],
      max_tokens: 1024,
      temperature: 0.2,
      top_p: 0.9,
      stream: false,
    },
    {
      timeout: VISION_TIMEOUT,
      timeoutMessage: "审核 API 请求超时（180秒），请检查网络或模型是否可用",
      provider: PROVIDER.NVIDIA,
    }
  );

  return data.choices?.[0]?.message?.content || "";
}

async function callVisionGemini(baseUrl, apiKey, model, visionImageUrl, prompt, systemPrompt) {
  const endpoint = buildUrl(baseUrl, `/models/${model}:generateContent`);

  // Gemini 用 inlineData 传图
  const parts = [{ text: prompt }];

  // 系统指令 → Gemini generationConfig.systemInstruction
  let systemInstruction = null;
  if (systemPrompt) {
    systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  // 如果 visionImageUrl 是 data URI，提取 base64 数据
  let imagePart = null;
  if (visionImageUrl.startsWith("data:image")) {
    const [meta, b64] = visionImageUrl.split(",");
    const mime = meta.match(/data:(.*?);/)?.[1] || "image/jpeg";
    imagePart = { inlineData: { mimeType: mime, data: b64 } };
  } else if (visionImageUrl.startsWith("http")) {
    // Gemini 支持直接传 URL
    imagePart = { fileData: { fileUri: visionImageUrl, mimeType: "image/jpeg" } };
  } else {
    imagePart = { text: visionImageUrl };
  }
  parts.push(imagePart);

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
  };
  if (systemInstruction) body.systemInstruction = systemInstruction;

  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["x-goog-api-key"] = apiKey;

  try {
    const response = await axios.post(endpoint, body, { headers, timeout: VISION_TIMEOUT, proxy: false });
    return response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
  } catch (error) {
    if (error.response) {
      const msg = error.response?.data?.error?.message || error.message;
      throw new Error(`Gemini 审核失败: ${msg}`);
    }
    throw new Error(`Gemini 审核失败: ${getErrorMessage(error, "请求超时")}`);
  }
}

async function callVisionAnthropic(baseUrl, apiKey, model, visionImageUrl, prompt, systemPrompt) {
  // Anthropic 使用 type:"image" content block
  const content = [{ type: "text", text: prompt }];

  if (visionImageUrl.startsWith("data:image")) {
    const [meta, b64] = visionImageUrl.split(",");
    const mime = meta.match(/data:(.*?);/)?.[1] || "image/jpeg";
    content.push({
      type: "image",
      source: { type: "base64", media_type: mime, data: b64 },
    });
  }

  const body = {
    model,
    messages: [{ role: "user", content }],
    max_tokens: 1024,
    temperature: 0.2,
  };
  if (systemPrompt) body.system = systemPrompt;

  const headers = {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };

  try {
    const response = await axios.post(buildUrl(baseUrl, "/messages"), body, {
      headers, timeout: VISION_TIMEOUT, proxy: false,
    });
    return response.data?.content?.[0]?.text || "";
  } catch (error) {
    if (error.response) {
      const msg = error.response?.data?.error?.message || error.message;
      throw new Error(`Anthropic 审核失败: ${msg}`);
    }
    throw new Error(`Anthropic 审核失败: ${getErrorMessage(error, "请求超时")}`);
  }
}

async function callVision(provider, imageUrl, prompt, systemPrompt) {
  const { baseUrl, apiKey, model } = provider;
  const visionImageUrl = await getVisionImageUrl(imageUrl);
  const detected = detectProvider(baseUrl, model);

  switch (detected) {
    case PROVIDER.GEMINI:
      return callVisionGemini(baseUrl, apiKey, model, visionImageUrl, prompt, systemPrompt);
    case PROVIDER.ANTHROPIC:
      return callVisionAnthropic(baseUrl, apiKey, model, visionImageUrl, prompt, systemPrompt);
    case PROVIDER.NVIDIA:
      return callVisionNVIDIA(baseUrl, apiKey, model, visionImageUrl, prompt, systemPrompt);
    default:
      return callVisionOpenAI(baseUrl, apiKey, model, visionImageUrl, prompt, systemPrompt);
  }
}

module.exports = {
  callLLM,
  callImageGen,
  callVision,
};
