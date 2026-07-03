const path = require("path");
const { A, log, ok, fail, ROOT } = require("..");

module.exports = {
  name: "sandbox",
  description: "Manage sandbox mode",
  usage: "memi sandbox [enable|disable|status]",
  category: "system",
  run: async (args) => {
    const sub = args[0];
    if (sub === "enable") {
      try {
        const { setEnabled, checkDocker, pullImage } = require(path.join(ROOT, "memi-server", "utils", "sandbox"));
        if (!checkDocker()) { fail("Docker 未安装或未运行。请先安装 Docker Desktop。"); return; }
        log(A.b + "  拉取沙箱镜像..." + A.r);
        await pullImage();
        setEnabled(true);
        ok("沙箱模式已启用。Agent 将在 Docker 容器中执行命令。");
      } catch(e) { fail("启用失败: " + e.message); }
    } else if (sub === "disable") {
      try {
        const { setEnabled } = require(path.join(ROOT, "memi-server", "utils", "sandbox"));
        setEnabled(false);
        ok("沙箱模式已禁用。Agent 将直接在主系统执行命令。");
      } catch(e) { fail("禁用失败: " + e.message); }
    } else if (sub === "status") {
      try {
        const { status } = require(path.join(ROOT, "memi-server", "utils", "sandbox"));
        const s = status();
        log(A.b + "\n  沙箱状态\n" + A.r);
        log(`  启用: ${s.enabled ? A.gk + "✓" + A.r : A.rk + "✗" + A.r}`);
        log(`  Docker: ${s.docker ? A.gk + "✓" + A.r : A.rk + "✗ (请安装 Docker)" + A.r}`);
        log(`  镜像: ${s.image}`);
        log(`  超时: ${s.timeout / 1000}s`);
        log("");
      } catch(e) { fail("错误: " + e.message); }
    } else {
      log(A.b + "  memi sandbox <子命令>\n" + A.r);
      log(`  ${A.ck}enable${A.r}   启用沙箱 (需 Docker)`);
      log(`  ${A.ck}disable${A.r}  禁用沙箱`);
      log(`  ${A.ck}status${A.r}   查看状态`);
    }
  },
};
