// ╔══════════════════════════════════════════════════════════╗
// ║  Memi Plugins — 插件系统                                 ║
// ║  用户自定义工具/中间件/事件监听                            ║
// ╚══════════════════════════════════════════════════════════╝

const fs = require("fs");
const path = require("path");

const CONFIG_DIR = path.join(__dirname, "..", "..", "memi-config");
const PLUGINS_DIR = path.join(CONFIG_DIR, "plugins");

// ─── 加载所有插件 ───────────────────────────────────────
function loadPlugins() {
  if (!fs.existsSync(PLUGINS_DIR)) return [];
  const plugins = [];
  const dirs = fs.readdirSync(PLUGINS_DIR, { withFileTypes: true });

  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    const pluginFile = path.join(PLUGINS_DIR, d.name, "plugin.js");
    if (!fs.existsSync(pluginFile)) continue;

    try {
      const plugin = require(pluginFile);
      if (typeof plugin === "function") {
        const instance = plugin();
        plugins.push({
          name: instance.name || d.name,
          version: instance.version || "0.0.1",
          description: instance.description || "",
          tools: (instance.tools || []).map(t => ({
            name: "plugin_" + d.name + "_" + t.name,
            description: `[插件:${d.name}] ${t.description || t.name}`,
            parameters: t.parameters || { type: "object", properties: {}, required: [] },
            handler: t.handler,
          })),
          middleware: instance.middleware || null,
          onEvent: instance.onEvent || null,
        });
        console.log(`[Plugins] 已加载: ${d.name}`);
      }
    } catch (e) {
      console.warn(`[Plugins] ${d.name} 加载失败:`, e.message);
    }
  }
  return plugins;
}

// ─── 获取所有插件工具 ────────────────────────────────────
function getPluginTools(plugins) {
  const tools = [];
  for (const p of plugins) {
    for (const t of p.tools) {
      tools.push(t);
    }
  }
  return tools;
}

// ─── 列出已安装插件 ─────────────────────────────────────
function listPlugins() {
  if (!fs.existsSync(PLUGINS_DIR)) return [];
  return fs.readdirSync(PLUGINS_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(PLUGINS_DIR, d.name, "plugin.js")))
    .map(d => {
      try {
        const pkg = require(path.join(PLUGINS_DIR, d.name, "plugin.js"));
        const inst = typeof pkg === "function" ? pkg() : pkg;
        return { name: inst.name || d.name, version: inst.version || "?", description: inst.description || "" };
      } catch { return { name: d.name, error: "加载失败" }; }
    });
}

// ─── 安装插件（从本地目录复制）─────────────────────────
function installPlugin(sourceDir) {
  const name = path.basename(sourceDir);
  const dest = path.join(PLUGINS_DIR, name);
  if (fs.existsSync(dest)) throw new Error(`插件 "${name}" 已安装`);
  fs.mkdirSync(PLUGINS_DIR, { recursive: true });
  copyDir(sourceDir, dest);
  return dest;
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

// ─── 删除插件 ──────────────────────────────────────────
function removePlugin(name) {
  const dest = path.join(PLUGINS_DIR, name);
  if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true });
}

module.exports = { loadPlugins, getPluginTools, listPlugins, installPlugin, removePlugin };
