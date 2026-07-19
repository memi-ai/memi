const readline = require("readline");
const fs = require("fs");
const path = require("path");
const { A, _, loadCfg, saveCfg, ROOT, SESSIONS, SKILLS, WORKSPACE, log, out, ok, warn, fail } = require("..");

module.exports = {
  name: "chat",
  aliases: ["ch"],
  description: "Start interactive chat",
  usage: "memi chat [session-name]",
  category: "core",
  run: async () => {
    await chat();
  },
};

async function chat() {
  let msgs = [], session = "default", cfg = loadCfg(), currency = cfg.currency || "¥", apiBalance = "—";
  let agents = cfg.agents || [{ name: "default", model: (cfg.api1 && cfg.api1.model) || "?", systemPrompt: "" }];
  let currentAgent = agents[0]?.name || "default";
  if (!cfg.agents) { cfg.agents = agents; saveCfg(cfg); }

  const md = (t) => {
    const lines = t.split("\n");
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim().startsWith("|")) { out.push(line); continue; }
      const table = [line];
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith("|")) table.push(lines[++i]);
      if (table.length < 2) { out.push(line); continue; }
      const rows = table.map((r) => r.split("|").slice(1, -1).map((c) => c.trim()));
      const widths = rows[0].map((_, ci) => Math.max(...rows.map((r) => (r[ci] || "").replace(/[\u4e00-\u9fff]/g, "XX").length)));
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

    let serverReady = false;
    try { const h = await fetch("http://localhost:3001/health"); serverReady = h.ok; } catch {}
    if (!serverReady) {
      out(A.d + "  启动服务中... " + A.r);
      try {
        const serverPath = path.join(ROOT, "memi-server");
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
        body: JSON.stringify({ model: cfg.api1?.model || "", messages: msgs, stream: true, thinking: cfg.thinkLevel || "high", systemPrompt: agentCfg.systemPrompt || "" }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);

      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let full = "", buf = "", toolCalls = [];

      out(A.d + "  ..." + A.r);

      const icons = { web_search:"🔍", list_files:"📂", read_file:"📖", write_file:"✏️", get_time:"🕐", get_location:"📍", calculate:"🧮", move_file:"📦", delete_file:"🗑", create_dir:"📁", run_command:"⚡", run_skill:"🔧", generate_image:"🎨", find_files:"🔎", search_in_files:"📋", http_request:"🌐", system_info:"🖥", clipboard_read:"📋", clipboard_write:"📝", open_url:"🔗", download_file:"⬇", zip_files:"📦", unzip:"📂", process_list:"📊", notify:"🔔", encode_decode:"🔣", git_status:"📋", git_log:"📜", random:"🎲", hash_text:"🔐", uuid:"🆔", count_text:"🔢", diff_files:"↔", disk_usage:"💾", network_info:"🌐", ping_host:"📡", dns_lookup:"🔍", sort_file:"📑", get_env:"🔧", take_screenshot:"📸", get_weather:"🌤", timer:"⏱", qr_generate:"📱", set_reminder:"📝" };

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
              const name = (icons[data.tool] || "🔧") + " " + data.tool;
              let args = ""; try { const a = typeof data.args === "string" ? JSON.parse(data.args) : data.args; args = Object.values(a || {}).join(", ").slice(0, 60); } catch { args = String(data.args || "").slice(0, 60); }
              log(A.bk + "  ⚙  " + name + A.r + "  " + A.g + args);
              if (data.result) log(A.g + "     ↳ " + data.result.slice(0, 120).replace(/\n/g, " "));
              msgs.push({ role: "assistant", type: "tool", content: name, args, result: (data.result||"").slice(0, 500) });
              continue;
            }
            const r = data.choices?.[0]?.delta?.reasoning_content || "";
            if (r) process.stdout.write(A.d + r + A.r);
            const t = data.choices?.[0]?.delta?.content || "";
            if (t) { full += t; tOut++; }
          } catch {}
        }
      }

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
              if (m.role === "user") log(A.yk + "  User" + A.r + ": " + m.content);
              else { log(A.ck + "  " + ((cfg.api1 && cfg.api1.model) || "agent") + A.r); const rendered = md(m.content || ""); rendered.split("\n").forEach((l) => log("  " + l)); }
            });
            log(A.g + "  " + "-".repeat(50));
          } else warn("不存在");
        } catch { fail("加载失败"); }
        break;
      case "status":
        try {
          const { head: h, pair: p } = require("..");
          const c = loadCfg(); const api = c.api1 || {};
          h("Status"); p("Endpoint", api.baseUrl || "—"); p("Model", api.model || "—"); p("API Key", api.apiKey ? "***" + api.apiKey.slice(-4) : "—"); log("");
        } catch {}
        break;
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
        chatMsgs.forEach((m, i) => { const r = m.role === "user" ? A.yk + "User" : A.ck + (cfg.api1 && cfg.api1.model || "agent"); log(`  ${i+1}. ${r}${A.r}: ${A.d}${(m.content||"").slice(0, 100)}`); });
        log(A.g + "  ════════════════════════");
        break;
      case "new":
        try { fs.writeFileSync(path.join(SESSIONS, session + ".json"), JSON.stringify(msgs, null, 2)); } catch {}
        msgs = []; session = "s" + Date.now().toString(36).slice(-4);
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
        tMsgs.forEach(m => { log(`  ${A.bk}${(m.content||"🔧").slice(0, 30)}${A.r}  ${A.g}${(m.args||"").slice(0, 40)}`); if (m.result) log(A.g + "     " + (m.result||"").slice(0, 100).replace(/\n/g, " ")); });
        log(A.g + "  ═" + "═".repeat(40));
        break;
      }
      case "stats": {
        const tMsgs = msgs.filter(m => m.type === "tool" || /^[🔍📂📖✏️🕐📍🧮📦🗑📁⚡🔧]/.test(m.content||""));
        let totalChars = 0; msgs.forEach(m => totalChars += (m.content||"").length);
        const estT = Math.round(totalChars / 3.5); const estC = (estT * 0.000002).toFixed(5);
        log(A.b + "\n  ═══ 会话统计 ═══"); log(`  ${A.g}消息${A.r}   ${A.wk}${msgs.length}${A.r}     ${A.g}工具${A.r}  ${A.wk}${tMsgs.length}${A.r}`); log(`  ${A.g}Token${A.r}   ${A.wk}~${estT}${A.r}    ${A.g}花费${A.r}  ${A.wk}${currency}${estC}${A.r}`); log(A.g + "  ═" + "═".repeat(20));
        break;
      }
      case "think":
        if (!a || !["off","low","medium","high","max"].includes(a)) { warn("用法: /think off|low|medium|high|max"); break; }
        if (!/reasoner|r1|think|v4-pro|v4-flash/i.test((cfg.api1 && cfg.api1.model) || "")) { warn("当前模型不支持思考模式"); break; }
        cfg.thinkLevel = a; saveCfg(cfg); ok("思考强度: " + a);
        break;
      case "currency":
        currency = currency === "¥" ? "$" : "¥"; cfg.currency = currency; saveCfg(cfg); ok("币种: " + currency);
        break;
      case "skill": {
        if (a === "list") {
          try {
            const files = fs.readdirSync(SKILLS).filter(f => f.endsWith(".json"));
            if (files.length === 0) { log(A.g + "  无本地技能"); break; }
            log(A.b + "\n  本地技能 (" + files.length + "):");
            files.forEach(f => { try { const s = JSON.parse(fs.readFileSync(path.join(SKILLS, f), "utf8")); log(`  ${A.ck}${s.name || f}${A.r}  ${A.g}${s.handler ? "可执行" : "模板"}  ${s.description || ""}`); } catch { log(`  ${A.yk}${f}${A.r}  (格式错误)`); } });
          } catch { log(A.g + "  无"); }
        } else if (a.startsWith("import ")) {
          const url = a.slice(7).trim();
          if (!url.startsWith("http")) { warn("用法: /skill import <url>"); break; }
          out(A.g + "  下载中... ");
          try {
            const r = await fetch(url); const text = await r.text();
            let skill; try { skill = JSON.parse(text); } catch { skill = { name: url.split("/").pop().replace(/\.\w+$/, ""), description: "来自 " + url, prompt: text }; }
            if (!skill.name) skill.name = url.split("/").pop().replace(/\.\w+$/, "");
            if (!skill.handler && skill.code) skill.handler = skill.code;
            if (!skill.handler && skill.script) skill.handler = skill.script;
            if (!skill.handler && skill.run) skill.handler = skill.run;
            if (!skill.description && skill.desc) skill.description = skill.desc;
            const filename = (skill.name || "imported").replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "_") + ".json";
            fs.writeFileSync(path.join(SKILLS, filename), JSON.stringify(skill, null, 2));
            readline.clearLine(process.stdout, 0); readline.cursorTo(process.stdout, 0);
            ok("已导入: " + skill.name + " → skills/" + filename);
          } catch { readline.clearLine(process.stdout, 0); readline.cursorTo(process.stdout, 0); fail("下载失败"); }
        } else { log(A.g + "  /skill list  查看  /skill import <url>  从URL导入"); }
        break;
      }
      case "balance":
        try {
          out(A.g + "  查询中... "); const r = await fetch("http://localhost:3001/api/balance");
          const d = await r.json(); readline.clearLine(process.stdout, 0); readline.cursorTo(process.stdout, 0);
          apiBalance = d.balance || "—"; ok("API 余额: " + apiBalance);
        } catch { warn("无法获取余额"); }
        break;
      case "agent":
        if (a === "list") {
          log(A.b + "\n  智能体列表:"); agents.forEach((ag, i) => { log(`  ${ag.name === currentAgent ? A.gk + "●" + A.r : " "} ${A.wk}${ag.name}${A.r}  ${A.g}${ag.model || "?"}${A.r}`); }); log(A.g + "\n  /agent use <名称> 切换");
        } else if (a.startsWith("use ")) {
          const name = a.slice(4).trim(); const found = agents.find(ag => ag.name === name);
          if (found) { currentAgent = name; ok("已切换到: " + name); } else { warn("智能体不存在: " + name); }
        } else if (a === "add") {
          const aName = await new Promise(r => rl.question(A.g + "  名称: " + A.r + " ", r));
          if (!aName || !aName.trim()) { warn("名称必填"); break; }
          const aModel = await new Promise(r => rl.question(A.g + "  模型 [" + ((cfg.api1&&cfg.api1.model)||"?") + "]: " + A.r + " ", r));
          const aPrompt = await new Promise(r => rl.question(A.g + "  系统提示词 (可选): " + A.r + " ", r));
          agents.push({ name: aName.trim(), model: aModel.trim() || (cfg.api1&&cfg.api1.model)||"?", systemPrompt: aPrompt.trim() || "" });
          cfg.agents = agents; saveCfg(cfg); ok("已添加: " + aName.trim());
        } else { log(A.g + "  /agent list 查看  /agent use <名称> 切换  /agent add 新增"); }
        break;
      case "docs":
        log(A.b + "\n  ═══ API 文档 ═══\n");
        log(A.wk + "  POST /api/v1/chat/completions" + A.r); log(A.g + "  OpenAI 兼容，支持 stream/thinking/systemPrompt\n");
        log(A.wk + "  POST /api/gateway/telegram|wecom|qq/:token" + A.r); log(A.g + "  消息渠道 webhook\n");
        log(A.wk + "  POST /api/gateway/feishu" + A.r); log(A.g + "  飞书事件回调\n");
        log(A.wk + "  GET /api/config  /api/balance  /api/sessions/:name" + A.r); log(A.g + "  管理接口\n");
        log(A.wk + "  WebSocket: ws://localhost:3001/api/gateway/ws" + A.r); log(A.g + "  发送 {\"message\":\"...\"} → 返回响应");
        break;
      case "help": case "?":
        log(A.b + "\n  /help帮助 /history历史 /sessions会话 /new新建 /load加载 /save保存\n  /tools工具 /stats统计 /think思考 /status状态 /clear清空 /docs文档 /exit退出\n");
        break;
      default: warn("未知: /" + name); break;
    }
  }

  session = "s" + Date.now().toString(36).slice(-4);
  msgs = [];

  const agentCfg = agents.find(a => a.name === currentAgent) || agents[0] || {};
  const model = agentCfg.model || (cfg.api1 && cfg.api1.model) || "?";

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
  log(A.g + "  " + "-".repeat(50) + A.r);

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
    if (msgs.length > 0 && msgs.length % 4 === 0) {
      log(A.g + "  " + "-".repeat(50));
      log(A.g + "  " + A.b + A.wk + "Memi" + A.r + A.g + "  " + ((cfg.api1 && cfg.api1.model) || "?") + "  |  msgs: " + msgs.length);
    }
    const atMatch = text.match(/^@(\S+)\s+(.+)/);
    if (atMatch) {
      const targetAgent = agents.find(a => a.name === atMatch[1]);
      if (targetAgent) {
        log(A.mk + "  → 委托给 " + atMatch[1] + A.r);
        const origAgent = currentAgent; currentAgent = targetAgent.name;
        await send(atMatch[2]); currentAgent = origAgent;
        log(A.g + "  " + "-".repeat(50)); rl.prompt(); return;
      }
    }
    log(A.yk + "  User" + A.r + ": " + text);
    await send(text);
    try { fs.writeFileSync(path.join(SESSIONS, session + ".json"), JSON.stringify(msgs, null, 2)); } catch {}
    if (session.startsWith("s") && msgs.length === 2) autoNameSession();
    log(A.g + "  " + "-".repeat(50));
    rl.prompt();
  });

  async function autoNameSession() {
    try {
      const userMsgs = msgs.filter(m => m.role === "user").map(m => m.content).join("; ").slice(0, 200);
      const r = await fetch("http://localhost:3001/api/v1/chat/completions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: cfg.api1?.model || "", messages: [{ role: "user", content: "给这段对话起一个简短名称（3-6个汉字），直接描述对话主题，不要修饰、不要标点。\n\n对话:\n" + userMsgs }], max_tokens: 20, temperature: 0.3 })
      });
      const d = await r.json(); let name = (d.choices?.[0]?.message?.content || "").replace(/["\n\r]/g, "").trim();
      if (!name || name.length < 1 || name.length > 20 || !/[\u4e00-\u9fff]/.test(name)) return;
      const old = path.join(SESSIONS, session + ".json"); const nu = path.join(SESSIONS, name + ".json");
      if (fs.existsSync(old)) { fs.renameSync(old, nu); session = name; }
    } catch {}
  }

  rl.on("close", () => {
    try { fs.writeFileSync(path.join(SESSIONS, session + ".json"), JSON.stringify(msgs, null, 2)); } catch {}
    log(A.g + "\n  已断开\n"); process.exit(0);
  });
}
