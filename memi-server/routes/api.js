const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { callLLM, callImageGen, callVision } = require("../utils/aiProxy");
const { callAgent } = require("../utils/agent");
const { createConnectionRoutes } = require("../gateway");

const router = express.Router();
createConnectionRoutes(router);

// 自动保存前端传来的 API 配置供 CLI 使用
function saveConfigToFile(config) {
  // 统一写入 memi-config/config.json
  const dest = path.join(__dirname, "..", "..", "memi-config", "config.json");
  try { fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, JSON.stringify(config, null, 2)); } catch {}
}

const ASPECT_RATIO_SIZE = {
  "1:1": { width: 512, height: 512 },
  "16:9": { width: 512, height: 288 },
  "9:16": { width: 288, height: 512 },
  "4:3": { width: 512, height: 384 },
};
const IMAGE_PIPELINE_TIMEOUT = 300000;
const IMAGE_PROXY_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  Referer: "https://pollinations.ai/",
};

function resolveProxyHeaders(imageUrl) {
  // 只有 enterprise 端点才发 token；image.pollinations.ai 发 token 会被识别为认证请求而拒之
  if (imageUrl && String(imageUrl).includes("enter.pollinations.ai")) {
    return { ...IMAGE_PROXY_HEADERS, "x-enter-token": "1" };
  }
  return IMAGE_PROXY_HEADERS;
}
const STYLE_PROMPTS = {
  Realistic: "Use a realistic photography style.",
  Anime: "Use an anime illustration style.",
  "3D": "Use a polished 3D render style.",
  Cyberpunk: "Use a cyberpunk visual style.",
  "Oil Painting": "Use an oil painting style with painterly brushwork.",
  Watercolor: "Use a soft watercolor painting style.",
  "Pixel Art": "Use a crisp pixel art style.",
  Cinematic: "Use a cinematic film still style with dramatic lighting.",
  Sketch: "Use a pencil sketch style.",
};

const DEFECT_KEYWORDS = [
  "issue", "problem", "flaw", "missing", "wrong", "blurry", "artifact",
  "not match", "doesn't match", "not align", "poor", "low quality",
  "inaccurate", "inconsistent", "瑕疵", "问题", "缺陷", "不匹配",
  "模糊", "不对", "错误", "缺少", "缺失", "不一致",
];

function hasDefectMentions(content) {
  const lower = (content || "").toLowerCase();
  return DEFECT_KEYWORDS.some((w) => lower.includes(w));
}

function parseReviewResult(content) {
  if (!content || typeof content !== "string") {
    return { passed: false, score: 50, reason: "审核模型未返回内容，自动重试", issues: ["empty_review"] };
  }

  let score = 50;

  // Try JSON first
  try {
    const jsonText = content
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    const review = JSON.parse(jsonText);
    if (review && typeof review === "object") {
      const s = Number(review.score);
      if (!isNaN(s) && s >= 0 && s <= 100) score = s;
    }
  } catch {}

  // If JSON didn't work, extract number from text
  if (score === 50) {
    const numbers = content.match(/\b(\d{1,3})\b/g);
    if (numbers) {
      const validScores = numbers.map(Number).filter((n) => n >= 0 && n <= 100);
      if (validScores.length > 0) score = validScores[0];
    }
  }

  // If the response mentions defects, cap the score so retry fires
  if (hasDefectMentions(content) && score >= 60) {
    score = Math.min(score, 50);
  }

  return {
    passed: score >= 60,
    score,
    reason: "审核完成",
    issues: hasDefectMentions(content) ? ["detected_defects"] : [],
  };
}

async function polishPrompt(api1, prompt, style, temperature) {
  const stylePrompt = STYLE_PROMPTS[style] || `Style: ${style}`;
  const userContent =
    style && style !== "None" ? `${prompt}\n${stylePrompt}` : prompt;

  return callLLM(api1, [
    {
      role: "system",
      content:
        "You are a prompt translator for AI image generation. Translate the user's description into English literally. Keep the original meaning exactly. Do not add scenes, objects, or styles that the user did not mention. Output ONLY the English translation, no explanations.",
    },
    {
      role: "user",
      content: userContent,
    },
  ], { temperature });
}

