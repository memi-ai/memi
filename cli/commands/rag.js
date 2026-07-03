const path = require("path");
const { A, _, log, ok, fail, loadCfg, ROOT } = require("..");

module.exports = {
  name: "rag",
  description: "Vector memory management",
  usage: "memi rag [index|search|stats|clear]",
  category: "management",
  run: async (args) => {
    const sub = args[0];
    if (sub === "index") {
      log(A.b + "  索引中..." + A.r);
      try {
        const { indexWorkspace } = require(path.join(ROOT, "memi-server", "utils", "vectorStore"));
        const c = loadCfg();
        const r = await indexWorkspace(c);
        if (r) ok(`已索引 ${r.chunks} 个文本块` + (r.embedded > 0 ? ` (${r.embedded} 已嵌入)` : ""));
        else fail("索引失败");
      } catch(e) { fail("索引失败: " + e.message); }
    } else if (sub === "search") {
      const query = args.slice(1).join(" ");
      if (!query) { log(A.g + "  用法: memi rag search <查询语句>"); return; }
      try {
        const { search } = require(path.join(ROOT, "memi-server", "utils", "vectorStore"));
        const c = loadCfg();
        const result = await search(query, c);
        log(A.b + "\n  RAG 搜索: " + query + "\n" + A.r);
        log(result);
      } catch(e) { fail("搜索失败: " + e.message); }
    } else if (sub === "stats") {
      try {
        const { stats } = require(path.join(ROOT, "memi-server", "utils", "vectorStore"));
        const s = stats();
        log(A.b + "\n  向量库统计\n" + A.r);
        log(`  文档块: ${s.chunks}`);
        log(`  来源文件: ${s.sources.join(", ") || "无"}`);
        log(`  总字符: ${s.totalChars}`);
        log(`  向量嵌入: ${s.hasEmbeddings ? "✓" : "✗ (使用关键词匹配)"}`);
        log("");
      } catch(e) { fail("统计失败: " + e.message); }
    } else if (sub === "clear") {
      try {
        const { clearIndex } = require(path.join(ROOT, "memi-server", "utils", "vectorStore"));
        clearIndex();
        ok("向量索引已清除");
      } catch(e) { fail("清除失败: " + e.message); }
    } else {
      log(A.b + "  memi rag <子命令>\n" + A.r);
      log(`  ${A.ck}index${A.r}    索引工作区文档`);
      log(`  ${A.ck}search${A.r}   搜索记忆  ${A.g}memi rag search <查询语句>${A.r}`);
      log(`  ${A.ck}stats${A.r}    向量库统计`);
      log(`  ${A.ck}clear${A.r}    清除索引`);
    }
  },
};
