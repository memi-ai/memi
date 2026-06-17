// ╔══════════════════════════════════════════════════════════╗
// ║  Memi Search — Tavily 优先 + DuckDuckGo 回退              ║
// ╚══════════════════════════════════════════════════════════╝

const axios = require("axios");
const fs = require("fs");
const path = require("path");

const CONFIG_DIR = path.join(__dirname, "..", "..", "memi-config");

function getTavilyKey() {
  try {
    const f = path.join(CONFIG_DIR, "config.json");
    if (fs.existsSync(f)) {
      const cfg = JSON.parse(fs.readFileSync(f, "utf8"));
      return cfg.tavilyKey || "";
    }
  } catch {}
  return "";
}

async function tavilySearch(query, maxResults = 5) {
  const apiKey = getTavilyKey();
  if (!apiKey) return null;

  try {
    const resp = await axios.post(
      "https://api.tavily.com/search",
      {
        query,
        search_depth: "advanced",
        max_results: maxResults,
        include_answer: true,
        include_raw_content: false,
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 15000,
      }
    );

    const data = resp.data;
    const results = [];

    // Tavily 生成的综合回答
    if (data.answer) {
      results.push(`📝 ${data.answer}`);
    }

    // 搜索结果
    if (data.results) {
      for (const r of data.results.slice(0, maxResults)) {
        results.push(`${r.title || ""}\n${r.url}\n${(r.content || "").slice(0, 300)}`);
      }
    }

    return results.join("\n\n") || null;
  } catch (e) {
    console.warn("[Search] Tavily 失败:", e.message);
    return null;
  }
}

// DuckDuckGo 回退
async function duckduckgoSearch(query, maxResults = 5) {
  try {
    const resp = await axios.get("https://api.duckduckgo.com/", {
      params: { q: query, format: "json", no_html: 1, skip_disambig: 1 },
      timeout: 10000,
    });

    const results = [];
    const data = resp.data;

    // Abstract
    if (data.AbstractText) {
      results.push(`📝 ${data.AbstractText}\n${data.AbstractURL || ""}`);
    }

    // Related topics
    if (data.RelatedTopics) {
      const items = Array.isArray(data.RelatedTopics) ? data.RelatedTopics : [];
      for (const item of items.slice(0, maxResults)) {
        if (item.Text) {
          results.push(`${item.Text.slice(0, 300)}\n${item.FirstURL || ""}`);
        }
      }
    }

    return results.length > 0 ? results.join("\n\n") : null;
  } catch (e) {
    console.warn("[Search] DuckDuckGo 失败:", e.message);
    return null;
  }
}

// Bing 回退
async function bingSearch(query, maxResults = 5) {
  try {
    const resp = await axios.get("https://www.bing.com/search", {
      params: { q: query },
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      timeout: 10000,
    });
    const html = resp.data;
    const snippets = [];
    const re = /<li class="b_algo"[^>]*>[\s\S]*?<h2[^>]*><a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/gi;
    let match;
    let count = 0;
    while ((match = re.exec(html)) && count < maxResults) {
      const url = match[1];
      const title = match[2].replace(/<[^>]+>/g, "").trim();
      const snippet = match[3].replace(/<[^>]+>/g, "").trim();
      if (title && snippet) {
        snippets.push(`${title}\n${url}\n${snippet.slice(0, 300)}`);
        count++;
      }
    }
    return snippets.length > 0 ? snippets.join("\n\n") : null;
  } catch (e) {
    return null;
  }
}

// 天气查询（wttr.in）
async function weatherSearch(location) {
  try {
    const resp = await axios.get(`https://wttr.in/${encodeURIComponent(location)}?format=3&lang=zh`, { timeout: 8000 });
    return resp.data.trim();
  } catch {
    try {
      const resp = await axios.get(`https://wttr.in/${encodeURIComponent(location)}?format=3`, { timeout: 8000 });
      return resp.data.trim();
    } catch { return null; }
  }
}

// 统一搜索入口
async function search(query, maxResults = 5) {
  const q = query.toLowerCase();

  // 天气查询分流
  if (q.includes("天气") || q.includes("weather")) {
    const cityMap = {
      "北京": "Beijing", "上海": "Shanghai", "广州": "Guangzhou", "深圳": "Shenzhen",
      "杭州": "Hangzhou", "成都": "Chengdu", "武汉": "Wuhan", "南京": "Nanjing",
      "南昌": "Nanchang", "长沙": "Changsha", "重庆": "Chongqing", "西安": "Xian",
    };
    let city = query.replace(/天气|weather|forecast|查询|最近|三天|未来|今天|明天|预报|的|\d+/g, "").trim();
    for (const [cn, en] of Object.entries(cityMap)) {
      if (city.includes(cn)) { city = en; break; }
    }
    if (!city || city.length < 2) city = "Beijing";
    const weather = await weatherSearch(city);
    if (weather) return `🌤 ${weather}`;
  }

  // 1. Tavily（优先）
  const tavily = await tavilySearch(query, maxResults);
  if (tavily) return tavily;

  // 2. DuckDuckGo
  const ddg = await duckduckgoSearch(query, maxResults);
  if (ddg) return ddg;

  // 3. Bing
  const bing = await bingSearch(query, maxResults);
  if (bing) return bing;

  return "无搜索结果。试试更具体的关键词？";
}

module.exports = { search, getTavilyKey };
