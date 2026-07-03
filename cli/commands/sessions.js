const fs = require("fs");
const path = require("path");
const SESSIONS = require("..").SESSIONS;
const { S, log, section, table } = require("../ui");

module.exports = {
  name: "sessions",
  aliases: ["ss"],
  description: "List saved sessions",
  usage: "memi sessions",
  category: "management",
  run: async () => {
    try {
      const files = fs.readdirSync(SESSIONS).filter((f) => f.endsWith(".json"));
      section("Saved Sessions");
      if (files.length === 0) { log(`  ${S.gray3}无保存的会话${S.r}\n`); return; }
      const rows = files.map((f) => {
        const n = f.replace(".json", "");
        let len = 0;
        try { len = JSON.parse(fs.readFileSync(path.join(SESSIONS, f), "utf8")).length; } catch {}
        return [n, String(len)];
      });
      table(["Name", "Messages"], rows);
      log("");
    } catch { log(`  ${S.yk}无法读取${S.r}\n`); }
  },
};
