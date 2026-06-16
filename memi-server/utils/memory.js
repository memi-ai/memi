// ╔══════════════════════════════════════════════════════════╗
// ║  Memi Memory — 长期记忆系统                              ║
// ║  自动摘要 / 跨会话检索 / 知识库上传                        ║
// ╚══════════════════════════════════════════════════════════╝

const fs = require("fs");
const path = require("path");
const axios = require("axios");

const CONFIG_DIR = path.join(__dirname, "..", "..", "memi-config");
const WORKSPACE_DIR = path.join(CONFIG_DIR, "workspace");
const MEMORY_FILE = path.join(WORKSPACE_DIR, "MEMORY.md");
const KB_DIR = path.join(CONFIG_DIR, "knowledge-base");
const SUMMARY_FILE = path.join(CONFIG_DIR, "memory-summaries.json");

// ─── 自动摘要 ───────────────────────────────────────────
async function autoSummarize(messages, config) {
  if (messages.length < 20) return null;

  const recent = messages.slice(-20);
  const text = recent.map(m => `${m.role}: ${(m.content || "").slice(0, 500)}`).join("\n");

  const api = config.api1 || config;
  if (!api.apiKey || !api.baseUrl) return null;

  try {
    const resp = await axios.post(
      `${api.baseUrl.replace(/\/$/, "")}/chat/completions`,
      {
        model: api.model || "deepseek-chat",
        messages: [
          { role: "system", content: "你是一个摘要助手。将以下对话历史压缩为 2-3 句话的要点摘要，用中文。" },
          { role: "user", content: text },
        ],
        max_tokens: 200,
      },
      {
        headers: { Authorization: `Bearer ${api.apiKey}`, "Content-Type": "application/json" },
        timeout: 15000,
      }
    );
    return resp.data?.choices?.[0]?.message?.content?.trim();
  } catch {
    return null;
  }
}

// ─── 保存摘要 ───────────────────────────────────────────
function saveSummary(sessionId, summaryText) {
  let summaries = [];
  if (fs.existsSync(SUMMARY_FILE)) {
    try { summaries = JSON.parse(fs.readFileSync(SUMMARY_FILE, "utf8")); } catch {}
  }
  summaries.push({
    session: sessionId,
    text: summaryText,
    time: new Date().toISOString(),
  });
  // 只保留最近 50 条
  if (summaries.length > 50) summaries = summaries.slice(-50);
  fs.mkdirSync(path.dirname(SUMMARY_FILE), { recursive: true });
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summaries, null, 2));

  // 同时追加到 MEMORY.md
  const entry = `\n### ${new Date().toLocaleDateString("zh-CN")}\n${summaryText}\n`;
  fs.appendFileSync(MEMORY_FILE, entry);
}

// ─── 跨会话记忆检索 ─────────────────────────────────────
function getRecentSummaries(limit = 5) {
  if (!fs.existsSync(SUMMARY_FILE)) return [];
  try {
    const summaries = JSON.parse(fs.readFileSync(SUMMARY_FILE, "utf8"));
    return summaries.slice(-limit);
  } catch { return []; }
}

// ─── 知识库上传 ─────────────────────────────────────────
async function uploadKnowledge(filePath, config) {
  const fname = path.basename(filePath);
  const dest = path.join(KB_DIR, fname);
  fs.mkdirSync(KB_DIR, { recursive: true });
  fs.copyFileSync(filePath, dest);

  // 读取内容
  let text = "";
  const ext = path.extname(fname).toLowerCase();

  try {
    if (ext === ".txt" || ext === ".md") {
      text = fs.readFileSync(dest, "utf8");
    } else if (ext === ".json") {
      const obj = JSON.parse(fs.readFileSync(dest, "utf8"));
      text = JSON.stringify(obj, null, 2);
    } else {
      text = `[二进制文件: ${fname}]`;
    }
  } catch (e) {
    text = `[读取失败: ${e.message}]`;
  }

  // 分块并嵌入
  const { indexWorkspace } = require("./vectorStore");
  const chunks = [];
  const paragraphs = text.split(/\n\n+/);
  let current = "";
  for (const para of paragraphs) {
    if ((current + para).length > 500 && current.length > 0) {
      chunks.push(current.trim());
      current = para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }
  if (current.trim()) chunks.push(current.trim());

  return {
    file: fname,
    size: text.length,
    chunks: chunks.length,
    dest,
  };
}

// ─── 知识库列表 ─────────────────────────────────────────
function listKnowledge() {
  if (!fs.existsSync(KB_DIR)) return [];
  return fs.readdirSync(KB_DIR).map(f => {
    const stat = fs.statSync(path.join(KB_DIR, f));
    return { name: f, size: stat.size, time: stat.mtime.toISOString() };
  });
}

// ─── 加载记忆上下文 ─────────────────────────────────────
function loadMemoryContext() {
  const ctx = [];

  // 1. MEMORY.md 内容
  if (fs.existsSync(MEMORY_FILE)) {
    ctx.push(fs.readFileSync(MEMORY_FILE, "utf8").slice(0, 2000));
  }

  // 2. 最近摘要
  const summaries = getRecentSummaries(3);
  if (summaries.length > 0) {
    ctx.push("## 最近记忆\n" + summaries.map(s => `- ${s.text}`).join("\n"));
  }

  return ctx.join("\n\n");
}

module.exports = { autoSummarize, saveSummary, getRecentSummaries, uploadKnowledge, listKnowledge, loadMemoryContext };
