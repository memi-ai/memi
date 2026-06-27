const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { WebSocketServer } = require("ws");
const apiRoutes = require("./routes/api");
const { handleWebSocket } = require("./gateway");

const app = express();
const PORT = process.env.PORT || 3001;

// 读取暴露配置
let exposeMode = "off";
try {
  const cfgFile = path.join(__dirname, "..", "memi-config", "config.json");
  if (fs.existsSync(cfgFile)) {
    const cfg = JSON.parse(fs.readFileSync(cfgFile, "utf8"));
    exposeMode = cfg.expose || "off";
  }
} catch {}

// CORS 配置
const corsOrigins = () => {
  if (exposeMode === "public") return true; // 允许所有来源
  if (exposeMode === "lan") {
    // 允许 localhost + 局域网 IP
    const origins = ["http://localhost:5173", "http://localhost:3001", "http://127.0.0.1:5173", "http://127.0.0.1:3001", "null"];
    try {
      const nets = require("os").networkInterfaces();
      Object.values(nets).forEach(iface => {
        (iface || []).forEach(addr => {
          if (addr.family === "IPv4") {
            origins.push(`http://${addr.address}:5173`, `http://${addr.address}:3001`, `http://${addr.address}:${PORT}`);
          }
        });
      });
    } catch {}
    return origins;
  }
  return ["http://localhost:5173", "http://localhost:3001", "http://127.0.0.1:5173", "http://127.0.0.1:3001", "null"];
};

app.use(cors({ origin: corsOrigins(), credentials: true }));

// 暴露状态 API
app.get("/api/personas", (req, res) => {
  res.json([
    {id:"assistant",name:"默认助手",desc:"通用 AI 助手，简洁高效"},
    {id:"coder",name:"程序员",desc:"专注代码、架构、调试"},
    {id:"poet",name:"诗人",desc:"文艺范，诗词歌赋信手拈来"},
    {id:"teacher",name:"老师",desc:"耐心讲解，深入浅出"},
    {id:"friend",name:"老友",desc:"轻松聊天，像老朋友一样"},
    {id:"boss",name:"老板模式",desc:"强势直接，要结果不要解释"},
  ]);
});

app.get("/api/expose", (req, res) => {
  const nets = [];
  try {
    const os = require("os");
    Object.values(os.networkInterfaces()).forEach(iface => {
      (iface || []).forEach(addr => {
        if (addr.family === "IPv4" && !addr.internal) nets.push(addr.address);
      });
    });
  } catch {}
  res.json({ mode: exposeMode, lanIps: nets, port: PORT });
});

// 解析 JSON 请求体（base64 图片可能较大）
app.use(express.json({ limit: "10mb" }));

// Gateway 认证（可选，未配置则跳过）
const AUTH_TOKEN = process.env.MEMI_GATEWAY_TOKEN || "";
const authMiddleware = (req, res, next) => {
  if (!AUTH_TOKEN) return next();
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  if (token !== AUTH_TOKEN) return res.status(401).json({ error: "Unauthorized. Set MEMI_GATEWAY_TOKEN env or pass Bearer token." });
  next();
};
// 对 /api/gateway/* 和 /api/v1/* 启用认证（Express 不认数组，分开写）
// 但跳过渠道 webhook 路由（Discord/Slack/钉钉 需要接收外部回调）
const gatewayAuthMiddleware = (req, res, next) => {
  if (req.path.startsWith("/gateway/discord") || req.path.startsWith("/gateway/slack") || req.path.startsWith("/gateway/dingtalk")) {
    return next();
  }
  if (req.path.startsWith("/gateway/telegram") || req.path.startsWith("/gateway/feishu") || req.path.startsWith("/gateway/wecom") || req.path.startsWith("/gateway/qq")) {
    return next();
  }
  return authMiddleware(req, res, next);
};
app.use("/api/gateway", gatewayAuthMiddleware);
app.use("/api/v1", authMiddleware);

// 健康检查接口
app.get("/health", (req, res) => {
  res.json({ status: "ok", name: "memi" });
});



