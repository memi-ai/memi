const path = require("path");
const { loadCfg, saveCfg, ROOT } = require("..");
const { S, log, section, table, Spinner } = require("../ui");

module.exports = {
  name: "provider",
  aliases: ["prov"],
  description: "Manage AI providers",
  usage: "memi provider [list|detect|test|switch|add]",
  category: "config",
  run: async (args) => {
    const sub = args[0] || "list";
    const registry = require(path.join(ROOT, "memi-server", "providers", "registry"));
    registry.loadBuiltinProviders();

    if (sub === "list") {
      const names = registry.listProviders();
      const cfg = loadCfg();
      const rows = names.map(n => {
        const p = registry.getProvider(n);
        const isActive = cfg.api1?.baseUrl && p.detect && p.detect((cfg.api1.baseUrl || "").toLowerCase(), (cfg.api1.model || "").toLowerCase());
        return [isActive ? S.gkb + "●" + S.r : S.gray3 + "○" + S.r, n, p.name, p.vision ? "✓" : "—", p.imageGen ? "✓" : "—", p.chatStream ? "✓" : "—"];
      });
      section("Available Providers");
      table(["", "ID", "Name", "Vision", "Image", "Stream"], rows);
      log(`  ${S.gray3}● 当前使用的 provider      ○ 可用${S.r}`);
      log("");
    } else if (sub === "detect") {
      const cfg = loadCfg();
      const b = (cfg.api1?.baseUrl || "").toLowerCase();
      const m = (cfg.api1?.model || "").toLowerCase();
      const p = registry.detectProvider(b, m);
      section("Provider Detection");
      log(`  ${S.g}Base URL${S.r}  ${S.wk}${cfg.api1?.baseUrl || "—"}${S.r}`);
      log(`  ${S.g}Model${S.r}    ${S.wk}${cfg.api1?.model || "—"}${S.r}`);
      log(`  ${S.g}Detected${S.r}  ${S.ckb}${p ? p.name : "unknown"}${S.r}`);
      log("");
    } else if (sub === "test") {
      const cfg = loadCfg();
      if (!cfg.api1?.baseUrl || !cfg.api1?.apiKey) {
        log(`  ${S.ykb}⚠${S.r} ${S.yk}请先运行 ${S.ck}memi onboard${S.r} ${S.yk}配置 API${S.r}`);
        return;
      }
      const spin = new Spinner(`测试连接 ${cfg.api1.baseUrl}`).start();
      try {
        const r = await fetch(`${cfg.api1.baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: { "Authorization": `Bearer ${cfg.api1.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: cfg.api1.model || "gpt-4o", messages: [{ role: "user", content: "ping" }], max_tokens: 5 }),
          signal: AbortSignal.timeout(15000),
        });
        if (r.ok) {
          const d = await r.json();
          spin.stop(`${S.gkb}✔${S.r} ${S.g}连接成功 — ${d.choices?.[0]?.message?.content || "响应正常"}${S.r}`);
        } else {
          const text = await r.text().catch(() => "");
          spin.stop(`${S.rkb}✘${S.r} ${S.rk}HTTP ${r.status}: ${text.slice(0, 100)}${S.r}`);
        }
      } catch (e) {
        spin.stop(`${S.rkb}✘${S.r} ${S.rk}${e.message}${S.r}`);
      }
    } else if (sub === "switch") {
      const name = args[1];
      if (!name) { log(`  ${S.g}用法: ${S.wk}memi provider switch <provider-id>${S.r}\n  ${S.gray3}可用: ${registry.listProviders().join(", ")}${S.r}`); return; }
      const p = registry.getProvider(name);
      if (!p) { log(`  ${S.rkb}✘${S.r} ${S.rk}未知 provider: ${name}${S.r}`); return; }
      const cfg = loadCfg();
      // 更新 config 中的 URL 为 provider 的已知 URL
      if (!cfg.api1) cfg.api1 = {};
      if (p.defaultBaseUrl) cfg.api1.baseUrl = p.defaultBaseUrl;
      if (p.defaultModel) cfg.api1.model = p.defaultModel;
      saveCfg(cfg);
      log(`  ${S.gkb}✔${S.r} ${S.g}已切换到 ${S.ckb}${p.name}${S.r}`);
      log(`  ${S.gray3}Base URL: ${cfg.api1.baseUrl}${S.r}`);
      log(`  ${S.gray3}Model: ${cfg.api1.model}${S.r}`);
      log(`  ${S.gray3}重启服务生效: memi server restart${S.r}`);
    } else if (sub === "add") {
      const id = args[1];
      const url = args[2];
      const model = args[3];
      if (!id || !url) { log(`  ${S.g}用法: ${S.wk}memi provider add <id> <base-url> [model]${S.r}`); return; }
      const registry2 = require(path.join(ROOT, "memi-server", "providers", "registry"));
      registry2.register(id, { name: id, detect: () => true, chat: async () => "ok", defaultBaseUrl: url, defaultModel: model });
      const cfg = loadCfg();
      if (!cfg.api1) cfg.api1 = {};
      cfg.api1.baseUrl = url;
      if (model) cfg.api1.model = model;
      saveCfg(cfg);
      log(`  ${S.gkb}✔${S.r} ${S.g}已添加自定义 provider: ${S.ckb}${id}${S.r}`);
      log(`  ${S.gray3}重启服务生效: memi server restart${S.r}`);
    } else {
      log(`  ${S.b}${S.wk}memi provider <子命令>${S.r}\n`);
      log(`  ${S.ck}list${S.r}     列出所有可用 provider`);
      log(`  ${S.ck}detect${S.r}   自动探测当前配置使用的 provider`);
      log(`  ${S.ck}test${S.r}     测试当前 API 连接是否正常`);
      log(`  ${S.ck}switch${S.r}   切换到指定 provider  ${S.gray3}memi provider switch openai${S.r}`);
      log(`  ${S.ck}add${S.r}      添加自定义 provider   ${S.gray3}memi provider add myai http://... model${S.r}`);
      log("");
    }
  },
};