async function rewritePrompt(api1, previousPrompt, review, temperature) {
  return callLLM(api1, [
    {
      role: "system",
      content: `The previous image failed review. Issues: ${review.issues.join(
        ", "
      )}. Rewrite the prompt to fix these issues while keeping the user's intent.`,
    },
    {
      role: "user",
      content: JSON.stringify({
        previousPrompt,
        reason: review.reason,
        issues: review.issues,
        score: review.score,
      }),
    },
  ], { temperature });
}

function ensurePipelineTime(startTime) {
  if (Date.now() - startTime >= IMAGE_PIPELINE_TIMEOUT) {
    throw new Error("图片流水线超时（300秒），请减少重试次数或稍后再试");
  }
}

function createHistoryItem(round, prompt, imageUrl, review) {
  return {
    round,
    prompt,
    imageUrl,
    score: review.score,
    reason: review.reason,
    issues: review.issues,
  };
}

function getReviewErrorResult(error) {
  const isTimeout = error.message.includes("超时") || error.message.includes("timeout");
  const isImageDownloadError = error.message.includes("图片下载失败");

  if (isImageDownloadError) {
    return {
      passed: false,
      score: 50,
      reason: `审核图片下载失败，自动重试: ${error.message}`,
      issues: ["review_image_download_error"],
    };
  }

  return {
    passed: false,
    score: 0,
    reason: isTimeout ? "审核超时" : error.message,
    issues: [isTimeout ? "timeout" : "review_error"],
  };
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function downloadProxyImage(url) {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
    timeout: 30000,
    headers: resolveProxyHeaders(url),
    maxRedirects: 5,
  });
  const buffer = Buffer.from(response.data);
  return {
    buffer,
    contentType: response.headers["content-type"] || "image/jpeg",
  };
}

async function downloadProxyImageWithRetry(url) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await downloadProxyImage(url);
    } catch (error) {
      lastError = error;

      if (!error.message.includes("Status Code 5") || attempt === 3) {
        throw error;
      }

      await sleep(800 * attempt);
    }
  }

  throw lastError;
}

function replacePollinationsHost(imageUrl, newHost) {
  try {
    const parsed = new URL(imageUrl);
    if (parsed.hostname.includes("pollinations")) {
      parsed.hostname = new URL(newHost).hostname;
      parsed.protocol = new URL(newHost).protocol;
      parsed.port = new URL(newHost).port;
      return parsed.toString();
    }
  } catch {}
  return null;
}

router.get("/proxy-image", async (req, res) => {
  const { url } = req.query;

  if (!url || typeof url !== "string") {
    return res.status(400).json({ success: false, error: "缺少图片 URL" });
  }

  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return res.status(400).json({ success: false, error: "图片 URL 不合法" });
  }

  // Express 自动解码 query 参数，可能还原了 %20 → 空格等不可用于 HTTP 请求的字符，
  // 使用 encodeURI 重新编码，保留 ? & # 等 URL 结构字符不变
  const encodedUrl = encodeURI(url);
  const tryUrls = [encodedUrl];

  // 如果原始 URL 是 pollinations 企业端点，备选公共端点兜底
  const publicFallback = replacePollinationsHost(encodedUrl, "https://image.pollinations.ai");
  if (publicFallback && publicFallback !== encodedUrl) {
    tryUrls.push(publicFallback);
  }

  let lastError = "";
  for (const targetUrl of tryUrls) {
    try {
      const image = await downloadProxyImageWithRetry(targetUrl);
      const ct = image.contentType || "";

      // Pollinations 返回 JSON/HTML 而非图片 → 旧版端点已废弃
      if (!ct.startsWith("image/")) {
        const text = image.buffer.toString("utf8").slice(0, 200);
        if (text.includes("legacy endpoint")) {
          lastError = "Pollinations 旧版端点已废弃，图片无法通过代理加载";
        } else {
          lastError = `非图片响应: ${text}`;
        }
        continue;
      }

      res.setHeader("Content-Type", ct);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.send(image.buffer);
    } catch (err) {
      lastError = err.message || "未知错误";
    }
  }

  return res.status(500).json({
    success: false,
    error: `图片代理下载失败: ${lastError}`,
  });
});

