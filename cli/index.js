#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

// ─── 全局路径 ────────────────────────────────────────
const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "memi-config");
const CONFIG = path.join(DIR, "config.json");
const BACKUP_DIR = path.join(DIR, "backups");
const WORKSPACE = path.join(DIR, "workspace");
const SKILLS = path.join(DIR, "skills");
const SESSIONS = path.join(DIR, "sessions");
const AGENTS_DIR = path.join(DIR, "agents");
const LOGS = path.join(DIR, "logs");
const CACHE = path.join(DIR, "cache");
const ONBOARDED = path.join(DIR, ".onboarded");

[DIR, BACKUP_DIR, WORKSPACE, SKILLS, SESSIONS, AGENTS_DIR, LOGS, CACHE].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

const initWorkspace = () => {
  const docs = {
    "SOUL.md": "# Memi Agent · Soul\n\n你是 Memi，一个机智高效的 AI 助手。拥有完整的系统访问权限。\n直接动手，不废话。",
    "MEMORY.md": "# Memory\n\n> 在此记录用户偏好和重要上下文。\n",
    "USER.md": "# User Profile\n\n> 用户习惯和偏好。\n",
    "IDENTITY.md": "# Identity\n\n- Name: Memi\n- Version: 1.0\n- Built: 2025\n",
    "TOOLS.md": "# Tools\n\n57 个内置工具：文件操作、系统管理、网络工具、编码转换等。\n",
  };
  Object.entries(docs).forEach(([name, content]) => {
    const p = path.join(WORKSPACE, name);
    if (!fs.existsSync(p)) fs.writeFileSync(p, content);
  });
};
initWorkspace();

// ─── ANSI ────────────────────────────────────────────
const A = { r:"\x1b[0m", b:"\x1b[1m", d:"\x1b[2m", g:"\x1b[90m", rk:"\x1b[31m", gk:"\x1b[32m", yk:"\x1b[33m", bk:"\x1b[34m", mk:"\x1b[35m", ck:"\x1b[36m", wk:"\x1b[37m" };

function out(...a) { process.stdout.write(a.join("")); }
function log(...a) { console.log(a.join("") + A.r); }
function ok(t) { log(A.gk + "  ✓ " + t + A.r); }
function warn(t) { log(A.yk + "  ⚠ " + t + A.r); }
function fail(t) { log(A.rk + "  ✗ " + t + A.r); }

// ─── i18n ────────────────────────────────────────────
let _lang = "zh";
try { const c = JSON.parse(fs.readFileSync(CONFIG,"utf8")); if(c.lang==="en") _lang="en"; } catch {}
const L = {
  "chat":"对话","status":"状态","config":"配置","skills":"技能","sessions":"会话","onboard":"引导",
  "dashboard":"面板","server":"服务","doctor":"诊断","update":"更新","version":"版本","help":"帮助",
  "daemon":"守护进程","reset":"重置","agent":"Agent","voice":"语音","browser":"浏览器",
  "mcp":"MCP","sandbox":"沙箱","memory":"记忆","plugin":"插件","cron":"定时","rag":"向量记忆","backup":"备份","restore":"恢复",
  "ch":"chat","st":"status","cf":"config","sk":"skills","ss":"sessions","ob":"onboard",
  "db":"dashboard","sv":"server","dr":"doctor","up":"update","vr":"version","hp":"help",
  "ready":"就绪","saved":"已保存","deleted":"已删除","error":"错误","cancel":"取消","confirm":"确认",
  "noConfig":"未找到配置，请先运行 memi onboard","loading":"加载中...","done":"完成",
  "restartTip":"重启服务后生效: memi server restart","installed":"已安装","removed":"已删除",
  "notFound":"未找到","empty":"无","failed":"失败","success":"成功","unknown":"未知命令",
  "seeHelp":"输入 memi help 查看所有命令","noApiKey":"未配置 API Key",
  "serverRunning":"运行中","serverStopped":"未启动","allGood":"一切正常",
  "newSession":"新对话","voiceMode":"语音对话模式","voiceExit":"输入 /voice exit 退出",
  "recording":"正在录音...(按 Enter 停止)","transcribing":"转写中...","transcribeFail":"转写失败",
  "sendMsg":"发送消息...","voiceWinTip":"Windows 录音请使用 Dashboard 的 🎤 按钮",
  "continueRec":"继续录音? (Enter/yes 继续, 其他退出):","voiceExitMsg":"已退出语音模式",
};
function _(key) { if(_lang==="en"){ const en={
  chat:"Chat",status:"Status",config:"Config",skills:"Skills",sessions:"Sessions",onboard:"Onboard",
  dashboard:"Dashboard",server:"Server",doctor:"Doctor",update:"Update",version:"Version",help:"Help",
  daemon:"Daemon",reset:"Reset",agent:"Agent",voice:"Voice",browser:"Browser",
  mcp:"MCP",sandbox:"Sandbox",memory:"Memory",plugin:"Plugin",cron:"Cron",rag:"Vector Memory",backup:"Backup",restore:"Restore",
  ready:"Ready",saved:"Saved",deleted:"Deleted",error:"Error",cancel:"Cancel",confirm:"Confirm",
  noConfig:"No config found. Run: memi onboard",loading:"Loading...",done:"Done",
  restartTip:"Restart server to apply: memi server restart",installed:"Installed",removed:"Removed",
  notFound:"Not found",empty:"Empty",failed:"Failed",success:"Success",unknown:"Unknown command",
  seeHelp:"Type memi help for commands",noApiKey:"API Key not configured",
  serverRunning:"Running",serverStopped:"Not running",allGood:"All good",
  newSession:"New Chat",voiceMode:"Voice Mode",voiceExit:"Type /voice exit to quit",
  recording:"Recording... (press Enter to stop)",transcribing:"Transcribing...",transcribeFail:"Transcription failed",
  sendMsg:"Send a message...",voiceWinTip:"Use Dashboard 🎤 button for Windows recording",
  continueRec:"Continue recording? (Enter/yes to continue, anything else to exit):",voiceExitMsg:"Voice mode exited",
 }[key]; if(en) return en } return key in L?L[key]:key }

