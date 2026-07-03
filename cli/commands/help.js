const { getCommands } = require("..");
const { S, s, log, logo, section, inline, table } = require("../ui");

module.exports = {
  name: "help",
  aliases: ["hp", "--help", "-h", "?"],
  description: "Show help",
  usage: "memi help [command]",
  category: "core",
  run: async (args) => {
    if (args.length > 0) {
      const cmds = getCommands();
      const target = cmds.find(c => c.name === args[0] || (c.aliases || []).includes(args[0]));
      if (target) {
        log(`  ${S.b}${S.ck}${target.name}${S.r}`);
        log(`  ${S.g}${"─".repeat(40)}${S.r}`);
        log(`  ${S.g}说明${S.r}    ${S.wk}${target.description}${S.r}`);
        if (target.aliases && target.aliases.length) log(`  ${S.g}别名${S.r}    ${S.gray4}${target.aliases.join(", ")}${S.r}`);
        if (target.usage) log(`  ${S.g}用法${S.r}    ${S.gray4}${target.usage}${S.r}`);
        log("");
        return;
      }
    }

    logo();

    const catNames = {
      core: s(S.gkb, "●", S.r, " ", S.b, S.wk, "核心"),
      config: s(S.ckb, "●", S.r, " ", S.b, S.wk, "配置"),
      management: s(S.mkb, "●", S.r, " ", S.b, S.wk, "管理"),
      platform: s(S.bkb, "●", S.r, " ", S.b, S.wk, "平台"),
      system: s(S.ykb, "●", S.r, " ", S.b, S.wk, "系统"),
    };

    const cmds = getCommands();
    const grouped = {};
    for (const c of cmds) {
      const cat = c.category || "other";
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(c);
    }

    for (const [cat, list] of Object.entries(grouped)) {
      log(`  ${catNames[cat] || cat}${S.r}`);
      log(`  ${S.gray2}${"─".repeat(40)}${S.r}`);
      for (const c of list) {
        const aliasStr = c.aliases && c.aliases.length ? ` ${S.gray4}(${c.aliases.slice(0, 3).join(", ")})${S.r}` : "";
        log(`   ${S.ck}${S.b}${c.name}${S.r}${S.g}  ${c.description}${S.r}${aliasStr}`);
      }
      log("");
    }

    log(`  ${S.g}提示: 输入 ${S.ck}memi help <命令>${S.r} ${S.g}查看详细用法${S.r}`);
    log("");
  },
};
