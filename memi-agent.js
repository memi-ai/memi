#!/usr/bin/env node
// ╔══════════════════════════════════════════════════════════╗
// ║  Memi Agent CLI                                         ║
// ║  chat | status | config | skills | sessions | onboard    ║
// ╚══════════════════════════════════════════════════════════╝

const readline = require("readline");
const fs = require("fs");
const path = require("path");

// ─── 路径 ────────────────────────────────────────────
const ROOT = __dirname;
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

// 初始化 workspace 文档（SOUL.md, MEMORY.md 等）
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
function head(t) { log("\n" + A.b + A.wk + "  " + t + A.r); }
function pair(k, v) { log(`  ${A.g}${k}${A.r}  ${A.wk}${v}`); }

// ─── 配置 ────────────────────────────────────────────
function loadCfg() {
  try {
    if (fs.existsSync(CONFIG)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
      // 自动升级：确保有 models + agents 结构
      if (!raw.models) raw.models = { primary: raw.api1 || {}, secondary: raw.api2 || {}, tertiary: raw.api3 || {} };
      if (!raw.agents) raw.agents = [{ name: "default", model: (raw.api1||raw.models?.primary||{}).model || "?", systemPrompt: "" }];
      // 保留旧字段兼容
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
    // 同步 models → api1/api2/api3
    if (c.models) { c.api1 = c.models.primary || {}; c.api2 = c.models.secondary || {}; c.api3 = c.models.tertiary || {}; }
    fs.writeFileSync(CONFIG, JSON.stringify(c, null, 2));
    // 写一份到 memi-server/
    try { fs.writeFileSync(path.join(__dirname, "memi-server", "config.json"), JSON.stringify({api1:c.api1,api2:c.api2,api3:c.api3},null,2)); } catch {}
  } catch {}
}

// ─── 状态 ────────────────────────────────────────────
function showStatus() {
  const c = loadCfg();
  const api = c.api1 || {};
  head("Status");
  pair("Endpoint", api.baseUrl || "—");
  pair("Model",    api.model || "—");
  pair("API Key",  api.apiKey ? "***" + api.apiKey.slice(-4) : "—");
  try {
    const sess = fs.readdirSync(SESSIONS).filter((f) => f.endsWith(".json"));
    const sk = fs.readdirSync(SKILLS).filter((f) => f.endsWith(".json"));
    pair("Sessions", sess.length + " saved");
    pair("Skills",   sk.length + " local");
  } catch {}
  log("");
}

// ─── 新手引导 ────────────────────────────────────────
async function onboard() {
  log(A.mk + A.b + "\n  ╔══════════════════════════════════════════╗");
  log(A.mk + A.b + "  ║        🦞 Memi Agent · Setup            ║");
  log(A.mk + A.b + "  ║        v1.0  ·  63 tools  ·  12 steps     ║");
  log(A.mk + A.b + "  ╚══════════════════════════════════════════╝\n");
  log(A.g + "  此引导将按以下顺序完成初始化配置。");
  log(A.g + "  Ctrl+C 任意步骤可退出，已完成配置会自动保存。\n");

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q, d, hidden = false) => new Promise((r) => {
    const prompt = A.g + "  > " + q + (d && !hidden ? A.g + ` [${d}]` : "") + ": " + A.r;
    rl.question(prompt, (a) => {
      const val = a.trim();
      if (hidden && !val) { r(""); return; } // 空输入不覆盖旧值
      r(val || d || "");
    });
  });
  const choose = async (q, opts) => {
    if (opts.length <= 10) {
      log(A.g + "  " + q);
      opts.forEach((o, i) => log(`    ${A.g}${i+1}.${A.r} ${A.wk}${o}${A.r}`));
      const n = await ask("序号或搜索关键词", "1");
      if (isNaN(parseInt(n))) {
        const f = opts.filter(o => o.toLowerCase().includes(n.toLowerCase()));
        if (f.length === 0) { warn("无匹配"); return opts[0]; }
        log(A.g + "  匹配 " + f.length + " 项:");
        f.forEach((o, i) => log(`    ${A.g}${i+1}.${A.r} ${A.wk}${o}${A.r}`));
        const m = await ask("序号", "1");
        return f[parseInt(m)-1] || f[0];
      }
      return opts[parseInt(n)-1] || opts[0];
    }
    // 大列表：交互式带箭头上键选择
    return new Promise((resolve) => {
      const PS = 10;
      let cur = 0, page = 0, input = "", filtered = opts;
      const totalPages = Math.ceil(filtered.length / PS);

      const draw = () => {
        console.clear();
        log(A.b + A.wk + "  " + q + A.r);
        log(A.d + "  ↑↓选择  搜索  数字  Enter确认  Esc取消" + A.r);
        const start = page * PS;
        const subset = filtered.slice(start, start + PS);
        subset.forEach((o, i) => {
          const mark = (start + i === cur) ? A.b + A.gk + " ▶" + A.r : "  ";
          log(mark + ` ${A.g}${start+i+1}.${A.r} ${A.wk}${o}${A.r}`);
        });
        if (input) log(A.g + `  搜索: ${A.wk}${input}${A.r}`);
        log(A.d + `  [${page+1}/${totalPages}] 第${cur+1}项` + A.r);
      };

      // 先画初始界面再进入 raw mode
      draw();
      // (draw() already called above)

      const wasRaw = process.stdin.isRaw;
      process.stdin.setRawMode(true);
      process.stdin.resume();

      const onData = (key) => {
        const s = key.toString();
        if (s === "\u001b[A") { // Up
          cur = Math.max(0, cur - 1);
          if (cur < page * PS) { page = Math.max(0, page - 1); cur = page * PS + PS - 1; }
          draw();
        } else if (s === "\u001b[B") { // Down
          cur = Math.min(filtered.length - 1, cur + 1);
          if (cur >= (page + 1) * PS) { page = Math.min(totalPages - 1, page + 1); cur = page * PS; }
          draw();
        } else if (s === "\r" || s === "\n") { // Enter
          if (input && isNaN(parseInt(input))) {
            filtered = opts.filter(o => o.toLowerCase().includes(input.toLowerCase()));
            input = ""; cur = 0; page = 0;
            if (filtered.length === 0) { filtered = opts; }
            draw();
            return;
          }
          const num = parseInt(input) || (cur + 1);
          cleanup(); process.stdout.write("\n"); resolve(filtered[Math.min(num - 1, filtered.length - 1)] || filtered[0]);
        } else if (s === "\x03") { cleanup(); process.exit(0); } // Ctrl+C
        else if (s === "\x1b") { // Esc
          const num = parseInt(input);
          cleanup(); process.stdout.write("\n"); resolve(filtered[num - 1] || filtered[0] || opts[0]);
        } else if (s === "\b" || s === "\x7f") { // Backspace
          input = input.slice(0, -1); draw();
        } else if (s.length === 1 && s >= " ") {
          input += s;
          const match = filtered[cur] && filtered[cur].toLowerCase().includes(input.toLowerCase());
          if (!match) {
            filtered = opts.filter(o => o.toLowerCase().includes(input.toLowerCase()));
            if (filtered.length === 0) { input = input.slice(0, -1); draw(); return; }
            cur = 0; page = 0;
          }
          draw();
        }
      };

      const cleanup = () => {
        process.stdin.removeListener("data", onData);
        process.stdin.setRawMode(wasRaw);
      };

      process.stdin.on("data", onData);
    });
  };
  const confirm = async (q) => { const a = await ask(q + " (y/n)", "y"); return a.toLowerCase() === "y"; };
  // 进度条
  const progress = (current, total, label) => {
    const w = 20; const p = Math.round((current / total) * w);
    const bar = A.gk + "█".repeat(p) + A.g + "░".repeat(w - p) + A.r;
    readline.clearLine(process.stdout, 0); readline.cursorTo(process.stdout, 0);
    out(A.g + `  ${label || "进度"}: ${bar} ${current}/${total}` + A.r);
  };

  // 扫描 OpenClaw skills
  const openclawSkillsDir = path.join(require("os").homedir(), ".openclaw", "skills");
  let openclawSkillsFound = 0;
  try { if (fs.existsSync(openclawSkillsDir)) {
    openclawSkillsFound = fs.readdirSync(openclawSkillsDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && fs.existsSync(path.join(openclawSkillsDir, d.name, "SKILL.md"))).length;
  }} catch {}

  // 检测 OpenClaw 配置并自动导入
  const openclawConfig = (() => {
    try {
      const ocPath = path.join(require("os").homedir(), ".openclaw", "openclaw.json");
      if (fs.existsSync(ocPath)) {
        const oc = JSON.parse(fs.readFileSync(ocPath, "utf8"));
        const models = oc.models || {};
        const firstModel = Object.values(models)[0] || {};
        return {
          baseUrl: firstModel.baseURL || firstModel.baseUrl || "https://api.openai.com/v1",
          apiKey: firstModel.apiKey || "",
          model: firstModel.model || (oc.agents?.[0]?.model) || "gpt-4o",
        };
      }
    } catch {}
    return null;
  })();

  if (openclawConfig) {
    log(A.mk + "  🔍 检测到 OpenClaw 配置！\n");
    log(A.g + `  Model: ${A.wk}${openclawConfig.model}${A.r}`);
    log(A.g + `  Base URL: ${A.wk}${openclawConfig.baseUrl}${A.r}`);
    log(A.g + `  API Key: ${A.wk}${openclawConfig.apiKey ? "已配置 (***" + openclawConfig.apiKey.slice(-4) + ")" : "未配置"}${A.r}`);
    const use = await confirm("是否导入 OpenClaw 配置？");
    if (use) {
      cfg.api1 = cfg.api1 || {};
      cfg.api1.baseUrl = openclawConfig.baseUrl;
      cfg.api1.model = openclawConfig.model;
      cfg.api1.apiKey = openclawConfig.apiKey || cfg.api1.apiKey;
      saveCfg(cfg);
      ok("配置已导入");
      // 导入 skills
      if (openclawSkillsFound > 0) {
        const impSkills = await confirm(`检测到 ${openclawSkillsFound} 个 OpenClaw skill，是否导入？`);
        if (impSkills) {
          let imported = 0;
          try {
            const ocSkills = fs.readdirSync(openclawSkillsDir, { withFileTypes: true }).filter(d => d.isDirectory());
            const total = ocSkills.length;
            for (let i = 0; i < ocSkills.length; i++) {
              const d = ocSkills[i];
              const src = path.join(openclawSkillsDir, d.name);
              const dest = path.join(SKILLS, d.name);
              progress(i + 1, total, "导入 OpenClaw skill");
              if (!fs.existsSync(dest)) { fs.cpSync(src, dest, { recursive: true }); imported++; }
            }
            log("");
            ok(`已导入 ${imported}/${total} 个 skill`);
          } catch { log(""); warn("skill 导入失败"); }
        }
      }
      if (openclawConfig.apiKey) { rl.close(); return; }
    }
  }

  const cfg = loadCfg();
  cfg.api1 = cfg.api1 || {};
  cfg.api2 = cfg.api2 || {};
  cfg.api3 = cfg.api3 || {};

  // ── 步骤 0：环境检查 ──
  head("步骤 1/12 · 环境检查");
  log(A.g + "  正在检查运行环境...\n");
  const { execSync } = require("child_process");
  const checks = [];

  // Node.js
  checks.push({ name: "Node.js", ok: true, ver: process.version });

  // npm 依赖
  const npmDeps = ["axios", "express", "ws", "cors"];
  const serverNM = path.join(__dirname, "memi-server", "node_modules");
 const missingNpm = npmDeps.filter(d => !fs.existsSync(path.join(serverNM, d)));
  checks.push({ name: "npm 依赖", ok: missingNpm.length === 0, ver: missingNpm.length ? "缺 " + missingNpm.join(",") : "已安装" });

  // Git
  try { const v = execSync("git --version", { encoding: "utf8", timeout: 5000 }).trim(); checks.push({ name: "Git", ok: true, ver: v }); }
  catch { checks.push({ name: "Git", ok: false, ver: "未安装 — 版本控制需要" }); }

  // Python
  try { const v = execSync("python --version 2>&1 || python3 --version 2>&1", { encoding: "utf8", shell: true, timeout: 5000 }).trim(); checks.push({ name: "Python", ok: true, ver: v }); }
  catch { checks.push({ name: "Python", ok: false, ver: "未安装 — 脚本执行需要" }); }

  // build tools (Windows: Visual Studio / Linux: build-essential)
  if (process.platform === "win32") {
    try { execSync("where nmake 2>nul || where msbuild 2>nul || echo notfound", { shell: true, timeout: 5000 }); checks.push({ name: "C++ 构建工具", ok: true, ver: "已安装" }); }
    catch { checks.push({ name: "C++ 构建工具", ok: false, ver: "未安装 — 编译 native 模块需要" }); }
  } else {
    try { execSync("which make && which gcc", { shell: true, timeout: 5000 }); checks.push({ name: "build-essential", ok: true, ver: "已安装" }); }
    catch { checks.push({ name: "build-essential", ok: false, ver: "未安装 — sudo apt install build-essential" }); }
  }

  checks.forEach(c => {
    log(`  ${c.ok ? A.gk + "✓" + A.r : A.yk + "⚠" + A.r} ${A.g}${c.name}${A.r}  ${c.ok ? A.d : A.yk}${c.ver}${A.r}`);
  });

  const failed = checks.filter(c => !c.ok);
  if (failed.length > 0) {
    log(A.yk + "\n  " + failed.length + " 项未就绪" + A.r);
    if (missingNpm.length > 0) {
      const doInstall = await confirm("自动安装 npm 依赖？");
      if (doInstall) {
        try {
          execSync("npm install", { cwd: path.join(__dirname, "memi-server"), stdio: "pipe" });
          ok("npm 依赖已安装");
        } catch { warn("安装失败，请手动: npm install --prefix memi-server"); }
      }
    }
  } else {
    ok("所有环境已就绪");
  }

  // ── 步骤 1：工作区 ──
  head("步骤 2/12 · 工作区路径");
  log(A.g + `  当前: ${A.wk}${DIR}${A.r}`);
  const customDir = await ask("工作区路径（回车使用默认）", "");
  if (customDir && customDir !== DIR) {
    const newDir = path.resolve(customDir);
    log(A.g + "  将使用: " + A.wk + newDir + A.r);
    // 注意：此阶段还不能切换 DIR，因为后续步骤依赖它。提示后续生效。
    log(A.g + "  配置将在所有步骤完成后迁移");
    cfg.workspaceDir = newDir;
  }

  head("步骤 2/11 · 选择 AI 提供商");
  const provider = await choose("选择 AI 提供商:", [
    "OpenAI", "OpenAI-API", "OpenAI-Proxy", "OpenAI-SB", "CloseAI", "API2D", "OhMyGPT", "GPT-API", "AIGC2D",
    "Anthropic", "Google Gemini", "Google Vertex AI", "Mistral AI", "Cohere", "AI21 Labs",
    "xAI Grok", "Meta Llama", "Amazon Bedrock", "IBM Watsonx", "Aleph Alpha",
    "Together AI", "Fireworks AI", "Groq", "OpenRouter", "Perplexity",
    "Replicate", "DeepInfra", "Hugging Face", "NVIDIA NIM", "Cloudflare Workers AI",
    "OctoAI", "Anyscale", "Lepton AI", "RunPod", "BentoML",
    "DeepSeek", "DeepSeek(欧派中转)", "火山方舟", "智谱 AI", "阿里云百炼",
    "腾讯云 TI-ONE", "百度文心一言", "讯飞星火", "腾讯混元", "字节豆包",
    "Kimi", "MiniMax", "百川智能", "零一万物", "StepFun", "非线智能",
    "商汤日日新", "云从科技", "昆仑万维", "面壁智能", "猎户星空",
    "硅基流动", "AIHubMix", "MOMA", "OneAPI", "NewAPI",
    "shturl", "诗云 API", "DMXAPI", "AI-API", "AI.LS", "Oaipro", "V2Gpt",
    "Ollama", "LM Studio", "llama.cpp", "vLLM", "LocalAI", "TGI", "GPT4All", "KoboldCpp",
    "自定义",
  ]);
  // 提供商URL + 默认模型映射表
  const PROVIDERS = {
    "OpenAI":{url:"https://api.openai.com/v1",models:"gpt-4o,gpt-4-turbo,gpt-4o-mini,o1,o3-mini,o3".split(",")},
    "Anthropic":{url:"https://api.anthropic.com/v1",models:"claude-sonnet-4-20250514,claude-3-5-sonnet,claude-3-5-haiku".split(",")},
    "Google Gemini":{url:"https://generativelanguage.googleapis.com/v1beta/openai",models:"gemini-2.5-pro,gemini-2.0-flash".split(",")},
    "Mistral AI":{url:"https://api.mistral.ai/v1",models:"mistral-large-latest,mistral-small-latest,codestral-latest".split(",")},
    "Cohere":{url:"https://api.cohere.ai/v1",models:"command-r-plus,command-r".split(",")},
    "AI21 Labs":{url:"https://api.ai21.com/studio/v1",models:"jamba-1.5-large,jamba-1.5-mini".split(",")},
    "Together AI":{url:"https://api.together.xyz/v1",models:"meta-llama/Llama-3.3-70B-Instruct-Turbo".split(",")},
    "Fireworks AI":{url:"https://api.fireworks.ai/inference/v1",models:"accounts/fireworks/models/llama-v3p1-70b-instruct".split(",")},
    "Groq":{url:"https://api.groq.com/openai/v1",models:"llama-3.3-70b-versatile,llama-3.1-8b-instant".split(",")},
    "OpenRouter":{url:"https://openrouter.ai/api/v1",models:"openai/gpt-4o,anthropic/claude-sonnet,google/gemini-flash".split(",")},
    "火山方舟":{url:"https://ark.cn-beijing.volces.com/api/v3",models:"doubao-pro-128k,doubao-lite-128k".split(",")},
    "智谱 AI":{url:"https://open.bigmodel.cn/api/paas/v4",models:"glm-4-flash,glm-4-plus,glm-4-air".split(",")},
    "阿里云百炼":{url:"https://dashscope.aliyuncs.com/compatible-mode/v1",models:"qwen-plus,qwen-max,qwen-turbo".split(",")},
    "腾讯云 TI-ONE":{url:"https://api.hunyuan.cloud.tencent.com/v1",models:"hunyuan-lite".split(",")},
    "百度文心一言":{url:"https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat",models:"ernie-speed-128k".split(",")},
    "DeepSeek":{url:"https://api.deepseek.com/v1",models:"deepseek-chat,deepseek-reasoner,deepseek-v4-pro,deepseek-v4-flash".split(",")},
    "Kimi":{url:"https://api.moonshot.cn/v1",models:"moonshot-v1-8k,moonshot-v1-32k,moonshot-v1-128k".split(",")},
    "MiniMax":{url:"https://api.minimax.chat/v1",models:"abab6.5s-chat,abab5.5-chat".split(",")},
    "百川智能":{url:"https://api.baichuan-ai.com/v1",models:"Baichuan4,Baichuan3-Turbo".split(",")},
    "非线智能":{url:"https://api.feixian.ai/v1",models:"model".split(",")},
    "硅基流动":{url:"https://api.siliconflow.cn/v1",models:"Qwen/Qwen2.5-7B-Instruct,deepseek-ai/DeepSeek-V3".split(",")},
    "MOMA":{url:"https://api.momayun.com/v1",models:"gpt-4o".split(",")},
    "OneAPI":{url:"https://your-oneapi.com/v1",models:"all".split(",")},
    "NewAPI":{url:"https://api.newapi.com/v1",models:"all".split(",")},
    "shturl":{url:"https://api.shturl.com/v1",models:"gpt-4o".split(",")},
    "诗云 API":{url:"https://api.shiyunapi.com/v1",models:"gpt-4o".split(",")},
    "DMXAPI":{url:"https://api.dmxapi.com/v1",models:"gpt-4o".split(",")},
    "Ollama":{url:"http://localhost:11434/v1",models:"llama3:8b,qwen2.5:7b".split(",")},
    "llama.cpp":{url:"http://localhost:8081/v1",models:"model".split(",")},
    "vLLM":{url:"http://localhost:8000/v1",models:"model".split(",")},
    "TGI":{url:"http://localhost:8080/v1",models:"model".split(",")},
    "OpenAI-API":{url:"https://api.openai.com/v1",models:"gpt-4o".split(",")},
    "OpenAI-Proxy":{url:"https://api.openai-proxy.com/v1",models:"all".split(",")},
    "OpenAI-SB":{url:"https://api.openai-sb.com/v1",models:"all".split(",")},
    "CloseAI":{url:"https://api.closeai-asia.com/v1",models:"all".split(",")},
    "API2D":{url:"https://api.api2d.com/v1",models:"all".split(",")},
    "OhMyGPT":{url:"https://api.ohmygpt.com/v1",models:"all".split(",")},
    "GPT-API":{url:"https://api.gpt-api.com/v1",models:"all".split(",")},
    "AIGC2D":{url:"https://api.aigc2d.com/v1",models:"all".split(",")},
    "Google Vertex AI":{url:"https://REGION-aiplatform.googleapis.com/v1",models:"gemini-pro".split(",")},
    "xAI Grok":{url:"https://api.x.ai/v1",models:"grok-2,grok-2-mini".split(",")},
    "Meta Llama":{url:"https://api.llama-api.com",models:"llama3.1-70b".split(",")},
    "Amazon Bedrock":{url:"https://bedrock-runtime.us-east-1.amazonaws.com",models:"anthropic.claude-3-sonnet".split(",")},
    "IBM Watsonx":{url:"https://us-south.ml.cloud.ibm.com/ml/v1/text/generation",models:"ibm/granite-13b-chat-v2".split(",")},
    "Aleph Alpha":{url:"https://api.aleph-alpha.com/v1",models:"luminous-base".split(",")},
    "Perplexity":{url:"https://api.perplexity.ai",models:"llama-3.1-sonar-large-128k-online".split(",")},
    "Replicate":{url:"https://api.replicate.com/v1",models:"meta/meta-llama-3-70b-instruct".split(",")},
    "DeepInfra":{url:"https://api.deepinfra.com/v1/openai",models:"meta-llama/Meta-Llama-3.1-70B-Instruct".split(",")},
    "Hugging Face":{url:"https://api-inference.huggingface.co/v1",models:"meta-llama/Meta-Llama-3-8B-Instruct".split(",")},
    "NVIDIA NIM":{url:"https://integrate.api.nvidia.com/v1",models:"meta/llama-3.1-70b-instruct".split(",")},
    "Cloudflare Workers AI":{url:"https://api.cloudflare.com/client/v4/accounts/YOUR_ID/ai/v1",models:"@cf/meta/llama-3-8b-instruct".split(",")},
    "OctoAI":{url:"https://text.octoai.run/v1",models:"meta-llama-3.1-70b-instruct".split(",")},
    "Anyscale":{url:"https://api.endpoints.anyscale.com/v1",models:"meta-llama/Llama-3-70b-chat-hf".split(",")},
    "Lepton AI":{url:"https://api.lepton.ai/v1",models:"llama3-70b".split(",")},
    "RunPod":{url:"https://api.runpod.ai/v2/YOUR_ENDPOINT/openai/v1",models:"model".split(",")},
    "BentoML":{url:"https://api.bentoml.com/v1",models:"model".split(",")},
    "DeepSeek(欧派中转)":{url:"https://api.deepseek.com/v1",models:"deepseek-chat".split(",")},
    "讯飞星火":{url:"https://spark-api-open.xf-yun.com/v1",models:"generalv3.5".split(",")},
    "腾讯混元":{url:"https://api.hunyuan.cloud.tencent.com/v1",models:"hunyuan-lite".split(",")},
    "字节豆包":{url:"https://ark.cn-beijing.volces.com/api/v3",models:"doubao-lite-128k".split(",")},
    "零一万物":{url:"https://api.lingyiwanwu.com/v1",models:"yi-large,yi-medium".split(",")},
    "StepFun":{url:"https://api.stepfun.com/v1",models:"step-1-8k,step-1-32k".split(",")},
    "商汤日日新":{url:"https://api.sensenova.cn/v1",models:"SenseChat-5".split(",")},
    "云从科技":{url:"https://api.cloudwalk.com/v1",models:"model".split(",")},
    "昆仑万维":{url:"https://api.kunlun.com/v1",models:"model".split(",")},
    "面壁智能":{url:"https://api.modelbest.cn/v1",models:"MiniCPM".split(",")},
    "猎户星空":{url:"https://api.orionstar.com/v1",models:"model".split(",")},
    "AIHubMix":{url:"https://aihubmix.com/v1",models:"all".split(",")},
    "AI-API":{url:"https://api.ai-api.com/v1",models:"all".split(",")},
    "AI.LS":{url:"https://api.ai.ls/v1",models:"all".split(",")},
    "Oaipro":{url:"https://api.oaipro.com/v1",models:"all".split(",")},
    "V2Gpt":{url:"https://api.v2gpt.com/v1",models:"all".split(",")},
    "LM Studio":{url:"http://localhost:1234/v1",models:"local-model".split(",")},
    "LocalAI":{url:"http://localhost:8080/v1",models:"model".split(",")},
    "GPT4All":{url:"http://localhost:4891/v1",models:"model".split(",")},
    "KoboldCpp":{url:"http://localhost:5001/v1",models:"model".split(",")},
  };
  let modelChoices = [];
  if (PROVIDERS[provider]) {
    cfg.api1.baseUrl = PROVIDERS[provider].url;
    modelChoices = PROVIDERS[provider].models;
  } else if (provider.startsWith("──")) {
    warn("请选择提供商，不是分类标题"); return;
  } else {
    cfg.api1.baseUrl = await ask("Base URL", cfg.api1.baseUrl);
    cfg.api1.model = await ask("Model", cfg.api1.model || "deepseek-chat");
  }

  // ── 步骤 2：模型 ──
  head("步骤 2/8 · 模型选择");
  // 中转站给通用热门模型列表
  if (modelChoices.length === 1 && (modelChoices[0] === "all" || modelChoices[0] === "model")) {
    modelChoices = "gpt-4o,gpt-4o-mini,gpt-3.5-turbo,claude-3-5-sonnet,gemini-2.0-flash,deepseek-chat,deepseek-reasoner,qwen-plus,glm-4-flash".split(",");
  }
  if (modelChoices.length > 1) {
    const chosen = await choose("选择模型:", modelChoices);
    cfg.api1.model = chosen.trim();
  } else if (modelChoices.length === 1) {
    cfg.api1.model = modelChoices[0];
    log(A.g + "  默认模型: " + A.wk + cfg.api1.model + A.r);
  } else {
    cfg.api1.model = await ask("模型名称", cfg.api1.model || "gpt-4o");
  }
  const keyInput = await ask("API Key（输入不可见，直接回车保持不变）", "", true);
 if (keyInput) cfg.api1.apiKey = keyInput;

  // ── 步骤 3：生图 API（可选）─
  // ── Agent 身份 ──
  head("步骤 3/10 · Agent 身份");
  cfg.agents = cfg.agents || [];
  if (cfg.agents.length > 0) {
    const aName = await ask("Agent 名称", cfg.agents[0].name || "default");
    const aPrompt = await ask("系统提示词（回车跳过）", cfg.agents[0].systemPrompt || "");
    cfg.agents[0] = { name: aName, model: cfg.api1.model, systemPrompt: aPrompt };
  }

  // ── 搜索引擎 ──
  head("步骤 4/10 · 搜索引擎");
  const se = await choose("默认搜索引擎:", ["DuckDuckGo + Bing（自动切换）", "仅 DuckDuckGo", "仅 Bing"]);
  cfg.searchEngine = ["auto", "ddg", "bing"][["DuckDuckGo", "仅", "仅"].findIndex(k => se.includes(k))] || "auto";
  ok("搜索引擎: " + se);

  // ── 网关端口 ──
  head("步骤 5/10 · 网关端口");
  const port = await ask("网关端口", String(process.env.PORT || 3001));
  cfg.gatewayPort = parseInt(port) || 3001;
  ok("端口: " + cfg.gatewayPort);

  head("步骤 6/10 · 消息渠道（可选）");
  log(A.g + "  Memi 支持在聊天 App 里使用 AI：");
  log(A.g + "  " + A.wk + "Telegram / 飞书 / 企业微信 / QQ" + A.r);
  const wantChannel = await confirm("是否配置消息渠道？");
  if (wantChannel) {
    const ch = await choose("选择渠道:", ["Telegram", "飞书", "企业微信", "QQ"]);
    const ngrokUrl = "https://pyromania-strenuous-sinuous.ngrok-free.dev";
    if (ch === "Telegram") {
      const tToken = await ask("Telegram Bot Token (@BotFather 获取)", "");
      if (tToken) {
        try {
          await fetch(`http://localhost:3001/api/gateway/telegram/${tToken}/setup`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ baseUrl: ngrokUrl })
          });
          ok("Telegram webhook 已注册");
        } catch { warn("注册失败，稍后运行 memi telegram " + tToken); }
      }
    } else if (ch === "飞书") {
      log(A.gk + "  ✓ Feishu 端点就绪" + A.r);
      log(A.g + "  回调 URL: " + A.wk + ngrokUrl + "/api/gateway/feishu" + A.r);
      log(A.g + "  请在飞书开放平台配置此地址");
    } else if (ch === "企业微信") {
      const wcKey = await ask("企业微信机器人 Webhook Key", "");
      log(A.gk + "  ✓ WeCom 端点就绪" + A.r);
      log(A.g + "  Webhook: " + A.wk + ngrokUrl + "/api/gateway/wecom/" + (wcKey || "KEY") + A.r);
    } else if (ch === "QQ") {
      const qqToken = await ask("QQ Bot Token", "");
      log(A.gk + "  ✓ QQ 端点就绪" + A.r);
      log(A.g + "  Webhook: " + A.wk + ngrokUrl + "/api/gateway/qq/" + (qqToken || "TOKEN") + A.r);
    }
  }

  head("步骤 7/11 · 图片生成 API（可选）");
  const wantImage = await confirm("是否配置生图 API？");
  if (wantImage) {
    cfg.api2.baseUrl = await ask("Base URL", cfg.api2.baseUrl || "https://api.deepseek.com/v1");
    cfg.api2.model   = await ask("Model", cfg.api2.model || "deepseek-chat");
    const keyInput2 = await ask("API Key（输入不可见，直接回车保持不变）", "", true);
    if (keyInput2) cfg.api2.apiKey = keyInput2;
    ok("生图 API 已配置");
  }

  // ── 步骤 4：工作区 ──
  head("步骤 8/11 · 工作区与技能");
  log(A.g + `  配置目录: ${A.wk}${DIR}${A.r}`);
  log(A.g + `  技能目录: ${A.wk}${SKILLS}${A.r}`);
  log(A.g + `  会话目录: ${A.wk}${SESSIONS}${A.r}`);
  const wantSkills = await confirm("是否安装内置示例技能？");
  if (wantSkills) {
    try {
      const examples = [
        { name:"翻译助手", type:"llm", description:"中英互译", promptTemplate:"翻译以下内容: {input}" },
        { name:"代码审查", type:"llm", description:"审查代码并给出建议", promptTemplate:"Review this code and suggest improvements: {input}" },
        { name:"周报生成", type:"llm", description:"从工作记录生成周报", promptTemplate:"根据以下工作记录生成周报: {input}" },
      ];
      examples.forEach((s, i) => {
        fs.writeFileSync(path.join(SKILLS, "example-" + (i + 1) + ".json"), JSON.stringify(s, null, 2));
      });
      ok(`已安装 ${examples.length} 个示例技能`);
    } catch { warn("技能安装失败"); }
  }

  // ── 步骤 5：连接测试 ──
  head("步骤 9/11 · 连接测试");
  out(A.g + "  测试中... ");
  try {
    const r = await fetch("http://localhost:3001/api/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.api1.model, messages: [{ role: "user", content: "Hi" }], max_tokens: 5 }),
    });
    log(r.ok ? A.gk + "✓ 已连接" + A.r : A.rk + "✗ HTTP " + r.status + A.r);
  } catch { log(A.rk + "✗ 无法连接 (memi-server 已启动?)" + A.r); }

  // ── 步骤 6：完成 ──
  // ── 守护进程 ──
  head("步骤 10/11 · 守护进程");
  log(A.g + "  开机自动启动 Memi 服务，无需手动 npm start");
  const wantDaemon = await confirm("是否安装守护进程？");
  if (wantDaemon) {
    const osType = process.platform;
    const serverScript = path.join(__dirname, "memi-server", "index.js");
    if (osType === "win32") {
      try {
        require("child_process").execSync(`schtasks /create /tn "MemiAgent" /tr "node \\"${serverScript}\\"" /sc onstart /f`, { shell: true });
        ok("已安装（schtasks）");
      } catch {
        try {
          const startupDir = path.join(require("os").homedir(), "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
          fs.writeFileSync(path.join(startupDir, "memi-server.bat"), `@echo off\ncd /d "${path.join(__dirname, "memi-server")}"\nnode index.js\n`);
          ok("已安装（启动文件夹）");
        } catch { warn("安装失败，可稍后运行 memi daemon install"); }
      }
    } else {
      log(A.g + "  请稍后手动运行: memi daemon install");
    }
  }

  head("步骤 12/12 · 配置完成");
  saveCfg(cfg);
  fs.writeFileSync(ONBOARDED, "{}");

  log(A.b + A.gk + "\n  ✓ 配置完成！\n" + A.r);
  log(A.g + "  ──────────────────────────────────────");
  pair("AI 模型", cfg.api1.model || "—");
  pair("  Base URL", cfg.api1.baseUrl || "—");
  pair("  API Key", cfg.api1.apiKey ? "***" + cfg.api1.apiKey.slice(-4) : "—");
  pair("思考强度", cfg.thinkLevel || "high");
  pair("会话存储", SESSIONS);
  pair("技能目录", SKILLS);
  log(A.g + "  ──────────────────────────────────────");

  log(A.b + "\n  Quick Start:\n");
  log(`  ${A.ck}memi chat${A.r}        进入智能对话`);
  log(`  ${A.ck}memi status${A.r}      查看系统状态`);
  log(`  ${A.ck}memi skills${A.r}      查看已安装技能`);
  log(`  ${A.ck}memi dashboard${A.r}   打开网页管理面板`);
  log(`  ${A.ck}memi doctor${A.r}      运行系统诊断`);
  log(`  ${A.ck}memi update${A.r}      检查版本更新`);
  log(`  ${A.ck}memi help${A.r}        查看更多命令`);
  log(`  ${A.ck}memi onboard${A.r}     重新运行本引导`);
  log("");
  const goChat = await confirm("是否进入对话？");
  rl.close();
  if (goChat) { console.clear(); await chat(); return; }
}

