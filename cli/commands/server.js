const { execSync } = require("child_process");
const path = require("path");
const { ROOT } = require("..");
const { S, log, out, Spinner } = require("../ui");

module.exports = {
  name: "server",
  aliases: ["sv"],
  description: "Manage server",
  usage: "memi server [start|restart]",
  category: "management",
  run: async (args) => {
    const sub = args[0];
    if (sub === "start") {
      const spin = new Spinner("启动服务").start();
      try {
        execSync("npm start --prefix " + path.join(ROOT, "memi-server"), { stdio: "ignore", detached: true });
        spin.stop(S.gkb + "✔" + S.r + " " + S.g + "已启动" + S.r);
      } catch { spin.stop(S.rkb + "✘" + S.r + " " + S.rk + "启动失败" + S.r); }
    } else if (sub === "restart") {
      const spin = new Spinner("重启中").start();
      try {
        execSync("taskkill /f /im node.exe 2>nul & npm start --prefix " + path.join(ROOT, "memi-server"), { stdio: "ignore", shell: true });
        spin.stop(S.gkb + "✔" + S.r + " " + S.g + "已重启" + S.r);
      } catch { spin.stop(S.rkb + "✘" + S.r + " " + S.rk + "重启失败" + S.r); }
    } else {
      out(`  ${S.g}检查服务... `);
      try { const r = await fetch("http://localhost:3001/health"); log(r.ok ? S.gkb + "✔" + S.r + S.g + " 运行中" + S.r : S.rkb + "✘" + S.r + S.rk + " 未响应" + S.r); } catch { log(S.rkb + "✘" + S.r + S.rk + " 未启动" + S.r); }
      log(`  ${S.gray3}  memi server start   启动${S.r}`);
      log(`  ${S.gray3}  memi server restart  重启${S.r}`);
    }
  },
};
