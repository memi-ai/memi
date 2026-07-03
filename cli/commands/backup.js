const path = require("path");
const { DIR, ROOT } = require("..");
const { S, log, Spinner } = require("../ui");

module.exports = {
  name: "backup",
  aliases: ["bak"],
  description: "Create backup",
  usage: "memi backup [label]",
  category: "management",
  run: async (args) => {
    const label = args[0] || "manual";
    const spin = new Spinner("创建备份").start();
    const { createBackup } = require(path.join(ROOT, "memi-server", "utils", "backup"));
    const result = createBackup(label);
    spin.stop(S.gkb + "✔" + S.r + " " + S.g + "备份完成" + S.r);
    if (result.git && !result.git.startsWith("git_failed")) log(`  ${S.gray3}Git tag: ${S.ck}${result.git}${S.r}`);
    log(`  ${S.gray3}Snapshot: ${S.wk}${result.snapshot}${S.r}`);
    log(`  ${S.gray3}Path: ${S.d}${path.join(DIR, "backups", "snapshots", result.snapshot)}${S.r}`);
    log("");
  },
};
