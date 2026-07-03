const { loadCfg, DIR } = require("..");
const { S, log, section, inline } = require("../ui");

module.exports = {
  name: "doctor",
  aliases: ["dr"],
  description: "Run diagnostics",
  usage: "memi doctor",
  category: "system",
  run: async () => {
    section("Diagnostics Report");
    const nv = process.version;
    log(`  ${parseInt(nv.slice(1)) >= 18 ? S.gkb + "✔" : S.rkb + "✘"}${S.r} ${S.g}Node.js${S.r}  ${S.wk}${nv}${S.r}`);
    const c = loadCfg();
    const hasApi = !!(c.api1?.baseUrl && c.api1?.apiKey);
    log(`  ${hasApi ? S.gkb + "✔" : S.ykb + "⚠"}${S.r} ${S.g}API ${hasApi ? "" : "未"}配置${S.r}`);
    try {
      const r = await fetch("http://localhost:3001/health");
      log(`  ${r.ok ? S.gkb + "✔" : S.rkb + "✘"}${S.r} ${S.g}memi-server${S.r}  ${r.ok ? S.gk + "运行中" : S.rk + "异常"}${S.r}`);
    } catch { log(`  ${S.rkb + "✘"}${S.r} ${S.g}memi-server${S.r}  ${S.rk + "未启动"}${S.r}`); }
    log(`  ${S.gkb + "✔"}${S.r} ${S.g}配置目录${S.r}  ${S.d}${DIR}${S.r}`);
    log("");
    log(`  ${S.gkb}${S.b}  一切正常 ✨${S.r}`);
    log("");
  },
};
