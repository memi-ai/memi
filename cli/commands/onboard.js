const readline = require("readline");
const fs = require("fs");
const path = require("path");
const { loadCfg, saveCfg, DIR, ROOT, SKILLS, SESSIONS } = require("..");
const { S, log, out, Spinner } = require("../ui");

module.exports = {
  name: "onboard",
  aliases: ["ob"],
  description: "Setup wizard",
  usage: "memi onboard",
  category: "config",
  run: async () => {
    await onboard();
  },
};

async function onboard() {
  log(`\n  ${S.b}${S.mk}${"╔".padEnd(45, "═")}╗${S.r}`);
  log(`  ${S.b}${S.mk}║${S.r}  ${S.b}${S.wk}🦞 Memi Agent · Setup${S.r}${S.g}          v1.0${S.r}${S.b}${S.mk}  ║${S.r}`);
  log(`  ${S.b}${S.mk}╚${"═".padEnd(45, "═")}╝${S.r}\n`);
  log(`  ${S.g}Ctrl+C 任意步骤可退出${S.r}\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q, d, hidden = false) => new Promise((r) => {
    const prompt = `${S.g}  > ${q}${d && !hidden ? ` [${d}]` : ""}: ${S.r}`;
    rl.question(prompt, (a) => { const val = a.trim(); if (hidden && !val) { r(""); return; } r(val || d || ""); });
  });
  const choose = async (q, opts) => {
    if (opts.length <= 10) {
      log(`  ${S.g}${q}${S.r}`);
      opts.forEach((o, i) => log(`    ${S.g}${i+1}.${S.r} ${S.wk}${o}${S.r}`));
      const n = await ask("序号或搜索关键词", "1");
      if (isNaN(parseInt(n))) { const f = opts.filter(o => o.toLowerCase().includes(n.toLowerCase())); if (f.length === 0) return opts[0]; log(`  ${S.g}匹配 ${f.length} 项:${S.r}`); f.forEach((o, i) => log(`    ${S.g}${i+1}.${S.r} ${S.wk}${o}${S.r}`)); const m = await ask("序号", "1"); return f[parseInt(m)-1] || f[0]; }
      return opts[parseInt(n)-1] || opts[0];
    }
    return new Promise((resolve) => {
      const PS = 10;
      let cur = 0, page = 0, input = "", filtered = opts;
      const totalPages = Math.ceil(filtered.length / PS);
      const draw = () => {
        console.clear();
        log(`${S.b}${S.wk}  ${q}${S.r}`);
        log(`${S.d}  ↑↓选择  搜索  数字  Enter确认  Esc取消${S.r}`);
        const start = page * PS;
        const subset = filtered.slice(start, start + PS);
        subset.forEach((o, i) => { const mark = (start + i === cur) ? `${S.b}${S.gkb} ▶${S.r}` : "  "; log(`${mark} ${S.g}${start+i+1}.${S.r} ${S.wk}${o}${S.r}`); });
        if (input) log(`${S.g}  搜索: ${S.wk}${input}${S.r}`);
        log(`${S.d}  [${page+1}/${totalPages}] 第${cur+1}项${S.r}`);
      };
      draw();
      const wasRaw = process.stdin.isRaw;
      process.stdin.setRawMode(true);
      process.stdin.resume();
      const onData = (key) => {
        const s = key.toString();
        if (s === "\u001b[A") { cur = Math.max(0, cur - 1); if (cur < page * PS) { page = Math.max(0, page - 1); cur = page * PS + PS - 1; } draw(); }
        else if (s === "\u001b[B") { cur = Math.min(filtered.length - 1, cur + 1); if (cur >= (page + 1) * PS) { page = Math.min(totalPages - 1, page + 1); cur = page * PS; } draw(); }
        else if (s === "\r" || s === "\n") { if (input && isNaN(parseInt(input))) { filtered = opts.filter(o => o.toLowerCase().includes(input.toLowerCase())); input = ""; cur = 0; page = 0; if (filtered.length === 0) filtered = opts; draw(); return; } const num = parseInt(input) || (cur + 1); cleanup(); process.stdout.write("\n"); resolve(filtered[Math.min(num - 1, filtered.length - 1)] || filtered[0]); }
        else if (s === "\x03") { cleanup(); process.exit(0); }
        else if (s === "\x1b") { const num = parseInt(input); cleanup(); process.stdout.write("\n"); resolve(filtered[num - 1] || filtered[0] || opts[0]); }
        else if (s === "\b" || s === "\x7f") { input = input.slice(0, -1); draw(); }
        else if (s.length === 1 && s >= " ") { input += s; const match = filtered[cur] && filtered[cur].toLowerCase().includes(input.toLowerCase()); if (!match) { filtered = opts.filter(o => o.toLowerCase().includes(input.toLowerCase())); if (filtered.length === 0) { input = input.slice(0, -1); draw(); return; } cur = 0; page = 0; } draw(); }
      };
      const cleanup = () => { process.stdin.removeListener("data", onData); process.stdin.setRawMode(wasRaw); };
      process.stdin.on("data", onData);
    });
  };
  const confirm = async (q) => { const a = await ask(q + " (y/n)", "y"); return a.toLowerCase() === "y"; };

  const providerList = [
    "OpenAI", "Anthropic", "Google Gemini", "Groq", "DeepSeek",
    "OpenRouter", "Together AI", "Perplexity", "Cohere",
    "Mistral AI", "xAI Grok", "Cloudflare Workers AI",
    "阿里云百炼", "智谱 AI", "火山方舟", "Kimi", "硅基流动",
    "讯飞星火", "NVIDIA",
    "Ollama (本地)", "LM Studio (本地)", "自定义",
  ];

  const PROVIDERS = {
    "OpenAI":{url:"https://api.openai.com/v1",models:"gpt-4o,gpt-4o-mini,o1,o3-mini".split(",")},
    "Anthropic":{url:"https://api.anthropic.com/v1",models:"claude-sonnet-4-20250514,claude-3-5-sonnet,claude-3-5-haiku".split(",")},
    "Google Gemini":{url:"https://generativelanguage.googleapis.com/v1beta/openai",models:"gemini-2.5-pro,gemini-2.0-flash".split(",")},
    "Groq":{url:"https://api.groq.com/openai/v1",models:"llama-3.3-70b-versatile,llama-3.1-8b-instant".split(",")},
    "DeepSeek":{url:"https://api.deepseek.com/v1",models:"deepseek-chat,deepseek-reasoner,deepseek-v4-pro,deepseek-v4-flash".split(",")},
    "OpenRouter":{url:"https://openrouter.ai/api/v1",models:"openai/gpt-4o,anthropic/claude-sonnet,google/gemini-flash".split(",")},
    "阿里云百炼":{url:"https://dashscope.aliyuncs.com/compatible-mode/v1",models:"qwen-plus,qwen-max,qwen-turbo".split(",")},
    "智谱 AI":{url:"https://open.bigmodel.cn/api/paas/v4",models:"glm-4-flash,glm-4-plus,glm-4-air".split(",")},
    "Kimi":{url:"https://api.moonshot.cn/v1",models:"moonshot-v1-8k,moonshot-v1-32k,moonshot-v1-128k".split(",")},
    "硅基流动":{url:"https://api.siliconflow.cn/v1",models:"Qwen/Qwen2.5-7B-Instruct,deepseek-ai/DeepSeek-V3".split(",")},
    "讯飞星火":{url:"https://spark-api-open.xf-yun.com/v1",models:"lite,pro,pro-128k,max,4.0Ultra".split(",")},
    "NVIDIA":{url:"https://integrate.api.nvidia.com/v1",models:"meta/llama-3.1-70b-instruct".split(",")},
    "Ollama (本地)":{url:"http://localhost:11434/v1",models:"llama3:8b,qwen2.5:7b".split(",")},
    "LM Studio (本地)":{url:"http://localhost:1234/v1",models:"local-model".split(",")},
  };

  const cfg = loadCfg();
  cfg.api1 = cfg.api1 || {}; cfg.api2 = cfg.api2 || {}; cfg.api3 = cfg.api3 || {};

  log(`  ${S.b}${S.ck}═${"─".repeat(40)}╌ 步骤 1/4 ╌${S.r}\n`);
  const provider = await choose("选择 AI 提供商:", providerList);
  let modelChoices = [];
  if (PROVIDERS[provider]) { cfg.api1.baseUrl = PROVIDERS[provider].url; modelChoices = PROVIDERS[provider].models; }
  else if (provider === "自定义") { cfg.api1.baseUrl = await ask("Base URL", cfg.api1.baseUrl || "https://api.openai.com/v1"); cfg.api1.model = await ask("Model", cfg.api1.model || "gpt-4o"); }
  else { /* other providers with generic defaults */ cfg.api1.baseUrl = await ask("Base URL", cfg.api1.baseUrl || "https://api.openai.com/v1"); }

  if (modelChoices.length > 0) {
    if (modelChoices.length === 1 && (modelChoices[0] === "all" || modelChoices[0] === "model")) modelChoices = "gpt-4o,gpt-4o-mini,claude-3-5-sonnet,gemini-2.0-flash,deepseek-chat,deepseek-reasoner,qwen-plus".split(",");
    if (modelChoices.length > 1) { const chosen = await choose("选择模型:", modelChoices); cfg.api1.model = chosen.trim(); }
    else { cfg.api1.model = modelChoices[0]; log(`  ${S.g}默认模型: ${S.wk}${cfg.api1.model}${S.r}`); }
  }
  const keyInput = await ask("API Key（输入不可见）", "", true);
  if (keyInput) cfg.api1.apiKey = keyInput;

  log(`\n  ${S.b}${S.ck}═${"─".repeat(40)}╌ 步骤 2/4 ╌${S.r}\n`);
  cfg.agents = cfg.agents || [];
  if (cfg.agents.length > 0) {
    const aName = await ask("Agent 名称", cfg.agents[0].name || "default");
    const aPrompt = await ask("系统提示词（回车跳过）", cfg.agents[0].systemPrompt || "");
    cfg.agents[0] = { name: aName, model: cfg.api1.model, systemPrompt: aPrompt };
  }

  const port = await ask("网关端口", String(process.env.PORT || 3001));
  cfg.gatewayPort = parseInt(port) || 3001;

  log(`\n  ${S.b}${S.ck}═${"─".repeat(40)}╌ 步骤 3/4 ╌${S.r}\n`);

  // 连接测试
  const spin = new Spinner("测试连接").start();
  try {
    const r = await fetch(`http://localhost:3001/api/v1/chat/completions`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: cfg.api1.model, messages: [{ role: "user", content: "Hi" }], max_tokens: 5 }),
    });
    spin.stop(r.ok ? `${S.gkb}✔${S.r} ${S.g}连接成功${S.r}` : `${S.rkb}✘${S.r} ${S.rk}HTTP ${r.status}${S.r}`);
  } catch { spin.stop(`${S.ykb}⚠${S.r} ${S.yk}无法连接 (memi-server 已启动?)${S.r}`); }

  log(`\n  ${S.b}${S.ck}═${"─".repeat(40)}╌ 步骤 4/4 ╌${S.r}\n`);
  saveCfg(cfg);
  fs.writeFileSync(path.join(DIR, ".onboarded"), "{}");

  log(`  ${S.gkb}${S.b}╔${"═".repeat(40)}╗${S.r}`);
  log(`  ${S.gkb}${S.b}║${S.r}  ${S.b}${S.wk}✓ 配置完成！${S.r}${" ".repeat(27)}${S.gkb}${S.b}║${S.r}`);
  log(`  ${S.gkb}${S.b}╚${"═".repeat(40)}╝${S.r}`);
  log(``);
  log(`  ${S.g}Model${S.r}    ${S.wk}${cfg.api1.model || "—"}${S.r}`);
  log(`  ${S.g}Endpoint${S.r} ${S.wk}${cfg.api1.baseUrl || "—"}${S.r}`);
  log(`  ${S.g}API Key${S.r}  ${S.wk}${cfg.api1.apiKey ? "***" + cfg.api1.apiKey.slice(-4) : "—"}${S.r}`);
  log(``);

  log(`  ${S.ck}memi chat${S.r}        ${S.g}进入智能对话${S.r}`);
  log(`  ${S.ck}memi dashboard${S.r}   ${S.g}打开网页管理面板${S.r}`);
  log(`  ${S.ck}memi help${S.r}        ${S.g}查看更多命令${S.r}`);
  log("");

  const goChat = await confirm("是否进入对话？");
  rl.close();
  if (goChat) { console.clear(); const chatCmd = require("./chat"); await chatCmd.run([]); }
}
