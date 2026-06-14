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

// 只允许本地前端开发服务访问后端接口
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:3001", "http://127.0.0.1:5173", "http://127.0.0.1:3001", "null"],
    credentials: true,
  })
);

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
app.use("/api/gateway", authMiddleware);
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

server.listen(PORT, () => {
  console.log(`memi-server is running on port ${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/api/gateway/ws`);
});
