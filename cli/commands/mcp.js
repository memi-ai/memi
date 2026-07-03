const path = require("path");
const { A, _, log, ok, fail, head, ROOT } = require("..");

module.exports = {
  name: "mcp",
  description: "Manage MCP servers",
  usage: "memi mcp [add|list|remove]",
  category: "management",
  run: async (args) => {
    const sub = args[0];
    if (sub === "add") {
      const name = args[1];
      const command = args[2];
      if (!name || !command) {
        log(A.g + "  用法: memi mcp add <名称> <命令> [args...]\n" + A.r);
        log(A.g + "  示例: memi mcp add filesystem npx -y @modelcontextprotocol/server-filesystem /tmp\n" + A.r);
        return;
      }
      const cmdArgs = args.slice(3);
      try {
        const { addMcpServer } = require(path.join(ROOT, "memi-server", "utils", "mcp"));
        const dest = addMcpServer(name, command, cmdArgs);
        ok(`MCP Server "${name}" 已添加 → ${dest}`);
        log(A.g + "  重启服务后生效: memi server restart\n" + A.r);
      } catch(e) { fail("添加失败: " + e.message); }
    } else if (sub === "list") {
      try {
        const { listMcpServers } = require(path.join(ROOT, "memi-server", "utils", "mcp"));
        const servers = listMcpServers();
        if (servers.length === 0) { log(A.g + "  无 MCP Server。用 memi mcp add <名称> <命令> 添加\n" + A.r); return; }
        head("MCP Servers");
        servers.forEach(s => log(`  ${A.ck}${s.name}${A.r}  ${A.g}${s.command} ${(s.args||[]).join(" ")}${A.r}`));
        log("");
      } catch(e) { fail("错误: " + e.message); }
    } else if (sub === "remove" || sub === "rm") {
      const name = args[1];
      if (!name) { log(A.g + "  用法: memi mcp remove <名称>\n" + A.r); return; }
      try {
        const { removeMcpServer } = require(path.join(ROOT, "memi-server", "utils", "mcp"));
        removeMcpServer(name);
        ok(`MCP Server "${name}" 已删除`);
      } catch(e) { fail("删除失败: " + e.message); }
    } else {
      log(A.b + "  memi mcp <子命令>\n" + A.r);
      log(`  ${A.ck}add${A.r}     添加 MCP Server  ${A.g}memi mcp add <名称> <命令> [args...]${A.r}`);
      log(`  ${A.ck}list${A.r}    列出所有 MCP Server`);
      log(`  ${A.ck}remove${A.r}  删除 MCP Server  ${A.g}memi mcp remove <名称>${A.r}`);
    }
  },
};
