// ─── Agent 网关服务 ──────────────────────────────────
// 提供 Webhook 和 WebSocket 端点，供外部应用连接 Agent

const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { callAgent } = require("./utils/agent");
// callLLM unused in gateway; removed

// ─── Webhook 端点 ────────────────────────────────────
function createWebhookHandler(getConfig) {
  return async (req, res) => {
    const { message, apiKey } = req.body || {};
    const authHeader = req.headers["x-api-key"] || "";

    if (!message) {
      return res.status(400).json({ success: false, error: "缺少 message 参数" });
    }

    // 从配置中获取 API 连接
    const config = getConfig();
    const api1 = config.api1;
    const api2 = config.api2;

    if (!api1?.baseUrl) {
      return res.status(500).json({ success: false, error: "请先配置 API1（LLM）" });
    }

    // API Key 鉴权
    const key = apiKey || authHeader;
    // 如果有配置的连接密钥则验证；否则开放（开发模式）
    const connections = loadConnections();
    if (connections.length > 0 && key) {
      const valid = connections.some((c) => c.apiKey === key);
      if (!valid) {
        return res.status(401).json({ success: false, error: "无效的 API Key" });
      }
    }

    try {
      const messages = [{ role: "user", content: message }];
      const runtimeTools = {};

      if (api2?.baseUrl) {
        runtimeTools.generate_image = async (args) => {
          const { callImageGen } = require("./utils/aiProxy");
          const w = args.aspectRatio === "16:9" ? 512 : args.aspectRatio === "9:16" ? 288 : 512;
          const h = args.aspectRatio === "9:16" ? 512 : args.aspectRatio === "4:3" ? 384 : 512;
          return await callImageGen(api2, args.prompt || "", w, h);
        };
      }

      const result = await callAgent(api1, messages, runtimeTools);
      res.json({
        success: true,
        response: result.answer,
        toolCalls: result.toolCalls,
        iterations: result.iterations,
      });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  };
}

// ─── WebSocket 处理 ──────────────────────────────────
function handleWebSocket(ws, getConfig) {
  ws.on("message", async (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (!msg.message) {
        ws.send(JSON.stringify({ error: "缺少 message 字段" }));
        return;
      }

      const config = getConfig();
      if (!config.api1?.baseUrl) {
        ws.send(JSON.stringify({ error: "请先配置 API1（LLM）" }));
        return;
      }

      const messages = [{ role: "user", content: msg.message }];
      const runtimeTools = {};

      if (config.api2?.baseUrl) {
        runtimeTools.generate_image = async (args) => {
          const { callImageGen } = require("./utils/aiProxy");
          const w = args.aspectRatio === "16:9" ? 512 : args.aspectRatio === "9:16" ? 288 : 512;
          const h = args.aspectRatio === "9:16" ? 512 : args.aspectRatio === "4:3" ? 384 : 512;
          return await callImageGen(config.api2, args.prompt || "", w, h);
        };
      }

      const result = await callAgent(config.api1, messages, runtimeTools);
      ws.send(JSON.stringify({
        type: "response",
        response: result.answer,
        toolCalls: result.toolCalls,
        iterations: result.iterations,
      }));
    } catch (e) {
      ws.send(JSON.stringify({ error: e.message }));
    }
  });

  ws.send(JSON.stringify({ type: "connected", message: "已连接到 Memi Agent" }));
}

// ─── 连接管理（localStorage 模拟，服务端用内存）─────
let _connections = [];

function loadConnections() {
  try {
    // 服务端从本地 JSON 文件加载
    const fs = require("fs");
    const path = require("path");
    const file = path.join(__dirname, "..", "connections.json");
    if (fs.existsSync(file)) {
      _connections = JSON.parse(fs.readFileSync(file, "utf8"));
    }
  } catch {}
  return _connections;
}

function saveConnections(conns) {
  _connections = conns;
  try {
    const fs = require("fs");
    const path = require("path");
    const file = path.join(__dirname, "..", "connections.json");
    fs.writeFileSync(file, JSON.stringify(conns, null, 2));
  } catch {}
}