router.post("/pipeline/image", async (req, res) => {
  req.setTimeout(IMAGE_PIPELINE_TIMEOUT);
  res.setTimeout(IMAGE_PIPELINE_TIMEOUT);

  const startTime = Date.now();
  const history = [];
  const { api1, api2, api3, prompt, aspectRatio, style, maxRetry } = req.body;
  saveConfigToFile({ api1, api2, api3 });
  const retryLimit = Number.isInteger(maxRetry) ? maxRetry : Number(maxRetry) || 0;
  const size = ASPECT_RATIO_SIZE[aspectRatio] || ASPECT_RATIO_SIZE["1:1"];

  let polishedPrompt = "";
  let imageData = "";
  let latestReview = {
    passed: false,
    score: 0,
    reason: "",
    issues: [],
  };
  let retryCount = 0;
  let exhausted = false;
  const shouldSkipReview = !api3?.baseUrl;

  try {
    ensurePipelineTime(startTime);
    polishedPrompt = await polishPrompt(api1, prompt, style);
  } catch (error) {
    history.push(
      createHistoryItem(1, prompt || "", "", {
        passed: false,
        score: 0,
        reason: `润色: ${error.message}`,
        issues: ["polish_error"],
      })
    );

    return res.json({
      success: false,
      error: `润色: ${error.message}`,
      history,
    });
  }

  while (true) {
    try {
      ensurePipelineTime(startTime);
      imageData = await callImageGen(api2, polishedPrompt, size.width, size.height);
    } catch (error) {
      history.push(
        createHistoryItem(history.length + 1, polishedPrompt, "", {
          passed: false,
          score: 0,
          reason: `生图: ${error.message}`,
          issues: ["image_error"],
        })
      );

      return res.json({
        success: false,
        error: `生图: ${error.message}`,
        history,
      });
    }

    if (shouldSkipReview) {
      latestReview = {
        passed: true,
        score: 100,
        reason: "已跳过审核",
        issues: [],
      };
    } else {
      try {
        ensurePipelineTime(startTime);
        const reviewSystem =
          'Compare the generated image against the user\'s prompt. First, list any mismatches, missing elements, wrong details, blurry areas, artifacts, or quality issues. Be specific. Then assign a score 0-100 where 100 = perfect match and 0 = completely wrong. Score >= 60 passes. Return the score as a number only.';
        const reviewContent = await callVision(
          api3,
          imageData,
          prompt,
          reviewSystem
        );
        latestReview = parseReviewResult(reviewContent);
      } catch (error) {
        latestReview = getReviewErrorResult(error);
      }
    }

    history.push(
      createHistoryItem(history.length + 1, polishedPrompt, imageData, latestReview)
    );

    if (latestReview.score >= 60) break;
    if (retryCount >= retryLimit) {
      exhausted = true;
      break;
    }

    try {
      ensurePipelineTime(startTime);
      polishedPrompt = await rewritePrompt(api1, polishedPrompt, latestReview);
      retryCount += 1;
    } catch (error) {
      return res.json({
        success: false,
        error: `重写提示词: ${error.message}`,
        history,
      });
    }
  }

  res.json({
    success: true,
    type: "image",
    imageUrl: imageData,
    finalPrompt: polishedPrompt,
    score: latestReview.score,
    exhausted,
    history,
    totalTime: Date.now() - startTime,
  });
});

