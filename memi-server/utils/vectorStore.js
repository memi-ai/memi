// ╔══════════════════════════════════════════════════════════╗
// ║  Memi Vector Store — 向量记忆 / RAG 引擎                  ║
// ║  嵌入工作区文档，支持语义搜索                               ║
// ╚══════════════════════════════════════════════════════════╝

const fs = require("fs");
const path = require("path");

const CONFIG_DIR = path.join(__dirname, "..", "..", "memi-config");
const VECTOR_FILE = path.join(CONFIG_DIR, "vectors.json");
const CHUNK_SIZE = 500; // 每块最多 500 字符
const TOP_K = 5;

// ─── 读取配置 ────────────────────────────────────────────
function readConfig() {
  try {
    const raw = fs.readFileSync(path.join(CONFIG_DIR, "config.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// ─── 获取嵌入向量 ───────────────────────────────────────
async function getEmbedding(text, config) {
  if (!config) config = readConfig();
  if (!config || !config.apiKey) throw new Error("未配置 API Key");

  const endpoint = (config.api1?.baseUrl || "https://api.deepseek.com/v1").replace(/\/$/, "");
  const apiKey = config.api1?.apiKey || config.apiKey;
  // 优先用 embedding 模型，否则用对话模型（DeepSeek 不支持 embedding，用 OpenAI 兼容端点）
  const model = config.embeddingModel || "text-embedding-3-small";

  try {
    const axios = require("axios");
    const resp = await axios.post(
      `${endpoint}/embeddings`,
      { model, input: text },
      { headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, timeout: 30000 }
    );
    return resp.data?.data?.[0]?.embedding;
  } catch (e) {
    // 如果 embedding API 失败，回退到简单的关键词匹配模式
    console.warn("Embedding API 不可用，使用关键词匹配模式:", e.message);
    return null;
  }
}

// ─── 余弦相似度 ─────────────────────────────────────────
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

// ─── 简单关键词匹配（无 embedding API 时的回退）─────────
function keywordMatch(query, chunks) {
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
  return chunks.map((chunk, idx) => {
    const text = chunk.text.toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (text.includes(term)) score += 1;
      // 部分匹配加分
      for (let i = 0; i < term.length - 1; i++) {
        if (text.includes(term.slice(i, i + 2))) score += 0.1;
      }
    }
    return { idx, score, chunk };
  }).sort((a, b) => b.score - a.score);
}

// ─── 分块 ───────────────────────────────────────────────
function chunkText(text, source) {
  const chunks = [];
  const paragraphs = text.split(/\n\n+/);
  let current = "";

  for (const para of paragraphs) {
    if ((current + para).length > CHUNK_SIZE && current.length > 0) {
      chunks.push({ text: current.trim(), source });
      current = para;
    } else {
      current += (current ? "\n\n" : "") + para;
    }
  }
  if (current.trim()) chunks.push({ text: current.trim(), source });

  return chunks;
}

// ─── 索引工作区文档 ─────────────────────────────────────
async function indexWorkspace(config) {
  if (!config) config = readConfig();
  const wsDir = path.join(CONFIG_DIR, "workspace");
  const files = ["SOUL.md", "MEMORY.md", "USER.md", "IDENTITY.md", "TOOLS.md"];

  const allChunks = [];
  for (const file of files) {
    const fpath = path.join(wsDir, file);
    if (!fs.existsSync(fpath)) continue;
    const text = fs.readFileSync(fpath, "utf8");
    const chunks = chunkText(text, file);
    for (const c of chunks) allChunks.push(c);
  }

  // 尝试获取嵌入
  const needsEmbedding = config && config.apiKey;
  let vectors = [];

  if (needsEmbedding) {
    for (let i = 0; i < allChunks.length; i++) {
      const emb = await getEmbedding(allChunks[i].text, config);
      vectors.push({ id: i, text: allChunks[i].text, source: allChunks[i].source, embedding: emb });
    }
  } else {
    vectors = allChunks.map((c, i) => ({ id: i, text: c.text, source: c.source, embedding: null }));
  }

  // 写入文件
  try {
    fs.writeFileSync(VECTOR_FILE, JSON.stringify(vectors, null, 2));
  } catch {}

  return { chunks: vectors.length, embedded: vectors.filter(v => v.embedding).length };
}

// ─── 搜索 ───────────────────────────────────────────────
async function search(query, config, topK = TOP_K) {
  if (!config) config = readConfig();

  // 加载向量库
  let vectors = [];
  if (fs.existsSync(VECTOR_FILE)) {
    try {
      vectors = JSON.parse(fs.readFileSync(VECTOR_FILE, "utf8"));
    } catch {}
  }

  if (vectors.length === 0) {
    return "向量库为空。请先运行 `memi rag index` 索引工作区文档。";
  }

  // 如果有 embedding，用向量搜索
  if (vectors[0]?.embedding) {
    const qEmb = await getEmbedding(query, config);
    if (qEmb) {
      const scored = vectors
        .map(v => ({ ...v, score: cosineSimilarity(qEmb, v.embedding) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, topK);

      return scored.map((s, i) =>
        `**${s.source}** (相似度: ${(s.score * 100).toFixed(1)}%)\n${s.text.slice(0, 500)}`
      ).join("\n\n---\n\n");
    }
  }

  // 回退：关键词匹配
  const results = keywordMatch(query, vectors).slice(0, topK);
  return results.map((r, i) =>
    `**${r.chunk.source}** (匹配度: ${r.score.toFixed(1)})\n${r.chunk.text.slice(0, 500)}`
  ).join("\n\n---\n\n");
}

// ─── 添加文档 ───────────────────────────────────────────
async function addDocument(name, text, config) {
  if (!config) config = readConfig();

  const chunks = chunkText(text, name);
  let vectors = [];

  if (fs.existsSync(VECTOR_FILE)) {
    try { vectors = JSON.parse(fs.readFileSync(VECTOR_FILE, "utf8")); } catch {}
  }

  const startId = vectors.length;
  for (let i = 0; i < chunks.length; i++) {
    const emb = config?.apiKey ? await getEmbedding(chunks[i].text, config) : null;
    vectors.push({ id: startId + i, text: chunks[i].text, source: name, embedding: emb });
  }

  try {
    fs.writeFileSync(VECTOR_FILE, JSON.stringify(vectors, null, 2));
  } catch {}

  return chunks.length;
}

// ─── 清除索引 ───────────────────────────────────────────
function clearIndex() {
  if (fs.existsSync(VECTOR_FILE)) fs.unlinkSync(VECTOR_FILE);
}

// ─── 统计 ───────────────────────────────────────────────
function stats() {
  if (!fs.existsSync(VECTOR_FILE)) return { chunks: 0, sources: [], totalChars: 0, hasEmbeddings: false };
  try {
    const vectors = JSON.parse(fs.readFileSync(VECTOR_FILE, "utf8"));
    const sources = [...new Set(vectors.map(v => v.source))];
    return {
      chunks: vectors.length,
      sources,
      totalChars: vectors.reduce((sum, v) => sum + v.text.length, 0),
      hasEmbeddings: vectors.some(v => v.embedding),
    };
  } catch {
    return { chunks: 0, sources: [], totalChars: 0, hasEmbeddings: false };
  }
}

module.exports = { indexWorkspace, search, addDocument, clearIndex, stats, getEmbedding };