// Dashboard
app.get("/api/balance", async (req, res) => {
  try {
    const f = path.join(__dirname, "..", "memi-config", "config.json");
    if (!fs.existsSync(f)) return res.json({ balance: "—", error: "无配置" });
    const cfg = JSON.parse(fs.readFileSync(f, "utf8"));
    const api = cfg.api1 || {};
    if (!api.apiKey) return res.json({ balance: "—", error: "未配置API Key" });
    // DeepSeek 余额
    const r = await fetch("https://api.deepseek.com/user/balance", {
      headers: { Authorization: `Bearer ${api.apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    const d = await r.json();
    if (d?.balance_infos?.[0]?.total_balance) {
      const bal = Number(d.balance_infos[0].total_balance);
      return res.json({ balance: "¥" + bal.toFixed(2) });
    }
    if (d?.data?.balance) return res.json({ balance: "$" + Number(d.data.balance).toFixed(2) });
    res.json({ balance: "—", raw: d });
  } catch(e) {
    res.json({ balance: "获取失败", error: e.message });
  }
});

app.get("/api/config", (req, res) => {
  try {
    const f = path.join(__dirname, "..", "memi-config", "config.json");
    if (fs.existsSync(f)) return res.json(JSON.parse(fs.readFileSync(f, "utf8")));
  } catch {}
  res.json({});
});

app.get("/docs", (req, res) => {
  res.redirect("/dashboard");
});

app.get("/manifest.json", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "manifest.json"));
});
app.get("/sw.js", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "sw.js"));
});

app.get("/dashboard", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "memi-dashboard.html"));
});



// 会话 API — Web ↔ CLI 互通
const SESS_DIR = path.join(__dirname, "..", "memi-config", "sessions");
app.get("/api/sessions", (req, res) => {
  try {
    if (!fs.existsSync(SESS_DIR)) return res.json({ sessions: [] });
    const files = fs.readdirSync(SESS_DIR).filter(f => f.endsWith(".json"));
    res.json({ sessions: files.map(f => f.replace(".json", "")) });
  } catch { res.json({ sessions: [] }); }
});
app.get("/api/sessions/:name", (req, res) => {
  try {
    const f = path.join(SESS_DIR, req.params.name + ".json");
    if (!fs.existsSync(f)) return res.json({ messages: [] });
    res.json({ messages: JSON.parse(fs.readFileSync(f, "utf8")) });
  } catch { res.json({ messages: [] }); }
});
app.post("/api/sessions/:name", (req, res) => {
  try {
    if (!fs.existsSync(SESS_DIR)) fs.mkdirSync(SESS_DIR, { recursive: true });
    fs.writeFileSync(path.join(SESS_DIR, req.params.name + ".json"), JSON.stringify(req.body.messages || []));
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.delete("/api/sessions/:name", (req, res) => {
  try {
    const f = path.join(SESS_DIR, req.params.name + ".json");
    if (fs.existsSync(f)) fs.unlinkSync(f);
    res.json({ success: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// ─── MCP Server 端点 ────────────────────────────────────
// 对外暴露 Memi 工具，任何 MCP 客户端都可接入
app.post("/api/mcp", async (req, res) => {
  const { method, params, id } = req.body || {};
  try {
    switch (method) {
      case "initialize":
        return res.json({
          jsonrpc: "2.0", id,
          result: {
            protocolVersion: "2024-11-05",
            capabilities: { tools: {} },
            serverInfo: { name: "memi-mcp-server", version: "1.2.2" },
          },
        });

      case "tools/list": {
        const { TOOLS } = require("./utils/agent");
        const tools = TOOLS.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.parameters || { type: "object", properties: {}, required: [] },
        }));
        return res.json({ jsonrpc: "2.0", id, result: { tools } });
      }

      case "tools/call": {
        const { name, arguments: args } = params || {};
        const { TOOLS } = require("./utils/agent");
        const tool = TOOLS.find(t => t.name === name);
        if (!tool) return res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Tool not found: ${name}` } });
        if (!tool.handler) return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: `Tool "${name}" 需要运行时注入，MCP 模式下暂不可用` }] } });
        try {
          const result = await tool.handler(args || {});
          const text = typeof result === "string" ? result : JSON.stringify(result);
          return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }] } });
        } catch (e) {
          return res.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "Error: " + e.message }], isError: true } });
        }
      }

      case "notifications/initialized":
        return res.json({ jsonrpc: "2.0" });

      default:
        return res.json({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unknown method: ${method}` } });
    }
  } catch (e) {
    return res.json({ jsonrpc: "2.0", id, error: { code: -32603, message: e.message } });
  }
});

// ─── 语音 API ──────────────────────────────────────────
app.post("/api/voice/transcribe", async (req, res) => {
  try {
    const { audio } = req.body;
    if (!audio) return res.status(400).json({ error: "缺少音频数据" });
    const { transcribe } = require("./utils/voice");
    const text = await transcribe(audio);
    res.json({ success: true, text });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post("/api/voice/speak", async (req, res) => {
  try {
    const { text, voice } = req.body;
    if (!text) return res.status(400).json({ error: "缺少文字" });
    const { speak } = require("./utils/voice");
    const audioBase64 = await speak(text, null, voice || "alloy");
    res.json({ success: true, audio: audioBase64 });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// 挂载 API 路由
app.use("/api", apiRoutes);

// API 路由的 404 返回 JSON（而不是 HTML）
app.use("/api", (req, res) => {
  res.status(404).json({ success: false, error: `接口不存在: ${req.method} ${req.path}` });
});

// 全局错误处理 — 返回 JSON
app.use((err, req, res, next) => {
  console.error("[memi-server]", err.stack || err.message);
  res.status(500).json({ success: false, error: "服务器内部错误", detail: err.message });
});

// 创建 HTTP Server
const server = http.createServer(app);

// WebSocket 服务
const wss = new WebSocketServer({ server, path: "/api/gateway/ws" });
wss.on("connection", (ws) => {
  const config = (() => {
    try {
      const fs = require("fs");
      const file = path.join(__dirname, "..", "memi-config", "config.json");
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {}
    return { api1: {}, api2: {} };
  })();
  handleWebSocket(ws, () => config);
});

// 根据 expose 模式决定绑定地址
const bindAddr = exposeMode === "off" ? "127.0.0.1" : "0.0.0.0";
server.listen(PORT, bindAddr, () => {
  console.log(`memi-server is running on ${bindAddr}:${PORT}`);
  if (exposeMode !== "off") {
    try {
      const nets = require("os").networkInterfaces();
      Object.values(nets).forEach(iface => {
        (iface || []).forEach(addr => {
          if (addr.family === "IPv4" && !addr.internal) {
            console.log(`  Dashboard: http://${addr.address}:${PORT}/dashboard`);
          }
        });
      });
    } catch {}
  }
  console.log(`WebSocket: ws://localhost:${PORT}/api/gateway/ws`);

  // 自动索引工作区文档（异步，不阻塞启动）
  try {
    const { indexWorkspace } = require("./utils/vectorStore");
    indexWorkspace().then(r => {
      if (r && r.chunks > 0) console.log(`[RAG] 向量索引完成: ${r.chunks} 块, ${r.embedded} 已嵌入`);
    }).catch(() => {});
  } catch {}

  // 启动定时任务调度
  try {
    const { startScheduler } = require("./utils/cron");
    const { callAgent } = require("./utils/agent");
    startScheduler(async (job) => {
      const configPath = path.join(__dirname, "..", "memi-config", "config.json");
      const cfg = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : { api1: {} };
      const result = await callAgent(cfg.api1, [{ role: "user", content: job.prompt }], {}, "high");
      console.log(`[Cron] "${job.name}" 结果:`, (result.answer || "").slice(0, 200));
      if (cfg.notifyEmail && result.answer) {
        try {
          const { execSync } = require("child_process");
          const tmpFile = path.join(__dirname, "..", "memi-config", "temp", "cron-mail.md");
          const body = `## Memi Cron: ${job.name}\n\n${result.answer}`;
          fs.mkdirSync(path.dirname(tmpFile), { recursive: true });
          fs.writeFileSync(tmpFile, body);
          execSync(`agently-cli message +send --to "${cfg.notifyEmail}" --subject "[Memi] ${job.name}" --body-file "${tmpFile}"`, {
            timeout: 15000, encoding: "utf8",
          });
          console.log(`[Cron] 邮件通知 → ${cfg.notifyEmail}`);
        } catch (e) { console.warn("[Cron] 邮件通知失败:", e.message); }
      }
    });
    console.log("[Cron] 定时任务调度已启动");
  } catch (e) { console.warn("[Cron] 启动失败:", e.message); }

  // 读取沙箱配置
  try {
    const configPath = path.join(__dirname, "..", "memi-config", "config.json");
    if (fs.existsSync(configPath)) {
      const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
      if (cfg.sandbox?.enabled) {
        const { setEnabled } = require("./utils/sandbox");
        setEnabled(true);
        console.log("[Sandbox] 沙箱模式已启用");
      }
    }
  } catch {}

  // 预加载 MCP Server（异步）
  try {
    const { loadMcpServers, getMcpTools } = require("./utils/mcp");
    loadMcpServers().then(servers => {
      if (servers.length > 0) {
        const allTools = getMcpTools(servers);
        // 缓存到 mcp-cache.json 供 Agent 使用
        const cachePath = path.join(__dirname, "..", "memi-config", "mcp-cache.json");
        const cache = {
          servers: servers.map(s => ({
            name: s.config.name,
            command: s.config.command,
            args: s.config.args || [],
            env: s.config.env || {},
          })),
          tools: allTools.map(t => ({
            name: t.name,
            originalName: t.name.replace(/^mcp_[^_]+_/, ""),
            server: t.name.split("_")[1] || s.config?.name || "mcp",
            description: t.description,
            parameters: t.parameters,
          })),
        };
        fs.mkdirSync(path.dirname(cachePath), { recursive: true });
        fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
        console.log(`[MCP] ${servers.length} 个 Server, ${allTools.length} 个工具已缓存`);
      }
    }).catch(e => console.warn("[MCP] 预加载失败:", e.message));
  } catch {}
});