// 融合对话接口：先判断意图，纯聊天走 api1，生图走完整流水线
router.post("/pipeline/chat-complete", async (req, res) => {
  const startTime = Date.now();
  const { api1, api2, api3, messages, aspectRatio, style, maxRetry, maxTokens, polishOnly, overridePrompt, temperature, skipReview } = req.body;
  saveConfigToFile({ api1, api2, api3 });
  const lastUserMsg = [...(messages || [])].reverse().find((m) => m.role === "user");

  if (!lastUserMsg) {
    return res.json({ success: false, error: "No user message", type: "error" });
  }

  // 本地关键词判断意图：避免 callLLM 发送复杂消息格式
  const IMAGE_KEYWORDS = [
    "画", "生成", "创建", "制作", "设计", "绘", "render",
    "draw", "generate", "create", "make", "design", "paint",
    "image", "picture", "photo", "illustration", "art",
    "图", "图片", "照片", "插图",
    "变成", "改成", "换", "修改", "改变", "调整", "改",
    "替换", "换个", "换成", "加", "加上", "去掉", "删除",
    "增加", "添加", "change", "modify", "replace", "edit",
    "transform", "convert", "update", "alter", "remake",
  ];
  const content = typeof lastUserMsg.content === "string" ? lastUserMsg.content : String(lastUserMsg.content || "");
  const text = content.toLowerCase();
  let isImageRequest = IMAGE_KEYWORDS.some((kw) => text.includes(kw));

  // 上下文推断：如果上一条助手消息是图片结果，则用户后续消息很大概率在要求改图
  if (!isImageRequest) {
    const lastAssistant = [...messages].reverse().find(
      (m) => m.role === "assistant" && m.type === "image"
    );
    if (lastAssistant) {
      isImageRequest = true;
    }
  }

  try {
    if (isImageRequest || overridePrompt || polishOnly === true) {
      const prompt = overridePrompt || lastUserMsg.content;
      const retryLimit = Number.isInteger(maxRetry) ? maxRetry : Number(maxRetry) || 0;
      const size = ASPECT_RATIO_SIZE[aspectRatio] || ASPECT_RATIO_SIZE["1:1"];
      const history = [];
      let polishedPrompt = "";
      let imageData = "";
      let latestReview = { passed: false, score: 0, reason: "", issues: [] };
      let retryCount = 0;
      let exhausted = false;
      const shouldSkipReview = !api3?.baseUrl || skipReview === true;

      if (overridePrompt) {
        polishedPrompt = overridePrompt;
      } else {
        try {
          polishedPrompt = await polishPrompt(api1, prompt, style, temperature);
        } catch (error) {
          return res.json({ success: false, error: `润色: ${error.message}`, type: "error" });
        }
      }

      if (polishOnly === true) {
        return res.json({ success: true, type: "polish", polishedPrompt });
      }

      while (true) {
        try {
          imageData = await callImageGen(api2, polishedPrompt, size.width, size.height);
        } catch (error) {
          return res.json({ success: false, error: `生图: ${error.message}`, type: "error", history });
        }

        if (shouldSkipReview) {
          latestReview = { passed: true, score: 100, reason: "已跳过审核", issues: [] };
        } else {
          try {
            const reviewSystem = 'Compare the generated image against the user\'s prompt. First, list any mismatches, missing elements, wrong details, blurry areas, artifacts, or quality issues. Be specific. Then assign a score 0-100 where 100 = perfect match and 0 = completely wrong. Score >= 60 passes. Return the score as a number only.';
            const reviewContent = await callVision(api3, imageData, prompt, reviewSystem);
            latestReview = parseReviewResult(reviewContent);
          } catch (error) {
            latestReview = getReviewErrorResult(error);
          }
        }

        history.push({ round: history.length + 1, prompt: polishedPrompt, imageUrl: imageData, score: latestReview.score, reason: latestReview.reason, issues: latestReview.issues });

        if (latestReview.score >= 60) break;
        if (retryCount >= retryLimit) { exhausted = true; break; }

        ensurePipelineTime(startTime);
        polishedPrompt = await rewritePrompt(api1, polishedPrompt, latestReview, temperature);
        retryCount += 1;
      }

      let description = "";
      try {
        description = await callLLM(api1, [
          { role: "system", content: "You are a helpful assistant. The user just generated an image. Provide a brief friendly response (1-2 sentences) describing what was generated. Use the prompt and score." },
          { role: "user", content: JSON.stringify({ prompt: polishedPrompt, score: latestReview.score }) },
        ], { temperature });
      } catch {
        description = `✨ Generated image${latestReview.score ? ` (Score: ${latestReview.score})` : ""}`;
      }

      return res.json({
        success: true,
        type: "image",
        imageUrl: imageData,
        finalPrompt: polishedPrompt,
        score: latestReview.score,
        exhausted,
        history,
        totalTime: Date.now() - startTime,
        response: description,
      });
    }

    // 纯聊天：使用与 polishPrompt 完全相同的 [{system}, {user}] 格式
    const chatPrompt = messages
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");
    const response = await callLLM(api1, [
      { role: "system", content: "You are a helpful assistant created by Memi. Continue the conversation naturally." },
      { role: "user", content: chatPrompt },
    ], { maxTokens });
    return res.json({ success: true, type: "chat", response });
  } catch (error) {
    return res.json({ success: false, error: error.message, type: "error" });
  }
});

