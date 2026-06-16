// ╔══════════════════════════════════════════════════════════╗
// ║  Memi MCP — Model Context Protocol 客户端                ║
// ║  连接外部 MCP Server，注入其 tools 到 Agent                ║
// ╚══════════════════════════════════════════════════════════╝

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const CONFIG_DIR = path.join(__dirname, "..", "..", "memi-config");
const MCP_DIR = path.join(CONFIG_DIR, "mcp-servers");

let nextId = 1;

// ─── JSON-RPC 消息 ──────────────────────────────────────
function jsonRpc(method, params = {}) {
  return JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }) + "\n";
}

// ─── 启动 MCP Server 进程 ──────────────────────────────
function startMcpServer(serverConfig) {
  return new Promise((resolve, reject) => {
    const { command, args = [], env = {} } = serverConfig;
    const proc = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...env },
      cwd: serverConfig.cwd || process.cwd(),
    });

    let buffer = "";
    let initialized = false;
    const tools = [];
    const pending = new Map(); // id → { resolve, reject }

    proc.stdout.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const msg = JSON.parse(line);
          if (msg.id && pending.has(msg.id)) {
            const p = pending.get(msg.id);
            pending.delete(msg.id);
            if (msg.error) p.reject(new Error(msg.error.message || "MCP error"));
            else p.resolve(msg.result);
          }
          // Handle notifications (notifications have no id)
          if (msg.method === "notifications/initialized") {
            initialized = true;
          }
        } catch {}
      }
    });

    proc.stderr.on("data", (data) => {
      // MCP servers write logs to stderr
      console.error("[MCP]", serverConfig.name, ":", data.toString().trim());
    });

    proc.on("error", (e) => {
      reject(new Error(`无法启动 MCP server "${serverConfig.name}": ${e.message}`));
    });

    proc.on("close", (code) => {
      // Server exited
    });

    // 发送请求
    function send(method, params = {}) {
      return new Promise((res, rej) => {
        const id = nextId;
        const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
        pending.set(id, { resolve: res, reject: rej });
        proc.stdin.write(msg);
      });
    }

    // 初始化序列
    (async () => {
      try {
        const initResult = await send("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          clientInfo: { name: "memi-mcp", version: "1.0.0" },
        });
        serverConfig.serverInfo = initResult?.serverInfo || {};
        // 发送 initialized 通知
        proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");

        const toolsResult = await send("tools/list", {});
        if (toolsResult?.tools) {
          for (const tool of toolsResult.tools) {
            tools.push({
              name: "mcp_" + (serverConfig.name || "mcp") + "_" + tool.name,
              description: `[MCP:${serverConfig.name}] ${tool.description || tool.name}`,
              parameters: tool.inputSchema || { type: "object", properties: {}, required: [] },
              handler: async (args) => {
                const result = await send("tools/call", { name: tool.name, arguments: args });
                if (result?.content) {
                  return result.content.map(c => c.text || JSON.stringify(c)).join("\n");
                }
                return JSON.stringify(result);
              },
            });
          }
        }
        resolve({ proc, tools, send, close: () => proc.kill() });
      } catch (e) {
        proc.kill();
        reject(e);
      }
    })();
  });
}

// ─── 加载所有 MCP Server ───────────────────────────────
async function loadMcpServers() {
  if (!fs.existsSync(MCP_DIR)) return [];
  const mcpServers = [];

  const files = fs.readdirSync(MCP_DIR).filter(f => f.endsWith(".json"));
  for (const file of files) {
    try {
      const config = JSON.parse(fs.readFileSync(path.join(MCP_DIR, file), "utf8"));
      config.name = config.name || file.replace(".json", "");
      if (!config.command) continue;

      const result = await startMcpServer(config).catch(e => {
        console.warn("[MCP] 启动失败:", config.name, e.message);
        return null;
      });

      if (result) {
        mcpServers.push({ config, ...result });
        console.log(`[MCP] ${config.name}: ${result.tools.length} 个工具已加载`);
      }
    } catch (e) {
      console.warn("[MCP] 加载配置失败:", file, e.message);
    }
  }

  return mcpServers;
}

// ─── 获取所有 MCP 工具 ─────────────────────────────────
function getMcpTools(mcpServers) {
  const tools = [];
  for (const server of mcpServers) {
    for (const tool of server.tools) {
      tools.push(tool);
    }
  }
  return tools;
}

// ─── 添加 MCP Server ───────────────────────────────────
function addMcpServer(name, command, args = [], env = {}) {
  if (!fs.existsSync(MCP_DIR)) fs.mkdirSync(MCP_DIR, { recursive: true });
  const config = { name, command, args, env };
  const dest = path.join(MCP_DIR, name.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json");
  fs.writeFileSync(dest, JSON.stringify(config, null, 2));
  return dest;
}

// ─── 列出 ──────────────────────────────────────────────
function listMcpServers() {
  if (!fs.existsSync(MCP_DIR)) return [];
  return fs.readdirSync(MCP_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => {
      try {
        const config = JSON.parse(fs.readFileSync(path.join(MCP_DIR, f), "utf8"));
        return { name: f.replace(".json", ""), command: config.command, args: config.args || [] };
      } catch { return { name: f.replace(".json", ""), error: "配置损坏" }; }
    });
}

// ─── 删除 ──────────────────────────────────────────────
function removeMcpServer(name) {
  const dest = path.join(MCP_DIR, name.replace(/[^a-zA-Z0-9_-]/g, "_") + ".json");
  if (fs.existsSync(dest)) fs.unlinkSync(dest);
}

module.exports = { loadMcpServers, getMcpTools, addMcpServer, listMcpServers, removeMcpServer };