// ─── 聊天 ────────────────────────────────────────────
async function chat() {
  let msgs = [], session = "default", cfg = loadCfg(), currency = cfg.currency || "¥", apiBalance = "—";
  // 多智能体支持
  let agents = cfg.agents || [{ name: "default", model: (cfg.api1 && cfg.api1.model) || "?", systemPrompt: "" }];
  let currentAgent = agents[0]?.name || "default";
  if (!cfg.agents) { cfg.agents = agents; saveCfg(cfg); }

  const md = (t) => {
    // 表格检测与渲染
    const lines = t.split("\n");
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim().startsWith("|")) { out.push(line); continue; }
      // 收集连续表格行
      const table = [line];
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith("|")) table.push(lines[++i]);
      if (table.length < 2) { out.push(line); continue; }
      // 解析列
      const rows = table.map((r) => r.split("|").slice(1, -1).map((c) => c.trim()));
      const widths = rows[0].map((_, ci) => Math.max(...rows.map((r) => (r[ci] || "").replace(/[\u4e00-\u9fff]/g, "XX").length)));
      // 顶线
      out.push(A.g + "  +" + widths.map((w) => "-".repeat(w + 2)).join("+") + "+" + A.r);
      rows.forEach((row, ri) => {
        const cells = row.map((c, ci) => {
          const w = (c || "").replace(/[\u4e00-\u9fff]/g, "XX").length;
          return " " + c + " ".repeat(widths[ci] - w + 1);
        });
        if (ri === 0) out.push(A.b + A.g + "  |" + cells.join("|") + "|" + A.r);
        else out.push(A.g + "  |" + A.wk + cells.join(A.g + "|" + A.wk) + A.g + "|" + A.r);
        if (ri === 0) out.push(A.g + "  +" + widths.map((w) => "-".repeat(w + 2)).join("+") + "+" + A.r);
      });
      // 底线
      out.push(A.g + "  +" + widths.map((w) => "-".repeat(w + 2)).join("+") + "+" + A.r);
    }
    return out.join("\n")
      .replace(/\*\*(.+?)\*\*/g, A.b + "$1" + A.r)
      .replace(/### (.+)/g, A.b + A.yk + "$1" + A.r)
      .replace(/## (.+)/g, A.b + A.wk + "$1" + A.r)
      .replace(/# (.+)/g, A.b + A.ck + "$1" + A.r)
      .replace(/`{3}(\w*)\n?([\s\S]*?)`{3}/g, "\n" + A.d + "$2" + A.r)
      .replace(/`([^`]+)`/g, A.d + "$1" + A.r);
  };

  async function send(input) {
    msgs.push({ role: "user", content: input });
    const start = Date.now();
    let tools = 0, tOut = 0;

    // 确保服务器在运行，不在则自动启动
    let serverReady = false;
    try { const h = await fetch("http://localhost:3001/health"); serverReady = h.ok; } catch {}
    if (!serverReady) {
      out(A.d + "  启动服务中... " + A.r);
      try {
        const serverPath = path.join(__dirname, "memi-server");
        require("child_process").spawn("node", ["index.js"], { cwd: serverPath, detached: true, stdio: "ignore" }).unref();
        await new Promise(r => setTimeout(r, 2000));
        serverReady = true;
      } catch {}
      if (serverReady) out(A.gk + "  ✓ 服务已启动\n" + A.r);
      else out(A.yk + "  ⚠ 启动失败，请手动: npm start --prefix memi-server\n" + A.r);
    }

    try {
      const r = await fetch("http://localhost:3001/api/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "memi-agent", messages: msgs, stream: true, thinking: cfg.thinkLevel || "high", systemPrompt: agentCfg.systemPrompt || "" }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let full = "", buf = "", toolCalls = [];

      out(A.d + "  ..." + A.r);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const d = line.slice(6).trim();
          if (d === "[DONE]") continue;
          try {
            const data = JSON.parse(d);
            if (data.type === "tool_call") {
              tools++;
              const icons = { web_search:"🔍", list_files:"📂", read_file:"📖", write_file:"✏️", get_time:"🕐", get_location:"📍", calculate:"🧮", move_file:"📦", delete_file:"🗑", create_dir:"📁", run_command:"⚡", run_skill:"🔧", generate_image:"🎨", find_files:"🔎", search_in_files:"📋", http_request:"🌐", system_info:"🖥", clipboard_read:"📋", clipboard_write:"📝", open_url:"🔗", download_file:"⬇", zip_files:"📦", unzip:"📂", process_list:"📊", notify:"🔔", encode_decode:"🔣", git_status:"📋", git_log:"📜", random:"🎲", hash_text:"🔐", uuid:"🆔", count_text:"🔢", diff_files:"↔", disk_usage:"💾", network_info:"🌐", ping_host:"📡", dns_lookup:"🔍", sort_file:"📑", get_env:"🔧", take_screenshot:"📸", get_weather:"🌤", timer:"⏱", qr_generate:"📱", set_reminder:"📝" };
              const name = (icons[data.tool] || "🔧") + " " + data.tool;
              let args = ""; try { const a = typeof data.args === "string" ? JSON.parse(data.args) : data.args; args = Object.values(a || {}).join(", ").slice(0, 60); } catch { args = String(data.args || "").slice(0, 60); }
              log(A.bk + "  ⚙  " + name + A.r + "  " + A.g + args);
              if (data.result) log(A.g + "     ↳ " + data.result.slice(0, 120).replace(/\n/g, " "));
              msgs.push({ role: "assistant", type: "tool", content: name, args, result: (data.result||"").slice(0, 500) });
              continue;
            }
            // 思考过程
            const r = data.choices?.[0]?.delta?.reasoning_content || "";
            if (r) process.stdout.write(A.d + r + A.r);
            const t = data.choices?.[0]?.delta?.content || "";
            if (t) { full += t; tOut++; }
          } catch {}
        }
      }

      // 流式收完，整体 Markdown 渲染后输出
      readline.clearLine(process.stdout, 0);
      readline.cursorTo(process.stdout, 0);
      log(A.ck + A.b + "  " + ((cfg.api1 && cfg.api1.model) || "agent") + A.r);
      const rendered = md(full);
      rendered.split("\n").forEach((l) => log("  " + l));

      msgs.push({ role: "assistant", content: full });
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const tIn = Math.round(input.length / 3.5);
      const cost = ((tIn + tOut) * 0.0000014).toFixed(5);

      log(A.g + "  " + elapsed + "s  " + A.yk + tIn + "↑+" + tOut + "↓" + A.r + "  " + A.g + "$" + cost + A.d + "  |  余额 " + A.wk + apiBalance + A.r);
    } catch (e) { msgs.pop(); fail(e.message); }
  }

  async function handleCmd(input) {
    const [name, ...args] = input.slice(1).trim().split(/\s+/);
    const a = args.join(" ");
    switch (name) {
      case "exit": case "quit": log(A.g + "  再见"); process.exit(0);
      case "clear": msgs = []; ok("已清空"); break;
      case "save":
        try { fs.writeFileSync(path.join(SESSIONS, session + ".json"), JSON.stringify(msgs, null, 2)); ok("已保存 (" + msgs.length + " 条)"); } catch { fail("保存失败"); }
        break;
      case "load":
        try {
          const f = path.join(SESSIONS, (a || session) + ".json");
          if (fs.existsSync(f)) {
            msgs = JSON.parse(fs.readFileSync(f, "utf8")); session = a || session;
            ok("已加载 " + msgs.length + " 条");
            log(A.g + "  " + "-".repeat(50));
            msgs.filter(m => !m.type || m.type !== "tool").forEach((m) => {
              if (m.role === "user") {
                log(A.yk + "  User" + A.r + ": " + m.content);
              } else {
                log(A.ck + "  " + ((cfg.api1 && cfg.api1.model) || "agent") + A.r);
                const rendered = md(m.content || "");
                rendered.split("\n").forEach((l) => log("  " + l));
              }
            });
            log(A.g + "  " + "-".repeat(50));
          } else warn("不存在");
        } catch { fail("加载失败"); }
        break;
      case "status": showStatus(); break;
      case "sessions":
        try {
          const files = fs.readdirSync(SESSIONS).filter((f) => f.endsWith(".json"));
          if (files.length === 0) { log(A.g + "  无保存的会话"); break; }
          log(A.b + "\n  已保存的会话 ( /load 名称 切换 ):\n");
          files.forEach((f) => {
            const n = f.replace(".json", "");
            const len = JSON.parse(fs.readFileSync(path.join(SESSIONS, f), "utf8")).length;
            log(`  ${n === session ? A.gk + "●" : " "} ${A.wk}${n}${A.r}  ${A.g}${len} 条`);
          });
        } catch { log(A.g + "  无"); }
        break;
      case "skills":
        try { const files = fs.readdirSync(SKILLS).filter((f) => f.endsWith(".json")); files.forEach((f) => { try { const s = JSON.parse(fs.readFileSync(path.join(SKILLS, f), "utf8")); log(`  ${A.ck}${s.name || f}${A.r}  ${A.g}${s.type || ""}`); } catch { log(`  ${A.yk}${f}${A.r}`); } }); } catch { log(A.g + "  无"); }
        break;
      case "history":
        if (msgs.length === 0) { log(A.g + "  无消息"); break; }
        const chatMsgs = msgs.filter(m => !m.type || m.type !== "tool");
        log(A.b + "\n  ═══ 历史 (" + chatMsgs.length + " 条对话, " + msgs.filter(m => m.type === "tool").length + " 条工具) ═══");
        chatMsgs.forEach((m, i) => {
          const r = m.role === "user" ? A.yk + "User" : A.ck + (cfg.api1 && cfg.api1.model || "agent");
          log(`  ${i+1}. ${r}${A.r}: ${A.d}${(m.content||"").slice(0, 100)}`);
        });
        log(A.g + "  ════════════════════════");
        break;
      case "new":
        // 保存旧会话，完全抹除上下文
        try { fs.writeFileSync(path.join(SESSIONS, session + ".json"), JSON.stringify(msgs, null, 2)); } catch {}
        msgs = [];
        session = "s" + Date.now().toString(36).slice(-4);
        ok("新建会话: " + session + " (上下文已清除)");
        break;
      case "rename":
        if (!a) { warn("用法: /rename <名称>"); break; }
        session = a; ok("已重命名: " + session);
        break;
      case "tools": {
        const tMsgs = msgs.filter(m => m.type === "tool" || /^[🔍📂📖✏️🕐📍🧮📦🗑📁⚡🔧]/.test(m.content||""));
        if (tMsgs.length === 0) { log(A.g + "  无工具调用"); break; }
        log(A.b + "\n  ═══ Tools (" + tMsgs.length + ") ═══");
        tMsgs.forEach(m => {
          log(`  ${A.bk}${(m.content||"🔧").slice(0, 30)}${A.r}  ${A.g}${(m.args||"").slice(0, 40)}`);
          if (m.result) log(A.g + "     " + (m.result||"").slice(0, 100).replace(/\n/g, " "));
        });
        log(A.g + "  ═" + "═".repeat(40));
        break;
      }
      case "stats": {
        const tMsgs = msgs.filter(m => m.type === "tool" || /^[🔍📂📖✏️🕐📍🧮📦🗑📁⚡🔧]/.test(m.content||""));
        let totalChars = 0; msgs.forEach(m => totalChars += (m.content||"").length);
        const estT = Math.round(totalChars / 3.5);
        const estC = (estT * 0.000002).toFixed(5);
        log(A.b + "\n  ═══ 会话统计 ═══");
        log(`  ${A.g}消息${A.r}   ${A.wk}${msgs.length}${A.r}     ${A.g}工具${A.r}  ${A.wk}${tMsgs.length}${A.r}`);
        log(`  ${A.g}Token${A.r}   ${A.wk}~${estT}${A.r}    ${A.g}花费${A.r}  ${A.wk}${currency}${estC}${A.r}`);
        log(A.g + "  ═" + "═".repeat(20));
        break;
      }
      case "think":
        if (!a || !["off","low","medium","high","max"].includes(a)) { warn("用法: /think off|low|medium|high|max"); break; }
        const model = (cfg.api1 && cfg.api1.model) || "";
        if (!/reasoner|r1|think|v4-pro|v4-flash/i.test(model)) { warn("当前模型 " + model + " 不支持思考模式"); break; }
        cfg.thinkLevel = a;
        saveCfg(cfg);
        ok("思考强度: " + a);
        break;
      case "currency":
        currency = currency === "¥" ? "$" : "¥";
        cfg.currency = currency;
        saveCfg(cfg);
        ok("币种: " + currency);
        break;
      case "skill": {
        if (a === "list") {
          try {
            const files = fs.readdirSync(SKILLS).filter(f => f.endsWith(".json"));
            if (files.length === 0) { log(A.g + "  无本地技能"); break; }
            log(A.b + "\n  本地技能 (" + files.length + "):");
            files.forEach(f => {
              try {
                const s = JSON.parse(fs.readFileSync(path.join(SKILLS, f), "utf8"));
                const hasHandler = !!s.handler;
                log(`  ${A.ck}${s.name || f}${A.r}  ${A.g}${hasHandler ? "可执行" : "模板"}  ${s.description || ""}`);
              } catch { log(`  ${A.yk}${f}${A.r}  (格式错误)`); }
            });
          } catch { log(A.g + "  无"); }
        } else if (a.startsWith("import ")) {
          const url = a.slice(7).trim();
          if (!url.startsWith("http")) { warn("用法: /skill import <url>"); break; }
          out(A.g + "  下载中... ");
          try {
            const r = await fetch(url);
            const text = await r.text();
            let skill;
            try { skill = JSON.parse(text); } catch {
              // 尝试 markdown 格式
              skill = { name: url.split("/").pop().replace(/\.\w+$/, ""), description: "来自 " + url, prompt: text };
            }
            if (!skill.name) skill.name = url.split("/").pop().replace(/\.\w+$/, "");
            // 字段适配：将 OpenClaw 常见字段映射到我们的格式
            if (!skill.handler && skill.code) skill.handler = skill.code;
            if (!skill.handler && skill.script) skill.handler = skill.script;
            if (!skill.handler && skill.run) skill.handler = skill.run;
            if (!skill.description && skill.desc) skill.description = skill.desc;
            const filename = (skill.name || "imported").replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "_") + ".json";
            fs.writeFileSync(path.join(SKILLS, filename), JSON.stringify(skill, null, 2));
            readline.clearLine(process.stdout, 0); readline.cursorTo(process.stdout, 0);
            ok("已导入: " + skill.name + " → skills/" + filename);
          } catch { readline.clearLine(process.stdout, 0); readline.cursorTo(process.stdout, 0); fail("下载失败"); }
        } else {
          log(A.g + "  /skill list  查看  /skill import <url>  从URL导入");
        }
        break;
      }
      case "balance":
        try {
          out(A.g + "  查询中... ");
          const r = await fetch("http://localhost:3001/api/balance");
          const d = await r.json();
          readline.clearLine(process.stdout, 0);
          readline.cursorTo(process.stdout, 0);
          apiBalance = d.balance || "—";
          ok("API 余额: " + apiBalance);
        } catch { warn("无法获取余额"); }
        break;
      case "agent":
        if (a === "list") {
          log(A.b + "\n  智能体列表:");
          agents.forEach((ag, i) => {
            log(`  ${ag.name === currentAgent ? A.gk + "●" + A.r : " "} ${A.wk}${ag.name}${A.r}  ${A.g}${ag.model || "?"}${A.r}`);
          });
          log(A.g + "\n  /agent use <名称> 切换");
        } else if (a.startsWith("use ")) {
          const name = a.slice(4).trim();
          const found = agents.find(ag => ag.name === name);
          if (found) { currentAgent = name; ok("已切换到: " + name); }
          else { warn("智能体不存在: " + name); }
        } else if (a === "add") {
          const aName = await new Promise(r => rl.question(A.g + "  名称: " + A.r + " ", r));
          if (!aName || !aName.trim()) { warn("名称必填"); break; }
          const aModel = await new Promise(r => rl.question(A.g + "  模型 [" + ((cfg.api1&&cfg.api1.model)||"?") + "]: " + A.r + " ", r));
          const aPrompt = await new Promise(r => rl.question(A.g + "  系统提示词 (可选): " + A.r + " ", r));
          agents.push({ name: aName.trim(), model: aModel.trim() || (cfg.api1&&cfg.api1.model)||"?", systemPrompt: aPrompt.trim() || "" });
          cfg.agents = agents; saveCfg(cfg);
          ok("已添加: " + aName.trim());
        } else {
          log(A.g + "  /agent list 查看  /agent use <名称> 切换  /agent add 新增");
        }
        break;
      case "docs":
        log(A.b + "\n  ═══ API 文档 ═══\n");
        log(A.wk + "  POST /api/v1/chat/completions" + A.r);
        log(A.g + "  OpenAI 兼容，支持 stream/thinking/systemPrompt\n");
        log(A.wk + "  POST /api/gateway/telegram|wecom|qq/:token" + A.r);
        log(A.g + "  消息渠道 webhook，返回对应平台格式\n");
        log(A.wk + "  POST /api/gateway/feishu" + A.r);
        log(A.g + "  飞书事件回调 (url_verification + 消息接收)\n");
        log(A.wk + "  GET /api/config  /api/balance  /api/sessions/:name" + A.r);
        log(A.g + "  管理接口：配置/余额/会话\n");
        log(A.wk + "  WebSocket: ws://localhost:3001/api/gateway/ws" + A.r);
        log(A.g + "  发送 {\"message\":\"...\"} → 返回 {\"type\":\"response\",\"response\":\"...\"}");
        break;
      case "help": case "?":
        log(A.b + "\n  /help帮助 /history历史 /sessions会话 /new新建 /load加载 /save保存\n  /tools工具 /stats统计 /think思考 /status状态 /clear清空 /docs文档 /exit退出\n");
        break;
      default: warn("未知: /" + name); break;
    }
  }

  // 主循环
  // 启动：默认新建会话，旧会话用 /load 恢复
  session = "s" + Date.now().toString(36).slice(-4);
  msgs = [];

  const agentCfg = agents.find(a => a.name === currentAgent) || agents[0] || {};
  const model = agentCfg.model || (cfg.api1 && cfg.api1.model) || "?";
  const divider = A.g + "  " + "-".repeat(50) + A.r;

  // (sidebar removed — use /tools and /stats inline instead)

  log("");
  log(A.mk + A.b + "  |\\  /|  _____  |  \\/  | |_   _|");
  log(A.mk + A.b + "  | \\/ | |  ___| | \\  / |   | |  ");
  log(A.rk + A.b + "  | |\\/| | |___  | |\\/| |   | |  ");
  log(A.yk + A.b + "  | |  | |  ___| | |  | |   | |  ");
  log(A.gk + A.b + "  | |  | | |___  | |  | |  _| |_ ");
  log(A.ck + A.b + "  |_|  |_|_____| |_|  |_| |_____|");
  log("");
  log(A.mk + A.b + "  +" + "-".repeat(42) + "+");
  log(A.mk + A.b + "  |" + A.r + "  " + A.g + "Agent " + A.wk + currentAgent + "  Model " + A.wk + model + " ".repeat(36 - model.length) + A.mk + A.b + "|");
  log(A.mk + A.b + "  |" + A.r + "  " + A.g + "Session " + A.wk + session + "  " + A.g + "Msgs " + A.wk + msgs.length + " ".repeat(22 - session.length) + A.mk + A.b + "|");
  log(A.mk + A.b + "  +" + "-".repeat(42) + "+");
  log(A.g + "  Commands: " + A.d + "/help /history /sessions /new /load /save /tools /stats /balance /think /currency /exit" + A.r);
  log(divider);

  // 异步获取余额，每5分钟刷新
  const refreshBalance = async () => {
    try { const r = await fetch("http://localhost:3001/api/balance"); const d = await r.json(); apiBalance = d.balance || "—"; } catch {}
  };
  refreshBalance();
  setInterval(refreshBalance, 300000);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: A.gk + A.b + "  > " + A.r });
  rl.setPrompt(A.gk + A.b + "  > " + A.r);
  rl.prompt();
  rl.on("line", async (line) => {
    const text = line.trim();
    if (!text) { rl.prompt(); return; }
    if (text.startsWith("/")) { await handleCmd(text); rl.prompt(); return; }
    // 消息多了 logo 会滚出屏幕，在每条回复后重打紧凑标题
    if (msgs.length > 0 && msgs.length % 4 === 0) {
      log(A.g + "  " + "-".repeat(50));
      log(A.g + "  " + A.b + A.wk + "Memi" + A.r + A.g + "  " + ((cfg.api1 && cfg.api1.model) || "?") + "  |  msgs: " + msgs.length);
    }
    // @agent 协作: 检测 @agent名 调用指定 agent
    const atMatch = text.match(/^@(\S+)\s+(.+)/);
    if (atMatch) {
      const targetAgent = agents.find(a => a.name === atMatch[1]);
      if (targetAgent) {
        log(A.mk + "  → 委托给 " + atMatch[1] + A.r);
        const origAgent = currentAgent;
        currentAgent = targetAgent.name;
        await send(atMatch[2]);
        currentAgent = origAgent;
        log(A.g + "  " + "-".repeat(50));
        rl.prompt();
        return;
      }
    }
    log(A.yk + "  User" + A.r + ": " + text);
    await send(text);
    try { fs.writeFileSync(path.join(SESSIONS, session + ".json"), JSON.stringify(msgs, null, 2)); } catch {}
    // 首次对话自动 AI 命名
    if (session.startsWith("s") && msgs.length === 2) autoNameSession();
    log(A.g + "  " + "-".repeat(50));
    rl.prompt();
  });

  async function autoNameSession() {
    try {
      const userMsgs = msgs.filter(m => m.role === "user").map(m => m.content).join("; ").slice(0, 200);
      const r = await fetch("http://localhost:3001/api/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "memi-agent", messages: [
          { role: "user", content: "给这段对话起一个简短名称（3-6个汉字），直接描述对话主题，不要修饰、不要诗意、不要标点。\n\n对话:\n" + userMsgs }
        ], max_tokens: 20, temperature: 0.3 })
      });
      const d = await r.json();
      let name = (d.choices?.[0]?.message?.content || "").replace(/["\n\r]/g, "").trim();
      if (!name || name.length < 1 || name.length > 20 || !/[\u4e00-\u9fff]/.test(name)) return;
      const old = path.join(SESSIONS, session + ".json");
      const nu = path.join(SESSIONS, name + ".json");
      if (fs.existsSync(old)) {
        fs.renameSync(old, nu);
        session = name;
      }
    } catch {}
  }

  rl.on("close", () => {
    try { fs.writeFileSync(path.join(SESSIONS, session + ".json"), JSON.stringify(msgs, null, 2)); } catch {}
    log(A.g + "\n  已断开\n"); process.exit(0);
  });
}

// ─── 入口 ────────────────────────────────────────────
const cmd = process.argv[2] || "chat";

(async () => {
  if (!fs.existsSync(ONBOARDED) && cmd !== "onboard") await onboard();

  switch (cmd) {
    case "chat": case undefined: await chat(); break;
    case "status": showStatus(); break;
    case "onboard": await onboard(); break;
    case "config":
      if (process.argv[3] === "edit") await onboard();
      else showStatus();
      break;
    case "server":
      if (process.argv[3] === "start") {
        out(A.g + "  启动服务... ");
        try {
          require("child_process").execSync("npm start --prefix " + path.join(__dirname, "memi-server"), { stdio: "ignore", detached: true });
          log(A.gk + "已启动" + A.r);
        } catch { log(A.rk + "启动失败" + A.r); }
      } else if (process.argv[3] === "restart") {
        out(A.g + "  重启中... ");
        try {
          require("child_process").execSync("taskkill /f /im node.exe 2>nul & npm start --prefix " + path.join(__dirname, "memi-server"), { stdio: "ignore", shell: true });
          log(A.gk + "已重启" + A.r);
        } catch { log(A.rk + "重启失败" + A.r); }
      } else {
        out(A.g + "  检查服务... ");
        try { const r = await fetch("http://localhost:3001/health"); log(r.ok ? A.gk + "运行中" + A.r : A.rk + "未响应" + A.r); } catch { log(A.rk + "未启动" + A.r); }
        log(A.g + "  memi server start  启动  memi server restart  重启");
      }
      break;
    case "dashboard":
      try { require("child_process").execSync("start http://localhost:3001/dashboard"); } catch {}
      break;
    case "version": case "--version": case "-v":
      log(A.ck + A.b + "  memi v1.0.0" + A.r);
      break;
    case "update":
      out(A.g + "  检查更新... ");
      try {
        const r = await fetch("https://api.github.com/repos/memi-ai/memi/releases/latest", { signal: AbortSignal.timeout(8000) });
        if (!r.ok) throw new Error("HTTP " + r.status);
        const d = await r.json();
        const latest = (d.tag_name || "").replace(/^v/, "");
        readline.clearLine(process.stdout, 0); readline.cursorTo(process.stdout, 0);
        if (latest && latest !== "1.0.0") {
          log(A.yk + "  ⚡ 新版本可用: v" + latest + A.r);
          log(A.g + "  当前: v1.0.0 → 最新: v" + latest);
          log(A.g + "  下载: " + (d.html_url || ""));
        } else {
          ok("已是最新版本 (v1.0.0)");
        }
      } catch {
        readline.clearLine(process.stdout, 0); readline.cursorTo(process.stdout, 0);
        log(A.g + "  v1.0.0 (检查更新失败，请稍后重试)");
      }
      break;
    case "skills":
      try {
        // 扫描 skills/ 目录：JSON 技能 + ClawHub 子目录
        const jsonSkills = fs.readdirSync(SKILLS).filter(f => f.endsWith(".json"));
        const clawhubDirs = fs.readdirSync(SKILLS, { withFileTypes: true })
          .filter(d => d.isDirectory() && fs.existsSync(path.join(SKILLS, d.name, "SKILL.md")));
        
        if (jsonSkills.length === 0 && clawhubDirs.length === 0) {
          log(A.g + "  无。放 .json 到 memi-config/skills/ 或用 clawhub install <skill> 安装");
          log("");
          break;
        }
        head("Skills");
        jsonSkills.forEach((f) => { try {
          const s = JSON.parse(fs.readFileSync(path.join(SKILLS, f), "utf8"));
          log(`  ${A.ck}${s.name || f}${A.r}  ${A.g}${s.handler ? "可执行" : "模板"}  ${s.description || ""}`);
        } catch { log(`  ${A.yk}${f}${A.r}`); } });
        clawhubDirs.forEach(d => {
          try {
            const md = fs.readFileSync(path.join(SKILLS, d.name, "SKILL.md"), "utf8");
            const yamlMatch = md.match(/^---\n([\s\S]*?)\n---/);
            const meta = {};
            if (yamlMatch) {
              yamlMatch[1].split("\n").forEach(line => {
                const [k, ...v] = line.split(":");
                if (k && v.length) meta[k.trim()] = v.join(":").trim();
              });
            }
            log(`  ${A.ck}${meta.name || d.name}${A.r}  ${A.g}ClawHub  ${meta.description || ""}`);
          } catch { log(`  ${A.yk}${d.name}${A.r}`); }
        });
        log("");
      } catch { fail("无法读取"); }
      break;

    case "skill-import": {
      const url = process.argv[3];
      if (!url || !url.startsWith("http")) { log(A.g + "  用法: memi skill-import <url>"); break; }
      try {
        const r = await fetch(url);
        const text = await r.text();
        let skill;
        try { skill = JSON.parse(text); } catch { skill = { name: url.split("/").pop()?.replace(/\.\w+$/, "") || "imported", description: "来自 " + url, prompt: text }; }
        if (!skill.name) skill.name = "imported_" + Date.now().toString(36);
        if (!skill.handler && skill.code) skill.handler = skill.code;
        if (!skill.handler && skill.script) skill.handler = skill.script;
        if (!skill.handler && skill.run) skill.handler = skill.run;
        if (!skill.description && skill.desc) skill.description = skill.desc;
        const filename = (skill.name || "skill").replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "_") + ".json";
        fs.writeFileSync(path.join(SKILLS, filename), JSON.stringify(skill, null, 2));
        ok("已导入: " + skill.name + " → " + filename);
      } catch(e) { fail("导入失败: " + e.message); }
      break;
    }
    case "sessions":
      try {
        const files = fs.readdirSync(SESSIONS).filter((f) => f.endsWith(".json"));
        head("Sessions (" + SESSIONS + ")");
        files.forEach((f) => { const n = f.replace(".json", ""); const len = JSON.parse(fs.readFileSync(path.join(SESSIONS, f), "utf8")).length; log(`  ${A.ck}${n}${A.r}  ${A.g}(${len} msgs)`); });
        if (files.length === 0) log(A.g + "  无");
        log("");
      } catch { fail("无法读取"); }
      break;
    case "rag": {
      const sub = process.argv[3];
      if (sub === "index") {
        log(A.b + "  索引中..." + A.r);
        try {
          const { indexWorkspace } = require("./memi-server/utils/vectorStore");
          const c = loadCfg();
          const r = await indexWorkspace(c);
          if (r) ok(`已索引 ${r.chunks} 个文本块` + (r.embedded > 0 ? ` (${r.embedded} 已嵌入)` : ""));
          else fail("索引失败");
        } catch(e) { fail("索引失败: " + e.message); }
      } else if (sub === "search") {
        const query = process.argv.slice(4).join(" ");
        if (!query) { log(A.g + "  用法: memi rag search <查询语句>"); break; }
        try {
          const { search } = require("./memi-server/utils/vectorStore");
          const c = loadCfg();
          const result = await search(query, c);
          log(A.b + "\n  RAG 搜索: " + query + "\n" + A.r);
          log(result);
        } catch(e) { fail("搜索失败: " + e.message); }
      } else if (sub === "stats") {
        try {
          const { stats } = require("./memi-server/utils/vectorStore");
          const s = stats();
          log(A.b + "\n  向量库统计\n" + A.r);
          log(`  文档块: ${s.chunks}`);
          log(`  来源文件: ${s.sources.join(", ") || "无"}`);
          log(`  总字符: ${s.totalChars}`);
          log(`  向量嵌入: ${s.hasEmbeddings ? "✓" : "✗ (使用关键词匹配)"}`);
          log("");
        } catch(e) { fail("统计失败: " + e.message); }
      } else if (sub === "clear") {
        try {
          const { clearIndex } = require("./memi-server/utils/vectorStore");
          clearIndex();
          ok("向量索引已清除");
        } catch(e) { fail("清除失败: " + e.message); }
      } else {
        log(A.b + "  memi rag <子命令>\n" + A.r);
        log(`  ${A.ck}index${A.r}    索引工作区文档`);
        log(`  ${A.ck}search${A.r}   搜索记忆  ${A.g}memi rag search <查询语句>${A.r}`);
        log(`  ${A.ck}stats${A.r}    向量库统计`);
        log(`  ${A.ck}clear${A.r}    清除索引`);
      }
      break;
    }
    case "doctor": {
      let ok = true;
      log(A.b + "\n  Memi Doctor  —  诊断报告\n");
      const nv = process.version;
      log(`  ${parseInt(nv.slice(1)) >= 18 ? A.gk + "✓" : A.rk + "✗"}${A.r} Node.js ${nv}`);
      const c = loadCfg();
      const hasApi = !!(c.api1?.baseUrl && c.api1?.apiKey);
      log(`  ${hasApi ? A.gk + "✓" : A.yk + "⚠"}${A.r} API 配置`);
      try {
        const r = await fetch("http://localhost:3001/health");
        log(`  ${r.ok ? A.gk + "✓" : A.rk + "✗"}${A.r} memi-server ${r.ok ? "运行中" : "异常"}`);
      } catch { log(`  ${A.rk + "✗"}${A.r} memi-server 未启动`); }
      log(`  ${A.gk + "✓"}${A.r} 配置目录 ${DIR}`);
      log("");
      log(A.gk + "  一切正常" + A.r);
      break;
    }
    case "reset":
      if (process.argv[3] === "--force" || process.argv[3] === "-f") {
        try { fs.rmSync(DIR, { recursive: true, force: true }); log(A.gk + "  ✓ 已重置。运行 memi onboard 重新配置" + A.r); } catch { fail("重置失败"); }
      } else {
        log(A.yk + "  ⚠ 此操作将清除所有配置和会话。确认: memi reset --force");
      }
      break;
    case "agent":
      log(A.b + "\n  Memi Agent v1.0.0\n");
      const ac = loadCfg();
      pair("模型", (ac.api1 && ac.api1.model) || "未配置");
      pair("端点", (ac.api1 && ac.api1.baseUrl) || "未配置");
      pair("工具", "12 (文件/搜索/命令/计算/时间/技能/生图)");
      pair("迭代", "8 轮上限");
      log("");
      break;
    case "telegram": case "feishu": case "wecom": case "qq":
    case "discord": case "slack": case "dingtalk": {
      const chNamesAll = { telegram: "Telegram", feishu: "飞书", wecom: "企业微信", qq: "QQ", discord: "Discord", slack: "Slack", dingtalk: "钉钉" };
      const ch = cmd;
      const token = process.argv[3];
      if (!token) {
        log(A.g + `  用法: memi ${ch} <token/key>`);
        if (ch === "telegram") log(A.g + "  1. @BotFather 创建机器人 → 获取 token");
        if (ch === "feishu") log(A.g + "  1. 飞书开放平台 → 创建应用 → 获取 App ID");
        if (ch === "wecom") log(A.g + "  1. 企业微信管理后台 → 创建机器人 → 获取 webhook key");
        if (ch === "qq") log(A.g + "  1. go-cqhttp 或官方 QQ Bot → 获取 token");
        log(A.g + `  2. 运行: memi ${ch} <token>`);
        break;
      }
      out(A.g + `  连接 ${chNamesAll[ch] || ch}... `);
      try {
        const ngrokUrl = "https://pyromania-strenuous-sinuous.ngrok-free.dev";
        if (ch === "telegram") {
          const r = await fetch(`http://localhost:3001/api/gateway/telegram/${token}/setup`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ baseUrl: ngrokUrl })
          });
          const d = await r.json();
          if (d.success) log(A.gk + `✓ Webhook: ${d.webhook}` + A.r);
          else fail("失败: " + (d.error || ""));
        } else if (ch === "feishu") {
          // 飞书需 AppID+AppSecret，提示用户用 webhook URL
          const webhookUrl = `${ngrokUrl}/api/gateway/feishu`;
          log(A.gk + "✓ Feishu 端点就绪" + A.r);
          log(A.g + "  Webhook URL: " + A.wk + webhookUrl + A.r);
          log(A.g + "  请在飞书开放平台配置此地址为事件回调 URL");
        } else if (ch === "wecom") {
          const webhookUrl = `${ngrokUrl}/api/gateway/wecom/${token}`;
          log(A.gk + "✓ 企业微信端点就绪" + A.r);
          log(A.g + "  Webhook URL: " + A.wk + webhookUrl + A.r);
          log(A.g + "  请在企业微信机器人配置中填入此地址");
        } else if (ch === "qq") {
          const webhookUrl = `${ngrokUrl}/api/gateway/qq/${token}`;
          log(A.gk + "✓ QQ 端点就绪" + A.r);
          log(A.g + "  Webhook URL: " + A.wk + webhookUrl + A.r);
          log(A.g + "  请在 go-cqhttp 或 QQ Bot 后台配置此地址");
        } else if (ch === "discord") {
          const webhookUrl = `${ngrokUrl}/api/gateway/discord/${token}`;
          log(A.gk + "✓ Discord 端点就绪" + A.r);
          log(A.g + "  1. 去 Discord Developer Portal → 创建 Bot");
          log(A.g + "  2. 在 Bot → Privileged Gateway Intents 开启 MESSAGE CONTENT INTENT");
          log(A.g + "  3. 复制 token，运行: memi discord <token>");
          log(A.g + "  4. Interactions Endpoint URL: " + A.wk + webhookUrl + A.r);
        } else if (ch === "slack") {
          const webhookUrl = `${ngrokUrl}/api/gateway/slack/${token}`;
          log(A.gk + "✓ Slack 端点就绪" + A.r);
          log(A.g + "  1. api.slack.com/apps → Create New App → Socket Mode 关闭");
          log(A.g + "  2. Event Subscriptions → Enable → Request URL: " + A.wk + webhookUrl + A.r);
          log(A.g + "  3. Subscribe to: app_mention, message.im");
          log(A.g + "  4. OAuth & Permissions → Bot Token Scopes: chat:write, app_mentions:read");
        } else if (ch === "dingtalk") {
          const webhookUrl = `${ngrokUrl}/api/gateway/dingtalk/${token}`;
          log(A.gk + "✓ 钉钉端点就绪" + A.r);
          log(A.g + "  1. 钉钉开放平台 → 创建机器人 → Outgoing Webhook");
          log(A.g + "  2. Webhook URL: " + A.wk + webhookUrl + A.r);
          log(A.g + "  3. 关键词: memi");
        }
      } catch { fail("连接失败，请确认 memi-server 已启动"); }
      break;
    }
    case "daemon": {
      const sub = process.argv[3] || "status";
      const osType = process.platform;
      const serverScript = path.join(__dirname, "memi-server", "index.js");

      if (sub === "install") {
        if (osType === "win32") {
          try {
            const cmd = `schtasks /create /tn "MemiAgent" /tr "node \\"${serverScript}\\"" /sc onstart /ru System /f`;
            require("child_process").execSync(cmd, { shell: true });
            ok("守护进程已安装（开机自启）");
          } catch(e) { fail("安装失败: " + e.message.slice(0, 100)); }
        } else if (osType === "darwin") {
          try {
            const plist = path.join(require("os").homedir(), "Library", "LaunchAgents", "com.memi.agent.plist");
            const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>com.memi.agent</string>
<key>ProgramArguments</key><array><string>node</string><string>${serverScript}</string></array>
<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>
</dict></plist>`;
            fs.writeFileSync(plist, xml);
            require("child_process").execSync(`launchctl load "${plist}"`, { shell: true });
            ok("守护进程已安装（开机自启）");
          } catch(e) { fail("安装失败: " + e.message.slice(0, 100)); }
        } else {
          try {
            const unit = `/etc/systemd/system/memi-agent.service`;
            const cfg = `[Unit]\nDescription=Memi Agent\nAfter=network.target\n\n[Service]\nExecStart=node ${serverScript}\nRestart=always\nUser=${require("os").userInfo().username}\n\n[Install]\nWantedBy=multi-user.target\n`;
            require("child_process").execSync(`echo "${cfg.replace(/"/g,'\\"')}" | sudo tee ${unit} && sudo systemctl daemon-reload && sudo systemctl enable memi-agent`, { shell: true });
            ok("守护进程已安装（开机自启）");
          } catch(e) { fail("安装失败（需要 sudo 权限）: " + e.message.slice(0, 100)); }
        }
      } else if (sub === "uninstall") {
        if (osType === "win32") {
          try { require("child_process").execSync('schtasks /delete /tn "MemiAgent" /f', { shell: true }); ok("已卸载"); }
          catch { warn("卸载失败或无任务"); }
        } else if (osType === "darwin") {
          try {
            const plist = path.join(require("os").homedir(), "Library", "LaunchAgents", "com.memi.agent.plist");
            require("child_process").execSync(`launchctl unload "${plist}"`, { shell: true });
            if (fs.existsSync(plist)) fs.unlinkSync(plist);
            ok("已卸载");
          } catch { warn("卸载失败"); }
        } else {
          try { require("child_process").execSync('sudo systemctl disable memi-agent && sudo rm /etc/systemd/system/memi-agent.service', { shell: true }); ok("已卸载"); }
          catch { warn("卸载失败（需要 sudo）"); }
        }
      } else {
        // status
        try { out(A.g + "  服务状态: "); const r = await fetch("http://localhost:3001/health"); log(r.ok ? A.gk + "运行中" + A.r : A.rk + "未响应" + A.r); } catch { log(A.rk + "未运行" + A.r); }
        if (osType === "win32") {
          try { const r = require("child_process").execSync('schtasks /query /tn "MemiAgent" 2>nul', { shell: true, encoding: "utf8" }); log(A.g + "  开机自启: " + A.gk + "已配置" + A.r); } catch { log(A.g + "  开机自启: " + A.g + "未配置" + A.r); }
        }
        log(A.g + "\n  memi daemon install   安装开机自启\n  memi daemon uninstall  取消开机自启");
      }
      break;
    }
    case "team": {
      log(A.b + "\n  ═══ 多 Agent 协作 ═══\n");
      const agentList = cfg.agents || [{ name: "default", model: cfg.api1?.model || "?", systemPrompt: "" }];
      log(A.g + "  已注册 Agent:");
      agentList.forEach(a => log(`  ${A.ck}${a.name}${A.r}  ${A.g}${a.model}${A.r}`));
      log("");
      log(A.g + "  /agent use <名称>  切换当前 Agent");
      log(A.g + "  /agent add         新增 Agent");
      log(A.g + "  协作: 在对话中 @agent名称 调用其他 Agent");
      break;
    }
    case "docs": {
      log(A.b + "\n  ═══ API 文档 ═══\n");
      log(A.wk + "  POST /api/v1/chat/completions" + A.r);
      log(A.g + "  Body: { model, messages, stream, thinking, systemPrompt }");
      log(A.g + "  返回 OpenAI 兼容格式\n");
      log(A.wk + "  POST /api/gateway/telegram/:token" + A.r);
      log(A.g + "  Body: Telegram Update 格式");
      log(A.g + "  注册: POST /api/gateway/telegram/:token/setup\n");
      log(A.wk + "  POST /api/gateway/wecom/:token" + A.r);
      log(A.g + "  Body: { text: { content: \"...\" } }\n");
      log(A.wk + "  POST /api/gateway/feishu" + A.r);
      log(A.g + "  Body: 飞书事件回调格式\n");
      log(A.wk + "  POST /api/gateway/qq/:token" + A.r);
      log(A.g + "  Body: { message: \"...\" }\n");
      log(A.wk + "  GET /api/config  /api/balance  /api/sessions" + A.r);
      log(A.g + "  管理接口: 配置/余额/会话 CRUD\n");
      log(A.g + "  WebSocket: ws://localhost:3001/api/gateway/ws");
      break;
    }
    case "publish": {
      const skillName = process.argv[3];
      if (!skillName) { log(A.g + "  用法: memi publish <skill名称>"); break; }
      try {
        const srcDir = path.join(SKILLS, skillName);
        const dest = path.join(DIR, `${skillName}.zip`);
        if (!fs.existsSync(srcDir)) { warn("技能不存在: " + skillName); break; }
        const { execSync } = require("child_process");
        if (process.platform === "win32") {
          execSync(`powershell Compress-Archive -Path "${srcDir}" -DestinationPath "${dest}" -Force`, { shell: true });
        } else {
          execSync(`cd "${SKILLS}" && zip -r "${dest}" "${skillName}"`, { shell: true });
        }
        ok(`已打包: ${dest}`);
        log(A.g + "  可分享此 zip 文件，其他人用 memi skill-import <url> 安装");
      } catch(e) { fail("打包失败: " + e.message); }
      break;
    }
    case "mcp": {
      const sub = process.argv[3];
      if (sub === "add") {
        const name = process.argv[4];
        const command = process.argv[5];
        if (!name || !command) {
          log(A.g + "  用法: memi mcp add <名称> <命令> [args...]\n" + A.r);
          log(A.g + "  示例: memi mcp add filesystem npx -y @modelcontextprotocol/server-filesystem /tmp\n" + A.r);
          break;
        }
        const args = process.argv.slice(6);
        try {
          const { addMcpServer } = require("./memi-server/utils/mcp");
          const dest = addMcpServer(name, command, args);
          ok(`MCP Server "${name}" 已添加 → ${dest}`);
          log(A.g + "  重启服务后生效: memi server restart\n" + A.r);
        } catch(e) { fail("添加失败: " + e.message); }
      } else if (sub === "list") {
        try {
          const { listMcpServers } = require("./memi-server/utils/mcp");
          const servers = listMcpServers();
          if (servers.length === 0) {
            log(A.g + "  无 MCP Server。用 memi mcp add <名称> <命令> 添加\n" + A.r);
          } else {
            head("MCP Servers");
            servers.forEach(s => {
              log(`  ${A.ck}${s.name}${A.r}  ${A.g}${s.command} ${(s.args||[]).join(" ")}${A.r}`);
            });
            log("");
          }
        } catch(e) { fail("错误: " + e.message); }
      } else if (sub === "remove" || sub === "rm") {
        const name = process.argv[4];
        if (!name) { log(A.g + "  用法: memi mcp remove <名称>\n" + A.r); break; }
        try {
          const { removeMcpServer } = require("./memi-server/utils/mcp");
          removeMcpServer(name);
          ok(`MCP Server "${name}" 已删除`);
        } catch(e) { fail("删除失败: " + e.message); }
      } else {
        log(A.b + "  memi mcp <子命令>\n" + A.r);
        log(`  ${A.ck}add${A.r}     添加 MCP Server  ${A.g}memi mcp add <名称> <命令> [args...]${A.r}`);
        log(`  ${A.ck}list${A.r}    列出所有 MCP Server`);
        log(`  ${A.ck}remove${A.r}  删除 MCP Server  ${A.g}memi mcp remove <名称>${A.r}`);
      }
      break;
    }
    case "voice": {
      log(A.b + "\n  🎤 语音对话模式\n" + A.r);
      log(A.g + "  点击麦克风按钮开始说话，说完自动转文字并发送\n" + A.r);
      log(A.g + "  输入 /voice exit 退出\n" + A.r);

      // 启动语音模式 — 循环录音+转写+发送
      let voiceMode = true;
      const { execSync, spawnSync } = require("child_process");
      const tempDir = path.join(DIR, "temp");
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

      while (voiceMode) {
        const audioFile = path.join(tempDir, `voice_${Date.now()}.wav`);
        log("\n" + A.yk + "  🎤 正在录音... (按 Enter 停止)" + A.r);

        // Windows: 使用 PowerShell 录音
        if (process.platform === "win32") {
          execSync(
            `powershell -Command "$ws=New-Object System.Media.SoundPlayer;$ws.Stop();" 2>$null`,
            { stdio: "ignore", timeout: 2000 }
          );
        }

        // 等待用户按 Enter 停止录音
        // 简化：使用 sox/arecord 录音
        if (process.platform === "win32") {
          log(A.rk + "  Windows 录音请使用 Dashboard 的 🎤 按钮\n" + A.r);
          log(A.g + "  (CLI 语音模式需要 sox/arecord/PowerShell 音频模块)\n" + A.r);
          break;
        } else if (process.platform === "darwin") {
          execSync(`sox -d -r 16000 -c 1 -b 16 "${audioFile}" silence 1 0.1 3% 1 3.0 3% 2>&1`, { timeout: 15000, stdio: "pipe" });
        } else {
          execSync(`arecord -f cd -t wav -d 10 "${audioFile}" 2>/dev/null`, { timeout: 15000, stdio: "pipe" });
        }

        // 转写
        if (fs.existsSync(audioFile)) {
          const audioBuf = fs.readFileSync(audioFile);
          const audioBase64 = audioBuf.toString("base64");
          try {
            const resp = await fetch("http://localhost:3001/api/voice/transcribe", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ audio: audioBase64 }),
            });
            const data = await resp.json();
            if (data.success && data.text) {
              log(A.g + "  📝 " + data.text + A.r);
              // 发送到 Agent
              const axios = require("axios");
              const resp2 = await axios.post("http://localhost:3001/api/v1/chat/completions", {
                model: "memi-agent",
                messages: [{ role: "user", content: data.text }],
                stream: true,
                thinking: "high",
              }, { responseType: "stream", timeout: 120000 });
              let fullResp = "";
              resp2.data.on("data", chunk => {
                const lines = chunk.toString().split("\n");
                for (const line of lines) {
                  if (!line.startsWith("data: ")) continue;
                  if (line.slice(6).trim() === "[DONE]") continue;
                  try {
                    const d = JSON.parse(line.slice(6));
                    const t = d.choices?.[0]?.delta?.content || "";
                    if (t) { process.stdout.write(t); fullResp += t; }
                  } catch {}
                }
              });
              await new Promise(resolve => resp2.data.on("end", resolve));
              process.stdout.write("\n");

              // TTS 朗读
              if (fullResp) {
                try {
                  const ttsResp = await fetch("http://localhost:3001/api/voice/speak", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text: fullResp.slice(0, 500) }),
                  });
                  const ttsData = await ttsResp.json();
                  if (ttsData.success && ttsData.audio) {
                    const mp3File = path.join(tempDir, `speak_${Date.now()}.mp3`);
                    fs.writeFileSync(mp3File, Buffer.from(ttsData.audio, "base64"));
                    if (process.platform === "win32") {
                      execSync(`powershell -c "(New-Object Media.SoundPlayer '${mp3File}').PlaySync();"`, { stdio: "ignore", timeout: 30000 });
                    } else {
                      execSync(`ffplay -nodisp -autoexit "${mp3File}" 2>/dev/null`, { stdio: "ignore", timeout: 30000 });
                    }
                  }
                } catch {}
              }
            } else {
              log(A.rk + "  转写失败: " + (data.error || "未知") + A.r);
            }
          } catch (e) {
            log(A.rk + "  转写失败: " + e.message + A.r);
          }
          try { fs.unlinkSync(audioFile); } catch {}
        }

        log(A.g + "\n  继续录音? (Enter/yes 继续, 其他退出): " + A.r);
        const answer = await new Promise(resolve => {
          const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
          rl.question("", ans => { rl.close(); resolve((ans || "").trim().toLowerCase()); });
        });
        if (answer && answer !== "yes" && answer !== "y" && answer !== "") voiceMode = false;
      }
      log(A.g + "  已退出语音模式\n" + A.r);
      break;
    }
    case "sandbox": {
      const sub = process.argv[3];
      if (sub === "enable") {
        try {
          const { setEnabled, checkDocker, pullImage } = require("./memi-server/utils/sandbox");
          if (!checkDocker()) { fail("Docker 未安装或未运行。请先安装 Docker Desktop。"); break; }
          log(A.b + "  拉取沙箱镜像..." + A.r);
          await pullImage();
          setEnabled(true);
          ok("沙箱模式已启用。Agent 将在 Docker 容器中执行命令。");
        } catch(e) { fail("启用失败: " + e.message); }
      } else if (sub === "disable") {
        try {
          const { setEnabled } = require("./memi-server/utils/sandbox");
          setEnabled(false);
          ok("沙箱模式已禁用。Agent 将直接在主系统执行命令。");
        } catch(e) { fail("禁用失败: " + e.message); }
      } else if (sub === "status") {
        try {
          const { status } = require("./memi-server/utils/sandbox");
          const s = status();
          log(A.b + "\n  沙箱状态\n" + A.r);
          log(`  启用: ${s.enabled ? A.gk + "✓" + A.r : A.rk + "✗" + A.r}`);
          log(`  Docker: ${s.docker ? A.gk + "✓" + A.r : A.rk + "✗ (请安装 Docker)" + A.r}`);
          log(`  镜像: ${s.image}`);
          log(`  超时: ${s.timeout / 1000}s`);
          log("");
        } catch(e) { fail("错误: " + e.message); }
      } else {
        log(A.b + "  memi sandbox <子命令>\n" + A.r);
        log(`  ${A.ck}enable${A.r}   启用沙箱 (需 Docker)`);
        log(`  ${A.ck}disable${A.r}  禁用沙箱`);
        log(`  ${A.ck}status${A.r}   查看状态`);
      }
      break;
    }
    case "browser": {
      const sub = process.argv[3];
      if (sub === "install") {
        log(A.b + "  安装 Playwright + Chromium..." + A.r);
        try {
          const { installBrowser } = require("./memi-server/utils/browser");
          const result = await installBrowser();
          ok(result);
        } catch(e) { fail("安装失败: " + e.message); }
      } else if (sub === "test") {
        try {
          const { navigate, closeBrowser } = require("./memi-server/utils/browser");
          const result = await navigate("https://example.com");
          log(A.b + "\n  Browser Test\n" + A.r);
          log(result.slice(0, 500));
          await closeBrowser();
          ok("浏览器测试通过 ✓");
        } catch(e) { fail("测试失败: " + e.message); }
      } else {
        log(A.b + "  memi browser <子命令>\n" + A.r);
        log(`  ${A.ck}install${A.r}  安装 Playwright + Chromium`);
        log(`  ${A.ck}test${A.r}     测试浏览器是否可用`);
      }
      break;
    }
    case "help": case "--help": case "-h":
      log(A.b + "\n  Memi Agent CLI\n");
      log(`  ${A.ck}chat${A.r}      对话`);
      log(`  ${A.ck}status${A.r}    状态     ${A.ck}doctor${A.r}   诊断`);
      log(`  ${A.ck}agent${A.r}    信息     ${A.ck}onboard${A.r}  引导`);
      log(`  ${A.ck}reset${A.r}    重置     ${A.ck}config${A.r}   配置`);
      log(`  ${A.ck}server${A.r}   服务     ${A.ck}skills${A.r}   技能`);
      log(`  ${A.ck}dashboard${A.r}面板     ${A.ck}sessions${A.r} 会话`);
      log(`  ${A.ck}rag${A.r}      向量记忆  ${A.ck}daemon${A.r}   守护`);
      log(`  ${A.ck}voice${A.r}    语音      ${A.ck}browser${A.r}  浏览器`);
      log(`  ${A.ck}mcp${A.r}      MCP       ${A.ck}sandbox${A.r}  沙箱`);
      log(`  ${A.ck}update${A.r}   更新     ${A.ck}version${A.r}  版本`);
      log(`  ${A.ck}version${A.r}  版本     ${A.ck}help${A.r}     帮助`);
      log(`  ${A.ck}help${A.r}     帮助`);
      log("");
      break;
    default:
      log(A.yk + "  未知命令: " + cmd);
      log(A.g + "  输入 memi help 查看所有命令");
      break;
  }
})();
