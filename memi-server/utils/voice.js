// ╔══════════════════════════════════════════════════════════╗
// ║  Memi Voice — 语音转文字 (Whisper) + 文字转语音 (TTS)     ║
// ╚══════════════════════════════════════════════════════════╝

const axios = require("axios");
const fs = require("fs");
const path = require("path");

const CONFIG_DIR = path.join(__dirname, "..", "..", "memi-config");

function readConfig() {
  try {
    const f = path.join(CONFIG_DIR, "config.json");
    if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  } catch {}
  return {};
}

// ─── Whisper 语音转文字 ─────────────────────────────────
async function transcribe(audioBase64, config) {
  if (!config) config = readConfig();
  const api = config.api1 || config;
  if (!api.apiKey) throw new Error("未配置 API Key");

  // 优先使用 OpenAI 官方 Whisper API
  // 也兼容 DeepSeek / 通义千问 等代理
  let endpoint = "https://api.openai.com/v1";
  if (api.baseUrl) {
    endpoint = api.baseUrl.replace(/\/$/, "");
  }

  try {
    // 将 base64 转为 Buffer 并发送 multipart
    const audioBuffer = Buffer.from(audioBase64, "base64");

    // 尝试用 multipart 格式调用 /audio/transcriptions
    const FormData = require("form-data");
    const form = new FormData();
    form.append("file", audioBuffer, {
      filename: "recording.webm",
      contentType: "audio/webm",
    });
    form.append("model", "whisper-1");
    form.append("language", "zh");

    const resp = await axios.post(
      `${endpoint}/audio/transcriptions`,
      form,
      {
        headers: {
          Authorization: `Bearer ${api.apiKey}`,
          ...form.getHeaders(),
        },
        timeout: 30000,
      }
    );
    return resp.data?.text || "";
  } catch (e) {
    // 回退: 如果 Whisper 不可用, 返回提示
    if (e.response?.status === 404) {
      throw new Error("当前 API 不支持 Whisper 语音转文字。请使用 OpenAI API Key 或支持 /audio/transcriptions 的端点。");
    }
    throw new Error("语音转文字失败: " + (e.response?.data?.error?.message || e.message));
  }
}

// ─── TTS 文字转语音 ─────────────────────────────────────
async function speak(text, config, voice = "alloy") {
  if (!config) config = readConfig();
  const api = config.api1 || config;
  if (!api.apiKey) throw new Error("未配置 API Key");

  let endpoint = "https://api.openai.com/v1";
  if (api.baseUrl) {
    endpoint = api.baseUrl.replace(/\/$/, "");
  }

  try {
    const resp = await axios.post(
      `${endpoint}/audio/speech`,
      {
        model: "tts-1",
        input: text,
        voice,
        response_format: "mp3",
        speed: 1.0,
      },
      {
        headers: {
          Authorization: `Bearer ${api.apiKey}`,
          "Content-Type": "application/json",
        },
        responseType: "arraybuffer",
        timeout: 30000,
      }
    );
    return Buffer.from(resp.data).toString("base64");
  } catch (e) {
    if (e.response?.status === 404) {
      throw new Error("当前 API 不支持 TTS 语音合成。请使用 OpenAI API Key 或支持 /audio/speech 的端点。");
    }
    throw new Error("语音合成失败: " + (e.response?.data?.error?.message || e.message));
  }
}

module.exports = { transcribe, speak };
