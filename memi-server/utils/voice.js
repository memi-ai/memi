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

  let endpoint = "https://api.openai.com/v1";
  if (api.baseUrl) {
    endpoint = api.baseUrl.replace(/\/$/, "");
  }

  // 检查 form-data 是否可用
  let FormData;
  try { FormData = require("form-data"); } catch {
    throw new Error("缺少依赖: npm install form-data --prefix memi-server");
  }

  try {
    const audioBuffer = Buffer.from(audioBase64, "base64");
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
        headers: { Authorization: `Bearer ${api.apiKey}`, ...form.getHeaders() },
        timeout: 30000,
      }
    );
    return resp.data?.text || "";
  } catch (e) {
    if (e.response?.status === 404) {
      throw new Error(
        "当前 API 不支持 Whisper 语音转文字。\n" +
        "解决: 在 config.json 中把 api1.baseUrl 改为 https://api.openai.com/v1\n" +
        "或使用 Dashboard 的浏览器语音识别 (无需 API)"
      );
    }
    if (e.response?.status === 401 || e.response?.status === 403) {
      throw new Error("API Key 无效或没有 Whisper 权限。请使用 OpenAI API Key。");
    }
    throw new Error("转写失败: " + (e.response?.data?.error?.message || e.message));
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
