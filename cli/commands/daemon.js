const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { ROOT } = require("..");
const { S, log, out, Spinner } = require("../ui");

module.exports = {
  name: "daemon",
  description: "Manage system daemon",
  usage: "memi daemon [install|uninstall|status]",
  category: "system",
  run: async (args) => {
    const sub = args[0] || "status";
    const osType = process.platform;
    const serverScript = path.join(ROOT, "memi-server", "index.js");

    if (sub === "install") {
      const spin = new Spinner("安装守护进程").start();
      if (osType === "win32") {
        try {
          execSync(`schtasks /create /tn "MemiAgent" /tr "node \\"${serverScript}\\"" /sc onstart /ru System /f`, { shell: true });
          spin.stop(S.gkb + "✔" + S.r + " " + S.g + "守护进程已安装（开机自启）" + S.r);
        } catch(e) { spin.stop(S.rkb + "✘" + S.r + " " + S.rk + "安装失败: " + e.message.slice(0, 100) + S.r); }
      } else if (osType === "darwin") {
        try {
          const plist = path.join(require("os").homedir(), "Library", "LaunchAgents", "com.memi.agent.plist");
          const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict>\n<key>Label</key><string>com.memi.agent</string>\n<key>ProgramArguments</key><array><string>node</string><string>${serverScript}</string></array>\n<key>RunAtLoad</key><true/><key>KeepAlive</key><true/>\n</dict></plist>`;
          fs.writeFileSync(plist, xml);
          execSync(`launchctl load "${plist}"`, { shell: true });
          spin.stop(S.gkb + "✔" + S.r + " " + S.g + "守护进程已安装（开机自启）" + S.r);
        } catch(e) { spin.stop(S.rkb + "✘" + S.r + " " + S.rk + "安装失败: " + e.message.slice(0, 100) + S.r); }
      } else {
        try {
          const unit = `/etc/systemd/system/memi-agent.service`;
          const cfg = `[Unit]\nDescription=Memi Agent\nAfter=network.target\n\n[Service]\nExecStart=node ${serverScript}\nRestart=always\nUser=${require("os").userInfo().username}\n\n[Install]\nWantedBy=multi-user.target\n`;
          execSync(`echo "${cfg.replace(/"/g,'\\"')}" | sudo tee ${unit} && sudo systemctl daemon-reload && sudo systemctl enable memi-agent`, { shell: true });
          spin.stop(S.gkb + "✔" + S.r + " " + S.g + "守护进程已安装（开机自启）" + S.r);
        } catch(e) { spin.stop(S.rkb + "✘" + S.r + " " + S.rk + "安装失败（需要 sudo）" + S.r); }
      }
    } else if (sub === "uninstall") {
      const spin = new Spinner("卸载守护进程").start();
      if (osType === "win32") {
        try { execSync('schtasks /delete /tn "MemiAgent" /f', { shell: true }); spin.stop(S.gkb + "✔" + S.r + " " + S.g + "已卸载" + S.r); } catch { spin.stop(S.ykb + "⚠" + S.r + " " + S.yk + "卸载失败或无任务" + S.r); }
      } else if (osType === "darwin") {
        try {
          const plist = path.join(require("os").homedir(), "Library", "LaunchAgents", "com.memi.agent.plist");
          execSync(`launchctl unload "${plist}"`, { shell: true });
          if (fs.existsSync(plist)) fs.unlinkSync(plist);
          spin.stop(S.gkb + "✔" + S.r + " " + S.g + "已卸载" + S.r);
        } catch { spin.stop(S.ykb + "⚠" + S.r + " " + S.yk + "卸载失败" + S.r); }
      } else {
        try { execSync('sudo systemctl disable memi-agent && sudo rm /etc/systemd/system/memi-agent.service', { shell: true }); spin.stop(S.gkb + "✔" + S.r + " " + S.g + "已卸载" + S.r); } catch { spin.stop(S.ykb + "⚠" + S.r + " " + S.yk + "卸载失败（需要 sudo）" + S.r); }
      }
    } else {
      out(`  ${S.g}服务状态: `);
      try { const r = await fetch("http://localhost:3001/health"); log(r.ok ? S.gkb + "✔" + S.r + S.g + " 运行中" + S.r : S.rkb + "✘" + S.r + S.rk + " 未响应" + S.r); } catch { log(S.rkb + "✘" + S.r + S.rk + " 未运行" + S.r); }
      if (osType === "win32") { try { const r = execSync('schtasks /query /tn "MemiAgent" 2>nul', { shell: true, encoding: "utf8" }); log(`  ${S.g}开机自启: ${S.gkb}已配置${S.r}`); } catch { log(`  ${S.g}开机自启: ${S.gray3}未配置${S.r}`); } }
      log(`\n  ${S.gray3}memi daemon install   安装开机自启${S.r}`);
      log(`  ${S.gray3}memi daemon uninstall  取消开机自启${S.r}`);
    }
  },
};
