const fs = require("fs");
const path = require("path");
const { SKILLS } = require("..");
const { S, log, section, table } = require("../ui");

module.exports = {
  name: "skills",
  aliases: ["sk"],
  description: "List installed skills",
  usage: "memi skills",
  category: "management",
  run: async () => {
    try {
      const jsonSkills = fs.readdirSync(SKILLS).filter(f => f.endsWith(".json"));
      const clawhubDirs = fs.readdirSync(SKILLS, { withFileTypes: true })
        .filter(d => d.isDirectory() && fs.existsSync(path.join(SKILLS, d.name, "SKILL.md")));
      if (jsonSkills.length === 0 && clawhubDirs.length === 0) {
        log(`  ${S.gray3}无技能。放 .json 到 memi-config/skills/ 或用 clawhub install <skill> 安装${S.r}\n`);
        return;
      }
      section("Skills");
      const rows = [];
      jsonSkills.forEach((f) => {
        try {
          const s = JSON.parse(fs.readFileSync(path.join(SKILLS, f), "utf8"));
          rows.push([s.name || f, s.handler ? "可执行" : "模板", (s.description || "").slice(0, 40)]);
        } catch { rows.push([f, "格式错误", ""]); }
      });
      clawhubDirs.forEach(d => {
        try {
          const md = fs.readFileSync(path.join(SKILLS, d.name, "SKILL.md"), "utf8");
          const yamlMatch = md.match(/^---\n([\s\S]*?)\n---/);
          const meta = {};
          if (yamlMatch) { yamlMatch[1].split("\n").forEach(line => { const [k, ...v] = line.split(":"); if (k && v.length) meta[k.trim()] = v.join(":").trim(); }); }
          rows.push([meta.name || d.name, "ClawHub", (meta.description || "").slice(0, 40)]);
        } catch { rows.push([d.name, "ClawHub", ""]); }
      });
      table(["Name", "Type", "Description"], rows);
      log("");
    } catch {
      log(`  ${S.yk}无法读取${S.r}\n`);
    }
  },
};
