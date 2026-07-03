const path = require("path");
const { A, _, log, ok, fail, head, ROOT } = require("..");

module.exports = {
  name: "cron",
  description: "Manage scheduled tasks",
  usage: "memi cron [add|list|remove]",
  category: "management",
  run: async (args) => {
    const sub = args[0];
    if (sub === "add") {
      const expr = args[1];
      const prompt = args.slice(2).join(" ");
      if (!expr || !prompt) { log(A.g + `  用法: memi cron add "<cron表达式>" "<提示词>"\n  示例: memi cron add "0 8 * * *" "早安播报"\n` + A.r); return; }
      if (!/^[\d*,/\-\s]+$/.test(expr) || expr.trim().split(/\s+/).length !== 5) { fail("cron 格式错误，需 5 段: 分 时 日 月 周\n  示例: 0 8 * * *"); return; }
      try {
        const { addJob } = require(path.join(ROOT, "memi-server", "utils", "cron"));
        addJob("cron_" + Date.now().toString(36), expr, prompt);
        ok(`已添加: ${expr} → "${prompt}"`);
      } catch(e) { fail("添加失败: " + e.message); }
    } else if (sub === "list") {
      try {
        const { listJobs } = require(path.join(ROOT, "memi-server", "utils", "cron"));
        const jobs = listJobs();
        if (jobs.length === 0) { log(A.g + "  无定时任务\n" + A.r); return; }
        head("定时任务");
        jobs.forEach(j => log(`  ${A.ck}${j.name}${A.r}  ${A.g}${j.cron}${A.r} → ${j.prompt}  ${j.enabled ? A.gk + "✓" : A.rk + "✗"}`));
        log("");
      } catch(e) { fail("错误: " + e.message); }
    } else if (sub === "remove" || sub === "rm") {
      const name = args[1];
      if (!name) { log(A.g + "  用法: memi cron remove <名称>\n" + A.r); return; }
      try {
        const { removeJob } = require(path.join(ROOT, "memi-server", "utils", "cron"));
        removeJob(name);
        ok(`已删除: ${name}`);
      } catch(e) { fail("删除失败: " + e.message); }
    } else {
      log(A.b + "  memi cron <子命令>\n" + A.r);
      log(`  ${A.ck}add${A.r}     添加  ${A.g}memi cron add "0 8 * * *" "早安播报"${A.r}`);
      log(`  ${A.ck}list${A.r}    列出`);
      log(`  ${A.ck}remove${A.r}  删除  ${A.g}memi cron remove <名称>${A.r}`);
    }
  },
};
