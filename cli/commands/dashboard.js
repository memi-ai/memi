const { execSync } = require("child_process");
const { S, log } = require("../ui");

module.exports = {
  name: "dashboard",
  aliases: ["db"],
  description: "Open web dashboard",
  usage: "memi dashboard",
  category: "management",
  run: async () => {
    try {
      execSync("start http://localhost:3001/dashboard");
      log(`  ${S.gkb}✔${S.r} ${S.g}已打开 Dashboard${S.r}`);
    } catch {
      log(`  ${S.yk}请手动访问: ${S.ck}http://localhost:3001/dashboard${S.r}`);
    }
  },
};
