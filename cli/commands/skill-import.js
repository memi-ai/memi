const fs = require("fs");
const path = require("path");
const { A, _, SKILLS, log, out, ok, fail } = require("..");

module.exports = {
  name: "skill-import",
  description: "Import a skill from URL",
  usage: "memi skill-import <url>",
  category: "management",
  run: async (args) => {
    const url = args[0];
    if (!url || !url.startsWith("http")) { log(A.g + "  用法: memi skill-import <url>"); return; }
    try {
      const r = await fetch(url);
      const text = await r.text();
      let skill;
      try { skill = JSON.parse(text); } catch { skill = { name: url.split("/").pop()?.replace(/\.\w+$/, "") || "imported", description: "来自 " + url, prompt: text }; }
      if (!skill.name) skill.name = "imported_" + Date.now().toString(36);
      if (!skill.handler && skill.code) skill.handler = skill.code;
      if (!skill.handler && skill.script) skill.handler = skill.script;
      if (!skill.handler && skill.run) skill.handler = skill.run;
      if (!skill.description && skill.desc) skill.description = skill.desc;
      const filename = (skill.name || "skill").replace(/[^a-zA-Z0-9\u4e00-\u9fff_-]/g, "_") + ".json";
      fs.writeFileSync(path.join(SKILLS, filename), JSON.stringify(skill, null, 2));
      ok("已导入: " + skill.name + " → " + filename);
    } catch(e) { fail("导入失败: " + e.message); }
  },
};