// 对话接口：纯 LLM 聊天，仅使用 api1
router.post("/pipeline/chat", async (req, res) => {
  const { api1, messages, maxTokens } = req.body;

  try {
    const response = await callLLM(api1, messages, { maxTokens });
    res.json({ success: true, response });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// 视频流水线占位接口
router.post("/pipeline/video", (req, res) => {
  res.json({ status: "video pipeline placeholder" });
});

// AI 连通性测试接口
router.post("/test-ai", async (req, res) => {
  const { provider, message } = req.body;

  try {
    const response = await callLLM(provider, [
      {
        role: "user",
        content: message,
      },
    ]);

    res.json({ success: true, response });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Agent 对话接口：支持工具调用的智能代理
router.post("/agent/chat", async (req, res) => {
  const { api1, api2, messages, maxTokens, skills } = req.body;
  saveConfigToFile({ api1, api2 });

  if (!api1?.baseUrl) {
    return res.json({ success: false, error: "请先配置 API1（LLM）", type: "error" });
  }

  // 运行时注入工具 handler
  const runtimeTools = {};
  const newSkills = [];

  // create_skill handler
  runtimeTools.create_skill = async (args) => {
    const skill = {
      name: args.name || "",
      nameEn: args.nameEn || args.name || "",
      type: args.type || "llm",
      description: args.description || "",
      descriptionEn: args.descriptionEn || args.description || "",
      promptTemplate: args.promptTemplate || "",
      builtin: false,
      enabled: true,
    };
    newSkills.push(skill);
    return `技能 "${skill.name}" 已成功创建。类型：${skill.type === "image" ? "图片生成" : "文本处理"}`;
  };

  // run_skill handler
  if (skills && Array.isArray(skills)) {
    runtimeTools.run_skill = async (args) => {
      const allSkills = [...skills, ...newSkills];
      const skill = allSkills.find(
        (s) => (s.name === args.skillName) || (s.nameEn === args.skillName)
      );
      if (!skill) return `技能 "${args.skillName}" 未找到`;
      const filled = (skill.promptTemplate || "").replace(/{input}/g, args.input || "");
      const result = await callLLM(api1, [
        { role: "user", content: filled },
      ], { maxTokens });
      return result;
    };
  }

  // generate_image handler
  if (api2?.baseUrl) {
    runtimeTools.generate_image = async (args) => {
      const width = args.aspectRatio === "16:9" ? 512 : args.aspectRatio === "9:16" ? 288 : 512;
      const height = args.aspectRatio === "9:16" ? 512 : args.aspectRatio === "4:3" ? 384 : 512;
      const styleMsg = args.style && args.style !== "None" ? `, ${args.style} style` : "";
      const prompt = (args.prompt || "") + styleMsg;
      return await callImageGen(api2, prompt, width, height);
    };
  }

  try {
    const result = await callAgent(api1, messages, runtimeTools);
    res.json({
      success: true,
      type: "agent",
      response: result.answer,
      toolCalls: result.toolCalls,
      iterations: result.iterations,
      newSkills: newSkills.length > 0 ? newSkills : undefined,
    });
  } catch (error) {
    res.json({ success: false, error: error.message, type: "error" });
  }
});

// 从 URL 导入技能（GitHub / raw / gist）
router.post("/skills/import", async (req, res) => {
  const { url } = req.body || {};
  if (!url) return res.status(400).json({ success: false, error: "请提供 URL" });

  try {
    const { importSkillFromUrl } = require("../utils/importSkill");
    const skill = await importSkillFromUrl(url);
    res.json({ success: true, skill });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

// OpenAI 兼容端点 — 供 OpenClaw / 外部 Agent 框架调用
// 无：只保留 POST，GET 无意义

router.post("/v1/chat/completions", async (req, res) => {
  const { model, messages, max_tokens, temperature, stream, thinking, systemPrompt } = req.body || {};

  // 从请求体或 config 文件读取 API 配置
  let config = { api1: {} };
  if (req.body.api1) config = { api1: req.body.api1 };
  else {
    // 优先读 memi-config/config.json，回退到 memi-server/config.json
    const homeCfg = path.join(__dirname, "..", "..", "memi-config", "config.json");
    const serverCfg = path.join(__dirname, "..", "config.json");
    const cfgPath = fs.existsSync(homeCfg) ? homeCfg : serverCfg;
    try { if (fs.existsSync(cfgPath)) config = JSON.parse(fs.readFileSync(cfgPath, "utf8")); } catch {}
  }

  if (!config.api1?.baseUrl) {
    return res.status(500).json({ error: { message: "请先在 Memi 设置中配置 API1" } });
  }

  // 请求体中的 model 覆盖配置文件中的 model
  if (model) config.api1.model = model;

  try {
    const agentMessages = (messages || []).map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
    }));

    // 检查是否需要工具：包含工具关键词才走 Agent 循环
    // 始终走 Agent 循环，由 LLM 自行判断是否需要工具
    const thinkLevel = thinking || "high";
    const result = await callAgent(config.api1, agentMessages, {}, thinkLevel, systemPrompt || "");
    console.log("[memi-server][chat] callAgent 完成, answer长度:", (result.answer||"").length, "tools:", result.toolCalls?.length);
    let answer = result.answer || "";
    let toolCalls = result.toolCalls || [];
    let reasoning = result.reasoning || "";
    if (!answer) answer = await callLLM(config.api1, agentMessages, { maxTokens: max_tokens || 2048 });
    const id = "chatcmpl-" + Date.now().toString(36);

    if (stream) {
      // SSE 流式输出
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // 先发送工具调用事件
      if (toolCalls && toolCalls.length > 0) {
        for (const tc of toolCalls) {
          res.write(`data: ${JSON.stringify({ type: "tool_call", tool: tc.tool, args: tc.args, result: tc.result?.slice(0, 800) })}\n\n`);
          await new Promise((r) => setTimeout(r, 80));
        }
      }

      // 再流式输出答案
      let i = 0;
      const chunkSize = 2;
      async function flush() {
        while (i < answer.length) {
          const token = answer.slice(i, i + chunkSize);
          i += chunkSize;
          res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created: Math.floor(Date.now() / 1000), model: model || config.api1.model, choices: [{ index: 0, delta: { content: token } }] })}\n\n`);
          await new Promise((r) => setTimeout(r, 20));
        }
        res.write("data: [DONE]\n\n");
        res.end();
      }
      flush();
    } else {
      res.json({
        id, object: "chat.completion", created: Math.floor(Date.now() / 1000),
        model: model || config.api1.model,
        choices: [{ index: 0, message: { role: "assistant", content: answer, reasoning_content: reasoning }, finish_reason: "stop" }],
        toolCalls: toolCalls,
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
    }
  } catch (error) {
    console.error("[memi-server][chat] 处理失败:", error.message, error.response?.status, error.response?.data);
    res.status(500).json({ error: { message: error.message } });
  }
});

module.exports = router;
