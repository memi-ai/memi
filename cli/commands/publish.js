const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { A, log, ok, fail, SKILLS, DIR } = require("..");

module.exports = {
  name: "publish",
  description: "Package a skill for sharing",
  usage: "memi publish <skill-name>",
  category: "management",
  run: async (args) => {
    const skillName = args[0];
    if (!skillName) { log(A.g + "  用法: memi publish <skill名称>"); return; }
    try {
      const srcDir = path.join(SKILLS, skillName);
      const dest = path.join(DIR, `${skillName}.zip`);
      if (!fs.existsSync(srcDir)) { fail("技能不存在: " + skillName); return; }
      if (process.platform === "win32") {
        execSync(`powershell Compress-Archive -Path "${srcDir}" -DestinationPath "${dest}" -Force`, { shell: true });
      } else {
        execSync(`cd "${SKILLS}" && zip -r "${dest}" "${skillName}"`, { shell: true });
      }
      ok(`已打包: ${dest}`);
      log(A.g + "  可分享此 zip 文件，其他人用 memi skill-import <url> 安装");
    } catch(e) { fail("打包失败: " + e.message); }
  },
};
