const path = require("path");
const { A, _, log, ok, fail, head, ROOT } = require("..");

module.exports = {
  name: "plugin",
  description: "Manage plugins",
  usage: "memi plugin [install|list|remove]",
  category: "management",
  run: async (args) => {
    const sub = args[0];
    if (sub === "install") {
      const dir = args[1];
      if (!dir) { log(A.g + "  用法: memi plugin install <插件目录>\n" + A.r); return; }
      try {
        const { installPlugin } = require(path.join(ROOT, "memi-server", "utils", "plugins"));
        const dest = installPlugin(dir);
        ok(`插件已安装 → ${dest}`);
        log(A.g + "  重启服务后生效: memi server restart\n" + A.r);
      } catch(e) { fail("安装失败: " + e.message); }
    } else if (sub === "list") {
      try {
        const { listPlugins } = require(path.join(ROOT, "memi-server", "utils", "plugins"));
        const plugins = listPlugins();
        if (plugins.length === 0) { log(A.g + "  无已安装插件\n" + A.r); return; }
        head("已安装插件");
        plugins.forEach(p => log(`  ${A.ck}${p.name}${A.r} v${p.version}  ${A.g}${p.description}${A.r}`));
        log("");
      } catch(e) { fail("错误: " + e.message); }
    } else if (sub === "remove" || sub === "rm") {
      const name = args[1];
      if (!name) { log(A.g + "  用法: memi plugin remove <名称>\n" + A.r); return; }
      try {
        const { removePlugin } = require(path.join(ROOT, "memi-server", "utils", "plugins"));
        removePlugin(name);
        ok(`插件 "${name}" 已删除`);
      } catch(e) { fail("删除失败: " + e.message); }
    } else {
      log(A.b + "  memi plugin <子命令>\n" + A.r);
      log(`  ${A.ck}install${A.r}  安装插件  ${A.g}memi plugin install <目录>${A.r}`);
      log(`  ${A.ck}list${A.r}     已安装列表`);
      log(`  ${A.ck}remove${A.r}   删除插件  ${A.g}memi plugin remove <名称>${A.r}`);
    }
  },
};