function setLang(l) { _lang=l; try { const c=JSON.parse(fs.readFileSync(CONFIG,"utf8"));c.lang=l;fs.writeFileSync(CONFIG,JSON.stringify(c,null,2)); } catch {} }
function head(t) { log("\n" + A.b + A.wk + "  " + t + A.r); }
function pair(k, v) { log(`  ${A.g}${k}${A.r}  ${A.wk}${v}`); }

// ─── 配置 ────────────────────────────────────────────
function loadCfg() {
  try {
    if (fs.existsSync(CONFIG)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
      if (!raw.models) raw.models = { primary: raw.api1 || {}, secondary: raw.api2 || {}, tertiary: raw.api3 || {} };
      if (!raw.agents) raw.agents = [{ name: "default", model: (raw.api1||raw.models?.primary||{}).model || "?", systemPrompt: "" }];
      if (!raw.api1) raw.api1 = raw.models?.primary || {};
      if (!raw.api2) raw.api2 = raw.models?.secondary || {};
      if (!raw.api3) raw.api3 = raw.models?.tertiary || {};
      return raw;
    }
  } catch {}
  return { api1:{}, api2:{}, api3:{}, models:{primary:{}}, agents:[{name:"default",model:"?",systemPrompt:""}] };
}
function saveCfg(c) {
  try {
    fs.mkdirSync(path.dirname(CONFIG), { recursive: true });
    if (c.models) { c.api1 = c.models.primary || {}; c.api2 = c.models.secondary || {}; c.api3 = c.models.tertiary || {}; }
    fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2));
    try { fs.writeFileSync(path.join(ROOT, "memi-server", "config.json"), JSON.stringify({api1:c.api1,api2:c.api2,api3:c.api3},null,2)); } catch {}
  } catch {}
}

// ─── 命令注册表 ──────────────────────────────────────
let commands = null;

function loadCommands() {
  if (commands) return commands;
  commands = new Map();
  const cmdDir = path.join(__dirname, "commands");
  if (!fs.existsSync(cmdDir)) return commands;
  const files = fs.readdirSync(cmdDir).filter(f => f.endsWith(".js"));
  for (const file of files) {
    try {
      const mod = require(path.join(cmdDir, file));
      if (mod.name) {
        commands.set(mod.name, mod);
        if (mod.aliases) mod.aliases.forEach(a => commands.set(a, mod));
      }
    } catch (e) {
      console.error(`  ✗ 加载命令失败: ${file} — ${e.message}`);
    }
  }
  return commands;
}

function getCommands() {
  loadCommands();
  const seen = new Set();
  return Array.from(commands.values()).filter(c => {
    if (seen.has(c.name)) return false;
    seen.add(c.name);
    return true;
  });
}

// ─── 调度器 ───────────────────────────────────────────
async function dispatch(argv) {
  const cmdName = argv[0] || "chat";
  const args = argv.slice(1);

  // 自动触发引导
  if (!fs.existsSync(ONBOARDED) && cmdName !== "onboard" && cmdName !== "chat") {
    const { run } = require("./commands/onboard");
    await run([]);
  }

  loadCommands();
  const cmd = commands.get(cmdName);
  if (cmd) {
    try {
      await cmd.run(args);
    } catch (e) {
      fail(cmd.name + " 执行失败: " + e.message);
      if (process.env.MEMI_DEBUG) console.error(e);
    }
  } else {
    log(A.yk + "  " + _("unknown") + ": " + cmdName);
    log(A.g + "  " + _("seeHelp"));
  }
}

// ─── 暴露 ────────────────────────────────────────────
module.exports = {
  A, _, log, out, ok, warn, fail, head, pair,
  loadCfg, saveCfg, setLang,
  ROOT, DIR, CONFIG, BACKUP_DIR, WORKSPACE, SKILLS, SESSIONS, AGENTS_DIR, LOGS, CACHE, ONBOARDED,
  dispatch, getCommands, loadCommands, _lang,
};
// 向后兼容
module.exports.ui = require("./ui");
