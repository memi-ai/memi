const os = require("os");
const { loadCfg, saveCfg } = require("..");
const { S, log, section } = require("../ui");

module.exports = {
  name: "expose",
  description: "Network exposure mode",
  usage: "memi expose [lan|public|off]",
  category: "config",
  run: async (args) => {
    const sub = args[0] || "status";
    if (sub === "lan" || sub === "public") {
      const cfg = loadCfg();
      cfg.expose = sub;
      saveCfg(cfg);
      log(`  ${S.gkb}✔${S.r} ${S.g}网络暴露: ${sub === "lan" ? "局域网" : "公网"}${S.r}`);
      if (sub === "lan") {
        const nets = os.networkInterfaces();
        log(`\n  ${S.b}${S.wk}局域网访问地址${S.r}`);
        Object.values(nets).forEach(iface => { (iface || []).forEach(addr => { if (addr.family === "IPv4" && !addr.internal) log(`  ${S.ck}http://${addr.address}:3001/dashboard${S.r}`); }); });
      }
      if (sub === "public") {
        log(`\n  ${S.ykb}⚠${S.r} ${S.yk}安全警告: 公网暴露有风险！${S.r}`);
        log(`  ${S.yk}建议: 设置 MEMI_GATEWAY_TOKEN 环境变量${S.r}`);
        log(`  ${S.yk}建议: 使用 nginx/caddy 反代 + HTTPS${S.r}`);
      }
      log(`\n  ${S.gray3}重启服务生效: memi server restart${S.r}`);
    } else if (sub === "off") {
      const cfg = loadCfg();
      cfg.expose = "off";
      saveCfg(cfg);
      log(`  ${S.gkb}✔${S.r} ${S.g}已关闭网络暴露，恢复 localhost only${S.r}`);
      log(`  ${S.gray3}重启服务生效: memi server restart${S.r}`);
    } else {
      const cfg = loadCfg();
      const mode = cfg.expose || "off";
      section("Network Exposure");
      log(`  ${S.g}模式${S.r}    ${mode === "off" ? "仅本机" : mode === "lan" ? "局域网" : "公网"}`);
      log(`  ${S.g}访问${S.r}    ${S.ck}http://localhost:3001/dashboard${S.r}`);
      log(`\n  ${S.gray3}memi expose lan     局域网可访问`);
      log(`  ${S.gray3}memi expose public  公网可访问 (危险)`);
      log(`  ${S.gray3}memi expose off     关闭暴露${S.r}`);
    }
  },
};
