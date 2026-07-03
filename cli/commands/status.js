const { loadCfg, SESSIONS, SKILLS } = require("..");
const { S, log, section, inline, table } = require("../ui");

module.exports = {
  name: "status",
  aliases: ["st"],
  description: "View system status",
  usage: "memi status",
  category: "core",
  run: async () => {
    const c = loadCfg();
    const api = c.api1 || {};
    section("System Status");

    log(`  ${S.g}Endpoint${S.r}  ${S.wk}${api.baseUrl || "—"}${S.r}`);
    log(`  ${S.g}Model${S.r}    ${S.wk}${api.model || "—"}${S.r}`);
    log(`  ${S.g}API Key${S.r}  ${S.wk}${api.apiKey ? s(S.gkb, "***", api.apiKey.slice(-4)) : "—"}${S.r}`);
    try {
      const fs = require("fs");
      const sess = fs.readdirSync(SESSIONS).filter((f) => f.endsWith(".json"));
      const sk = fs.readdirSync(SKILLS).filter((f) => f.endsWith(".json"));
      log(`  ${S.g}Sessions${S.r} ${S.wk}${sess.length} saved${S.r}`);
      log(`  ${S.g}Skills${S.r}   ${S.wk}${sk.length} local${S.r}`);
    } catch {}
    log("");
  },
};
