const { S, log, logo } = require("../ui");

module.exports = {
  name: "version",
  aliases: ["--version", "-v", "vr"],
  description: "Show version",
  usage: "memi version",
  category: "core",
  run: async () => {
    logo();
    log(`  ${S.b}${S.ck}Memi Agent v1.0.0${S.r}`);
    log(`  ${S.g}Build 2025-07${S.r}`);
    log("");
  },
};
