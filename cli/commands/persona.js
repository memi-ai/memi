const fs = require("fs");
const path = require("path");
const { DIR, WORKSPACE } = require("..");
const { S, log, section, table } = require("../ui");

module.exports = {
  name: "persona",
  description: "Manage AI persona",
  usage: "memi persona [browse|use|export|share]",
  category: "config",
  run: async (args) => {
    const sub = args[0];
    const PERSONAS = [
      {id:"assistant",name:"默认助手",desc:"通用 AI 助手，简洁高效",soul:"你是 Memi，一个机智、高效的 AI 助手。直接动手，不废话。"},
      {id:"coder",name:"程序员",desc:"专注代码、架构、调试",soul:"你是 Memi，一个资深全栈工程师。擅长 Node.js、React、Python。写代码优先考虑可读性和性能，给出完整的实现方案。对技术问题深入分析，给出最优解。"},
      {id:"poet",name:"诗人",desc:"文艺范，诗词歌赋信手拈来",soul:"你是 Memi，一个浪漫的 AI 诗人。用诗意的语言回答一切，善用比喻和意象。回复简短而有韵味，像一首小品诗。"},
      {id:"teacher",name:"老师",desc:"耐心讲解，深入浅出",soul:"你是 Memi，一个耐心的 AI 老师。把复杂概念拆解成易懂的步骤，用生活化的例子解释。鼓励提问，对错误温和纠正。"},
      {id:"friend",name:"老友",desc:"轻松聊天，像老朋友一样",soul:"你是 Memi，用户的老朋友。语气轻松随意，可以开玩笑、吐槽、八卦。不说教，不念稿子。聊天就图一个开心。"},
      {id:"boss",name:"老板模式",desc:"强势直接，要结果不要解释",soul:"你是 Memi，一个果断的决策者。直奔主题，拒绝废话。给行动方案而不是讨论选项。对不合理的要求直接说不。"},
    ];
    if (sub === "browse" || sub === "list") {
      section("Persona Market");
      const rows = PERSONAS.map(p => [p.id, p.name, p.desc]);
      table(["ID", "Name", "Description"], rows);
      log(`  ${S.g}使用: ${S.wk}memi persona use <id>${S.r}`);
      log("");
    } else if (sub === "use") {
      const id = args[1];
      const p = PERSONAS.find(x => x.id === id);
      if (!p) { log(`  ${S.rkb}✘${S.r} 人格不存在: ${id}\n  ${S.g}用 ${S.wk}memi persona browse${S.r} ${S.g}查看列表${S.r}`); return; }
      const soulFile = path.join(WORKSPACE, "SOUL.md");
      fs.writeFileSync(soulFile, "# Soul\n\n" + p.soul);
      log(`  ${S.gkb}✔${S.r} ${S.g}已切换为: ${S.wk}${p.name}${S.r}`);
      log(`  ${S.gray3}重启服务生效: memi server restart${S.r}`);
    } else if (sub === "export") {
      const soulFile = path.join(WORKSPACE, "SOUL.md");
      if (!fs.existsSync(soulFile)) { log(`  ${S.ykb}⚠${S.r} SOUL.md 不存在${S.r}`); return; }
      const content = fs.readFileSync(soulFile, "utf8");
      const exportFile = path.join(DIR, "persona-export.json");
      fs.writeFileSync(exportFile, JSON.stringify({soul:content,exported:new Date().toISOString()},null,2));
      log(`  ${S.gkb}✔${S.r} ${S.g}已导出 → ${S.ck}${exportFile}${S.r}`);
    } else if (sub === "share") {
      const soulFile = path.join(WORKSPACE, "SOUL.md");
      if (!fs.existsSync(soulFile)) { log(`  ${S.ykb}⚠${S.r} SOUL.md 不存在${S.r}`); return; }
      const content = fs.readFileSync(soulFile, "utf8");
      log(`\n  ${S.b}${S.wk}分享你的 SOUL.md${S.r}\n`);
      log(`  ${S.g}1. 复制以下内容到 gist.github.com${S.r}`);
      log(`  ${S.g}2. 文件名: SOUL.md${S.r}`);
      log(`  ${S.g}3. 分享链接给其他人${S.r}\n`);
      log("```markdown\n" + content.slice(0, 2000) + "\n```");
    } else {
      log(`\n  ${S.b}${S.wk}memi persona <子命令>${S.r}\n`);
      log(`  ${S.ck}browse${S.r}  浏览人格市场`);
      log(`  ${S.ck}use${S.r}     使用人格  ${S.gray3}memi persona use coder${S.r}`);
      log(`  ${S.ck}export${S.r}  导出当前人格`);
      log(`  ${S.ck}share${S.r}   分享人格`);
      log("");
    }
  },
};