// ─── 连接管理 API ────────────────────────────────────
function createConnectionRoutes(router) {
  // 获取连接列表
  router.get("/gateway/connections", (req, res) => {
    res.json({ success: true, connections: loadConnections() });
  });

  // 创建新连接
  router.post("/gateway/connections", (req, res) => {
    const { name, channel } = req.body || {};
    if (!name) return res.status(400).json({ success: false, error: "请提供连接名称" });

    const ch = channel || "webhook";
    const id = "conn_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    const apiKey = "memi_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
    const basePath = ch === "feishu" ? "/api/gateway/feishu" : "/api/gateway/webhook";
    const webhookUrl = `http://localhost:${process.env.PORT || 3001}${basePath}`;
    const chatUrl = `http://localhost:${process.env.PORT || 3001}/api/gateway/webhook`;

    const connection = {
      id,
      name,
      type: ch,
      apiKey,
      webhookUrl,
      chatUrl,
      createdAt: new Date().toISOString(),
    };

    const conns = loadConnections();
    conns.push(connection);
    saveConnections(conns);

    res.json({ success: true, connection });
  });

  // 飞书事件回调
  router.post("/gateway/feishu", async (req, res) => {
    const body = req.body || {};

    // URL 验证（飞书首次配置时发送 challenge）
    if (body.type === "url_verification") {
      return res.json({ challenge: body.challenge });
    }

    // 消息事件
    const eventType = body.header?.event_type;
    if (eventType === "im.message.receive_v1" && body.event?.message) {
      let text = "";
      try {
        const content = JSON.parse(body.event.message.content || "{}");
        text = content.text || "";
      } catch {
        text = body.event.message.content || "";
      }

      if (!text) return res.json({ code: 0, msg: "empty" });

      const config = (() => {
        try {
          const fs = require("fs");
          const path = require("path");
          const file = path.join(__dirname, "..", "memi-config", "config.json");
          if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
        } catch {}
        return { api1: {}, api2: {} };
      })();

      if (!config.api1?.baseUrl) {
        return res.json({ code: -1, msg: "未配置 LLM" });
      }

      try {
        const messages = [{ role: "user", content: text }];
        const result = await callAgent(config.api1, messages, {});
        const reply = result.answer || "抱歉，无法处理此请求。";
        return res.json({
          code: 0,
          msg: "success",
          data: { reply, toolCalls: result.toolCalls?.length },
        });
      } catch (e) {
        return res.json({ code: -1, msg: e.message });
      }
    }

    // 其他事件直接 ACK
    res.json({ code: 0 });
  });

  // 通用 Webhook — POST 消息入口
  router.post("/gateway/webhook", createWebhookHandler(() => {
    try {
      const fs = require("fs");
      const path = require("path");
      const file = path.join(__dirname, "..", "memi-config", "config.json");
      if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {}
    return { api1: {}, api2: {} };
  }));

  // Webhook 页面 — GET 浏览器访问时返回对话页
  router.get("/gateway/webhook", (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="zh"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Memi Agent</title>
<style>body{font-family:system-ui,sans-serif;background:#f5f5f5;margin:0;padding:20px}
.chat{max-width:600px;margin:40px auto;background:#fff;border-radius:16px;box-shadow:0 2px 12px rgba(0,0,0,.08);overflow:hidden}
.header{background:var(--theme,#111827);color:#fff;padding:16px 20px;font-weight:600;font-size:15px}
.messages{padding:16px;min-height:200px;max-height:50vh;overflow-y:auto}
.msg{margin:8px 0;padding:10px 14px;border-radius:12px;max-width:80%;font-size:14px;line-height:1.5}
.user{background:#e8e8e8;margin-left:auto}
.agent{background:#f0f0f0}
.input-area{display:flex;border-top:1px solid #eee;padding:12px}
.input-area input{flex:1;border:1px solid #ddd;border-radius:10px;padding:10px 14px;font-size:14px;outline:none}
.input-area button{background:var(--theme,#111827);color:#fff;border:none;border-radius:10px;padding:10px 20px;margin-left:8px;cursor:pointer;font-weight:500}
.loading{text-align:center;color:#999;padding:12px;font-size:13px}
</style></head><body>
<div class="chat">
<div class="header">🤖 Memi Agent</div>
<div class="messages" id="msgs"></div>
<div id="loading" class="loading" style="display:none">思考中...</div>
<div class="input-area">
<input id="inp" placeholder="输入消息..." onkeydown="if(event.key==='Enter')send()">
<button onclick="send()">发送</button>
</div></div>
<script>
function addMsg(text,role){const d=document.createElement('div');d.className='msg '+role;d.textContent=text;document.getElementById('msgs').appendChild(d);d.scrollIntoView({behavior:'smooth'})}
async function send(){const i=document.getElementById('inp');const t=i.value.trim();if(!t)return;i.value='';addMsg(t,'user');document.getElementById('loading').style.display='block';
try{const r=await fetch('/api/gateway/webhook',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:t})});
const d=await r.json();document.getElementById('loading').style.display='none';
if(d.success)addMsg(d.response||'','agent');else addMsg('错误: '+(d.error||''),'agent')}catch(e){document.getElementById('loading').style.display='none';addMsg('连接失败: '+e.message,'agent')}}
</script></body></html>`);
  });

  // 飞书集成 — 长连接模式
  let feishuWs = null;

  router.post("/gateway/feishu/connect", async (req, res) => {
    const { appId, appSecret } = req.body || {};
    if (!appId || !appSecret) return res.status(400).json({ success: false, error: "请提供 App ID 和 App Secret" });

    try {
      // 获取 tenant_access_token
      const tokenRes = await axios.post("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
        app_id: appId, app_secret: appSecret,
      });
      const token = tokenRes.data?.tenant_access_token;
      if (!token) throw new Error("获取飞书 token 失败");

      // 断开旧连接
      if (feishuWs) feishuWs.close();

      // 连接飞书长连接
      const WebSocket = require("ws");
      const wsUrl = `wss://open.feishu.cn/open-apis/event/v1/ws/connection?app_id=${appId}&app_secret=${appSecret}`;
      // 先获取连接 URL
      const connRes = await axios.post("https://open.feishu.cn/open-apis/event/v1/ws/connection",
        { app_id: appId, app_secret: appSecret },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const connData = connRes.data?.data;
      if (!connData?.url) throw new Error("获取飞书长连接地址失败");

      feishuWs = new WebSocket(connData.url);

      feishuWs.on("open", () => {
        console.log("[Feishu] 长连接已建立");
      });

      feishuWs.on("message", async (data) => {
        try {
          const event = JSON.parse(data.toString());
          if (event.type === "message" && event.event?.type === "im.message.receive_v1") {
            const msg = event.event;
            let text = "";
            try { text = JSON.parse(msg.content || "{}").text || ""; } catch {}

            if (text) {
              const config = (() => {
                try {
                  const fs = require("fs"), path = require("path");
                  const f = path.join(__dirname, "..", "memi-config", "config.json");
                  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
                } catch {}
                return { api1: {} };
              })();

              const result = await callAgent(config.api1, [{ role: "user", content: text }], {});

              // 发送回复
              await axios.post("https://open.feishu.cn/open-apis/im/v1/messages/" + msg.message_id + "/reply",
                { content: JSON.stringify({ text: result.answer }) },
                { headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } }
              );
            }
          }
        } catch (e) { console.error("[Feishu]", e.message); }
      });

      feishuWs.on("close", () => { feishuWs = null; });
      feishuWs.on("error", (e) => { console.error("[Feishu]", e.message); feishuWs = null; });

      res.json({ success: true, message: "飞书长连接已建立" });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });

  // 获取飞书连接状态
  router.get("/gateway/feishu/status", (req, res) => {
    res.json({ connected: feishuWs !== null && feishuWs.readyState === 1 });
  });

  // OpenClaw 微信连接 — 全自动：写配置 → 启动进程 → 推送二维码
  router.post("/gateway/openclaw/start", (req, res) => {
    const { spawn } = require("child_process");
    const fs = require("fs");
    const path = require("path");

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const send = (type, data) => res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);

    // 第 1 步：先写 OpenClaw 配置，让它一启动就用 Memi
    try {
      const home = process.env.HOME || process.env.USERPROFILE || "/tmp";
      const configDir = path.join(home, ".openclaw");
      if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify({
        apiBase: "http://localhost:3001/api/v1",
        apiKey: "",
        model: "memi-agent",
      }, null, 2));
      send("status", { message: "已配置 API 后端 → Memi" });
    } catch (e) {
      send("status", { message: "配置文件写入失败: " + e.message });
    }

    // 第 2 步：启动 OpenClaw 微信插件
    send("status", { message: "正在启动 OpenClaw 微信插件..." });

    const child = spawn("npx", ["-y", "@tencent-weixin/openclaw-weixin-cli@latest", "install"], {
      shell: true,
      env: { ...process.env, FORCE_COLOR: "0" },
    });

    let output = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      send("log", { text: text.trim().slice(-300) });

      // 检测二维码
      if ((output.includes("█") && output.length > 500) ||
          (output.includes("http") && output.includes("qr"))) {
        send("qr", { text: output.slice(-1000) });
      }
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      output += text;
      send("log", { text: text.trim().slice(-300) });
      if (text.includes("█") || (text.includes("http") && text.includes("qr"))) {
        send("qr", { text: output.slice(-1000) });
      }
    });

    child.on("close", (code) => {
      send("done", { code, message: code === 0 ? "微信连接已建立" : `进程退出 (${code})，请检查终端输出` });
      res.end();
    });

    child.on("error", (err) => {
      send("error", { message: "启动失败: " + err.message });
      res.end();
    });

    setTimeout(() => {
      if (!res.writableEnded) { send("timeout", {}); child.kill(); res.end(); }
    }, 120000);
  });

  // 删除连接
  router.delete("/gateway/connections/:id", (req, res) => {
    let conns = loadConnections();
    conns = conns.filter((c) => c.id !== req.params.id);
    saveConnections(conns);
    res.json({ success: true });
  });

  // Telegram Bot webhook
  router.post("/gateway/telegram/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const body = req.body || {};
      const msg = body.message || body.edited_message;
      if (!msg || !msg.text) return res.json({ ok: true });
      const chatId = msg.chat.id;
      const text = msg.text;

      const config = (() => {
        try {
          const f = path.join(__dirname, "..", "memi-config", "config.json");
          if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
        } catch {}
        return { api1: {} };
      })();

      axios.post(`https://api.telegram.org/bot${token}/sendChatAction`, {
        chat_id: chatId, action: "typing"
      }).catch(() => {});

      const messages = [{ role: "user", content: text }];
      const result = await callAgent(config.api1, messages, {});
      const reply = result.answer || "抱歉，无法处理此请求。";

      // Telegram 消息最长 4096 字符
      const chunks = (reply || "").match(/[\s\S]{1,4000}/g) || [reply];
      for (const chunk of chunks) {
        await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
          chat_id: chatId, text: chunk, parse_mode: "Markdown"
        }).catch(async () => {
          await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
            chat_id: chatId, text: chunk
          }).catch(() => {});
        });
      }
      res.json({ ok: true });
    } catch(e) {
      res.json({ ok: false, error: e.message });
    }
  });

  // WeCom (企业微信) Bot webhook
  router.post("/gateway/wecom/:token", async (req, res) => {
    try {
      const body = req.body || {};
      const text = body.text?.content || body.text || body.Content || "";
      if (!text) return res.json({ errcode: 0, errmsg: "ok" });
      const config = (() => {
        try {
          const f = path.join(__dirname, "..", "memi-config", "config.json");
          if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
        } catch {}
        return { api1: {} };
      })();
      const result = await callAgent(config.api1, [{ role: "user", content: text }], {});
      const reply = result.answer || "抱歉，无法处理此请求。";
      res.json({ errcode: 0, errmsg: "ok", text: { content: reply.slice(0, 2000) } });
    } catch(e) {
      res.json({ errcode: -1, errmsg: e.message });
    }
  });

  // QQ Bot webhook (兼容 go-cqhttp / 官方 QQ Bot API)
  router.post("/gateway/qq/:token", async (req, res) => {
    try {
      const body = req.body || {};
      // go-cqhttp 格式
      let text = body.message || body.raw_message || body.content || "";
      // 官方 QQ Bot 格式
      if (body.msgtype === "text" || body.type === "text") text = body.content || body.text || "";
      if (!text) return res.json({ reply: "" });
      const config = (() => {
        try {
          const f = path.join(__dirname, "..", "memi-config", "config.json");
          if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
        } catch {}
        return { api1: {} };
      })();
      const result = await callAgent(config.api1, [{ role: "user", content: text }], {});
      const reply = result.answer || "抱歉，无法处理此请求。";
      res.json({ reply: reply.slice(0, 2000), auto_escape: false });
    } catch(e) {
      res.json({ reply: "处理失败: " + e.message });
    }
  });

  // Telegram 设置/删除 webhook
  router.post("/gateway/telegram/:token/setup", async (req, res) => {
    try {
      const { token } = req.params;
      const baseUrl = req.body.baseUrl || `http://localhost:${process.env.PORT || 3001}`;
      const webhookUrl = `${baseUrl}/api/gateway/telegram/${token}`;
      const r = await axios.post(`https://api.telegram.org/bot${token}/setWebhook`, { url: webhookUrl });
      res.json({ success: true, webhook: webhookUrl, result: r.data });
    } catch(e) {
      res.status(500).json({ success: false, error: e.message });
    }
  });
}

module.exports = { handleWebSocket, createConnectionRoutes };