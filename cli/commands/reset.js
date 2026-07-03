const fs = require("fs");
const { DIR } = require("..");
const { S, log } = require("../ui");

module.exports = {
  name: "reset",
  description: "Reset all configuration",
  usage: "memi reset [--force]",
  category: "system",
  run: async (args) => {
    if (args[0] === "--force" || args[0] === "-f") {
      try {
        fs.rmSync(DIR, { recursive: true, force: true });
        log(`  ${S.gkb}✔${S.r} ${S.g}已重置。运行 ${S.ck}memi onboard${S.r} ${S.g}重新配置${S.r}`);
      } catch { log(`  ${S.rkb}✘${S.r} ${S.rk}重置失败${S.r}`); }
    } else {
      log(`  ${S.ykb}⚠${S.r} ${S.yk}此操作将清除所有配置和会话${S.r}`);
      log(`  ${S.g}确认: ${S.wk}memi reset --force${S.r}`);
    }
  },
};
