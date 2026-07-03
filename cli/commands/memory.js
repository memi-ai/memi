const path = require("path");
const fs = require("fs");
const { A, _, log, ok, fail, loadCfg, DIR, ROOT } = require("..");

module.exports = {
  name: "memory",
  description: "Manage memory & knowledge",
  usage: "memi memory [summary|search|upload|list]",
  category: "management",
  run: async (args) => {
    const sub = args[0];
    if (sub === "summary") {
      log(A.b + "  生成摘要..." + A.r);
      try {
        const cfg = loadCfg();
        const { autoSummarize, saveSummary } = require(path.join(ROOT, "memi-server", "utils", "memory"));
        const sessionDir = path.join(DIR, "sessions");
        let messages = [];
        try {
          const files = fs.readdirSync(sessionDir).filter(f => f.endsWith(".json"));
          if (files.length > 0) { const latest = files.sort().pop(); messages = JSON.parse(fs.readFileSync(path.join(sessionDir, latest), "utf8")); }
        } catch {}
        if (messages.length < 10) { log(A.g + "  对话太少，无法生成摘要\n" + A.r); return; }
        const summary = await autoSummarize(messages, cfg);
        if (summary) { saveSummary("cli", summary); ok("摘要已保存: " + summary.slice(0, 80) + "..."); }
        else { fail("生成摘要失败"); }
      } catch(e) { fail("错误: " + e.message); }
    } else if (sub === "search") {
      const query = args.slice(1).join(" ");
      if (!query) { log(A.g + "  用法: memi memory search <查询>\n" + A.r); return; }
      try {
        const { search } = require(path.join(ROOT, "memi-server", "utils", "vectorStore"));
        const cfg = loadCfg();
        const result = await search("MEMORY: " + query, cfg);
        log(A.b + "\n  记忆搜索: " + query + "\n" + A.r);
        log(result);
      } catch(e) { fail("搜索失败: " + e.message); }
    } else if (sub === "upload") {
      const file = args[1];
      if (!file) { log(A.g + "  用法: memi memory upload <文件路径>\n" + A.r); return; }
      if (!fs.existsSync(file)) { fail("文件不存在: " + file); return; }
      try {
        const { uploadKnowledge } = require(path.join(ROOT, "memi-server", "utils", "memory"));
        const r = await uploadKnowledge(file, loadCfg());
        ok(`已上传: ${r.file} (${r.size} 字符, ${r.chunks} 块)`);
      } catch(e) { fail("上传失败: " + e.message); }
    } else if (sub === "list") {
      try {
        const { listKnowledge } = require(path.join(ROOT, "memi-server", "utils", "memory"));
        const files = listKnowledge();
        if (files.length === 0) { log(A.g + "  知识库为空\n" + A.r); return; }
        log(A.b + "\n  知识库\n" + A.r);
        files.forEach(f => log(`  ${A.ck}${f.name}${A.r}  ${A.g}${f.size}B  ${new Date(f.time).toLocaleDateString()}`));
        log("");
      } catch(e) { fail("错误: " + e.message); }
    } else {
      log(A.b + "  memi memory <子命令>\n" + A.r);
      log(`  ${A.ck}summary${A.r}  生成对话摘要`);
      log(`  ${A.ck}search${A.r}   搜索记忆  ${A.g}memi memory search <查询>${A.r}`);
      log(`  ${A.ck}upload${A.r}   上传知识  ${A.g}memi memory upload <文件>${A.r}`);
      log(`  ${A.ck}list${A.r}     知识库列表`);
    }
  },
};
