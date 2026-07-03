const path = require("path");
const { ROOT } = require("..");
const { S, log, Spinner } = require("../ui");

module.exports = {
  name: "restore",
  description: "Restore from backup",
  usage: "memi restore [name] [--force]",
  category: "management",
  run: async (args) => {
    const { listBackups, restoreBackup } = require(path.join(ROOT, "memi-server", "utils", "backup"));
    const name = args[0];
    if (!name) {
      const bk = listBackups();
      log(`\n  ${S.b}${S.wk}可用备份${S.r}`);
      log(`  ${S.gray2}${"─".repeat(40)}${S.r}`);
      for (const snap of bk.snapshots) log(`  ${S.gray3}📦${S.r} ${S.wk}${snap.name}${S.r}  ${S.g}${snap.date}  ${snap.label}${S.r}`);
      for (const g of bk.git) log(`  ${S.gray3}🏷${S.r} ${S.wk}${g.tag}${S.r}  ${S.g}${g.date}  ${g.label}${S.r}`);
      log(`\n  ${S.g}用法: ${S.wk}memi restore <name>${S.r}`);
      log("");
      return;
    }
    if (args[1] !== "--force") { log(`  ${S.ykb}⚠${S.r} ${S.yk}请加 --force 确认${S.r}\n`); return; }
    const spin = new Spinner("恢复中").start();
    try {
      const type = name.startsWith("backup-") ? "git" : "snapshot";
      const result = restoreBackup(type, name);
      if (result && result.preBackup) log(`  ${S.gray3}前备份: ${result.preBackup}${S.r}`);
      spin.stop(S.gkb + "✔" + S.r + " " + S.g + "已恢复到: " + name + S.r);
    } catch (e) { spin.stop(S.rkb + "✘" + S.r + " " + S.rk + e.message + S.r); }
  },
};
